# CAP — Advanced Financial Markets and Analyst Gameplay

Status: **PLANNED** · Baseline: `22dc9ce5023eb200a6608d5bb90a9ac30cb36c90` · Planning date: 2026-09-20

## Intended result

Expand from reliable immediate stock trading into research, controlled order lifecycles and a small coherent multi-asset market without weakening settlement.

## Verified starting point and limits

The repository has an existing full-financial-markets authority document with EXP-MKT items and explicit exclusions. It describes bonds, funds, benchmarks and advanced orders as an expansion program. Reconcile its live status and owner before implementation. The older Analyst design is a design source, not current runtime proof.

## Ownership and integration boundaries

Market/Stocks owns instrument identity, quotes, orders, trades and custody appropriate to each instrument. Business remains sole authority for Business common shares. Banking owns accounts, holds and money settlement; FX owns conversions. Analyst owns forecast commitments/evaluations, not market prices or automatic grading.

## Candidate records and interfaces

Candidate extensions: typed instrument definition, trading calendar, order, hold reference, fill, cancellation/expiry, bond terms, coupon occurrence, recovery event, fund basket/NAV provenance, benchmark membership, forecast, evaluation policy, locked forecast and evaluation result. Reuse existing records before proposing successors.

Candidate commands: submitLimitOrder, cancelOrder, processEligibleFill, settleCoupon, matureBond, calculateFundNav, submitForecast, lockForecast and evaluateForecast. Preserve existing immediate order/quote commands and their supported split-funding behavior.

## Content and fixture scope

Proposed initial expansion: a small representative group of sovereign/corporate bonds, equity-only funds and reference benchmarks, rather than activating the full instrument library. Analyst can launch against existing stocks before advanced asset classes are ready.

## Explicit exclusions

Short selling, margin, derivatives, real-market feeds and physical commodity delivery remain excluded. First standing limit orders use prefunded listing-currency Checking funds with canonical holds; this restriction does not remove existing immediate-purchase split-funding/FX. Preferred or convertible instruments require a later separately approved scope.

## Milestones

### CAP-01 — Reconcile the market expansion authority and current contracts

**Dependencies:** `FND-01`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Audit the EXP-MKT authority, relevant open branches and existing Stocks/Markets boundaries. Catalogue implemented instrument types, calendar rules, quote/settlement paths, position ownership, dividends/corporate actions and archived design work. Identify exactly which abstractions can be extended without migrating certified common-share history. Register one owner for the eventual schema and shared endpoint changes; do not resurrect an obsolete branch blindly.

**Player and Admin experience.** Document what a player can currently trade and what is only a displayed benchmark. Audit Market versus Marketplace naming so goods commerce cannot be confused with securities. Admin has a truthful capability/readiness matrix.

**Acceptance and adversarial tests.** Trace one immediate buy and sell through the canonical funds and custody authorities. Confirm current orders/holdings remain unchanged by this planning/contract work. Every expansion item maps to its original or reconciled authority.

**Exit gate.** A reviewed expansion crosswalk exists, with no competing instrument or share-ownership writer.

### CAP-02 — Add typed instruments and trustworthy market read models

**Dependencies:** `CAP-01`, `FND-04`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Define common read fields and explicit type-specific properties: quote currency, unit/lot/tick, tradability, market state, issuer, source/freshness and relevant risk. A benchmark is not automatically a security. Bonds and funds cannot inherit stock assumptions such as share count or simple price-only return. Preserve public handles and old stock routes through compatible adapters. Add validation for impossible or missing terms before publication.

**Player and Admin experience.** Provide an instrument detail view with a clear type, trading eligibility, price basis, calendar and relevant disclosures. Empty or unsupported fields are omitted or labelled, never fabricated. Admin reviews listing readiness and can halt an instrument under authorized policy.

**Acceptance and adversarial tests.** Test a common share, bond, fund and nontradable index; invalid ticker mapping; missing terms; stale quotes; inactive issuer; and a halted instrument. Retain finite common-share custody and same-game isolation.

**Exit gate.** The shared Market UI can represent several instrument types honestly without changing certified immediate stock settlement.

### CAP-03 — Implement reservations and a bounded limit-order ticket

**Dependencies:** `CAP-02`, `FND-03`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Introduce explicit order states: submitted/open, partially filled only when later enabled, filled, cancelled, expired and rejected. Freeze side, quantity, listing currency, limit, expiry and policy at acceptance. Reserve exact maximum buy obligation plus authorized fees through canonical Checking holds, or reserve owned sell quantity through the custody owner. Default first release to listing-currency funds and no shorting. Currency conversion occurs explicitly before creating the hold; an expiring retail FX quote is not a standing multi-day funding promise.

**Player and Admin experience.** Show limit versus current price, held funds/quantity, expiry and the fact that execution is not guaranteed. Keep immediate orders separate and unchanged. Admin can monitor outstanding exposure and reject/halt via reasoned commands, not edit the order book directly.

**Acceptance and adversarial tests.** Race multiple orders against one balance/holding; retry a submission; use wrong currency; expire during a closed exchange; attempt unsupported margin or another player’s position. A rejected order must leave no durable hold.

**Exit gate.** Open orders cannot exceed available money or custody, and every reservation has a terminal release or settlement path.

### CAP-04 — Implement tick execution, cancellation, expiry and partial fills

**Dependencies:** `CAP-03`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Specify price/time priority and a bounded simulation liquidity policy rather than imply a real exchange order book. Evaluate only after an order’s accepted timestamp against eligible authoritative ticks, preventing hindsight fills. Atomically consume reservation, post cash, transfer custody, create fill/receipt and update remaining quantity. Add cancellation and expiry races before partial fills. Enable partial fill only after quantity, price, fee rounding and remainder-hold behavior are proven; otherwise retain all-or-none execution.

**Player and Admin experience.** Provide an order history with accepted, held, partially filled, filled, cancelled and expired evidence. Show average execution price and remaining commitment separately. Cancellation response distinguishes cancelled, already final and already filled.

**Acceptance and adversarial tests.** Test fill/cancel/expiry races, multiple workers, tick replay, price gaps, exchange closure, partial-fill rounding, insufficient remaining funds and message loss after fill commit. Sum of fills plus remaining quantity must equal ordered quantity under the lifecycle rules.

**Exit gate.** Orders have a complete economically reconciled lifecycle; no ghost holds, negative custody or retroactive fills remain.

### CAP-05 — Add a minimal fixed-income market

**Dependencies:** `CAP-04`, `MAC-05`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Implement fixed-rate bullet bonds first with face value, issue price, coupon schedule, maturity, day-count convention, minimum denomination and explicit default/recovery policy. Distinguish clean from dirty price, accrued interest, coupon rate and yield. Define record-date ownership and payment funding. A simulated issuer that cannot pay enters a bounded credit-event path; unpaid coupon cannot be manufactured into player cash. Use a versioned, disclosed curve/spread model and retain immutable payment occurrences.

**Player and Admin experience.** Show next coupon, maturity, accrued interest, principal, price basis and a plain explanation of interest-rate/default risk. Admin monitors funding and due payments. Buying a bond must review the exact total cash price, not just its quoted clean price.

**Acceptance and adversarial tests.** Test maturity on a holiday, leap-year accrual, ownership transfer around record time, duplicate coupon processing, unfunded issuer, early default and recovery. Reconcile principal/coupon/deductions with Banking receipts and holdings.

**Exit gate.** A bond can be issued, traded, pay or miss a coupon, mature/default and recover under one coherent lifecycle.

### CAP-06 — Add funds, indexes and commodity reference series

**Dependencies:** `CAP-05`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Distinguish three mechanisms: a nontradable reference index; a genuinely backed fund with defined units and custody; and a commodity reference series with no physical delivery. Start with a small equity-only fund if broader backing is not ready. Define basket weights, rebalance timing, fees, distributions, NAV inputs, missing-price policy and FX valuation fixing. Do not create a tradable promise without specifying its backing, issuer and settlement model. Reuse finite common-share custody for underlying Business shares.

**Player and Admin experience.** Players see constituents, concentration, valuation time, fees and whether an item is tradable. Admin can inspect NAV provenance and halt new transactions on stale constituents. Benchmark performance uses a clear base and return convention.

**Acceptance and adversarial tests.** Test constituent halt, missing price, corporate action, rebalance replay, currency mismatch, stale FX, duplicate distribution and fund ownership consistency. Fund units and underlying custody cannot both be treated as unencumbered player assets.

**Exit gate.** Each added product has a defensible lifecycle and valuation; reference series are never mislabelled as purchasable assets.

### CAP-07 — Implement Analyst forecast commitment using existing stocks

**Dependencies:** `CAP-02`, `FND-02`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Create a forecast containing asset, opinion, target, horizon, confidence, thesis, risks and invalidation condition. Capture authoritative baseline price/tick and deadline at submit; keep immutable revision history and lock before future evaluation data is available. Limit submissions by player/asset/horizon. Make visibility policy explicit, such as delayed publication after lock, to reduce copying. No position ownership is required to participate and forecasts do not move prices automatically.

**Player and Admin experience.** Add an Analyst workspace within the Market experience, with a structured submission and an explanation field. Show active forecasts, lock time and what evidence will be used to evaluate them. Admin can review reasoning separately from price accuracy and void an invalid case with a reason.

**Acceptance and adversarial tests.** Test late entry, repeated submissions, horizon alteration, missing baseline tick, halted asset, future-data leakage, edited thesis after lock and cross-player access. A saved draft is not presented as a locked submitted forecast.

**Exit gate.** Students can commit a research thesis against a reproducible baseline before the outcome occurs.

### CAP-08 — Evaluate forecasts fairly and build analyst reputation

**Dependencies:** `CAP-07`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Choose and version a transparent scoring policy before accepting scored submissions. Separate directional accuracy, target error, confidence calibration and teacher-reviewed reasoning. Handle missing/halted evaluation ticks, splits/distributions where supported, delisting and invalidation with an explicit pending/void policy. Store component calculations and evaluation evidence; corrections append a new version. Prefer bounded credentials/reputation over cash incentives for trading volume or lucky gains. Any reward is issued by Progression once.

**Player and Admin experience.** Show forecast versus outcome, score components and a reflection prompt. Teacher rubric evidence stays separate from deterministic market accuracy and actual course grading. Rankings require comparable horizon/sample size and should not imply expertise from one lucky forecast.

**Acceptance and adversarial tests.** Test replayed evaluation, manipulated confidence, copied forecasts, zero/near-zero reference prices, price adjustments, missing future ticks and evaluation-policy updates. Benchmark constant guessing and excessive high-confidence strategies before approving incentives.

**Exit gate.** A forecast result is reproducible, explainable and educational; rewards cannot be farmed through submission volume.

### CAP-09 — Certify market expansion and educational value

**Dependencies:** `CAP-04`, `CAP-05`, `CAP-06`, `CAP-08`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Run end-to-end multi-player and cross-currency scenarios covering all included products, order states, corporate-share custody, delayed payments and forecast evaluation. Stress the active-instrument budget rather than activate the entire definition library. Measure outstanding holds, cancellation latency, fill consistency, valuation coverage and speculative reward exploits. Distinguish model-based liquidity simulation from actual market matching.

**Player and Admin experience.** Observe beginners reviewing a limit order, reading a bond quote, distinguishing an index from a fund and learning from an inaccurate forecast. Admin completes halt, coupon-failure review and evaluation-void workflows. Preserve the familiar immediate trading experience.

**Acceptance and adversarial tests.** Require funds/custody conservation, one terminal effect per operation, no speculative grade linkage, no impossible fund backing, no stale fabricated valuation and no regression in Business common-share authority. Keep excluded complex instruments visibly absent.

**Exit gate.** Advanced products ship in separate certified slices; Analyst may ship early, while full track completion waits for every included lifecycle.

## Source basis

**R7 — Existing financial-market expansion authority.** Existing EXP-MKT program, proposed authority/registration rules and explicit exclusions. Reconcile live owner status rather than treating historical branch status as current. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/docs/markets/full-financial-markets-expansion-authority-v1.md`.

**R9 — Canonical FX authority scope.** Single currency/fixing authority, 08:00 game-local cadence, immutable provenance and pause rules. Historical PR labels are not current merge status. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/docs/roadmaps/canonical-fx-authority-scope-v1.md`.



---
