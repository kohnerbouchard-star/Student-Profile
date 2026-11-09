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

### Unpublished CLI-display correction from 79090d96

Tagged Runtime v1.74.2 `cli/Cargo.toml` names the `edge-runtime` binary and CLI crate 0.1.0. `cli/src/flags.rs:56` combines that crate version with Deno/profile/target; `deno/Cargo.toml` and `deno/lib.rs:83` supply Deno 2.1.4. Tagged `Cargo.lock` selects Clap 4.5.23, whose `Command::_render_version` prefixes the program name and appends one LF. The exact display format is `edge-runtime 0.1.0\ndeno 2.1.4 (<profile>, <target>)\n`, not the image release 1.74.2. Profile/target remain bounded display-format fields, not build-provenance claims.

The helper now records sanitized parsed CLI name/version, status/signal/error and UTF-8 process-output lengths/hashes before its display assertion. It requires status zero, no process error or signal, empty stderr, exactly the two producer lines and one final LF; wrong/empty/extra output fails closed without raw-body logging. All same-job ownership, image reference/tag/digest/ID, override, frozen graph/bundle/control and time-budget checks remain unchanged. Crate display is not image provenance. Focused offline owning contracts pass 27/27; this is not actual image/graph/bundle/control qualification.

Existing PR885 authority already permits these three paths; no authority expansion is needed. The cumulative PR diff still contains unchanged `backend/supabase/functions/player-api/deno.json` and `docs/architecture/inventories/econovaria-architecture-inventory-v2.json`, matching the unchanged Manufacturing workflow's pull-request paths for a normal fresh synchronize event. No old failed-job retry, Manufacturing edit or resource-lifecycle change is made. This is unpublished local preparation only: no source commit/push, new CI, image execution/acquisition, live operation or hold change is authorized here. The 79090d96 failures remain preserved.

Owner explicitly approved this technically reviewed three-path correction at 2026-10-31 09:21:52 UTC: reviewed 12,080-byte patch SHA256 `fa8ea2e613a4f3913abd6f2e200cf3f8d290e7d0380e1ecade25ad8ee21473dd`, plus this approval record only. One source commit and ordinary fast-forward successor to existing draft PR885 from expected remote `79090d96097ec79438f25c6a7d4b4a5b92cbfef8`, its automatic staging-bound Preview and normal CI/checks/artifacts are authorized after refreshed source/authority/secret/whitespace/binding checks. This supersedes publication-pending wording solely for this wave; no ongoing successor authority, manual retry, new image acquisition/fallback, gate waiver, merge/PR approval, hosted SQL/Edge/auth/settings or production operation, feature activation or hold change is granted. Actual graph/bundle/control/cleanup evidence remains required.

### Unpublished failure observability from 54c3e727

Neither missing cause is recoverable from the retained 54c3e727 logs. Only failed `deno info` now adds actual redacted stderr data to its existing classified receipt: at most 8,192 retained UTF-8 bytes and 8,192 bytes for the escaped JSON text value, diagnostic tail on truncation, original captured-output byte count/SHA256, retained/redacted lengths and explicit truncation. Existing CI redaction is reused with inherited proxy values, URL userinfo/query/fragment, credential/header/token and control-sequence removal. No raw stdout or other process output is preserved. The single JSON receipt escapes CI command delimiters; unknown diagnostics remain data rather than disappearing from an allowlisted summary.

Only the existing Onboarding OPTIONS step adds presence booleans and bounded condition/function/curl-exit/HTTP-status/error-class records before its original gates. Its same seven requests and complete curl argv, status 204 and three negative-response patterns remain; no retry, timeout or teardown changes. Raw curl stderr and response-body printing are suppressed. Offline tests use owned temporary npx/curl stubs, make no HTTP request, and verify exact argv/counts, original exit conditions and absence of secret/body output. The helper, owning tests and existing auth-boundary suite pass 40 offline tests; this is not new CI/runtime qualification.

PR885 adds only the exact Onboarding workflow and existing auth-boundary test to its editable paths; existing checks, critical jobs and release exclusions remain. This is unpublished preparation, not source commit/push, CI, image execution/acquisition, live-operation or future-publication approval. No app, dependency/lock, runtime/SQL, graph/bundle/control, ownership or budget change is made. Original failures remain preserved pending review of this exact proposal.

Owner explicitly approved this technically reviewed six-file observability wave at 2026-10-31 10:28:27 UTC: reviewed 23,613-byte patch SHA256 `d47bfc0e1102c89e791505e76a7ab69e16d0520c7cd425cbaee1b44ea171c9e1`, plus this approval record only. One source commit and ordinary fast-forward successor from expected remote `54c3e72767a16221908890f66dcd04409eafbf31` to existing draft PR885, its automatic staging-bound Preview and normal exact-head CI/logs/artifacts are authorized after refreshed source/scope/authority/secret/whitespace/binding checks. This supersedes preparation-only wording solely for this exact wave. It authorizes no manual retry, independent fetch, new image acquisition/fallback, gate/request/budget/ownership change, merge/PR approval, production or hosted write, activation/hold change or ongoing successor publication. Existing failures remain preserved; passing qualification will not require forced historical reproduction.


### SDK2.45.4 runtime-closure collection preparation (2026-11-01; unpublished)

The user approved the bounded missing-closure investigation and reviewed append-only pins on 2026-10-31 at 23:47:19 UTC. This supersedes whole-lock immutability only for subsequently reviewed additions to the existing SDK2.45.4 closure. Every original key/value, particularly the accepted tslib digest, remains mandatory. No pin is accepted in this preparation.

Source and remote owner head remain `ad83219dbbdc87b3fa334626e3e148343617a525`; main remains `a4dd2651d0ba964cce0cf28bf35f76975f35fd13`. The retained qualification census is 53 successful, one failed and three skipped returned PR workflows; this is not completion. Actual frozen All-graph resolution failed with an out-of-date lock at Campaign after 11/54 graph checks. No bundles or negative controls ran. The 31 redacted suggested records are not exact patch text or trusted provenance.

The managed local network policy excludes `esm.sh`; no local request or alternate route was attempted. One metadata-only request to the allowed npm registry confirmed `@supabase/supabase-js@2.45.4`, its six exact direct dependencies, publisher name, repository/gitHead and distribution integrity. That independent registry document is not transformed-module verification. Local Deno is absent after the environment restart.

The proposed temporary job in `.github/workflows/backend-typecheck.yml` uses Node 22.23.1 and Deno 2.9.3 without npm installation, Docker, native builds, handler evaluation or hosted credentials. Pinned Deno source `v2.9.3` (`cli/tools/info.rs` blob `c4e591ad5f6a792cfd1fda420a3f9e7a33f4814d`, lines 168–205) establishes `deno info` builds `GraphKind::All`, retains cache locations and writes the lock before serializing its graph; it does not execute handlers. Its flags source (`cli/args/flags.rs` blob `f0aac850bdfd727834f1a0b799d399deae5a73a0`, lines3214–3259/5526–5538/6199–6205) supports explicit host-limited imports and `--no-npm`.

`scripts/collect-sdk2454-runtime-closure.mjs` is preparation only. It guards the exact owner/event/head-parent, baseline lock/config/helper hashes and tool versions; copies only the existing config/helper/lock into a fresh owned directory; and resolves only the existing SDK2.45.4 URL. `--frozen=false` is confined to that disposable review copy. The checked-in lock and actual qualification remain frozen. The child environment excludes hosted credentials and preserves inherited proxy/CA settings without logging values. There is no wrapper retry or alternate-host route.

The proposed graph has a 180-second process budget and 8 MiB output cap; its step is four minutes and job seven minutes. Collection rejects changed original pins/sections, unknown host/package/version, more than 128 modules/64 new remote pins/32 redirects, cache path escapes or symlinks, a module above 2 MiB or module DATA above 16 MiB. Exact query strings and literal parent/import/redirect records are retained, with the accepted local tslib remap verified. Every copied body is hashed; the original SDK wrapper must still match `1108d69216995335d057dbd15907caaf514a4d1ef082f097050573b9d589a57c`. Bodies are never imported, executed or printed; validated bodies use hash-addressed `.bin` files in a seven-day normal CI review artifact. A bounded redacted actual resolver stderr receipt preserves failures without dumping environments. Cleanup removes only its own fresh source/cache copy and records the checked-in lock unchanged.

This is static/literal code-and-type closure collection, not computed dynamic import proof. Deno-reported redirects are not raw HTTP hop/header captures. Selected ranges/versions, registry metadata/package provenance and CDN-transformed bytes must still receive independent review. The collection job must be removed before reviewed pins are adopted. No lock or integrity guard is changed here; no CI/publication or acquisition has run. The frozen 54-graph/28-bundle/three-control and downstream Player proof remains required, with all nine U1 holds and other release restrictions intact.

Offline validation: the owning neutral-config suite passed 37/37 tests (29 existing plus eight collector cases), including exact relative/caret URL and scope-stop receipt assertions and the pinned source's named three-line `deno --version` format. The root version command has no declared `--json` option; only `info` uses JSON. All parity/graph fixtures here are synthetic offline tests, not actual Deno qualification. YAML parsed; the existing Backend Typecheck job and trigger/permission prefix are byte-identical. No lock entry, runtime config, image, migration, original qualification gate, action pin or hold changed. CI collection, transformed-module review, final frozen graphs/bundles/controls and downstream Player acceptance are NOT RUN for this unpublished preparation.

Independent technical review accepted the exact acquisition-only five-file proposal on 2026-11-01: 59,258 bytes SHA256 `7c18b573d271e358746548af9d1b4327a1752b1f6a887f0eb39b207af9ccd04d`, including the conditional-tslib amendment. Its nine focused collector cases passed (zero failed/skipped); earlier 37-case offline baseline evidence remains historical. Existing user approval at 2026-10-31 23:47:19 UTC covers this one ordinary draft PR885 successor from expected head `ad83219dbbdc87b3fa334626e3e148343617a525`, automatic staging-bound Preview, normal CI and seven-day collection artifact, subject to refreshed prepublication checks. This supersedes technical-review-PENDING wording only for this bounded acquisition wave. No pins are accepted; complete bytes and provenance must be inspected through supported artifact access before any proposal to adopt additions. Artifact denial stops that route without alternate retrieval, retry or hash-only trust. No production/hosted write, merge/approval, activation, settings/credential or hold change is authorized.
