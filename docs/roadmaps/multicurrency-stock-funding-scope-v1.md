# Multi-Currency Stock Market Funding Scope v1

**Roadmap item:** `BUSINESS-V2-10A4C3`  
**Status:** `SCOPE_ONLY` — no C3 runtime implementation or certification claimed  
**Branch:** `feat/multicurrency-stock-funding-v1`  
**Parent branch:** `feat/multicurrency-marketplace-funding-v1`  
**Parent draft PR:** #675  
**Exact parent C2 implementation and verification source:** `9b95009dd7e73ed70987a0a99716d3ee32f2662d`  
**Exact parent C2 clean documentation handoff/base:** `ba033ac4a7759d068233513431891fc9de3ae95a`  
**Production deployment authorized:** No

## Decision

C3 integrates the certified C0 purchase-funding authority into the existing immediate Stock Market order path while preserving Financial Markets ownership of stock assets, price ticks, market-session rules, order identity, fill identity, holdings, cost basis, realized P&L, and trading replay.

The exact live parent supports immediate market fills only. C3 does not create an order book, limit-order execution, partial fills, queued orders, cash/share reservations across ticks, time-in-force, short selling, margin, options, or external-market connectivity.

The resulting player contract is:

- every runtime stock asset has one immutable authoritative listing currency;
- the listing currency is derived from the issuer country’s canonical game currency when the runtime asset is materialized and is then frozen for that asset;
- an immediate buy may be funded from one, two, or three Player-owned active Checking accounts through C0;
- selected buy allocations are positive amounts in the stock listing currency and must equal the exact quoted gross value;
- same-currency funding uses rate `1`, no spread, and no FX facility;
- foreign-currency funding uses C0 retail checkout policy v1: accepted B1 fixing, 1.00% customer-adverse spread, no separate checkout fee, source-minor-unit ceiling, and B2 clearing/reserve/liquidity authority;
- an immediate sell credits one Player-selected active Checking account in the stock listing currency through balanced B2 Banking settlement;
- buy funding or sell proceeds, holdings, order, trade, cost basis, realized P&L, and immutable evidence commit atomically;
- matching replay returns the original completed result without moving money or shares twice;
- a stale price, closed market, invalid account, insufficient funding, insufficient shares, hold race, FX-liquidity exhaustion, or market-liquidity shortfall fails closed without partial mutation.

## Verified parent-state findings

1. `game_session_stock_assets` has authoritative per-game prices and issuer `country_code`, but no listing-currency column.
2. `stock_orders` and `stock_trades` support immediate `market` orders only. Their current terminal states are `filled` or `rejected`; there is no live open-order or partial-fill lifecycle.
3. The public Player order command accepts ticker, expected price, side, quantity, and idempotency intent. It has no source-account selection, funding allocation, funding quote, destination account, or FX disclosure.
4. The Player route resolves ticker and Player/game scope server-side and rejects internal stock UUID injection. Those boundaries are retained.
5. The current repository calls `execute_stock_market_order_calendar_gated`, which preserves replay while rejecting new immediate fills when the exchange is closed.
6. The historical cash path uses `account_balances` and `record_player_ledger_entry`; earlier migrations also encoded ECO or the Player’s country currency rather than a stock-owned listing currency.
7. Immediate buys increase holdings without a named monetary counterparty; immediate sells credit Player cash without a named market-liquidity debit. C3 must replace that unbalanced commercial boundary with canonical B2 accounts and transactions.
8. The Player Market UI formats every stock price in `session.currencyCode`, shows one aggregate available-Checking value, and estimates a 0.25% fee that the current trading authority does not charge.
9. The UI exposes a limit-order selector, but its own flow states that limit-order backend integration is pending and sends no limit order. C3 must not imply that limit execution exists.
10. Existing idempotency, no-short-selling, holdings, average-cost, realized-P&L, exchange-calendar, price-tick, public-ticker, privacy, and game-isolation behavior are retained requirements.

## Authority boundaries

### Financial Markets owns

- global stock-template identity and issuer metadata;
- per-game runtime stock-asset identity, ticker, issuer country, listing currency, active state, and price state;
- price ticks, market session, game timezone, exchange calendar, and stale-price decision;
- immediate market-order identity and lifecycle;
- immediate fill/trade identity;
- holdings quantity, average cost, realized P&L, and no-short-selling rule;
- buy/sell commercial amount and immutable order/fill evidence;
- market-liquidity account selection and market-liquidity policy;
- stock-order replay and conflict semantics;
- stock-root-first lock ordering;
- Player Stock API, DTO, UI, and browser behavior.

### C0 owns buy funding

- immutable `pfq_...` funding-quote identity and lifecycle;
- eligibility of one to three Player-owned active Checking accounts;
- exact positive listing-currency allocations and funded-total equality;
- accepted B1 fixing, C0 1.00% retail spread, source debit, effective rate, minor-unit ceiling, expiry, and quote balance snapshots;
- settlement-time source-account, hold, balance, fixing, policy, facility, target-account, and funding-context revalidation;
- private atomic funding composition;
- immutable `pfr_...` funding receipt and balanced B2 funding transaction.

### B1 and B2 own

- currency registry and minor-unit precision;
- daily game-local 08:00 fixing and fixing history;
- canonical Player and system bank-account identity;
- posted, held, and available balances;
- balanced Banking transactions and journals;
- FX clearing, reserve, liquidity caps, facility draws, and exact reversals;
- direct monetary-DML denial.

C3 must not recreate C0 pricing, B1 cross-rates, B2 balances, holds, account identity, clearing, reserve, or facility capacity in Stock tables, TypeScript, or browser code.

## Listing-currency authority

- `stock_templates` gains one authoritative `listing_currency_code` compatible with the template’s official issuer country.
- `game_session_stock_assets` gains one immutable `listing_currency_code` copied from the template or resolved from the matching game-scoped country profile at materialization.
- Existing runtime assets are backfilled deterministically from their issuer `country_code` and the game’s canonical country currency. A row that cannot be resolved fails migration rather than receiving a guessed browser/home currency.
- Listing currency is not recomputed when a Player moves country or when a Player selects a funding account.
- New prices, orders, fills, holdings basis, market-liquidity accounts, and Player display use the asset listing currency.
- Historical orders and trades retain their stored `cash_currency_code` and numeric evidence. They are not rewritten into fabricated C3 funding transactions.
- Existing holding average cost is interpreted on the asset price scale and receives the backfilled asset listing currency as compatibility metadata. No historical cash ledger row is rewritten.

## Immediate market buy quote

C3 introduces a short-lived buy quote because the browser must review both the exact stock price and any C0 FX funding before settlement.

The quote command must:

1. derive game, Player, and active Player session server-side;
2. resolve matching replay before mutable interpretation;
3. resolve the public ticker to one active runtime stock asset;
4. require the authoritative exchange session to be open;
5. capture the exact current price, latest tick index, listing currency, quantity, and gross value;
6. validate gross value against listing-currency minor-unit precision;
7. resolve the named game-scoped Stock Market liquidity Checking account in the listing currency;
8. create or resolve one immutable Stock buy quote;
9. derive a deterministic C0 funding context from the quote and exact commercial facts;
10. create one C0 purchase-funding quote from one to three Player-selected Checking accounts;
11. bind Stock and funding quotes immutably;
12. return public ticker, quantity, price, gross value, listing currency, expiry, selected accounts, rate evidence, source debits, and rounding disclosures.

The funding context binds at minimum:

- game and Player;
- Stock buy-quote public identity;
- runtime stock-asset public identity/ticker;
- issuer country and listing currency;
- exact price and latest tick index;
- quantity and gross value;
- market-liquidity target account;
- exchange/session identity;
- quote expiry.

The usable quote expiry is the earlier of the Stock quote expiry and C0 funding-quote expiry. C3 does not refresh either quote in place.

## Immediate market buy settlement

A successful buy is one PostgreSQL transaction.

After replay resolution, the authoritative mutable order is:

1. runtime stock asset / price root;
2. Stock buy quote;
3. C0 funding quote;
4. C0/B2 source accounts, holds, FX clearing/reserve, and facility evidence in canonical B2 order;
5. Stock Market liquidity account;
6. Player holding;
7. Stock order, trade, funding receipt, cost-basis update, and public response.

Settlement must:

- prove the exchange remains open;
- prove current asset price and latest tick index still equal the immutable quote;
- prove the Stock quote and C0 quote describe the same Player, ticker, currency, exact gross value, and liquidity recipient;
- compose C0 funding to the named Stock Market liquidity account;
- increase the Player holding exactly once;
- calculate average cost in the asset listing currency;
- create one Stock order and one trade linked to the funding receipt and B2 transaction;
- consume both quotes exactly once;
- commit every effect together or roll every effect back.

A changed price or tick does not receive slippage treatment in C3. It returns a stale-price conflict and requires a new quote.

## Immediate market sell settlement

A sell remains one immediate command and does not use C0 purchase funding.

The Player submits public ticker, quantity, one destination `bac_...` Checking-account key, expected price/tick evidence, and bounded idempotency intent. The destination account must be owned by the Player, active, Checking, same-game, and denominated in the stock listing currency.

After replay resolution, lock order is:

1. runtime stock asset / price root;
2. Player holding;
3. Stock Market liquidity account and Player destination account in canonical B2 order;
4. Stock order, trade, Banking transaction, holding/P&L update, and public response.

Settlement must debit the named Stock Market liquidity account and credit the Player destination account by the exact gross value through one balanced B2 transaction. Insufficient market liquidity fails closed. C3 must include a trusted, game-scoped liquidity initialization/reconciliation path; it must not permit negative balances or mint sell proceeds through a direct Player ledger credit.

## Market-liquidity account

Each game and active listing currency uses one named B2 system Checking account:

`stocks.market-liquidity`

The account is the monetary counterparty for the existing synthetic immediate-fill market:

- buys credit the account through C0 funding;
- sells debit the account through B2 transfer;
- it is not a Player wallet, Stock shadow balance, or FX facility;
- it cannot go negative;
- its initialization and any later recapitalization are trusted, explicit, idempotent, game-scoped, and auditable;
- C3 certification must prove conservation across buys, sells, replay, failure, and concurrent access.

C3 does not introduce issuer share inventory or a Player-to-Player order book. The current synthetic share-liquidity model remains bounded compatibility behavior; a future order-book project must establish a separate scope.

## Evidence model

C3 preserves Stock-owned public order and trade identities and adds immutable nullable compatibility references for new funded execution, including:

- listing currency;
- Stock buy-quote identity and request hash;
- C0 funding quote and receipt;
- C0 funding Banking transaction;
- market-liquidity account;
- sell destination account;
- sell-proceeds Banking transaction;
- exact price/tick snapshot;
- evidence-family discriminator.

Legacy orders remain readable under the legacy evidence family. New C3 orders must satisfy the complete C3 evidence family and must not populate fabricated representative ledger-entry fields.

## Cost basis and realized P&L

- New holding average cost is denominated in the asset listing currency.
- New buy basis equals exact listing-currency gross value divided by acquired quantity under authoritative precision rules.
- New sell realized P&L uses the listing-currency execution price and listing-currency average cost.
- Player portfolio totals spanning multiple listing currencies must not be arithmetically summed as though they were one currency. C3 must either present per-currency subtotals or use a separately identified read-only valuation conversion with accepted B1 fixing evidence.
- The browser may not author or override average cost, cost currency, realized P&L, or valuation rates.

## Player API and UI

The buy surface is separated into quote and confirm operations. The browser may submit only public ticker, quantity, one to three public Checking-account keys, exact listing-currency target allocations, and bounded idempotency intent.

The sell surface may submit only public ticker, quantity, one destination public Checking-account key in listing currency, expected public price/tick evidence, and bounded idempotency intent.

The Player Market UI must:

- display each asset in its listing currency rather than `session.currencyCode`;
- display account currency, posted, held, and available amount from authoritative Banking reads;
- permit one to three Checking-account allocations for buys through selectors/buttons, not free-form account IDs;
- show funded total, remaining amount, same-currency/FX treatment, fixing time, rates, source debit, and rounding disclosure;
- separate buy quote from final confirmation;
- show sell destination account and exact listing-currency proceeds;
- show immutable order/trade and Banking/funding receipt evidence after success;
- hide or clearly disable limit-order execution because no live limit-order authority exists;
- remove the unbacked 0.25% estimated fee unless a later server-owned fee policy is separately authorized;
- handle closed market, stale price, insufficient shares, insufficient balance, holds, FX liquidity, market liquidity, quote expiry, replay, and refresh recovery specifically;
- preserve responsive, keyboard, focus, reduced-motion, screen-reader, and public-key privacy behavior.

## Explicit exclusions

C3 must not:

- add limit orders, an order book, partial fills, queued orders, time-in-force, cancellation, or expiry;
- add short selling, margin, lending, derivatives, dividends, splits, or corporate actions;
- alter the price engine, stock-tick scheduler, Story shock integration, or exchange-calendar policy;
- publish Business IPO securities; that remains Phase 14;
- modify Store or Marketplace settlement;
- add Business-owned foreign Checking accounts or Business treasury FX;
- change B1 fixing calculations or the game-local 08:00 fixing schedule;
- change B2 standard/instant bank-FX pricing or timing;
- change C0 retail spread or maximum-three-account policy;
- create a Stock wallet, cash wallet, Savings purchase path, or parallel balance table;
- merge any stacked PR;
- deploy to staging or production;
- install or alter schedulers;
- mutate secrets;
- run staging/production SQL or live database mutations.

Business treasury/procurement remains C4, final Store/FX convergence remains 10A.4D, and Phase 11 remains closed.

## Required proof before C3 certification

### Structural and security

- Own PR-bound exact-path authority with production deployment/mutation/secrets disabled.
- Complete zero-to-head migration replay twice and rebuilt-schema lint/advisors.
- Fixed search paths, least-privilege grants, RLS/forced RLS for new public evidence, and direct-DML denial.
- No public payload contains internal UUIDs, private hashes, trusted prices/rates, or browser-authored monetary outcomes.
- No parallel FX, Banking, balance, hold, Stock asset, order, trade, or holding authority.
- Legacy/current monetary evidence families are mutually exclusive and schema-enforced.

### Asset/listing currency

- Template and runtime asset listing-currency population, immutability, issuer-country compatibility, and fail-closed backfill.
- Public market board, asset detail, charts, order review, receipts, holdings, and P&L display listing currency correctly.
- Historical order/trade evidence remains readable and unchanged.

### Buy quote and settlement

- One-, two-, and three-account funding with all-same, mixed same/foreign, and all-foreign source currencies.
- Exact price/tick snapshot, listing-currency gross value, and funded-total equality.
- Exact market-liquidity credit, holding increase, order/trade creation, funding receipt, and average-cost update once.
- Matching quote/settlement replay and conflicting reuse.
- Closed-market, stale-price/tick, balance, hold, fixing, FX-facility, and quote-expiry failures.
- Complete rollback after funding, holding, order, trade, and receipt stages.
- Opposite source-account selection order proving canonical B2 lock order and no deadlock.

### Sell settlement

- Exact holding decrement, realized P&L, market-liquidity debit, and selected Player Checking credit once.
- Matching replay and conflicting reuse.
- Insufficient shares, wrong-currency destination, closed market, stale price/tick, insufficient market liquidity, and concurrent sell races.
- Complete rollback after Banking, holding, order, and trade stages.

### Connected and retained gates

- Authenticated same-origin Player API tests in at least two games.
- Connected desktop/mobile Chromium coverage for listing currency, account selection, split allocation, quote disclosure, confirmation, receipt, sell destination, errors, replay, responsive layouts, keyboard behavior, and accessibility.
- Retained B1, B2, C0, C1, C2, Stock runner, Stock reads, Portfolio, exchange calendar, required timezone, Story market shocks, Database Replay, Backend Typecheck, Player Terminal, Repository Quality, Supply Chain Security, public-payload UUID denial, and two-game isolation.

## Completion boundary

C3 may become `IMPLEMENTED_NOT_MERGED` only after one exact implementation SHA passes the permanent C3 gate and the full required inherited matrix, and a durable implementation handoff records that source. A later documentation-only handoff must not replace the tested implementation SHA.

C4 must not begin until the C3 handoff exists. C3 certification authorizes development continuation only; it does not authorize merge, deployment, scheduler installation, secret mutation, staging/production SQL, or live database mutation.
