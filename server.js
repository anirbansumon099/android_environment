require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const settings = require('./lib/settings');
const users = require('./lib/users');
const ws = require('./lib/workspace');
const gh = require('./lib/github');
const builds = require('./lib/builds');
const signing = require('./lib/signing');
const lint = require('./lib/lint');
const idx = require('./lib/android-index');

if (!process.env.ADMIN_PASSWORD) { console.error('Set ADMIN_PASSWORD in .env'); process.exit(1); }

const app = express();
app.use(express.json({ limit: '80mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ---------- auth ----------
const sessions = new Map(); // token -> {id, username, role, exp}
const safeEq = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const fails = new Map();
app.post('/api/login', (req, res) => {
  const { username, password } = req.body, ip = req.ip, f = fails.get(ip) || { n: 0, t: 0 };
  if (f.n >= 8 && Date.now() - f.t < 10 * 60e3) return res.status(429).json({ error: 'Too many failed attempts; try again in 10 minutes' });
  let who = null;
  if (String(username).toLowerCase() === 'admin') { if (safeEq(password || '', process.env.ADMIN_PASSWORD)) who = { id: 'admin', username: 'admin', role: 'admin' }; }
  else { const u = users.verify(username, password || ''); if (u) who = { id: u.id, username: u.username, role: 'user' }; }
  if (!who) { fails.set(ip, { n: f.n + 1, t: Date.now() }); return res.status(401).json({ error: 'Wrong username or password' }); }
  fails.delete(ip);
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { ...who, exp: Date.now() + 12 * 3600e3 });
  res.json({ token, ...who });
});
app.use(['/api', '/download'], (req, res, next) => {
  const s = sessions.get(req.headers['x-auth'] || req.query.t);
  if (!s || s.exp < Date.now()) return res.status(401).json({ error: 'unauthorized' });
  req.s = s; next();
});
const needAdmin = (req, res, next) => req.s.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only' });
const h = (fn) => (req, res) => Promise.resolve().then(() => fn(req, res)).catch((e) => res.status(e.extra ? 422 : e.status === 404 ? 404 : 500).json({ error: e.message, ...(e.extra || {}) }));
const dropSessions = (id) => { for (const [t, s] of sessions) if (s.id === id) sessions.delete(t); };
app.post('/api/logout', (req, res) => { sessions.delete(req.headers['x-auth']); res.json({ ok: true }); });
app.get('/api/me', (req, res) => res.json(req.s));

app.get('/api/config', (req, res) => {
  const b = settings.get().build;
  res.json({ types: [{ id: 'debug', label: 'Debug APK', enabled: b.allowDebug }, { id: 'release', label: 'Release APK', enabled: b.allowRelease }, { id: 'bundle', label: 'Release Bundle (AAB)', enabled: b.allowBundle }] });
});
app.get('/api/android-index', (req, res) => res.json({ classes: idx.classes, members: idx.members, inherit: idx.inherit, statics: idx.statics, snippets: idx.snippets, xml: idx.xml }));

// ---------- Projects (a user's own; admins can access all) ----------
const canOwner = (req, owner) => req.s.role === 'admin' ? (owner !== '_tpl' || true) : owner === req.s.id;
app.get('/api/projects', h((req, res) => res.json(ws.projectsOf(req.s.id))));
app.post('/api/projects', h((req, res) => res.json({ ok: true, ...ws.createProject(req.s.id, req.body.name, { kind: req.body.kind, appName: req.body.appName, package: req.body.package, minSdk: req.body.minSdk }) })));
app.delete('/api/projects/:name', h((req, res) => { ws.deleteProject(req.s.id, req.params.name); res.json({ ok: true }); }));

// Import a project zip (e.g. exported from Google AI Studio or Android Studio) into a NEW project.
//   - Android Gradle project (settings.gradle)  -> imported as-is
//   - Web app (package.json / index.html)       -> wrapped in a WebView Android app, sources go to webapp/
app.post('/api/projects/import', h((req, res) => {
  const buf = Buffer.from(String(req.body.zip || ''), 'base64'); if (buf.length < 30) throw new Error('Empty or invalid zip file');
  const type = ws.classifyZip(buf);
  if (type === 'unknown') throw new Error('No Android project (settings.gradle) or web app (package.json / index.html) found in this zip');
  const name = String(req.body.name || '').trim();
  if (type === 'android') { ws.createProject(req.s.id, name, { kind: 'blank' }); ws.forProject(req.s.id, name).importZip(buf); }
  else { ws.createProject(req.s.id, name, { kind: 'webview', appName: req.body.appName, package: req.body.package, minSdk: req.body.minSdk }); ws.forProject(req.s.id, name).importZip(buf, 'webapp'); }
  const files = ws.forProject(req.s.id, name).list().filter((f) => f.type === 'file');
  const open = files.find((f) => /MainActivity\.(java|kt)$/.test(f.path))?.path || files.find((f) => /(^|\/)(package\.json|index\.html)$/.test(f.path))?.path || null;
  res.json({ ok: true, type, open });
}));

const P = '/api/p/:owner/:name';
app.use(P, (req, res, next) => canOwner(req, req.params.owner) ? next() : res.status(403).json({ error: 'Permission denied' }));
const W = (req) => ws.forProject(req.params.owner, req.params.name);
app.get(P + '/files', h((req, res) => res.json(W(req).list())));
app.get(P + '/file', h((req, res) => res.json(W(req).read(req.query.path))));
app.put(P + '/file', h((req, res) => { W(req).write(req.body.path, req.body.base64 ? Buffer.from(req.body.base64, 'base64') : (req.body.content ?? '')); res.json({ ok: true }); }));
app.delete(P + '/file', h((req, res) => { W(req).remove(req.query.path); res.json({ ok: true }); }));
app.post(P + '/rename', h((req, res) => { W(req).rename(req.body.from, req.body.to); res.json({ ok: true }); }));
app.post(P + '/import', h((req, res) => { W(req).importZip(Buffer.from(req.body.zip, 'base64')); res.json({ ok: true }); }));
app.get(P + '/export', h((req, res) => { res.attachment(req.params.name + '.zip').send(W(req).zip()); }));
// ---- find / replace across the project ----
const mkRe = (q, regex, cs) => { try { return new RegExp(regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? 'g' : 'gi'); } catch { throw new Error('Invalid regular expression'); } };
const textFiles = (Wp) => Wp.list().filter((f) => f.type === 'file' && f.size < 1000000).map((f) => f.path);
app.post(P + '/search', h((req, res) => {
  const { q, regex, cs } = req.body; if (!q) return res.json({ results: [], files: 0, truncated: false });
  const re = mkRe(String(q), !!regex, !!cs), Wp = W(req), out = []; let files = 0;
  for (const p of textFiles(Wp)) {
    let c; try { c = Wp.read(p).content; } catch { continue; } if (typeof c !== 'string') continue;
    const lines = c.split('\n'); let hit = false;
    for (let i = 0; i < lines.length; i++) { re.lastIndex = 0; let m; while ((m = re.exec(lines[i]))) { hit = true; out.push({ path: p, line: i + 1, col: m.index + 1, len: m[0].length, text: lines[i].slice(0, 240) }); if (!m[0].length) re.lastIndex++; if (out.length >= 500) return res.json({ results: out, files: files + 1, truncated: true }); } }
    if (hit) files++;
  }
  res.json({ results: out, files, truncated: false });
}));
app.post(P + '/replace', h((req, res) => {
  const { q, to, regex, cs, paths } = req.body; if (!q) throw new Error('Nothing to search for');
  const re = mkRe(String(q), !!regex, !!cs), Wp = W(req); let count = 0, changed = 0;
  for (const p of (Array.isArray(paths) && paths.length ? paths : textFiles(Wp))) {
    let c; try { c = Wp.read(p).content; } catch { continue; } if (typeof c !== 'string') continue;
    let n = 0; const next = c.replace(re, (...m) => { n++; return regex ? String(to ?? '').replace(/\$(\d)/g, (_, d) => m[+d] ?? '') : String(to ?? ''); });
    if (n) { Wp.write(p, next); count += n; changed++; }
  }
  res.json({ replaced: count, files: changed });
}));
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', svg: 'image/svg+xml' };
app.get(P + '/raw', h((req, res) => { const ext = String(req.query.path).split('.').pop().toLowerCase(); res.type(MIME[ext] || 'application/octet-stream').send(W(req).readRaw(req.query.path)); }));
app.post(P + '/lint', h((req, res) => res.json(String(req.body.path).endsWith('.java') ? lint.lintJava(String(req.body.content ?? ''), req.body.path, W(req)) : [])));
app.get(P + '/resources', h((req, res) => res.json(lint.resIndex(W(req)))));
// Signing: the keystore lives in the project's keystore/ folder (it travels with the source zip to the runner)
const noTpl = (req) => { if (req.params.owner === '_tpl') throw new Error('Templates have no signing'); };
app.get(P + '/signing', h((req, res) => { noTpl(req); res.json(signing.info(W(req))); }));
app.get(P + '/signing/verify', h((req, res) => { noTpl(req); res.json(signing.verify(W(req))); }));
app.put(P + '/signing', h((req, res) => { noTpl(req); const b = req.body;
  res.json(signing.save(W(req), Buffer.from(String(b.keystoreBase64 || ''), 'base64'), { alias: String(b.alias || '').trim(), storePass: String(b.storePass || ''), keyPass: b.keyPass ? String(b.keyPass) : '', filename: b.filename })); }));
app.post(P + '/signing/generate', h((req, res) => { noTpl(req); const b = req.body;
  res.json(signing.generate(W(req), { alias: String(b.alias || '').trim(), storePass: String(b.storePass || ''), cn: b.cn, org: b.org, country: b.country, years: b.years })); }));
app.get(P + '/signing/download', h((req, res) => { noTpl(req); const d = signing.download(W(req)); res.attachment(d.name).send(d.buf); }));
app.get(P + '/signing/cert', h((req, res) => { noTpl(req); res.attachment(req.params.name + '-upload-certificate.pem').type('text/plain').send(signing.certPem(W(req))); }));
app.delete(P + '/signing', h((req, res) => { noTpl(req); signing.remove(W(req)); res.json({ ok: true }); }));

// ---------- Builds ----------
const myBuild = (req) => {
  const b = builds.get(req.params.id);
  if (!b || (req.s.role !== 'admin' && b.ownerId !== req.s.id)) { const e = new Error('Build not found'); e.status = 404; throw e; }
  return b;
};
const view = (req, b) => req.s.role === 'admin' ? b : { ...b, runUrl: undefined, runId: b.runId ? 1 : null, accountId: undefined, accountLabel: undefined, tried: undefined };
app.post('/api/build', h(async (req, res) => {
  const owner = req.s.role === 'admin' && req.body.owner ? req.body.owner : req.s.id;
  const u = owner === 'admin' ? 'admin' : (users.get(owner)?.username || owner);
  res.json(view(req, await builds.start({ ownerId: owner, ownerName: u, project: req.body.project, message: req.body.message, type: req.body.type || 'release', force: !!req.body.force })));
}));
app.get('/api/builds', h((req, res) => res.json(builds.list(req.s.role === 'admin' ? null : req.s.id).map((b) => view(req, b)))));
app.get('/api/builds/:id/jobs', h(async (req, res) => {
  const b = myBuild(req); if (builds.FINAL.includes(b.stage)) return res.json(b.steps ? [{ name: 'build', status: 'completed', conclusion: b.conclusion, steps: b.steps }] : []);
  if (!b.runId) return res.json([]);
  const acc = settings.account(b.accountId); if (!acc) return res.json([]);
  try { res.json((await gh.as(acc, () => gh.getJobs(b.runId))).map((j) => ({ name: j.name, status: j.status, conclusion: j.conclusion,
    steps: j.steps.map((s) => ({ name: s.name, status: s.status, conclusion: s.conclusion, started: s.started_at || null, completed: s.completed_at || null })) }))); } catch { res.json([]); }
}));
app.get('/api/builds/:id/log', h(async (req, res) => {
  const b = myBuild(req), f = path.join(builds.dirOf(b.id), 'build.log');
  if (fs.existsSync(f)) return res.type('text').send(fs.readFileSync(f, 'utf8'));
  if (!b.runId) return res.type('text').send('(no log yet)');
  const acc = settings.account(b.accountId); if (!acc) return res.type('text').send('(no log)');
  const out = await gh.as(acc, async () => { let o = ''; for (const j of await gh.getJobs(b.runId)) o += `== ${j.name} ==\n` + await gh.jobLogs(j.id).catch(() => '(no log yet)') + '\n'; return o; });
  res.type('text').send(out);
}));
app.post('/api/builds/:id/cancel', h(async (req, res) => { await builds.cancel(myBuild(req).id); res.json({ ok: true }); }));
app.delete('/api/builds/:id', h((req, res) => { const b = myBuild(req); if (!builds.FINAL.includes(b.stage)) throw new Error('Build is still running'); builds.remove(b.id); res.json({ ok: true }); }));
app.get('/download/:id/:file', (req, res) => {
  let b; try { b = myBuild(req); } catch { return res.status(404).send('not found'); }
  const f = path.join(builds.dirOf(b.id), path.basename(req.params.file));
  fs.existsSync(f) ? res.download(f) : res.status(404).send('not found');
});

// ---------- Admin ----------
const A = '/api/admin';
app.use(A, needAdmin);
app.get(A + '/users', h((req, res) => res.json(users.list().map((u) => ({ ...u, projects: ws.projectsOf(u.id).length })))));
app.post(A + '/users', h((req, res) => res.json(users.create(req.body.username, req.body.password, req.body.maxPerDay))));
app.put(A + '/users/:id', h((req, res) => { const u = users.update(req.params.id, req.body); if (u.disabled || req.body.password) dropSessions(u.id); res.json(u); }));
app.delete(A + '/users/:id', h((req, res) => { users.remove(req.params.id); ws.deleteOwner(req.params.id); dropSessions(req.params.id); res.json({ ok: true }); }));

const withAcc = (req, fn) => { const a = settings.account(req.query.account || req.body?.account); if (!a) throw new Error('Select a GitHub account'); return gh.as(a, fn); };

app.get(A + '/settings', h((req, res) => res.json(settings.masked())));
app.put(A + '/settings', h((req, res) => { settings.update({ build: req.body.build }); res.json(settings.masked()); }));

// ---- Multiple GitHub accounts ----
app.get(A + '/accounts', h((req, res) => res.json(builds.accountStats())));
app.post(A + '/accounts', h(async (req, res) => res.json(await builds.connect(req.body))));
app.put(A + '/accounts/:id', h((req, res) => { const b = req.body, p = {}; for (const k of ['label', 'enabled', 'limitMinutes', 'maxConcurrent', 'token']) if (b[k] !== undefined && b[k] !== '') p[k] = b[k];
  if (!settings.patchAccount(req.params.id, p)) throw new Error('Account not found'); res.json({ ok: true }); }));
app.post(A + '/accounts/:id/check', h(async (req, res) => res.json(await builds.check(req.params.id))));
app.delete(A + '/accounts/:id', h(async (req, res) => { await builds.disconnect(req.params.id, !!req.query.deleteRepo); res.json({ ok: true }); }));

app.get(A + '/workflow', h((req, res) => { const h2 = settings.hashOf(settings.render()); res.json({ template: settings.tpl(), rendered: settings.render(), custom: !!settings.get().workflowTpl,
  synced: settings.accounts().filter((a) => a.enabled).every((a) => a.syncedHash === h2) }); }));
app.put(A + '/workflow', h((req, res) => { settings.update({ workflowTpl: req.body.template }); res.json({ ok: true }); }));
app.post(A + '/workflow/reset', h((req, res) => { settings.update({ workflowTpl: '' }); res.json({ template: settings.defaultTpl() }); }));
app.post(A + '/workflow/sync', h(async (req, res) => { await builds.syncAll(); res.json({ ok: true }); }));
app.post(A + '/template/reset', h((req, res) => { ws.resetTemplate(); res.json({ ok: true }); }));

// ---- Secrets (one account or all) ----
app.get(A + '/secrets', h(async (req, res) => res.json(await withAcc(req, () => gh.listSecrets()))));
app.put(A + '/secrets', h(async (req, res) => {
  if (!/^[A-Z_][A-Z0-9_]*$/i.test(req.body.name || '')) throw new Error('Invalid secret name');
  const targets = req.body.account === 'all' ? settings.accounts() : [settings.account(req.body.account)].filter(Boolean);
  if (!targets.length) throw new Error('Select a GitHub account');
  for (const a of targets) await gh.as(a, () => gh.setSecret(req.body.name, String(req.body.value)));
  res.json({ ok: true, accounts: targets.length });
}));
app.delete(A + '/secrets/:name', h(async (req, res) => { await withAcc(req, () => gh.deleteSecret(req.params.name)); res.json({ ok: true }); }));

// ---- Actions data and storage (per account) ----
app.get(A + '/actions', h(async (req, res) => withAcc(req, async () => {
  const [runs, arts, caches, branches] = await Promise.all([gh.listAllRuns(), gh.listArtifacts(), gh.listCaches().catch(() => []), gh.listBuildBranches()]);
  res.json({
    runs: runs.map((r) => ({ id: r.id, title: r.display_title || r.name, workflow: r.name, status: r.status, conclusion: r.conclusion, createdAt: r.created_at })),
    artifacts: arts.map((a) => ({ id: a.id, name: a.name, size: a.size_in_bytes, runId: a.workflow_run?.id, expired: a.expired, createdAt: a.created_at })),
    caches: caches.map((c) => ({ id: c.id, key: c.key, size: c.size_in_bytes })), branches,
  });
})));
app.post(A + '/actions/delete', h(async (req, res) => withAcc(req, async () => {
  const { runs = [], artifacts = [], caches = [], branches = [] } = req.body, n = { runs: 0, artifacts: 0, caches: 0, branches: 0 };
  for (const id of artifacts) { await gh.deleteArtifact(Number(id)); n.artifacts++; }
  for (const id of caches) { await gh.deleteCache(Number(id)); n.caches++; }
  for (const id of runs) { await gh.forceDeleteRun(Number(id)); n.runs++; }
  for (const b of branches) if (/^build-[a-f0-9]+$/.test(b)) { await gh.deleteBranch(b.slice(6)); n.branches++; }
  res.json(n);
})));
app.get(A + '/storage', h(async (req, res) => withAcc(req, async () => res.json(await gh.storageInfo()))));
app.post(A + '/cleanup', h(async (req, res) => res.json(await builds.sweep(req.body?.account && req.body.account !== 'all' ? req.body.account : undefined))));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`User panel: http://localhost:${port}   Admin panel: http://localhost:${port}/admin`));
