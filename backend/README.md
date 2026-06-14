# Backend

Backend migration workspace for the Classroom Economy / Eco Novaria Supabase migration.

This folder is intentionally documentation- and legacy-source-first right now. The first migration passes should preserve the current frontend action contract and avoid replacing the Apps Script backend until the schema, import, and compatibility layers have been reviewed.

## Folder layout

- `legacy/apps-script/api/` - Current frontend-facing Apps Script API router.
- `legacy/apps-script/classroom/` - Classroom scanner, attendance, store, inventory, jobs, payroll, dashboard, and student profile Apps Script.
- `legacy/apps-script/stock-market/` - Stock market, portfolio, trading, ratings, history, and news Apps Script.
- `legacy/apps-script/testing/` - Legacy API test logger scripts.
- `legacy/workbooks/` - Workbook exports used as the legacy data source of truth.

## Migration guardrails

- Do not expose raw student access codes in frontend responses.
- Do not expose Supabase service-role keys to frontend code.
- Keep financial, inventory, stock trade, attendance, item-use, rating reward, payroll, notification, and admin actions auditable.
- Keep timezone behavior aligned with `Asia/Seoul`.
