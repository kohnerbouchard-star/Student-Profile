# Stock Market Simulation Models Research v1

## Executive Summary

Eco Novaria should start with a pure deterministic stock-market calculation engine, not with trading execution, portfolio accounting, a full exchange, or a limit order book.

The best V1 model is a classroom-specific hybrid that combines:

- factor-based returns for market, country, sector, company fundamentals, and events;
- GBM/log-return style price movement so prices remain positive;
- explicit market regimes controlled by teacher/admin settings;
- simplified volatility memory inspired by GARCH and stochastic volatility;
- explicit event/news jumps inspired by jump diffusion;
- liquidity damping, volume response, beta, momentum, and mean reversion;
- deterministic seeded noise;
- movement explanation breakdowns for students and teachers.

The first implementation should be a pure TypeScript engine that accepts a complete `StockMarketEngineInput` and returns `StockMarketEngineResult`. It should have no database writes, no routes, no frontend changes, no migrations, no buy/sell execution, no portfolio accounting, and no ledger/reservation behavior.

The most important architecture rule is game-session isolation. Every runtime market object must belong to exactly one `gameSessionId`. A stock in Game A and a stock with the same ticker in Game B may share a global template, but their prices, ticks, events, regimes, generated history, holdings, orders, and fills must never share runtime state.

Country exposure should not be hard-coded from this research summary. The stock-market engine should use [`docs/worldbuilding/econovaria-country-lore-v1.md`](../worldbuilding/econovaria-country-lore-v1.md) as the source of truth for country exposure templates, market events, country shocks, company archetypes, and movement explanation language. This research document summarizes that lore only to explain how it should shape the engine.

## Current Repository Evidence

Repository inspected: `kohnerbouchard-star/Student-Profile` on `main`, plus the active research branch `docs/stock-market-simulation-research-v1`.

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
- Source-of-truth country lore path to use for future engine work: [`docs/worldbuilding/econovaria-country-lore-v1.md`](../worldbuilding/econovaria-country-lore-v1.md)

Confirmed current state:

1. The frontend trading UI currently submits legacy `STOCK_TRADE`. `submitTrade()` validates `action`, `ticker`, and `shares`, then calls `submitAction("STOCK_TRADE", { action, ticker, shares })`.
2. The market UI expects rows with `ticker`, `companyName`, `sector`, `currentPrice`, `changePct`, `previousClose`, `openPrice`, `dayHigh`, `dayLow`, `volume`, `marketCap`, `beta`, `history`, and `lastUpdated`.
3. `frontend/src/core/snapshot.js` normalizes market rows from snapshot keys such as `market`, `stocks`, `stockMarket`, and `marketRows`, and portfolio rows from `portfolio`, `holdings`, `positions`, and `stockPortfolio`.
4. `backend/supabase/functions/stock-market-runner/README.md` says the folder is a structure placeholder only and should not yet contain stock calculations, request handlers, or schema changes.
5. `classroom-api/index.ts` exposes player store quote/purchase routes, ledger/me/login routes, staff routes, game settings, attendance, roster, and licensing. It does not expose stock-market, stock-order, stock-price, portfolio, or execution routes.
6. `backend/src/supabase/tableTypes.ts` includes core session/settings types, mutation idempotency, store purchase quotes, store purchases, inventory holdings, and inventory events. It does not define the full stock runtime schema needed for `stock_assets`, `game_session_stock_assets`, `stock_price_ticks`, `stock_market_events`, `stock_market_regimes`, `stock_orders`, `stock_fills`, `stock_trades`, `player_portfolio_holdings`, or stock reservations.
7. Repository search for stock runtime schema terms returned no matching implementation files. The schema readiness audit also identifies stock assets, price ticks, orders, fills/trades, portfolio holdings, and reservations as missing.
8. The country profile migration provides useful world-state foundations: global `country_profiles`, per-game difficulty settings, per-game country economic baselines, per-game `country_economic_snapshots`, per-game `country_event_impacts`, and per-game player country assignments.
9. The Eco Novaria countries and capitals are: Northreach - Frostgate, Yrethia - Sableport, Thaloris - Dusk Harbor, Solvend - Aurora Spire, Eldoran - Crescent Bay, Valerion - Glassfall, Lumenor - Starfall, Xalvoria - Emberhall, Dravenlok - Ironhold, and Syndalis - Blacklight.
10. All ten countries now have official market exposure lore. The engine should use `docs/worldbuilding/econovaria-country-lore-v1.md` as the country exposure source of truth instead of treating any country as a neutral placeholder.

Conclusion: the first stock implementation should be a pure calculation engine. The repo has frontend display expectations and country-economic foundations, but does not yet have the stock runtime schema or route surface required for authoritative assets, ticks, orders, fills, holdings, reservations, or execution.

## Research Method

Web source verification was performed on 2026-06-23. No later source-verification section is needed for the external model research in this document.

Internal source of truth for country exposure:

- [`docs/worldbuilding/econovaria-country-lore-v1.md`](../worldbuilding/econovaria-country-lore-v1.md) should define the official country identities, core industries, market exposure, positive/negative market events, stock-market behavior, economic blocs, country events, company archetypes, and future movement explanation language.

Primary and supporting external sources:

- GBM and Monte Carlo: [Investopedia, Monte Carlo Simulation with Geometric Brownian Motion](https://www.investopedia.com/articles/07/montecarlo.asp), [Investopedia, Black-Scholes Model](https://www.investopedia.com/terms/b/blackscholes.asp)
- Factor models: [Kenneth R. French Data Library](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html), [Description of Fama/French Factors](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library/f-f_factors.html)
- GARCH: [Bollerslev, Generalized Autoregressive Conditional Heteroskedasticity](https://doi.org/10.1016/0304-4076(86)90063-1)
- Heston: [Heston, A Closed-Form Solution for Options with Stochastic Volatility](https://doi.org/10.1093/rfs/6.2.327)
- Jump diffusion: [Merton, Option Pricing When Underlying Stock Returns are Discontinuous](https://doi.org/10.1016/0304-405X(76)90022-2)
- Regime switching: [Hamilton, A New Approach to the Economic Analysis of Nonstationary Time Series and the Business Cycle](https://doi.org/10.2307/1912559), [statsmodels Markov switching examples](https://www.statsmodels.org/stable/examples/notebooks/generated/markov_regression.html)
- Agent-based and discrete-event markets: [ABIDES paper](https://arxiv.org/abs/1904.12066), [ABIDES repository](https://github.com/abides-sim/abides), [Raberto et al., Agent-based simulation of a financial market](https://arxiv.org/abs/cond-mat/0103600)
- Educational simulation references: [The Stock Market Game](https://www.stockmarketgame.org/), [Investopedia Simulator guide](https://www.investopedia.com/how-to-use-the-investopedia-simulator-5221184)
- Macro agent simulation context: [Agent-based computational economics overview](https://en.wikipedia.org/wiki/Agent-based_computational_economics), [agent-based macroeconomic model example](https://arxiv.org/abs/2205.00752)

The recommendation uses these model families as design inspiration, but deliberately simplifies them for a deterministic, explainable, teacher-controlled classroom simulation.

## Model Family Comparison

| Model family | Captures well | Fails or struggles with | Complexity | Eco Novaria V1 fit | Recommendation |
| --- | --- | --- | --- | --- | --- |
| GBM and Monte Carlo | Positive prices, proportional returns, simple random paths | Constant volatility, no explicit jumps, weak explanations alone | Low | Strong primitive | Use simplified log-return price movement; defer full Monte Carlo |
| Factor models | Market, country, sector, beta, fundamentals, explanations | Exchange mechanics and emergent order flow | Low to medium | Excellent | Use as the V1 backbone |
| GARCH / volatility clustering | Persistent high/low volatility, shock memory | Needs calibration and can be opaque | Medium | Good if simplified | Use volatility memory, not full GARCH |
| Heston / stochastic volatility | Mean-reverting variance, richer volatility dynamics | Too complex and option-pricing oriented | High | Inspiration only | Defer; borrow mean-reverting volatility concept |
| Jump diffusion / SVJ | News shocks, discontinuous moves, event risk | Calibration complexity | Medium to high | Strong if explicit | Use authored shock objects with decay |
| Regime switching | Bull, bear, crisis, recovery, rotation behavior | Hidden inference is unnecessary for V1 | Medium | Excellent | Use explicit admin-selected regimes |
| Agent-based markets | Herding, heterogeneous agents, feedback loops | Hard to control, explain, and test | High | Poor | Defer; borrow sentiment/liquidity ideas only |
| Limit order book / exchange simulation | Bids, asks, matching, partial fills, slippage | Requires orders, holdings, reservations, concurrency | Very high | Poor | Defer until execution phases |
| Macro-economic agent simulation | Whole-economy feedback and policy experiments | Too broad for a stock tick engine | Very high | Poor | Defer; consume country snapshots and lore-derived exposures instead |
| Educational/business simulators | Classroom safety, virtual portfolios, engagement | Often rely on real-world market data | Low to medium | Useful inspiration | Use product principles, not real-market dependency |

## Model Family Notes

### 1. Geometric Brownian Motion and Monte Carlo Simulation

GBM models prices with stochastic log returns. A common discrete update is `nextPrice = currentPrice * exp(return)`. Monte Carlo simulation repeats random trials to create many possible paths.

It captures positive prices, proportional movement, compounding, and simple stochastic paths. It fails to capture volatility clustering, jumps, liquidity, country/sector drivers, and explanation unless those are layered on top.

Implementation complexity is low for one-step log returns and medium for full Monte Carlo path distributions. Eco Novaria V1 should use the log-return/exponential price update directly, but should not build a full Monte Carlo simulator yet. The classroom value is that percentage moves remain intuitive and prices cannot cross below zero.

### 2. Factor Models

Factor models explain returns using market, style, sector, country, or company drivers. The Kenneth French Data Library documents widely used Fama/French factors such as market excess return, SMB, HML, profitability, investment, momentum, and reversal.

For Eco Novaria, factor models are the best backbone because they make price movement explainable: a stock can move because of country sanctions, sector weakness, market risk, high debt during rate hikes, or a ticker-specific contract win.

They do not simulate exchange mechanics, bid/ask spreads, or emergent trader behavior. Implementation complexity is low to medium, mostly in defining bounded factors and weights. V1 should use a simplified classroom factor model directly.

### 3. GARCH and Volatility Clustering Models

GARCH models conditional variance using previous shocks and previous variance. It captures the common market behavior that large moves tend to cluster and volatility can remain elevated after stress.

Full GARCH estimation is unnecessary for V1. It would require calibration and would be hard to explain. Eco Novaria should use a simple volatility memory state instead: shocks increase `currentVolatility`, and `currentVolatility` gradually decays toward `longRunVolatility`.

Classroom value: crises and news feel persistent without making the simulation mysterious.

### 4. Heston and Stochastic Volatility Models

Heston models asset prices and variance as linked stochastic processes. It captures mean-reverting volatility and richer option-pricing behavior.

The direct model is too complex for V1, calibration-heavy, and not needed for a classroom stock tick engine. Eco Novaria should defer full Heston-style modeling and borrow only the idea that volatility is a state variable that mean-reverts.

### 5. Jump Diffusion and Stochastic-Volatility-Jump Models

Jump diffusion adds discontinuous price jumps to otherwise continuous dynamics. This maps well to classroom news: sanctions, contract wins, supply-chain disruption, export restrictions, rate hikes, energy shocks, cyber events, financial scandals, logistics disruption, public legitimacy events, and political stability events.

V1 should not use random unexplainable jumps. It should use explicit `StockMarketShockInput` objects with scope, target, magnitude, decay, confidence, volatility impact, volume impact, headline, and explanation.

### 6. Regime-Switching Models

Regime-switching models represent different market states such as expansion/recession, low/high volatility, or bull/bear periods. Hamilton's work is a classic statistical approach.

V1 should not infer hidden regimes. It should let the teacher/admin select or schedule explicit regimes: bull, bear, sideways, crisis, recovery, and sector rotation. This preserves control and makes lessons clearer.

### 7. Agent-Based Market Simulation

Agent-based market simulations model many heterogeneous traders, strategies, balances, and interactions. ABIDES is a well-known agent-based interactive discrete-event simulation environment for market research.

These systems can capture herding, feedback loops, market impact, latency, and emergent volatility. They are too complex, hard to control, and difficult to explain for V1. Eco Novaria should defer this and borrow only light concepts such as sentiment, liquidity, momentum, and mean reversion.

### 8. Limit Order Book and Discrete-Event Exchange Simulation

A limit order book tracks bids, asks, order priority, partial fills, cancellations, and last-trade prices. This is useful for execution realism, but it requires order lifecycle state, portfolio holdings, cash/share reservations, concurrency safety, fills, audit logs, and settlement.

V1 should not implement this. It belongs after basic market data, schema, and portfolio accounting exist.

### 9. Macro-Economic Agent Simulation Models

Macro ABMs model households, firms, banks, governments, prices, labor, credit, trade, and policy. They are useful for whole-economy experiments, but far broader than a stock tick engine.

Eco Novaria should defer macro ABM implementation and instead consume the repo's existing country economic snapshots plus lore-derived country exposure templates.

### 10. Educational and Business Simulation Market Models

Educational simulators provide virtual portfolios, simulated trades, leaderboards, and safe experimentation. They are valuable product references, but many use real-world market data. Eco Novaria needs a fictional deterministic economy instead.

Use the educational principles: risk-free framing, virtual money, transparent rules, teacher controls, and no real investment advice.

## Recommended Eco Novaria Market Model

The recommended engine hierarchy is:

World state -> macro conditions -> country lore exposure templates -> country conditions -> sector conditions -> company fundamentals -> news/events -> volatility/liquidity -> price movement -> explanation

The conceptual return formula is:

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

For implementation, V1 should represent factors as bounded signed log-return components and add them before applying exponential price movement:

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

Log-return/exponential movement is better than additive price changes because it preserves positive prices and makes movement proportional. An additive negative shock can push a low-priced stock below zero; a log-return model shrinks the price multiplicatively without crossing zero.

Recommended calculation flow:

1. Validate one top-level `gameSessionId` and reject mismatched runtime inputs.
2. Sort assets by stable key for deterministic output.
3. Build deterministic pseudo-random state from `gameSessionId`, `seed`, `tickIndex`, and `ticker`.
4. Load or resolve country exposure templates from `docs/worldbuilding/econovaria-country-lore-v1.md`, then convert them into structured sector, event, and macro sensitivities.
5. Resolve regime drift, volatility multiplier, news sensitivity, and volume multiplier.
6. Compute market factor from macro conditions.
7. Compute country factor from lore-derived country exposures and country inputs.
8. Compute sector factor from sector conditions and sector weights.
9. Compute fundamentals factor from revenue growth, margins, debt, cash, innovation, supply-chain risk, political exposure, commodity exposure, liquidity, beta, and volatility.
10. Apply scoped global/country/sector/ticker shocks with confidence and decay.
11. Update volatility memory.
12. Apply bounded seeded volatility noise.
13. Apply momentum and mean reversion.
14. Compute `nextPrice = currentPrice * exp(boundedLogReturn)` with a minimum price such as 0.01.
15. Derive previous close, open, high, low, volume, market cap, beta, history, last updated, and explanation.
16. Return frontend-compatible market rows and tick outputs.

### Market Regimes

| Regime | Expected drift | Volatility multiplier | News sensitivity | Volume multiplier | Student-facing interpretation | Teacher/admin value |
| --- | --- | --- | --- | --- | --- | --- |
| Bull market | Positive | 0.8 to 1.1 | Normal or slightly positive | 1.1 | Investors are optimistic | Teach growth and confidence |
| Bear market | Negative | 1.1 to 1.5 | Negative news stronger | 1.2 | Confidence is weak | Teach risk and diversification |
| Sideways market | Near zero | 0.7 to 1.0 | Normal | 0.8 | Market is waiting for clearer signals | Highlight company and sector drivers |
| Crisis | Strong negative | 1.8 to 3.0 | High | 1.8 to 2.5 | Uncertainty is high | Stage controlled stress events |
| Recovery | Positive after stress | 1.1 to 1.6, decaying | Positive news stronger | 1.3 | Markets are stabilizing | Teach resilience and policy response |
| Sector rotation | Neutral overall; selected sectors diverge | 1.0 to 1.4 | Sector news amplified | 1.2 | Capital moves between sectors | Focus lessons on sectors and exposures |

### Volatility Model

V1 volatility memory should work like this:

- each game-session stock has `currentVolatility`;
- each game-session stock has `longRunVolatility`;
- shocks increase `currentVolatility`;
- `currentVolatility` decays toward `longRunVolatility`;
- crisis and bear regimes increase volatility;
- high liquidity dampens extreme movement;
- low liquidity amplifies movement and volume spikes;
- high beta amplifies market movement;
- volatility affects volume;
- volatility state must be `gameSessionId` scoped.

Example:

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

Examples:

- global rate hike;
- country-specific sanctions;
- sector supply-chain disruption;
- ticker-specific contract win;
- energy price spike;
- logistics disruption;
- political stability improvement;
- rare mineral export restriction;
- AI infrastructure breakthrough;
- cyber-defense demand surge;
- data breach or fintech regulatory crackdown;
- diplomatic agreement or conference boycott;
- infrastructure finance deal or foreign default;
- industrial stimulus, factory accident, or component shortage.

### Company Fundamentals

V1 fundamentals should be simple tunable values:

- `revenueGrowth`;
- `profitMargin`;
- `debtLevel`;
- `cashReserves`;
- `innovationScore`;
- `supplyChainRisk`;
- `politicalExposure`;
- `commodityExposure`;
- `sectorExposure`;
- `countryExposure`;
- `liquidity`;
- `beta`;
- `volatility`.

Expected effects:

- high debt plus rising interest rates creates negative pressure;
- high cash reserves reduce crisis downside;
- high innovation helps in technology, AI/aerospace, cybersecurity, fintech, and clean-energy boom regimes;
- high supply-chain risk suffers from logistics shocks;
- high commodity exposure reacts to commodity and energy events;
- high institutional exposure reacts to diplomacy, media trust, public budgets, and legitimacy shocks;
- high capital-flow exposure reacts to interest rates, sanctions, debt crises, and foreign defaults.

## Game-Session Isolation Architecture

Every stock market simulation must be scoped to exactly one `gameSessionId`.

A stock market in Game A and a stock market in Game B may use the same ticker symbols, sectors, company names, global country lore, or global templates, but prices, events, histories, regimes, volatility state, holdings, future orders, and future fills must remain independent unless an explicit future admin-controlled template copy feature copies them.

### Global/reference layer

These may be global if they are templates/reference data only:

- country lore from `docs/worldbuilding/econovaria-country-lore-v1.md`;
- stock templates;
- sector definitions;
- default company archetypes;
- country exposure templates derived from official lore;
- reusable simulation presets.

### Game-session runtime layer

These must be scoped by `game_session_id`:

- `game_session_stock_assets`;
- `stock_price_ticks`;
- `stock_market_events`;
- `stock_market_regimes`;
- `player_portfolio_holdings`;
- `stock_orders`;
- `stock_fills`.

V2 schema planning rule:

- stock templates and official country lore may be global/reference data;
- game-session stock assets must be `game_session_id` scoped;
- price ticks must be `game_session_id` scoped;
- events/shocks must be `game_session_id` scoped;
- regimes must be `game_session_id` scoped;
- portfolios must be `game_session_id + player_id` scoped;
- orders must be `game_session_id + player_id` scoped;
- fills must be `game_session_id + player_id` scoped.

## Factor Model Design

Market factor: driven by GDP growth, inflation, interest rates, unemployment, confidence, political stability, infrastructure, energy security, and market risk.

Country factor: driven by country exposure weights and country-specific GDP growth, inflation, interest rates, trade balance, export strength, supply constraints, import dependency, market risk, political stability, infrastructure, energy security, institutions, capital flows, cyber risk, and logistics access. The baseline country exposure template should be derived from `docs/worldbuilding/econovaria-country-lore-v1.md`.

Sector factor: driven by sector drift, demand, supply constraints, news sensitivity, volatility multiplier, and volume multiplier.

Company factor: driven by fundamentals, beta, liquidity, long-run volatility, country exposure, sector exposure, and commodity exposure.

Event factor: aggregates active shocks by global, country, sector, and ticker scope, then applies confidence, decay, country exposure, and regime news sensitivity.

Regime factor: supplies drift, volatility multiplier, news sensitivity, volume multiplier, beta multiplier, and optional sector rotation weights.

Volatility factor: controls seeded noise width and volume response.

Liquidity factor: dampens extreme movement for liquid stocks and amplifies moves for thinly traded stocks.

Momentum and mean reversion: momentum allows recent trends to persist slightly; mean reversion nudges price toward fair value or recent average so movements do not run away unchecked.

## Econovaria Country and Sector Mapping

### Source Of Truth

Use [`docs/worldbuilding/econovaria-country-lore-v1.md`](../worldbuilding/econovaria-country-lore-v1.md) as the country exposure source of truth. This research doc should not become a competing lore file. Future stock-market implementation should derive country exposure templates, event hooks, company archetypes, and explanation copy from the worldbuilding document.

All ten countries now have meaningful market exposure. Do not treat Lumenor, Xalvoria, Dravenlok, or Syndalis as neutral placeholders.

### Countries

| Country code | Country | Capital | Official market exposure summary |
| --- | --- | --- | --- |
| `NORTHREACH` | Northreach | Frostgate | Arctic resource state and northern logistics power; rare minerals, natural gas, energy security, arctic logistics, mining, defense infrastructure, cold-climate engineering, and northern shipping routes. Reacts strongly to mineral demand, energy prices, defense spending, sanctions, infrastructure reliability, and arctic corridor access. |
| `YRETHIA` | Yrethia | Sableport | Maritime trade republic and shipping-finance hub; container shipping, customs, maritime insurance, freight finance, port automation, ship repair, transshipment, and logistics software. Reacts to trade volume, shipping rates, port congestion, customs policy, insurance costs, and rerouted trade. |
| `THALORIS` | Thaloris | Dusk Harbor | High-risk port economy and informal trade gateway; re-export trade, salvage, ship repair, bonded warehouses, secondary markets, informal logistics, gray-zone finance, and repair yards. Reacts to sanctions, shortages, logistics disruption, salvage demand, trade restrictions, and enforcement crackdowns. |
| `SOLVEND` | Solvend | Aurora Spire | Research economy and high-altitude technology state; AI, aerospace, research universities, precision engineering, software, technical services, patents, advanced manufacturing, and satellite systems. Reacts to research funding, AI demand, aerospace contracts, rates, talent migration, patent disputes, and technology pressure. |
| `ELDORAN` | Eldoran | Crescent Bay | Central market economy and agricultural-logistics anchor; agriculture, food security, commodity pricing, wholesale markets, inland logistics, rail and freight, consumer goods, grain terminals, and market exchanges. Reacts to food prices, crop yields, logistics stability, commodity contracts, inflation, transport capacity, and regional demand. |
| `VALERION` | Valerion | Glassfall | Wealthy clean-energy and services economy; clean energy, hydropower, water infrastructure, tourism, premium services, finance, luxury districts, clean transit, and high-end real estate. Reacts to clean-energy demand, hydropower output, water access, tourism, capital flows, environmental regulation, and luxury consumption. |
| `LUMENOR` | Lumenor | Starfall | Southern cultural, education, and public-sector economy; education, universities, media, public administration, diplomacy, cultural institutions, observatories, archives, civic infrastructure, and international conferences. Reacts to education spending, media trust, diplomatic stability, public-sector investment, cultural exports, tourism, and institutional credibility. |
| `XALVORIA` | Xalvoria | Emberhall | Old-money financial-industrial power; banking, infrastructure finance, sovereign wealth, luxury manufacturing, energy resources, construction, capital markets, political influence, cross-border acquisitions, and megaprojects. Reacts to capital flows, interest rates, sovereign investment, infrastructure contracts, debt crises, luxury demand, resource prices, and political backlash. |
| `DRAVENLOK` | Dravenlok | Ironhold | Heavy-industrial manufacturing state under pressure; steel, machinery, vehicles, defense manufacturing, rail, heavy logistics, energy-intensive production, state-owned enterprises, industrial exports, and armored logistics. Reacts to industrial demand, defense spending, steel prices, energy costs, sanctions, export access, components, rail capacity, and state stimulus. |
| `SYNDALIS` | Syndalis | Blacklight | Data, cybersecurity, finance, and covert influence state; cybersecurity, fintech, data centers, surveillance technology, private intelligence, encrypted finance, undersea cable routes, platform companies, market data infrastructure, and cyber-defense systems. Reacts to cyber-defense demand, data-center expansion, fintech regulation, market volatility, trust crises, undersea cable security, platform control, and information warfare. |

### Economic Blocs

| Bloc | Countries | Stock-market logic |
| --- | --- | --- |
| Northern Resource Bloc | Northreach, Solvend | Northreach resource shocks can affect Solvend technology and aerospace firms; Solvend breakthroughs can increase demand for Northreach minerals. |
| Western Maritime Corridor | Yrethia, Thaloris | Trade disruption can hurt Yrethia's stable trade flows while benefiting Thaloris's opportunistic logistics; crackdowns tend to help Yrethia and hurt Thaloris. |
| Central Stability Zone | Eldoran, Valerion, Lumenor | Strong food, energy, services, institutions, and diplomacy should lower global volatility; failures in food, water/energy, or legitimacy should raise volatility. |
| Eastern Pressure Zone | Xalvoria, Dravenlok, Syndalis | Capital, industry, and data power can produce larger geopolitical shocks through debt diplomacy, industrial nationalism, sanctions, cyber events, and financial routing. |

### Sectors

| Sector | Primary sensitivities | Example country fit |
| --- | --- | --- |
| Energy | Energy security, commodity shocks, inflation, infrastructure, political risk | Northreach, Valerion, Xalvoria, Dravenlok |
| Rare minerals | Export strength, sanctions, trade restrictions, technology demand, defense demand | Northreach, Solvend |
| Shipping/logistics | Trade balance, infrastructure, import dependency, port disruption, fuel costs | Yrethia, Thaloris, Eldoran, Dravenlok |
| Technology | Business confidence, interest rates, innovation, supply-chain risk, cyber risk, AI breakthroughs | Solvend, Syndalis, Valerion |
| AI/aerospace | Innovation, technical expertise, defense/security, satellite systems, energy infrastructure | Solvend, Northreach, Valerion |
| Agriculture/commodities | Food security, inflation, crop yields, commodity prices, transport | Eldoran |
| Food security | Consumer demand, agriculture, logistics, public stability | Eldoran, Lumenor |
| Finance/insurance | Interest rates, stability, trade finance, volatility, capital flows, defaults | Yrethia, Valerion, Xalvoria, Syndalis |
| Defense/security | Geopolitical risk, public contracts, rare minerals, infrastructure security, cyber-defense | Northreach, Dravenlok, Solvend, Syndalis |
| Consumer goods | Consumer confidence, inflation, unemployment, logistics, luxury demand | Eldoran, Valerion, Xalvoria, Yrethia |
| Clean energy | Energy security, hydropower, subsidies, technology, capital costs, infrastructure | Valerion, Solvend, Northreach |
| Infrastructure | Public investment, rates, political stability, logistics, energy security, megaprojects | Northreach, Yrethia, Eldoran, Valerion, Xalvoria, Dravenlok |
| Repair/salvage/re-export trade | Port disruption, logistics risk, sanctions, shortages, trade restrictions | Thaloris, Yrethia |
| Education/media/diplomacy | Public budgets, institutional trust, conferences, cultural exports, legitimacy | Lumenor |
| Cybersecurity/fintech/data | Data demand, cyber-defense, regulation, platform trust, undersea cables, market volatility | Syndalis |
| Heavy industry/manufacturing | Steel, machinery, vehicles, defense, energy costs, component access, export markets | Dravenlok, Xalvoria |
| Luxury/premium services | Capital flows, tourism, premium demand, reputation, real estate, finance | Valerion, Xalvoria |

## Proposed Input and Output Contracts

Top-level input:

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

Supporting input contracts:

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
  institutionalTrustIndex?: number;
  cyberRiskIndex?: number;
  capitalFlowIndex?: number;
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

Every output row must include `gameSessionId`. Persisted chart/tick rows should also include it even if embedded chart points allow optional `gameSessionId` for UI convenience.

## Movement Explanation Design

The engine must produce explainable output with this component breakdown:

- `marketFactorPct`;
- `countryFactorPct`;
- `sectorFactorPct`;
- `fundamentalsFactorPct`;
- `regimeFactorPct`;
- `shockFactorPct`;
- `volatilityNoisePct`;
- `momentumFactorPct`;
- `meanReversionFactorPct`;
- `finalReturnPct`.

Example:

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

Additional example explanations:

- `SABLEFREIGHT rose 1.8% because Yrethia port activity improved and shipping volume increased during a recovery regime.`
- `AURORAAI rose 3.1% after an AI infrastructure breakthrough boosted Solvend technology firms with high innovation scores.`
- `GLASSGRID fell 1.2% because higher interest rates pressured clean-energy infrastructure firms with large financing needs.`
- `STARLEARN rose 0.8% after a major conference and education-export deal improved Lumenor institutional demand.`
- `EMBERBANK fell 2.1% after a foreign default raised concern about Xalvorian infrastructure finance exposure.`
- `IRONRAIL gained 1.6% as Dravenlok industrial stimulus lifted machinery and rail contractors.`
- `BLACKDATA dropped 3.4% after a Syndalis platform trust crisis and regulatory crackdown hit fintech and data firms.`

## Testing Strategy

Future pure-engine tests:

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
16. Country exposure templates cover all ten countries from `docs/worldbuilding/econovaria-country-lore-v1.md`.
17. Lumenor, Xalvoria, Dravenlok, and Syndalis produce non-neutral country factor behavior when relevant shocks apply.

Additional recommended tests:

- Nested runtime input with mismatched `gameSessionId` is rejected.
- Sector rotation benefits selected sectors and pressures non-selected sectors.
- High debt plus high interest rates produces negative fundamentals pressure.
- High cash reserves reduce crisis downside.
- History is capped to `maxHistoryPoints` and remains sorted by tick.
- Explanation `finalReturnPct` matches the computed price movement within rounding tolerance.
- Movement explanations can name lore-backed country causes without duplicating source-of-truth text inside the engine.

## Implementation Roadmap

### V0: Research and design document only

This PR. No implementation code, migrations, routes, frontend changes, trading execution, portfolio accounting, ledger writes, reservations, real-world financial API integration, login/signup/licensing changes, store purchase changes, or PR #46 changes.

### V1: Pure deterministic calculation engine, no DB, no routes, no frontend

Build a pure TypeScript engine that accepts `StockMarketEngineInput`, returns `StockMarketEngineResult`, and includes unit tests for determinism, positive prices, shocks, regimes, volatility memory, liquidity, beta, game-session isolation, and complete ten-country lore-backed exposure coverage.

### V2: Game-session-scoped schema foundation

Add schema only after V1 is proven. Runtime market tables must be scoped by `game_session_id`, and portfolio/order/fill tables must also include `player_id` where player-specific. Global country lore may remain reference data; game-session market state must not.

### V3: Stock-market runner that writes game-session-scoped ticks

Evolve the placeholder runner into a scheduled or admin-triggered process that reads one game session, runs the pure engine, and writes only that game's ticks.

### V4: Frontend read integration for market data only

Expose read-only stock market rows compatible with the existing normalizer. Do not enable trading execution yet.

### V5: Basic market BUY/SELL execution

Add game-session-scoped orders, fills, holdings, cash settlement, idempotency, reservations or transaction-safe checks, ledger integration, and audit logging.

### V6: Advanced orders later

Add limit, stop, stop-limit, and trailing stop after basic execution and portfolio accounting are reliable.

### V7: Analyst forecast scoring using price ticks

Use authoritative price ticks to settle BUY/HOLD/SELL forecasts and target-price accuracy.

### V8: Admin controls for events, regimes, and market schedule

Let teachers/admins schedule regimes, author events, pause markets, and control market calendars per game session.

## Best Course of Action

Build V1 first: a pure deterministic calculation engine that produces stock market rows, price ticks, volatility state, chart history, and explanation breakdowns from game-session-scoped input.

For country exposure, build from `docs/worldbuilding/econovaria-country-lore-v1.md` rather than from duplicated hard-coded lore inside the engine. The engine should support all ten countries as meaningful exposure categories:

- Northreach: rare minerals, energy, defense, arctic logistics;
- Yrethia: shipping, insurance, freight finance, regulated trade;
- Thaloris: re-export trade, salvage, high-risk logistics;
- Solvend: AI, aerospace, research, precision engineering;
- Eldoran: agriculture, commodities, food security, internal logistics;
- Valerion: clean energy, water infrastructure, premium services, finance;
- Lumenor: education, media, diplomacy, public services, civic legitimacy;
- Xalvoria: banking, infrastructure finance, luxury industry, capital influence;
- Dravenlok: steel, machinery, defense manufacturing, heavy logistics;
- Syndalis: cybersecurity, fintech, data centers, covert market influence.

Defer:

- implementation beyond the pure engine;
- migrations;
- routes;
- frontend changes;
- trading execution;
- portfolio accounting;
- ledger writes;
- cash/share reservations;
- real-world financial APIs;
- full agent-based exchange simulation;
- full limit order book simulation;
- login/signup/licensing changes;
- store purchase changes;
- PR #46 changes.

Suggested PR title:

`docs(stocks): research market simulation engine design`

Suggested PR description:

- Research-only
- No implementation
- No migrations
- No routes
- No frontend changes
- Includes game-session isolation rule
- Uses `docs/worldbuilding/econovaria-country-lore-v1.md` as the country exposure source of truth
- Recommends first implementation scope
