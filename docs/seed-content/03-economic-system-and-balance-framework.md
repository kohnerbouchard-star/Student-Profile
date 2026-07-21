# Economic System and Balance Framework

Status: draft foundation
Scope: seeded-content design, not runtime-engine implementation

## Purpose

Define the economic concepts, value bands, effect-size language, balancing relationships, and review tests required before final seeded prices, rewards, company values, interest rates, or event effects are approved.

This framework must remain compatible with the existing rule that world events and market behavior are game-session scoped.

## Design goals

The seeded economy should be:

- understandable to secondary students;
- internally coherent;
- responsive without becoming chaotic;
- differentiated by country;
- difficult to exploit through one dominant strategy;
- recoverable after negative events;
- capable of illustrating short-term and long-term trade-offs;
- stable enough that instructor intervention is optional rather than constantly required.

## Economic layers

### Layer 1: Structural canon

Slow-changing country characteristics:

- geography;
- natural resources;
- infrastructure model;
- education and research capacity;
- institutional credibility;
- industrial specialization;
- trade dependencies;
- political-economy constraints.

These should not move rapidly during ordinary gameplay.

### Layer 2: Session macro state

Mutable by game session:

- growth;
- inflation;
- unemployment;
- policy rate;
- confidence;
- trade balance;
- currency index;
- market index;
- infrastructure condition;
- resource availability;
- political or institutional stability where supported.

### Layer 3: Sector and company state

- sector demand;
- input costs;
- company revenue expectations;
- company risk;
- market sentiment;
- stock prices;
- commodity prices;
- company events.

### Layer 4: Player economy

- balances;
- income;
- contract rewards;
- store purchases;
- inventory;
- banking products;
- loans;
- holdings;
- realized and unrealized gains;
- progression rewards.

The layers should influence one another through explicit bridges. Content must not apply arbitrary player effects when the stated cause is a macroeconomic event unless the gameplay rule is defined.

## Core economic indicators

Each indicator requires a player-facing definition, operating range, neutral range, warning range, event sensitivity, and UI formatting rule.

### GDP growth

Meaning: direction and pace of economic output.

Use:

- country summaries;
- business-cycle regime;
- company revenue expectations;
- employment and confidence events.

Content rule: growth changes should be gradual unless a major crisis or recovery event is active.

### Inflation

Meaning: rate at which general prices rise.

Use:

- store price pressure;
- wage and reward discussions;
- interest-rate decisions;
- currency and consumer-confidence events.

Content rule: do not describe a one-product shortage as general inflation unless the effect broadens.

### Unemployment

Meaning: share of available workers unable to find work.

Use:

- public-policy events;
- employment contracts;
- confidence;
- social pressure;
- country storylines.

Content rule: a company layoff should have a local or sector effect before it becomes a national unemployment shock.

### Policy interest rate

Meaning: benchmark rate influencing borrowing, saving, investment, and asset valuation.

Use:

- bank products;
- loan pricing;
- growth-stock sensitivity;
- currency confidence;
- inflation response.

Content rule: rates should not be changed solely to make a story dramatic. A decision requires an inflation, growth, currency, or stability rationale.

### Trade balance

Meaning: difference between exports and imports over a period.

Use:

- currency pressure;
- country dependency;
- trade policy;
- commodity and logistics events.

### Consumer confidence

Meaning: household willingness to spend and expectations about the economy.

Use:

- retail, tourism, housing, and premium-service demand;
- recession and recovery signals.

### Business confidence

Meaning: willingness of firms to hire, invest, and expand.

Use:

- capital expenditure;
- company outlook;
- employment;
- contract creation.

### Currency index

Meaning: normalized relative value used by the simulation, not necessarily a real-world foreign-exchange quotation.

Use:

- conversion;
- import and export effects;
- country purchasing power;
- event explanations.

Content rule: the index methodology and conversion direction must be documented in the technical mapping before monetary values are seeded.

### National market index

Meaning: aggregate signal for listed companies associated with a country.

Use:

- player dashboard;
- news;
- event impact summaries;
- broad market conditions.

## Effect-size scale

Narrative writers and content designers should specify effects using a controlled semantic scale before final numeric mapping.

- `trace`: visible only in detailed analysis; no major player action required.
- `minor`: small directional effect; supports explanation but should not dominate behavior.
- `moderate`: material effect that changes decisions or rankings.
- `major`: strong effect across multiple records or periods; requires clear narrative support.
- `severe`: crisis-level effect with explicit safeguards and recovery path.
- `systemic`: affects multiple countries or core infrastructure; requires release approval and scenario restrictions.

A later implementation map should assign numeric bands to each supported indicator and runtime mechanism.

## Change-rate principle

Normal events should not repeatedly compound large changes.

Default design guidance:

- use small future-facing adjustments;
- favor several linked moderate changes over one opaque extreme jump;
- cap cumulative effects per period;
- use decay and recovery;
- distinguish temporary shock from permanent structural change;
- make severe effects uncommon and scenario-gated.

## Country differentiation model

Each country should have:

- three primary strengths;
- two secondary strengths;
- three material vulnerabilities;
- two external dependencies;
- two policy trade-offs;
- one stabilizing mechanism;
- one crisis amplification mechanism.

No country should be superior across growth, stability, resources, technology, finance, and trade simultaneously.

## Reward economy

The reward system must be balanced as one economy.

Sources:

- attendance, if enabled;
- contracts;
- recurring assignments;
- achievements;
- progression milestones;
- event participation;
- instructor adjustments where authorized.

Sinks:

- store purchases;
- fees;
- optional banking or market costs;
- redemptions where priced;
- future business or crafting systems when implemented.

### Reward design rules

- Onboarding rewards must allow at least one meaningful early action.
- Routine rewards must not trivialize high-value items.
- Major rewards require higher effort, delay, approval, or risk.
- Group and individual rewards must not create uncontrolled duplication.
- A failed or expired contract must have a defined reward outcome.
- Reward currency must be explicit.
- Difficulty and income modifiers must be visible policy, not hidden multiplication.
- Conversion into country currency must use one authoritative rule.

## Price architecture

Before final prices are seeded, define price bands relative to normal player income.

Suggested conceptual bands:

- micro purchase: less than one routine earning cycle;
- small purchase: approximately one routine earning cycle;
- medium purchase: several routine cycles or one substantial contract;
- major purchase: sustained saving or multiple substantial contracts;
- prestige purchase: long-term goal, limited availability, or high progression requirement.

Each item should document:

- target acquisition time;
- intended scarcity;
- substitute items;
- effect power;
- repeat-purchase risk;
- classroom cost or burden if physically fulfilled.

## Banking framework

Banking products should teach liquidity, time value, credit risk, and repayment.

Required product dimensions:

- account or loan type;
- eligibility;
- principal limits;
- interest rate;
- term;
- compounding or accrual cadence;
- fees;
- repayment cadence;
- early repayment;
- delinquency;
- default;
- instructor override;
- country or scenario availability.

Balance rules:

- savings should reward patience without becoming the dominant income source;
- borrowing should enable useful choices but create real repayment trade-offs;
- emergency loans should solve liquidity problems at a cost;
- rates should respond coherently to policy and risk where dynamic behavior is supported;
- no product should create infinite positive carry through a second seeded product.

## Company valuation integrity

Every seeded company should satisfy arithmetic and narrative checks:

- market capitalization equals share price times shares outstanding;
- profitability and valuation are directionally plausible;
- debt risk matches interest sensitivity;
- dividend policy matches cash generation and growth profile;
- volatility matches sector, country, size, and story exposure;
- company events affect documented drivers;
- no guaranteed-return language appears in player-facing copy.

## Commodity integrity

Each commodity needs:

- unit;
- reference price concept;
- producers;
- consumers;
- substitutes;
- storage characteristics;
- transport sensitivity;
- event drivers;
- country exposure;
- price floor and ceiling policy if used by the runtime model.

## Event economics checklist

Every mechanical event must answer:

1. What changed in the real economy?
2. Which indicator, sector, company, commodity, or player system responds?
3. Why is the direction correct?
4. What is the effect-size class?
5. How long does it last?
6. Does it decay, reverse, or require a follow-up event?
7. Which countries benefit?
8. Which countries bear costs?
9. Can repeated activation create runaway compounding?
10. Is there a recovery path?

## Anti-exploit review

Review all seeded systems for:

- reward loops;
- buy-sell arbitrage caused by inconsistent conversion;
- guaranteed stock-profit sequences;
- loan-and-deposit positive carry;
- repeatable contract duplication;
- stacked item effects;
- inventory reservation bypass;
- country-assignment advantage;
- event knowledge that guarantees a trade without uncertainty;
- Admin actions that issue rewards twice.

## Balance acceptance criteria

A content pack cannot advance to staging until:

- all numeric values have units and currencies;
- value relationships are documented;
- company arithmetic passes;
- no obvious infinite loop exists;
- country starting positions meet viability thresholds;
- severe events have scenario restrictions and recovery;
- reward and price acquisition times are measured;
- loan affordability is tested;
- event effects remain inside approved bounds;
- the economic reviewer records unresolved assumptions.