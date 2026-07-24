# Advanced Economic Scenarios v1

Status: isolated deterministic simulation work. Seed catalogs, migrations, shared APIs, staging, and production remain unchanged.

## Macroeconomic propagation

The macroeconomic scenario engine models all ten countries through peace, shortage, war, and reconstruction. It tracks:

- country price indexes;
- phase inflation rates;
- exchange rates against a selected base unit;
- confidence-driven currency movement;
- domestic scarcity;
- scarcity imported through explicit trade-dependency links;
- cross-country scarcity cascades.

Configuration includes bounded money-growth, supply, and confidence shocks. The engine emits critical or warning findings when inflation, depreciation, scarcity, or cascade-count guardrails are exceeded.

The model is deterministic and diagnostic. It does not update Store prices, exchange rates, Seed definitions, or live game state.

## Credit, default, and recovery

The credit-recovery engine models:

- current, delinquent, defaulted, restructured, and repaid loan states;
- country income, cost, and credit modifiers;
- scheduled debt service and missed payments;
- interest pressure during shortage and war;
- principal restructuring during reconstruction;
- reconstruction recovery income;
- late-player joining and bounded catch-up assistance;
- ending cash, debt, net wealth, debt service, default, and recovery outcomes.

The late-join wealth gap is normalized against the absolute early-player average, so the measure remains meaningful when either cohort has negative average net wealth.

## Guardrails

The engines report:

- maximum default rate;
- minimum recovery-after-default rate;
- maximum late-join wealth gap;
- maximum inflation rate;
- maximum currency depreciation;
- maximum scarcity index;
- maximum number of countries in a scarcity cascade.

All findings are evidence only. No content value is automatically rewritten.

## Reference evidence

`runAdvancedEconomicScenarios.ts` generates one canonical artifact containing both scenario reports and a compact summary. Evidence uses fixed fixture identities, a fixed generated-at marker, stable ordering, and deterministic evidence digests.

The branch workflow runs:

1. all economy simulation and exploit tests;
2. the existing 30- and 40-player classroom reference simulation;
3. the macroeconomic and credit-recovery reference scenarios;
4. Backend type-checking;
5. Deno formatting and patch checks;
6. fail-closed marker verification;
7. artifact publication for both reference suites.

Every report records:

- `seedCatalogsModified: false`;
- `activationAuthorized: false`;
- `deterministic: true`.
