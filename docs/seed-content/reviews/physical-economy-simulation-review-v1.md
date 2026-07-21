# Physical Economy Simulation Review v1

Status: executed candidate calibration; **not approved for staging or production**  
Simulation ID: `econovaria-physical-economy-simulation-input-v1` / calibration iteration `5`  
Branch target: `agent/seed-content-foundation-v1`  
Activation authorized: `false`

## Scope

This run evaluates the 144-item physical-economy catalog and 60-recipe graph across:

- 10 countries;
- 4 difficulty presets;
- 4 scenarios;
- 100 deterministic seeds;
- 12 simulated players per country run;
- 30 economic cycles;
- **16,000 total country/difficulty/scenario/seed runs**.

The scenarios are baseline, border disruption, wartime shortage, and reconstruction.

## Reproduction

Run from the repository root:

```bash
python3 docs/seed-content/simulation/physical-economy/run_physical_economy_simulation_v1.py \
  --input docs/seed-content/simulation/physical-economy/physical-economy-simulation-input-v1.json \
  --output-dir /tmp/econovaria-physical-economy-v1
```

The runner uses only the Python standard library. It does not connect to Supabase or mutate a game session.

## Integrity

The run manifest records SHA-256 values for:

- simulation input;
- runner;
- raw CSV;
- compressed raw archive;
- aggregate JSON.

The raw CSV contains 16,000 rows and was compressed to an evidence archive. The connector-backed checkpoint includes the review, gate summary, and run manifest. The raw CSV/archive hashes remain authoritative in the manifest, but those two generated files require normal Git or immutable artifact ingestion because they exceed the practical connector payload for this commit.

## Acceptance-gate result

**25 of 28 currently implemented quantitative gates passed. Three failed.**

| Difficulty | Gate | Observed | Threshold | Result |
|---|---|---:|---:|---|
| Easy | Baseline affordability failure | 21.95% | <= 28.00% | PASS |
| Easy | Baseline craft success | 78.05% | >= 75.00% | PASS |
| Easy | Baseline first Tier I median cycle | 1.00 | <= 2.00 | PASS |
| Easy | Tier I by cycle 5 | 0.98 | >= 0.95 | PASS |
| Easy | Border-disruption supply failure | 25.82% | <= 8.00% | FAIL |
| Easy | Country first-Tier-I range | 0.00 | <= 1.50 | PASS |
| Easy | Baseline Tier III mean | 0.789 | >= 0.550 | PASS |
| Moderate | Baseline affordability failure | 36.44% | <= 42.00% | PASS |
| Moderate | Baseline craft success | 61.86% | >= 60.00% | PASS |
| Moderate | Baseline first Tier I median cycle | 2.00 | <= 3.00 | PASS |
| Moderate | Tier I by cycle 5 | 0.98 | >= 0.90 | PASS |
| Moderate | Border-disruption supply failure | 18.70% | <= 12.00% | FAIL |
| Moderate | Country first-Tier-I range | 1.00 | <= 1.50 | PASS |
| Moderate | Baseline Tier III mean | 0.309 | >= 0.220 | PASS |
| Hard | Baseline affordability failure | 54.97% | <= 58.00% | PASS |
| Hard | Baseline craft success | 42.56% | >= 45.00% | FAIL |
| Hard | Baseline first Tier I median cycle | 3.00 | <= 5.00 | PASS |
| Hard | Tier I by cycle 5 | 0.93 | >= 0.75 | PASS |
| Hard | Border-disruption supply failure | 15.66% | <= 18.00% | PASS |
| Hard | Country first-Tier-I range | 1.00 | <= 1.50 | PASS |
| Hard | Baseline Tier III mean | 0.076 | >= 0.070 | PASS |
| Insane | Baseline affordability failure | 63.28% | <= 68.00% | PASS |
| Insane | Baseline craft success | 35.36% | >= 35.00% | PASS |
| Insane | Baseline first Tier I median cycle | 4.00 | <= 6.00 | PASS |
| Insane | Tier I by cycle 5 | 0.85 | >= 0.55 | PASS |
| Insane | Border-disruption supply failure | 10.35% | <= 22.00% | PASS |
| Insane | Country first-Tier-I range | 1.00 | <= 1.50 | PASS |
| Insane | Baseline Tier III mean | 0.032 | >= 0.030 | PASS |

## Primary findings

1. **Easy border-disruption recovery is under-supplied.** Northreach reached a 25.82% mean supply-failure rate against an 8.00% maximum.
2. **Moderate border-disruption recovery is also under-supplied.** Northreach reached 18.70% against a 12.00% maximum.
3. **Hard baseline crafting is slightly too restrictive.** The weakest country-level mean craft-success rate was Northreach at 42.56%, below the 45.00% floor.
4. **Insane remains difficult without failing the tracked baseline access gates.** The weakest baseline craft-success rate was 35.36%; the threshold is 35.00%.
5. **Tier I access is no longer the main balance problem.** Every difficulty passed the first-craft timing and cycle-5 participation gates.
6. **Tier III production remains present but bounded.** Baseline global means were 0.789, 0.309, 0.076, and 0.032 crafts per player for Easy through Insane.
7. **Import dependence remains high.** At least one country/scenario exceeded the 80% warning level on every difficulty. Northreach is the dominant outlier through Easy, Moderate, and Hard; Syndalis is the Insane wartime outlier.
8. **The substitution path was not exercised.** Aggregate substitution rate was zero. This is a blocking test-coverage result: either the current supply paths never select substitutes or the runner does not yet drive the substitution branch strongly enough.
9. **No production approval follows from this run.** Prices, restocks, difficulty multipliers, output valuations, and country supply profiles remain candidate values.

## Country outliers

| Difficulty | Lowest baseline craft success | Highest border supply failure | Highest import-spend share |
|---|---|---|---|
| Easy | Eldoran — 78.05% | Northreach — 25.82% | Northreach / `border_disruption` — 83.37% |
| Moderate | Northreach — 61.86% | Northreach — 18.70% | Northreach / `border_disruption` — 83.64% |
| Hard | Northreach — 42.56% | Northreach — 15.66% | Northreach / `wartime_shortage` — 87.82% |
| Insane | Northreach — 35.36% | Northreach — 10.35% | Syndalis / `wartime_shortage` — 88.24% |

## Required recalibration

Before a staging candidate is approved:

1. Increase or diversify Northreach recovery supply during border disruption.
2. Add explicit substitute-trigger scenarios and verify nonzero substitution use.
3. Reduce Easy and Moderate border-disruption supply failures without removing scarcity.
4. Raise Hard baseline craft success by at least 2.5 percentage points, preferably through supply and substitution rather than a broad income increase.
5. Reduce excessive country import dependence by adding domestic inputs, alternate suppliers, or country-aligned substitute recipes.
6. Add explicit salvage-and-recraft loop simulation.
7. Add explicit guaranteed system-buyback arbitrage detection.
8. Re-run all 16,000 combinations and require every implemented gate to pass.
9. Preserve the current future-only difficulty snapshot and deterministic crafting rules.

## Known model limitations

The current runner models acquisition, affordability, supply, crafting, output retention, marketplace sale offers, progression access, and country import dependence. It does **not yet fully model**:

- player-to-player order books;
- strategic hoarding by coordinated players;
- explicit salvage and recrafting;
- equipment-condition degradation;
- repair scheduling;
- Contract-driven material demand;
- direct business production batches;
- malicious concurrency or duplicate transaction attempts;
- classroom attendance/reward variance;
- dynamic exchange-rate paths;
- teacher intervention.

The acceptance thresholds for zero guaranteed buyback arbitrage and zero positive salvage-recraft loops exist in the input contract, but the runner does not yet emit those two integrity metrics. They remain unresolved gates rather than implicit passes.

## Decision

**RECALIBRATE — DO NOT ACTIVATE.**

The fifth calibration iteration is materially better than the initial run: most access and progression gates pass, including all tracked Insane baseline gates. However, the three quantitative failures, persistent import-dependence warnings, unexercised substitution branch, and missing salvage/arbitrage checks prevent staging approval.
