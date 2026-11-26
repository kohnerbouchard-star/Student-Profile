# Source-only full15 CI proposal — unpublished

Base main b62f10ffda169fd6f884cc3a254c136fbd6b862d. This independent source-only
branch carries no part of the earlier blocked operational apply workflow/runner/
qualification registry. It supersedes neither the local510606f1 evidence nor any
release hold. No app/backend/migration/config/credential changes. Age is parked.

## Exact proposed check

`.github/workflows/staging-suffix-source-qualification.yml` runs automatically on
same-repository PR exact heads targeting main, and source pushes to the isolated
`fix/staging-suffix-source-*` namespace. Proposed publication branch:
`fix/staging-suffix-source-full15-20261126`. There is no dispatch/call/run trigger,
protected environment, secret expression or write permission. Actions and Node/
Supabase versions are pinned; contents:read is the only permission. Only the
bounded result JSON is retained. No raw schema, SQL, data or tool log artifact.

The new `scripts/operations/staging-suffix-qualification/run.mjs`:

1. Requires GitHub exact source identity, same-repo/main PR scope or isolated push
   branch, attempt1, no external PG/Supabase/database/token/Docker overrides, and
   unchanged canonical SQL against exactb62. No hosted connection URL is accepted.
2. Uses a private temporary HOME/Docker config, local Unix Docker daemon only,
   SupabaseCLI2.109.1 and pinned linux/amd64 image
   ghcr.io/supabase/postgres@sha256:e884cde9f5594ddb30ebec888bd236d128eaf9c9b48cc864d8fa3d27a6c6c6bc.
   Failed acquisition is attempted once, with no retry/fallback image. The CLI
   starts an EMPTY migration/seed workdir using the existing repository config
   and excluded-service convention. The CLI-created image must match the exact
   already-pulled image ID; mismatch fails closed before canonical SQL.
3. Disconnects every network and reattests fresh project/name/label/image/running
   state and absence of networks before every DB operation. Host/container shared
   network modes reject. SQL transport is always docker exec to the owned DB's
   fixed Unix socket; child environments are cleared. Cron active jobs are turned
   off and verified before repository replay. No app data/SQL runs before fencing.
4. Replays the actual449 repository migrations through nonce20260921044500,
   without changing historical bodies/predicates. Each exact source is recorded
   atomically. This449 canonical prefix is independently counted and is distinct
   from the parent-reported468-row saved live archive; a count is not a live-ledger
   reconciliation. No archive/live data is acquired or used.
5. Executes all15 actual suffix bodies and nonempty per-migration predicates with
   the pure test-only compiler: full batch explicit rollback, injected failure after EACH of15 migration
   bodies with baseline equality after every rollback, then commit/current-state
   checks and actual committed retry rejection with unchanged committed snapshot.
   Complete selected application schema/data/ACL and ledger dumps are hashed
   before/after failure (random restrict nonce removed only). All stored rows are
   canonical repository seeds or explicit synthetic fixture data.
6. Actual purge migration must meet its unchanged460-edge/function-hash guards;
   postconditions verify new digest plus exact inverse predecessor definitions/
   preserved pg_proc metadata. Actual manufacturing migration must rebuild both
   triggers, widen numeric(16,4), compile on canonical schema and reject invalid
   claim input. A separate synthetic projection fixture executes the actual
   installed refresh function, proving0.1234 unit cost/0.3702 total, one projection,
   canonical holding unchanged across repeat refresh, and wrong-business denial.
   This isolated fixture does not claim canonical trigger/whole-job integration.
7. Stops the owned stack, removes its private workdir and returns only PASS/FAILED,
   bounded stage/source/count/boolean evidence, syntheticOnly:true and
   releaseQualified:false/applyAuthorized:false. Cleanup failure overrides PASS.

The command allowlist rejects gh dispatch, deployment clients, Supabase linking/
db push, arbitrary docker run, and external database clients. The test-only pure
compiler has no connection/receipt/credential entrypoint. reviewed:true in its
synthetic predicate objects is not a human approval or an operational registry.
Most predicates are catalog/safety checks; full positive financial, managed Auth/
Storage and manufacturing lifecycle acceptance remain separate and explicitly
unclaimed (`fullManufacturingLifecycle:false`). A CI pass never changes an apply
gate or qualifies an existing restore receipt.

## Verified locally / pending execution

Contract tests verify triggers/exact source, deny protected env/secrets/dispatch,
reject authority overrides/fork/main-push/rerun, require fresh exact image/fenced
container, refuse effectful commands, prohibit empty predicates, suppress raw
failure diagnostics and enforce one failed acquisition attempt. The native PG17
fixture ran actual immutable manufacturing projection successfully. Full Docker
canonical replay/purge/full15 transaction checks remain NOT_RUN locally: no Docker
runtime is provisioned. No CI has been published, dispatched or run by this agent.
The first actual CI must verify CLI image compatibility and canonical replay;
there is no claim that a mocked contract test proves those runtime steps passed.

Local reproduction (verified native PostgreSQL17 binaries/libraries, Node22):

```sh
STAGING_SUFFIX_SYNTHETIC_PG_BIN=/VERIFIED/PG17/bin \
LD_LIBRARY_PATH=/VERIFIED/PG17/lib \
node --test scripts/operations/staging-suffix-qualification/*.test.mjs
```

Without that optional binary path, the native projection unit test is NOT_RUN;
the proposed CI runner separately executes the installed projection on its real
pinned disposable database. It does not install anything on the Mac.

## Publication safety review and exact blocker

The conservative offline event/path inventory accompanies this scope. For the
proposed branch push, only the new source-only workflow matches. Opening/updating
a main-targeting draft also schedules the existing source/disposable/browser/
Roster verification workflows; Branch Hygiene is closed-only and excluded from
opening/synchronizing effects. The matching privileged jobs in Release Integrity
and Staging Readiness are explicitly workflow_dispatch-only, so cannot run from
these events. Existing protected holds are untouched. Inventory includes the
prospective new authority and Roster pin paths; reevaluate after assigning the
actual PR number and final complete path set.

**Do not publish yet.** Repository vercel.json explicitly disables main and one
old ops branch, enables release/production, and does not explicitly disable this
proposed branch. The Vercel project's connector response successfully provides
project metadata but omits Git link/branch deployment controls. It cannot prove
that this branch push will avoid an automatic preview/deployment or deployment
secrets. The attempted public Vercel documentation acquisition failed and was not
retried. No project setting was changed and no deployment initiated. External
integration hooks (including any Supabase branch automation) also are not certified
by a GitHub YAML inventory. This is an evidence gap, not a claim that a deployment
has happened or is inevitable. Read-only Git transport resolves main exactlyb62;
write transport is not exercised while publication safety is unresolved.

The owner authorized source pushes, conditional on natural CI being non-hosted/
non-deploying. That condition is not established for external integration hooks,
so the deliverable is the verified local recovery bundle, not a public draft.

## Roster and PR authority handoff

`authority-template.json` is explicitly UNISSUED_NOT_AUTHORITY, outside the trusted
per-PR authority directory. No PR number is guessed. It preserves donor1063 check
requirements and locks exact prospective paths/verifier/tests read-only, adding
the new source job. Materialize it only against an actually allocated PR number;
validate with the unchanged generic authority verifier and do not drop required
checks that do not naturally schedule. Add narrow source-only trigger coverage
where needed after inspecting the exact final authority/path set.

Both Roster roles must point to the same COMPLETE authority-inclusive carrier and
its exact tree. A local carrier/pin pair for the currently reviewable source tree
may be supplied, but it is NOT an authority-inclusive publication pin until the
actual per-PR manifest is added and the carrier rebuilt. Do not reuse these pins
for that changed tree or claim old CI for it. The publication safety block prevents
allocating a new GitHub draft number here, so final PR authority/pins must remain
pending rather than be fabricated.

Safe root sequence: independently establish and record external automatic deploy/
branching suppression for this exact branch; verify main/source/scope again;
publish the isolated source branch only when that condition is proven; obtain the
actual draft number; materialize exact authority, commit the complete carrier,
rebuild BOTH coupled Roster pins, verify strict local equivalence and authority,
then update the same draft with an exact-head fast-forward lease. Observe natural
source CI only. No dispatch, merge, hosted DB access, job pause or apply gate
change is authorized by this proposal. Keep release hold intact throughout.

## Publication blocker resolved before first push

The owner explicitly authorized adding only the exact chosen branch key false in
vercel.json. This now overrides the documented unspecified-branch default true
for fix/staging-suffix-source-full15-20261126. A source contract compares parsed
config to exactb62 after removing this one key and requires release/production
remain true. All other config is logically identical. Official reference:
https://vercel.com/docs/project-configuration/git-configuration . The earlier
publication-hold discussion above is historical and superseded for this branch.
The new vercel.json diff additionally schedules Vercel Git Production Verification
static PR contracts; its credentialed verification requires repository_dispatch
with production environment. Custom Domain Activation push is main-only. Existing
Supabase hosted jobs remain manual/main-only or explicitly false; none is enabled.
Publish draft only, then actual-number authority and complete paired carrier pins;
observe natural CI and verify GitHub deployment records remain absent.

## Public draft1064 and exact-head authority

Published draft https://github.com/kohnerbouchard-star/Student-Profile/pull/1064
through GitHub Git-data connector after authenticated CLI transport was unavailable.
The first published branch already contained the exact Vercel deny. Actual trusted
PR1064 authority now locks this scope and preserves the donor check requirements.
Both workflow event filters include exact authority/pins/config/evidence paths so
final metadata-bearing heads receive fresh source-only checks. Database Replay
adds only PR1064's source-authority trigger; its protected hosted job remains
literal false. Supabase hosted jobs and Vercel production verification still
require manual/main/production events that this source push/PR does not satisfy.
New authority supersedes the earlier unallocated/unissued publication status;
kept template is not itself trusted authority. Final complete authority-inclusive
carrier and BOTH pins are coupled together, with exact IDs in delivery evidence.
No main update, dispatch, deployment, real data, job pause or gate change occurred.

## Canonical CLI image diagnosis (no identity waiver)

Final-head run45753949409 reached pinned-managed-image-binding only after the
requested immutable image pull/platform checks and empty bootstrap succeeded.
That old stage also included disconnect/attestation, so it was insufficient to
prove which check failed. New stages distinguish acquisition, expected/observed
platform, exact image-ID binding, disconnect and isolated attestation. Only public
immutable image IDs, approved registry RepoDigests and bounded platform fields
may be emitted; no container env/mount/config dump or raw logs. Exact binding
assertion remains unchanged. A changed-source natural run is diagnostic, not a
blind rerun or a different-image fallback.

Pinned SupabaseCLI2.109.1 upstream source selects postgres17.6.1.143 in BOTH
packages/stack/src/versions.ts and apps/cli-go/pkg/config/templates/Dockerfile:
https://github.com/supabase/cli/blob/v2.109.1/packages/stack/src/versions.ts
https://github.com/supabase/cli/blob/v2.109.1/apps/cli-go/pkg/config/templates/Dockerfile
That supports a concrete selector mismatch hypothesis versus the older capture
image, not permission to accept a mutable tag or different digest. The next
bounded result must prove actual platform/digest identities. Reusing canonical
CI image identity requires an independently verifiable immutable pin; do not
relax the check to a version/name or silently adopt observed bytes.

Image diagnosis concluded at87596672: independent push/PR runs both reported
exact-image-id-binding failure with identical public facts. Both old capture pin
and canonical CLI image were available linux/amd64, but config IDs differed.
image-identity.json records both runs and frozen CLI source selection. This source
check now explicitly pins canonical server17.6.1.143 digest80d7b27c... AND config
ID2d3ac69a..., then requires CLI selector and exact runtime identity. The old
capture workflow/pin is untouched. This is not a fallback or platform/name-only
acceptance rule. The next run independently pulls the declared immutable digest;
any registry, platform, config, selector or runtime mismatch still rejects before
canonical SQL. Full runtime qualification remains pending actual CI.

The published draft now qualifies on pull_request ONLY, with same-repo/main exact
head binding. Push qualification was removed to avoid duplicate acquisitions and
DB tests once this actual PR exists; no manual trigger is added. After immutable
image/platform/config/selector identity and network fencing, bootstrap evidence
requires PostgreSQL17, available pg_cron/pg_net/pgcrypto/supabase_vault, actual
managed Auth users/sessions/MFA and uid/jwt/role functions, Storage namespace and
all five required roles. Missing prerequisites fail before canonical SQL; no
synthetic Auth/Storage replacements are created. Storage object-table presence
and installed extension versions are separately observed, not Storage-byte or
managed runtime qualification. Only public metadata booleans/versions are output.

Corrected-image run45755536770 proved exact digest/config/platform/selector,
network isolation, available extensions, actual required managed Auth/schema/roles
and canonical449-prefix execution; storage.objects was absent and observed, not
silently certified. It next failed at all15-rollback. New test-only psql migration
markers, ordinal predicate labels and whitelisted SQLSTATE/guard/comparison fields
distinguish which actual body/predicate failed versus snapshot inequality. No raw
SQL/data/log is emitted. Immutable ledger source and historical SQL are unchanged;
these psql markers are outside stored migration source and transaction semantics.

Rollback mismatch localization: runner trims stdout, while legacy nonce removal
requires a trailing newline, leaving final random unrestrict key in the hash.
Real native no-op dumps reproduce this false mismatch; outer-pair normalization
(classification only) proves all interior bytes identical. Fixed restrict-key
no-op dumps are identical, and real data, ACL or sequence-state mutations remain distinguishable.
Before changing acceptance, canonical CI now records default vs fixed whole/
schema/data controls plus scheduler counts/launch setting. The legacy rollback
assertion is UNCHANGED in this diagnostic source. No row sorting, schema filtering
or ignored ACL/sequence differences are introduced. Fixed restrict-key is used
only for diagnostic dumps that are never restored, not any real backup/capture.
Reference https://www.postgresql.org/docs/17/app-pgdump.html#APP-PGDUMP-OPTIONS .
