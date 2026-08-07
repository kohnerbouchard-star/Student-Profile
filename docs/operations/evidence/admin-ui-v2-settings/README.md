# Admin UI V2 Settings evidence

Branch: `refactor/admin-ui-v2-settings-v1`
Base: `4c17b942fcf4b2a6f60b629549f192d066053ba4`

This directory is the evidence root for the Settings migration. Do not record a check as passed unless it was actually executed against this branch/head.

## Required evidence set

- focused Settings API/controller contract output;
- JavaScript syntax checks for changed modules;
- route-registry assertion showing only Settings moved from legacy to V2;
- current-values and successful-edit capture;
- client validation capture;
- failed-save safe-error capture;
- stale-read/refresh capture;
- `settings.manage` denial capture;
- AAL2-required and CSRF/idempotency mutation behavior;
- keyboard order, validation-summary focus, confirmation-dialog focus trap/Escape/opener restoration;
- desktop and narrow/mobile viewport captures with no document horizontal overflow;
- long-value and Korean-text fixture coverage;
- DOM/private-data scan showing no UUID ownership IDs, tokens, secrets, environment values, SQL, or service-role material;
- Overview, Store, and Market V2 regression results;
- legacy Admin Settings regression if included in the review matrix;
- `git diff --check` and changed-file secret scan;
- draft PR/CI result links.

## Implementation audit notes

The source audit established that `GET /api/admin/games/:gameId/settings` is the authoritative Admin read projection and `PATCH /api/admin/games/:gameId/settings` is the protected authoritative mutation. The Backend settings mutation persists through `admin_update_game_settings_v1`. The current Admin security boundary owns `settings.manage`, AAL2/MFA for mutations, game scope, rate limiting, audit identity, and request replay protection; V2 does not duplicate or relax those checks.

Unsupported Admin password-reset/2FA actions and secret/environment editing are intentionally not present in this V2 route.
