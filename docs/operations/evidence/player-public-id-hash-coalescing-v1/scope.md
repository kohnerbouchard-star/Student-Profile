# Concurrent Player public-ID hashing

- Roadmap: `PLAYER-READ-PUBLIC-ID-HASH-001`.
- Owner: `fix/player-dashboard-read-capacity`.
- Audited main: `c616ece3e1cebea79fd33c58f5f04ed961121407`.
- Status: `IN_PROGRESS`, unpublished candidate pending independent review and hosted qualification.
- This is separate from Crafting guidance PR #932. No merge, deployment or hosted application-data mutation is authorized or performed.

## Observed blocker

PR #932 head `355f72aef8ae1b554ed20478fe9028ddc92f9581` passed 34 of 35 pull-request workflows, all CodeQL analyses and 291 Player Chromium tests, including 12 Crafting cases, with 11 existing test skips. Its [connected retry job](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42774960600/job/129697765124) passed all rendered and mutation journeys, including Crafting. The retained artifact `13745046580` has SHA-256 `8409b1b31b7406af38320bdbb034cb0a303391efe5707a991b85e47a3138ab20`.

The same artifact records 30 successful logins and 210 successful reads in the 30-player baseline. The 40-player burst fails seven dashboard reads: four HTTP 500 and three HTTP 546 responses. Gateway logs locate all seven at 07:54:40 UTC. Edge diagnostics record resource-limit/worker-retirement and interrupted response bodies. Three existing retry budgets expire after more than four seconds. Root cause is not established by these logs alone, and no gate or retry limit is changed.

The prior attempt stopped during Messaging after a dashboard 500 and a prematurely closed PostgREST RPC connection; subsequent RPC/dashboard reads succeeded. One failed-job-only retry was used, not repeated until green. PR #932 changes no backend, load script or workflow. Its UI renderer is not imported by the HTTP-only load runner.

Current-main and open-PR inspection found no active owner of this hash-work optimization. PRs #934, #933, #929, #927, #924, #620, #668, #624, #735 and #731 remain separate. Merged #935's older unmerged ledger wording is historical source status, not new runtime certification.

## Bounded candidate

Concurrent privacy projections independently hash identical UUIDs into the same existing deterministic public aliases. Share only unfinished identical hash computations, capped at 2,048 pending entries. Remove entries on success or failure. At capacity, compute normally rather than dropping or delaying work. Do not cache completed aliases, response bodies, session or authorization decisions, balances, inventory or other economic state.

The hash algorithm, input prefix, truncation, UUID normalization, traversal/depth limits, 32-hash batches, response metadata and fail-closed behavior remain unchanged. Distinct values remain distinct work. No route, RPC, schema, economic mutation, auth policy, response contract, worker limit, retry budget, dependency or deployment changes. The privacy workflow's path filter includes the new helper; its tests and enforcement remain intact.

Files: `backend/src/security/playerPublicIdHash.ts`, its call site in `playerBrowserResponsePrivacy.ts`, retained/new tests in `playerBrowserResponsePrivacy.test.ts`, `scripts/benchmark-player-public-id-hash.mjs`, privacy workflow path registration, generated inventory, this evidence and the roadmap. The new helper is 24 lines. Oversized-source files remain 99; source count rises from 1,329 to 1,330, and persistence outside infrastructure remains 53.

## Verification

- Baseline red: the concurrent regression runs 20,520 hashes on unchanged main versus 513 expected. Candidate passes all nine privacy/hash tests, including identical output, fixed alias compatibility, input non-mutation, distinct keys, capacity fallback, and cleanup after both success and failure.
- Retained response privacy, payload privacy and rate-limit dispatch: 24 tests pass with the frozen Deno configuration.
- The exact privacy-workflow test command passes 19 cases. Full root and Player verification pass. Staged whitespace and architecture checks pass without raising any ceiling.
- Backend TypeScript passes. Full Edge typecheck is blocked by the unchanged frozen external Supabase import connection refusal. Backend smoke passes 936 Deno cases across 23 completed groups before the same frozen import blocks Game Sessions; the aggregate is not certified. No dependency/gate changed.
- Synthetic benchmark: 40 concurrent 364,234-byte responses, 553 unique identifiers. Unchanged code performs 22,120 hashes per round; candidate performs 553. Node 22.23.1 measured about 1.04–1.16 seconds CPU before versus 0.46–0.56 after. Deno 2.9.3 measured about 0.68–1.06 seconds before versus 0.31–0.49 after. Timings are diagnostic only, not acceptance thresholds or proof of hosted root cause.
- Reproduce with `node --experimental-strip-types scripts/benchmark-player-public-id-hash.mjs`, optionally supplying the absolute unchanged privacy-module path from another checkout for comparison. The benchmark uses only generated data and checks equal sanitized outputs/no raw UUIDs.
- Independent review and exact-head hosted connected load qualification remain pending. Keep #932 draft and blocked until its shared inventory/roadmap conflicts are reconciled and a final combined head passes all required gates. Do not treat this optimization as a proven capacity fix before the retained 30/40-player gate passes.

Next: independent review and full local checks, then authorized draft publication and exact-head qualification without reducing concurrency, increasing resource/retry limits or waiving failures.
