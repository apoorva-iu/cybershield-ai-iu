HOW TO INSTALL (2 minutes)
1. Stop the running server (Ctrl+C in its terminal).
2. Copy the "config" folder into your project, overwrite when asked
   (it adds runtime.json and updates index.js).
3. Copy checks.js and server.js into your project, overwrite the old ones.
4. Run: npm start
Your llm.js, ledger.js, package.json, .env and public/index.html are NOT touched.

WHAT TO LOOK FOR
- Startup prints which keys are present (true/false). Never the keys themselves.
- When a live lookup fails, the terminal prints one line like:
    [evidence] places failed: http 403 (key rejected or not allowed)
- Every scan response also has "evidenceStatus" with the reason per source.
- To change timeouts, API URLs, text limits: edit config/runtime.json and restart.

TEST PAGE (local machine only)
After npm start, open this in your browser:
    http://localhost:3000/api/diagnose
It tests RDAP, URLhaus, VirusTotal and Google Places and shows "working" or the exact reason.
Set "diagnose.enabled" to false in config/runtime.json before you deploy online.
