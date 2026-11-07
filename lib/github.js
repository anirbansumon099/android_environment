const crypto = require('crypto');
const sodium = require('libsodium-wrappers');
const settings = require('./settings');
const { AsyncLocalStorage } = require('async_hooks');
const als = new AsyncLocalStorage();

const API = process.env.GITHUB_API_URL || 'https://api.github.com';
// The GitHub account each call runs as comes from AsyncLocalStorage
const env = () => { const a = als.getStore(); if (!a) throw new Error('No GitHub account selected'); return { token: a.token, owner: a.login, repo: a.repo, branch: a.branch || 'main' }; };
const as = (acc, fn) => als.run(acc, fn);
const R = () => { const e = env(); return `/repos/${e.owner}/${e.repo}`; };
const WORKFLOW = 'build.yml';

async function gh(method, path, body, opt = {}) {
  const e = env();
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    method,
    headers: {
      Authorization: `Bearer ${e.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'android-codespace',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    if (opt.ignore && opt.ignore.includes(res.status)) return null;
    const t = await res.text().catch(() => '');
    const err = new Error(`GitHub ${method} ${path} -> ${res.status} ${t.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  if (opt.full) return { data: res.status === 204 ? null : await res.json(), headers: res.headers };
  if (opt.buffer) return Buffer.from(await res.arrayBuffer());
  if (opt.text) return res.text();
  if (res.status === 204) return null;
  return res.json();
}

async function putFile(p, text, message) {
  const e = env();
  const cur = await gh('GET', `${R()}/contents/${p}?ref=${e.branch}`, null, { ignore: [404, 409] });
  await gh('PUT', `${R()}/contents/${p}`, {
    message, branch: e.branch, content: Buffer.from(text).toString('base64'), ...(cur?.sha ? { sha: cur.sha } : {}),
  });
}
// The source zip (with the keystore) goes only to a temporary orphan branch (build-<id>); no code is ever pushed to main
async function pushBuildBranch(id, zipBuf, extra = []) {
  const files = [{ path: `sources/${id}.zip`, buffer: zipBuf }, ...extra];
  const entries = [];
  for (const f of files) {
    const blob = await gh('POST', `${R()}/git/blobs`, { content: f.buffer.toString('base64'), encoding: 'base64' });
    entries.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const tree = await gh('POST', `${R()}/git/trees`, { tree: entries });
  const commit = await gh('POST', `${R()}/git/commits`, { message: `source ${id}`, tree: tree.sha, parents: [] });
  await gh('POST', `${R()}/git/refs`, { ref: `refs/heads/build-${id}`, sha: commit.sha });
}
const repoInfo = () => gh('GET', R());
const deleteBranch = (id) => gh('DELETE', `${R()}/git/refs/heads/build-${id}`, null, { ignore: [404, 422] });
const listBuildBranches = async () =>
  ((await gh('GET', `${R()}/branches?per_page=100`, null, { ignore: [404] })) || []).map((b) => b.name).filter((n) => n.startsWith('build-'));
const dispatch = (buildId, type = 'release') =>
  gh('POST', `${R()}/actions/workflows/${WORKFLOW}/dispatches`, { ref: env().branch, inputs: { build_id: buildId, build_type: type } });

const listAllRuns = async () => (await gh('GET', `${R()}/actions/runs?per_page=100`, null, { ignore: [404] }))?.workflow_runs || [];
const listRuns = async () =>
  (await gh('GET', `${R()}/actions/workflows/${WORKFLOW}/runs?per_page=50`, null, { ignore: [404] }))?.workflow_runs || [];
const getRun = (id) => gh('GET', `${R()}/actions/runs/${id}`);
const getJobs = async (id) => (await gh('GET', `${R()}/actions/runs/${id}/jobs`)).jobs;
const jobLogs = (jobId) => gh('GET', `${R()}/actions/jobs/${jobId}/logs`, null, { text: true });
const cancelRun = (id) => gh('POST', `${R()}/actions/runs/${id}/cancel`);
const deleteRun = (id) => gh('DELETE', `${R()}/actions/runs/${id}`, null, { ignore: [404, 409] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// cancel a running run first, then delete it
async function forceDeleteRun(id) {
  let run = await getRun(id).catch(() => null);
  if (!run) return;
  if (run.status !== 'completed') {
    await cancelRun(id).catch(() => {});
    for (let i = 0; i < 15; i++) { await sleep(2000); run = await getRun(id).catch(() => null); if (!run || run.status === 'completed') break; }
  }
  await deleteRun(id);
}
const listArtifacts = async () => (await gh('GET', `${R()}/actions/artifacts?per_page=100`)).artifacts;
const runArtifacts = async (id) => (await gh('GET', `${R()}/actions/runs/${id}/artifacts`)).artifacts;
const downloadArtifact = (id) => gh('GET', `${R()}/actions/artifacts/${id}/zip`, null, { buffer: true });
const deleteArtifact = (id) => gh('DELETE', `${R()}/actions/artifacts/${id}`, null, { ignore: [404] });
const listCaches = async () => (await gh('GET', `${R()}/actions/caches?per_page=100`)).actions_caches;
const deleteCache = (id) => gh('DELETE', `${R()}/actions/caches/${id}`, null, { ignore: [404] });

// ---- Secrets ----
async function setSecret(name, value) {
  await sodium.ready;
  const pk = await gh('GET', `${R()}/actions/secrets/public-key`);
  const key = sodium.from_base64(pk.key, sodium.base64_variants.ORIGINAL);
  const enc = sodium.crypto_box_seal(sodium.from_string(value), key);
  await gh('PUT', `${R()}/actions/secrets/${encodeURIComponent(name)}`, {
    encrypted_value: sodium.to_base64(enc, sodium.base64_variants.ORIGINAL),
    key_id: pk.key_id,
  });
}
const listSecrets = async () => (await gh('GET', `${R()}/actions/secrets?per_page=100`)).secrets;
const deleteSecret = (name) => gh('DELETE', `${R()}/actions/secrets/${encodeURIComponent(name)}`);

// ---- Storage / billing ----
async function storageInfo() {
  const e = env();
  const [arts, caches] = await Promise.all([listArtifacts(), listCaches().catch(() => [])]);
  const artifactBytes = arts.reduce((s, a) => s + (a.size_in_bytes || 0), 0);
  const cacheBytes = caches.reduce((s, c) => s + (c.size_in_bytes || 0), 0);
  const limit = (settings.get().build.storageLimitMB || 500) * 1024 * 1024;
  let billing = null, billingError = null;
  try {
    const d = new Date();
    const r = await gh('GET', `/users/${e.owner}/settings/billing/usage?year=${d.getUTCFullYear()}&month=${d.getUTCMonth() + 1}`);
    billing = (r.usageItems || []).filter((i) => (i.product || '').toLowerCase() === 'actions')
      .map((i) => ({ sku: i.sku, unit: i.unitType, quantity: i.quantity, net: i.netAmount }));
  } catch (err) { billingError = err.message.slice(0, 160); }
  return { artifactBytes, cacheBytes, artifactCount: arts.length, cacheCount: caches.length, limit, billing, billingError };
}


// ---- Account management ----
async function whoami() {
  const { data, headers } = await gh('GET', '/user', null, { full: true });
  const scopes = (headers.get('x-oauth-scopes') || '').split(',').map((x) => x.trim()).filter(Boolean);
  return { login: data.login, scopes, classic: headers.has('x-oauth-scopes') };
}
// create a private repo (or make an existing one private)
async function ensurePrivateRepo(name) {
  const e = env();
  let repo = await gh('GET', `/repos/${e.owner}/${name}`, null, { ignore: [404] });
  let created = false;
  if (!repo) {
    repo = await gh('POST', '/user/repos', { name, private: true, description: 'Android build runner (auto-created)', auto_init: false, has_issues: false, has_wiki: false, has_projects: false });
    created = true;
  } else if (!repo.private) repo = await gh('PATCH', `/repos/${e.owner}/${name}`, { private: true });
  if (!repo.private) throw new Error('Could not make the repository private');
  return { name: repo.name, private: !!repo.private, created };
}
const deleteRepo = () => gh('DELETE', R(), null, { ignore: [404] });
// billable minutes after a run (private repos round up per job)
async function runMinutes(id) {
  try { const t = await gh('GET', `${R()}/actions/runs/${id}/timing`); const ms = Object.values(t.billable || {}).reduce((s, v) => s + (v.total_ms || 0), 0) || t.run_duration_ms || 0; return Math.max(1, Math.ceil(ms / 60000)); }
  catch { return null; }
}
async function billingMinutes() {
  const d = new Date(), e = env();
  const r = await gh('GET', `/users/${e.owner}/settings/billing/usage?year=${d.getUTCFullYear()}&month=${d.getUTCMonth() + 1}`);
  return (r.usageItems || []).filter((i) => (i.product || '').toLowerCase() === 'actions' && /minute/i.test(i.unitType || '')).reduce((s, i) => s + (i.quantity || 0), 0);
}

module.exports = {
  as, whoami, ensurePrivateRepo, deleteRepo, runMinutes, billingMinutes,
  env, repoInfo, putFile, pushBuildBranch, deleteBranch, listBuildBranches, dispatch, listRuns, listAllRuns, forceDeleteRun, getRun, getJobs, jobLogs, cancelRun, deleteRun,
  listArtifacts, runArtifacts, downloadArtifact, deleteArtifact, listCaches, deleteCache,
  setSecret, listSecrets, deleteSecret, storageInfo,
};
