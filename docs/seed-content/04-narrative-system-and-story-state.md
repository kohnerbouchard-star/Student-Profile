# Narrative System and Story State

Status: draft foundation
Scope: content architecture; runtime implementation deferred
Primary player lens: immigrant fortune, belonging, and war

## Purpose

Define how Econovaria turns economic conditions into a player-centered story about building a new life, pursuing wealth, navigating belonging, and surviving the transformation of international rivalry into war.

The system must preserve open economic play while ensuring the world story reaches the player through concrete personal consequences.

## Core narrative model

Econovaria uses a hybrid structure:

- one authored global story spine;
- country-specific variations;
- player-background opportunities;
- personal relationship arcs;
- company and institution storylines;
- Contract chains;
- branching interactions;
- news generated from verified runtime state;
- emergent stories created by prices, employment, markets, shortages, and player choices.

The standard global spine is:

1. arrival;
2. Meridian boom;
3. fracture;
4. Meridian attack;
5. outbreak of war;
6. fortune during war;
7. belonging and loyalty;
8. reckoning.

The player cannot prevent every shared global event. Player decisions affect preparation, trust, opportunity, severity, relationships, economic position, and available outcomes.

## Narrative promise

The player should experience the world through the question:

> What are you willing to risk, protect, or become in order to build a fortune and a home in a country moving toward war?

The story is not a detached international-policy exercise.

The player begins with immediate personal concerns:

- employment;
- rent;
- savings;
- legal status;
- professional advancement;
- family or obligations elsewhere;
- social trust;
- business opportunity.

The global crisis becomes meaningful because it threatens or transforms those personal stakes.

## Narrative scopes

### Global

Affects multiple countries or the international system.

Examples:

- Meridian Corridor;
- Meridian attack;
- open war;
- international recession;
- sanctions;
- refugee movement;
- peace negotiation;
- reconstruction.

### Country

Tracks a country's internal objective, conflict, transformation, and wartime condition.

Examples:

- Northreach resource sovereignty;
- Eldoran food security;
- Valerion water allocation;
- Dravenlok industrial mobilization;
- Lumenor emergency diplomacy;
- Syndalis security authority.

### Institution

Tracks an institution's objective, authority, and credibility.

Examples:

- residency office scrutiny;
- central-bank stabilization;
- public-media correction;
- military-procurement oversight;
- development-finance conditions;
- insurance and customs rules.

### Company

Tracks business-specific opportunity and risk.

Examples:

- Corridor expansion;
- wartime procurement;
- supply interruption;
- labor dispute;
- sanctions exposure;
- emergency financing;
- investigation;
- reconstruction.

### Player

Tracks:

- background;
- adopted country;
- legal and residency position;
- economic path;
- wealth and liquidity;
- professional reputation;
- community standing;
- institution trust;
- personal relationships;
- obligations to the former home;
- legal exposure;
- identity and ending conditions.

### Relationship

Tracks a recurring character's trust, dependency, loyalty, conflict, and memory of prior decisions.

### Classroom or game session

Tracks shared conditions and outcomes that must not leak into another session.

## Player-centered event rule

Every major story event must affect at least three layers:

1. personal life;
2. economic systems;
3. political or institutional state.

Example: a border closure should not exist only as a news article.

It should potentially affect:

- imported prices;
- company supply;
- employment;
- remittances;
- travel;
- residency review;
- a personal relationship;
- a Contract or business opportunity;
- public trust or propaganda.

## Story arc anatomy

Every major arc should define:

- stable arc ID;
- title;
- scope;
- theme;
- player stake;
- economic premise;
- political premise;
- relationship premise;
- starting requirements;
- active countries;
- active institutions;
- active companies;
- recurring characters;
- stages;
- triggers;
- decisions;
- branches;
- immediate consequences;
- delayed consequences;
- failure and expiration behavior;
- recovery;
- terminal resolutions;
- follow-up arcs;
- Contract connections;
- news connections;
- residency or movement implications where supported;
- supported scenario profiles;
- classroom learning objectives;
- technical mapping status.

## Standard stages

### Personal setup

Establish the player's immediate goal, resources, relationships, and uncertainty.

Requirements:

- show what the player wants;
- show what can be lost;
- avoid front-loading global exposition;
- provide an actionable economic choice.

### Opportunity

Create a credible path to improve the player's position.

Examples:

- job;
- business lead;
- investment;
- public Contract;
- trade route;
- training;
- relationship favor.

### Warning

Introduce a world or local condition that threatens or changes the opportunity.

### Decision window

Present two to four meaningfully distinct strategies.

Requirements:

- visible gain;
- visible risk or affected party;
- eligibility and deadline;
- uncertainty that matches available information;
- no single developer-approved moral answer;
- consequences that can return later.

### Immediate response

Characters, companies, institutions, prices, contracts, or legal conditions react.

### Delayed consequence

A recorded effect returns later through:

- relationship memory;
- altered access;
- new or lost Contract;
- market movement;
- investigation;
- residency review;
- public reputation;
- shortage;
- favor;
- accusation;
- ending condition.

Delayed consequences must be defined or parameterized when the decision is recorded. They must not be invented after observing which player is succeeding.

### Transformation

The arc resolves, escalates, recovers, fails, or becomes another arc.

## Global story phases

### Arrival

The player learns the adopted country through practical needs and relationships.

### Meridian boom

Peace and growth create visible opportunity. The player should be able to make measurable progress before escalation.

### Fracture

Trade, security, migration, and political tensions begin affecting ordinary activity.

### Meridian attack

A high-impact attack creates uncertainty, damage, and emergency controls.

### Outbreak

Retaliation and alliance pressure create open war.

### Wartime economy

The player adapts through legal and illegal opportunities, public need, scarcity, and moral compromise.

### Belonging

The player's adopted country and former connections create conflicting expectations.

### Reckoning

The game evaluates personal success, relationships, legal status, and world outcome separately.

## Choice design standard

Every major decision should answer:

1. What can the player gain?
2. Who may be harmed, exposed, or alienated?
3. How can the world remember the decision?

A strong choice:

- asks a clear question;
- expresses identity or strategy;
- presents distinct options;
- exposes relevant evidence;
- preserves uncertainty;
- creates benefits and costs;
- supports more than one defensible player goal;
- avoids punishing the player for hidden information;
- changes future access, state, or interpretation;
- supports later reflection.

Avoid:

- obvious good-versus-evil menus;
- one dominant survival strategy;
- fake choices;
- hidden failure conditions;
- consequences unrelated to the presented choice;
- severe irreversible punishment from a low-information early interaction;
- war choices that exist only to reward violence;
- treating wealth as evidence of virtue.

## Player identity through action

The game should allow the player to become, through choices and systems:

- a stable employee;
- entrepreneur;
- investor;
- trader;
- public contractor;
- skilled professional;
- journalist or analyst;
- community leader;
- political insider;
- cross-border broker;
- informal operator;
- wartime supplier;
- reformer;
- collaborator;
- survivor.

These are emergent identities, not character classes that permanently lock the player at the start.

## Consequence taxonomy

### Economic

- income;
- expense;
- liquidity;
- price or rate effect;
- currency pressure;
- company outlook;
- sector demand;
- supply access;
- property or asset value;
- Contract reward or cost.

### Legal and residency

- documentation requirement;
- review status;
- travel access;
- transfer restriction;
- employment eligibility;
- investigation risk;
- permanent-status opportunity;
- expulsion or exile risk.

These mechanics remain planned until implemented.

### Institutional

- trust;
- access;
- regulatory status;
- negotiation position;
- future assistance;
- audit or investigation;
- security scrutiny.

### Social and relationship

- trust;
- loyalty;
- resentment;
- debt or obligation;
- protection;
- betrayal;
- access to information;
- willingness to help later.

### Player progression

- professional reputation;
- community standing;
- Contract access;
- business opportunity;
- item or banking access;
- achievement progress;
- ending eligibility.

### Narrative

- next stage;
- branch activation;
- follow-up arc;
- alternate news framing;
- changed attribution confidence;
- changed peace or war conditions;
- personal ending condition;
- world ending condition.

## War narrative rules

War is primarily experienced through civilian and economic consequences.

The player is not automatically a battlefield commander.

War content should focus on:

- shortages;
- employment;
- military and civilian procurement;
- housing pressure;
- displaced people;
- borders;
- communications;
- financial controls;
- insurance;
- rationing;
- propaganda;
- discrimination;
- remittances;
- infrastructure damage;
- reconstruction;
- social solidarity;
- opportunism;
- legal and moral compromise.

Violence may be part of the world, but it should not erase the immigrant and economic perspective.

No country should be written as inherently evil. Governments, institutions, factions, companies, and individuals may act aggressively, corruptly, defensively, opportunistically, or courageously.

## News continuity

News must reflect verified runtime state.

A news record must distinguish:

- confirmed report;
- analysis;
- forecast;
- allegation;
- official statement;
- attribution confidence;
- casualty or damage estimate;
- confirmed outcome;
- correction.

Rules:

- a forecast is not written as fact;
- an allegation does not establish guilt;
- an attack does not reveal a final perpetrator before evidence supports it;
- corrections preserve the prior record where auditability matters;
- market reaction copy may describe association and timing without claiming certain causation;
- propaganda and official statements must be labeled rather than presented as neutral truth;
- headlines must not reveal hidden branch information.

## Relationship continuity

Every recurring personal character should define:

- relationship role;
- public position;
- private motivation where needed;
- risk tolerance;
- communication style;
- topics they can credibly discuss;
- initial connection to the player;
- conditions that increase or decrease trust;
- remembered decisions;
- assistance they can offer;
- pressure they can apply;
- forbidden contradictions.

Core relationship roles should include local equivalents of:

- sponsor;
- local friend;
- rival immigrant;
- employer, client, or investor;
- journalist or investigator;
- community representative;
- security or residency official;
- person connected to the former home.

## Replayability

To support repeated sessions:

- vary adopted country;
- vary player background;
- vary the local contact;
- vary timing and severity;
- vary the attacked Meridian node;
- vary evidence and attribution sequence;
- vary company and sector exposure;
- vary alliance pressure;
- allow alternate personal and world endings;
- avoid requiring every player to receive every interaction;
- preserve the same underlying economic and civic learning objectives.

The truth behind the Meridian attack may be fixed within one content-pack scenario or may vary between approved scenarios. It must never be randomized in a way that makes prior evidence meaningless.

## Failure design

Failure should create learning and continued play.

Examples:

- losing a job opens lower-status or informal work;
- business failure creates debt restructuring or partnership choices;
- residency scrutiny creates appeal, sponsorship, or relocation paths;
- a failed investment changes liquidity but does not automatically remove the player;
- damaged trust may be rebuilt through evidence and action;
- inability to protect everyone creates a consequence, not an arbitrary game over.

Every failure path should define:

- cause;
- player-facing explanation;
- economic cost;
- relationship cost;
- legal or narrative cost;
- recovery opportunity;
- whether the arc ends or transforms;
- duplicate-penalty prevention.

## Ending evaluation

Personal and world outcomes must be evaluated separately.

### Personal dimensions

- wealth;
- financial security;
- residency or citizenship status;
- legal exposure;
- professional reputation;
- community standing;
- relationships;
- treatment of obligations;
- degree of dependence on wartime interests.

### World dimensions

- peace or conflict state;
- civilian stability;
- economic recovery;
- institutional legitimacy;
- bloc fragmentation;
- concentration of power;
- Corridor status;
- treatment of displaced and foreign residents.

A wealthy player may receive a morally or socially costly ending. A player with limited wealth may still protect relationships, secure belonging, or contribute to reconstruction.

## Narrative observability

Admin-facing tooling will eventually need to explain:

- active personal and global arc;
- current phase;
- trigger source;
- player eligibility;
- decision owner;
- selected decision;
- relationship effects;
- scheduled follow-up;
- economic effects already applied;
- effects pending;
- legal or residency effects;
- attribution confidence;
- resolution conditions;
- audit history.

Unsupported concepts must remain planned and must not appear as active functionality.

## Narrative acceptance tests

Before approval:

- the player has a personal goal before the global crisis;
- the world story reaches the player through systems and relationships;
- every major event affects personal, economic, and political layers;
- all branches resolve to valid states;
- each decision has distinct consequences;
- delayed consequences have due and cancellation rules;
- relationship memory is consistent;
- news matches verified state;
- war attribution remains uncertain until supported;
- failure provides recovery or an explicit terminal purpose;
- multiple economic strategies remain viable;
- severe outcomes receive sufficient warning;
- immigration affects opportunity or relationship content;
- personal and world endings are separate;
- no session state is encoded in reusable definitions;
- unsupported mechanics are explicitly labeled.

## Change log

- Revised to center the immigrant player, define the arrival-to-war story spine, require personal consequences, and separate personal success from world outcomes.