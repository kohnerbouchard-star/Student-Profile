# Eldoran Harvest Revision

Stable content ID: `event.meridian.eldoran-harvest-revision.v1`
Content type: event definition
Version: 1.0.0-draft
Maturity: draft
Family: food, commodity, and forecast
Scope: Eldoran with global food exposure
Story arc: `story-arc.global.meridian-corridor.v1`
Default severity: moderate
Implementation status: mapping pending

## Purpose

Introduce food-price, export, reserve, logistics, and distributional trade-offs without assuming a catastrophic shortage.

## Trigger requirements

- Meridian arc active at capacity-warning stage;
- no resolved contradictory strong-harvest event;
- standard profile simultaneous-warning limit respected;
- Eldoran harvest event not already active.

## Player-facing report

The Eldoran Commodity Stability Board has reduced its harvest estimate. Current supply remains adequate, but the margin above expected domestic and export demand is smaller than previously forecast.

## Fact status

Official revised forecast. Final harvest remains uncertain.

## Affected entities

- Eldoran agriculture and food processing;
- Eldoran rail and commodity markets;
- food-importing countries;
- household price expectations;
- Meridian food and logistics commitments.

## Immediate effects

Semantic directions:

- food-price pressure: moderate positive;
- Eldoran producer outlook: mixed, price positive and yield negative;
- consumer confidence: minor negative;
- food-importing country pressure: minor to moderate negative;
- commodity-market volume: mild positive;
- broad panic: not automatic.

## Decision options

1. Release part of strategic reserves.
2. Restrict or renegotiate selected exports.
3. Arrange emergency imports.
4. Provide targeted household support.
5. Preserve market pricing and accelerate logistics or production investment.

## Delayed effects

- reserve release reduces future buffer;
- export restriction affects trade partners and producer income;
- imports affect currency and logistics demand;
- direct support creates fiscal cost;
- investment has delayed benefit and does not solve all immediate pressure.

## Recovery

- improved final yield;
- reserve replenishment;
- successful import agreement;
- logistics improvement;
- targeted policy reducing household harm;
- next-season production recovery.

## Contract and interaction hooks

- Halden Marr forecast interaction;
- food-security analysis;
- `contract.meridian.respond-first-disruption.v1`;
- later outcome reflection.

## Failure and correction

If later data improves, issue a revised forecast rather than deleting this report. If conditions worsen, escalate through a distinct event instance or stage.

## Validation

- forecast uncertainty explicit;
- producer and consumer effects both represented;
- reserve action bounded;
- no automatic permanent inflation;
- no severe food crisis without additional triggers;
- corrections preserve audit history;
- session state isolated.

## Review status

- economic: pending
- narrative: pending
- gameplay and learning: pending
- technical: pending