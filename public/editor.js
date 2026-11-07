// ===== Android Codespace editor: live lint, code suggestions, SVG/XML/image preview =====
const IMG_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico'];
const extOf = (p) => (p.split('.').pop() || '').toLowerCase();
const ICONS = { p12: '🔑', jks: '🔑', keystore: '🔑', pem: '🔑', java: '☕', xml: '🧩', svg: '🎨', png: '🖼', jpg: '🖼', jpeg: '🖼', gif: '🖼', webp: '🖼', gradle: '🐘', md: '📝', json: '🔧', properties: '⚙️', pro: '⚙️' };
let INDEX = null, CUR = { base: null, res: {} }, FEATURES = false;
const lineCol = (t, off) => { const a = t.slice(0, off).split('\n'); return { line: a.length, col: a[a.length - 1].length + 1 }; };

// ---------- XML lint (client side) ----------
function lintXml(text, path) {
  const out = [];
  const doc = new DOMParser().parseFromString(text, 'application/xml'), err = doc.querySelector('parsererror');
  if (err) {
    const m = err.textContent.match(/error on line (\d+) at column (\d+):\s*([^\n]+)/i);
    if (m) out.push({ startLine: +m[1], startCol: +m[2], endLine: +m[1], endCol: +m[2] + 1, severity: 'error', message: 'XML: ' + m[3].trim() });
    else out.push({ startLine: 1, startCol: 1, endLine: 1, endCol: 2, severity: 'error', message: 'Invalid XML syntax' });
    return out;
  }
  if (extOf(path) !== 'xml' || !/(^|\/)(res|AndroidManifest)/.test(path)) return out;
  const clean = text.replace(/<!--[\s\S]*?-->/g, (s) => s.replace(/[^\n]/g, ' '));
  const isLayout = /\/res\/layout/.test(path);
  for (const m of clean.matchAll(/<([A-Za-z][\w.]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*\/?>/g)) {
    const name = m[1], nameOff = m.index + 1;
    if (isLayout && /^[A-Z]|\./.test(name) && !/^(include|merge)$/.test(name)) {
      for (const a of ['layout_width', 'layout_height']) if (!m[2].includes('android:' + a + '=')) {
        const p = lineCol(text, nameOff), q = lineCol(text, nameOff + name.length);
        out.push({ startLine: p.line, startCol: p.col, endLine: q.line, endCol: q.col, severity: 'error', message: `Missing android:${a}` });
      }
    }
    for (const a of m[2].matchAll(/="@(string|color|drawable|mipmap|dimen|layout|style|id)\/([\w.]+)"/g)) {
      const t = a[1], n = a[2].replace(/\./g, '_');
      if (CUR.res[t] && !CUR.res[t].includes(n)) {
        const off = m.index + m[0].indexOf(a[0]) + 2, p = lineCol(text, off), q = lineCol(text, off + a[0].length - 3);
        out.push({ startLine: p.line, startCol: p.col, endLine: q.line, endCol: q.col, severity: 'error', message: `Resource not found: @${t}/${a[2]}` });
      }
    }
  }
  return out;
}

// ---------- Preview: Vector -> SVG, Layout -> phone frame ----------
const dpv = (v) => { const m = String(v ?? '').match(/^(-?[\d.]+)(dp|dip|sp|px)?$/); return m ? +m[1] : null; };
const COLORS = { white: '#FFFFFF', black: '#000000', transparent: 'transparent', holo_blue_light: '#33B5E5', darker_gray: '#AAAAAA', holo_red_light: '#FF4444', holo_green_light: '#99CC00' };
function cssColor(v, res, depth = 0) {
  if (!v || depth > 3) return null; v = v.trim();
  if (v[0] === '#') { const h = v.slice(1); if (h.length === 8) return '#' + h.slice(2) + h.slice(0, 2); if (h.length === 4) return '#' + h.slice(1) + h[0]; return v; }
  let m = v.match(/^@color\/([\w.]+)/); if (m) return cssColor(res.colors?.[m[1]], res, depth + 1);
  m = v.match(/^@android:color\/(\w+)/); return m ? (COLORS[m[1]] || null) : null;
}
function vectorToSvg(text, res) {
  const doc = new DOMParser().parseFromString(text, 'application/xml'), root = doc.documentElement;
  if (!root || root.tagName !== 'vector') return null;
  const A = (e, n) => e.getAttribute('android:' + n);
  const vw = +A(root, 'viewportWidth') || 24, vh = +A(root, 'viewportHeight') || 24, w = dpv(A(root, 'width')) || vw, h = dpv(A(root, 'height')) || vh;
  const walk = (el) => [...el.children].map((c) => {
    if (c.tagName === 'path') {
      const d = A(c, 'pathData'); if (!d) return '';
      const f = cssColor(A(c, 'fillColor'), res), s = cssColor(A(c, 'strokeColor'), res);
      return `<path d="${d}" fill="${f || 'none'}" ${s ? `stroke="${s}" stroke-width="${A(c, 'strokeWidth') || 1}"` : ''} ${A(c, 'fillAlpha') ? `fill-opacity="${A(c, 'fillAlpha')}"` : ''} ${A(c, 'fillType') === 'evenOdd' ? 'fill-rule="evenodd"' : ''}/>`;
    }
    if (c.tagName === 'group') {
      const g = (n, d = 0) => +A(c, n) || d, px = g('pivotX'), py = g('pivotY');
      return `<g transform="translate(${g('translateX')} ${g('translateY')}) translate(${px} ${py}) rotate(${g('rotation')}) scale(${A(c, 'scaleX') ?? 1} ${A(c, 'scaleY') ?? 1}) translate(${-px} ${-py})">${walk(c).join('')}</g>`;
    }
    return '';
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${w * 3}" height="${h * 3}">${walk(root).join('')}</svg>`;
}

function renderLayout(text, res) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror') || !doc.documentElement) return '<div class="pv-note">The XML has errors — fix them first</div>';
  const A = (e, n) => e.getAttribute('android:' + n), X = (e, n) => e.getAttribute(n);
  const str = (v) => { const m = String(v ?? '').match(/^@string\/([\w.]+)/); return m ? (res.strings?.[m[1]] ?? m[1]) : (v ?? ''); };
  const size = (v, main, weighted) => weighted && main ? '0' : /match_parent|fill_parent/.test(v) ? '100%' : dpv(v) ? dpv(v) + 'px' : 'auto';
  const box = (e, parent) => {
    const tag = e.tagName.split('.').pop(), s = [], pOri = parent?.tagName === 'LinearLayout' ? (A(parent, 'orientation') === 'vertical' ? 'v' : 'h') : null;
    const wt = A(e, 'layout_weight'), pAbs = parent && !pOri;
    const w = A(e, 'layout_width'), h = A(e, 'layout_height');
    s.push(`width:${size(w, pOri === 'h', wt)}`, `height:${size(h, pOri === 'v', wt)}`);
    if (wt) s.push(`flex:${wt} 1 0`); else s.push('flex:none');
    if (pOri && /match_parent/.test(pOri === 'v' ? w : h)) s.push('align-self:stretch');
    for (const [k, c] of [['', 'margin'], ['Top', 'margin-top'], ['Bottom', 'margin-bottom'], ['Start', 'margin-left'], ['End', 'margin-right'], ['Left', 'margin-left'], ['Right', 'margin-right']]) { const v = dpv(A(e, 'layout_margin' + k)); if (v != null) s.push(`${c}:${v}px`); }
    for (const [k, c] of [['', 'padding'], ['Top', 'padding-top'], ['Bottom', 'padding-bottom'], ['Start', 'padding-left'], ['End', 'padding-right'], ['Left', 'padding-left'], ['Right', 'padding-right']]) { const v = dpv(A(e, 'padding' + k)); if (v != null) s.push(`${c}:${v}px`); }
    const bg = cssColor(A(e, 'background'), res); if (bg) s.push(`background:${bg}`);
    const lg = A(e, 'layout_gravity') || ''; if (pOri) { if (/center/.test(lg) || /center_horizontal/.test(lg)) s.push(pOri === 'v' ? 'align-self:center' : 'align-self:center'); if (/end|right/.test(lg)) s.push('align-self:flex-end'); }
    if (pAbs) { // approximate placement for ConstraintLayout / RelativeLayout / FrameLayout
      const g = (n) => X(e, n), t = (n) => A(e, n) === 'true';
      const L = g('app:layout_constraintStart_toStartOf') || g('app:layout_constraintLeft_toLeftOf') || t('layout_alignParentStart') || t('layout_alignParentLeft');
      const Rr = g('app:layout_constraintEnd_toEndOf') || g('app:layout_constraintRight_toRightOf') || t('layout_alignParentEnd') || t('layout_alignParentRight');
      const T = g('app:layout_constraintTop_toTopOf') || t('layout_alignParentTop'), B = g('app:layout_constraintBottom_toBottomOf') || t('layout_alignParentBottom');
      const cH = (L && Rr) || t('layout_centerHorizontal') || t('layout_centerInParent') || /center_horizontal|^center$/.test(lg), cV = (T && B) || t('layout_centerVertical') || t('layout_centerInParent') || /center_vertical|^center$/.test(lg);
      const tr = []; s.push('position:absolute');
      if (cH) { s.push('left:50%'); tr.push('translateX(-50%)'); } else if (Rr && !L) s.push('right:0'); else s.push('left:0');
      if (cV) { s.push('top:50%'); tr.push('translateY(-50%)'); } else if (B && !T) s.push('bottom:0'); else s.push('top:0');
      if (tr.length) s.push(`transform:${tr.join(' ')}`);
    }
    const fs = dpv(A(e, 'textSize')), tc = cssColor(A(e, 'textColor'), res), st = A(e, 'textStyle') || '';
    const txt = str(A(e, 'text')), hint = str(A(e, 'hint'));
    if (fs) s.push(`font-size:${fs}px`); if (tc) s.push(`color:${tc}`); if (/bold/.test(st)) s.push('font-weight:bold');
    const grav = A(e, 'gravity') || '';
    const kids = () => [...e.children].map((c) => box(c, e)).join('');
    const ph = (inner, css = '') => `<div class="av ${tag}" style="${s.join(';')};${css}">${inner}</div>`;
    if (/^(LinearLayout)$/.test(tag)) { const v = A(e, 'orientation') === 'vertical'; return ph(kids(), `display:flex;flex-direction:${v ? 'column' : 'row'};${/center/.test(grav) ? 'justify-content:center;align-items:center' : /center_horizontal/.test(grav) && v ? 'align-items:center' : ''}`); }
    if (/Layout$|^ViewGroup$|^Toolbar$/.test(tag) && tag !== 'Toolbar') return ph(kids(), 'position:relative' + (/match_parent/.test(w) ? '' : ''));
    if (tag === 'ScrollView' || tag === 'HorizontalScrollView' || tag === 'NestedScrollView') return ph(kids(), 'display:flex;flex-direction:column;overflow:auto');
    if (tag === 'Button' || tag === 'MaterialButton' || tag === 'AppCompatButton') return ph(txt, 'background:#6200ee;color:#fff;border-radius:4px;padding:8px 16px;text-transform:uppercase;text-align:center;font-weight:500;min-height:40px;display:flex;align-items:center;justify-content:center;font-size:14px;' + (bg ? `background:${bg};` : ''));
    if (tag === 'EditText' || tag === 'TextInputEditText') return ph(txt || `<span style="color:#888">${esc(hint)}</span>`, 'border-bottom:2px solid #888;padding:8px 4px;color:#222;min-width:120px');
    if (tag === 'ImageView' || tag === 'ImageButton' || tag === 'FloatingActionButton') return ph('🖼', 'background:linear-gradient(135deg,#ddd,#bbb);display:flex;align-items:center;justify-content:center;min-width:48px;min-height:48px;border-radius:' + (tag === 'FloatingActionButton' ? '50%' : '2px'));
    if (/^(CheckBox|RadioButton|Switch|SwitchCompat|ToggleButton)$/.test(tag)) return ph(`<span class="ck ${tag === 'RadioButton' ? 'rd' : ''}"></span>${esc(txt)}`, 'display:flex;align-items:center;gap:8px');
    if (tag === 'ProgressBar') return ph('', 'width:36px;height:36px;border:4px solid #ddd;border-top-color:#6200ee;border-radius:50%');
    if (tag === 'SeekBar') return ph('<div style="height:4px;background:#bbb;margin:10px 0;position:relative"><i style="position:absolute;left:40%;top:-6px;width:16px;height:16px;border-radius:50%;background:#6200ee"></i></div>', 'min-width:160px');
    if (tag === 'Toolbar' || tag === 'MaterialToolbar') return ph(`<b>${esc(txt || 'Title')}</b>`, 'background:#6200ee;color:#fff;padding:0 16px;min-height:56px;display:flex;align-items:center');
    if (/RecyclerView|ListView|GridView/.test(tag)) return ph([1, 2, 3, 4].map((i) => `<div style="padding:14px;border-bottom:1px solid #ddd">Item ${i}</div>`).join(''), 'overflow:hidden;background:#fafafa');
    if (tag === 'View' || tag === 'Space') return ph('', 'min-height:1px;min-width:1px');
    if (tag === 'TextView' || tag === 'AppCompatTextView') return ph(esc(txt), 'font-size:' + (fs || 14) + 'px;line-height:1.3');
    return ph(`<small style="color:#888">&lt;${esc(tag)}&gt;</small>` + kids(), 'border:1px dashed #aaa;padding:4px;position:relative');
  };
  return `<div class="phone"><div class="stb">12:30 &nbsp; ▾ ▮</div><div class="scr">${box(doc.documentElement, null)}</div><div class="nav">◀ &nbsp; ● &nbsp; ■</div></div>`;
}


// ---------- Basic code formatters (Reformat Code: Ctrl+Alt+L) ----------
function formatBraces(text) {
  const out = []; let depth = 0, paren = 0, inBlock = false;
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const t = raw.trim(); if (!t) { out.push(''); continue; }
    if (inBlock) { out.push(' '.repeat(depth * 4 + 1) + (t.startsWith('*') ? t : '* ' + t)); if (t.includes('*/')) inBlock = false; continue; }
    let c = t.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""').replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '');
    const startsBlock = /\/\*/.test(c); if (startsBlock) c = c.slice(0, c.indexOf('/*'));
    const braceLead = (c.match(/^\}+/) || [''])[0].length;
    const cont = paren > 0 && !/^\)/.test(c) ? 2 : 0;
    out.push(' '.repeat(Math.max(0, depth - braceLead + cont) * 4) + t);
    depth = Math.max(0, depth + (c.match(/[{]/g) || []).length - (c.match(/[}]/g) || []).length);
    paren = Math.max(0, paren + (c.match(/[(]/g) || []).length - (c.match(/[)]/g) || []).length);
    if (startsBlock && !/\*\//.test(t.slice(t.indexOf('/*')))) inBlock = true;
  }
  return out.join('\n');
}
function formatXml(text) {
  const tokens = text.replace(/\r\n/g, '\n').match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[A-Za-z_][^>]*?>|[^<]+/g) || [];
  const lines = [], I = (d) => '    '.repeat(Math.max(0, d)); let depth = 0, i = 0;
  const openLines = (tag, d) => {
    const m = tag.match(/^<([\w:.-]+)([\s\S]*?)(\/?)>$/); if (!m) return [I(d) + tag.trim()];
    const attrs = [...m[2].matchAll(/([\w:.-]+)\s*=\s*("[^"]*"|'[^']*')/g)].map((x) => `${x[1]}=${x[2]}`), end = m[3] ? ' />' : '>';
    if (attrs.length <= 1) return [I(d) + '<' + m[1] + (attrs[0] ? ' ' + attrs[0] : '') + end];
    return [I(d) + '<' + m[1], ...attrs.map((a, k) => I(d + 1) + a + (k === attrs.length - 1 ? end : ''))];
  };
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^\s+$/.test(t)) { i++; continue; }
    if (/^<(!--|\?|!\[)/.test(t)) { lines.push(I(depth) + t.trim()); i++; continue; }
    if (t.startsWith('</')) { depth--; lines.push(I(depth) + t.trim()); i++; continue; }
    if (t.startsWith('<')) {
      const self = /\/>$/.test(t), nx = tokens[i + 1], cl = tokens[i + 2];
      if (!self && nx && !nx.startsWith('<') && cl && cl.startsWith('</') && !/\n/.test(nx.trim())) { lines.push(I(depth) + t.trim() + nx.trim() + cl.trim()); i += 3; continue; }
      lines.push(...openLines(t, depth)); if (!self) depth++; i++; continue;
    }
    lines.push(I(depth) + t.trim()); i++;
  }
  return lines.join('\n') + '\n';
}

// ---------- Monaco language features (registered once) ----------
const memberItem = (m, range, K) => {
  const mm = m.match(/^([\w.]+)\((.*?)\)(\.\w+\(\))?$/);
  if (!mm) return { label: m, kind: K.Field, insertText: m, range, detail: 'constant' };
  const params = mm[2] ? mm[2].split(/,(?![^<]*>)/).map((p) => p.trim()) : [];
  const names = params.map((p, i) => `\${${i + 1}:${p.split(/\s+/).pop().replace(/[^\w]/g, '') || 'arg'}}`);
  return { label: mm[1] + '(' + (params.length ? '…' : '') + ')' + (mm[3] || ''), filterText: mm[1], sortText: mm[1], kind: K.Method, detail: m, insertText: `${mm[1]}(${names.join(', ')})${mm[3] || ''}`, insertTextRules: 4, range };
};
function typeOfVar(text, name) {
  const re = new RegExp(`\\b([A-Z]\\w*(?:\\.[A-Z]\\w*)?)(?:<[^;=()]*?>)?(?:\\[\\])?\\s+${name}\\s*(?:=|;|,|\\))`);
  const m = text.match(re); if (m) return m[1];
  const n = text.match(new RegExp(`\\b${name}\\s*=\\s*new\\s+([A-Z]\\w*)`)); return n ? n[1] : null;
}
function membersOf(type) { const out = []; for (let t = type, i = 0; t && i < 6; t = INDEX.inherit[t], i++) out.push(...(INDEX.members[t] || [])); return out; }
function registerFeatures() {
  if (FEATURES) return; FEATURES = true;
  const K = monaco.languages.CompletionItemKind;
  for (const lang of ['java', 'kotlin']) monaco.languages.registerDocumentFormattingEditProvider(lang, { provideDocumentFormattingEdits: (m) => [{ range: m.getFullModelRange(), text: formatBraces(m.getValue()) }] });
  monaco.languages.registerDocumentFormattingEditProvider('xml', { provideDocumentFormattingEdits: (m) => [{ range: m.getFullModelRange(), text: formatXml(m.getValue()) }] });
  monaco.languages.registerCompletionItemProvider('java', {
    triggerCharacters: ['.'],
    provideCompletionItems(model, pos) {
      if (!INDEX) return { suggestions: [] };
      const line = model.getLineContent(pos.lineNumber).slice(0, pos.column - 1), w = model.getWordUntilPosition(pos);
      const range = { startLineNumber: pos.lineNumber, endLineNumber: pos.lineNumber, startColumn: w.startColumn, endColumn: w.endColumn };
      let m;
      if ((m = line.match(/\bR\.(\w+)\.(\w*)$/))) return { suggestions: (CUR.res[m[1]] || []).map((n) => ({ label: n, kind: K.Variable, insertText: n, range, detail: `R.${m[1]}` })) };
      if (/\bR\.(\w*)$/.test(line)) return { suggestions: ['layout', 'id', 'string', 'drawable', 'color', 'dimen', 'style', 'mipmap', 'menu'].map((n) => ({ label: n, kind: K.Module, insertText: n, range })) };
      if ((m = line.match(/^\s*import\s+(?:static\s+)?([\w.]*)$/))) {
        const r2 = { ...range, startColumn: pos.column - m[1].length };
        return { suggestions: Object.entries(INDEX.classes).flatMap(([c, ps]) => ps.map((p) => ({ label: `${p}.${c}`, kind: K.Class, insertText: `${p}.${c};`, range: r2 }))) };
      }
      if ((m = line.match(/([A-Za-z_]\w*)\.(\w*)$/))) {
        const name = m[1], text = model.getValue(); let items = [];
        if (name === 'this') { const ex = text.match(/class\s+\w+\s+extends\s+(\w+)/); items = membersOf(ex ? ex[1] : 'Activity'); }
        else if (INDEX.statics[name] && /^[A-Z]/.test(name)) items = INDEX.statics[name];
        else { const t = typeOfVar(text, name); if (t) items = membersOf(t.split('.')[0] === 'SharedPreferences' && t.includes('.') ? t : t.split('.')[0]); }
        return { suggestions: items.map((x) => memberItem(x, range, K)) };
      }
      // general: classes (with auto-import), snippets
      const text = model.getValue(), imps = [...text.matchAll(/^import\s+([\w.]+?)(\.\*)?;/gm)].map((x) => [x[1], !!x[2]]);
      const pkg = (text.match(/^package\s+([\w.]+);/m) || [])[1];
      const have = (c, p) => imps.some(([i, wl]) => wl ? i === p : i === `${p}.${c}`);
      const sug = [];
      for (const [c, ps] of Object.entries(INDEX.classes)) for (const p of ps) {
        const item = { label: c, kind: K.Class, detail: p, insertText: c, range, sortText: '1' + c };
        if (!have(c, p) && p !== pkg) {
          const lines = text.split('\n'); let at = 0; lines.forEach((l, i) => { if (/^import\s/.test(l)) at = i + 1; });
          const edit = at ? { range: { startLineNumber: at + 1, startColumn: 1, endLineNumber: at + 1, endColumn: 1 }, text: `import ${p}.${c};\n` }
            : { range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: (pkg ? '' : '') + `import ${p}.${c};\n` };
          if (!at && pkg) { const pl = lines.findIndex((l) => /^package\s/.test(l)) + 1; edit.range = { startLineNumber: pl + 1, startColumn: 1, endLineNumber: pl + 1, endColumn: 1 }; edit.text = `\nimport ${p}.${c};\n`; }
          item.additionalTextEdits = [edit]; item.detail = `${p}  (auto-import)`;
        }
        sug.push(item);
      }
      for (const [label, doc, body] of INDEX.snippets) sug.push({ label, kind: K.Snippet, detail: doc, documentation: { value: '```java\n' + body.replace(/\$\{\d:?([^}]*)\}|\$0/g, '$1') + '\n```' }, insertText: body, insertTextRules: 4, range, sortText: '0' + label });
      return { suggestions: sug };
    },
  });
  monaco.languages.registerCompletionItemProvider('xml', {
    triggerCharacters: ['<', ' ', '"', ':', '@', '/', '+'],
    provideCompletionItems(model, pos) {
      if (!INDEX) return { suggestions: [] };
      const before = model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: pos.lineNumber, endColumn: pos.column });
      const lt = before.lastIndexOf('<'), gt = before.lastIndexOf('>'), inTag = lt > gt, tail = before.slice(lt);
      const R = (len) => ({ startLineNumber: pos.lineNumber, endLineNumber: pos.lineNumber, startColumn: pos.column - len, endColumn: pos.column });
      let m;
      if (inTag && (m = tail.match(/([\w:.-]+)="([^"]*)$/))) { // attribute value
        const [, attr, val] = m, out = [];
        let rm = val.match(/^@\+?(\w+)\/([\w.]*)$/);
        if (rm && !(rm[1] === 'id' && attr === 'android:id')) { const t = rm[1]; out.push(...(CUR.res[t] || []).map((n) => ({ label: `@${t}/${n}`, kind: K.Reference, insertText: `@${t}/${n}`, range: R(val.length) }))); return { suggestions: out }; }
        if (/^@\w*$/.test(val)) return { suggestions: ['string', 'color', 'drawable', 'mipmap', 'dimen', 'style', 'id', 'layout'].map((t) => ({ label: `@${t}/`, kind: K.Folder, insertText: `@${t}/`, range: R(val.length), command: { id: 'editor.action.triggerSuggest' } })) };
        return { suggestions: (INDEX.xml.attrs[attr] || []).map((v) => ({ label: v, kind: K.Value, insertText: v, range: R(val.length) })) };
      }
      if (inTag && /\s[\w:.-]*$/.test(tail)) { // attribute name
        const pm = tail.match(/([\w:.-]*)$/)[1];
        return { suggestions: Object.entries(INDEX.xml.attrs).map(([a, vals]) => ({ label: a, kind: K.Property, insertText: vals.length > 1 ? `${a}="\${1|${vals.join(',')}|}"` : `${a}="\${1:${vals[0] || ''}}"`, insertTextRules: 4, range: R(pm.length), detail: vals.slice(0, 3).join(' | ') })) };
      }
      if ((m = tail.match(/^<([\w.]*)$/))) {
        const layouts = /(Layout|ScrollView)$/;
        return { suggestions: INDEX.xml.tags.map((t) => {
          const leaf = !layouts.test(t) && t !== 'merge';
          return { label: t, kind: K.Class, range: R(m[1].length), insertTextRules: 4,
            insertText: t === 'include' ? 'include layout="@layout/${1}" />' : leaf ? `${t}\n\tandroid:layout_width="\${1:wrap_content}"\n\tandroid:layout_height="\${2:wrap_content}"\n\tandroid:text="\${3}" />` : `${t}\n\tandroid:layout_width="\${1:match_parent}"\n\tandroid:layout_height="\${2:match_parent}">\n\t$0\n</${t}>` };
        }) };
      }
      return { suggestions: [] };
    },
  });
  monaco.languages.registerCodeActionProvider('java', {
    provideCodeActions(model, range, ctx) {
      const actions = [];
      for (const mk of ctx.markers) {
        const code = typeof mk.code === 'string' ? mk.code : mk.code?.value || '';
        if (code.startsWith('import:')) for (const fqn of code.slice(7).split('|')) {
          const lines = model.getLinesContent(); let at = 0; lines.forEach((l, i) => { if (/^import\s/.test(l)) at = i + 1; });
          let edit;
          if (at) edit = { range: { startLineNumber: at + 1, startColumn: 1, endLineNumber: at + 1, endColumn: 1 }, text: `import ${fqn};\n` };
          else { const pl = lines.findIndex((l) => /^package\s/.test(l)) + 1; edit = pl ? { range: { startLineNumber: pl + 1, startColumn: 1, endLineNumber: pl + 1, endColumn: 1 }, text: `\nimport ${fqn};\n` } : { range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: `import ${fqn};\n\n` }; }
          actions.push({ title: `Import '${fqn}'`, kind: 'quickfix', diagnostics: [mk], isPreferred: true, edit: { edits: [{ resource: model.uri, textEdit: edit, versionId: undefined }] } });
        }
        if (code === 'unused-import') actions.push({ title: 'Remove unused import', kind: 'quickfix', diagnostics: [mk], edit: { edits: [{ resource: model.uri, textEdit: { range: { startLineNumber: mk.startLineNumber, startColumn: 1, endLineNumber: mk.startLineNumber + 1, endColumn: 1 }, text: '' }, versionId: undefined }] } });
      }
      return { actions, dispose() {} };
    },
  });
}

// ---------- Monaco themes: Darcula / IntelliJ Light ----------
let THEMES = false;
function defineThemes() {
  if (THEMES) return; THEMES = true;
  monaco.editor.defineTheme('darcula', { base: 'vs-dark', inherit: true,
    rules: [{ token: 'keyword', foreground: 'CC7832' }, { token: 'string', foreground: '6A8759' }, { token: 'number', foreground: '6897BB' }, { token: 'comment', foreground: '808080', fontStyle: 'italic' }, { token: 'tag', foreground: 'E8BF6A' }, { token: 'attribute.name', foreground: 'BABABA' }, { token: 'attribute.value', foreground: 'A5C261' }, { token: 'delimiter', foreground: 'A9B7C6' }, { token: 'type.identifier', foreground: 'A9B7C6' }, { token: 'metatag', foreground: 'BBB529' }],
    colors: { 'editor.background': '#2B2B2B', 'editor.foreground': '#A9B7C6', 'editorLineNumber.foreground': '#606366', 'editorLineNumber.activeForeground': '#A4A3A3', 'editor.lineHighlightBackground': '#323232', 'editorCursor.foreground': '#BBBBBB', 'editor.selectionBackground': '#214283', 'editorGutter.background': '#313335', 'editorIndentGuide.background1': '#393939', 'editorWidget.background': '#3C3F41', 'editorSuggestWidget.background': '#3C3F41', 'editorSuggestWidget.selectedBackground': '#0D293E', 'editorSuggestWidget.border': '#555555', 'scrollbarSlider.background': '#5A5D5F55' } });
  monaco.editor.defineTheme('intellij-light', { base: 'vs', inherit: true,
    rules: [{ token: 'keyword', foreground: '0033B3' }, { token: 'string', foreground: '067D17' }, { token: 'number', foreground: '1750EB' }, { token: 'comment', foreground: '8C8C8C', fontStyle: 'italic' }, { token: 'tag', foreground: '0033B3' }, { token: 'attribute.name', foreground: '174AD4' }, { token: 'attribute.value', foreground: '067D17' }, { token: 'metatag', foreground: '9E880D' }],
    colors: { 'editor.background': '#FFFFFF', 'editor.foreground': '#080808', 'editorLineNumber.foreground': '#999999', 'editor.lineHighlightBackground': '#FCFAED', 'editorGutter.background': '#F0F0F0', 'editor.selectionBackground': '#A6D2FF' } });
}
const monacoTheme = () => Theme.get() === 'light' ? 'intellij-light' : 'darcula';
const LANGS = { kt: 'kotlin', kts: 'kotlin', java: 'java', xml: 'xml', svg: 'xml', gradle: 'groovy', json: 'json', yml: 'yaml', yaml: 'yaml', md: 'markdown', properties: 'ini', js: 'javascript', html: 'html' };

// ---------- CodeEditor: multi-tab ----------
function CodeEditor({ ed, onOpen }) {
  const pending = new Map(); const DEF_SET = { fontSize: 13, wordWrap: false, minimap: false, tabSize: 4 };
  let SET = { ...DEF_SET, ...JSON.parse(localStorage.getItem('editor-settings') || '{}') }, hist = [], hi = -1, recent = [], navigating = false;
  let base = null, files = [], tabs = [], active = null, editor, lintTimer, pvTimer, seq = 0, markers = [], emptyModel;
  const subs = {}; const on = (n, f) => (subs[n] ||= []).push(f); const emit = (n, ...a) => (subs[n] || []).forEach((f) => f(...a));
  ed.classList.add('ed');
  ed.innerHTML = `<div class="tabbar"></div><div class="crumbs"></div><div class="edrow"><div class="mon"></div><div class="pv" hidden></div><div class="msg"></div><div class="insp" hidden></div></div>`;
  const $m = (s) => ed.querySelector(s), tabbar = $m('.tabbar'), crumbs = $m('.crumbs'), mon = $m('.mon'), pv = $m('.pv'), msg = $m('.msg'), insp = $m('.insp');
  const HINTS = `<div class="hints"><div>Search Everywhere &nbsp;<b>Double Shift</b></div><div>Project View &nbsp;<kbd>Alt</kbd>+<kbd>1</kbd></div><div>Save All &nbsp;<kbd>Ctrl</kbd>+<kbd>S</kbd></div><div>Build &amp; Run &nbsp;<kbd>Shift</kbd>+<kbd>F10</kbd></div><div>Quick Fix &nbsp;<kbd>Alt</kbd>+<kbd>Enter</kbd></div><div>Suggestions &nbsp;<kbd>Ctrl</kbd>+<kbd>Space</kbd></div></div>`;

  const ready = Promise.all([loadMonaco(), api('/api/android-index').then((i) => INDEX = i)]).then(() => {
    registerFeatures(); defineThemes();
    emptyModel = monaco.editor.createModel('', 'plaintext');
    editor = monaco.editor.create(mon, { model: emptyModel, theme: monacoTheme(), automaticLayout: true, fontSize: SET.fontSize, lineHeight: Math.round(SET.fontSize * 1.55), wordWrap: SET.wordWrap ? 'on' : 'off', fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace", minimap: { enabled: SET.minimap }, scrollBeyondLastLine: false, smoothScrolling: true, cursorBlinking: 'smooth', quickSuggestions: { other: true, comments: false, strings: true }, suggestOnTriggerCharacters: true, tabSize: SET.tabSize, bracketPairColorization: { enabled: true }, lightbulb: { enabled: true }, renderLineHighlight: 'all', padding: { top: 4 } });
    editor.onDidChangeCursorPosition((e) => emit('pos', e.position.lineNumber, e.position.column));
    editor.onMouseDown((e) => { if ((e.event.ctrlKey || e.event.metaKey) && e.event.leftButton && e.target.position) { e.event.preventDefault(); E.goToDeclaration(e.target.position); } }); // Ctrl+Click
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => E.saveAll());
    window.addEventListener('themechange', () => monaco.editor.setTheme(monacoTheme()));
    showEmpty();
  });

  // ---- UI ----
  function renderTabs() {
    tabbar.innerHTML = tabs.map((t) => `<div class="tab ${t === active ? 'on' : ''}" data-p="${esc(t.path)}" title="${esc(t.path)}">${fileIcon(t.path)}<span>${esc(t.path.split('/').pop())}</span>${t.dirty ? '<span class="dot">●</span>' : ''}<span class="x" data-x="1">×</span></div>`).join('');
    emit('tabs', tabs);
  }
  tabbar.addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (!t) return; const p = t.dataset.p; if (e.target.dataset.x) E.close(p); else E.open(p); });
  tabbar.addEventListener('auxclick', (e) => { const t = e.target.closest('.tab'); if (t && e.button === 1) E.close(t.dataset.p); });
  const renderCrumbs = () => { crumbs.innerHTML = active ? active.path.split('/').map((x, i, a) => i === a.length - 1 ? `<b>${esc(x)}</b>` : esc(x)).join(' <span class="mu">›</span> ') : ''; crumbs.style.display = active ? '' : 'none'; };
  function showEmpty() { active = null; editor.setModel(emptyModel); mon.style.visibility = 'hidden'; pv.hidden = true; msg.hidden = false; msg.innerHTML = HINTS; markers = []; setMarkers(); renderTabs(); renderCrumbs(); emit('active', null); }
  function setMarkers() {
    const er = markers.filter((m) => m.severity === 'error').length, wn = markers.filter((m) => m.severity === 'warning').length;
    insp.hidden = !active || active.kind !== 'code';
    insp.innerHTML = er || wn ? `${er ? `<span class="er">✖ ${er}</span>` : ''}${wn ? `<span class="wn">⚠ ${wn}</span>` : ''}` : '<span class="ok">✔</span>';
    emit('markers', markers, active?.path);
  }

  // ---- live lint ----
  const SEVN = { error: 8, warning: 4, hint: 1 };
  function schedule() { clearTimeout(lintTimer); clearTimeout(pvTimer); lintTimer = setTimeout(lint, 450); pvTimer = setTimeout(preview, 250); }
  async function lint() {
    const t = active; if (!t || t.kind !== 'code') return; const my = ++seq, ext = extOf(t.path), text = t.model.getValue(); let ms = [];
    try { if (ext === 'java') ms = await api(base + '/lint', 'POST', { path: t.path, content: text }); else if (ext === 'xml' || ext === 'svg') ms = lintXml(text, t.path); } catch { return; }
    if (my !== seq || active !== t) return;
    markers = ms; monaco.editor.setModelMarkers(t.model, 'android', ms.map((m) => ({ startLineNumber: m.startLine, startColumn: m.startCol, endLineNumber: m.endLine, endColumn: m.endCol, message: m.message, severity: SEVN[m.severity], code: m.code, tags: m.unnecessary ? [1] : undefined, source: ext === 'java' ? 'javac-lite' : 'xml' })));
    setMarkers();
  }
  async function preview() {
    const t = active; if (!t || t.kind !== 'code') return pv.hidden = true;
    const ext = extOf(t.path), text = t.model.getValue(); let html = null;
    if (ext === 'svg') html = `<div class="chk"><img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}"></div>`;
    else if (ext === 'xml' && /<vector[\s>]/.test(text)) { const s = vectorToSvg(text, CUR.res); if (s) html = `<div class="chk"><img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}"></div>`; }
    else if (ext === 'xml' && /\/res\/layout/.test(t.path)) html = renderLayout(text, CUR.res);
    if (html == null) { pv.hidden = true; return; }
    pv.hidden = false; pv.innerHTML = `<div class="pvh">👁 Preview</div>` + html;
    const ph = pv.querySelector('.phone'); if (ph) { const sc = Math.min(1, (pv.clientWidth - 24) / 360); ph.style.transform = `scale(${sc})`; ph.style.transformOrigin = 'top left'; ph.parentElement.style.height = 640 * sc + 40 + 'px'; }
  }

  // ---- tabs ----
  function activate(t) {
    if (active?.kind === 'code' && active.model) active.view = editor.saveViewState();
    active = t; markers = []; renderTabs(); renderCrumbs();
    recent = [t.path, ...recent.filter((x) => x !== t.path)].slice(0, 30);
    if (!navigating) { hist = hist.slice(0, hi + 1); if (hist[hist.length - 1] !== t.path) hist.push(t.path); hi = hist.length - 1; }
    if (t.kind === 'code') {
      msg.hidden = true; mon.style.visibility = 'visible'; editor.setModel(t.model); if (t.view) editor.restoreViewState(t.view); editor.focus(); setMarkers(); lint(); preview();
    } else if (t.kind === 'image') {
      mon.style.visibility = 'hidden'; pv.hidden = true; msg.hidden = false; setMarkers();
      const url = `${base}/raw?path=${encodeURIComponent(t.path)}&t=${TOKEN}&_=${Date.now()}`;
      msg.innerHTML = `<div class="imgv"><div class="chk"><img id="iv" src="${url}"></div><div class="mu" id="ivi">Loading…</div><div class="row" style="justify-content:center"><button class="s" id="ivr">⬆ Replace image</button></div></div>`;
      msg.querySelector('#iv').onload = (e) => msg.querySelector('#ivi').textContent = `${t.path.split('/').pop()} · ${e.target.naturalWidth}×${e.target.naturalHeight}px`;
      msg.querySelector('#ivr').onclick = () => E.upload(null, t.path);
    } else { mon.style.visibility = 'hidden'; pv.hidden = true; msg.hidden = false; msg.innerHTML = '<div class="mu">Binary file — cannot be edited</div>'; setMarkers(); }
    emit('active', t.path); onOpen?.(t.path);
  }
  async function saveTab(t) { if (t.kind !== 'code' || !t.dirty) return; await api(base + '/file', 'PUT', { path: t.path, content: t.model.getValue() }); t.dirty = false; renderTabs(); }

  const E = {
    on, get files() { return files; }, get tabs() { return tabs; }, get activePath() { return active?.path || null; }, get dirtyAny() { return tabs.some((t) => t.dirty); }, get base() { return base; }, get editor() { return editor; },
    async setBase(b) {
      await ready;
      if (E.dirtyAny) { const r = await ask3('Unsaved Changes', 'There are unsaved files. Save them all?'); if (r === 'cancel') return false; if (r === 'save') await E.saveAll(); }
      tabs.forEach((t) => t.model?.dispose()); tabs = []; base = b; CUR.base = b; showEmpty();
      if (!b) { files = []; CUR.res = {}; emit('files', files); return true; }
      await E.reload(); return true;
    },
    async reload() { if (!base) return; [files, CUR.res] = await Promise.all([api(base + '/files'), api(base + '/resources').catch(() => ({}))]); emit('files', files); },
    open(p) { // avoid opening the same file twice concurrently
      if (pending.has(p)) return pending.get(p);
      const pr = E._open(p).finally(() => pending.delete(p)); pending.set(p, pr); return pr;
    },
    async _open(p) {
      await ready; let t = tabs.find((x) => x.path === p);
      if (!t) {
        const ext = extOf(p); t = { path: p, dirty: false, kind: 'code', model: null, view: null };
        if (IMG_EXT.includes(ext)) t.kind = 'image';
        else { const d = await api(base + '/file?path=' + encodeURIComponent(p)); if (d.binary) t.kind = 'binary'; else { t.model = monaco.editor.createModel(d.content, LANGS[ext] || 'plaintext', monaco.Uri.parse('file:///' + p)); t.model.onDidChangeContent(() => { if (!t.dirty) { t.dirty = true; renderTabs(); } if (active === t) schedule(); }); } }
        tabs.push(t);
      }
      activate(t);
    },
    async close(p) {
      const t = tabs.find((x) => x.path === p); if (!t) return true;
      if (t.dirty) { const r = await ask3('Save Changes?', `"${p.split('/').pop()}" has unsaved changes.`); if (r === 'cancel') return false; if (r === 'save') await saveTab(t); }
      const i = tabs.indexOf(t); tabs.splice(i, 1); t.model?.dispose();
      if (active === t) { const n = tabs[i] || tabs[i - 1]; if (n) activate(n); else showEmpty(); } else renderTabs();
      return true;
    },
    async save() { if (active) { await saveTab(active); toast('✅ Saved'); E.reload(); } },
    async saveAll() { const d = tabs.filter((t) => t.dirty); if (!d.length) return; for (const t of d) await saveTab(t); toast(`✅ Saved ${d.length} file(s)`); E.reload(); },
    async newFile(p) { p = p || prompt('File path (e.g. app/src/main/java/com/example/myapp/Util.java)'); if (!p || !base) return; await api(base + '/file', 'PUT', { path: p, content: '' }); await E.reload(); E.open(p); },
    async remove(p) {
      if (!confirm(`Delete "${p}"?`)) return;
      await api(base + '/file?path=' + encodeURIComponent(p), 'DELETE');
      for (const t of tabs.filter((x) => x.path === p || x.path.startsWith(p + '/'))) { t.dirty = false; await E.close(t.path); }
      await E.reload();
    },
    async rename(from, to) {
      if (!to || to === from) return; await E.saveAll(); const was = active?.path;
      await api(base + '/rename', 'POST', { from, to });
      for (const t of tabs.filter((x) => x.path === from || x.path.startsWith(from + '/'))) { t.dirty = false; await E.close(t.path); }
      await E.reload(); if (was && (was === from || was.startsWith(from + '/'))) E.open(to + was.slice(from.length));
    },
    // Upload any file (PNG/JPG/SVG/XML...) — dir: destination folder
    upload(dir, replacePath) {
      if (!base) return toast('Open a project first');
      const inp = Object.assign(document.createElement('input'), { type: 'file', multiple: !replacePath });
      inp.onchange = guard(async () => {
        const fl = [...inp.files]; if (!fl.length) return;
        const isImg = fl.every((f) => /\.(png|jpe?g|webp|gif|svg|xml)$/i.test(f.name));
        const d = replacePath ? null : prompt('Upload into which folder?', dir || (isImg ? 'app/src/main/res/drawable' : 'app/src/main/assets')); if (!replacePath && d === null) return;
        for (const f of fl) {
          let name = f.name; if (replacePath) name = replacePath.split('/').pop(); else if (/\/res\//.test(d + '/')) name = name.toLowerCase().replace(/[^a-z0-9_.]/g, '_').replace(/^(\d)/, '_$1');
          await api(base + '/file', 'PUT', { path: replacePath || (d.replace(/\/+$/, '') + '/' + name), base64: await b64(f) });
        }
        toast('✅ Uploaded'); await E.reload(); if (replacePath) { await E.close(replacePath); E.open(replacePath); }
      }); inp.click();
    },
    focus() { editor?.focus(); },
    // ---- keyboard-command support ----
    get recent() { return recent.filter((p) => tabs.some((t) => t.path === p) || files.some((f) => f.path === p)); },
    get settings() { return SET; },
    setOptions(o) {
      SET = { ...SET, ...o }; localStorage.setItem('editor-settings', JSON.stringify(SET));
      editor?.updateOptions({ fontSize: SET.fontSize, lineHeight: Math.round(SET.fontSize * 1.55), wordWrap: SET.wordWrap ? 'on' : 'off', minimap: { enabled: SET.minimap }, tabSize: SET.tabSize });
    },
    cmd(id, arg) { if (!editor || active?.kind !== 'code') return; editor.focus(); editor.trigger('kbd', id, arg || {}); },
    async reveal(path, line = 1, col = 1) { await E.open(path); if (!editor || active?.path !== path || active.kind !== 'code') return; editor.revealLineInCenter(line); editor.setPosition({ lineNumber: line, column: col }); editor.focus(); },
    nextTab(dir = 1) { if (tabs.length < 2) return; const i = tabs.indexOf(active); activate(tabs[(i + dir + tabs.length) % tabs.length]); },
    async back() { if (hi > 0) { navigating = true; hi--; try { await E.open(hist[hi]); } finally { navigating = false; } } },
    async forward() { if (hi < hist.length - 1) { navigating = true; hi++; try { await E.open(hist[hi]); } finally { navigating = false; } } },
    async closeAll() { for (const t of [...tabs]) if (!(await E.close(t.path))) return false; return true; },
    nextError(dir = 1) { E.cmd(dir > 0 ? 'editor.action.marker.next' : 'editor.action.marker.prev'); },
    // Optimize Imports (Ctrl+Alt+O): remove unused + group/sort
    optimizeImports() {
      const t = active; if (!t || t.kind !== 'code' || !/\.(java|kt)$/.test(t.path)) return toast('Optimize Imports works on Java/Kotlin files');
      const m = t.model, lines = m.getLinesContent(), unused = new Set(markers.filter((x) => x.code === 'unused-import').map((x) => x.startLine));
      const idx = []; lines.forEach((l, i) => { if (/^import\s/.test(l)) idx.push(i); });
      if (!idx.length) return toast('No imports to optimize');
      const rank = (l) => /^import static/.test(l) ? 9 : /^import (android|androidx)\./.test(l) ? 0 : /^import (com|org)\./.test(l) ? 1 : /^import java\./.test(l) ? 2 : /^import javax\./.test(l) ? 3 : 4;
      const imps = [...new Set(idx.filter((i) => !unused.has(i + 1)).map((i) => lines[i].trim()))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
      const out = []; let prev = null; for (const l of imps) { const r = rank(l); if (prev !== null && r !== prev) out.push(''); out.push(l); prev = r; }
      const first = idx[0] + 1, last = idx[idx.length - 1] + 1;
      editor.executeEdits('optimize-imports', [{ range: new monaco.Range(first, 1, last, m.getLineMaxColumn(last)), text: out.join('\n') }]);
      toast(`✅ Imports optimized (${unused.size} unused removed)`);
    },
    // Go to Declaration (Ctrl+B / Ctrl+Click)
    async goToDeclaration(pos) {
      const t = active; if (!t || t.kind !== 'code') return; const m = t.model; pos = pos || editor.getPosition();
      const line = m.getLineContent(pos.lineNumber), col = pos.column;
      const hit = (re) => { for (const x of line.matchAll(re)) { const st = x.index + 1, en = st + x[0].length; if (col >= st && col <= en) return x; } return null; };
      let x = hit(/\bR\.(\w+)\.(\w+)/g), type, name;
      if (x) { type = x[1]; name = x[2]; } else if ((x = hit(/@\+?(\w+)\/([\w.]+)/g))) { type = x[1]; name = x[2].replace(/\./g, '_'); }
      if (type) { const loc = CUR.res?.loc?.[type]?.[name]; if (loc) return E.reveal(loc.path, loc.line, 1); return toast(`Cannot find ${type} "${name}"`); }
      const w = m.getWordAtPosition(pos); if (!w) return;
      const f = files.find((f) => f.type === 'file' && new RegExp('(^|/)' + w.word + '\\.(java|kt)$').test(f.path));
      if (f && f.path !== t.path) return E.reveal(f.path, 1, 1);
      const re = new RegExp('(\\b(?:class|interface|enum|object|fun|val|var)\\s+' + w.word + '\\b)|(\\b[\\w<>\\[\\],.? ]+\\s+' + w.word + '\\s*(?:=|;|\\(|,|\\)))');
      const mm = re.exec(m.getValue()); if (mm) { const lp = m.getPositionAt(mm.index); editor.revealLineInCenter(lp.lineNumber); editor.setPosition({ lineNumber: lp.lineNumber, column: 1 }); return editor.focus(); }
      toast('No declaration found');
    },
    findInEditor(replace) { E.cmd(replace ? 'editor.action.startFindReplace' : 'actions.find'); },
  };
  window.addEventListener('beforeunload', (e) => { if (E.dirtyAny) e.preventDefault(); });
  return E;
}
