# Staging Auth recovery release guard

Status: `IMPLEMENTED_NOT_MERGED`. Owner: `fix/staging-auth-release-guard`.
Roadmap item: `BETA-STAGING-AUTH-RELEASE-GUARD-001`.
Base: `88b6cf6aa16c92726f4b0adb6788fa0784bd1513` (current main at intake).
Draft PR: [#868](https://github.com/kohnerbouchard-star/Student-Profile/pull/868).
Reviewed implementation: `bdfdc30a0cb619238da40d5e60041931e1d60106`.

## Scope and ownership

The existing recovery release workflow could PATCH production Auth settings on
an ordinary main push, treating a historical approved request as fresh authority.
This tranche removes that production writer. PR/main pushes retain synthetic
validation; only an explicitly confirmed manual main dispatch can reconcile
staging project `eecvbssdvarfcykcfrny`. The historical production request remains
unchanged and is no longer consumed by this workflow. There is no production
release path or authorization in this change.

The workflow, `scripts/staging-auth-recovery-release.mjs`, its focused test,
this record, the global Scope Intake entry and parent-approved PR868 verification
manifest are the complete scope. The shared verifier and regression file remain
unchanged locks, not edit permission. No
application, migration, RPC, API, realtime, auth/session semantics, dependency,
architecture inventory or release hold changes. REF-019/020 remain held.
Active #736 owns Player credential selection; #735 owns production origin gates;
#668 owns bootstrap context. Their code is untouched. Recovery owners #862 at
`422c8dbeb5b20111739778a2ce1a17f7842f7c74` and #863 at
`a94796e3150b1be37b685c15d8cc33eac9367e42` remain separate unmerged drafts.

## Staging boundary and user-operated bindings

After independent review, separately authorized merge and fresh current-main
qualification, the operator must separately approve any staging settings write.
This tranche does not perform or authorize a dispatch, live login, password
reset, factor change, credential change, deployment or production operation.

For a later approved run, the GitHub `staging` environment needs:

- `ECONOVARIA_STAGING_ORIGIN` variable: the exact approved Econovaria team preview
  HTTPS origin, without trailing slash, port, credentials, query or wildcard.
  Production aliases, including the main branch preview alias, are rejected.
- `SUPABASE_ACCESS_TOKEN` secret: existing staging-authorized Management API
  access. No value belongs in source, issues, artifacts or this record.
- Existing environment protection/review rules retained. The workflow uses the
  automatic read-only GitHub token to compare current main twice.

The preview must already serve the reviewed recovery/reset files byte-for-byte
and generated runtime config naming staging, its exact project and same-origin
BFF transport. Protected or redirected probes fail closed; no bypass token,
OIDC change or protection change is supplied. BFF auth/session security and
staging email transport remain prerequisites managed by their existing owners.

The future dispatch must run on main with `source_commit` equal to the reviewed
current main SHA, `confirm_project_ref=eecvbssdvarfcykcfrny`, and
`confirm_action=RECONCILE STAGING RECOVERY`. It changes only staging Site URL,
redirect allow list (retaining existing entries and adding the two exact recovery
paths), recovery subject and scanner-safe branded recovery template. It does not
change SMTP, other templates, CORS, secrets, factors, users or database objects,
and sends no email. Other existing email workflows are not a substitute: their
manifest currently points staging links at the production web origin.

Readback must match all four written fields. No automatic retry follows a PATCH
or readback error: operator inspection and separate approval are required before
another attempt. No full Auth configuration or secret is logged or persisted.

## Evidence and next gate

Local focused run: 8 tests passed, including the actual workflow condition's
135-case event/ref/project/action matrix, wrong/missing authority, production
aliases, stale checkout/current main, deployment mismatch, exact four-field
write, retained redirects, scanner safety and ambiguous failure without retry.
Independent review found and resolved a missing staging project selector in the
recovery email link; re-review found no remaining blocker. YAML parsed with
exact event/job/permission and shared path filter checks; secret/diff checks pass.
Full root `npm test` passes. GitHub recovery validation run `37396235961`
passed its focused tests and secret scan; final-head CI remains a handoff gate.
Local backend full typecheck and smoke are blocked
fetching the existing pinned Supabase 2.108.2 module from esm.sh (proxy tunnel
failure); no application source was changed to bypass this dependency gate. No live
staging evidence is claimed. Next: complete draft PR qualification, hand back
for parent review/merge coordination, then obtain separate staging-operation
approval and bindings. Production remains unauthorized.

Parent independently reviewed and approved the exact six-change/eight-lock/four-critical
verification manifest on 2026-10-06. Its identity/base/path/false-flag rejection
cases pass without verifier changes. This resolves the manifest registration gap;
new exact-final-head CI must pass before parent review. The guard applies only
to `admin-password-recovery-release.yml`; other production Auth writers are unchanged.
