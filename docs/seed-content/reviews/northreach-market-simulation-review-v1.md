# Northreach Market Simulation Review v1

Status: executed pilot; useful for calibration; not approved for staging or production  
Activation authorized: **false**

## Execution evidence

The Northreach 24-instrument candidate was run through a committed deterministic factor-model simulation.

Run parameters:

- 250 deterministic seeds;
- 60 market cycles per run;
- six scenarios;
- 24 instrument paths;
- four portfolio strategies;
- raw instrument, path, and portfolio outputs;
- SHA-256 checksums for script, input, outputs, summary, and evidence archive.

Scenarios:

1. baseline;
2. inflation and interest-rate shock;
3. Meridian disruption;
4. war escalation;
5. commodity boom;
6. crisis followed by stabilization and recovery.

Committed evidence:

- `simulation/northreach/run_northreach_market_simulation_v1.py`;
- `simulation/northreach/run-manifest-v1.json`.

The complete raw-output evidence archive was generated during execution. Its SHA-256 is recorded in the run manifest. The current connector could not commit the binary archive, so the repository evidence gate remains incomplete until the archive is ingested through normal Git tooling or an artifact workflow.

## Integrity results

- non-finite return or drawdown values: 0;
- guaranteed-positive instrument or portfolio cases: 0;
- deterministic seed count: 250;
- all index, fund, trust, and benchmark weights were prevalidated;
- activation remained disabled throughout.

The first run exposed one guaranteed-positive baseline case in the one-year Treasury bond. The baseline drift was reduced and the entire 250-seed run was repeated. The final recorded run contains no guaranteed-positive case.

## Baseline behavior

Median terminal return by portfolio:

- equal-weight equities: +2.48%;
- defensive mix: +2.65%;
- strategic exposure: +1.33%;
- diversified tradable portfolio: +2.55%.

Every baseline portfolio retained negative 10th-percentile outcomes. The model therefore does not present ordinary diversification as a guaranteed gain.

## Inflation and rate shock

Median terminal return:

- equal-weight equities: -8.01%;
- defensive mix: -13.14%;
- strategic exposure: -0.64%;
- diversified tradable portfolio: -10.45%.

The current defensive portfolio performs poorly because it contains fixed-income assets whose candidate prices are strongly rate-sensitive. This is economically coherent but means the portfolio should not be described to players as universally defensive. It is defensive against some business-cycle and company-specific risks, not against inflation and rapid rate increases.

## Meridian disruption

Median terminal return:

- equal-weight equities: -10.34%;
- defensive mix: -13.13%;
- strategic exposure: +0.44%;
- diversified tradable portfolio: -11.67%.

The strategic portfolio remains near flat because its mineral, energy, and strategic-infrastructure exposures partly offset losses from disrupted logistics and confidence. The outcome is not guaranteed: only 56% of runs finished positive.

## War escalation

Median terminal return:

- equal-weight equities: -8.95%;
- defensive mix: -17.75%;
- strategic exposure: +7.71%;
- diversified tradable portfolio: -11.29%.

The war scenario creates the intended moral and economic asymmetry: strategic suppliers and resource exposures may gain while banks, property, broad markets, and government debt lose value. The strategic portfolio still has a negative 10th-percentile outcome in other scenarios and is not universally superior.

At the instrument level, war escalation produced candidate median gains for Boreal Energy, Northstar Defense Infrastructure, and the Strategic Minerals Benchmark, while Glacier Capital and Coldhaven Properties suffered severe median losses.

## Commodity boom

Median terminal return:

- equal-weight equities: approximately flat;
- defensive mix: -0.84%;
- strategic exposure: +4.18%;
- diversified tradable portfolio: -0.91%.

Boreal Energy and the mineral benchmark benefit, while logistics and fixed-income exposures face input-cost and inflation pressure. This supports differentiated sector behavior rather than a uniform national-market gain.

## Crisis and recovery

Median terminal return:

- equal-weight equities: +0.42%;
- defensive mix: -4.19%;
- strategic exposure: +4.93%;
- diversified tradable portfolio: -1.24%.

The recovery phase prevents the crisis from becoming permanently terminal, but recovery is uneven. The diversified portfolio finishes positive in only 34% of runs. This indicates that the current recovery factors are too weak for broad household and diversified-investor recovery and should be recalibrated before gameplay approval.

## Findings requiring changes

1. Rename or redesign the defensive portfolio so players are not led to believe it protects against rate shocks.
2. Add five-year and ten-year sovereign or swap curve references.
3. Add real-return reporting so inflation can reduce nominal fixed-income outcomes transparently.
4. Add issuer default, recovery, refinancing, and interest-coverage mechanics.
5. Add player order, transaction-cost, liquidity, and concentration behavior.
6. Add country-level fiscal, currency, employment, and household effects.
7. Strengthen or lengthen broad recovery mechanics so the economy can recover without requiring strategic-sector concentration.
8. Simulate Yrethia, Thaloris, Solvend, and the remaining six countries before cross-country balance conclusions.
9. Ingest the raw evidence archive into the repository or an immutable CI artifact store.

## Decision

The simulation is a legitimate executed pilot and replaces the earlier state of having no simulation evidence for Northreach.

It does not validate the current values for production. It identifies several useful relationships and concrete balance problems, especially fixed-income rate sensitivity, weak broad recovery, and the risk that wartime strategic assets become overly attractive.

Northreach remains inactive and blocked from staging.
