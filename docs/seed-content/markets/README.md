# Econovaria Market Universe

Status: deterministic design-candidate catalog  
Pack: `econovaria.market-universe.v1`  
Production authorization: **false**

## Purpose

This directory contains the first large-scale fictional market universe for Econovaria.

The catalog contains **3,200 instruments**, distributed evenly across the ten countries at **320 instruments per country**.

It replaces the earlier 30-company pilot target as the long-term content-universe target. It does not mean the Player market must display or activate all 3,200 instruments in one session.

## Per-country allocation

| Instrument type | Count |
|---|---:|
| Common equities | 150 |
| Preferred or convertible equities | 10 |
| Corporate bonds | 60 |
| Sovereign and public-agency bonds | 35 |
| Exchange-traded funds | 20 |
| Listed property or infrastructure trusts | 15 |
| National, sector, factor, and stress indexes | 15 |
| Commodity or sector reference benchmarks | 15 |
| **Total per country** | **320** |

Across ten countries, this produces:

- 1,500 common equities;
- 100 preferred or convertible equities;
- 600 corporate bonds;
- 350 sovereign or public-agency bonds;
- 200 exchange-traded funds;
- 150 listed trusts;
- 150 indexes;
- 150 commodity or sector reference benchmarks;
- **3,200 instruments total**.

## Files

- `instrument-universe-allocation-v1.md` — scope, distribution, activation strategy, and quality gates.
- `instrument-schema-v1.md` — canonical design-record fields and type-specific fields.
- `universe/manifest-v1.json` — counts, country metadata, file checksums, and validation status.
- `universe/<country>.jsonl` — intended one-object-per-instrument country catalogs, 320 records per country.
- `../reviews/market-universe-validation-v1.md` — deterministic validation results and unresolved blockers.

## Important runtime boundary

These records are content definitions, not approved runtime market rows.

They do not establish:

- starting prices;
- shares outstanding;
- market capitalizations;
- coupon rates;
- yield curves;
- index divisor values;
- constituent weights;
- maturity dates;
- tradability;
- order-book liquidity;
- market hours;
- corporate actions;
- production database identifiers.

Those require authoritative backend mapping, real simulation, staging validation, and explicit approval.

## Activation model

The full 3,200-record universe should be treated as a content library.

A normal game session should activate a smaller, scenario-appropriate subset so that:

- players can understand the available market;
- market calculations remain manageable;
- event exposure remains explainable;
- classroom analysis is not overwhelmed;
- thin or unsupported assets remain hidden;
- each country still has meaningful diversification.

Recommended first staging subset: 20–40 active instruments per country, selected from the full universe after technical and economic validation.

## Search

Each record has:

- a stable content ID;
- a globally unique symbol;
- a unique display name;
- country;
- currency;
- exchange;
- instrument type;
- sector;
- issuer information where applicable;
- risk and liquidity classification where applicable;
- design and runtime-support status.

The intended JSONL format is line-oriented so individual instruments can be searched, diffed, streamed, and validated without loading a single monolithic file.
