const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1024).toFixed(0) + ' KB';
let TOKEN = sessionStorage.getItem('tk') || '', ME = JSON.parse(sessionStorage.getItem('me') || 'null');

function toast(m) { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', 3500); }
const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast('❌ ' + e.message); } };
async function api(url, method = 'GET', body) {
  const r = await fetch(url, { method, headers: { 'x-auth': TOKEN, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) { logout(false); throw new Error('Please sign in again'); }
  const d = (r.headers.get('content-type') || '').includes('json') ? await r.json() : await r.text();
  if (!r.ok) { const e = new Error(d.error || d); e.data = d; throw e; }
  return d;
}

// ---- Theme ----
const Theme = {
  key: 'theme', get() { return document.documentElement.dataset.theme; },
  init(key, def) { this.key = key; document.documentElement.dataset.theme = localStorage.getItem(key) || def; },
  set(t) { document.documentElement.dataset.theme = t; localStorage.setItem(this.key, t); window.dispatchEvent(new Event('themechange')); },
  toggle() { this.set(this.get() === 'dark' ? 'light' : 'dark'); },
};

// ---- Icons ----
const P = { play: 'M8 5v14l11-7z', stop: 'M6 6h12v12H6z', save: 'M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM15 9H5V5h10v4z', key: 'M12.65 10A6 6 0 1 0 12.65 14H17v4h4v-4h2v-4H12.65zM7 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4z',
  folder: 'M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z', refresh: 'M17.65 6.35A8 8 0 1 0 19.73 14h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z', minus: 'M5 11h14v2H5z', locate: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.94 3A9 9 0 0 0 13 3.06V1h-2v2.06A9 9 0 0 0 3.06 11H1v2h2.06A9 9 0 0 0 11 20.94V23h2v-2.06A9 9 0 0 0 20.94 13H23v-2h-2.06zM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14z',
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z', gear: 'M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.66 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.61.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.09.48 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
  upload: 'M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z', download: 'M5 20h14v-2H5zM19 9h-4V3H9v6H5l7 7z', trash: 'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z', android: 'M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85a.637.637 0 0 0-.83.22l-1.88 3.24a11.46 11.46 0 0 0-8.94 0L5.65 5.67a.64.64 0 0 0-.87-.2c-.28.18-.37.54-.22.83L6.4 9.48A10.78 10.78 0 0 0 1 18h22a10.78 10.78 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z',
  build: 'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z', sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM2 13h2v-2H2zm18 0h2v-2h-2zM11 2v2h2V2zm0 18v2h2v-2zM5.99 4.58L4.58 5.99l1.41 1.41 1.41-1.41zm12.37 12.37l-1.41 1.41 1.41 1.41 1.41-1.41zM18.36 7.4l1.41-1.41-1.41-1.41-1.41 1.41zM5.99 19.42l1.41-1.41-1.41-1.41-1.41 1.41z', moon: 'M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.39 5.39 0 0 1-4.4 2.26 5.4 5.4 0 0 1-5.4-5.4c0-1.81.89-3.42 2.26-4.4A9.1 9.1 0 0 0 12 3z' };
const ic = (n, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}"><path d="${P[n]}"/></svg>`;
function fileIcon(path, type) {
  if (type === 'dir') return `<span class="fi d">${ic('folder')}</span>`;
  const e = (path.split('.').pop() || '').toLowerCase();
  if (e === 'java') return '<span class="fi j">C</span>';
  if (e === 'xml') return '<span class="fi x">&lt;&gt;</span>';
  if (e === 'gradle') return '<span class="fi g">G</span>';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg'].includes(e)) return '<span class="fi i">▣</span>';
  if (['p12', 'jks', 'keystore', 'pfx', 'pem'].includes(e)) return '<span class="fi k">K</span>';
  if (['properties', 'pro', 'json', 'toml', 'yml', 'yaml'].includes(e)) return '<span class="fi p">⚙</span>';
  return '<span class="fi t">T</span>';
}

// ---- login ----
function requireLogin(role, onReady, title) {
  const box = document.createElement('div'); box.className = 'login';
  box.innerHTML = `<div><h2>${title || (role === 'admin' ? 'Admin Login' : 'Sign in')}</h2><span class="mu" style="margin-top:-6px">${role === 'admin' ? 'Sign in to the admin console' : 'Sign in to your account'}</span>
    <input id="lu" placeholder="Username" value="${role === 'admin' ? 'admin' : ''}" autocomplete="username"><input id="lp" type="password" placeholder="Password" autocomplete="current-password"><button id="lb">Sign in</button><span id="le" class="er"></span></div>`;
  document.body.appendChild(box);
  const go = async () => {
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('#lu').value, password: $('#lp').value }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      if (role === 'admin' && d.role !== 'admin') throw new Error('This is the admin console');
      TOKEN = d.token; ME = d; sessionStorage.setItem('tk', TOKEN); sessionStorage.setItem('me', JSON.stringify(ME));
      box.remove(); onReady();
    } catch (e) { $('#le').textContent = e.message; }
  };
  $('#lb').onclick = go; $('#lp').onkeydown = (e) => e.key === 'Enter' && go();
  if (TOKEN && ME && (role !== 'admin' || ME.role === 'admin')) { box.remove(); onReady(); }
}
function logout(call = true) { if (call) fetch('/api/logout', { method: 'POST', headers: { 'x-auth': TOKEN } }); TOKEN = ''; ME = null; sessionStorage.clear(); location.reload(); }

// ---- Monaco ----
let monacoP;
function loadMonaco() {
  return monacoP ||= new Promise((ok) => {
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js';
    s.onload = () => { require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } }); require(['vs/editor/editor.main'], ok); };
    document.head.appendChild(s);
  });
}

// ---- Modal ----
function modal(html, { wide = false, xl = false } = {}) {
  const bg = document.createElement('div'); bg.className = 'mbg';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''} ${xl ? 'xl' : ''}">${html}</div>`;
  document.body.appendChild(bg);
  const m = { el: bg.firstChild, close: () => bg.remove(), $: (q) => bg.querySelector(q), $$: (q) => [...bg.querySelectorAll(q)] };
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) m.close(); });
  return m;
}
// Save / Don't save / Cancel
function ask3(title, text, labels = ['Save', "Don't Save", 'Cancel']) {
  return new Promise((res) => {
    const m = modal(`<h3>${esc(title)}</h3><div>${esc(text)}</div><div class="foot"><button id="a1">${labels[0]}</button><button class="s" id="a2">${labels[1]}</button><button class="s" id="a3">${labels[2]}</button></div>`);
    m.$('#a1').onclick = () => { m.close(); res('save'); }; m.$('#a2').onclick = () => { m.close(); res('discard'); }; m.$('#a3').onclick = () => { m.close(); res('cancel'); };
  });
}
const b64 = async (file) => { const buf = new Uint8Array(await file.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode(...buf.subarray(i, i + 32768)); return btoa(s); };

// ---- Build data (polling) — shared by IDE and CMS ----
const FINALS = ['done', 'failed', 'error'];
const STAGE = { queued: ['Queued', 'wn'], pushing: ['Uploading', 'wn'], waiting: ['Waiting for runner', 'wn'], running: ['Building', 'wn'], saving: ['Saving output', 'wn'], cleaning: ['Cleaning up', 'wn'], done: ['Succeeded', 'ok'], failed: ['Failed', 'er'], error: ['Error', 'er'] };
const stageOf = (b) => STAGE[b.stage] || [b.stage, ''];
const SIGN = { custom: ['🔏 Your keystore', 'okt'], test: ['⚠ Test key', 'wnt'], debug: ['Debug key', ''] };
const fmtSize = (n) => n == null ? '' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const fmtDur = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const elapsed = (b) => (b.finishedAt || Date.now()) - b.createdAt;
const outputsOf = (b) => (b.files || []).filter((f) => /\.(apk|aab)$/.test(f));

// What the user sees: a 6-step pipeline, so it is always clear where the APK is being built
const PHASES = [
  ['queue', 'Queued', 'Waiting for a free build slot'],
  ['upload', 'Upload', 'Packaging your project and sending it to GitHub'],
  ['runner', 'GitHub runner', 'Starting a cloud machine on GitHub Actions'],
  ['build', 'Build', 'Compiling your app with Gradle on GitHub'],
  ['sign', 'Sign', 'Signing the APK / AAB'],
  ['output', 'Output', 'Downloading the finished file to this server'],
];
const STEP_TEXT = { 'Set up job': 'Preparing the GitHub runner', 'Checkout source package': 'Downloading your project zip', 'Extract project': 'Extracting your project', 'Build web app (if the project has webapp/)': 'Building the web app with npm', 'Verify signing key': 'Verifying your keystore', 'Setup JDK': 'Installing the JDK', 'Setup Gradle': 'Installing Gradle', 'Build': 'Compiling your app with Gradle (this is the longest step)', 'Collect and sign': 'Signing the APK / AAB', 'Upload artifact': 'Packaging the output' };
const STEP_PHASE = { 'Build': 3, 'Collect and sign': 4, 'Upload artifact': 4 };
function buildPhase(b, steps = []) {
  const cur = steps.find((x) => x.status === 'in_progress'), failed = steps.find((x) => x.conclusion === 'failure');
  const ph = (n) => STEP_PHASE[n] ?? 2;
  if (b.stage === 'done') return { idx: 6, state: 'done', detail: 'Finished' };
  if (b.stage === 'queued') return { idx: 0, state: 'run', detail: b.note || 'Waiting for a free build slot' };
  if (b.stage === 'pushing') return { idx: 1, state: 'run', detail: 'Zipping the project and uploading it to GitHub' };
  if (b.stage === 'waiting') return { idx: 2, state: 'run', detail: 'Waiting for a GitHub runner to start' };
  if (b.stage === 'saving' || b.stage === 'cleaning') return { idx: 5, state: 'run', detail: b.stage === 'saving' ? 'Downloading the output to this server' : 'Cleaning up temporary files on GitHub' };
  if (b.stage === 'failed' || b.stage === 'error') { const i = failed ? ph(failed.name) : b.stage === 'error' && !steps.length ? 1 : cur ? ph(cur.name) : 2; return { idx: i, state: 'fail', detail: failed ? `Step failed: ${STEP_TEXT[failed.name] || failed.name}` : (b.note || 'Build failed') }; }
  return { idx: cur ? ph(cur.name) : 2, state: 'run', detail: cur ? (STEP_TEXT[cur.name] || cur.name) : 'Runner is starting' };
}
const BuildStore = {
  list: [], sel: null, jobs: {}, live: {}, subs: [], fin: [], timer: null, _seen: null, _liveAt: 0,
  on(fn) { this.subs.push(fn); }, onFinish(fn) { this.fin.push(fn); }, emit() { this.subs.forEach((f) => { try { f(this); } catch (e) { console.error(e); } }); },
  get cur() { return this.list.find((b) => b.id === this.sel); },
  async refresh() {
    const prev = this._seen; this.list = await api('/api/builds');
    if (!this.cur) this.sel = this.list[0]?.id || null;
    const now = Object.fromEntries(this.list.map((b) => [b.id, b.stage]));
    if (prev) for (const b of this.list) if (prev[b.id] && !FINALS.includes(prev[b.id]) && FINALS.includes(b.stage)) this.fin.forEach((f) => { try { f(b); } catch (e) { console.error(e); } });
    this._seen = now;
    const b = this.cur;
    if (b) {
      this.jobs[b.id] = await api(`/api/builds/${b.id}/jobs`).catch(() => this.jobs[b.id] || []);
      if (!FINALS.includes(b.stage) && b.runId && Date.now() - this._liveAt > 6000) { this._liveAt = Date.now(); api(`/api/builds/${b.id}/log`).then((t) => { this.live[b.id] = t; }).catch(() => {}); }
    }
    this.emit();
  },
  select(id) { this.sel = id; this._liveAt = 0; this.refresh().catch(() => {}); },
  log: (id) => api(`/api/builds/${id}/log`),
  start(ms = 3000) { if (this.timer) return; this.refresh().catch(() => {}); this.timer = setInterval(() => { if (TOKEN && !document.hidden) this.refresh().catch(() => {}); }, ms); },
};
const stepIcon = (s) => s.status === 'completed' ? (s.conclusion === 'success' ? '<span class="ok">✔</span>' : s.conclusion === 'skipped' ? '<span class="mu">–</span>' : '<span class="er">✖</span>') : s.status === 'in_progress' ? '<span class="spin"></span>' : '<span class="mu">○</span>';
const stepDur = (s) => s.started && s.completed ? fmtDur(new Date(s.completed) - new Date(s.started)) : '';

// Pipeline stepper HTML (used in the IDE Build window)
function pipelineHtml(b, steps) {
  const p = buildPhase(b, steps);
  return `<div class="pipe-h">${PHASES.map(([k, l], i) => { const st = p.idx > i || p.idx === 6 ? 'done' : p.idx === i ? (p.state === 'fail' ? 'fail' : 'run') : 'todo'; return `<div class="ph ${st}" title="${esc(PHASES[i][2])}"><div class="dot">${st === 'done' ? '✔' : st === 'fail' ? '✖' : st === 'run' ? '<span class="spin"></span>' : i + 1}</div><div class="lbl">${l}</div></div>${i < PHASES.length - 1 ? `<div class="ln ${p.idx > i ? 'done' : ''}"></div>` : ''}`; }).join('')}</div>`;
}

// Balloon notifications (like Android Studio's event log balloons)
function balloon({ title, text, kind = 'info', actions = [], sticky = false }) {
  let box = $('#balloons'); if (!box) { box = document.createElement('div'); box.id = 'balloons'; document.body.appendChild(box); }
  const el = document.createElement('div'); el.className = 'balloon ' + kind;
  el.innerHTML = `<div class="bt"><b>${esc(title)}</b><span class="x">×</span></div><div class="bx">${text}</div><div class="ba">${actions.map((a, i) => a.href ? `<a class="btn" href="${a.href}" ${a.download ? 'download' : ''}>${esc(a.label)}</a>` : `<button class="s" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>`;
  box.appendChild(el); const close = () => el.remove();
  el.querySelector('.x').onclick = close; el.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => { actions[+b.dataset.i].run?.(); close(); });
  if (!sticky) setTimeout(close, 25000); return { close };
}
