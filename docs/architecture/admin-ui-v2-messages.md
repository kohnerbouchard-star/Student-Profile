# Admin UI V2 — Messages Moderation

## Scope

Messages is a source-owned Admin UI V2 route for supervision and moderation of the existing game messaging system. It requires `messaging.moderate` and remains scoped to the administrator's selected game.

This migration does not redesign the messaging backend, create a second messaging model, or add a new chat composer. It consumes only the existing Admin/BFF moderation contracts.

## Authoritative contracts audited

The current Admin messaging implementation exposes these supported capabilities:

- `GET /games/{gameId}/messages`
  - filters: `q`, `status`, `limit`, `offset`;
  - statuses: `all`, `active`, `disabled`, `closed`;
  - page limit: 1–50;
  - normalized thread projection with participants and up to 100 messages per thread.
- `POST /games/{gameId}/messages/threads/{threadId}/disable`
- `POST /games/{gameId}/messages/threads/{threadId}/enable`
- `POST /games/{gameId}/messages/threads/{threadId}/close`
- `POST /games/{gameId}/messages/threads/{threadId}/messages/{messageId}/hide`
- `POST /games/{gameId}/messages/threads/{threadId}/messages/{messageId}/unhide`
- `POST /games/{gameId}/messages/threads/{threadId}/delete` for expired retention content.

Restrictive moderation actions require a reason. Mutations use the existing game-scoped BFF transport, CSRF enforcement, and idempotency boundary. Because the authoritative Messaging handler currently resolves idempotency from `x-request-id`/`x-idempotency-key` while the V2 transport canonicalizes `Idempotency-Key`, the route-local adapter also sends the same bounded key as `X-Request-Id`; the existing BFF forwards both without any backend change.

The legacy contract also exposes thread creation and messaging policy management. Those are intentionally not migrated into this moderation route because the requested V2 surface is supervision/moderation and must not become a second chat system or broaden backend authority.

No authoritative report/flag feed is present in the audited moderation read contract. V2 therefore does not invent report counters, report states, or flag actions.

## Presentation model

The V2 controller whitelists only moderation-safe presentation fields:

- conversation type, title, status, moderation reason, retention state, created/updated timestamps;
- participant display name, public roster/reference label, and last-read timestamp where supplied;
- message sender display/type, body, timestamp, hidden state, and hidden reason.

Public `thr_…` and `msg_…` identifiers are retained only as opaque action keys and are never rendered. UUID-shaped text in presentation fields is redacted before it reaches the route. Unknown backend properties are discarded, so ownership UUIDs, raw tokens, service-role metadata, and other backend-only fields cannot enter the V2 read model.

## State and lifecycle

The route uses the shared Admin V2 six-state contract:

1. initial loading;
2. ready;
3. refreshing with the prior snapshot visible;
4. stale with the prior successful snapshot and safe retry UI;
5. empty;
6. failed.

Reads are cancelled when the route deactivates. The controller fails closed before protected reads or mutations if `messaging.moderate` is absent. Successful mutations schedule an authoritative refetch rather than synthesizing local message state.

## Moderation UX

The route provides:

- server-backed search and conversation-status filtering;
- paginated conversation review;
- participant/sender presentation and timestamps;
- thread moderation state and message hidden state;
- disable/enable/close conversation actions;
- hide/restore message actions;
- expired-retention deletion;
- required moderation-reason validation for restrictive actions;
- confirmation before authoritative mutations;
- responsive stacked conversation/message layouts for narrow viewports.

The UI does not expose internal IDs, tokens, backend traces, or raw error bodies.

## Shared edits

Shared code changes are deliberately narrow:

- mark the existing `messages` navigation entry as `v2`;
- register the Messages controller in `admin/v2/src/app.js` using the existing BFF transport;
- load `admin/v2/styles/routes/messages.css` from `admin/v2.html`;
- keep targeted Messages source/browser checks under `scripts/` without widening the shared test runner.

No backend or Player messaging source files are modified.
