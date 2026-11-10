# Crafting recipe guidance

- Roadmap: `PLAYER-CRAFTING-GUIDANCE-001`.
- Owner: `feat/player-crafting-guidance-v1`.
- Audited main: `a29f4439368aca18e14a06819e5a7ad6040ac74d`.
- Implementation: `d9685b612d74f7e0b1289cac01941d9fd16a8f1f`.
- Draft PR: [#932](https://github.com/kohnerbouchard-star/Student-Profile/pull/932). Published implementation `c784ac1ae5094b3f352a84a9eeeea30f7530fbae` has tree `f5e061efc1d06230f0d5a0b7dc0fe9327e013801`, identical to the locally tested implementation/evidence tree.
- Status: `IMPLEMENTED_NOT_MERGED`; exact-head hosted qualification remains required.
- Production deployment and live data mutation: not authorized and not performed.

## Request, ownership and reconciliation

The owner requested beginning the feature roadmap in separate PRs. This bounded Crafting slice explains missing ingredients and published requirements, offers navigation to acquisition, and explains what happens after production. It does not complete the other economy features or the full Crafting roadmap.

Current-main and active-PR/branch inspection found no active owner of this guidance. Main already includes Crafting #922, Loans #925, Business #926, Banking #923 and the Marketplace fixture #931; their historical unmerged ledger wording is not current source status. No live completion credit follows from those merges. Teacher #924/#927/#929, Player CSS #624, context #668, dependencies #620 and release/certification #735/#731 remain separate. No active owner's implementation or paths are replaced.

## Implementation and authority

- `player-terminal/src/pages/crafting-guidance.js`: small read-only guidance renderer, count validation and quantity label.
- `player-terminal/src/pages/crafting-page.js`: compose guidance into the selected recipe and fail closed on malformed ingredient quantities instead of treating unavailable counts as zero.
- `player-terminal/tests/crafting-mutation-controls.mjs`: registered Node regression coverage.
- `player-terminal/tests/browser/player-crafting-runtime.spec.mjs`: retained browser acceptance plus real-terminal navigation/route-capability tests.
- Generated architecture inventory, additive roadmap intake, this evidence and the actual-number PR authority registration.

`20260806120120_cutover_crafting_read_v2.sql` establishes that ingredient `owned` is available holdings after reservations. Shortages are explicitly for one craft, not the selected batch quantity. Larger quantities remain server-validated. Current read fields provide availability/unlock status, required workshop/tools/entitlements and output kinds. Guidance does not invent an unlock path, assert fulfillment of tool/entitlement metadata, assume seller stock, or promise a recipe effect from its name. Equipment guidance derives only from `outputKind: equipment`; Inventory remains the location to inspect available item actions.

Acquisition and Inventory buttons use the existing `data-route` contract and unchanged application capability checks, navigation/history and focus. No item-specific search or guaranteed acquisition is claimed. Existing craft/cancel/claim/equip/salvage/effect mutation endpoints, payloads, identity, permissions and idempotency are unchanged. No backend, database, migration, RPC, route, stylesheet, dependencies, workflow, economic policy or Business lending gate changes.

The helper is 53 lines. Source count grows from 1,325 to 1,326; oversized files remain 100 and persistence outside infrastructure remains 53. No debt ceiling is raised.

## Verification and limits

- Baseline red: the new Node regression fails against untouched main at missing available-stock/shortage guidance. Candidate passes all retained and new cases, including zero stock, multiple blockers, numeric strings, malformed/null/unsafe counts, escaping, missing metadata and recipe restoration.
- Full Player `verify`: PASS.
- Full root `npm test`: PASS after staging the regenerated inventory; initial unstaged inventory drift was not a product failure.
- Backend TypeScript: PASS. Full `typecheck:all` Edge phase and backend `smoke`: BLOCKED by the unchanged frozen `esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs` connection refusal. No dependency or gate was altered.
- Browser: authored but NOT EXECUTED. Pinned Chrome download returned truncated ZIPs. Installed Chromium could not create its local Unix socket (`Operation not permitted`), including the approved elevated attempt, before any test ran. This is not visual or runtime qualification. Hosted pinned Chromium must exercise both projects, keyboard navigation, Back/Forward, recipe switching, capability denial, no-write behavior and overflow before merge consideration.
- Toolchain: Node 22.23.1, npm 10.9.8, Deno 2.9.3; installed Chromium diagnostic is not a pinned-browser substitute.
- Independent source review: one overbroad sentence about server requirement checks was narrowed to the verified start decision; re-review and focused regression are clear. Workshop/tools/entitlements are published metadata, not a newly enforced backend policy.
- No connected staging, live database, deployment, merge or broad runtime certification.

Next: qualify the final exact head and obtain browser evidence. Later economy roadmap work requires its own bounded owner/PR; do not infer new lending/default policy or expand this PR.

Actual-number authority `pr-932.json` retains all 125 required/92 critical predecessor checks, eight edited paths and two unchanged verifier/test paths. Production deployment, mutation and secret permissions remain false. Secret/whitespace checks and all 16 authority regressions pass.
