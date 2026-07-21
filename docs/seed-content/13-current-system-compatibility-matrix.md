# Current System Compatibility Matrix

Status: first code-verified audit
Audit baseline: `main` at the July 18, 2026 integration state
Purpose: determine which seeded-content concepts can map to authoritative current structures and which must remain metadata, planned, or blocked.

## Status vocabulary

- `supported`: authoritative current model and behavior exist on `main`.
- `supported-narrow`: an authoritative structure exists, but fewer fields or behaviors than the seed concept requires.
- `read-only`: authoritative reads exist, but creation or mutation is absent or backend-only.
- `backend-only`: authoritative backend behavior exists but is not connected through the Player or Admin product surface.
- `planned`: product surface or capability exists, but no approved authoritative runtime contract on `main`.
- `blocked`: do not seed or expose as working until a named dependency is resolved.
- `metadata-candidate`: may be stored as descriptive metadata only after validation; must not be treated as mechanical state.

## Authoritative evidence reviewed

- `backend/src/domains/countries/contracts/countryProfileContracts.ts`
- `backend/src/domains/stocks/README.md`
- `frontend/src/assets/currency-symbols/currency-symbols.manifest.json`
- `admin/create-action-adapter.js`
- `player-terminal/src/api/capabilities.js`
- `player-terminal/V75_API_READINESS.md`
- `player-terminal/docs/runtime-readiness-audit-2026-07-18.md`
- `admin/docs/admin-current-state-audit-2026-07-18.md`

## Country definitions

Status: supported

Current authoritative fields:

- UUID primary ID;
- country code;
- country name;
- capital name;
- currency code;
- active, disabled, or archived status;
- metadata;
- created and updated timestamps.

Seed mapping:

| Seed concept | Current mapping | Status | Notes |
|---|---|---|---|
| Stable country identity | `country_code` plus UUID | supported | Official ten-code union exists. Do not replace UUID ownership with content IDs. |
| Country display name | `country_name` | supported | Copy change requires canon review. |
| Capital | `capital_name` | supported | Current canonical capitals already exist. |
| Currency | `currency_code` | supported | Must match official manifest. |
| Country lore | `metadata` or application content | metadata-candidate | Mechanical behavior must not be inferred from prose. |
| Country status | `status` | supported | Active, disabled, archived. |
| Demonym and adjective | no dedicated field | metadata-candidate | Safe as content metadata. |
| Institutions and characters | no current country relationship model identified | planned | Keep in content catalog until mapped. |
| Named locations below capital | no authoritative country-location schema identified | planned | Existing map regions are country-level. |

## Difficulty policies

Status: supported

Current authoritative modifiers:

- price;
- event volatility;
- scarcity;
- income;
- trade;
- credit.

Current supported range:

- 0.5 to 2.0 per modifier.

Current presets:

- easy;
- standard;
- moderate;
- hard;
- insane;
- custom for saved game settings.

Seed implications:

- Seed reward and price concepts must document whether difficulty applies.
- Difficulty must not silently modify narrative copy or country canon.
- Event severity and economic values must remain within the existing modifier bounds and domain-specific limits.
- Attendance reward treatment remains a separate policy decision and cannot be inferred only from `income_modifier`.

## Country economic baselines and snapshots

Status: supported

Current session-scoped indicators:

- real GDP index;
- GDP growth rate;
- inflation rate;
- unemployment rate;
- interest rate;
- consumer confidence;
- business confidence;
- cost-of-living index;
- regional price multiplier;
- supply-constraint index;
- import-dependency index;
- tax rate;
- subsidy rate;
- exchange-rate index;
- currency-stability index;
- trade-balance index;
- export-strength index;
- market-risk index;
- political-stability index;
- infrastructure index;
- energy-security index.

Current range constraints:

| Field | Minimum | Maximum |
|---|---:|---:|
| Real GDP index | 50 | 200 |
| GDP growth rate | -0.25 | 0.50 |
| Inflation rate | -0.05 | 0.50 |
| Unemployment rate | 0 | 0.50 |
| Interest rate | 0 | 0.50 |
| Consumer confidence | 25 | 200 |
| Business confidence | 25 | 200 |
| Cost of living | 0.5 | 2.0 |
| Regional price multiplier | 0.5 | 2.0 |
| Supply constraint | 0.5 | 2.0 |
| Import dependency | 0.5 | 2.0 |
| Tax rate | 0 | 0.50 |
| Subsidy rate | 0 | 0.50 |
| Exchange-rate index | 0.5 | 2.0 |
| Currency stability | 0.5 | 2.0 |
| Trade balance | -100 | 100 |
| Export strength | 0.5 | 2.0 |
| Market risk | 0.5 | 2.0 |
| Political stability | 0.5 | 2.0 |
| Infrastructure | 0.5 | 2.0 |
| Energy security | 0.5 | 2.0 |

Additional current rule:

- gradual economy adjustment constant: 0.1.

Seed mapping:

| Concept | Status | Mapping direction |
|---|---|---|
| Food-price pressure | supported-narrow | inflation, cost of living, supply constraint, confidence, import dependency. |
| Port congestion | supported-narrow | infrastructure, supply constraint, trade balance, export strength, confidence. |
| Resource export review | supported-narrow | export strength, trade balance, supply constraint, currency stability, market risk. |
| Reservoir warning | supported-narrow | energy security, infrastructure, supply constraint, confidence. |
| Talent constraint | supported-narrow | business confidence, growth, supply constraint, market risk; no dedicated labor-skill field. |
| Institutional trust | supported-narrow | political stability and confidence may approximate economic effects; narrative trust needs separate state. |
| Strategic reserves | metadata-candidate | no dedicated reserve field identified. Mechanical depletion and replenishment are unsupported until modeled. |
| Water level | metadata-candidate | may drive energy-security events, but no dedicated water field identified. |
| Skilled vacancies | metadata-candidate | may drive event effects, but no dedicated human-capital field identified. |
| Port capacity | metadata-candidate | may drive infrastructure and supply effects, but no dedicated port-capacity field identified. |

## Country event impacts

Status: supported-narrow

Current record includes:

- game session;
- country profile;
- event key;
- event name;
- event type;
- impact summary;
- stat deltas;
- source snapshot;
- result snapshot;
- applied timestamp.

Seed implications:

- Stable event IDs can map to `event_key` after naming review.
- Event effects can map to supported snapshot fields through `stat_deltas`.
- Dedicated story stage, character, branch, decision, delayed-effect schedule, and resolution fields are not established by this record.
- One event-impact row does not by itself provide a complete narrative event engine.
- Application route, authorization, and idempotency must be audited before technical seeding.

## Country assignment

Status: supported

Current authoritative assignment:

- game session;
- player UUID owned server-side;
- country profile;
- active, inactive, or archived status;
- reason: initial assignment, immigration, event relocation, or Admin adjustment;
- timestamps.

Seed implications:

- Country-specific contracts and interactions must derive the player’s current assignment from authenticated server state.
- Browser content must not submit player ownership UUIDs.
- A reusable country content definition never owns a player assignment.
- Contract behavior when assignment changes must be explicit.

## Currency model

Status: supported but split across two economic layers

### Local country currencies

The asset manifest defines:

- NRC;
- YRC;
- THD;
- SLV;
- ELD;
- VAL;
- LUM;
- SYN;
- XAL;
- DRV.

Country profiles and economic snapshots provide:

- currency code;
- exchange-rate index;
- currency-stability index.

### ECO

The stock-trading foundation uses:

- cash account type;
- `currency_code = 'ECO'`;
- ECO debits for stock purchases;
- ECO credits for stock sales.

Recommended canonical classification:

- ECO: global player cash, settlement, and accounting currency.
- Local country currencies: country pricing, economic identity, and conversion layer.

This recommendation is not fully approved until Attendance, Contracts, Store, ledger display, and conversion behavior are audited together.

Blocking currency questions:

1. Are player contract rewards stored and issued in ECO, local currency, or either?
2. Are Store prices authored in local currency and settled through conversion, or charged directly in their displayed currency?
3. Does Attendance issue ECO before conversion or local currency at scan time?
4. Is the exchange-rate index interpreted as local-per-ECO, ECO-per-local, or normalized purchasing power?
5. Which rate and snapshot are recorded on a transaction?
6. What are precision and rounding rules?

## Stock templates and runtime assets

Status: supported

Current architecture:

- global `stock_templates` reference data;
- session-scoped `game_session_stock_assets`;
- append-only price ticks;
- session-scoped stock-market events;
- session-scoped market regimes;
- backend seed-copy process;
- deterministic market runner;
- player-safe read routes;
- market-order execution and holdings infrastructure.

Seed mapping:

| Seed concept | Status | Notes |
|---|---|---|
| Reusable company/stock template | supported | Map through `stock_templates`; field-level schema audit still required. |
| Session stock copy | supported | Trusted backend-only seed-copy path exists. |
| Current price | runtime only | Never store live classroom prices in global templates. |
| Company country and sector | supported | Engine accepts both. |
| Company fundamentals | supported-narrow | Engine accepts optional fundamentals; database template fields need exact audit. |
| Country and sector exposure | supported | Engine supports overlays and country factors. |
| Stock event shocks | supported | Session-scoped event and runner inputs. |
| Portfolio and holdings | supported backend; Player integration dependent | Authoritative cash and share accounting exists. |
| Market orders | supported foundation | Market orders only; no limit orders, shorts, partial fills, or order books. |
| Dividends, splits, mergers, bankruptcy | planned | Do not activate until corporate-action lifecycle exists. |
| Global index | planned or computed read | Add only after exact index support is verified. |

## Contract creation

Status: supported-narrow

Current Admin normalization includes:

- title;
- objective and description;
- instructions;
- evidence;
- materials;
- one or more submission requirements;
- requirements payload;
- cash and item reward payload;
- deadline;
- quantity and quantity scope;
- country targeting or all players;
- visibility;
- teacher or automatic review type;
- manual review or auto-check completion mode;
- difficulty;
- review note;
- immediate, scheduled, or draft publication;
- metadata;
- duplicate-flight suppression during create.

Pilot field mapping:

| Pilot field | Status | Current treatment |
|---|---|---|
| Title, objective, instructions | supported | Direct fields. |
| Required output and evidence | supported | Submission requirement, evidence, requirements payload. |
| Country availability | supported | Targeting by country codes or all players. |
| Difficulty | supported | Current form metadata/field. |
| Manual or automatic review | supported | Review type and completion mode. |
| Deadline and scheduling | supported | Deadline and publication scheduling. |
| Cash reward | supported | Amount, account type, currency code. Exact payout contract remains backend authoritative. |
| Item reward | supported | Store item UUID and quantity. |
| Learning objective | metadata-candidate | No dedicated current field identified. |
| Story arc and stage | metadata-candidate | No authoritative behavior identified. |
| Contract chain | planned | No current chain engine identified. |
| Prerequisite contract | planned | May be metadata only; enforcement unsupported until mapped. |
| Event-instance binding | planned | No current field or route confirmed. |
| Reputation effect | planned | Progression/reputation support not authoritative on `main`. |
| Expiry grace | planned | Current deadline exists; grace lifecycle requires backend mapping. |
| Structured rubric | metadata-candidate | Can be metadata or review note, but no dedicated scoring engine identified. |

Production rule:

Do not seed a prerequisite, chain, or story condition as if enforced when it is only descriptive metadata.

## Store items

Status: supported-narrow

Current Admin normalization includes:

- item key;
- item name;
- description;
- category;
- active, disabled, or archived status;
- price;
- currency code;
- stock quantity;
- visible or hidden visibility;
- sort order.

Pilot mapping:

| Seed concept | Status | Notes |
|---|---|---|
| Basic priced item | supported | Current fields exist. |
| Local currency display | supported-narrow | Admin chooses a preferred country currency; settlement requires audit. |
| Stock quantity | supported | Current field exists. |
| Purchase limit | planned | No current Admin create field identified. |
| Player ownership limit | planned | Not identified. |
| Mechanical effect | planned or metadata | Must not claim automatic effect without implementation. |
| Duration and stackability | planned | No authoritative lifecycle identified. |
| Redemption workflow | blocked on reconciled backend | Admin audit says wait for formal backend handoff. |
| Physical fulfillment | manual policy only | Requires instructor workflow and audit. |
| Cosmetic asset | metadata/asset | Requires Player support. |

## Inventory and redemption

Status: inventory supported in product architecture; redemption blocked on current `main`

Current product and backend work includes inventory concepts, but the July 18 Admin and Player audits explicitly block redemption integration until the reconciled backend contract is merged.

Do not yet seed products that require:

- reserved quantity;
- request, approve, reject, fulfill lifecycle;
- automated item consumption;
- Player redemption actions;
- Admin redemption queue.

Safe pilot product types before redemption support:

- non-redeemable informational catalog entries;
- cosmetics only if ownership and display are already authoritative;
- Store concepts marked planned and unavailable.

## Banking and loans

Status: planned for connected Player runtime until backend capability handoff confirms support

The Player Terminal defines action capabilities for:

- bank transfer;
- savings transfer;
- loan application;
- loan repayment;
- banking export.

Connected environments default these actions to disabled unless explicitly advertised. The runtime-readiness audit states that authoritative Store, Contracts, Market, Banking, Inventory, and redemption flows still require integration testing after backend reconciliation.

Seed implications:

- bank-product concepts may continue as design records;
- no interest accrual, repayment schedule, eligibility, or default mechanic should be represented as active until exact backend contracts are audited;
- ECO and local currency behavior must be resolved before product values are finalized.

## Progression and achievements

Status: planned or partially surfaced

The Player Terminal defines progression claim and unlock capabilities, but connected actions fail closed unless advertised.

No authoritative progression definition, threshold, claim, or achievement-storage contract has been verified in this audit.

Seed implications:

- level and achievement concepts remain design-only;
- contracts may mention possible progression mapping but not promise a live award;
- no progression reward should affect eligibility until authoritative support is confirmed.

## Notifications

Status: supported-narrow

Current Player architecture treats notifications as an optional shell resource and defines a notification-read capability.

Safe uses:

- transactional status produced by authoritative actions;
- event and briefing announcement;
- time-sensitive notice;
- route to a supported detail page.

Unsupported or unverified uses:

- persistent branching response options;
- character relationship state;
- decision aggregation;
- guaranteed delivery outside the application;
- scheduled delayed interaction engine.

Interim narrative delivery option:

- use read-only event news and notifications for briefings;
- use Contracts for structured player responses;
- use instructor-recorded resolution mode;
- do not present notification buttons as authoritative decisions until persistence exists.

## Story arcs and narrative state

Status: planned

No authoritative model has been verified for:

- story definition;
- story instance;
- stage;
- branch;
- decision record;
- character relationship;
- delayed consequence schedule;
- terminal resolution;
- follow-up arc selection.

Safe current treatment:

- global content definitions in documentation or a future content registry;
- event and contract metadata;
- instructor-led sequencing;
- notifications and news as read-only communication;
- session notes or scenario manifests only after an approved storage owner exists.

Unsafe treatment:

- storing current story stage globally;
- inferring resolution from unpersisted UI state;
- applying economic effects from client-side choices;
- exposing story surfaces as connected when capability support is absent.

## Interactions and collective decisions

Status: planned

The ten pilot interactions are production content concepts but no authoritative response persistence or aggregation contract has been verified.

First-pilot delivery recommendation:

1. Deliver opening and warning copy through supported notification/news/read surfaces.
2. Capture structured reasoning through Contracts.
3. Conduct country-team or classroom decision through an instructor-declared process.
4. Record the final scenario decision through an authorized Admin or future story endpoint.
5. Use the manual-compatible Meridian resolution model.

## Locations and map content

Status: country regions supported; sub-country locations planned

Current Player assets include country-region geometry. No authoritative database or route for 50–70 named locations has been verified.

Seed implications:

- country capital remains supported through country profiles;
- additional locations remain content metadata or visual annotations;
- no location-specific bonus, contract restriction, or business availability should be enforced until a location model exists;
- map interactions must retain a text/list alternative.

## Stable content IDs

Status: design standard approved; persistence unresolved

Recommended interim rules:

- use existing authoritative keys where they already exist: country code, currency code, ticker, item key, event key;
- store the full human-readable stable content ID only in metadata when the owning schema permits and uniqueness can be validated;
- do not replace UUID primary keys;
- do not assume metadata uniqueness across domains;
- create dedicated columns or registries only through a reviewed backend tranche.

## Technical seed format

Status: domain-specific, no unified importer

Current patterns include:

- country profiles and settings through migrations and backend domain contracts;
- global stock templates with trusted backend copy into a game session;
- Admin-created Contracts and Store items;
- runtime country snapshots and event-impact rows;
- frontend asset manifests.

Recommended architecture:

- one versioned content manifest;
- domain adapters that validate and load through each authoritative owner;
- no single script writing directly across unrelated tables;
- preflight only by default;
- explicit staging and production modes;
- idempotency by authoritative key plus content version;
- no overwrite of active runtime state.

## Current production blockers

1. Backend PR #158 and final Player capability handoff are not yet merged on the audited baseline.
2. ECO and local-currency transaction boundary is not fully reconciled across all economic systems.
3. Story, interaction, collective-decision, and delayed-effect persistence are not authoritative.
4. Redemption remains blocked.
5. Banking and progression contracts require direct backend audit.
6. Contract chains and prerequisites are not currently enforced.
7. Named sub-country locations lack an authoritative model.
8. Stable content-ID persistence lacks an approved owner.
9. Seed-pack importer and preflight system do not exist as one reviewed workflow.

## Approved next implementation-analysis work

- inspect current Attendance, Contract payout, Store purchase, and ledger currency paths;
- inspect exact stock-template schema and existing seeded templates;
- inspect current banking, progression, notification, inventory, and redemption backend contracts after PR #158 status is resolved;
- produce a field-by-field pilot DTO proposal without implementing it;
- classify each event effect as direct supported delta, derived market shock, narrative-only metadata, or blocked;
- define the first staging manifest and validation report format;
- keep all implementation work in a later bounded backend/content tranche.