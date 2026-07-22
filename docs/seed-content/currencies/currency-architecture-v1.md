# Econovaria Currency Architecture v1

Status: architecture decision draft
Owner domain: economic system and ledger integration
Implementation status: current behavior audited; reconciliation required before final seed values

## Purpose

Define the roles of ECO and the ten local country currencies across Attendance, Contracts, Store, stock trading, player cash accounts, exchange rates, pricing, and seeded content.

## Current authoritative currency records

The `currencies` table and final cleanup migration define ten official country currencies:

- NRC — Northreach Credit
- YRC — Yrethian Crown
- THD — Thaloris Dinar
- SLV — Solvend Volt
- ELD — Eldoran Ducat
- VAL — Valerion Lira
- LUM — Lumenor Mark
- SYN — Syndalis Note
- XAL — Xalvorian Lira
- DRV — Dravenlok Vek

Codes are stable backend identifiers. Names are player-facing. `symbol_key` points to the frontend SVG symbol asset, and `symbol` is a fallback label.

## ECO current behavior

ECO is not one of the ten official country currency records.

However, the stock-market foundation uses ECO as:

- the cash account currency for stock purchases;
- the debit currency for buy orders;
- the credit currency for sell orders;
- the unit used by stock base prices and current prices.

Therefore ECO currently functions as a global player market-settlement and accounting currency even though the original multi-currency migration stated that there was no universal ECO currency.

This is an architectural conflict in comments and conceptual ownership, not necessarily a runtime error. The final product model must resolve it explicitly.

## Proposed canonical roles

### ECO

Recommended role:

- global player settlement currency;
- stock-market quotation currency;
- optional global accounting and comparison unit;
- optional base reward unit for systems that intentionally convert into local currency.

ECO should not be presented as the official national currency of any country.

### Local country currencies

Recommended role:

- country identity;
- local player cash account;
- country-specific Store settlement;
- local Contract rewards where explicitly configured;
- Attendance rewards in player-country mode;
- local purchasing-power and exchange-rate gameplay;
- country economic and currency-stability events.

## Player account model

The existing ledger and stock systems imply that a player may need multiple cash accounts by currency.

Recommended conceptual model:

- one ECO cash account where global settlement is required;
- one or more local currency cash accounts created through authoritative game and country assignment behavior;
- account uniqueness by player, account type, currency, and other current ledger constraints;
- transfers or conversions only through an authoritative transaction path;
- no browser-submitted player UUID or account ownership selector.

The exact account-creation and transfer contracts require a separate ledger audit.

## Current Attendance behavior

Attendance settings currently support:

- `fixed` currency mode;
- `player_country` mode;
- `fixed_fallback` mode;
- optional `difficulty_income_modifier` application.

In player-country mode:

- base amount comes from the Attendance window;
- base currency defaults to ECO when missing;
- difficulty income modifier may apply;
- latest country snapshot `exchange_rate_index` is multiplied directly into the reward;
- result is rounded to two decimals;
- resulting currency is the player country’s currency code.

Current formula:

`effective reward = round(base reward × income modifier × exchange-rate index, 2)`

## Current Contract reward behavior

Contract reward definitions contain:

- amount;
- account type;
- explicit reward currency code.

At approval:

- the reward is recorded to the player’s ledger account in the configured currency;
- no currency conversion is performed by the reward service;
- replay-safe reference keys and database safeguards prevent duplicate issuance;
- reward issuance is skipped when no amount or currency exists.

Therefore Contract reward content must select its payout currency intentionally.

## Current Store behavior

Store items are authored with:

- item price;
- item currency code.

A Store quote:

1. derives the player’s current country and currency;
2. applies price, inflation, regional, scarcity, and difficulty multipliers;
3. computes the item-local unit and total price;
4. calls `convert_currency_amount` from item currency to player currency;
5. stores the exchange rate and both local and player totals;
6. expires after three minutes;
7. settles the purchase by debiting the player’s cash account in the quoted player currency.

Store quote and purchase behavior is the strongest current multi-currency reference implementation.

## Current stock behavior

- all seeded stock base prices are in ECO;
- player stock buys debit ECO cash;
- player stock sells credit ECO cash;
- current market and portfolio values are therefore ECO-denominated.

## Exchange-rate pair model

`currency_exchange_rates` stores session-scoped:

- from currency;
- to currency;
- rate;
- effective timestamp;
- optional expiry;
- source.

`convert_currency_amount`:

- returns the same amount rounded to two decimals for same-currency conversion;
- uses the latest active direct pair and multiplies;
- otherwise uses the latest active inverse pair and divides;
- rounds to two decimals;
- fails with `EXCHANGE_RATE_NOT_FOUND` when no valid pair exists.

## Exchange-rate index versus transaction rate

The country snapshot `exchange_rate_index` and the pair-based `currency_exchange_rates.rate` currently serve different structural roles:

### Exchange-rate index

- one normalized macro field per country snapshot;
- bounded from 0.5 to 2.0;
- useful for country condition, stability, and event effects;
- currently used directly by Attendance player-country conversion.

### Pair rate

- specific from-currency to to-currency conversion;
- session scoped;
- timestamped and expirable;
- direct or inverse;
- used by Store quote conversion.

## Required architecture decision

Choose one of the following:

### Option A: Pair rates are authoritative for all transactions

Recommended.

- ECO-to-local Attendance reward uses `convert_currency_amount` or an equivalent authoritative pair lookup.
- exchange-rate index remains a macro signal used to generate or influence pair rates.
- all transactions record pair rate and source.
- Store remains the reference pattern.

Benefits:

- explicit currency direction;
- supports local-to-local conversion;
- consistent direct and inverse handling;
- timestamped quote and replay evidence;
- avoids interpreting a normalized index as a universal rate.

Costs:

- Attendance integration change;
- exchange-rate generation and completeness requirement;
- additional transaction snapshot fields may be needed.

### Option B: Exchange-rate index is authoritative ECO-to-local rate

Possible but restrictive.

- define index exactly as local currency units per one ECO;
- Attendance behavior becomes canonical;
- pair rates must be derived consistently from country indexes;
- local-to-local conversions use ratios of indexes or synchronized pair rows.

Benefits:

- simpler country macro control;
- aligns with current Attendance formula.

Costs:

- current index name and bounds may be semantically misleading;
- every transaction depends on one country snapshot;
- pair-rate and index drift risk;
- harder to support explicit market or bilateral rates.

### Option C: Separate gameplay index and transaction rate intentionally

- index affects country economics and price multipliers;
- pair rates independently determine conversion;
- no assumption that one derives directly from the other.

Benefits:

- flexible simulation.

Costs:

- harder to explain;
- requires clear UI distinction;
- can produce apparent contradiction between currency strength and quoted rate.

## Recommended production decision

Use Option A:

- explicit pair rates are authoritative for monetary conversion;
- exchange-rate index remains a macroeconomic state used to influence rate generation and country effects;
- every converted transaction records source currency, destination currency, rate, source, effective time or quote, and rounded result;
- ECO is formally documented as global settlement currency rather than a national currency.

This is a recommendation, not an implementation change in the documentation branch.

## Seed-content rules

### Contracts

Every cash reward must define:

- reward currency;
- whether payout is global ECO or local currency;
- reason for that currency;
- no hidden conversion unless the authoritative payout path records it;
- display and settlement copy.

Recommended patterns:

- global or international Contract: ECO;
- country institution Contract: local currency;
- cross-country chain: ECO or declared local reward by country, but never ambiguous.

### Store

Every item must define:

- authoring currency;
- price rationale;
- country visibility;
- whether all players may buy through quote conversion;
- whether availability is restricted independently of currency;
- target acquisition time after local conversion.

### Attendance

Every Attendance window must define:

- base amount;
- base currency;
- currency mode;
- fallback currency;
- whether difficulty income modifier applies;
- quoted or conversion evidence where conversion occurs.

### Stocks

- stock templates and prices remain ECO-denominated unless the stock-market architecture is deliberately expanded;
- local currency does not directly buy a stock without an authoritative conversion or transfer into ECO;
- no UI should imply that local balances and ECO balances are the same account.

### Banking

Future bank products must define their currency. Interest, repayment, fees, and default all remain within that currency unless a separate conversion transaction occurs.

## Rounding and precision

Current transaction conversions round to two decimals.

Production policy should preserve:

- currency-specific decimal places from `currencies.decimal_places` where supported;
- quote-time final values;
- no repeated round-trip conversion during one transaction;
- no client-side authoritative rounding;
- ledger amounts equal the settled quoted amounts.

If all current currencies remain two-decimal currencies, the content catalog may use two decimals, but it should not hard-code that assumption permanently.

## Missing-rate behavior

Current Store conversion fails closed when no rate exists.

Recommended across systems:

- no silent 1:1 fallback;
- no use of another session’s rate;
- no client-computed fallback;
- fixed-fallback Attendance mode may use an explicitly configured fallback currency without conversion;
- Player copy explains that conversion is unavailable and preserves the unprocessed action.

## Currency event content

Country currency events may affect:

- exchange-rate index;
- currency-stability index;
- current or future pair rates through an authoritative rate-generation process;
- import and export effects;
- company country exposure;
- Store converted affordability;
- player perception and news.

An event definition must not update both index and pair rates independently without a single documented rule, or the two systems may drift.

## Migration and canon conflict note

The earliest multi-currency migration states “No universal ECO currency.” Later stock migrations and services use ECO as an authoritative player cash currency.

Required cleanup before production-grade currency release:

- update architectural documentation;
- determine whether ECO belongs in the `currencies` registry or a separate settlement-unit registry;
- confirm foreign-key and validation expectations across ledger accounts;
- remove contradictory product copy;
- preserve historical migrations rather than rewriting applied history.

## Validation requirements

- all official local codes match country profiles and frontend assets;
- ECO role explicitly documented;
- every transaction currency exists in the authoritative accepted-code system;
- conversion direction and rate source recorded;
- direct and inverse calculations reconcile;
- missing-rate behavior fails closed;
- Attendance, Contract, Store, stock, and banking tests agree;
- no duplicate ledger effect on retries;
- player cannot select another player’s country or account;
- quote and transaction values are auditable;
- difficulty and currency conversion are shown as separate modifiers.

## Blocking decisions

1. Approve ECO as global settlement unit and decide its registry owner.
2. Approve pair rates or exchange-rate index as the authoritative transaction rate.
3. Align Attendance with the approved rule.
4. Audit local-to-ECO transfer or conversion behavior for stock access.
5. Confirm Contract reward authoring policy.
6. Define bank-product currency policy.
7. Define session initialization of complete exchange-rate pairs.

## Review status

- economic review: changes required until decisions approved
- technical review: changes required
- gameplay review: terminology and UI distinction required
- narrative review: local and global currency roles coherent at content level