# Country Baseline and Viability Model

Status: production-design draft
Owner domain: country economics and balance review
Implementation status: simulation specification; differentiated baseline loading is not supported by the current game-level baseline model

## Purpose

Define how Econovaria country starting conditions should be evaluated for fairness, differentiation, resilience, and recovery before production values are approved.

This model is a design and validation tool. Its composite scores are not intended for player-facing display.

## Current authoritative initializer

The current country-snapshot initializer reads one game-level baseline record and applies the same baseline values to every active country in the game session.

Current default values:

| Indicator | Default |
|---|---:|
| Real GDP index | 100.0000 |
| GDP growth rate | 0.000000 |
| Inflation rate | 0.000000 |
| Unemployment rate | 0.050000 |
| Interest rate | 0.030000 |
| Consumer confidence | 100.0000 |
| Business confidence | 100.0000 |
| Cost-of-living index | 1.0000 |
| Regional price multiplier | 1.0000 |
| Supply-constraint index | 1.0000 |
| Import-dependency index | 1.0000 |
| Tax rate | 0.000000 |
| Subsidy rate | 0.000000 |
| Exchange-rate index | 1.0000 |
| Currency-stability index | 1.0000 |
| Trade-balance index | 0.0000 |
| Export-strength index | 1.0000 |
| Market-risk index | 1.0000 |
| Political-stability index | 1.0000 |
| Infrastructure index | 1.0000 |
| Energy-security index | 1.0000 |

## Current implementation constraint

`game_country_economic_baseline_settings` is game-session scoped but not country-profile scoped.

Consequences:

- one game baseline cannot currently store ten differentiated country rows;
- the initializer cannot choose a country-specific baseline from that table;
- differentiated values would require one of:
  - a reviewed per-country baseline schema;
  - a trusted post-initialization country-snapshot adjustment process;
  - scenario event impacts applied after initialization;
  - continued neutral starts with differentiation expressed elsewhere.

## Recommended first production policy

For the first production content release:

1. Keep the authoritative shared neutral baseline unless a separate backend tranche approves per-country baselines.
2. Express country differentiation through:
   - official lore;
   - company and stock-template exposure;
   - country-specific events;
   - country-specific Contracts;
   - local currencies and exchange conditions;
   - scenario-selected opening warnings;
   - institutions and choices.
3. Do not write candidate country values directly into runtime tables through an unreviewed cross-domain script.
4. Use the candidate profiles below for balance simulation and future schema planning.

## Candidate differentiated baseline pack

Pack ID: `baseline-pack.meridian-standard.candidate-v1`

Maturity: simulation candidate only

These values remain within current backend bounds and reflect the starting-world premise of positive but slowing growth, moderate inflation pressure, and controlled instability.

### Summary table

| Country | GDP | Growth | Inflation | Unemployment | Interest | Consumer confidence | Business confidence | Cost of living | Regional price | Supply constraint | Import dependency | Tax | Subsidy | FX index | Currency stability | Trade balance | Export strength | Market risk | Political stability | Infrastructure | Energy security |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Northreach | 103 | .025 | .035 | .045 | .040 | 98 | 108 | 1.12 | 1.15 | 1.10 | 1.18 | .23 | .06 | 1.02 | 1.08 | 18 | 1.18 | 1.08 | 1.08 | 1.05 | 1.25 |
| Yrethia | 108 | .025 | .030 | .040 | .035 | 105 | 108 | 1.12 | 1.10 | .92 | 1.12 | .20 | .03 | 1.04 | 1.15 | 12 | 1.20 | .92 | 1.18 | 1.22 | .90 |
| Thaloris | 92 | .035 | .045 | .060 | .060 | 95 | 104 | .86 | .88 | 1.00 | 1.10 | .12 | .02 | .92 | .95 | 6 | 1.10 | 1.16 | .95 | 1.00 | .92 |
| Solvend | 110 | .040 | .032 | .035 | .045 | 108 | 116 | 1.18 | 1.15 | 1.12 | 1.28 | .24 | .07 | 1.07 | 1.10 | 8 | 1.16 | 1.18 | 1.20 | 1.25 | .88 |
| Eldoran | 102 | .022 | .040 | .050 | .035 | 101 | 103 | .96 | .94 | .90 | .88 | .18 | .05 | 1.01 | 1.06 | 15 | 1.17 | .90 | 1.12 | 1.12 | .95 |
| Valerion | 115 | .018 | .028 | .035 | .030 | 114 | 108 | 1.22 | 1.20 | .92 | 1.08 | .27 | .08 | 1.10 | 1.22 | 2 | 1.04 | .88 | 1.22 | 1.30 | 1.15 |
| Lumenor | 104 | .018 | .026 | .045 | .030 | 110 | 102 | 1.06 | 1.05 | .96 | 1.15 | .26 | .09 | 1.05 | 1.18 | -5 | .95 | .85 | 1.30 | 1.15 | .92 |
| Xalvoria | 120 | .030 | .040 | .040 | .040 | 108 | 118 | 1.25 | 1.18 | .95 | 1.02 | .19 | .04 | 1.12 | 1.20 | 7 | 1.15 | 1.10 | 1.04 | 1.32 | 1.05 |
| Dravenlok | 112 | .018 | .043 | .055 | .055 | 97 | 100 | .90 | .92 | 1.05 | 1.12 | .17 | .10 | .95 | .98 | 8 | 1.20 | 1.12 | 1.00 | 1.16 | .90 |
| Syndalis | 109 | .038 | .034 | .040 | .045 | 100 | 115 | 1.15 | 1.14 | .94 | 1.17 | .16 | .04 | 1.08 | 1.05 | 9 | 1.13 | 1.22 | .90 | 1.28 | .93 |

## Candidate rationale by country

### Northreach

- above-neutral export and energy security;
- high import dependency and regional cost;
- moderate market risk and infrastructure;
- viable but not automatically dominant during resource booms.

### Yrethia

- strong infrastructure, export strength, currency stability, and political stability;
- lower energy security and higher import dependency;
- strong service economy with concentration in trade routes.

### Thaloris

- low cost base and positive growth opportunity;
- weaker stability, higher rates, and higher market risk;
- improved from a punitive low-trust profile so the country remains viable in stable sessions.

### Solvend

- highest growth and business confidence tier;
- strong infrastructure and political stability;
- high import dependency, supply pressure, market risk, cost of living, and lower energy security.

### Eldoran

- strong trade, export, supply, and import-resilience position;
- moderate inflation and ordinary confidence;
- balanced stability rather than premium finance or technology growth.

### Valerion

- strongest stability and infrastructure tier;
- high cost of living and regional prices;
- lower growth and export strength than the leading growth economies;
- resilience rather than universal economic superiority.

### Lumenor

- strongest institutional stability and consumer confidence tier;
- low export strength and negative trade balance;
- moderate import and energy dependence;
- public-service resilience with slower commercial growth.

### Xalvoria

- highest GDP, business confidence, and infrastructure tier;
- high cost of living, concentration risk, and only moderate political stability;
- finance creates opportunity and systemic exposure.

### Dravenlok

- high GDP and export capacity;
- elevated inflation, rates, supply and import pressure;
- moderate risk rather than a permanently distressed starting state;
- industrial scale balanced by energy and component dependence.

### Syndalis

- high growth, business confidence, infrastructure, and export capacity;
- elevated market and political risk;
- high import dependency and cost;
- strong opportunity with trust and concentration exposure.

## Viability scoring model

The scoring model is a diagnostic, not a gameplay rule.

### Pillar A: Opportunity

Inputs:

- GDP growth;
- business confidence;
- export strength;
- infrastructure.

Purpose:

Measures ability to create contracts, investment, company growth, and trade opportunities.

### Pillar B: Household resilience

Inputs:

- inverse inflation;
- inverse unemployment;
- consumer confidence;
- inverse cost of living.

Purpose:

Measures how much pressure ordinary players and consumers face at the start.

### Pillar C: External resilience

Inputs:

- inverse import dependency;
- currency stability;
- trade balance;
- energy security.

Purpose:

Measures ability to absorb foreign price, trade, and energy shocks.

### Pillar D: System resilience

Inputs:

- inverse market risk;
- political stability;
- inverse supply constraint;
- infrastructure.

Purpose:

Measures ability to maintain ordinary economic operation under stress.

### Composite weights

- Opportunity: 30%
- Household resilience: 25%
- External resilience: 25%
- System resilience: 20%

### Candidate diagnostic results

| Country | Opportunity | Household | External | System | Composite |
|---|---:|---:|---:|---:|---:|
| Northreach | 58.3 | 54.5 | 64.0 | 46.5 | 56.4 |
| Yrethia | 66.4 | 62.8 | 52.1 | 72.9 | 63.2 |
| Thaloris | 54.4 | 56.1 | 41.7 | 40.9 | 48.9 |
| Solvend | 78.9 | 62.4 | 40.3 | 55.0 | 60.4 |
| Eldoran | 55.7 | 60.4 | 61.6 | 68.0 | 60.8 |
| Valerion | 58.3 | 66.0 | 62.4 | 79.4 | 65.5 |
| Lumenor | 43.2 | 69.1 | 44.5 | 75.7 | 56.5 |
| Xalvoria | 77.7 | 53.6 | 62.3 | 62.8 | 64.9 |
| Dravenlok | 54.7 | 57.9 | 42.4 | 48.7 | 51.2 |
| Syndalis | 76.9 | 56.4 | 45.2 | 51.2 | 58.7 |

## Baseline acceptance thresholds

A candidate baseline pack passes first-stage viability when:

- every country composite is at least 45;
- no pillar is below 35;
- highest-to-lowest composite spread is no greater than 20 points;
- every country has at least one pillar at or above 55;
- no country has all four pillars above 75;
- no country is simultaneously top-three in growth, household resilience, external resilience, and system resilience;
- every country has at least one material weakness reflected in its lore;
- every low pillar is offset by meaningful contract and market opportunity.

Candidate pack result:

- minimum composite: 48.9;
- maximum composite: 65.5;
- spread: 16.6;
- first-stage diagnostic: pass;
- production status: not approved until stress testing and technical support are complete.

## Required stress scenarios

### Shared scenarios

Every country must be tested under:

1. High interest rate.
2. Global trade contraction.
3. Food and cost-of-living pressure.
4. Energy-price or energy-security shock.
5. Cyber and confidence shock.
6. Recovery period.

### Country-specific scenarios

- Northreach: commodity decline plus route disruption.
- Yrethia: congestion plus insured loss.
- Thaloris: insurance withdrawal plus compliance review.
- Solvend: talent constraint plus component shortage.
- Eldoran: harvest downgrade plus rail bottleneck.
- Valerion: reservoir warning plus tourism decline.
- Lumenor: budget cut plus trust crisis.
- Xalvoria: foreign default plus capital outflow.
- Dravenlok: energy shock plus export restriction.
- Syndalis: platform breach plus external access restriction.

## Stress acceptance thresholds

Under one moderate country-specific shock:

- composite remains at least 35;
- no pillar falls below 25 without a visible emergency-response path;
- at least one viable Contract, market, or policy response remains available;
- no country loses access to all major gameplay systems;
- expected recovery reaches at least 85% of the baseline composite within three approved adjustment periods.

Under the standard profile’s maximum concurrent stress:

- no more than two moderate warnings plus one global major event;
- cumulative country delta remains within the approved event cap;
- at least one recovery path is available before another severe event can activate;
- instructor override cannot bypass hard minimum and maximum indicator bounds.

## Fairness beyond macro scores

Country viability must also include:

- equal access to introductory Contract rewards;
- equivalent number of meaningful country-specific Contracts;
- at least three stocks with diversified risk once the market catalog reaches target scale;
- Store affordability after currency conversion;
- no country assignment preventing bank, inventory, or progression access;
- equivalent tutorial and notification quality;
- no country-specific event requiring more background knowledge without additional support.

## Scenario simulation outputs

Each simulation run should record:

- baseline pack version;
- scenario profile;
- country;
- initial snapshot;
- applied event IDs;
- semantic and numeric deltas;
- capped deltas;
- resulting snapshot;
- pillar and composite scores;
- gameplay surfaces remaining available;
- recovery sequence;
- periods to recovery;
- threshold violations;
- reviewer notes.

## Technical implementation options

### Option 1: Shared neutral baseline only

Current-compatible and recommended for the first production release.

### Option 2: Per-country baseline table

Requires backend schema and initializer work.

Potential record key:

- game session;
- country profile;
- baseline version.

Must preserve:

- one active baseline per country per session;
- validated ranges;
- audit history;
- no browser ownership selection.

### Option 3: Scenario initialization impacts

Apply reviewed country-specific event or initialization deltas after neutral snapshot creation.

Risks:

- initialization may appear as a runtime event;
- replay and idempotency must be explicit;
- source and rationale must be visible;
- should not create false news unless the change represents an actual event.

### Option 4: Template-to-session copy

Create global country-baseline templates and copy through a trusted backend process, analogous to stock templates.

This is likely the cleanest long-term model if differentiated starting conditions become a core product requirement.

## Recommended long-term architecture

Use versioned global country-baseline templates copied into game-session country baseline records by a trusted backend process.

Do not implement this inside the documentation tranche.

## Blocking work

1. Approve whether first production uses shared or differentiated starts.
2. Define semantic-to-numeric event bands.
3. Verify the authoritative event-application path and idempotency.
4. Run the listed stress scenarios.
5. Test Store affordability and Contract reward parity under local currencies.
6. Reassess candidate values after company and exchange-rate data are complete.
7. Approve or revise the candidate pack through economic review.

## Review status

- economic review: candidate passes first-stage diagnostic; stress testing required
- narrative review: candidate aligns with country identities
- gameplay review: fairness beyond macro values still required
- technical review: differentiated runtime loading unsupported by current baseline schema