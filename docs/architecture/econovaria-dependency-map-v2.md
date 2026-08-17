# Econovaria Dependency Map v2

**Roadmap item:** `ARCH-000`
**Audited main:** `72cefb73a0038aa2bc24261d63e70c113cb7c24c`
**Generated evidence:** `docs/architecture/inventories/econovaria-architecture-inventory-v2.json`

## Runtime topology

```text
Admin v606 / Admin V2              Player Terminal / login
          |                                  |
          +------- same-origin BFF/API ------+
                             |
       24 Supabase Edge entrypoints (Admin, Player, Staff,
       auth, licensing, stock runtime and retention workers)
                             |
                    58 named handler files
                             |
             domain application/services/domain
                             |
       domain infrastructure + platform/legacy repositories
                             |
                   Supabase/Postgres/RPCs
```

The target direction is `UI -> API/BFF -> domain API adapter -> application -> domain -> infrastructure`. The current tree partially implements it, but HTTP adapters, services and one application module still contain persistence calls, and domain modules deep-import one another.

## Entrypoint and use-case map

| Entrypoint group | Current adapters/use cases | Ownership observation |
|---|---|---|
| `admin-api`, `classroom-api` | Admin auth guard, local game mutations, domain Staff handlers/read models | broad composition roots; retained compatibility/proxy paths require `ARCH-700` ownership |
| `player-api`, `player-web-session-api` | Player request scope/session, domain Player handlers, bootstrap/read models | Player auth/scope is reused through deep API imports; canonical context is `ARCH-100` |
| `web-session-api`, Staff/auth functions | Staff login/bootstrap/MFA/password flows | Auth authority is identifiable, but entrypoints remain large |
| stock read/trading/seed functions | Stocks handlers/repositories and internal-runner auth | Stocks is the runtime owner; Economy settlement and scheduler separation remain |
| `stock-market-orchestrator`, `stock-market-runner`, `stock-tick-archiver` | due-work discovery, tick/simulation execution and retention | inspect business-rule ownership under `ARCH-600`/`ARCH-601` |
| licensing workers/webhooks | entitlement/payment issuance and email work | worker must trigger application lifecycle rather than own rules (`ARCH-600`) |
| `game-data-purger` | retention/purge orchestration | compatibility and data classification gates precede deletion (`ARCH-101`, `ARCH-700`) |

The JSON inventory contains the exact 24 Edge entrypoint paths and 58 handler candidates.

## Measured dependency debt

| Candidate class | Baseline | Interpretation / owner |
|---|---:|---|
| cross-domain deep imports | 168 | migrate consumers to minimal public seams in `ARCH-402`; do not ratchet to zero until imports are classified |
| persistence outside approved infrastructure paths | 100 files | 25 API, 4 service, 1 application plus platform/Edge/test candidates; characterize in `ARCH-401` |
| browser transport/observer shim files | 27 | includes 9 `window.fetch` assignments and accepted UI observers/test shims; owner/removal evidence in `ARCH-500`, `ARCH-501`, `ARCH-700` |
| compatibility/legacy/fallback marker files | 209 | broad lexical candidate set, not 209 live paths; classify consumers and retirement conditions in `ARCH-700` |
| source files at least 500 lines | 100 | complexity candidates; largest production files include the 1,667-line stock engine, 1,110-line dashboard repository, 1,018-line web-session entrypoint and 1,012-line Player app |
| capability-like strings | 123 | semantic drift requires contract-level review in `ARCH-303` |

The agreed inventory threshold is 500 physical lines for a complexity review candidate. Size alone does not authorize decomposition.

## Direct cross-domain mutation hotspots

Static database calls show likely ownership bypasses that require characterization tests before change:

- Attendance application/API code reads Player credentials/settings and performs attendance/reward orchestration.
- Storylines infrastructure writes Contracts, Notifications and player impacts in addition to Story state.
- Game Dashboard infrastructure reads Economy, Stocks, Store and Inventory tables as a consolidated read model.
- World/Countries repositories read policy, country, economy, stock and player-assignment projections.
- business-banking reads Economy-owned balances and lending tables.
- several Economy, Player, Auth and Game Session HTTP handlers issue direct table/RPC calls.

These are not all necessarily forbidden: an explicitly owned read model or transaction RPC can be canonical. `ARCH-200`–`ARCH-300` must distinguish reads from mutation authority and preserve atomic writes.

## Duplicate/compatibility runtime paths

Known compatibility families include the v606 Admin fetch bridges/fallbacks, Admin-to-Classroom proxying, legacy browser transport wrappers, optional Story projections, old Player/Admin route surfaces and duplicated Edge composition roots. Existing legacy-runtime inventories and ratchets remain authoritative. This audit adds candidate discovery; it does not declare a path dead or authorize deletion.

Duplicate handler detection cannot be safely inferred from filenames alone. Route, method, auth, envelope and side-effect parity must be proved under `ARCH-400` and `ARCH-700` before consolidation.

## Frontend data plane

- Admin v606 retains global fetch wrappers and DOM observers; Admin V2 has a centralized `admin-api-client.js` but route controllers still own portions of loading/mutation refresh behavior.
- Player Terminal centralizes substantial read-model/realtime behavior, while route/application code still has route-specific invalidation and recovery patterns. Open PR #624 modifies Player CSS and realtime invalidation and is explicitly treated as in-flight, not absorbed into ARCH-000.
- No constant polling or cache replacement is introduced here. `ARCH-500`–`ARCH-502` own mutation fan-out and invalidation policy.

## Scheduler ownership

Six filename-classified scheduler/worker entrypoints are inventoried: game-data purge, license email, license issuance, stock orchestrator, stock runner and stock tick archiver. GitHub scheduled workflows also exist for timed-services and ECON003 macro release. Static naming is insufficient to separate triggering from business rules; `ARCH-600` must characterize each call graph.

## Collision and acceptance record

At audit time the open PRs are #619 (root dependencies), #620 (Actions dependencies), #624 (Player CSS/realtime convergence) and #626 (Business browser acceptance synchronization). None owns these ARCH-000 deliverables. No runtime, UI, schema, route or RPC behavior changes in this tranche.

## Phase 0 ratchet

`ARCH-001` composes the existing Admin architecture and legacy-runtime audits with `scripts/architecture/architecture-ratchet-v2.mjs`. Its baseline is merged main `e40cb5b05c913fb52f402e2f7171f8b7ee69ad63`. Measured debt may decrease but may not exceed the checked maxima. Zero-tolerance checks cover direct browser database access, direct balance mutation outside Economy, direct Inventory mutation outside Inventory, unscoped live-simulation persistence and retired browser markers. Non-zero baselines cover measured cross-domain imports, infrastructure imports, persistence location, compatibility candidates, browser transport monkey patches and size-budget candidates. A lexical match remains a review candidate; the ratchet does not authorize deletion or behavior changes.
