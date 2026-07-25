# Full Financial Markets Target Architecture V1

**Authority:** PR #305 / `FULL_FINANCIAL_MARKETS_EXPANSION`  
**Starting main:** `6ced5aa36e60dfbd82620463f4f4bf6f56a349dd`  
**Architecture status:** `PROPOSED_FOR_CONTROLLER_AND_REVIEW`  
**Migration status:** none created; controller reservation required  
**Production authorization:** false

## Architectural decision

Implement a canonical multi-asset financial-market domain beside the bounded stock runtime. Preserve existing stock tables, RPCs, routes, and UI behavior as a compatibility subsystem. New instruments and workflows use canonical definitions and game-runtime tables. A compatibility adapter may project approved canonical common-equity listings into the existing stock board only when explicitly activated for a game.

This avoids an unsafe polymorphic expansion of stock-specific tables and maintains the accepted bounded beta pack unchanged.

## Layering

1. **Definition library** — immutable, versioned, inactive-by-default editorial records.
2. **Canonical reference registry** — normalized issuers, exchanges, sectors, industries, currencies, commodities, benchmarks, instruments, listings, funds, trusts, indexes, bonds, methodologies, and policies.
3. **Game activation** — explicit game-scoped release and listing activation records; deployment is not activation.
4. **Game market state** — quote, yield, NAV, index level, credit state, statement state, calendar state, and corporate-action state.
5. **Execution** — orders, reservations, fills, trades, fees, settlement, coupons, maturity, default, recovery, conversion, rebalance, and processors.
6. **Read models** — Player-safe and Admin-safe DTOs identified only by stable public IDs.
7. **Compatibility projections** — bounded stock board, stock Portfolio, stock watchlist, and existing stock routes.

## Public identity rules

All public IDs are immutable lowercase dot-delimited identifiers with a version suffix, maximum 160 characters, and a domain prefix.

Required examples:

- `issuer.northreach.corporate.0001.v1`;
- `exchange.northreach.fgx.v1`;
- `instrument.northreach.common_equity.0001.v1`;
- `listing.fgx.nreaa.v1`;
- `benchmark.northreach.broad_market.v1`;
- `fund.northreach.etf.0001.v1`;
- `bond.northreach.corporate.0001.v1`;
- `order.market.01h...`;
- `fill.market.01h...`.

Database UUIDs are internal foreign keys only. Public IDs must never be derived from UUID text and must never be accepted as authorization evidence without game/session resolution.

## Canonical reference entities

### Issuer

Fields:

- `issuer_public_id`;
- legal name;
- display name;
- issuer type;
- home country;
- reporting currency;
- sector and industry public IDs where applicable;
- risk profile;
- event-exposure profile version;
- source version/checksum;
- active/inactive definition status;
- created/updated audit metadata.

Issuer types:

- corporation;
- government;
- agency;
- fund administrator;
- trust administrator;
- index administrator;
- exchange operator;
- commodity benchmark administrator.

Issuer metadata is never duplicated as authoritative data on instrument rows.

### Exchange

Fields:

- `exchange_public_id`;
- stable code;
- display name;
- country;
- timezone;
- calendar policy version;
- trading-rule policy version;
- supported asset classes;
- active status.

### Sector and industry

Versioned normalized registries. Industries belong to one sector version. Instruments and issuers reference public IDs, not free-form labels. Historical records retain the version used at the time.

### Instrument

Fields:

- `instrument_public_id`;
- issuer public ID;
- asset class;
- instrument type;
- name;
- denomination currency;
- country;
- risk class;
- source version/checksum;
- definition status;
- activation authorized flag;
- effective/retired timestamps;
- type-specific contract reference.

Asset classes:

- equity;
- fixed_income;
- fund;
- trust;
- index;
- commodity_reference;
- economic_benchmark.

Instrument types initially supported:

- common_equity;
- preferred_equity;
- convertible_preferred;
- corporate_bond;
- sovereign_bond;
- agency_bond;
- etf;
- listed_fund;
- listed_trust;
- broad_market_index;
- country_index;
- sector_index;
- industry_index;
- commodity_benchmark;
- economic_reference_benchmark.

Unknown types fail closed.

### Listing

Separates instrument identity from exchange symbol.

Fields:

- `listing_public_id`;
- instrument public ID;
- exchange public ID;
- symbol;
- quotation currency;
- minimum quantity;
- quantity increment;
- price increment;
- trading status;
- settlement convention;
- effective dates;
- source version.

Uniqueness: symbol is unique per exchange and overlapping effective interval.

### Currency

Consumes the canonical game currency registry. No new currency authority is created. Market definitions reference versioned currency codes; runtime validates the game’s supported currencies.

### Commodity and benchmark

Commodity definitions contain unit, quotation currency, methodology, supply/demand drivers, country/event exposures, volatility bounds, and optional carrying/storage parameters. They represent reference prices only; no physical delivery.

Benchmark definitions distinguish tradable instruments from reference values. Index and commodity benchmark values cannot be placed into holdings unless a separate listed fund/instrument references them.

## Type-specific contracts

### Common equity

- shares outstanding;
- book value;
- dividend policy;
- voting class;
- issuer statement linkage.

### Preferred equity

- par/liquidation preference;
- dividend rate or amount policy;
- cumulative flag;
- arrears state;
- seniority;
- conversion policy reference when convertible.

### Convertible preferred

- conversion ratio;
- eligible date/state;
- target common instrument;
- conversion increment;
- unsupported complex pricing features disabled;
- exactly-once conversion operation.

### Bond

- issuer;
- bond kind: corporate, sovereign, agency;
- issue/settlement/maturity dates;
- face value;
- denomination currency;
- coupon type;
- coupon rate;
- coupon frequency;
- day-count convention;
- business-day convention;
- credit rating;
- callable flag only when an explicit call schedule exists;
- default/recovery contract;
- yield-curve/spread inputs.

### Coupon schedule

Generated deterministically from the approved bond contract and stored as versioned expected cash-flow rows. Payment processing writes an immutable execution row keyed by game, holding entitlement date, schedule row, recipient, and release version.

### Fund and ETF

- administrator;
- benchmark;
- holdings policy;
- rebalance schedule;
- expense ratio;
- NAV methodology;
- tracking-difference parameters;
- creation/redemption mechanics remain out of scope unless separately approved.

### Fund holding

- component instrument/benchmark public ID;
- target weight;
- effective interval;
- source/rebalance version;
- deterministic ordering.

No circular fund holdings unless a future explicit reviewed rule permits them.

### Listed trust

- administrator;
- trust asset-composition version;
- distribution policy;
- NAV methodology;
- index/commodity/property/business exposure references.

### Index

- administrator;
- methodology public ID/version;
- eligibility;
- weighting method;
- base date/value;
- divisor;
- constituent effective intervals;
- rebalance schedule;
- continuity/corporate-action rules.

## Issuer financial statements

Statements are game-scoped period records derived from deterministic approved seeds plus versioned macro/event inputs.

Required statement dimensions:

- period start/end;
- reporting currency;
- revenue;
- cost of revenue;
- operating expenses;
- operating income;
- interest;
- taxes;
- net income;
- cash;
- receivables;
- inventory;
- property/plant/equipment;
- other assets;
- short/long debt;
- payables;
- other liabilities;
- contributed capital;
- retained earnings;
- operating/investing/financing cash flow;
- capital expenditure;
- working capital;
- shares outstanding;
- book value;
- calculated credit metrics.

Generation invariants:

- assets equal liabilities plus equity within exact decimal tolerance;
- ending cash equals beginning cash plus cash-flow statement net change;
- retained earnings roll forward from prior period plus net income minus distributions;
- debt issuance/repayment reconciles balance sheet and financing cash flow;
- share count changes require a corporate action;
- bounded growth and margin changes;
- no uncontrolled compounding;
- reproducible from game, issuer, period, generator version, seed, and input-event digest.

## Market event exposure

World and Business systems publish versioned public events. The market domain persists only the consumed event envelope and its digest, then evaluates issuer/instrument/benchmark exposure rules.

No direct foreign key or query dependency on World/Business internal tables.

Exposure evaluation outputs immutable factor adjustments with:

- event public ID/version;
- target public ID;
- exposure rule version;
- adjustment type/value;
- start/end processor time;
- deterministic idempotency key;
- explanation metadata.

## Yield curves

Game-scoped curve definition:

- country;
- currency;
- observation time;
- curve version;
- tenor points;
- risk-free baseline;
- liquidity adjustment;
- event adjustment;
- source seed/input digest.

Interpolation: monotone piecewise linear in continuously compounded zero rates for initial scope. Extrapolation is bounded to the nearest approved slope and hard tenor/rate limits. Negative rates are unsupported unless a later policy explicitly enables them.

Issuer yield:

`risk-free zero rate + issuer credit spread + issue liquidity spread + event adjustment`

Curve recomputation is deterministic and append-only by version. Upgrades, downgrades, default, and recovery are immutable credit events.

## Quote and valuation state

A listing quote record contains:

- game;
- listing;
- quote version;
- timestamp;
- bid/ask/last/reference price where applicable;
- volume/liquidity state;
- stale-after timestamp;
- source processor version;
- input digest.

Instrument valuation is asset-class specific:

- equity: last/reference price;
- bond: clean price, accrued interest, dirty price, yield, duration where modeled;
- fund/trust: NAV and listing market price;
- index/benchmark: level/reference value, not a holding value unless wrapped by a tradable instrument;
- convertible: bounded intrinsic conversion information plus approved market quote; no unrestricted option model.

## Orders

Canonical order states:

- pending_validation;
- rejected;
- open;
- partially_filled;
- filled;
- cancel_pending;
- cancelled;
- expired.

Initial supported order types:

- market;
- limit.

Unsupported:

- stop;
- stop-limit;
- trailing;
- short;
- margin;
- options;
- futures;
- swaps;
- any derivative.

Order fields:

- public order ID;
- game/player/session internal scope;
- listing public/internal identity;
- side;
- type;
- original quantity;
- remaining quantity;
- cumulative filled quantity;
- limit price when required;
- average fill price;
- quote version and reviewed price;
- time-in-force policy;
- expiry;
- status/version;
- idempotency key and request digest;
- fee-policy version;
- created/updated/terminal timestamps.

## Reservations

Reservation kinds:

- cash;
- asset.

A buy order reserves maximum gross consideration plus maximum determinable fees. A sell order reserves owned available quantity. Short selling is rejected.

Reservation states:

- active;
- partially_consumed;
- consumed;
- released.

Invariants:

- one active reservation set per order;
- available cash equals balance minus active cash reservations;
- available quantity equals owned quantity minus active asset reservations;
- consumption and release are idempotent and version checked;
- cancellation/expiry/fill races lock the order and reservation rows in deterministic order;
- no negative available amount;
- release occurs exactly once.

## Fills, trades, and fees

A fill is an immutable execution event. A trade is the economic settlement record produced from a fill. One fill produces one trade and zero or more fee lines.

Before partial-fill authorization, an order may have zero or one full fill. After the reservation lifecycle passes adversarial tests, multiple fills are enabled with:

- cumulative quantity checks;
- weighted average price;
- proportional reservation consumption;
- proportional fees with deterministic final rounding adjustment;
- final remainder release on completion/cancellation/expiry.

Fee lines identify policy, calculation base, rate/fixed amount, currency, and ledger operation.

## Processor architecture

Protected processors:

- quote/tick;
- limit-order matching;
- order expiry;
- coupon entitlement and payment;
- maturity redemption;
- credit event/default/recovery;
- preferred dividend;
- conversion;
- fund/index/trust rebalance;
- statement generation;
- yield-curve recomputation.

Processor rules:

- exact game scope;
- bounded batch size;
- resumable cursor;
- deterministic ordering;
- lease/idempotency key;
- append-only execution history;
- no branch-mutating workflows;
- no production execution without explicit release authorization.

## Compatibility with bounded stock runtime

The existing stock engine and tables remain authoritative for the bounded beta market until a separate migration plan explicitly promotes canonical listings.

Compatibility adapter responsibilities:

- map an approved canonical common-equity definition to a stock template only through a versioned import release;
- preserve existing ticker/public route behavior;
- never copy all 3,200 definitions into the beta pack;
- never activate a definition merely because it exists;
- preserve existing stock Portfolio and order semantics until canonical routes are published;
- ensure bounded beta stock counts and digest remain unchanged.

## Player API design

Proposed additive route families, subject to shared-file controller approval:

- `GET /players/me/markets/instruments`;
- `GET /players/me/markets/instruments/{instrumentPublicId}`;
- `GET /players/me/markets/issuers/{issuerPublicId}`;
- `GET /players/me/markets/listings/{listingPublicId}`;
- `GET /players/me/markets/portfolio`;
- `GET /players/me/markets/orders`;
- `POST /players/me/markets/orders`;
- `POST /players/me/markets/orders/{orderPublicId}/cancel`;
- `GET /players/me/markets/orders/{orderPublicId}/fills`;
- `GET /players/me/markets/benchmarks/{benchmarkPublicId}`.

No UUID query parameters or payload fields.

## Admin API design

Proposed additive route families:

- issuer/instrument review;
- definition activation/deactivation;
- exchange and calendar policy;
- bond issuance;
- credit events;
- fund holdings and rebalance;
- index methodology and constituents;
- benchmark inputs;
- suspension/delisting;
- bounded correction commands;
- immutable audit history;
- emergency disable.

Corrections append superseding versions or compensating economic entries; they never update historical financial records in place.

## 3,200-definition ingestion

The committed `econovaria.market-universe.v1` library remains design-candidate and inactive.

Ingestion stages:

1. verify manifest and source checksums;
2. parse exactly 10 country JSONL sources;
3. enforce exactly 320 records per country and 3,200 total;
4. validate stable/public IDs, symbols, country, currency, exchange, issuer, type, asset class, and activation flag;
5. normalize issuer candidates into one master registry;
6. run duplicate, placeholder, inappropriate-text, concentration, and malformed-description review;
7. generate a deterministic editorial report and reviewed release manifest;
8. import definitions inactive into isolated staging only after migrations and controller approval;
9. activate only an explicitly approved synthetic subset.

## Migration plan boundary

No migration filenames are defined until Chat 1 reserves an exclusive range. The eventual migration series should be segmented by dependency and replay cost:

1. registries and public identity;
2. instruments/listings and activation;
3. issuers/statements/exposure;
4. bonds/coupons/credit/yield curves;
5. funds/trusts/indexes/benchmarks;
6. quotes/valuations;
7. orders/reservations/fills/trades/fees;
8. processors/audit/correction;
9. compatibility views/adapters;
10. performance indexes and forward corrections.

All migrations must replay from zero twice, lint, force RLS where appropriate, revoke browser mutation, and grant only reviewed service-role functions.

## Review gates before implementation

- controller authority registration;
- migration range reservation;
- shared-file collision policy;
- merge-position decision;
- review of this architecture;
- validation of the 3,200 definition library;
- explicit decision on compatibility projection timing;
- explicit authorization before partial fills;
- explicit staging release approval.
