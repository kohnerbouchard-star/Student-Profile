# Locations, Tutorials, and Notifications Framework

Status: draft foundation

## Purpose

Define geographic content, map-linked economic locations, instructional modules, and product-wide system language.

## Location design goals

Locations should make economic activity spatially understandable. A location must be more than a label on the map; it should connect to industries, institutions, companies, events, contracts, or country identity.

## Location categories

- capital;
- port;
- financial center;
- industrial zone;
- agricultural region;
- mining or resource region;
- energy site;
- technology and research hub;
- university and cultural center;
- logistics junction;
- tourism center;
- special economic zone;
- strategic chokepoint;
- public infrastructure project.

## Location fields

Every location should define:

- stable location ID;
- name;
- country;
- location category;
- map region or coordinate reference;
- short map copy;
- detailed description;
- historical role;
- industries;
- institutions;
- companies;
- commodities;
- infrastructure;
- economic strengths;
- vulnerabilities;
- contracts;
- event hooks;
- story arcs;
- player access rules;
- progression requirements if any;
- map asset and marker requirements;
- accessible text description;
- technical mapping status.

## Location quantity target

Initial target: 5–7 meaningful locations per country, approximately 50–70 total.

Recommended minimum per country:

- capital;
- one production or resource location;
- one trade or logistics location;
- one institutional, cultural, or research location;
- one vulnerability or story-sensitive location.

## Map integrity rules

- use official country map identifiers;
- do not invent a location outside the country's map boundary without a cross-border classification;
- avoid placing every important function in the capital;
- location bonuses require explicit supported mechanics;
- map copy should not imply click actions or features that remain planned;
- location names must be unique enough for search and navigation;
- every map marker needs alt text and a non-map access path.

## Initial Meridian location directions

- Frostgate Northern Terminal — Northreach;
- Sableport Automated Container District — Yrethia;
- Dusk Harbor Bonded Quarter — Thaloris;
- Aurora Spire Systems Campus — Solvend;
- Crescent Bay Commodity Exchange — Eldoran;
- Glassfall Hydroelectric Complex — Valerion;
- Starfall Meridian Forum Hall — Lumenor;
- Emberhall Development Finance District — Xalvoria;
- Ironhold Rail Works — Dravenlok;
- Blacklight Critical Network Center — Syndalis.

These are working content names and require country-file review.

## Tutorial architecture

Tutorials should be short, contextual, and action-based.

Each tutorial should contain:

1. concept explanation;
2. concrete example;
3. player action;
4. completion condition;
5. recovery or retry path;
6. help link or glossary reference.

## Tutorial modules

Initial target: 10–12.

### 1. Entering a game session

- Game or Session Code;
- Player ID;
- Access Code;
- credential privacy;
- login failure recovery.

### 2. Understanding the dashboard

- balances;
- country identity;
- active priorities;
- events and notifications.

### 3. Reading the country overview

- strengths;
- vulnerabilities;
- currency;
- industries;
- current conditions.

### 4. Completing contracts

- availability;
- acceptance;
- instructions;
- submission;
- review;
- payout.

### 5. Store and inventory

- price;
- purchase;
- ownership;
- item effect;
- redemption.

### 6. Banking

- account versus loan;
- interest;
- repayment;
- affordability;
- default recovery.

### 7. Stocks and markets

- price;
- return;
- volatility;
- diversification;
- order completion;
- no guaranteed outcome.

### 8. Currencies and conversion

- country currency;
- exchange index;
- display rules;
- conversion timing.

### 9. Economic indicators

- growth;
- inflation;
- unemployment;
- interest rate;
- confidence.

### 10. Events and news

- confirmed versus forecast;
- event impact;
- active story;
- decision windows.

### 11. Progression and achievements

- thresholds;
- unlocks;
- reputation if supported;
- achievement progress.

### 12. Help, privacy, and unavailable features

- planned capability treatment;
- error recovery;
- no ownership UUID exposure;
- contacting the instructor.

## Tutorial design rules

- do not block ordinary use after the player understands the task;
- support replay;
- preserve reduced-motion and keyboard access;
- avoid unexplained technical terms;
- do not require a destructive or irreversible action for completion;
- use safe sample values or clearly marked tutorial fixtures;
- completion must not issue duplicate rewards.

## Notification taxonomy

### Transactional

- purchase completed;
- reward issued;
- transfer completed;
- loan payment recorded;
- stock order completed.

### Lifecycle

- contract assigned;
- contract accepted;
- submission received;
- changes requested;
- contract approved;
- redemption requested;
- redemption approved;
- redemption rejected;
- item fulfilled.

### Time-sensitive

- deadline approaching;
- event decision expiring;
- loan payment due;
- offer expiring;
- market or feature availability window.

### Narrative

- new story stage;
- character message;
- crisis escalation;
- recovery update;
- resolution.

### System and reliability

- data unavailable;
- retry required;
- maintenance;
- session expired;
- authentication failure;
- unsupported capability.

## Notification fields

- stable template ID;
- category;
- title;
- body;
- urgency;
- target scope;
- trigger;
- destination route;
- action label;
- read and archive behavior;
- deduplication key;
- expiration;
- accessible announcement behavior;
- email or external delivery status if ever supported;
- technical mapping status.

## Notification language rules

- state the outcome first;
- use the player's display identifiers, never backend ownership UUIDs;
- do not claim money, inventory, or status changed until authoritative success;
- provide an action when action is possible;
- explain unavailable or rejected actions without exposing internal errors;
- use consistent lifecycle terminology;
- do not label a forecast as an event outcome;
- avoid urgent styling for routine information.

## Canonical message directions

### Contract approved

Include:

- contract title;
- approval result;
- reward status;
- route to details.

Do not state reward issued until ledger issuance succeeds.

### Purchase completed

Include:

- item;
- quantity;
- amount and currency;
- inventory status.

### Redemption requested

Include:

- item;
- quantity reserved;
- review state;
- cancellation behavior if supported.

### Loan payment due

Include:

- product;
- amount;
- due date;
- consequence and recovery information.

### Event alert

Include:

- what changed;
- affected country or system;
- player relevance;
- decision deadline if any;
- source route.

## Search and discovery requirements

- country, company, character, institution, event, and contract names should be searchable;
- aliases and tickers should be indexed where supported;
- map content should have list-based alternatives;
- archived news should remain discoverable by event and country;
- deprecated content should not appear in ordinary player search;
- Admin search should distinguish definition, runtime instance, and fixture.

## Acceptance tests

- every location references a valid country;
- map marker and text route agree;
- tutorial action can be completed safely;
- tutorial completion is idempotent;
- notification trigger matches authoritative success or state;
- deduplication behavior defined;
- links resolve to supported routes;
- no private identifier exposed;
- unavailable capability is clearly labeled;
- urgent notifications are reserved for time-sensitive or high-impact conditions;
- copy is readable, consistent, and accessible.