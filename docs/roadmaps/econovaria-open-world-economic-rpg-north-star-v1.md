# Econovaria Open-World Economic RPG North Star

**Document ID:** `ECON-GAME-DESIGN-OWRPG-V1`  
**Roadmap item:** `GAME-DESIGN-OWRPG-001`  
**Status:** `PLANNED`  
**Product authority:** product owner direction captured 2026-08-07  
**Audited main:** `4c17b942fcf4b2a6f60b629549f192d066053ba4`  
**Audit date:** 2026-08-07  
**Production deployment authorized:** No  
**Implementation authorized by this document:** No — plan and sequencing only

## Purpose

This document establishes the long-term gameplay end state for Econovaria.

Econovaria should become a **persistent open-world economic RPG and immersive economic simulation** in which the world supplies information, rules, actors, opportunities, constraints, and consequences while players decide what goals to pursue and what kind of economic actor to become.

The game must not primarily behave like a sequence of assigned classroom tasks, a collection of disconnected finance applications, or a linear quest chain. Existing systems remain valuable, but they must be connected into a world where player decisions alter later opportunities, risks, relationships, access, wealth, and endings.

This roadmap is additive. It does not cancel the current beta convergence, Admin UI V2 work, release hardening, Checking/Savings convergence, canonical economic-asset work, or simulation-runtime work. Those foundations remain prerequisites for a durable open-world implementation.

## North-star statement

> **Econovaria creates the world, rules, actors, information, and consequences. Players create the story.**

A successful player session should produce stories such as:

- a player builds a manufacturer, borrows heavily during the boom, survives a supply shock by negotiating with another player, and later faces political scrutiny for wartime profits;
- a cautious saver avoids entrepreneurship, builds liquidity, relocates before border restrictions tighten, and finishes with modest wealth but high residency security;
- an investor becomes wealthy through a defensible thesis, loses access to a trusted institution after exploiting a crisis, and finishes rich but politically isolated;
- a player loses a business, restructures debt, returns to employment, rebuilds reputation, and later opens a different opportunity path;
- two players exposed to the same news make different decisions and experience materially different later consequences.

If players mostly describe their experience as “I completed Contract 4 and then checked the Marketplace,” the product has not reached this north star.

## Genre and product identity

Primary genre:

- persistent open-world economic RPG;
- immersive economic simulation;
- multiplayer social/economic strategy game.

Supporting characteristics:

- one-year real-time world;
- server-authoritative economy;
- authored geopolitical spine plus emergent player stories;
- asymmetric country conditions;
- incomplete but fair information;
- persistent consequences;
- recoverable failure;
- player-to-player economic interdependence;
- classroom-observable learning without requiring the teacher to manually operate ordinary game outcomes.

This is **not** intended to become:

- a 3D movement/combat RPG;
- a battlefield strategy game;
- a linear quest game;
- a morality-meter game;
- a spreadsheet with cosmetic achievements;
- a teacher-operated branching slideshow;
- an economy where NPC stores make player production irrelevant;
- a game where levels simply multiply profit, yield, or investment return.

## Player promise

The standard player enters Econovaria as a new immigrant with limited money, temporary status, incomplete information, a small number of relationships, and several possible ways to build a life.

The player should be free to pursue different goals, including:

- stable employment;
- emergency savings and personal security;
- entrepreneurship;
- production and trade;
- investment and portfolio management;
- professional credentials;
- government or institutional work;
- cross-border brokerage;
- community standing;
- political or institutional influence;
- permanent residency or citizenship;
- relocation;
- survival and recovery during crisis;
- wealth accumulation;
- helping or exploiting other players and institutions within legal game boundaries.

The game may present opportunities, warnings, obligations, requests, and consequences. It should rarely prescribe one universal objective.

Ignoring an opportunity is a valid decision.

## Authoritative core loop

The open-world core loop is:

1. **Observe** — receive world, country, market, business, relationship, and personal information.
2. **Interpret** — decide what is fact, forecast, risk, opportunity, noise, or misinformation.
3. **Choose goals** — decide what matters now: liquidity, growth, employment, influence, residency, relationships, survival, or another objective.
4. **Commit** — spend scarce money, time, credit capacity, inventory, reputation, trust, geographic access, or opportunity cost.
5. **Act** — trade, save, borrow, produce, hire, travel, negotiate, accept work, craft, buy, sell, communicate, or decline to act.
6. **Simulate** — authoritative world systems and other players continue operating.
7. **Experience consequences** — immediate and delayed results alter economic and social state.
8. **Adapt** — revise strategy based on what happened and what new information becomes available.

Repeat continuously across the one-year game.

The previous implicit loop of **Contracts → News → Messages** must not remain the product's primary definition of gameplay. Contracts, News, and Messages are important tools inside the larger loop.

## Design laws

### 1. Players choose goals; the game creates pressure

The game should expose opportunities and threats rather than constantly assigning objectives.

A supply shock should not automatically create a mandatory “respond to supply shock” quest. It should change prices, availability, business margins, news, contracts, player demand, and relationships. Players decide whether and how to respond.

### 2. Meaningful choices consume scarce resources

Important decisions should usually trade one valuable thing for another:

- cash versus growth;
- liquidity versus return;
- speed versus cost;
- resilience versus efficiency;
- profit versus reputation;
- national loyalty versus cross-border relationships;
- debt-funded expansion versus solvency;
- inventory security versus working capital;
- privacy versus institutional access;
- travel cost versus geographic opportunity;
- personal security versus speculative upside.

### 3. Information is incomplete but fair

Information may be:

- confirmed;
- official claim;
- independent estimate;
- forecast;
- allegation;
- disputed;
- corrected;
- unresolved.

Severe outcomes must not depend on hidden information that a reasonable player could not have discovered or inferred.

Players may be wrong. The game should later explain the causal chain well enough that the player can understand why.

### 4. The world remembers

Significant decisions must persist beyond the immediate screen.

Examples:

- debt taken;
- promises made or broken;
- players hired or terminated;
- crisis inventory sold;
- contracts accepted and abandoned;
- people or institutions helped;
- information shared;
- routes used;
- countries supported;
- evidence ignored;
- residency commitments;
- repeated business conduct;
- payment reliability.

Memory should change future access, interpretation, trust, pricing, employment, contracts, financing, residency, investigations, and endings where appropriate.

### 5. Avoid one developer-approved moral answer

Do not use a universal morality score.

A profitable action may improve investor reputation while damaging community trust. An institution may reward behavior another institution dislikes. The world should express moral and political consequences through actors and systems rather than one global “good/bad” meter.

### 6. Failure changes the path; it does not remove the player

Bankruptcy, default, unemployment, failed business decisions, investment losses, rejected residency requests, and damaged reputation should create recovery gameplay.

A standard game must preserve at least one credible recovery path unless the player intentionally reaches an authored terminal ending.

### 7. The world moves without the player

Markets, macro conditions, businesses, institutions, events, other players, deadlines, relationships, and geopolitical arcs continue according to authoritative time.

The player is important but is not the cause of every event.

### 8. Countries differ mechanically

Country choice/assignment must affect strategy through real economic conditions and access, not primarily through renamed tutorials and contextual copy.

Country differentiation should affect combinations of:

- sector strengths;
- resource supply;
- import dependence;
- business costs;
- labor conditions;
- financial products;
- residency rules;
- travel routes;
- institutional access;
- crisis exposure;
- market composition;
- available contracts/opportunities;
- substitute resources;
- player-to-player dependencies.

### 9. Progression unlocks verbs and access, not guaranteed returns

Progression should create new ways to play:

- new institutions;
- professional credentials;
- advanced research;
- restricted procurement;
- deeper business operations;
- advanced manufacturing;
- cross-border opportunities;
- negotiation rights;
- better information sources;
- new financing structures;
- new residency or professional pathways.

Avoid flat bonuses such as guaranteed profit, improved stock returns, or arbitrary output multipliers unless a specific economic mechanism justifies them.

### 10. Education follows experience

Preferred learning sequence:

**predict → decide → act → experience consequence → explain → revise**

Assessment should often ask the player to explain an economic outcome they actually experienced rather than only describing a hypothetical outcome before acting.

## Standard game profiles

The same authoritative economy should support multiple presentation/cadence profiles without forking economic truth.

### Open World — target default

- player-chosen goals;
- opportunity-driven dashboard;
- minimal mandatory task assignment;
- full persistent consequences;
- world and player economy continue in real time;
- authored campaign changes conditions but does not prescribe a single response.

### Guided Classroom

- same economy and consequence model;
- more explicitly surfaced learning objectives;
- optional instructor-assigned Contracts;
- tighter scenario cadence;
- stronger scaffolding and reflection prompts;
- suitable when a teacher needs students to encounter a particular concept within a class period.

### Advanced/Sandbox

- broader event combinations;
- fewer content caps;
- optional higher complexity;
- still bounded by economic integrity, game isolation, security, and recovery rules.

A game profile may alter content availability, pacing, guidance, and required reflection. It must not create a second ledger, inventory, market, or world authority.

## Existing feature disposition

The current feature set is broadly compatible with this north star. The goal is mostly to **reframe and connect**, not replace.

| Feature | Open-world role | Direction |
|---|---|---|
| Dashboard | Opportunity/threat/obligation/consequence command center | Reframe |
| News | Incomplete world information and causal evidence | Preserve + deepen |
| World | Geography, campaign state, routes, access, country conditions | Preserve + deepen |
| Travel | Commit money/time to change geographic access and exposure | Deepen |
| Residency | Long-term legal/geographic access with consequence history | Deepen |
| Market/Portfolio | Capital allocation under uncertainty | Preserve + connect |
| Banking | Liquidity, savings, transfers, cash-flow management | Preserve + connect |
| Loans | Leverage, repayment risk, recovery, business financing | Preserve + connect |
| Business | Player-directed enterprise strategy and production | Preserve + reframe inputs |
| Store | NPC/public baseline supply and policy goods | Narrow strategic role |
| Inventory | Persistent ownership and scarcity | Preserve |
| Crafting | Transform scarce inputs into economically useful outputs | Preserve + connect |
| Marketplace | Player-to-player price discovery and resource exchange | Promote to core economy |
| Messages | Negotiation, coordination, relationships | Preserve + connect |
| Contracts | Optional jobs/procurement/client/institution opportunities | Reframe from primary quest loop |
| Progression | Access, credentials, capabilities, identity | Reframe |
| Notifications | Signals and consequences | Preserve |
| Story Delivery | Major authored briefings/cutscenes | Extend to decision-capable interactions |
| Attendance | Optional classroom reward source only | Keep outside core economic identity |
| Admin | Supervision, moderation, scenario controls, exceptional correction | Preserve; reduce routine game-master dependency |

## Feature-specific end-state changes

### Dashboard: from “next actions” to opportunity intelligence

Replace the concept of a fixed ordered core loop with five primary surfaces:

1. **Signals** — material changes in markets, countries, institutions, and the player's own state.
2. **Opportunities** — jobs, contracts, trades, business openings, financing, travel, social requests, and investment situations.
3. **Obligations** — payments, accepted commitments, residency requirements, deadlines, wages, delivery promises, and other state the player has already chosen to incur.
4. **Consequences** — recent results and delayed effects from prior actions.
5. **Position** — liquidity, wealth, business exposure, geographic state, reputation/access, and major risks.

The dashboard may recommend attention. It should not imply that every recommendation is mandatory.

### Contracts: opportunity system, not universal quest system

Contracts remain authoritative structured commitments but should represent economic/social opportunities such as:

- employment or freelance work;
- public procurement;
- client engagements;
- research assignments;
- government or institutional requests;
- emergency logistics work;
- professional accreditation tasks;
- optional assessment/reflection work.

A player must be able to decline most Contracts without being treated as having failed the game.

Once accepted, a Contract becomes a real obligation and may carry deadlines, reputation effects, opportunity cost, and delayed consequences.

Gameplay missions should increasingly verify actual game actions when possible. Written reflection remains valuable but should not substitute for every economic action.

### Business: player controls strategy; simulation controls conditions

The player should choose:

- product/market intent;
- quantity;
- selling price;
- quality target or specification;
- supplier choices;
- inventory buffer;
- hiring and wages;
- financing;
- capacity investment;
- geographic strategy;
- expansion/restructuring/closure.

The simulation should increasingly determine or constrain:

- realized demand;
- actual market input cost;
- supplier availability/reliability;
- labor availability;
- productivity constraints;
- achievable quality;
- shipping/route effects;
- taxes/subsidies;
- competitive response;
- realized sales and margins.

Players should not directly author base demand or arbitrary world cost conditions that they are supposed to solve.

### Store: backstop, not economic bypass

The Store should not make Marketplace, Business, and Crafting irrelevant.

Target supply layers:

- **basic/public goods:** stable NPC/backstop availability;
- **ordinary commercial goods:** dynamic price/availability where supported;
- **strategic goods:** exposed to country supply, events, imports, and scarcity;
- **advanced goods:** primarily produced through Businesses/Crafting/player trade;
- **rare/prestige goods:** event, progression, institutional, or limited-source access.

The canonical item and inventory authority remains shared across Store, Inventory, Crafting, Marketplace, and Businesses.

### Marketplace: primary emergent-economy surface

Marketplace should become an important mechanism for:

- scarcity pricing;
- player specialization;
- inter-country trade;
- substitute-resource discovery;
- liquidation during financial stress;
- wartime shortages;
- finished-goods commerce;
- business input sourcing.

NPC supply and scripted rewards must not consistently undercut player production.

### Messages: negotiation infrastructure

Messages remain communication, but player communication should be able to lead into authoritative commitments.

Future capability: **player agreements**.

Examples:

- future-delivery sale;
- supply agreement;
- employment offer;
- service agreement;
- loan/repayment promise only where legally/game-mechanically supported;
- team/country commitment;
- business purchase order.

The exact contract model requires a separate design/security review. Plain text promises alone must never silently move money or inventory.

### Market/Portfolio: connect financial risk to the rest of life

Market decisions should affect more than a portfolio score.

Relevant consequences may include:

- available liquidity;
- ability to fund a business;
- ability to meet obligations;
- loan affordability;
- wealth concentration risk;
- exposure to country/sector crises;
- character/institution interpretation where the holding is narratively relevant.

The market remains uncertain and must not reward progression with guaranteed investment success.

### Banking and Loans: make liquidity matter

Checking, Savings, transfers, loans, repayment, delinquency, and recovery should connect to personal and business obligations.

Borrowing should be attractive because it enables action now and dangerous because future obligations consume liquidity.

Savings should provide resilience and time-value learning without becoming the dominant income strategy.

### Crafting and Inventory: resource transformation

Crafting should connect to:

- world supply;
- Store availability;
- player-owned inventory;
- business inputs/outputs;
- Marketplace demand;
- substitute materials;
- event-driven scarcity;
- progression/credential access.

The system should create useful production decisions rather than a parallel collectible loop.

### Travel and Residency: geography changes opportunity

Location should affect meaningful availability such as:

- suppliers;
- employers;
- institutions;
- contracts;
- legal status;
- business access;
- travel routes;
- crisis exposure;
- residency opportunities;
- character relationships;
- market or information access where justified.

Travel should therefore be a commitment with economic and strategic consequences, not only a map animation or fee.

### Progression: emergent identity through access

Do not permanently assign a traditional RPG class.

Player identities should emerge from behavior, history, access, and relationships. Examples:

- employee;
- entrepreneur;
- manufacturer;
- investor;
- trader;
- public contractor;
- analyst;
- community leader;
- broker;
- political insider;
- reformer;
- wartime supplier;
- survivor.

Progression should expose new opportunities consistent with what the player has demonstrated, while preserving the ability to change direction.

### Story Delivery: from acknowledgement to decision-capable narrative

The current delivery model is useful for major authored briefings, but the end state needs a separate authoritative **interaction/decision runtime** capable of recording:

- decision owner;
- available options;
- disclosure level;
- deadline;
- no-response behavior;
- requirements;
- immediate consequences;
- delayed consequences;
- reputation/relationship implications;
- content unlocked/blocked;
- deterministic replay/idempotency;
- audit history.

Do not overload `seen`, `dismissed`, or `acknowledged` into game decisions.

## New connective systems

The following are the primary new gameplay capabilities required to make the existing feature set behave like one open world.

### A. Player decision and consequence memory

**Roadmap sub-item:** `GAME-DESIGN-OWRPG-DECISIONS-001`

Create one authoritative model for significant player decisions and their consequences.

Required properties:

- game-scoped and player-scoped;
- server-authoritative;
- stable public decision identity where needed;
- source domain/event/interaction;
- selected action;
- information available at decision time;
- immediate result;
- delayed scheduled results;
- later resolution;
- idempotent submission;
- immutable/auditable history;
- safe presentation without ownership UUID leakage.

This is not a second ledger. Monetary and inventory consequences must continue through their canonical domain authorities.

### B. Opportunity graph and opportunity feed

**Roadmap sub-item:** `GAME-DESIGN-OWRPG-OPPORTUNITY-001`

Create a read model that can surface available opportunities from existing domains without duplicating their authority.

Possible sources:

- Contracts;
- employment/business;
- Marketplace;
- financial markets;
- banking/credit;
- world/travel/residency;
- story interactions;
- characters/institutions;
- progression unlocks.

The feed owns prioritization/presentation, not the underlying economic record.

### C. Personal economy and obligations

**Roadmap sub-item:** `GAME-DESIGN-OWRPG-PERSONAL-001`

Add a deliberately small personal-life economic layer so money has personal stakes.

Initial candidate obligations:

- housing/rent;
- ordinary living-cost allowance;
- scheduled loan payments;
- optional family/remittance obligation;
- emergency-buffer target;
- selected residency/credential fees where applicable.

Avoid survival-game micromanagement such as hunger, sleep, hygiene, or dozens of meters unless separately approved.

Personal obligations must be transparent, predictable enough to plan around, and recoverable after failure.

### D. Relationship and institution memory

**Roadmap sub-item:** `GAME-DESIGN-OWRPG-RELATIONSHIPS-001`

Create persistent actor memory based on concrete events rather than only an opaque relationship number.

Examples:

- promise kept/broken;
- helped during crisis;
- failed repayment;
- protected employees;
- exploited shortage;
- corrected misinformation;
- shared sensitive evidence;
- completed public service;
- abandoned accepted work.

Actors may interpret the same action differently.

Relationship state may influence:

- information;
- introductions;
- contracts;
- employment;
- financing referrals;
- residency support;
- investigation risk;
- special opportunities;
- endings.

### E. Dynamic economic dependency

**Roadmap sub-item:** `GAME-DESIGN-OWRPG-DEPENDENCY-001`

Make common resources and outputs matter across systems.

Target chain:

**world/country supply → Store/business supplier availability → player inventory → Crafting/business production → Marketplace/player trade → consumer/business demand → prices/margins → player/business/market consequences**

This work depends heavily on canonical economic asset ownership and must not introduce parallel item identity.

### F. Player agreements and commitments

**Roadmap sub-item:** `GAME-DESIGN-OWRPG-AGREEMENTS-001`

Allow selected player negotiations to become authoritative commitments.

Required design concerns:

- offer/accept/reject/cancel;
- quantity/value/currency;
- delivery or settlement condition;
- deadline;
- partial fulfillment policy;
- failure/breach treatment;
- dispute path;
- game scope;
- privacy/moderation;
- no browser ownership UUIDs;
- idempotent settlement;
- no dual-write of money or inventory.

This should be introduced only after Marketplace, Contracts, Messaging, Business, and canonical economic ownership are stable.

### G. Access and eligibility graph

**Roadmap sub-item:** `GAME-DESIGN-OWRPG-ACCESS-001`

Centralize the concept of “what can this player currently attempt?” without centralizing ownership of the underlying domain.

Inputs may include:

- location;
- residency;
- progression/credentials;
- reputation;
- relationships;
- country policy;
- active crisis state;
- business ownership;
- previous decisions.

This graph should explain eligibility rather than silently deny actions.

### H. Narrative orchestration and delayed consequence scheduler

**Roadmap sub-item:** `GAME-DESIGN-OWRPG-NARRATIVE-001`

Connect authored story arcs to runtime state without converting the game into a linear quest tree.

The narrative engine should:

- change conditions;
- open/close opportunities;
- deliver information;
- schedule interactions;
- remember decisions;
- apply authorized effects through canonical domains;
- trigger delayed callbacks/consequences;
- support no-response behavior;
- support recovery;
- choose follow-up content based on state;
- remain deterministic/replay-safe for authoritative actions.

The authored Meridian/war spine should shape the world while allowing many player responses.

## Time model

Preserve the authoritative one-year wall-clock concept.

Target rhythms:

### Continuous

- market/runtime simulation;
- passive world state;
- other-player actions;
- background business/economic state where supported.

### Daily

- signals and minor information changes;
- optional opportunities;
- no expectation that every player completes a required task every day.

### Weekly

- one or a few materially important opportunities, obligations, or decisions;
- contracts and institutional actions;
- meaningful player-to-player commerce.

### Monthly

- income/expense reckoning;
- interest/loan state;
- business results;
- macro reports;
- progression/access review;
- residency/relationship consequences where applicable.

### Campaign acts

- major geopolitical/narrative transformation;
- Meridian boom;
- fracture;
- attack;
- outbreak;
- wartime economy;
- belonging;
- reckoning.

The world should always feel alive without constantly demanding a click.

## Consequence architecture

Consequences should be expressed through existing authoritative domains wherever possible.

Examples:

- money through ledger/banking;
- ownership through canonical inventory;
- market prices through financial-market runtime;
- business state through Business authority;
- reputation through Progression/Reputation authority;
- location through World/Travel;
- residency through Residency;
- relationships through the new relationship-memory authority;
- contract status through Contracts;
- story state through narrative runtime.

A decision record may reference these consequences but must not become a second source of truth for them.

## No universal morality meter

The game may track distinct reputations such as:

- professional reliability;
- institutional trust;
- community standing;
- country/public reputation;
- market/business credibility;
- specific character relationships.

Avoid one global “ethical choice” score that tells the player which developer-approved behavior is correct.

Achievements should reward demonstrated skills, resilience, discovery, or participation rather than implying that one political/economic choice was morally correct when the design intends multiple defensible choices.

## Failure and recovery contract

Every severe system needs a recovery design before standard-profile activation.

Examples:

### Business failure

Possible recovery:

- restructure;
- sell/liquidate inventory;
- take employment;
- negotiate debt;
- close and later restart;
- move industries.

### Loan default

Possible recovery:

- delinquency period;
- restructuring;
- higher future borrowing cost;
- improved eligibility after successful payments;
- emergency support where scenario-appropriate.

### Investment loss

Possible recovery:

- sell/rebalance;
- return to income generation;
- use savings;
- reduce obligations;
- rebuild over time.

### Residency failure

Possible recovery:

- appeal/review;
- alternate qualifying path;
- relocation;
- sponsor/institution support;
- later reapplication.

A setback can be serious and persistent without permanently eliminating the player's ability to participate.

## Admin/teacher role in the end state

Admin should be a **supervision and exceptional-control surface**, not the routine game engine.

Teacher/Admin responsibilities may include:

- create/pause/end a game;
- select scenario/game profile;
- moderate players/messages/Marketplace;
- supervise contracts and assessments that genuinely require human review;
- inspect economic state;
- resolve exceptional disputes;
- recover failed runtime effects;
- make authorized corrections;
- trigger instructor-controlled scenario events when desired;
- intervene for classroom safety/fairness.

Normal economic consequences, time advancement, opportunity creation, contract availability, market movement, loan servicing, travel completion, and routine story progression should not require manual teacher operation in the standard open-world profile.

## Implementation phases

The phases below define dependency order. They are not automatic authorization to start work.

### Phase 0 — Preserve and stabilize foundations

**Status:** current prerequisite work already underway outside this roadmap.

Required foundations:

- clean/attested runtime deployment;
- authoritative simulation-time scheduler;
- Checking/Savings convergence;
- canonical economic asset ownership across Store/Inventory/Crafting/Marketplace/Business;
- stable Player request/runtime performance;
- migration convergence;
- game lifecycle/runtime-eligibility authority;
- core Admin supervision surfaces.

Do not build open-world connective mechanics by duplicating state while these foundations remain split.

### Phase 1 — Product contract and vertical-slice specification

**Item:** `GAME-DESIGN-OWRPG-SLICE-001`

Deliverables:

- open-world profile contract;
- 4–6 week vertical-slice scenario;
- player-state starting package;
- at least five viable economic identities;
- explicit information and consequence map;
- failure/recovery cases;
- teacher role;
- metrics and playtest protocol.

No new mechanics required yet.

### Phase 2 — Decision and consequence runtime

**Item:** `GAME-DESIGN-OWRPG-DECISIONS-001`

Deliver one authoritative decision record + delayed consequence mechanism integrated with existing domain authorities.

First supported decision should be a real scenario choice with at least three defensible options and later consequences.

### Phase 3 — Opportunity-driven Player experience

**Item:** `GAME-DESIGN-OWRPG-OPPORTUNITY-001`

Reframe Dashboard around Signals, Opportunities, Obligations, Consequences, and Position.

Do not remove existing routes. Change how the player discovers reasons to use them.

### Phase 4 — Personal economy

**Item:** `GAME-DESIGN-OWRPG-PERSONAL-001`

Introduce limited recurring obligations and personal liquidity stakes.

Acceptance requires predictable obligations, recovery, no micromanagement overload, and compatibility with Checking/Savings.

### Phase 5 — Relationship/institution memory

**Item:** `GAME-DESIGN-OWRPG-RELATIONSHIPS-001`

Persist concrete memories and use them to change at least one later opportunity/access result.

### Phase 6 — Dynamic resource dependency

**Item:** `GAME-DESIGN-OWRPG-DEPENDENCY-001`

Connect world scarcity to player production/trade.

First acceptance path:

**event/supply change → input availability/price → Business or Crafting decision → Marketplace player trade → downstream economic consequence**.

### Phase 7 — Progression as access

**Item:** `GAME-DESIGN-OWRPG-ACCESS-001`

Replace guidance-only progression as the primary reward with capability/access unlocks where safe.

Acceptance requires meaningful new verbs without guaranteed economic return.

### Phase 8 — Decision-capable narrative interactions

**Item:** `GAME-DESIGN-OWRPG-NARRATIVE-001`

Extend authored story from briefing acknowledgement into authoritative choices, no-response behavior, and delayed consequences.

First candidate: Meridian customs/security decision family.

### Phase 9 — Player agreements and deeper multiplayer economy

**Item:** `GAME-DESIGN-OWRPG-AGREEMENTS-001`

Turn selected player negotiations into auditable commitments without replacing Marketplace/Contracts/Business authority.

### Phase 10 — Geography, residency, and war integration

Connect Travel/Residency to economic access, relationships, supply chains, and wartime restrictions.

The war must alter the life the player already built rather than start as a detached scenario.

### Phase 11 — Complete vertical slice

Run the full 4–6 week campaign slice with 30–40 players or high-quality simulated player agents plus human playtests.

No manual teacher intervention should be needed for normal economic state progression.

### Phase 12 — One-year balance and content sufficiency

Run one-year simulation/playtest coverage for:

- viable income paths;
- player recovery;
- wealth distribution;
- business survival/failure;
- credit and savings;
- cross-player commerce;
- country differentiation;
- content repetition;
- crisis pacing;
- no dominant strategy;
- event recovery;
- return-after-inactivity behavior;
- ending diversity.

### Phase 13 — Open-world release gate

The open-world profile may become the default only after the acceptance matrix below passes.

## Vertical-slice scenario target

The first end-to-end open-world slice should be small enough to reason about but rich enough to prove emergence.

Suggested timeline:

### Week 0 — Arrival

Player receives:

- country/location;
- temporary residency;
- local Checking balance;
- modest housing/ordinary obligation;
- one relationship/contact;
- several optional livelihood opportunities;
- basic market/business/store access appropriate to profile.

### Week 1 — Establish a path

Players may choose combinations of:

- employment;
- contract work;
- saving;
- investing;
- business formation;
- trading/Marketplace activity;
- credentials/training.

No one path should be mandatory.

### Week 2 — Build commitments

Players begin accumulating:

- obligations;
- business exposure;
- savings;
- debt;
- supplier relationships;
- investments;
- accepted work;
- player relationships.

### Week 3 — Meridian boom opportunity

A shared economic boom creates visibly attractive opportunities across different systems.

Players should be rewarded for acting on their own thesis, not for finding the single intended button.

### Week 4 — Supply/information shock

Introduce a country-linked disruption that changes:

- at least one resource/input;
- at least one business condition;
- at least one market exposure;
- at least one Marketplace opportunity;
- at least one piece of uncertain information.

### Week 5 — Institutional/security decision

Present a multi-option decision with real tradeoffs and no universal moral answer.

### Week 6 — Delayed consequences

Prior decisions alter:

- financial position;
- relationship/institution state;
- future opportunity/access;
- player interpretation of earlier information.

Players complete a reflection comparing what they predicted with what occurred.

## Vertical-slice success test

The slice passes only if multiple players can truthfully tell materially different stories about the same six-week world.

Minimum qualitative examples:

- one player prioritizes security/liquidity;
- one builds/operates a business;
- one focuses on markets/investment;
- one relies heavily on player trade/relationships;
- one suffers a meaningful setback and recovers.

The stories must arise from authoritative game state, not only from written roleplay.

## Gameplay telemetry and design metrics

Telemetry must measure game design without exposing student-sensitive information.

Candidate metrics:

### Agency

- share of economic actions initiated voluntarily versus explicitly assigned;
- opportunity acceptance/decline/ignore rates;
- number of distinct viable action sequences;
- percentage of players using more than one economic subsystem meaningfully.

### Interdependence

- player-to-player Marketplace volume;
- player transfers tied to legitimate gameplay contexts;
- businesses employing or trading with other players;
- proportion of strategic inputs sourced from players versus NPC/backstop sources.

### Consequences

- decisions producing later state changes;
- average delay between decision and delayed consequence;
- percentage of major consequences with a player-readable causal explanation;
- recovery success after severe setbacks.

### Strategy diversity

- wealth and survival outcomes by strategy;
- concentration of players into one dominant path;
- country-specific strategy differences;
- business sector diversity;
- borrowing/saving/investing mix.

### Pacing

- required-action burden;
- notification/event volume;
- unresolved obligations per player;
- inactivity catch-up volume;
- time between major decisions.

Provisional balance target: no single ordinary strategy should dominate across most scenario seeds and country assignments. Exact numeric thresholds require simulation calibration before they become release gates.

## Acceptance matrix

The open-world north star is not complete until all of the following are proven.

### Player agency

- players can pursue multiple viable goals;
- most opportunities can be declined or ignored;
- the standard profile does not prescribe one main quest chain;
- important decisions consume meaningful scarce resources or opportunity cost;
- no hidden developer-approved morality path controls success.

### Persistent consequence

- significant decisions are recorded once;
- immediate and delayed consequences are distinguishable;
- delayed consequences survive logout/restart;
- players can inspect enough history to understand why an important state changed;
- consequences use canonical domain authorities.

### Personal stakes

- player money has recurring non-investment obligations;
- liquidity matters separately from net worth;
- failure can create stress without permanent elimination;
- recovery routes exist and are visible.

### Economic interconnection

- at least one real item/resource moves through Store/Inventory/Crafting/Business/Marketplace without identity translation hacks;
- world events can affect real player production/trade conditions;
- NPC supply does not make player trade systematically irrelevant;
- market and banking decisions can constrain other player choices through liquidity/exposure.

### Multiplayer

- players can trade useful scarce goods;
- players can communicate directly;
- at least one authoritative player-to-player commitment path exists beyond an immediate fixed-price purchase;
- other players' actions can create meaningful opportunities or risks.

### Relationships and access

- at least one NPC/institution remembers a prior player action;
- that memory changes a later opportunity, eligibility, information source, or ending condition;
- relationship effects are explainable and game-scoped.

### Narrative

- authored global events alter economic conditions;
- players may respond through different systems;
- major decisions have at least two defensible strategies;
- war/crisis reaches personal life, economy, and institution/political layers;
- the game does not require a teacher to manually advance normal player-specific consequences.

### Progression

- progression unlocks meaningful access/capability;
- progression does not guarantee profit;
- players can change economic identity over time;
- achievements do not encode a universal morality meter.

### One-year operation

- authoritative time advances while players are offline;
- catch-up does not produce notification/modal spam;
- no multi-week dead zones without opportunities;
- no runaway reward/inflation loop;
- no strategy creates guaranteed positive carry;
- severe events have recovery;
- endings distinguish wealth, security, relationships, reputation/access, and world outcome.

## Ending model

Final evaluation should be multidimensional rather than a single score.

Candidate dimensions:

- personal wealth/net worth;
- liquidity/financial stability;
- business condition;
- debt/credit condition;
- residency/citizenship/legal status;
- professional/institutional reputation;
- community standing;
- key relationships;
- country/world condition;
- major decision history;
- resilience/recovery history.

Possible ending families from existing narrative work may remain, but their triggers must be based on authoritative state and should not equate wealth with virtue.

## Testing strategy

Every implementation tranche should include normal software tests plus game-design evidence.

### Deterministic scenario tests

Run known decisions against known world states and verify:

- exact domain effects;
- idempotency;
- delayed scheduling;
- no duplicate payout/ownership;
- game isolation;
- recovery behavior.

### Simulation tests

Use reproducible simulated player strategies to identify:

- dominant strategies;
- bankruptcy traps;
- infinite positive carry;
- NPC supply suppression of player trade;
- unusable countries;
- excessive inequality caused by starting conditions;
- unbounded event compounding;
- inaccessible recovery.

### Multiplayer tests

Use 30- and 40-player scenarios covering:

- competing buyers;
- competing sellers;
- business employees;
- player transfers;
- Marketplace scarcity;
- agreements/commitments when implemented;
- simultaneous event response;
- country-team asymmetry.

### Human playtests

Ask players after each slice:

- What were you trying to accomplish?
- What was the hardest decision?
- What information did you trust?
- What did you give up to make your choice?
- What happened that you did not expect?
- Which other player affected your outcome?
- What earlier choice came back later?
- What would you do differently?

If players cannot answer these with specific game-state stories, the open-world design is not yet working.

## Architecture rules for implementation

- one source of truth per domain;
- no duplicate money, inventory, reputation, relationship, or story-state authority;
- all consequential writes server-authoritative and game-scoped;
- browser never owns internal Player UUIDs;
- forward migrations only;
- idempotency for retryable decisions/settlements;
- delayed effects must be deterministic/auditable;
- game pause/end must stop or constrain appropriate time-driven work;
- recovery must preserve historical economic records;
- new read models may aggregate existing domains but do not become write authorities;
- avoid global event state shared across games;
- no client-generated canonical random outcomes;
- no weakening of security or release gates for gameplay speed.

## Interaction with current active work

This roadmap must not collide with current convergence branches.

### Checking/Savings

The personal economy must build on canonical Checking + Savings. It must not create a new Cash wallet.

### Canonical economic asset ownership

Dynamic supply, Business, Crafting, Store, Marketplace, and Inventory dependency work must build on one canonical item/ownership identity.

### Simulation-time runtime

Personal obligations, loan servicing, market clocks, macro updates, travel completion, narrative delays, and world events require one reliable time authority.

### Admin UI V2

Admin V2 work may continue independently. Open-world gameplay should consume the resulting supervision surfaces rather than block or redesign them unless a new authoritative gameplay capability requires corresponding supervision.

### Release/runtime convergence

Open-world mechanics should not be promoted until exact-SHA DB/Edge/Vercel attestation and migration convergence are reliable.

## Suggested future implementation branches

These names are planning suggestions only and are not created by this roadmap.

1. `feat/player-decision-consequence-runtime-v1`
2. `refactor/player-opportunity-command-center-v1`
3. `feat/player-personal-obligations-v1`
4. `feat/player-relationship-memory-v1`
5. `feat/economic-dependency-runtime-v1`
6. `feat/player-progression-access-v1`
7. `feat/story-interaction-decisions-v1`
8. `feat/player-agreements-v1`
9. `feat/world-access-residency-consequence-v1`
10. `test/open-world-vertical-slice-v1`

Before any branch is created, re-audit current `main`, active branches, and the beta completion roadmap as required by `AGENTS.md`.

## Definition of done

`GAME-DESIGN-OWRPG-001` may be considered fully realized only when:

1. the standard game profile is opportunity-driven rather than quest-driven;
2. multiple viable economic identities emerge from player behavior;
3. important decisions consume real scarce resources/opportunity cost;
4. the world records and later reuses player decisions;
5. personal obligations make liquidity meaningful;
6. NPC/institution relationships remember concrete behavior;
7. world scarcity connects to Business/Crafting/Marketplace/player trade;
8. players can materially affect one another's economic outcomes;
9. progression opens meaningful new capabilities/access;
10. authored geopolitical events create different player stories rather than one required response;
11. failure creates recoverable new paths;
12. routine simulation progresses without teacher operation;
13. the one-year simulation remains balanced and explainable;
14. 30–40-player playtests demonstrate materially different player stories from the same world;
15. the release acceptance matrix is green with no duplicate economic authority.

The product should ultimately be judged by a simple player-experience test:

> **Can a player tell a specific story about a difficult decision they made, what they risked, how the world and other players reacted, and how that choice changed what happened later?**

If yes, Econovaria is functioning as an open-world economic RPG. If not, additional feature count alone is not progress toward this north star.
