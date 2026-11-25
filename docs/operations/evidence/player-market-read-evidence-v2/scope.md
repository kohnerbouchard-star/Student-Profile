# Player Market and News PR1054 qualification

`PLAYER-MARKET-READ-EVIDENCE-002` remains `IMPLEMENTED_NOT_MERGED`, partial
T047, owned by existing draft #1054. Base `73ee21a9846442e85e3e5f2f650229423f2c5404`;
original public head `89f18f6a40ce95406cd9913e3528472d434a0a3c`. Clean historical
local `112e8dc0fb` was normally reconciled as `689b59d5b3587540594a0ff9fb448939e20cad00`.
Application/backend bytes equal the original public head. No production action.

## Scope and authority

The actual PR1054 authority locks literal paths, including its unchanged verifier.
All PR1052 ordered required/critical identities remain prefixes; observed active
workflow/job identities are appended. Only exact PR1054 paths are added to retained
workflow PR filters. The canonical Roster event block already selects this path
and stays unchanged. No assertions, jobs, permissions or release guards are removed.
Regression tests reject wrong identity/base, backend/migration/release expansion
and production/secret permission drift. Both Roster integrated-composite pins
must bind the complete frozen source carrier, including qualification inputs.

## Disposable failure diagnosis

The old-head [Stock database job](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/45571574223/job/139059242356)
passed; its source job failed on missing PR authority. The [connected Marketplace job](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/45571574179/job/139059243445)
also passed. This does not supersede separately reported disposable failures.

The [REF024 race job](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/45571574216/job/139059242943)
failed its unchanged one-winner assertion at `2026-11-25T08:00:00.480Z`,
`0 !== 1`. Both rejection reasons were omitted. The diagnostic-only harness
amendment records both outcomes, completion time and FX next-due/current time
before assertions. Every one-winner, stale-version, replay, money/inventory,
rollback and two-lock-waiter assertion remains intact; no retry or error waiver.

The [Business Financial Market database job](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/45571574412/job/139059243405)
failed at `2026-11-25T08:00:11.059Z` with `FX_RATE_VERSION_STALE` in
`create_purchase_funding_quote_core_v1`, reached from private
`create_stock_buy_quote_at_v1` and `business-financial-market-database.mjs:55`.
This is direct old-head evidence of the Stock path crossing the boundary.
Its fixture correction remains separate; no production SQL change is made here.

Base/head blobs are identical for canonical FX, purchase funding quote, Stock
private quote clock, Marketplace funding quote SQL and the original race harness.
Stock's private explicit clock controls exchange-open validation but calls public
purchase funding without a clock argument. Marketplace reaches that composer
after listing locks. It uses `clock_timestamp()` and rejects `next_due_at <= now`
with `FX_RATE_VERSION_STALE`, including same-currency funding.

Six isolated embedded PostgreSQL probes execute exact extracted boundary functions
and the unchanged freshness predicate. Initialization 07:59:30 yields same-day
08:00 due: 07:59:59.999 is fresh; 08:00:00 and 08:00:00.001 are stale. Initialization
08:00 yields next-day due and all three predicate probes are fresh. This proves
the mechanism, not full application replay or the historical race's precise cause.

Follow-up: compare exact base/head in distinct disposable stacks, capture both
rejection reasons, force initialization/inner funding across 08:00, retain rollback
and security assertions. Keep the unrelated Business Financial Market fixture fix
with its separate owner. Do not relax FX freshness, change production SQL, widen
localhost guards or hide races with retries.

## Evidence and limits

Full Player verify and root `npm test` passed. Authority regressions 17/17 and core
Backend TypeScript pass. Frozen Deno check passes for the Marketplace harness.
Full Edge typecheck is blocked by locked Supabase SDK fetch (`esm.sh`, connection
refused); following combined smoke did not execute. Native browser entry point
was attempted but the pinned executable is absent and its CDN returns HTTP403.
No new native-browser, full database replay, connected disposable or staging
acceptance is claimed. Earlier 357-browser and connected/Roster handoff evidence
applies only to that previously qualified source. Fresh exact-head CI and review
remain mandatory before merge; no T047 completion, live write or deploy claim.

Unique local outputs: `/tmp/pr1054-20261125-diag/`, including `boundary.mjs`,
`boundary.json`, `root-tests.log`, `backend-full.log`, `ref024-typecheck.log`,
`browser.log` and Roster logs. Raw original failure evidence remains at the job URL.
