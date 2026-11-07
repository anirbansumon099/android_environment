Put your web app here (for example an export from Google AI Studio).

  * package.json present  -> "npm run build" runs on the GitHub runner; dist/ or build/ is bundled into the APK
  * only index.html       -> the folder is bundled as-is

API keys: add them to webapp/.env (e.g. GEMINI_API_KEY=...). They are read at build time and end up inside the APK.
