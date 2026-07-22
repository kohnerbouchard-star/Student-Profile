# Respond to the First Meridian Disruption — Review Rubric

Applies to: `contract.meridian.respond-first-disruption.v1`
Version: 1.0.0-draft
Target student time: 15–20 minutes
Target review time: 90–120 seconds
Suggested response length: 180–300 words or equivalent structured fields

## Fast approval rubric

Score each category 0, 1, or 2.

### 1. Fact and uncertainty

- 0: misstates the event or asserts unconfirmed cause.
- 1: identifies the problem but leaves uncertainty unclear.
- 2: accurately identifies the confirmed problem and one material uncertainty.

### 2. Feasible response

- 0: proposed action is outside the country or institution’s authority or depends on unlimited resources.
- 1: action is plausible but incomplete.
- 2: action is feasible for the assigned context and identifies the responsible institution or process.

### 3. Immediate trade-off

- 0: gives benefit only.
- 1: includes a cost without explaining who bears it.
- 2: states an immediate benefit, immediate cost, and affected party.

### 4. Delayed consequence

- 0: absent or unrelated.
- 1: plausible but vague.
- 2: follows logically from the response and distinguishes delayed effect from immediate outcome.

### 5. Success measure

- 0: no measurable criterion.
- 1: criterion is relevant but not observable or time-bounded.
- 2: uses an observable indicator, status, or review condition.

## Decision guidance

- 9–10: approve.
- 7–8: approve if factual status and authority are correct.
- 5–6: focused revision.
- 0–4: incomplete or unsafe reasoning.

## Automatic checks suitable for tooling

- runtime event-instance reference present;
- event belongs to the same game session;
- confirmed fact field present;
- uncertainty field present;
- response selected or described;
- immediate benefit and cost present;
- delayed consequence present;
- success measure present;
- duplicate approved completion for the event instance blocked.

## Strong response indicators

- treats a warning as a warning rather than a confirmed disaster;
- identifies the cost of acting too slowly and too aggressively;
- uses a country-specific dependency;
- proposes a review or expiry condition;
- evaluates the response using an indicator available to the scenario.

## Weak response indicators

- names a cyber attacker without confirmed attribution;
- solves a shortage with unlimited money or inventory;
- ignores who can authorize the action;
- claims a policy will immediately reverse all market effects;
- proposes a mechanical effect unsupported by the current system.

## Changes-requested templates

### Attribution error

“The event confirms an operational problem but not its cause. Revise the response so confirmed facts and suspected causes are separated.”

### Unsupported authority

“Identify the institution that can carry out this response. Revise any action that requires authority the player or named institution does not have.”

### Missing delayed consequence

“Add one consequence that may emerge after the immediate response, including the condition or time horizon that produces it.”

### Unmeasurable success

“Define how the class or institution would know whether the response worked. Use an observable indicator, restored status, capacity threshold, or review result.”

## Event-specific evidence prompts

### Sableport capacity

- throughput;
- maintenance;
- insurance risk;
- routing;
- fees.

### Eldoran harvest

- supply margin;
- prices;
- reserves;
- imports;
- household support.

### Northreach export review

- supply commitment;
- reserves;
- processing;
- ownership;
- infrastructure.

### Valerion reservoir

- energy security;
- water access;
- imports;
- conservation;
- diversification.

### Solvend talent constraint

- capacity;
- compensation;
- training;
- recruitment;
- outsourcing.

### Customs security intrusion

- record integrity;
- throughput;
- access;
- audit;
- manual fallback;
- unresolved attribution.

## Reviewer safeguards

- evaluate against information available when submitted;
- do not penalize the player because a later event reveals a different outcome;
- do not require technical cyber knowledge;
- preserve event-instance and review history;
- reward only once after approval.