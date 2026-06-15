# Supabase Core Schema V1 Design

This is a design document only.

This checkpoint does not create migrations. It does not create RLS policies. It does not implement Edge Functions. It locks the backend core loop and intended SQL shape before implementation so the next migration checkpoint can be reviewed against a clear contract.

## Backend Core Loop V1

1. Teacher redeems a purchase code.
2. Backend validates purchase code server-side.
3. Backend creates an entitlement.
4. Backend creates a `game_sessions` row.
5. Backend sets `game_sessions.owner_staff_user_id` to the teacher.
6. Backend creates or rotates a `game_join_code` for the game session.
7. Teacher creates/imports players inside that game session.
8. Backend creates student codes for players inside that game session.
9. Player logs in with `game_join_code + student_code`.
10. Backend resolves `game_join_code` to exactly one active `game_session_id`.
11. Backend resolves `student_code` only inside that `game_session_id`.
12. Backend resolves login to exactly one `player_id` and one `game_session_id`.
13. Backend creates a player session.
14. Player requests their snapshot.
15. Backend returns shared game data for that `game_session_id` plus private rows for that `player_id`.
16. Player submits an action.
17. Backend derives `player_id` and `game_session_id` from the session, not from trusted client input.
18. Backend validates action permissions and resource ownership.
19. Backend writes authoritative records.
20. If money changes, backend writes `ledger_entries`.
21. Backend updates `account_balances` as a projection/cache.
22. Backend writes `audit_log`.
23. Backend returns a result or updated snapshot.

## V1 Role Model

- V1 has one teacher role only.
- V1 has one player/student role only.
- No support teachers in V1.
- No assistant teachers in V1.
- No platform users in V1.
- No developer app role in V1.
- Developers use GitHub, local dev, staging, and test data, not production app access.
- System service jobs may exist later, but they are not human users.
- `staff_users` in V1 means teacher users only. Do not add staff role variants yet.

## Game Session Isolation Contract

1. `game_sessions.id` is the isolation boundary between teacher-owned games.
2. No live simulation table may exist without `game_session_id` unless it is a global template/reference table.
3. Global template tables are starter/reference data only, not live game state.
4. Live game state must be copied or scoped per `game_session_id`.
5. Teacher access is based on `game_sessions.owner_staff_user_id`.
6. A teacher can access only games they own.
7. RLS must enforce teacher game-session boundaries later.
8. Edge Functions must verify `game_session_id` on every write later.
9. No cross-game student, stock, economy, attendance, store, inventory, notification, or audit leakage is allowed.

## Student Data Isolation Contract

1. `game_session_id` protects one teacher-owned game from another teacher-owned game.
2. `player_id` protects one student from another student inside the same game.
3. Student-private tables must include both `game_session_id` and `player_id`.
4. Shared game tables may use `game_session_id` without `player_id`.
5. A player session must resolve to exactly one `player_id` and one `game_session_id`.
6. Students must never be trusted to send their own `player_id` as authority.
7. Edge Functions must derive `player_id` from the session/auth context.
8. RLS must enforce player ownership on every private student table later.
9. Guessing another `player_id` must not grant access.
10. URLs/request payloads may include IDs for routing, but authorization must be checked server-side.
11. Private player tables should reference players through `(game_session_id, player_id)` so rows cannot mix a player from one game with another game session.

## Student Login Code Contract

- Student/player login uses two codes: `game_join_code + student_code`.
- `purchase_code`, `game_join_code`, and `student_code` are three separate concepts.
- `purchase_code` is used by a teacher to activate/create a licensed game session.
- `game_join_code` identifies the teacher-owned game session/class.
- `student_code` identifies one player inside that game session.
- `game_join_code` must never be treated as a purchase/license code.
- `student_code` must never be treated as an internal `players.id`.
- `players.id` remains a database-generated UUID primary key and is never manually entered by teachers or students.
- Student display names, roster numbers, and typed student codes are not player IDs.
- `game_join_code` should be unique among active game sessions.
- `student_code` should be unique only within a single `game_session_id`.
- The same `student_code` may exist in different game sessions.
- The active credential uniqueness rule should be equivalent to active `game_session_id + normalized_student_code_hash` must be unique.
- Store code hashes, not plaintext codes.
- Regenerating a student code should revoke/deactivate the old active credential before activating the new one.
- Regenerating a game join code should revoke/invalidate the old active join code.
- Later implementation should include rate limiting, failed-attempt logging, and lockout/throttling for repeated bad login attempts.

## Student Code Duplicate Prevention Contract

- Teacher-assigned `student_code` values must be unique among active players inside the same `game_session_id`.
- No two active players in the same game session may share the same `student_code`.
- The same `student_code` may be reused in a different game session because login uses `game_join_code + student_code`.
- Duplicate prevention must be enforced server-side, not only in the frontend.
- Teacher roster imports must be validated before writing.
- If a teacher imports or assigns duplicate active student codes inside the same game session, the backend must reject the request and return a clear duplicate-code error.
- Batch imports should report which rows/codes conflict before creating or updating players.
- Code assignment and regeneration must run inside a transaction.
- The backend must normalize codes before checking uniqueness, for example trimming whitespace and applying consistent casing.
- The frontend may warn teachers about duplicates, but the database/backend remains the source of truth.
- Future SQL design should use a database-level unique constraint or partial unique index equivalent to active `game_session_id + normalized_student_code_hash`.
- Do not rely only on application code for duplicate prevention.

## Core Tables

### Core table groups

Licensing:

- `purchase_codes`
- `entitlements`

Teacher:

- `staff_users`

Game:

- `game_sessions`
- `game_settings`

Player:

- `players`
- `player_access_credentials`
- `player_sessions`

Economy:

- `ledger_entries`
- `account_balances`

Audit:

- `audit_log`

Future simulation tables must follow the same core contracts. Examples include `attendance_records`, `store_items`, `inventory_holdings`, `inventory_events`, `stock_assets`, `stock_price_ticks`, `stock_trades`, `analyst_ratings`, and `notification_jobs`.

### `staff_users`

- Purpose: teacher user record for V1 app ownership.
- Primary key: database-generated `id`.
- Important fields: `supabase_auth_user_id`, `email`, `display_name`, timestamps.
- Required relationships: referenced by `game_sessions.owner_staff_user_id` and `entitlements.staff_user_id`.
- Required `game_session_id` behavior: no `game_session_id`; access to games is through owned `game_sessions`.
- Classification: source of truth for teacher identity in V1. `staff_users` means teacher users only; do not add staff role variants yet.

### `purchase_codes`

- Purpose: validates whether a teacher can activate/create a licensed game session.
- Primary key: database-generated `id`.
- Important fields: `code_hash`, `status`, `max_redemptions`, `redeemed_count`, `expires_at`, timestamps.
- Required relationships: referenced by `entitlements.purchase_code_id`.
- Required `game_session_id` behavior: no `game_session_id`; purchase codes are licensing reference/activation state, not live game state.
- Classification: source of truth for purchase-code redemption eligibility. Redemption is server-side only.

### `entitlements`

- Purpose: links a redeemed purchase code to a teacher and game session.
- Primary key: database-generated `id`.
- Important fields: `purchase_code_id`, `staff_user_id`, `game_session_id`, `status`, `created_at`.
- Required relationships: references `purchase_codes`, `staff_users`, and `game_sessions`.
- Required `game_session_id` behavior: includes `game_session_id` because the entitlement authorizes a specific game session.
- Classification: source of truth linking teacher/license/game session.

### `game_sessions`

- Purpose: top-level teacher-owned simulation container.
- Primary key: database-generated `id`.
- Important fields: `owner_staff_user_id`, `name`, `status`, `game_join_code_hash`, `game_join_code_status`, timestamps.
- Required relationships: references `staff_users`; referenced by all live game-state tables.
- Required `game_session_id` behavior: this table owns the isolation boundary; child live-state tables reference `game_sessions.id`.
- Classification: teacher ownership source of truth and game isolation boundary.

### `game_settings`

- Purpose: per-game configurable simulation windows and settings.
- Primary key: database-generated `id`.
- Important fields: `game_session_id`, `difficulty_preset`, `attendance_window`, `business_market_window`, `stock_market_window`, `news_schedule`, timestamps.
- Required relationships: one row references one `game_sessions.id`.
- Required `game_session_id` behavior: exactly one settings row per game session.
- Classification: source of truth for per-game configuration.

### `players`

- Purpose: internal student/player identity inside a game session.
- Primary key: database-generated `id`.
- Important fields: `game_session_id`, `display_name`, `roster_label`, `status`, timestamps.
- Required relationships: references `game_sessions`; referenced by private player tables through `(game_session_id, player_id)` where possible.
- Required `game_session_id` behavior: every player belongs to exactly one game session.
- Classification: internal player identity source of truth. Duplicate display names are allowed.

### `player_access_credentials`

- Purpose: active and revoked student-code credentials for player login.
- Primary key: database-generated `id`.
- Important fields: `game_session_id`, `player_id`, `normalized_student_code_hash`, `status`, `created_at`, `revoked_at`.
- Required relationships: references `players` through `(game_session_id, player_id)` in the future SQL shape.
- Required `game_session_id` behavior: credential uniqueness is scoped to active credentials inside one game session.
- Classification: credential state, not player identity source of truth.

### `player_sessions`

- Purpose: session state after successful `game_join_code + student_code` login.
- Primary key: database-generated `id`.
- Important fields: `game_session_id`, `player_id`, `session_token_hash`, `status`, `created_at`, `expires_at`, `revoked_at`.
- Required relationships: references `players` through `(game_session_id, player_id)` in the future SQL shape.
- Required `game_session_id` behavior: every session resolves to exactly one game and one player.
- Classification: session state.

### `ledger_entries`

- Purpose: authoritative append-only record of money movement.
- Primary key: database-generated `id`.
- Important fields: `game_session_id`, `player_id`, `account_type`, `amount`, `currency_code`, `entry_type`, `source_domain`, `source_action`, `source_id`, `created_at`, `created_by_type`, `created_by_id`.
- Required relationships: references `game_sessions`; player-specific rows reference players through `(game_session_id, player_id)` where possible.
- Required `game_session_id` behavior: every ledger entry belongs to one game session; player-specific entries include `player_id`.
- Classification: source of truth for money movement. Append-only and server-side writes only.

### `account_balances`

- Purpose: current balance projection/cache for fast reads.
- Primary key: database-generated `id`.
- Important fields: `game_session_id`, `player_id`, `balance`, `currency_code`, `last_ledger_entry_id`, `updated_at`.
- Required relationships: references `players` through `(game_session_id, player_id)` where possible and may reference `ledger_entries`.
- Required `game_session_id` behavior: one active/current balance row per `game_session_id + player_id`.
- Classification: projection/cache, not source of truth. Updated by trusted server-side logic only.

### `audit_log`

- Purpose: sensitive action history across teacher, player, and system actions.
- Primary key: database-generated `id`.
- Important fields: `game_session_id`, `actor_type`, `actor_id`, `action`, `target_type`, `target_id`, `metadata`, `created_at`.
- Required relationships: may reference game, actor, or target conceptually; should remain append-only and resilient even if target rows are archived later.
- Required `game_session_id` behavior: include `game_session_id` when an action belongs to a game; allow nullable only for global licensing/system events.
- Classification: source of truth for sensitive action history.

## Future SQL Shape

This section documents intended SQL structure in design form only. It does not create migration files and does not write executable SQL migrations.

### Core SQL design rules

- Use database-generated UUID primary keys for internal IDs.
- `players.id` must be a database-generated UUID and must never be manually entered by users.
- `game_sessions.id` must be a database-generated UUID and is the game isolation boundary.
- Student-private tables must include both `game_session_id` and `player_id`.
- Shared game tables must include `game_session_id`.
- Global template/reference tables may omit `game_session_id`, but they must never represent live game state.
- Private player tables should reference players through `(game_session_id, player_id)` to prevent mismatched game/player rows.
- Add a future unique constraint or index equivalent to `players(game_session_id, id)` so private tables can safely reference the player within the game.
- Add a future partial unique index equivalent to active `game_session_id + normalized_student_code_hash` for student credentials.
- Add a future partial unique index equivalent to active `game_join_code_hash` for game join codes.
- Add a future uniqueness rule for one active balance row per `game_session_id + player_id`.
- Add future indexes around `game_session_id`, `player_id`, teacher ownership, active credentials, and common lookup fields.
- Do not write real migration files in this checkpoint.

### Future table shape: `staff_users`

- Proposed columns: `id uuid`, `supabase_auth_user_id uuid`, `email text`, `display_name text`, `created_at timestamptz`, `updated_at timestamptz`.
- Primary key: `id uuid primary key`.
- Foreign keys: none in V1.
- Unique constraints: `supabase_auth_user_id` unique, `email` unique.
- Important indexes: unique lookup indexes for Supabase auth user and email.
- Soft-delete/archive fields: none planned for V1; consider status/archive only after review.
- Needs `game_session_id`: no.
- Needs `player_id`: no.
- Classification: teacher identity source of truth. V1 note: teacher users only. Do not add staff role variants yet.

### Future table shape: `purchase_codes`

- Proposed columns: `id uuid`, `code_hash text`, `status text`, `max_redemptions integer`, `redeemed_count integer`, `expires_at timestamptz nullable`, `created_at timestamptz`, `updated_at timestamptz`.
- Primary key: `id uuid primary key`.
- Foreign keys: none.
- Unique constraints: `code_hash` unique.
- Important indexes: `code_hash`, `status`, `expires_at`.
- Soft-delete/archive fields: status-driven lifecycle; no hard delete required for redeemed codes.
- Needs `game_session_id`: no.
- Needs `player_id`: no.
- Classification: source of truth for purchase-code redemption eligibility; server-side redemption only.

### Future table shape: `entitlements`

- Proposed columns: `id uuid`, `purchase_code_id uuid`, `staff_user_id uuid`, `game_session_id uuid`, `status text`, `created_at timestamptz`.
- Primary key: `id uuid primary key`.
- Foreign keys: `purchase_code_id` references `purchase_codes(id)`, `staff_user_id` references `staff_users(id)`, `game_session_id` references `game_sessions(id)`.
- Unique constraints: review whether one entitlement per `game_session_id` is required.
- Important indexes: `staff_user_id`, `purchase_code_id`, `game_session_id`, `status`.
- Soft-delete/archive fields: status-driven lifecycle.
- Needs `game_session_id`: yes.
- Needs `player_id`: no.
- Classification: source of truth linking teacher/license/game session.

### Future table shape: `game_sessions`

- Proposed columns: `id uuid`, `owner_staff_user_id uuid`, `name text`, `status text`, `game_join_code_hash text`, `game_join_code_status text`, `created_at timestamptz`, `updated_at timestamptz`.
- Primary key: `id uuid primary key`.
- Foreign keys: `owner_staff_user_id` references `staff_users(id)`.
- Unique constraints: future partial unique index equivalent to active `game_join_code_hash`.
- Important indexes: `owner_staff_user_id`, `status`, active `game_join_code_hash`.
- Soft-delete/archive fields: status-driven lifecycle for active, archived, or disabled games.
- Needs `game_session_id`: this table is the source of `game_session_id`; child tables reference `id`.
- Needs `player_id`: no.
- Classification: teacher ownership source of truth and game isolation boundary.

### Future table shape: `game_settings`

- Proposed columns: `id uuid`, `game_session_id uuid`, `difficulty_preset text`, `attendance_window jsonb`, `business_market_window jsonb`, `stock_market_window jsonb`, `news_schedule jsonb`, `created_at timestamptz`, `updated_at timestamptz`.
- Primary key: `id uuid primary key`.
- Foreign keys: `game_session_id` references `game_sessions(id)`.
- Unique constraints: `game_session_id` unique for one settings row per game session.
- Important indexes: `game_session_id`.
- Soft-delete/archive fields: none planned; lifecycle follows `game_sessions`.
- Needs `game_session_id`: yes.
- Needs `player_id`: no.
- Classification: per-game configuration source of truth.

### Future table shape: `players`

- Proposed columns: `id uuid`, `game_session_id uuid`, `display_name text`, `roster_label text nullable`, `status text`, `created_at timestamptz`, `updated_at timestamptz`.
- Primary key: `id uuid primary key`.
- Foreign keys: `game_session_id` references `game_sessions(id)`.
- Unique constraints: future unique/index equivalent to `(game_session_id, id)` for composite foreign keys. Do not require unique display names.
- Important indexes: `game_session_id`, `status`, `(game_session_id, status)`.
- Soft-delete/archive fields: status-driven lifecycle for active, archived, or removed players.
- Needs `game_session_id`: yes.
- Needs `player_id`: this table creates player IDs.
- Classification: internal player identity source of truth.

### Future table shape: `player_access_credentials`

- Proposed columns: `id uuid`, `game_session_id uuid`, `player_id uuid`, `normalized_student_code_hash text`, `status text`, `created_at timestamptz`, `revoked_at timestamptz nullable`.
- Primary key: `id uuid primary key`.
- Foreign keys: future foreign key equivalent to `(game_session_id, player_id)` references `players(game_session_id, id)`.
- Unique constraints: future partial unique index equivalent to active `game_session_id + normalized_student_code_hash`.
- Important indexes: `(game_session_id, normalized_student_code_hash, status)`, `(game_session_id, player_id)`, `status`.
- Soft-delete/archive fields: `revoked_at` and `status`.
- Needs `game_session_id`: yes.
- Needs `player_id`: yes.
- Classification: credential state, not player identity source of truth.

### Future table shape: `player_sessions`

- Proposed columns: `id uuid`, `game_session_id uuid`, `player_id uuid`, `session_token_hash text`, `status text`, `created_at timestamptz`, `expires_at timestamptz`, `revoked_at timestamptz nullable`.
- Primary key: `id uuid primary key`.
- Foreign keys: future foreign key equivalent to `(game_session_id, player_id)` references `players(game_session_id, id)`.
- Unique constraints: `session_token_hash` unique.
- Important indexes: `session_token_hash`, `(game_session_id, player_id)`, `expires_at`, `status`.
- Soft-delete/archive fields: `revoked_at` and `status`.
- Needs `game_session_id`: yes.
- Needs `player_id`: yes.
- Classification: session state; session resolves to exactly one player and one game.

### Future table shape: `ledger_entries`

- Proposed columns: `id uuid`, `game_session_id uuid`, `player_id uuid nullable`, `account_type text`, `amount numeric`, `currency_code text`, `entry_type text`, `source_domain text`, `source_action text`, `source_id uuid nullable`, `created_at timestamptz`, `created_by_type text`, `created_by_id uuid nullable`.
- Primary key: `id uuid primary key`.
- Foreign keys: `game_session_id` references `game_sessions(id)`; when player-specific, future relationship equivalent to `(game_session_id, player_id)` references `players(game_session_id, id)`.
- Unique constraints: consider idempotency uniqueness around source fields only after action design review.
- Important indexes: `game_session_id`, `(game_session_id, player_id)`, `created_at`, `(source_domain, source_action, source_id)`.
- Soft-delete/archive fields: none; append-only design.
- Needs `game_session_id`: yes.
- Needs `player_id`: nullable for game-level/system entries, required for player-specific entries.
- Classification: source of truth for money movement; server-side writes only.

### Future table shape: `account_balances`

- Proposed columns: `id uuid`, `game_session_id uuid`, `player_id uuid`, `balance numeric`, `currency_code text`, `last_ledger_entry_id uuid nullable`, `updated_at timestamptz`.
- Primary key: `id uuid primary key`.
- Foreign keys: future foreign key equivalent to `(game_session_id, player_id)` references `players(game_session_id, id)`; `last_ledger_entry_id` references `ledger_entries(id)`.
- Unique constraints: one active/current row per `game_session_id + player_id`.
- Important indexes: `(game_session_id, player_id)`, `last_ledger_entry_id`.
- Soft-delete/archive fields: none planned; projection can be rebuilt.
- Needs `game_session_id`: yes.
- Needs `player_id`: yes.
- Classification: projection/cache, not source of truth.

### Future table shape: `audit_log`

- Proposed columns: `id uuid`, `game_session_id uuid nullable`, `actor_type text`, `actor_id uuid nullable`, `action text`, `target_type text`, `target_id uuid nullable`, `metadata jsonb`, `created_at timestamptz`.
- Primary key: `id uuid primary key`.
- Foreign keys: optional by design; preserve audit history even if target rows are archived. `game_session_id` may reference `game_sessions(id)` where practical.
- Unique constraints: none.
- Important indexes: `game_session_id`, `actor_type`, `actor_id`, `target_type`, `target_id`, `action`, `created_at`.
- Soft-delete/archive fields: none; should be append-only.
- Needs `game_session_id`: nullable only for global licensing/system events; required for game-scoped sensitive actions.
- Needs `player_id`: no dedicated column; actor/target may identify a player.
- Classification: source of truth for sensitive action history.

## Economy Contract

- `ledger_entries` is the source of truth for money movement.
- `account_balances` is a database-backed projection/cache updated by trusted server-side logic.
- Domains such as store, stocks, attendance, analyst, and inventory must not directly edit balances.
- All money movement must go through the economy ledger.
- Ledger writes must be server-side only.
- `account_balances` can be rebuilt from `ledger_entries` if necessary.

## Server-side Action Contract

- API handlers must stay thin.
- Cross-domain actions must be coordinated through `application/` use-cases.
- Every write action must:
  1. resolve session
  2. derive teacher/player identity
  3. derive `game_session_id`
  4. validate permissions
  5. validate resource ownership
  6. write authoritative records
  7. write ledger entry if money changes
  8. update projections if needed
  9. write audit log
  10. return result or updated snapshot
- The frontend must never directly determine authoritative `player_id`, `game_session_id`, balance, trade ownership, or ledger effects.

## Game Settings Contract

- `game_settings` owns configurable simulation windows.
- It includes attendance window, business/customer traffic window, stock market/trading window, news schedule, and difficulty preset settings.
- Defaults can be documented later, but are not implemented here:
  - business/customer traffic default target: `7:00 AM-5:00 PM`
  - stock market/trading default target: `9:00 AM-4:00 PM`
  - attendance window configurable
  - news schedule configurable

## RLS Design Notes

- Include RLS design notes but do not write policies yet.
- RLS must be enabled on exposed app tables later.
- Teacher access must be scoped to games where `game_sessions.owner_staff_user_id` matches the teacher.
- Player access must be scoped to the player's own `players.id` and `players.game_session_id`.
- Purchase code redemption must be server-side only.
- Ledger writes must be server-side only.
- Service-role credentials must never be exposed to the frontend.
- Private player data requires both `game_session_id` and `player_id`.

## Recommended V1 Decisions

- Use one teacher role and one player role.
- Do not add `platform_users` in V1.
- Do not add `game_staff` in V1.
- Use `game_sessions.owner_staff_user_id` for teacher ownership.
- Use `game_session_id` on all live game data.
- Use `game_session_id + player_id` on private player data.
- Use `game_join_code + student_code` for student login.
- Make `student_code` unique only inside one `game_session_id`.
- Prevent duplicate active student codes inside the same game session.
- Use database-generated UUIDs for internal IDs.
- Use global templates only as starter/reference data.
- Use per-game copied/scoped live state.
- Use ledger entries as the money source of truth.
- Use `account_balances` as a projection/cache.
- Keep purchase codes separate from game join codes and student codes.
- Keep purchase-code redemption server-side only.
- Keep ledger writes server-side only.
- Do not implement external cache in V1.
