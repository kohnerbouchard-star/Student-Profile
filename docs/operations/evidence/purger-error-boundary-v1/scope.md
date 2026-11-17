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
