const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const gh = require('./github');
const ws = require('./workspace');
const users = require('./users');
const settings = require('./settings');
const signing = require('./signing');
const lint = require('./lint');

const STORE = path.join(settings.DATA, 'builds');
const TMP = path.join(settings.DATA, 'tmp');
const DB = path.join(settings.DATA, 'builds.json');
fs.mkdirSync(STORE, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

let builds = [];
try { builds = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch {}
const save = () => fs.writeFileSync(DB, JSON.stringify(builds, null, 1));
const FINAL = ['done', 'failed', 'error'];
const ACTIVE = ['pushing', 'waiting', 'running', 'saving', 'cleaning'];
const dirOf = (id) => path.join(STORE, id);
const tmpOf = (id) => path.join(TMP, id + '.zip');
for (const b of builds) if (b.stage === 'pushing') { b.stage = fs.existsSync(tmpOf(b.id)) ? 'queued' : 'error'; b.accountId = null; }

const list = (ownerId) => builds.filter((b) => !ownerId || b.ownerId === ownerId).sort((a, b) => b.createdAt - a.createdAt);
const get = (id) => builds.find((b) => b.id === id);

// ================= Account routing =================
const est = () => settings.get().build.estMinutes || 8;
const activeOn = (id) => builds.filter((b) => b.accountId === id && ACTIVE.includes(b.stage)).length;
const used = (a) => Math.max(settings.usedMinutes(a), a.billingMonth === settings.monthKey() ? Math.round(a.billingUsed || 0) : 0);
const remaining = (a) => a.limitMinutes - used(a) - activeOn(a.id) * est();
// Account with the most free capacity (by ratio) goes first; ties go to the less busy one
function pickAccount(exclude = []) {
  return settings.accounts()
    .filter((a) => a.enabled && a.status === 'ok' && a.token && !exclude.includes(a.id) && activeOn(a.id) < a.maxConcurrent && remaining(a) >= est())
    .sort((a, b) => (remaining(b) / b.limitMinutes) - (remaining(a) / a.limitMinutes) || activeOn(a.id) - activeOn(b.id))[0] || null;
}
function waitReason(exclude = []) {
  const ok = settings.accounts().filter((a) => a.enabled && a.status === 'ok' && a.token && !exclude.includes(a.id));
  if (!ok.length) return 'No active GitHub account';
  if (ok.every((a) => remaining(a) < est())) return 'All accounts reached their monthly limit — an admin can raise the limits or connect a new account';
  return 'All accounts are busy — waiting for a free slot';
}
function accountStats() {
  return settings.accounts().map((a) => ({ ...settings.safeAcc(a), token: undefined, tokenEnc: undefined, used: used(a), active: activeOn(a.id), remaining: Math.max(0, a.limitMinutes - used(a)), builds: builds.filter((b) => b.accountId === a.id).length }));
}

// ================= workflow sync (per account) =================
async function ensureWorkflow(acc, force) {
  const text = settings.render(), h = settings.hashOf(text);
  if (!force && acc.syncedHash === h) return false;
  await gh.as(acc, () => gh.putFile('.github/workflows/build.yml', text, 'Update build workflow'));
  settings.patchAccount(acc.id, { syncedHash: h }); acc.syncedHash = h; return true;
}
const syncAll = async () => { for (const a of settings.accounts().filter((x) => x.enabled)) await ensureWorkflow(a, true); };

// ================= Connect / verify account =================
const repoName = (n) => String(n || '').trim().replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 60) || 'android-builder-' + crypto.randomBytes(3).toString('hex');
async function refreshBilling(acc) {
  try { const m = await gh.as(acc, gh.billingMinutes); settings.patchAccount(acc.id, { billingUsed: m, billingMonth: settings.monthKey(), billingAt: Date.now() }); return m; } catch { return null; }
}
async function connect({ label, token, repo, limitMinutes, maxConcurrent }) {
  token = String(token || '').trim(); if (!token) throw new Error('Enter a token');
  const who = await gh.as({ token, login: '', repo: '' }, gh.whoami).catch((e) => { throw new Error(e.status === 401 ? 'Invalid or expired token' : e.message); });
  if (who.classic && !(who.scopes.includes('repo') && who.scopes.includes('workflow'))) throw new Error(`Token needs repo and workflow scopes (has: ${who.scopes.join(', ') || 'none'})`);
  if (settings.accounts().some((a) => a.login.toLowerCase() === who.login.toLowerCase())) throw new Error(`${who.login} is already connected`);
  const name = repoName(repo), tmp = { token, login: who.login, repo: name, branch: 'main' };
  const r = await gh.as(tmp, () => gh.ensurePrivateRepo(name)); // creates a private repo, or makes an existing public one private
  const acc = settings.addAccount({ label: String(label || who.login).slice(0, 40), token, login: who.login, repo: r.name, repoPrivate: true, limitMinutes: limitMinutes || 2000, maxConcurrent: maxConcurrent || 2 });
  try { await ensureWorkflow(acc, true); } catch (e) { settings.removeAccount(acc.id); throw new Error('Could not push the workflow: ' + e.message); }
  await refreshBilling(acc);
  return { ...settings.safeAcc(settings.account(acc.id)), repoCreated: r.created };
}
async function check(id) {
  const acc = settings.account(id); if (!acc) throw new Error('Account not found');
  try {
    const who = await gh.as(acc, gh.whoami);
    const r = await gh.as(acc, () => gh.ensurePrivateRepo(acc.repo));
    settings.patchAccount(id, { status: 'ok', statusMsg: '', login: who.login, repoPrivate: r.private });
    await ensureWorkflow(settings.account(id), true); await refreshBilling(settings.account(id));
  } catch (e) { settings.patchAccount(id, { status: 'error', statusMsg: String(e.message).slice(0, 160) }); throw e; }
  return settings.safeAcc(settings.account(id));
}
async function disconnect(id, deleteRepo) {
  if (activeOn(id)) throw new Error('A build is running on this account');
  const acc = settings.account(id); if (!acc) return;
  if (deleteRepo) await gh.as(acc, gh.deleteRepo).catch((e) => { throw new Error('Could not delete the repository (token needs the delete_repo scope): ' + e.message); });
  settings.removeAccount(id);
}

// ================= Start build =================
const TYPES = { debug: 'allowDebug', release: 'allowRelease', bundle: 'allowBundle' };
async function start({ ownerId, ownerName, project, message, type = 'release', force = false }) {
  const cfg = settings.get().build;
  if (!TYPES[type] || !cfg[TYPES[type]]) throw new Error('This build type is disabled by the admin');
  const day = new Date(); day.setHours(0, 0, 0, 0);
  const limit = users.get(ownerId)?.maxPerDay ?? cfg.maxPerUserPerDay;
  if (ownerId !== 'admin' && builds.filter((b) => b.ownerId === ownerId && b.createdAt >= day.getTime()).length >= limit) throw new Error(`Daily build limit (${limit}) reached`);
  if (builds.some((b) => b.ownerId === ownerId && b.project === project && !FINAL.includes(b.stage))) throw new Error('A build for this project is already running');
  if (!settings.accounts().some((a) => a.enabled)) throw new Error('The admin has not connected any GitHub account yet');

  const W = ws.forProject(ownerId, project);
  if (!force) { const errs = lint.projectSyntax(W); if (errs.length) { const e = new Error(`The code has ${errs.length} syntax error(s)`); e.extra = { lint: errs }; throw e; } }
  const zip = W.zip(); // the whole project, including keystore/
  if (zip.length > cfg.maxZipMB * 1048576) throw new Error(`Source zip is larger than ${cfg.maxZipMB} MB`);
  const hasKey = signing.info(W).has;
  const b = { id: crypto.randomBytes(4).toString('hex'), ownerId, ownerName, project, message: message || '', type,
    signing: type === 'debug' ? 'debug' : hasKey ? 'custom' : 'test', createdAt: Date.now(), stage: 'queued', runId: null, accountId: null, tried: [], files: [], note: '', zipSize: zip.length };
  fs.writeFileSync(tmpOf(b.id), zip);
  builds.push(b); save();
  return b;
}

async function launch(b, acc) {
  b.stage = 'pushing'; b.accountId = acc.id; b.accountLabel = acc.label; b.note = ''; save();
  try {
    await gh.as(acc, async () => {
      await ensureWorkflow(acc, false);
      await gh.pushBuildBranch(b.id, fs.readFileSync(tmpOf(b.id)));
      await gh.dispatch(b.id, b.type);
    });
    b.stage = 'waiting';
  } catch (e) {
    await gh.as(acc, () => gh.deleteBranch(b.id)).catch(() => {});
    const acctProblem = [401, 403, 404].includes(e.status) || /rate limit|abuse/i.test(e.message);
    if (acctProblem) { // problem with this account → flag it and route the build to another account
      settings.patchAccount(acc.id, { status: 'error', statusMsg: String(e.message).slice(0, 160) });
      (b.tried ||= []).push(acc.id); b.stage = 'queued'; b.accountId = null; b.note = `${acc.label} has a problem — retrying on another account`;
    } else { b.stage = 'error'; b.note = e.message; fs.rmSync(tmpOf(b.id), { force: true }); }
  }
  save();
}

const pendingRunIds = (accId) => builds.filter((b) => b.accountId === accId && b.runId && !FINAL.includes(b.stage)).map((b) => b.runId);
const pendingIds = (accId) => builds.filter((b) => b.accountId === accId && !FINAL.includes(b.stage)).map((b) => b.id);

async function finalize(b, run, acc) {
  b.stage = 'saving'; b.conclusion = run.conclusion; b.finishedAt = Date.now(); save();
  const dir = dirOf(b.id); fs.mkdirSync(dir, { recursive: true });
  let arts = [];
  try {
    b.minutes = await gh.runMinutes(run.id); if (b.minutes) settings.addUsage(acc.id, b.minutes); // monthly usage accounting
    try {
      let log = ''; const jobs0 = await gh.getJobs(run.id);
      b.steps = (jobs0[0]?.steps || []).map((x) => ({ name: x.name, status: x.status, conclusion: x.conclusion, started: x.started_at || null, completed: x.completed_at || null }));
      for (const j of jobs0) log += `\n===== JOB: ${j.name} (${j.conclusion}) =====\n` + await gh.jobLogs(j.id).catch((e) => e.message);
      fs.writeFileSync(path.join(dir, 'build.log'), log);
    } catch {}
    if (run.conclusion === 'success') {
      arts = await gh.runArtifacts(run.id);
      if (!arts.length) throw new Error('The build produced no output');
      for (const a of arts) {
        const buf = await gh.downloadArtifact(a.id);
        fs.writeFileSync(path.join(dir, `${a.name}.zip`), buf); b.files.push(`${a.name}.zip`); (b.sizes ||= {})[`${a.name}.zip`] = buf.length;
        for (const e of new AdmZip(buf).getEntries()) if (!e.isDirectory && /\.(apk|aab)$/.test(e.entryName)) {
          const n = path.basename(e.entryName), data = e.getData(); fs.writeFileSync(path.join(dir, n), data); b.files.push(n); (b.sizes ||= {})[n] = data.length;
        }
      }
    }
    // once saved on the server, delete everything from GitHub
    b.stage = 'cleaning'; save();
    for (const a of arts) await gh.deleteArtifact(a.id);
    await gh.deleteRun(run.id);
    await gh.deleteBranch(b.id);
    fs.rmSync(tmpOf(b.id), { force: true });
    await sweepOne(acc, b.id);
    b.stage = run.conclusion === 'success' ? 'done' : 'failed';
  } catch (e) { b.stage = 'error'; b.note = 'finalize: ' + e.message; }
  save();
}

// clean all leftover data of one account (running builds excluded)
async function sweepOne(acc, exceptBuild) {
  const keepRuns = new Set(pendingRunIds(acc.id)), keepIds = new Set(pendingIds(acc.id)); if (exceptBuild) keepIds.delete(exceptBuild);
  const st = { runs: 0, artifacts: 0, caches: 0, branches: 0 };
  await gh.as(acc, async () => {
    for (const r of await gh.listRuns()) if (r.status === 'completed' && !keepRuns.has(r.id)) { await gh.deleteRun(r.id); st.runs++; }
    for (const a of await gh.listArtifacts()) if (!keepRuns.has(a.workflow_run?.id)) { await gh.deleteArtifact(a.id); st.artifacts++; }
    for (const c of await gh.listCaches().catch(() => [])) { await gh.deleteCache(c.id); st.caches++; }
    for (const n of await gh.listBuildBranches()) if (!keepIds.has(n.slice(6))) { await gh.deleteBranch(n.slice(6)); st.branches++; }
  });
  return st;
}
async function sweep(accId) {
  const tot = { runs: 0, artifacts: 0, caches: 0, branches: 0 };
  for (const a of settings.accounts().filter((x) => !accId || x.id === accId)) {
    try { const s = await sweepOne(a); for (const k in tot) tot[k] += s[k]; } catch (e) { tot.error = e.message; }
  }
  return tot;
}

// ================= Main loop =================
let busy = false, lastPurge = 0, lastRecheck = 0, lastBilling = 0;
async function tick() {
  if (busy) return; busy = true;
  try {
    const cfg = settings.get().build, accs = settings.accounts();
    // 1) queue → auto routing
    let active = builds.filter((b) => ACTIVE.includes(b.stage)).length;
    for (const b of builds.filter((x) => x.stage === 'queued').sort((a, b) => a.createdAt - b.createdAt)) {
      if (active >= cfg.maxConcurrent * Math.max(1, accs.length)) break;
      if ((b.tried || []).length && accs.filter((a) => a.enabled).every((a) => b.tried.includes(a.id))) { b.stage = 'error'; b.note = 'Failed on every GitHub account'; fs.rmSync(tmpOf(b.id), { force: true }); save(); continue; }
      const acc = pickAccount(b.tried || []);
      if (!acc) { const n = waitReason(b.tried || []); if (b.note !== n) { b.note = n; save(); } continue; }
      active++; await launch(b, acc);
    }
    // 2) running builds (on the account they were sent to)
    for (const b of builds.filter((x) => ['waiting', 'running'].includes(x.stage))) {
      const acc = settings.account(b.accountId);
      if (!acc) { b.stage = 'error'; b.note = 'The account was removed'; save(); continue; }
      try {
        await gh.as(acc, async () => {
          if (!b.runId) {
            const run = (await gh.listRuns()).find((r) => (r.display_title || r.name || '').includes(b.id));
            if (run) { b.runId = run.id; b.runUrl = run.html_url; save(); }
            else if (Date.now() - b.createdAt > 6 * 60 * 1000) { b.stage = 'error'; b.note = 'Workflow run not found'; await gh.deleteBranch(b.id).catch(() => {}); save(); }
            return;
          }
          const run = await gh.getRun(b.runId);
          if (run.status === 'in_progress' && b.stage !== 'running') { b.stage = 'running'; b.runStartedAt = b.runStartedAt || Date.now(); save(); }
          if (run.status === 'completed') await finalize(b, run, acc);
        });
      } catch (e) { if (e.status === 404) { b.stage = 'error'; b.note = 'Workflow run was deleted'; save(); } }
    }
    // 3) re-check problematic accounts every 10 minutes
    if (Date.now() - lastRecheck > 10 * 60e3) { lastRecheck = Date.now(); for (const a of accs.filter((x) => x.enabled && x.status === 'error')) check(a.id).catch(() => {}); }
    // 4) real GitHub billing usage (when available), once an hour
    if (Date.now() - lastBilling > 3600e3) { lastBilling = Date.now(); for (const a of accs.filter((x) => x.enabled && x.status === 'ok')) await refreshBilling(a); }
    // 5) purge old local builds
    if (Date.now() - lastPurge > 3600e3) {
      lastPurge = Date.now(); const max = cfg.keepBuildDays * 86400e3;
      for (const b of builds.filter((x) => FINAL.includes(x.stage) && Date.now() - x.createdAt > max)) remove(b.id);
    }
  } finally { busy = false; }
}
setInterval(() => tick().catch(() => {}), 5000);

async function cancel(id) {
  const b = get(id); if (!b) return;
  if (b.stage === 'queued') { b.stage = 'error'; b.note = 'Cancelled'; fs.rmSync(tmpOf(id), { force: true }); save(); }
  else if (b.runId) { const acc = settings.account(b.accountId); if (acc) await gh.as(acc, () => gh.cancelRun(b.runId)); }
}
function remove(id) { builds = builds.filter((b) => b.id !== id); save(); fs.rmSync(dirOf(id), { recursive: true, force: true }); fs.rmSync(tmpOf(id), { force: true }); }

module.exports = { list, get, start, cancel, remove, sweep, sweepOne, ensureWorkflow, syncAll, connect, check, disconnect, accountStats, pickAccount, tick, dirOf, FINAL };
