const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./crypto-store');

const DATA = store.DATA;
const FILE = path.join(DATA, 'settings.json');
const TPL_DEFAULT = path.join(__dirname, '..', 'defaults', 'workflow.tpl.yml');

const DEFAULTS = {
  accounts: [],
  build: { jdk: '17', gradle: '8.7', taskDebug: 'assembleDebug', taskRelease: 'assembleRelease', taskBundle: 'bundleRelease',
    allowDebug: true, allowRelease: true, allowBundle: true, estMinutes: 8,
    retentionDays: 1, timeoutMin: 30, maxConcurrent: 4, maxPerUserPerDay: 10, maxZipMB: 50, keepBuildDays: 7, storageLimitMB: 500 },
  workflowTpl: null,
};
let cfg;
try { cfg = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { cfg = {}; }
const legacy = cfg.github; delete cfg.github; delete cfg.syncedHash;
cfg = { ...DEFAULTS, ...cfg, accounts: cfg.accounts || [], build: { ...DEFAULTS.build, ...cfg.build } };
const save = () => fs.writeFileSync(FILE, JSON.stringify(cfg, null, 1), { mode: 0o600 });
const rid = () => crypto.randomBytes(4).toString('hex');
const newAcc = (o) => ({ id: rid(), label: 'Account', tokenEnc: '', login: '', repo: '', branch: 'main', enabled: true, limitMinutes: 2000, maxConcurrent: 2,
  usage: {}, status: 'ok', statusMsg: '', repoPrivate: true, syncedHash: '', createdAt: Date.now(), ...o });

// migrate from the old single-account settings / .env
{
  const t = legacy?.token || process.env.GITHUB_TOKEN, owner = legacy?.owner || process.env.GITHUB_OWNER, repo = legacy?.repo || process.env.GITHUB_REPO;
  if (!cfg.accounts.length && t && owner && repo) { cfg.accounts.push(newAcc({ label: 'Main', tokenEnc: store.enc(t), login: owner, repo, branch: legacy?.branch || process.env.GITHUB_BRANCH || 'main' })); save(); }
}
if (cfg.workflowTpl && !cfg.workflowTpl.includes('keystore.properties')) { cfg.workflowTpl = null; }
cfg.build.maxConcurrent = Math.max(cfg.build.maxConcurrent, 1);

const get = () => cfg;
const defaultTpl = () => fs.readFileSync(TPL_DEFAULT, 'utf8');
const tpl = () => cfg.workflowTpl || defaultTpl();

// ---- Accounts ----
const full = (a) => ({ ...a, token: store.dec(a.tokenEnc) });
const accounts = () => cfg.accounts.map(full);
const account = (id) => { const a = cfg.accounts.find((x) => x.id === id); return a ? full(a) : null; };
const monthKey = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const usedMinutes = (a) => Math.round((a.usage || {})[monthKey()] || 0);
function addAccount(o) { const a = newAcc({ ...o, tokenEnc: store.enc(o.token) }); delete a.token; a.limitMinutes = Math.max(1, Number(a.limitMinutes) || 2000); a.maxConcurrent = Math.max(1, Number(a.maxConcurrent) || 2); cfg.accounts.push(a); save(); return full(a); }
function patchAccount(id, p) {
  const a = cfg.accounts.find((x) => x.id === id); if (!a) return null;
  for (const k of ['label', 'enabled', 'limitMinutes', 'maxConcurrent', 'status', 'statusMsg', 'login', 'repo', 'branch', 'repoPrivate', 'syncedHash', 'billingUsed', 'billingAt', 'billingMonth'])
    if (p[k] !== undefined) a[k] = (k === 'limitMinutes' || k === 'maxConcurrent') ? Math.max(1, Number(p[k]) || 1) : p[k];
  if (p.token) a.tokenEnc = store.enc(p.token);
  save(); return full(a);
}
const removeAccount = (id) => { cfg.accounts = cfg.accounts.filter((a) => a.id !== id); save(); };
function addUsage(id, minutes) { const a = cfg.accounts.find((x) => x.id === id); if (!a) return; a.usage ||= {}; const k = monthKey(); a.usage[k] = (a.usage[k] || 0) + minutes; save(); }

function update(patch) {
  if (patch.build) {
    const b = {};
    for (const k of Object.keys(DEFAULTS.build)) if (patch.build[k] !== undefined && (patch.build[k] !== '' || typeof DEFAULTS.build[k] === 'boolean'))
      b[k] = typeof DEFAULTS.build[k] === 'number' ? Number(patch.build[k]) : typeof DEFAULTS.build[k] === 'boolean' ? (patch.build[k] === true || patch.build[k] === 'true') : String(patch.build[k]);
    cfg.build = { ...cfg.build, ...b };
  }
  for (const k of ['taskDebug', 'taskRelease', 'taskBundle']) if (!/^[\w:.\- ]+$/.test(cfg.build[k])) cfg.build[k] = DEFAULTS.build[k];
  if (patch.workflowTpl !== undefined) { cfg.workflowTpl = patch.workflowTpl || null; }
  if (patch.build || patch.workflowTpl !== undefined) for (const a of cfg.accounts) a.syncedHash = ''; // needs a fresh sync
  save();
}
function render() {
  const b = cfg.build;
  const map = { JDK: b.jdk, GRADLE: b.gradle, TASK_DEBUG: b.taskDebug, TASK_RELEASE: b.taskRelease, TASK_BUNDLE: b.taskBundle, RETENTION: b.retentionDays, TIMEOUT: b.timeoutMin };
  return tpl().replace(/\[\[([A-Z_]+)\]\]/g, (m, k) => (k in map ? map[k] : m));
}
const hashOf = (s) => crypto.createHash('sha1').update(s).digest('hex');
const safeAcc = (a) => { const { tokenEnc, usage, ...r } = a; return { ...r, hasToken: !!tokenEnc, usedMinutes: usedMinutes(a), month: monthKey() }; };
const masked = () => ({ build: cfg.build, accounts: cfg.accounts.map(safeAcc) });

module.exports = { DATA, get, update, render, tpl, defaultTpl, hashOf, masked, accounts, account, addAccount, patchAccount, removeAccount, addUsage, usedMinutes, safeAcc, monthKey };
