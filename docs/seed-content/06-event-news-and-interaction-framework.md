# Event, News, and Interaction Framework

Status: draft foundation

## Purpose

Define production requirements for reusable event definitions, game-session event instances, news reports, interaction trees, decisions, and consequences.

## Event families

- macroeconomic;
- monetary policy;
- fiscal and public investment;
- trade and customs;
- logistics and infrastructure;
- resource and commodity;
- company and earnings;
- labor and employment;
- technology and research;
- cybersecurity and data;
- environmental and weather;
- regulatory and legal;
- diplomatic and institutional;
- public confidence and reputation;
- recovery and correction.

## Event-definition fields

Every reusable event concept should define:

- stable event ID;
- title;
- family;
- scope;
- summary;
- underlying cause;
- trigger requirements;
- exclusion requirements;
- eligible scenario profiles;
- country, industry, company, commodity, institution, and location references;
- severity class;
- probability or scheduling policy;
- duration;
- escalation conditions;
- immediate effects;
- delayed effects;
- decay;
- recovery;
- follow-up events;
- incompatible events;
- player-facing news;
- Admin-facing explanation;
- interactions generated;
- contracts generated or modified;
- learning objective;
- review status;
- technical mapping status.

## Runtime event-instance fields

The implementation mapping should preserve:

- event-definition reference;
- game-session ownership;
- activation timestamp;
- source trigger;
- current stage;
- selected severity within approved bounds;
- entities actually affected;
- effects applied;
- effects pending;
- decisions linked;
- resolution;
- audit history;
- cancellation or override reason.

## Trigger classes

### Scheduled

Activated according to a scenario schedule.

### Threshold

Activated when a supported indicator or state crosses a defined boundary.

### Dependency

Activated after a prior event, decision, contract, or story stage.

### Probabilistic

Eligible within a controlled window and selected by the runtime event system.

### Instructor-initiated

Activated through an authorized Admin action.

### Composite

Requires more than one condition.

A trigger must never depend on data unavailable to the authoritative runtime system.

## Event chains

A chain should identify:

- entry event;
- required and optional stages;
- branch points;
- maximum length;
- maximum duration;
- recovery stage;
- terminal states;
- interruption policy;
- replacement policy;
- replay policy.

### Example: Eldoran food-price chain

1. Harvest outlook reduced.
2. Commodity futures rise.
3. Export-reservation debate begins.
4. Consumer confidence falls if no response occurs.
5. Policy decision opens.
6. Imports, reserve release, subsidy, or production support selected.
7. Short-term and delayed effects apply.
8. Price-pressure review occurs.
9. Recovery, prolonged inflation, or fiscal strain follows.

## News record types

- breaking report;
- official announcement;
- market brief;
- policy analysis;
- company filing summary;
- investigative report;
- forecast;
- correction;
- resolution report;
- educational explainer.

## News fields

- stable news-template ID;
- runtime report ID;
- headline;
- deck or short summary;
- body;
- report type;
- publication;
- author or desk;
- country and entity references;
- event-instance reference;
- publish condition;
- fact status;
- confidence language;
- market explanation;
- player relevance;
- correction relationship;
- asset requirements;
- accessible alt text;
- expiration or archive policy.

## Fact-status vocabulary

- confirmed;
- official claim;
- independent estimate;
- forecast;
- allegation;
- disputed;
- corrected;
- unresolved.

Player-facing copy must not convert uncertain information into confirmed fact.

## Interaction types

- briefing;
- request;
- warning;
- negotiation;
- advisory question;
- approval request;
- offer;
- emergency alert;
- investigation notice;
- response to prior decision;
- reward or recognition;
- rejection or failure explanation;
- reflection prompt.

## Interaction fields

- stable interaction ID;
- title;
- speaker;
- institution;
- recipient scope;
- trigger;
- prerequisites;
- opening copy;
- context links;
- response options;
- default or no-response behavior;
- decision deadline;
- immediate reply;
- immediate effects;
- delayed effects;
- reputation effects;
- next interactions;
- repeatability;
- expiry;
- instructor override behavior;
- review status.

## Response-option fields

- stable option ID;
- player-facing wording;
- strategic interpretation;
- requirements;
- cost;
- immediate benefit;
- immediate drawback;
- delayed benefit;
- delayed drawback;
- economic effect;
- narrative effect;
- reputation effect;
- future content unlocked or blocked;
- disclosure level;
- confirmation copy.

## Disclosure levels

### Full

The player sees all major immediate and delayed consequences.

Use for:

- tutorials;
- simple administrative decisions;
- early learning interactions.

### Directional

The player sees likely direction but not exact magnitude.

Use for:

- normal policy and investment decisions.

### Uncertain

The player sees scenarios and risks.

Use for:

- forecasts;
- negotiations;
- emerging crises.

### Hidden

Used sparingly for later consequences that are logically inferable but not guaranteed.

Hidden consequences must be predetermined by the content definition and must not function as arbitrary punishment.

## Event-to-market mapping

For each market-relevant event, document:

- expected broad index direction;
- affected sectors;
- positively exposed companies;
- negatively exposed companies;
- commodity impact;
- currency impact;
- duration;
- confidence level;
- conditions that reverse the effect.

An event should not move every company in the same direction unless it is genuinely systemic.

## Event-to-contract mapping

An event may:

- make a contract available;
- change urgency;
- modify supported reward policy;
- change available countries;
- add required evidence;
- create a follow-up contract;
- close a contract when its premise no longer exists.

A contract already accepted by a player requires explicit behavior if the originating event changes or resolves.

## Event-to-store and banking mapping

Potential effects must be deliberate:

- scarcity may alter availability, not silently rewrite owned inventory;
- policy rates may affect new bank products or approved dynamic rates, not retroactively change fixed products without a rule;
- emergency items may become available;
- purchase limits may activate;
- existing ownership and redemption reservations remain authoritative.

## Meridian Corridor event chain: foundation sequence

### Stage 1: Forum announced

- global introductory news;
- country briefings;
- analysis contracts available.

### Stage 2: Competing financing and governance proposals

- Xalvorian financing offer;
- Lumenor multilateral charter;
- Yrethian compliance framework;
- Dravenlok procurement guarantee.

### Stage 3: Capacity and resource warnings

- Sableport congestion;
- Eldoran harvest downgrade;
- Northreach mineral review;
- Valerion reservoir concern;
- Solvend labor constraint.

### Stage 4: Customs-security intrusion

- payment and cargo verification disrupted;
- insurance costs rise;
- security decisions open;
- attribution remains unresolved.

### Stage 5: Emergency operating model

Possible approaches:

- centralized Syndalian security deployment;
- federated national systems;
- temporary manual verification;
- limited corridor suspension.

### Stage 6: Corridor resolution

- centralized;
- multilateral;
- regional fragmentation;
- suspension.

### Stage 7: Follow-up arc

- dependency backlash;
- standards expansion;
- regional competition;
- recovery and renegotiation.

## Production quantity targets

Initial production pack:

- 25 standalone events;
- 10 event chains;
- 5 crisis arcs;
- 40–60 interactions;
- 15–20 mechanical decision points;
- 25–30 news templates;
- at least one correction or revised-forecast example;
- at least one successful recovery example for every severe event family.

## Validation checks

- trigger can be evaluated;
- session scope is explicit;
- severity is bounded;
- immediate and delayed effects are distinct;
- no duplicate effect application;
- all referenced content exists;
- uncertain claims use uncertainty language;
- branch choices differ mechanically;
- event has expiry or resolution;
- severe negative event has recovery;
- repeated activation is safe;
- instructor cancellation does not leave pending effects orphaned;
- news and interactions cannot reveal another player's private state.