# Issuer, Exchange, Industry, and Reference Taxonomy v1

Status: design candidate  
Runtime implementation: pending  
Production authorization: false

## Purpose

Provide the reference entities required to normalize the 3,200-instrument Econovaria market universe.

The instrument catalog cannot become staging-ready until every record references valid exchange, issuer, sector, instrument-type, currency, and benchmark definitions.

## Ten national exchanges

| Exchange ID | Code | Country | Display name | Primary role |
|---|---|---|---|---|
| `exchange.northreach.frostgate.v1` | `FGX` | Northreach | Frostgate Exchange | resources, energy, infrastructure, northern logistics |
| `exchange.yrethia.sableport.v1` | `SBX` | Yrethia | Sableport Exchange | shipping, insurance, trade finance, logistics technology |
| `exchange.thaloris.dusk-harbor.v1` | `DHM` | Thaloris | Dusk Harbor Market | repair, re-export, salvage, secondary markets |
| `exchange.solvend.aurora.v1` | `AUX` | Solvend | Aurora Exchange | research, technology, aerospace, precision industry |
| `exchange.eldoran.crescent.v1` | `CMX` | Eldoran | Crescent Market Exchange | food, agriculture, wholesale trade, central logistics |
| `exchange.valerion.glassfall.v1` | `GFX` | Valerion | Glassfall Exchange | clean energy, water, green finance, premium services |
| `exchange.lumenor.starfall.v1` | `SCX` | Lumenor | Starfall Civic Exchange | education, media, professional services, civic infrastructure |
| `exchange.xalvoria.emberhall.v1` | `ECX` | Xalvoria | Emberhall Capital Exchange | banking, infrastructure finance, luxury industry, sovereign capital |
| `exchange.dravenlok.ironhold.v1` | `IHX` | Dravenlok | Ironhold Exchange | steel, machinery, rail, industrial production |
| `exchange.syndalis.blacklight.v1` | `BDX` | Syndalis | Blacklight Digital Exchange | cybersecurity, fintech, data infrastructure, platform services |

### Exchange-definition requirements

Every exchange definition must eventually include:

- country and settlement currency;
- market calendar and time zone;
- supported instrument classes;
- listing standards;
- trading-state vocabulary;
- market-wide halt rules;
- delisting and suspension policy;
- price and volume precision;
- index-administrator relationship;
- Player and Admin display names;
- technical support status.

Market calendars and operating hours are not approved in this document.

## Issuer-type taxonomy

| Issuer type ID | Description | Common instruments |
|---|---|---|
| `issuer-type.corporation.v1` | privately governed operating company | common equity, preferred equity, corporate bond |
| `issuer-type.state-enterprise.v1` | commercially active state-controlled enterprise | equity where supported, corporate or public-enterprise bond |
| `issuer-type.sovereign.v1` | national government treasury or debt authority | sovereign bond, treasury benchmark |
| `issuer-type.public-agency.v1` | infrastructure, development, utility, or public-service agency | agency bond, project bond |
| `issuer-type.municipality.v1` | city or regional public authority | municipal bond where supported |
| `issuer-type.bank.v1` | deposit-taking or wholesale financial institution | equity, preferred, senior or subordinated bond |
| `issuer-type.insurer.v1` | insurance or reinsurance institution | equity, corporate bond |
| `issuer-type.fund-manager.v1` | administrator of pooled investment products | ETF or fund definition |
| `issuer-type.trust-manager.v1` | administrator of property or infrastructure trusts | listed trust |
| `issuer-type.index-administrator.v1` | independent or exchange-linked index administrator | non-tradable index definition |
| `issuer-type.benchmark-administrator.v1` | administrator of commodity, freight, rate, or sector references | reference benchmark |
| `issuer-type.multilateral-institution.v1` | treaty, corridor, reconstruction, or international institution | development bond or reference index only when supported |

### Issuer master-record fields

- stable issuer ID;
- display and legal name;
- issuer type;
- country and headquarters location;
- controlling institution if applicable;
- primary and secondary sectors;
- description;
- products and services;
- revenue or funding model;
- operating footprint;
- currencies;
- credit profile;
- ownership model;
- public or private status;
- associated securities;
- event exposures;
- characters and institutions;
- asset requirements;
- editorial-review status;
- technical mapping status.

One issuer may have multiple instruments. Securities must not silently create duplicate issuer definitions.

## Instrument-type taxonomy

| Instrument type | Default classification | Default tradability |
|---|---|---|
| `common_equity` | equity ownership claim | candidate, capability dependent |
| `preferred_convertible` | preferred or convertible equity claim | candidate, capability dependent |
| `corporate_bond` | fixed-income corporate obligation | candidate, capability dependent |
| `sovereign_public_bond` | sovereign, agency, municipal, or public-enterprise obligation | candidate, capability dependent |
| `etf_fund` | pooled investment product | candidate only after holdings methodology exists |
| `listed_trust` | listed property or infrastructure trust | candidate only after distribution and holdings rules exist |
| `index` | calculated market reference | non-tradable by default |
| `commodity_reference` | commodity, freight, rate, or sector benchmark | non-tradable by default |

A derivative, futures contract, option, swap, or leveraged product is excluded until the backend and risk model explicitly support it.

## Parent-sector taxonomy

The following parent sectors organize the larger set of country-specific subindustries.

1. `sector.agriculture-food.v1`
2. `sector.energy-utilities.v1`
3. `sector.mining-materials.v1`
4. `sector.industrial-manufacturing.v1`
5. `sector.defense-aerospace.v1`
6. `sector.transport-logistics.v1`
7. `sector.construction-infrastructure.v1`
8. `sector.technology-software.v1`
9. `sector.telecommunications-data.v1`
10. `sector.cybersecurity-intelligence.v1`
11. `sector.finance-banking.v1`
12. `sector.insurance-risk.v1`
13. `sector.healthcare-life-sciences.v1`
14. `sector.consumer-retail.v1`
15. `sector.real-estate-hospitality.v1`
16. `sector.media-education.v1`
17. `sector.professional-public-services.v1`
18. `sector.funds-indexes-benchmarks.v1`

### Subindustry requirements

Each subindustry must declare:

- stable ID;
- parent sector;
- description;
- primary countries;
- demand and cost drivers;
- labor and capital intensity;
- business-cycle sensitivity;
- interest-rate sensitivity;
- currency and trade sensitivity;
- energy and commodity dependencies;
- environmental sensitivity;
- common event families;
- issuer and instrument references.

The generated 3,200-instrument package currently contains many raw sector slugs. These must be mapped to this parent taxonomy without losing country-specific detail.

## Initial commodity and reference-benchmark registry

All records below are reference-only until explicit tradable-product support exists.

| Reference ID | Name | Unit concept | Primary relevance |
|---|---|---|---|
| `benchmark.global.staple-food-basket.v1` | Econovaria Staple Food Basket | index points | household affordability and inflation |
| `benchmark.global.grain.v1` | Meridian Grain Reference | standardized mass unit | Eldoran agriculture and food security |
| `benchmark.global.natural-gas.v1` | Northern Natural Gas Reference | energy unit | Northreach energy and industrial costs |
| `benchmark.global.petroleum.v1` | Corridor Fuel Reference | volume unit | transport, industry, and household energy |
| `benchmark.global.strategic-minerals.v1` | Strategic Minerals Basket | index points | Northreach and Solvend supply chains |
| `benchmark.global.industrial-steel.v1` | Industrial Steel Reference | mass unit | Dravenlok production and infrastructure |
| `benchmark.global.copper-conductors.v1` | Conductive Metals Basket | mass unit | energy grids, data systems, manufacturing |
| `benchmark.global.electronic-components.v1` | Advanced Components Index | index points | Solvend and Syndalis technology production |
| `benchmark.global.construction-materials.v1` | Construction Inputs Index | index points | Meridian and reconstruction activity |
| `benchmark.global.shipping-capacity.v1` | Meridian Freight Capacity Index | capacity points | Yrethia and Thaloris logistics |
| `benchmark.global.container-rates.v1` | Container Rate Reference | rate per standardized container | trade and port congestion |
| `benchmark.global.marine-insurance.v1` | Marine Risk Premium Index | basis points | Yrethia insurance and wartime shipping |
| `benchmark.global.water-security.v1` | Water Security Index | index points | Valerion supply and regional stability |
| `benchmark.global.hydropower-output.v1` | Hydropower Availability Index | output points | Valerion energy system |
| `benchmark.global.compute-capacity.v1` | Advanced Compute Capacity Index | compute points | Solvend and Syndalis technology demand |
| `benchmark.global.data-transit.v1` | Cross-Border Data Transit Index | bandwidth points | Syndalis network infrastructure |
| `benchmark.global.skilled-labor.v1` | Skilled Labor Availability Index | index points | Solvend, Lumenor, and strategic sectors |
| `benchmark.global.consumer-medicine.v1` | Essential Medicine Inputs Index | index points | healthcare supply chains |
| `benchmark.global.clean-energy-equipment.v1` | Clean Energy Equipment Index | index points | Valerion and infrastructure investment |
| `benchmark.global.reconstruction-cost.v1` | Reconstruction Cost Index | index points | postwar infrastructure and public finance |

## Index methodology families

Candidate methodology IDs:

- `methodology.free-float-market-cap.v1`;
- `methodology.equal-weight.v1`;
- `methodology.capped-market-cap.v1`;
- `methodology.sector-weighted.v1`;
- `methodology.minimum-volatility.v1`;
- `methodology.dividend-quality.v1`;
- `methodology.infrastructure-exposure.v1`;
- `methodology.crisis-stress.v1`;
- `methodology.public-bond-duration.v1`;
- `methodology.reference-basket.v1`.

Every index must define:

- administrator;
- eligible universe;
- constituent count or rule;
- weighting methodology;
- rebalance frequency;
- treatment of suspension and delisting;
- base date and base level;
- calculation currency;
- publication and correction policy;
- runtime calculation support status.

No constituent lists, weights, divisors, or base levels are approved yet.

## Bond reference requirements

Every bond definition must eventually reference:

- issuer;
- bond type;
- denomination currency;
- seniority;
- credit-grade band;
- issue and maturity convention;
- tenor;
- coupon type;
- coupon rate;
- payment frequency;
- face value;
- outstanding amount;
- callable or convertible status;
- default and recovery treatment;
- benchmark curve;
- event sensitivities;
- runtime support status.

The current generated catalog uses relative tenor and candidate credit bands only. Absolute dates, coupons, yields, and prices remain unapproved.

## First implementation sequence

1. Preserve the ten exchange codes already used by the generated package.
2. Generate an issuer master registry and replace embedded issuer duplication with references.
3. Map all raw sector slugs to parent and subindustry IDs.
4. Confirm the 20 initial reference benchmarks and map country-specific benchmarks.
5. Assign index administrators and methodology statuses.
6. Select the bounded first active subset.
7. Enrich only that subset with complete financial and event-exposure records.
8. Run economic and market simulation before staging activation.

## Validation

Before this taxonomy can be approved:

- all exchange codes must be unique;
- all issuer references must resolve;
- all sector slugs must map deterministically;
- currency codes must match the authoritative manifest;
- indexes and benchmarks must remain non-tradable by default;
- real-company resemblance review must pass;
- generated records must not imply approved pricing or credit quality;
- backend capability mapping must be explicit.
