# Preserve Player sessions during transient status failures

## Scope and ownership

- Item: `PLAYER-SESSION-TRANSIENT-STATUS-001`, status `IMPLEMENTED_NOT_MERGED`.
- Owner: `fix/player-session-transient-status-20261114`, from main `2198e7a907d2d87a9eb79867abf9c2f6615cdd59`.
- Existing open roster, CSS, release and global-ledger branches remain separate. The canonical `player-web-session-api/runtime.ts` status route owns this correction. Historical staging compatibility entrypoints are not deployment targets and remain unchanged.
- Preserve encrypted session cookies on upstream rate limits, service errors, network/body-read failures, malformed bootstrap data and missing trusted IP metadata. Clear only locally missing/invalid/expired sessions or a confirmed upstream 401. Forward bounded numeric Retry-After without upstream error bodies or cookies. Continue rejecting missing trusted IP and preserve login cleanup of newly issued tokens.
- No new route, API contract, RPC, schema, migration, economic write, UI, dependency, credential, environment or production action.

## Evidence

The 25-case Node suite imports the actual production runtime, seals real synthetic cookies and captures its registered handler. Only the unused remote Supabase SDK is replaced; request authorization, crypto, public projection and response handling execute unchanged. No external request or real player data is used.

Untouched main reproduces 20 failing cases and five passing security/cleanup cases. The candidate passes all 25. The suite is registered in root validation and the Player workflow. Existing BFF retry, security-remediation and trusted-IP contracts pass 35/35. Core backend TypeScript and the secret scan pass. The final 60-case suite passes with pinned Node 22.23.1; the first root pass used Node 24.22.1 and a fresh pinned root run follows. Independent source review is clear and independently reruns all 25 new cases with pinned Node.

Fresh exact-head hosted checks must pass before merge. No hosted or production availability claim follows from unit coverage. Deno 2.9.3 full Edge validation stops at the frozen Supabase SDK import with connection refused; backend smoke is also subject to that external dependency. No aggregate Edge pass is claimed.

## Proposed global roadmap reconciliation

`PLAYER-SESSION-TRANSIENT-STATUS-001`: `IMPLEMENTED_NOT_MERGED`; preserve existing Player sessions when the status bootstrap is temporarily unavailable. Local baseline 20/25 failures and candidate 25/25 pass; 35 retained security contracts and core TypeScript pass. Canonical status failures retain their HTTP status and safe retry guidance without clearing cookies, while confirmed invalid authentication still clears. No deployment. Next: exact-head hosted qualification and normal authorized merge, then separately reconstruct the News, Loans, Messages and Dashboard findings.

## Rollback

Revert this bounded runtime correction and its regression registration together. No database rollback is needed. Production deployment remains separately held.

## Publication

Draft [PR #966](https://github.com/kohnerbouchard-star/Student-Profile/pull/966) publishes source `b438e006756968d392f29d61a78fc1c0015219fe`, exact reviewed tree `34314fab54e5d2a9b27c8c842a20218077087d1f`. The actual-number authority preserves every ordered predecessor required/critical identity and unchanged production/mutation/secret denials. Only additive PR trigger registrations are made for retained workflow families; no existing gate is changed or waived. Final-head CI remains pending.
