# Econovaria Domain Ownership v2

**Roadmap item:** `ARCH-000`
**Audited main:** `72cefb73a0038aa2bc24261d63e70c113cb7c24c`
**Inventory:** `docs/architecture/inventories/econovaria-architecture-inventory-v2.json`

This is a measured ownership inventory, not a claim that the listed boundaries are already enforced. It preserves current behavior and identifies the authority decisions that later roadmap items must ratchet and converge.

## Ownership table

| Domain | Canonical ownership | Current public seam | Principal boundary debt / next owner |
|---|---|---|---|
| analyst | ratings, targets, analyst accuracy and reward requests | contracts and API/application modules | reward writes must converge through Economy (`ARCH-208`) |
| arrival | player arrival contracts and services | no explicit package boundary | formalize only if live consumers require it (`ARCH-402`) |
| attendance | clock-in, lateness, streaks and attendance records | contracts plus application/API handlers | persistence remains in application/API; Player and Economy coupling (`ARCH-401`) |
| audit | sensitive-operation audit records | contracts/application | keep append authority centralized (`ARCH-401`) |
| auth | Staff and Player authentication/session authorization | contracts/application/API | Player scope helpers are imported deeply across domains (`ARCH-100`, `ARCH-402`) |
| business-banking | business entities, products, employees, production and business banking views | contracts/API/repository | overlaps Economy/asset ownership (`ARCH-205`, `ARCH-207`) |
| campaign | campaign/world-runtime orchestration | contracts/services | clarify relationship with World and Storylines (`ARCH-209`) |
| contracts | contract definition, acceptance, submission, review and lifecycle | contracts/application/API | reward and Story calls cross boundaries (`ARCH-208`, `ARCH-300`) |
| countries | country reference and player-safe world reads | contracts/services/API | reads many domain tables; classify global/template/game data (`ARCH-101`) |
| crafting | recipe and crafting-job rules | contracts/domain/API/repository | Inventory consume/grant seam (`ARCH-203`) |
| economy | ledger, balances, rewards, fines, payroll and transfers | contracts/application/domain/API | direct API persistence and cross-domain callers remain (`ARCH-205`, `ARCH-300`) |
| game-dashboard | consolidated player-safe read model | contracts/API/repository | intentionally cross-domain read-heavy; needs explicit read-model boundary (`ARCH-400`–`ARCH-402`) |
| game-sessions | teacher-owned game lifecycle/settings/join-code state | contracts/application/domain/API | API persistence bypasses repository (`ARCH-100`, `ARCH-401`) |
| games | residual game tests/compatibility namespace | none | reconcile with game-sessions; retire or bound (`ARCH-700`) |
| inventory | item ownership, holdings, events, use/redemption and reservations | contracts/application/domain/services/API | only Store currently exposes an `index.ts`; Inventory consumers deep-import (`ARCH-200`, `ARCH-201`, `ARCH-402`) |
| licensing | purchase codes, entitlements and activation limits | contracts/application/domain/API | scheduled worker ownership and lifecycle state (`ARCH-302`, `ARCH-600`) |
| marketplace | listing, reservation and trade lifecycle | contracts/API/repository | Inventory/Economy settlement authority (`ARCH-204`, `ARCH-300`) |
| markets | pure market calculations, validation and simulations | contracts/calculations | distinguish generic calculations from Stocks runtime authority (`ARCH-206`) |
| messaging | player/admin message operations | API | missing application/repository/public seam (`ARCH-401`, `ARCH-402`) |
| notifications | notification jobs and delivery state | contracts/application/domain/API | Storylines writes notification tables directly (`ARCH-402`, `ARCH-602`) |
| players | player records, enrollment, credentials and request scope | contracts/application/domain/API | acts as de facto shared auth/routing package through deep imports (`ARCH-100`, `ARCH-402`) |
| progression | progression mechanics and milestone/reward rules | contracts/services/API | rewards and simulation coupling (`ARCH-208`) |
| stocks | instruments, calendar, ticks, orders, trades and portfolios | contracts/application/domain/services/API | oversized engine/runner and Economy settlement boundary (`ARCH-206`, `ARCH-300`, `ARCH-600`) |
| store | catalog, purchasability, stock and purchase orchestration | `backend/src/domains/store/index.ts` | sole explicit domain package boundary; Inventory/Economy transaction (`ARCH-202`, `ARCH-300`) |
| storylines | story definitions, decisions, relationships, impacts and execution | contracts/services/API/repositories | direct Contract/Notification writes and World overlap (`ARCH-209`, `ARCH-300`) |
| world | game-scoped world runtime, policies and presentation reads | contracts/services/API/repositories | high cross-domain read/write amplification (`ARCH-209`, `ARCH-401`) |

## Data ownership classification gaps

The schema contains recognizable ownership naming, but this tranche does not infer lifecycle policy from names alone. `ARCH-101` must classify every persistent entity as `GLOBAL_REFERENCE`, `TEMPLATE`, `GAME_SCOPED`, `PLAYER_SCOPED`, or `SYSTEM_RUNTIME`. The highest-risk ambiguous seams are:

- global definitions versus copied live state for countries, contracts, story events, stock assets, recipes and Store items;
- `game_settings`/policy projections consumed by Attendance, World and simulation code;
- consolidated dashboard reads spanning balances, holdings, orders, inventory, purchases and market events;
- compatibility projections and optional Story overrides;
- license/payment runtime data, purge state and scheduler leases.

No browser-provided UUID is declared authoritative by this inventory. `game_sessions.id` and player ownership must continue to be derived and checked server-side.

## Authority gaps measured on the baseline

- 26 domain directories exist, but only Store exposes an explicit `index.ts` public package seam.
- 168 static cross-domain relative imports exist. Many are repeated imports of Player request-scope/session helpers; others reach Story, Economy, Inventory, Contracts or Notification internals.
- 100 files contain Supabase/database call candidates outside domain `infrastructure/`, platform Supabase adapters, or legacy `backend/src/supabase/`. Of these, 25 are domain API files and one is an application file. Matches must be characterized before movement; test doubles and transport-only calls are candidates, not automatic violations.
- State-machine concepts exist for redemption, contracts, marketplace, stock orders, licensing, game sessions and Story, but no single mechanically verified lifecycle inventory exists yet. `ARCH-201` and `ARCH-302` own convergence.
- 123 capability-like strings are statically present. Exact semantic equivalence is not inferred; `ARCH-303` owns normalization.

## Ownership rule

Every cross-domain mutation must be orchestrated by an application use case and invoke the owning domain's public command/use case. Reads may use an explicitly owned read model. A domain must not import another domain's infrastructure or mutate its tables as a shortcut.
