# Econovaria Seed Content Program Charter

Status: draft foundation
Owner: content program
Implementation authority: deferred pending compatibility audit

## Mission

Create a production-grade, searchable, internally coherent seeded-content library that makes Econovaria playable, explainable, teachable, administrable, and technically safe.

The program must produce more than isolated records. Countries, currencies, industries, companies, contracts, store products, bank products, events, news, characters, locations, achievements, and tutorials must operate as a connected economic and narrative system.

## Primary outcomes

The program is successful when a new game session can begin with:

- a recognizable global situation;
- ten economically differentiated but viable countries;
- a clear set of player opportunities;
- companies and markets that respond logically to events;
- contracts tied to learning and narrative progression;
- store, inventory, banking, and progression systems with understandable incentives;
- story arcs that generate choices and delayed consequences;
- enough content variation to support repeated classroom sessions;
- complete Admin and Player terminology alignment;
- deterministic test fixtures that remain separate from production content.

## Non-goals for the foundation tranche

This tranche does not:

- change applied database history;
- create production migrations;
- rewrite current backend contracts;
- change frontend routes or UI;
- establish final prices or reward values without balance review;
- deploy content to Supabase;
- make unimplemented Player capabilities appear operational;
- duplicate current authoritative country or currency definitions.

## Content ownership model

Each record has one canonical owner domain.

Examples:

- country identity belongs to world canon;
- current inflation belongs to game-session runtime state;
- a company template belongs to market content;
- a player holding belongs to runtime market state;
- a reusable event definition belongs to event content;
- an active event instance belongs to game-session runtime state;
- a contract template belongs to contract content;
- assignment, acceptance, submission, approval, and payout belong to runtime contract state;
- an achievement definition belongs to progression content;
- a player's earned achievement belongs to runtime progression state.

No record should be copied into a second domain merely for convenience. Read models may project the same data, but authority must remain singular.

## Governance roles

### Content architect

Owns catalog structure, naming, templates, cross-domain references, and deprecation policy.

### World and narrative designer

Owns setting, history, institutions, characters, story arcs, interactions, and continuity.

### Economic systems reviewer

Owns plausibility, indicator ranges, market exposure, reward-to-price relationships, and systemic risk.

### Gameplay and learning reviewer

Owns player decision quality, pacing, classroom clarity, instructional alignment, and accessibility of language.

### Technical compatibility reviewer

Owns schema mapping, identifiers, session scope, idempotency, environment separation, and security boundaries.

### Release approver

Confirms all blocking reviews are closed before content enters staging or production.

One person may perform more than one role, but each review must be documented separately.

## Required metadata for all production-targeted content

Every content record must ultimately include:

- stable content ID;
- display name or title;
- content type;
- maturity status;
- version;
- canonical owner domain;
- source or design rationale;
- game-session applicability;
- country, industry, company, character, or location references where applicable;
- availability rules;
- lifecycle status;
- player-facing copy;
- Admin-facing notes where needed;
- economic effects;
- narrative effects;
- learning objective where applicable;
- asset requirements;
- review status;
- deprecation replacement when deprecated;
- implementation mapping status.

## Quality gates

### Gate A: Canon

Required before bulk creation:

- country names and roles confirmed;
- currency names and codes confirmed;
- global premise confirmed;
- historical starting point established;
- core terminology frozen for the tranche;
- stable identifier convention approved.

### Gate B: Systems

Required before values are finalized:

- economic indicators defined;
- effect-size scale defined;
- reward economy defined;
- price bands defined;
- progression pacing defined;
- event consequence boundaries defined.

### Gate C: Pilot vertical slice

Required before bulk production:

- one complete story arc;
- country-specific perspectives;
- contracts and interactions;
- at least three companies;
- market consequences;
- store and banking touchpoints;
- resolution and follow-up states;
- test fixtures.

### Gate D: Domain review

Required before staging:

- economic review passed;
- narrative continuity review passed;
- gameplay and learning review passed;
- technical compatibility review passed;
- sensitive-content review passed.

### Gate E: Staging

Required before production:

- idempotent load verified;
- references verified;
- environment isolation verified;
- Admin rendering verified;
- Player rendering verified;
- reset and rollback verified;
- no fixture leakage;
- no ownership UUID exposure;
- no unsupported capability presented as live.

## Change control

Content changes are classified as:

- copy-only: does not alter mechanics or references;
- balance: changes prices, rewards, rates, probabilities, or effect magnitudes;
- behavioral: changes triggers, branches, eligibility, or lifecycle;
- canonical: changes history, country identity, institutions, or terminology;
- breaking: changes stable identifiers or removes referenced content.

Canonical and breaking changes require explicit migration or compatibility planning even when the content is stored outside the database.

## Versioning

Recommended format:

- major version: breaking identifier, canonical, or behavior change;
- minor version: new compatible content, branch, effect, or field;
- patch version: wording, formatting, metadata, or non-mechanical correction.

Each production content pack should have a manifest version and a minimum compatible application contract version.

## Definition of production grade

A seeded-content concept is production grade only when:

- its complete field set is known;
- its purpose is explicit;
- its economic and narrative dependencies are documented;
- it has stable identifiers;
- its references are valid;
- its player and Admin copy are reviewed;
- its values are within approved bands;
- its lifecycle and failure states are defined;
- its session scope is correct;
- it has staging fixtures and acceptance tests;
- it has rollback and deprecation behavior;
- it does not depend on an unsupported feature without a visible planned-state treatment.