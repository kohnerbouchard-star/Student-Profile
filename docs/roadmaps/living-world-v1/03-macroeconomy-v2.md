# MAC — Macroeconomy V2

Status: **PLANNED** · Baseline: `22dc9ce5023eb200a6608d5bb90a9ac30cb36c90` · Planning date: 2026-09-20

## Intended result

Replace mechanically drifting country indicators with an explainable, bounded causal simulation whose outputs influence everyday choices.

## Verified starting point and limits

The inspected daily macro migration moves indicators 10% toward configured targets. This proves a simple existing mechanism, not the absence of all other shocks or overrides. FND-01 must locate the latest function definitions and every writer. FX already consumes versioned macro evidence; it is not to be rebuilt.

## Ownership and integration boundaries

Economy/Countries own aggregate economic observations and snapshots. Existing World/Story owns authorized scenario shocks; Banking owns financial settlement; FX alone publishes exchange-rate fixings. Business, player employment and commerce provide versioned observations through public contracts. Macroeconomic statistics are not permission to post money.

## Candidate records and interfaces

Candidate records: model-policy version, country-sector observation, input provenance, simulation checkpoint, macro batch and explanation contributions. Keep existing country_economic_snapshots as the published read boundary where compatible; do not create a second authoritative GDP series by accident.

Candidate interfaces: collectEconomicObservations, calculateMacroStep, publishMacroBatch, previewScenario and readCountryEconomicExplanation. State input units and horizons. Publish full-country batches atomically with stable source identities.

## Content and fixture scope

Start with three aggregate sectors and two countries in deterministic offline experiments; then use all ten countries and canonical route exposure. Preserve a declared residual economy for non-player activity. Country calibration and representative-player weights must be explicit simulation policy, not fictional observed national data.

## Explicit exclusions

No full agent-based economy, arbitrary money printing, real-world forecasting claim, live policy experimentation on classroom state, or second FX writer. Do not include share trading, loan principal, transfers and repeated intermediate sales as newly produced GDP.

## Milestones

### MAC-01 — Define economic measurement and accounting boundaries

**Dependencies:** `FND-02`, `FND-01`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Define stocks versus flows, nominal versus real measures, period lengths, currency conversion bases, seasonal adjustment policy and player-to-national scaling. Choose value-added or final-expenditure measurement with a reconciliation check; label missing measurements honestly. Separate classroom activity from the non-player economy and ensure the residual sector does not count player production twice. Map existing ledger/activity events into observation categories with known coverage and exclusions.

**Player and Admin experience.** Create a country economic dictionary with units, time period, freshness and method. Admin sees coverage and missing-input diagnostics. Players see understandable labels such as a price index or a growth rate rather than ambiguous percentages.

**Acceptance and adversarial tests.** Test that a share sale, loan principal transfer and movement between accounts do not increase output; intermediate goods are not counted repeatedly; FX revaluation is not production; zero activity differs from unavailable data; per-period and annual rates cannot be interchanged silently.

**Exit gate.** A reviewed measurement contract and baseline dataset exist before model coefficients are tuned.

### MAC-02 — Build a bounded production and demand model

**Dependencies:** `MAC-01`, `FND-04`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Implement pure deterministic sector calculations using productive capacity, labor availability, input availability, demand and capacity utilization. Consume canonical completed activity, not merely orders or UI intentions. Start with transparent equations and versioned coefficients. Separate observed classroom flows, modeled non-player flows and scenario shocks. Use inventories consistently so goods produced, stored and sold are not double-counted. Record a reason decomposition for each changed indicator.

**Player and Admin experience.** Show sector demand, bottlenecks and supply pressure with a data-quality label. The player should distinguish current observations from forecasts. Admin can run a no-write scenario preview and compare baseline versus candidate model versions.

**Acceptance and adversarial tests.** Exercise no demand, excess demand, labor shortage, material shortage, idled capacity and inventory accumulation. Identical seed/policy/input yields identical output; changing input order does not change a result. Confirm bounded nonnegative quantities and sensible conservation relationships.

**Exit gate.** A small sector model explains its outcomes in unit tests and produces compatible country observations without changing the active macro writer.

### MAC-03 — Connect labor demand, wages, living costs and inflation

**Dependencies:** `MAC-02`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Link vacancies, employment, wage offers, essential-goods baskets and input costs through lagged, bounded relationships. Distinguish wage levels from wage growth and relative price changes from broad inflation. Specify basket weights and avoid updating wages, demand and prices in an instantaneous circular loop. Keep tax/interest policy rates separate from mechanically estimated market variables. Use agreed prior-period snapshots for inputs.

**Player and Admin experience.** Provide an explanation such as increased freight costs raising the essentials basket, or expanding service demand creating vacancies. Life reads published wage/rent indexes for future offers and unopened bills, never rewrites signed agreements or already-issued bills.

**Acceptance and adversarial tests.** Test supply shock versus demand shock, wage pressure under labor scarcity, a large single-sector price increase, and a shrinking workforce. Require coefficient sensitivity and stability analysis. Evaluate counterexamples: not every higher wage automatically creates identical inflation or job loss.

**Exit gate.** Labor and cost-of-living outcomes have explicit causal provenance, lags and contract-protection rules.

### MAC-04 — Model trade routes, import exposure and substitution

**Dependencies:** `MAC-02`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Use existing World routes and locations to model bounded bilateral or sector exposure, capacity, shipping cost, delay, imports, exports and substitution. Distinguish trade order, transit and delivered flow. Declare how modeled external trade and observed in-game trade reconcile. Route closures change capacity and relative costs, not arbitrary unrelated countries. Define the economic-period FX valuation basis using an already-completed fixing so same-day trade and FX do not form a circular calculation.

**Player and Admin experience.** Extend economic map overlays with essential imports, route exposure, substitutes and time-to-arrival. Show why another location becomes attractive, without inventing opportunities not represented by real listings or travel access. Admin can inspect the exposure matrix and scenario assumptions.

**Acceptance and adversarial tests.** Test one closed route, two competing routes, delayed reopening, domestic substitution, all routes unavailable and inverse trade accounting. Verify no double-counted shipment, impossible route, same-tick FX feedback or negative available supply.

**Exit gate.** A logistics shock propagates to specific countries/sectors with reproducible costs, delays and recovery.

### MAC-05 — Add fiscal, credit and business-cycle policy transmission

**Dependencies:** `MAC-03`, `MAC-04`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Define scenario-owned tax, subsidy, spending and interest-rate policy changes with effective dates and bounded lags. Distinguish an aggregate modeled government sector from any actual canonical treasury account. A game payment requires funded ledger authority; a macro index alone never authorizes a debit or credit. Model demand, credit pressure and stabilization effects conservatively. Identify balancing assumptions explicitly and retain counter-scenarios rather than making one policy universally superior.

**Player and Admin experience.** Show preconditions, lag, uncertainty and distributional effects in a simulation explanation panel. Admin may preview an approved scenario-policy change; players respond economically rather than gaining unilateral control of a country or its war decisions.

**Acceptance and adversarial tests.** Run recession, recovery, demand boom, supply contraction and conflicting shocks. Check policy time consistency, no retroactive loan repricing, funded benefits, finite tax bases and absence of explosive positive feedback. Evaluate outcomes under several coefficient sets.

**Exit gate.** Policy transmission is an explainable simulation model with documented limits, not an unqualified statement about actual national economies.

### MAC-06 — Run the model in shadow with deterministic snapshots

**Dependencies:** `MAC-05`, `LIFE-03`, `LIFE-04`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Read immutable observation cutoffs and calculate complete country batches without changing active gameplay. Store model version, input digest, calculation time and country coverage. Compare candidate outputs with the current engine and flag divergence; do not grade the new model solely by agreement with old target convergence. Bound runner work and use the established scheduler/lease pattern. Keep shadow observations entirely non-authoritative.

**Player and Admin experience.** Admin sees baseline/candidate differences, worst-case changes, missing inputs and economic explanations. Player screens remain on the active model. A selected synthetic replay can demonstrate how wages, bills and purchasing activity feed the model without exposing student records.

**Acceptance and adversarial tests.** Stop and resume mid-batch; repeat a batch; deliver an input late; omit one country; change a policy version; run multiple workers. Candidate outputs must not affect balances, prices, FX fixings or downstream gameplay until an explicit future cutover.

**Exit gate.** Shadow runs are reproducible and complete across all ten countries, with calibrated discrepancy thresholds and no active-game writes.

### MAC-07 — Integrate published macro evidence with FX and gameplay

**Dependencies:** `MAC-06`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Introduce a guarded per-game model-version cutover after approval. Publish one complete macro batch effective before the 08:00 FX boundary, or keep the prior authoritative batch with stale evidence. Preserve FX input selection, immutable fixings and no replay of paused dates. Store, loans, employment offers, World and Market consume supported snapshot fields at their own contractual boundaries. Preserve prior policy and model provenance for historical explanations.

**Player and Admin experience.** Players can inspect which macro release affected a quote, vacancy, loan offer or market signal. Show downstream lag instead of pretending every change is instantaneous. Admin has a cutover preview and a forward recovery procedure for future periods; old financial history is never recalculated.

**Acceptance and adversarial tests.** Test 07:59/08:00 races, missing-country input, current versus prior FX valuation, new quote versus committed transaction, paused games, resumed games, and stale consumers. Assert no duplicate Story shock through both direct and macro channels.

**Exit gate.** A single causal shock propagates through authoritative owners exactly once and remains explainable across each affected surface.

### MAC-08 — Certify model stability, fairness and explanation quality

**Dependencies:** `MAC-07`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Run 365-day simulations across all ten countries with multiple reproducible seeds, difficulty settings, player participation levels and shock combinations. Include sensitivity sweeps, parameter perturbation, extreme boundary cases and long-run equilibrium checks. Measure volatility, recovery, living-cost affordability, employment availability, cross-country opportunity and residual-model dominance. Report failed seeds and capped behavior, not just successful averages.

**Player and Admin experience.** An independent reviewer should explain representative changes using the stored contribution breakdown. Test whether a player can distinguish observed data, modeled estimates and future uncertainty. Admin can reproduce any published batch from the recorded inputs.

**Acceptance and adversarial tests.** Require numerical stability, no unexplained money creation, complete source provenance, no unsupported country permanently losing all recovery options, and identical replay. Product-calibrated bounds for inflation, output movement and recovery remain proposed until approved with evidence.

**Exit gate.** Macroeconomy V2 is accepted as a bounded educational simulation, with exact-source and shadow/integration evidence; broader realism claims remain excluded.

## Source basis

**R5 — Daily country macro progression migration.** Inspected source lines 172–218 show 10% movement toward configured targets. Locate any superseding writer before implementation. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/backend/supabase/migrations/20260810120000_add_daily_country_macro_runtime_v1.sql`.

**R9 — Canonical FX authority scope.** Single currency/fixing authority, 08:00 game-local cadence, immutable provenance and pause rules. Historical PR labels are not current merge status. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/docs/roadmaps/canonical-fx-authority-scope-v1.md`.



---
