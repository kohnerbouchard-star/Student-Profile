# Full Financial Markets Migration and Integration Design V1

**Status:** `CONTROLLER_HOLD_DESIGN_ONLY`  
**Authority candidate:** PR #305 / `agent/full-financial-markets-expansion-v1`  
**Migration files created:** none  
**Migration versions reserved:** none  
**Production authorized:** no  
**Staging authorized:** no

This document is a controller-ready design package. It does not authorize schema changes, route registration, capability publication, import, activation, deployment, or release-train execution.

## 1. Controller decisions still required

Chat 1 must record all of the following before implementation begins:

1. final ownership of `EXP-MKT-001` through `EXP-MKT-016`;
2. whether PR #305 remains outside the current beta serial queue;
3. an exclusive migration range large enough for the proposed graph;
4. the shared-file merge and collision policy;
5. the final merge position;
6. isolated-staging release-train ownership;
7. the predecessor `main` commit that PR #305 must synchronize with;
8. whether the initial runtime import is 240 bounded Seed assets only, a reviewed subset of the 3,200 library, or both as separate inactive releases.

## 2. Proposed migration range size

The design requires **18 forward migration identities**, plus a recommended reserve of **6 correction identities**. Chat 1 should therefore assign a contiguous range capable of at least **24 unique versions**.

No version examples are included because inventing timestamps would violate the controller hold.

## 3. Migration dependency graph

```text
M01 reference definitions
 ├─ M02 issuer and administrator definitions
 │   ├─ M03 sector and industry taxonomy
 │   └─ M04 issuer relationship and exposure profiles
 ├─ M05 instrument and listing definitions
 │   ├─ M06 bonds, coupon schedules, and recovery policies
 │   ├─ M07 funds, trusts, holdings, and NAV policies
 │   ├─ M08 indexes, constituents, methodologies, and divisors
 │   └─ M09 commodities and economic benchmarks
 ├─ M10 game-scoped definition releases and inactive import audit
 │   ├─ M11 game-scoped instruments, listings, and quotes
 │   ├─ M12 game-scoped issuer statements and yield curves
 │   └─ M13 game-scoped events, corporate actions, and credit events
 ├─ M14 unified holdings and positions
 ├─ M15 orders, reservations, fills, trades, and fees
 │   └─ M16 atomic order and lifecycle RPCs
 ├─ M17 public read projections and staff correction boundaries
 └─ M18 RLS hardening, grants, indexes, comments, and verification helpers
```

Each migration must be transactional where PostgreSQL permits and replay-safe on an empty database. Applied migration history must never be renamed, rewritten, or concealed.

## 4. Proposed table inventory

### 4.1 Global inactive reference definitions

| Table | Purpose | Important uniqueness |
|---|---|---|
| `financial_market_source_releases` | Immutable source pack/version/checksum records | `(pack_id, version)` |
| `financial_market_countries` | Ten fictional country reference identities | `country_public_id`, `country_code` |
| `financial_market_currencies` | Fictional quotation/reporting currencies | `currency_public_id`, `currency_code` |
| `financial_market_exchanges` | Exchange definitions and calendar references | `exchange_public_id`, `exchange_code` |
| `financial_market_sectors` | Stable sector taxonomy | `sector_public_id` |
| `financial_market_industries` | Stable industry taxonomy under sector | `industry_public_id`, `(sector_public_id, code)` |
| `financial_market_issuers` | Corporation, sovereign, agency, fund, trust, index, exchange, and benchmark administrators | `issuer_public_id` |
| `financial_market_issuer_relationships` | Control, sponsorship, and administration relationships | `relationship_public_id` |
| `financial_market_risk_profiles` | Reviewed risk parameters | `risk_profile_public_id` |
| `financial_market_event_exposure_profiles` | Reviewed event factor mappings | `event_exposure_profile_public_id` |
| `financial_market_instruments` | Canonical 3,200 definitions and future reviewed additions | `instrument_public_id` |
| `financial_market_listings` | Exchange-local symbols and increments | `listing_public_id`, `(exchange_public_id, symbol)` |
| `financial_market_bonds` | Corporate, sovereign, and agency terms | `bond_public_id`, `instrument_public_id` |
| `financial_market_coupon_schedules` | Deterministic coupon and principal periods | `coupon_schedule_public_id`, `(bond_public_id, sequence)` |
| `financial_market_recovery_policies` | Default and recovery constraints | `recovery_policy_public_id` |
| `financial_market_funds` | ETF/fund terms | `fund_public_id`, `instrument_public_id` |
| `financial_market_fund_holdings` | Versioned target holdings | `(fund_public_id, component_public_id, effective_at)` |
| `financial_market_trusts` | Listed-trust terms | `trust_public_id`, `instrument_public_id` |
| `financial_market_index_methodologies` | Stable methodology, base value, divisor policy | `methodology_public_id` |
| `financial_market_indexes` | Broad, country, sector, and industry index identities | `index_public_id` |
| `financial_market_index_constituents` | Versioned constituent history | `(index_public_id, component_public_id, effective_at)` |
| `financial_market_commodity_benchmarks` | Cash-settled fictional commodity references | `commodity_public_id` |
| `financial_market_economic_benchmarks` | Fictional economic reference series | `benchmark_public_id` |
| `financial_market_calendar_policies` | Timezone, sessions, holidays, early closes | `calendar_policy_public_id` |
| `financial_market_trading_rule_policies` | Fees, minimums, increments, settlement rules | `trading_rule_policy_public_id` |

All global definitions default inactive. The 3,200 source records remain `design-candidate`, `runtimeSupport = unverified`, and `activationAuthorized = false` until a separately approved transformation and release process is completed.

### 4.2 Game-scoped runtime

| Table | Purpose | Game isolation |
|---|---|---|
| `game_financial_market_releases` | Import, activation, deactivation, rollback status | `game_session_id` in every unique key |
| `game_financial_market_release_members` | Immutable imported member identity and checksum history | `(game_session_id, release_id, instrument_public_id)` |
| `game_financial_market_issuers` | Per-game issuer state and status | `(game_session_id, issuer_public_id)` |
| `game_financial_market_instruments` | Per-game activation and valuation state | `(game_session_id, instrument_public_id)` |
| `game_financial_market_listings` | Per-game listing status, exchange, and symbol | `(game_session_id, listing_public_id)` |
| `game_financial_market_quotes` | Versioned quotes and stale-after timestamp | `(game_session_id, listing_public_id, quote_version)` |
| `game_financial_market_price_history` | Append-only price and valuation history | `(game_session_id, listing_public_id, sequence)` |
| `game_financial_market_statements` | Deterministic issuer statement periods | `(game_session_id, issuer_public_id, period_end, generator_version)` |
| `game_financial_market_yield_curves` | Versioned country/currency curves | `(game_session_id, curve_public_id, version)` |
| `game_financial_market_credit_events` | Upgrade, downgrade, default, and recovery | `(game_session_id, credit_event_public_id)` |
| `game_financial_market_corporate_actions` | Dividends, splits, coupons, maturity, conversion, rebalances | `(game_session_id, corporate_action_public_id)` |
| `game_financial_market_events` | Bounded country, sector, issuer, and instrument shocks | `(game_session_id, event_public_id)` |
| `game_financial_market_index_levels` | Historical index and benchmark continuity | `(game_session_id, benchmark_public_id, sequence)` |
| `game_financial_market_nav_history` | Fund/trust NAV history | `(game_session_id, vehicle_public_id, sequence)` |

### 4.3 Player-private execution

| Table | Purpose | Ownership boundary |
|---|---|---|
| `financial_market_holdings` | Unified quantities and cost basis | immutable player UUID internally; public IDs only in DTOs |
| `financial_market_orders` | Market/limit order lifecycle | player derived from authenticated session |
| `financial_market_reservations` | Cash or asset reservation | one active reservation per order/kind |
| `financial_market_fills` | Full-fill records initially | one fill per order while partial fills disabled |
| `financial_market_trades` | Settlement-facing immutable trade record | one trade per fill |
| `financial_market_fees` | Transaction, exchange, and fixed fees | derived server-side |
| `financial_market_cash_flows` | Coupons, maturity, dividends, distributions, recovery | deterministic idempotency key |
| `financial_market_audit_events` | Immutable staff and player action audit | no browser-written actor identity |

## 5. Proposed indexes

Every foreign key used by joins or cascading deletes receives a supporting index. Required high-value indexes include:

- active instrument search by `(game_session_id, asset_class, country_code, status, instrument_public_id)`;
- listing lookup by `(game_session_id, exchange_public_id, symbol)`;
- quote retrieval by `(game_session_id, listing_public_id, quote_version desc)`;
- issuer statements by `(game_session_id, issuer_public_id, period_end desc)`;
- curve lookup by `(game_session_id, country_code, currency_code, observed_at desc, version desc)`;
- holding reads by `(game_session_id, player_id, asset_class, instrument_public_id)`;
- open orders by `(game_session_id, player_id, status, created_at desc)`;
- lifecycle processing by `(game_session_id, status, expires_at)`;
- reservation enforcement by `(game_session_id, order_id, kind)` with a partial unique index for active reservations;
- idempotency by `(game_session_id, player_session_id, idempotency_key)`;
- cash-flow processing by `(game_session_id, payment_date, processing_status)`;
- event and corporate-action processing by `(game_session_id, effective_at, processing_status)`;
- release members by `(game_session_id, release_id, member_kind, member_public_id)`.

## 6. Proposed RPC inventory

### 6.1 Release and lifecycle

- `import_financial_market_release_v1`
- `activate_financial_market_release_v1`
- `deactivate_financial_market_release_v1`
- `rollback_financial_market_release_v1`
- `verify_financial_market_release_v1`

These RPCs require service-role execution, exact project/game/pack/version/checksum/source-commit authorization, immutable release identity, replay safety, and history preservation.

### 6.2 Order execution

- `create_financial_market_order_v1`
- `cancel_financial_market_order_v1`
- `expire_financial_market_orders_v1`
- `fill_financial_market_orders_for_quote_v1`
- `settle_financial_market_trade_v1`

The order RPCs must:

- derive player identity from a resolved session;
- resolve the listing and authoritative quote server-side;
- reject inactive, suspended, delisted, paused, closed, stale, or ended-game states;
- reserve cash or assets atomically;
- support market and limit orders;
- support only complete fills initially;
- reject duplicate fill, cancel, release, or settlement;
- calculate fees server-side;
- write ledger cash effects through the canonical ledger boundary;
- never accept browser-controlled execution price, gross value, fee, cash delta, or settlement amount.

### 6.3 Valuation and scheduled processing

- `apply_financial_market_tick_v1`
- `apply_financial_market_statement_period_v1`
- `apply_financial_market_curve_version_v1`
- `process_financial_market_cash_flows_v1`
- `process_financial_market_corporate_actions_v1`
- `apply_financial_market_credit_event_v1`
- `rebalance_financial_market_vehicle_v1`
- `recalculate_financial_market_index_v1`

Each scheduled operation requires an explicit idempotency or sequence key and must reject cross-game members.

### 6.4 Read projections

- `read_financial_market_board_v1`
- `read_financial_market_instrument_v1`
- `read_financial_market_issuer_v1`
- `read_financial_market_portfolio_v1`
- `read_financial_market_orders_v1`
- `read_financial_market_history_v1`
- `read_financial_market_admin_snapshot_v1`

Raw table access is not a Player or Admin API contract.

## 7. RLS and grants design

1. Enable and force RLS on every new runtime and execution table.
2. Revoke all table and function privileges from `public`, `anon`, and `authenticated` unless an explicit reviewed projection requires otherwise.
3. Grant table access only to `service_role` for Edge-mediated operations.
4. Keep global source definitions read-only to normal runtimes.
5. Require every service function to use `SECURITY DEFINER` only when needed, a fixed `search_path = public, pg_temp`, explicit argument validation, and explicit cross-game predicates.
6. Player browser requests authenticate through the Supabase gateway and the existing `x-player-session-token` application session. They never submit internal player or game UUIDs.
7. Staff operations resolve staff authorization before service-role access and write immutable audit events.
8. Public DTO projections expose stable public IDs and reviewed labels only.

## 8. Shared-file collision inventory

The following files are intentionally untouched during controller hold and will require serial additive integration:

- `backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts`;
- `backend/src/security/playerRateLimitDispatch.ts`;
- `backend/src/security/classroomApiRateLimitDispatch.test.ts`;
- `backend/supabase/functions/classroom-api/index.ts`;
- `backend/supabase/functions/admin-api/index.ts`;
- `player-terminal/src/api/backend-routes.js`;
- `player-terminal/src/integrations/student-profile-capability-manifest.js`;
- shared Player resource/endpoint maps;
- shared Admin resource plans;
- shared package scripts and release inventories.

PRs #294, #299, #300, #249, #248, and #261 may change several of these files before PR #305 is eligible. Chat 1 must specify the predecessor merge commit and additive collision procedure.

## 9. Classroom API route plan

Proposed Player routes, subject to capability and rate-limit review:

- `GET /players/me/markets`
- `GET /players/me/markets/instruments/:instrumentPublicId`
- `GET /players/me/markets/issuers/:issuerPublicId`
- `GET /players/me/markets/history/:listingPublicId`
- `GET /players/me/portfolio`
- `GET /players/me/markets/orders`
- `POST /players/me/markets/orders`
- `POST /players/me/markets/orders/:orderPublicId/cancel`

Requests derive scope from the authenticated Player session. Browser-provided settlement values are rejected.

## 10. Admin API route plan

Proposed Admin routes:

- `GET /admin/games/:gamePublicId/markets`
- `GET /admin/games/:gamePublicId/markets/issuers`
- `GET /admin/games/:gamePublicId/markets/releases`
- `POST /admin/games/:gamePublicId/markets/releases/import`
- `POST /admin/games/:gamePublicId/markets/releases/:releasePublicId/activate`
- `POST /admin/games/:gamePublicId/markets/releases/:releasePublicId/deactivate`
- `POST /admin/games/:gamePublicId/markets/releases/:releasePublicId/rollback`
- `POST /admin/games/:gamePublicId/markets/pause`
- `POST /admin/games/:gamePublicId/markets/resume`
- `POST /admin/games/:gamePublicId/markets/corrections`

Activation routes remain disabled until controller and product-owner approval exists.

## 11. Capability-manifest plan

Planned capabilities are additive and versioned:

- `financialMarkets.board.read`
- `financialMarkets.instrument.read`
- `financialMarkets.issuer.read`
- `financialMarkets.history.read`
- `financialMarkets.portfolio.read`
- `financialMarkets.order.read`
- `financialMarkets.order.create`
- `financialMarkets.order.cancel`
- `financialMarkets.admin.read`
- `financialMarkets.admin.pause`
- `financialMarkets.admin.correct`
- `financialMarkets.release.import`
- `financialMarkets.release.activate`
- `financialMarkets.release.deactivate`
- `financialMarkets.release.rollback`

Release activation capabilities must remain unavailable to Player clients and disabled until approved.

## 12. Rate-limit action plan

Proposed rate-limit actions:

| Action | Class | Initial policy direction |
|---|---|---|
| `financial_market_board_read` | read | moderate burst, per session/game |
| `financial_market_instrument_read` | read | moderate burst, per session/game/instrument |
| `financial_market_portfolio_read` | private read | lower burst, per player session |
| `financial_market_order_read` | private read | lower burst, per player session |
| `financial_market_order_create` | economic write | strict, per player session/listing |
| `financial_market_order_cancel` | economic write | strict, per player session/order |
| `financial_market_admin_read` | staff read | per staff/game |
| `financial_market_admin_correction` | privileged write | very strict, per staff/game |
| `financial_market_release_action` | release write | single-flight, staff/project/game/release |

Final values require load evidence and shared-dispatch convergence.

## 13. Player resource plan

The accepted Player Terminal visual system remains unchanged. Planned resources:

- multi-asset market board with filter/search/pagination;
- instrument detail with quote, history, issuer, statements, bond/fund/index details;
- unified Portfolio grouped by asset class and currency;
- market/limit order ticket with reviewed quote version and fee preview;
- open-order list with cancellation;
- clear closed, paused, stale, suspended, delisted, defaulted, and inactive states;
- public IDs and symbols only; no internal UUIDs.

## 14. Admin resource plan

Planned Admin resources:

- market overview and exchange status;
- release inventory and inactive-member review;
- issuer and instrument inspection;
- editorial warning and approval queue;
- quote, curve, statement, event, and corporate-action audit;
- pause/resume control;
- bounded correction workflow with immutable audit;
- release import/activation/deactivation/rollback, disabled until approved.

## 15. Inactive 3,200-record import plan

1. Validate all source checksums and deterministic ordering.
2. Produce the editorial review and non-mutating transformation plan.
3. Obtain human approval for each queued record.
4. Create a reviewed transformed release without modifying bounded Seed source.
5. Bind release authorization to project, game, pack, version, digest, exact source commit, approver, and expiry.
6. Import definitions and members inactive inside one transaction.
7. Replay the same release identity and prove no duplicate records.
8. Reject conflicting content for an existing release identity.
9. Verify all 3,200 members and per-country/type allocation through database and API projections.
10. Keep every member inactive until a separate bounded activation decision.

The initial activation should use a reviewed bounded subset. Automatic activation of all 3,200 definitions remains prohibited.

## 16. Isolated-staging plan

After controller assignment and final synchronization:

1. create or select an isolated staging target whose migration history exactly matches the final release source;
2. apply migrations through the approved release path;
3. create one synthetic game through the protected management boundary;
4. import the reviewed release inactive;
5. verify replay, conflict rejection, cross-game isolation, and public/private projections;
6. activate only the approved bounded subset;
7. execute statement, curve, quote, order, cancellation, expiry, fill, fee, cash-flow, default, recovery, fund, trust, index, and benchmark scenarios;
8. deactivate, reactivate the same identity, rollback with history preservation, re-import, and final rollback;
9. retain sanitized evidence bound to the exact source and workflow commit;
10. prove production was not touched.

## 17. Rollback plan

Rollback is forward-only and history-preserving:

- stop new market writes and pause processing;
- expire or cancel eligible open orders and release reservations exactly once;
- finish or explicitly reverse committed settlements according to ledger rules;
- deactivate the release without deleting immutable audit, order, fill, trade, fee, statement, curve, event, or release-member history;
- restore the prior active bounded release identity;
- verify Player/Admin projections and balances;
- retain source commit, migration set, release digest, operator, reason, and verification evidence.

## 18. Bounded activation plan

Activation selection must be explicit and reviewed by country, exchange, asset class, instrument type, issuer, and instrument public ID. It must enforce:

- approved inactive definition state;
- active issuer and reviewed listing;
- source checksum and editorial approval;
- valid exchange calendar and trading rules;
- no short selling;
- no derivatives;
- no physical delivery;
- no real-world feeds;
- no unrestricted complex convertible pricing;
- no partial fills until complete-fill reservation invariants pass connected staging.

## 19. Acceptance evidence required after hold release

- empty-database migration replay and lint;
- forward-compatibility and rollback notes;
- 3,200-record inactive import and replay evidence;
- cross-game isolation;
- public-ID privacy and no browser-controlled settlement values;
- concurrent cash/asset reservation and fill/cancel tests;
- statement reconciliation and bounded long-horizon simulation;
- fixed-income, fund, trust, index, commodity, and benchmark lifecycle evidence;
- relevant desktop and mobile Player/Admin browser evidence;
- load evidence at controller-assigned concurrency;
- connected isolated-staging activation, deactivation, reactivation, rollback, and recovery;
- exact-head CI and immutable evidence digest.

## 20. Hold declaration

This design package is complete for controller review. It contains no executable migration identity and grants no authority to alter shared runtime files or connected environments.
