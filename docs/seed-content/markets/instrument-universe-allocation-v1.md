# Instrument Universe Allocation v1

Status: generated design candidate  
Stable pack ID: `econovaria.market-universe.v1`  
Total instruments: **3,200**  
Country allocation: **320 per country**

## Decision

Econovaria requires a market large enough to feel like a complete multinational economy rather than a classroom watchlist.

The market-content target is therefore expanded from approximately 30 listed companies to a **3,200-instrument definition library**.

The library is distributed evenly across:

- Northreach;
- Yrethia;
- Thaloris;
- Solvend;
- Eldoran;
- Valerion;
- Lumenor;
- Xalvoria;
- Dravenlok;
- Syndalis.

Equal record count does not imply identical economic structure. Each country uses different sector emphasis, issuer names, public institutions, benchmarks, and narrative exposure.

## Allocation

Every country receives:

| Class | Count | Intended role |
|---|---:|---|
| Common equity | 150 | Corporate ownership, sector exposure, growth, income, cyclicality, and company stories |
| Preferred or convertible equity | 10 | Hybrid financing and capital-structure variety |
| Corporate bond | 60 | Credit, duration, refinancing, and issuer-risk analysis |
| Sovereign or public-agency bond | 35 | Yield-curve, public-finance, infrastructure, and policy exposure |
| Exchange-traded fund | 20 | Broad, sector, factor, income, and scenario diversification |
| Listed trust | 15 | Property and infrastructure income exposure |
| Index | 15 | Country, size, factor, sector, sustainability, and stress measurement |
| Commodity or sector reference | 15 | Country-specific input, output, capacity, and price benchmarks |
| **Total** | **320** | |

## Country-specific economic identity

The generated lists preserve these dominant identities:

- **Northreach:** strategic minerals, energy, northern logistics, industrial engineering, and hardened infrastructure.
- **Yrethia:** shipping, ports, insurance, trade finance, customs technology, and maritime services.
- **Thaloris:** repair, salvage, re-export commerce, warehousing, and flexible logistics.
- **Solvend:** AI, aerospace, precision engineering, semiconductors, robotics, and research.
- **Eldoran:** agriculture, food processing, rail, wholesale markets, commodity exchange, and consumer stability.
- **Valerion:** hydropower, water infrastructure, green finance, tourism, premium services, and clean transit.
- **Lumenor:** education, media, publishing, arbitration, civic technology, research, and professional services.
- **Xalvoria:** banking, infrastructure finance, construction, luxury manufacturing, energy investment, and sovereign capital.
- **Dravenlok:** steel, machinery, vehicles, rail, defense manufacturing, industrial energy, and chemicals.
- **Syndalis:** cybersecurity, fintech, payments, data centers, cloud infrastructure, digital identity, and market data.

## Why the universe is larger than the active market

A 3,200-instrument library supports:

- different game-session market selections;
- country-specific classroom assignments;
- varied campaign restarts;
- sector-specific crises;
- issuer and bond substitution;
- market breadth and index construction;
- progression-based discovery;
- archival, suspended, or advanced assets;
- future scenario packs without inventing companies during runtime.

Activating every instrument simultaneously would make the game harder to understand and would create unnecessary backend, UI, event, and simulation load.

The content universe and the active session market must remain separate concepts.

## Instrument status

All generated records use:

- `seedStatus: design-candidate`;
- `runtimeSupport: unverified`.

Indices and commodity or sector references additionally use:

- `tradable: false`;
- `calculationStatus: design-only`.

No record may be represented to players as actively tradable until the authoritative market capability explicitly supports that class.

## Stable identifiers and symbols

Stable IDs follow:

`instrument.<country>.<instrument-type>.<sequence>.v1`

Symbols use a deterministic five-character structure:

`<country prefix><class code><two-letter sequence>`

Examples:

- `NREAA` — Northreach common equity;
- `YRBAB` — Yrethian corporate bond;
- `SVGAC` — Solvend public bond;
- `LUXAD` — Lumenor index.

Symbols are globally unique within this generated universe and do not reuse country currency codes.

## Bond treatment

The catalog uses relative tenors rather than absolute maturity dates.

This prevents a design document generated in 2026 from silently becoming stale before runtime implementation.

Before activation, the importer or scenario builder must resolve:

- issue date;
- maturity date;
- coupon;
- coupon frequency;
- face value;
- day-count convention;
- credit spread;
- settlement rule;
- callability;
- default and restructuring behavior.

## Index treatment

The 150 index records are definitions only.

Before any index becomes authoritative, the runtime must define:

- eligible constituents;
- weighting method;
- base date and base level;
- divisor treatment;
- rebalancing;
- suspended or delisted constituent behavior;
- corporate-action treatment;
- calculation cadence;
- source-of-truth ownership.

## Required quality gates

Before staging activation:

1. Validate all 3,200 IDs, symbols, names, countries, currencies, and issuer references.
2. Reconcile supported asset classes with the final market capability manifest.
3. Select a bounded staging subset.
4. Add complete financial profiles to active equities.
5. Add calibrated bond terms and yield curves.
6. Define actual index constituents and calculations.
7. Confirm event-exposure coefficients.
8. Run market and player-economy simulations.
9. Verify Player and Admin rendering, filtering, pagination, and search.
10. Verify seed idempotency, deactivation, and rollback.
11. Confirm classroom suitability and financial-literacy copy.
12. Keep unsupported records unavailable rather than presenting them as broken.

## Current limitations

The catalog is intentionally broad and structurally consistent, but it is not yet economically calibrated.

Generated names and symbols require editorial review for:

- pronunciation;
- unwanted resemblance to real companies or financial products;
- cultural associations;
- country voice;
- excessive repetition;
- trademark-risk screening before public release.

The full universe must not be loaded into production merely because the records exist.
