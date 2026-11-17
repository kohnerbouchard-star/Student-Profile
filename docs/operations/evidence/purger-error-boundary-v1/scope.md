# Purger error boundary and login storage regression

Roadmap item: SECURITY-PURGER-ERROR-BOUNDARY-001.
Base: main 9df2064d6835b64ab9f7a3bde19ed1da5356cded.
Owner: fix/purger-error-boundary-20261117. Status: IMPLEMENTED_NOT_MERGED.
Draft PR: https://github.com/kohnerbouchard-star/Student-Profile/pull/1003
Source commit: 284e805348355d0627bb40ab905042e42ee7eb16.
Verified published source tree: 6988dc1836af3a16f081d645bfab1aa85a177e9b.

## Scope

CodeQL #45 identifies HTTP serialization of internal errors. Replace claim errors
with `claim_failed`; stage failures return `purge_stage_failed`. The persisted
failure record uses only that constant, and logging uses constant event names.
Failure-record rejection/exception cannot escape the stage-error response. The
request ID remains attached to the internal database failure record. Detailed
upstream SQL, R2 object paths and possible sensitive material are deliberately
not retained. Scheduler auth, purge preflight, deletion, retries and success
responses are unchanged. Exceptions thrown before the existing stage catch
remain outside this bounded correction; this is not total endpoint containment.

CodeQL #36's line stores allowlisted public status and a CSRF token, not password
or bearer credentials. The behavioral regression executes the actual login
module and verifies injected credentials are excluded at each nested boundary.
No login runtime rewrite or scanner dismissal is included.

## Verification

- Focused 8/8 tests and existing auth-boundaries suite pass.
- Independent read-only source review: no blocking findings. Latest failure RPC
  uses p_error for diagnostics, not retry control flow.
- Node 22 full root `npm test` and backend core TypeScript pass.
- Full backend typecheck stops at frozen Supabase SDK retrieval: esm.sh
  connection refused. Backend smoke qualification remains pending.
- No deployed Edge source/runtime test, production mutation, migration or
  deployment. Supabase functions deploy separately from Vercel.
- Exact-head hosted checks and any required PR-specific authority metadata remain
  pending; no VERIFIED_COMPLETE or merge-readiness claim.

## Exact-PR authority correction

Hosted source gates in Treasury run 44012651334 and Admin Business Supervision
run 44012651365 stopped before runtime verification because no PR1003 authority
was present. Their database/browser jobs passed; those results do not replace
source qualification. Add the actual-number exact-path manifest and CI inventory,
not a rerun waiver: eight changed paths plus two unchanged read-only verifier
locks, 47 triggered workflow families, 73 active job tuples, ten guarded job
definitions (one has a two-environment matrix). Preserve ordered PR998 required
and critical identities and extend actual jobs: 130 required / 75 critical names.
Authority verification plus existing and focused regressions pass 24/24.
No workflow, verifier, runtime, production or secret permission is changed.
Fresh exact-head hosted qualification is required after publication.

## Sales Convergence formatting correction

At head 3fb83b610473e423ffd9da30e57fd27cd8bb5b7d, run 44018261623
passed authority, database, worker and browser jobs, but source job
133821299020 rejected the unbraced failure-record log conditional under
`deno fmt --check`. Apply the formatter's braces only, with no behavior or gate
change. The exact 23-file formatting command passes; purger runtime-binding
tests pass 3/3 and error/storage regressions pass 8/8. Fresh hosted source
qualification remains required.
