# REF-032 / OPS-STAGE-001 — bounded exact catalog diagnostics

Local source candidate, exact base `bc25df5d6d910b09c18574dafb0f00733ef1d5eb`.
Parent reports protected run 45737003205 / artifact 15079418291 contains only a
sanitized result: canonical application schema matched, 15 suffixes applied only
in disposable, 16 certified, runtime catalog exact comparison exit 2. Those
reported counts do not identify the differing fields. No artifact or hosted
catalog was acquired in this tranche, and no actual mismatch cause is claimed.

The existing exact comparator keeps its hashes, raw private differences, exit 0
(match), exit 2 (content mismatch), and exit 1 (parse/profile validation error).
It additionally computes fixed-category positional difference counts for the two
known exporter shapes. Array-length mismatch counts once; common positions are
compared recursively, as in the existing comparator. Counts saturate at 9999;
a value at the cap is a lower bound, not an exact total. Missing/extra top-level
fields, missing arrays, non-object rows or unsupported versions yield an invalid
diagnostic. No category key comes from catalog contents. The comparator's
existing 100-difference display limit does not truncate these per-category
counts below their explicit cap. Row identities, role/object names, SQL, paths,
values, hashes and scheduler commands are never present in this diagnostic.

The protected workflow retains the existing jq allowlist, then passes its output
and private comparison-file paths through `catalog-diagnostic.mjs`. Only validated
fixed integer counts/statuses are appended to the artifact. Missing/corrupt
comparison evidence yields unavailable counts; invalid count shapes yield invalid
counts. `releaseCertificate` remains false and the exact comparison exits remain
untouched. Existing cleanup, upload path, retention, environments, credential
separation and authorization/dispatch conditions are unchanged. The Database
Replay and protected pre-capture test steps register the new source tests.

## Profile applicability

`supabase-application-restore-v1` is NOT a general-purpose way to make this
runtime comparison pass. It first requires canonical local role memberships
(two platform roles granting postgres) versus exactly one hosted cli-login
membership, with exact grantors/admin flags. Only after validating that topology
does it exclude managed role attributes/memberships and global default privileges;
it retains application owners, grants, RLS, policies and schema-scoped default
privileges. It expects effective-schema evidence, not the runtime-catalog shape.

This rehearsal compares canonical local exports against a credential-free local
Supabase restore of application-schema-only SQL. The target is not a hosted
membership topology; restoring public/private/economy_private does not reconstruct
the hosted global role graph. Synthetic canonical-to-canonical input correctly
fails this profile's topology prerequisite. Merely lacking credentials does not
prove any specific topology; a future explicit profile would need independently
verified intended local topology and preservation of all application security
semantics. This candidate neither selects nor changes any normalization profile.

Runtime exports cover all non-system schemas, extensions, views, routine
security, triggers and cron. Effective-schema exports cover application structure,
ownership, ACL/RLS, roles and defaults. Thus a canonical application match with a
runtime mismatch could involve platform/runtime metadata, but the old artifact
cannot establish that. New fixed categories locate the mismatch class without
excusing application ownership, ACL/RLS or scheduler drift.

## Verification and boundaries

Synthetic tests invoke the real comparator CLI and the exact workflow jq-to-node
projection step. They cover application ownership, ACL, RLS/policies, managed role
memberships/attributes, scheduler/runtime ownership, equality/timestamps, cap
semantics, malformed input, injected categories/counts and private sentinel
values. Every synthetic content mismatch retains exit 2; projection retains the
exit and false release certificate. Profile tests reject local/local topology
and runtime-catalog input and retain application security differences on valid
canonical/hosted input. Existing comparator/profile, immutable bundle and
production/protected-workflow tests remain required.

No migration, SQL exporter, rehearsal/apply/release condition or blocked suffix
apply candidate was changed. That separate candidate still requires runtime exit
0. No push, dispatch, hosted connection or production/staging mutation. Exact
actual catalog differences, protected execution, Docker/native replay, final
public authority/source pins and exact-head hosted qualification remain open.
Next: review local source, complete normal publication controls separately, then
an explicitly authorized fresh protected diagnostic run; apply remains blocked.

Local qualification: full root `npm test` passes using matching-lock cached dependencies. All reconciliation tests: 91 pass, ten explicit native-tooling/fixture opt-in skips, zero failures. The separate unchanged suffix-apply validator passes six external synthetic receipt tests with runtime exit 2 substituted into its rejection matrix. No native/Docker or protected-hosted pass is claimed.
