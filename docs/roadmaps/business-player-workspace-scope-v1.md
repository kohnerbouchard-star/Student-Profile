# Player Business Workspace Scope v1

**Roadmap item:** `BUSINESS-V2-12`
**Status:** `IN_PROGRESS`
**Branch:** `feat/player-business-workspace-v2`
**Base:** merged `main` at `9dc7906bb278b7eee9ceef6d3624fb088a6b5a97`
**Parent implementation identity:** Phase 11 `3cbca309e1e3c55e9b933803d304d2c5cc96f071`
**Merge/deployment authorization:** none

## Objective

Replace the current long-form Player Business page with one coherent operating workspace while preserving the existing Business, Store, Inventory, Banking, FX, funding, workforce, equipment, manufacturing, payroll, and Store-settlement authorities.

The workspace must expose only server-derived state and constrained actions. It must not create a second economic model, copy canonical inventory into Business-owned tables, restore caller-authored sales settlement, or add free-form monetary outcome controls.

## Required workspace

The Player Business surface is organized into these bounded views:

1. **Overview** — company status, readiness, operating capacity, current bottlenecks, and canonical summary metrics.
2. **Products / Recipes** — active products plus canonical Business recipe access. Product changes remain constrained by existing server validation.
3. **Stockroom** — authoritative Warehouse, Work in Progress, Finished Goods, and In Transit locations and quantities from canonical Inventory authority.
4. **Procurement** — Store-backed procurement using canonical Business Checking, C0 funding, FX disclosure, immutable quote, atomic receipt, and Warehouse delivery.
5. **Production** — exact recipe/product selection, bounded quantity/priority controls, server-derived material/labor/equipment readiness, queued/in-progress/completed jobs, and cancellation where allowed.
6. **Workforce** — active employees, utilization, payroll evidence, and server-priced candidates. Hiring uses candidate selection; no caller-authored wage authority.
7. **Equipment** — authoritative installed/available Business equipment and capacity evidence. Phase 12 may expose existing equipment authority but must not invent equipment balances or capacity.
8. **Sales** — Finished Goods versus Listed state, Store offers, withdrawal state, purchase blocking while withdrawing, delayed stock return, and committed Store seller receipts.
9. **Finance** — canonical Business Checking accounts, FX quotes/orders/receipts, procurement funding evidence, Store revenue/COGS/gross-margin receipts, payroll, and liabilities already exposed by server authority.
10. **Ownership / Governance** — current canonical ownership/governance evidence only. Phase 12 does not implement IPO issuance or Financial Market integration.
11. **Activity** — immutable receipt/activity evidence from authoritative operations rather than a browser-authored journal.

## Existing authority that Phase 12 must reuse

- `/players/me/business` for the current bounded Business overview.
- `/players/me/business/stockroom` for canonical Inventory-backed Business stockroom state.
- `/players/me/business/recipes` for canonical recipe-access state.
- `/players/me/business/workforce/candidates` and existing workforce utilization/payroll state.
- `/players/me/business/treasury` and existing Business FX/account actions.
- existing Business Store quote/purchase funding path for procurement.
- existing manufacturing job collection/start/cancel paths.
- committed Store seller receipts and Phase 11 Business activity evidence for sales/finance/activity.

## Explicit retirements / UX constraints

- Do not restore `businessInputPurchase` or any competing input-purchase mutation path.
- Do not restore `settle_business_cycle_v1` or caller-authored demand/revenue/COGS/tax outcomes.
- Do not expose raw UUIDs where public-key contracts exist.
- Prefer selects, radio groups, buttons, disclosures, and server-derived defaults over free-text authoring.
- Free text is permitted only where it is genuinely descriptive/administrative and already server-validated (for example a bounded termination/status reason); it must never author price formation, wages, sales, taxes, inventory quantities, or settlement results.
- No new persisted browser-side economic cache.

## Execution tranches

### 12A — Workspace read foundation and shell

- Wire canonical Stockroom and Recipes reads into Player Terminal resource planning, support, freshness, route resolution, normalization, and preview-safe behavior.
- Add a keyboard-accessible workspace navigation model without changing economic authority.
- Preserve existing Business Treasury and procurement flows.

### 12B — Products / Recipes + Stockroom + Procurement

- Render canonical recipe access and four stockroom locations.
- Show owned/reserved/available quantities and cost currency evidence.
- Keep Store procurement quote/funding/receipt as the only procurement mutation path.

### 12C — Production + Workforce + Equipment

- Present readiness as server evidence and group manufacturing jobs by lifecycle.
- Converge workforce controls around candidates/utilization/payroll.
- Expose existing equipment capacity/install evidence where server contracts already support it; do not add parallel authority.

### 12D — Sales + Finance + Governance + Activity

- Separate Store offer/seller state from committed receipt evidence.
- Present Business accounts/FX, Store revenue/COGS/margin, payroll/liability evidence, ownership/governance reads, and immutable activity.
- Keep IPO issuance and market listing out of Phase 12.

### 12E — Certification and handoff

- Permanent source/authority contract.
- Player Terminal unit/smoke verification.
- Backend TypeScript and retained Business/Store/Banking/FX/workforce/equipment gates.
- Desktop/mobile Chromium, keyboard, reduced-motion, focus, and screen-reader acceptance.
- Connected browser acceptance against disposable/local services only.
- Exact-head workflow matrix and durable implementation handoff.

## Stop conditions

Stop and reopen scope if Phase 12 requires any of the following:

- a new monetary, inventory, Store, workforce, equipment, manufacturing, payroll, tax, or ownership authority;
- a new live scheduler/cron or secret;
- staging/production SQL or live-data mutation;
- weakening public-key, auth, CSRF, rate-limit, isolation, lock-order, replay, balance, hold, or settlement invariants;
- implementing IPO issuance, stock-market listing, or Phase 13 Admin supervision early.

## Release boundary

Phase 12 remains unmerged and undeployed until one exact implementation SHA has passed its permanent gate and all required inherited workflows. `BETA-LIVE-MIGRATION-PARITY-001` remains a separate release/runtime blocker and does not authorize live reconciliation from this branch.
