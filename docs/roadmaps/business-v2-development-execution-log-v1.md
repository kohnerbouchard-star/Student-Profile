# Business V2 Development Execution Log v1

**Purpose:** durable cross-chat completion notes for `docs/roadmaps/business-v2-development-execution-plan-v1.md`.  
**Integration PR:** #648  
**Branch:** `refactor/business-ux-mechanics-v1`  
**Rule:** update this log at every completed checkpoint with changes, verification, blockers, decisions, exact state, and next step.

---

## 2026-08-19 — Phase 0 checkpoint A: convergence decision and commit

### Baseline

- Plan commit: `ecf319bab5620780e8331cd43fba1710149779e6`.
- Phase 0 convergence commit: `7ce58d826f9d23b835a6324d6f787054aff32d60`.
- PR #648 remains draft and unmerged.
- No Business V2 migration from this branch was applied to staging or production during this checkpoint.
- Connected staging was used read-only to verify canonical schema contracts.

### What was inspected

- All Business V2 migration layers on the current #648 branch.
- Canonical Inventory v2 tables and inventory poster contract from merged `main`.
- Existing physical-economy/Crafting recipe schema.
- Business Player API and `business-banking` read/write composition.
- Current GitHub Actions results and exact Database Replay failure logs.

### Confirmed blockers

1. **Database Replay hard failure.** The pre-convergence branch reached `20260819067500_business_liquidation_settlement_v2.sql` and failed on a composite foreign key to `business_liquidations(game_session_id, id)` because the referenced table had no matching composite unique constraint. The failure reproduced on every retry in workflow run `32197397668`.
2. **Workspace/formation schema drift.** The speculative workspace read table/column names that did not exist in the retained formation schema, including `business_formation_proposal_owners`, `decision`, `total_capitalization`, and proposal `expires_at`.
3. **Duplicate recipe authority.** The speculative Business recipe layer created `business_recipe_definitions` and `business_recipe_inputs`, while merged canonical physical-economy recipes already exist as `physical_economy_recipe_definitions`, `physical_economy_recipe_inputs`, `physical_economy_recipe_outputs`, game recipe availability, and Player recipe unlocks. This conflicted with the locked product decision to use the existing catalog recipe.
4. **Canonical Inventory API mismatch.** Multiple speculative Business migrations called `economy_private.post_inventory_transaction_v2` with a non-existent alternate named-argument signature. Merged authority accepts a transaction type/source/idempotency/metadata plus JSON journal lines. No compatible overload existed on #648.
5. **Canonical Inventory column drift.** Speculative liquidation code read `inventory_holdings.quantity` instead of `quantity_owned` and treated `inventory_accounts.business_id` as real even though Business identity belongs on `economic_parties` joined through `inventory_accounts.party_id`.
6. **Loan schema drift.** Speculative acquisition code wrote `player_loans.repayment_account_player_id`, which does not exist in the canonical loan schema.
7. **Business entity field drift.** Speculative reputation code wrote `business_entities.reputation`; canonical Business uses `reputation_score`.
8. **Tax classification mismatch.** Speculative tax assessment values (`corporate`, `partnership_pass_through`) did not match the retained legal/tax classification authority (`c_corporation`, `partnership`, `disregarded`).
9. **Debt undercount risk.** Speculative debt helpers omitted the actual canonical `player_loans.principal_balance` field and could therefore resolve outstanding debt incorrectly.
10. **Competing sales authorities.** The speculative automatic Business sales engine directly consumed Finished Goods and created Business revenue, conflicting with the locked plan that Store seller offers are the primary sales/inventory settlement authority.

### What changed in checkpoint A

The active Phase 0 candidate was converged back to the replayed foundation. The following speculative, unmerged, unreleased migration layers were removed from the integration branch so they can be rebuilt in the ordered execution phases:

- `20260819063100_business_governance_settlements_v2.sql`
- `20260819063110_fix_business_governance_locking_v2.sql`
- `20260819064000_business_recipes_and_research_v2.sql`
- `20260819064100_business_wholesale_procurement_v2.sql`
- `20260819064200_business_equipment_and_production_v2.sql`
- `20260819064210_fix_business_production_reservation_v2.sql`
- `20260819065000_business_workforce_market_v2.sql`
- `20260819066000_business_demand_sales_reputation_v2.sql`
- `20260819067000_business_tax_valuation_distress_v2.sql`
- `20260819067010_business_finance_hardening_v2.sql`
- `20260819067500_business_liquidation_settlement_v2.sql`
- `20260819068000_business_economy_runtime_v2.sql`
- `20260819069000_business_workspace_read_model_v2.sql`

Retained active foundation:

- `20260819062000_business_authority_foundation_v2.sql` — formation/legal entity/ownership/activity authority.
- `20260819062100_business_party_banking_and_activation_v2.sql` — first-class Business money identity and atomic formation capitalization.
- `20260819063000_business_governance_equity_v2.sql` — generic governance/voting and bounded ownership-transfer foundation.

The `scripts/business-economy-authority-contract.mjs` contract was rewritten to enforce this exact Phase 0 boundary. It fails if deferred speculative layers reappear before their planned phase and verifies that Phase 0 does not introduce a parallel recipe, production, labor, automatic-sales, tax, or liquidation authority.

### Decision

Do **not** continue patching the speculative productive-economy stack in place. Those migrations were unmerged/unreleased draft-branch work. Rebuild each feature only when its execution phase opens and only against the canonical domain authority it consumes.

This is a convergence correction, not loss of completed production history. The removed files were never merged to `main` or applied as authorized production migrations. Keeping them would preserve knowingly conflicting authorities and force later phases to untangle more spaghetti.

---

## 2026-08-19 — Phase 0 checkpoint B: Player publication and architecture cleanup

### Commits

- `8f2e6029e99d0e24614cb9b47a0ae070b0018b40` — bind Business formation routes to Player verification and top-level backend-route composition.
- `55d5ed8db1ea4b63b665d247ab597b4885f8900a` — record new formation operations truthfully as `contract_only` in the button/action evidence ledger because no Player Business formation UI exists yet.
- `67a635c570562de9b13c00fe35bd1c44b3f68aff` — reduce Phase 0 Business adapter architecture debt without changing behavior.

### What changed

- Added the three formation endpoint keys to the connected Player backend-route composition:
  - `businessFormationPropose`
  - `businessFormationRespond`
  - `businessFormationActivate`
- Bound the cross-cutting Player verification authority to PR #648 with an exact path allowlist; production deployment, production mutation, and secret-value authority remain false.
- Added truthful button/action evidence for formation endpoints as `contract_only`; no browser evidence was fabricated.
- Renamed the pre-V2 direct Business creation operation from the vague adapter label `legacy` to `directCreate`.
- Compacted the already mixed Business/Banking HTTP adapter below the repository oversized-source threshold rather than accepting new architecture debt.
- Compacted capability-manifest additions so the architecture inventory did not gain line-count debt merely from publication wiring.
- Preserved the architecture ratchet unchanged; Repository Quality returned green without editing the architecture inventory baseline.

### Decisions

- Do not fake browser coverage for APIs that do not yet have UI. Formation actions remain release-blocking `contract_only` until the Player Business workspace phase provides real connected-browser evidence.
- Do not teach the global rate-limit dispatcher Business URL semantics as a shortcut. The current Edge compatibility dispatch still collapses formation commands to the generic `businessCreate` operation identity, but all four operations use the same `sensitive` rate-limit class. The safety threshold is therefore equivalent; the operation/audit identity mismatch is the first explicit Phase 1 extraction task.
- Keep `business-banking` as a bounded compatibility façade during extraction, but do not add new Business mechanics to that mixed domain.

---

## 2026-08-19 — Phase 0 COMPLETE: replayable Business authority foundation

### Completion head

- Phase 0 code head: `67a635c570562de9b13c00fe35bd1c44b3f68aff`.
- PR #648: open, draft, mergeable, unmerged.
- No Business V2 staging or production migration/deployment was performed.

### Verification completed on the Phase 0 code head

- **Database Replay — PASS** (`32198952107`): complete migration ledger replayed from zero twice; rebuilt database lint passed.
- **Backend Typecheck — PASS** (`32198951911`): typecheck and backend smoke passed.
- **Business Banking Runtime — PASS** (`32198952134`): deterministic simulations, formation authority contract, runtime/migration contract, complete Player Business surface, focused Player/Admin tests, Business/Banking typecheck, and route-adapter syntax all passed.
- **Business Economy V2 — PASS** (`32198952056`): Phase 0 authority boundary contract passed.
- **Repository Quality — PASS** (`32198952111`): architecture inventory/ratchet and repository audit passed without baseline relaxation.
- **Button Action Coverage — PASS** (`32198951985`): new formation operations are accounted for truthfully.
- **Runtime Interaction Wiring — PASS** (`32198952177`).
- **Beta Security Contract — PASS** (`32198952237`).
- **Player Response Privacy — PASS** (`32198952161`).
- **Staging Readiness Preflight — PASS** (`32198951974`).
- **Crafting Item Runtime / connected activation — PASS** (`32198952088`, `32198952081`), providing regression evidence across the canonical item/Inventory dependency boundary.
- **Admin API Check / Admin Browser E2E — PASS** (`32198952074`, `32198952147`).
- **Seed Executable Beta Pack — PASS** (`32198952055`).
- **World Runtime / market-timezone / release-integrity / supply-chain gates — PASS** on the same head.

Additional broad Player browser/load workflows were still executing when Phase 0 was recorded; they are not used to claim the new formation UI is complete because formation remains intentionally `contract_only`. Their results remain useful regression evidence for subsequent phases.

### Phase 0 exit criteria result

- Clean replay twice: **met**.
- Database lint: **met**.
- No known retained-schema contract drift: **met** for the three retained migrations and current published foundation.
- Business contracts/typechecks green: **met**.
- Banking and canonical item/Inventory regression gates green: **met** at the repository/runtime contract level.
- Deferred/compatibility boundaries documented: **met**.
- No production deployment: **met**.

### Carry-forward blockers / Phase 1 intake

1. Extract Business from `backend/src/domains/business-banking/` into a real `backend/src/domains/business/` boundary without changing Banking behavior.
2. Make `business-banking` a thin forwarding façade for Business during cutover.
3. Split formation operations into their own Business route/operation identities so Edge rate-limit/audit dispatch no longer collapses them to generic `businessCreate`.
4. Preserve all public URLs and same-origin Player BFF contracts during extraction.
5. Do not restore recipes, production, workforce, Store seller offers, tax, or other later-phase mechanics during Phase 1.

### Next authorized step

**Phase 1 — Business domain extraction is OPEN.** Begin with contracts/application/repository/API separation and compatibility forwarding only. Update this log at the first completed extraction checkpoint before moving to Phase 2.
