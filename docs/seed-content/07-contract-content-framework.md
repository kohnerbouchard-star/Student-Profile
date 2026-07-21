# Contract Content Framework

Status: draft foundation

## Purpose

Define the content architecture for contracts as the primary structured player-work loop. Contracts should connect classroom learning, narrative developments, country conditions, approvals, rewards, and progression without duplicating runtime contract lifecycle authority.

## Contract families

### Onboarding

Purpose:

- teach navigation;
- establish country context;
- introduce balances, contracts, store, inventory, and markets;
- provide safe first rewards.

### Analysis

Purpose:

- interpret data;
- compare alternatives;
- explain cause and effect;
- evaluate risk.

### Research

Purpose:

- gather evidence;
- investigate company, country, industry, or event questions;
- support later decisions.

### Policy recommendation

Purpose:

- evaluate trade-offs;
- recommend government or institutional action;
- connect economics to public outcomes.

### Market and finance

Purpose:

- understand stocks, diversification, risk, saving, borrowing, and opportunity cost;
- avoid encouraging guaranteed-return behavior.

### Operational response

Purpose:

- respond to shortages, logistics problems, cyber incidents, or company disruptions;
- make time and resource trade-offs.

### Narrative mission

Purpose:

- progress an authored story arc;
- create a decision, relationship, or follow-up state.

### Recurring

Purpose:

- support routine classroom behavior or repeated analysis;
- require explicit duplication and payout safeguards.

### Group or classroom

Purpose:

- coordinate shared work;
- divide roles;
- support international negotiation or crisis response.

### Country-specific

Purpose:

- use country strengths, vulnerabilities, and story conditions.

## Contract-definition fields

Every reusable contract should define:

- stable contract ID;
- title;
- short summary;
- family;
- objective;
- detailed instructions;
- required output;
- submission method;
- evidence requirements;
- learning objective;
- estimated effort;
- difficulty;
- eligibility;
- country availability;
- progression requirements;
- prerequisite contracts;
- prerequisite story and event states;
- availability window;
- recurrence;
- acceptance rules;
- completion criteria;
- approval requirements;
- rejection and revision rules;
- expiration behavior;
- reward policy;
- item reward policy;
- progression or reputation effects;
- issuing institution and character;
- story arc and stage;
- follow-up content;
- Admin notes;
- maturity and review status;
- implementation mapping.

## Runtime lifecycle distinction

The reusable definition does not own:

- assigned player;
- accepted timestamp;
- submission;
- approval status;
- reviewer;
- payout transaction;
- attempt history;
- completion timestamps;
- game-session ownership.

These belong to authoritative runtime contract state.

## Recommended lifecycle vocabulary

- available;
- assigned;
- accepted;
- in progress;
- submitted;
- changes requested;
- approved;
- rejected;
- expired;
- cancelled;
- reward pending;
- reward issued.

The exact implementation states must be mapped to current backend contracts. Player and Admin copy should not use different terms for the same state.

## Difficulty model

Difficulty should consider:

- reading complexity;
- number of concepts;
- required evidence;
- amount of calculation;
- ambiguity;
- time pressure;
- collaboration complexity;
- economic or narrative risk;
- prerequisite knowledge.

Suggested levels:

- introductory;
- standard;
- advanced;
- expert or scenario-gated.

Difficulty is not simply a reward multiplier. Any relationship between difficulty and payout must be explicit and balanced.

## Reward policy

A contract reward should define:

- reward currency or unit;
- base amount;
- whether conversion occurs;
- conversion timing;
- difficulty treatment;
- group distribution;
- partial credit policy;
- repeat completion policy;
- first-completion bonus;
- item reward;
- progression or reputation reward;
- approval dependency;
- duplicate issuance protection.

### Reward safeguards

- payout only once for one approved completion unless the definition is intentionally repeatable;
- retries do not create additional rewards without a new eligible cycle;
- group rewards define per-player versus shared value;
- rejection does not issue rewards;
- changes requested preserve or replace the same submission according to one rule;
- expiration behavior is explicit;
- reward issuance is observable and auditable.

## Narrative contract chains

A chain should define:

- chain ID;
- purpose;
- entry contract;
- stage order;
- optional branches;
- prerequisite outcomes;
- maximum simultaneous active contracts;
- failure and re-entry behavior;
- final reflection;
- reward pacing;
- story-state consequences.

### Meridian pilot chain

#### 1. Evaluate the Meridian Corridor

Objective:

Identify benefits, risks, stakeholders, and dependencies.

Learning:

- trade-offs;
- international interdependence;
- infrastructure investment.

#### 2. Analyze national exposure

Objective:

Explain how the Corridor affects the player's assigned country.

Learning:

- comparative advantage;
- specialization;
- dependency.

#### 3. Compare governance and financing

Objective:

Compare centralized finance, multilateral governance, logistics-led development, and industrial-security models.

Learning:

- debt;
- ownership;
- opportunity cost;
- public goods.

#### 4. Respond to the first disruption

Objective:

Recommend action after a harvest, shipping, energy, resource, labor, or cybersecurity warning.

Learning:

- supply shocks;
- risk management;
- policy response.

#### 5. Review outcomes

Objective:

Evaluate immediate and delayed consequences of the selected approach.

Learning:

- short-term versus long-term outcomes;
- unintended consequences;
- evidence-based reflection.

## Initial contract quantity plan

### Onboarding: 10

- country briefing;
- dashboard orientation;
- first contract;
- first purchase;
- inventory explanation;
- banking introduction;
- market reading;
- event and news interpretation;
- currency explanation;
- reflection.

### General economic literacy: 10

- scarcity;
- opportunity cost;
- incentives;
- supply and demand;
- inflation;
- interest rates;
- unemployment;
- trade;
- comparative advantage;
- risk and diversification.

### Country development: 10

One initial development contract per country.

### Markets and banking: 8

- compare savings products;
- evaluate loan affordability;
- analyze a company;
- diversification plan;
- earnings response;
- interest-rate scenario;
- currency exposure;
- portfolio reflection.

### Narrative and crisis response: 8

Connected to Meridian and early country arcs.

### Group or negotiation: 4

- trade negotiation;
- Corridor charter;
- emergency allocation;
- recovery review.

Target: approximately 50 initial contracts.

## Submission and approval design

Each contract should specify whether it is:

- automatically verifiable;
- manually reviewed;
- instructor-observed;
- group-reviewed;
- externally completed and manually confirmed.

Manual review requires:

- acceptance criteria;
- revision policy;
- reason copy for rejection or changes requested;
- reviewer notes policy;
- reward effect;
- auditability.

## Contract copy standards

The player should be able to identify:

- what to do;
- why it matters;
- what to submit;
- when it is due;
- how completion is judged;
- what reward is available;
- which event or story created the task.

Avoid:

- long lore before the task;
- unspecified deliverables;
- hidden grading criteria;
- contradictory time windows;
- institutional jargon without explanation;
- rewards described in a currency different from the authoritative payout rule.

## Country-specific contract rules

A country-specific contract must use at least one real country characteristic:

- strength;
- vulnerability;
- industry;
- dependency;
- location;
- institution;
- active story state.

Changing only the country name does not create a valid country-specific contract.

## Repeatable contract rules

Repeatable content must define:

- recurrence cadence;
- eligible reset condition;
- maximum completions;
- reward decay or stable reward;
- duplicate prevention;
- whether narrative state changes each time;
- what happens when accepted near the end of a session.

## Contract acceptance tests

- all fields complete;
- lifecycle maps to supported runtime behavior;
- objective and submission align;
- reward is explicit and within band;
- prerequisites exist;
- story state is valid;
- country restriction is justified;
- no duplicate reward path;
- failure and expiration behavior defined;
- Admin and Player terminology aligned;
- learning objective is observable;
- instructions are readable and actionable;
- follow-up references exist;
- content remains useful outside one exact numerical scenario where intended.