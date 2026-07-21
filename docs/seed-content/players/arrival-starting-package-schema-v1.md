# Player Arrival and Starting Package Schema v1

Status: design candidate  
Runtime implementation: pending  
Numerical calibration: pending  
Production authorization: false

## Purpose

Convert each country-specific immigrant opening into a reproducible player starting package.

A starting package is a reusable definition. When a player begins a game session, the runtime creates a player-specific instance referencing the package. The reusable definition must never contain live player identifiers, balances, credentials, relationship state, or game-session IDs.

## Required package fields

### Identity

- stable package ID;
- version;
- maturity;
- adopted country;
- starting city location ID;
- campaign profile;
- supported difficulty profiles;
- required capabilities;
- blocked capabilities.

### Arrival context

- player-facing arrival summary;
- reason-for-arrival options;
- entry or residency category;
- sponsor or settlement-contact definition;
- temporary address or housing type;
- required first administrative action;
- first-day deadline;
- immediate risk;
- country-specific welcome and warning copy.

### Economic starting state

- denomination currency;
- candidate starting cash band;
- candidate starting savings band;
- candidate debt or obligation status;
- housing cost band;
- ordinary-expense band;
- employment-access level;
- business-entry capital requirement;
- starting market access;
- initial Store availability;
- emergency support rule;
- insolvency recovery route.

Exact amounts remain null until simulation and staging approval.

### Player capability seeds

- initial skill tags;
- credential tags;
- language or translation capability where relevant;
- starting equipment or information access;
- first available employment leads;
- first available business lead;
- first market-research lead;
- first public or community opportunity;
- restricted activities;
- progression prerequisites.

### Narrative starting state

- sponsor relationship;
- local-friend relationship;
- immigrant-peer or rival relationship;
- institutional gatekeeper;
- former-home contact;
- personal goal;
- unresolved obligation;
- first message;
- first Contract;
- first tutorial;
- first news item;
- first choice or response window;
- Meridian connection;
- war-escalation hooks.

### Class-system integration

Reserved fields:

- `arrivalQuestionnaireId`;
- `recommendedArrivalClassDefinitionId`;
- `confirmedArrivalClassDefinitionId`;
- `classRecommendationExplanationKey`;
- `classOverrideAllowed`;

These remain null until Workstream 11 develops the arrival class system.

### Runtime instantiation rules

A runtime starting instance must:

- belong to one game session;
- belong to one authenticated player UUID derived server-side;
- reference one package version;
- record the confirmed country and class result;
- create relationships as player-specific runtime instances;
- create balances only through authoritative ledger or account operations;
- grant items or access only through authoritative issuance paths;
- assign Contracts through authoritative Contract assignment or availability rules;
- record idempotency keys for all initial grants;
- support safe retry without duplicate money, items, relationships, messages, or Contracts.

## Ten initial package definitions

### Northreach

- Package ID: `arrival-package.northreach.frostgate-immigrant.v1`
- Starting city: `location.northreach.frostgate.v1`
- Currency: `NRC`
- Sponsor: Edda Veyr, workforce-settlement coordinator
- Immediate need: secure temporary housing before the employer accommodation window closes
- First pathways: strategic-industry employment; northern logistics services; resource-market analysis; local supply business
- First restrictions: strategic-industry disclosure and employer-linked documentation
- Recovery route: settlement-office referral, temporary essential-services Contract, and protected basic housing review
- Class hook: deferred

### Yrethia

- Package ID: `arrival-package.yrethia.sableport-immigrant.v1`
- Starting city: `location.yrethia.sableport.v1`
- Currency: `YRC`
- Immediate need: correct address and employment-document mismatch
- First pathways: customs and compliance; freight operations; insurance and trade finance; port-service enterprise
- First restrictions: documentation accuracy and reputation-based access
- Recovery route: supervised records correction and entry-level port-service Contract
- Class hook: deferred

### Thaloris

- Package ID: `arrival-package.thaloris.dusk-harbor-immigrant.v1`
- Starting city: `location.thaloris.dusk-harbor.v1`
- Currency: `THD`
- Immediate need: secure verified lodging and a legally recognized work contact
- First pathways: repair work; bonded trade services; secondary-market analysis; small service enterprise
- First restrictions: legitimacy and insurance-access barriers
- Recovery route: licensed repair cooperative, community guarantor, and regulated starter Contract
- Class hook: deferred

### Solvend

- Package ID: `arrival-package.solvend.aurora-spire-immigrant.v1`
- Starting city: `location.solvend.aurora-spire.v1`
- Currency: `SLV`
- Immediate need: validate credentials or obtain a provisional skills assessment
- First pathways: research support; technical employment; professional services; technology enterprise
- First restrictions: credential, IP, and strategic-technology controls
- Recovery route: accelerated training, supervised research Contract, and temporary professional placement
- Class hook: deferred

### Eldoran

- Package ID: `arrival-package.eldoran.crescent-bay-immigrant.v1`
- Starting city: `location.eldoran.crescent-bay.v1`
- Currency: `ELD`
- Immediate need: obtain affordable housing and reliable food-market access
- First pathways: food and agriculture; wholesale distribution; transport coordination; household-services enterprise
- First restrictions: low margins, seasonal demand, and affordability pressure
- Recovery route: food-security work, market-assistant Contract, and basic-needs stabilization
- Class hook: deferred

### Valerion

- Package ID: `arrival-package.valerion.glassfall-immigrant.v1`
- Starting city: `location.valerion.glassfall.v1`
- Currency: `VAL`
- Immediate need: satisfy address, deposit, or sponsorship requirements in a high-cost city
- First pathways: clean energy; water services; green finance; tourism and premium services
- First restrictions: high entry costs and unequal professional access
- Recovery route: public-service placement, shared housing support, and conservation Contract
- Class hook: deferred

### Lumenor

- Package ID: `arrival-package.lumenor.starfall-immigrant.v1`
- Starting city: `location.lumenor.starfall.v1`
- Currency: `LUM`
- Sponsor: Nela Corin, community settlement officer
- Immediate need: secure a recognized address for work, banking, and residency processing
- First pathways: administration; education; media and verification; Forum-services enterprise
- First restrictions: temporary contracts, credential barriers, and institutional pace
- Recovery route: settlement-support work, language or records Contract, and public housing review
- Class hook: deferred

### Xalvoria

- Package ID: `arrival-package.xalvoria.emberhall-immigrant.v1`
- Starting city: `location.xalvoria.emberhall.v1`
- Currency: `XAL`
- Immediate need: establish a bankable identity, address, and employment or investment sponsor
- First pathways: banking; infrastructure finance; construction services; premium manufacturing
- First restrictions: debt exposure, network-based access, and political scrutiny
- Recovery route: development-authority placement, debt counseling, and public-project Contract
- Class hook: deferred

### Dravenlok

- Package ID: `arrival-package.dravenlok.ironhold-immigrant.v1`
- Starting city: `location.dravenlok.ironhold.v1`
- Currency: `DRV`
- Immediate need: complete technical placement and secure worker housing
- First pathways: industrial employment; machinery and rail; supply coordination; worker-service business
- First restrictions: employer dependence, safety risks, and strategic-production obligations
- Recovery route: technical retraining, worker-congress support, and essential maintenance Contract
- Class hook: deferred

### Syndalis

- Package ID: `arrival-package.syndalis.blacklight-immigrant.v1`
- Starting city: `location.syndalis.blacklight.v1`
- Currency: `SYN`
- Immediate need: establish verified digital identity and secure temporary physical housing
- First pathways: cybersecurity; fintech; data infrastructure; digital professional services
- First restrictions: privacy trade-offs, identity review, and platform dependence
- Recovery route: supervised digital-services Contract, identity appeal, and community access program
- Class hook: deferred

## Required first-release companion records

Each package must reference:

- one arrival interaction;
- one sponsor message;
- one former-home message;
- one first Contract;
- one country tutorial;
- one housing or address state;
- one emergency recovery Contract;
- one local employment lead;
- one market lead;
- one country news item;
- one class questionnaire after Workstream 11.

## Balance requirements

The package system must be tested for:

- days or actions until first income;
- housing affordability;
- basic-expense coverage;
- early Contract accessibility;
- risk of immediate insolvency;
- recovery from poor first decisions;
- comparative country difficulty;
- class-package combinations;
- no dominant background or country;
- no impossible progression route.

## Security and privacy requirements

- no demographic category is inferred from country or class;
- no credential or Access Code is stored in reusable content;
- no live player UUID is authored into a package;
- starting money and items use authoritative issuance operations;
- questionnaire answers are session-scoped player state;
- sensitive answers are optional or excluded;
- Admin visibility must distinguish definition, answer summary, and private player data.

## Current blockers

- starting values are uncalibrated;
- housing and ordinary-expense runtime models are undecided;
- relationship persistence is undecided;
- class system is deferred;
- first-message and first-Contract records need conversion;
- authoritative instantiation route is not approved;
- backend PR #158 capability baseline remains unresolved.
