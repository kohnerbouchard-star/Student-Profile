# Admin UI V2 News & Events Evidence

## Baseline

- Repository: `kohnerbouchard-star/Student-Profile`
- Source baseline: `4c17b942fcf4b2a6f60b629549f192d066053ba4`
- Branch: `refactor/admin-ui-v2-news-events-v1`
- Permission: `world.manage`

## Audited authoritative contracts

The implementation was constrained to the existing Admin world-campaign runtime:

- `GET /world/campaign`
- `GET /world/campaign/history?limit=250`
- `GET /world/campaign/effects?status=all&limit=250`
- `POST /world/campaign/effects/:effectId/recover`

The route filters effect reads to `publish_news` in the client read model. It does not call financial `/market/events` or `/market/news`, and it does not expose campaign control/manual-trigger operations that belong to World Management.

No current Admin contract provides free-form world-news create/edit/schedule semantics. No such UI or client method was added.

The player-facing authoritative world-news DTO does contain impact metadata (`magnitude`, `confidence`, `volatility`, `volume`). That DTO is player-session scoped, however, and the current `world.manage` Admin campaign history/effect responses do not expose those fields. News & Events does not import player-session data, infer impact from financial Market events, or fabricate an Admin impact contract. Impact metadata remains intentionally absent until an authoritative Admin/BFF contract exposes it.

## Authoring validation performed

The new/changed JavaScript was syntax-checked with `node --check` while authored. The route's API/controller contract suite was also executed in the authoring environment with the rendering import stubbed only because that environment does not contain the complete repository component tree; the production API/controller source itself was unchanged for that run.

Result: **8/8 targeted API/controller tests passed**.

Covered assertions:

1. Exact three world-campaign GET paths and read-only request semantics.
2. No fabricated create/edit/schedule/trigger client methods.
3. Past world events plus active/upcoming/past/failed publication lifecycle mapping.
4. Zero-record empty normalization.
5. Korean/long event text handling.
6. UUID-bearing text and controller-private effect-ID containment.
7. Safe 429/invalid-response handling with raw backend diagnostic suppression.
8. Permission fail-closed behavior and failed-`publish_news`-only recovery with exact reason/requestId mutation body.

## Repository browser smoke

`scripts/admin-v2-news-events-browser-smoke.mjs` is a source-owned Playwright smoke harness using the existing Admin V2 fixture server plus request interception for the audited world-campaign endpoints. It checks:

- 1440×900 desktop;
- 1024×768 tablet/compact desktop;
- 390×844 mobile;
- 320×568 narrow mobile;
- many records and long/Korean text;
- search and lifecycle filters;
- detail drawer;
- failed publication recovery with CSRF/idempotency boundary assertions;
- empty state;
- stale state after a resolved load;
- safe initial failure;
- no horizontal document overflow;
- no UUID/effect-ID/raw-backend-detail exposure;
- absence of fabricated Create/Edit/Schedule controls.

`scripts/admin-v2-news-events-permission-smoke.mjs` separately verifies that the document-load authorization refresh returns a valid Admin session without `world.manage`, producing the V2 permission-denied surface before any News & Events world-campaign read is issued.

`.github/workflows/admin-v2-news-events.yml` executes the focused API/controller suite, standard Admin V2 regressions, both browser smokes, and uploads their machine-readable evidence as a GitHub Actions artifact.

The browser harness writes its machine-readable result to `admin-v2-news-events-browser-results.json` when executed from a full repository checkout.

## Regression boundary

The implementation makes no edits to Overview, Store, Market, World Management, player news, or backend world contracts. Shared changes are limited to V2 composition/navigation/stylesheet registration plus the source-owned News & Events acceptance workflow, which keeps the existing Overview/Store/Market controllers and domain contracts intact.
