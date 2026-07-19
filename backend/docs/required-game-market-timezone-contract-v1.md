# Required Game Market Timezone Contract v1

Status: implementation contract for PR #206

## Invariant

Every game has exactly one required IANA timezone stored at:

`game_settings.stock_market_window.timezone`

That one timezone governs the trading session of every Econovaria exchange. Exchange definitions may not store or override their own timezone.

## Creation and updates

- Create Game must require an explicit timezone selection.
- Staff signup and licensing activation must forward the selected timezone.
- Settings writes must reject a missing, blank, or invalid timezone.
- The server validates names using the IANA timezone registry.
- Browser and device timezone inference is prohibited.

## Existing games

The migration assigns `Asia/Seoul` once to existing games that have no timezone. This is a data migration, not a runtime fallback. Deployment must abort if any existing nonempty timezone is not recognized.

## Runtime

- The Backend database decision is authoritative.
- Market ticks, order execution, and Player dashboard status use the same game-scoped timezone decision.
- Every exchange follows the same configured game timezone.
- Missing or invalid runtime configuration fails closed.
- Timestamps remain authoritative UTC instants; the game timezone is used only to evaluate local session rules and presentation.

## Change policy

A timezone change is an audited game-settings change. It applies prospectively and must not rewrite historical ticks, fills, orders, ledger entries, or timestamps.

## Validation ratchet

CI must prove that exchange definitions contain no timezone field, one supplied game timezone governs every exchange, missing signup configuration is rejected before Auth creation, migration replay succeeds from zero, and the Create Game surface never infers the browser timezone.
