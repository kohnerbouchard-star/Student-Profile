# Player Contract acceptance contract

**Roadmap scope:** `BETA-CONTRACT-001`, `BETA-CONTRACT-002`, `BETA-CONTRACT-003`  
**Authority:** PR #158 / `agent/player-backend-reconciliation-v2`  
**Status:** `IMPLEMENTED_NOT_MERGED`

## Route

`POST /players/me/contracts/:contractKey/accept`

The route is authenticated by `x-player-session-token`. The browser supplies only the stable public `contractKey` in the path. Player UUID, game-session UUID, and active-session UUID are derived server-side and never accepted in the query, body, or ownership headers.

The route accepts an empty body or `{}` only. It rejects query parameters, game-scope headers, ownership fields, runner secrets, malformed public keys, unsupported methods, and spoofed route prefixes.

## Atomic transition

Migration `20260718112000_accept_player_contract_by_key_v2.sql` adds service-role RPC:

`accept_player_contract_by_key(p_game_session_id uuid, p_player_id uuid, p_contract_key text)`

The RPC verifies in one database transaction that:

- the game and player are active;
- the Contract belongs to the authenticated game;
- the Contract is active or scheduled, published, and not expired;
- visibility is public or the authenticated player matches targeted player, country, or roster-label criteria;
- progress is created or transitioned from `available` to `in_progress` without overwriting submitted, completed, failed, expired, or dismissed state.

The unique `(game_session_id, contract_id, player_id)` constraint and row locking make concurrent accepts retry-safe.

## Outcomes

- `accepted`: first successful transition;
- `already_accepted`: repeated request after `in_progress`, returned as HTTP 200 with `alreadyAccepted: true`;
- `not_available`: unavailable, unpublished, expired, paused, archived, hidden, wrong-game, inactive-player, or non-targeted Contract, returned as HTTP 404;
- `locked`: progress has advanced beyond acceptance, returned as HTTP 409.

The successful response contains only:

- public `contractKey`;
- public status `in_progress`;
- acceptance timestamp;
- idempotency indicator.

No internal UUID, token, token hash, targeting UUID, progress UUID, or database row is serialized.

## Capability manifest

Manifest version `2026-07-18.2` advertises the reviewed operation and sets `actions.contractAccept` to `true`. The broader `routes.contracts` flag and `actions.contractSubmit` remain `false` because legacy Contract list/submission contracts still require separate UUID-privacy and runtime reconciliation.

## Automated evidence

- `playerContractAcceptanceRoutePaths.test.ts` verifies direct and Edge routes, public-key validation, and spoofed-prefix rejection.
- `playerContractAcceptanceHttpHandler.test.ts` verifies server-derived scope, UUID-private success, idempotent replay, unavailable/locked outcomes, and ownership-injection rejection.
- `supabasePlayerContractAcceptanceRepository.test.ts` verifies RPC arguments, result mapping, schema-unavailable behavior, and invalid-result rejection.
- capability-manifest tests verify advertisement and dispatchability.
- Backend smoke runs the acceptance suite before Admin API tests.

## Restrictions

This tranche does not connect the Player Terminal accept button, deploy the Edge Function, apply the migration to production, change Supabase Auth, or authorize runtime cutover. It remains `IMPLEMENTED_NOT_MERGED` until PR #158 is merged. Staging-backed connected-flow evidence remains required before beta approval.
