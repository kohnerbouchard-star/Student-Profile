# Classroom Economy Static App

This is a static GitHub Pages style front end based on the uploaded `Student Profile.xlsx` workbook.

## What it includes

- Student Profile screen
- Store Kiosk screen
- Stock Portfolio screen
- Stock Trade screen
- Stock Profile screen
- Analyst Rating Submission screen
- Seed data extracted from the uploaded workbook
- Local mock behavior using `localStorage`
- Apps Script backend scaffold in `apps-script-api.gs`

## Fast local test

Open `index.html` in a browser.

## GitHub Pages setup

1. Create a GitHub repo.
2. Upload `index.html`, `style.css`, `app.js`, and `data.js`.
3. Turn on GitHub Pages in the repo settings.
4. Use the generated Pages URL as the student-facing app.

## Google Sheets connection path

Do not connect the static front end directly to cells. Use this chain:

`GitHub Pages -> Apps Script Web App -> LockService-protected Sheets functions -> Google Sheets`

Use `apps-script-api.gs` as the starting backend file. Deploy it as a web app, then paste the deployed URL into `API_URL` at the top of `app.js`.

## Important

The current version is a functional static prototype with mock writes. It does not write back to the original Google Sheet until the Apps Script endpoint is connected.
