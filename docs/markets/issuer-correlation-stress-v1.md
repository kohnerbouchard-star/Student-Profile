# Issuer Correlation and Concentration Stress v1

Status: controller hold; isolated Financial Markets domain work only.

## Scope

This tranche adds deterministic issuer-level correlation and concentration analytics for fixture-backed portfolios.

The model:

- aggregates instrument values and standalone losses by issuer;
- validates bounded pairwise issuer correlations;
- builds a deterministic symmetric correlation matrix;
- rejects duplicate pairs, unknown issuers, self-pairs, invalid coefficients, and non-positive-semidefinite matrices;
- calculates a correlation-adjusted tail-loss proxy;
- calculates marginal issuer contribution to correlated loss;
- calculates portfolio value weights and correlated-loss weights;
- calculates top-issuer concentration and issuer Herfindahl index;
- emits a stable correlation-matrix digest;
- remains deterministic and activation-disabled.

## Interpretation boundary

This result is a bounded scenario-risk proxy. It is not a probabilistic forecast, regulatory VaR, capital requirement, real-world credit model, or recommendation to trade.

Correlation inputs must eventually come from reviewed game-scoped scenario policies. They must not be inferred from real-world feeds or silently generated from inactive Seed definitions.

## Integration boundary

This tranche does not:

- add migrations;
- modify Seed catalogs;
- activate instruments;
- add shared API or capability registration;
- publish Player or Admin routes;
- deploy staging or production;
- enable derivatives, short selling, or unrestricted optionality.

Any future connected integration must bind the scenario policy, source version, game identity, valuation timestamp, and portfolio snapshot identity before publishing results.
