# Unused Admin Classroom declarations

- Roadmap ID: `ARCH-700-CLASSROOM-UNUSED-HELPERS-001`.
- Status: `IMPLEMENTED_NOT_MERGED`; local branch `refactor/classroom-unused-helpers`. PR/merge/hosted checks: none. No publication or deployment.
- Audited main: `4226ca9391df4cafa2c3c3004abd5c5ba552c48d`; tree `33c7cef8f667b0805c090d01e77c2b8e5ae51dc3`.
- Implementation commit: `aa1127af8f1cc8f6c29c254e70c176f99af4beef`.
- Original `gameRoutes.ts` blob: `99a444185ca9407adf68da6eba528f4253b0b590`; candidate: `89a255762af220998f63b848f75713221680b6cf`.

## Exact scope and reachability

Remove only the unused `proxyClassroom` import and private `classroomContractPath` function from `backend/supabase/functions/admin-api/gameRoutes.ts`: seven physical lines. Each identifier occurs only at that import/definition on the audited main. The helper is not exported, and this module has no dynamic evaluation. All other source bytes, including both exported dispatch functions, are unchanged. No current test or source assertion requires the deleted helper; historical REF-005 signature strings remain untouched.

Shared `common.ts::proxyClassroom`, its tests, REF-009 parity/acceptance consumers and all active compatibility files/URLs remain. No test, registration, dependency/lock, SQL/RPC, route, payload, auth/scope/rate-limit policy, UI, workflow or deployment configuration changes. Generated inventory changes only the existing `gameRoutes.ts` line count/order, 639 to 632; every inventory count and architecture ceiling stays unchanged. No file is deleted.

The session fetched current main and reviewed local/remote branch metadata and all 18 open PR metadata records before creating this isolated worktree. None owns this cleanup. Loans #918, Settings, Player projections, #888 and dependency/release owners remain separate. The original checkout remains on `refactor/business-store-sales-convergence-v2` and clean. No donor implementation is acquired. Reconcile the additive Scope Intake entry and generated inventory with concurrent Player work; do not overwrite its entry or source-count delta.

## Baseline, candidate and rollback

All three stages run the same unchanged retained suites, with identical ordered test names and no focused skip:

- `npm --prefix backend run test:admin-api`: 332/332.
- `node --test scripts/admin-local-handler-architecture-contract.test.mjs scripts/persisted-game-code-contract.test.mjs scripts/player-local-currency-authority-contract.test.mjs scripts/architecture/refactor-seam-ratchet.test.mjs`: 46/46.
- `deno test --config backend/supabase/functions/admin-api/deno.json --lock backend/supabase/functions/deno.lock --frozen scripts/ref-009-contract-reward-parity.test.ts`: 10/10.
- `node scripts/admin-game-lifecycle-contract.mjs`: pass.

The exact original source bytes were temporarily restored for the rollback stage and matched the original Git blob. After replay, the candidate bytes were restored and matched the candidate blob above. This is a source rollback rehearsal, not a hosted runtime rollback.

Each stage bundles the real Admin Edge entrypoint with:

`deno bundle --config backend/supabase/functions/admin-api/deno.json --lock backend/supabase/functions/deno.lock --frozen backend/supabase/functions/admin-api/index.ts -o <stage>-admin.bundle.js`

All three complete bundles are byte-identical: SHA-256 `eb50a0b11663debc124c38f85cf4fc455a687ebb593858789477dde770e13ff9`. The earlier baseline attempt with additional `--no-remote` failed to resolve an existing Supabase module; normal frozen resolution succeeded. No dependency changed.

REF-005 passes at all stages. Observed seam identities decrease 30 to 29 on the candidate and return to 30 on rollback; the 37 registered identities, 23 protected removal targets and historical baseline remain unchanged. The scanner explicitly permits decreases and grants no broader deletion approval.

## Required local qualification

Node 22.23.1, npm 10.9.8 and existing CI-pinned Deno 2.9.3; system CA trust. Both root/backend `npm ci` succeed with lockfiles unchanged. Final candidate passes:

- Complete root `npm test`; one retained macOS skip requires GNU tar for deterministic release archives.
- Backend `typecheck:all`, including all 28 Edge roots, and complete backend `smoke` (1,429 reported Deno test executions plus retained Node/config parity checks).
- `audit:architecture`, `audit:high-priority-boundaries`, `audit:legacy-runtime`, REF-005 seam and REF-003 candidate audits.
- Full tracked-file secret scan, deterministic inventory regeneration and staged/unstaged diff checks.

Local logs and three source/bundle captures are retained at `/tmp/econovaria-classroom-unused-helpers-v1/`; successful baseline bundle log is `baseline-bundle-network.log`. Ordered test identities and result counts match across the three stages. This source-only child needs no new UI/database/runtime acceptance; none is claimed. Hosted CI/staging/production were not run.

## Review, rollback and next action

Independent read-only source and metadata review found no actionable findings. The reviewer independently checked all three ordered 332/46/10 test sets, exact bundle equality, the 1,429-test backend summary and all 28 Edge roots; eight retained source/authority tests, lifecycle and candidate seam checks were independently rerun successfully. If a source rollback is needed, revert the bounded implementation commit and regenerate the existing inventory; preserve the retained tests, this evidence and truthful status. Do not re-enable or redeploy a hosted runtime.

Next exact item: return the reviewed local `ARCH-700-CLASSROOM-UNUSED-HELPERS-001` candidate for a separate publication decision. REF-015 remains `BLOCKED`, REF-048 remains `PLANNED`, neither parent is complete, and all existing security/release holds remain. Existing Settings and remaining-caller work continues only under its own scope; unknown external consumers and traffic observation remain retirement gates.
