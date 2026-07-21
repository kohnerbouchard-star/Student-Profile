# Market Financial Enrichment Schema v1

Status: active design standard  
Applies first to: Northreach 24-instrument pilot  
Production authorization: false

## Purpose

Define the minimum financial, valuation, lifecycle, and exposure fields required before a market instrument can enter simulation or bounded staging review.

Generated names, symbols, risk labels, and sector assignments are not sufficient for activation. Every active-subset instrument must satisfy this schema or remain blocked.

## Shared instrument fields

Every enriched instrument requires:

- stable instrument ID;
- stable issuer or administrator ID;
- country;
- currency;
- exchange;
- instrument type;
- sector and subindustry;
- description;
- economic role;
- scenario availability;
- starting price or reference level;
- price precision;
- minimum trade unit if tradable;
- tradable or reference-only status;
- liquidity coefficient;
- volatility coefficient;
- trading or calculation status;
- suspension behavior;
- deactivation and retirement behavior;
- event-exposure profile;
- review status;
- technical capability status;
- activation authorization.

## Issuer fields

Every corporate, financial, public, fund, trust, exchange, or benchmark issuer requires:

- stable issuer ID;
- display name;
- issuer type;
- country;
- headquarters location ID;
- reporting currency;
- ownership classification;
- primary sector;
- secondary sectors;
- products or public function;
- customer or beneficiary base;
- revenue or funding drivers;
- cost drivers;
- major inputs;
- debt profile;
- cash or reserve profile;
- regulatory exposure;
- environmental exposure;
- cyber exposure;
- trade exposure;
- war exposure;
- active instrument IDs;
- financial-profile review status.

## Common equity

Required issuer financials:

- annual revenue;
- operating income;
- net income;
- cash;
- short-term debt;
- long-term debt;
- capital expenditure;
- free-cash-flow concept;
- growth rate;
- operating-margin trend;
- shares outstanding;
- dividend per share or explicit no-dividend policy.

Required instrument values:

- starting share price;
- market capitalization;
- earnings per share;
- price-to-earnings ratio when earnings are positive;
- price-to-sales ratio;
- dividend yield;
- book-value or asset-value reference where applicable;
- volatility class;
- liquidity class.

Arithmetic rules:

- `marketCapitalization = startingSharePrice × sharesOutstanding`;
- `earningsPerShare = netIncome ÷ sharesOutstanding`;
- `priceToEarnings = startingSharePrice ÷ earningsPerShare` when earnings are positive;
- `dividendYield = dividendPerShare ÷ startingSharePrice`;
- dividend cash requirement must not exceed a reviewed portion of earnings or free cash flow without an explicit special-distribution reason.

## Preferred and convertible securities

Required fields:

- issue price;
- liquidation preference;
- dividend or coupon rate;
- cumulative or non-cumulative status;
- conversion ratio;
- conversion trigger or window;
- callability;
- seniority;
- maturity if applicable;
- dilution treatment;
- conversion behavior when the underlying equity is suspended or retired.

No conversion mechanic may be activated until holdings and corporate-action support are authoritative.

## Corporate bonds

Required fields:

- face value;
- issue size;
- issue price;
- starting market price;
- coupon rate;
- payment cadence;
- issue date or scenario-relative issue stage;
- maturity date or scenario-relative maturity;
- tenor;
- seniority;
- secured or unsecured status;
- credit-quality band;
- yield to maturity;
- duration or approved interest-rate sensitivity;
- default probability band;
- recovery-rate band;
- callable, puttable, or convertible status;
- missed-payment behavior;
- restructuring behavior;
- maturity and principal-return behavior.

Arithmetic rules:

- coupon cash flow must equal face value multiplied by coupon rate and adjusted for payment cadence;
- yield and price must move in the correct inverse direction under rate shocks;
- maturity must return principal exactly once unless default or restructuring changes the outcome;
- repeated maturity processing must be idempotent.

## Sovereign and public-agency bonds

Additional required fields:

- sovereign or agency classification;
- tax or project revenue source;
- relationship to the national policy rate and yield curve;
- inflation exposure;
- currency credibility exposure;
- fiscal-capacity band;
- wartime financing sensitivity;
- restructuring and payment-interruption rules;
- government-support assumptions for agencies.

Sovereign securities must not be represented as risk-free. Their risk should remain lower or differently structured than most corporate debt, not nonexistent.

## Exchange-traded funds

Required fields:

- fund objective;
- eligible universe;
- constituent or holdings list;
- weighting method;
- rebalance frequency;
- cash allocation;
- expense ratio if modeled;
- starting NAV;
- starting market price if separately traded;
- creation/redemption support status;
- suspended-constituent treatment;
- tracking-error concept;
- concentration limits.

A fund may not contain a constituent that is unavailable to the active scenario unless the holding has an explicit inactive treatment.

## Listed trusts

Required fields:

- trust type;
- property or infrastructure assets;
- asset-location references;
- occupancy, utilization, or contracted-capacity assumptions;
- revenue model;
- operating-cost model;
- debt and refinancing profile;
- distributable-income policy;
- starting NAV;
- units outstanding;
- starting unit price;
- distribution yield;
- disaster, war, and route-disruption exposure.

## Indexes

Required fields:

- index objective;
- eligible universe;
- constituent list;
- weighting method;
- base date or scenario starting stage;
- base level;
- divisor or normalized calculation method;
- rebalance schedule;
- constituent addition and removal rules;
- suspended-security treatment;
- retired-security treatment;
- correction policy;
- publication cadence;
- tradable status, normally false.

Index calculations must be reproducible from committed constituents and methodology.

## Commodity and sector benchmarks

Required fields:

- benchmark subject;
- unit;
- geographic scope;
- source or calculation concept;
- starting reference level;
- publication cadence;
- supply drivers;
- demand drivers;
- storage or capacity constraints;
- transport sensitivity;
- substitution sensitivity;
- event exposures;
- correction policy;
- tradable status, normally false.

A reference benchmark must not silently behave as a futures or spot-trading product.

## Event exposure fields

Each enriched instrument requires bounded directional exposure to:

- domestic growth;
- global growth;
- inflation;
- domestic policy rates;
- long-term yields;
- domestic currency strength;
- energy prices;
- food prices;
- strategic mineral prices;
- labor costs;
- trade volume;
- shipping costs;
- infrastructure availability;
- regulation;
- public confidence;
- country stability;
- cyber disruption;
- war escalation;
- ceasefire;
- reconstruction.

Allowed design values:

- strong negative;
- moderate negative;
- mild negative;
- neutral;
- mild positive;
- moderate positive;
- strong positive.

The simulation layer may map these classes to reviewed numeric coefficients. Content authors must not invent unrestricted formulas per instrument.

## Candidate-value status

Financial values move through:

1. `not-started`;
2. `candidate-uncalibrated`;
3. `arithmetic-validated`;
4. `simulation-tested`;
5. `reviewed`;
6. `staging-candidate`;
7. `approved`.

Only `staging-candidate` or `approved` records may be considered for activation, and activation still requires authoritative backend support.

## Required validations

Before simulation:

- required fields present;
- IDs and references valid;
- arithmetic identities pass;
- values within authoring bands;
- no impossible dividend, coupon, or valuation relationship;
- event-exposure fields complete;
- reference-only instruments marked non-tradable.

Before staging:

- multi-seed simulation complete;
- concentration and exploit tests pass;
- issuer and instrument values agree;
- market, Player, and Admin capability mapping complete;
- importer and rollback tests pass;
- responsive and accessibility verification planned.

## Northreach pilot order

Enrich in this order:

1. Boreal Energy common equity;
2. Kestrel Consumer Staples common equity and corporate note together;
3. Northreach Treasury 1-year and 3-year bonds as the initial sovereign curve;
4. Northreach Composite Index;
5. Northreach Broad Market Fund;
6. Northreach Logistics Facilities Trust;
7. the remaining selected Northreach instruments.

This order tests shared issuers, equity and debt consistency, yield-curve relationships, index methodology, fund holdings, and location-dependent infrastructure exposure before scaling to the other nine countries.
