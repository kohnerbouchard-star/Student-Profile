# Admin UI V2 Progression

## Scope

Admin UI V2 Progression is a source-owned review surface for the existing authoritative Progression domain. It is gated by `progression.review`, remains game-scoped, and does not define new XP, reputation, achievement, or review mechanics.

## Authoritative contracts

The route uses only the existing Admin progression BFF operations:

- `GET /games/{gameId}/progression?limit={1..100}&offset={0..10000}`
  - authoritative player progression state;
  - public Player identifier and display/roster labels;
  - level and experience;
  - available skill-point count and skill count;
  - achievement count;
  - bounded reputation categories already returned by the backend.
- `GET /games/{gameId}/progression/corrections?limit={1..100}&offset={0..10000}&playerId={optional}`
  - immutable audited correction history;
  - public Player identifier/display name;
  - correction type, amount, reputation scope/type where applicable;
  - reason, before/after values, and timestamp.
- `POST /games/{gameId}/progression/players/{playerId}/corrections`
  - existing audited experience or reputation correction only;
  - amount is a non-zero safe integer between -5,000 and 5,000;
  - reputation type is one of `country`, `career`, `story`, `relationship`;
  - reason is required and bounded by the backend contract;
  - every mutation carries an idempotency key in both the canonical request header and body compatibility field.

No Admin contract currently exposes achievement-detail mutation, XP-curve editing, arbitrary reputation mechanics, or a separate pending-review queue. V2 therefore renders achievement counts and correction history but does not fabricate those capabilities.

## V2 ownership

`admin/v2/src/routes/progression/ProgressionClient.js` owns the route-specific BFF adapter. It uses the shared V2 Admin BFF transport supplied by `app.js`, so cookies, CSRF, device identity, game scope, and the publishable API key remain centralized. The client never creates an `Authorization` header and rejects UUID-shaped Player identifiers before constructing a route.

`ProgressionModel.js` owns UUID-free presentation normalization, bounded correction-command normalization, and safe panel error projection.

`ProgressionController.js` owns:

- six-state V2 data lifecycle (`initial-loading`, `ready`, `refreshing`, `stale`, `empty`, `failed`);
- concurrent authoritative player/history reads with partial-panel failure handling;
- permission checks before protected calls;
- query/history-type filters;
- selected correction target;
- correction validation;
- mutation de-duplication and retry-safe idempotency-key reuse;
- authoritative refresh after a committed or replayed correction.

`ProgressionRoute.js` owns page composition and V2 loading/empty/error/stale states. `ProgressionTables.js` owns the source-owned player/history tables and filtering, while `ProgressionCorrectionEditor.js` owns the bounded correction form and confirmation dialog. These modules use existing V2 components and keep long/Korean names and reasons wrap-safe.

## Lifecycle and replay semantics

Backend lifecycle restrictions remain authoritative. Correction failures such as paused, ended, or unavailable game state are surfaced as safe route-specific messages without exposing raw backend details.

A correction command receives one generated idempotency key per normalized command fingerprint. A retryable failure retains that key for the next identical submission. A non-retryable failure discards it. Successful `applied` and `replayed` outcomes both clear the pending key and schedule a fresh authoritative read. A replay is presented as an already-recorded successful correction, not as a second write.

## Privacy boundary

The Progression presentation model admits only public Player identifiers matching the existing Admin contract and explicitly rejects UUID-shaped identifiers. Backend staff IDs, ownership UUIDs, raw idempotency keys, service metadata, and arbitrary response fields are not copied into UI models.

Correction IDs use the existing public audit-reference form `pcr_<32 hex>` and are retained only as internal row keys; they are not displayed as ownership identifiers.

## Route integration

The canonical V2 navigation registry changes Progression from `planned` to `v2` while retaining:

- route ID: `progression`;
- group: `engagement`;
- permission: `progression.review`.

`admin/v2/src/app.js` registers a dedicated Progression controller and reuses the same scoped Admin BFF transport as the other source-owned routes. No legacy generated Progression UI is imported into V2.

## Regression boundary

This migration does not modify Player progression routes, reward claiming, skill unlocking, progression migrations, progression event delivery, or seed mechanics. Existing `scripts/admin-progression-contract.mjs` remains the compatibility gate and now invokes the V2-specific contract tests in addition to the legacy/Admin-Player regression assertions.
