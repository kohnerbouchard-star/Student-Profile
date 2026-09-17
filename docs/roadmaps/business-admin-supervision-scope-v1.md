# Admin Business Supervision Scope v1

**Roadmap item:** `BUSINESS-V2-13`
**Status:** `IN_PROGRESS` — full Phase 13 candidate, certification pending
**Branch:** `feat/admin-business-supervision-v2`
**Stacked base:** `feat/player-business-workspace-v2`
**Parent Phase 12 implementation identity:** `76539c5cfcff612a322963e303e727e6edc7f7ed`
**Parent Phase 12 documentation handoff:** `d6ddb52f38da1ad931ba56600b49786f11f11ac6`
**Phase 13A implementation candidate:** `d66c9cd6e464ff0b3adcf0869f442d3d67a2166b`
**Merge/deployment authorization:** none

## Objective

Give authorized Admin users privacy-safe, read-only operational visibility into canonical Business state without impersonating a Player, reconstructing economic state in the browser, or creating a parallel Business, Inventory, Store, Banking, workforce, equipment, manufacturing, tax, ownership, or audit authority.

The Admin surface supervises. Players continue to make Business decisions and canonical server authorities continue to calculate and settle economic outcomes.

## Required supervision workspace

The Business directory and selected-Business detail must expose only trusted, server-derived state:

1. **Directory and status** — public Business key, name, entity/status/compliance summary, operating country/currency, high-level readiness, and bounded financial-health indicators.
2. **Stockroom** — canonical Warehouse, Work in Progress, Finished Goods, In Transit, and Store Listing quantities, reservations, availability, and cost-currency evidence.
3. **Production** — manufacturing jobs by lifecycle, product/recipe public identity, quantity, priority, server timing, material/labor/equipment readiness, and bottlenecks.
4. **Workforce and payroll** — active employees through privacy-safe labels/public identities, role, utilization/capacity, payroll due/paid/unpaid evidence, and bounded termination/status history where already canonical.
5. **Equipment** — canonical equipment item/public identity, installation state, capability, condition/status, available/reserved capacity, and production reservations.
6. **Store and sales** — seller offers, Finished Goods versus Listed quantities, active/withdrawal-pending/cancelled state, withdrawal effective time, committed receipts, revenue, COGS, and gross-margin evidence.
7. **Treasury and financial health** — Business Checking public keys, currency, posted/held/available balance, FX order/receipt evidence, payroll and tax liabilities, and server-derived health flags. No raw ledger/account UUIDs.
8. **Operating periods and tax** — canonical period status, Store-derived revenue/COGS, payroll, tax calculation/settlement status, unpaid tax liability, and immutable close evidence.
9. **Ownership and governance** — privacy-safe ownership percentages/units, entity/governance state, and public owner labels/keys only. Raw Player UUIDs and credentials are forbidden.
10. **Activity and audit** — immutable Business activity and bounded Admin-relevant audit evidence using public target identities and redacted metadata.

## Authority design

- Admin game scope is derived from the authenticated Admin route and capability context.
- Business scope is supplied only as a validated public `biz_<32 hex>` key and revalidated against the same game.
- Admin reads use narrow service-side projections over canonical tables/read helpers. They do not supply or fabricate a `player_id` to Player-owned RPCs.
- Browser responses are public-key-only, bounded, deterministic, no-store, and scrubbed of internal UUIDs, Auth identities, credential material, private account IDs, and unbounded metadata.
- Read projections may aggregate canonical evidence but may not persist a second operational read authority or browser-authored economic cache.
- Existing `business.manage` capability, MFA/authentication, CSRF, rate limits, game isolation, and security logging remain mandatory.
- The plural Admin resource `businesses` must normalize to capability `business.manage` and rate-limit resource `business`.

## Explicit non-goals

- No Admin-authored sales, demand, revenue, COGS, payroll, tax, price, inventory, production, capacity, FX, balance, ownership, or settlement outcome.
- No free-form monetary or quantity editing.
- No fake Player session or owner impersonation.
- No raw UUIDs or credentials in API responses, DOM, URLs, logs, or artifacts.
- No IPO, issuance, securities publication, Financial Market listing, or Phase 14 implementation.
- No new scheduler/cron, secret, deployment, staging/production SQL, or live-data mutation.

## Tranches

### 13A — Authority contract and directory/detail foundation

- [x] Verify Admin route/capability/rate-limit normalization.
- [x] Add narrow public-key contracts and service-side directory/detail projection.
- [x] Add selected-Business route state, loading/error/empty handling, and no-store behavior.
- [x] Remove the Admin v2 compliance mutation affordance from this supervision workspace; the existing legacy authority is not expanded or treated as Phase 13 intervention authority.

### 13B — Stockroom, production, workforce/payroll, and equipment

- Reuse canonical Inventory-backed stockroom evidence.
- Present manufacturing readiness/jobs and finite labor/equipment capacity.
- Present privacy-safe employee/payroll and equipment installation/reservation evidence.

### 13C — Store, treasury, financial health, and tax

- Present offers, withdrawal-pending stock, receipts, sales/margin, canonical Checking/FX evidence, liabilities, periods, and tax.
- Add server-derived health flags; do not let Admin author accounting outcomes.

### 13D — Ownership, governance, activity, and audit

- Add privacy-safe multi-owner presentation.
- Add immutable Business activity and bounded audit evidence.

### 13E — Emergency intervention decision

Default result: **not implemented**. A mutation may be exposed only if an existing canonical authority is already explicit, bounded, capability-checked, idempotent, concurrency-safe, and immutable-audit complete. Broad edit/compliance override forms are not authorized by this scope.

### 13F — Exact-head certification and handoff

- Permanent source/authority contract.
- Backend and all affected Edge type/bundle validation.
- Admin API/controller/UI tests.
- Desktop/mobile Chromium, keyboard, focus, reduced-motion, loading/error/empty, privacy, and two-game isolation acceptance.
- Retained Business/Store/Inventory/Banking/FX/workforce/equipment/manufacturing/tax gates.
- One exact implementation SHA and durable handoff evidence.

## Stop conditions

Stop and reopen scope if implementation requires a new economic mutation authority, Player impersonation, raw internal identity exposure, direct writes to canonical domain tables from Admin, a scheduler/secret/live-environment change, or weakened auth/MFA/CSRF/rate-limit/isolation/public-key/idempotency/settlement invariants.

## Current Phase 13A candidate

- Directory read remains game-scoped and now returns only a bounded public Business projection plus server-derived operational-readiness evidence.
- Selected-Business detail is a separate `GET /games/:gameId/businesses/:businessKey` read, revalidating the `biz_<32 hex>` public key and game scope server-side.
- The Admin v2 controller and drawer load detail asynchronously with loading, bounded error/retry, cancellation, and stale-result suppression behavior.
- Browser requests and Admin responses remain `no-store`; no bearer token, internal UUID, raw owner identity, retired simulated aggregate, or database detail is exposed.
- No schema, migration, RPC, economic write, scheduler, secret, deployment, or live-data change is part of 13A.
- Candidate `d66c9cd6e464ff0b3adcf0869f442d3d67a2166b` has the identical Git tree to locally tested candidate `4005cf0b0ea7f7107dbc47fd88e3d63f7528ae92`, which passed focused local source, Admin v2, Deno format/check/test, permission-normalization, JSON, and diff gates. Exact-head workflow evidence remains pending; this is not Phase 13 certification.

## Full-phase candidate — 2026-09-17

The owner authorized completion of 13A–F. Repaired 13A source `435f04775f9a5fd229ada71afc9054f3cc90a10f` passed all 30 triggered workflows. Subsequent implementation adds 22 bounded canonical evidence sections, a service-only game-owner/active-staff/permission-checked read RPC, shared read-only Business helpers with unchanged Player calculation bodies and preserved Player ownership resolution, exact decimal text, and privacy-safe responsive read-only selection. Directory readiness is unknown unless actually established; partial lists and historical attention evidence are labelled explicitly.

13E decision: **no intervention implemented**. No new write authority, table, scheduler, secret, or runtime dependency. The only migrations are forward-only read function definitions and grants; no live application is authorized. Full exact-head database/browser/retained gates remain pending.

## Release boundary

Phase 13 remains draft, unmerged, and undeployed. `BETA-LIVE-MIGRATION-PARITY-001` remains a separate release/runtime blocker and does not authorize any live reconciliation from this branch.
