# Econovaria Business System Audit and Redesign v1

**Owner branch:** `refactor/business-ux-mechanics-v1`  
**Audited baseline:** `dcb68958102f4ecbf07fe9e52d6eede4d5e692ff`  
**Roadmap scope:** Business authority, mechanics, domain boundaries, and Business-specific Player UX  
**Primary rule:** **Players make business decisions. Econovaria calculates economic outcomes.**

## Executive conclusion

The current Business feature has several strong infrastructure foundations, but its gameplay model is still closer to an editable company profile plus settlement RPCs than a coherent business simulation.

The strongest existing pieces are the server-derived Player/game scope, service-role-only database authority, idempotent RPC pattern, canonical ledger use for money movement, canonical Inventory v2 accounts/transactions, game-scoped economic context, COGS-aware physical production, existing business-loan integration, and Admin supervision surfaces.

The central defects are authority and domain-model defects, not mainly visual defects:

1. A Business has one `owner_player_id`; there is no authoritative multi-owner ledger, cap table, approval flow, dilution model, or governance model.
2. Player product creation allows a browser to define name, category, input cost, labor cost, capacity, baseline demand, and quality. Later material-flow code can create a new `game_items` economic item for that player-created product. This contradicts canonical item authority.
3. Hiring allows the browser to specify role, wage, and productivity. There is no talent market or wage engine.
4. Production is synchronous and completes immediately. There is no R&D prerequisite, recipe-unlock ownership, equipment condition, worker-role requirement, or durable production timer.
5. Procurement is product-specific abstract input purchasing, not a canonical wholesale supplier market with supplier stock, price movement, and lead time.
6. Settlement accepts macro multipliers from an Admin request instead of resolving canonical economic state. Demand is driven mainly by a user-defined base-demand field plus price and coarse macro multipliers.
7. Taxes are effectively a configurable gross-revenue tax in settlement rather than entity/tax-classification-aware taxable-income logic.
8. Valuation is currently a simple revenue/profit formula. Reputation is largely a profit signal. Neither provides an explainable operating-quality model.
9. Acquisition is implemented as a direct owner replacement with a buyer-entered price and no ownership vote, valuation band, or cap-table settlement.
10. The Business cash account is represented through the Player ledger under the current owner. This was workable for single-owner businesses but is not a durable authority boundary for ownership continuity.
11. Business Inventory has converged substantially onto canonical Inventory v2, but `business_inventory` remains as a compatibility/read projection and parts of the older abstract-product path still depend on it.
12. Contracts, World, Markets, and Campaign are not yet connected through clear public Business-domain orchestration seams. The settlement/admin path still permits passed-in economic parameters rather than consuming canonical policy/world projections.

The redesign should preserve the good transactional foundations and replace the editable economic state with explicit decisions, immutable ledgers, server calculations, and bounded state machines.

---

## 1. Current Business architecture map

```text
Player Business page
  -> Player endpoint registry / Business route adapter
  -> Player same-origin web-session BFF
  -> player-api / compatibility composition
  -> business-banking HTTP handler
  -> Business repository + service-role RPC calls
  -> Postgres tables / RPCs

Admin Business V2
  -> Admin same-origin BFF
  -> admin-api business operations
  -> Business tables / privileged RPCs

Business money
  -> canonical Player ledger/account balances
  -> Business account encoded as business:<business_key>

Business inventory
  -> canonical economic party + Inventory accounts/holdings/transactions (v2)
  -> business_inventory compatibility/read projection
```

### KEEP

- Same-origin Player/Admin BFF boundaries.
- Server-derived Player and game scope.
- Internal UUID privacy in browser contracts.
- Service-role database authority behind authenticated application boundaries.
- Idempotent RPC commands and audit records.
- Forward-only migration model.

### CHANGE

- Move Business authorization from `business_entities.owner_player_id = current_player` to an authoritative ownership/governance policy that resolves the Player's active position and voting/management rights.
- Replace generic RPC dispatch from browser-defined economics with typed commands representing decisions.
- Replace Business cash ownership-by-player semantics with a stable business economic-party/account authority while preserving canonical Banking/ledger rules.

---

## 2. Current Business mechanics map

Current loop:

```text
Create or acquire business
  -> submit arbitrary product economics
  -> teacher reviews product
  -> buy abstract input or configure material flow
  -> optionally contribute Player inventory
  -> hire arbitrary employee / choose wage + productivity
  -> run immediate production
  -> choose price
  -> teacher/system settles cycle
  -> demand converts inventory to revenue
  -> wages/tax debit
  -> revenue/profit/valuation/reputation update
```

This loop contains real inventory and money effects, but too many economically important variables originate from forms rather than the simulation.

### KEEP

- Player chooses production quantity.
- Player chooses selling price within server bounds.
- Production consumes actual inputs and finished-goods inventory can be sold.
- Sales credit real Business cash.
- Payroll and taxes debit real Business cash.
- Economic failure can move a business toward distress.

### CHANGE

- Product definition -> canonical recipe selection/unlock.
- Input purchase -> wholesale procurement.
- Hiring -> candidate selection from a talent market.
- Production -> scheduled production job with prerequisites/capacity.
- Settlement -> deterministic demand engine using canonical World/economic state and competition.

### REMOVE

- Player-authored input costs, labor costs, capacity, base demand, quality, employee productivity, and wage as economic authority.
- Player creation of new canonical economic items.
- Direct acquisition inside formation.
- Direct status dropdown for restructuring/recovery/closure.

### ADD

- Entity formation state machine.
- Ownership/governance state machines.
- R&D, recipes, wholesale suppliers, equipment, talent market, demand competition, tax profiles, valuation breakdown, distress/liquidation.

---

## 3. Current database ownership model

`business_entities.owner_player_id` is the canonical ownership field today. A Player read filters businesses by this one UUID and treats more than one active business as an error. There is no multi-owner table or immutable ownership transaction ledger.

### CHANGE

Use:

- `business_ownership_positions` for current authoritative positions;
- `business_ownership_transactions` for immutable ownership history;
- entity-specific ownership type (`owner`, `partnership_interest`, `membership_interest`, `share`);
- integer units and voting units as authority;
- percentages derived server-side, never stored as user-authored truth;
- corporation share-structure invariant (`authorized >= issued >= outstanding`, treasury reconciled);
- legacy `owner_player_id` retained only as a compatibility/controller projection until all old consumers are cut over.

---

## 4. Current API/BFF map

Current Player Business mutation routes include:

- create/acquire Business;
- submit product;
- purchase input;
- run production;
- set product price;
- hire employee;
- terminate employee;
- transition Business status.

The handler validates types/ranges but forwards player-supplied economic state to database RPCs.

### CHANGE

New API commands should express intent only, for example:

- formation create / owner approve / owner reject / capitalize;
- ownership transfer offer / accept;
- capital raise proposal / vote / settle;
- distribution proposal / vote / settle;
- acquisition offer / vote / settle;
- dissolution proposal / vote;
- R&D start;
- talent candidate hire;
- wholesale order;
- equipment maintain/repair;
- production start;
- price set;
- Business loan application through Banking.

Calculated outcomes must not be accepted in payloads.

---

## 5. Banking integration

### KEEP

- Ledger-based economic mutation.
- Idempotent money commands.
- Existing business-loan capability and repayment-account binding.

### CHANGE

The business must have a stable money-owning identity that survives an owner exit/acquisition. Owner-to-business and business-to-owner transfers must occur only through named mechanisms: contribution, equity settlement, distribution/dividend, acquisition proceeds, liquidation proceeds, loan funding/repayment, or explicit correction authority.

Direct owner wallet behavior is not an acceptable long-term Business account model.

---

## 6. Inventory / Store / Crafting integration

The v2 economic asset foundation is the correct direction: canonical `game_items`, `economic_parties`, `inventory_accounts`, `inventory_holdings`, and append-only `inventory_transactions` exist and Business production already uses them for physical goods.

### KEEP

- Canonical Inventory authority.
- Business warehouse and finished-goods accounts.
- Atomic inventory transactions.
- Cost basis flowing into finished goods.

### REMOVE

- Business-created `game_items` outputs.
- Legacy abstract pseudo-items such as `input:<product>` as the future model.
- A parallel Business-only inventory authority.

### ADD

- Canonical production recipes/BOMs targeting existing `game_items`.
- Business recipe unlocks via R&D.
- Equipment as canonical persistent inventory/assets.
- Wholesale suppliers that deliver canonical items into Business Inventory.

Store remains the Player retail store. Wholesale is a Business procurement surface, not a relabeled Player Store.

---

## 7. Contracts integration

No complete canonical Business fulfillment seam currently makes Contracts consume Business finished inventory and settle Business revenue as a first-class workflow.

### ADD

Contract fulfillment should call the Contracts owner for lifecycle validation, Inventory owner for item reservation/transfer/consumption, and Banking/Economy owner for settlement. Business orchestrates capability and eligibility; it must not directly mutate Contract tables.

---

## 8. World / Markets / Campaign integration

The database has an economic-context resolver and game settings, but Admin settlement currently accepts inflation, exchange, interest, and difficulty parameters from the request.

### CHANGE

Business economic engines should resolve canonical game/country policy and World state at execution time. Campaign/World events should change policy/supply/demand inputs through their owning domains/configuration, not by patching individual businesses.

Competition should be game-scoped. No classroom may read or affect another classroom's companies.

---

## 9. Current valuation model

Current settlement valuation is effectively:

```text
0.35 * cumulative revenue
+ 3.0 * positive cumulative profit
```

floored at zero.

### CHANGE

Replace with an explainable multi-factor model using normalized recent operating earnings/cash flow, productive assets and inventory, net cash/debt, capacity/capability, contracts, reputation/reliability, recent growth, and macro/risk adjustment. Return both value and reason-coded contributions so the UI can explain changes.

R&D contributes through unlocked productive capability rather than dollar-for-dollar spending.

---

## 10. Current sales/revenue model

The current system correctly caps units sold by available finished inventory, but its demand source is too player-authored. Base demand is a product form field. Settlement uses a simple price factor, business demand index, exchange factor, and difficulty multiplier.

### CHANGE

Canonical demand should be derived from item/category configuration plus price elasticity, World/business cycle, competitors in the same game, availability, scarcity, reputation, and bounded policy modifiers.

```text
realized_demand = canonical_base_demand
                * price_response
                * cycle_response
                * competitive_share
                * reputation_response
                * scarcity/policy modifiers

units_sold = min(available_finished_inventory, realized_demand)
```

Every factor must be bounded and testable.

---

## 11. Current workforce model

Employees can be created manually with a player-supplied role, wage, and productivity multiplier.

### REMOVE

- Manual employee construction.
- User-authored productivity.
- User-authored market wage.

### ADD

- Weekly game-scoped candidate pool from canonical archetypes.
- Role-relevant skills only.
- Wage expectation calculated from role base wage, skill, experience, scarcity, country/location, and cycle/labor-market state.
- Employee effects on production, R&D, sales, logistics, management/capacity.
- Retention risk based on employee wage relative to current comparable market wage and business conditions.

---

## 12. Current ownership/equity model

Single owner only. Acquisition swaps `owner_player_id` and manually moves the old owner's Business account balance to the buyer's owner-bound Business account.

### REMOVE

That acquisition model must not survive the multi-owner cutover.

### ADD

- Initial ownership proposal with unanimous approval.
- Position ledger.
- Transfer offers with atomic funds/ownership settlement.
- Capital raises and dilution.
- Distributions/dividends.
- Voting.
- Whole-company acquisition distinct from individual position sales.

---

## 13. Current company formation model

Current formation is one form and immediately activates a Business if funded. Entity options are sole proprietorship, partnership, corporation, and cooperative. LLC is absent. Industry is free text. Capitalization is typed by the Player. Acquisition is overloaded into the same RPC.

### CHANGE

Guided formation:

```text
Entity -> Activity -> Proposed owners -> Ownership approval -> Capitalization -> Business bank -> Operational
```

Supported initial legal entities:

- Sole Proprietorship
- Partnership
- LLC
- C Corporation

Remove cooperative from the default Player formation selector unless separately justified by curriculum. S-corp is not a fifth legal entity; reserve it for tax-election architecture.

---

## 14. Current legal-entity model

Entity type is presently mostly metadata. It does not meaningfully control ownership terminology, liability, governance, fundraising, tax classification, distributions, or liquidation.

### CHANGE

Entity policy becomes server-owned configuration with game consequences. Tax classification is a separate field. LLC default classification depends on member count. C corporation has a share structure and entity-level tax profile. Sole proprietorship cannot issue partial equity.

---

## 15. Significant Business UX problems

1. Business creation is a dense form instead of a formation workflow.
2. Legal entity is an unexplained dropdown.
3. Industry is free text rather than a canonical activity selector.
4. Product creation exposes economic-engine variables.
5. Employee creation exposes wage/productivity variables.
6. Business closure/restructure is a direct form action instead of governance/failure workflow.
7. Information architecture is disclosure/form driven rather than task/module driven.
8. It does not clearly separate cash, profit, inventory, working capital, debt, and valuation.
9. It does not explain why valuation/demand/reputation changed.
10. It lacks pre-confirmation consequence previews for dilution, distributions, acquisition, and dissolution.
11. It lacks a prioritized attention queue for blocked production, payroll, inventory risk, retention, R&D, debt, and demand conditions.

### ADD

Business workspace modules: Overview, Production, R&D, Wholesale, Inventory/Equipment, Workforce, Sales, Contracts, Finance, Ownership/Governance, Activity.

---

## 16. Security/authority problems

High severity:

- Browser defines product input/labor costs, capacity, demand and quality.
- Browser defines employee wage and productivity.
- Admin settlement request supplies macro multipliers.
- Single-owner authorization is not sufficient for future multi-owner governance.
- Acquisition can be initiated as a direct purchase with a browser-supplied amount.

Good existing controls to preserve:

- Player/game identity derives from authenticated server scope.
- Business RPCs are service-role only.
- Idempotency and audit records are common.
- Game scope appears on core Business tables.

---

## 17. Cross-game isolation risks

Core rows are game-scoped and many FKs/indexes preserve scope. The major forward risk is economic-engine implementation: competition, candidate pools, supplier pools, pricing snapshots, R&D completion, production completion, and valuation recalculation must always filter by `game_session_id` and never share game-derived state through global mutable rows.

Use global/template definitions only as immutable references; instantiate or resolve game-scoped runtime state separately.

---

## 18. Client-authoritative values that must be removed

Current Player-originating values that should not remain authoritative:

- input cost;
- labor cost;
- product capacity;
- baseline demand;
- quality score;
- employee wage expectation;
- employee productivity;
- employee skill;
- acquisition valuation/price without valuation banding;
- arbitrary industry code;
- economic settlement multipliers.

Selling price, intended production quantity, financing amount, ownership offer consideration, and other strategy variables may remain Player decisions but require constrained, server-validated bounds.

---

## 19. Legacy/duplicated implementations

### Keep temporarily as compatibility only

- `business_inventory` projection while all readers are cut to canonical Inventory accounts.
- legacy abstract product/production paths only long enough to migrate existing game data safely.
- `owner_player_id` as a compatibility/controller projection during ownership-ledger cutover.

### Remove after migration gates

- arbitrary `business_product` game-item creation.
- legacy product economics as Player-authored fields.
- owner-bound business cash transfer-on-acquisition behavior.
- direct Business status form.

Do not add another compatibility layer around these; cut consumers to canonical authorities and then retire them.

---

## 20. Stale Business branches / PRs

### `backup/admin-ui-v2-business-preconvergence-20260810`

Diverged heavily from current `main` and is hundreds of commits behind. It contains old Admin Business V2 source work. Treat as a historical donor only; do not merge wholesale.

### `fix/business-acceptance-mutation-sync-20260817` / PR #626

Open but behind current `main`. Its useful logic is narrow: wait for the Player's own mutation-reconciliation completion before persistence assertions. Reuse that testing idea if the redesigned Business browser acceptance still needs it, then supersede/close the stale PR rather than merging old branch history.

### PR #625

Already merged. Keep its stronger durable idempotency assertion: verify persisted Business count and authoritative balance instead of relying only on a transport `replayed` marker.

### Prior Business Banking PR family

Historical Business Banking work is already represented in current `main`. Do not re-merge the donor branches. Preserve only current valid invariants and replace obsolete mechanics through forward migrations.

---

# Research synthesis

The redesign uses real-world concepts as teaching constraints, not as a mandate to reproduce professional legal/accounting software.

## Entity structure and tax classification

Authoritative IRS/SBA material confirms the educational distinctions used here:

- legal structure affects liability, taxes, administration and fundraising;
- a single-member domestic LLC is generally disregarded by default for federal income tax while a multi-member LLC defaults to partnership treatment unless an election changes classification;
- S-corporation treatment is an election/status, not a generic fifth legal entity;
- partnerships generally pass income/loss through to partners;
- C corporations are separate taxpayers and dividend distributions can create a second shareholder-level tax layer.

References:

- https://www.irs.gov/faqs/small-business-self-employed-other-business/entities/entities-3
- https://www.irs.gov/businesses/small-businesses-self-employed/llc-filing-as-a-corporation-or-partnership
- https://www.irs.gov/businesses/partnerships
- https://www.irs.gov/businesses/small-businesses-self-employed/forming-a-corporation
- https://www.sba.gov/business-guide/launch-your-business/choose-business-structure

Econovaria will use fictional-country configurable rates rather than copying U.S. rates.

## Equity, distributions, and governance

Delaware corporate/LLC law is used only as an authoritative conceptual reference for the simplified mechanics:

- corporations authorize and issue shares for consideration;
- LLC ownership is a membership interest and assignment/admission rules can differ from corporate shares;
- distributions are constrained by solvency/capital rules;
- dissolution winds up liabilities before residual owner distribution.

References:

- https://delcode.delaware.gov/title8/c001/sc05/index.html
- https://delcode.delaware.gov/title6/c018/sc03/
- https://delcode.delaware.gov/title6/c018/sc06/index.html
- https://delcode.delaware.gov/title6/c018/sc07/index.html
- https://delcode.delaware.gov/title6/c018/sc08/

Econovaria's 75% acquisition/dissolution voting threshold and 70%-130% acquisition band are game rules, not representations of a universal legal threshold.

## Insolvency and liquidation

U.S. Courts' Bankruptcy Basics reinforces the key educational ordering: liquidation converts assets to cash and distributes proceeds to creditors according to priority; equity is residual. Econovaria should model that ordering without reproducing bankruptcy procedure.

Reference: https://www.uscourts.gov/court-programs/bankruptcy/bankruptcy-basics/process-bankruptcy-basics

## Labor market

BLS occupational wage data and JOLTS support modeling wage expectations by occupation, experience/skill proxy, geography and labor-market tightness. Wage statistics vary materially by occupation and experience; job-openings rates are a labor-market tightness signal.

References:

- https://www.bls.gov/oes/earnings.htm
- https://www.bls.gov/jlt/jltover.htm

## Supply chain and production

NIST manufacturing guidance supports exposing inventory, supplier availability, lead times and bottlenecks as linked operating decisions rather than treating inputs as infinite. Inventory buffers address uncertainty, while leaner supply chains trade inventory cost for disruption risk.

References:

- https://www.nist.gov/el/applied-economics-office/manufacturing/supply-chain
- https://www.nist.gov/mep/supply-chain
- https://www.nist.gov/feature-stories/how-small-manufacturers-can-develop-risk-management-strategies-their-supply-chains

## Business-cycle integration

Federal Reserve explanations support connecting credit conditions, aggregate demand, employment and wage/cost pressure. The simulation should therefore let recessions/expansions affect demand, credit, wages and labor availability through bounded factors rather than one arbitrary difficulty scalar.

References:

- https://www.federalreserve.gov/faqs/money_12856.htm
- https://www.federalreserve.gov/monetarypolicy/monetary-policy-what-are-its-goals-how-does-it-work.htm

## Simulation design

Recent systematic review literature on business simulation games supports a decision/consequence structure: simulations are most educational when learners repeatedly make managerial decisions in an interactive environment and observe the resulting operating/economic consequences. That supports the central Econovaria rule: **students select decisions; the model resolves outcomes**.

Reference: https://doi.org/10.3390/educsci15020168

---

# Target architecture

```text
Player decision
  -> Player BFF
  -> Business application command
  -> Business policy / state machine
  -> canonical domain ports
       Banking/Economy
       Inventory
       Contracts
       World / Markets / Campaign read interfaces
  -> single transactional settlement where money/items/equity must move together
  -> immutable Business activity event
  -> derived Business read model
```

Rules:

- Browser payloads contain intent, not calculated outcome.
- Business never directly writes another domain's tables as a shortcut.
- Ownership, money, inventory and scheduled completion are server-authoritative.
- Each retry is idempotent.
- All runtime rows are game-scoped.
- Read models may aggregate domains but do not become write authority.

---

# Implementation plan

## Phase A — Authority and data model

1. Add legal-entity policy and tax-classification fields.
2. Add formation proposal + owner approval model.
3. Add current ownership positions and immutable ownership transaction ledger.
4. Add C-corp share-structure invariants.
5. Add stable Business economic-party/cash-account authority through Banking-compatible interfaces.
6. Add canonical industry/activity configuration.
7. Backfill legacy single-owner businesses into the ownership ledger.
8. Preserve compatibility projections until consumers cut over.

Acceptance: sole, partnership, LLC, C corp formation; unanimous initial approvals; exact 100% ownership; wrong-game/wrong-player rejection; browser cannot forge positions.

## Phase B — Governance and ownership transactions

1. Ownership transfer offers + atomic settlement.
2. Capital raises + dilution.
3. Distributions/dividends + solvency checks.
4. Acquisition offers bounded to 70%-130% of current valuation with >=75% voting approval.
5. Dissolution proposal/winding-up state machine.
6. Entity conversion state machine.

## Phase C — Productive economy

1. Canonical recipe/BOM registry using existing `game_items`.
2. Business recipe unlock ledger.
3. R&D projects with durable `completion_at`.
4. Wholesale supplier catalog/state, daily prices, stock and replenishment.
5. Canonical Business Inventory categories.
6. Equipment capability/condition/maintenance.
7. Scheduled production jobs using Inventory reservations and canonical outputs.

## Phase D — Workforce

1. Canonical role/archetype definitions.
2. Weekly candidate pool generation by game.
3. Server wage calculation using role/skill/experience/scarcity/cycle.
4. Hiring from candidate pool only.
5. Employee role effects.
6. Retention-risk and explained turnover process.

## Phase E — Sales and economic engine

1. Canonical demand parameters on items/categories.
2. Bounded price response/elasticity.
3. Game-scoped competitor allocation.
4. World/cycle/reputation/scarcity factors.
5. Inventory-to-sales settlement through Inventory + Banking.
6. Behavior-derived reputation events.
7. Business Contract fulfillment orchestration.

## Phase F — Finance and failure

1. Country/game Business tax policy profiles.
2. Taxable-income calculation and pass-through/corporate treatment.
3. Debt integration and protected obligations.
4. Explainable valuation engine.
5. Distress -> insolvency -> restructure/forced liquidation.
6. Creditor-first liquidation and residual owner distribution.

## Phase G — Business UX convergence

Replace the form stack with the Business workspace after the underlying commands/read models are authoritative. Entity comparison cards, constrained selectors, decision previews, governance voting, attention queue, valuation/tax breakdown, production/R&D/workforce/procurement modules, and immutable Activity feed all consume the new read model.

---

# Scalability design

- No per-Business cron jobs.
- One bounded scheduler scans due R&D/production/supplier/workforce/settlement rows using indexed due timestamps and game partitions/batches.
- Deterministic daily/weekly snapshot keys make regeneration idempotent.
- Competition calculations are partitioned by game + item/category and use bounded candidate sets.
- Read models aggregate by one business/game and avoid loading every company globally.
- Supplier/candidate refreshes are generated per game/time bucket, not per browser.
- UI subscribes/revalidates resources; it never runs the economic engine.

---

# Definition of architectural success

The Business feature is no longer considered an editable profile once this program converges. A Player's writable inputs should read like managerial decisions: entity, partners, capital, financing, recipe/R&D choice, candidate, procurement quantity/timing, production quantity, selling price, contract commitment, governance vote, distribution or acquisition decision.

Revenue, profit, taxes, wages, productivity, demand, inventory creation, ownership percentages after settlement, valuation, reputation, production/R&D completion and macro conditions must be consequences resolved by Econovaria.
