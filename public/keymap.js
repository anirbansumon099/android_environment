// ===== Commands + Keymap (IntelliJ / Android Studio default keymap, remappable) =====
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);
// Combos the browser keeps for itself in a normal tab (cannot be overridden by a web page)
const RESERVED = new Set(['Ctrl+N', 'Ctrl+T', 'Ctrl+W', 'Ctrl+Shift+N', 'Ctrl+Shift+T', 'Ctrl+Shift+W', 'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Ctrl+PageUp', 'Ctrl+PageDown', 'Ctrl+F4', 'Alt+F4']);
const KEYNAME = { Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter', Escape: 'Esc', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Minus: '-', Equal: '=', Backquote: '`', NumpadAdd: 'Num+', NumpadSubtract: 'Num-', NumpadMultiply: 'Num*', NumpadDivide: 'Num/' };
function keyName(e) { const c = e.code; if (/^Key[A-Z]$/.test(c)) return c.slice(3); if (/^Digit\d$/.test(c)) return c.slice(5); if (/^F\d{1,2}$/.test(c)) return c; if (/^Numpad\d$/.test(c)) return 'Num' + c.slice(6); return KEYNAME[c] || null; }
function comboOf(e) { const k = keyName(e); if (!k) return null; const m = []; if (e.ctrlKey || e.metaKey) m.push('Ctrl'); if (e.altKey) m.push('Alt'); if (e.shiftKey) m.push('Shift'); return [...m, k].join('+'); }

const Commands = {
  map: new Map(),
  register(c) { this.map.set(c.id, { category: 'General', keys: [], ...c }); },
  get(id) { return this.map.get(id); }, all() { return [...this.map.values()]; },
  async run(id, ...a) { const c = this.map.get(id); if (!c || c.native) return; if (c.when && !c.when()) return false; try { return await c.run(...a); } catch (e) { console.error(e); toast('❌ ' + e.message); } },
};
const Keymap = {
  user: JSON.parse(localStorage.getItem('keymap') || '{}'), idx: {}, recording: false,
  keys(id) { return this.user[id] ?? Commands.get(id)?.keys ?? []; },
  pretty(k) { return IS_MAC ? k.replace(/Ctrl/g, '⌘').replace(/Alt/g, '⌥').replace(/Shift/g, '⇧').replace(/\+/g, '') : k; },
  text(id) { return this.keys(id).map((k) => this.pretty(k)).join(' / '); },
  first(id) { const k = this.keys(id)[0]; return k ? this.pretty(k) : ''; },
  save() { localStorage.setItem('keymap', JSON.stringify(this.user)); this.rebuild(); },
  set(id, keys) { this.user[id] = keys; this.save(); }, reset(id) { delete this.user[id]; this.save(); }, resetAll() { this.user = {}; this.save(); },
  rebuild() { this.idx = {}; for (const c of Commands.all()) { if (c.native) continue; for (const k of this.keys(c.id)) (this.idx[k] ||= []).push(c.id); } },
  conflicts(combo, except) { return (this.idx[combo] || []).filter((i) => i !== except); },
  isCustom: (id) => id in Keymap.user,
};
const kbdHtml = (id) => Keymap.keys(id).map((k) => `<kbd class="kbd">${esc(Keymap.pretty(k))}</kbd>`).join(' ');

// ---------- global key dispatcher (capture phase: runs before the editor's own handlers) ----------
(() => {
  let lastShiftUp = 0, holdOther = false;
  const inField = () => { const a = document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !a.closest('.monaco-editor'); };
  const inMonaco = () => !!document.activeElement?.closest?.('.monaco-editor');
  document.addEventListener('keyup', (e) => { if (e.key === 'Shift' && !holdOther) lastShiftUp = Date.now(); });
  document.addEventListener('keydown', (e) => {
    if (Keymap.recording || e.isComposing) return;
    const modalOpen = !!document.querySelector('.mbg, .palette-bg');
    if (e.key === 'Shift') { if (!e.repeat) { holdOther = false; if (lastShiftUp && Date.now() - lastShiftUp < 400) { lastShiftUp = 0; if (!modalOpen) { e.preventDefault(); Commands.run('search-everywhere'); } } } return; }
    holdOther = true; lastShiftUp = 0;
    const combo = comboOf(e); if (!combo) return;
    const ids = Keymap.idx[combo]; if (!ids) return;
    if (modalOpen && combo !== 'Ctrl+Shift+A') return;               // dialogs handle their own keys
    const plain = !/Ctrl|Alt/.test(combo) && !/^(Shift\+)?F\d+$/.test(combo);
    if (plain && (inField() || inMonaco())) return;                   // plain keys belong to text editing
    for (const id of ids) { const c = Commands.get(id); if (c.when && !c.when(e)) continue; e.preventDefault(); e.stopPropagation(); Commands.run(id); return; }
  }, true);
})();

// ---------- fuzzy matching + palette (Find Action / Search Everywhere / Go to File) ----------
function fuzzy(q, text) {
  q = q.toLowerCase(); const t = text.toLowerCase(); let qi = 0, score = 0, last = -2; const idx = [];
  for (let i = 0; i < t.length && qi < q.length; i++) if (t[i] === q[qi]) { idx.push(i); score += (i === last + 1 ? 5 : 1) + (i === 0 || /[\s/_.\-]/.test(t[i - 1]) ? 4 : 0); last = i; qi++; }
  if (qi < q.length) return null; return { score: score - t.length * 0.05, idx };
}
const hl = (text, idx = []) => { const set = new Set(idx); return [...text].map((c, i) => set.has(i) ? `<mark>${esc(c)}</mark>` : esc(c)).join(''); };
const baseName = (p) => p.split('/').pop();

function palette({ title, placeholder, scopes, items, initial = '' }) {
  document.querySelectorAll('.palette-bg').forEach((x) => x.remove());
  const bg = document.createElement('div'); bg.className = 'palette-bg';
  bg.innerHTML = `<div class="palette"><div class="ph">${esc(title)}${scopes ? `<span class="grow"></span>${scopes.map((s, i) => `<span class="sc ${i ? '' : 'on'}" data-s="${i}">${esc(s)}</span>`).join('')}` : ''}</div><input class="pin" placeholder="${esc(placeholder || '')}" spellcheck="false"><div class="plist"></div><div class="pft">↑↓ navigate · Enter select · Esc close${scopes ? ' · Tab switch scope' : ''}</div></div>`;
  document.body.appendChild(bg);
  const input = bg.querySelector('.pin'), list = bg.querySelector('.plist'); let sel = 0, scope = 0, cur = [];
  const close = () => { bg.remove(); E?.focus?.(); };
  const render = () => {
    cur = items(input.value.trim(), scope).slice(0, 60); sel = Math.min(sel, Math.max(0, cur.length - 1)); let lastG = null;
    list.innerHTML = cur.map((it, i) => { const g = it.group && it.group !== lastG ? `<div class="pg">${esc(it.group)}</div>` : ''; lastG = it.group || lastG; return `${g}<div class="pi ${i === sel ? 'on' : ''}" data-i="${i}">${it.icon || ''}<span class="pl">${it.html || esc(it.label)}</span><span class="pd">${esc(it.detail || '')}</span>${it.kbd ? `<span class="pk">${it.kbd}</span>` : ''}</div>`; }).join('') || '<div class="pg">Nothing found</div>';
    list.querySelector('.pi.on')?.scrollIntoView({ block: 'nearest' });
  };
  const pick = (i) => { const it = cur[i]; if (!it) return; close(); setTimeout(() => it.run?.(), 0); };
  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(cur.length - 1, sel + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
    else if (e.key === 'PageDown') { e.preventDefault(); sel = Math.min(cur.length - 1, sel + 8); render(); }
    else if (e.key === 'PageUp') { e.preventDefault(); sel = Math.max(0, sel - 8); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
    else if (e.key === 'Tab' && scopes) { e.preventDefault(); scope = (scope + (e.shiftKey ? scopes.length - 1 : 1)) % scopes.length; bg.querySelectorAll('.sc').forEach((x, i) => x.classList.toggle('on', i === scope)); sel = 0; render(); }
  });
  list.addEventListener('click', (e) => { const r = e.target.closest('.pi'); if (r) pick(+r.dataset.i); });
  bg.querySelectorAll('.sc').forEach((x) => x.onclick = () => { scope = +x.dataset.s; bg.querySelectorAll('.sc').forEach((y, i) => y.classList.toggle('on', i === scope)); render(); input.focus(); });
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  input.value = initial; render(); input.focus();
  return { close };
}

// ---------- the palettes ----------
const fileItems = (q, filter = () => true) => {
  const files = E.files.filter((f) => f.type === 'file' && filter(f.path)), rec = E.recent;
  if (!q) return files.sort((a, b) => (rec.indexOf(a.path) + 1 || 999) - (rec.indexOf(b.path) + 1 || 999)).slice(0, 30).map((f) => ({ icon: fileIcon(f.path), label: baseName(f.path), detail: f.path.split('/').slice(0, -1).join('/'), run: () => E.open(f.path) }));
  return files.map((f) => { const n = fuzzy(q, baseName(f.path)), p = n || fuzzy(q, f.path); return p && { f, score: p.score + (n ? 20 : 0), html: n ? hl(baseName(f.path), n.idx) : esc(baseName(f.path)) }; }).filter(Boolean).sort((a, b) => b.score - a.score).map(({ f, html }) => ({ icon: fileIcon(f.path), html, label: baseName(f.path), detail: f.path.split('/').slice(0, -1).join('/'), run: () => E.open(f.path) }));
};
const actionItems = (q) => Commands.all().filter((c) => !c.hidden && c.title && (!c.when || c.when() || true)).map((c) => { const m = q ? fuzzy(q, c.title) : { score: 0, idx: [] }; return m && { c, m }; }).filter(Boolean).sort((a, b) => b.m.score - a.m.score || a.c.title.localeCompare(b.c.title)).map(({ c, m }) => ({ html: hl(c.title, m.idx), label: c.title, detail: c.category, kbd: c.native ? Keymap.pretty(c.keys[0] || '') : kbdHtml(c.id), icon: '<span class="fi t">⚡</span>', run: () => Commands.run(c.id) }));
const openFindAction = () => palette({ title: 'Find Action', placeholder: 'Type an action name (e.g. build, reformat, theme)…', items: actionItems });
const openGotoFile = () => palette({ title: 'Go to File', placeholder: 'File name…', items: (q) => fileItems(q) });
const openGotoClass = () => palette({ title: 'Go to Class', placeholder: 'Class name…', items: (q) => fileItems(q, (p) => /\.(java|kt)$/.test(p)) });
const openRecent = () => palette({ title: 'Recent Files', placeholder: 'Filter…', items: (q) => { const l = E.recent.map((p) => ({ icon: fileIcon(p), label: baseName(p), detail: p.split('/').slice(0, -1).join('/'), run: () => E.open(p) })); return q ? l.filter((x) => fuzzy(q, x.label)) : l; } });
const openSearchEverywhere = () => palette({
  title: 'Search Everywhere', placeholder: 'Search files, classes and actions…', scopes: ['All', 'Files', 'Actions'],
  items: (q, sc) => {
    const out = [];
    if (sc !== 2) for (const f of fileItems(q).slice(0, q ? 25 : 8)) out.push({ ...f, group: 'Files' });
    if (sc !== 1 && (q || sc === 2)) for (const a of actionItems(q).slice(0, 20)) out.push({ ...a, group: 'Actions' });
    return out;
  },
});

// ---------- Keyboard Shortcuts reference (F1) ----------
function openShortcuts() {
  const m = modal(`<h3>Keyboard Shortcuts</h3><input id="sk-q" placeholder="Filter actions or keys…" style="margin-bottom:10px"><div id="sk-body" style="max-height:62vh;overflow:auto"></div><div class="foot"><span class="mu" style="margin-right:auto">⚠ = the browser may keep this combo for itself — install the app (Chrome ▸ Install) or remap it in Settings ▸ Keymap</span><button class="s" id="sk-set">Customize…</button><button id="sk-x">Close</button></div>`, { xl: true });
  const draw = () => {
    const q = m.$('#sk-q').value.toLowerCase(), cats = {};
    for (const c of Commands.all()) { if (c.hidden || !c.title) continue; const ks = c.native ? c.keys : Keymap.keys(c.id); if (!ks.length) continue; const txt = (c.title + ' ' + ks.join(' ')).toLowerCase(); if (q && !txt.includes(q)) continue; (cats[c.category] ||= []).push([c, ks]); }
    m.$('#sk-body').innerHTML = Object.entries(cats).map(([cat, rows]) => `<div class="skcat"><h4>${esc(cat)}</h4>${rows.map(([c, ks]) => `<div class="skrow"><span>${esc(c.title)}</span><span>${ks.map((k) => `<kbd class="kbd">${esc(Keymap.pretty(k))}</kbd>${RESERVED.has(k) ? '<span class="wn" title="Reserved by the browser">⚠</span>' : ''}`).join(' ')}</span></div>`).join('')}</div>`).join('') || '<div class="mu">No matching shortcuts</div>';
  };
  m.$('#sk-q').oninput = draw; m.$('#sk-x').onclick = m.close; m.$('#sk-set').onclick = () => { m.close(); openSettings('keymap'); }; draw(); m.$('#sk-q').focus();
}

// ---------- Settings (Ctrl+Alt+S): Appearance / Editor / Keymap ----------
function openSettings(tab = 'appearance') {
  const m = modal('', { xl: true }); let cur = tab;
  const draw = () => {
    m.el.innerHTML = `<h3>Settings</h3><div class="setw"><div class="setn">${[['appearance', 'Appearance'], ['editor', 'Editor'], ['keymap', 'Keymap']].map(([k, l]) => `<div class="${cur === k ? 'on' : ''}" data-k="${k}">${l}</div>`).join('')}</div><div class="setb" id="setb"></div></div><div class="foot"><button id="set-x">Close</button></div>`;
    m.$$('.setn div').forEach((d) => d.onclick = () => { cur = d.dataset.k; draw(); }); m.$('#set-x').onclick = m.close;
    const b = m.$('#setb'), S = E.settings;
    if (cur === 'appearance') { b.innerHTML = `<h4>Theme</h4><label class="opt ${Theme.get() === 'dark' ? 'on' : ''}"><input type="radio" name="th" value="dark" ${Theme.get() === 'dark' ? 'checked' : ''}><div><b>Darcula</b><div class="mu">Dark theme (default)</div></div></label><label class="opt ${Theme.get() === 'light' ? 'on' : ''}"><input type="radio" name="th" value="light" ${Theme.get() === 'light' ? 'checked' : ''}><div><b>IntelliJ Light</b><div class="mu">Light theme</div></div></label>`; b.querySelectorAll('[name=th]').forEach((r) => r.onchange = () => { Theme.set(r.value); draw(); }); }
    if (cur === 'editor') {
      b.innerHTML = `<h4>Editor</h4><div class="fg"><div><label>Font size</label><input id="e-fs" type="number" min="10" max="28" value="${S.fontSize}"></div><div><label>Tab size</label><select id="e-ts">${[2, 4, 8].map((n) => `<option ${n === S.tabSize ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
        <div class="srow"><div><b>Soft-wrap long lines</b><div class="mu">Wrap lines at the editor edge</div></div><label class="swc"><input type="checkbox" id="e-ww" ${S.wordWrap ? 'checked' : ''}><i></i></label></div>
        <div class="srow"><div><b>Show minimap</b><div class="mu">Code overview on the right edge</div></div><label class="swc"><input type="checkbox" id="e-mm" ${S.minimap ? 'checked' : ''}><i></i></label></div>`;
      b.querySelector('#e-fs').onchange = (e) => E.setOptions({ fontSize: Math.min(28, Math.max(10, +e.target.value || 13)) }); b.querySelector('#e-ts').onchange = (e) => E.setOptions({ tabSize: +e.target.value });
      b.querySelector('#e-ww').onchange = (e) => E.setOptions({ wordWrap: e.target.checked }); b.querySelector('#e-mm').onchange = (e) => E.setOptions({ minimap: e.target.checked });
    }
    if (cur === 'keymap') keymapPanel(b);
  };
  draw();
}
function keymapPanel(b) {
  let q = '';
  const draw = () => {
    const rows = Commands.all().filter((c) => !c.hidden && c.title && !c.native && (!q || (c.title + ' ' + c.category + ' ' + Keymap.keys(c.id).join(' ')).toLowerCase().includes(q.toLowerCase()))).sort((a, b2) => a.category.localeCompare(b2.category) || a.title.localeCompare(b2.title));
    b.innerHTML = `<h4>Keymap <span class="mu" style="font-weight:400">— IntelliJ IDEA / Android Studio (Default)</span></h4><div class="row"><input id="km-q" placeholder="Search actions or shortcuts…" value="${esc(q)}" style="flex:1"><button class="s" id="km-reset">Reset all</button></div><div class="kmt"><table class="tbl2"><thead><tr><th>Action</th><th>Shortcuts</th><th style="width:150px"></th></tr></thead><tbody>${rows.map((c) => `<tr><td>${esc(c.title)}<div class="mu">${esc(c.category)}</div></td><td>${Keymap.keys(c.id).map((k, i) => `<span class="chip"><kbd class="kbd">${esc(Keymap.pretty(k))}</kbd>${RESERVED.has(k) ? '<span class="wn" title="Reserved by the browser — may not work in a normal tab">⚠</span>' : ''}<span class="rm" data-id="${c.id}" data-i="${i}" title="Remove">×</span></span>`).join('') || '<span class="mu">—</span>'}</td><td style="text-align:right"><button class="s xs" data-add="${c.id}">＋ Add</button> ${Keymap.isCustom(c.id) ? `<button class="s xs" data-rs="${c.id}">Reset</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
    const qi = b.querySelector('#km-q'); qi.oninput = () => { q = qi.value; draw(); const n = b.querySelector('#km-q'); n.focus(); n.setSelectionRange(q.length, q.length); };
    b.querySelector('#km-reset').onclick = () => { if (confirm('Reset all shortcuts to the defaults?')) { Keymap.resetAll(); draw(); } };
    b.querySelectorAll('[data-rs]').forEach((x) => x.onclick = () => { Keymap.reset(x.dataset.rs); draw(); });
    b.querySelectorAll('.rm').forEach((x) => x.onclick = () => { const id = x.dataset.id, ks = [...Keymap.keys(id)]; ks.splice(+x.dataset.i, 1); Keymap.set(id, ks); draw(); });
    b.querySelectorAll('[data-add]').forEach((x) => x.onclick = () => record(x.dataset.add, x));
  };
  const record = (id, btn) => {
    btn.textContent = 'Press keys… (Esc to cancel)'; Keymap.recording = true;
    const done = (combo) => { Keymap.recording = false; document.removeEventListener('keydown', h, true); if (!combo) return draw();
      const clash = Keymap.conflicts(combo, id);
      if (clash.length && !confirm(`${Keymap.pretty(combo)} is already used by: ${clash.map((c) => Commands.get(c).title).join(', ')}.\nReassign it?`)) return draw();
      for (const c of clash) Keymap.set(c, Keymap.keys(c).filter((k) => k !== combo));
      Keymap.set(id, [...new Set([...Keymap.keys(id), combo])]); if (RESERVED.has(combo)) toast('⚠ The browser may keep this combo for itself'); draw(); };
    const h = (e) => { e.preventDefault(); e.stopPropagation(); if (e.key === 'Escape') return done(null); const c = comboOf(e); if (!c || !/\+/.test(c) && !/^F\d+$/.test(c)) return; done(c); };
    document.addEventListener('keydown', h, true);
  };
  draw();
}
