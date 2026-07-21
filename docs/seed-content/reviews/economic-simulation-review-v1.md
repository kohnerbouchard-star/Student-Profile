# Economic Simulation Protocol v1

Status: proposed protocol; not executed
Original status correction date: 2026-07-18
Owner domains: economic design, balance review, test engineering

## Correction notice

An earlier version of this document incorrectly described a 1,000-player economic simulation as executed and reported numerical outputs.

No executable simulation program, raw output, result artifact, or reproducible run command existed for those claims.

All prior percentages, medians, concentration measures, and price conclusions are withdrawn.

This document now defines only the simulation that must be built and run before rewards, prices, progression pacing, or affordability bands may be approved.

## Purpose

Specify a reproducible test model for evaluating whether Econovaria's proposed income, reward, price, savings, market, currency, and participation rules create a viable classroom economy.

## Required implementation

A valid simulation requires:

- committed source code;
- versioned input configuration;
- explicit formulas;
- documented assumptions;
- deterministic random seeds;
- multiple independent runs;
- raw machine-readable output;
- summarized result files generated from the raw output;
- a documented command that reproduces each result;
- source commit and configuration checksums;
- review of the model against current backend and product rules.

A prose document alone is not a simulation.

## Required population model

The first implementation should support at least:

- 1,000 simulated players;
- all ten countries;
- multiple participation cohorts;
- multiple difficulty profiles;
- late joiners;
- temporary inactivity;
- different economic strategies;
- different starting conditions where product rules permit them.

The exact population size is a test configuration, not evidence of quality by itself.

## Required participation cohorts

At minimum:

- high participation;
- typical participation;
- low participation;
- late joining;
- interrupted participation;
- recovery participation after a period of inactivity.

Each cohort must use explicit attendance, Contract-completion, purchase, savings, and investment behaviors.

## Required economic paths

The model should test several viable player approaches:

- stable employment and saving;
- Contract-focused income;
- entrepreneurship or business income when supported;
- market participation;
- conservative liquidity management;
- consumption-focused behavior;
- late-joiner catch-up;
- wartime or crisis-response work when the relevant systems exist.

No single strategy should be assumed to represent every player.

## Required test scenarios

### Baseline economy

Tests ordinary rewards, prices, savings, and spending without a major crisis.

### Meridian boom

Tests increased employment, strategic-sector demand, housing pressure, and investment opportunity.

### Supply disruption

Tests food, energy, logistics, and imported-price pressure.

### Currency stress

Tests explicit pair-rate conversion, local purchasing power, and settlement-currency effects.

### Approval delay

Tests delayed Contract approval and payout timing.

### Market loss

Tests bounded investment losses and recovery.

### Late joining

Tests whether a player can obtain basic access without automatic parity with early participants.

### Low participation recovery

Tests active catch-up paths without creating passive inflation or rewarding inactivity more than participation.

### Wartime economy

Future scenario requiring approved war-state mechanics. It should test shortages, emergency work, restricted routes, financial controls, and reconstruction without assuming that war is inherently profitable.

## Required outputs

Each run should record at least:

- player-level income by source;
- spending by category;
- liquid balance;
- savings balance;
- market allocation and return;
- local and ECO settlement amounts;
- first-access period for basic, strategic, and premium items;
- Contract completion and approval delay;
- country-level price and income divergence;
- late-joiner recovery timing;
- negative-balance events;
- concentration measures;
- inactive or trapped-player counts;
- number of players unable to access required gameplay;
- source of wealth during crisis scenarios.

## Required evaluation questions

The simulation must answer:

1. Can a typical active player afford basic participation?
2. Can low-participation and late-joining players recover through active choices?
3. Do country differences create meaningful variation without making one assignment clearly inferior?
4. Do difficulty modifiers preserve playability?
5. Do rewards and prices avoid runaway inflation?
6. Does saving remain useful without becoming mandatory?
7. Can market losses occur without permanently removing ordinary players?
8. Are premium purchases scarce without being inaccessible?
9. Do crisis and war opportunities create trade-offs rather than automatic wealth?
10. Does any single strategy dominate every other strategy?

## Seed and repetition requirements

A valid review should use:

- one documented reference seed;
- at least 30 additional seeds for ordinary stochastic variation;
- stress seeds or fixed scenarios for rare severe events;
- identical reruns to verify determinism;
- comparison of output distributions rather than one selected run.

## Acceptance status vocabulary

Allowed statuses:

- not implemented;
- implemented but unverified;
- execution failed;
- results generated;
- conditional pass;
- fail;
- approved for staging calibration.

This document remains `not implemented` until executable source and result artifacts exist.

## Prohibited claims

Do not claim:

- a simulation was run without an execution artifact;
- a price is validated from assumed outputs;
- a random seed was used without executable code;
- percentages or medians are empirical when calculated only as narrative examples;
- production balance approval from a single run;
- production readiness from a design model alone.

## Required repository artifacts

A future real implementation should add, in an approved non-production location:

- simulation source;
- configuration schema;
- reference configurations;
- run command documentation;
- raw outputs;
- generated summaries;
- model-validation notes;
- reviewer sign-off.

The implementation location and language should be decided after repository and backend coordination.

## Current conclusion

No economic simulation has been executed for the seeded-content foundation.

No reward, price, progression, affordability, or concentration value is validated by simulation at this time.

All such values remain proposals requiring a reproducible model and staging review.