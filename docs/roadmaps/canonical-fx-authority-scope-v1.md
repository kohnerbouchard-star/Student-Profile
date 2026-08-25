# Canonical FX Authority Scope v1

**Roadmap items:** `BUSINESS-V2-10A4B1` / `BETA-FX-V1-001`
**Status:** `IMPLEMENTED_NOT_MERGED` — exact implementation `41bc2d978fe67cd06a8f2133f7310075492ecd99` passed the bounded local and exact-head gates on draft PR #671
**Branch:** `feat/canonical-fx-authority-v1`
**Parent branch:** `feat/business-player-store-cutover-v2`
**Parent draft PR:** #670
**Exact parent documentation handoff:** `cb4041b68ecd322c87d2fb6bb08000da28807af3`
**Frozen Phase 10A.4A implementation candidate:** `88944e18520913ca9779c2706bd005f644c60050`
**Scope commit:** `f499e828d57a6a146f528d89e714502807ab36b1`
**Scope handoff:** `23da0aa3ef87b4343b0fd75f46ba7153feae062d`
**Exact implementation:** `41bc2d978fe67cd06a8f2133f7310075492ecd99`
**Stacked draft PR:** #671
**Production deployment authorized:** No

## Decision

Phase 10A.4A exposed a missing shared economic authority. This checkpoint creates one game-scoped foreign-exchange fixing authority before Banking conversion products or purchase-domain funding are allowed to converge.

The governing invariants are:

- ECO is the single global settlement numeraire; VAL remains an ordinary national currency.
- FX owns currency fixing, rate derivation, rate history, versioning, and approved shock inputs.
- Economy and World own macroeconomic source data.
- Banking owns accounts, holds, balances, and ledger settlement; those changes belong to checkpoint 10A.4B2.
- Purchase domains own purchased assets and may not calculate exchange rates.
- Browser requests never author rates, macro inputs, fixing time, game scope, or internal identifiers.
- No prior rate, Story effect, ledger row, balance, stock trade, or certified SHA is rewritten.

## Included authority

### Canonical currency registry

- Extend `public.currencies` with `currency_kind = national | global_settlement`.
- Preserve all ten national currency codes and their country mappings.
- Permit `country_code` to be null only for a global settlement currency and insert ECO into the same registry.
- Keep one canonical decimal-places rule per currency; settlement code uses exact PostgreSQL `numeric` arithmetic.

### ECO-valued fixing model

- Store one immutable `units_per_eco` value for each active game currency.
- ECO is exactly `1`; cross-rate `A -> B` is `units_per_eco(B) / units_per_eco(A)`.
- Persist one immutable bootstrap fixing and at most one immutable daily fixing per game-local date.
- Persist the prior fixing, policy version, exact effective boundary, actual calculation time, source snapshot identities/sequences, Story-shock identities, canonical input digest, component basis points, final movement, and human-readable explanation.
- Expose current and cursor-based historical reads; no archive tier is added for eleven rows per game/day.

### Time and scheduling

- Add `game_timezone_for_game_v1(game_session_id)` over the existing required IANA value at `game_settings.stock_market_window.timezone`; do not add a second storage source.
- Make the Stock-specific timezone resolver delegate to the generic accessor without changing Stock market-session policy.
- Daily fixing boundary is exactly 08:00 in the game timezone on every calendar day, including weekends.
- A minute-level trusted runner claims due games with bounded leases and `FOR UPDATE SKIP LOCKED`.
- Duplicate workers may produce only same-digest replay. A different digest for the same game/local date fails closed.
- Paused games retain their current fixing. On resume after 08:00, calculate only the current local date from inputs effective at that boundary; never replay every paused date.

### Deterministic policy v1

For each national currency, inputs are compared with the ten-country median. Every signal uses exact fixed-point decimal arithmetic, is clamped to `[-1, 1]`, and produces an integer basis-point contribution where positive means depreciation (more local units per ECO).

| Component | Weight/cap | Signal |
| --- | ---: | --- |
| GDP | ±50 bp | 25% real-GDP-level deviation normalized by 25 index points plus 75% GDP-growth deviation normalized by 0.10. |
| Inflation | ±45 bp | Inflation deviation normalized by 0.10; higher relative inflation depreciates. |
| Real interest | ±30 bp | `(interest - inflation)` deviation normalized by 0.10; higher relative real interest appreciates. |
| Trade | ±40 bp | 50% trade-balance deviation normalized by 50 points, 25% export-strength deviation normalized by 0.5, and 25% inverse import-dependency deviation normalized by 0.5. |
| Confidence/stability | ±35 bp | Equal blend of consumer confidence, business confidence, currency stability, political stability, and inverse market risk using 50-point or 0.5 normalizers. |

- Normal aggregate movement is capped at ±200 bp/day.
- `exchange_rate_index` and bilateral trade exposure have explicit zero weight in v1 because no non-circular bilateral authority exists.
- Approved Story shock basis points are added separately. When at least one approved shock is consumed, final daily movement is capped at ±1500 bp.
- Positive Story basis points preserve the legacy meaning: depreciation.
- No random input or client-provided economic value is permitted.
- Identical country snapshots correctly produce zero fundamental differential.

### Persistence and privileged interfaces

Forward migrations add authority equivalent to:

- `fx_policy_versions`;
- `fx_fixings`;
- `fx_fixing_currency_values`;
- `fx_runtime_state`;
- `fx_story_shock_authorizations`;
- fixing-to-shock evidence links.

Trusted interfaces are equivalent to:

- `game_timezone_for_game_v1`;
- `claim_due_fx_games_v1`;
- `apply_fx_fixing_v1`;
- `resolve_fx_rate_v1`;
- current-fixing and history cursor reads;
- queue-only Story shock authorization.

Every public-schema table receives RLS and explicit `PUBLIC`, `anon`, and `authenticated` revocations. Mutation functions are service-only, use fixed search paths, validate game-scoped composite identities, and expose no internal UUID to a browser contract.

### Bootstrap and legacy cutover

- Existing games bootstrap from their latest complete legacy matrix only when every pair reconciles with the VAL-derived vector within `1e-8`.
- ECO and VAL start at `1`; each local `units_per_eco` starts from the contemporaneous `VAL -> currency` rate. This preserves every coherent local cross-rate without defining a permanent ECO/VAL peg.
- Incomplete or incoherent games remain explicitly cutover-blocked; their historical rows are not repaired or discarded.
- New-game provisioning initializes ten macro snapshots, eleven currency values, one bootstrap fixing, runtime state, and the next due boundary before readiness verification succeeds.
- Retire the legacy after-game-insert matrix trigger from normal runtime.
- Preserve `currency_exchange_rates` unchanged as legacy evidence and stop writers after per-game cutover.
- Retain `convert_currency_amount` only as a deprecated server compatibility adapter: legacy before cutover, canonical fixing after cutover. New economic writes must consume a versioned quote in later checkpoints.

### Story convergence

- Preserve the authored `currency_volatility` effect type and its existing payload contract.
- Change the trusted effect path from immediate 90-pair publication to an immutable, game-scoped, idempotent shock authorization consumed once by the next fixing.
- Before a game's FX cutover, the compatibility RPC may retain legacy behavior; after cutover it queues only.
- ECO may be absent or zero in a shock payload. VAL is no longer privileged.
- Previously applied `story-fx:*` rows establish bootstrap level only and are never transformed into new shocks.

## Excluded authority

This checkpoint does not add:

- Banking account identities, holds, clearing balances, reserve facilities, customer FX quotes/orders, or monetary settlement;
- Player Banking or Business treasury UI;
- multi-account funding plans or any Store, Marketplace, Stocks, Business, IPO, Contract, tax, debt, or government-purchase integration;
- country-specific Economy/World target authoring;
- a second macro database, trade-network model, simulated game clock, pair-by-pair rate writer, parallel wallet, or archive service;
- merge, deployment, secret mutation, staging/production SQL, or production promotion.

## Required proof

- Pure engine determinism, input-order independence, component math, rounding, normal/crisis caps, and no randomness.
- ECO identity, inverse and triangle consistency, and one canonical precision rule.
- Exact 07:59:59/08:00 boundary, DST changes, weekends, delayed invocation, pause/resume, new-game bootstrap timing, and no missed-day replay.
- Complete-as-of-boundary macro snapshot selection; missing data fails without advancing current state.
- Lease collision, lease expiry/recovery, same-digest replay, different-digest conflict, and one fixing per game/local date.
- Story authorization queues once, consumes once, preserves sign, and obeys aggregate crisis cap.
- Existing coherent VAL matrices backfill exactly; incomplete/incoherent matrices remain blocked; prior Story movement is not reapplied.
- Provisioning rollback and verification require all ten macro rows, eleven currency values, bootstrap fixing, and runtime pointer.
- RLS, role revocations, fixed search paths, append-only guards, server-owned inputs, no browser rate authoring, and two-game read/write isolation.
- Complete forward migration replay from zero twice, rebuilt database lint/advisors, Backend typecheck, every Edge root, Economy, World, Stocks, Store compatibility, security, repository quality, and `git diff --check`.

## Completion boundary

This checkpoint may become `IMPLEMENTED_NOT_MERGED` only after one exact implementation SHA passes the required local and exact-head checks and a later documentation-only handoff records implementation files, migrations, RPCs, tests, workflow results, blockers, and the next exact item.

It may not become `VERIFIED_COMPLETE` while unmerged or without required runtime evidence. After its clean handoff, the next exact item is `BUSINESS-V2-10A4B2` on `feat/banking-fx-clearing-v1`.

## Exact implementation handoff

The immutable implementation source is `41bc2d978fe67cd06a8f2133f7310075492ecd99` on draft PR #671, based on exact parent documentation handoff `cb4041b68ecd322c87d2fb6bb08000da28807af3`. This later record is documentation-only and does not replace that tested identity.

Implementation authority is concentrated in:

- forward migration `backend/supabase/migrations/20260825223806_canonical_fx_authority_v1.sql`;
- `backend/src/domains/fx/**` for fixed-point policy calculation, contracts, repository, runner, HTTP adapter, and focused tests;
- `backend/supabase/functions/fx-orchestrator/index.ts`, its Edge manifest/config entries, and the all-Edge-root typecheck runner;
- the Story effect convergence in `backend/src/domains/storylines/services/storyEffectEngine.ts`;
- permanent acceptance contracts in `scripts/canonical-fx-authority-contract.mjs`, `scripts/canonical-fx-authority-database.mjs`, and `.github/workflows/canonical-fx-authority-v1.yml`.

The migration adds ECO to the existing registry; immutable policy, fixing, currency-value, snapshot-input, component, shock-authorization, fixing-shock, and provisioning evidence; mutable leased runtime state; append-only guards; guarded timezone authority; Story queueing; canonical reads; legacy cutover; and the deprecated compatibility reader. Its public RPC boundary includes `game_timezone_for_game_v1`, delegated `stock_market_timezone_for_game`, `initialize_fx_authority_for_game_v1`, `claim_due_fx_games_v1`, `load_fx_fixing_input_v1`, `apply_fx_fixing_v1`, `fail_fx_fixing_claim_v1`, `resolve_fx_rate_v1`, `get_current_fx_fixing_v1`, `list_fx_fixing_history_v1`, `get_fx_runtime_status_v1`, queue-only `apply_story_currency_volatility_v1`, inert `configure_fx_runtime_scheduler_v1`, guarded legacy initialization, and `convert_currency_amount` compatibility. Privileged mutation remains service-only; browser roles receive bounded reads without internal UUIDs.

Local evidence passed the 39-test FX suite; 16 focused Story tests; full Backend smoke suite; Player World, World runtime, Player Banking, ledger, Stock calendar/assets, Store, migration, authorization, secret, architecture, quality, interaction, and asset ratchets; all Backend TypeScript and all 26 discovered Edge roots; Edge manifest parity; exact workflow contract; two complete zero-to-head PostgreSQL 17 rebuilds; rollback-only database acceptance after each rebuild; and `git diff --check`. Rebuilt-schema lint retained 61 repository findings, including 19 errors, but introduced zero B1/FX findings; this pre-existing debt is not represented as clean global lint.

Exact-head workflow run `32912008039` succeeded at the exact implementation SHA:

- exact-head static authority job `98007902296`;
- FX and adjacent-domain compatibility job `98007902407`;
- disposable migration replay and lint job `98007902485`, including two independent forward replays, live canonical-FX database acceptance, rebuilt-schema lint, and clean teardown.

The game timezone source remains the existing `game_settings.stock_market_window.timezone`; after FX bootstrap it is immutable so a game cannot publish two fixings for one local date. Scheduler configuration is deliberately inert and was not invoked. No merge, deployment, secret change, scheduled job installation, staging/production SQL, or live-environment mutation occurred.

Unresolved dependencies are intentionally outside B1: Banking account identities, balanced posting, holds, clearing/reserve capacity, customer quotes/orders, Player Banking FX, and all shared purchase funding. The next exact item is `BUSINESS-V2-10A4B2` on `feat/banking-fx-clearing-v1`, based on this documentation-only handoff.
