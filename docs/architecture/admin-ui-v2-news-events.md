# Admin UI V2 News & Events

## Scope

This route migrates the `News & Events` destination to a source-owned Admin UI V2 surface guarded by `world.manage`.

Implementation baseline: `4c17b942fcf4b2a6f60b629549f192d066053ba4`.

The route is deliberately supervisory. It reflects the current authoritative world-campaign contracts and does not create a second event/news authority.

## Contract audit

The current Admin world runtime exposes these relevant contracts:

| Capability | Contract | Used by News & Events |
| --- | --- | --- |
| Campaign runtime | `GET /api/admin/games/:gameId/world/campaign` | Yes — current phase/status and next scheduled checkpoint |
| Event history | `GET /api/admin/games/:gameId/world/campaign/history?limit=250` | Yes — executed authoritative world-event timeline |
| Campaign effects | `GET /api/admin/games/:gameId/world/campaign/effects?status=all&limit=250` | Yes — `publish_news` delivery lifecycle only |
| Failed effect recovery | `POST /api/admin/games/:gameId/world/campaign/effects/:effectId/recover` | Yes — only for failed `publish_news` effects |
| Campaign control/manual trigger | Existing world-management capability | No — remains outside News & Events |
| Financial market events | `/market/events` and `/market/news` | No — Market remains a separate financial domain |
| Free-form news create/edit/schedule | No current Admin contract | No control is rendered |

Campaign `publish_news` effects expose a definition token and audience, not editable title/body copy. The UI therefore does not fabricate a content editor. Player-facing published world-news copy remains downstream of the authoritative campaign/news-definition pipeline.

## Source ownership

New route-owned modules:

- `admin/v2/src/routes/news-events/NewsEventsApi.js`
- `admin/v2/src/routes/news-events/NewsEventsController.js`
- `admin/v2/src/routes/news-events/NewsEventsRoute.js`
- `admin/v2/styles/routes/news-events.css`

Minimal shared composition edits:

- mark `news-events` as `v2` in the canonical navigation registry;
- instantiate the route/controller from `admin/v2/src/app.js`;
- load the route stylesheet from `admin/v2.html`.

No backend schema, world runtime, Market, World Management, player UI, or legacy Admin implementation is modified.

## Read model

The route merges three authoritative views without merging their domains:

1. Executed campaign history becomes past `World event` records.
2. `publish_news` campaign effects become `News publication` records with lifecycle mapping:
   - `pending` → upcoming;
   - `processing` → active;
   - `completed` → past;
   - `failed` → failed/needs attention.
3. An active campaign with a future `scheduled_at` becomes the upcoming campaign checkpoint.

Non-news campaign effects, including `apply_market_shock`, are excluded from the News & Events publication list. Their execution may be related to the same campaign, but they remain owned by their respective Admin domains.

## Mutation boundary

The only mutation exposed is recovery of an existing failed `publish_news` effect.

Recovery requires:

- `world.manage`;
- an existing controller-private `cec_...` public effect identifier;
- current effect status `failed`;
- a reviewed 12–1,000 character reason;
- a fresh idempotency/request key;
- the existing Admin BFF transport, which supplies authenticated session, selected-game, device, and CSRF boundaries.

The UI never renders the recovery identifier. It is retained only in the controller's in-memory row-key map.

## Security and failure behavior

- No browser-readable service-role or ownership token is introduced.
- UUID-bearing arbitrary text is dropped from the normalized read model.
- Backend error messages/details are replaced by the existing Admin V2 safe error envelope.
- Partial read failures preserve available panels and show compact panel-level warnings.
- If all authoritative panels fail after a successful load, the route enters the existing V2 `stale` state and preserves the last resolved data.
- Permission denial happens before News & Events reads.
- The route has no create/edit/schedule API methods to call accidentally.

## UI states

The route uses the shared V2 state machine and components for:

- initial loading;
- ready;
- refreshing;
- stale;
- empty;
- failed;
- permission denied at the composition boundary.

The resolved surface contains summary metrics, a contract-boundary notice, upcoming checkpoint panel, filterable event/publication timeline, detail drawer, and recovery form only when an authoritative failed publication exists.

## Responsive behavior

Desktop/tablet/mobile layouts use source-owned CSS with no fixed viewport assumptions. Summary cards collapse from five to three to one column, filters collapse from four to two to one column, detail fields collapse to one column, long/Korean content uses safe wrapping, and the shared data-table component retains its responsive behavior.

## Validation

Targeted tests live in:

- `scripts/admin-v2-news-events.test.mjs`
- `scripts/admin-v2-news-events-browser-smoke.mjs`
- `scripts/admin-v2-news-events-permission-smoke.mjs`

They cover exact read/write contracts, zero/many records, Korean/long text, active/upcoming/past/failed mapping, filtering/detail, safe errors, stale state, permission gating, failed-publication recovery, no fabricated CRUD methods, UUID containment, and desktop/mobile overflow checks.
