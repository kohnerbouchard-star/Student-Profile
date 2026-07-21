# Arrival Class System Backlog v1

Status: deferred Workstream 11  
Implementation status: not started  
Production authorization: false

## Purpose

Reserve the design boundaries for a player class system completed through questions asked when the player arrives in their adopted country.

This is an **economic pathway class system**, not a social caste, demographic category, or permanent character restriction.

The system is deliberately placed after the first ten seed-data workstreams because it depends on approved starting packages, Contract families, skills, progression, economic balance, country opportunities, and runtime persistence.

## Intended player experience

During arrival, the player answers a short questionnaire about their experience, resources, goals, and preferred approach to building a new life.

The system then:

1. recommends an initial class;
2. explains why that class was recommended;
3. shows its starting advantages and trade-offs;
4. allows the player to confirm or select another viable class;
5. applies a country-specific class variant;
6. records the confirmed class as game-session player state.

The questionnaire should feel like immigration, settlement, career, and economic-orientation questions integrated into the opening story—not a detached personality quiz.

## Design constraints

- no class may be objectively superior;
- every class must be viable in every country;
- country variants may change opportunity emphasis but not erase a class;
- the result must not permanently lock the player out of other careers;
- class can influence starts, not determine the player’s entire identity;
- answers must not require protected or sensitive demographic data;
- players must understand the recommendation;
- players must be able to override it before confirmation;
- exact starting bonuses require simulation;
- class state belongs to the player’s game session, not the global account profile;
- changing class later, if allowed, requires explicit progression or retraining rules;
- class names require final narrative, accessibility, and representation review.

## Candidate input dimensions

The future questionnaire may evaluate:

- prior work experience;
- formal or practical training;
- starting financial resources;
- willingness to accept stable versus variable income;
- preference for employment versus entrepreneurship;
- comfort with markets and financial risk;
- interest in public service or community work;
- technical, analytical, operational, or communication strengths;
- short-term survival versus long-term growth priorities;
- desired relationship to the adopted country;
- preferred response to uncertainty;
- willingness to invest time in credentials.

These are design dimensions, not final questions.

## Candidate class families

The final list is not approved. A first design study should test six to eight broad pathways such as:

- skilled worker or operator;
- professional or analyst;
- entrepreneur or merchant;
- investor or financial specialist;
- researcher or technologist;
- public-service or institutional specialist;
- communicator, investigator, or negotiator;
- community builder or essential-services provider.

Class names should be short, understandable, non-stigmatizing, and compatible with all ten countries.

## Candidate class effects

A class may influence:

- starting skill tags;
- credential tags;
- starting cash or debt band;
- initial equipment or information access;
- first job and Contract availability;
- business-entry costs;
- tutorial ordering;
- institutional introductions;
- dialogue variations;
- early reputation;
- progression recommendations;
- starting Store or banking access;
- class-specific recovery options.

A class must not silently change:

- country assignment;
- live ownership identity;
- backend UUIDs;
- protected demographic status;
- grading policy;
- final outcome entitlement;
- market results;
- guaranteed income or profit.

## Country variants

Each base class requires ten country-specific presentations.

Examples of variation:

- an operator in Northreach may begin in resource logistics;
- an operator in Yrethia may begin in port operations;
- an analyst in Eldoran may begin with commodity or food-market data;
- an analyst in Xalvoria may begin with infrastructure finance;
- a technologist in Solvend may begin in research systems;
- a technologist in Syndalis may begin in cybersecurity or fintech;
- a public-service class in Lumenor may begin in Forum administration;
- a public-service class in Valerion may begin in water or energy coordination.

The base class defines the player’s broad economic approach. The country variant defines the local expression of that approach.

## Questionnaire record requirements

A future questionnaire definition must include:

- stable questionnaire ID;
- version;
- question order;
- question text;
- response options;
- accessibility copy;
- scoring dimensions;
- scoring weights;
- tie-breaking rules;
- recommendation thresholds;
- explanation keys;
- override policy;
- confirmation step;
- cancellation and retry behavior;
- localization status;
- analytics and privacy status;
- review status.

## Class-definition requirements

Every class definition must include:

- stable class ID;
- display name;
- concise description;
- economic identity;
- strengths;
- trade-offs;
- starting-skill rules;
- starting-resource rules;
- starting-opportunity rules;
- country variants;
- progression transitions;
- retraining or path-change behavior;
- first Contract and tutorial links;
- relationship and dialogue tags;
- balance rationale;
- technical mapping;
- review status.

## Runtime state requirements

A player-class runtime record should preserve:

- game-session ID through server-derived scope;
- player UUID through authenticated scope;
- questionnaire version;
- answer record or privacy-safe answer summary;
- recommended class ID;
- confirmed class ID;
- whether the player overrode the recommendation;
- confirmed country variant;
- confirmation timestamp;
- later retraining or path-change history;
- idempotency key;
- audit history.

The exact storage model is undecided.

## Required testing

- no answer sequence creates an invalid result;
- ties are handled consistently;
- the same answer set is deterministic;
- every class can be recommended;
- every class-country combination is viable;
- players can understand the recommendation;
- override behavior works;
- no duplicate starting grants occur;
- no class has superior expected wealth without compensating risks;
- class and country combinations pass affordability simulation;
- class does not reveal or infer sensitive information;
- questionnaire can be replayed safely in test environments;
- unavailable runtime support is clearly labeled.

## Dependencies

Do not finalize this system until:

1. ten arrival packages are normalized;
2. initial Contract families exist;
3. Store, banking, and progression schemas are stable;
4. starting skills and credentials are defined;
5. housing and ordinary expenses are modeled;
6. reward and price calibration exists;
7. simulation tooling is operational;
8. runtime player-background persistence is approved;
9. Admin and Player class-display requirements are known;
10. representation and accessibility review is scheduled.

## Next design deliverables

When Workstream 11 begins:

1. research class and background systems in economic, simulation, and role-playing games;
2. define six to eight candidate classes;
3. draft the arrival questionnaire;
4. create country variants;
5. define starting effects and trade-offs;
6. model class transitions and retraining;
7. run comparative balance simulations;
8. conduct usability and representation review;
9. produce machine-readable questionnaire and class definitions;
10. validate the full arrival flow in staging.

No final class name, question, scoring weight, or mechanical bonus is approved by this backlog document.
