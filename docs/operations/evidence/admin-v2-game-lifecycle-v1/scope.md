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
