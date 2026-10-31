# Combined Campaign/provisioning source qualification — 2026-10-31

Status: IN_PROGRESS; local source candidate only. No release or parent completion.

## Registration before reconciliation

The product owner instructed GPT-6.1 Max to execute the independently planned
source integration and disposable qualification. This supersedes only the
earlier exclusion of combining the existing Campaign and claims source. It does
not lift shared-file caps, U1 holds or any production/staging action gate.
No other owner's acknowledgement is inferred from coordination comments.

- Main: `a4dd2651d0ba964cce0cf28bf35f76975f35fd13`.
- Existing Campaign tip PR884: `a9a532be4deb884aa864c9489b7d174e8f33f167`,
  including the existing PR879–883 ancestors; do not separately accept red tips.
- Existing claims PR885: `a03c1720dfd1df8db95e0b00e738428a12f8fb47`.
- Local detached worktree starts at PR885. Merge the exact Campaign tip locally;
  existing owner target remains `fix/game-provisioning-service-claims-v1`.
- PR885 retains `main`: inspection showed its claims workflow is main-only;
  retargeting to Campaign would skip required qualification. The initial local
  retarget proposal is superseded before publication. Its exact-path authority
  includes only the inherited Campaign-tip delta plus the existing claims scope.
  Remote PR base/head remain unchanged until a safe, qualified owner update.

New reconciliation edits are restricted to the two existing shared files,
PR885's authority and this already-allowed convergence record:

1. `scripts/operations/live-migration-reconciliation/build-phase15-rehearsal-plan.mjs`:
   retain the original eight literal identities, Campaign ninth and claims tenth;
   preserve raw/source hashes and every loader/ledger/digest/order guard. Keep
   PR885's existing 15-changed-line cap relative to the Campaign tip.
2. `scripts/operations/live-migration-reconciliation/phase15-forward-bundle.test.mjs`:
   retain both exact migration regressions, update literal count/index/order and
   assert the combined suffix length. Keep the existing 30-changed-line cap
   relative to the Campaign tip. No absent-file or conditional exemption.
3. `docs/operations/contracts/player-cross-cutting/pr-885.json`: retain main,
   register the exact inherited Campaign-tip paths and required checks/note;
   verifier/test stay read-only. This grants no new edit to inherited bytes.
4. This record: exact provenance, evidence, unresolved gates and next action.

Inherited Campaign application, harnesses, historical failure evidence, approved
migration and workflow deltas are imported byte-for-byte from the named tip.
Claims migration, harness, tests and workflow remain byte-for-byte from PR885.
Immutable Phase15 manifests/migrations, package/action pins, all nine U1 holds,
REF parent IDs/statuses, loan CHECK gates and other owners' paths are protected.
Do not add a replacement PR, modify the live runner or absorb Player CSS work.

## Qualification boundary

Require both original migration hashes, original-eight vector digest, negative
registry tests, focused Campaign/claims tests, required repository/backend/
Player/Admin checks, two clean database replays and real provisioning/Campaign
acceptance on this combined source. Disposable resources need ownership and
independent teardown receipts. Fixture/unit evidence cannot replace real SQL,
PostgREST, concurrent-worker or deployed-state acceptance.

No push before checking workflow and Git-connected deployment side effects.
No remote merge/approval, deployment, hosted SQL, hold restoration, credential
or permission change, feature activation, account operation or file upload.
An unavailable prerequisite is BLOCKED/NOT_RUN, not a waived or passing check.

## Local source checkpoint

Registration commit: `33812b6ccd5a70087a52acf523ae2c260fb8a33f`.
Tested integration commit: `b9138de730ea93567e6d7b306c51eefa773d78f5`.
Tested tree: `dca77d411f5a5d5e52da9839583de72b31f5147d`.
The checkpoint record is metadata added after those tests; it is not a claim of
fresh CI or database qualification at a later documentation commit.

Only the two registry files conflicted. Relative to the exact Campaign tip,
the plan changes 2 additions/1 deletion (3/15); the test changes 18 additions/
3 deletions (21/30). Every inherited Campaign runtime/harness/workflow/migration
file and every claims migration/harness/test/workflow file is byte-identical
to its owner tip. Main's historical migration tree, lockfiles, release-hold
workflows and authority verifier/test are unchanged. All 50 parent REF statuses
are unchanged. Authority validation accepts 28 changed paths under 30 locks.

Original-eight vector SHA256 remains
`c7a9f4db5d67f975dcb67926d5168abeab8ed31304211b4bd6a94324465c2d39`.
Campaign ninth raw/source SHA256 remain
`adc44f3ca4def361179c6610c0b952c200b26c697f0025aaf3724022ae1c27b7` /
`d011ef91c21d9f8ce4ae93364c332e368a9f1101fb2decb74e91a8e368f7db7b`.
Claims tenth raw/source SHA256 remain
`4a324bd5d4395fe05a40347492f5c80f11cb9d701e509f1b0e67cb51edbbe5c2` /
`2b6e4533392550f497db25d3ffdd0cfe9a50bbfb91b335d6971c967d6ef30ada`.

- PASS: focused suffix/claims/authority Node tests 50/50; supervisor guards 4/4.
- PASS: World/Campaign 50 domain + 16 Admin Deno tests.
- PASS: root npm test, including 223 emitted Node passes plus source audits;
  Player verify; Admin v2 91 + local mutation lifecycle 60; secret scan.
- PASS: actual worker/repository with synthetic false-completion transport reports
  completedCount 0, failedCount 1, campaign_effect_lease_lost and attempt 1 on
  the v2 acknowledgement. This is not real database race/replay proof.
- PASS: backend tsc. BLOCKED: full Edge check and smoke cannot fetch the pinned
  esm.sh Supabase module (unsuccessful tunnel). Smoke emitted 16 Node and 887
  Deno passes before game-session imports failed; later chained suites did not run.
- NOT_RUN: blank replay twice, schema/catalog determinism/lint, actual PostgREST
  role/provisioning/replay/rollback and real Campaign lease/game-isolation tests.
  Pinned Supabase CLI initialization fails with EROFS creating
  /home/agent/.supabase, including with a scoped additional write grant. No
  local stack, fixture or SQL operation started; no teardown acceptance is claimed.
- NOT_RUN: pinned affected browser gates; pinned cache is unavailable and the
  prior browser download was blocked. No browser/dependency substitution.

Publication is pending, not attempted. Existing #885 remote target still resolves
to `a03c1720dfd1df8db95e0b00e738428a12f8fb47`; main/Campaign remain at the identities
above. GitHub PR conditions preserve the live holds, but vercel.json leaves the
claims branch unlisted. Vercel documentation specifies unlisted branches default
to deployment-enabled, and this branch has an existing Git-connected preview.
The current no-deployment instruction does not clearly authorize that preview
side effect. No setting change, replacement branch or other bypass was attempted.

Next action: parent resolves preview publication authorization and an environment
for the unchanged disposable qualification. Then recheck expected remote head,
publish only to the existing #885 stream if safe, and inspect every required
actual job on that exact combined source. No source/release completion is claimed.


## Local trusted-source dependency preparation — publication pending

Baseline: `eb9fb5dbd3af152129f1fbc1c29fd4e884ece574`; existing draft PR885. This is an authorized local preparation, not a source commit/publication, merge, deployment, hosted operation or qualification certificate.

Preserve the original `c38da5dd6da6281964435002ce204cd586634fe3bdfb24a0ee116f48cf3292e9` identity for the exact `https://esm.sh/tslib@2.8.1/denonext/tslib.mjs` URL. The 11,226-byte local copy is byte-identical to the accepted REF009 observation at run 41172691709 / job 124453825349. It is accompanied by the package's license and honest provenance. The rejected `ebce3cd5...55905ca` bytes/cause remain unknown; matching helper names is not a full semantic/provenance proof.

Each of the 28 actual Edge entrypoints has an exact per-function Deno mapping to the same `_shared` file; the existing CI default/Admin/Classroom configs resolve that same target. This avoids assuming the development-only global fallback is an actual deployment contract. Only one exact URL key is allowed; query/version neighbors are not remapped. Compiler/task settings and all original qualification arguments, permissions and frozen-lock bytes remain intact.

The existing neutral-config owning suite checks immutable local length/digest and original lock identity, rejects other resolution/compiler/test drift, and verifies all 29 effective config paths with a transitive offline Deno graph. It inspects graph errors even when Deno info exits zero. The existing deterministic release-archive test checks that every current function archive retains the per-function map, identical local bytes and license. The architecture inventory is regenerated without changing thresholds.

Actual Supabase CLI bundling/serve/deploy has NOT run: the existing CLI wrapper fails EROFS creating `/home/agent/.supabase`. No bypass, installation, external workflow, suspect CDN fetch, cache replacement or live operation is allowed by this preparation. Existing online nineteen-suite parity/full backend/Edge/browser/security/economic and actual disposable bundling qualification remain required on a separately approved candidate. Offline fixture graph/archives are not substituted for those gates.

The exact new paths are registered in PR885's allowlist; no broad directory scope. No SDK or dependency upgrade, remote lock refresh/deletion, integrity bypass, migration, workflow/retry/JWT/credential/permission/hold or Loans change. Source publication is PENDING separate explicit commit/push approval after technical parity review.

### Prepared bundle-only qualification — not executed

The parent authorized local preparation of `scripts/verify-edge-tslib-bundle-closure.mjs` and two steps in the existing `player-multiplayer-load-e2e.yml` disposable job. The added Deno setup reuses the existing `denoland/setup-deno@v2` / `v2.9.3` selection; no existing action pin, command, trigger, permission, timeout, retry or hold changes. This is the sole additional preparation exception to the inherited workflow freeze, not publication or workflow execution authority.

Pinned CLI v2.109.1 source selects Runtime 1.74.2 and adjacent deno.json discovery for Docker bundling. The proposal guards the installed CLI/Deno versions, runtime override, image tag/digest/ID and binary version; invokes the existing frozen all-root typecheck; compares real SDK graph identities through adjacent and actual CI configs; bundles all 28 actual roots without an import-map override; and uses extraction only for positive local-helper evidence. Roots without this dependency are classified explicitly. Fresh owned containers/cache and disposable source copies remove only the helper for Admin, Classroom and one SDK-bearing identical strict-default root. Only a failure naming the expected LOCAL missing file receives negative-control credit; remote failures/timeouts do not. No handler, server, hosted token, project reference, deployment, upload or new ESZIP parser is involved.

Acceptance is that the original dependency resolves to the byte-identical local implementation through actual CI/deploy-mode config, not that URL strings are absent from ESZIP. The input hash and lock remain unchanged. Existing upstream unbundle filters file-like specifiers, so it is not a complete HTTPS index. All new real graphs, image identity, bundling/extraction, controls and independent teardown remain NOT RUN pending review and separate publication/CI approval. Source remains unpublished on eb9fb5d; the prior local EROFS restriction is not bypassed.

Owner approval received at 2026-10-31 06:48:47 UTC covers this bounded correction, necessary helper/CI steps, ordinary existing-PR885 fast-forward, automatic staging Preview and normal checks/artifacts. Publication remains HELD FOR INDEPENDENT TECHNICAL REVIEW of the final patch, refreshed expected head and verified staging binding. No publication, CI, runtime image or live operation has occurred in this preparation. Earlier publication-pending statements are retained as history, superseded only for this exact conditional wave; all release holds and live-operation exclusions remain.

### Unpublished correction after exact 1ab7d8ce qualification

Published `1ab7d8ceeda24be3e68f501eda5804944899bf20` completed 57 workflows: 42 passed, 12 failed, three skipped. The proposed correction reconciles only six REF003 review/support identities for the already-approved mapping-only edits to neutral/Admin/Classroom configs; classifications, ownership/removal gates and unrelated pins stay unchanged. Only the existing REF003 register is newly added to PR885's editable-path list. No ledger or census baseline is regenerated.

The 655-byte 0BSD license's 11 CRLF pairs become LF, preserving all other bytes/terms and final-line ending state. Raw original SHA256 `210b19e543130388c68654b7497e967119ce17145f66ab7d85688fbd70f08751` becomes normalized 644-byte `0e8d2550baea17eb3072c4f919b36fbf9852bb49dba948549872e713863c0834`; only the two license-hash assertions and provenance follow this transformation. Module 11,226 bytes / `c38da5dd...3292e9` and original lock `66b40862...79423b` are unchanged.

The existing Player stack had no recorded resource IDs. The helper now reuses REF046's unchanged `ownedDelta` validation to record a baseline before the existing startup and a same-job/run/attempt/source/config-bound receipt after it. Qualification moves after that ownership check. It inspects only the receipt's exact runtime container ID and its local image ID; requires the project label, recorded network, fresh creation, official CLI-selected v1.74.2 reference/tag/digest and binary version; and fixes that image ID for all helper runs. No pull, new fallback, tag mutation, arbitrary image selection or application-stack cleanup is added. Existing startup retries and teardown commands remain intact; fresh helper-owned containers/caches, graph/bundle/negative-control gates and all QA remain. Application stack resources/image must still match the receipt afterward.

This is local preparation only. The prior wave approval does not authorize this materially changed candidate's publication. No commit, push, new CI/runtime/image/CDN acquisition, retry or live operation occurs here; no assertion or time budget is waived. Actual receipt selection/bundling/controls remain NOT RUN pending independent review and the next scoped decision. Final full-candidate whitespace checks include staged/new-file content, rather than only the unstaged tracked worktree.
