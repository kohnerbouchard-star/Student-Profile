# Financial Markets Active Domain Tranche v1

Status: controller hold; isolated pure-domain implementation only.

## Scope completed

### Market microstructure

- Deterministic price-time-priority matching.
- Partial fills across multiple counterparties.
- Maker-limit execution pricing.
- Self-trade prevention without suppressing unrelated liquidity.
- No executable crossed book after deterministic matching.
- Optimistic stale-version rejection.
- Idempotent transition-key replay rejection.
- Order replacement with reset time priority.
- Order cancellation and terminal-state protection.
- Exact cash or asset reservation release and incremental requirement calculations.
- Short selling remains disabled.
- Settlement remains in the `financial_instrument` domain and does not call Marketplace physical-item settlement.

### Fixed income and issuer fundamentals

The existing isolated domain already covers coupon schedules, accrued interest, clean and dirty pricing, bounded YTM solving, Macaulay duration, modified duration, convexity, yield-curve interpolation and extrapolation, credit/liquidity/event spread decomposition, issuer financial statements, retained earnings, working capital, leverage, interest coverage, earnings quality, accounting identities, default and recovery calculations. This tranche preserved those implementations and expanded their downstream portfolio and simulation consumers without shared integration.

### Portfolio analytics

- Realized, unrealized and total profit/loss reconciliation.
- Total return against invested capital.
- Exposure totals by issuer, country and asset class.
- Weighted duration, convexity and liquidity.
- Maximum drawdown from deterministic time-ordered observations.
- Historical 95% loss-quantile approximation.
- Combined instrument, issuer, country and asset-class scenario loss attribution.

### Economic-coherence simulations

Deterministic scenarios now cover:

1. price discovery;
2. liquidity drought;
3. rate shock;
4. credit deterioration;
5. issuer default;
6. fund redemption;
7. market manipulation attempts;
8. wash trading;
9. circular valuation;
10. reservation abuse;
11. replay abuse;
12. settlement failure;
13. arbitrage leakage.

Every result records a deterministic digest, operation count, bounded state and detected coherence breaches. Activation remains disabled.

## Benchmark thresholds

The benchmark is deterministic and operation-count based rather than wall-clock based. This avoids runner noise while still detecting algorithmic regressions.

| Workload | Reference items | Baseline operations | Threshold operations | Maximum baseline regression |
|---|---:|---:|---:|---:|
| 3,200 instrument definitions | 3,200 | 44,800 | 60,000 | 15% |
| Large order books | 50,000 orders | 6,400,000 | 8,000,000 | 15% |
| Portfolio recalculation | 10,000 positions | 240,000 | 300,000 | 15% |
| Settlement replay | 100,000 events | 1,100,000 | 1,500,000 | 15% |
| Concurrent reservations | 20,000 reservations | 340,000 | 500,000 | 15% |
| Deterministic simulation runtime | 1,000,000 steps | 13,000,000 | 15,000,000 | 15% |

Threshold and baseline regressions are reported separately and fail closed through `assertMarketDomainBenchmarkGreen`.

## Evidence

The tranche adds 22 focused tests covering partial fills, matching determinism, self-trade prevention, replacement, cancellation, reservation deltas, stale versions, replay rejection, terminal states, return reconciliation, exposure aggregation, drawdown, VaR approximation, scenario loss, all 13 coherence scenarios, benchmark determinism, threshold failures and baseline regressions.

## Controller-hold boundaries

This tranche does not:

- synchronize with advancing `main`;
- add migrations;
- modify Classroom API or Admin API;
- modify capability manifests, central rate limits or Player registries;
- publish an Admin loader;
- activate the 3,200-instrument universe;
- deploy staging or production;
- couple financial-instrument settlement to Marketplace physical-item settlement;
- mark the PR ready;
- merge the PR.
