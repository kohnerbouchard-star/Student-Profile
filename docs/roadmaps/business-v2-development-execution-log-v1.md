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
- Business Player API and legacy `business-banking` read/write composition.
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

The `scripts/business-economy-authority-contract.mjs` contract was rewritten to enforce this exact Phase 0 boundary. It now fails if the deferred speculative layers reappear before their planned phase and verifies that Phase 0 does not introduce a parallel recipe, production, labor, automatic-sales, tax, or liquidation authority.

### Decision

Do **not** continue patching the speculative productive-economy stack in place. Those migrations were unmerged/unreleased draft-branch work. Rebuild each feature only when its execution phase opens and only against the canonical domain authority it consumes.

This is a convergence correction, not loss of completed production history. The removed files were never merged to `main` or applied as authorized production migrations. Keeping them would preserve knowingly conflicting authorities and force later phases to untangle more spaghetti.

### Verification state

On plan head `ecf319bab5620780e8331cd43fba1710149779e6` before convergence:

- Backend Typecheck: **PASS**.
- Business Banking Runtime: **PASS**.
- Business Economy V2 static authority checks: **PASS but insufficient**; they validated source patterns rather than executable schema compatibility.
- Database Replay: **FAIL** at speculative liquidation migration as described above.

On convergence head `7ce58d826f9d23b835a6324d6f787054aff32d60`:

- GitHub Actions were triggered immediately after the convergence commit.
- Database Replay run `32197944593` is the primary Phase 0 gate and was queued/in progress at the time of this log update.
- No staging or production schema mutation has been performed.

### Remaining blockers / risks

- Phase 0 cannot close until Database Replay succeeds from zero twice and relevant Business/Inventory/Banking checks are green.
- The retained foundation still needs executable connected probes before production use; current work remains repository/staging-neutral.
- Recipe authority integration is deliberately deferred to Phase 2 and must consume the existing physical-economy recipe source rather than recreate it.
- Store seller-offer authority is deliberately deferred to Phases 7-11 and must replace, not coexist with, a second automatic finished-goods sales authority.

### Next step

Use Database Replay and focused CI on `7ce58d826f9d23b835a6324d6f787054aff32d60` as the primary oracle. Fix any retained-foundation failure in a bounded commit, update this log, and repeat. Phase 1 does not open until Phase 0 exit criteria are satisfied.
