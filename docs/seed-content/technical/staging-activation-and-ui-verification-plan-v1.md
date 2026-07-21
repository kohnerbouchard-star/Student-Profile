# Staging Activation and Admin/Player Verification Plan v1

Status: design candidate  
Implementation status: blocked  
Production authorization: false

## Purpose

Define the operational sequence for Workstreams 8, 9, and 10:

1. implement the staging importer and validation tooling;
2. activate a bounded content subset in isolated staging;
3. verify Admin and Player behavior end to end;
4. rehearse deactivation and rollback.

## Workstream 8 — importer and preflight

### Required commands or equivalent operations

- validate pack schema;
- validate checksums;
- validate references;
- validate capability requirements;
- validate environment identity;
- dry run;
- apply definitions;
- activate eligible definitions;
- load isolated fixtures;
- verify counts;
- deactivate pack;
- clean fixtures;
- export immutable audit report.

### Preflight failures that must block writes

- wrong database or project identity;
- prohibited environment;
- unsupported application-contract version;
- invalid pack version;
- checksum mismatch;
- duplicate stable ID;
- invalid country or currency;
- unresolved issuer, location, route, event, Contract, or asset reference;
- missing required capability;
- fixture content outside an allowed environment;
- value outside approved balance bands;
- dependency cycle;
- absent rollback or deactivation strategy.

### Import phases

1. acquire import lock;
2. verify environment and application compatibility;
3. verify manifest and checksums;
4. validate all definitions and fixtures;
5. write pack registry record;
6. load reference definitions in dependency order;
7. verify referential integrity and expected counts;
8. activate only eligible definitions;
9. load fixtures only when explicitly requested;
10. write immutable import audit;
11. release lock;
12. run read verification.

### Idempotency requirements

- exact replay is a no-op;
- unchanged records are not rewritten;
- modified content under the same immutable version is rejected;
- interrupted runs resume safely;
- definitions are not duplicated;
- player balances, items, holdings, Contracts, messages, and events are not duplicated;
- fixture reset is deterministic.

## Workstream 9 — bounded active staging subset

### Recommended initial market subset

Per country:

- 12–20 common equities;
- 2–4 corporate bonds;
- 1–2 sovereign or public-agency bonds;
- 1 national index;
- 1 sector index or reference benchmark;
- optional 1 fund or trust only when supported.

Target:

- approximately 20–30 visible instruments per country;
- approximately 200–300 visible instruments for the first staging session;
- remaining 3,200-instrument definitions inactive or catalog-only.

### Recommended initial narrative and player subset

- ten countries and currencies;
- ten arrival packages;
- one Meridian opening arc;
- ten country arrival interactions;
- five initial Meridian Contracts;
- five Store items;
- two banking products;
- selected progression levels and achievements;
- opening events, news, messages, and notifications;
- one ordinary fixture and one crisis fixture per major domain.

### Activation rules

A definition can become active only when:

- references resolve;
- required capabilities exist;
- economic values are inside approved bands;
- narrative and technical reviews pass;
- Player and Admin copy exists;
- assets exist or an approved fallback is declared;
- lifecycle and failure behavior are complete;
- fixtures exist;
- rollback or deactivation is defined.

## Workstream 10 — Admin verification

### Content inventory

Verify Admin can distinguish:

- content-pack definition;
- reusable content definition;
- active game-session instance;
- test or staging fixture;
- deprecated or deactivated content.

### Required Admin checks

- search by stable ID, name, symbol, country, domain, and status;
- counts match manifest and expected counts;
- capability-blocked records are visibly blocked;
- fixture content is clearly labeled;
- review status is visible;
- definition version and pack source are visible;
- deactivation prevents new use without erasing history;
- audit history records import, activation, update, deactivation, and rollback;
- no reusable definition exposes player UUIDs, Player IDs, Access Codes, or credentials;
- monetary and market changes are not claimed until authoritative success;
- unsupported instrument classes cannot be activated accidentally.

### Admin failure states

- unavailable content service;
- partial count mismatch;
- missing asset;
- invalid reference;
- checksum conflict;
- failed activation;
- interrupted import;
- failed rollback;
- stale application contract.

Each state requires actionable, non-destructive recovery information.

## Workstream 10 — Player verification

### Arrival flow

- authenticated country and game scope load correctly;
- player sees adopted country and local currency;
- arrival package creates no duplicate grants;
- first message, Contract, tutorial, and news item appear once;
- sponsor and relationship copy matches country opening;
- unavailable class system remains hidden or visibly planned until Workstream 11;
- recovery flow exists when first actions fail.

### Market

- pagination and virtualized or bounded rendering remain responsive;
- search supports symbol, issuer, name, country, sector, and instrument type;
- filters combine predictably;
- active and inactive instruments are distinguishable;
- reference indexes are not presented as tradable securities;
- suspended and unavailable instruments preserve holdings and explain restrictions;
- equity, bond, fund, trust, index, and benchmark detail views use correct fields;
- no generated value is shown as calibrated unless approved;
- empty, loading, error, and partial-data states work.

### Contracts and economy

- Contract availability and acceptance follow authoritative scope;
- rewards issue exactly once;
- Store purchases and inventory ownership remain consistent;
- redemption states are understandable;
- banking arithmetic and due dates are correct;
- progression and achievements do not duplicate;
- currency conversion uses authoritative rates;
- event effects apply exactly once;
- news uses correct fact status and correction lineage.

### Narrative and war

- events affect personal, economic, and political layers;
- player remains a civilian economic participant unless another role is explicitly supported;
- uncertainty and disputed attribution remain visible;
- war does not eliminate all viable player strategies;
- ceasefire and reconstruction preserve prior consequences;
- personal and world outcomes are evaluated separately.

### Accessibility and responsive behavior

- keyboard access;
- visible focus;
- screen-reader names;
- reduced motion;
- map alternatives;
- readable tables and cards;
- no clipping at desktop, compact, and narrow widths;
- no color-only status communication;
- long names, symbols, values, and translated copy remain contained.

## Performance targets to define before execution

The final verification profile must set approved limits for:

- initial market-list load;
- paginated request latency;
- search response time;
- filter response time;
- instrument-detail load;
- Admin content search;
- import dry run;
- import apply;
- rollback;
- browser memory and DOM size.

No performance number is approved by this document.

## Verification fixtures

Minimum required:

- stable boom arrival;
- low-liquidity arrival;
- diversified portfolio;
- empty portfolio;
- suspended instrument;
- bond maturity;
- Store redemption approval and rejection;
- loan delinquency;
- food shortage;
- port congestion;
- Meridian attack;
- ceasefire and reconstruction;
- unavailable market service;
- import replay;
- checksum conflict;
- wrong environment.

Reference: `../fixtures/scenario-fixture-matrix-v1.md`.

## Rollback rehearsal

The staging rehearsal must prove:

1. active definitions can be deactivated;
2. no new runtime instance uses the deactivated pack;
3. existing holdings, submissions, rewards, ledger entries, relationships, and events remain historically valid;
4. replacement definitions are used where required;
5. fixtures can be removed separately;
6. Admin shows the deactivation and audit trail;
7. Player surfaces handle unavailable or retired content safely.

## Completion evidence

Workstreams 8–10 require:

- exact commands or deployment operations;
- source commit;
- manifest and checksum files;
- dry-run report;
- apply report;
- expected and observed counts;
- Admin verification report;
- Player verification report;
- fixture results;
- screenshots or artifacts where appropriate;
- rollback report;
- unresolved findings and disposition.

No staging or production success may be claimed without this evidence.
