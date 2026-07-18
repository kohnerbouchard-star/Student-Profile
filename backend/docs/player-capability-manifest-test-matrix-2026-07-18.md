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
- news, market reads, Inventory read, Inventory redemption, watchlist, notifications mark-read, logout, and Contract acceptance are enabled;
- market order, Contract submission, Store purchase, legacy UUID-bearing routes, automated item effects, and expansion actions remain disabled or absent;
- Inventory redemption advertises reviewed collection, request, and exact public-request-ID read paths;
- every advertised operation is recognized by its authoritative route parser;
- item-level `inventory.use` is present only for active, visible holdings with positive available quantity;
- endpoint keys are unique;
- endpoint operations use reviewed public paths and methods;
- response serialization contains no UUID-shaped value;
- successful response is `private, no-store` and varies on authenticated session headers.

## Regression coverage

- stock asset and watchlist parsers reject `/spoof/players/...` and `/spoof/classroom-api/...` paths;
- Inventory redemption parsers reject UUID item IDs, malformed public request IDs, and spoofed prefixes;
- reviewed redemption GET/POST operations retain authenticated shared rate-limit policies;
- focused capability tests are registered as `npm --prefix backend run test:player-capabilities`;
- focused Inventory tests are registered as `npm --prefix backend run test:player-inventory`;
- focused market parser tests remain part of `test:player-market-assets`;
- all suites remain part of canonical Backend smoke.

## Required tranche gates

- focused capability tests;
- focused Inventory and redemption tests;
- focused rate-limit dispatch tests;
- focused market tests;
- Backend TypeScript typecheck;
- local Deno checks for changed modules;
- canonical Backend smoke;
- Repository Quality;
- Admin API Check;
- Admin Bundle Contract Audit;
- Database Replay and lint;
- Player Terminal contract verification before connected consumption.
