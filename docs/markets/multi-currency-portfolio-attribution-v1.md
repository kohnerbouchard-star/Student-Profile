# Multi-Currency Portfolio Attribution v1

Status: controller hold; isolated Financial Markets domain work only.

## Scope

This tranche adds deterministic portfolio attribution across quotation currencies without activating foreign-exchange trading or publishing shared runtime routes.

The model:

- converts starting value, ending value, and cash flow into a caller-selected base currency;
- separates local-market contribution from currency contribution;
- reconciles every position directly against base-currency value change;
- reconciles the complete portfolio against aggregate starting value, ending value, and cash flow;
- aggregates contribution by currency, country, and asset class;
- rejects duplicate instruments, malformed currencies, negative values, and non-positive exchange rates;
- remains deterministic and activation-disabled.

## Boundary

This tranche does not:

- create an FX market;
- enable currency speculation;
- consume real-world exchange-rate feeds;
- add migrations;
- modify Seed instrument definitions;
- publish Player or Admin routes;
- modify capability or rate-limit registries;
- deploy staging or production.

The eventual integration layer must supply authoritative game-scoped rates and timestamps through the canonical game clock and economic exchange-index authority.
