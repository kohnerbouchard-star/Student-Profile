# REF-042 — Inventory mutation freshness evidence

The original blocked characterization below is retained as history. Current disposition and qualification are recorded in the merged-source closeout at the end of this document.

## Identity, ownership, and disposition

- Audited main/source: `480683bb011289576db8e9ddf05ed75daf8d17f7`, fetched 2026-10-01.
- Task: REF-042, R2, ARCH-500/ARCH-502. REF-023 and REF-041 are VERIFIED_COMPLETE in the current queue.
- Status: BLOCKED. No production-source implementation or completion credit.
- Fresh open-PR review found #805 owning Stock-runner qualification; #736/#735/#731/#730/#690/#668/#624 and dependency #620 remain separate.
- The live #624 file list at head `83a9d2af37d2eab3202eee7293780dbd31443edb` contains `player-terminal/src/main.js`, `player-terminal/src/realtime/player-invalidation-controller.js`, and `player-terminal/tests/realtime-freshness.mjs`. It does not contain `src/app.js` or `features/inventory/inventory-action-flow.js`. This is a specific freshness coordination blocker, not a blanket Player UI exclusion.
- Editable scope: this record, the synthetic diagnostic, its two generated JSON traces, `tasks/REF-042.md`, and only the REF-042 queue object. No global ledger, inventory ratchet, runtime, package, workflow, API, CSS, SQL, security, or mutation-policy change.

## Current call and resource ownership

`main.js` installs `installInventoryActionFlow`; the flow constructs its own `PlayerApi`. `useItem` executes `itemEffectUse`; `requestRedemption` executes `inventoryUse` after quantity/note prompts. Both disable the button, await the authoritative receipt, show success, call `terminal.refresh()`, and restore the original control nodes/disabled state in `finally`. Destroy removes the click listener only.

`PlayerApi.execute` serializes identical in-flight operations, preserves retry idempotency and cooldown behavior, and invalidates its own API cache after normalized successful resolution. It returns `invalidatedResources`, but performs no GET. There is no evidence of two fetches caused by execute plus refresh alone. `resource-plan.js` already solely owns the lists: Inventory redemption uses dashboard/inventory; item-effect use uses dashboard/crafting/inventory.

The terminal owns a separate API. Its full `refresh` reloads shell session/dashboard/notifications, resets read models, then loads the active route without forcing its still-fresh Inventory cache. The realtime controller owns a third API and merges completed reads directly into the terminal store. Per-instance read generations do not establish cross-instance ordering or coalescing.

## Reproduction and observed results

Run from the repository root with pinned Node 22:

```sh
node docs/operations/evidence/refactor-execution-v1/REF-042/characterize.mjs
node docs/operations/evidence/refactor-execution-v1/REF-042/characterize.mjs --targeted
```

The first result is [baseline.json](baseline.json); the second is [candidate.json](candidate.json). The diagnostic imports the real terminal, Inventory flow, PlayerApi, and realtime controller. Only DOM/transport are synthetic. An Inventory `marker` records authoritative fixture version in the actual public terminal `getState()` result; it is not a rendered browser assertion or live economic value. The candidate replaces the injected terminal refresh method with the existing targeted method and production registry list. It does not edit any runtime file or pretend to implement session/destroy guards.

- Warm-cache use: one POST `itemEffectUse`, then GET session/dashboard/notifications; zero Inventory GETs. Authoritative marker becomes 1 but terminal Inventory remains 0.
- Warm-cache redemption: one POST `inventoryUse`, then the same three shell GETs; Inventory remains 0 versus authoritative 1.
- Replayed success: the fixture begins with an already committed version 1 and adds no second effect. Baseline still displays version 0 in terminal state. This characterizes frontend receipt handling, not database idempotency.
- Double-clicking the same disabled button while pending produces one POST. No success notification or follow-up read occurs before receipt resolution. Original button nodes and disabled state restore afterward.
- Rejection and explicit `abortPlayerApiSessionRequests(config)`: one POST, no subsequent GET, error toast, control restored.
- Destroy during pending mutation: baseline still publishes success and refreshes after the receipt. No runtime fix was bundled into the refactor.
- Calling the terminal's public `connectSession` while the flow mutation is pending permits the old flow success to initiate additional reads in the new session. This isolates the terminal/flow boundary; it is not an end-to-end claim about every host logout path.
- Targeted candidate alone: use issues GET dashboard/crafting/inventory (three reads); redemption issues GET dashboard/inventory (two reads). Both reach version 1, removing unrelated shell reads without increasing isolated fan-out.
- Required concurrent/out-of-order case: hold a realtime Inventory response captured at version 0, complete the mutation and targeted authoritative reads to version 1, then release the old realtime response. Terminal Inventory regresses from 1 to 0. The exact candidate trace is GET inventory, POST itemEffectUse, GET dashboard/crafting/inventory. The two Inventory reads belong to different instances; the old result is not fenced before the controller store merge.

The final case proves the minimal flow-only substitution cannot satisfy unchanged REF-042 acceptance. Merely suppressing the authoritative post-write read would also be incorrect: the earlier realtime request captured pre-mutation data. Appropriate shared invalidation/generation ordering must be agreed with the current realtime owner before implementation.

## Validation and limits

Pinned tools: Node 22.23.1, npm 10.9.8. Source remained the audited SHA throughout validation.

- `npm --prefix player-terminal run verify`: exit 0, all registered checks, including inventory-read, inventory-redemption-connected, mutation-control-regressions, read-ordering, realtime, route-refresh, and recovery. Existing green tests do not cover away the reproduced cross-instance race.
- Both diagnostic commands: exit 0; generated traces retained. The diagnostic deliberately reports known defects, is not registered as an acceptance test, and does not weaken/add a CI success criterion.
- `npm run audit:architecture`, `npm run audit:high-priority-boundaries`, and `npm run audit:legacy-runtime`: exit 0; deterministic inventory unchanged.
- Explicit changed-file secret scan, Node diagnostic syntax, 50 unique task IDs/all task paths/acyclic dependency graph, REF-042 evidence links, generated JSON parsing, isolated queue-object comparison, and `git diff --check`: exit 0. An initial generic evidence-path check treated historical URL/relative evidence references as root paths; the corrected scoped checker validates the changed REF-042 paths without modifying unrelated records.
- Diff budget: six paths; 280 non-generated changed lines, plus 555 generated diagnostic JSON lines. No acceptance test or runtime file changed.
- Full root tests/backend typecheck/smoke, browser focus/draft preservation, route remount, actual host logout between receipt and refresh, and connected/live staging are NOT_RUN for this blocked documentation/evidence disposition. These remain requirements before any runtime implementation may claim acceptance.

Before/after debt denominator is the two Inventory flow success paths: two full refresh calls remain; zero returned resource lists are consumed there. Three independent API instances remain across flow/terminal/realtime. No debt reduction or mutation-state correctness claim is made.

## Next exact action and rollback

Keep REF-042 BLOCKED and preserve every acceptance criterion. Coordinate the existing #624 owner on cross-instance refresh ordering/coalescing and shared session-generation checks, then scope and qualify the smallest agreed change. Changes to the protected controller/main/realtime suite require that coordination; no global cache redesign is authorized here. Unrelated eligible REF-043 work may proceed.

Publication or merge of this evidence does not complete REF-042. Rollback removes only the scoped evidence/queue disposition; all current runtime behavior and economic authorities remain intact.

## Merged-source closeout — 2026-10-04

Scope: REF-042 only, R2, ARCH-500/502; REF-023/041 remain VERIFIED_COMPLETE. D1-A and the narrow same-user #624 handoff were approved before implementation: only the reference-based freshness/RECENT_REFRESH_GUARD_MS workaround was superseded. No donor branch, main.js/CSS, disclosure/modal/focus ownership, economic transaction, security or release authority was imported or replaced. Registration and per-child evidence remain historical snapshots, not current incomplete-source claims.

The complete registered sequence is merged: coordinator/API PR825 (`5d32be72e7e88644f3248104320725ed6aadc672`); app publisher preparation PR827 (`44799a8e63f5d539628645f305894a665943e741`); Inventory participant PR829 (`fd0d8a616f4db78c4dfd463542e3514663f9a9fc`); realtime participant PR832 (`4e1618ebde621d35a31c790a2e2f0e8878531105`); default composition/combined acceptance PR837 (`486b5e2d0f2fc042be444840fff2d4f11c4ac72c`). PR837 reviewed head is `48531a7af1fa6668cafd63bde3350f2cfa292677`. Parent independently approved its six paths/325 nonblank changed lines and performed the squash merge. Both commits have identical complete Git tree `c19b7ce83e06ff31b0bffdb03ae3072f5dbef255`; qualification does not substitute an unrelated SHA.

| Original/registered acceptance | Implemented owner and retained acceptance evidence |
| --- | --- |
| One terminal-local session/resource generation authority; standalone compatibility and independent terminals | `resource-freshness-coordinator.js`, optional `player-api.js` injection, default composition in `app.js`; `read-invalidation-ordering.mjs` and browser session-isolation cases. No library, shared singleton or global registry authority. |
| Tickets at cache admission and final aggregate publication, including values/status/errors/capabilities/401 | API/bootstrap/loadResources/loadRoute and all four app publishers; API ordering, realtime tests and desktop/mobile publisher-lifecycle cases hold results beyond API completion. |
| Applied/replayed writes invalidate before targeted GET; rejected/aborted writes do not manufacture changes | API execution plus Inventory flow consume operation.invalidatedResources; WRITE_INVALIDATIONS remains sole list owner. Existing connected lifecycle and combined actions cover receipt ordering, replay, rejection, abort and failed refresh. |
| No duplicate mutation/increased isolated fan-out; authoritative state after warm cache | Real API/action/terminal fixtures assert exactly one POST+three GETs for item use and one POST+two GETs for redemption, disabled double click and restoration; rejected action issues no follow-up GET. For the two default-composed Inventory success paths, full refreshes become zero and both consume returned invalidations; standalone legacy fallback remains supported. |
| Equivalent current reads coalesce; pre-write reads cannot satisfy post-write state or clear newer pending work | API ordering plus held old realtime read after authoritative mutation, stale401, mixed batches in both completion orders, sibling-generation invalidation and failed-refresh recovery. Settlement occurs only after current owning-store publication. |
| Session/logout/destroy/remount isolate effects and controls | API, Inventory and realtime Node suites plus default browser session A/B, stale401, abort, real logout controller with synthetic local-only runtime, destroyed participant, automatic polling replacement and two-terminal cases. Stale timers/toasts/finally cannot release newer ownership; retained listener counts return to zero. |
| UI continuity and complete publishers | Existing route-family/mobile/modal checks plus combined disclosure, form draft, focus and selection preservation; interaction/modal deferral preserves pending reads. Bootstrap/loadData, loadRouteData, refreshResources, executeEndpoint, realtime and action paths are covered. |
| Activation-safe startup/route recovery | Reproduced route aggregate supersession and initial/new-session bootstrap starvation; bounded retry checks lifecycle/load/request/route ownership, exposes error after exhaustion, and never promotes partial new-session data. Independent real-terminal diagnostics cover retry exhaustion/destroy; browser holds complete session recovery and first bootstrap invalidation. |

Exact-head PR837 qualification: all 36 workflows succeeded on attempt1; 82 checks comprised 77 successes and five conditional skips, zero failures/pending. Retained skips: Verify and authorize unchanged artifacts; Inspect staging and production parity read-only; Materialize Phase4A architecture inventory; Fail-closed staging evidence check; Supabase Preview. Vercel commit status succeeded, which is not authenticated gameplay evidence. Player run37171523677/job111345255141 pinned Chromium:141 passed/11 existing skips, including every b3 desktop/mobile case. StoreFX37171523774: all four mandatory source/database/connected/player-browser jobs passed; browser111345265924:12/2. StoreCutover37171523569/job111345256073:focused12/2 and full141/11. Multiplayer37171523485/job111345482799:questionnaire/travel/residency persisted with replay/unauthenticated checks;30–40Player load had zero server errors. Actual job logs were inspected; no exact-head retry was needed.

Backend37171523591/job111345253233 actual downloaded ZIPs: typecheck11291448099 SHA256 `43b96a2140ffe1acaa3cf4b3c03d33f5e85ca62d555710b6c4888c1b6ce82e8c`; smoke11291911341 SHA256 `2a42b38da08a24c8ceeaa30fbc9c79a82ea493175057b0d0d41732613540233f`. Both hashes match GitHub digests and both status files contain0. Complete smoke chain reaches admin-local-mutations;27 Deno summaries total1357passed/0failed. These are exact PR-head artifacts. The identical-tree squash has no Backend Typecheck run because the preserved push.paths filter excludes this app/test-only change; no merged-main backend execution/artifact is claimed, and no trigger was widened or dispatch invented to obscure that distinction.

Local pinned Node22.23.1/npm10.9.8 Player verify includes every originally required inventory-read, inventory-redemption-connected, mutation-control-regressions, read-ordering, realtime, route-refresh and recovery suite; it and root npm test, secret scan and exact-PR authority passed. Supplemental system Chromium registered browser suite11passed/3existing skips. Local pinned Chromium download403 remains historical NOT_RUN; hosted pinned-browser results supply qualification. On exact merged source, architecture audit passed and U1 hold contract4/4 passed: all nine literal-false hosted guards and removed automatic production workflow_run remain intact. No capture, dispatch, deployment, restoration, security changes or main workflow retries were performed.

Merged-main qualification on exact486b5e2d: Player37172669054/job111348675692 passed pinned Chromium141/11; StoreCutover37172669024/job111348675706 passed focused12/2 and full141/11, with all six jobs successful. All applicable workflows reached terminal success on attempt1; conditional Vercel production-verification follow-ups are skipped. Final check snapshot:48checks=34success/14conditional skips,0failure/0pending. Skips include repeated Vercel production verification/contract follow-ups, held live-parity capture/enforcement/release jobs and dependency-review. No main retry was invoked. Scope source acceptance is satisfied; this three-file VERIFIED_COMPLETE ledger proposal still requires parent review/merge. Official completion credit changes only when that closeout merges.

Historical evidence is preserved: the original warm-cache and late-realtime failures, b2b early-settlement/sibling-loss/automatic-remount findings, b3 route/startup regressions and corrected synthetic-fixture capability/timer setup. PR832 had an initially failing Multiplayer residency wait and a parent-authorized unchanged retry; its merged-main Store run reported cancellation despite successful steps before a parent-authorized unchanged retry. Those older events are not hidden by PR837's first-attempt success. See each child evidence and PR body for exact preceding identities/results.

Boundary: this is source-refactor qualification with synthetic Node/browser and disposable connected/database fixtures. The local-only logout browser fixture does not prove hosted session revocation; existing logout/connected security suites retain that contract. No connected staging or production gameplay certification was performed, and the earlier login-shell screenshot is only historical visual smoke. U1 holds and all established staging/release/runtime authorization gates remain mandatory. No global ARCH/beta/release status or other REF status/dependency changes are authorized. Rollback reverts default activation first, then dependent participants in reverse order as needed, preserving subsequent fixes and server transactions. A docs merge grants no runtime promotion.
