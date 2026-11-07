// Live Java error checking: syntax (java-parser) + Android-aware semantic checks
const { parse } = require('java-parser');
const idx = require('./android-index');

const SEV = { error: 8, warning: 4, hint: 1 };

// blank out comments/strings (keeping positions intact)
function mask(t) {
  let o = '', i = 0; const n = t.length;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  while (i < n) {
    const c = t[i], d = t[i + 1];
    if (c === '/' && d === '/') { let j = t.indexOf('\n', i); if (j < 0) j = n; o += blank(t.slice(i, j)); i = j; }
    else if (c === '/' && d === '*') { let j = t.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; o += blank(t.slice(i, j)); i = j; }
    else if (c === '"' && t.startsWith('"""', i)) { let j = t.indexOf('"""', i + 3); j = j < 0 ? n : j + 3; o += blank(t.slice(i, j)); i = j; }
    else if (c === '"' || c === "'") { let j = i + 1; while (j < n && t[j] !== c && t[j] !== '\n') j += t[j] === '\\' ? 2 : 1; j = Math.min(j + 1, n); o += blank(t.slice(i, j)); i = j; }
    else { o += c; i++; }
  }
  return o;
}
const lineStarts = (t) => { const a = [0]; for (let i = 0; i < t.length; i++) if (t[i] === '\n') a.push(i + 1); return a; };
function pos(starts, off) { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= off) lo = m; else hi = m - 1; } return { line: lo + 1, col: off - starts[lo] + 1 }; }

function syntaxError(text) {
  try { parse(text); return null; } catch (e) {
    const msg = String(e.message || '');
    const m = msg.match(/line: (\d+), column: (\d+)/);
    const lines = text.split('\n');
    let line = m ? +m[1] : lines.length, col = m ? +m[2] : (lines[lines.length - 1].length + 1);
    if (!m) { line = lines.length; col = Math.max(1, lines[line - 1].length); }
    const found = (msg.match(/but found: '([^']*)'/) || msg.match(/but found --> '([^']*)'/) || [])[1];
    const exp = [...msg.matchAll(/\n\s+\d+\. \[([^\]]+)\]/g)].map((x) => x[1].replace(/'/g, ''));
    const single = msg.match(/Expecting --> '([^']*)' <--/);
    let text2;
    if (single) text2 = found ? `Syntax error: expected '${single[1]}' but found '${found}'` : `Syntax error: missing '${single[1]}' (unexpected end of file)`;
    else if (exp.length && exp.length <= 4) text2 = `Syntax error: expected ${exp.join(' or ')}${found ? `, found '${found}'` : ''}`;
    else text2 = found ? `Syntax error on token '${found}'` : 'Syntax error';
    return { line, col, len: Math.max(1, (found || '').length), message: text2 };
  }
}

// ---- Project data ----
const fileList = (W) => W.list().filter((f) => f.type === 'file');
function projectClasses(W, skipPath) {
  const out = {}; // Name -> [pkg]
  for (const f of fileList(W).filter((x) => x.path.endsWith('.java') && x.path !== skipPath).slice(0, 500)) {
    const name = f.path.split('/').pop().replace(/\.java$/, '');
    let pkg = ''; try { pkg = (W.read(f.path).content.match(/^\s*package\s+([\w.]+)\s*;/m) || [])[1] || ''; } catch {}
    (out[name] ||= []).push(pkg);
  }
  return out;
}
function resIndex(W) {
  const R = { id: new Set(), strings: {}, colors: {}, loc: {} };
  const add = (t, n, p, line) => { (R[t] ||= new Set()).add(n.replace(/\./g, '_')); if (p) ((R.loc[t] ||= {})[n.replace(/\./g, '_')] ||= { path: p, line: line || 1 }); };
  const lineAt = (x, i) => x.slice(0, i).split('\n').length;
  for (const f of fileList(W)) {
    const m = f.path.match(/(?:^|\/)res\/([a-z]+)(?:-[^/]*)?\/([^/]+?)(?:\.(\w+))?$/); if (!m) continue;
    const [, type, base, ext] = m;
    if (type === 'values' && ext === 'xml') {
      let x = ''; try { x = W.read(f.path).content; } catch {}
      for (const s of x.matchAll(/<string\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g)) { add('string', s[1], f.path, lineAt(x, s.index)); R.strings[s[1]] = s[2].trim(); }
      for (const s of x.matchAll(/<color\s+name="([^"]+)"[^>]*>([^<]*)<\/color>/g)) { add('color', s[1], f.path, lineAt(x, s.index)); R.colors[s[1]] = s[2].trim(); }
      for (const [tag, t] of [['dimen', 'dimen'], ['style', 'style'], ['integer', 'integer'], ['bool', 'bool'], ['string-array', 'array'], ['integer-array', 'array'], ['plurals', 'plurals'], ['attr', 'attr'], ['declare-styleable', 'styleable']])
        for (const s of x.matchAll(new RegExp(`<${tag}\\s+name="([^"]+)"`, 'g'))) add(t, s[1], f.path, lineAt(x, s.index));
    } else {
      add(type, base, f.path, 1);
      if (ext === 'xml') { let x = ''; try { x = W.read(f.path).content; } catch {} for (const s of x.matchAll(/@\+?id\/([\w.]+)/g)) add('id', s[1], f.path, lineAt(x, s.index)); }
    }
  }
  const out = {}; for (const [k, v] of Object.entries(R)) out[k] = v instanceof Set ? [...v].sort() : v;
  return out;
}

function lintJava(text, relPath, W) {
  const marks = [];
  const mk = (st, off, len, severity, message, extra = {}) => { const a = pos(st, off), b = pos(st, off + len); marks.push({ startLine: a.line, startCol: a.col, endLine: b.line, endCol: b.col, severity, message, ...extra }); };
  const se = syntaxError(text);
  if (se) return [{ startLine: se.line, startCol: se.col, endLine: se.line, endCol: se.col + se.len, severity: 'error', message: se.message, code: 'syntax' }];

  const st = lineStarts(text), body = mask(text);
  const base = relPath.split('/').pop().replace(/\.java$/, '');
  const pkgM = body.match(/^\s*package\s+([\w.]+)\s*;/m);

  // package <-> folder
  const jm = relPath.match(/(?:^|\/)java\/(.+)\/[^/]+$/);
  if (pkgM && jm && pkgM[1] !== jm[1].replace(/\//g, '.'))
    mk(st, pkgM.index + pkgM[0].indexOf(pkgM[1]), pkgM[1].length, 'warning', `Package '${pkgM[1]}' does not match the folder (expected '${jm[1].replace(/\//g, '.')}')`, { code: 'package' });

  // public class name = file name
  const pc = /\bpublic\s+(?:(?:final|abstract|static)\s+)*(class|interface|enum|record)\s+(\w+)/.exec(body);
  if (pc && pc[2] !== base) mk(st, pc.index + pc[0].lastIndexOf(pc[2]), pc[2].length, 'error', `Public ${pc[1]} '${pc[2]}' must be declared in a file named '${pc[2]}.java'`, { code: 'filename' });

  // import
  const imports = [], explicit = new Set(), wild = [];
  for (const m of body.matchAll(/^[ \t]*import\s+(static\s+)?([\w.]+?)(\.\*)?\s*;/gm)) {
    const imp = { off: m.index, len: m[0].length, full: m[2], isStatic: !!m[1], wild: !!m[3], simple: m[2].split('.').pop() };
    imports.push(imp); if (imp.wild) wild.push(m[2]); else if (!imp.isStatic) explicit.add(imp.simple);
  }
  // usage
  const stripped = body.replace(/^[ \t]*(import|package)\s[^;]*;/gm, (s) => s.replace(/[^\n]/g, ' '));
  const declared = new Set([...stripped.matchAll(/\b(?:class|interface|enum|record)\s+([A-Z]\w*)/g)].map((m) => m[1]));
  for (const m of stripped.matchAll(/<\s*([A-Z]\w*)\s*(?:extends\b|,|>)/g)) declared.add(m[1]);
  for (const m of stripped.matchAll(/,\s*([A-Z]\w*)\s*>/g)) declared.add(m[1]);
  const proj = projectClasses(W, relPath), myPkg = pkgM ? pkgM[1] : '';
  const unindexedWild = wild.some((p) => !Object.values(idx.classes).some((a) => a.includes(p)) && !Object.values(proj).some((a) => a.includes(p)));
  const used = new Set(), seen = new Set();

  for (const m of stripped.matchAll(/(?<![.\w])@?([A-Z][A-Za-z0-9_]*)\b/g)) {
    const name = m[1], off = m.index + m[0].indexOf(name);
    used.add(name);
    if (declared.has(name) || idx.JAVA_LANG.has(name) || explicit.has(name) || name === 'R' || name === 'BuildConfig') continue;
    if (/^[A-Z][A-Z0-9_]*$/.test(name) || name.length === 1) continue;
    if ((proj[name] || []).includes(myPkg)) continue;
    const cands = [...(idx.classes[name] || []), ...((proj[name] || []).filter((p) => p !== myPkg && p).map((p) => p))];
    if (wild.some((p) => cands.includes(p))) continue;
    if (cands.length) { mk(st, off, name.length, 'error', `cannot find symbol: '${name}' — add an import (${cands.map((c) => c + '.' + name).join(' / ')})`, { code: 'import:' + cands.map((c) => c + '.' + name).join('|') }); }
    else if (!unindexedWild && /\bnew\s+$/.test(stripped.slice(Math.max(0, off - 6), off)) && !seen.has(name)) { seen.add(name); mk(st, off, name.length, 'warning', `Unknown class '${name}' (check your imports)`, { code: 'unknown' }); }
  }
  // unused imports
  for (const im of imports) if (!im.wild && !im.isStatic && !used.has(im.simple))
    mk(st, im.off, im.len, 'hint', `Unused import '${im.full}'`, { code: 'unused-import', unnecessary: true });

  // R.* resource check
  if (W.list().some((f) => /(^|\/)res\//.test(f.path))) {
    const R = resIndex(W);
    for (const m of stripped.matchAll(/\bR\.(layout|id|string|drawable|color|dimen|style|mipmap|menu|xml|raw|anim|array|integer|bool|plurals)\.(\w+)/g)) {
      const t = m[1] === 'array' ? 'array' : m[1];
      if (!(R[t] || []).includes(m[2])) mk(st, m.index, m[0].length, 'error', `cannot find symbol: R.${t}.${m[2]} (not found in res)`, { code: 'res-missing' });
    }
  }
  // is the Activity declared in the Manifest?
  const ac = /\bclass\s+(\w+)\s+extends\s+(?:\w+\.)*(\w*Activity)\b/.exec(stripped);
  if (ac && jm) {
    const mf = fileList(W).find((f) => /(^|\/)AndroidManifest\.xml$/.test(f.path));
    if (mf) { const x = W.read(mf.path).content || ''; if (!new RegExp(`android:name="[^"]*\\b${ac[1]}"`).test(x)) mk(st, ac.index + ac[0].indexOf(ac[1]), ac[1].length, 'warning', `Activity '${ac[1]}' is not declared in AndroidManifest.xml`, { code: 'manifest' }); }
  }
  return marks;
}

// whole-project syntax check before a build
function projectSyntax(W) {
  const errs = [];
  for (const f of fileList(W).filter((x) => x.path.endsWith('.java') && x.size < 400000)) {
    const e = syntaxError(W.read(f.path).content || '');
    if (e) { errs.push({ file: f.path, line: e.line, message: e.message }); if (errs.length >= 15) break; }
  }
  return errs;
}
module.exports = { lintJava, projectSyntax, resIndex, SEV };
