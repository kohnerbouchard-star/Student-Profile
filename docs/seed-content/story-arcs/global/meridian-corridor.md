# The Meridian Corridor

Stable content ID: `story-arc.global.meridian-corridor.v1`
Content type: story arc
Version: 1.0.0-draft
Maturity: draft
Owner domain: narrative and world events
Scope: global, game-session runtime instances
Scenario compatibility: standard classroom, policy-intensive, crisis-response, sandbox optional
Implementation status: content definition only; runtime state mapping pending

## Purpose

The Meridian Corridor is the first production-shaped global arc. It connects all ten countries through infrastructure, trade, energy, data, finance, research, food security, industry, and governance.

It is designed to generate:

- country-specific briefings;
- competing policy and financing proposals;
- company and market exposure;
- contracts;
- interactions;
- news;
- a cybersecurity and logistics disruption;
- multi-stage decisions;
- several valid resolutions;
- follow-up arcs.

## Player-facing summary

The ten countries are considering a shared economic corridor linking ports, rail, energy, customs, data systems, commodity terminals, and research infrastructure.

The project could reduce trade costs and improve resilience. It could also concentrate debt, ownership, data access, and political influence.

Players will analyze proposals, respond to disruptions, and help determine what kind of Corridor is built—or whether it proceeds at all.

## Central economic question

How should countries finance and govern shared infrastructure when every efficient arrangement creates a different form of dependence?

## Central learning objectives

- comparative advantage;
- international interdependence;
- public goods and infrastructure;
- debt and equity;
- transaction costs;
- externalities;
- risk and resilience;
- short-term versus long-term trade-offs;
- institutional design;
- information uncertainty.

## Countries and roles

- Northreach: strategic minerals, energy, cold-climate logistics.
- Yrethia: regulated shipping, insurance, customs, freight finance.
- Thaloris: repair, overflow routing, bonded trade, disruption capacity.
- Solvend: systems design, AI, satellite, predictive maintenance.
- Eldoran: food, commodities, central rail, wholesale distribution.
- Valerion: clean energy, water systems, green finance.
- Lumenor: negotiations, oversight, arbitration, public legitimacy.
- Xalvoria: infrastructure finance, capital, project management.
- Dravenlok: steel, rail equipment, vehicles, heavy construction.
- Syndalis: cybersecurity, payment verification, data infrastructure.

## Core institutions

- `institution.lumenor.starfall-meridian-forum.v1`
- `institution.northreach.strategic-resources-office.v1`
- `institution.yrethia.maritime-insurance-council.v1`
- `institution.thaloris.dusk-harbor-commercial-authority.v1`
- `institution.solvend.advanced-systems-consortium.v1`
- `institution.eldoran.commodity-stability-board.v1`
- `institution.valerion.water-energy-commission.v1`
- `institution.xalvoria.development-authority.v1`
- `institution.dravenlok.industrial-coordination-ministry.v1`
- `institution.syndalis.network-security-directorate.v1`

## Core characters

- `character.lumenor.ila-meren.v1`
- `character.northreach.darek-voss.v1`
- `character.yrethia.mira-sen.v1`
- `character.thaloris.tovan-rell.v1`
- `character.solvend.sena-oris.v1`
- `character.eldoran.halden-marr.v1`
- `character.valerion.elia-varen.v1`
- `character.xalvoria.cassian-rhyl.v1`
- `character.dravenlok.mara-volsk.v1`
- `character.syndalis.neris-vale.v1`

## Entry requirements

Required:

- game session active;
- country assignment complete where country-specific content is used;
- global story capability available or represented through content-compatible event and notification surfaces;
- no prior terminal Meridian resolution in the same session.

Optional scenario conditions:

- policy rate moderately restrictive;
- trade volume elevated;
- food inflation pressure;
- no existing systemic event that would make the Corridor discussion implausible.

## Arc stages

### Stage 0: Available

The scenario profile enables the Meridian arc.

No player-facing content has been issued.

Transition:

- instructor activation;
- scenario schedule;
- approved automatic activation.

### Stage 1: Forum announced

Primary event:

`event.meridian.forum-announced.v1`

Player content:

- global news report;
- country briefing;
- introductory interaction from Ila Meren;
- first analysis contract.

Exit conditions:

- briefing delivered;
- required introductory contract available;
- country perspectives initialized.

### Stage 2: Competing models

Four broad approaches become visible.

#### Finance-first

Lead: Xalvoria

Benefits:

- rapid funding;
- centralized management;
- clear execution authority.

Costs:

- concentrated credit risk;
- asset-control concerns;
- political dependency.

#### Multilateral governance

Lead: Lumenor

Benefits:

- legitimacy;
- shared oversight;
- broad participation.

Costs:

- delay;
- administration;
- weaker single-point accountability.

#### Trade and logistics

Lead: Yrethia, with conditional Thaloris participation.

Benefits:

- commercial discipline;
- route flexibility;
- port-driven efficiency.

Costs:

- geographic inequality;
- insurance and compliance disputes;
- concentration around maritime hubs.

#### Industrial security

Lead contributors: Dravenlok and Northreach.

Benefits:

- domestic capacity;
- strategic supply;
- employment and industrial investment.

Costs:

- higher political tension;
- lower openness;
- risk of inefficient guarantees.

Players do not choose a single model through one global button. Contracts and decisions accumulate support, conditions, and modifications.

### Stage 3: Capacity warnings

Events may activate in controlled sequence:

- `event.meridian.sableport-capacity-warning.v1`
- `event.meridian.eldoran-harvest-revision.v1`
- `event.meridian.northreach-export-review.v1`
- `event.meridian.valerion-reservoir-warning.v1`
- `event.meridian.solvend-talent-constraint.v1`

Design rule:

The standard classroom profile should not activate all warnings simultaneously. Use two or three, preserving cognitive load and allowing country variation.

### Stage 4: Customs security intrusion

Primary event:

`event.meridian.customs-security-intrusion.v1`

Effects:

- cargo records disputed;
- payment verification delayed;
- insurance risk rises;
- selected companies react;
- security interaction opens;
- emergency contracts become available.

Attribution remains unresolved during the initial decision window.

### Stage 5: Emergency operating decision

Strategic options:

1. Broad temporary Syndalian access with expiry and audit.
2. Federated national response.
3. Technical assistance with independent oversight.
4. Manual verification and reduced throughput.
5. Limited Corridor suspension.

The exact available options may depend on prior trust, scenario profile, and technical support. Options not supported by runtime mechanics can remain narrative recommendations rather than direct system switches.

### Stage 6: Governance and financing resolution

Resolution scoring or conditions should consider:

- participation;
- infrastructure funding;
- debt concentration;
- compliance and insurance;
- resource and industrial commitments;
- environmental safeguards;
- data governance;
- crisis response outcome;
- legitimacy and trust.

Possible terminal resolutions:

#### Centralized Corridor

A lead finance-and-technology structure controls most implementation.

Benefits:

- fastest initial build;
- clear accountability;
- strong short-term construction demand.

Costs:

- concentrated ownership and data control;
- greater dependency backlash;
- systemic single-point risk.

#### Multilateral Corridor

Shared charter, oversight, and distributed participation.

Benefits:

- legitimacy;
- balanced access;
- resilience through shared governance.

Costs:

- slower build;
- higher administrative expense;
- more compromise.

#### Regional Corridors

Countries form smaller bloc-level systems.

Benefits:

- tailored standards;
- greater local control;
- reduced global concentration.

Costs:

- duplicated infrastructure;
- higher transaction cost;
- intensified bloc rivalry.

#### Suspended Corridor

The project is delayed or cancelled.

Benefits:

- avoids immediate dependency and unresolved security risk.

Costs:

- lost confidence;
- weaker growth;
- unemployment and stranded planning;
- unresolved infrastructure problems.

### Stage 7: Follow-up

A follow-up arc is selected based on the resolution.

Examples:

- centralized: dependency and oversight backlash;
- multilateral: standards harmonization and funding delay;
- regional: trade fragmentation and bloc competition;
- suspended: recession pressure and smaller bilateral projects.

## Contract chain

- `contract.meridian.evaluate-corridor.v1`
- `contract.meridian.analyze-country-exposure.v1`
- `contract.meridian.compare-financing-governance.v1`
- `contract.meridian.respond-first-disruption.v1`
- `contract.meridian.review-outcome.v1`

## Major decision points

### Decision A: Financing conditions

Question:

What level of control should financiers receive in exchange for speed and lower initial funding costs?

### Decision B: Capacity response

Question:

Should countries reduce commitments, invest, reroute, ration capacity, or accept higher risk?

### Decision C: Security access

Question:

How much access is justified during a digital emergency, and who reviews it?

### Decision D: Governance

Question:

How should voting, oversight, and contribution be balanced?

## Economic effect design

Effects must use approved semantic classes until technical mapping.

Expected directions:

- construction and heavy industry: positive during funded build; negative after suspension;
- trade and logistics: positive when routes open; congestion risk during expansion;
- finance: positive fee and lending opportunity; negative concentration and default risk;
- technology and cyber: positive contract demand; trust and outage risk;
- food and energy: export opportunity with domestic affordability and reserve pressure;
- currencies: differentiated based on capital, trade, resource, and trust effects.

No event should move all companies in one direction without a systemic justification.

## Failure and recovery

Failure is not a dead end.

If negotiations collapse:

- smaller bilateral contracts open;
- confidence and investment decline moderately;
- countries retain opportunities to build regional alternatives;
- a recovery forum may reopen after defined conditions.

If the security response fails:

- manual and regional systems remain possible;
- independent investigation and remediation contracts open;
- trust recovery requires evidence, not time alone.

## Classroom reflection

At resolution, players should answer:

- Which country gained the most and why?
- Which risk was reduced?
- Which risk was transferred to someone else?
- Did faster construction justify greater concentration?
- How did uncertainty affect the security decision?
- Which consequences appeared later than expected?

## Assets

Potential assets:

- Corridor overview map;
- route and infrastructure diagrams;
- institution portraits and emblems;
- news-event illustrations;
- decision comparison cards.

All map and route assets must remain fictional and compatible with existing map regions.

## Validation

- all ten country perspectives exist;
- all referenced entities exist;
- standard profile activates limited simultaneous warnings;
- every major resolution is reachable;
- no resolution is universally superior;
- severe effects have recovery;
- choices do not assume unsupported runtime control;
- event instances remain session scoped;
- news does not reveal unconfirmed attribution;
- follow-up content matches actual resolution.

## Open technical questions

- What current backend surface can own global and country story state?
- Can events and interactions be represented independently of notifications?
- Can collective support for models be recorded without a voting system?
- Which economic effects can be applied authoritatively today?
- How should accepted contracts behave if an arc is cancelled or superseded?
- Can the capability manifest expose narrative systems as planned until supported?

## Review status

- economic review: pending
- narrative review: pending
- gameplay and learning review: pending
- technical compatibility review: pending

## Change log

- 1.0.0-draft: initial production-shaped global arc definition.