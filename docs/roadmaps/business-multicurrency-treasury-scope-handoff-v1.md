# Business Multi-Currency Treasury Scope Handoff v1

**Roadmap checkpoint:** `BUSINESS-V2-10A4C4`  
**Status:** `INTAKE_COMPLETE — IMPLEMENTATION_NOT_STARTED`  
**Branch:** `feat/business-multicurrency-treasury-v1`  
**Draft PR:** #678  
**Base branch:** `feat/multicurrency-stock-funding-v1`  
**Exact parent C3 implementation:** `058162d7b9688809e885d9e6fe77ed42978c7a03`  
**Exact parent C3F controller:** `18fde31be5e1599c7d9a65d681b248fcb4756dc4`  
**Initial C4 scope commit:** `a502faf084784d8c6f3bec95319160f80d5a38fa`  
**Merge or deployment authorized:** No

## Controlling records

- Scope: `docs/roadmaps/business-multicurrency-treasury-scope-v1.md`
- Authority audit: `docs/roadmaps/business-multicurrency-treasury-authority-audit-v1.md`
- Schema/runtime inventory: `docs/roadmaps/business-multicurrency-treasury-schema-inventory-v1.md`
- Implementation plan: `docs/roadmaps/business-multicurrency-treasury-implementation-plan-v1.md`
- PR-bound authority: `docs/operations/contracts/player-cross-cutting/pr-678.json`

The commit containing this handoff and the PR-bound authority is the immutable C4 scope handoff. It is not a runtime implementation or certification identity.

## Locked outcome

C4 will add Business-owned foreign-currency Checking accounts, Business use of the existing B2 standard/instant FX products, and one-to-three-account Business procurement funding through the existing C0 target-credit authority.

B1 remains the only fixing authority. B2 remains the only bank-account, balance, hold, journal, clearing, reserve, facility, order, and FX-settlement authority. C0 remains the only one-to-three-account purchase-funding authority. Store remains the procurement commercial authority. Inventory remains the physical quantity and cost-basis authority.

C4 must extend those authorities by exact owner identity; it must not fork them.

## Procurement decision

The active Business procurement bill and Warehouse cost basis remain in the Business reporting currency already produced by the Store pricing resolver. Supplier item currency and item-local price remain immutable pricing evidence. A Business may fund the reporting-currency bill from one to three Business Checking accounts in any currencies through C0 retail checkout FX, or pre-convert through Business treasury FX.

This decision avoids historical Warehouse cost conversion and prevents mixed cost-currency holdings.

## Implementation order

1. C4A — exact Player-or-Business owner generalization for B2/C0 evidence plus Business account read/open.
2. C4B — Business standard/instant treasury FX using unchanged B2 policies and worker authority.
3. C4C — Business wrappers over the shared C0 quote/composer.
4. C4D — funded Business procurement quote and atomic settlement cutover.
5. C4E — authenticated Business API and Player Terminal controls.
6. C4F — exact-head database, concurrency, browser, privacy, retained-stack certification, durable handoff, and later checkpoint promotion.

## Locked safety boundaries

- no merge or deployment;
- no scheduler or secret change;
- no staging/production SQL or live-data mutation;
- no B1, B2, or C0 pricing-policy change;
- no Store, Marketplace, or Stock settlement rewrite;
- no `BUSINESS-V2-10A4D` work;
- no Business wallet, alternate ledger, balance cache, FX engine, funding engine, or Inventory projection;
- no loans, overdraft, supplier credit, shipping, tax, wholesale catalog, automatic sales, financial reporting, equity, or IPO work.

## Certification boundary

C4 remains `SCOPED_NOT_IMPLEMENTED` until one exact implementation SHA passes the permanent C4 gate and the full inherited workflow matrix. The later implementation handoff must pin that exact source. A later documentation/controller head must also be green before C4 is described as fully closed.