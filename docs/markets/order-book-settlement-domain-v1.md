# Financial-Instrument Order Book and Settlement Domain v1

## Status

Permanent pure-domain design under PR #305 controller hold. This document defines no schema, route, capability, rate-limit, registry, deployment, activation, or release-train change.

## Boundary

Financial-instrument orders, reservations, matches, and delivery-versus-payment settlement are a separate bounded domain from Marketplace physical-item listings and settlement.

The financial-markets domain:

- references financial instrument, listing, player, reservation, order, match, trade, and settlement identities;
- transfers quotation-currency amounts and financial-instrument quantities only;
- never transfers inventory items, crafting materials, equipment, physical commodities, Marketplace listings, or Marketplace disputes;
- exposes no Marketplace adapter and publishes no shared router or capability while the controller hold remains active;
- keeps `marketplacePhysicalItemSettlementSupported` and physical-item transfer effects permanently `false` in this tranche.

## Deterministic order-book policy

The isolated order book implements bounded price-time priority for limit orders.

- Bids sort by descending limit price, then submission time, sequence, and public ID.
- Asks sort by ascending limit price, then submission time, sequence, and public ID.
- Execution uses the resting maker order's limit price.
- Input ordering does not affect the snapshot, matches, or digest.
- Expired orders are excluded deterministically.
- Duplicate order and reservation identities fail closed.
- Self-trades are blocked while unrelated eligible liquidity remains matchable.
- Orders must belong to exactly one listing, instrument, and quotation currency.

Partial fills remain disabled. A match requires equal whole-order quantities; an unequal higher-priority order is not partially consumed. Short selling and market-order price discovery remain outside this pure-domain tranche.

## Delivery-versus-payment settlement policy

A financial-instrument match produces a settlement instruction with two reservation legs:

1. buyer quotation-currency cash, including buyer fees;
2. seller financial-instrument quantity.

Settlement becomes ready only when both legs are active. The delivery-versus-payment transition atomically describes:

- buyer cash debit;
- seller cash credit net of seller fees;
- seller financial-instrument debit;
- buyer financial-instrument credit;
- fee credit.

The reducer does not mutate a ledger, holding, database, queue, or external service. It produces deterministic effects for eventual controller-authorized integration.

Settlement is whole-instruction only. Partial settlement is disabled. Failed unsettled instructions release only reservation legs that were active. Expected aggregate versions, unique transition keys, monotonic timestamps, exact reservation amounts, and terminal-state rules prevent stale writers, duplicate execution, replay abuse, and double release.

## Activation and integration hold

The 3,200-instrument definition library remains inactive. No settlement object in this tranche authorizes trading, persistence, staging, production, or universe activation.

Future integration requires explicit Chat 1 authorization for migration ownership, merge position, shared-file collision rules, capability publication, route registration, rate-limit integration, isolated staging, and final go/no-go approval.
