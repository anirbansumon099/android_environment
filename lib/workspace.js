const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { DATA } = require('./settings');

const PROJ = path.join(DATA, 'projects');
const TPL = path.join(DATA, 'template');
const DEFAULT_TPL = path.join(__dirname, '..', 'defaults', 'template');
const TPL_DIRS = { compose: path.join(__dirname, '..', 'defaults', 'template-compose'), webview: path.join(__dirname, '..', 'defaults', 'template-webview') };
const IGNORE = new Set(['.template-version', '.gradle', 'build', 'node_modules', '.git', '.idea', 'local.properties', '__MACOSX']);
const TEXT_EXT = new Set(['.java', '.kt', '.kts', '.xml', '.gradle', '.properties', '.json', '.md', '.txt',
  '.yml', '.yaml', '.pro', '.gitignore', '.html', '.css', '.js', '.sh', '.toml', '.cfg', '.svg']);
const isText = (p) => TEXT_EXT.has(path.extname(p).toLowerCase()) || path.basename(p).startsWith('.');

fs.mkdirSync(PROJ, { recursive: true });

function copyDir(src, dst, overwrite, vars) {
  fs.mkdirSync(dst, { recursive: true });
  const sub = (str) => vars ? str.replace(/__([A-Z_]+)__/g, (m, k) => (k in vars ? vars[k] : m)) : str;
  for (const d of fs.readdirSync(src, { withFileTypes: true })) {
    if (d.name === '.template-version') continue;
    const s = path.join(src, d.name), t = path.join(dst, sub(d.name).replace(/\//g, path.sep));
    if (d.isDirectory()) copyDir(s, t, overwrite, vars);
    else if (overwrite || !fs.existsSync(t)) {
      fs.mkdirSync(path.dirname(t), { recursive: true });
      if (vars && isText(d.name)) fs.writeFileSync(t, sub(fs.readFileSync(s, 'utf8'))); else fs.copyFileSync(s, t);
    }
  }
}
const TPL_VERSION = '3';
const resetTemplate = () => { fs.rmSync(TPL, { recursive: true, force: true }); copyDir(DEFAULT_TPL, TPL); fs.writeFileSync(path.join(TPL, '.template-version'), TPL_VERSION); };
if (!fs.existsSync(path.join(TPL, '.template-version')) || fs.readFileSync(path.join(TPL, '.template-version'), 'utf8') !== TPL_VERSION) resetTemplate();

const validOwner = (o) => o === '_tpl' || /^[a-z0-9]{3,16}$/.test(o);
const validName = (n) => /^[A-Za-z0-9_.-]{1,40}$/.test(n) && n !== '.' && n !== '..';

function rootOf(owner, name) {
  if (owner === '_tpl') return TPL;
  if (!validOwner(owner) || !validName(name)) throw new Error('Invalid project');
  return path.join(PROJ, owner, name);
}

function forRoot(ROOT) {
  const safe = (p = '') => {
    const full = path.resolve(ROOT, p);
    if (full !== ROOT && !full.startsWith(ROOT + path.sep)) throw new Error('invalid path');
    return full;
  };
  const walk = (dir, base = '') => {
    const out = [];
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORE.has(d.name)) continue;
      const rel = base ? `${base}/${d.name}` : d.name;
      if (d.isDirectory()) { out.push({ path: rel, type: 'dir' }); out.push(...walk(path.join(dir, d.name), rel)); }
      else out.push({ path: rel, type: 'file', size: fs.statSync(path.join(dir, d.name)).size });
    }
    return out;
  };
  return {
    list: () => { fs.mkdirSync(ROOT, { recursive: true }); return walk(ROOT).sort((a, b) => a.path.localeCompare(b.path)); },
    root: ROOT,
    readRaw: (p) => fs.readFileSync(safe(p)),
    read: (p) => isText(p) ? { content: fs.readFileSync(safe(p), 'utf8') } : { binary: true },
    write(p, content) { const f = safe(p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); }, // content: string or Buffer
    remove: (p) => fs.rmSync(safe(p), { recursive: true, force: true }),
    rename(a, b) { const f = safe(a), t = safe(b); if (!fs.existsSync(f)) throw new Error('File not found'); if (fs.existsSync(t)) throw new Error('A file with this name already exists'); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.renameSync(f, t); },
    // the whole source as one zip
    zip() {
      const z = new AdmZip();
      for (const f of walk(ROOT)) if (f.type === 'file') z.addFile(f.path, fs.readFileSync(safe(f.path)));
      return z.toBuffer();
    },
    // place sources from an uploaded zip
    importZip(buf, prefix = '') {
      const z = new AdmZip(buf);
      const entries = z.getEntries().filter((e) => !e.isDirectory && !/(^|\/)(__MACOSX|\.DS_Store)(\/|$)/.test(e.entryName));
      if (entries.length > 20000) throw new Error('Too many files');
      const total = entries.reduce((s, e) => s + e.header.size, 0);
      if (total > 300 * 1024 * 1024) throw new Error('Uncompressed size is too large');
      const tops = new Set(entries.map((e) => e.entryName.split('/')[0]));
      const strip = tops.size === 1 && entries.every((e) => e.entryName.includes('/'));
      const pre = prefix ? prefix.replace(/\/+$/, '') + '/' : '';
      for (const e of entries) {
        const rel = strip ? e.entryName.split('/').slice(1).join('/') : e.entryName;
        if (!rel || rel.split('/').some((s) => IGNORE.has(s))) continue;
        const f = safe(pre + rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, e.getData());
      }
    },
  };
}

// What kind of project is inside an uploaded zip? (e.g. an export from Google AI Studio / Android Studio)
function classifyZip(buf) {
  const names = new AdmZip(buf).getEntries().filter((e) => !e.isDirectory).map((e) => e.entryName).filter((n) => !/(^|\/)(node_modules|__MACOSX|\.git)\//.test(n));
  const depth = (n) => n.split('/').length - 1;
  if (names.some((n) => /(^|\/)settings\.gradle(\.kts)?$/.test(n) && depth(n) <= 3)) return 'android';
  if (names.some((n) => /(^|\/)package\.json$/.test(n) && depth(n) <= 2) || names.some((n) => /(^|\/)index\.html$/.test(n) && depth(n) <= 2)) return 'web';
  return 'unknown';
}
const forProject = (owner, name) => forRoot(rootOf(owner, name));
const projectsOf = (owner) => {
  if (!validOwner(owner)) return [];
  const d = path.join(PROJ, owner);
  return fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name) : [];
};
const PKG_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const JAVA_KW = new Set('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while'.split(' '));
// kind: 'blank' | 'empty-activity' (Java views) | 'compose' (Kotlin + Jetpack Compose) | 'webview' (web app wrapper)
function createProject(owner, name, opts = {}) {
  const root = rootOf(owner, name);
  if (fs.existsSync(root)) throw new Error('A project with this name already exists');
  const kind = opts.kind || 'empty-activity';
  fs.mkdirSync(root, { recursive: true });
  if (kind === 'blank') return { open: null };
  const pkg = opts.package || 'com.example.' + name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!PKG_RE.test(pkg) || pkg.split('.').some((x) => JAVA_KW.has(x))) { fs.rmSync(root, { recursive: true, force: true }); throw new Error('Invalid package name (e.g. com.example.myapp)'); }
  const sdk = [21, 23, 24, 26, 28, 30, 33].includes(Number(opts.minSdk)) ? Number(opts.minSdk) : 24;
  const appName = String(opts.appName || name).replace(/[<>&"']/g, '').slice(0, 40) || name;
  const theme = appName.replace(/[^A-Za-z0-9]/g, '') || 'MyApp';
  copyDir(TPL_DIRS[kind] || TPL, root, true, { PACKAGE: pkg, PKG_PATH: pkg.replace(/\./g, '/'), APP_NAME: appName, MIN_SDK: String(sdk), THEME_NAME: /^[0-9]/.test(theme) ? 'App' + theme : theme });
  const dir = `app/src/main/java/${pkg.replace(/\./g, '/')}/`;
  const main = ['MainActivity.java', 'MainActivity.kt'].map((f) => dir + f).find((f) => fs.existsSync(path.join(root, f)));
  return { open: main || null };
}
const deleteProject = (owner, name) => fs.rmSync(rootOf(owner, name), { recursive: true, force: true });
const deleteOwner = (owner) => validOwner(owner) && fs.rmSync(path.join(PROJ, owner), { recursive: true, force: true });

module.exports = { classifyZip, forProject, projectsOf, createProject, deleteProject, deleteOwner, resetTemplate, validOwner };
