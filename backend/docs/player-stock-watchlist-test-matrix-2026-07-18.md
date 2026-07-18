# Player Stock Watchlist Test Matrix

Date: 2026-07-18  
Target PR: #158

## Route parsing

- accepts the direct and `classroom-api` collection path;
- accepts uppercase and lowercase public tickers;
- accepts supported punctuation such as `BRK.B`;
- rejects UUID-shaped asset identifiers;
- rejects encoded separators and extra segments;
- does not claim unrelated stock routes.

## Request parsing

- list defaults to `limit=50` and `offset=0`;
- accepts the maximum `limit=100` and `offset=10000`;
- rejects zero, negative, fractional, non-numeric, and out-of-range values;
- rejects duplicate list parameters;
- rejects unknown query parameters;
- rejects browser-selected game, player, and session scope;
- rejects query parameters on mutations;
- rejects non-empty mutation bodies.

## Authentication and HTTP handling

- requires `x-player-session-token`;
- rejects missing, expired, revoked, inactive, and wrong-game sessions through the authoritative request-scope boundary;
- rejects stock-market runner secrets;
- permits GET only on the collection;
- permits PUT and DELETE only on an item route;
- returns the shared error envelope;
- applies private no-store and vary response headers.

## Service behavior

- preserves deterministic newest-first watchlist order;
- applies one-row lookahead pagination;
- returns active assets in watchlist order;
- marks every returned asset `isWatchlisted: true`;
- computes latest volume and tick index without exposing persistence identifiers;
- returns the explicit empty state on an empty first page;
- rejects cross-game player, asset, entry, and tick records;
- rejects duplicate watchlist asset ownership rows;
- rejects duplicate public tickers;
- maps schema/read/write failures to retryable 503 responses;
- maps unavailable assets to a non-retryable 404.

## Repository behavior

- scopes watchlist rows by authenticated game and player UUID;
- orders by `created_at DESC, id DESC`;
- applies the exact requested range;
- batches active asset reads by internal IDs;
- uses one latest-tick RPC and filters it to the requested asset IDs;
- resolves mutation tickers only inside the authenticated game;
- requires an active asset for PUT;
- allows DELETE to resolve a same-game inactive asset for stale-row cleanup;
- treats unique-constraint conflict as idempotent `changed: false`;
- treats a zero-row delete as idempotent `changed: false`;
- detects duplicate ticker rows instead of selecting one arbitrarily;
- maps missing table/column/schema-cache errors to the schema-not-applied error.

## Migration and privilege gates

- migration filename is unique and forward-only;
- source validation passes;
- migrations replay from zero twice;
- rebuilt database lint passes;
- composite foreign keys enforce same-game player and asset scope;
- unique constraint enforces one row per player and asset;
- insert trigger requires active player and asset;
- forced RLS is enabled;
- browser roles receive no policy and no table privileges;
- service role receives only select, insert, and delete.

## Canonical verification

The checkpoint is not complete until all applicable current-head workflows are green:

- Backend Typecheck and all Edge graph checks;
- focused Market collection/detail/watchlist tests;
- canonical Backend smoke suite;
- Repository Quality;
- Admin API Check;
- Database Replay.
