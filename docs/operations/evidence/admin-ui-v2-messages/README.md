# Admin UI V2 Messages — Evidence

Branch: `refactor/admin-ui-v2-messages-v1`

Base audited: `main` at `b7827211f0ff15b8a963219a63738180b33a1b3d`.

## Contract evidence

Audited source authority:

- `admin/messaging-moderation-client.js`
- `admin/messaging-moderation-surface.js`
- `backend/supabase/functions/admin-api/messagingOperations.ts`
- `backend/supabase/functions/admin-api/messagingOperationsCore.ts`
- `scripts/admin-messaging-moderation-contract.mjs`
- `player-terminal/src/api/messaging-backend-routes.js`

Findings:

- authoritative read: game-scoped conversations, participants, messages, timestamps, moderation/retention state, search, status filter, pagination;
- authoritative mutations: disable/enable/close thread, hide/unhide message, delete expired retained content;
- restrictive mutations require a reason and are idempotent;
- the existing BFF forwards canonical `Idempotency-Key` plus `X-Request-Id`; V2 sends the same key in both so the existing Messaging handler receives its expected idempotency source without backend changes;
- no authoritative moderation reports/flags feed exists in the audited contract;
- thread creation exists in the legacy Admin contract but is intentionally excluded from this V2 moderation route;
- Player messaging remains the existing canonical Player surface and is not modified.

## V2 implementation evidence

Source-owned route:

- `admin/v2/src/routes/messages/MessagesApi.js`
- `admin/v2/src/routes/messages/MessagesController.js`
- `admin/v2/src/routes/messages/MessagesRoute.js`
- `admin/v2/src/routes/messages/MessagesSkeleton.js`
- `admin/v2/styles/routes/messages.css`

Shared wiring only:

- `admin/v2/src/core/navigation-registry.js`
- `admin/v2/src/app.js`
- `admin/v2.html`
- targeted standalone source/browser checks under `scripts/`.

Privacy controls:

- uses the existing HttpOnly Admin BFF transport;
- no Authorization/Bearer construction in the Messages route/client;
- selected-game scope is applied by the shared transport and every Messages request includes the selected game path;
- only public thread/message IDs are kept as non-rendered mutation keys;
- presentation normalization removes UUID-shaped text and ignores unknown backend metadata;
- raw backend error messages are normalized through the V2 safe error envelope.

## Targeted verification

`node --test scripts/admin-v2-messages.test.mjs`

Covers:

- exact authoritative read path and supported filters;
- exact supported moderation mutation paths and idempotency;
- no thread creation/chat-send/policy mutation in the V2 client;
- empty messaging state;
- high-volume page: 50 threads × 100 messages;
- long and Korean text;
- sender/recipient presentation fields;
- active/disabled/closed and hidden moderation states;
- private UUID-shaped text redaction and unknown metadata exclusion;
- permission denial before protected reads/mutations;
- stale-safe error behavior;
- V2 route registration and responsive CSS presence.

Responsive browser verification:

- `node scripts/admin-v2-messages-browser-smoke.mjs`
- renders the real V2 Messages route at 1440×900, 768×1024, 390×844, and 320×568;
- expands a 100-message conversation and rechecks document overflow;
- checks empty, stale, and permission-denied fixture states at mobile width;
- checks Korean/long text and absence of private UUID/token/backend diagnostic output;
- writes `messages-ready-<viewport>.png` screenshots into this evidence directory when run.

Regression commands:

- `npm run test:admin-v2`
- `npm run test:admin-messaging`

The second command is the existing Admin/Player Messaging source, privacy, secure-BFF, capability, and Player read-flow regression contract. No Player messaging files are changed by this branch.

## Acceptance matrix

| Case | Expected V2 behavior |
| --- | --- |
| No conversations | Empty state, no fabricated content |
| Conversation with zero messages | Thread remains reviewable; message area shows a local empty state |
| High-volume thread/page | Up to authoritative limits retained; messages stay collapsed until review |
| Long/Korean text | Wrapped without truncating semantic content beyond backend field limits |
| Active thread | Disable and close actions available with required reason |
| Disabled thread | Enable and close actions available; close remains reason-gated |
| Closed thread | No thread status mutation offered |
| Visible message | Hide requires a reason and confirmation |
| Hidden message | Restore is supported and shows prior hidden reason |
| Expired retention | Deletion requires a reason and confirmation |
| Permission missing | V2 permission boundary plus controller fail-closed behavior |
| Read failure after success | Last successful snapshot shown as stale with safe error text |
| Mobile/narrow viewport | Summary/filters/metadata/actions collapse to single-column or wrapped layouts |
| Private identifiers | No ownership UUID/token/backend metadata rendered |
| Player messaging | Existing Player messaging contracts remain untouched |
