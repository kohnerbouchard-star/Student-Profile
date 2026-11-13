# Player terminal lifecycle extraction

## Scope and ownership

- Roadmap item: `ARCH-LARGE-PLAYER-APP-LIFECYCLE-001`, a bounded ARCH-501/ARCH-502 follow-on; this does not reopen the completed Inventory-specific REF-041 scope.
- Baseline: freshly fetched `main` at `19ee89dcd7d02b60f43b0b0ca4477a5c2529f6c7`, containing merged #958. Earlier pending #958 intake is historical source preparation; its postmerge qualification is not certified here.
- Reviewed implementation: `b7d4db94a22c1fbdc16381254e5469dda87b6708`, tree `606c99237433168255121038547e52e0abd90606`. Subsequent record-only changes do not alter runtime or tests.
- Owner: local branch `refactor/player-app-lifecycle-20261113`. No publication or merge in this preparation tranche. Production remains held.
- Seven active PRs were inspected: #938, #933, #735, #731, #668, #624 and #620. No selected runtime path overlaps them. CSS/main/realtime ownership stays with #624, roster with #933/#938 and global-ledger reconciliation with #668. Shared inventory and one additive intake are reconciled locally without rewriting earlier records.
- Preserve the only public app export, `createPlayerTerminal`, and its returned terminal methods, function identities and receiver-independent use.
- Extract the entire request/session lifetime owner: route generations, bootstrap version, published session, admission and settlement checks, pending control ownership, deferred timers/frames, invalid-session handling, session connection, resource refresh and mutation-followed-by-refresh. UI callbacks are injected without invoking them during construction.
- Keep rendering, initial UI state, focus selectors, DOM event listeners, forms, event payloads and host-owned logout in `app.js`. Keep API/read models/feature controllers/realtime/CSS/main integration unchanged.
- No changed route, API, RPC, schema/migration, network request, economic policy, persistence, permission, dependency, deployment or external data. All existing authority and release holds remain intact.

## Implementation

- `player-terminal/src/app.js`: 1,171 to 847 physical lines.
- `player-terminal/src/core/player-terminal-lifecycle.js`: 355 lines. One cohesive owner keeps race-sensitive generations and retirement state together, rather than distributing them across a shared mutable context.
- The extracted functions retain their original bodies. `showToast` reads the same destroyed flag through a getter; terminal destruction delegates only the original ordered retirement/flag/version steps, before listener/clock/subscription cleanup as before.
- The existing v7.5 source audit reads both app and its extracted dependency, retaining every original marker assertion.
- Register added public-entrypoint characterizations in Player `verify`. Existing exact app-path PR filters in Backend Typecheck and Business Store/FX additionally select the new dependency. Other matching broad filters already cover it. No existing selector, workflow job, command, permission or assertion is removed.
- Deterministic inventory is 1,372 sources (one additional module), with 85 oversized files, 52 persistence candidates and 70 cross-domain deep imports unchanged. No debt ceiling increases. The app remains oversized; this tranche reduces coupling without claiming to retire all app decomposition debt.

## Verification and remaining gates

- 25 new public-entrypoint characterizations pass on both an untouched archive of baseline main and the candidate using pinned Node 22.23.1. They use real PlayerApi, freshness coordinator, store and rendering against synthetic DOM/transport. Coverage includes missing/invalid/valid session handoff, current and stale 401s, provider races, newer route/resource/session wins, destroy fencing, settlement, public mutation event payloads, control restoration and suppressed late mutation success/errors.
- Full Player `verify` (including all 25 new cases) and repository `npm test` pass using Node 22.23.1/npm 10.9.8. Backend core TypeScript passes. All three clean pinned dependency installs succeed with an explicit workspace-local npm cache.
- Independent read-only review finds no actionable runtime regression, reruns Player verify and final 25 cases, confirms imports/callback construction and preserves destroy order and null-freshness semantics. `structural-comparison.json` records all three byte-identical extracted blocks (44 + 181 + 93 lines) and final source hashes.
- Architecture ratchets/deterministic inventory, secret scan, whitespace, and workflow YAML parsing pass. The two changed workflow job and permission structures are unchanged; only dependency selectors are added.
- Full backend `typecheck:all` stops on the unchanged frozen Supabase SDK URL `https://esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs` with connection refusal. Full backend smoke passes 1,027 Deno cases in 23 groups plus 18 Node cases, then stops at the same SDK import during Game Sessions. These aggregates remain incomplete.
- Retained Chromium route-refresh browser checks cannot launch because the required Playwright 1.59.1 Chromium headless shell revision 1217 is absent. One official pinned install attempt returns a truncated/non-ZIP archive. No browser assertions, hosted checks or live-runtime verification are claimed passed.

Local source/test review and nonbrowser gates are complete. Freeze and independently restore the private recovery, then re-fetch actual main and coordinate publication. Actual-number authority and fresh exact-head hosted browser/backend qualification remain required before merge. Prior tasks' hosted successes do not qualify this new source. Production stays held.

## Serial-lane continuation

The parent independently cleared #958 postmerge and released this lane on 2026-11-13. The owner authorizes continued PR publication, exact-head checks and qualified serial merge; production remains explicitly held. Earlier local-only wording describes preparation. Publish as draft only after recovery is verified, then register the actual returned PR number while preserving all predecessor required/critical identities and production denials. No inherited hosted result certifies this new source.
