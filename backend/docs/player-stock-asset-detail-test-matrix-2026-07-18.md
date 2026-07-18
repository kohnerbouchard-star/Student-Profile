# Player Stock Asset Detail Test Matrix

Date: 2026-07-18
Target PR: #158

## Route and request coverage

- collection and ticker detail paths;
- lowercase ticker normalization;
- bounded ticker punctuation;
- internal UUID, encoded slash, and extra-segment rejection;
- default history limit of 200;
- minimum 1 and maximum 500;
- duplicate, fractional, empty, zero, excessive, and unsupported query rejection;
- client-provided game scope rejection.

## Session and HTTP coverage

- player and game scope derived from `x-player-session-token`;
- missing or invalid session rejection through the authoritative request-scope module;
- stock runner credential rejection;
- non-GET method rejection;
- private no-store cache policy;
- shared nested error response shape.

## Repository coverage

- active asset lookup by game and normalized ticker;
- two-row lookup bound to detect duplicate active ticker rows;
- no history query when an asset is unavailable;
- history filters for game, resolved internal asset row, and ticker;
- newest-first persistence ordering and database-level history bound;
- strict UUID, ticker, country, numeric, volume, tick, and timestamp parsing;
- separate schema-missing and generic read failures.

## Service coverage

- cross-game asset and history rejection;
- internal asset mismatch rejection;
- ticker mismatch rejection;
- duplicate tick-index rejection;
- ascending chart order;
- newest point used for response tick and displayed volume;
- safe 404 for an unavailable ticker;
- retryable 503 for persistence failure.

## Browser privacy coverage

Serialized responses must not contain game, player, player-session, or internal stock-asset UUIDs. The browser-facing `assetId` remains the public ticker.

## Completion gates

The tests are registered in `npm --prefix backend run test:player-market-assets`, which runs inside the canonical Backend smoke command. Completion requires focused Market tests, Backend typechecks, Edge graph checks, Backend smoke, Repository Quality, Backend-only diff scope, and zero commits behind `main`.
