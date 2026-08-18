# Business V2 Development Execution Log v1

**Purpose:** durable cross-chat completion notes for `docs/roadmaps/business-v2-development-execution-plan-v1.md`.  
**Integration PR:** #648  
**Branch:** `refactor/business-ux-mechanics-v1`  
**Rule:** update this log at every completed checkpoint with changes, verification, blockers, decisions, exact state, and next step.

---

## 2026-08-19 — Phase 0 checkpoint A: convergence decision

### Baseline

- Plan commit: `ecf319bab5620780e8331cd43fba1710149779e6`.
- PR #648 was still draft and unmerged.
- No Business V2 migration from this branch was applied to staging or production during this checkpoint.
- Connected staging was used read-only to verify canonical schema contracts.

### What was inspected

- All Business V2 migration layers on the current #648 branch.
- Canonical Inventory v2 tables and inventory poster contract from merged `main`.
- Existing physical-economy/Crafting recipe schema.
- Business Player API and legacy `business-banking` read/write composition.
- Current GitHub Actions results and exact Database Replay failure logs.

### Confirmed blockers

1. **Database Replay hard failure.** The branch reaches `20260819067500_business_liquidation_settlement_v2.sql` and fails on a composite foreign key to `business_liquidations(game_session_id, id)` because the referenced table has no matching composite unique constraint. The failure reproduced on every retry in workflow run `32197397668`.
2. **Workspace/formation schema drift.** The speculative workspace reads table/column names that do not exist in the retained formation schema, including `business_formation_proposal_owners`, `decision`, `total_capitalization`, and proposal `expires_at`.
3. **Duplicate recipe authority.** The speculative Business recipe layer creates `business_recipe_definitions` and `business_recipe_inputs`, while merged canonical physical-economy recipes already exist as `physical_economy_recipe_definitions`, `physical_economy_recipe_inputs`, `physical_economy_recipe_outputs`, game recipe availability, and Player recipe unlocks. This conflicts with the locked product decision to use the existing catalog recipe.
4. **Canonical Inventory API mismatch.** Multiple speculative Business migrations call `economy_private.post_inventory_transaction_v2` with a non-existent alternate named-argument signature. Merged authority accepts a transaction type/source/idempotency/metadata plus JSON journal lines. No compatible overload exists on #648.
5. **Canonical Inventory column drift.** Speculative liquidation code reads `inventory_holdings.quantity` instead of `quantity_owned` and treats `inventory_accounts.business_id` as real even though Business identity belongs on `economic_parties` joined through `inventory_accounts.party_id`.
6. **Loan schema drift.** Speculative acquisition code writes `player_loans.repayment_account_player_id`, which does not exist in the canonical loan schema.
7. **Business entity field drift.** Speculative reputation code writes `business_entities.reputation`; canonical Business uses `reputation_score`.
8. **Tax classification mismatch.** Speculative tax assessment values (`corporate`, `partnership_pass_through`) do not match the retained legal/tax classification authority (`c_corporation`, `partnership`, `disregarded`).
9. **Debt undercount risk.** Speculative debt helpers omit the actual canonical `player_loans.principal_balance` field and can therefore resolve outstanding debt incorrectly.
10. **Competing sales authorities.** The speculative automatic Business sales engine directly consumes Finished Goods and creates Business revenue, conflicting with the locked plan that Store seller offers are the primary sales/inventory settlement authority.

### Decision

Do **not** continue patching the speculative productive-economy stack in place. Those migrations are unmerged/unreleased draft-branch work and are removed from the active Phase 0 candidate so they can be rebuilt in the ordered phases against canonical authorities.

Retain only the already replayed foundation:

- `20260819062000_business_authority_foundation_v2.sql` — formation/legal entity/ownership/activity foundation.
- `20260819062100_business_party_banking_and_activation_v2.sql` — first-class Business money identity and formation capitalization.
- `20260819063000_business_governance_equity_v2.sql` — generic governance/voting and bounded ownership-transfer foundation.

Deferred for rebuild under the execution plan:

- governance settlement extensions;
- Business-owned recipe/R&D catalog;
- wholesale procurement implementation;
- equipment/production implementation;
- workforce market implementation;
- automatic demand/sales implementation;
- tax/valuation/distress implementation;
- liquidation settlement;
- shared Business economy runtime;
- speculative V2 workspace read model.

### Why

This is a convergence correction, not loss of completed production history. The removed files were never merged to `main` or applied as authorized production migrations. Keeping them would preserve knowingly conflicting authorities and force later phases to untangle more spaghetti.

### Verification state at decision time

On plan head `ecf319bab5620780e8331cd43fba1710149779e6`:

- Backend Typecheck: **PASS**.
- Business Banking Runtime: **PASS**.
- Business Economy V2 static authority checks: **PASS but insufficient**; they validated source patterns rather than executable schema compatibility.
- Database Replay: **FAIL** at speculative liquidation migration as described above.

### Next step

Commit the Phase 0 convergence removal and rewritten foundation authority contract, then use GitHub Actions Database Replay as the primary gate. If replay becomes green, inspect remaining broad CI failures to distinguish Business regressions from prior/cascade failures. Update this log with the exact convergence commit and CI results before opening Phase 1.
