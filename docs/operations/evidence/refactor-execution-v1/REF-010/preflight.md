# REF-010 preflight and characterization scope

Observed: 2026-09-27. Repository: `kohnerbouchard-star/Student-Profile`.
Base main: `4e516916c556af4fee38d594c0518e22b7ee2545`.
Owner branch: `refactor/ref-010-player-access-code-reset`.
Task: REF-010; inherited architecture items: ARCH-100/ARCH-400.
State: IN_PROGRESS for characterization; runtime cutover BLOCKED.

## Authorization and ownership

The product owner requested "Start task 10" after the verified REF-009 closeout. This opens REF-010 only, not REF-011, release, credential rotation, or unrelated incident work. REF-005 is VERIFIED_COMPLETE on inspected main, with implementation `efd5142e1fa744bc7b2126d10da0a834cc6b7a6a` and merge `1fb96a613f5b04548b5ccb784170f72d5b505ae1`. REF-009 is VERIFIED_COMPLETE. No existing REF-010 branch or implementation PR was found before creating this branch.

The program README explicitly allows documentation and characterization while an affected runtime waits for an accepted baseline. REF-010 explicitly requires resolved #668/#736 ownership and an accepted auth baseline before activation. This tranche does not waive that requirement.

- #668 is open/draft at `faaf908bdd5131b451c7e87e91ed4991ad8f839d`. Its changed files include `admin-api/gameRoutes.ts`, `common.ts`, `index.ts`, `adminRequestApplicationContext.ts`, shared Staff context, the architecture inventory, and the global completion ledger. REF-010 does not edit these shared files in this tranche. Prior route-specific handoffs are not assumed to authorize the reset route.
- #736 is open/unmerged at `8070f58d4145951d8aee3e74a2b1e00d90c54385`. It owns Player service-role selection, factory injection, incident evidence, and release qualification. The inspected discussion grants REF-006 a Messaging-import-only split, not REF-010 auth-baseline acceptance. Its historical 503 report is not treated as a newly executed production probe.
- There is no accepted REF-010 auth-baseline or reset-router ownership handoff in the evidence inspected for this start. Record those decisions and their exact source/runtime identities before activating a local reset adapter. Do not merge either PR merely to unblock this task.

## Exact editable scope for this tranche

1. `backend/tests/domains/players/ref004Parity.test.ts`: extend the existing no-network reset fixture with identifier-only persistence fault injection and ten additional characterization cases. Preserve all existing test bodies and assertions.
2. `docs/roadmaps/refactor-execution-v1/tasks/REF-010.md`: append the start status, evidence pointer, and remaining gates without removing acceptance or stop conditions.
3. This preflight document.

Three paths, no application-source change. The ten-file parent budget and 400-semantic-line review threshold are not increased. No second test framework, package command, workflow, migration, or generated runtime is added. The global ledger remains with its existing owner. The main backlog receives no completion or implementation-SHA credit from this unmerged test-only tranche.

All runtime source, reset/credential RPCs, credential hashing, Staff/Admin/Player authentication, service-client selection, BFF/cookies, MFA, rate limiting, browser code, security assertions, architecture ceilings, live data and deployment configuration are protected. In particular, do not edit `gameRoutes.ts`, `common.ts`, `playerAccessCodeResetHttpHandler.ts`, `player-api/runtime.ts`, or the existing SQL authority in this tranche.

## Inspected baseline and preservation requirements

`admin-api/gameRoutes.ts` still forwards POST `/games/:game/players/:player/access-code/reset` through `proxyClassroom`. The proxy preserves the Staff bearer and forwarded request identity, normalizes the forwarded JSON body, and wraps the upstream response with Admin CORS and no-store headers. Unlike REF-009 reward issuance, this route must not be described as an already-local reward-style interception.

The domain handler is `backend/src/domains/players/api/playerAccessCodeResetHttpHandler.ts`. Its sequence is method check, runtime configuration, Staff resolution, owned-game lookup, game-scoped Player lookup/active-state check, body parsing, credential material preparation when requested, and persistence. The originally named adjacent `.test.ts` file does not exist at inspected main; the real retained reset fixture is `backend/tests/domains/players/ref004Parity.test.ts`.

The existing `test:player-request-scope` command already includes that fixture. Its original Git blob is `b130ff39da357e6894857432cbf6af3583a49cc5`. The fixture injects synthetic Staff/service/credential dependencies and forbids network use. It is handler characterization, not live Staff-session verification, cryptographic verification, or database rollback proof.

Nonempty supplied Access Codes use the unchanged `set_player_identity_and_access_credential_v2` RPC with nine arguments: game, Player, display/normalized identifier, lookup digest, credential version, salt, verifier, and iteration count. The inspected definition in `20260726094000_add_versioned_player_access_credentials_v2.sql` uses a game/Player advisory transaction lock, updates the identifier, revokes active credentials and sessions in that scope, and inserts the new credential. It does not accept a request-id/idempotency parameter. Before implementation, reconcile all later routine definitions and affected trigger/audit behavior; this initial source inspection is not live SQL parity certification.

An absent, null, or blank Access Code takes the identifier-only branch. It performs a scoped Player identifier/timestamp update without creating credential material or calling the credential RPC, and reports `sessionsRevoked: false`. It is not a no-op and must not be converted into random Access Code generation.

Identical transport keys do not currently create an idempotent credential receipt: each credential-bearing handler call invokes the authority. Do not silently invent replay/conflict policy during extraction. Nested payload precedence and existing field aliases must remain unchanged. The body alias `playerId` is a display-identifier alias; it must never become authority for the target Player UUID.

The leaf response intentionally returns the newly supplied normalized code to the authorized Staff contract, but never salt, verifier, lookup digest, or internal ownership IDs. Identifier-only responses return a null code and unchanged status. Preserve the distinction between leaf private-cache headers and the Admin proxy's final CORS/header envelope.

## Added characterization coverage

Ten cases: four absent/null/blank/empty-payload cases; three identifier-only conflict/persistence-error/missing-row cases; nested payload precedence; identical-key repeated invocation; and exact success/privacy/cache-header assertions. The existing wrong-game, wrong-Player, expired/revoked Staff-resolution, malformed input, credential failure and RPC-error cases remain intact.

The fixture's identifier-update fault injection proves attempted-call scope, error mapping, and absence of credential-authority calls. It does not prove real PostgreSQL rollback or real session invalidation. Those require disposable database and authorized staging evidence before the parent task can close or release.

## Verification and remaining execution

Local checkout/tooling: public Git clone failed because this container could not resolve github.com; Deno is absent. Connector reads/writes remain available. Node syntax checking is supplementary only, not a replacement for the repository-pinned Deno/Node CI matrix. No local Deno, full repository, database, browser, staging, or production pass is claimed.

Publish this test-only tranche as draft and inspect exact-head CI. Existing backend smoke runs `test:player-request-scope`, so no test registration edit is needed. Record actual workflow outcomes in the PR conversation, keeping queued/not-run states distinct from passed.

Next within REF-010: (1) record a reset-route-specific ownership resolution with #668 and acceptance of the relevant auth baseline while preserving #736 ownership; (2) capture full Admin-entrypoint/forwarded-Staff parity, including malformed-body normalization, guards, headers, trusted-IP/rate-limit semantics and failures; (3) extract the smallest existing Players command and introduce the proposed local adapter only after those gates; (4) prove old/new code and session validity, failure rollback and exact audit outcomes in a disposable database; (5) run all task/shared gates and obtain authorized staging auth evidence before release.

No merge or deployment is performed by this start. Revert test/document changes only if necessary; never restore revoked credentials or reset real users for qualification. Stop before REF-011.
