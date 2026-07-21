# Store, Inventory, Banking, and Progression Framework

Status: draft foundation

## Purpose

Define player-economy content beyond contracts and stocks. This file establishes conceptual requirements for store products, inventory ownership and redemption, bank products, lending, progression levels, reputation, and achievements.

## Store design goals

The store should:

- create meaningful choices about saving and spending;
- provide clear utility and classroom value;
- avoid pay-to-win dynamics inside the simulation;
- support limited scarcity without causing unfair access;
- make item effects and redemption requirements explicit;
- preserve Admin control over physical or classroom-impactful benefits;
- remain balanced against all income sources.

## Store categories

### Academic or classroom benefits

Examples:

- limited deadline extension;
- draft-review opportunity;
- approved minor-assignment benefit;
- homework pass where school policy allows.

These require explicit classroom policy, approval, limits, and non-transferability.

### Contract support

Examples:

- additional clue;
- data report;
- one-time research brief;
- reduced information uncertainty;
- contract extension where allowed.

### Economic tools

Examples:

- market research report;
- currency exposure summary;
- budgeting worksheet;
- transaction-history analysis.

These should provide information or workflow help rather than guaranteed profit.

### Banking and finance benefits

Examples:

- fee waiver;
- one-time loan application review;
- savings-product access;
- financial-planning session.

### Cosmetic and identity items

Examples:

- profile emblem;
- country-themed frame;
- achievement display treatment;
- non-mechanical title.

### Access and progression items

Examples:

- special briefing access;
- optional advanced contract;
- event archive access;
- research-library access.

## Store-item fields

Every product should define:

- stable item ID;
- name;
- category;
- short and long description;
- price;
- currency or accounting unit;
- country availability;
- scenario availability;
- stock model;
- restock rule;
- per-player purchase limit;
- global or session purchase limit;
- ownership limit;
- progression requirement;
- prerequisite content;
- effect type;
- effect parameters;
- duration;
- activation method;
- stackability;
- transferability;
- expiration;
- redemption workflow;
- Admin approval requirement;
- fulfillment burden;
- refund and revocation policy;
- icon and accessibility requirements;
- balance rationale;
- review status.

## Item effect classes

- immediate automatic;
- player-activated automatic;
- player-activated with Admin review;
- Admin-initiated fulfillment;
- physical classroom fulfillment;
- permanent cosmetic unlock;
- time-limited permission;
- information unlock;
- planned or unsupported mechanic.

Unsupported effects must remain visibly planned and unavailable.

## Inventory lifecycle

Recommended conceptual states:

- owned;
- reserved for redemption;
- redemption requested;
- under review;
- approved;
- rejected;
- fulfilled;
- expired;
- revoked;
- consumed.

The current authoritative inventory-redemption contracts may use different exact names. Content must map to those contracts rather than create parallel state.

## Redemption requirements

Every redeemable item should define:

- quantity consumed;
- reservation timing;
- whether cancellation releases reservation;
- approval criteria;
- rejection behavior;
- fulfillment behavior;
- expiry behavior;
- duplicate-request protection;
- Admin notes;
- player confirmation copy;
- audit events.

## Inventory safety rules

- owned quantity cannot fall below reserved quantity;
- fulfillment consumes exactly the authorized amount;
- rejection releases the reservation exactly once;
- repeated requests are idempotent where the same client action is retried;
- transfer and redemption cannot spend the same quantity;
- deactivating a store item does not erase valid owned inventory;
- content retirement includes a treatment for outstanding ownership.

## Initial store quantity target

30–40 products distributed approximately as:

- 8 classroom or academic benefits;
- 6 contract-support tools;
- 5 economic-information tools;
- 4 banking benefits;
- 8 cosmetics and identity items;
- 4 access or progression items;
- optional scenario-specific products.

The exact mix should be reduced if current redemption support cannot represent a category safely.

## Banking product families

### Transaction account

- liquid;
- minimal or no yield;
- supports ordinary balance activity.

### Savings account

- modest yield;
- withdrawal or timing trade-off if supported.

### Fixed-term deposit

- higher yield;
- locked term;
- early withdrawal rule.

### Emergency loan

- small amount;
- fast access;
- higher cost;
- short repayment period.

### Personal development loan

- supports an approved purchase or opportunity;
- affordability review;
- scheduled repayment.

### Business or project loan

- future scope unless business ownership is authoritative;
- must remain planned if unsupported.

### Development or country program

- scenario-specific subsidized product;
- explicit eligibility and policy source.

## Bank-product fields

- stable product ID;
- institution;
- product type;
- name;
- description;
- availability;
- eligibility;
- country restrictions;
- progression requirements;
- minimum and maximum principal;
- interest rate;
- fixed or variable status;
- rate basis;
- term;
- accrual cadence;
- compounding rule;
- payment cadence;
- fees;
- collateral or security if supported;
- approval rule;
- early repayment;
- early withdrawal;
- delinquency;
- default;
- grace period;
- instructor override;
- event sensitivity;
- technical support status;
- review status.

## Credit and affordability

Before any lending content is production-ready, decide:

- whether a credit score exists;
- whether reputation substitutes for credit;
- whether approval uses income, balance, contract history, or fixed scenario rules;
- whether all calculations are deterministic and explainable;
- whether default affects only banking or also progression and reputation;
- how a player recovers from default.

Avoid opaque automated rejection. Player-facing copy should identify the main reason and a path to future eligibility.

## Banking anti-exploit rules

- no deposit yield exceeds borrowing cost under matching risk and term without explicit subsidy;
- no player can repeatedly open products for duplicate bonuses;
- fixed-rate terms do not change retroactively without a defined rule;
- variable rates reference an authoritative rate;
- early withdrawal and repayment are consistent;
- failed payments cannot issue duplicate penalties;
- event changes do not corrupt existing schedules;
- loan proceeds and repayments are auditable ledger events.

## Progression model

Progression should represent learning and participation, not only wealth.

Possible dimensions:

- general level;
- contract reputation;
- banking reliability;
- market experience;
- country or institution reputation;
- crisis-response record;
- achievement collection.

The first release should avoid too many simultaneous numeric progression systems. Prefer one general progression track plus limited domain reputations if supported.

## Level fields

- stable level ID;
- level number;
- name;
- threshold;
- threshold source;
- description;
- unlocks;
- reward;
- notification;
- minimum session conditions;
- backward-compatibility behavior if thresholds change.

## Achievement fields

- stable achievement ID;
- name;
- description;
- category;
- visible or hidden;
- condition;
- progress measurement;
- repeatability;
- reward;
- badge asset;
- notification;
- country or scenario scope;
- retirement behavior;
- review status.

## Initial achievement directions

- complete first contract;
- complete a contract chain;
- save consistently;
- repay a loan;
- diversify holdings;
- respond to a crisis;
- complete a country-development objective;
- participate in a group negotiation;
- identify a market risk;
- use evidence to revise a decision;
- maintain attendance or participation milestone where policy allows;
- complete a tutorial set.

Avoid achievements that reward reckless concentration, excessive borrowing, or guaranteed speculation.

## Initial progression target

- 10 general levels;
- approximately 20 achievements;
- no more than 3 active reputation dimensions in the first production pack unless the UI and backend already support more.

## Cross-system balance review

Store, banking, and progression values must be reviewed together with:

- attendance rewards;
- contract rewards;
- country currency conversion;
- transaction fees;
- market opportunities;
- event rewards;
- instructor adjustments.

## Acceptance tests

- item effect is supported or explicitly planned;
- price and acquisition time documented;
- redemption lifecycle complete;
- no inventory duplication path;
- banking arithmetic consistent;
- no positive-carry exploit;
- progression threshold measurable;
- unlock exists and is safe;
- achievement cannot be awarded repeatedly unless intended;
- country availability is justified;
- content deactivation preserves owned rights or defines compensation;
- Player and Admin language matches;
- physical classroom rewards have explicit instructor policy.