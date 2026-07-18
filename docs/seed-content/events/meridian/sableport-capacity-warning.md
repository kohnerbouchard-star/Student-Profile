# Sableport Capacity Warning

Stable content ID: `event.meridian.sableport-capacity-warning.v1`
Content type: event definition
Version: 1.0.0-draft
Maturity: draft
Family: logistics and infrastructure
Scope: Yrethia with global trade exposure
Story arc: `story-arc.global.meridian-corridor.v1`
Default severity: moderate
Implementation status: mapping pending

## Purpose

Create a trade-capacity decision involving port expansion, maintenance, fees, labor, insurance, and alternate routing.

## Trigger requirements

- Meridian arc active at capacity-warning stage;
- Sableport warning not already resolved;
- no active event that fully closes global maritime trade;
- standard profile has no more than the approved number of simultaneous capacity warnings.

Possible trigger basis:

- scheduled pilot stage;
- high trade-volume state;
- prior Corridor throughput commitment;
- instructor activation.

## Player-facing report

Sableport is operating near its sustainable capacity. Turnaround times are increasing, maintenance windows are narrowing, and the Maritime Insurance Council warns that continued expansion without mitigation could raise loss risk.

The warning is a forecast and operational assessment, not a confirmed port failure.

## Fact status

Confirmed capacity data plus forecast risk.

## Affected entities

Primary:

- Yrethia;
- port and logistics companies;
- maritime insurer;
- trade-dependent countries.

Secondary:

- Thaloris alternate routing;
- Dravenlok and Eldoran exporters;
- Meridian construction schedule.

## Immediate effects

Semantic directions:

- Yrethian port outlook: mild negative;
- insurance-risk outlook: moderate increase;
- Thaloris routing opportunity: mild positive if eligible;
- shipping cost: mild to moderate increase;
- global trade confidence: minor negative.

Final numeric mapping pending.

## Decision options

1. Expand capacity using external finance.
2. Redirect selected cargo through Thaloris.
3. Raise fees and prioritize essential or high-value cargo.
4. Reduce Corridor commitments until maintenance completes.
5. Combine limited rerouting with accelerated maintenance.

## Delayed effects

- expansion creates debt and future capacity;
- rerouting creates compliance and relationship effects;
- higher fees reduce low-margin trade;
- reduced commitments protect safety but delay growth;
- ignored warning increases probability of a later operational incident.

## Recovery

Recovery occurs through:

- completed maintenance;
- new capacity;
- lower trade volume;
- successful routing agreement;
- revised Corridor schedule.

## Contract and interaction hooks

- `contract.meridian.respond-first-disruption.v1`;
- Mira Sen warning interaction;
- Tovan Rell alternate-route offer;
- port-capacity analysis.

## Failure and expiry

The warning expires when conditions normalize or is superseded by a confirmed port incident.

Ignoring the warning may raise later risk but must not guarantee a disaster.

## Validation

- forecast is not described as failure;
- event cannot stack repeatedly without decay;
- alternate routing requires Thaloris availability;
- all trade effects bounded;
- maintenance and recovery paths exist;
- no automatic profit for insurers or Thalorian companies.

## Review status

- economic: pending
- narrative: pending
- gameplay and learning: pending
- technical: pending