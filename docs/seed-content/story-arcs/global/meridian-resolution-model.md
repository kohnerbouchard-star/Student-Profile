# Meridian Corridor Resolution Model

Stable content ID: `resolution-model.global.meridian-corridor.v1`
Content type: narrative resolution model
Version: 1.0.0-draft
Maturity: draft
Owner domain: narrative and scenario orchestration
Applies to: `story-arc.global.meridian-corridor.v1`
Implementation status: manual-compatible definition; automated mapping pending

## Purpose

Define how a Meridian game session reaches one of four outcomes without arbitrary instructor selection, hidden post-hoc scoring, or unsupported assumptions about automatic voting and aggregation.

## Supported operating modes

### Mode A: Instructor synthesis

Intended for the first classroom pilot and for current systems if no authoritative collective-decision engine exists.

The instructor reviews a visible resolution worksheet populated from:

- activated events;
- institution proposals;
- completed country or group recommendations;
- selected security response;
- confirmed financing and participation conditions;
- unresolved blockers.

The instructor selects the outcome whose conditions are satisfied and records a short rationale. The selection is not freeform: the same condition hierarchy and tie rules below apply.

### Mode B: Deterministic aggregation

Future mode if authoritative story-state and collective-decision support exists.

The runtime stores normalized decisions and evaluates the same conditions automatically. It must expose the evidence used to reach the outcome.

### Mode C: Instructor-authored sandbox

The instructor may directly select an outcome for a custom scenario, but the session must be visibly labeled as instructor-authored rather than an emergent result.

## Resolution evidence categories

The model uses conditions rather than opaque points.

### Participation

Possible status:

- broad: at least 8 participating countries;
- sufficient: 6–7 participating countries;
- limited: 3–5 participating countries;
- insufficient: fewer than 3 participating countries.

The exact threshold may be adjusted for classroom size, but the session must record the configured threshold before decisions begin.

### Financing readiness

Possible status:

- secured: approved financing covers the minimum launch tranche;
- conditional: financing exists but material conditions remain;
- fragmented: several smaller sources exist without one complete package;
- unavailable: no viable launch financing.

### Governance structure

Possible status:

- centralized: a lead institution receives defined execution authority;
- multilateral: participating countries approve shared oversight and decision rules;
- regional: governance exists only within blocs or bilateral groups;
- unresolved: no accepted authority structure.

### Trade and industrial readiness

Possible status:

- integrated: major routes, industrial commitments, and capacity conditions are confirmed;
- constrained: launch is possible at reduced scale;
- regional: viable only within selected blocs;
- blocked: essential route, material, energy, or production condition is unavailable.

### Data and security integrity

Possible status:

- restored with centralized access;
- restored with shared or federated controls;
- partially restored through manual or limited operations;
- unresolved or unsafe.

### Safeguard sufficiency

Review areas:

- debt and ownership;
- environmental and water conditions;
- labor, maintenance, and capacity;
- data access, expiry, and audit;
- compliance and insurance;
- food and strategic resource protection.

Status:

- complete enough for launch;
- conditional with explicit follow-up;
- materially incomplete;
- blocking failure.

## Hard blockers

The Corridor cannot resolve as centralized or multilateral while any hard blocker remains:

1. Data and payment integrity remains unresolved or unsafe.
2. Minimum participation is not reached.
3. No viable financing covers the minimum launch tranche.
4. An essential physical route or input remains blocked without a substitute.
5. The selected governance structure has no accepted decision authority.
6. A major active event explicitly suspends launch.

A blocker may produce regional or suspended outcomes depending on remaining capacity.

## Outcome conditions

## Outcome A: Centralized Corridor

Required:

- participation at least sufficient;
- financing secured through one lead package or coordinated lead institution;
- centralized governance accepted;
- trade and industrial readiness integrated or constrained with a launch plan;
- data integrity restored through centralized access or a centralized operating authority;
- safeguards complete or conditional with time-limited review;
- no hard blocker.

Additional evidence usually present:

- Xalvorian finance-first offer accepted or functionally equivalent financing;
- strong lead-operator authority;
- countries accept concentration in exchange for speed.

Outcome rationale:

The countries prioritize speed, unified execution, and clear responsibility despite concentration and dependency risks.

## Outcome B: Multilateral Corridor

Required:

- broad participation;
- financing secured or conditional across more than one contributor;
- multilateral governance accepted;
- data integrity restored through shared, federated, or independently reviewed controls;
- trade and industrial readiness integrated or constrained with shared launch rules;
- safeguards complete enough for launch;
- no hard blocker.

Additional evidence usually present:

- Starfall Charter or equivalent shared rules accepted;
- independent oversight;
- distributed ownership or financing;
- explicit review and correction processes.

Outcome rationale:

The countries accept slower execution and administrative cost in exchange for broader legitimacy, distributed control, and shared safeguards.

## Outcome C: Regional Corridors

Required:

- global participation limited or sufficient but no global governance agreement;
- at least two countries or one economic bloc has viable financing, route capacity, and operating rules;
- data integrity restored or manually workable within the participating regional systems;
- no systemic hard blocker affecting all regions;
- at least one regional launch plan is viable.

Additional evidence usually present:

- countries reject global concentration;
- standards or financing remain incompatible;
- blocs retain enough internal complementarity to proceed separately.

Outcome rationale:

The global project fragments into smaller systems that preserve local control but duplicate infrastructure and increase cross-bloc transaction costs.

## Outcome D: Suspended Corridor

Required when any of the following is true:

- participation insufficient;
- financing unavailable;
- data and payment integrity remains unresolved or unsafe;
- essential physical readiness is blocked;
- no accepted governance authority exists by the deadline;
- instructor or authorized scenario rule suspends launch after a severe event.

Outcome rationale:

The countries cannot establish minimum conditions for a credible launch. Existing proposals are archived for bilateral, regional, or future renegotiation.

## Condition hierarchy

Evaluate in this order:

1. Safety and data-integrity blockers.
2. Minimum participation.
3. Minimum physical and financing readiness.
4. Governance structure.
5. Safeguards.
6. Centralized, multilateral, or regional classification.

This order prevents a high level of political support from overriding a clearly unsafe or unfunded project.

## Tie and ambiguity rules

### Centralized and multilateral both appear eligible

Use the accepted governance structure as the decisive condition.

- If lead execution authority is accepted and shared oversight is advisory, centralized wins.
- If shared rules can constrain the lead operator and participating countries retain binding oversight, multilateral wins.

### Multilateral and regional both appear eligible

- If global participation is broad and one shared charter applies, multilateral wins.
- If material rules differ by bloc and no global authority can resolve them, regional wins.

### Regional and suspended both appear eligible

- If at least one region has complete minimum conditions and a defined launch plan, regional wins.
- Otherwise suspended wins.

### Unresolved evidence

Do not infer a favorable condition. Mark it conditional or unresolved according to the source record.

## Player and classroom contribution

The pilot should support one of three declared contribution methods.

### Individual recommendation mode

Player contracts inform discussion and reflection but do not mechanically determine national positions. The instructor records the final country or session decisions.

### Country-team mode

Players assigned to the same country submit one documented country recommendation. The instructor records the selected country stance.

### Classroom council mode

The class follows a declared voting or consensus procedure outside the runtime. The instructor enters the resulting decisions.

Automatic aggregation must not be implied until technically supported.

## No-response handling

- Individual silence does not equal country rejection or consent.
- A country without a recorded position is uncommitted.
- An uncommitted country does not count toward participation thresholds unless the configured classroom method explicitly says otherwise.
- Expired emergency decisions use the scenario’s published default response, never a hidden default.

## Audit explanation

Every resolution should produce an Admin-facing summary:

- selected outcome;
- configured participation threshold;
- participating countries;
- financing status;
- governance status;
- trade and industrial readiness;
- data and security status;
- safeguard status;
- active blockers;
- decisive condition;
- instructor override or sandbox flag;
- timestamp and authorized actor.

Player-facing explanation should summarize the decisive reasons without exposing private submissions or internal identifiers.

## Cancellation and rollback

Before a terminal outcome:

- cancel pending decision windows;
- preserve submitted recommendations;
- stop unscheduled follow-up effects;
- preserve already applied authoritative transactions;
- cancel or preserve accepted contracts according to their documented grace policy;
- issue a visible cancellation explanation.

After a terminal outcome:

- do not rewrite the outcome silently;
- corrections create a revised resolution record or instructor-authorized rollback with audit history;
- follow-up arcs must be cancelled or replaced explicitly.

## Validation

- exactly one outcome selected;
- evidence states exist and are session owned;
- condition hierarchy applied;
- hard blockers cannot be overridden by ordinary support;
- no private player response exposed;
- classroom contribution mode declared before resolution;
- sandbox override visible;
- rationale reproducible from recorded evidence;
- no random tie breaker;
- follow-up arc matches selected outcome.

## Review status

- economic review: pending
- narrative review: pending
- gameplay and learning review: pending
- technical compatibility review: pending

## Change log

- 1.0.0-draft: initial deterministic and manual-compatible resolution model.