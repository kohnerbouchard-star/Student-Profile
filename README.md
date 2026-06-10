# Classroom Economy Static App — Login + Write Permissions

This version keeps the login screen and restores controlled write actions.

## What changed

- No student dropdown.
- Students log in with Card ID.
- The active Card ID is stored in the session.
- Store purchases, stock trades, analyst ratings, and clock-in actions are permission-gated.
- Students cannot choose another student for a write action from the UI.
- Local prototype mode saves writes in browser storage.
- `apps-script-api.gs` includes a permissioned backend scaffold with session tokens and `LockService`.

## Important security note

Static files alone cannot provide true data privacy because `data.js` is visible in the browser. For real privacy and real Google Sheets writes, deploy `apps-script-api.gs` as a Google Apps Script Web App and paste the deployed URL into `API_URL` in `app.js`.

## Fast setup

1. Open `index.html` locally to test the UI.
2. Use any Card ID from the uploaded workbook to log in.
3. Try Store Kiosk, Stock Trade, Analyst Rating, or Clock In.
4. In local mode, writes are saved only in that browser.
5. To reset local demo data, clear the browser's local storage for this page.

## Backend setup

1. Open your master Google Sheet.
2. Go to Extensions → Apps Script.
3. Paste the contents of `apps-script-api.gs`.
4. Set `SPREADSHEET_ID`.
5. Deploy → New deployment → Web app.
6. Paste the Web App URL into `API_URL` in `app.js`.

The backend uses `LockService`, session tokens, and server-side permission checks. Store purchases and stock trades are queued by default in `WebApp_Action_Queue` so you can connect them safely to your existing Apps Script transaction functions.
