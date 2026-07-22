# Reward, Price, and Progression Calibration v1

Status: quantitative design baseline; staging calibration required
Owner domains: economy, Contracts, Attendance, Store, banking, progression
Scope: initial classroom economy and Meridian pilot

## Purpose

Define a reproducible method for calibrating player income, purchasing power, rewards, prices, savings, lending, and progression before any values are approved for production seeding.

The purpose is not to create a perfectly realistic national economy. It is to create an understandable classroom economy in which:

- frequent participation has visible value;
- high-effort work earns materially more than passive attendance;
- Store purchases require trade-offs;
- no normal player is permanently locked out;
- saving and investing compete with consumption;
- difficulty changes pacing without destroying fairness;
- currency conversion does not create free value;
- repeated rewards cannot inflate the economy without control.

## Unit of analysis

Calibration uses a standard simulation period.

One standard period represents one class meeting or one scheduled economic update, depending on the system.

All documents must declare whether a value is:

- per class period;
- per school day;
- per simulation week;
- per contract completion;
- one-time per story stage;
- recurring;
- annualized only for display.

No interest rate or income value is valid without a cadence.

## Candidate baseline income model

These values are candidate design anchors, not production-approved payouts.

### Attendance

- present and on time: 1.00 ECO-equivalent base value;
- late: 0.00 to 0.25 ECO-equivalent, configurable;
- absent: 0;
- no duplicate reward for the same attendance window;
- Attendance should represent no more than 25 percent of expected active-player income across a normal five-period week.

The intent is to reward reliability without making attendance more profitable than meaningful work.

### Contracts

Candidate ECO-equivalent reward bands:

| Contract class | Typical student effort | Candidate reward |
|---|---:|---:|
| Micro task | 3–7 minutes | 1–3 |
| Standard analysis | 10–20 minutes | 4–7 |
| Advanced analysis | 20–35 minutes | 8–12 |
| Major decision brief | 30–50 minutes | 12–18 |
| Multi-period project | 60–120 minutes | 20–35 |
| Team project | varies | individually allocated or shared; never multiply the full team reward by member count without design intent |

Rewards increase for demonstrated effort, evidence quality, complexity, and delayed completion risk. They do not increase merely because the narrative labels a task important.

### Meridian five-contract pilot

Candidate chain:

| Contract | Reward band |
|---|---:|
| Evaluate the Corridor | 4–6 |
| Analyze Country Exposure | 5–7 |
| Compare Financing and Governance | 6–9 |
| Respond to the First Disruption | 7–10 |
| Review the Outcome | 5–8 |

Candidate total: 27–40 ECO-equivalent across the complete chain.

Completion of the full chain should permit at least one meaningful strategic purchase while still requiring a choice between immediate consumption, saving, and market participation.

## Difficulty modifiers

Candidate income modifiers:

- accessible: 1.10;
- standard: 1.00;
- challenging: 0.90;
- expert: 0.80.

Difficulty should not silently change already-issued rewards. The effective reward is calculated and displayed at assignment or settlement according to the authoritative rule.

A lower income modifier should be paired with one or more of:

- lower Store affordability targets;
- slower inflation;
- lower fees;
- greater non-cash rewards;
- longer expiration windows.

Difficulty is not intended to make the same desired item impossible for one class.

## Store acquisition-time model

Store prices should be calibrated by the number of periods of typical active income required, not by arbitrary large numbers.

Assume a standard active player earns approximately 6–10 ECO-equivalent per period from attendance plus expected contract work, averaged across a week.

Candidate tiers:

| Tier | Target acquisition time | Candidate ECO-equivalent price | Intended examples |
|---|---:|---:|---|
| Immediate | less than 1 period | 2–5 | small cosmetic, minor convenience |
| Common | 1–2 periods | 6–15 | limited-use academic or gameplay benefit |
| Strategic | 3–5 periods | 18–40 | meaningful choice, stronger utility |
| Premium | 6–10 periods | 45–80 | high-value benefit or durable upgrade |
| Exceptional | 10–20 periods | 85–160 | rare class-level goal or long-term prestige |

A required classroom function must never be placed behind a Premium or Exceptional price.

## Price calibration rules

Every Store item must document:

- target player segment;
- expected acquisition time;
- utility duration;
- whether it is consumable, timed, or permanent;
- whether it competes with another item;
- purchase and ownership limits;
- country or global availability;
- authoring currency;
- expected converted-price range across countries;
- approval and fulfillment burden;
- abuse and hoarding risk.

Price increases are not a substitute for fixing an overpowered effect.

## Inflation and scarcity

The Store may apply bounded multipliers for:

- national inflation;
- location;
- scarcity;
- difficulty;
- event state.

Recommended combined-price guardrails for ordinary items:

- routine range: 0.85 to 1.25 times base price;
- stressed range: 0.70 to 1.50 times base price;
- emergency range beyond 1.50 requires explicit event copy, duration, and review;
- no zero or negative price;
- no hidden multiplier;
- quote records every applied component.

A player-facing quote should explain the largest active modifier.

## Currency conversion and affordability

Affordability is evaluated in ECO-equivalent terms only for analysis. Actual settlement uses the item's quoted currency path.

For each country and item:

`acquisition periods = converted player-currency price / expected player-currency income per period`

Acceptance target:

- country median acquisition time remains within 20 percent of the intended tier under normal conditions;
- no country exceeds 35 percent divergence without an explicit economic design reason;
- direct and inverse currency quotes reconcile within the currency rounding tolerance;
- conversion produces no profitable round-trip after fees and rounding.

## Cash sinks

A sustainable economy requires voluntary and predictable sinks.

Candidate sinks:

- Store purchases;
- market trading fees;
- loan interest and fees;
- business operating costs when implemented;
- optional event contributions;
- cosmetic customization;
- expiring strategic services.

Avoid punitive sinks that remove earned balances without player choice, except clearly disclosed fines tied to an established classroom policy.

## Non-cash rewards

Non-cash rewards reduce monetary inflation and create differentiated motivation.

Examples:

- achievement progress;
- reputation;
- early information access;
- cosmetic unlocks;
- limited analysis tools;
- contract-chain unlocks;
- title or badge;
- Store discount with an explicit cap;
- reduced transaction fee for a bounded duration.

Non-cash effects must still have abuse limits and expiration behavior.

## Savings calibration

Savings should provide visible but not dominant value.

Candidate simulation-week rates:

- basic savings: 0.25–0.50 percent per simulation week;
- term deposit: 0.75–1.25 percent per simulation week with lock period;
- promotional or event rate: up to 1.75 percent for a short declared duration.

These are gameplay rates, not representations of real annual banking rates. Player copy must label the simulation cadence and may show an annualized comparison only when mathematically correct and educationally useful.

Interest is calculated server-side, rounded once at settlement, and protected against duplicate accrual.

## Lending calibration

Candidate simulation-week borrowing costs:

- secured or development loan: 0.75–1.50 percent;
- standard player loan: 1.50–2.50 percent;
- emergency loan: 2.50–4.00 percent;
- late fee: bounded fixed amount or no more than 1.00 percent per missed cycle;
- no compounding penalty without explicit educational purpose and cap.

Loan payments should remain below 30 percent of expected standard active income unless the product is intentionally high risk.

A loan must disclose:

- currency;
- principal;
- cadence;
- total scheduled repayment;
- fees;
- consequences of missed payment;
- early repayment behavior;
- event sensitivity.

## Market allocation

The stock market should compete with Store spending and saving, not replace them.

Candidate first-access rule:

- provide a small ECO market balance or allow explicit local-to-ECO conversion;
- do not force a player to sacrifice all early Contract rewards to test the market;
- minimum order size should allow diversification across at least two low-priced templates during the introductory phase;
- trading fees should discourage rapid meaningless churn without blocking legitimate rebalancing.

Candidate fee range: 0.25–1.00 percent with a small minimum fee, subject to the existing market contract.

## Progression pacing

Candidate ten-level structure:

| Level | Expected active time | Purpose |
|---|---:|---|
| 1 | start | orientation |
| 2 | 2–3 periods | first completed actions |
| 3 | 1 week | basic economic literacy |
| 4 | 2 weeks | consistent participation |
| 5 | 3–4 weeks | strategic choice unlock |
| 6 | 5–6 weeks | advanced systems access |
| 7 | 7–8 weeks | cross-country competence |
| 8 | 9–11 weeks | complex decision mastery |
| 9 | 12–15 weeks | leadership and synthesis |
| 10 | semester-scale | capstone recognition |

Progression should derive from varied actions rather than raw currency wealth.

Recommended composition:

- 35 percent Contract and learning evidence;
- 20 percent consistency and attendance;
- 15 percent economic decision participation;
- 15 percent reflection and outcome review;
- 10 percent collaboration or civic contribution;
- 5 percent optional achievements.

Market profit must not dominate level progression.

## Wealth concentration controls

Monitor:

- median and top-decile balance;
- Gini coefficient or simpler percentile ratios;
- income by source;
- Store access by country;
- reward approval delays;
- market-return concentration;
- inactive-player recovery.

Candidate alerts:

- top 10 percent own more than 45 percent of liquid player currency under ordinary classroom conditions;
- median player cannot afford a Common item after two active periods;
- more than 20 percent of players hold less than one period of expected active income after the introductory week;
- one income source contributes more than 55 percent of all currency issuance;
- one country has more than 25 percent longer acquisition time than the global median without explicit design intent.

Alerts trigger review, not automatic confiscation.

## Inactive and late-joining players

The economy must include a recovery path.

Candidate mechanisms:

- onboarding grant equivalent to one standard period of income;
- catch-up Contracts with bounded rewards;
- introductory Store items that remain affordable;
- no retroactive Attendance reward;
- no grant large enough to exceed an active median player's balance;
- country assignment does not determine catch-up amount.

## Quantitative test scenarios

### Scenario A: Typical active player

- 90 percent attendance;
- completes 70 percent of available standard work;
- makes one Common and one Strategic purchase;
- saves 20 percent;
- performs limited market trading.

Pass criteria:

- can make both purchases within the intended periods;
- maintains a nonzero balance;
- does not reach Premium items immediately;
- progression remains near the target level timeline.

### Scenario B: High-performing player

- full attendance;
- completes all work at high quality;
- earns advanced rewards;
- invests actively but within limits.

Pass criteria:

- gains flexibility and earlier access;
- does not bypass all long-term goals in the first quarter of the simulation;
- market returns do not exceed earned income without meaningful risk.

### Scenario C: Low-participation player

- 60 percent attendance;
- completes 35 percent of work;
- joins one week late.

Pass criteria:

- can recover to Common-tier access within three active periods;
- is not trapped by loan costs;
- can progress through learning activity rather than currency purchase.

### Scenario D: Currency stress

- local currency weakens;
- imported Store item price rises;
- local Contract rewards remain fixed;
- one domestic alternative remains available.

Pass criteria:

- imported affordability changes visibly;
- no conversion error or free arbitrage;
- players retain at least one reasonable choice;
- effects reverse or stabilize through a declared recovery path.

### Scenario E: Inflation and scarcity overlap

- inflation and scarcity modifiers both rise;
- event lasts three periods.

Pass criteria:

- combined quote stays within declared emergency bounds;
- no required item becomes inaccessible;
- player copy identifies the principal causes;
- prices normalize through a new quote after recovery.

### Scenario F: Duplicate and retry pressure

- reward approval, interest accrual, and Store purchase requests are retried after ambiguous responses.

Pass criteria:

- exactly one ledger effect for each committed action;
- client refresh failure does not generate duplicate issuance;
- audit references reconcile.

## Simulation requirements

Before approval, run at least:

- 1,000 simulated players;
- all ten countries;
- four difficulty profiles;
- 20–40 periods;
- active, average, low-participation, and late-joiner cohorts;
- normal, inflation, currency, supply, and recession scenarios;
- direct and inverse conversion paths;
- Store purchase, saving, stock, and lending choices.

Required outputs:

- balance distribution by period;
- income and sink totals;
- item acquisition times;
- progression levels;
- country comparison;
- default rates;
- market participation;
- unresolved negative balances;
- duplicate transaction count;
- sensitivity to each major parameter.

## Approval thresholds

The initial pack may pass when:

- no ordinary scenario creates a negative balance without an explicit loan or fee;
- median Common and Strategic acquisition times meet target bands;
- late joiners have a viable recovery path;
- difficulty pacing remains explainable;
- country affordability divergence stays inside approved limits;
- no transaction produces duplicate effects;
- wealth concentration alerts are either below threshold or documented as intentional;
- the complete Meridian chain does not buy every Premium item immediately;
- at least three meaningful choices remain between consumption, saving, and investing.

## Current decision state

- authoring bands: approved as simulation inputs;
- exact rewards and prices: not production approved;
- Attendance values: retain current defaults until integrated simulation and product approval;
- banking rates: concept-only until backend support exists;
- progression thresholds: concept-only until authoritative progression model exists;
- staging simulation: required.