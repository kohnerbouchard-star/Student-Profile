# Bounded Callable Bond Policy v1

Status: controller hold; isolated pure-domain implementation only.

## Purpose

This tranche defines deterministic callable-bond behavior without introducing unrestricted optionality, derivatives, stochastic interest-rate models, or production activation. It supports explicit issuer call schedules, bounded refinancing policy decisions, and yield-to-worst disclosure for approved inactive bond definitions.

## Call schedule contract

Every callable bond must reference one explicit call schedule. Each schedule entry contains:

- a stable public entry identity;
- an exercise date strictly after issue and before maturity;
- a positive call price per face unit;
- a minimum refinancing-savings threshold in basis points;
- a bounded notice period.

Duplicate entry identities, duplicate exercise dates, entries outside the bond term, schedule identity mismatches, and malformed amounts fail closed.

## Issuer exercise policy

The deterministic policy evaluates only entries whose notice window contains the evaluation date. It compares:

- the bond coupon rate;
- the proposed refinancing yield;
- the entry-specific minimum savings threshold;
- remaining coupon savings through maturity;
- call premium cost;
- explicit refinancing cost.

Exercise is recommended only when the basis-point threshold is met and the resulting net economic benefit is positive. The decision is an issuer-policy result, not an option valuation or automatic settlement instruction.

## Investor disclosure

Yield-to-worst is calculated across every future explicit call date and contractual maturity. Each candidate uses the same bounded coupon schedule and redemption amount. The lowest deterministic annual yield is returned with its candidate identity.

The implementation does not claim option-adjusted spread, duration under stochastic exercise, volatility-adjusted value, or market-consistent optionality pricing.

## Fail-closed boundary

Every public result records:

- `optionalPricingSupported: false`;
- `activationAuthorized: false`;
- `deterministic: true`.

This tranche creates no migrations, persistence schema, shared API routes, capability publication, Player/Admin route registration, Seed activation, staging deployment, or production deployment.

## Validation

Focused tests cover:

- economically beneficial call exercise;
- refinancing savings below the configured threshold;
- yield-to-worst selection across call and maturity candidates;
- duplicate and out-of-term call entries;
- call-schedule identity mismatch;
- permanent fail-closed optional-pricing and activation markers.
