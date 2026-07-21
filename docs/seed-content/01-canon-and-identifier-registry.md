# Canon and Identifier Registry

Status: draft foundation

## Purpose

Define the official reusable entities and identifier rules used by all seeded content. This registry prevents display-name drift, duplicate records, unstable references, and accidental coupling between reusable canon and game-session state.

## Canon hierarchy

When sources conflict, use the following order until an explicit reconciliation is approved:

1. applied database history and authoritative backend contracts;
2. current canonical asset manifests and runtime registries;
3. `docs/worldbuilding/econovaria-country-lore-v1.md`;
4. this seed-content catalog;
5. draft concept notes and future-scope proposals.

A lower source may propose a correction but may not silently override a higher source.

## Stable identifier standard

Recommended human-readable content ID format:

`<domain>.<scope>.<slug>.v<major>`

Examples:

- `country.global.northreach.v1`
- `currency.northreach.nrc.v1`
- `institution.lumenor.meridian-forum.v1`
- `character.lumenor.ila-meren.v1`
- `company.solvend.aurora-systems.v1`
- `contract.global.meridian-assessment.v1`
- `event.global.meridian-customs-breach.v1`
- `interaction.syndalis.security-warning.v1`
- `item.global.analysis-pass.v1`
- `achievement.global.first-contract.v1`

Rules:

- lowercase ASCII;
- dot-separated hierarchy;
- hyphenated words inside a segment;
- no display name as a database ownership key;
- no mutable Player ID or Access Code in content identifiers;
- no game-session ID inside reusable content IDs;
- runtime instances receive separate runtime UUIDs or authoritative IDs;
- a retired content ID is never reassigned to a different concept.

## Runtime-instance distinction

Reusable definition:

- stable content ID;
- versioned copy and mechanics;
- may be reused in multiple sessions.

Runtime instance:

- generated or assigned per game session;
- references the reusable definition;
- owns mutable status, timestamps, choices, values, and outcomes.

Examples:

- `event.global.meridian-customs-breach.v1` is a reusable definition.
- The active breach in Game Session A is a runtime event instance.
- The same event used in Game Session B must not share state with Session A.

## Official countries

| Canonical key | Country | Capital | Core identity |
|---|---|---|---|
| `NORTHREACH` | Northreach | Frostgate | rare minerals, natural gas, northern logistics, defense infrastructure |
| `YRETHIA` | Yrethia | Sableport | regulated shipping, customs, insurance, freight finance |
| `THALORIS` | Thaloris | Dusk Harbor | high-risk logistics, re-export trade, repair, salvage |
| `SOLVEND` | Solvend | Aurora Spire | research, AI, aerospace, precision engineering |
| `ELDORAN` | Eldoran | Crescent Bay | agriculture, food security, wholesale markets, central logistics |
| `VALERION` | Valerion | Glassfall | clean energy, water infrastructure, tourism, premium services |
| `LUMENOR` | Lumenor | Starfall | education, diplomacy, media, civic legitimacy |
| `XALVORIA` | Xalvoria | Emberhall | banking, infrastructure finance, luxury industry, influence |
| `DRAVENLOK` | Dravenlok | Ironhold | steel, machinery, rail, defense manufacturing |
| `SYNDALIS` | Syndalis | Blacklight | cybersecurity, fintech, data routes, covert market influence |

## Official currencies

| Code | Country | Currency name | Current symbol asset key |
|---|---|---|---|
| NRC | Northreach | Northreach Credit | saturn |
| YRC | Yrethia | Yrethian Crown | neptune |
| THD | Thaloris | Thaloris Dinar | arsenic |
| SLV | Solvend | Solvend Volt | jupiter |
| ELD | Eldoran | Eldoran Ducat | alumen |
| VAL | Valerion | Valerion Lira | gold |
| LUM | Lumenor | Lumenor Mark | lapis_lazuli |
| SYN | Syndalis | Syndalis Note | alcali |
| XAL | Xalvoria | Xalvorian Lira | lead |
| DRV | Dravenlok | Dravenlok Vek | ferrum |

ECO is not currently an official country-currency record in the currency asset manifest. Any use of ECO must be classified explicitly as one of the following before implementation:

- classroom reward unit;
- platform settlement unit;
- accounting reference unit;
- temporary fallback;
- deprecated legacy terminology.

No content should treat ECO as a new official currency without an approved product and backend decision.

## Economic blocs

### Northern Resource Bloc

- Northreach
- Solvend

Dependency: hard resources and logistics from Northreach; technical value creation from Solvend.

### Western Maritime Corridor

- Yrethia
- Thaloris

Dependency: regulated trade and insurance from Yrethia; flexible disruption routing and repair from Thaloris.

### Central Stability Zone

- Eldoran
- Valerion
- Lumenor

Dependency: food and commodity stability, clean energy and services, diplomacy and institutional legitimacy.

### Eastern Pressure Zone

- Xalvoria
- Dravenlok
- Syndalis

Dependency and tension: capital, heavy industry, and data power.

## Canonical content domains

Recommended domain prefixes:

- `country`
- `currency`
- `bloc`
- `institution`
- `character`
- `industry`
- `commodity`
- `company`
- `index`
- `contract`
- `contract-chain`
- `event`
- `story-arc`
- `interaction`
- `news`
- `item`
- `bank-product`
- `achievement`
- `level`
- `location`
- `tutorial`
- `notification`
- `fixture`

## Required terminology decisions

The following terms must have one product-wide meaning before production copy is finalized:

- contract versus assignment;
- reward versus payout;
- cash balance versus available balance;
- item ownership versus available quantity;
- redemption request versus item use;
- accepted versus active contract;
- completed versus approved contract;
- event versus news report;
- story arc versus event chain;
- company versus market asset;
- country currency versus any classroom reward unit;
- level, reputation, experience, and achievement.

## Reserved naming rules

- Do not use names that are obvious copies of real governments, companies, political parties, conflicts, or living officials.
- Do not use country names as adjectives inconsistently. Define each demonym and adjectival form in its country file.
- Tickers must be unique across the seeded market universe.
- Currency codes remain unique and must not be reused as stock tickers.
- Institution names should communicate function without creating dozens of indistinguishable ministries and councils.
- Character names should be culturally coherent within the fictional country without mapping countries to a single real-world ethnicity.

## Reference integrity rules

Before staging, automated or manual validation must confirm:

- every referenced content ID exists;
- no retired ID is used by active content;
- every country-specific record references an official country key;
- every monetary value references a supported currency or explicit accounting unit;
- every company references valid industries and country exposure;
- every event effect references defined indicators or supported runtime actions;
- every story branch has a valid next state or terminal resolution;
- every contract chain has no accidental cycle unless repeatability is intentional;
- every asset reference resolves or has an explicit placeholder status.