# Company, Market, and Commodity Framework

Status: active design framework  
Market scale decision: `decisions/adr-002-market-universe-scale.md`  
Production authorization: false

## Purpose

Define how fictional issuers, equities, bonds, funds, trusts, indexes, commodities, exchanges, financial profiles, and event exposures are created and validated for Econovaria.

## Market-universe goal

The authoritative long-term content target is **3,200 instrument definitions**, evenly distributed at **320 per country**.

Total allocation:

- 1,500 common equities;
- 100 preferred or convertible equities;
- 600 corporate bonds;
- 350 sovereign or public-agency bonds;
- 200 exchange-traded funds;
- 150 listed trusts;
- 150 indexes;
- 150 commodity or sector reference benchmarks.

The 3,200 records form a reusable content library. They are not intended to be simultaneously active in an ordinary game session.

Recommended first staging subset:

- approximately 20–30 visible instruments per country;
- approximately 200–300 instruments total;
- only financially calibrated instrument classes supported by authoritative backend capabilities.

## Market principles

The market must:

- represent all ten countries;
- provide meaningful country, sector, issuer, and instrument diversification;
- include stable, growth, cyclical, defensive, speculative, and distressed profiles;
- include equities and fixed income as distinct systems;
- respond to understandable economic and story drivers;
- avoid deterministic or guaranteed-return sequences;
- remain explainable to classroom players;
- preserve arithmetic integrity;
- separate reusable definitions from game-session prices, holdings, orders, and events;
- support bounded activation, pagination, filtering, and search.

## Reference registries

Every instrument must reference approved definitions for:

- country;
- currency;
- exchange;
- issuer;
- issuer type;
- instrument type;
- parent sector and subindustry;
- index or benchmark methodology where applicable;
- event-exposure vocabulary;
- runtime-support status.

Reference: `markets/issuer-exchange-and-reference-taxonomy-v1.md`.

## Issuer model

An issuer is separate from its securities.

One issuer may have:

- common equity;
- preferred or convertible equity;
- multiple bond issues;
- public-agency obligations;
- associated fund or trust administration roles.

Issuer definitions must not be duplicated for each security.

Every issuer must define:

- stable issuer ID;
- display and legal name;
- issuer type;
- country and headquarters location;
- primary and secondary sectors;
- description;
- products, services, or public mandate;
- revenue, funding, or taxation model;
- ownership and control;
- operating footprint;
- currencies;
- credit and leverage profile;
- associated securities;
- event sensitivities;
- institutions and characters;
- editorial and technical review status.

## Instrument-definition fields

Every market instrument must define:

- stable instrument ID;
- version;
- symbol;
- unique display name;
- instrument type;
- asset class;
- issuer or administrator;
- country;
- exchange or publication venue;
- denomination or calculation currency;
- sector and subindustry;
- short and long description;
- tradable or reference-only status;
- eligibility and activation rules;
- risk class;
- liquidity class;
- event sensitivities;
- story and Contract references;
- technical capability requirements;
- review status;
- deactivation and replacement behavior.

## Equity requirements

Every active equity additionally requires:

- shares outstanding;
- starting share price;
- market capitalization;
- revenue;
- operating income or margin;
- net income concept;
- debt;
- cash;
- growth rate;
- dividend policy;
- customer and geographic exposure;
- input and labor exposure;
- interest-rate and currency exposure;
- environmental, regulatory, and cyber exposure;
- volatility and liquidity assumptions;
- corporate-action support status.

Required arithmetic:

- market capitalization equals share price multiplied by shares outstanding;
- margins and income reconcile with revenue assumptions;
- dividends are supportable;
- leverage affects refinancing and interest-rate risk;
- growth, valuation, dividends, and risk are not simultaneously favorable without documented justification.

## Bond requirements

Every active bond additionally requires:

- issuer;
- bond type;
- denomination currency;
- seniority;
- face value;
- issue size;
- issue and maturity schedule;
- tenor;
- coupon type and rate;
- payment frequency;
- benchmark curve;
- spread;
- credit-grade band;
- callable, convertible, or secured status;
- default and recovery assumptions;
- price and yield behavior;
- event and rate sensitivities;
- maturity and payment idempotency rules.

The generated 3,200-instrument catalog currently contains candidate types, relative tenors, and credit bands only. Coupons, yields, dates, prices, and recovery values remain unapproved.

## Fund and trust requirements

Every active fund or trust requires:

- administrator;
- eligible universe;
- holdings or constituent list;
- weights;
- cash rule;
- fee or expense rule;
- rebalance policy;
- creation, redemption, or distribution treatment where supported;
- suspended and delisted constituent treatment;
- tracking or valuation methodology;
- event sensitivities;
- runtime support status.

No fund or trust can be activated as an empty shell.

## Index and benchmark requirements

Indexes and reference benchmarks are non-tradable by default.

Every index or benchmark requires:

- administrator;
- eligible universe or reference basket;
- methodology;
- weighting rule;
- constituent or input policy;
- base date and base level;
- calculation currency;
- publication cadence;
- correction policy;
- suspension and replacement behavior;
- use in country, market, event, and educational content;
- technical calculation status.

A tradable product may reference an index only when the product itself is separately supported.

## Country market directions

### Northreach

Primary depth:

- strategic minerals;
- natural gas and energy security;
- northern logistics;
- cold-region engineering;
- infrastructure and defense-adjacent services;
- public resource and infrastructure bonds.

### Yrethia

- shipping and ports;
- marine insurance;
- freight finance;
- customs technology;
- shipbuilding and repair;
- trade and port-infrastructure bonds.

### Thaloris

- repair and salvage;
- bonded warehousing;
- re-export trade;
- recycling and secondary materials;
- flexible logistics;
- higher-risk corporate credit.

### Solvend

- AI and software;
- aerospace and satellites;
- semiconductors;
- robotics;
- precision engineering;
- biotechnology and advanced materials;
- growth equities and research-linked bonds.

### Eldoran

- agriculture and food;
- wholesale distribution;
- rail and inland logistics;
- consumer staples;
- commodity market services;
- food-security and transport bonds.

### Valerion

- clean energy;
- hydropower and water;
- green finance;
- premium services;
- tourism and hospitality;
- sustainable infrastructure bonds and trusts.

### Lumenor

- education and training;
- media and information;
- professional services;
- civic technology;
- conference and research services;
- public-service and institutional bonds.

### Xalvoria

- banking and sovereign capital;
- infrastructure finance;
- construction and megaprojects;
- luxury and precision manufacturing;
- energy investment;
- project, sovereign, and financial-sector bonds.

### Dravenlok

- steel and metals;
- machinery;
- rail and vehicles;
- heavy logistics;
- industrial energy;
- state-enterprise and industrial bonds.

### Syndalis

- cybersecurity;
- fintech and payments;
- data centers;
- telecommunications and undersea networks;
- platform and market-data services;
- technology and infrastructure credit.

## Ticker and symbol rules

- unique across the full 3,200-instrument universe;
- stable after release except through a supported corporate action;
- not equal to a currency code;
- uppercase ASCII where possible;
- searchable and readable;
- not a direct real-company imitation;
- editorial resemblance review required.

## Sector and commodity framework

Parent sectors:

1. agriculture and food;
2. energy and utilities;
3. mining and materials;
4. industrial manufacturing;
5. defense and aerospace;
6. transport and logistics;
7. construction and infrastructure;
8. technology and software;
9. telecommunications and data;
10. cybersecurity and intelligence;
11. finance and banking;
12. insurance and risk;
13. healthcare and life sciences;
14. consumer and retail;
15. real estate and hospitality;
16. media and education;
17. professional and public services;
18. funds, indexes, and benchmarks.

Initial reference benchmarks include food, grain, fuel, natural gas, strategic minerals, steel, conductive metals, electronic components, construction inputs, shipping capacity, container rates, marine risk, water security, hydropower, compute, data transit, skilled labor, medicine inputs, clean-energy equipment, and reconstruction costs.

Each sector and benchmark requires stable IDs, descriptions, drivers, dependencies, country exposure, event exposure, units or calculation concepts, and technical status.

## Event-exposure model

Every active issuer and instrument must record directional sensitivity to relevant factors:

- growth;
- inflation;
- interest rates;
- domestic currency;
- energy prices;
- labor costs;
- trade volume;
- shipping costs;
- regulation;
- public confidence;
- country stability;
- infrastructure capacity;
- named event families.

Design vocabulary:

- strong negative;
- moderate negative;
- mild negative;
- neutral;
- mild positive;
- moderate positive;
- strong positive.

The simulation or runtime mapping may convert these classes to bounded coefficients.

## Corporate actions

The following remain blocked unless technical handling is explicitly supported:

- dividends;
- stock splits;
- mergers and acquisitions;
- delisting;
- bankruptcy;
- rights issues;
- buybacks;
- spin-offs;
- bond calls, conversions, restructurings, and defaults;
- fund creation and redemption.

Descriptive story content may reference a planned action, but active holdings and order behavior must not be implied without support.

## Market news standards

Market copy must:

- identify the material driver;
- distinguish company, sector, country, and systemic effects;
- distinguish confirmed fact, official claim, forecast, allegation, and correction;
- explain uncertainty;
- avoid guaranteed-return language;
- show opportunity and risk;
- avoid real-world investment-advice framing;
- use consistent instrument terminology.

## Validation gates

Before repository ingestion:

- deterministic counts and checksums;
- unique IDs, symbols, and names;
- valid countries, currencies, exchanges, issuers, sectors, and types;
- editorial review queue.

Before financial calibration:

- bounded active subset selected;
- issuer master records complete;
- required financial fields known;
- event-exposure mapping complete.

Before staging activation:

- equity and bond arithmetic passes;
- index and fund constituents validate;
- prices, coupons, yields, weights, and rates pass simulation;
- no riskless positive-carry path;
- all active instrument classes map to backend capability;
- pagination, search, filtering, rendering, unavailable states, and performance pass;
- import is idempotent and reversible;
- market fixtures pass.

## Immediate execution

1. ingest and reconcile the 3,200 generated definitions;
2. generate issuer master records;
3. map raw sector slugs to the parent taxonomy;
4. approve exchange and benchmark definitions;
5. select the bounded first active subset;
6. create complete equity, bond, index, fund, and trust profiles for that subset;
7. run real market simulations;
8. activate only validated records in isolated staging;
9. verify Admin and Player behavior;
10. rehearse deactivation and rollback.
