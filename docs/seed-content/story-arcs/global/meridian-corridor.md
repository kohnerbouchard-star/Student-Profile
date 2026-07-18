# The Meridian Corridor

Stable content ID: `story-arc.global.meridian-corridor.v1`
Content type: global story arc
Version: 1.1.0-draft
Maturity: draft
Owner domain: narrative and world events
Scope: global definition with game-session runtime instances
Scenario compatibility: standard immigrant campaign, market-intensive, policy-intensive, crisis-response, peaceful sandbox optional
Implementation status: content definition only; player-background, residency, relationship, war-state, and branching persistence remain pending

## Purpose

The Meridian Corridor is the central opening arc for Econovaria.

It connects all ten countries through infrastructure, trade, energy, data, finance, research, food security, industry, migration, and governance.

Under the revised premise, the Corridor serves three narrative functions:

1. It creates the boom that attracts the immigrant player.
2. It exposes the dependencies and rivalries that divide the ten countries.
3. An attack against the Meridian system becomes the spark that may turn economic conflict into war.

The arc must be experienced through the player's attempt to build a life and fortune, not only through policy analysis.

## Player-facing premise

You have recently arrived in one of Econovaria's ten countries.

You came during the Meridian boom, when employers, banks, contractors, technology firms, ports, manufacturers, and public institutions are preparing for the largest infrastructure project in modern Econovarian history.

You have temporary status, limited money, one local contact, and an opportunity to move upward.

The Corridor may create the career, business, or investment opportunity that changes your life.

It may also become the fault line that divides the world.

## Central dramatic question

What are you willing to risk, protect, or become in order to build a fortune and a home in a country moving toward war?

## Central economic question

How should countries finance and govern shared infrastructure when every efficient arrangement creates a different form of dependence?

## Central learning objectives

- comparative advantage;
- international interdependence;
- migration and labor markets;
- public goods and infrastructure;
- debt and equity;
- transaction costs;
- supply chains;
- inflation and shortages;
- risk and resilience;
- sanctions and capital controls;
- externalities;
- information uncertainty;
- opportunity cost;
- short-term versus long-term trade-offs;
- institutional legitimacy;
- distribution of wartime gains and losses.

## Countries and roles

- Northreach: strategic minerals, energy, northern logistics, and resource leverage.
- Yrethia: regulated shipping, customs, insurance, and freight finance.
- Thaloris: repair, overflow routing, bonded trade, and emergency logistics.
- Solvend: systems design, advanced technology, AI, satellites, and predictive maintenance.
- Eldoran: food, commodities, central rail, and wholesale distribution.
- Valerion: clean energy, water systems, environmental standards, and green finance.
- Lumenor: diplomacy, arbitration, public information, migration coordination, and institutional legitimacy.
- Xalvoria: infrastructure finance, capital, project management, and ownership leverage.
- Dravenlok: steel, rail equipment, machinery, vehicles, and heavy construction.
- Syndalis: cybersecurity, payment verification, data infrastructure, and emergency network access.

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

## Core existing characters

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

## Required personal relationship roles

Each adopted country should eventually provide local equivalents of:

- sponsor or settlement contact;
- local friend;
- rival immigrant;
- employer, client, or investor;
- journalist or investigator;
- community representative;
- residency or security official;
- person connected to the player's former home.

The existing institutional characters should connect to the player through work, Contracts, public decisions, news, or investigation. They should not replace the personal relationship layer.

## Entry requirements

Required:

- game session active;
- country assignment complete;
- player session active;
- no prior terminal Meridian resolution in the same session;
- story content available through supported surfaces or explicitly represented as planned.

Planned requirements when supported:

- player background recorded;
- temporary residency state initialized;
- one local contact assigned;
- one former-home obligation initialized;
- starting work or business lead available.

## Arc stages

### Stage 0: Arrival

The player enters the adopted country.

Player-facing content:

- arrival and residency briefing;
- temporary housing information;
- starting financial position;
- introduction to a sponsor or local contact;
- first work, training, or business lead;
- first obligation connected to the former home.

Design goal:

The player should understand what they personally want before receiving a full explanation of international politics.

### Stage 1: Meridian boom

The Starfall Meridian Forum is announced.

Primary event:

`event.meridian.forum-announced.v1`

Player-facing effects:

- job and Contract growth;
- expanding logistics, construction, finance, technology, and service demand;
- housing and cost pressure in boom regions;
- company and market opportunity;
- country briefing delivered through practical relevance;
- introduction to Meridian institutions and characters.

The player should have time to earn money, form relationships, and make progress before the crisis escalates.

### Stage 2: Competing models

Four broad approaches become visible.

#### Finance-first

Lead: Xalvoria

Benefits:

- rapid funding;
- centralized execution;
- immediate employment and construction demand.

Costs:

- concentrated credit risk;
- asset-control concerns;
- political dependency;
- pressure on local ownership and small firms.

#### Multilateral governance

Lead: Lumenor

Benefits:

- legitimacy;
- shared oversight;
- broader access;
- stronger correction and appeal mechanisms.

Costs:

- delay;
- administrative expense;
- weaker single-point accountability;
- slower arrival of jobs and investment.

#### Trade and logistics

Lead: Yrethia, with conditional Thaloris participation

Benefits:

- commercial discipline;
- route flexibility;
- port-driven efficiency;
- opportunities for traders and logistics workers.

Costs:

- geographic inequality;
- insurer and compliance disputes;
- concentration around maritime hubs;
- exclusion of operators unable to meet standards.

#### Industrial security

Lead contributors: Dravenlok and Northreach

Benefits:

- domestic capacity;
- strategic supply;
- employment;
- reduced dependence on selected foreign inputs.

Costs:

- higher political tension;
- lower openness;
- inefficient guarantees;
- risk that civilian infrastructure becomes tied to security planning.

Players do not select one global model through a single button. Their Contracts, investments, work, relationships, and recommendations accumulate support, conditions, and exposure.

### Stage 3: Fracture

Controlled warnings begin to affect daily life.

Possible events:

- `event.meridian.sableport-capacity-warning.v1`
- `event.meridian.eldoran-harvest-revision.v1`
- `event.meridian.northreach-export-review.v1`
- `event.meridian.valerion-reservoir-warning.v1`
- `event.meridian.solvend-talent-constraint.v1`

Additional pressures:

- rent and housing pressure;
- employer competition for migrants and specialists;
- foreign-resident documentation reviews;
- strategic stockpiling;
- hostile political rhetoric;
- increased security procurement;
- capital and inventory movement.

Do not activate every warning at once. Use a limited sequence that creates understandable escalation and different player experiences.

### Stage 4: Customs security intrusion

Primary event:

`event.meridian.customs-security-intrusion.v1`

Effects:

- cargo records disputed;
- payment verification delayed;
- insurance risk rises;
- selected companies react;
- emergency Contracts open;
- security access becomes contested;
- public accusations begin.

Attribution remains unresolved.

This is a warning and investigation phase, not yet the war-starting attack.

### Stage 5: Meridian attack

A coordinated physical and digital attack damages a major Meridian transport, customs, payment, or data node during a high-value shipment.

Required consequences:

- civilian harm described without spectacle;
- infrastructure damage;
- missing or destroyed cargo;
- communications or payment interruption;
- emergency border controls;
- conflicting official statements;
- market and currency volatility;
- a direct personal consequence for the player or a recurring relationship.

Attribution rules:

- initial evidence is incomplete;
- accusation is not confirmation;
- later corrections preserve earlier records;
- the player may influence which evidence is surfaced, trusted, or challenged;
- the underlying explanation remains coherent within the scenario.

### Stage 6: Emergency response

Strategic responses may include:

1. Temporary shared security access with expiry and audit.
2. Federated national response.
3. Technical assistance with independent oversight.
4. Manual verification and reduced throughput.
5. Limited Corridor suspension.
6. Emergency rerouting.
7. Temporary resource and food controls.
8. Temporary financial and transfer restrictions.

The player's role may be economic, investigative, advisory, logistical, financial, or community-based. The player does not receive unsupported authority over national systems.

### Stage 7: Outbreak of war

Retaliation, alliance obligations, border incidents, and mobilization turn the crisis into open conflict.

Prior choices affect:

- preparedness;
- civilian protection;
- route resilience;
- public trust;
- institutional legitimacy;
- available evidence;
- economic severity;
- treatment of foreign residents;
- access to emergency work and finance.

The player does not single-handedly decide whether war exists.

### Stage 8: Fortune during war

The wartime economy opens and closes opportunities.

Possible paths include:

- food distribution;
- emergency logistics;
- strategic manufacturing;
- cybersecurity;
- repair;
- reconstruction;
- public finance;
- risk analysis;
- emergency lending;
- translation and cross-border mediation;
- distressed investment;
- high-risk informal commerce represented only through abstract choices and consequences.

Each path must expose:

- source of profit;
- legal or reputational risk;
- affected people;
- relationship consequences;
- long-term dependency.

The game does not provide operational instruction for unlawful conduct.

### Stage 9: Belonging

The player's adopted country may impose new expectations on foreign-born residents.

Possible pressures:

- enhanced residency review;
- travel restrictions;
- disclosure of foreign contacts;
- transfer controls;
- public-service requests;
- citizenship or permanent-status decisions;
- public loyalty pressure;
- security interviews.

At the same time, a person or community connected to the player's former home may require help.

The player must decide how to balance safety, ambition, loyalty, and responsibility.

### Stage 10: Reckoning

The world and personal story resolve separately.

Possible world outcomes:

- negotiated reconstruction;
- centralized stabilization;
- divided economic blocs;
- fragmented regional conflict;
- suspended Meridian order;
- authoritarian peace.

Possible personal ending families:

- The Citizen;
- The Magnate;
- The Builder;
- The Broker;
- The Reformer;
- The Collaborator;
- The Exile;
- The Community Leader;
- The Survivor;
- The Stateless Financier.

Wealth does not determine moral or social success.

## Contract chain

Existing pilot Contracts remain relevant but require revised player framing:

- `contract.meridian.evaluate-corridor.v1`
- `contract.meridian.analyze-country-exposure.v1`
- `contract.meridian.compare-financing-governance.v1`
- `contract.meridian.respond-first-disruption.v1`
- `contract.meridian.review-outcome.v1`

Future Contract families are needed for:

- arrival and employment;
- business formation;
- residency and documentation;
- remittances and foreign obligations;
- attack investigation;
- emergency supply;
- civilian assistance;
- wartime compliance;
- reconstruction;
- peace and accountability.

## Major player decisions

### Economic path

How will the player pursue stability and wealth?

### Financing and ownership

What control should financiers receive in exchange for speed and capital?

### Capacity and shortage response

Should actors invest, ration, reroute, substitute, or accept higher risk?

### Security access

How much emergency access is justified, and who reviews it?

### Attribution and evidence

What should the player report, challenge, verify, or delay when evidence is incomplete?

### Wartime profit

Which opportunities are acceptable when profit comes from scarcity, displacement, or public emergency?

### Belonging

What does the player owe the adopted country, the former home, personal relationships, and themselves?

## Economic effect design

Effects must use approved semantic classes until technical mapping.

Expected directions:

- construction and heavy industry rise during the boom and selected emergency procurement, but face resource, labor, and damage risk;
- trade and logistics gain from expansion and emergency demand, but face closures, congestion, restrictions, and insurance pressure;
- finance gains fees and lending opportunity, but faces defaults, controls, concentration, and political backlash;
- technology and cyber gain demand, but face trust, surveillance, sabotage, and access disputes;
- food and energy gain export and procurement demand, but create domestic affordability and reserve pressure;
- housing demand rises in safe and booming regions while affordability worsens;
- currencies react differently to capital, trade, security, resource, and trust effects;
- migrant labor may be economically demanded while legally or socially restricted.

No event should move every company or country in one direction without systemic justification.

## Failure and recovery

Failure is not a dead end.

Examples:

- job loss opens retraining, lower-status work, relocation, or sponsorship choices;
- business failure opens restructuring or partnership;
- denied travel opens appeal, local adaptation, or alternate-route content;
- damaged reputation can be rebuilt through evidence and action;
- a failed investment reduces wealth but does not automatically remove the player;
- Corridor collapse opens regional and reconstruction paths.

## Classroom reflection

At resolution, players should answer:

- How did immigration status shape opportunity and risk?
- What created the player's wealth or losses?
- Who benefited from the player's decisions?
- Who bore costs the player did not initially see?
- Which evidence was reliable?
- Which decision returned later?
- Did the player gain belonging, security, wealth, or influence?
- Did personal success improve or worsen the world outcome?

## Validation

- the player has a personal goal before the political briefing expands;
- the boom provides real opportunity before escalation;
- all ten country perspectives exist;
- immigration affects opportunity or relationships;
- the customs intrusion and Meridian attack remain distinct;
- attack attribution remains uncertain until supported;
- war is experienced primarily through civilian and economic consequences;
- multiple economic strategies remain viable;
- wealth and world success remain separate;
- every major stage affects personal, economic, and political layers;
- no country is inherently moral or immoral;
- no unsupported national authority is assigned to the player;
- event and relationship state remain session scoped.

## Open technical questions

- What backend surface owns global, country, personal, and relationship story state?
- How should player background be persisted?
- How should residency and legal status be represented?
- Can personal relationships exist independently of notifications?
- Which world and economic effects can be applied authoritatively?
- How should war phases affect capability availability?
- How should accepted Contracts behave when borders close or an arc escalates?
- How should attack attribution and corrections be audited?

## Review status

- economic review: pending revision for wartime economy;
- narrative review: pending;
- gameplay and learning review: pending;
- technical compatibility review: pending;
- migration and representation review: pending;
- war sensitivity review: pending.

## Change log

- 1.0.0-draft: initial infrastructure-governance arc.
- 1.1.0-draft: reframes the Corridor as the immigrant player's opportunity, adds the Meridian attack and war spine, and separates personal from world outcomes.