// ===== Project tool window: Android view + Project view =====
function popup(x, y, items, onClose) {
  $$('.ctx').forEach((c) => c.remove());
  const m = document.createElement('div'); m.className = 'ctx';
  m.innerHTML = items.map((it, i) => it.sep ? '<div class="msep"></div>' : `<div class="mi ${it.dis ? 'dis' : ''}" data-i="${i}">${it.check !== undefined ? `<span style="width:12px">${it.check ? '✔' : ''}</span>` : ''}${it.icon || ''}<span>${esc(it.label)}</span>${it.kbd ? `<span class="k">${esc(it.kbd)}</span>` : ''}</div>`).join('');
  document.body.appendChild(m);
  const r = m.getBoundingClientRect(); m.style.left = Math.min(x, innerWidth - r.width - 6) + 'px'; m.style.top = Math.min(y, innerHeight - r.height - 6) + 'px';
  const off = (e) => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off, true); onClose?.(); } };
  setTimeout(() => document.addEventListener('mousedown', off, true), 0);
  m.addEventListener('click', (e) => { const d = e.target.closest('.mi'); if (!d) return; const it = items[+d.dataset.i]; m.remove(); document.removeEventListener('mousedown', off, true); onClose?.(); it.action?.(); });
  return m;
}

function FileTree(el, E, opts = {}) {
  let mode = opts.mode || localStorage.getItem('tree-mode') || 'android', selected = null, open = new Set(), seen = new Set(), rootNodes = [];
  const GR = { module: '#3DDC84', java: '#4A88C7', res: '#C99D3F', manifest: '#E8833A', gradle: '#5FA05F', key: '#C9A227', other: '#8CA0B5' };
  const gIcon = (kind) => kind === 'module' ? `<span class="fi d" style="color:${GR.module}">${ic('android')}</span>` : kind === 'pkg' ? '<span class="fi d" style="color:#4A88C7"><svg viewBox="0 0 24 24"><path d="M12 2 3 7v10l9 5 9-5V7zm0 2.2 6.5 3.6L12 11.4 5.5 7.8zM5 9.6l6 3.3v6.6l-6-3.3zm14 0v6.6l-6 3.3v-6.6z"/></svg></span>' : `<span class="fi d" style="color:${GR[kind] || GR.other}">${ic('folder')}</span>`;

  // ---------- Project view ----------
  function projectTree(files) {
    const root = { children: [] }, map = { '': root };
    for (const f of files) {
      const parts = f.path.split('/'), key = f.path, parent = map[parts.slice(0, -1).join('/')] || root;
      const n = { name: parts[parts.length - 1], key: 'p:' + key, path: key, type: f.type, dir: f.type === 'dir' ? key : null, children: f.type === 'dir' ? [] : null };
      map[key] = n; parent.children.push(n);
    }
    const sort = (n) => { if (n.children) { n.children.sort((a, b) => (b.type === 'dir') - (a.type === 'dir') || a.name.localeCompare(b.name)); n.children.forEach(sort); } };
    sort(root); return root.children;
  }
  // ---------- Android view ----------
  function androidTree(files) {
    const F = files.filter((f) => f.type === 'file'), mods = {}, gradle = [], keystore = [], other = [];
    const G = (name, key, kind, dir) => ({ name, key, type: 'group', kind, dir, children: [] });
    for (const f of F) {
      const p = f.path, m = p.match(/^(?:(.+?)\/)?src\/main\/(.+)$/);
      if (m) {
        const mod = m[1] || 'app', rest = m[2], root = `${m[1] ? m[1] + '/' : ''}src/main`;
        const M = mods[mod] ||= { node: G(mod, 'a:' + mod, 'module', m[1] ? m[1] + '/' : ''), man: G('manifests', `a:${mod}/man`, 'manifest', root), java: G('java', `a:${mod}/java`, 'java', root + '/java'), res: G('res', `a:${mod}/res`, 'res', root + '/res'), assets: G('assets', `a:${mod}/assets`, 'other', root + '/assets'), pkgs: {}, rtypes: {}, oth: G('other', `a:${mod}/oth`, 'other', root) };
        const leaf = (label) => ({ name: label || p.split('/').pop(), key: 'f:' + p, path: p, type: 'file' });
        if (/^AndroidManifest\.xml$/.test(rest)) M.man.children.push(leaf());
        else if (/^(java|kotlin)\//.test(rest)) { const dir = rest.split('/').slice(1, -1).join('.') || '(default)'; (M.pkgs[dir] ||= Object.assign(G(dir, `a:${mod}/java/${dir}`, 'pkg', `${root}/${rest.split('/')[0]}/${dir === '(default)' ? '' : dir.replace(/\./g, '/')}`), {})).children.push(leaf()); }
        else if (/^res\//.test(rest)) { const t = rest.split('/')[1]; (M.rtypes[t] ||= G(t, `a:${mod}/res/${t}`, 'res', `${root}/res/${t}`)).children.push(leaf()); }
        else if (/^assets\//.test(rest)) M.assets.children.push(leaf(rest.slice(7)));
        else M.oth.children.push(leaf(rest));
      } else if (/^keystore\//.test(p)) keystore.push({ name: p.split('/').pop(), key: 'f:' + p, path: p, type: 'file' });
      else if (/(^|\/)(build\.gradle(\.kts)?|settings\.gradle(\.kts)?|gradle\.properties|local\.properties|proguard-rules\.pro)$/.test(p)) {
        const n = p.split('/').pop(), modName = p.includes('/') ? p.split('/')[0] : null;
        gradle.push({ name: /build\.gradle/.test(n) ? `${n} (${modName ? 'Module: :' + modName : 'Project'})` : n, key: 'f:' + p, path: p, type: 'file', ord: modName ? 1 : 0 });
      } else other.push({ name: p, key: 'f:' + p, path: p, type: 'file' });
    }
    const out = [];
    for (const [name, M] of Object.entries(mods)) {
      const kids = [M.man, M.java, M.res, M.assets, M.oth].filter((g) => g.children.length || g === M.java && Object.keys(M.pkgs).length);
      M.java.children = Object.values(M.pkgs).sort((a, b) => a.name.localeCompare(b.name));
      M.res.children = Object.values(M.rtypes).sort((a, b) => a.name.localeCompare(b.name));
      for (const g of [M.man, M.assets, M.oth]) g.children.sort((a, b) => a.name.localeCompare(b.name));
      for (const k of [M.java, M.res]) k.children.forEach((c) => c.children.sort((a, b) => a.name.localeCompare(b.name)));
      M.node.children = [M.man, M.java, M.res, M.assets, M.oth].filter((g) => g.children.length);
      out.push(M.node);
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    if (gradle.length) { const g = G('Gradle Scripts', 'a:gradle', 'gradle', ''); g.children = gradle.sort((a, b) => a.ord - b.ord || a.name.localeCompare(b.name)); out.push(g); }
    if (keystore.length) { const g = G('keystore', 'a:keystore', 'key', 'keystore'); g.children = keystore; out.push(g); }
    if (other.length) { const g = G('Other files', 'a:other', 'other', ''); g.children = other; out.push(g); }
    return out;
  }

  function ancestors(nodes, path, trail = []) { for (const n of nodes) { if (n.path === path) return trail; if (n.children) { const r = ancestors(n.children, path, [...trail, n.key]); if (r) return r; } } return null; }
  // newly appearing important folders open automatically (e.g. when keystore/ is created)
  function autoOpen() {
    const walk = (ns, d) => ns.forEach((n) => { if (!n.children) return; if (!seen.has(n.key)) { seen.add(n.key); if (mode === 'android' ? ['module', 'java', 'pkg', 'key'].includes(n.kind) : d < 1) open.add(n.key); } walk(n.children, d + 1); });
    walk(rootNodes, 0);
  }
  function render() {
    rootNodes = mode === 'android' ? androidTree(E.files) : projectTree(E.files);
    autoOpen();
    const rows = [];
    const draw = (ns, d) => ns.forEach((n) => {
      const isDir = !!n.children, op = open.has(n.key), sel = n.path && n.path === selected;
      const icon = n.type === 'group' ? gIcon(n.kind) : fileIcon(n.name === n.path ? n.path : n.path || n.name, n.type);
      rows.push(`<div class="tn ${sel ? 'on' : ''}" style="padding-left:${d * 14 + 4}px" data-k="${esc(n.key)}" ${n.path ? `data-p="${esc(n.path)}"` : ''} data-t="${isDir ? 'd' : 'f'}" ${n.dir !== undefined && n.dir !== null ? `data-dir="${esc(n.dir)}"` : ''}><span class="cv">${isDir ? (op ? '▾' : '▸') : ''}</span>${icon}<span class="lb">${esc(n.name)}</span></div>`);
      if (isDir && op) draw(n.children, d + 1);
    });
    draw(rootNodes, 0);
    el.innerHTML = rows.join('') || '<div class="mu" style="padding:12px">No files yet — click ＋ to create one</div>';
  }
  el.addEventListener('click', (e) => {
    const r = e.target.closest('.tn'); if (!r) return; el.classList.add('f');
    if (r.dataset.t === 'd') { const k = r.dataset.k; open.has(k) ? open.delete(k) : open.add(k); render(); }
    else if (r.dataset.p) E.open(r.dataset.p);
  });
  el.addEventListener('contextmenu', (e) => {
    const r = e.target.closest('.tn'); e.preventDefault(); if (!r) return popup(e.clientX, e.clientY, [{ label: 'New File…', action: () => E.newFile() }, { label: 'Upload Files…', action: () => E.upload() }]);
    const p = r.dataset.p, dir = r.dataset.dir, isF = r.dataset.t === 'f', items = [];
    const base = isF ? p.split('/').slice(0, -1).join('/') : dir;
    if (isF) items.push({ label: 'Open', action: () => E.open(p) });
    if (base !== undefined) items.push({ label: 'New File…', icon: '', action: () => { const n = prompt('File name / path', (base ? base.replace(/\/$/, '') + '/' : '')); if (n) E.newFile(n); } }, { label: 'Upload Files Here…', action: () => E.upload(base) });
    if (p) items.push({ sep: 1 }, { label: 'Rename…', kbd: 'Shift+F6', action: () => { const n = prompt('New path', p); if (n) E.rename(p, n); } }, { label: 'Delete…', kbd: 'Del', action: () => E.remove(p) });
    popup(e.clientX, e.clientY, items);
  });
  E.on('files', render);
  E.on('active', (p) => { selected = p; if (p) { const a = ancestors(rootNodes, p); a?.forEach((k) => open.add(k)); } render(); const on = el.querySelector('.tn.on'); on?.scrollIntoView({ block: 'nearest' }); });
  return {
    get mode() { return mode; }, setMode(m) { mode = m; localStorage.setItem('tree-mode', m); seen = new Set(); open = new Set(); render(); },
    collapseAll() { open = new Set(); render(); }, locate() { if (selected) { ancestors(rootNodes, selected)?.forEach((k) => open.add(k)); render(); el.querySelector('.tn.on')?.scrollIntoView({ block: 'center' }); } }, render,
  };
}
