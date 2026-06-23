# Stock Market Simulation Models Research v1

## Executive Summary

Eco Novaria should not start with a full trading exchange, limit order book, portfolio accounting system, or agent-based marketplace. The first build should be a pure, deterministic stock market calculation engine that produces game-session-scoped market rows, price ticks, generated chart history, volatility state, volume, and student-facing movement explanations.

The recommended V1 model is a hybrid classroom market model:

- factor-based returns for world, country, sector, and company fundamentals;
- log-return price movement so prices stay positive;
- deterministic seeded noise so the same input and seed always produce the same output;
- teacher/admin controlled regimes such as bull market, bear market, crisis, recovery, sideways market, and sector rotation;
- volatility memory inspired by GARCH and stochastic volatility, but simplified for explainability;
- event/news jumps inspired by jump diffusion, but represented as explicit classroom events;
- liquidity damping, beta amplification, volume response, momentum, and mean reversion;
- movement explanation breakdowns suitable for students and teachers.

The first implementation should be V1: a pure TypeScript calculation engine with no database writes, no routes, no frontend changes, no order execution, no portfolio accounting, and no migrations. It should accept a complete `StockMarketEngineInput`, return `StockMarketEngineResult`, and be unit tested for determinism, price positivity, event directionality, volatility memory, and game-session isolation.

The critical architecture rule is that every runtime market object must be scoped to exactly one `gameSessionId`. Global templates can exist for stock archetypes, sector definitions, country exposure templates, and reusable presets, but runtime market state such as stock assets, price ticks, events, regimes, holdings, orders, fills, and future execution must include `game_session_id` and must never bleed between games.

## Current Repository Evidence

Repository inspected: `kohnerbouchard-star/Student-Profile` on `main`.

Evidence files inspected:

- [`frontend/src/features/trading/trading.js`](https://github.com/kohnerbouchard-star/Student-Profile/blob/main/frontend/src/features/trading/trading.js)
- [`frontend/src/features/market/market-data-refresh.js`](https://github.com/kohnerbouchard-star/Student-Profile/blob/main/frontend/src/features/market/market-data-refresh.js)
- [`frontend/src/core/snapshot.js`](https://github.com/kohnerbouchard-star/Student-Profile/blob/main/frontend/src/core/snapshot.js)
- [`backend/supabase/functions/stock-market-runner/README.md`](https://github.com/kohnerbouchard-star/Student-Profile/blob/main/backend/supabase/functions/stock-market-runner/README.md)
- [`docs/plans/advanced-student-mutation-systems-v1.md`](https://github.com/kohnerbouchard-star/Student-Profile/blob/main/docs/plans/advanced-student-mutation-systems-v1.md)
- [`docs/audits/student-mutation-schema-readiness-v1.md`](https://github.com/kohnerbouchard-star/Student-Profile/blob/main/docs/audits/student-mutation-schema-readiness-v1.md)
- [`backend/supabase/functions/classroom-api/index.ts`](https://github.com/kohnerbouchard-star/Student-Profile/blob/main/backend/supabase/functions/classroom-api/index.ts)
- [`backend/src/supabase/tableTypes.ts`](https://github.com/kohnerbouchard-star/Student-Profile/blob/main/backend/src/supabase/tableTypes.ts)
- [`backend/supabase/migrations/20260621004500_create_country_profiles_v1.sql`](https://github.com/kohnerbouchard-star/Student-Profile/blob/main/backend/supabase/migrations/20260621004500_create_country_profiles_v1.sql)
- [`backend/src/domains/countries/contracts/countryProfileContracts.ts`](https://github.com/kohnerbouchard-star/Student-Profile/blob/main/backend/src/domains/countries/contracts/countryProfileContracts.ts)

Confirmed current state:

1. The frontend trading UI currently submits legacy `STOCK_TRADE`. `submitTrade()` validates `action`, `ticker`, and `shares`, then calls `submitAction("STOCK_TRADE", { action, ticker, shares })`. This is an immediate legacy action path, not a modeled order lifecycle.

2. The market UI expects rows compatible with `ticker`, `companyName`, `sector`, `currentPrice`, `changePct`, `previousClose`, `openPrice`, `dayHigh`, `dayLow`, `volume`, `marketCap`, `beta`, `history`, and `lastUpdated`. `market-data-refresh.js` normalizes those fields and renders current price, change, day range, volume, market cap, chart history, and company notes.

3. `frontend/src/core/snapshot.js` normalizes market snapshots from keys such as `market`, `stocks`, `stockMarket`, and `marketRows`, and portfolio snapshots from `portfolio`, `holdings`, `positions`, and `stockPortfolio`. This supports display state, but does not provide authoritative stock runtime storage.

4. The stock-market-runner folder is currently only a placeholder. Its README says it is a future Supabase Edge Function for scheduled stock update jobs and that the folder is a structure placeholder only. It explicitly says not to add stock calculations, request handlers, or schema changes in that checkpoint.

5. `classroom-api/index.ts` currently includes player store quote and purchase routes, player ledger/me/login routes, staff routes, licensing, game settings, attendance, roster, and ledger routes. It does not expose stock-market routes, stock order routes, stock price tick routes, portfolio routes, or stock execution routes.

6. `backend/src/supabase/tableTypes.ts` currently includes core session/settings types, mutation idempotency, store purchase quotes, store purchases, inventory holdings, and inventory events. It does not define `stock_assets`, `game_session_stock_assets`, `stock_price_ticks`, `stock_market_events`, `stock_market_regimes`, `stock_orders`, `stock_fills`, `stock_trades`, `player_portfolio_holdings`, or stock reservation tables.

7. Repository code search for stock runtime schema terms such as `stock_assets`, `stock_price_ticks`, `stock_orders`, `stock_fills`, `stock_trades`, `player_portfolio_holdings`, and stock reservations returned no matching code files. The older schema readiness audit also identifies stock assets, stock price ticks, stock orders, fills/trades, portfolio holdings, and reservations as missing. The newer store/inventory foundations do not change the stock-market conclusion.

8. The country profile migration provides useful world-state foundations for the future stock engine: global `country_profiles`, per-game difficulty settings, per-game country economic baselines, per-game `country_economic_snapshots`, per-game `country_event_impacts`, and per-game player country assignment history. These are game-session-scoped where they represent runtime state.

9. The repo-backed Eco Novaria countries are `NORTHREACH`, `YRETHIA`, `THALORIS`, `SOLVEND`, `ELDORAN`, `VALERION`, `LUMENOR`, `XALVORIA`, `DRAVENLOK`, and `SYNDALIS`. The first six have planning context supplied in this task. The last four are present in repository country profiles, but no inspected source gives sector-exposure lore for them yet.

Conclusion: the first stock-market implementation should not be order execution. The repository has frontend display expectations and country-economic context, but it does not yet have the full game-session-scoped stock runtime schema required for authoritative assets, ticks, orders, fills, holdings, reservations, or execution. The safest first build is a pure calculation engine.

## Research Method

Web research was available and source verification was performed on 2026-06-23. No "Sources to Verify Later" section is needed for this version.

Primary and supporting sources used:

- Geometric Brownian Motion and Monte Carlo simulation: [Investopedia, Monte Carlo Simulation with Geometric Brownian Motion](https://www.investopedia.com/articles/07/montecarlo.asp), [Investopedia, Black-Scholes Model](https://www.investopedia.com/terms/b/blackscholes.asp)
- Factor models: [Kenneth R. French Data Library, Description of Fama/French Factors](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library/f-f_factors.html), [Kenneth R. French Data Library](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html)
- GARCH: [Tim Bollerslev, Generalized Autoregressive Conditional Heteroskedasticity](https://doi.org/10.1016/0304-4076(86)90063-1)
- Heston stochastic volatility: [Steven L. Heston, A Closed-Form Solution for Options with Stochastic Volatility](https://doi.org/10.1093/rfs/6.2.327)
- Jump diffusion: [Robert C. Merton, Option Pricing When Underlying Stock Returns are Discontinuous](https://doi.org/10.1016/0304-405X(76)90022-2)
- Regime switching: [James D. Hamilton, A New Approach to the Economic Analysis of Nonstationary Time Series and the Business Cycle](https://doi.org/10.2307/1912559), [statsmodels Markov switching examples](https://www.statsmodels.org/stable/examples/notebooks/generated/markov_regression.html)
- Agent-based and discrete-event market simulation: [ABIDES paper](https://arxiv.org/abs/1904.12066), [ABIDES repository](https://github.com/abides-sim/abides), [Raberto et al., Agent-based simulation of a financial market](https://arxiv.org/abs/cond-mat/0103600)
- Educational stock-market simulation: [The Stock Market Game](https://www.stockmarketgame.org/), [Investopedia Simulator guide](https://www.investopedia.com/how-to-use-the-investopedia-simulator-5221184)
- Macro-economic agent simulation context: [Agent-based computational economics overview](https://en.wikipedia.org/wiki/Agent-based_computational_economics), [Agent-based macroeconomic model example](https://arxiv.org/abs/2205.00752)

The recommendation below uses those model families as inspiration, but deliberately simplifies them for a classroom simulator that must be deterministic, explainable, controllable, and safe.

## Model Family Comparison

| Model family | Captures well | Fails or struggles with | Complexity | Eco Novaria V1 fit | Recommendation |
| --- | --- | --- | --- | --- | --- |
| GBM and Monte Carlo | Positive prices, proportional returns, simple random price paths, risk distributions | Constant volatility assumption, no explicit jumps, weak explanations unless factors are added | Low | Strong as a price update primitive | Use simplified log-return/exponential price movement, not full Monte Carlo path simulation for runtime |
| Factor models | Market, sector, country, style, beta, fundamentals, explainable drivers | Nonlinear feedback, order flow, intraday microstructure | Low to medium | Excellent | Use directly as the backbone, with classroom-specific factors |
| GARCH / volatility clustering | Volatility memory, calm and turbulent periods, shock persistence | Requires historical calibration, can be opaque to students | Medium | Good if simplified | Simplify into currentVolatility decaying toward longRunVolatility |
| Heston / stochastic volatility | Mean-reverting stochastic variance, volatility-price correlation, richer option-style dynamics | Too complex, calibration heavy, derivative-pricing focused | High | Inspiration only | Defer full model; borrow mean-reverting volatility idea |
| Jump diffusion and SVJ | News shocks, discontinuous moves, heavy tails, event risk | Calibration, compound complexity with stochastic volatility | Medium to high | Strong if events are explicit | Use simplified teacher/admin news shock objects with decay |
| Regime switching | Bull/bear/crisis/recovery behavior, teacher control, explainable macro modes | Hidden Markov estimation is unnecessary for V1 | Medium | Excellent | Use explicit admin-selected regimes now; later add inferred regimes if useful |
| Agent-based market simulation | Emergent behavior, herding, heterogeneous traders, feedback loops | Hard to control, expensive to test, harder to explain and isolate | High | Poor for V1 | Defer; borrow only high-level concepts such as sentiment and liquidity |
| Limit order book / discrete-event exchange | Bid/ask, matching, partial fills, slippage, execution realism | Requires order lifecycle, concurrency, portfolio accounting, reservations | Very high | Poor for V1 | Defer until V5+ order execution; not part of calculation engine V1 |
| Macro-economic agent simulation | Whole-economy feedback, heterogeneous households/firms, policy experiments | Too broad, many parameters, difficult validation | Very high | Poor for V1 | Defer; use current country economic snapshots as factor inputs |
| Educational/business simulators | Classroom engagement, virtual portfolios, leaderboards, simple orders | Often rely on real market data; not world-simulation-native | Low to medium | Useful product inspiration | Use principles: risk-free, explainable, competition-safe, teacher-controlled |

## Model Family Notes

### 1. Geometric Brownian Motion and Monte Carlo Simulation

What it is: GBM models prices as a stochastic process where log returns follow a Brownian motion with drift and volatility. In discrete form, a simplified update is usually expressed as `nextPrice = currentPrice * exp(return)`. Monte Carlo simulation repeats random trials to produce many possible paths or outcome distributions. Investopedia describes Monte Carlo with GBM as using drift, volatility, and random shocks to model possible stock-price behavior.

What it captures: GBM is useful for positive prices, proportional movement, compounding, and simple stochastic paths. A 2% move means something comparable whether the stock is priced at 10 or 100. This matches how the current frontend thinks about `currentPrice`, `changePct`, and history.

What it fails to capture: Basic GBM assumes constant volatility and continuous paths. Real markets have volatility clustering, regime changes, news jumps, liquidity effects, and sector/country-specific drivers. GBM alone is too random and not explainable enough for Eco Novaria.

Implementation complexity: Low for a single-step log-return update. Medium if full path Monte Carlo distributions are added.

V1 suitability: High as a price movement primitive, low as the entire model.

Use directly, simplify, or defer: Use a simplified log-return update directly. Defer full Monte Carlo path simulation unless teachers later want scenario forecasting or risk ranges.

Classroom/game value: Keeps prices positive, makes percentage movements intuitive, and provides a clean mathematical foundation students can understand.

### 2. Factor Models

What it is: Factor models explain returns using a small set of drivers. CAPM uses market beta. Fama/French adds size and value factors; the Kenneth French Data Library documents market excess return, SMB, HML, five-factor data, momentum, and reversal factor files. Eco Novaria does not need real Fama/French factor calibration, but the family is ideal for decomposing price movement into understandable causes.

What it captures: Market-wide pressure, country pressure, sector pressure, company exposures, beta sensitivity, fundamentals, and clear explanation. It also maps naturally to the existing Eco Novaria world-state hierarchy.

What it fails to capture: Factor models do not naturally simulate exchange mechanics, order flow, bid/ask spreads, or emergent herding unless those are added as factors.

Implementation complexity: Low to medium. The complexity comes from defining bounded factors and exposure weights, not from the math.

V1 suitability: Excellent.

Use directly, simplify, or defer: Use directly as the V1 backbone, but with game-specific factors: world, macro, country, sector, company fundamentals, shocks, regime, volatility, liquidity, momentum, and mean reversion.

Classroom/game value: Best fit for explainability. Students can see that a stock moved because of country sanctions, sector weakness, high debt during rate hikes, or a contract win.

### 3. GARCH and Volatility Clustering Models

What it is: GARCH extends ARCH by letting current variance depend on previous shocks and previous conditional variance. Bollerslev's 1986 paper proposes a generalized model where past conditional variances enter the current variance equation.

What it captures: Markets have calm periods and turbulent periods. Large moves often cluster near other large moves. Volatility can stay elevated after a shock instead of instantly returning to normal.

What it fails to capture: GARCH does not explain why shocks happen. It is statistical, calibration-oriented, and not ideal as student-facing gameplay logic by itself.

Implementation complexity: Medium for real estimation, low for a simplified memory state.

V1 suitability: Good if simplified.

Use directly, simplify, or defer: Do not implement full GARCH estimation. Use a simple deterministic volatility memory: `currentVolatility` rises after shocks and decays toward `longRunVolatility`.

Classroom/game value: Makes crises and news feel persistent without making the engine opaque.

### 4. Heston and Stochastic Volatility Models

What it is: Heston models asset price and variance as linked stochastic processes. Heston's 1993 paper introduced a closed-form option pricing approach with stochastic volatility and correlation between spot returns and volatility.

What it captures: Volatility is not constant. It can mean-revert and interact with price movement. It can help explain skew and volatility smiles in derivative markets.

What it fails to capture: Heston is primarily an option-pricing model and is too advanced for an initial classroom stock tick engine. It needs parameters like variance reversion speed, long-run variance, volatility of volatility, and correlation.

Implementation complexity: High.

V1 suitability: Low as a direct model, useful as inspiration.

Use directly, simplify, or defer: Defer full Heston. Borrow the idea that volatility is a state variable that mean-reverts.

Classroom/game value: Provides a rationale for volatility state, but not a classroom-facing formula.

### 5. Jump Diffusion and Stochastic-Volatility-Jump Models

What it is: Merton's jump diffusion adds discontinuous jumps to otherwise continuous price dynamics. Stochastic-volatility-jump models combine time-varying volatility with jump events.

What it captures: News shocks, sanctions, contract wins, supply-chain disruption, export restrictions, and crisis events can move prices abruptly. This is central to a geopolitical classroom game.

What it fails to capture: Real jump arrival and size calibration can be complex. Pure random jumps are not teacher-controllable and could feel arbitrary.

Implementation complexity: Medium for explicit events; high for full stochastic jump calibration.

V1 suitability: Excellent if simplified as authored events.

Use directly, simplify, or defer: Use simplified explicit event/news shock objects with scope, magnitude, confidence, decay, volatility impact, volume impact, headline, and explanation.

Classroom/game value: Lets teachers create meaningful cause-and-effect market moments.

### 6. Regime-Switching Models

What it is: Regime-switching models represent different states such as expansion/recession or low/high rate periods. Hamilton's 1989 work is a landmark Markov-switching approach. The statsmodels examples show switching intercepts, transition probabilities, and switching variances.

What it captures: Markets behave differently in bull, bear, sideways, crisis, recovery, and sector-rotation periods. The same news can have larger effects in a crisis than in a calm market.

What it fails to capture: Hidden Markov inference is unnecessary for V1 and can make teacher control harder.

Implementation complexity: Medium if inferred statistically, low if regimes are explicit settings.

V1 suitability: Excellent if teacher/admin controlled.

Use directly, simplify, or defer: Use explicit regime input now. Defer inferred Markov transitions until there is enough game history and a clear product need.

Classroom/game value: Teachers can stage lessons around market cycles and discuss how the same company behaves differently under different macro conditions.

### 7. Agent-Based Market Simulation

What it is: Agent-based market simulation creates many heterogeneous agents with strategies, cash, holdings, and interactions. ABIDES supports large numbers of agents interacting with an exchange agent, network latency, and discrete-event messaging. Raberto et al. show that agent-based artificial financial markets can reproduce heavy-tailed log returns and volatility clustering.

What it captures: Herding, strategic behavior, feedback loops, market impact, and emergent dynamics.

What it fails to capture for V1: Control and explainability. A full agent market can produce surprising outcomes that are hard for teachers to predict or explain. It also introduces many parameters and heavy testing needs.

Implementation complexity: High.

V1 suitability: Poor.

Use directly, simplify, or defer: Defer full agent-based simulation. Borrow only light concepts such as sentiment, liquidity, momentum, and mean reversion.

Classroom/game value: High in a future advanced mode, but too costly for the first stock calculation engine.

### 8. Limit Order Book and Discrete-Event Exchange Simulation

What it is: A limit order book maintains bids, asks, order priority, partial fills, cancellations, and last trade prices. ABIDES models an exchange agent and order book that can accept, match, partially execute, and cancel orders.

What it captures: Trading execution mechanics, slippage, bid/ask depth, order matching, partial fills, and latency.

What it fails to capture for V1: It does not produce a simple classroom market by itself. It requires orders, holdings, cash/share reservations, account balances, execution rules, concurrency safety, and audit trails.

Implementation complexity: Very high.

V1 suitability: Poor.

Use directly, simplify, or defer: Defer until the product intentionally reaches order execution and advanced order types. Do not build this in the calculation engine.

Classroom/game value: Useful later for explaining order types and market mechanics, but it is not needed to make prices move.

### 9. Macro-Economic Agent Simulation Models

What it is: Macro ABMs model whole economies with heterogeneous households, firms, banks, government, central banks, and markets. Agent-based computational economics replaces representative-agent equilibrium assumptions with interacting boundedly rational agents.

What it captures: Economy-wide policy effects, heterogeneous behavior, feedback between labor, credit, production, prices, and trade.

What it fails to capture for V1: It is much broader than a stock tick engine. It requires many assumptions and parameters, and validation would be hard in a classroom game.

Implementation complexity: Very high.

V1 suitability: Poor as a direct implementation.

Use directly, simplify, or defer: Defer. Use the repo's existing country-economic snapshot fields as macro inputs instead.

Classroom/game value: Future potential for deeper economy simulation, but V1 should remain a stock-market calculation layer consuming world state.

### 10. Educational and Business Simulation Market Models

What it is: Educational simulators provide virtual portfolios, simulated trading, research tools, games, and leaderboards. The Stock Market Game uses virtual investing and real-world learning for students. Investopedia's simulator provides a risk-free environment, virtual balances, portfolio tracking, simulated orders, research, and games.

What it captures: Engagement, practice, comparison, budgeting, financial vocabulary, and safe experimentation.

What it fails to capture for Eco Novaria: Most educational simulators depend on real-world market data or generic securities. Eco Novaria needs a fictional deterministic world economy with teacher control.

Implementation complexity: Low to medium for product concepts; high if connected to real data and compliance concerns.

V1 suitability: Strong product inspiration, not a direct model.

Use directly, simplify, or defer: Use principles, not implementation: risk-free classroom framing, transparent rules, teacher controls, virtual portfolios, and no real investment advice.

Classroom/game value: Helps keep the feature educational rather than speculative.

## Recommended Eco Novaria Market Model

The recommended V1 engine should follow this hierarchy:

World state -> macro conditions -> country conditions -> sector conditions -> company fundamentals -> news/events -> volatility/liquidity -> price movement -> explanation

The engine should be pure and deterministic. It should not read from or write to the database. It should not know about routes, UI, login, licensing, portfolio holdings, order execution, or real-world financial APIs. Its only job is to transform a complete input object into market rows, price ticks, updated volatility state, chart history, and explanations.

Conceptual return formula:

```ts
stockReturn =
  marketFactor
  * countryFactor
  * sectorFactor
  * companyFundamentalFactor
  * regimeAdjustment
  * newsJump
  * volatilityNoise
  * momentumOrMeanReversion;

nextPrice = currentPrice * Math.exp(stockReturn);
```

Operational V1 recommendation: represent each factor as a bounded signed log-return contribution or multiplier, then combine them in an explainable way. The conceptual formula above is useful for product thinking, but additive log-return components are easier to explain and safer to clamp:

```ts
rawLogReturn =
  marketFactorPct
  + countryFactorPct
  + sectorFactorPct
  + fundamentalsFactorPct
  + regimeFactorPct
  + shockFactorPct
  + volatilityNoisePct
  + momentumFactorPct
  + meanReversionFactorPct;

boundedLogReturn = clamp(rawLogReturn, -settings.maxTickMovePct, settings.maxTickMovePct);
nextPrice = currentPrice * Math.exp(boundedLogReturn);
```

Log-return/exponential price movement is preferable to simple additive price changes because it keeps prices positive and makes movement proportional to the current price. An additive model can push a low-priced stock below zero with a large negative shock. A log-return model makes a negative return shrink the price multiplicatively without crossing zero.

Recommended calculation flow:

1. Validate that the top-level `gameSessionId` is present and that every runtime input either carries the same `gameSessionId` or is explicitly global/reference data resolved before input construction.
2. Sort assets by stable key so output order is deterministic.
3. Build a deterministic random source from `gameSessionId`, `seed`, `tickIndex`, and `ticker`.
4. Resolve regime defaults: drift, volatility multiplier, news sensitivity, and volume multiplier.
5. Compute macro market factor from GDP growth, inflation, interest rates, confidence, political stability, market risk, and difficulty/event volatility settings.
6. Compute country factor from the asset's country exposures and the matching country input.
7. Compute sector factor from sector conditions and asset sector weights.
8. Compute fundamentals factor from revenue growth, profit margin, debt, cash reserves, innovation, supply-chain risk, political exposure, commodity exposure, liquidity, beta, and volatility.
9. Apply scoped shocks: global, country, sector, and ticker. Apply confidence and decay.
10. Update `currentVolatility` based on long-run volatility, prior current volatility, shock impact, regime multiplier, and liquidity damping.
11. Compute bounded seeded volatility noise.
12. Add momentum and mean reversion from recent chart/history relative to an anchor/fair value.
13. Calculate `nextPrice = currentPrice * exp(boundedLogReturn)` and enforce a minimum display price such as 0.01.
14. Derive previous close, open, high, low, volume, market cap, beta, history, last updated, and explanation.
15. Return rows compatible with the existing market normalizer.

### Market Regimes

| Regime | Expected drift | Volatility multiplier | News sensitivity | Volume multiplier | Student-facing interpretation | Teacher/admin control value |
| --- | --- | --- | --- | --- | --- | --- |
| Bull market | Positive broad drift | 0.8 to 1.1 | Normal to slightly positive | 1.1 | Investors are optimistic and strong companies rise more easily | Useful for growth lessons and confidence effects |
| Bear market | Negative broad drift | 1.1 to 1.5 | Negative news stronger | 1.2 | Market confidence is weak and risky stocks sell off | Useful for risk management and diversification lessons |
| Sideways market | Near zero drift | 0.7 to 1.0 | Normal | 0.8 | The market is waiting for clearer signals | Useful for teaching stock-specific and sector-specific drivers |
| Crisis | Strong negative drift | 1.8 to 3.0 | High sensitivity to all shocks | 1.8 to 2.5 | Uncertainty is high, volatility rises, and liquidity matters | Lets teachers stage controlled stress events |
| Recovery | Positive drift after prior stress | 1.1 to 1.6, decaying | Positive news stronger | 1.3 | Markets are stabilizing but still volatile | Useful for discussing resilience and policy response |
| Sector rotation | Market drift near neutral; selected sectors positive/negative | 1.0 to 1.4 | Sector news amplified | 1.2 | Capital moves from one sector to another | Lets teachers focus lessons on sectors and country exposures |

### Volatility Model

V1 should use simple volatility memory:

- Each game-session stock has `currentVolatility`.
- Each game-session stock has `longRunVolatility`.
- Shocks increase `currentVolatility`.
- Crisis and bear regimes increase volatility.
- Recovery lets volatility stay elevated but decay.
- `currentVolatility` decays back toward `longRunVolatility` over time.
- High liquidity dampens extreme movement.
- Low liquidity amplifies movement and volume spikes.
- High beta amplifies market-factor movement.
- Volatility affects volume.
- Volatility state must be scoped by `gameSessionId`.

Example simplified update:

```ts
shockVolatilityBoost = sum(activeShocks.map((shock) => shock.volatilityImpact * shock.decayedWeight));
liquidityDamping = clamp(1 - asset.liquidity * 0.35, 0.45, 1.15);
reversion = (asset.longRunVolatility - asset.currentVolatility) * settings.volatilityMeanReversionRate;
nextVolatility = clamp(
  asset.currentVolatility + reversion + shockVolatilityBoost,
  settings.minVolatility,
  settings.maxVolatility,
) * regime.volatilityMultiplier * liquidityDamping;
```

### Event/News Shock Model

Reusable event object:

```ts
interface StockMarketShockInput {
  gameSessionId: string;
  shockId: string;
  scope: "global" | "country" | "sector" | "ticker";
  targetKey: string;
  magnitude: number;
  decay: number;
  confidence: number;
  volatilityImpact: number;
  volumeImpact: number;
  headline: string;
  explanation: string;
  createdTick: number;
  expiresTick?: number;
}
```

Interpretation:

- `magnitude` is a signed log-return influence before exposure, confidence, decay, and sensitivity.
- `decay` controls how quickly the event fades.
- `confidence` lets uncertain rumors affect markets less than confirmed events.
- `volatilityImpact` raises volatility memory.
- `volumeImpact` increases trading activity.
- `scope` and `targetKey` keep the shock explainable and bounded.

Example events:

- Global rate hike: negative for high-debt and growth/technology companies; positive or mixed for finance/insurance.
- Country-specific sanctions: negative for the targeted country's export-heavy sectors and high political-exposure companies.
- Sector supply-chain disruption: negative for technology, AI/aerospace, consumer goods, and high supply-chain-risk companies.
- Ticker-specific contract win: positive for the target ticker, with volume and volatility increase.
- Energy price spike: positive for energy producers, negative for energy-intensive shipping/logistics and consumer goods.
- Logistics disruption: negative for shipping/logistics, repair/salvage/re-export trade, and import-dependent sectors.
- Political stability improvement: positive for country assets, finance, infrastructure, and consumer confidence-sensitive sectors.
- Rare mineral export restriction: positive for holders of existing rare mineral inventory, negative for import-dependent technology and AI/aerospace manufacturers.
- AI infrastructure breakthrough: positive for AI/aerospace, technology, clean energy infrastructure, and high-innovation firms.

### Company Fundamentals

V1 company fundamentals should be simple, tunable values, not financial statements:

- `revenueGrowth`: positive pressure when macro and sector conditions support demand.
- `profitMargin`: positive pressure and lower downside risk.
- `debtLevel`: negative pressure when interest rates rise; higher downside in crisis.
- `cashReserves`: reduces downside in crisis and bear regimes.
- `innovationScore`: helps in technology, AI/aerospace, clean energy, and research boom regimes.
- `supplyChainRisk`: hurts under logistics disruption, sanctions, energy spikes, or import constraints.
- `politicalExposure`: amplifies country sanctions, instability, security events, and policy shocks.
- `commodityExposure`: reacts to energy, agriculture, rare minerals, and commodity events.
- `sectorExposure`: controls sensitivity to sector shocks and rotations.
- `countryExposure`: controls sensitivity to country macro and event conditions.
- `liquidity`: dampens extreme movement and affects volume.
- `beta`: amplifies broad market movement.
- `volatility`: long-run baseline for the stock.

Required behavior examples:

- High debt plus rising interest rates should create negative pressure.
- High cash reserves should reduce downside in crises.
- High innovation should help in tech/AI boom regimes.
- High supply-chain risk should suffer from logistics shocks.
- High commodity exposure should react to commodity/energy events.

## Game-Session Isolation Architecture

Critical rule: every stock market simulation must be scoped to exactly one `gameSessionId`.

A stock market in Game A and a stock market in Game B may use the same ticker symbols, sectors, or company names, but their prices, events, histories, regimes, volatility states, player holdings, future orders, and future fills must be independent unless explicitly copied by a future admin-controlled template system.

### Global/reference layer

These may be global if they are templates and not runtime state:

- stock templates;
- sector definitions;
- default company archetypes;
- country exposure templates;
- reusable simulation presets.

Global/reference records should not carry live prices, live volatility, live chart history, live portfolio holdings, or active shocks.

### Game-session runtime layer

These must be scoped by `game_session_id`:

- `game_session_stock_assets`;
- `stock_price_ticks`;
- `stock_market_events`;
- `stock_market_regimes`;
- `player_portfolio_holdings`;
- `stock_orders`;
- `stock_fills`.

V2 schema planning rules:

- Stock templates may be global.
- Game-session stock assets must be `game_session_id` scoped.
- Price ticks must be `game_session_id` scoped.
- Events/shocks must be `game_session_id` scoped.
- Regimes must be `game_session_id` scoped.
- Portfolios must be `game_session_id + player_id` scoped.
- Orders must be `game_session_id + player_id` scoped.
- Fills must be `game_session_id + player_id` scoped.

V1 should enforce this at the pure-engine contract level by requiring top-level `gameSessionId` and rejecting or ignoring nested runtime inputs whose `gameSessionId` does not match.

## Factor Model Design

### Market factor

The market factor should be derived from world/macroeconomic conditions:

- high GDP growth, business confidence, consumer confidence, and political stability: positive;
- high inflation and high interest rates: negative for broad equity, especially debt-heavy and growth stocks;
- high unemployment: negative for consumer-sensitive sectors;
- high market risk: negative and volatility-positive;
- strong infrastructure and energy security: positive for productive capacity.

### Country factor

Each asset can have one primary country and optional additional country exposure weights. Country factor inputs should include GDP growth, inflation, interest rates, confidence, trade balance, export strength, market risk, political stability, infrastructure, energy security, import dependency, and supply constraints.

### Sector factor

Each sector should have a current drift, volatility adjustment, volume adjustment, and event sensitivity. Sector rotation should allow selected sectors to outperform while others lag.

### Company fundamental factor

Fundamentals should be normalized to bounded values such as 0 to 1 or -1 to 1. The engine should convert those values into small log-return contributions, not direct giant price moves.

### Event factor

Event factor should aggregate active shocks by scope:

- global shocks apply to all assets;
- country shocks apply through country exposure;
- sector shocks apply through sector exposure;
- ticker shocks apply only to the matching ticker.

### Regime factor

The regime factor should provide broad drift, volatility multiplier, news sensitivity, volume multiplier, beta multiplier, and optional sector weights.

### Volatility factor

Volatility factor should control noise width and volume response. It should not be pure randomness; it should use deterministic seeded pseudo-random values.

### Liquidity factor

Liquidity should dampen extreme movements for high-liquidity names and amplify moves for thinly traded names. It should also influence volume.

### Momentum and mean reversion

Momentum should let recent trends persist slightly. Mean reversion should prevent uncontrolled runaway moves by nudging price toward a fair-value anchor or recent moving average. V1 should keep both bounded and explainable.

## Econovaria Country and Sector Mapping

### Repo-backed countries

The country profile migration and country contracts define these country codes and capitals:

| Country code | Country | Capital | V1 exposure recommendation |
| --- | --- | --- | --- |
| `NORTHREACH` | Northreach | Frostgate | Cold resource-security state. Strong exposure to rare minerals, energy, defense/security, infrastructure, arctic logistics, and northern shipping routes. |
| `YRETHIA` | Yrethia | Sableport | Regulated maritime trade republic. Strong exposure to shipping/logistics, container ports, customs, finance/insurance, transshipment, and infrastructure. |
| `THALORIS` | Thaloris | Dusk Harbor | High-risk port economy. Strong exposure to re-export trade, repair/salvage, informal logistics, shipping disruption, and gray-zone commerce risk. |
| `SOLVEND` | Solvend | Aurora Spire | Research and high-altitude technology state. Strong exposure to technology, AI/aerospace, universities, technical expertise, precision engineering, and innovation shocks. |
| `ELDORAN` | Eldoran | Crescent Bay | Central stability zone. Strong exposure to agriculture/commodities, food security, internal transport, logistics, market stability, and commodity pricing. |
| `VALERION` | Valerion | Glassfall | Wealthy clean-tech and advanced manufacturing economy. Strong exposure to clean energy, finance, advanced manufacturing, high-value industry, and capital flows. |
| `LUMENOR` | Lumenor | Starfall | Present in repo. No inspected source defines sector lore yet. Use neutral/admin-defined exposure until a sourced template exists. |
| `XALVORIA` | Xalvoria | Emberhall | Present in repo. No inspected source defines sector lore yet. Use neutral/admin-defined exposure until a sourced template exists. |
| `DRAVENLOK` | Dravenlok | Ironhold | Present in repo. No inspected source defines sector lore yet. Use neutral/admin-defined exposure until a sourced template exists. |
| `SYNDALIS` | Syndalis | Blacklight | Present in repo. No inspected source defines sector lore yet. Use neutral/admin-defined exposure until a sourced template exists. |

The V1 engine can support all ten country codes, but only the six sourced planning-context countries should receive opinionated default sector exposure templates in this report. The other four should remain neutral or teacher/admin configured until their economy roles are documented.

### Sector mapping

| Sector | Primary macro/country sensitivities | Example country fit |
| --- | --- | --- |
| Energy | Energy security, commodity shocks, inflation, infrastructure, political risk | Northreach, Valerion |
| Rare minerals | Export strength, sanctions, trade restrictions, technology demand, defense demand | Northreach |
| Shipping/logistics | Trade balance, infrastructure, import dependency, port disruption, fuel costs | Yrethia, Thaloris, Eldoran |
| Technology | Business confidence, interest rates, innovation, supply-chain risk, AI breakthroughs | Solvend, Valerion |
| AI/aerospace | Innovation, universities/technical expertise, defense/security, energy infrastructure | Solvend, Valerion, Northreach |
| Agriculture/commodities | Food security, inflation, commodity prices, transport, weather-like classroom events | Eldoran |
| Food security | Consumer demand, agriculture, logistics, political stability | Eldoran |
| Finance/insurance | Interest rates, market stability, trade finance, volatility, capital flows | Yrethia, Valerion |
| Defense/security | Geopolitical risk, public contracts, rare minerals, infrastructure security | Northreach, Solvend |
| Consumer goods | Consumer confidence, inflation, unemployment, supply-chain risk | Eldoran, Yrethia, Valerion |
| Clean energy | Energy security, subsidies, technology, capital costs, infrastructure | Valerion, Solvend |
| Infrastructure | Public investment, rates, political stability, logistics, energy security | Northreach, Yrethia, Eldoran, Valerion |
| Repair/salvage/re-export trade | Port disruption, logistics risk, trade restrictions, high-risk commerce | Thaloris |

## Proposed Input and Output Contracts

The top-level engine input should include the requested shape exactly and require `gameSessionId`:

```ts
interface StockMarketEngineInput {
  gameSessionId: string;
  seed: string;
  tickIndex: number;
  assets: StockMarketAssetInput[];
  macro: StockMarketMacroInput;
  countries?: StockMarketCountryInput[];
  sectors?: StockMarketSectorInput[];
  shocks?: StockMarketShockInput[];
  regime?: StockMarketRegimeInput;
  settings?: StockMarketEngineSettings;
}
```

Additional V1 input contracts:

```ts
type StockMarketShockScope = "global" | "country" | "sector" | "ticker";
type StockMarketRegimeKind = "bull" | "bear" | "sideways" | "crisis" | "recovery" | "sector_rotation";

interface StockMarketAssetInput {
  gameSessionId: string;
  assetId: string;
  ticker: string;
  companyName: string;
  sector: string;
  countryCode: string;
  currentPrice: number;
  previousClose?: number;
  openPrice?: number;
  dayHigh?: number;
  dayLow?: number;
  sharesOutstanding?: number;
  marketCap?: number;
  beta: number;
  liquidity: number;
  currentVolatility: number;
  longRunVolatility: number;
  fairValueAnchor?: number;
  recentReturns?: number[];
  history?: StockMarketChartPoint[];
  fundamentals?: StockMarketCompanyFundamentalsInput;
  countryExposure?: Record<string, number>;
  sectorExposure?: Record<string, number>;
  commodityExposure?: Record<string, number>;
}

interface StockMarketCompanyFundamentalsInput {
  revenueGrowth: number;
  profitMargin: number;
  debtLevel: number;
  cashReserves: number;
  innovationScore: number;
  supplyChainRisk: number;
  politicalExposure: number;
  commodityExposure: number;
}

interface StockMarketMacroInput {
  gameSessionId: string;
  gdpGrowthRate?: number;
  inflationRate?: number;
  unemploymentRate?: number;
  interestRate?: number;
  consumerConfidenceIndex?: number;
  businessConfidenceIndex?: number;
  marketRiskIndex?: number;
  politicalStabilityIndex?: number;
  infrastructureIndex?: number;
  energySecurityIndex?: number;
  globalDemandIndex?: number;
}

interface StockMarketCountryInput {
  gameSessionId: string;
  countryCode: string;
  gdpGrowthRate?: number;
  inflationRate?: number;
  unemploymentRate?: number;
  interestRate?: number;
  consumerConfidenceIndex?: number;
  businessConfidenceIndex?: number;
  tradeBalanceIndex?: number;
  exportStrengthIndex?: number;
  marketRiskIndex?: number;
  politicalStabilityIndex?: number;
  infrastructureIndex?: number;
  energySecurityIndex?: number;
  supplyConstraintIndex?: number;
  importDependencyIndex?: number;
}

interface StockMarketSectorInput {
  gameSessionId: string;
  sectorKey: string;
  driftBias?: number;
  volatilityMultiplier?: number;
  volumeMultiplier?: number;
  newsSensitivity?: number;
  demandIndex?: number;
  supplyConstraintIndex?: number;
}

interface StockMarketShockInput {
  gameSessionId: string;
  shockId: string;
  scope: StockMarketShockScope;
  targetKey: string;
  magnitude: number;
  decay: number;
  confidence: number;
  volatilityImpact: number;
  volumeImpact: number;
  headline: string;
  explanation: string;
  createdTick: number;
  expiresTick?: number;
}

interface StockMarketRegimeInput {
  gameSessionId: string;
  regime: StockMarketRegimeKind;
  driftBias: number;
  volatilityMultiplier: number;
  newsSensitivity: number;
  volumeMultiplier: number;
  betaMultiplier?: number;
  sectorRotation?: Record<string, number>;
  studentLabel?: string;
}

interface StockMarketEngineSettings {
  gameSessionId: string;
  minPrice: number;
  maxTickMovePct: number;
  volatilityMeanReversionRate: number;
  minVolatility: number;
  maxVolatility: number;
  defaultLongRunVolatility: number;
  liquidityDampingStrength: number;
  momentumStrength: number;
  meanReversionStrength: number;
  baseVolume: number;
  maxHistoryPoints: number;
}
```

Output contracts:

```ts
interface StockMarketEngineResult {
  gameSessionId: string;
  seed: string;
  tickIndex: number;
  rows: StockMarketRowOutput[];
  ticks: StockPriceTickOutput[];
  explanations: StockPriceMovementExplanation[];
  generatedAt: string;
}

interface StockMarketRowOutput {
  gameSessionId: string;
  ticker: string;
  companyName: string;
  sector: string;
  currentPrice: number;
  changePct: string;
  previousClose: number;
  openPrice: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  marketCap: number;
  beta: number;
  history: StockMarketChartPoint[];
  lastUpdated: string;
  trend?: "up" | "down" | "flat";
  assetType?: "Stock";
  description?: string;
  notes?: string;
}

interface StockPriceTickOutput {
  gameSessionId: string;
  tickIndex: number;
  assetId: string;
  ticker: string;
  price: number;
  previousPrice: number;
  logReturn: number;
  changePct: number;
  volume: number;
  currentVolatility: number;
  longRunVolatility: number;
  createdAt: string;
  explanation: StockPriceMovementExplanation;
}

interface StockMarketChartPoint {
  gameSessionId?: string;
  tickIndex: number;
  timestamp: string;
  label: string;
  price: number;
  volume?: number;
}

interface StockPriceMovementExplanation {
  gameSessionId: string;
  tickIndex: number;
  ticker: string;
  headline: string;
  summary: string;
  studentText: string;
  components: StockPriceMovementComponentBreakdown;
  appliedShockIds: string[];
  regime: StockMarketRegimeKind;
}

interface StockPriceMovementComponentBreakdown {
  marketFactorPct: number;
  countryFactorPct: number;
  sectorFactorPct: number;
  fundamentalsFactorPct: number;
  regimeFactorPct: number;
  shockFactorPct: number;
  volatilityNoisePct: number;
  momentumFactorPct: number;
  meanReversionFactorPct: number;
  finalReturnPct: number;
}
```

Every output row must include `gameSessionId`. `StockMarketChartPoint` may allow optional `gameSessionId` only when embedded inside a parent row, but persisted chart/tick records should always include it.

## Movement Explanation Design

The engine should produce both machine-readable component breakdowns and student-facing text.

Required component breakdown:

- `marketFactorPct`
- `countryFactorPct`
- `sectorFactorPct`
- `fundamentalsFactorPct`
- `regimeFactorPct`
- `shockFactorPct`
- `volatilityNoisePct`
- `momentumFactorPct`
- `meanReversionFactorPct`
- `finalReturnPct`

Example explanation:

```json
{
  "gameSessionId": "game_a",
  "tickIndex": 42,
  "ticker": "FROSTMIN",
  "headline": "Rare mineral export restriction pressures Northreach miners",
  "summary": "FROSTMIN fell 2.4% as a Northreach rare mineral export restriction outweighed stable broad-market demand.",
  "studentText": "FROSTMIN fell 2.4% because rare mineral export restrictions hurt Northreach mining stocks, while crisis-regime volatility increased selling pressure.",
  "components": {
    "marketFactorPct": -0.2,
    "countryFactorPct": -0.7,
    "sectorFactorPct": -0.5,
    "fundamentalsFactorPct": 0.1,
    "regimeFactorPct": -0.4,
    "shockFactorPct": -0.9,
    "volatilityNoisePct": 0.1,
    "momentumFactorPct": -0.1,
    "meanReversionFactorPct": 0.2,
    "finalReturnPct": -2.4
  },
  "appliedShockIds": ["shock_rare_export_restriction"],
  "regime": "crisis"
}
```

Explanation rules:

- Name the largest one to three drivers.
- Prefer game-world language over financial jargon.
- Avoid implying real investment advice.
- Include the regime if it materially changed the move.
- Include country and sector when relevant.
- Keep text short enough for a UI row, tooltip, or lesson log.

Additional example explanations:

- `SABLEFREIGHT rose 1.8% because Yrethia port activity improved and shipping volume increased during a recovery regime.`
- `AURORAAI rose 3.1% after an AI infrastructure breakthrough boosted Solvend technology firms with high innovation scores.`
- `GLASSGRID fell 1.2% because higher interest rates pressured clean-energy infrastructure firms with large financing needs.`
- `CRESCENTFOOD gained 0.9% as Eldoran food-security demand improved while broad market conditions stayed sideways.`

## Testing Strategy

Future tests for the pure calculation engine:

1. Same seed and same input produce identical output.
2. Different seed changes bounded noise but does not break constraints.
3. Prices never become zero or negative.
4. Positive ticker shock increases price relative to neutral baseline.
5. Negative ticker shock decreases price relative to neutral baseline.
6. High inflation and high interest rates create broad downward pressure.
7. High GDP growth, consumer confidence, and political stability create upward pressure.
8. Crisis regime increases volatility and volume.
9. Recovery regime supports positive drift after a crisis.
10. Liquidity dampens extreme movement.
11. High beta amplifies market-factor movement.
12. Shock decay reduces event impact over later ticks.
13. Volatility memory carries elevated volatility into the next tick.
14. Game-session isolation: identical tickers in two different `gameSessionId`s must not share runtime state.
15. Output contains all fields needed by the existing frontend market normalizer.

Additional recommended tests:

- Nested runtime input with mismatched `gameSessionId` is rejected.
- Sector rotation benefits selected sectors and pressures non-selected sectors.
- High debt plus high interest rates produces negative fundamentals pressure.
- High cash reserves reduce crisis downside.
- History is capped to `maxHistoryPoints` and remains sorted by tick.
- Explanation `finalReturnPct` matches the computed price movement within rounding tolerance.

## Implementation Roadmap

### V0: Research and design document only

This PR. No implementation code, migrations, routes, frontend changes, trading execution, portfolio accounting, ledger writes, reservations, real-world financial API integration, login/signup/licensing changes, store purchase changes, or PR #46 changes.

### V1: Pure deterministic calculation engine, no DB, no routes, no frontend

Build a pure TypeScript engine in an appropriate backend domain module. It should accept `StockMarketEngineInput`, return `StockMarketEngineResult`, and include unit tests for determinism, positive prices, shocks, regimes, volatility memory, liquidity, beta, and game-session isolation.

### V2: Game-session-scoped schema foundation

Design and add migrations only after V1 is proven. Runtime tables must be scoped as follows:

- stock templates may be global;
- game-session stock assets must be `game_session_id` scoped;
- price ticks must be `game_session_id` scoped;
- events/shocks must be `game_session_id` scoped;
- regimes must be `game_session_id` scoped;
- portfolios must be `game_session_id + player_id` scoped;
- orders must be `game_session_id + player_id` scoped;
- fills must be `game_session_id + player_id` scoped.

### V3: Stock-market runner that writes game-session-scoped ticks

Evolve the placeholder `stock-market-runner` into a scheduled or admin-triggered process that reads one game session, runs the pure engine, and writes that game's ticks only.

### V4: Frontend read integration for market data only

Expose read-only stock market rows compatible with the existing market normalizer. Do not enable trading execution yet.

### V5: Basic market BUY/SELL execution

Add game-session-scoped order, fill, holding, cash settlement, and ledger integration for basic market orders only. Include idempotency, reservations or transaction-safe checks, and audit logging.

### V6: Advanced orders later

Add limit, stop, stop-limit, and trailing stop only after basic execution and portfolio accounting are reliable.

### V7: Analyst forecast scoring using price ticks

Use authoritative stock price ticks to settle BUY/HOLD/SELL forecasts and target-price accuracy.

### V8: Admin controls for events, regimes, and market schedule

Let teachers/admins schedule regimes, author events, pause markets, and control market calendars per game session.

## Best Course of Action

Build V1 first: a pure deterministic calculation engine that produces stock market rows, price ticks, volatility state, chart history, and explanation breakdowns from a complete game-session-scoped input.

Defer these until later phases:

- database migrations;
- classroom-api stock routes;
- frontend UI changes;
- trading execution;
- portfolio accounting;
- buy/sell orders;
- ledger writes;
- cash/share reservations;
- full agent-based exchange simulation;
- full limit order book simulation;
- real-world financial API integration.

The V1 engine should be designed around the existing frontend market row contract, the repo's country-economic foundations, and the strict game-session isolation rule. This lets frontend work continue separately while backend simulation logic becomes testable and explainable.

Suggested PR title:

`docs(stocks): research market simulation engine design`

Suggested PR description:

- Research-only
- No implementation
- No migrations
- No routes
- No frontend changes
- Includes game-session isolation rule
- Recommends first implementation scope
