# One-Year Real-Time Content and Market Cadence Contract v1

Status: authoritative design constraint for PR #163  
Owner: `agent/seed-content-foundation-v1`  
Production authorization: false  
Runtime implementation: pending

## Product constraints

1. One Econovaria game runs for one real-world year from the authoritative game start timestamp to its anniversary.
2. The simulation uses wall-clock time. It is not round-based and does not advance only when a player is online.
3. Financial prices are evaluated once for every eligible open-market minute.
4. Markets close outside their configured real-world-style exchange sessions, including weekends, holidays, and approved early closes.
5. Closed markets do not receive synthetic price movement merely because another real-world minute elapsed.
6. Backend state is authoritative. Clients may animate or interpolate only between persisted states and may never generate canonical prices.
7. Content definitions must support a year-long campaign through recurrence, stateful chains, procedural variation, cooldowns, seasonal scheduling, and recovery paths. One-shot record counts alone are not a sufficient content-completion standard.

## Current implementation evidence and gap

The legacy stock-market implementation defines a market timezone and explicit open and close hours. The current Player dashboard contract exposes `marketStatus`, but the current repository implementation derives it from whether the entire game session is active. Therefore an active one-year game can presently be reported as an open market outside actual trading hours.

Required correction:

- replace `game session active => market open` with an authoritative exchange-calendar decision;
- expose the current exchange session state and next transition;
- reject or queue execution according to the order policy while the market is closed;
- publish `market_status_changed` only when the authoritative calendar transitions.

## Exchange calendar contract

Every exchange must define:

- stable exchange ID and code;
- IANA timezone;
- regular weekly trading days;
- local open and close times;
- holiday calendar source or versioned holiday records;
- early-close exceptions;
- emergency closure and reopening controls;
- supported asset classes;
- closed-session order policy;
- settlement-day policy;
- calendar version and effective dates.

No exchange may infer open status from the player's timezone, browser clock, or game-session status.

## Minute-processing rules

For every elapsed minute:

1. derive the canonical UTC minute key;
2. identify exchanges whose calendars mark that minute as open;
3. evaluate only instruments assigned to those open exchanges;
4. load the previous authoritative instrument state;
5. apply supported macro, country, sector, issuer, instrument, event, policy, liquidity, and order-flow factors;
6. apply controlled stochastic movement from a deterministic seed contract;
7. enforce volatility bands, liquidity limits, circuit breakers, non-finite guards, and price floors;
8. persist one idempotent minute result or compact minute bar;
9. execute eligible queued orders against the authoritative minute state;
10. publish the persisted update to connected clients.

A processed minute may validly produce a zero return. The engine must never force visible movement.

## Closed-market behavior

During a closed exchange session:

- listed prices remain at the last authoritative close;
- no regular-session volume or trade execution occurs;
- no open-minute price tick is created;
- GTC orders may be accepted as pending if the Backend order policy allows it;
- day orders expire according to the exchange calendar;
- cancellations may remain available;
- news, events, interest accrual, account transfers, Contract progress, inventory changes, and other non-exchange systems may continue under their own authoritative schedules;
- the next opening minute may incorporate accumulated overnight information through a bounded opening-gap calculation rather than retroactively generating closed-session ticks.

The current Player payload normalizer forces market orders to `GTC`; execution must therefore be calendar-gated rather than silently treated as immediate during a closure.

## Downtime and catch-up

If the scheduler is unavailable, recovery must:

- identify missing eligible open-market minutes from persisted cursor state;
- skip minutes when the relevant exchange was closed;
- replay missing open minutes deterministically and in order;
- use an idempotency key composed from game, exchange, instrument, and minute;
- prevent duplicate price bars, trades, ledger entries, and notifications;
- support a bounded catch-up limit and administrative pause when the backlog exceeds that limit;
- retain replay evidence.

## One-year scale boundary

A 365-day game has 525,600 wall-clock minutes, but only exchange-open minutes generate regular market ticks. Capacity must be calculated from each versioned exchange calendar rather than multiplying every instrument by all 525,600 minutes.

At the bounded target of 240 active instruments, storage and compute planning must use:

`sum(exchange open minutes × active instruments on that exchange)`

The full 3,200-instrument library must remain a reusable definition library, not a simultaneously active player market, unless later load testing explicitly authorizes that scale.

## Year-long content sufficiency standard

The current definition counts are a foundation, not enough as 208 unrelated one-time experiences. A one-year game requires a content scheduler and reusable variation system.

Required layers:

- daily market, country, and personal-state observations;
- weekly Contracts, institutional decisions, and minor shocks;
- monthly economic reports, bills, interest, rent, wages, and portfolio statements;
- quarterly macro revisions, corporate reporting, policy changes, and progression reviews;
- seasonal scarcity, weather, tourism, agriculture, energy, and logistics effects;
- multi-week and multi-month event chains;
- at least one year-scale geopolitical or war arc with branches, escalation, recovery, and post-crisis consequences;
- inactivity recovery and returning-player summaries;
- procedural variants by country, class, holdings, inventory, relationships, difficulty, and prior decisions;
- cooldown, deduplication, prerequisite, exclusion, and consequence memory.

The content engine must generate meaningful combinations from approved templates without repeating identical text or effects excessively.

## Content coverage evidence required before approval

Simulation must demonstrate for a complete one-year timeline:

- no multi-week periods without meaningful player-facing opportunities;
- no excessive Contract or notification spam;
- bounded repetition rates by template and variant;
- viable income and recovery opportunities throughout the year;
- price sinks and reward sources remaining balanced over time;
- event chains resolving or transitioning without dead ends;
- war and crisis effects not permanently destroying all recovery paths;
- inactive players receiving safe catch-up rather than hundreds of modal interruptions;
- difficulty changing quantities and pressure without removing basic viability.

## Immediate implementation consequences

1. Add an authoritative exchange-calendar registry and calendar service.
2. Correct dashboard `marketStatus` so it does not mirror the game-session status.
3. Gate order execution and price generation on exchange-open minutes.
4. Add deterministic missed-open-minute replay.
5. Expand seed validation from static counts to one-year schedule coverage and repetition analysis.
6. Run the six-country financial simulations over calendar-aware open sessions.
7. Keep runtime activation blocked until the one-year and minute-cadence evidence passes.
