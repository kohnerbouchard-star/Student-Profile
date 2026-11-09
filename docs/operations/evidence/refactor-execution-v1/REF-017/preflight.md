# REF-017 — Player roster read-persistence preflight

Status: IN_PROGRESS. Risk: R2. Repository-only scope; no production authorization.
Base main: `0ff48af9b7392b131aa94fa6560ef49843356f82`.
Owner branch: `refactor/ref-017-player-roster-read-persistence`.

## Dependency and ownership

REF-016 is VERIFIED_COMPLETE on main. No existing REF-017 branch was present before this branch was created.

Open PR #668 owns Staff/Admin multi-game context work and generated architecture inventory; its complete changed-file list does not include the Player roster handler or proposed Players contracts/infrastructure. Open PR #736 owns the Player runtime service-role binding and generated inventory; it likewise does not include the roster handler or proposed repository files. Generated inventory is the only known shared path and must be regenerated from this branch without donor code.

## Frozen current behavior

`handlePlayerRosterRequest` is reached from the Staff API and retained Classroom API. Method, environment, staff authentication and owned-game-session checks occur before the GET/POST split.

POST is already delegated to `createPlayerForAuthorizedStaff` and is protected from this task.

GET currently performs exactly two possible database reads after ownership succeeds:

1. `players`: select `id,display_name,roster_label,player_identifier,status,created_at,updated_at`; predicate `game_session_id = gameSessionId`; order `created_at ASC`. Null data becomes an empty roster.
2. `player_access_credentials`, only when at least one Player ID exists: select `player_id`; predicates `game_session_id = gameSessionId`, `status = active`, and `player_id IN selected roster IDs`. Only string player IDs contribute to `hasActiveAccessCode`.

Either read error maps to HTTP 500 `player_roster_failed` / “Player roster could not be loaded.” The response exposes the existing Player public ID, display name, roster label, player identifier, status, active-code boolean and timestamps; it does not expose credential material. There is no pagination or total-count query in the current contract, so REF-017 must not invent either.

## Bounded implementation shape

Create a minimal Players-owned read port and Supabase adapter only if no equivalent is found:
- `backend/src/domains/players/contracts/playerRosterReadRepository.ts`
- `backend/src/domains/players/infrastructure/supabasePlayerRosterReadRepository.ts`

The handler may import the adapter factory and replace only the GET persistence block. The existing request-scoped `staffResult.serviceClient` must be injected into the repository factory; no global client or service-role selector may be introduced. The repository owns database column names, the two frozen reads, and projection to an application-facing roster record. The handler retains method/auth/ownership/HTTP response translation and POST behavior.

Focused tests must cover empty roster, duplicate display names, active-credential projection, second-query suppression for empty rosters, query failure mapping, game-scope predicates and private credential exclusion. Existing caller/composition roots should remain byte-identical unless an actual injection seam proves necessary.

## Initial path budget

Expected meaningful implementation/evidence paths:
1. roster handler
2. roster-read repository contract
3. Supabase roster-read repository
4. focused roster repository/handler test
5. REF-017 task
6. REF-017 backlog entry
7. this preflight
8. completion/qualification evidence later

Generated architecture inventory and a narrowly required cross-cutting manifest, if existing guards demand them, are tracked separately. Do not touch POST/create commands, Player auth/session code, Staff/Admin context owners, database schema/migrations/RPCs, UI, dependencies, workflows, secrets, or Task 18.

## Qualification

Before merge: prove direct roster persistence is absent from the selected handler; verify the frozen query predicates/order/call count and response privacy; run roster tests, Player security/request-scope, Admin API, typecheck, architecture/high-priority/privacy/secret/diff checks, and all applicable exact-head CI. Unknown behavior or scope expansion stops the task rather than weakening a test.

## Implementation checkpoint

The bounded runtime extraction is published on this branch. `playerRosterHttpHandler.ts` no longer contains direct `.from("players")` or `.from("player_access_credentials")` roster reads. GET constructs `SupabasePlayerRosterReadRepository` with the already-authenticated request-scoped service client and maps only the repository's bounded persistence error back to the existing HTTP 500 envelope. POST/create code is byte-for-byte preserved inside the handler.

The new repository owns the exact two frozen reads and projects only the existing response fields. Empty rosters suppress the credential query; duplicate display names remain independent records; credential rows select only `player_id`; non-string credential IDs are ignored as before; malformed selected Player rows fail closed rather than broadening scope. Focused repository tests cover query order/predicates, call count, duplicate names, active-code projection, private credential exclusion, both query failures and malformed rows.

Exact-head native qualification remains pending. Do not merge or mark complete until typecheck, roster/Player/Admin/security/privacy/architecture gates and applicable CI pass. No schema, migration, RPC, global client, auth/context, POST mutation, deployment, database operation or REF-018 work is included.
