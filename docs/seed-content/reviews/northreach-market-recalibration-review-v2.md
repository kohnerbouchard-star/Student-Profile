# Northreach Market Recalibration Review v2

Status: simulation executed; partial improvement, resilience strategy still rejected  
Activation authorized: **false**

## Changes tested

- Added non-tradable five-year and ten-year sovereign reference points.
- Replaced `defensive_mix` with `resilience_mix_v2`.
- Expanded strategic exposure from four to six equal-weight positions.
- Began recovery earlier and strengthened route restoration, confidence, growth, and stability effects.

## Results

| Scenario | v1 comparator | v2 result |
|---|---:|---:|
| Inflation/rate shock — resilience strategy | -13.14% | -10.52% |
| War escalation — strategic strategy | 7.71% | 2.21% |
| Crisis recovery — diversified | -1.24% | 2.75% |

Integrity:

- non-finite results: 0;
- guaranteed-positive cases: 0.

## Decisions

1. The attempted `resilience_mix_v2` still fails during inflation and rate shocks. It must not be described as defensive or resilient.
2. Strategic concentration was reduced: the median war-escalation return fell from 7.71% to 2.21%. This is a material improvement, but the strategy still outperforms broad portfolios during war and needs ethical, liquidity, regulation, and concentration constraints.
3. Diversified crisis recovery improved from -1.24% to 2.75%. Recovery is no longer structurally too weak in the median run.
4. The five- and ten-year curve points close the term-reference gap for calibration only; they are not tradable instruments.

## Remaining action

Design a genuinely inflation-aware defensive allocation only after cash, inflation-linked debt, short-duration deposits, or supported floating-rate products exist. Do not manufacture defensive behavior by relabeling rate-sensitive assets.
