# Native teacher game lifecycle controls

## Scope and ownership

- Roadmap: `BETA-ADMIN-LIFECYCLE-V2-001`, `IMPLEMENTED_NOT_MERGED`.
- Draft [PR #927](https://github.com/kohnerbouchard-star/Student-Profile/pull/927), reviewed implementation `d1cd44688ad8a4285988ae64026d6970b217ccf2`.
- Owner: `feat/teacher-game-lifecycle-v1`, from fetched main `08134650d1e0c8cfebb811a5d97331196ebe08e3`.
- The owner requested the incomplete teacher management flows in separate branches and PRs. Settings draft-retention PR #924 is independent, with no runtime overlap. PR #668 retains backend context/global-ledger ownership; existing entries and other branches are unchanged.
- This slice exposes existing read/start/pause/resume/end/archive/revoke-sessions capability in native Overview. Game creation, ownership transfer, data deletion, Settings retirement and new backend lifecycle policy are excluded.
- Shared intake and generated inventory additions require additive reconciliation before merge. No production deployment or hosted-data action is performed.

## Implementation and safety

The existing Admin API client gains exact lifecycle read and transition calls through its authenticated, game-scoped HttpOnly BFF transport. An allowlisted model drops internal fields. A separate controller binds one selected game, server-derived actions/version, and the exact reviewed idempotency key. Overview uses existing Admin components and styling.

- Read requires `game.read`; prepare and confirm require `game.read` and `game.update`. Server authorization remains authoritative. The UI consumes `allowedActions`, without duplicating the transition graph.
- Body contains only `idempotencyKey` and `expectedVersion`. Canonical `Idempotency-Key`, CSRF, selected-game and device headers use retained transport; no bearer token is accepted or exposed.
- Every transition requires review. End, archive and session revocation also require existing explicit phrases and disclose revoked access or irreversibility.
- One transition can be in flight. Cancel/Escape/unsubmitted departure writes nothing; navigation removes the dialog. Pending operations stay serialized across route returns. Destroyed controllers suppress late publication.
- Lost acknowledgments permit renewed review of the same action/version/key or authoritative refresh. Conflict clears stale controls and requires refresh plus new review. Failed/malformed reads never retain actionable stale controls.
- Failures use the existing safe vocabulary. Raw diagnostics, private fields and internal UUIDs are not rendered; absent counts are not shown as zero.

No backend, schema, migration, RPC, auth guard, SQL, economic policy, dependency/lockfile, legacy runtime, application shell or CSS changes. Existing `read_admin_game_lifecycle_v1` and `transition_game_lifecycle_atomic_v1`, ownership, row locks, revocation semantics, rate limiting and audit behavior are unchanged. Existing lifecycle workflow/tests remain; exact V2 paths and a separately named native acceptance job are added.

## Local qualification

Node22.23.1, npm10.9.8, locked Playwright1.65.0 / Chromium158 on macOS. Dependencies match unchanged locks. Local Deno2.8.3 is distinct from hosted pinned-Deno qualification.

Passed:

- 12 native lifecycle model/API/controller regressions, registered in the retained Admin unit entry point.
- 103 retained Admin unit tests.
- 11 Chromium desktop/mobile cases: all six transitions, no-write Cancel/Escape, typed phrases, exact CSRF/game/version/key contract, denied permission, malformed state, same-key replay, conflict refresh, repeat-click exclusion, pending/unsubmitted navigation and Back/Forward, keyboard containment and mobile overflow.
- Unchanged-main browser control fails because native lifecycle controls are absent; the same acceptance passes on this branch.
- 16 retained backend lifecycle tests, including owner-scoped/idempotent row-lock and terminal-revocation migration contracts.
- Full root `npm test`, with its inherited macOS GNU-tar deterministic-release skip explicitly not certified.
- Backend smoke, TypeScript and all28 Supabase Edge roots.
- Generated inventory:1317 to1320 sources; all debt counts and ceiling files unchanged. Existing API client grows29 lines; no new oversized source.
- Independent read-only review found no actionable finding and independently reran all12 lifecycle tests; it did not separately certify browser/staging behavior.

Raw synthetic evidence is in `/tmp/teacher-lifecycle-*` logs and final browser artifacts. The first browser run passed six cases then hit a test-only wait expecting an empty read-only-actions container to be visible; the correction checks attachment and independently verifies no controls. The first root invocation stopped at the unstaged generated inventory; staging its exact generated output allowed the full suite to pass. No safety assertion or gate was weakened.

## Remaining gates

Actual-number `pr-927.json` registration locks15 changed paths plus2 read-only verifier/test paths; it retains all118/87 predecessor checks and adds lifecycle checks for120 required/88 critical. Draft publication is confirmed. Exact final-head hosted CI is not yet qualified. Fixture coverage does not certify live persistence. Keep draft; no merge, release, production action or broad completion claim.

Next: publish/register this bounded draft, independently review metadata, qualify its final head, and reconcile shared intake/inventory additions before any separately authorized merge. Teacher/Settings retirement and backend context propagation remain with existing owners.


## Current-main integration, 9 November 2026

Merge exact main `0d314bbe53832afcdc94b9dab8d3e09515f2762f` into existing PR #927 head `9795d7cb9711226be95031566d80f0b46824bf56` with both parents retained. Only the additive Scope Intake section conflicted; both complete prior records are preserved, with a source-integration note. Every shared #928 implementation, workflow, authority and evidence file is byte-identical to main, and this feature's implementation/inventory/tests are byte-identical to its previous head. No feature or security behavior changes.

The feature authority keeps its exact path locks, false production/mutation/secret flags and all 120 required/88 critical prior entries. It inherits the new Shell/Scroll gates for 124 required/90 critical checks. Read-only validators and production holds are unchanged.

Cloud qualification uses Node22.23.1 and the locked dependencies. The full root suite, 12 focused feature tests, 107 retained Admin tests, backend TypeScript, 16 authority regressions, exact-scope validation, secret and whitespace checks pass on this integrated source. Every inherited shared-repair file and feature runtime/inventory/test file is byte-verified against its respective parent. Full backend smoke and Edge qualification are not claimed from this cloud: the unchanged external esm.sh dependency was unavailable during the shared-fix continuation. Full browser verification will run on the exact hosted merged head: this cloud cannot launch the pinned browser or reach the loopback fixture through its supported browser. Prior PR or #928 results do not qualify this new feature head. Keep draft pending independent integration review and fresh exact-head CI; no merge or production deployment is performed in this integration tranche.

## Provisional Settings and current-source reconciliation, 11 November 2026

Local preparation retains original PR927 owner head `66109e1b337057871326316b2c4a2995668e020d` and integrates published Settings head `645a898771285b6c0420a7a94084e18bf18caafe`, which includes main `3b6c713e460bea08565bf67b6314ec85c5183b64`, scanner #936/#929, World #939 and Market #941. Settings has not yet merged: this is a provisional source candidate, not actual-current-main qualification or completion. Existing owner remains `feat/teacher-game-lifecycle-v1`; `BETA-ADMIN-LIFECYCLE-V2-001` remains `IMPLEMENTED_NOT_MERGED`.

Only the additive roadmap and generated inventory conflicted. Every nonempty line of both parent roadmap versions is retained. The six lifecycle runtime sources, two native lifecycle suites and existing lifecycle workflow remain byte-identical to original PR927. Shared fixture and unit registration reconcile additively. Settings source, scanner repairs, World/Market source, all inherited authority records and source-review bindings remain intact. Inventory is regenerated: 1,343 source files, 97 oversized sources, with other debt counts and ceilings unchanged.

The bounded scheduling amendment adds only one exact `docs/operations/contracts/player-cross-cutting/pr-927.json` pull-request path in each of fourteen otherwise excluded retained families: banking-fx-clearing-v1, business-financial-market, business-primary-ipo, configurable-stock-market-timezone-v1, crafting-item-runtime, database-replay, economic-core-request-claims, exchange-calendar-runtime-v1, loans-lifecycle-read-v1, player-button-click-safety, player-multiplayer-load-e2e, player-response-privacy, story-replay-safety and world-runtime. Identity-aware auditing uses workflow names and the scanner-qualified family map; duplicate generic job names do not schedule unrelated families. Crafting already matches the retained unit registration, Settings the shared fixture, and Market the API/fixture/unit paths. No wildcard, new job, dispatch, permission, guard, non-PR trigger or production change is added.

The authority retains both ordered predecessor check sets and inherits Settings/Market and every current-source gate: 135 required and 97 critical identities, 29 changed paths and 31 exact locks, including two unchanged read-only validators. These are workflow/job identities, not a branch-protection inventory. Production deployment, mutation and secret flags remain false.

Initial local checks pass 28 native lifecycle/authority cases, 189 registered Admin cases and explicit backend TypeScript. Original and inherited source bytes and both complete roadmap records are independently checked against Git objects. Full root, scanner, server lifecycle, secret and scope results accompany the final candidate. Frozen Edge dependency and unavailable pinned Chromium remain local qualification limitations, not waived checks. Independent committed-tree review, actual Settings merge reconciliation and fresh exact-head hosted qualification of every retained gate are mandatory before merge. Prior-head browser results do not qualify this tree. No external publication, merge, live action, legacy retirement or broader completion is performed.

Final provisional local results: full root `npm test`, explicit backend TypeScript, 28 lifecycle/authority tests, 189 registered Admin tests, nine scanner contracts and 16 server lifecycle tests pass. Exact scope accepts 29 changed paths under 31 locks. The fresh native browser attempt fails before test execution because pinned Chromium is absent; aggregate `typecheck:all` passes TypeScript then fails on the unchanged frozen esm.sh Supabase SDK connection refusal. Neither blocked aggregate is represented as passing. Production remains held.

## Actual Settings merge and final source reconciliation, 11 November 2026

This checkpoint supersedes only the pending-Settings status in the provisional record above; all historical records remain intact. Settings #924 merged normally at `879e27e21eaa9365aa1c7b4e5b27f59f8141ec2d`. Freshly fetched main is that exact commit, with tree `260795bd360928e872eb95d2b854f5127f46cf2e`, identical to the provisional Settings predecessor `645a8987`. Merge actual main into reviewed provisional lifecycle `b3cd9d6cac36c0fa9d610525e43edcf9e0cd2119`, preserving both histories. The merge itself produces no file changes. Only this evidence, the additive roadmap checkpoint and authority authorization note change; every implementation, test, workflow, inventory, path lock and 135/97 check identity remains byte-identical to the reviewed provisional candidate.

Settings exact-head qualification completed: all 60 workflows succeeded; 133 required/96 critical identities were fulfilled; 117 jobs comprised 103 successes and 14 intended guarded skips; 120 checks comprised 105 successes and 15 skips, including Supabase Preview. All four embedded Player contracts and REF046 passed; Vercel succeeded, with no reviews or unresolved threads before the standard expected-head merge. Public evidence: [Settings](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42927743851), [Shell](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42927743659), [Admin Browser](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42927744660), [Player](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42927743811), and [multiplayer](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42927743845).

`BETA-ADMIN-SETTINGS-DRAFT-001` is `VERIFIED_COMPLETE` only for its bounded synthetic draft-preservation scope. This is not production, deployed-runtime, legacy Settings/REF-015 or broader teacher-controls completion. `BETA-ADMIN-LIFECYCLE-V2-001` remains `IMPLEMENTED_NOT_MERGED`. Settings checks do not qualify this lifecycle head. Refresh local root, explicit TypeScript, focused/inherited source tests, authority, inventory, source integrity, secrets and whitespace before handoff; unavailable pinned Chromium and frozen Edge SDK remain explicit local limits. Next: independent final-tree review and exact-head hosted PR927 qualification, followed by its parent-controlled serial merge slot before Banking. No publication, merge or production action is performed here.
