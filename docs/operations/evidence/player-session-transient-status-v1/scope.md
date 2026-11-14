# Preserve Player sessions during transient status failures

## Scope and ownership

- Item: `PLAYER-SESSION-TRANSIENT-STATUS-001`, status `IMPLEMENTED_NOT_MERGED`.
- Owner: `fix/player-session-transient-status-20261114`, from main `2198e7a907d2d87a9eb79867abf9c2f6615cdd59`.
- Existing open roster, CSS, release and global-ledger branches remain separate. The canonical `player-web-session-api/runtime.ts` status route owns this correction. Historical staging compatibility entrypoints are not deployment targets and remain unchanged.
- Preserve encrypted session cookies on upstream rate limits, service errors, network/body-read failures, malformed bootstrap data and missing trusted IP metadata. Clear only locally missing/invalid/expired sessions or a confirmed upstream 401. Forward bounded numeric Retry-After without upstream error bodies or cookies. Continue rejecting missing trusted IP and preserve login cleanup of newly issued tokens.
- No new route, API contract, RPC, schema, migration, economic write, UI, dependency, credential, environment or production action.

## Evidence

The 25-case Node suite imports the actual production runtime, seals real synthetic cookies and captures its registered handler. Only the unused remote Supabase SDK is replaced; request authorization, crypto, public projection and response handling execute unchanged. No external request or real player data is used.

Untouched main reproduces 20 failing cases and five passing security/cleanup cases. The candidate passes all 25. The suite is registered in root validation and the Player workflow. Existing BFF retry, security-remediation and trusted-IP contracts pass 35/35. Core backend TypeScript and the secret scan pass. Local Node is 24.22.1 rather than the repository-pinned 22.23.1, so the hosted pinned/runtime gates remain mandatory.

Full root verification, independent review and fresh exact-head hosted checks must pass before merge. No hosted or production availability claim follows from unit coverage. Full Edge and backend smoke depend on an available Deno runtime and frozen upstream SDK; limits will be recorded without weakening gates.

## Proposed global roadmap reconciliation

`PLAYER-SESSION-TRANSIENT-STATUS-001`: `IMPLEMENTED_NOT_MERGED`; preserve existing Player sessions when the status bootstrap is temporarily unavailable. Local baseline 20/25 failures and candidate 25/25 pass; 35 retained security contracts and core TypeScript pass. Canonical status failures retain their HTTP status and safe retry guidance without clearing cookies, while confirmed invalid authentication still clears. No deployment. Next: exact-head hosted qualification and normal authorized merge, then separately reconstruct the News, Loans, Messages and Dashboard findings.

## Rollback

Revert this bounded runtime correction and its regression registration together. No database rollback is needed. Production deployment remains separately held.
