# Supabase Backend Replacement Architecture

This document designs a clean Supabase replacement for the Classroom Economy / Eco Novaria backend. The files under `backend/legacy/` are reference material only: they describe existing product behavior, data concepts, workflows, frontend actions, and business rules. They should not force a one-to-one copy of Google Sheet tabs, Apps Script functions, or sheet UI patterns.

The replacement backend should preserve the useful product contract while replacing fragile Sheets patterns with typed schemas, database transactions, RLS, server-side business logic, scheduled jobs, and consistent audit trails.

## 1. Product Domains

### Auth and player access

Legacy behavior:

- `apiLogin_` accepts `accessCode`, `cardId`, or `code`, normalizes it, finds a student, creates a `CacheService` session token, and returns a scrubbed profile plus snapshot.
- `apiLogout_` removes the session cache entry.
- Student profile scanner security throttles repeated profile scans with script properties.

Replacement design:

- Store player access codes only as hashes in `player_access_credentials`.
- Use Supabase Auth where practical for staff/admin users.
- For student/player access, use an Edge Function or RPC that validates the code server-side and creates a short-lived session mapping, never returning the raw credential.
- Represent role and game membership explicitly instead of deriving permissions from sheet location or card ID.

### Games / simulations

Legacy behavior:

- A single classroom economy and stock market are implied by spreadsheet IDs and global config constants.
- Settings such as timezone, market hours, attendance window, payroll timing, and reward amounts are scattered across `CFG`, `STOCK_CFG`, `APP_CFG`, and `Settings` tabs.

Replacement design:

- Make `games` the top-level simulation boundary.
- Add `cohorts` or `classes` for class periods, homerooms, or groups within a game.
- Store typed settings in `game_settings` and domain-specific config columns where validation matters.
- Support multiple games/simulations without duplicating schema.

### Players

Legacy behavior:

- `Students` is the core player table and includes identity fields, balance, job title, active flag, attendance streak, and notes.

Replacement design:

- Use `players` for identity and enrollment state.
- Move balances out of `players` into a ledger-derived model.
- Move access credentials to `player_access_credentials`.
- Move job assignment to `player_jobs` or `jobs` plus assignments if a player can change roles over time.

### Attendance

Legacy behavior:

- `Attendance_Log` is the historical record.
- `Daily_Attendance` is a current-day sheet and is purged/rebuilt.
- Attendance windows, late cutoff, streak bonus, and class period rules live in settings/helpers.

Replacement design:

- `attendance_records` is the source-of-truth event table.
- `daily_attendance` becomes a database view over `attendance_records`.
- Streak and bonus calculations should run inside a transaction that writes attendance, ledger entries, and audit rows together.

### Store and inventory

Legacy behavior:

- `Store` stores items, price, active flag, inventory, category, and description.
- Purchases decrement balance and inventory, append `Transactions`, and update `Student_Inventory`.
- `Store_Kiosk` is a sheet UI/control surface.

Replacement design:

- `store_items` is the item catalog.
- `store_purchases` records purchase attempts/results.
- `inventory_holdings` stores current owned quantities.
- `inventory_events` records purchase/use/adjustment history.
- `Store_Kiosk` should be removed as a backend concept; the frontend/admin UI should submit API actions.

### Transactions / ledger

Legacy behavior:

- `Transactions` mixes deposits, withdrawals, rewards, fines, store purchases, attendance bonuses, and payroll.
- `Students.Balance` is directly updated by Apps Script.

Replacement design:

- Replace direct balance edits with append-only `ledger_entries`.
- Current balance is derived from ledger entries, optionally cached in a `player_balances` materialized view/table maintained transactionally.
- Every money mutation must produce a ledger entry and an audit event in the same database transaction.

### Jobs and payroll

Legacy behavior:

- `Jobs` maps card IDs to job titles, salary, frequency, active state, and last paid.
- `Payroll_Log` records runs and entries.
- Payroll can be manual or automatic Friday around 08:00 KST.

Replacement design:

- `jobs` defines job templates per game.
- `player_job_assignments` tracks assignments over time.
- `payroll_runs` records each run.
- `payroll_entries` records per-player results and links to ledger entries.
- Scheduled jobs replace Apps Script time triggers.

### Stock market assets

Legacy behavior:

- `Stock_Market` stores ticker, company, sector, current/previous price, volatility, trend, active flag, asset type, and bond-specific fields.
- `Stock_Financials`, `Stock_Fundamentals`, `Stock_Sector_Momentum`, `Stock_Macro_Outlook`, and `Stock_Earnings_Reports` support the simulation engine.

Replacement design:

- `stock_assets` is the source-of-truth asset catalog.
- Market simulation configuration belongs in typed settings or related tables.
- Derived market metrics should be views or cached summaries, not hand-maintained sheet columns.

### Stock trading and portfolios

Legacy behavior:

- `apiStockTrade_` checks market hours, validates BUY/SELL and whole shares, updates balance and `Stock_Portfolio`, then logs `Stock_Trade_Log`.
- `Stock_Portfolio` stores current holdings and cost basis.

Replacement design:

- `stock_trades` is the append-only source of trade history.
- `portfolio_holdings` can be a view derived from trades, or a transactionally maintained cache for performance.
- Buy/sell operations should be implemented as RPC or Edge Function transactions that lock the relevant player balance and holding rows.

### Analyst ratings and rewards

Legacy behavior:

- `Stock_Ratings` records ticker, rating, target price, reason, check date, end-of-day price, accuracy, reward status, and reward amount.
- Submissions have time windows and duplicate-per-ticker-per-day checks.
- Reward tiers are configured in `STOCK_CFG`.

Replacement design:

- `analyst_ratings` stores submissions.
- `rating_rewards` stores calculated results and links to ledger entries.
- Reward calculation should be scheduled or run by a server-side function after market close.

### News and events

Legacy behavior:

- `Stock_News` and `Stock_News_Reports` overlap.
- `stock_history_news_legacy.js` generates reports from price movement and deduplicates by date/ticker/headline.

Replacement design:

- Use `market_events` for simulation events that can affect price, volatility, sentiment, or student-facing news.
- Use `market_news_items` as the student-facing presentation layer, generated from events and price movement.
- Merge duplicate legacy news concepts into one normalized event/news model.

### Notifications

Legacy behavior:

- `Notification_Queue` exists in workbook exports with attempts and last-error fields.
- Legacy notes mention Google Chat webhook logic.

Replacement design:

- Use `notification_jobs` as a general queue for Google Chat, email, in-app notifications, and future channels.
- Store payload, target channel, status, attempts, last error, next retry, and related entity IDs.

### Admin settings

Legacy behavior:

- Settings are rows in `Settings` sheets and constants in Apps Script.
- Sheet UI/control tabs such as `Scan`, `Dashboard`, `Student_Profile`, `Store_Kiosk`, `Stock_Trade`, `Stock_Profile`, and `Stock_Rating_Submit` are backend-adjacent UI.

Replacement design:

- Store typed admin settings in `game_settings` and domain config tables.
- Replace sheet UI/control tabs with frontend/admin UI.
- Use database views for dashboards and reports.

### Reports / exports

Legacy behavior:

- `Dashboard`, `Reports`, generated Google Docs, imported tabs, and profile display tabs are formula/view/export surfaces.

Replacement design:

- Use read-only views for dashboard/report data.
- Generate CSV/PDF exports from server-side code or admin-only tools.
- Do not store imported/display tabs as production tables.

### Audit log

Legacy behavior:

- Auditability is spread across `Transactions`, `Stock_Trade_Log`, `Payroll_Log`, `Api_Test_Log`, `Item_Use_Log`, and status fields.

Replacement design:

- Use `audit_log` consistently for every sensitive action.
- Preserve domain logs/ledgers for product history, but audit log should answer who did what, when, from where, under which role, and with what result.

## 2. Source Of Truth Versus Legacy Tabs

Do not create a Supabase table for every workbook tab. The replacement should classify each legacy concept by its product role.

| Legacy concept | Replacement classification | New Supabase concept | Notes |
| --- | --- | --- | --- |
| `Students` | Source-of-truth identity, but split | `players`, `player_access_credentials`, `player_balances` view/cache | Remove balance and credential responsibilities from the player row. |
| `Transactions` | Replace | `ledger_entries`, `money_events`, `audit_log` | Append-only ledger replaces mixed transaction sheet and direct balance edits. |
| `Attendance_Log` | Keep concept, rename | `attendance_records` | Historical attendance events. |
| `Daily_Attendance` | Generated view | `daily_attendance` view | Do not store a purged current-day table. |
| `Store` | Keep concept, rename | `store_items` | Catalog with typed columns and constraints. |
| `Store_Kiosk` | Remove sheet UI | Frontend/admin UI plus API action | Not a backend table. |
| `Student_Inventory` / `Imported_Inventory` | Replace/merge | `inventory_holdings`, `inventory_events` | Holdings current state plus append-only event history. |
| `Item_Use_Log` | Keep concept, rename | `item_use_requests`, `inventory_events` | Supports request/approval and consumption. |
| `Jobs` | Split | `jobs`, `player_job_assignments` | Avoid storing active job only on player. |
| `Payroll_Log` | Split | `payroll_runs`, `payroll_entries`, `ledger_entries` | Runs and per-player results are separate. |
| `Settings` | Replace | `game_settings`, typed config tables | Use typed JSON only for flexible settings; typed columns for validated rules. |
| `Scan` | Remove sheet UI | Admin/scanner UI plus attendance/store APIs | Not a data table. |
| `Dashboard` | Generated view/report | dashboard views | Not a source table. |
| `Reports` | Generated/export log if needed | report_jobs, report_exports | Keep only generated export metadata if useful. |
| `Student_Profile`, `Student_Profile_Display`, `Student_Portfolio_Display` | Remove display tabs | Snapshot API and frontend views | Not production tables. |
| `Stock_Market` / `Imported_Stock_Market` | Keep concept, normalize | `stock_assets`, current price view/cache | Separate asset definition from ticks. |
| `Stock_Trade` | Remove sheet UI | `STOCK_TRADE` API action | Not a data table. |
| `Stock_Trade_Log` | Keep concept, rename | `stock_trades` | Append-only trade record. |
| `Stock_Portfolio` / `Imported_Stock_Portfolio` | Replace with derived/cache | `portfolio_holdings` view/cache | Derived from trades; cache only if needed. |
| `Stock_Price_History` / `Imported_Stock_Price_History` | Keep concept, rename | `stock_price_ticks` | High-volume time-series table. |
| `Stock_Ratings` / `Imported_Stock_Ratings` | Keep concept, split | `analyst_ratings`, `rating_rewards` | Separate submission from reward outcome. |
| `Stock_Rating_Submit` | Remove sheet UI | Rating API/admin UI | Not a data table. |
| `Stock_News`, `Stock_News_Reports`, `Imported_Stock_News` | Merge | `market_events`, `market_news_items` | Unify generated events and displayed news. |
| `Stock_Financials`, `Stock_Fundamentals`, `Stock_Sector_Momentum`, `Stock_Macro_Outlook`, `Stock_Earnings_Reports` | Keep if simulation engine needs them | `asset_fundamentals`, `sector_conditions`, `macro_conditions`, `earnings_events` | Treat as simulation state/config, not frontend contract. |
| `Stock_Profile`, `Stock_Forecast_Helper` | Remove/generated view | frontend views, helper views | Not source data. |
| `Notification_Queue` | Keep concept, generalize | `notification_jobs` | Channel-agnostic queue. |
| `Api_Test_Log` | Keep concept for testing | `api_test_log` | Useful for compatibility test runs. |
| `README`, `Instructions` | Remove from database | docs/admin help | Documentation only. |

## 3. Proposed Supabase Data Model

The schema should be normalized around product domains. Table names below are proposals; final SQL can refine enum names and constraints.

### Core tenancy and roles

- `games`: `id uuid pk`, `name text`, `slug text unique`, `status text`, `timezone text default 'Asia/Seoul'`, `created_by uuid`, `created_at timestamptz`, `updated_at timestamptz`, `archived_at timestamptz`.
- `cohorts`: `id uuid pk`, `game_id fk`, `name text`, `grade text`, `homeroom text`, `active boolean`, timestamps.
- `staff_users`: `id uuid pk`, `auth_user_id uuid unique`, `display_name text`, `email text`, `role text`, `active boolean`, timestamps.
- `game_staff`: `game_id fk`, `staff_user_id fk`, `role text`, `created_at`; unique `(game_id, staff_user_id)`.
- `game_settings`: `id uuid pk`, `game_id fk`, `key text`, `value jsonb`, `value_type text`, `updated_by uuid`, timestamps; unique `(game_id, key)`.
- `difficulty_presets`: `id uuid pk`, `game_id fk`, `name text`, `settings jsonb`, `active boolean`, timestamps`.

### Players and access

- `players`: `id uuid pk`, `game_id fk`, `cohort_id fk nullable`, `display_name text`, `grade text`, `homeroom text`, `active boolean`, `notes text`, timestamps, `archived_at`.
- `player_access_credentials`: `id uuid pk`, `player_id fk`, `credential_hash text`, `credential_hint text nullable`, `active boolean`, `last_used_at timestamptz`, `created_at`, `revoked_at`; unique active credential hash per game.
- `player_sessions`: `id uuid pk`, `player_id fk`, `token_hash text unique`, `expires_at timestamptz`, `created_at`, `revoked_at`, `last_seen_at`, `user_agent text`, `ip_hash text`.

### Ledger and balances

- `ledger_entries`: `id uuid pk`, `game_id fk`, `player_id fk`, `entry_type text`, `amount numeric(12,2)`, `currency text default 'credits'`, `source_type text`, `source_id uuid`, `description text`, `created_by_type text`, `created_by_id uuid nullable`, `created_at timestamptz`.
- `player_balances`: materialized view or cache table keyed by `(game_id, player_id)` with `balance numeric(12,2)`, `updated_at`.
- Constraints: ledger amount cannot be zero; debit flows must check non-negative policy in transaction.
- Indexes: `(game_id, player_id, created_at desc)`, `(source_type, source_id)`.

### Attendance

- `attendance_records`: `id uuid pk`, `game_id fk`, `player_id fk`, `cohort_id fk nullable`, `class_period text`, `attendance_date date`, `check_in_at timestamptz`, `status text`, `streak_after_scan int`, `bonus_ledger_entry_id fk nullable`, `note text`, `created_by_type text`, `created_at`.
- `daily_attendance`: view filtering/grouping `attendance_records` by date and game timezone.
- Unique constraint: one attendance record per `(game_id, player_id, attendance_date, class_period)` unless admin override flag is present.

### Store and inventory

- `store_items`: `id uuid pk`, `game_id fk`, `sku text`, `name text`, `description text`, `category text`, `price numeric(12,2)`, `inventory_policy text`, `inventory_quantity int nullable`, `active boolean`, timestamps; unique `(game_id, sku)`.
- `store_purchases`: `id uuid pk`, `game_id fk`, `player_id fk`, `store_item_id fk`, `quantity int`, `unit_price numeric(12,2)`, `total_price numeric(12,2)`, `status text`, `ledger_entry_id fk nullable`, `failure_reason text`, `created_at`.
- `inventory_holdings`: `id uuid pk`, `game_id fk`, `player_id fk`, `store_item_id fk`, `quantity int`, `updated_at`; unique `(game_id, player_id, store_item_id)`.
- `inventory_events`: `id uuid pk`, `game_id fk`, `player_id fk`, `store_item_id fk`, `delta int`, `event_type text`, `source_type text`, `source_id uuid`, `note text`, `created_at`.
- `item_use_requests`: `id uuid pk`, `game_id fk`, `player_id fk`, `store_item_id fk`, `quantity int`, `note text`, `status text`, `requested_at`, `reviewed_by uuid nullable`, `reviewed_at nullable`, `inventory_event_id fk nullable`.

### Jobs and payroll

- `jobs`: `id uuid pk`, `game_id fk`, `title text`, `salary numeric(12,2)`, `pay_frequency text`, `active boolean`, timestamps.
- `player_job_assignments`: `id uuid pk`, `game_id fk`, `player_id fk`, `job_id fk`, `starts_on date`, `ends_on date nullable`, `active boolean`, timestamps.
- `payroll_runs`: `id uuid pk`, `game_id fk`, `period_start date`, `period_end date`, `run_type text`, `status text`, `started_at`, `completed_at`, `created_by uuid nullable`.
- `payroll_entries`: `id uuid pk`, `payroll_run_id fk`, `player_id fk`, `job_id fk`, `amount numeric(12,2)`, `status text`, `ledger_entry_id fk nullable`, `note text`, timestamps; unique `(payroll_run_id, player_id, job_id)`.

### Stock market

- `stock_assets`: `id uuid pk`, `game_id fk`, `ticker text`, `name text`, `sector text`, `asset_type text`, `active boolean`, `starting_price numeric(12,4)`, `current_price numeric(12,4)`, `previous_price numeric(12,4)`, `volatility numeric(8,4)`, `trend text`, `coupon_rate numeric(8,4) nullable`, `shock_protected boolean`, timestamps; unique `(game_id, ticker)`.
- `stock_price_ticks`: `id uuid pk`, `game_id fk`, `asset_id fk`, `recorded_at timestamptz`, `price numeric(12,4)`, `change_pct numeric(8,4)`, `volume numeric nullable`, `market_status text`; indexes `(game_id, asset_id, recorded_at desc)`.
- `stock_trades`: `id uuid pk`, `game_id fk`, `player_id fk`, `asset_id fk`, `side text`, `shares int`, `price numeric(12,4)`, `total_value numeric(12,2)`, `status text`, `ledger_entry_id fk nullable`, `failure_reason text`, `created_at`.
- `portfolio_holdings`: view or cache table keyed by `(game_id, player_id, asset_id)` with `shares_owned`, `avg_buy_price`, `total_cost`, `market_value`, `unrealized_gain_loss`, `updated_at`.
- `analyst_ratings`: `id uuid pk`, `game_id fk`, `player_id fk`, `asset_id fk`, `rating text`, `target_price numeric(12,4)`, `reason text`, `submitted_at`, `check_at`, `status text`; unique per `(game_id, player_id, asset_id, date(submitted_at))`.
- `rating_rewards`: `id uuid pk`, `rating_id fk unique`, `end_price numeric(12,4)`, `accuracy_pct numeric(8,4)`, `reward_amount numeric(12,2)`, `ledger_entry_id fk nullable`, `status text`, `calculated_at`.

### News, notifications, reports, audit

- `market_events`: `id uuid pk`, `game_id fk`, `asset_id fk nullable`, `event_type text`, `headline text`, `body text`, `impact_type text`, `price_impact_pct numeric(8,4)`, `volatility_impact numeric(8,4)`, `visible_to_players boolean`, `occurred_at`, `created_by_type text`.
- `market_news_items`: view or table generated from `market_events` and price movements with `headline`, `summary`, `sentiment`, `impact`, `source_event_id`, timestamps.
- `notification_jobs`: `id uuid pk`, `game_id fk`, `channel text`, `recipient_type text`, `recipient text`, `payload jsonb`, `status text`, `attempts int`, `next_attempt_at`, `last_attempt_at`, `last_error text`, timestamps.
- `report_jobs`: `id uuid pk`, `game_id fk`, `report_type text`, `parameters jsonb`, `status text`, `output_url text nullable`, timestamps.
- `api_test_log`: `id uuid pk`, `game_id fk nullable`, `test_name text`, `action text`, `ok boolean`, `message text`, `duration_ms int`, `request_json jsonb`, `response_json jsonb`, `error text`, `notes text`, `created_at`.
- `audit_log`: `id uuid pk`, `game_id fk nullable`, `actor_type text`, `actor_id uuid nullable`, `role text`, `action text`, `entity_type text`, `entity_id uuid nullable`, `request_id text`, `before jsonb nullable`, `after jsonb nullable`, `metadata jsonb`, `created_at`.

## 4. Compatibility API Layer

The frontend can keep its current actions while Supabase internals use the improved model. A single Edge Function such as `/functions/v1/classroom-api` can accept `{ action, token/sessionToken, payload }`, route to typed handlers, and return legacy-compatible response shapes.

| Action | Current legacy function | Input payload | Current response shape | Proposed handler | Reads | Writes | Auth | Audit event | Edge cases |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `LOGIN` | `apiLogin_` | `accessCode` or `cardId` or `code` | `{ ok, token, sessionToken, profile, snapshot }` | Edge Function `loginPlayer` | `players`, `player_access_credentials`, settings, snapshot views | `player_sessions`, `audit_log` | Public endpoint, rate limited | `auth.login` | Invalid code, inactive player, expired/revoked credential, brute-force attempts. |
| `LOGOUT` | `apiLogout_` | `token` or `sessionToken` | `{ ok: true }` | Edge Function `logoutPlayer` | `player_sessions` | revoke session, `audit_log` | Valid session or idempotent | `auth.logout` | Missing token should be harmless. |
| `GET_SNAPSHOT` | `getStudentSnapshot_` | session token | `{ ok, snapshot }` | Edge Function `getSnapshot` backed by views | player profile, store, ledger summary, inventory, market, portfolio, ratings, news | `audit_log` optional read event | Player session | `snapshot.read` | Missing player, stale holdings cache, large response size. |
| `GET_STOCK_HISTORY` | `getStockPriceHistory_` | `{ ticker?, limit? }` | `{ ok, history }` | Edge Function or RPC `getStockHistory` | `stock_assets`, `stock_price_ticks` | none | Player session | optional `stock_history.read` | Limit caps, ticker aliases, large history volume. |
| `GET_STOCK_NEWS` | `safeStockNews_`, `getStockNewsReports_` | `{ limit? }` | `{ ok, news }` | Edge Function/RPC `getMarketNews` | `market_news_items`, `market_events` | none | Player session | optional `stock_news.read` | Duplicate headlines, hidden/unpublished events. |
| `STORE_PURCHASE` | `apiStorePurchase_` | `{ itemId, quantity }` | `{ ok, message, snapshot? }` | Transactional RPC `purchaseStoreItem` called by Edge Function | player, balance, `store_items`, holdings | `ledger_entries`, `store_purchases`, `inventory_events`, holdings/cache, `audit_log` | Player session | `store.purchase` | Inactive item, insufficient funds, insufficient inventory, non-integer quantity. |
| `STOCK_TRADE` | `apiStockTrade_` | `{ action, ticker, shares }` | `{ ok, message, snapshot? }` | Transactional RPC `placeStockTrade` | player, balance, asset, holdings, settings | `stock_trades`, `ledger_entries`, holdings/cache, `audit_log` | Player session | `stock.trade` | Market closed, bad ticker, insufficient funds/shares, whole-share validation. |
| `SUBMIT_RATING` | `apiSubmitRating_` | `{ ticker, rating, targetPrice, reason }` | `{ ok, message, snapshot? }` | RPC `submitAnalystRating` | player, asset, rating window settings | `analyst_ratings`, `audit_log` | Player session | `rating.submit` | Rating window closed, duplicate ticker/day, short reason, bad target price. |
| `USE_ITEM` | Routed to missing `apiUseItem_`; `Item_Use_Log` exists | `{ itemId, itemName?, quantity, note }` | Expected `{ ok, message, snapshot? }` | RPC `requestItemUse` | player, inventory holding, store item | `item_use_requests`, optional `inventory_events`, `audit_log` | Player session | `inventory.use_request` | Legacy handler missing in router source; define explicit request/approval behavior. |

Compatibility rules:

- Preserve action names and broad response keys while migrating.
- Do not preserve internal sheet names, row formats, or direct balance edits.
- Add new response fields only in a backward-compatible way.
- Redact access credentials, session hashes, service metadata, and internal audit payloads.

## 5. Business Logic Placement

| Logic area | Recommended placement | Reason |
| --- | --- | --- |
| Access-code login | Edge Function plus DB lookup of hashed credential | Keeps secrets server-side and supports rate limiting. |
| Session validation | Edge Function middleware or RPC helper | Centralizes token hashing, expiry, and revocation. |
| Balance accounting | Postgres functions/RPC with transactions | Prevents partial balance, purchase, trade, or payroll writes. |
| Store purchase | RPC transaction called by Edge Function | Needs inventory, balance, ledger, holdings, and audit consistency. |
| Inventory decrement/use | RPC transaction | Prevents negative inventory and double use. |
| Attendance check-in | RPC transaction | Enforces uniqueness, status calculation, streak bonus, and ledger entry. |
| Payroll | Scheduled job invoking RPC | Replaces Apps Script Friday triggers with idempotent payroll runs. |
| Stock trade | RPC transaction | Replaces `LockService` and ensures funds/shares consistency. |
| Stock price updates | Scheduled job or Edge Function cron | Replaces Apps Script time triggers. |
| Stock history logging | Scheduled job writing `stock_price_ticks` | High-volume append-only workflow. |
| Analyst reward calculation | Scheduled job/RPC after market close | Deterministic reward calculation with ledger/audit writes. |
| News/event generation | Scheduled job plus admin tools | Allows generated and admin-authored events. |
| Notifications | Worker/cron processing `notification_jobs` | Channel-agnostic retries and failure tracking. |
| Admin settings | Admin-only Edge Functions and RLS-protected tables | Prevents direct frontend mutation of sensitive settings. |
| Dashboard/reports | Database views and admin export jobs | Replaces sheet formulas/import tabs. |

## 6. Security And RLS Plan

Roles:

- `player`: a student/player session scoped to one game and player.
- `teacher_admin`: staff member who can manage assigned games.
- `observer`: read-only user for dashboards or review.
- `system_service`: service role used only by trusted server jobs/functions.
- `super_admin`: future cross-game operator role with explicit elevated permissions.

RLS recommendations:

- Enable RLS on all application tables.
- Players can read only rows tied to their own `player_id` and active game membership.
- Players can read active store items, visible market assets, visible market news, and safe game settings for their game.
- Players cannot directly insert/update/delete ledger entries, balances, trades, attendance, inventory, payroll, rewards, settings, credentials, or audit rows.
- Player write actions must go through SECURITY DEFINER RPCs or Edge Functions that validate the session and enforce business rules.
- Teacher/admin access is scoped through `game_staff`.
- Observer access is read-only and excludes credential hashes, raw session records, and sensitive audit metadata.
- Service-role keys never go to frontend code, local storage, or client-side environment variables.
- Access code hashes are never returned to the frontend.
- All financial/simulation mutations write `audit_log` rows in the same logical operation.
- Use database constraints for invariants: positive quantities, valid enum values, unique daily attendance, unique rating per player/ticker/day, non-negative holdings, and valid timestamps.

## 7. Replacement Improvements Over Legacy

- Replace `LockService` with Postgres transactions, row locks, and idempotency keys.
- Replace `CacheService` sessions with hashed, expiring sessions or Supabase Auth mappings.
- Replace raw access codes with hashed credentials and rotation/revocation.
- Replace direct balance edits with append-only ledger accounting.
- Replace formula/import/display tabs with database views and frontend/admin UI.
- Replace Apps Script time triggers with Supabase scheduled jobs or external cron invoking Edge Functions.
- Replace scattered logs with consistent ledger, domain event, and audit tables.
- Replace sheet UI/control tabs with typed API actions and admin screens.
- Replace duplicate sheet concepts with unified tables and views.
- Replace fragile header matching with typed SQL schemas and migrations.
- Replace Google Chat-only notification assumptions with channel-agnostic notification jobs.
- Replace spreadsheet-specific global config with per-game typed settings.

## 8. Data Transition Strategy

This is a replacement, not a strict migration, but existing workbook data still matters.

Recommended approach:

1. Export legacy sheets to CSV.
2. Import into temporary staging tables named `staging_legacy_<sheet_name>`.
3. Normalize card IDs and tickers during transformation, not in production tables.
4. Hash access codes before loading credentials into production.
5. Create players from `Students` / `Imported_Students`.
6. Convert `Transactions` into `ledger_entries`, preserving legacy row metadata in `audit_log.metadata`.
7. Convert `Student_Inventory` into initial `inventory_holdings` plus adjustment `inventory_events`.
8. Convert `Stock_Trade_Log` into `stock_trades` and reconcile against derived holdings.
9. Convert `Stock_Portfolio` only as validation data, not as the primary source of truth.
10. Convert `Attendance_Log` into `attendance_records`; treat `Daily_Attendance` as validation/view data.
11. Convert `Stock_Ratings` into `analyst_ratings` and `rating_rewards`.
12. Convert `Stock_Price_History` into `stock_price_ticks`, with retention/partitioning decisions.
13. Convert `Stock_News` and `Stock_News_Reports` into `market_events` / `market_news_items` after dedupe.
14. Reconcile balances, inventory, portfolios, rewards, attendance streaks, and payroll before enabling writes.
15. Keep immutable rollback backups of original CSV exports and staging imports.

Validation checks:

- Duplicate active credentials or card IDs.
- Negative or non-reconciling balances.
- Transaction totals versus player balances.
- Inventory holdings versus purchases and use logs.
- Portfolio holdings versus trade history.
- Rating reward amounts versus configured tiers.
- Attendance duplicates by player/date/class period.
- Payroll duplicate payments for the same period.
- Timezone conversion into `Asia/Seoul`.
- Stock history volume and query performance.

## 9. Replacement Implementation Phases

1. Phase 1: Replacement architecture document only.
2. Phase 2: Supabase project structure and local config only.
3. Phase 3: SQL schema for clean core domains.
4. Phase 4: RLS policies and security tests.
5. Phase 5: Edge Function compatibility router.
6. Phase 6: Read-only snapshot from Supabase behind config flag.
7. Phase 7: Store/inventory write flow.
8. Phase 8: Stock trading/portfolio flow.
9. Phase 9: Attendance/jobs/payroll flow.
10. Phase 10: Admin settings and presets.
11. Phase 11: Notifications/events/reports.
12. Phase 12: Decommission Apps Script after validation.

## 10. Risks And Open Questions

- Legacy duplicate concepts should be merged carefully: `Store` vs imported store, `Stock_News` vs `Stock_News_Reports`, `Stock_Portfolio` vs trade-derived holdings, `Daily_Attendance` vs `Attendance_Log`.
- UI/control sheets should not become database tables: `Scan`, `Store_Kiosk`, `Student_Profile`, `Stock_Trade`, `Stock_Rating_Submit`, `Dashboard`, and display/helper tabs are frontend/admin concerns or views.
- `apiRouter` routes `USE_ITEM` to `apiUseItem_`, but the committed router source does not include that function; the replacement must define item-use request behavior explicitly.
- Current Apps Script uses `LockService`; Supabase must use transactions, row locks, constraints, and idempotency.
- Current sessions use `CacheService`; replacement sessions need hashing, expiry, revocation, and rate limiting.
- Access code handling must be redesigned around hashes and rotation, not plaintext card IDs.
- Stock price history may become large; consider partitioning by game/date or retention policies.
- Current balance, inventory, portfolio, payroll, and reward state must reconcile before write cutover.
- Timezone behavior must remain aligned with `Asia/Seoul` for attendance windows, market hours, rating windows, payroll, and daily reports.
- Decide whether portfolio holdings and player balances are live views, materialized views, or transactionally maintained cache tables.
- Decide whether student/player auth should remain custom access-code sessions or move fully into Supabase Auth with magic links/passwordless staff-only auth.
- Decide how much of the stock simulation engine should live in SQL, Edge Functions, or an external worker.
