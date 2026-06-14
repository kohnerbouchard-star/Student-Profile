# Codex Supabase Migration Handoff

This ZIP contains the legacy Google Sheets / Google Apps Script backend materials for the Classroom Economy / Eco Novaria Supabase migration audit.

## Scripts

- `scripts/classroom_stock_market_v1_5_legacy.gs.txt`  
  Legacy classroom stock market engine, including market setup, stocks/bonds, trading, financials/news, price history, analyst ratings, and triggers.

- `scripts/classroom_card_scanner_v2_18_legacy.gs.txt`  
  Legacy classroom scanner, attendance, store, jobs/payroll, student inventory, dashboard, and student profile scanner logic.

- `scripts/api_router_legacy.js`  
  Current frontend-facing API router contract. Important actions include LOGIN, LOGOUT, GET_SNAPSHOT, GET_STOCK_HISTORY, GET_STOCK_NEWS, STORE_PURCHASE, STOCK_TRADE, SUBMIT_RATING, and USE_ITEM.

- `scripts/api_test_logger_legacy.js`  
  Current Apps Script API test logger. Useful as a reference for future Supabase integration tests.

- `scripts/stock_history_news_legacy.js`  
  Stock history logging and stock news report generation logic.

## Workbooks

- `workbooks/student_profile.xlsx`
- `workbooks/econvaria_simulation_master_sheet_bank.xlsx`
- `workbooks/classroom_stock_market_v1.xlsx`

## Recommended Codex first task

Create a documentation-only migration audit in:

`docs/supabase-migration-audit.md`

Do not implement Supabase code yet. First map legacy sheets/functions/actions into a proposed Supabase schema, RLS model, API compatibility layer, data migration plan, and phased PR roadmap.

## Important migration constraints

- Do not delete or rewrite the existing Apps Script backend in the first pass.
- Do not rewrite the frontend in the first pass.
- Preserve the current frontend API action contract where possible.
- Do not expose raw student access codes.
- Do not expose service-role keys to the frontend.
- All money, attendance, store, inventory, stock trade, rating reward, payroll, notification, and admin actions must be auditable.
- Keep timezone behavior aligned with Asia/Seoul.
