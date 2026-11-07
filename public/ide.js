// ===== Android Builder IDE (Android Studio style) =====
Theme.init('studio-theme', 'dark');
let E, T, proj = localStorage.getItem('last-project') || '', owner, CFG = { types: [] }, curType = localStorage.getItem('studio-type') || 'debug', signInfo = { has: false }, bTab = 'build', pos = [1, 1], logCache = {}, projects = [], MARKS = [], FIND = { q: '', regex: false, cs: false, results: [], files: 0, truncated: false };
const base = () => `/api/p/${owner}/${encodeURIComponent(proj)}`;
const TLABEL = { debug: 'Debug APK', release: 'Release APK', bundle: 'Release AAB' };
const hasProj = () => !!proj;
const activeBuild = () => BuildStore.list.find((b) => b.project === proj && !FINALS.includes(b.stage));
const ANDROID = (extra = '') => ic('android').replace('<svg', `<svg style="fill:#3DDC84;${extra}"`);

// ================= Commands (with Android Studio default shortcuts) =================
const reg = (id, title, category, keys, run, o = {}) => Commands.register({ id, title, category, keys, run, ...o });
const ec = (cmd) => () => E.cmd(cmd);                       // forward to an editor action
const needProj = { when: hasProj };
// --- File
reg('new-project', 'New Project…', 'File', [], () => newProject());
reg('open-project', 'Open Project… (Welcome screen)', 'File', [], () => showWelcome());
reg('import-aistudio', 'Import from Google AI Studio / ZIP…', 'File', [], () => importDialog());
reg('save-all', 'Save All', 'File', ['Ctrl+S'], () => E.saveAll());
reg('new-file', 'New File…', 'File', ['Alt+Insert'], () => E.newFile(), needProj);
reg('upload-files', 'Upload Files…', 'File', [], () => E.upload(), needProj);
reg('close-tab', 'Close Tab', 'File', ['Ctrl+F4', 'Alt+W'], () => E.activePath && E.close(E.activePath));
reg('close-all-tabs', 'Close All Tabs', 'File', ['Alt+Shift+W'], () => E.closeAll());
reg('rename-file', 'Rename File…', 'File', ['Shift+F6'], () => { const p = E.activePath; if (!p) return; const n = prompt('New path', p); if (n) E.rename(p, n); });
reg('delete-file', 'Delete File…', 'File', ['Delete'], () => E.activePath && E.remove(E.activePath), { when: () => document.activeElement?.id === 'tree' && !!E.activePath });
reg('reload-files', 'Reload Project Files', 'File', ['Ctrl+Alt+Y'], () => E.reload(), needProj);
reg('export-project', 'Export Project (zip)', 'File', [], () => exportZip(), needProj);
reg('close-project', 'Close Project', 'File', [], () => closeProject(), needProj);
reg('delete-project', 'Delete Project…', 'File', [], () => delProject(), needProj);
reg('settings', 'Settings…', 'File', ['Ctrl+Alt+S'], () => openSettings());
reg('sign-out', 'Sign Out', 'File', [], () => logout());
// --- Edit (editor actions)
for (const [id, t, k] of [['undo', 'Undo', 'Ctrl+Z'], ['redo', 'Redo', 'Ctrl+Shift+Z'], ['cut', 'Cut', 'Ctrl+X'], ['copy', 'Copy', 'Ctrl+C'], ['paste', 'Paste', 'Ctrl+V'], ['select-all', 'Select All', 'Ctrl+A']]) reg(id, t, 'Edit', [k], () => {}, { native: true });
reg('find', 'Find in File…', 'Edit', ['Ctrl+F'], () => E.findInEditor(false));
reg('replace', 'Replace in File…', 'Edit', ['Ctrl+R'], () => E.findInEditor(true));
reg('find-next', 'Find Next', 'Edit', ['F3'], ec('editor.action.nextMatchFindAction'));
reg('find-prev', 'Find Previous', 'Edit', ['Shift+F3'], ec('editor.action.previousMatchFindAction'));
reg('duplicate-line', 'Duplicate Line or Selection', 'Edit', ['Ctrl+D'], ec('editor.action.copyLinesDownAction'));
reg('delete-line', 'Delete Line', 'Edit', ['Ctrl+Y'], ec('editor.action.deleteLines'));
reg('move-line-up', 'Move Line Up', 'Edit', ['Alt+Shift+Up'], ec('editor.action.moveLinesUpAction'));
reg('move-line-down', 'Move Line Down', 'Edit', ['Alt+Shift+Down'], ec('editor.action.moveLinesDownAction'));
reg('join-lines', 'Join Lines', 'Edit', ['Ctrl+Shift+J'], ec('editor.action.joinLines'));
reg('new-line-below', 'Start New Line', 'Edit', ['Shift+Enter'], ec('editor.action.insertLineAfter'));
reg('new-line-above', 'Start New Line Before Current', 'Edit', ['Ctrl+Alt+Enter'], ec('editor.action.insertLineBefore'));
reg('comment-line', 'Comment with Line Comment', 'Code', ['Ctrl+/'], ec('editor.action.commentLine'));
reg('comment-block', 'Comment with Block Comment', 'Code', ['Ctrl+Shift+/'], ec('editor.action.blockComment'));
reg('extend-selection', 'Extend Selection', 'Edit', ['Ctrl+W', 'Alt+Shift+Right'], ec('editor.action.smartSelect.expand'));
reg('shrink-selection', 'Shrink Selection', 'Edit', ['Ctrl+Shift+W', 'Alt+Shift+Left'], ec('editor.action.smartSelect.shrink'));
reg('select-next', 'Add Selection for Next Occurrence', 'Edit', ['Alt+J'], ec('editor.action.addSelectionToNextFindMatch'));
reg('select-all-occ', 'Select All Occurrences', 'Edit', ['Ctrl+Alt+Shift+J'], ec('editor.action.selectHighlights'));
reg('to-upper', 'Convert to UPPER CASE', 'Edit', ['Ctrl+Shift+U'], ec('editor.action.transformToUppercase'));
reg('jump-bracket', 'Move Caret to Matching Brace', 'Edit', ['Ctrl+Shift+M'], ec('editor.action.jumpToBracket'));
reg('fold', 'Collapse Region', 'Edit', ['Ctrl+Num-'], ec('editor.fold'));
reg('unfold', 'Expand Region', 'Edit', ['Ctrl+Num+'], ec('editor.unfold'));
reg('fold-all', 'Collapse All', 'Edit', ['Ctrl+Shift+Num-'], ec('editor.foldAll'));
reg('unfold-all', 'Expand All', 'Edit', ['Ctrl+Shift+Num+'], ec('editor.unfoldAll'));
// --- Code
reg('reformat', 'Reformat Code', 'Code', ['Ctrl+Alt+L'], ec('editor.action.formatDocument'));
reg('optimize-imports', 'Optimize Imports', 'Code', ['Ctrl+Alt+O'], () => E.optimizeImports());
reg('quick-fix', 'Show Context Actions (Quick Fix)', 'Code', ['Alt+Enter'], ec('editor.action.quickFix'));
reg('complete', 'Basic Completion', 'Code', ['Ctrl+Space'], ec('editor.action.triggerSuggest'));
reg('smart-complete', 'Smart Completion', 'Code', ['Ctrl+Shift+Space'], ec('editor.action.triggerSuggest'));
reg('param-info', 'Parameter Info', 'Code', ['Ctrl+P'], ec('editor.action.triggerParameterHints'));
reg('quick-doc', 'Quick Documentation', 'Code', ['Ctrl+Q'], ec('editor.action.showHover'));
// --- Navigate
reg('find-action', 'Find Action…', 'Navigate', ['Ctrl+Shift+A'], () => openFindAction());
reg('search-everywhere', 'Search Everywhere', 'Navigate', ['Shift Shift'], () => openSearchEverywhere());
reg('goto-file', 'Go to File…', 'Navigate', ['Ctrl+Shift+N', 'Ctrl+Shift+O'], () => openGotoFile(), needProj);
reg('goto-class', 'Go to Class…', 'Navigate', ['Ctrl+N', 'Ctrl+Alt+N'], () => openGotoClass(), needProj);
reg('recent-files', 'Recent Files', 'Navigate', ['Ctrl+E'], () => openRecent(), needProj);
reg('goto-line', 'Go to Line…', 'Navigate', ['Ctrl+G'], ec('editor.action.gotoLine'));
reg('goto-declaration', 'Go to Declaration', 'Navigate', ['Ctrl+B'], () => E.goToDeclaration());
reg('next-tab', 'Next Tab', 'Navigate', ['Alt+Right'], () => E.nextTab(1));
reg('prev-tab', 'Previous Tab', 'Navigate', ['Alt+Left'], () => E.nextTab(-1));
reg('nav-back', 'Back', 'Navigate', ['Ctrl+Alt+Left'], () => E.back());
reg('nav-forward', 'Forward', 'Navigate', ['Ctrl+Alt+Right'], () => E.forward());
reg('next-error', 'Next Highlighted Error', 'Navigate', ['F2'], () => E.nextError(1));
reg('prev-error', 'Previous Highlighted Error', 'Navigate', ['Shift+F2'], () => E.nextError(-1));
reg('find-in-files', 'Find in Files…', 'Navigate', ['Ctrl+Shift+F'], () => findDialog(false), needProj);
reg('replace-in-files', 'Replace in Files…', 'Navigate', ['Ctrl+Shift+R'], () => findDialog(true), needProj);
// --- Build / Run
reg('run', 'Run (Build selected configuration)', 'Build', ['Shift+F10'], () => runBuild(curType), needProj);
reg('build-debug', 'Build Debug APK (Make Project)', 'Build', ['Ctrl+F9'], () => runBuild('debug'), needProj);
reg('build-release', 'Build Release APK', 'Build', ['Ctrl+Shift+F9'], () => runBuild('release'), needProj);
reg('build-bundle', 'Build Release Bundle (AAB)', 'Build', ['Ctrl+Alt+F9'], () => runBuild('bundle'), needProj);
reg('build-options', 'Build with Options…', 'Build', ['Ctrl+Shift+F10'], () => buildDialog(), needProj);
reg('stop-build', 'Stop Build', 'Build', ['Ctrl+F2'], () => cancelBuild(), { when: () => !!activeBuild() });
reg('select-config', 'Select Run Configuration…', 'Build', ['Alt+Shift+F10'], () => cfgPopup(), needProj);
reg('signing', 'Signing & Keystore…', 'Build', ['Ctrl+Alt+K'], () => signDialog(), needProj);
// --- View
reg('toggle-project', 'Tool Window: Project', 'View', ['Alt+1'], () => toggleProject());
reg('toggle-find', 'Tool Window: Find', 'View', ['Alt+3'], () => showBottom('find'));
reg('toggle-problems', 'Tool Window: Problems', 'View', ['Alt+6'], () => showBottom('problems'));
reg('toggle-builds', 'Tool Window: Builds History', 'View', ['Alt+7'], () => showBottom('builds'));
reg('toggle-build', 'Tool Window: Build', 'View', ['Alt+0'], () => showBottom('build'));
reg('hide-all', 'Hide All Tool Windows', 'View', ['Ctrl+Shift+F12'], () => hideAllTools());
reg('focus-editor', 'Focus Editor', 'View', ['Esc'], () => E.focus(), { hidden: true, when: () => !document.activeElement?.closest?.('.monaco-editor') });
reg('toggle-theme', 'Switch Theme (Darcula / Light)', 'View', ['Ctrl+`'], () => setTheme(Theme.get() === 'dark' ? 'light' : 'dark'));
reg('shortcuts', 'Keyboard Shortcuts', 'Help', ['F1'], () => openShortcuts());
reg('about', 'About Android Builder', 'Help', [], () => toast('Android Builder — cloud APK builds via GitHub Actions'));
Keymap.rebuild();

// ================= Menubar / Toolbar =================
const M = (id, label) => { const c = Commands.get(id); return { label: label || c.title, kbd: c.native ? Keymap.pretty(c.keys[0] || '') : Keymap.first(id), dis: c.when ? !c.when() : false, action: () => Commands.run(id) }; };
const SEP = { sep: 1 };
function menus() {
  return {
    File: () => [M('new-project'), M('open-project'), M('import-aistudio'), SEP, M('save-all'), M('new-file'), M('upload-files'), M('rename-file'), SEP, M('reload-files'), M('export-project'), SEP, M('close-project'), M('delete-project'), SEP, M('settings'), M('sign-out')],
    Edit: () => [M('undo'), M('redo'), SEP, M('cut'), M('copy'), M('paste'), M('select-all'), SEP, M('find'), M('replace'), M('find-in-files'), M('replace-in-files'), SEP, M('duplicate-line'), M('delete-line'), M('join-lines'), M('extend-selection'), M('select-next')],
    View: () => [M('toggle-project'), M('toggle-build'), M('toggle-find'), M('toggle-problems'), M('toggle-builds'), M('hide-all'), SEP, { label: 'Appearance: Darcula', check: Theme.get() === 'dark', action: () => setTheme('dark') }, { label: 'Appearance: IntelliJ Light', check: Theme.get() === 'light', action: () => setTheme('light') }, SEP, M('goto-file'), M('recent-files')],
    Navigate: () => [M('search-everywhere'), M('find-action'), SEP, M('goto-class'), M('goto-file'), M('goto-line'), M('goto-declaration'), SEP, M('recent-files'), M('nav-back'), M('nav-forward'), M('next-tab'), M('prev-tab'), SEP, M('next-error'), M('prev-error')],
    Code: () => [M('reformat'), M('optimize-imports'), SEP, M('quick-fix'), M('complete'), M('param-info'), M('quick-doc'), SEP, M('comment-line'), M('comment-block'), SEP, M('move-line-up'), M('move-line-down')],
    Build: () => [M('run'), SEP, ...CFG.types.map((t) => ({ label: `Build ${t.label}`, dis: !t.enabled || !hasProj(), kbd: Keymap.first({ debug: 'build-debug', release: 'build-release', bundle: 'build-bundle' }[t.id]), action: () => runBuild(t.id) })), SEP, M('build-options'), M('select-config'), M('stop-build'), SEP, M('signing')],
    Tools: () => [M('signing'), M('upload-files'), M('import-aistudio'), SEP, M('settings')],
    Help: () => [M('shortcuts'), M('find-action'), SEP, M('about')],
  };
}
function drawChrome() {
  const mm = menus();
  $('#menubar').innerHTML = `<div class="logo">${ANDROID()}<span>Android Builder</span></div>${Object.keys(mm).map((k) => `<div class="menu"><span data-m="${k}">${k}</span></div>`).join('')}<div class="sp"></div><span class="who">${esc(proj || '')}</span><span class="who">👤 ${esc(ME?.username || '')}</span>`;
  let openM = null;
  const show = (el) => { const r = el.getBoundingClientRect(); popup(r.left, r.bottom + 1, mm[el.dataset.m](), () => { openM = null; el.parentElement.classList.remove('open'); }); el.parentElement.classList.add('open'); openM = el; };
  $$('#menubar .menu>span').forEach((s) => { s.onclick = () => openM === s ? $$('.ctx').forEach((c) => c.remove()) : show(s); s.onmouseenter = () => { if (openM && openM !== s) { openM.parentElement.classList.remove('open'); show(s); } }; });
  const tt = (t, id) => `${t}${id ? ` (${Keymap.first(id)})` : ''}`;
  $('#toolbar').innerHTML = `<button class="tb crumb-proj" id="tb-proj">${ANDROID()}${esc(proj || 'No project')} <span class="caret">▼</span></button><div class="tbsep"></div>
    <button class="tb" id="tb-save" title="${tt('Save All', 'save-all')}">${ic('save')}</button><button class="tb" id="tb-sync" title="${tt('Reload project files', 'reload-files')}">${ic('refresh')}</button><div class="tbsep"></div>
    <button class="tb sel" id="tb-cfg" title="${tt('Run configuration', 'select-config')}">${ANDROID()}app · ${esc(TLABEL[curType] || curType)} <span class="caret">▼</span></button>
    <button class="tb run" id="tb-run" title="${tt('Run', 'run')}" ${hasProj() ? '' : 'disabled'}>${ic('play')}</button><button class="tb stop" id="tb-stop" title="${tt('Stop build', 'stop-build')}" ${activeBuild() ? '' : 'disabled'}>${ic('stop')}</button>
    <div class="tbsep"></div><button class="tb" id="tb-sign" title="${tt('Signing & Keystore', 'signing')}">${ic('key')}</button><button class="tb" id="tb-up" title="Upload files">${ic('upload')}</button>
    <div class="grow"></div><button class="tb" id="tb-find" title="${tt('Search Everywhere', 'search-everywhere')}">${ic('search')}</button><button class="tb" id="tb-theme" title="${tt('Switch theme', 'toggle-theme')}">${ic(Theme.get() === 'dark' ? 'sun' : 'moon')}</button><button class="tb" id="tb-set" title="${tt('Settings', 'settings')}">${ic('gear')}</button>`;
  $('#tb-proj').onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); popup(r.left, r.bottom + 2, [...projects.map((n) => ({ label: n, check: n === proj, action: () => openProject(n) })), SEP, M('new-project'), M('import-aistudio'), M('open-project')]); };
  $('#tb-save').onclick = () => E.saveAll(); $('#tb-sync').onclick = guard(() => E.reload()); $('#tb-sign').onclick = () => Commands.run('signing'); $('#tb-up').onclick = () => Commands.run('upload-files');
  $('#tb-theme').onclick = () => Commands.run('toggle-theme'); $('#tb-set').onclick = () => Commands.run('settings'); $('#tb-find').onclick = () => Commands.run('search-everywhere');
  $('#tb-cfg').onclick = () => cfgPopup(); $('#tb-run').onclick = () => Commands.run('run'); $('#tb-stop').onclick = () => Commands.run('stop-build');
}
function cfgPopup() { const r = ($('#tb-cfg') || document.body).getBoundingClientRect(); popup(r.left, r.bottom + 2, CFG.types.map((x) => ({ label: `app · ${x.label}${x.enabled ? '' : ' (disabled by admin)'}`, dis: !x.enabled, check: x.id === curType, action: () => { curType = x.id; localStorage.setItem('studio-type', x.id); drawChrome(); } }))); }
const setTheme = (t) => { Theme.set(t); drawChrome(); drawStatus(); };

// ================= Layout =================
const toggleProject = () => { const h = !$('#pw').hidden; $('#pw').hidden = h; $('#sv').hidden = h; $('#sb-proj').classList.toggle('on', !h); };
const hideAllTools = () => { const hide = !$('#pw').hidden || !$('#bottom').classList.contains('hide'); $('#pw').hidden = hide; $('#sv').hidden = hide; $('#bottom').classList.toggle('hide', hide); $('#sb-proj').classList.toggle('on', !hide); };
function splitter(el, apply) { el.onmousedown = (e) => { e.preventDefault(); el.classList.add('drag'); const mv = (ev) => apply(ev), up = () => { el.classList.remove('drag'); document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); }; document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); }; }
splitter($('#sv'), (e) => { $('#pw').style.width = Math.max(160, Math.min(560, e.clientX - 26)) + 'px'; });
splitter($('#sh'), (e) => { const r = $('#center').getBoundingClientRect(); $('#bottom').style.height = Math.max(80, Math.min(r.height - 120, r.bottom - e.clientY)) + 'px'; });
$('#t-loc').innerHTML = ic('locate'); $('#t-col').innerHTML = ic('minus'); $('#t-add').innerHTML = ic('plus');
$('#sb-proj').onclick = toggleProject; $('#sb-sign').onclick = () => proj && signDialog();

// ================= Bottom tool windows =================
function showBottom(tab) { bTab = tab; $('#bottom').classList.remove('hide'); drawBottom(); }
function drawBottomHead() {
  const er = MARKS.filter((m) => m.severity === 'error').length, wn = MARKS.filter((m) => m.severity === 'warning').length, ab = activeBuild();
  const tabs = [['build', 'Build'], ['find', 'Find'], ['problems', 'Problems'], ['builds', 'Builds']];
  $('#bth').innerHTML = tabs.map(([k, l]) => `<button class="bt ${bTab === k ? 'on' : ''}" data-b="${k}">${l}${k === 'problems' && er + wn ? ` <span class="badge ${er ? '' : 'wn'}">${er + wn}</span>` : ''}${k === 'find' && FIND.results.length ? ` <span class="badge ok">${FIND.results.length}</span>` : ''}${k === 'build' && ab ? ' <span class="spin"></span>' : ''}</button>`).join('') + `<div class="grow"></div><button class="ib" id="bt-hide" title="Hide (${Keymap.first('hide-all')})">${ic('minus')}</button>`;
  $$('#bth .bt').forEach((b) => b.onclick = () => showBottom(b.dataset.b)); $('#bt-hide').onclick = () => $('#bottom').classList.add('hide');
}
function drawBottom() {
  drawBottomHead(); const body = $('#bbody');
  if (bTab === 'problems') {
    const act = E?.activePath, er = MARKS.filter((m) => m.severity === 'error').length, wn = MARKS.filter((m) => m.severity === 'warning').length;
    body.innerHTML = `<div class="pscroll" style="padding:6px">${act ? `<div class="mu" style="padding:2px 8px">${fileIcon(act)} ${esc(act)} — ${er} error(s), ${wn} warning(s)</div>` : '<div class="mu" style="padding:10px">No file is open</div>'}${MARKS.filter((m) => m.severity !== 'hint').map((m) => `<div class="pr" data-l="${m.startLine}" data-c="${m.startCol}">${m.severity === 'error' ? '<span class="er">✖</span>' : '<span class="wn">⚠</span>'} ${esc(m.message)} <span class="mu">:${m.startLine}</span></div>`).join('') || (act ? '<div class="ok" style="padding:6px 8px">✔ No problems found</div>' : '')}</div>`;
    $$('.pr', body).forEach((r) => r.onclick = () => { const e = E.editor; e.setPosition({ lineNumber: +r.dataset.l, column: +r.dataset.c }); e.revealLineInCenter(+r.dataset.l); e.focus(); });
  } else if (bTab === 'builds') drawBuildsTable(body);
  else if (bTab === 'find') drawFindPane(body);
  else drawBuildPane();
}
function drawBuildsTable(body) {
  const L = BuildStore.list;
  body.innerHTML = `<div class="pscroll"><table class="btable"><tr><th>#</th><th>Project</th><th>Type</th><th>Status</th><th>Signing</th><th>Duration</th><th>Output</th></tr>${L.map((b) => { const [l, c] = stageOf(b); return `<tr data-b="${b.id}" class="${b.id === BuildStore.sel ? 'on' : ''}" style="cursor:pointer"><td>${b.id}</td><td>${esc(b.project)}</td><td><span class="tag">${esc(b.type || 'release')}</span></td><td class="${c}">${l}</td><td>${SIGN[b.signing] ? `<span class="tag ${SIGN[b.signing][1]}">${SIGN[b.signing][0]}</span>` : ''}</td><td class="mu">${fmtDur(elapsed(b))}</td><td>${outputsOf(b).map((f) => `<a href="/download/${b.id}/${encodeURIComponent(f)}?t=${TOKEN}">⬇ ${esc(f)}</a> <span class="mu">${fmtSize(b.sizes?.[f])}</span>`).join(' ')}</td></tr>`; }).join('') || '<tr><td colspan=7 class="mu" style="padding:14px">No builds yet</td></tr>'}</table></div>`;
  $$('tr[data-b]', body).forEach((r) => r.onclick = (e) => { if (e.target.tagName !== 'A') { BuildStore.select(r.dataset.b); showBottom('build'); } });
}
async function drawBuildPane() {
  const b = BuildStore.cur, body = $('#bbody');
  if (!b) { body.innerHTML = `<div class="hints" style="padding:24px;flex:1">Press <b>▶ Run</b> (<kbd>Shift</kbd>+<kbd>F10</kbd>) to build your app.<br>The APK is built in the cloud on <b>GitHub Actions</b> — progress and the download link appear here.</div>`; return; }
  const keep = { steps: $('.steps', body)?.scrollTop || 0, log: $('.logp', body)?.scrollTop || 0, atEnd: false };
  const steps = (BuildStore.jobs[b.id] || [])[0]?.steps || [], fin = FINALS.includes(b.stage), p = buildPhase(b, steps), outs = outputsOf(b), [l, c] = stageOf(b);
  const lg = fin ? logCache[b.id] : BuildStore.live[b.id];
  if (fin && logCache[b.id] === undefined) { logCache[b.id] = null; BuildStore.log(b.id).then((t) => { logCache[b.id] = t || '(no log)'; if (bTab === 'build') drawBuildPane(); }).catch(() => logCache[b.id] = '(log unavailable)'); }
  const kind = b.type === 'bundle' ? 'AAB' : 'APK';
  const signNote = { custom: `Signed with your keystore${signInfo.alias ? ` (alias <b>${esc(signInfo.alias)}</b>)` : ''} — ready to install${b.type === 'bundle' ? ' / upload to Play Console' : ''}.`, test: 'Signed with a temporary test key — installs fine for testing, but not suitable for Play Store or app updates. Add your keystore in <b>Signing</b>.', debug: 'Signed with the debug key — for testing only.' }[b.signing] || '';
  let out = '';
  if (b.stage === 'done' && outs.length) out = `<div class="outcard"><div style="flex:1;min-width:240px"><b class="ok">✔ Your ${kind} is ready</b><div class="mu" style="margin-top:2px">${signNote}</div><div class="mu">${b.type === 'bundle' ? 'Upload the .aab in Play Console ▸ Production ▸ Create release.' : 'On your phone: download the APK, open it and allow “Install unknown apps”.'}</div></div>${outs.map((f) => `<a class="btn" href="/download/${b.id}/${encodeURIComponent(f)}?t=${TOKEN}" download>⬇ Download ${esc(f)} <span style="opacity:.8">· ${fmtSize(b.sizes?.[f])}</span></a>`).join('')}</div>`;
  else if (b.stage === 'failed' || b.stage === 'error') out = `<div class="outcard bad"><div style="flex:1"><b class="er">✖ Build ${b.stage === 'failed' ? 'failed' : 'error'}</b><div class="mu">${esc(p.detail)} — see the log on the right for details.</div></div><button class="s" id="bb-copy">Copy log</button></div>`;
  const head = `<div class="bhead"><b>Build #${b.id}</b><span class="tag">${esc(b.type || 'release')}</span>${SIGN[b.signing] ? `<span class="tag ${SIGN[b.signing][1]}">${SIGN[b.signing][0]}</span>` : ''}<span class="mu">${esc(b.project)}${b.message ? ' · ' + esc(b.message) : ''}</span><span class="grow"></span><span class="mu">⏱ <span class="elapsed" data-id="${b.id}">${fmtDur(elapsed(b))}</span></span>${!fin ? '<button class="d" id="bb-cancel">Cancel</button>' : '<button class="s" id="bb-rm">Remove</button>'}</div>`;
  const where = fin ? '' : `<div class="where">☁ Building on <b>GitHub Actions</b> (cloud). Your project was uploaded as a zip — the ${kind} will appear here automatically when it is ready.</div>`;
  const cur = `<div class="curline">${p.state === 'fail' ? '<span class="er">✖</span>' : fin ? '<span class="ok">✔</span>' : '<span class="spin"></span>'} <b>${PHASES[Math.min(p.idx, 5)][1]}</b> — ${esc(p.detail)}</div>`;
  const stepsHtml = steps.length ? steps.map((s) => `<div class="stp ${s.status === 'in_progress' ? 'run' : ''}">${stepIcon(s)}<span>${esc(s.name)}</span><span class="t">${stepDur(s)}</span></div>`).join('') : `<div class="stp mu">${fin ? '' : '<span class="spin"></span> '}${esc(l)}</div>`;
  const logText = lg || (fin ? 'Loading log…' : 'Live log appears here when GitHub provides it.\nThe pipeline above shows exactly where your build is.');
  body.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:auto">${head}${pipelineHtml(b, steps)}${where}${cur}${out}<div class="bpane" style="border-top:1px solid var(--border);margin-top:6px"><div class="steps">${stepsHtml}</div><div class="logp">${esc(logText)}</div></div></div>`;
  const st = $('.steps', body), lp = $('.logp', body); if (st) st.scrollTop = keep.steps; if (lp) lp.scrollTop = fin || !lg ? keep.log : lp.scrollHeight;
  $('#bb-cancel') && ($('#bb-cancel').onclick = cancelBuild); $('#bb-copy') && ($('#bb-copy').onclick = () => { navigator.clipboard?.writeText(logCache[b.id] || ''); toast('Log copied'); });
  $('#bb-rm') && ($('#bb-rm').onclick = guard(async () => { await api(`/api/builds/${b.id}`, 'DELETE'); BuildStore.sel = null; BuildStore.refresh(); }));
}
setInterval(() => { $$('.elapsed').forEach((s) => { const b = BuildStore.list.find((x) => x.id === s.dataset.id); if (b) s.textContent = fmtDur(elapsed(b)); }); const ab = activeBuild(); if (ab && $('#st-el')) $('#st-el').textContent = fmtDur(elapsed(ab)); }, 1000);

// ================= Find in Files =================
function findDialog(replace) {
  const sel = E.editor && E.activePath ? E.editor.getModel().getValueInRange(E.editor.getSelection()) : '';
  const m = modal(`<h3>${replace ? 'Replace in Files' : 'Find in Files'}</h3><label>Search for</label><input id="f-q" value="${esc(sel.split('\n')[0] || FIND.q)}" spellcheck="false">${replace ? '<label>Replace with</label><input id="f-r" spellcheck="false">' : ''}<div class="row" style="margin-top:8px"><label style="display:flex;gap:6px;align-items:center;margin:0;color:var(--text)"><input type="checkbox" id="f-cs" ${FIND.cs ? 'checked' : ''}> Match case</label><label style="display:flex;gap:6px;align-items:center;margin:0 0 0 14px;color:var(--text)"><input type="checkbox" id="f-re" ${FIND.regex ? 'checked' : ''}> Regular expression</label></div><div class="foot"><button class="s" id="f-c">Cancel</button><button id="f-go">${replace ? 'Find' : 'Find'}</button></div>`);
  const go = guard(async () => { FIND.q = m.$('#f-q').value; FIND.cs = m.$('#f-cs').checked; FIND.regex = m.$('#f-re').checked; FIND.to = replace ? m.$('#f-r').value : undefined; FIND.replaceMode = !!replace; m.close(); await runFind(); });
  m.$('#f-c').onclick = m.close; m.$('#f-go').onclick = go; m.$('#f-q').onkeydown = (e) => { if (e.key === 'Enter') go(); }; m.$('#f-q').focus(); m.$('#f-q').select();
}
async function runFind() {
  if (!FIND.q) return; const r = await api(base() + '/search', 'POST', { q: FIND.q, regex: FIND.regex, cs: FIND.cs });
  Object.assign(FIND, r); showBottom('find');
}
function drawFindPane(body) {
  if (!FIND.q) { body.innerHTML = `<div class="hints" style="padding:24px;flex:1">Use <b>Find in Files</b> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>) to search the whole project.</div>`; return; }
  const by = {}; for (const r of FIND.results) (by[r.path] ||= []).push(r);
  body.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;min-width:0"><div class="bhead"><b>${FIND.results.length}${FIND.truncated ? '+' : ''}</b> matches in <b>${FIND.files}</b> file(s) for <code>${esc(FIND.q)}</code><span class="grow"></span>${FIND.replaceMode ? `<span class="mu">Replace with <code>${esc(FIND.to ?? '')}</code></span><button id="f-all">Replace All</button>` : '<button class="s" id="f-rep">Replace…</button>'}</div><div class="pscroll" style="padding:4px 6px">${Object.entries(by).map(([p, rs]) => `<div class="mu" style="padding:6px 6px 2px">${fileIcon(p)} <b style="color:var(--text)">${esc(baseName(p))}</b> ${esc(p)} (${rs.length})</div>${rs.map((r) => `<div class="pr" data-p="${esc(r.path)}" data-l="${r.line}" data-c="${r.col}"><span class="mu">${r.line}:${r.col}</span> &nbsp;${esc(r.text.slice(0, r.col - 1))}<mark style="background:#ffd54a55;color:inherit">${esc(r.text.slice(r.col - 1, r.col - 1 + r.len))}</mark>${esc(r.text.slice(r.col - 1 + r.len))}</div>`).join('')}`).join('') || '<div class="mu" style="padding:12px">No matches</div>'}</div></div>`;
  $$('.pr', body).forEach((r) => r.onclick = () => E.reveal(r.dataset.p, +r.dataset.l, +r.dataset.c));
  $('#f-rep') && ($('#f-rep').onclick = () => findDialog(true));
  $('#f-all') && ($('#f-all').onclick = guard(async () => {
    if (!confirm(`Replace ${FIND.results.length}${FIND.truncated ? '+' : ''} occurrence(s) of "${FIND.q}" with "${FIND.to ?? ''}" in ${FIND.files} file(s)?`)) return;
    await E.saveAll(); const r = await api(base() + '/replace', 'POST', { q: FIND.q, to: FIND.to ?? '', regex: FIND.regex, cs: FIND.cs });
    const act = E.activePath; await E.closeAll(); await E.reload(); if (act) E.open(act); toast(`✅ Replaced ${r.replaced} occurrence(s) in ${r.files} file(s)`); FIND.replaceMode = false; await runFind();
  }));
}

// ================= Status bar / title / balloons =================
function drawStatus() {
  const b = BuildStore.list.find((x) => x.project === proj) || BuildStore.cur, act = activeBuild(), steps = act ? (BuildStore.jobs[act.id] || [])[0]?.steps || [] : [];
  const p = act ? buildPhase(act, steps) : null, pct = act ? Math.round(((p.idx + (p.state === 'run' ? .5 : 0)) / 6) * 100) : 0;
  let left = '<span class="it">Ready</span>';
  if (act) left = `<span class="it c" id="st-b"><span class="spin"></span> Build #${act.id}: ${esc(PHASES[Math.min(p.idx, 5)][1])} · <span id="st-el">${fmtDur(elapsed(act))}</span></span><div class="pbar"><i style="width:${pct}%"></i></div><span class="it">GitHub Actions</span>`;
  else if (b) left = `<span class="it c" id="st-b">${b.stage === 'done' ? '<span class="ok">✔</span>' : b.stage === 'queued' ? '🕐' : '<span class="er">✖</span>'} Build #${b.id} ${esc(stageOf(b)[0].toLowerCase())}${outputsOf(b).length && b.stage === 'done' ? ` · ${esc(outputsOf(b)[0])}` : ''}</span>`;
  const ext = (E?.activePath || '').split('.').pop();
  $('#statusbar').innerHTML = `${left}<div class="grow"></div><span class="it c" id="st-sign" title="Signing & Keystore">${signInfo.has ? `🔑 ${esc(signInfo.alias)}` : '<span class="wn">⚠ no keystore</span>'}</span><span class="it">${pos[0]}:${pos[1]}</span><span class="it">LF</span><span class="it">UTF-8</span><span class="it">${E?.settings?.tabSize || 4} spaces</span><span class="it">${({ java: 'Java', kt: 'Kotlin', xml: 'XML', svg: 'SVG', gradle: 'Gradle', json: 'JSON', properties: 'Properties', html: 'HTML', js: 'JavaScript' })[ext] || (E?.activePath ? 'Text' : '')}</span>`;
  $('#st-b') && ($('#st-b').onclick = () => showBottom('build')); $('#st-sign').onclick = () => proj && signDialog();
  $('#tb-stop') && ($('#tb-stop').disabled = !act);
  document.title = act ? `⏳ ${PHASES[Math.min(p.idx, 5)][1]}… — Android Builder` : (b && b.stage === 'done' && Date.now() - (b.finishedAt || 0) < 120000 ? '✔ APK ready — Android Builder' : 'Android Builder');
}
const refreshSign = () => proj ? api(base() + '/signing').then((s) => { signInfo = s; drawStatus(); }).catch(() => {}) : null;
BuildStore.onFinish((b) => {
  const outs = outputsOf(b);
  if (b.stage === 'done' && outs.length) balloon({ title: `Build #${b.id} succeeded`, kind: 'ok', text: `${esc(b.project)} · ${outs.map((f) => `${esc(f)} (${fmtSize(b.sizes?.[f])})`).join(', ')} · ${fmtDur(elapsed(b))}`, actions: [...outs.map((f) => ({ label: `⬇ ${f}`, href: `/download/${b.id}/${encodeURIComponent(f)}?t=${TOKEN}`, download: true })), { label: 'Show', run: () => { BuildStore.select(b.id); showBottom('build'); } }] });
  else balloon({ title: `Build #${b.id} ${b.stage === 'failed' ? 'failed' : 'error'}`, kind: 'er', sticky: true, text: esc(b.note || `${b.project} — open the Build window for the log`), actions: [{ label: 'Show log', run: () => { BuildStore.select(b.id); showBottom('build'); } }] });
});

// ================= Welcome =================
function showWelcome() { api('/api/projects').then((l) => { projects = l; drawWelcome(); }); }
function drawWelcome() {
  const w = $('#welcome'); w.classList.add('show');
  w.innerHTML = `<div class="wl"><div class="brand">${ANDROID()}<div>Android Builder<small>Cloud APK builds · GitHub Actions</small></div></div><div class="it on">📁 &nbsp;Projects</div><div class="it" id="w-set">⚙ &nbsp;Settings</div><div class="it" id="w-theme">🎨 &nbsp;Theme: ${Theme.get() === 'dark' ? 'Darcula' : 'IntelliJ Light'}</div><div class="it" id="w-keys">⌨ &nbsp;Keyboard shortcuts</div><div class="grow"></div><div class="it" id="w-out">⏻ &nbsp;Sign out (${esc(ME?.username || '')})</div></div>
    <div class="wr"><h1>Welcome to Android Builder</h1><div class="sub">Create a new project, import one from Google AI Studio, or open an existing project.</div>
    <div class="wact"><div class="wbtn" id="w-new"><div class="ico">＋</div><b>New Project</b><span>Java, Kotlin Compose or Web app</span></div><div class="wbtn" id="w-ai"><div class="ico">✨</div><b>Import from AI Studio</b><span>ZIP export or pasted code</span></div><div class="wbtn" id="w-imp"><div class="ico">⬆</div><b>Import ZIP</b><span>Android Studio project</span></div>${proj ? `<div class="wbtn" id="w-back"><div class="ico">↩</div><b>Back to project</b><span>${esc(proj)}</span></div>` : ''}</div>
    <b>Recent projects</b><div style="margin-top:8px">${projects.map((n) => `<div class="rec" data-n="${esc(n)}"><div class="ico">${esc(n[0].toUpperCase())}</div><div><b>${esc(n)}</b><div class="mu">workspace / ${esc(ME.username)} / ${esc(n)}</div></div></div>`).join('') || '<div class="mu">No projects yet — create one to get started</div>'}</div></div>`;
  $('#w-new').onclick = newProject; $('#w-ai').onclick = () => importDialog('zip'); $('#w-imp').onclick = () => importDialog('zip'); $('#w-out').onclick = () => logout(); $('#w-keys').onclick = openShortcuts; $('#w-set').onclick = () => openSettings();
  $('#w-theme').onclick = () => { Theme.toggle(); drawWelcome(); }; $('#w-back') && ($('#w-back').onclick = hideWelcome);
  $$('.rec', w).forEach((r) => r.onclick = () => openProject(r.dataset.n));
}
const hideWelcome = () => $('#welcome').classList.remove('show');

// ================= Projects =================
async function openProject(name) {
  if (!(await E.setBase(null))) return;
  proj = name; localStorage.setItem('last-project', name); hideWelcome();
  if (!(await E.setBase(base()))) return;
  drawChrome(); drawStatus(); refreshSign();
  const main = E.files.find((f) => /MainActivity\.(java|kt)$/.test(f.path)) || E.files.find((f) => /(^|\/)(package\.json|index\.html)$/.test(f.path)); if (main) E.open(main.path);
}
async function closeProject() { if (!(await E.setBase(null))) return; proj = ''; localStorage.removeItem('last-project'); drawChrome(); drawStatus(); showWelcome(); }
const delProject = guard(async () => { if (!proj || !confirm(`Delete project "${proj}", its code and keystore?`)) return; await E.setBase(null); await api('/api/projects/' + encodeURIComponent(proj), 'DELETE'); proj = ''; localStorage.removeItem('last-project'); drawChrome(); showWelcome(); });
const exportZip = guard(async () => { if (!proj) return; const r = await fetch(base() + '/export', { headers: { 'x-auth': TOKEN } }); const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = proj + '.zip'; a.click(); });
const idOf = (n) => n.trim().replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 40);
const defPkg = (n) => { let x = n.toLowerCase().replace(/[^a-z0-9]/g, ''); if (!x || /^\d/.test(x)) x = 'app' + x; return 'com.example.' + x; };

// ---- New Project wizard (2 steps, like Android Studio) ----
const PHONE = (fill) => `<svg viewBox="0 0 70 110"><rect x="3" y="3" width="64" height="104" rx="9" fill="#1e1e1e" stroke="#777" stroke-width="3"/>${fill}</svg>`;
const THUMB = {
  blank: PHONE('<text x="35" y="60" text-anchor="middle" fill="#777" font-size="11">empty</text>'),
  'empty-activity': PHONE('<rect x="9" y="12" width="52" height="10" fill="#6200ee"/><text x="35" y="62" text-anchor="middle" fill="#ddd" font-size="9">Hello</text><text x="35" y="73" text-anchor="middle" fill="#ddd" font-size="9">World!</text>'),
  compose: PHONE('<rect x="9" y="12" width="52" height="8" fill="#4285F4"/><circle cx="35" cy="55" r="12" fill="#3DDC84"/><text x="35" y="85" text-anchor="middle" fill="#ddd" font-size="9">Compose</text>'),
  webview: PHONE('<rect x="9" y="12" width="52" height="9" rx="3" fill="#555"/><circle cx="35" cy="58" r="17" fill="none" stroke="#4A88C7" stroke-width="3"/><path d="M18 58h34M35 41c-9 9-9 25 0 34M35 41c9 9 9 25 0 34" stroke="#4A88C7" stroke-width="2" fill="none"/>'),
};
const TEMPLATES = [['blank', 'No Activity', 'Blank codespace — empty'], ['empty-activity', 'Empty Views Activity', 'Java · AppCompat · XML layout'], ['compose', 'Empty Activity', 'Kotlin · Jetpack Compose'], ['webview', 'Web App (WebView)', 'HTML / React / Vite web app → APK']];
function newProject() {
  let kind = 'empty-activity', step = 1, pkgTouched = false; const v = { name: 'My Application', pkg: 'com.example.myapplication', sdk: '24' };
  const m = modal('', { xl: true });
  const draw = () => {
    if (step === 1) m.el.innerHTML = `<h3>New Project</h3><div class="steps-ind">Step 1 of 2 — Select a template</div><div class="wiz"><div class="cat"><div class="on">📱 Phone and Tablet</div><div class="mu">⌚ Wear OS <small>(soon)</small></div><div class="mu">📺 TV <small>(soon)</small></div></div>
      <div style="flex:1"><div class="tpls" style="flex-wrap:wrap">${TEMPLATES.map(([k, n, d]) => `<div class="tpl ${kind === k ? 'on' : ''}" data-k="${k}" style="min-width:150px;max-width:170px">${THUMB[k]}<br><b>${n}</b><div class="mu">${d}</div></div>`).join('')}</div>
      <div class="mu" style="margin-top:6px">${{ blank: 'Creates an empty codespace — add your own files or import a project.', 'empty-activity': 'Creates a new empty activity with a Hello World XML layout (Java, AppCompat).', compose: 'Creates a Jetpack Compose activity in Kotlin — the kind of code Gemini / AI Studio usually writes.', webview: 'Wraps a web app (e.g. exported from Google AI Studio) in an Android WebView. It is built with npm on GitHub.' }[kind]}</div></div></div><div class="foot"><button class="s" id="wc">Cancel</button><button class="s" disabled>Previous</button><button id="wn">Next</button></div>`;
    else m.el.innerHTML = `<h3>New Project</h3><div class="steps-ind">Step 2 of 2 — ${TEMPLATES.find((t) => t[0] === kind)[1]}</div><div style="max-width:520px"><label>Name</label><input id="pn" value="${esc(v.name)}">
      ${kind === 'blank' ? '' : `<label>Package name</label><input id="pp" value="${esc(v.pkg)}"><label>Save location</label><input disabled value="workspace/${esc(ME.username)}/${esc(idOf(v.name))}"><div class="row"><div style="flex:1"><label>Language</label><select disabled><option>${kind === 'compose' ? 'Kotlin' : 'Java'}</option></select></div><div style="flex:1"><label>Minimum SDK</label><select id="ps">${[[21, '5.0'], [23, '6.0'], [24, '7.0'], [26, '8.0'], [28, '9'], [30, '11'], [33, '13']].map(([a, n]) => `<option value="${a}" ${String(a) === v.sdk ? 'selected' : ''}>API ${a} (Android ${n})</option>`).join('')}</select></div></div><div class="row"><div style="flex:1"><label>Build configuration language</label><select disabled><option>Groovy DSL (build.gradle)</option></select></div></div>`}</div>
      <div class="foot"><button class="s" id="wc">Cancel</button><button class="s" id="wp">Previous</button><button id="wf">Finish</button></div>`;
    m.$('#wc').onclick = m.close;
    if (step === 1) { m.$$('.tpl').forEach((t) => t.onclick = () => { kind = t.dataset.k; draw(); }); m.$('#wn').onclick = () => { step = 2; draw(); }; }
    else {
      m.$('#wp').onclick = () => { v.name = m.$('#pn').value; if (m.$('#pp')) v.pkg = m.$('#pp').value; step = 1; draw(); };
      m.$('#pn').oninput = () => { v.name = m.$('#pn').value; if (!pkgTouched && m.$('#pp')) { v.pkg = defPkg(v.name); m.$('#pp').value = v.pkg; } };
      m.$('#pp') && (m.$('#pp').oninput = () => { pkgTouched = true; v.pkg = m.$('#pp').value; });
      m.$('#wf').onclick = guard(async () => {
        const appName = m.$('#pn').value.trim(), id = idOf(appName); if (!id) throw new Error('Enter a project name');
        const r = await api('/api/projects', 'POST', { name: id, kind, appName, package: m.$('#pp')?.value.trim(), minSdk: m.$('#ps')?.value });
        m.close(); projects = await api('/api/projects'); await openProject(id); if (r.open) E.open(r.open); toast('✅ Project created');
      });
    }
  };
  draw();
}

// ---- Import from Google AI Studio / ZIP / pasted code ----
function parsePasted(text) {
  const files = [], re = /```([\w+#.-]*)[^\n]*\n([\s\S]*?)```/g; let m;
  const fromHint = (h) => { const all = [...h.matchAll(/([A-Za-z0-9_./-]+\.(?:kt|java|xml|gradle|kts|json|properties|html|js|ts|tsx|jsx|css|pro|toml|md|txt))\b/g)]; return all.length ? all[all.length - 1][1] : ''; };
  const guess = (code, lang) => {
    const pkg = (code.match(/^\s*package\s+([\w.]+)/m) || [])[1], ext = /kotlin|kt/.test(lang) ? 'kt' : 'java';
    if (/^(java|kotlin|kt)$/.test(lang) || pkg) { const cn = (code.match(/\b(?:class|object|interface|enum)\s+(\w+)/) || [])[1]; if (pkg && cn) return `app/src/main/java/${pkg.replace(/\./g, '/')}/${cn}.${ext}`; }
    if (/<manifest\b/.test(code)) return 'app/src/main/AndroidManifest.xml';
    if (/<resources>[\s\S]*<string\b/.test(code)) return 'app/src/main/res/values/strings.xml';
    if (/<resources>[\s\S]*<style\b/.test(code)) return 'app/src/main/res/values/themes.xml';
    if (/xmlns:android/.test(code) && /<(Linear|Constraint|Frame|Relative|Scroll)[\w.]*Layout|<ScrollView/.test(code)) return 'app/src/main/res/layout/activity_main.xml';
    if (/include\s+['":]/.test(code) && /rootProject\.name|pluginManagement/.test(code)) return 'settings.gradle';
    if (/^\s*plugins\s*\{[\s\S]*com\.android\.application/m.test(code) && /\bandroid\s*\{/.test(code)) return 'app/build.gradle';
    if (/^\s*plugins\s*\{/m.test(code) && /apply false/.test(code)) return 'build.gradle';
    return '';
  };
  // a bare file name ("MainActivity.kt", "strings.xml") -> the proper Android location
  const place = (path, code) => {
    if (!path || path.includes('/')) return path;
    const pkg = (code.match(/^\s*package\s+([\w.]+)/m) || [])[1];
    if (/\.(kt|java)$/.test(path)) return pkg ? `app/src/main/java/${pkg.replace(/\./g, '/')}/${path}` : `app/src/main/java/${path}`;
    if (path === 'AndroidManifest.xml') return 'app/src/main/AndroidManifest.xml';
    if (/^(strings|colors|themes|styles|dimens)\.xml$/.test(path)) return `app/src/main/res/values/${path}`;
    if (/^(activity|fragment|item|layout|view)_[\w]+\.xml$/.test(path)) return `app/src/main/res/layout/${path}`;
    if (/^ic_[\w]+\.xml$/.test(path)) return `app/src/main/res/drawable/${path}`;
    if (path === 'build.gradle' && /\bandroid\s*\{/.test(code)) return 'app/build.gradle';
    return path;
  };
  while ((m = re.exec(text))) {
    const lang = (m[1] || '').toLowerCase(); let code = m[2].replace(/\s+$/, '') + '\n';
    const hint = text.slice(Math.max(0, m.index - 300), m.index).split('\n').filter((l) => l.trim()).slice(-2).join(' ');
    let path = fromHint(hint), guessed = false;
    const fm = code.split('\n')[0].match(/^(?:\/\/|#|<!--|\/\*)\s*(?:file(?:path|name)?:?\s*)?([A-Za-z0-9_./-]+\.\w+)\s*(?:-->|\*\/)?\s*$/i);
    if (fm && (/\//.test(fm[1]) || !path)) { path = path || fm[1]; code = code.split('\n').slice(1).join('\n'); }
    if (!path) { path = guess(code, lang); guessed = !!path; } else path = place(path, code);
    files.push({ path, code, lang, ok: !!path, guessed });
  }
  return files;
}
function importDialog(tab = 'zip') {
  let cur = tab, parsed = [];
  const m = modal('', { xl: true });
  const draw = () => {
    m.el.innerHTML = `<h3>✨ Import project — Google AI Studio / Android Studio</h3><div class="tabs-i">${[['zip', 'ZIP export'], ['paste', 'Paste code'], ['help', 'How it works']].map(([k, l]) => `<span class="${cur === k ? 'on' : ''}" data-k="${k}">${l}</span>`).join('')}</div><div id="ib" style="min-height:300px"></div><div class="foot"><button class="s" id="ic">Close</button><span id="ia"></span></div>`;
    m.$$('.tabs-i span').forEach((s) => s.onclick = () => { cur = s.dataset.k; draw(); }); m.$('#ic').onclick = m.close;
    const b = m.$('#ib');
    if (cur === 'help') b.innerHTML = `<div class="help"><p><b>1. Export from Google AI Studio</b> — open your app, choose <i>Download / Export ▸ ZIP</i> (or export to GitHub and download the ZIP).</p><p><b>2. Import here</b> — the type is detected automatically:</p><ul><li><b>Android project</b> (has <code>settings.gradle</code>) — imported as-is and built with Gradle.</li><li><b>Web app</b> (React / Vite / plain HTML: <code>package.json</code> or <code>index.html</code>) — wrapped in an Android <b>WebView</b> app. Your sources go to <code>webapp/</code>; on GitHub <code>npm run build</code> runs and the result is bundled into the APK.</li></ul><p><b>3. Pasted code</b> — if AI Studio gave you code in the chat, paste the whole answer in the <i>Paste code</i> tab: files are detected from the headings / first-line comments / package names.</p><p class="mu">API keys: for web apps add a <code>webapp/.env</code> file (e.g. <code>GEMINI_API_KEY=…</code>) — it is read at build time and ends up inside the APK, so treat the APK as public.</p></div>`;
    if (cur === 'zip') {
      b.innerHTML = `<div class="drop" id="drop"><div style="font-size:30px">📦</div><b>Choose a .zip file</b><div class="mu">Android project or web app export</div><input type="file" id="zf" accept=".zip"></div><div class="fg" style="margin-top:12px"><div><label>Project name</label><input id="zn"></div><div><label>App name (web apps)</label><input id="za"></div><div><label>Package (web apps)</label><input id="zp" value="com.example.webapp"></div></div><div id="zinfo" class="mu" style="margin-top:8px"></div>`;
      const f = b.querySelector('#zf');
      f.onchange = () => { const file = f.files[0]; if (!file) return; const n = idOf(file.name.replace(/\.zip$/i, '')) || 'imported-app'; b.querySelector('#zn').value = n; b.querySelector('#za').value = n.replace(/[-_]+/g, ' '); b.querySelector('#zp').value = defPkg(n); b.querySelector('#zinfo').textContent = `${file.name} · ${fmtSize(file.size)}`; };
      m.$('#ia').innerHTML = '<button id="zgo">Import</button>';
      m.$('#zgo').onclick = guard(async () => {
        const file = f.files[0]; if (!file) throw new Error('Choose a zip file first'); const name = b.querySelector('#zn').value.trim(); if (!name) throw new Error('Enter a project name');
        m.$('#zgo').disabled = true; toast('Importing…');
        const r = await api('/api/projects/import', 'POST', { name, appName: b.querySelector('#za').value, package: b.querySelector('#zp').value, zip: await b64(file) });
        m.close(); projects = await api('/api/projects'); await openProject(name); if (r.open) E.open(r.open);
        toast(r.type === 'web' ? '✅ Web app imported and wrapped as an Android WebView project' : '✅ Android project imported');
        if (r.type === 'web') balloon({ title: 'Web app imported', kind: 'ok', text: 'Your web sources are in <b>webapp/</b>. Add <code>webapp/.env</code> if the app needs an API key, then press ▶ Run.', actions: [{ label: 'Open webapp/', run: () => E.open('webapp/README.txt') }] });
      });
    }
    if (cur === 'paste') {
      b.innerHTML = `<label>Paste the code from AI Studio (all files / the whole answer)</label><textarea id="pt" rows="8" style="width:100%;font-family:ui-monospace,monospace;font-size:12px" placeholder="Paste markdown with \`\`\`kotlin … \`\`\` code blocks here"></textarea><div class="row"><button class="s" id="pp">Detect files</button><span class="mu" id="pc"></span></div><div id="pl"></div>`;
      const tgt = () => (m.$('[name=tg]:checked') || {}).value || 'new';
      const list = () => {
        b.querySelector('#pc').textContent = parsed.length ? `${parsed.length} code block(s) found` : '';
        b.querySelector('#pl').innerHTML = parsed.length ? `<table class="tbl2" style="margin-top:8px"><thead><tr><th style="width:30px"></th><th>Path in project</th><th style="width:70px">Lines</th><th style="width:90px">Lang</th></tr></thead><tbody>${parsed.map((f, i) => `<tr><td><input type="checkbox" data-c="${i}" ${f.ok ? 'checked' : ''}></td><td><input data-p="${i}" value="${esc(f.path)}" placeholder="enter a path…" style="width:100%">${f.guessed ? '<div class="wn" style="font-size:11px">⚠ path guessed — please check</div>' : ''}</td><td class="mu">${f.code.split('\n').length - 1}</td><td class="mu">${esc(f.lang || '—')}</td></tr>`).join('')}</tbody></table>
          <div class="row" style="margin-top:10px"><label class="opt on" style="margin:0"><input type="radio" name="tg" value="new" checked><div><b>Create a new project</b><div class="mu">Template is chosen from the code (Kotlin → Compose, Java → Views)</div></div></label><label class="opt" style="margin:0"><input type="radio" name="tg" value="cur" ${proj ? '' : 'disabled'}><div><b>Add to current project</b><div class="mu">Existing files with the same path are overwritten</div></div></label></div><div id="pn-w"><label>New project name</label><input id="pnm" value="ai-studio-app"></div>` : '';
        b.querySelectorAll('[data-c]').forEach((x) => x.onchange = () => parsed[+x.dataset.c].ok = x.checked); b.querySelectorAll('[data-p]').forEach((x) => x.oninput = () => parsed[+x.dataset.p].path = x.value.trim());
        b.querySelectorAll('[name=tg]').forEach((r) => r.onchange = () => { b.querySelectorAll('.opt').forEach((o) => o.classList.toggle('on', o.querySelector('input').checked)); b.querySelector('#pn-w').style.display = r.value === 'new' ? '' : 'none'; });
      };
      b.querySelector('#pp').onclick = () => { parsed = parsePasted(b.querySelector('#pt').value); if (!parsed.length) toast('No ``` code blocks found'); list(); };
      m.$('#ia').innerHTML = '<button id="pgo">Import selected files</button>';
      m.$('#pgo').onclick = guard(async () => {
        const sel = parsed.filter((f) => f.ok && f.path); if (!sel.length) throw new Error('Select at least one file with a path');
        if (sel.some((f) => f.path.startsWith('/') || f.path.includes('..'))) throw new Error('Paths must be relative to the project root');
        let target = tgt();
        if (target === 'new') {
          const name = idOf(b.querySelector('#pnm').value); if (!name) throw new Error('Enter a project name');
          const kt = sel.some((f) => /\.kt$/.test(f.path)), pkg = (sel.map((f) => f.code.match(/^\s*package\s+([\w.]+)/m)?.[1]).find(Boolean)) || defPkg(name), hasGradle = sel.some((f) => /(^|\/)settings\.gradle(\.kts)?$/.test(f.path));
          const r = await api('/api/projects', 'POST', { name, kind: hasGradle ? 'blank' : kt ? 'compose' : sel.some((f) => /\.java$/.test(f.path)) ? 'empty-activity' : 'blank', appName: name, package: pkg, minSdk: 24 });
          proj = name; localStorage.setItem('last-project', name);
          const main = sel.find((f) => /MainActivity\.(java|kt)$/.test(f.path)); if (main && r.open && r.open !== main.path) await api(`/api/p/${owner}/${encodeURIComponent(name)}/file?path=${encodeURIComponent(r.open)}`, 'DELETE');
        }
        for (const f of sel) await api(`/api/p/${owner}/${encodeURIComponent(proj)}/file`, 'PUT', { path: f.path, content: f.code });
        m.close(); projects = await api('/api/projects'); await openProject(proj); E.open(sel[0].path); toast(`✅ Imported ${sel.length} file(s)`);
      });
    }
  };
  draw();
}

// ================= Build / Run =================
async function runBuild(type, message = '', force = false) {
  if (!proj) return toast('Open a project first'); await E.saveAll();
  try {
    const b = await api('/api/build', 'POST', { project: proj, type, message, force }); BuildStore.sel = b.id; await BuildStore.refresh(); showBottom('build');
    balloon({ title: `${TLABEL[type] || type} build started`, text: 'Your project is being uploaded to <b>GitHub Actions</b> and built in the cloud. Follow the progress in the Build window — the download appears there when it is done.', actions: [] });
    if (type !== 'debug' && !signInfo.has) toast('⚠️ No keystore — the build will use a temporary test key');
  } catch (e) {
    if (!e.data?.lint) throw e;
    const m = modal(`<h3 class="er">❌ ${esc(e.message)}</h3><div class="err-list">${e.data.lint.map((x) => `<div class="pr" data-f="${esc(x.file)}" data-l="${x.line}">${esc(x.file)}:${x.line} — ${esc(x.message)}</div>`).join('')}</div><div class="foot"><button class="s" id="bf">Build anyway</button><button id="bg">Fix errors</button></div>`);
    m.$('#bf').onclick = guard(async () => { m.close(); await runBuild(type, message, true); }); m.$('#bg').onclick = () => m.close();
    m.$$('.pr').forEach((r) => r.onclick = async () => { m.close(); await E.reveal(r.dataset.f, +r.dataset.l, 1); });
  }
}
const cancelBuild = guard(async () => { const b = activeBuild(); if (b) { await api(`/api/builds/${b.id}/cancel`, 'POST'); toast('Cancel requested'); } });
const buildDialog = guard(async () => {
  if (!proj) return; const sg = await api(base() + '/signing'); const first = CFG.types.find((t) => t.id === curType && t.enabled) || CFG.types.find((t) => t.enabled);
  if (!first) return toast('The admin has disabled all build types');
  const DESC = { debug: 'Fast test build · signed with the debug key', release: 'Installable signed APK', bundle: '.aab for Play Console' };
  const m = modal(`<h3>Build with Options — ${esc(proj)}</h3><label>Build type</label>${CFG.types.map((t) => `<label class="opt ${t.enabled ? '' : 'off'} ${t.id === first.id ? 'on' : ''}"><input type="radio" name="bt" value="${t.id}" ${t.enabled ? '' : 'disabled'} ${t.id === first.id ? 'checked' : ''}><div><b>${esc(t.label)}</b>${t.enabled ? '' : ' <span class="er">(disabled by admin)</span>'}<div class="mu">${DESC[t.id]}</div></div></label>`).join('')}
    <div id="sgs" class="card" style="cursor:default"></div><label>Note (optional)</label><input id="bn"><div class="foot"><button class="s" id="bs">🔏 Signing</button><button class="s" id="bc">Cancel</button><button id="bk">Build</button></div>`);
  const sgShow = () => { const t = m.el.querySelector('[name=bt]:checked').value; m.$('#sgs').innerHTML = t === 'debug' ? '<span class="mu">Debug builds are signed with the Android debug key.</span>' : sg.has ? `<b class="ok">🔏 The project keystore/ will be used</b> <span class="mu">(alias: ${esc(sg.alias)})</span>` : '<b class="wn">⚠️ No keystore — a temporary test key will be used</b>'; };
  m.$$('.opt').forEach((o) => o.onclick = () => setTimeout(() => { m.$$('.opt').forEach((x) => x.classList.toggle('on', x.querySelector('input').checked)); sgShow(); }));
  sgShow(); m.$('#bc').onclick = m.close; m.$('#bs').onclick = () => { m.close(); signDialog(); };
  m.$('#bk').onclick = guard(async () => { const t = m.el.querySelector('[name=bt]:checked').value, n = m.$('#bn').value; m.close(); await runBuild(t, n); });
});

// ================= Signing dialog =================
const signDialog = guard(async () => { if (!proj) return toast('Open a project first'); const m = modal('', { wide: true }); await renderSign(m); });
async function renderSign(m) {
  const s = await api(base() + '/signing'); signInfo = s; drawStatus();
  let v = null; if (s.has) { try { v = await api(base() + '/signing/verify'); } catch (e) { v = { err: e.message }; } }
  const ic2 = (x) => x === true ? '<span class="ok">✔</span>' : x === false ? '<span class="er">✘</span>' : '<span class="wn">?</span>';
  const fp = (l, x) => x ? `<div class="row"><span class="mu" style="width:60px">${l}</span><code style="font-size:11px;word-break:break-all;flex:1">${x}</code><button class="s cp" data-v="${x}">Copy</button></div>` : '';
  m.el.innerHTML = `<h3>🔏 Signing & Keystore — ${esc(proj)}</h3>
    <div class="card" style="cursor:default">${s.has ? `<b class="${v?.err || v?.good === false ? 'er' : 'ok'}">${v?.err ? '❌ Keystore problem' : v?.good === false ? '⚠️ Keystore found, but there are problems' : '✅ Keystore is valid'}</b>
      <div class="mu">📁 <code>${esc(s.file)}</code> · alias <b>${esc(s.alias)}</b> · ${s.generated ? 'generated here (PKCS12)' : 'uploaded'} · ${(s.size / 1024).toFixed(1)} KB</div>
      ${v?.err ? `<div class="er" style="margin:6px 0">${esc(v.err)}</div>` : `<div style="margin:6px 0">${(v?.checks || []).map((c) => `<div>${ic2(c.ok)} ${esc(c.text)}</div>`).join('')}</div>${fp('SHA-256', v?.sha256)}${fp('SHA-1', v?.sha1)}${v?.owner ? `<div class="mu">Owner: ${esc(v.owner)}</div>` : ''}`}
      <div class="row"><button class="s" id="svf">🔄 Verify again</button><button class="s" id="sdl">⬇ Keystore</button><button class="s" id="scr">⬇ Certificate (.pem)</button><button class="d" id="srm">Delete</button></div>`
      : `<b class="wn">⚠️ No keystore</b>${s.broken ? `<div class="er">${esc(s.broken)}</div>` : ''}<div class="mu">Release/Bundle builds will be signed with a temporary test key — installable, but not suitable for updates or Play Console.</div>`}</div>
    <div class="row"><button class="s" id="tu">⬆ Upload an existing keystore</button><button class="s" id="tg">✨ Generate a new keystore</button></div><div id="sf"></div>
    <div class="mu" style="margin-top:8px">📦 The keystore lives in your project's <code>keystore/</code> folder and travels with the source zip to the GitHub runner, which verifies it at the start of every build. For Play Console build a <b>Release AAB</b>. If you generate a new key, back it up.</div>
    <div class="foot"><button class="s" id="sc">Close</button></div>`;
  m.$('#sc').onclick = () => { m.close(); E.reload(); };
  m.$$('.cp').forEach((b) => b.onclick = () => { navigator.clipboard?.writeText(b.dataset.v); toast('Copied'); });
  if (s.has) {
    m.$('#svf').onclick = guard(() => renderSign(m));
    m.$('#sdl').onclick = () => { const a = document.createElement('a'); a.href = `${base()}/signing/download?t=${TOKEN}`; a.click(); };
    m.$('#scr').onclick = () => { const a = document.createElement('a'); a.href = `${base()}/signing/cert?t=${TOKEN}`; a.click(); };
    m.$('#srm').onclick = guard(async () => { if (!confirm('Delete the keystore? (Without a backup it cannot be recovered)')) return; await api(base() + '/signing', 'DELETE'); await E.reload(); renderSign(m); });
  }
  m.$('#tu').onclick = () => { m.$('#sf').innerHTML = `<label>Keystore file (.jks / .keystore / .p12)</label><input type="file" id="kf"><label>Key alias</label><input id="ka"><div class="row"><div style="flex:1"><label>Keystore password</label><input id="kp" type="password"></div><div style="flex:1"><label>Key password (if different)</label><input id="kq" type="password"></div></div><div class="row"><button id="kgo">Verify and save</button></div>`;
    m.$('#kgo').onclick = guard(async () => { const f = m.$('#kf').files[0]; if (!f) throw new Error('Choose a keystore file'); await api(base() + '/signing', 'PUT', { keystoreBase64: await b64(f), filename: f.name, alias: m.$('#ka').value, storePass: m.$('#kp').value, keyPass: m.$('#kq').value }); toast('✅ Verified and saved to the project keystore/ folder'); await E.reload(); renderSign(m); }); };
  m.$('#tg').onclick = () => { m.$('#sf').innerHTML = `<div class="row"><div style="flex:1"><label>Key alias</label><input id="ga" value="key0"></div><div style="flex:1"><label>Password (min 6)</label><input id="gp" type="password"></div></div><div class="row"><div style="flex:1"><label>Name (CN)</label><input id="gc"></div><div style="flex:1"><label>Organization</label><input id="go"></div></div><div class="row"><div style="flex:1"><label>Country code (e.g. US)</label><input id="gk" maxlength="2"></div><div style="flex:1"><label>Validity (years, 25+ recommended)</label><input id="gy" type="number" value="30"></div></div><div class="row"><button id="ggo">Generate</button></div>`;
    m.$('#ggo').onclick = guard(async () => { toast('Generating…'); await api(base() + '/signing/generate', 'POST', { alias: m.$('#ga').value, storePass: m.$('#gp').value, cn: m.$('#gc').value, org: m.$('#go').value, country: m.$('#gk').value, years: m.$('#gy').value }); toast('✅ Keystore created in keystore/ — back it up'); await E.reload(); renderSign(m); }); };
}

// ================= Boot =================
requireLogin('user', async () => {
  owner = ME.id; CFG = await api('/api/config'); if (!CFG.types.find((t) => t.id === curType && t.enabled)) curType = (CFG.types.find((t) => t.enabled) || CFG.types[0]).id;
  E = CodeEditor({ ed: $('#ed') }); T = FileTree($('#tree'), E);
  $('#viewsel').value = T.mode; $('#viewsel').onchange = (e) => T.setMode(e.target.value); $('#t-loc').onclick = () => T.locate(); $('#t-col').onclick = () => T.collapseAll(); $('#t-add').onclick = () => E.newFile();
  E.on('markers', (m) => { MARKS = m; if (bTab === 'problems') drawBottom(); else drawBottomHead(); });
  E.on('pos', (l, c) => { pos = [l, c]; drawStatus(); }); E.on('active', () => drawStatus());
  BuildStore.on(() => { drawChrome(); drawStatus(); if (bTab === 'build' || bTab === 'builds') drawBottom(); else drawBottomHead(); }); BuildStore.start();
  projects = await api('/api/projects'); drawChrome(); drawStatus(); drawBottom();
  if (proj && projects.includes(proj)) await openProject(proj); else if (projects.length) await openProject(projects[0]); else showWelcome();
  window.addEventListener('themechange', () => { drawChrome(); drawStatus(); });
}, 'Android Builder');
