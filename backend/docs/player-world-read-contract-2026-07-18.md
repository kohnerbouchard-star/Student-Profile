# Player World Read Contract

Date: 2026-07-18  
Pull request: #158  
Status: Backend implementation contract; no production deployment authorized

## Authentication and ownership

All World routes require `x-player-session-token` and resolve player and game scope through the authoritative active player session.

The browser must not provide:

- player UUID;
- player-session UUID;
- game UUID or game-session selector;
- country-profile UUID;
- country-assignment UUID;
- owner or recipient UUID.

Requests containing ownership-selection fields in query parameters or headers fail closed.

## Routes

### `GET /players/me/world/countries`

Returns active countries that have an authoritative economic snapshot in the authenticated game.

Response fields:

- `ok`;
- `generatedAt`;
- `availability`;
- `items[]` containing:
  - public `id` and `countryCode`;
  - `countryName`;
  - `capitalName`;
  - `currencyCode`;
  - safe `flagUrl`;
  - bounded map region and color;
  - `availability`;
  - `isPlayerCountry`;
  - browser-safe economic summary.

No database UUID is returned.

### `GET /players/me/world/countries/:countryId`

`countryId` is the public country code, not a database UUID.

The country must:

- be active;
- have an effective snapshot in the authenticated game;
- be visible through the player World contract.

A hidden, disabled, archived, unknown, or cross-game country returns the same not-found contract and does not disclose internal existence.

### `GET /players/me/world/news`

Supported query parameters:

- `limit`: integer from 1 through 50; default 25;
- `category`: one allowlisted public news category;
- `cursor`: opaque versioned cursor returned by the previous page.

Ordering is deterministic:

1. `created_tick DESC`;
2. public event identifier `DESC`.

Only records matching all of the following are returned:

- authenticated game;
- `visibility = public`;
- `is_active = true`;
- optional allowlisted category.

Each item contains:

- public event `id`;
- category, sentiment, source, scope, and optional target key;
- headline and explanation;
- bounded impact data;
- created and expiry ticks;
- explicit `publishedAt` and `updatedAt` timestamps;
- safe optional image URL.

No event database UUID is returned.

## Empty and unavailable behavior

A valid game with no public news returns:

```json
{
  "ok": true,
  "availability": "available",
  "items": [],
  "page": {
    "returned": 0,
    "nextCursor": null
  }
}
```

A persistence or schema availability failure returns a retryable service error. It is not represented as an empty feed and is not converted to fabricated zero data.

## Safe media

Media values are accepted only when they are:

- a bounded relative application path; or
- an absolute `https:` URL.

Unsafe schemes and malformed values are omitted.

## Fail-closed rules

- Unsupported query parameters are rejected.
- Invalid country codes are rejected before repository access.
- The request never guesses a game, player, country-profile, or event UUID.
- Repository results are checked against authenticated game and player scope before DTO mapping.
- Cross-game repository rows fail closed.
- Browser DTO tests reject UUID-shaped values.

## Deferred domains

This contract does not implement:

- Market assets or history;
- stock watchlists;
- Inventory;
- notifications;
- logout;
- capability manifest;
- Contract acceptance;
- Inventory redemption.

The next bounded tranche is Market asset list, asset detail/history, and stock watchlists.
