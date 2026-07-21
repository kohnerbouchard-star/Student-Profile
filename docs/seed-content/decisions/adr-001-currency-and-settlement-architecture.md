# ADR-001: Currency and Settlement Architecture

Status: accepted for seeded-content authoring; runtime implementation pending
Decision date: 2026-07-18
Owner domains: economic system, ledger integration, content architecture
Supersedes: no prior accepted seed-content decision

## Decision

Econovaria will use a two-layer currency model.

1. `ECO` is the global settlement and comparison unit used for the stock market, global contracts, cross-country accounting, and other explicitly international transactions.
2. The ten national currencies remain the official local currencies used for country identity, local balances, local prices, local rewards, and purchasing-power gameplay.
3. Explicit session-scoped currency-pair rates are authoritative for monetary conversion.
4. A country snapshot's `exchange_rate_index` remains a macroeconomic indicator. It may influence rate generation, confidence, imports, exports, or event effects, but it is not itself a universal transaction rate.
5. Every monetary operation must declare the currency in which it is authored and the currency in which it settles.

This decision is authoritative for content authoring. It does not authorize a database migration, ledger change, Attendance change, backend route, or production deployment.

## Context

The current repository contains ten official country currencies. The stock-market foundation nevertheless uses ECO-denominated prices and ECO player cash accounts. Store purchases use explicit pair conversion and preserve quote evidence. Attendance player-country conversion currently multiplies by the country snapshot exchange-rate index. Contract rewards issue directly in their configured currency.

Without a product decision, seeded content could produce contradictory values, implied 1:1 conversions, ambiguous balances, and unauditable rewards.

## Canonical currency roles

### ECO

ECO is:

- a global settlement unit;
- the stock-market quotation and settlement currency;
- the preferred currency for global and multilateral contracts;
- a comparison unit for cross-country analytics;
- a possible base unit for an explicitly quoted conversion into local currency.

ECO is not:

- the national currency of any country;
- an automatic replacement for local currencies;
- a hidden 1:1 equivalent of any local currency;
- permission to combine ECO and local balances in one displayed total without conversion evidence.

### Local currencies

The official national currencies are:

- NRC — Northreach Credit;
- YRC — Yrethian Crown;
- THD — Thaloris Dinar;
- SLV — Solvend Volt;
- ELD — Eldoran Ducat;
- VAL — Valerion Lira;
- LUM — Lumenor Mark;
- XAL — Xalvorian Lira;
- DRV — Dravenlok Vek;
- SYN — Syndalis Note.

Local currencies are used for:

- country-specific rewards;
- locally authored Store prices;
- local banking products;
- local income and spending;
- purchasing-power effects;
- national currency news and events;
- country-specific financial identity.

## Transaction-rate rule

A conversion is valid only when an authoritative transaction path records or derives:

- source currency;
- destination currency;
- source amount;
- direct or inverse pair rate;
- rate source;
- effective timestamp or quote identifier;
- rounding rule;
- settled destination amount;
- game-session scope;
- idempotency or durable transaction reference.

A missing currency pair fails closed. There is no silent 1:1 fallback.

## Exchange-rate index rule

The country `exchange_rate_index` is a normalized macroeconomic state variable.

It may be used to:

- describe relative currency strength or pressure;
- influence import and export conditions;
- contribute to generation of session pair rates;
- affect company exposure and country confidence;
- trigger or describe currency events.

It must not be used as a transaction rate unless a future approved architecture explicitly defines its direction, base currency, timestamp, and conversion semantics.

## Authoring rules by domain

### Attendance

Attendance content declares:

- base amount;
- base currency;
- settlement mode;
- whether difficulty income modification applies;
- fallback behavior;
- whether conversion evidence is required.

Recommended initial modes:

- `fixed`: issue the configured currency without conversion;
- `player_country_quoted`: quote the configured base amount into the player's country currency using an authoritative pair rate;
- `fixed_fallback`: issue the declared fallback currency when no pair exists.

The current exchange-rate-index multiplication is treated as a compatibility behavior, not the desired production authoring rule.

### Contracts

Each Contract reward declares one of:

- global ECO payout;
- fixed local-currency payout;
- country-relative local payout generated per assignment;
- non-cash reward.

No Contract description may imply conversion unless the payout path records the quote and settlement.

### Store

Each Store item declares:

- authoring currency;
- base price;
- availability rules;
- whether players outside the authoring country may receive a converted quote;
- quote expiry;
- settlement currency;
- affordability target.

Store's explicit pair-rate quote model is the reference transaction pattern.

### Stocks

- Stock templates and market values remain ECO-denominated for the first production content pack.
- Buying stock requires ECO cash.
- Local cash is not silently treated as ECO.
- Any local-to-ECO conversion is a separate authoritative transaction.

### Banking

Every banking product is single-currency unless it explicitly defines a conversion transaction.

Interest, fees, repayment, default, and collateral values remain in the product currency.

## Display rules

Player and Admin surfaces must show:

- amount;
- currency code and SVG symbol;
- converted amount when relevant;
- source and destination currencies;
- quoted rate or accessible rate explanation;
- quote expiry when applicable;
- separate ECO and local balances.

A combined net-worth value may be shown only with a declared valuation currency and timestamp.

## Rounding

- Authoritative settlement performs rounding.
- Seeded concepts default to two-decimal examples because current currencies use two-decimal display behavior.
- The manifest must preserve currency decimal metadata rather than hard-code two decimals permanently.
- A transaction must not repeatedly convert and round through intermediate currencies unless that path is an intentional gameplay action.

## Initialization requirements

A session intended to support conversion must initialize a complete, validated conversion graph for all currencies required by enabled content.

At minimum, the graph must support:

- ECO to every enabled local currency;
- every enabled local currency to ECO, directly or through verified inverse lookup;
- all Store item-to-player currency combinations that can be offered;
- deterministic test fixtures for direct, inverse, expired, and missing rates.

## Content validation

A content pack fails validation when:

- a monetary amount lacks a currency;
- an unsupported currency code is used;
- an item or reward requires a pair absent from the declared session-rate graph;
- ECO is described as a national currency;
- local and ECO balances are combined without a valuation rule;
- a conversion lacks a rate source or settlement snapshot;
- a client-side calculation is treated as authoritative;
- retry behavior can issue a duplicate ledger effect.

## Consequences

### Positive

- Stock, Store, Attendance, Contracts, and future banking can share one explainable model.
- Currency events can affect both macro conditions and transaction rates without conflating them.
- Player balances remain auditable.
- Local currencies retain meaningful gameplay value.

### Costs

- Attendance requires reconciliation with pair-rate conversion.
- ECO needs an explicit registry and validation owner.
- Session initialization must ensure pair coverage.
- Player UI must distinguish multiple balances.
- Cross-currency analytics require timestamped valuation.

## Runtime blockers

Before production implementation:

1. Decide whether ECO belongs in the existing currency registry or a settlement-unit registry.
2. Reconcile Attendance conversion with the pair-rate model.
3. Verify local and ECO account creation and ownership rules.
4. Define local-to-ECO conversion for stock access.
5. Verify Contract assignment-time generation of country-relative rewards.
6. Add cross-domain integration tests.
7. Preserve historical migrations instead of rewriting applied history.

## Approval state

- content architecture: accepted;
- narrative coherence: accepted;
- economic implementation: pending simulation and ledger review;
- backend implementation: not authorized;
- production use: blocked.