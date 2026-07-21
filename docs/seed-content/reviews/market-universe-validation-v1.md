# Market Universe Validation v1

Status: deterministic structural validation complete  
Pack: `econovaria.market-universe.v1`  
Generation seed: `20260718`

## Result

The generated market universe contains **3,200 records**.

Structural checks completed:

- stable IDs: 3,200 unique of 3,200;
- symbols: 3,200 unique of 3,200;
- display names: 3,200 unique of 3,200;
- countries represented: 10;
- records per country: 320 minimum and 320 maximum;
- official currency codes represented: DRV, ELD, LUM, NRC, SLV, SYN, THD, VAL, XAL, YRC;
- every record includes a country, currency, exchange, type, sector, seed status, and runtime-support status;
- every bond or equity-hybrid record resolves to an issuer definition within its country catalog;
- every index and commodity/reference record is explicitly non-tradable and design-only.

## Instrument totals

| Type | Count |
|---|---:|
| `commodity_reference` | 150 |
| `common_equity` | 1,500 |
| `corporate_bond` | 600 |
| `etf_fund` | 200 |
| `index` | 150 |
| `listed_trust` | 150 |
| `preferred_convertible` | 100 |
| `sovereign_public_bond` | 350 |
| **Total** | **3,200** |

## Country totals

| Country | Currency | Exchange | Count |
|---|---|---|---:|
| Northreach | NRC | FGX | 320 |
| Yrethia | YRC | SBX | 320 |
| Thaloris | THD | DHM | 320 |
| Solvend | SLV | AUX | 320 |
| Eldoran | ELD | CMX | 320 |
| Valerion | VAL | GFX | 320 |
| Lumenor | LUM | SCX | 320 |
| Xalvoria | XAL | ECX | 320 |
| Dravenlok | DRV | IHX | 320 |
| Syndalis | SYN | BDX | 320 |
| **Total** |  |  | **3,200** |

## Validation method

The catalog was generated deterministically from:

- fixed country identities;
- official country currency codes;
- fixed per-country allocation;
- country-specific sector lists;
- country-specific issuer-name roots;
- country-specific public issuers;
- country-specific reference benchmarks;
- stable sequence-derived symbols;
- a fixed generation seed.

The same generation inputs must reproduce the same IDs and symbols.

## What this validation proves

It proves:

- record counts;
- country distribution;
- type distribution;
- ID uniqueness;
- symbol uniqueness;
- display-name uniqueness;
- official currency-code coverage;
- basic issuer-reference integrity;
- structural presence of required design fields.

## What this validation does not prove

It does not prove:

- economic realism of prices or financial statements;
- coupon or yield correctness;
- index arithmetic;
- company valuation;
- market liquidity;
- event-response calibration;
- player affordability or progression balance;
- backend compatibility;
- database import safety;
- frontend performance with 3,200 active assets;
- classroom usability with the full universe visible;
- absence of trademark or cultural-name concerns;
- production readiness.

## Blocking work

Before any subset becomes staging-ready:

1. Review names and symbols.
2. Reconcile instrument classes with the backend capability manifest.
3. Define authoritative issuer records.
4. Select the active pilot subset.
5. Create full financial profiles for that subset.
6. Calibrate prices, shares, revenue, profitability, debt, and volatility.
7. Define bond terms and yield curves.
8. Define index constituents and calculations.
9. Map event exposure and country risk.
10. Build and execute a reproducible market simulation.
11. Test search, pagination, filtering, and rendering.
12. Validate idempotent import and rollback.
