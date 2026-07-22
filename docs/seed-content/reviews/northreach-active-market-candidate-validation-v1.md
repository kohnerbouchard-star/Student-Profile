# Northreach Active Market Candidate Validation v1

Status: structural pass; financial, narrative, technical, and staging approval pending  
Source subset: `markets/active-subsets/northreach-active-market-candidate-v1.json`  
Issuer registry: `markets/active-subsets/northreach-active-issuer-registry-v1.json`  
Activation authorized: false

## Purpose

Validate the first bounded country-market candidate before applying the same selection and enrichment process to the other nine countries.

## Expected allocation

| Instrument type | Expected | Actual | Result |
|---|---:|---:|---|
| Common equity | 12 | 12 | pass |
| Preferred or convertible | 1 | 1 | pass |
| Corporate bond | 4 | 4 | pass |
| Sovereign or public-agency bond | 2 | 2 | pass |
| Exchange-traded fund | 2 | 2 | pass |
| Listed trust | 1 | 1 | pass |
| Index | 1 | 1 | pass |
| Commodity or sector benchmark | 1 | 1 | pass |
| **Total** | **24** | **24** | **pass** |

## Structural validation

- 24 instrument records present: pass.
- 24 unique stable instrument IDs: pass.
- 24 unique symbols: pass.
- 24 unique display names: pass.
- all records use country `northreach`: pass.
- all records use currency `NRC`: pass.
- all records use exchange `FGX`: pass.
- all instrument types match the approved eight-type allocation: pass.
- no selected symbol equals an official currency code: pass.
- 21 unique issuer or administrator records present: pass.
- every instrument issuer reference resolves in the Northreach issuer registry: pass.
- multiple securities correctly share one issuer where applicable: pass.

Examples of shared-issuer behavior:

- Kestrel Consumer Staples issues both common equity and a corporate note.
- Frostgate Asset Management administers both selected Northreach funds.
- Northreach Treasury issues both selected sovereign bonds.

## Sector coverage

The candidate contains exposure to:

- energy;
- northern logistics;
- industrial engineering;
- defense infrastructure;
- financial services;
- consumer staples;
- healthcare;
- construction;
- real estate;
- communications;
- professional services;
- environmental services;
- infrastructure;
- public finance;
- diversified funds;
- market indexes;
- strategic-mineral reference pricing.

This is sufficient for the first enrichment pilot and provides both country-specific and general economic sectors.

## Required enrichment before simulation

### Corporations

Each corporate issuer still requires:

- headquarters location;
- ownership classification;
- revenue;
- operating margin;
- net income;
- cash;
- debt;
- shares outstanding where applicable;
- dividend policy;
- growth assumptions;
- commodity, currency, interest-rate, shipping, labor, regulation, and war exposure.

### Equities and hybrid securities

Still required:

- starting share price;
- shares outstanding;
- market capitalization;
- valuation bands;
- dividend or conversion terms;
- volatility and liquidity coefficients;
- suspension and retirement behavior.

### Corporate bonds

Still required:

- face value;
- issue size;
- coupon;
- issue price;
- maturity date or scenario-relative maturity;
- payment cadence;
- credit band;
- seniority;
- default and restructuring behavior;
- interest-rate sensitivity.

### Sovereign bonds

Still required:

- sovereign yield-curve relationship;
- coupon and maturity rules;
- issue size;
- fiscal and inflation exposure;
- wartime funding behavior;
- treatment of restructuring or payment interruption.

### Funds, trust, index, and benchmark

Still required:

- constituents or holdings;
- weighting or NAV methodology;
- starting level or price;
- rebalancing;
- suspended-security treatment;
- reference-only versus tradable enforcement.

## Blocking findings

1. No financial values are approved.
2. No event-exposure coefficients are approved.
3. Headquarters location references remain null.
4. Ownership classifications remain null.
5. Backend capability mapping is unverified for bonds, funds, trusts, indexes, and benchmarks.
6. No market simulation has been run.
7. No importer or staging activation has been tested.
8. Player and Admin rendering has not been verified.

## Decision

The Northreach candidate passes structural selection and issuer-reference validation.

It is approved only as the first **financial-enrichment design pilot**. It is not approved for runtime activation, production import, simulated performance claims, or player-facing availability.

## Next actions

1. Create standardized corporate, equity, bond, fund, trust, index, and benchmark enrichment schemas.
2. Enrich the 24 Northreach instruments with candidate values clearly marked uncalibrated.
3. Run arithmetic validation.
4. Add event-exposure mappings.
5. Use the completed Northreach model to generate equivalent candidates for the other nine countries.
