# REF-042 — Inventory mutation freshness blocker

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
