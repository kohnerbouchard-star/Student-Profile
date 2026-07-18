# Solvend Financial Enrichment and Market Simulation Review v1

Status: structural and arithmetic pass; simulation executed with balance blockers  
Activation authorized: **false**

## Scope

This tranche covers the complete 24-instrument Solvend bounded-market candidate after the four-country issuer audit confirmed 17 valid issuers or administrators and complete bidirectional references.

The simulation evaluates 22 tradable instruments. The national index and advanced-components benchmark remain reference-only and are excluded from portfolio returns.

Cyber sensitivity is modeled through explicit, checksummed simulation-calibration overrides for every tradable instrument. Those overrides are evidence inputs, not production authorization, and should be promoted into the shared enrichment schema only after four-country factor harmonization.

## Run configuration

- deterministic seeds: 250;
- market cycles: 60;
- tradable instruments: 22;
- scenarios: 8;
- portfolio strategies: 5;
- exact command: `python run_solvend_market_simulation_v1.py`.

Scenarios cover baseline conditions, a technology boom, a rate shock, cyber disruption, Meridian disruption, strategic wartime demand, a confidence crisis, and recovery.

Strategies cover equal-weight equities, concentrated technology exposure, strategic industrial exposure, a nominal resilience mix, and a fund-led diversified mix.

## Median portfolio returns

| Scenario | Equal equities | Technology concentration | Strategic industrial | Resilience mix | Diversified |
|---|---:|---:|---:|---:|---:|
| Baseline | 3.59% | 2.66% | 1.99% | 3.06% | 2.94% |
| Technology boom | 6.33% | 7.54% | 4.82% | 5.73% | 5.55% |
| Rate shock | -3.89% | -4.17% | -3.90% | -4.03% | -4.31% |
| Cyber disruption | -5.50% | -7.50% | -4.57% | -6.48% | -7.21% |
| Meridian disruption | -7.01% | -7.41% | -7.36% | -6.89% | -7.19% |
| Strategic wartime demand | -3.91% | -5.69% | -2.26% | -5.91% | -5.75% |
| Confidence crisis | -7.79% | -10.03% | -6.73% | -8.88% | -9.89% |
| Recovery | 8.79% | 8.82% | 7.25% | 8.27% | 8.44% |

## Integrity

- non-finite results: 0;
- guaranteed-positive instrument cases: 0;
- guaranteed-positive portfolio cases: 0;
- input, script, and summary SHA-256 values are recorded in `run-manifest-v1.json`;
- every strategy weight sums to exactly 1;
- every strategy references a committed Solvend instrument;
- every scenario defines the complete factor set;
- every tradable instrument has an explicit cyber calibration value.

## Findings

1. **Technology concentration has a clear upside/downside trade-off.** It produces the strongest median result in the technology-boom scenario at 7.54%, but falls to -7.50% under cyber disruption and -10.03% during a confidence crisis.

2. **Strategic wartime demand does not create a guaranteed-win portfolio.** The strategic-industrial strategy is the least negative wartime portfolio at -2.26%, but still has a 64.80% loss probability.

3. **Rate sensitivity remains systemic.** Every strategy has a negative median under the rate shock. The nominal resilience mix records an 84.80% loss probability because its sovereign debt, trust, and growth-asset components remain duration-sensitive.

4. **Cyber disruption is not diversifiable inside the current Solvend market.** All five strategies have negative medians. The strategic-industrial mix is least impaired, while technology-heavy funds and companies transmit correlated losses.

5. **Meridian disruption remains a country-wide shock.** Median returns cluster between -7.41% and -6.89%; the current domestic product set does not provide an effective route-disruption hedge.

6. **The diversified mix is not sufficiently factor-diversified.** Its two funds overlap materially with the same technology issuers, so nominal instrument count overstates economic diversification.

7. **Recovery is positive but not guaranteed.** Median recovery results range from 7.25% to 8.82%. The integrity gate still finds no guaranteed-positive portfolio case.

## Remaining blockers

- promote and harmonize cyber-disruption exposure across all four enriched country markets;
- model issuer default, recovery, refinancing, and bank-capital transmission;
- model liquidity stress, transaction costs, spreads, and player-order impact;
- reduce hidden overlap between broad-market and large-company funds;
- test cross-country currencies, trade links, and event propagation;
- preserve recovery paths without making recovery deterministic;
- retain all assets as `activationAuthorized: false`.

## Result

Solvend passes its first structural, arithmetic, and reproducible simulation gates with balance blockers.

It is suitable for the four-country calibration set with Northreach, Yrethia, and Thaloris. It is not staging-ready or production-ready.
