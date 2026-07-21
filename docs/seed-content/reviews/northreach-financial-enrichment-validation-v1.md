# Northreach Financial Enrichment Validation v1

Status: structural and arithmetic pass; simulation, capability, staging, and release approval pending  
Activation authorized: **false**

## Scope

This review covers the 24-instrument Northreach active-market candidate and its 21 issuer or administrator records.

Reviewed files:

- `markets/active-subsets/northreach-active-issuer-enrichment-v1.json`;
- `markets/active-subsets/northreach-active-equity-enrichment-v1.json`;
- `markets/active-subsets/northreach-active-fixed-income-enrichment-v1.json`;
- `markets/active-subsets/northreach-active-collective-reference-enrichment-v1.json`.

The values are authored calibration candidates. This review does not claim that an economic or market simulation ran.

## Record integrity

- 21 unique issuer or administrator definitions: pass.
- 24 unique instrument definitions: pass.
- every instrument resolves to one issuer or administrator: pass.
- all records use Northreach, NRC, and FGX consistently: pass.
- all records retain `activationAuthorized: false`: pass.
- linked securities share their issuer profile: pass.

Kestrel Consumer Staples is represented by one issuer definition shared by its common equity and two-year corporate note. Northreach Treasury is shared by the one-year and three-year sovereign bonds. Frostgate Asset Management is shared by both funds.

## Equity arithmetic

Twelve common equities define candidate revenue, operating income, net income, cash, debt, capital expenditure, growth, shares, price, market capitalization, earnings per share, valuation, dividend, liquidity, volatility, and event exposure.

Checks:

- market capitalization equals starting price multiplied by shares outstanding: pass for 12 of 12;
- earnings per share equals net income divided by shares outstanding within declared precision: pass for 12 of 12;
- dividend per share does not exceed earnings per share: pass for 12 of 12;
- price-to-earnings range is 9.57–14.63: plausible candidate range, not yet approved;
- dividend-yield range is 1.06%–6.21%: plausible candidate range, not yet approved;
- every equity has a differentiated event-exposure profile: pass.

Negative candidate free cash flow is intentionally present for capital-intensive or leveraged issuers, including Polar Northern Logistics, Whitecap Construction, Coldhaven Properties, Polar Group, Ironpine Strategic Works, Granite Engineering, and Whitecap Projects. These are stress-test targets, not arithmetic failures.

## Linked equity and debt

Kestrel Consumer Staples has:

- common-equity price of NRC 19.80;
- 220 million shares;
- NRC 4.356 billion candidate market capitalization;
- NRC 433.1 million candidate net income;
- NRC 1.969 earnings per share;
- NRC 0.95 dividend per share;
- a two-year NRC 750 million note with 4.60% coupon and 4.82% candidate yield.

The bond and equity reference one issuer balance sheet. This passes the required linked-security consistency model. Credit spread, recovery, and refinancing behavior still require simulation.

## Sovereign curve

The candidate Northreach curve contains:

- one-year Treasury yield: 3.83%;
- three-year Treasury yield: 4.20%.

The short curve slopes upward and both issues are more liquid and lower-volatility than the corporate notes. A five-year and ten-year sovereign or swap reference is still required before the five-year and ten-year corporate bonds can be fully calibrated.

## Corporate fixed income

Four corporate notes define face value, coupon, payment cadence, term, starting price, candidate yield, issue size, credit band, liquidity, volatility, maturity treatment, default treatment, and event exposure.

Current candidate yields:

- Kestrel Consumer Staples two-year: 4.82%;
- Ironpine Strategic Works two-year: 5.72%;
- Whitecap Projects five-year: 6.41%;
- Polar Group ten-year: 6.48%.

The lower-quality and longer-duration bonds carry higher candidate yields than the short sovereign curve. Full term-structure, recovery-rate, and interest-coverage validation remains pending.

## Convertible preferred

Granite Engineering Convertible Preferred defines par value, dividend, conversion ratio, reference common price, call protection, liquidity, volatility, and event exposure.

The underlying common equity is not part of the 24-instrument active candidate. Conversion must remain disabled or definition-only until the runtime can resolve the underlying security and process conversion idempotently.

## Index, funds, trust, and benchmark

- Northreach Composite Index: 12 equity constituents; float-adjusted market-cap weighting; 15% cap; weights total 1.000001 because of six-decimal serialization and pass within rounding tolerance.
- Northreach Broad Market Fund: 12 equities plus the logistics trust; weights total 1.000000.
- Northreach Large Companies Fund: eight equities; weights total 1.000000.
- Northreach Logistics Facilities Trust: three property-location weights total 1.000000; gross assets minus debt equals net asset value; NAV per unit is arithmetically correct.
- Northreach Strategic Minerals Benchmark: four basket weights total 1.000000 and the benchmark remains non-tradable.

No fund, index, trust, or benchmark is authorized for runtime activation.

## Exposure model

All 24 instruments carry bounded directional exposure values from -3 to +3 for applicable factors, including:

- growth;
- inflation;
- interest rates;
- currency strength;
- energy prices;
- shipping costs;
- labor costs;
- regulation;
- public confidence;
- country stability;
- war escalation;
- Meridian disruption.

The model deliberately produces opposing responses. War escalation may benefit strategic infrastructure while harming banking and real estate. Meridian disruption harms logistics and construction while potentially supporting advisory and remediation demand. This prevents a single event from moving every asset identically.

## Blocking findings

1. No reproducible simulation has run.
2. Five-year and ten-year sovereign or swap references are missing.
3. Bank-specific balance-sheet and capital rules are needed for Glacier Capital.
4. Corporate interest coverage, recovery rates, and refinancing schedules need validation.
5. Runtime support for bond coupon payment, maturity, default, conversion, fund NAV, index calculation, and trust distributions is unverified.
6. Prices and coefficients have not been tested for exploit strategies or classroom pacing.
7. The active-market importer and rollback path do not exist.
8. Map coordinates for issuer and trust locations remain unverified.

## Result

Northreach passes the first financial-enrichment structural and arithmetic gate. It is suitable as the template for generating the other nine country candidates and as an input to a future simulation runner.

It is not staging-ready, production-ready, or approved for activation.
