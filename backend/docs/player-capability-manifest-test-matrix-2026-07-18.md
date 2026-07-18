# Player capability manifest test matrix

## Route and method

- exact direct route succeeds;
- exact `/functions/v1/classroom-api` route succeeds;
- extra path segments are malformed;
- spoofed `players` or `classroom-api` prefixes do not dispatch;
- unsupported methods return `405`;
- query parameters and browser game-scope headers return `400`.

## Authentication and scope

- valid active token returns the manifest;
- missing token returns `401`;
- expired token returns `401`;
- revoked token returns `401`;
- mismatched player/game/session resolution returns `401`;
- missing Edge runtime configuration fails closed.

## Contract truthfulness

- schema and manifest versions are exact;
- every known Player route and action key has an explicit boolean;
- news, market reads, Inventory read, watchlist, notifications mark-read, and logout are enabled;
- market order, Contract acceptance/submission, Store purchase, legacy UUID-bearing routes, redemption, and expansion actions remain disabled or absent;
- endpoint keys are unique;
- endpoint operations use reviewed public paths and methods;
- response serialization contains no UUID-shaped value;
- successful response is `private, no-store` and varies on authenticated session headers.

## Regression coverage

- stock asset and watchlist parsers reject `/spoof/players/...` and `/spoof/classroom-api/...` paths;
- focused capability tests are registered as `npm --prefix backend run test:player-capabilities`;
- focused market parser tests remain part of `test:player-market-assets`;
- both suites remain part of canonical Backend smoke.

## Required tranche gates

- focused capability tests;
- focused market tests;
- Backend TypeScript typecheck;
- local Deno checks for changed modules;
- canonical Backend smoke;
- Repository Quality;
- Admin API Check;
- Database Replay and lint, despite no new migration;
- Player Terminal contract verification before connected consumption.
