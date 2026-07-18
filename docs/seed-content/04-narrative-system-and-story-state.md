# Narrative System and Story State

Status: draft foundation
Scope: content architecture; runtime implementation deferred

## Purpose

Define how Econovaria turns economic conditions into coherent stories, decisions, consequences, and follow-up content without forcing every game session into one rigid campaign.

## Narrative model

Econovaria uses a hybrid narrative system:

- authored global arcs;
- country-specific arcs;
- company storylines;
- institutional requests;
- contract chains;
- branching interactions;
- news generated from verified runtime state;
- emergent narratives created by economic conditions.

The narrative system should explain why the world changes and give players reasons to act. It should not replace the simulation with scripted outcomes.

## Narrative scopes

### Global

Affects multiple countries or the shared international system.

Examples:

- Meridian Corridor;
- international recession;
- food-price crisis;
- cross-border cyber incident;
- trade agreement;
- energy transition.

### Country

Tracks a country's internal objective, conflict, or transformation.

Examples:

- Northreach resource-sovereignty debate;
- Eldoran food-security policy;
- Valerion water-rights dispute;
- Dravenlok industrial modernization.

### Institution

Tracks an institution's objective and public credibility.

Examples:

- central bank inflation response;
- development authority financing package;
- insurance council compliance standards;
- research consortium ownership dispute.

### Company

Tracks business-specific change.

Examples:

- product launch;
- earnings deterioration;
- merger;
- labor dispute;
- financing crisis;
- investigation;
- recovery.

### Player

Tracks individual opportunities, reputation, choices, and follow-up interactions.

### Classroom or game session

Tracks shared decisions and conditions that should not leak into other sessions.

## Story arc anatomy

Every major arc should define:

- stable arc ID;
- title;
- scope;
- theme;
- economic premise;
- narrative premise;
- starting requirements;
- active countries;
- active institutions;
- active companies;
- characters;
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
- contract connections;
- news connections;
- supported scenario profiles;
- classroom learning objectives;
- technical mapping status.

## Standard stages

### Setup

Establish facts, stakeholders, and uncertainty.

Requirements:

- identify what is known;
- identify what remains uncertain;
- avoid premature attribution;
- provide enough context for a player decision.

### Escalation

Increase pressure through economic or institutional change.

Examples:

- higher prices;
- supply decline;
- falling confidence;
- deadline;
- external reaction;
- investigation;
- additional affected company.

### Decision window

A decision becomes available.

Requirements:

- two to four meaningfully distinct options;
- visible trade-off;
- eligibility and deadline;
- consequences that match the choice;
- no option presented as morally correct by default unless the learning objective explicitly analyzes ethics.

### Immediate response

Characters, markets, institutions, or contracts react.

### Delayed consequence

An effect appears later. Delayed consequences must be recorded at decision time so they are not invented after seeing player results.

### Recovery or transformation

The arc stabilizes, fails, branches, or becomes another arc.

## Narrative-state vocabulary

Recommended definition states:

- `concept`: content idea only;
- `available`: trigger requirements met;
- `introduced`: player or session has received the setup;
- `active`: arc is progressing;
- `awaiting_decision`: valid decision window open;
- `decision_recorded`: choice committed and immutable except authorized rollback;
- `escalated`: defined escalation conditions met;
- `recovering`: negative pressure is decaying or corrective actions are active;
- `resolved`: terminal success, compromise, or stable outcome;
- `failed`: defined failure condition reached;
- `expired`: window ended without a valid action;
- `superseded`: replaced by another arc or version;
- `cancelled`: removed by authorized instructor or system action before terminal outcome.

Runtime systems may use different exact enum names. The compatibility audit must map them explicitly.

## Branch design

A branch is valid only when it changes at least one of:

- economic state;
- narrative state;
- available contract;
- institution relationship;
- reputation;
- company or market exposure;
- future event probability;
- resource availability;
- timing;
- resolution.

Cosmetic dialogue variation is not a mechanical branch and should be labeled as copy variation.

## Choice design standards

A strong decision:

- asks a clear question;
- presents distinct strategies;
- exposes relevant information;
- preserves uncertainty;
- produces proportionate effects;
- creates both benefits and costs;
- has at least one defensible option for different player goals;
- does not punish the player for information the game did not provide;
- supports later reflection.

Avoid:

- one obviously optimal option;
- fake choices with identical outcomes;
- choices whose consequences are unrelated to the text;
- hidden failure based on an undocumented field;
- repeated binary morality tests;
- irreversible severe damage from a low-information early interaction.

## Consequence taxonomy

### Economic

- indicator adjustment;
- company outlook;
- sector demand;
- price or rate effect;
- currency pressure;
- contract reward or cost;
- resource availability.

### Institutional

- trust;
- access;
- regulatory status;
- negotiation position;
- future assistance;
- investigation risk.

### Player

- reputation;
- progression;
- contract access;
- item or banking access;
- message availability;
- achievement progress.

### Narrative

- next stage;
- branch activation;
- follow-up arc;
- character relationship;
- alternate news framing;
- changed resolution conditions.

## Immediate and delayed effects

Every decision should distinguish:

- committed immediate effects;
- scheduled delayed effects;
- conditional effects;
- probabilistic effects;
- informational effects only.

Delayed effects require:

- due condition or relative delay;
- cancellation rule;
- repeat behavior;
- session scope;
- copy for activation;
- recovery or expiry behavior.

## Character continuity

Every recurring character must have:

- role;
- institutional authority;
- public objectives;
- private design motivations, if needed;
- risk tolerance;
- communication style;
- topics they can credibly discuss;
- relationships;
- conditions that change their stance;
- forbidden contradictions.

Characters should represent interests, not simple moral alignment.

## News continuity

News must reflect verified state.

A news record should distinguish:

- report;
- analysis;
- forecast;
- allegation;
- official statement;
- confirmed outcome;
- correction.

Rules:

- a forecast is not written as a fact;
- an allegation does not identify guilt without confirmation;
- market reaction copy describes direction and drivers without promising causation certainty;
- a correction or changed estimate should preserve the earlier record where auditability matters;
- the headline should not reveal hidden branch information unavailable to players.

## Story replayability

To support repeated classes:

- vary timing;
- vary affected company;
- vary severity within approved bands;
- vary which institution introduces the issue;
- allow alternate decision availability based on country or progression;
- support multiple resolutions;
- avoid requiring the same player to receive every interaction;
- preserve the same underlying learning objective.

## Failure design

Failure should create learning and continuation, not simply remove gameplay.

Every failure path should define:

- cause;
- player-facing explanation;
- economic cost;
- narrative cost;
- recovery opportunity;
- whether the arc ends or transforms;
- instructor override policy;
- prevention of duplicate penalties.

## Narrative observability

Admin-facing tooling will eventually need to explain:

- active arc;
- current stage;
- trigger source;
- decision owner;
- decision selected;
- scheduled follow-up;
- effects already applied;
- effects pending;
- resolution conditions;
- audit history.

The content catalog should include these concepts even if current Admin support is absent. Unsupported concepts remain planned and must not be represented as active functionality.

## Narrative acceptance tests

Before approval:

- all branches resolve to valid states;
- no branch references nonexistent content;
- each decision has distinct consequences;
- delayed effects have due and cancellation rules;
- character voice is consistent;
- news matches state;
- failure has a recovery or explicit terminal purpose;
- the arc works for intended countries and scenario profiles;
- severe outcomes require sufficient warning;
- classroom reflection prompts can explain the trade-off;
- no session state is encoded in reusable global content.