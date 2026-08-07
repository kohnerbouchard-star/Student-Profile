# Admin UI V2 — Settings

**Owner branch:** `refactor/admin-ui-v2-settings-v1`  
**Base:** `4c17b942fcf4b2a6f60b629549f192d066053ba4`  
**Route:** `/admin/v2.html#settings`  
**Permission:** `settings.manage`  
**Status:** implemented for draft review; no production promotion authorized.

## Boundary

This tranche flips only Settings from the legacy Admin handoff to a source-owned Admin V2 route. It does not alter Backend settings semantics, Supabase schema/configuration, session behavior, role grants, AAL2 requirements, CSRF behavior, idempotency, rate limiting, audit identity, game ownership, or legacy Admin behavior.

Unsupported legacy account-security actions are intentionally absent. In particular, this route does not create Admin password-reset, Admin 2FA setup/reset, secret/environment editing, token management, or any other capability that the current authoritative Admin API does not provide.

## Authoritative contracts

Reads use the existing same-origin Admin BFF projection:

- `GET /api/admin/games/:gameId/settings`

Saves use the existing protected settings mutation:

- `PATCH /api/admin/games/:gameId/settings`

The PATCH body is `{ settings: { ... } }`, matching the existing bounded settings-envelope parser. The Backend remains responsible for persistence through `admin_update_game_settings_v1` and for authoritative validation/clamping.

The browser transport remains `createAdminBffTransport`. It strips caller-owned credential/game/security headers, uses the selected game context, requires a current session CSRF token on mutations, requires a stable `Idempotency-Key`, and leaves authentication, `settings.manage`, MFA/AAL2, game ownership, rate limiting, audit identity, and transaction replay semantics server-authoritative.

## V2-owned presentation

The route exposes only fields already present in the authoritative settings read/write model.

### Game difficulty and economy

- current difficulty preset key;
- price multiplier;
- income multiplier;
- shock frequency;
- shock severity;
- recovery/credit support modifier;
- trade multiplier.

Difficulty-policy modifiers are validated in V2 to the same `0.5–2.0` range enforced by the authoritative mutation contract. Existing preset choices are `easy`, `moderate`, `hard`, and the Backend-owned `custom` state. A preset-only edit sends only `difficultyPreset`; a modifier edit sends the bounded modifier set and therefore intentionally follows the Backend contract into `custom`. An attendance-only save sends neither difficulty field nor modifiers, so it cannot silently convert a preset policy to custom. No new XP, economy, market, or simulation mechanic is introduced.

### Attendance and rewards

The route edits the two reward amounts exposed by the simplified legacy Settings flow:

- present reward amount;
- late reward amount.

The legacy attendance module treats payout currency as automatic `player_country` and applies the difficulty income modifier automatically. V2 preserves those semantics and does not newly expose those hidden policy controls. Timezone, currency code, and any other safe attendance-window fields are retained from the last authoritative read rather than presented as new settings. The controller merges the edited amounts over that sanitized attendance-window object before saving, so unrendered supported keys are not silently discarded. The route does not become a balance, inventory, country-currency, or attendance-record authority.

## State, validation, and safety

Settings uses the shared Admin V2 six-state data model: initial loading, ready, refreshing, stale, empty-compatible, and failed. A failed refresh after a confirmed read preserves the last valid model as stale data. Failed saves never replace confirmed state.

A save is locally validated, then requires the shared V2 confirmation dialog before the mutation is sent. The controller owns one stable idempotency key per logical settings payload; retryable failures retain that key, while a successful or terminally failed command releases it. A successful save triggers a fresh authoritative read without reclassifying the committed mutation as failed if that read later fails.

The presentation model drops private UUID-bearing text and never renders Backend exception text, SQL, service-role material, environment values, bearer tokens, CSRF material, or ownership identifiers. Raw configuration JSON is not shown in the UI.

## Source ownership

- `admin/v2/src/routes/settings/SettingsApi.js` — exact Settings BFF read/write adapter and safe response normalization.
- `admin/v2/src/routes/settings/SettingsController.js` — authoritative normalization, six-state lifecycle, validation, permission fail-closed behavior, mutation replay identity, and teardown.
- `admin/v2/src/routes/settings/SettingsRoute.js` — V2 form composition, validation summary, confirmation, stale/error/loading states, keyboard-native controls, and responsive presentation.
- `admin/v2/styles/routes/settings.css` — Settings-only responsive layout.
- `admin/v2/src/app.js` — route composition only.
- `admin/v2/src/core/navigation-registry.js` — only Settings changes from `legacy` to `v2`.

## Verification scope

Focused contract coverage is in `scripts/admin-v2-settings-api.test.mjs` for route disposition/permission, exact GET/PATCH paths, idempotency header/body shape, private-ID exclusion, validation, permission denial, retry idempotency, and stale reads. Release evidence belongs under `docs/operations/evidence/admin-ui-v2-settings/` and must record browser viewport, keyboard/focus, safe-error, permission/AAL2, and regression checks when executed.
