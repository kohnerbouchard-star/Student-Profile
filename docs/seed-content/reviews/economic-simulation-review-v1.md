# Economic Simulation Review v1

Status: conditional pass with calibration changes
Run date: 2026-07-18
Model type: deterministic stochastic classroom-economy simulation
Random seed: 20260718
Population: 1,000 simulated players
Countries: 10
Periods: 20
Difficulty profiles: accessible, standard, challenging, expert
Cohorts: active, average, low participation, late joining

## Purpose

Test whether the candidate reward, price, saving, and participation bands create a viable classroom economy before exact values are approved for staging.

This is a design simulation, not a database, backend, or staging test.

## Model assumptions

### Cohort distribution

- active: 30 percent;
- average: 50 percent;
- low participation: 15 percent;
- late joining: 5 percent.

### Participation behavior

Active cohort:

- 95 percent attendance probability;
- 85 percent Contract-completion probability;
- mean completed-Contract reward of 7.5 ECO-equivalent.

Average cohort:

- 85 percent attendance probability;
- 65 percent Contract-completion probability;
- mean reward of 6.5.

Low-participation cohort:

- 65 percent attendance probability;
- 35 percent Contract-completion probability;
- mean reward of 5.5.

Late-joining cohort:

- joins after five periods;
- 80 percent attendance probability after joining;
- 60 percent Contract-completion probability;
- mean reward of 6.0;
- receives a one-time onboarding grant of 7.0.

### Difficulty distribution

- accessible: 15 percent at 1.10 income modifier;
- standard: 55 percent at 1.00;
- challenging: 20 percent at 0.90;
- expert: 10 percent at 0.80.

### Player allocation behavior

- eight percent of available liquid balance above a minimum is moved to savings each period;
- five percent of sufficiently large balances is allocated to the market every third period;
- savings receives 0.50 percent every fifth period;
- market allocations receive a small stochastic return with bounded ordinary volatility;
- players attempt Common purchases at periods 4, 8, 12, 16, and 20;
- players attempt Strategic purchases at periods 8, 12, 16, and 20.

### Country affordability factors

Country price factors ranged from 0.94 to 1.10 around the common reference value. These were used only to test cross-country affordability divergence, not as approved exchange rates.

## Price iterations

### Initial Strategic test: 30 ECO-equivalent

Result:

- active cohort Strategic access: 77.7 percent;
- average cohort: 11.1 percent;
- late cohort: 3.7 percent;
- low cohort: 0.6 percent;
- median average first purchase: period 15.

Decision:

Fails the intended Strategic acquisition window. The price was too high when Common purchases, saving, and market allocation also competed for income.

### Second Strategic test: 24 ECO-equivalent

Result:

- active cohort access: 86.2 percent;
- average cohort: 15.4 percent;
- late cohort: 5.6 percent;
- low cohort: 0.6 percent;
- median average first purchase: period 16.

Decision:

Still too slow for average players.

### Selected pilot test: 18 ECO-equivalent

Result:

- active cohort access: 98.2 percent;
- average cohort: 48.2 percent;
- late cohort: 22.2 percent;
- low cohort: 1.1 percent;
- active median first Strategic purchase: period 8;
- average median: period 12;
- late median: period 16 after a period-5 start;
- low-participation median among purchasers: period 10.

Decision:

Conditional pilot value. It produces meaningful access for active and average players while retaining scarcity, but the low-participation recovery model still requires additional targeted testing.

## Common-item result

Common reference price: 10 ECO-equivalent.

- all cohorts eventually purchased at least one Common item;
- active and average median first purchase: period 4;
- late-joining median first purchase: period 8, three active periods after joining;
- low-participation median first purchase: period 8.

Decision:

Passes the broad accessibility target for the simulated assumptions.

## Cohort results at selected pilot values

| Cohort | Simulated players | Median total income | Median final wealth | Common access | Strategic access | Median first Common | Median first Strategic |
|---|---:|---:|---:|---:|---:|---:|---:|
| Active | 282 | 141.95 | 51.30 | 100% | 98.2% | 4 | 8 |
| Average | 488 | 97.72 | 38.79 | 100% | 48.2% | 4 | 12 |
| Late joining | 54 | 72.36 | 28.59 | 100% | 22.2% | 8 | 16 |
| Low participation | 176 | 49.97 | 19.24 | 100% | 1.1% | 8 | 10 among purchasers |

`Final wealth` combines remaining liquid balance, savings, and simulated market allocation. It is not a production net-worth calculation.

## Country results

| Country | Median income | Median final wealth | Wealth deviation from country median | Strategic access |
|---|---:|---:|---:|---:|
| Eldoran | 95.84 | 35.67 | -10.19% | 63% |
| Thaloris | 92.44 | 37.38 | -5.90% | 54% |
| Dravenlok | 96.26 | 38.01 | -4.32% | 52% |
| Lumenor | 102.19 | 39.12 | -1.52% | 55% |
| Valerion | 105.04 | 39.16 | -1.43% | 53% |
| Northreach | 96.70 | 40.29 | +1.43% | 53% |
| Yrethia | 102.29 | 40.89 | +2.93% | 50% |
| Xalvoria | 98.42 | 41.49 | +4.46% | 44% |
| Solvend | 105.86 | 42.02 | +5.80% | 48% |
| Syndalis | 107.43 | 43.53 | +9.58% | 54% |

Results are affected by the random assignment of cohorts and difficulty profiles as well as country price factors.

Country wealth divergence remained within 10.2 percent of the country median, below the candidate 20 percent normal-condition threshold.

## Concentration and safety results

- negative liquid balances: 0;
- top-decile share of final simulated wealth: 15.62 percent;
- all countries reached Common-item access;
- no country exceeded the 20 percent normal-condition affordability divergence threshold;
- no duplicate transaction behavior was modeled in this run;
- no borrowing was enabled;
- market returns remained deliberately small.

## Findings

### Pass

- Common-tier accessibility;
- late-joiner access to a Common item within three active periods;
- no negative balances;
- low country divergence;
- moderate concentration under the selected behavior assumptions;
- continued competition between spending, saving, and market allocation.

### Conditional pass

- Strategic reference price of 18 ECO-equivalent;
- onboarding grant of 7 ECO-equivalent;
- selected difficulty income modifiers;
- current savings allocation assumptions.

### Changes required

1. Separate Strategic items by utility. A strong academic or gameplay benefit may need a 20–30 range, while the introductory Strategic tier should begin near 18.
2. Test a catch-up Contract for low-participation and late-joining players rather than increasing passive grants.
3. Add Store purchase limits so active players do not repeatedly consume every low-tier item.
4. Add explicit trading fees and market-loss scenarios.
5. Add loan behavior and default once banking is supported.
6. Run currency direct, inverse, expired, and missing-rate scenarios.
7. Model reward approval delays and rejected submissions.
8. Model a full Meridian chain rather than one generic Contract opportunity per period.
9. Run more than one random seed and report confidence intervals.
10. Validate teacher-side workload and reward-approval cadence.

## Recommended pilot bands after this run

- Immediate item: 2–5 ECO-equivalent;
- Common item: 7–12;
- introductory Strategic item: 16–22;
- strong Strategic item: 23–35 with lower purchase frequency;
- Premium and Exceptional values remain unapproved;
- late-joiner grant: 5–8, conditional on active onboarding work;
- normal completed-Contract mean: approximately 6–8;
- Attendance remains a minority income source.

## Reproducibility record

The simulation used a fixed random seed and the explicit assumptions in this file. A production calibration tool should preserve:

- model version;
- random seed;
- input configuration;
- generated cohort assignments;
- per-period aggregate outputs;
- result checksum;
- application commit and content-pack version.

The documentation branch does not add the simulation code to production or authorize these values for live use.

## Review conclusion

The candidate economy is viable enough to continue design work, but exact rewards and prices remain blocked until:

- multiple-seed simulation;
- currency scenarios;
- reward-approval timing;
- Store limits;
- market fees and losses;
- banking and loan tests;
- staging validation.