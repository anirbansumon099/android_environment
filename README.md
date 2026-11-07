# Android Builder — cloud APK builds with GitHub Actions

- **IDE (users):** http://localhost:3000 — Android Studio style (Darcula / IntelliJ Light)
- **Admin Console:** http://localhost:3000/admin — username `admin`, password = `ADMIN_PASSWORD` from `.env`

## Run
```bash
cp .env.example .env     # set ADMIN_PASSWORD
npm install && npm start
```
Open `/admin` → **GitHub Accounts** → connect one or more accounts (classic token with `repo` + `workflow`).
A **private** repository is created for each account automatically.

## How a build works
1. The whole project (including `keystore/`) is zipped.
2. The router picks the GitHub account with the most free monthly minutes and pushes the zip to a temporary branch `build-<id>` of that account's private repo.
3. The GitHub runner extracts it, verifies the keystore, builds (Gradle; `npm run build` first for web apps), and signs.
4. The APK/AAB is saved on this server and **everything is deleted from GitHub** (run, artifact, cache, branch). `main` only holds the workflow file.

The IDE shows this live: **Queued → Upload → GitHub runner → Build → Sign → Output**, a timer, per-step durations, a
notification when the APK is ready and a one-click download (with file size).

## Projects
New Project templates: *No Activity*, *Empty Views Activity* (Java), *Empty Activity* (Kotlin + Jetpack Compose), *Web App (WebView)*.

### Import from Google AI Studio (File ▸ Import from Google AI Studio / ZIP…)
- **ZIP export** — an Android project (`settings.gradle`) is imported as-is; a web app (`package.json` / `index.html`, e.g. React + Vite)
  is wrapped in an Android WebView project: sources go to `webapp/`, `npm run build` runs on GitHub and the result is bundled into the APK.
  API keys for web apps go into `webapp/.env` (they end up inside the APK).
- **Paste code** — paste the AI's answer; code blocks are turned into files (paths from headings, first-line comments or `package` lines).

## Keyboard (Android Studio / IntelliJ default keymap — fully remappable in Settings ▸ Keymap)
| Action | Keys | Action | Keys |
|---|---|---|---|
| Find Action | Ctrl+Shift+A | Search Everywhere | Double Shift |
| Go to File / Class | Ctrl+Shift+N / Ctrl+N | Recent Files | Ctrl+E |
| Go to Line | Ctrl+G | Go to Declaration | Ctrl+B / Ctrl+Click |
| Find in Files / Replace | Ctrl+Shift+F / Ctrl+Shift+R | Find / Replace in file | Ctrl+F / Ctrl+R |
| Save All | Ctrl+S | Run / Build | Shift+F10 / Ctrl+F9 |
| Reformat Code | Ctrl+Alt+L | Optimize Imports | Ctrl+Alt+O |
| Quick Fix | Alt+Enter | Completion | Ctrl+Space |
| Duplicate / Delete line | Ctrl+D / Ctrl+Y | Comment line | Ctrl+/ |
| Move line | Alt+Shift+Up/Down | Next error | F2 |
| Next / Previous tab | Alt+Right / Alt+Left | Back / Forward | Ctrl+Alt+Left / Right |
| Project / Build / Problems | Alt+1 / Alt+0 / Alt+6 | Hide all tool windows | Ctrl+Shift+F12 |
| Settings | Ctrl+Alt+S | Shortcuts reference | F1 |

Browsers reserve a few combos in normal tabs (Ctrl+N, Ctrl+T, Ctrl+W, Ctrl+Shift+N, Ctrl+F4…). Those are marked ⚠ in the keymap;
alternatives are provided (e.g. Go to File also on Ctrl+Shift+O) and everything can be remapped.

## Admin Console
Dashboard, Builds (filters + detail drawer), GitHub Accounts (limits, auto-routing, private repos), Workflow editor, Project Template editor,
Actions Cleanup, Users, Settings (build types, toolchain, limits), Secrets. Light and dark theme.
