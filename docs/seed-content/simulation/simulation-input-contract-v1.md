# Economic and Market Simulation Input Contract v1

Status: design candidate  
Executable simulation: not implemented  
Production authorization: false

## Purpose

Define the exact input families required before Econovaria balance, market, progression, banking, arrival-package, and wartime values can be validated by a real simulation.

This document does not contain simulation results.

## Reproducibility requirements

Every simulation run must record:

- simulation version;
- source commit;
- input-pack version;
- input checksums;
- random seed;
- run count;
- player count;
- scenario profile;
- difficulty profile;
- country distribution;
- start and end conditions;
- software and dependency versions;
- exact run command;
- raw-output paths;
- generated-summary path;
- execution timestamp.

A result without committed code, committed inputs, raw outputs, and an exact command is not accepted as evidence.

## Input families

### Countries and currencies

- country IDs;
- local currency codes;
- starting exchange rates;
- volatility bands;
- inflation and interest-rate bands;
- unemployment and wage bands;
- production and import exposure;
- logistics and stability indicators;
- country-specific shock sensitivities.

### Arrival packages

- starting-cash bands;
- starting debt or obligation bands;
- housing-cost bands;
- ordinary-expense bands;
- time or actions to first income;
- skill and credential tags;
- first Contract availability;
- emergency support rules;
- class-system modifiers after Workstream 11.

### Contracts

- reward amounts;
- duration and deadline;
- probability of success or approval assumptions;
- review delays;
- prerequisites;
- repeatability;
- chain dependencies;
- failure and recovery behavior;
- country and class availability.

### Store and inventory

- item prices;
- purchase limits;
- restock rules;
- effect class;
- acquisition-time targets;
- redemption timing;
- approval and rejection probabilities where modeled;
- expiry and refund behavior.

### Banking

- deposit rates;
- loan rates;
- terms;
- fees;
- payment cadence;
- approval rules;
- affordability thresholds;
- delinquency and default rules;
- recovery plans;
- event sensitivity.

### Progression

- level thresholds;
- XP or progression sources;
- achievement conditions;
- unlocks;
- reputation changes;
- class-transition costs after Workstream 11;
- expected time to milestones.

### Market instruments

For active equities:

- starting price;
- shares outstanding;
- revenue;
- operating margin;
- debt;
- cash;
- growth rate;
- dividend policy;
- volatility;
- liquidity;
- event exposures.

For active bonds:

- issuer;
- face value;
- outstanding amount;
- issue and maturity dates or relative schedule;
- coupon type and rate;
- payment frequency;
- credit band;
- benchmark curve;
- spread;
- default and recovery assumptions;
- tradability and liquidity.

For indexes and funds:

- eligible universe;
- constituent list;
- weights;
- base level;
- rebalance policy;
- fee where applicable;
- holdings and cash rules;
- suspension and delisting treatment.

### Events and war states

- event probability or schedule;
- trigger conditions;
- severity bands;
- immediate and delayed effects;
- duration;
- decay;
- recovery;
- affected countries, sectors, instruments, routes, prices, employment, housing, and residency;
- competing response choices;
- no-response behavior;
- correction lineage.

## Required simulation profiles

1. stable Meridian boom;
2. mild inflation;
3. high inflation;
4. food shortage;
5. port congestion;
6. currency pressure;
7. broad market correction;
8. isolated company shock;
9. bond-rate shock;
10. Meridian attack;
11. prolonged wartime economy;
12. ceasefire and reconstruction;
13. low-liquidity immigrant start;
14. high-capital immigrant start;
15. class-country matrix after Workstream 11.

## Required player strategies

The simulator should include at least:

- stable employment;
- professional advancement;
- entrepreneurship;
- equity investing;
- fixed-income investing;
- diversified investing;
- high-risk concentration;
- public and community work;
- logistics and essential-services work;
- mixed strategy;
- random but valid strategy;
- hardship recovery strategy.

No single strategy should dominate all scenarios.

## Required metrics

### Player viability

- percentage able to cover basic expenses;
- time to first income;
- insolvency rate;
- recovery rate;
- median and distribution of net worth;
- debt-service burden;
- Store acquisition time;
- Contract completion and approval rates;
- progression timing;
- class-country viability after Workstream 11.

### Country balance

- median player outcomes by country;
- employment and income dispersion;
- price and affordability divergence;
- currency stability;
- market depth;
- concentration of opportunities;
- crisis damage and recovery time.

### Market integrity

- price volatility;
- liquidity assumptions;
- equity and bond return distributions;
- default and recovery frequency;
- index concentration;
- fund tracking behavior;
- event sensitivity;
- arbitrage and positive-carry exploits;
- guaranteed-return paths;
- inactive or suspended asset behavior.

### System integrity

- duplicate issuance;
- balance conservation where applicable;
- negative inventory;
- repeated effect application;
- missed or duplicate coupon and maturity processing;
- cross-session contamination;
- invalid references;
- unbounded values.

## Candidate acceptance bands

Exact thresholds require review. The simulation framework must at minimum flag:

- any country with structurally impossible early progression;
- any class-country combination with no viable income route;
- any strategy producing near-certain superior wealth without material risk;
- any normal-start insolvency rate above the approved classroom tolerance;
- any reward or yield loop that creates riskless positive carry;
- any severe event without a feasible recovery route;
- any market asset with implausible or unbounded price behavior;
- any import or runtime retry producing duplicate state.

## Output contract

Each run must produce:

- `run-metadata.json`;
- `input-checksums.json`;
- `player-outcomes.csv`;
- `country-outcomes.csv`;
- `market-outcomes.csv`;
- `event-outcomes.csv`;
- `integrity-violations.json`;
- `summary.md`;
- optional plots generated from raw outputs.

Summaries must distinguish measured results from interpretation and recommendations.

## Immediate next actions

1. Convert this contract into versioned JSON schemas.
2. Select a bounded first active market subset.
3. Create candidate financial and economic input files.
4. Commit a simulation runner.
5. Run multiple deterministic seeds.
6. retain all raw outputs;
7. revise values and repeat until acceptance gates pass.
