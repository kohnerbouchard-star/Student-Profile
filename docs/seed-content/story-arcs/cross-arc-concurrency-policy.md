# Cross-Arc Concurrency Policy

Stable content ID: `policy.narrative.cross-arc-concurrency.v1`
Content type: narrative orchestration policy
Version: 1.0.0-draft
Maturity: draft
Owner domain: story and event orchestration
Implementation status: manual-compatible; automated enforcement pending

## Purpose

Prevent contradictory, overwhelming, duplicated, or mechanically unsafe story and event combinations across global, country, company, and player scopes.

## Arc classes

### Global structural arc

Examples:

- Meridian Corridor;
- global recession;
- energy transition;
- trade fragmentation.

Characteristics:

- affects most or all countries;
- may span several classroom periods;
- establishes a major shared decision or structural outcome.

Concurrency limit:

- one primary global structural arc in the standard classroom profile.

### Global crisis arc

Examples:

- major customs-security incident;
- international banking disruption;
- systemic shipping failure.

Characteristics:

- urgent;
- high cognitive and economic impact;
- requires recovery and a decision window.

Concurrency limit:

- one active major global crisis;
- no second severe or systemic crisis until the first enters recovery or resolves.

### Country development arc

Examples:

- Northreach resource sovereignty;
- Solvend talent retention;
- Eldoran food-system modernization.

Characteristics:

- country scoped;
- may continue alongside a global structural arc when it is directly relevant and does not duplicate the same decision.

Concurrency limit:

- one primary country development arc per country in the standard profile;
- one optional secondary informational arc may remain visible without a required decision.

### Country crisis arc

Examples:

- port shutdown;
- severe reservoir failure;
- factory safety crisis.

Concurrency limit:

- one country crisis per affected country;
- no country crisis may activate when the country is already below the emergency viability floor unless it is a scripted recovery exercise with instructor approval.

### Company arc

Examples:

- research commercialization;
- industrial restructuring;
- greenwashing investigation.

Concurrency limit:

- one required company decision per player at a time;
- several informational company stories may coexist when they do not create additional required work.

### Personal or progression arc

Examples:

- first savings goal;
- contract-reputation milestone;
- tutorial chain.

These may run alongside world stories if they do not conflict with crisis deadlines or create excessive simultaneous required actions.

## Priority order

When two arcs compete for the same player attention or economic control, apply this priority:

1. Safety and integrity crisis.
2. Accepted Contract with an approaching documented deadline.
3. Active global structural decision.
4. Country crisis.
5. Country development arc.
6. Company decision.
7. Optional personal or progression content.

Priority controls presentation and scheduling, not automatic cancellation.

## Topic-family suppression

Do not activate two unresolved arcs whose primary question is effectively the same.

Suppression families:

- food supply and affordability;
- energy and water security;
- cyber access and data governance;
- debt, banking, and infrastructure finance;
- port capacity and trade routing;
- labor shortage and workforce transition;
- sanctions and export access;
- institutional trust and public information.

Example:

A Meridian customs-security crisis should suppress a separate global platform-breach arc until the Meridian event enters recovery, unless the second event is an explicit escalation stage of the same family.

## Merge policy

Two arcs may merge only when:

- both definitions declare compatibility;
- one combined decision can represent both questions without erasing material trade-offs;
- all affected Contracts and events map to the merged stage;
- duplicate effects are removed;
- recovery and resolution conditions are recalculated;
- instructor or authoritative orchestration approves the merge.

A merge creates a new runtime relationship; it does not rewrite the reusable definitions.

## Supersede policy

An arc may supersede another when:

- the later event makes the earlier question no longer actionable;
- the earlier arc’s accepted work receives a documented grace, conversion, or cancellation path;
- applied economic and financial history is preserved;
- notifications explain the change;
- follow-up and recovery content reference the superseded arc.

Superseded does not mean deleted.

## Pause and resume policy

A development arc may pause during a major crisis.

Pause behavior:

- hide new required decisions;
- preserve delivered content and submissions;
- freeze new stage advancement;
- preserve accepted Contract grace rules;
- suspend delayed effects that depend on a choice not yet made;
- continue passive economic effects only when the source condition still exists.

Resume behavior:

- issue a recap;
- recalculate availability and deadlines;
- identify which assumptions changed during the pause;
- do not repeat already completed rewards or decisions;
- permit revision when the crisis materially changed the evidence.

## Conflict detection

A preflight should detect:

- two events modifying the same field in opposite directions without an ordering rule;
- duplicate required decisions;
- two arcs claiming terminal control of the same institution or company;
- inconsistent country participation states;
- an active recovery and a new shock from the same family;
- overlapping expiry windows that exceed the classroom action cap;
- incompatible news fact states;
- repeated reward or unlock paths.

## Effect ordering

Recommended order within one period:

1. Confirm expiring or resolved effects.
2. Apply scheduled recovery.
3. Apply authorized policy responses.
4. Apply new event conditions.
5. Calculate capped country and market results.
6. publish news and notifications.
7. open new decisions and Contracts.

This order prevents a new event from being calculated against an obsolete unrecovered state.

## Standard classroom profile limits

- one global structural arc;
- one major global crisis;
- no more than two unresolved capacity warnings globally before a shared crisis;
- one required action request per player;
- one primary country arc per country;
- one required company decision per player;
- no severe event during unresolved major crisis;
- no second event from the same suppression family without explicit escalation linkage.

## Sandbox profile

The instructor may exceed standard limits only when:

- the scenario is visibly labeled sandbox or advanced;
- preflight shows projected cumulative effects;
- no authoritative field bound is exceeded;
- every active severe event has a recovery path;
- the number of player actions remains explicit;
- rewards and Contracts cannot duplicate.

## Validation

- every arc declares class and topic family;
- compatibility and suppression relationships exist;
- standard limits enforced or manually checked;
- pause, resume, merge, and supersede preserve audit history;
- no runtime state stored globally;
- no player action silently discarded;
- economic effects are capped after ordering;
- news and notifications match final active state.

## Review status

- narrative review: ready for re-review
- economic review: cumulative-cap alignment pending
- gameplay review: standard limits aligned
- technical review: orchestration persistence and preflight pending