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

---

## 2026-08-19 — Recovery correction: reported work reconciled to Git

### Why this entry exists

A prior execution narrative reported Phases 1–4 complete and Phase 5 underway, but inspection of PR #648 showed that those reported states were not durably present on the integration branch. Later extraction commits had also damaged `classroom-api`. The branch was therefore restored to the last known-good extraction lineage and the later phases were rebuilt from repository truth instead of trusting chat-state claims.

### Durable recovery authority

- Recovery note: `docs/roadmaps/business-v2-development-recovery-20260819.md`.
- Restored known-good extraction source: `28ae44a1aefead1a9c7efc3fc174075115b81255`.
- Recovery documentation commit: `f697f8a477f4447bb9c15f2a1db6bc85f124e3b0`.

### Reporting rule established after recovery

A phase is **not complete** unless all four conditions are true:

1. implementation exists on the PR branch;
2. an exact source commit is identified;
3. required acceptance gates pass for that source state; and
4. this execution log records the completion, evidence, blockers, decisions, and next authorized step.

Anything short of those four conditions must be reported as **in progress**.

---

## 2026-08-19 — Phase 1 COMPLETE: Business domain boundary and Banking separation

### Certified source head

- **Certified implementation source:** `06867bb8bfd4c24c540a7f78ea4319d6ea9c9d4b`.
- PR #648 remained open, draft, mergeable, and unmerged during certification.
- The commit that adds this documentation entry is intentionally later than the certified source. Do not substitute the notes-only commit for the tested implementation SHA.

### What is now authoritative

- `backend/src/domains/business/` owns Player Business route parsing, Business contracts, Business HTTP handling, and Business persistence.
- `business-banking` remains only as a compatibility routing façade for Business plus the actual Banking/Loans domain runtime.
- The mixed handler recognizes a Business route and immediately forwards it to `handlePlayerBusinessRequest`; it does not execute Business mutation RPCs itself.
- The mixed `SupabasePlayerBusinessBankingRepository` is now **Banking/Loans-only**. Dead Business creation/read/product/inventory/employee/production persistence was removed.
- The mixed Banking repository is never injected into Business execution. The Business handler constructs/uses the Business-owned repository.
- Player Business route parsing is self-contained and does not deep-import Players internals for URL interpretation.
- Formation propose/respond/activate retain distinct Business operation identities through the extracted boundary.
- Existing public Player URLs remain compatible. The large `classroom-api` composition was not rewritten to accomplish the separation.

### Architecture enforcement added

`scripts/business-domain-boundary-contract.mjs` now fails if any of the following regressions occur:

- Business contracts depend back on `business-banking`;
- Business route authority starts owning Banking/Loans URLs;
- mixed handler regains direct Business mutation cases;
- mixed handler injects its Banking repository into Business execution;
- mixed repository regains Business persistence such as `readBusiness`, `assertBusinessCreationAllowed`, `business_products`, `business_inventory`, `business_employees`, or `business_production_runs`.

The legacy Business/Banking runtime contract was also updated rather than weakened. It still validates Banking/Loans concurrency, idempotency, money/currency authority, repayment rules, Admin lifecycle guards, and Player adapter publication while validating Business behavior at the extracted Business boundary.

### Blockers found and resolved during Phase 1

1. **Corrupted classroom extraction history.** Recovered rather than layering more changes onto the bad head.
2. **Stale runtime contract.** Old tests expected Business implementation inside the mixed handler. Rewritten to enforce forwarding plus the extracted authority.
3. **Mixed persistence duplication.** Runtime forwarding initially left dead Business repository methods behind. Those were removed before declaring Phase 1 complete.
4. **Architecture inventory drift.** Regenerated deterministically. The ratchet was not relaxed.
5. **Accidental compatibility marker increase.** Removed the new marker instead of raising the baseline.
6. **Capability-route regression during test maintenance.** An intermediate test edit guessed several import paths and failed typecheck. It was reverted to the known-good imports, then only the Business expectations were changed.
7. **Cross-cutting PR scope allowlist.** Expanded only for the exact reviewed Business/Stockroom/recovery files; production deployment/mutation/secret authority remains false.

### Architecture result

- No architecture-ratchet baseline was raised.
- Cross-domain deep imports remained at the repository maximum rather than increasing due to the Business extraction.
- Compatibility-marker count remained at its existing maximum rather than increasing.
- Repository Quality passed after committing the generator-produced architecture inventory.

### Verification on certified source `06867bb8...`

- **Business Economy V2 — PASS** (`32218265894`): backend typecheck plus formation, Business authority, Phase 1 domain-boundary, recipe-access, and Stockroom authority contracts all passed.
- **Backend Typecheck — PASS** (`32218265960`): complete backend typecheck and backend smoke suite passed.
- **Business Banking Runtime — PASS** (`32218265916`): deterministic simulations, formation contract, runtime/migration contract, complete Player Business surface, focused Player/Admin tests, Deno typecheck/Admin publication, and route-adapter syntax all passed.
- **Repository Quality — PASS** (`32218265890`): full audit, deterministic architecture inventory, architecture ratchet, dependency checks, supply-chain checks, and backend dependency audit passed.
- **Database Replay — PASS** (`32218266012`): complete migration ledger replayed from zero twice and rebuilt database lint passed.
- **Player Terminal Verify — PASS** (`32218265909`): PR scope authority, Player boundary contracts, bounded read resilience, standalone Player verification, Chromium installation/runtime fixture, and full Chromium browser verification passed.
- **Runtime Interaction Wiring — PASS** (`32218266011`).
- **Button Action Coverage — PASS** (`32218265983`).

### Phase 1 exit result

- Business has a real domain boundary: **met**.
- Banking behavior preserved: **met**.
- Mixed namespace is a thin Business forwarding façade, not Business persistence authority: **met**.
- Public Player URLs retained: **met**.
- Architecture ratchet not relaxed: **met**.
- Exact source/browser/database certification: **met**.

### Next authorized step

Phase 2 may continue, but only against the existing canonical physical-economy recipe authority. No Business recipe/BOM definition system may be added.

---

## 2026-08-19 — Phase 2 checkpoint A COMPLETE: Business-owned canonical recipe access foundation

### Scope status

**Checkpoint A is complete; Phase 2 itself remains OPEN.** The missing Phase 2 work is the browser-safe Business recipe read surface.

### Implemented authority

- `backend/supabase/migrations/20260819064000_business_recipe_access_v2.sql` creates `public.business_recipe_access`.
- Business recipe access references `public.physical_economy_recipe_definitions` directly.
- The Business layer does **not** create recipe definitions, input/BOM definitions, output definitions, variants, quality tiers, or custom product definitions.
- `grant_business_recipe_access_v2` is a trusted service-role-only grant path using Business public key + canonical recipe key.
- Recipe access is owned by the Business entity, so ownership changes/acquisition do not implicitly erase the company’s recipe knowledge.
- No Player Crafting unlock is automatically inherited by a Business.

### Decisions locked in this checkpoint

- Businesses begin with **no implicit recipe inheritance** from a Player’s Crafting profile.
- Recipe grants must come from an explicit trusted flow such as formation/content seed, contract, staff/admin, event, or acquisition.
- Do not invent a research tree to solve recipe acquisition.
- Do not expose internal recipe UUIDs to the Player browser.
- For the upcoming read surface, mirror existing Crafting availability semantics: an empty availability `country_codes` array means global; current game availability/scarcity and Business country determine whether the recipe is usable now.
- The read surface should preserve ownership visibility even when current scarcity/location makes manufacturing unavailable; temporary availability must not destroy the company’s recipe-access record.

### Verification

The canonical recipe-access contract passed as part of **Business Economy V2** on certified source `06867bb8...` (`32218265894`), and the migration participated in the successful **Database Replay** (`32218266012`).

### Current blocker / next task

`GET /players/me/business/recipes` does not yet exist. That read API is being implemented as the next Phase 2 tranche and must expose canonical recipe keys/operating metadata only, without copying BOM/output authority into Business tables.

A stacked preparation branch was created from the certified source:

- `feat/business-recipe-read-v2`

Do not call Phase 2 complete until that read tranche is merged into #648, exact-head gates pass, and this log is updated again.

---

## 2026-08-19 — Phase 3 checkpoint A COMPLETE: canonical Business Stockroom read

### Scope status

**Stockroom read checkpoint is complete; Phase 3 procurement remains OPEN.** No Business procurement mutation is claimed complete by this entry.

### Implemented authority

- `backend/supabase/migrations/20260819064100_business_stockroom_read_v2.sql` adds `resolve_player_business_v2` and the canonical Stockroom read.
- Business resolution uses active `business_ownership_positions` for V2 ownership and retains bounded model-v1 controller compatibility.
- Multi-owner partnerships/LLCs therefore resolve through the ownership ledger rather than forcing every read through `business_entities.owner_player_id`.
- Stockroom reads only the canonical ownership chain:
  - `economic_parties`
  - `inventory_accounts` with `account_kind='warehouse'`
  - `inventory_holdings`
  - `game_items`
- Stockroom exposes canonical public item identity plus:
  - quantity owned;
  - quantity reserved;
  - quantity available;
  - average carried unit cost;
  - cost currency;
  - holding version.
- `business_inventory` is explicitly rejected as Stockroom authority by `scripts/business-stockroom-authority-contract.mjs`.
- The Player Business read surface recognizes `/players/me/business/stockroom` as a `businessRead` resource and keeps it under the existing read-only Business rate-limit/capability budget.
- A dedicated `supabaseBusinessStockroomReadRepository.ts` isolates canonical Stockroom persistence from the legacy Business snapshot, which still has compatibility debt scheduled for later retirement.

### Decisions and blockers resolved

- Do not create a parallel Business stockroom table.
- Do not make the legacy `business_inventory` compatibility projection authoritative again.
- Do not introduce another Player capability merely for Stockroom; it is part of the Business read surface.
- A partially introduced `businessStockroomRead` route kind caused broad type fallout. It was simplified to `businessRead` with a resource discriminator (`overview` / `stockroom`), preserving existing Edge dispatch maps and avoiding risky giant-entrypoint edits.
- Exact cross-cutting allowlist coverage was added for the reviewed Stockroom migration/repository/tests without broadening production authority.

### Verification

The Stockroom authority contract passed as part of **Business Economy V2** on certified source `06867bb8...` (`32218265894`). The Stockroom migration participated in **Database Replay — PASS** (`32218266012`), and the published route survived **Backend Typecheck/Smoke — PASS** (`32218265960`), **Business Banking Runtime — PASS** (`32218265916`), **Repository Quality — PASS** (`32218265890`), **Player Terminal Chromium verification — PASS** (`32218265909`), and **Runtime Interaction Wiring — PASS** (`32218266011`).

### Phase 3 procurement decision already resolved

Current Store quote pricing is derived from Player country/currency. A Business procurement flow must **not** proxy a quote through an arbitrary owner Player, because multi-owner Businesses would then inherit the wrong geographic/currency authority.

The Phase 3B procurement implementation must:

- reuse the same authoritative Store pricing/scarcity policy;
- derive pricing geography/currency from the Business’s own `country_code` / `currency_code`;
- create a short-lived Business procurement quote;
- settle Store canonical stock to the Business canonical warehouse atomically;
- debit first-class Business cash through the Business money authority;
- carry the actual acquisition price into warehouse average cost basis;
- avoid a parallel wholesale/supplier catalog.

### Next authorized step

1. Complete the missing Phase 2 Business recipe read tranche on `feat/business-recipe-read-v2` and integrate it only after its checks pass.
2. Then implement Phase 3B Business Store procurement using Business geography/currency and the canonical Store + Inventory + Business money authorities.
3. Phase 4 workforce does **not** open until Phase 2 and Phase 3 are durably complete and logged.

---

## 2026-08-20 — Phase 2 COMPLETE: canonical Business recipe read certified

### Certified source head

- **Certified implementation source:** `cd79b683f6a569b6e098e4ec56dbf8c3a6eb8ec4`.
- PR #648 remained open, draft, mergeable, and unmerged during certification.
- PR #649 was merged into the integration branch as the bounded Phase 2B tranche.
- This documentation commit is later than the tested implementation source. It must not replace `cd79b683...` as the certification identity.
- No Business V2 staging or production migration/deployment was performed.

### What is now authoritative

- `GET /players/me/business/recipes` is published through the extracted Business route parser and HTTP handler.
- The read resolves only Business-owned `business_recipe_access` records joined to the existing canonical physical-economy recipe definitions and current game recipe availability.
- Recipe availability is derived from the Business country, active game pack, enabled recipe availability, and current scarcity state.
- Empty recipe `country_codes` remain globally available, matching the canonical Crafting availability rule.
- The browser contract exposes public access and recipe keys plus bounded operating metadata; internal UUIDs, canonical BOM rows, and output-definition authority remain private.
- No Business recipe-definition, Business BOM, Business input-definition, Business output-definition, variant, or quality-tier authority was introduced.
- No Player Crafting unlock is inherited automatically by a Business.
- The Phase 2B tranche intentionally did not change the Player Business workspace. Legacy Product Creator and abstract operating forms remain explicit compatibility debt for the later workspace convergence phase; they are not canonical physical-product authority and must not be expanded.

### Exact-head verification

All required gates passed on `cd79b683...`:

- **Business Economy V2 — PASS** (`32310399944`): backend typecheck plus formation, Business authority, domain-boundary, canonical recipe-access, and Stockroom authority contracts passed.
- **Database Replay — PASS** (`32310400111`): complete migration ledger replayed from zero twice and rebuilt database lint passed.
- **Backend Typecheck — PASS** (`32310400051`): backend typecheck and smoke suite passed.
- **Business Banking Runtime — PASS** (`32310400177`): deterministic simulations, Business runtime contracts, complete Player Business surface, focused Player/Admin tests, Deno typecheck, and route-adapter syntax passed.
- **Player Terminal Verify — PASS** (`32310400015`): exact PR scope authorization, Player boundary contracts, read resilience, standalone verification, and Chromium browser verification passed.
- **Repository Quality — PASS** (`32310400055`).
- **Runtime Interaction Wiring — PASS** (`32310400075`).
- **Button Action Coverage — PASS** (`32310400150`).
- **Player Multiplayer and Load E2E — PASS** (`32310400030`): connected Business and World journeys completed; all 30 baseline Players and all 40 maximum Players were provisioned and active; 210/210 baseline reads and 280/280 maximum-load reads returned HTTP 200; server errors were zero.

Immutable multiplayer/load artifact:

- artifact ID: `9386509800`;
- artifact name: `player-multiplayer-load-cd79b683f6a569b6e098e4ec56dbf8c3a6eb8ec4`;
- artifact digest: `sha256:84563969bf25aaa812eadb994ac0364f3dbaed0e4fb393a0d7d7b93c3718abc0`;
- 30-Player login p95: `2029.35 ms`;
- 30-Player read p95: `1913 ms`;
- 40-Player read p95: `2343.73 ms`;
- maximum observed read: `4133.06 ms`;
- server errors: `0`.

### Phase 2 exit result

- Business recipe ownership references the canonical recipe authority: **met**.
- Browser-safe Business recipe read exists: **met**.
- Current usability derives from canonical game/country/scarcity state: **met**.
- Internal UUID and BOM/output authority remain private: **met**.
- No duplicate Business recipe/BOM system exists: **met**.
- No Player recipe inheritance exists: **met**.
- Exact source/database/browser/40-Player certification exists: **met**.
- No production deployment occurred: **met**.

### Compatibility boundary

The current legacy Business product, abstract input, immediate production, manual workforce, and status forms remain compatibility surfaces pending their ordered replacement. They must not be treated as the canonical Phase 2 recipe/product model, and they must not gain new physical-product authoring authority. Player workspace removal/replacement remains scheduled for Phase 12 after the new operating mechanics exist.

### Next authorized step

**Phase 3B — Business Store procurement is OPEN.** The implementation must:

1. reuse the canonical Store catalog, stock, scarcity, and price policy;
2. derive geography and currency from the Business rather than an arbitrary owner Player;
3. create a short-lived server-authoritative Business procurement quote;
4. atomically debit first-class Business cash and move canonical Store stock into the Business warehouse;
5. carry the settled acquisition price into canonical warehouse average cost basis;
6. preserve idempotency, cross-game isolation, public-key-only browser contracts, and exact audit evidence;
7. avoid a parallel wholesale or supplier catalog.

Phase 4 remains closed until Phase 3 procurement is implemented, exact-head certified, and recorded here.

---

## 2026-08-21 — Phase 3B COMPLETE: canonical Business Store procurement

### Certified implementation source

- **Exact implementation SHA:** `acbbff20a4afa8296bdfb30dbc0c8e84e37702c9`.
- Feature branch: `feat/business-store-procurement-v2`.
- Stacked draft PR: #654, based on `refactor/business-ux-mechanics-v1`.
- Integration PR #648 remained open, draft, mergeable, and unmerged.
- No staging or production deployment or data mutation was performed.
- This documentation commit is later than the certified implementation SHA and must not replace it as the tested source.

### What changed

- Added short-lived, server-timed Business procurement quotes using the canonical Store quote-pricing resolver.
- Reused the canonical Store catalog, finite Store stock, country economic snapshot, scarcity, foreign-exchange, and pricing-version authority.
- Derived quote geography and settlement currency from the resolved Business `country_code` and `currency_code`; no owner Player supplies those outcomes.
- Added atomic purchase settlement that locks Store stock, the Business warehouse holding, and first-class Business cash in a fixed order.
- Debited Business cash through the canonical Business ledger adapter.
- Moved the canonical Store item directly into the canonical Business warehouse through `economy_private.post_inventory_transaction_v2`; the owner’s personal Inventory is never used.
- Applied the actual settled total divided by quantity as the warehouse acquisition unit basis, allowing the canonical Inventory poster to maintain weighted-average cost.
- Preserved frozen quote and receipt evidence, immutable Business activity evidence, game isolation, idempotency conflict detection, retry semantics, and browser responses containing public keys only.
- Split the oversized Business HTTP adapter into bounded validation and mutation-execution modules without weakening the architecture ratchet.
- Removed all temporary repair and source-export scaffolding before certification.

### Verification on exact source `acbbff20...`

- **Business Economy V2 — PASS** (`32476298326`).
- **Database Replay ×2 + database lint — PASS** (`32476298602`).
- **Backend Typecheck and backend smoke — PASS** (`32476298458`).
- **Business Banking Runtime — PASS** (`32476298617`).
- **Repository Quality — PASS** (`32476298253`).
- **Runtime Interaction Wiring — PASS** (`32476298376`).
- **Supply Chain Security — PASS** (`32476298243`).
- **Progression Runtime — PASS** (`32476298273`).
- **Player Terminal Verify, including Chromium — PASS** (`32476298658`).
- **Admin API Check — PASS** (`32476298354`).
- **Beta Security Contract — PASS** (`32476298374`).
- **Staging Readiness Preflight — PASS** (`32476298277`).
- **World Runtime, Required Game Market Timezone, and Exchange Calendar Runtime — PASS** (`32476298517`, `32476298522`, `32476298289`).

### Architecture and gameplay decisions

- Quote and receipt tables are operation evidence only; they are not a parallel catalog, inventory authority, money authority, supplier catalog, or pricing engine.
- Multi-owner Businesses use the Business’s own geography and currency. An arbitrary owner Player cannot change procurement pricing.
- New physical procurement does not call or expand `purchase_business_input_v1` and does not route material through personal Inventory.
- Existing legacy Business forms remain compatibility debt until their ordered replacement checkpoint.

### Remaining Phase 3 blockers

Phase 3 is not complete. The current Stockroom read still exposes the canonical warehouse only, while the roadmap requires separate Materials/Warehouse, Work in Progress, Finished Goods, and In Transit locations. New reliance on the legacy abstract `unit_input_cost` purchase path must also be retired before Phase 4 opens.

### Next authorized step

**Phase 3C — location-complete canonical Business Stockroom read is OPEN.** Build a bounded read model over canonical Business inventory accounts for warehouse/materials, work in progress, finished goods, and in transit. Preserve public-key-only browser output and do not introduce a parallel Business inventory table. After Phase 3C certification, retire new Player API reliance on the legacy abstract input-purchase path as a separate bounded checkpoint. Phase 4 workforce/payroll remains closed.

---
## 2026-08-21 — Phase 3C COMPLETE: location-complete canonical Business Stockroom

### Certified implementation source

- **Exact implementation SHA:** `6799c0b44025dd71b54ed75636dd8f2af3358150`.
- Feature branch: `feat/business-stockroom-locations-v2`.
- Stacked draft PR: #655, based on `feat/business-store-procurement-v2`.
- PR #654 and integration PR #648 remained open, draft, mergeable, and unmerged.
- No staging or production deployment or data mutation was performed.
- This documentation commit is later than the certified implementation SHA and must not replace it as the tested source.

### What changed

- Extended the canonical Business inventory-account authority to `in_transit` while retaining Warehouse, Work in Progress, and Finished Goods.
- Provisioned all four canonical Stockroom accounts on authoritative Business creation and backfilled active existing Businesses during the forward migration.
- Replaced the warehouse-only item read with public-key-only location and holding reads over canonical `economic_parties`, `inventory_accounts`, `inventory_holdings`, and game_items`.
- Added a single stable server-authoritative snapshot RPC so location aggregates and item holdings are read from one PostgreSQL statement snapshot during concurrent procurement or production settlement.
- Returned all four locations even when a location is empty.
- Added strict browser-boundary validation for exact envelope fields, four unique location keys, public Business/account/item keys, quantity invariants, aggregate reconciliation, bounded item count, cost basis, currency, version, and recursive UUID exclusion.
- Preserved the existing `items` collection while adding explicit `businessKey` and `locations` fields.
- Explicitly dropped and recreated the Phase 3A table-returning RPC before changing its OUT row contract; CI now ratchets that PostgreSQL requirement.
- Added the extracted Business domain and current Business migration dates to the focused Business Banking Runtime workflow trigger without weakening its verification scope.
- Regenerated the deterministic architecture inventory; no architecture-ratchet ceiling was raised.

### Verification on exact source `6799c0b4...`

- **Business Economy V2 — PASS** (`32482943370`).
- **Database Replay ×2 + database lint — PASS** (`32482943435`).
- **Backend Typecheck and backend smoke — PASS** (`32482943445`).
- **Business Banking Runtime — PASS** (`32482943416`).
- **Repository Quality — PASS** (`32482943428`).
- **Runtime Interaction Wiring — PASS** (`32482943464`).
- **Supply Chain Security — PASS** (`32482943442`).
- **Player Terminal Verify, including Chromium — PASS** (`32482943372`).
- **Admin API Check — PASS** (`32482943393`).
- **Staging Readiness Preflight — PASS** (`32482943549`).
- **Required Game Market Timezone and Exchange Calendar Runtime — PASS** (`32482943403`, `32482943398`).

### Architecture and gameplay decisions

- Stockroom is a read model over canonical Inventory accounts, never a Business-specific inventory authority or projection table.
- Browser reads never provision or mutate inventory; account provisioning occurs only through authoritative Business lifecycle writes and migration backfill.
- Empty canonical locations are first-class operational state and remain visible.
- One snapshot RPC is required to avoid transient aggregate/item disagreement under concurrent settlement.
- Store-listing stock remains a later Phase 8 location and was not introduced early.

### Remaining Phase 3 blocker

Phase 3 is not complete. The legacy Player API still advertises and executes the abstract `businessInputPurchase` path backed by `unit_input_cost`. Historical compatibility data must remain readable, but new Player execution and capability advertisement must be retired before Phase 4 opens.

### Next authorized step

**Phase 3D — retire new Player API reliance on legacy abstract input purchasing is OPEN.** Preserve historical records and the bounded compatibility URL, return a stable `410 Gone` retirement response for authenticated attempts, remove the action from server/client capability manifests and active browser controls, and eliminate the live `purchase_business_input_v1` execution path. Canonical Business Store procurement remains the only new material-acquisition authority. Phase 4 workforce/payroll remains closed.

---
## 2026-08-22 — Phase 3D COMPLETE and Phase 3 COMPLETE: abstract input-purchase retirement

### Certified implementation and verification sources

- **Exact implementation SHA:** `bd186ba86b4952bff7f4ab9b34c5e067dbd70116`.
- **Exact clean verification head:** `832c609679e4d423e968ee2e42bd810d7aa6a862`.
- Feature branch: `refactor/business-abstract-input-retirement-v2`.
- Stacked draft PR: #656, based on certified Phase 3C branch `feat/business-stockroom-locations-v2`.
- PR #648, PR #654, PR #655, and PR #656 remained open, draft, mergeable, unmerged, and undeployed.
- No staging or production deployment or data mutation was performed.
- The clean verification head differs from the implementation SHA only by static workflow cleanup, a focused test assertion refinement, and deterministic architecture-inventory convergence; it does not change production runtime behavior.
- This certification documentation is later than both tested SHAs and must not replace either as evidence.

### What changed

- Preserved the bounded URL `/players/me/business/inputs/purchases` so old clients receive an explicit retirement response rather than an ambiguous route failure.
- Preserved normal Player authentication, scope derivation, request-envelope validation, method validation, and sensitive rate limiting before retirement handling.
- Valid authenticated requests now return HTTP `410 Gone` with code `business_input_purchase_retired` and direct Players to canonical Business Store procurement.
- Removed the live `businessInputPurchase` mutation case and all runtime execution of `purchase_business_input_v1` from the Player Business application path.
- Preserved historical SQL functions, Business inventory records, ledger evidence, and audit history; no historical data was deleted or rewritten.
- Removed `businessInputPurchase` from the server capability manifest and bumped the manifest version to `2026-08-21.2`.
- Removed the action from Player endpoint resolution, Business route helpers, capability validation, write invalidation, Business controls, and button-action evidence.
- Removed the connected-browser abstract input-purchase step while retaining the broader Business lifecycle regression through a zero-input-cost historical product fixture.
- Kept canonical Business Store procurement as the only authority for new material acquisition.
- Regenerated the deterministic architecture inventory and returned compatibility-marker debt to the existing maximum of `209`; no architecture-ratchet ceiling was raised.

### Verification on clean head `832c6096...`

- **Business Economy V2 — PASS** (`32521931016`).
- **Business Banking Runtime — PASS** (`32521931181`).
- **Repository Quality — PASS** (`32521931055`).
- **Backend Typecheck and backend smoke — PASS** (`32521930987`).
- **Player Terminal Verify, including Chromium — PASS** (`32521930935`).
- **Progression Runtime, including Chromium, security, typecheck, and backend smoke — PASS** (`32521930881`).
- **Environment Neutral Browser — PASS** (`32521930999`).
- **Runtime Interaction Wiring — PASS** (`32521931005`).
- **Supply Chain Security — PASS** (`32521931149`).
- **Beta Security Contract — PASS** (`32521930924`).
- **World Runtime — PASS** (`32521930953`).
- **Staging Readiness Preflight — PASS** (`32521930969`).
- **Required Game Market Timezone — PASS** (`32521931017`).
- **Exchange Calendar Runtime — PASS** (`32521930901`).
- No migration was added or modified in Phase 3D, so Database Replay was not a changed-path gate; retained historical SQL and the absence of new migration authority were covered by the retirement and Business runtime contracts.

### Architecture and gameplay decisions

- A retired mutation may remain as an authenticated compatibility route, but it must not remain advertised as a capability or reachable through an active browser control.
- Retirement responses execute only after normal authentication and validation; the route is not an unauthenticated information oracle.
- Historical Business products, abstract cost records, and ledger history remain readable for audit and migration safety, but they cannot be expanded through new Player execution.
- Canonical Store procurement and canonical Inventory accounts are the sole new material-acquisition and stock authority.
- Phase 3 is complete. No remaining Phase 3 blocker authorizes expansion of the retired abstract model.

### Blockers and unresolved risks

- No Phase 3 blocker remains.
- Historical abstract Business data still exists by design and must remain compatibility-only until a later explicit data-retirement migration is separately planned and verified.
- The integration stack remains draft and unmerged; release, staging deployment, production deployment, and data migration remain unauthorized.

### Next authorized step

**Phase 4 — workforce capacity and payroll is OPEN.** Begin with a bounded authority audit and foundation checkpoint: preserve server-generated candidates and roles, define recipe labor-minute/role requirements, model finite employee availability and reservations, preserve recurring payroll independent of utilization, prevent double-booking, and prohibit Player-authored productivity or economic outcomes. Do not widen this checkpoint into equipment, timed manufacturing, Store seller offers, IPO, merge, or deployment.

---
## 2026-08-22 — Phase 4A COMPLETE: workforce and payroll authority foundation

### Certified state

- **Exact implementation SHA:** `f72626f055004007823eb8de22569035ac897797`.
- **Exact required-gate head:** `1c405c86d773d133fb13da268a95a32eb46a9bd7`.
- **Certification workflow source:** `102ef444d39cd4722a5c4ef190bf0ad58f804864`.
- Feature branch: `feat/business-workforce-payroll-foundation-v2`; stacked draft PR #657.
- PR #648 and parent Phase 3 PR #656 remained open, draft, and unmerged.
- No staging or production deployment or live data mutation was performed.

### What changed

- Added canonical workforce roles, game-scoped candidate offers, recipe labor requirements, finite labor reservations, payroll runs, and payroll entries.
- Bound labor and payroll evidence to one Business, employee, role, run, game, country, and currency scope.
- Preserved service-owned economics, public-key browser contracts, game isolation, immutable payroll evidence, and the no-settlement/no-production-integration boundary.

### Exact-head verification

- **Business Workforce Payroll V2 — PASS** (`32544375317`, head `1c405c86d773d133fb13da268a95a32eb46a9bd7`).
- **Database Replay — PASS** (`32544375343`, head `1c405c86d773d133fb13da268a95a32eb46a9bd7`).
- **Backend Typecheck — PASS** (`32544375326`, head `1c405c86d773d133fb13da268a95a32eb46a9bd7`).
- **Business Banking Runtime — PASS** (`32545599820`, head `1c405c86d773d133fb13da268a95a32eb46a9bd7`).
- **Repository Quality — PASS** (`32544375307`, head `1c405c86d773d133fb13da268a95a32eb46a9bd7`).
- **Runtime Interaction Wiring — PASS** (`32545600548`, head `1c405c86d773d133fb13da268a95a32eb46a9bd7`).
- **Supply Chain Security — PASS** (`32544375335`, head `1c405c86d773d133fb13da268a95a32eb46a9bd7`).
- **Admin API Check — PASS** (`32544375332`, head `1c405c86d773d133fb13da268a95a32eb46a9bd7`).
- **Staging Readiness Preflight — PASS** (`32544375337`, head `1c405c86d773d133fb13da268a95a32eb46a9bd7`).
- **Required Game Market Timezone — PASS** (`32544375325`, head `1c405c86d773d133fb13da268a95a32eb46a9bd7`).
- **Exchange Calendar Runtime — PASS** (`32544375304`, head `1c405c86d773d133fb13da268a95a32eb46a9bd7`).
- **Player Terminal Verify and Chromium browser verification — PASS** in finalizer run `32544375336` attempt 2.

### Blocker resolution

- The original finalizer passed all implementation, browser, and exact-head gates but failed in its workflow-file cleanup/certification write.
- This bounded docs-only certifier independently revalidated every required exact-head run and recorded the certification without weakening any gate or ratchet.

### Decisions and remaining work

- Workforce economics and finite capacity remain server authority; Phase 4A records payroll evidence but performs no settlement and no production-labor integration.
- Phase 4 remains incomplete. Payroll settlement and production-labor integration remain closed.

### Next authorized step

**Phase 4B — candidate pools and server-owned hiring is OPEN.** Expose role-grouped, game-scoped candidates; derive wage, skill, productivity, capacity, country, and currency from server-owned candidate rows; atomically reserve candidates; prevent duplicate active hires; and retire new Player execution through the legacy free-text hiring RPC.

---

## 2026-08-22 — Phase 4B COMPLETE: candidate pools and server-owned hiring

### Certified source and repository state

- **Exact certified implementation source:** `73bb4bfb4a6d7eca1f36e8fd6ef707ca5c797cdf`.
- Initial generated implementation source: `fd83a17779254ac4ed386ef3ea65fe9c774ee3d2`.
- Generator and error-envelope correction: `054c2d3e86928fc44e17b4872830b8b1fee5d111`.
- Feature branch: `feat/business-workforce-hiring-v2`; stacked draft PR #658.
- PR #658 and integration PR #648 remain open, draft, unmerged, and undeployed.
- No staging or production migration, deployment, secret change, or live database mutation was performed.
- This documentation commit is later than the tested implementation source and must not replace `73bb4bfb4a6d7eca1f36e8fd6ef707ca5c797cdf` as certification evidence.

### What is now authoritative

- The Player reads a public-key-only workforce candidate pool scoped to the authenticated game and an owned Business.
- Candidate availability is filtered server-side by status, availability window, active role, Business country, and Business currency.
- The browser submits only Business public key, candidate public key, and idempotency intent.
- Role, wage, labor minutes, skill, productivity, contract type, country, and currency are copied from trusted candidate authority inside the hiring transaction.
- Hiring locks the Business and candidate, rejects unavailable, expired, self, country-mismatched, currency-mismatched, and duplicate candidate-backed employment, advances the candidate state, creates the canonical employee, and records audit evidence.
- Matching idempotency retries replay the original receipt; conflicting reuse is rejected.
- The legacy free-text employee-creation URL remains authenticated compatibility-only and returns HTTP `410 Gone` with `business_free_text_hiring_retired`.
- Payroll settlement and production-labor integration remain outside Phase 4B and are not claimed complete.

### Canonical-gate corrections completed before certification

- Added a real candidate fixture and candidate-selection assertions to the complete Player Business surface contract.
- Removed stale browser expectations for Player-authored wage, role, and productivity fields.
- Replaced the Phase 3D retirement contract's brittle regex-distance assertion with an explicit source-order invariant.
- Bound cross-cutting Player verification authority to PR #658, its exact stacked base, and the reviewed Phase 4B paths.
- Corrected shared and mixed Player Edge dispatch to use `businessCandidateHire` and `businessRetiredHire` rate-limit identities.
- Advanced the Phase 4A payroll-foundation contract to validate the Phase 4B hiring cutover rather than require the retired free-text mutation.
- Preserved the deterministic architecture inventory without raising an architecture-ratchet ceiling.

### Exact-source verification on `73bb4bfb4a6d7eca1f36e8fd6ef707ca5c797cdf`

- **Business Workforce Hiring V2 — PASS** (`32566581956`).
- **Business Workforce Payroll V2 — PASS** (`32566581952`).
- **Player Terminal Verify, including Chromium — PASS** (`32566581998`).
- **Database Replay from zero twice plus rebuilt-database lint — PASS** (`32566582036`).
- **Repository Quality — PASS** (`32566581981`).
- **Backend Typecheck — PASS** (`32566581994`).
- **Beta Security Contract, including all Edge typechecks — PASS** (`32566581975`).
- **Business Banking Runtime — PASS** (`32566581978`).
- **Business Economy V2 — PASS** (`32566581948`).
- **Progression Runtime, including browser verification, backend smoke, and credential scan — PASS** (`32566582024`).
- **Runtime Interaction Wiring — PASS** (`32566581990`).
- **Environment Neutral Browser — PASS** (`32566581924`).
- **Supply Chain Security — PASS** (`32566582026`).
- **Admin API Check — PASS** (`32566582016`).
- **World Runtime, Staging Readiness, market-timezone, and exchange-calendar gates — PASS** (`32566581965`, `32566582004`, `32566582034`, `32566582020`).

### Phase 4B exit result

- Authoritative candidate pool: **met**.
- Candidate-only server-owned hiring: **met**.
- Browser-authored employee economics retired: **met**.
- Business ownership, cross-game isolation, public-key privacy, concurrency, and idempotency boundaries: **met**.
- Canonical repository, database, backend, security, static Player, and Chromium gates: **met**.
- Exact source and durable execution-log evidence: **met**.

### Carry-forward scope

1. Bind production orders to eligible role-specific labor requirements and finite employee minutes.
2. Reserve, activate, consume, release, and recover labor without double booking.
3. Remove the immediate synthetic production wage debit while retaining labor allocation in production cost basis.
4. Create deterministic payroll runs and employee entries from authoritative employment state, independent of production utilization.
5. Settle payroll through Business Checking with explicit completed, partially paid, and unpaid outcomes plus idempotent recovery.
6. Publish utilization and idle-capacity read models without exposing internal identifiers.

### Next authorized step

**Phase 4C — production-labor integration and deterministic payroll settlement is OPEN.** Build it on a stacked branch from this certified Phase 4B lineage. Do not widen the tranche into equipment, timed manufacturing, Store seller offers, IPO, merge, staging, or production deployment. Do not declare Phase 4C complete until implementation, exact source, required gates, and a durable execution-log entry all exist.

---

## 2026-08-23 — Phase 4C COMPLETE and Phase 4 COMPLETE: production labor and deterministic payroll

### Certified source and repository state

- **Exact certified implementation and verification source:** `857ab6ec77bf02ad619092632e2def80f12d4329`.
- Feature branch: `feat/business-workforce-production-labor-v2`.
- Stacked draft PR: #659, based on certified Phase 4B branch `feat/business-workforce-hiring-v2`.
- PR #659 remained open, draft, mergeable, unmerged, and undeployed at certification.
- Integration PR #648 remained open, draft, and unmerged.
- No staging or production migration, deployment, secret change, or live database mutation was performed.
- The documentation commits that record this certification are later than the tested implementation source and must not replace `857ab6ec77bf02ad619092632e2def80f12d4329` as certification evidence.

### What is now authoritative

- Production resolves one exact Business-owned canonical recipe and its active role, headcount, minimum-skill, fixed-minute, and per-unit labor requirements server-side.
- The current payroll period is derived from authoritative game/cycle state.
- Eligible employees are selected and locked in deterministic order from the same game, Business, active employment, role, and skill scope.
- Finite employee minutes are reserved against one payroll period and one production run, preventing concurrent double booking.
- Matching production retries replay the original run without new labor reservations, material movement, or output settlement; conflicting idempotency reuse fails closed.
- Successful instant compatibility production consumes its reservations exactly once. Explicit recovery can release or consume unresolved reservations without duplicating capacity.
- Production no longer performs an immediate synthetic wage cash debit. Labor allocation remains recorded as managerial production cost basis from authoritative wage and capacity terms.
- Recurring payroll creates one deterministic run and one entry per eligible employee even when production utilization is zero.
- Business Checking payroll settlement supports completed, partially paid, and unpaid outcomes rather than rolling back an underfunded cycle.
- Partial-payment recovery settles only remaining unpaid wages exactly once.
- Player-linked employees are credited through canonical Player Checking ledger authority; system candidates retain payroll evidence without invented Player accounts.
- The Player Business read model exposes public Business, employee, role, payroll-run and period keys; capacity, reserved, consumed, available and idle minutes; utilization basis points; and wage due, paid and unpaid without internal UUIDs.
- The Player Business UI renders workforce utilization and payroll state and maps stable labor/payroll errors to bounded player-safe messages.

### Focused contracts and simulations

- `business-phase4c-production-labor-contract.mjs` verifies canonical recipe/labor scope, finite capacity, no synthetic wage debit, cost-basis allocation, idempotency, recovery and browser-safe publication.
- `business-phase4c-labor-reservation-simulation.mjs` verifies double-book prevention, replay, conflict and capacity behavior.
- `business-phase4c-payroll-settlement-contract.mjs` verifies deterministic payroll authority, canonical ledger settlement and partial/unpaid states.
- `business-phase4c-payroll-simulation.mjs` verifies payroll clock, zero-production payroll, partial funding, replay and recovery.
- `business-phase4c-player-recovery-contract.mjs` verifies Player utilization publication, stable recovery errors and bounded browser contracts.

### Exact-head verification on `857ab6ec77bf02ad619092632e2def80f12d4329`

- **Business Workforce Production Payroll V2 — PASS** (`32601382383`).
- **Business Workforce Payroll V2 — PASS** (`32601382371`).
- **Business Workforce Hiring V2 — PASS** (`32601382382`).
- **Database Replay from zero twice and rebuilt-database lint — PASS** (`32601382380`).
- **Backend Typecheck and backend smoke — PASS** (`32601382359`).
- **Repository Quality — PASS** (`32601382340`).
- **Player Terminal Verify, including Chromium browser verification — PASS** (`32601382375`).
- **Business Banking Runtime — PASS** (`32601382366`).
- **Business Economy V2 — PASS** (`32601382376`).
- **Progression Runtime — PASS** (`32601382338`).
- **Environment Neutral Browser — PASS** (`32601382374`).
- **Supply Chain Security — PASS** (`32601382337`).
- **Runtime Interaction Wiring — PASS** (`32601382351`).
- **Admin API Check — PASS** (`32601382356`).
- **World Runtime — PASS** (`32601382370`).
- **Staging Readiness Preflight — PASS** (`32601382342`).
- **Required Game Market Timezone — PASS** (`32601382363`).
- **Exchange Calendar Runtime — PASS** (`32601382357`).

### Phase 4C exit result

- Canonical production-labor authority: **met**.
- Finite employee-minute reservation and double-book prevention: **met**.
- Exact-once reservation consumption/recovery: **met**.
- No second wage cash debit from production: **met**.
- Labor cost-basis allocation without duplicate money movement: **met**.
- Deterministic recurring payroll independent of utilization: **met**.
- Completed, partially paid and unpaid payroll settlement: **met**.
- Exact-once unpaid-wage recovery: **met**.
- Player-linked and system-candidate payroll evidence: **met**.
- Public-key-only utilization and idle-capacity read model: **met**.
- Database, backend, Edge, repository, security, Player and Chromium gates: **met**.
- Exact implementation source and durable plan/log evidence: **met**.
- No production deployment: **met**.

### Architecture and gameplay decisions

- Existing instant production remains a bounded compatibility lifecycle until Phase 6 replaces it with authoritative timed manufacturing; Phase 4C does not claim a job queue or browser-declared completion authority.
- Labor capacity is authoritative even if an older noncanonical product remains in compatibility mode. Compatibility production makes no false canonical workforce claim.
- Recurring payroll is owed because the employee is employed, not because production used the employee.
- Labor allocation may enter inventory/production managerial cost basis but is never a second payroll ledger debit.
- Equipment authority was deliberately not introduced early.
- No architecture-ratchet ceiling was raised to certify Phase 4C.

### Blockers and unresolved risks

- No Phase 4 workforce/payroll blocker remains.
- Equipment requirements, installation, finite equipment-time reservations, condition/maintenance and double-booking prevention remain absent and are required before timed manufacturing.
- Physical production is still instant compatibility behavior; Phase 6 must replace it only after Phase 5 equipment authority is certified.
- The stacked PR chain remains draft and unmerged; release, staging deployment, production deployment and live migration remain unauthorized.

### Next authorized step

**Phase 5 — equipment capacity is OPEN.** Begin with a bounded canonical-equipment authority audit and scope lock: identify canonical equipment items/capabilities, define Business ownership and installation semantics, attach equipment capability/time requirements to canonical recipes without creating another item catalog, model finite equipment-time reservations, prevent concurrent double booking, and keep condition/maintenance behavior server-owned. Do not widen this tranche into timed manufacturing, Store seller offers, IPO, merge, staging, or production deployment.

---

## 2026-08-23 — Phase 5 COMPLETE: canonical equipment capacity

### Certified source and repository state

- **Exact certified implementation and verification source:** `6f936abd61c6cd903f6e839790ceab24ed570748`.
- Feature branch: `feat/business-equipment-capacity-v2`.
- Stacked draft PR: #660, based on the Phase 4 certification branch `feat/business-workforce-production-labor-v2`.
- PR #660 remained open, draft, mergeable, unmerged, and undeployed at certification.
- Integration PR #648 remained open, draft, and unmerged.
- No staging or production migration, deployment, secret change, or live database mutation was performed.
- Documentation commits after the tested source record certification only and must not replace `6f936abd61c6cd903f6e839790ceab24ed570748` as implementation evidence.

### What is now authoritative

- Canonical `physical_economy_item_definitions`, `game_items`, `equipment_instances`, economic parties, inventory accounts, and inventory holdings remain the sole equipment/item/ownership authorities.
- `equipment_instances.player_id` is nullable compatibility provenance: Player equipment remains bound to the Player personal account, while Business equipment is bound to the same-game Business warehouse account and has no Player loadout slot.
- Business equipment materialization is idempotent and cannot create more serialized instances than canonical warehouse ownership supports.
- One Business installation row owns operational state for one Business-owned equipment instance. Duplicate, cross-game, cross-Business, and Player-owned installation attempts fail closed.
- Server-derived capacity profiles use canonical equipment definitions and normalized capability/tool tags; Players cannot author capacity, condition, capability, or maintenance outcomes.
- Canonical recipe `required_tools` synchronizes into bounded Business equipment-time requirements without creating another recipe or tool catalog.
- Finite equipment minutes are reserved in deterministic installation order against one authoritative operating period and production intent.
- Reserved, active, and consumed minutes count against capacity; released minutes do not. Matching retries replay, conflicting idempotency reuse fails, and terminal transitions cannot be repeated into another outcome.
- Existing physical production reserves every required installed-equipment capability before material/labor settlement and consumes the exact reservations only after successful settlement. A failed transaction rolls the equipment reservations back atomically.
- The public Business equipment read exposes only public keys, canonical item identity, capability tags, installation state, capacity, reserved/consumed/available/idle minutes, utilization basis points, and explicit unsupported durability/repair flags.

### Exact-head verification on `6f936abd61c6cd903f6e839790ceab24ed570748`

- **Business Equipment Capacity V2 — PASS** (`32605009671`).
- **Database Replay from zero twice and rebuilt-database lint — PASS** (`32605009709`).
- **Backend Typecheck and backend smoke — PASS** (`32605009722`).
- **Player Terminal Verify, including Chromium browser verification — PASS** (`32605009756`).
- **Business Banking Runtime — PASS** (`32605009647`).
- **Business Economy V2 — PASS** (`32605009635`).
- **Business Workforce Production Payroll V2 — PASS** (`32605009705`).
- **Repository Quality — PASS** (`32605009728`).
- **Supply Chain Security — PASS** (`32605009711`).
- **Admin API Check — PASS** (`32605009682`).
- **Staging Readiness Preflight — PASS** (`32605009637`).
- **Required Game Market Timezone — PASS** (`32605009732`).
- **Exchange Calendar Runtime — PASS** (`32605009702`).

### Phase 5 exit result

- Canonical equipment ownership and serialized instance authority: **met**.
- Business installation authority and Player-loadout separation: **met**.
- Canonical recipe equipment requirement synchronization: **met**.
- Finite equipment-time reservation and double-book prevention: **met**.
- Production-side equipment enforcement and exact-once settlement: **met**.
- Server-owned operational state with durability/repair disabled: **met**.
- Public-key-only equipment utilization read: **met**.
- Database, backend, Edge, repository, security, Player, and Chromium gates: **met**.
- Exact implementation source and durable scope/plan/log evidence: **met**.
- No production deployment: **met**.

### Architecture and gameplay decisions

- Equipment definitions and unique instances remain canonical physical-economy/economic-asset authority; Business adds only ownership-compatible installation and finite utilization state.
- Equipment capacity is a server-derived operating constraint, not a Player-authored stat.
- Current instant production is only a compatibility bridge proving material, labor, and equipment prerequisites can settle atomically. It is not the target manufacturing lifecycle.
- Durability decay, random failure, repair pricing, and maintenance settlement remain disabled until separately scoped and reviewed.
- No architecture-ratchet ceiling was raised to certify Phase 5.

### Blockers and unresolved risks

- No Phase 5 equipment-capacity blocker remains.
- Physical production still completes in one request. It does not yet retain material, labor, and equipment reservations across server time.
- A bounded shared worker, due-job claiming, completion/failure/cancellation transitions, WIP settlement, and exact-once capacity release remain required in Phase 6.
- Store seller offers, Store-listing inventory, withdrawal safety, automatic sales convergence, equity/IPO, merge, staging, and production deployment remain unauthorized.

### Next authorized step

**Phase 6 — timed manufacturing is OPEN.** Start with a bounded lifecycle foundation on a stacked branch from the certified Phase 5 lineage: create server-owned production jobs, validate one exact Business-owned canonical recipe and output, reserve canonical BOM materials into WIP, reserve labor and installed equipment across the job lifetime, derive completion time server-side, and define exact-once due-job completion/cancellation/failure recovery. Do not widen the first checkpoint into Store seller offers, Store-listing stock, sales convergence, IPO, merge, staging, or production deployment.

---

## 2026-08-24 — Phase 6 COMPLETE: authoritative timed manufacturing

### Certified source and repository state

- **Exact certified implementation and verification source:** `739f5540234b20e16ba34f69f0d741d986030113`.
- Core Phase 6B–6E implementation identity retained as `bee7a5c6a98389ed9f238fc7191f8c4621f6e1ff`.
- Feature branch: `feat/business-timed-manufacturing-v2`.
- Stacked draft PR: #661, based on certified Phase 5 branch `feat/business-equipment-capacity-v2`.
- PR #661 remained open, draft, mergeable, unmerged, and undeployed at certification.
- Integration PR #648 remained open, draft, mergeable, and unmerged on `refactor/business-ux-mechanics-v1` at `de9d0bc944e4668b276a3ee06651ee5964e0507c`.
- No merge, staging deployment, production deployment, secret mutation, or live database mutation was performed.
- Later documentation commits record certification only and must not replace `739f5540234b20e16ba34f69f0d741d986030113` as the exact tested source.

### What is now authoritative

- A Player can request only an owned Business, exact canonical product, quantity, bounded priority, and idempotency intent; game, Player, recipe, output, timing, material, labor, and equipment authority are server derived.
- Starting a job atomically moves exact canonical BOM quantities from Business Warehouse to WIP and reserves eligible employee minutes plus installed operational equipment minutes.
- Job duration, queue start, due time, completion leases, retry state, and terminal outcome are server owned.
- Bounded workers start and complete jobs; the browser can display server timestamps/countdown state but cannot author completion.
- Completion consumes exact WIP, creates the exact canonical output in Business Finished Goods, and consumes labor/equipment reservations exactly once.
- Cancellation/failure returns staged materials and releases reservations exactly once; completion and recovery serialize on the same authoritative job state.
- Legacy instant production is compatibility-only and returns authenticated HTTP `410 Gone` with `business_instant_production_retired`.
- Public reads remain game scoped and public-key only; internal UUIDs, holding/account IDs, employee/equipment IDs, lease tokens, request hashes, and trusted snapshots remain private.

### Exact-head verification on `739f5540234b20e16ba34f69f0d741d986030113`

- **Business Timed Manufacturing V2 — PASS** (`32673084291`), including Phase 6 contracts/simulations, retained Phase 4/5 regressions, backend/all Edge TypeScript, Player Business surface, and local Player Edge entrypoint boot/preflight.
- **Business Manufacturing Resource Hold V2 — PASS** (`32673084215`).
- **Business Manufacturing Completion V2 — PASS** (`32673084379`).
- **Business Manufacturing Recovery V2 — PASS** (`32673084284`).
- **Business Manufacturing Classroom Load Isolation V2 — PASS** (`32673084315`): 40 Players, two games, 403 start attempts, 41 unique jobs, 411 completion attempts, exact-once replay behavior, and cross-game denial.
- **Database Replay — PASS** (`32673084245`): complete replay from zero twice plus rebuilt-database lint.
- **Backend Typecheck — PASS** (`32673084260`): backend typecheck and backend smoke.
- **Beta Security Contract — PASS** (`32673084257`): all security-surface/Edge typechecks, boundary contracts, and credential scan.
- **Player Terminal Verify — PASS** (`32673084176`): standalone verification and Chromium browser verification.
- **Business Economy V2 — PASS** (`32673084344`).
- **Business Banking Runtime — PASS** (`32673084304`).
- **Business Workforce Hiring V2 — PASS** (`32673084318`).
- **Business Workforce Payroll V2 — PASS** (`32673084244`).
- **Business Workforce Production Payroll V2 — PASS** (`32673084339`).
- **Repository Quality — PASS** (`32673084218`).
- **Supply Chain Security — PASS** (`32673084349`).
- **Runtime Interaction Wiring — PASS** (`32673084383`).
- **Environment Neutral Browser — PASS** (`32673084241`).
- **Progression Runtime — PASS** (`32673084337`).
- **World Runtime — PASS** (`32673084292`).
- **Admin API Check — PASS** (`32673084283`).
- **Staging Readiness Preflight — PASS** (`32673084287`).
- **Required Game Market Timezone — PASS** (`32673084221`).
- **Exchange Calendar Runtime — PASS** (`32673084224`).

### Phase 6 exit result

- Atomic canonical job start and resource reservation: **met**.
- Server-derived timing and worker-owned lifecycle: **met**.
- Exact-once Finished Goods completion: **met**.
- Exact-once cancellation/failure recovery: **met**.
- Legacy instant-production compatibility retirement: **met**.
- Payroll remains recurring and is not double debited by production: **met**.
- Material, labor, and equipment double-spend/double-book prevention: **met**.
- Database, backend, all Edge, repository, security, Player, Chromium, 40-Player, and two-game gates: **met**.
- Exact source and durable plan/log/scope/evidence record: **met**.
- No deployment or live mutation: **met**.

### Decisions and cleanup

- The five permanent Phase 6 workflows are the timed-manufacturing, resource-hold, completion, recovery, and classroom load/isolation gates.
- Temporary repair/certifier/finalizer/convergence workflows are not part of PR #661's final changed-file set. The one-time durable-record finalizer used to write this entry must be deleted immediately after its successful docs commit.
- The historical `automation/phase6-repair-trigger-20260823` branch has no pull request and is non-authoritative; it will be neutralized to the clean certified lineage after finalizer removal.
- Phase 6 remains unmerged and undeployed. Certification authorizes development continuation only.

### Next authorized step

**Phase 7 checkpoint 7A — seller-offer authority and multi-offer catalog aggregation is OPEN.** Create a stacked draft branch/PR from the durably certified Phase 6 lineage. Reuse canonical Store/catalog, Business, Inventory, money, and economic-party authorities. Keep offer identity separate from catalog identity. Do not include physical Store custody, listing-stock transfer, withdrawal processing, buyer payment/inventory settlement, automatic demand/sales convergence, equity/IPO, merge, or deployment in checkpoint 7A.

---

## 2026-08-24 — Phase 7A COMPLETE: Store seller-offer authority and aggregation foundation

### Certified source and repository state

- **Exact certified implementation and verification source:** `04db81436e75cea6c52d0c720508c3ea12baab05`.
- Feature branch: `feat/business-store-seller-offers-v2`.
- Stacked draft PR: #662, based on the clean certified Phase 6 handoff `b4a41fd1f80dbe426e1aa20bd1ff37291dca1fd4` / PR #661.
- PR #662 remained open, draft, mergeable, unmerged, and undeployed at certification.
- Integration PR #648 remained open, draft, and unmerged on `refactor/business-ux-mechanics-v1`.
- No merge, staging deployment, production deployment, secret mutation, or live database mutation was performed.
- Later documentation-only commits record certification and do not replace `04db81436e75cea6c52d0c720508c3ea12baab05` as the exact tested source.

### What is now authoritative

- `public.store_seller_offers` is the Store-owned seller-specific commercial authority while `game_items` remains product identity and `store_items` remains Store presentation plus the legacy quote/purchase compatibility channel.
- Offers use public `sof_...` identity, bounded seeded/NPC/Business seller kinds, draft/active/paused/terminal-retired lifecycle, optimistic versions, immutable identity, and service-derived game/seller/catalog scope.
- A current Business offer is unique per Business seller and canonical item; one active custody account cannot back multiple active offers.
- Active offers require a same-game active canonical `store_stock` Inventory account owned by the seller party. Available quantity is derived from canonical holdings and is never persisted as parallel offer quantity.
- Existing Store administration backfills and synchronizes seeded compatibility offers for permitted price, currency, visibility, and status changes. Canonical item/account repointing is rejected, and currency changes fail closed while current Business offers exist.
- Service-only commands provide idempotent Business draft creation and optimistic price/state/one-time custody binding without exposing Player mutation routes.
- The service-owned aggregation groups active inventory-backed offers under one canonical item and returns deterministic best price, total available quantity, seller/offer counts, and public-key-only offer details.
- Existing Player Store reads, quotes, purchases, Banking/ledger settlement, and buyer Inventory delivery remain unchanged in checkpoint 7A.

### Exact-head verification on `04db81436e75cea6c52d0c720508c3ea12baab05`

- **Business Store Seller Offers V2 — PASS** (`32681497746`): seller-offer authority/simulations, deterministic architecture inventory, retained Banking/Business/Store/Inventory contracts, standalone Player Terminal, and Chromium verification.
- **Database Replay — PASS** (`32681497737`): complete replay from zero twice plus rebuilt-database lint.
- **Backend Typecheck — PASS** (`32681497570`): backend typecheck and backend smoke.
- **Business Timed Manufacturing V2 — PASS** (`32681497707`): retained manufacturing, workforce/equipment regressions, all Backend/Edge TypeScript, Player Business surface, and local Player Edge boot/preflight.
- **Business Workforce Payroll V2 — PASS** (`32681497655`).
- **Business Economy V2 — PASS** (`32681497604`).
- **Repository Quality — PASS** (`32681497750`).
- **Supply Chain Security — PASS** (`32681497690`).
- **Runtime Interaction Wiring — PASS** (`32681497580`).
- **Admin API Check — PASS** (`32681497762`).
- **Required Game Market Timezone — PASS** (`32681497598`).
- **Exchange Calendar Runtime — PASS** (`32681497593`).

### Phase 7A exit result

- Store-owned seller-offer identity separate from catalog identity: **met**.
- Same-game seller/catalog/currency/custody validation and immutable identity: **met**.
- Idempotent Business draft creation, optimistic mutation, terminal lifecycle, and concurrency safety: **met**.
- Seeded compatibility backfill/synchronization with identity and currency guards: **met**.
- Canonical Inventory-backed multi-seller aggregation without parallel quantity: **met**.
- Deterministic multi-seller, stale-update, duplicate-create, and two-game isolation tests: **met**.
- Database, backend, all Edge, retained Business/Banking/Store/Inventory/workforce/equipment/manufacturing, repository, security, Player, and Chromium gates: **met**.
- No buyer-facing read/quote/purchase cutover, deployment, or live mutation: **met**.

### Decisions and unresolved boundaries

- Store offer identity and aggregation are now authoritative, but buyer-visible multi-offer presentation remains deferred until displayed price, quoted offer, payment, seller revenue, and transferred inventory can settle against one locked offer.
- A draft Business offer may bind a canonical Store-stock account once; an established non-null custody binding is immutable in checkpoint 7A.
- Seeded compatibility identity and custody are immutable. Existing Store administration may change permitted commercial presentation fields but cannot repoint the canonical item or stock account underneath an existing offer.
- Physical Finished Goods-to-Store custody, listing quantity commands, withdrawal cooling-off, offer-aware purchase settlement, automatic demand/sales convergence, equity/IPO, merge, staging, and production deployment remain unauthorized.

### Next authorized step

**Phase 8 — physical Store-listing inventory scope is OPEN.** Start with a bounded stacked checkpoint that creates or resolves canonical offer-scoped `store_stock` custody and moves exact units `Finished Goods -> Store Listing` with idempotency, optimistic offer concurrency, cost/provenance preservation, and two-game isolation. Do not include withdrawal cooling-off, buyer payment/inventory settlement, automatic sales convergence, equity/IPO, merge, staging, production deployment, secrets, or live database mutation in the first Phase 8 checkpoint.

---

## 2026-08-24 — Phase 8A COMPLETE: physical Store-listing inventory foundation

### Certified source and repository state

- **Exact certified implementation and verification source:** `c0fd8650987a332f99b8173395dcf84fc3518c15`.
- Feature branch: `feat/business-store-listing-inventory-v2`.
- Stacked draft PR: #663, based on the durably certified Phase 7A handoff `462e6083c5b2d2b3b5d515c67bc7a8d71a2e43fb` / PR #662.
- PR #663 remained open, draft, mergeable, unmerged, and undeployed at certification.
- Integration PR #648 remained open, draft, and unmerged on `refactor/business-ux-mechanics-v1`.
- No merge, staging deployment, production deployment, secret mutation, or live database mutation was performed.
- Later documentation-only commits record certification and do not replace `c0fd8650987a332f99b8173395dcf84fc3518c15` as the exact tested source.

### What is now authoritative

- The canonical Inventory poster accepts the retained seeded Store compatibility account and a Business-owned `store_stock` account only when that account is bound to one same-game, non-retired Business seller offer for the exact canonical item.
- Each Business offer resolves to one deterministic immutable Store-listing account owned by the Business economic party, with public Business/offer provenance and no parallel offer quantity.
- `public.stock_business_store_offer_v2` is service-only and moves positive integer units from canonical Finished Goods into the offer account under trusted game scope, public Business/offer keys, optimistic offer versioning, and idempotency.
- A matching committed retry replays before current-version rejection; conflicting key reuse, stale versions, retired offers, wrong seller/game/item/account, unavailable custody, and insufficient unreserved Finished Goods fail closed.
- The canonical transfer carries average unit cost and cost currency into Store-listing custody and records one append-only Inventory transaction; it does not create cash, revenue, tax, wage, expense, or COGS entries.
- The retained `business_inventory` Finished Goods row is locked, verified against canonical Inventory, and synchronized to the canonical post-state in the same transaction, preventing stale stockroom reads or re-inflation of already-listed units.
- Phase 7A aggregation now observes real Business offer availability from canonical Store-listing holdings without changing existing Player Store reads, quotes, purchases, buyer Inventory delivery, or Banking settlement.

### Exact-head verification on `c0fd8650987a332f99b8173395dcf84fc3518c15`

- **Business Store Listing Inventory V2 — PASS** (`32691204140`): Phase 8A structural/type contracts, deterministic custody/concurrency/cost/projection simulation, deterministic architecture inventory, retained Business/Store/Inventory runtime, all Backend/Edge TypeScript, standalone Player Terminal, and Chromium.
- **Business Store Seller Offers V2 — PASS** (`32691204160`): retained Phase 7A authority, aggregation, Banking/Store/Inventory/Business contracts, standalone Player Terminal, and Chromium.
- **Database Replay — PASS** (`32691204293`): complete replay from zero twice plus rebuilt-database lint.
- **Backend Typecheck — PASS** (`32691204167`): backend typecheck and backend smoke.
- **Business Timed Manufacturing V2 — PASS** (`32691204313`): retained manufacturing, workforce/equipment regressions, all Backend/Edge TypeScript, Player Business surface, and local Player Edge boot/preflight.
- **Business Workforce Payroll V2 — PASS** (`32691204210`).
- **Business Economy V2 — PASS** (`32691204214`).
- **Repository Quality — PASS** (`32691204184`).
- **Supply Chain Security — PASS** (`32691204146`).
- **Runtime Interaction Wiring — PASS** (`32691204273`).
- **Admin API Check — PASS** (`32691204138`).
- **Required Game Market Timezone — PASS** (`32691204157`).
- **Exchange Calendar Runtime — PASS** (`32691204255`).

### Phase 8A exit result

- Canonical Business Store-listing account identity and immutable offer custody: **met**.
- Exact available Finished Goods-to-Store movement with reserved-quantity exclusion: **met**.
- Idempotent replay, conflicting-retry rejection, optimistic versioning, and concurrent-command serialization: **met**.
- Average cost, currency, transaction provenance, and public-key privacy: **met**.
- Canonical holdings and retained Business stockroom projection convergence: **met**.
- Phase 7A aggregation reflects physical Business offer inventory without parallel quantity: **met**.
- Database, backend, all Edge, retained Business/Banking/Store/Inventory/workforce/equipment/manufacturing, repository, security, Player, and Chromium gates: **met**.
- No withdrawal, buyer settlement, Player mutation/read cutover, deployment, or live mutation: **met**.

### Decisions and unresolved boundaries

- Stock placement is additive only. Reduction, cancellation, return to Finished Goods, and cooling-off state remain Phase 9 authority.
- Listing does not activate an offer automatically; offer lifecycle remains explicit and optimistic.
- Buyer-visible reads remain on the retained Store compatibility channel until displayed offer, quote, payment, seller revenue, and transferred inventory can settle against one locked offer.
- Store-listing inventory is not cash or revenue. Seller cash, COGS, tax, and buyer Inventory remain untouched until Phase 10.
- Withdrawal/purchase race ordering, simulated demand convergence, Player UX, equity/IPO, merge, staging, and production remain unauthorized.

### Next authorized step

**Phase 9 checkpoint 9A — five-minute Store withdrawal safety is OPEN.** Create a stacked draft branch/PR from the durably certified Phase 8A lineage. Introduce withdrawal-pending state and timestamps, disable purchase eligibility immediately, serialize request and due processing on the offer row/version, and return only remaining unsold units `Store Listing -> Finished Goods` after the minimum cooling-off period while preserving cost/provenance, retained stockroom convergence, idempotency, and two-game isolation. Do not include offer-aware buyer settlement, Player routes/UI, automatic sales convergence, equity/IPO, merge, staging, production deployment, secrets, or live database mutation.

---

## 2026-08-24 — Phase 9A COMPLETE: five-minute Store withdrawal safety

### Certified source and repository state

- **Exact certified implementation and verification source:** `bf17e2493654620229d1acdeaae0fbaba21caf63`.
- Feature branch: `feat/business-store-withdrawal-safety-v2`.
- Stacked draft PR: #664, based on the durably certified Phase 8A handoff `42e52c38eea7402aefadb4ec3fad0b6743a22588` / PR #663.
- PR #664 remained open, draft, mergeable, unmerged, and undeployed at certification.
- Integration PR #648 remained open, draft, and unmerged on `refactor/business-ux-mechanics-v1`.
- The exact certified changed-file surface contains one permanent read-only Phase 9A workflow plus Store-domain contracts/repository, four forward migrations, deterministic tests, the architecture inventory, and this scope document. Temporary repair, executor, runner, receipt-integrity, and contract-split workflows have zero net presence.
- No merge, staging deployment, production deployment, secret mutation, or live database mutation was performed.
- Later documentation-only commits record certification and do not replace `bf17e2493654620229d1acdeaae0fbaba21caf63` as the exact tested source.

### What is now authoritative

- Business seller offers may enter `withdrawal_pending` only through Store-owned service authority. The transition creates one durable public `swr_...` request, records the pre-withdrawal status, request mode/quantity, exact offer version, server request time, and an effective time no earlier than five minutes later.
- `withdrawal_pending` is non-purchasable and is excluded immediately from active multi-offer aggregation. Ordinary offer and stock mutations fail closed while the request is pending.
- Request creation uses bounded idempotency and optimistic concurrency. A matching committed retry resolves from durable request identity before active Business/seller and current offer-version validation.
- Pending and completed retries return the recorded offer status/version receipt rather than mutable live offer state. They remain truthful after later Business, seller, catalog, or offer changes.
- Replay does not lock the request row before the offer; the due processor owns request-to-offer lock ordering. This removes replay-versus-processor lock inversion while retaining deterministic idempotency serialization.
- The due processor selects a bounded deterministic batch with `FOR UPDATE SKIP LOCKED`, validates server time, locks request then offer and custody, and tolerates duplicate workers without duplicate returns.
- Any positive canonical Store-listing reservation defers the entire request and records a bounded retry time. No reserved unit is returned.
- Eligible completion returns `full` remaining quantity or `min(requested reduction, remaining owned quantity)` through one canonical Inventory transfer from the offer account into Business Finished Goods.
- Average cost, cost currency, public Business/offer/request provenance, append-only transaction evidence, and the retained `business_inventory` projection converge in the same transaction. Currency drift between canonical Finished Goods and the Business is rejected before mutation.
- Full withdrawal completes paused. Reduction resumes the recorded draft/active/paused state only when catalog and stock eligibility still permit it; otherwise it finishes paused.
- Withdrawal does not debit or credit cash, create revenue, recognize COGS, charge tax, or deliver buyer Inventory. Those remain Phase 10 authority.
- The Store withdrawal typed contract was split into a bounded public contract and private parsing primitives so Repository Quality remains within the existing oversized-source ratchet.

### Exact-head verification on `bf17e2493654620229d1acdeaae0fbaba21caf63`

- **Business Store Withdrawal Safety V2 — PASS** (`32729827704`): Phase 9A structural/type contracts, server-time boundary, replay, reservation, cost/projection, rollback, bounded-batch, duplicate-worker and two-game simulations; deterministic architecture inventory; retained Store/Inventory/Business runtime; all Backend/Edge TypeScript; standalone Player Terminal; Chromium.
- **Business Store Listing Inventory V2 — PASS** (`32729827682`): retained Phase 8A custody, stock placement, canonical/retained projection convergence, Store/Inventory/Business runtime, Player Terminal, and Chromium.
- **Business Store Seller Offers V2 — PASS** (`32729827726`): retained Phase 7A seller-offer aggregation, Business Banking, Store/Inventory/Business contracts, Player Terminal, and Chromium.
- **Database Replay — PASS** (`32729827754`): complete replay from zero twice plus rebuilt-database lint.
- **Backend Typecheck — PASS** (`32729827707`): backend typecheck and backend smoke.
- **Business Timed Manufacturing V2 — PASS** (`32729827688`): retained equipment, workforce-production/payroll, material/labor/equipment reservation, manufacturing start/completion/recovery, all Backend/Edge TypeScript, Player Business surface, and local Edge boot/preflight.
- **Business Workforce Payroll V2 — PASS** (`32729827714`).
- **Business Economy V2 — PASS** (`32729827695`).
- **Repository Quality — PASS** (`32729827698`): repository audit, deterministic architecture ratchet, credential/package/signature checks, and backend dependency audit.
- **Supply Chain Security — PASS** (`32729827697`).
- **Runtime Interaction Wiring — PASS** (`32729827753`).
- **Admin API Check — PASS** (`32729827814`).
- **Required Game Market Timezone — PASS** (`32729827687`).
- **Exchange Calendar Runtime — PASS** (`32729827743`).

### Phase 9A exit result

- Immediate withdrawal-pending non-purchasability and aggregation exclusion: **met**.
- Server-derived five-minute minimum and immutable request timing: **met**.
- Full/reduction request identity, idempotency, optimistic versioning, and one-pending-request invariant: **met**.
- Reservation-safe bounded due processing and duplicate-worker exact-once behavior: **met**.
- Exact remaining-unsold Store Listing-to-Finished Goods transfer: **met**.
- Average cost, currency, canonical transaction provenance, and retained stockroom convergence: **met**.
- Authoritative pending/completion replay after later lifecycle changes: **met**.
- Offer/request lock-order hardening and future offer-first purchase boundary: **met**.
- Deterministic time, concurrency, rollback, catalog-resume, bounded-batch, and two-game tests: **met**.
- Database, backend, all Edge, retained Banking/Store/Inventory/workforce/equipment/manufacturing, repository, security, Player, and Chromium gates: **met**.
- Temporary machinery zero net, PR draft/unmerged, no deployment/live mutation: **met**.

### Decisions and unresolved boundaries

- A positive listing reservation is the only Phase 9A unresolved accepted-purchase signal. Any positive amount blocks the entire withdrawal rather than returning only the unreserved portion.
- The purchase path must lock the seller offer first, before listing Inventory and money. A purchase that obtains the offer lock first may reserve/settle; a withdrawal that obtains it first changes the offer to `withdrawal_pending` and prevents a new purchase.
- Phase 9A deliberately does not create buyer quotes, debit Player Checking, credit Business cash, transfer Inventory to the buyer, recognize revenue/COGS, or migrate Player Store reads and UI.
- The retained Store purchase compatibility channel remains active for seeded Store stock only until Phase 10 can bind displayed seller offer, quote, payment, seller credit, and transferred Inventory to one immutable receipt.
- Automatic consumer/NPC sales convergence, Player Business workspace controls, equity/IPO, merge, staging, and production remain unauthorized.

### Next authorized step

**Phase 10 checkpoint 10A — atomic Store purchase settlement is OPEN.** Create a stacked draft branch/PR from the clean Phase 9A durable handoff. Reuse canonical Player Checking, first-class Business cash, Store seller-offer identity/version, offer-scoped Store-listing Inventory, buyer Inventory, Store pricing/quote evidence, Business activity evidence, and the canonical Inventory poster. Plan a bounded first checkpoint before coding. It must define one immutable public purchase receipt and one offer-first lock order, prove purchase-first and withdrawal-first races, and keep buyer debit, seller credit, Inventory transfer, revenue/COGS evidence, and idempotency within one transaction. Do not include Player Store read/UI cutover, automatic sales convergence, equity/IPO, merge, staging, production deployment, secrets, or live database mutation unless separately authorized.


---

## 2026-08-25 — Phase 10A.1 COMPLETE: Store settlement authority foundation

### Certified source and repository state

- **Exact certified implementation and verification source:** `1abc8b878df5b08716107adb467bd013e85b6df4`.
- Feature branch: `feat/business-store-purchase-settlement-v2`.
- Stacked draft PR: #665, based on `feat/business-store-withdrawal-safety-v2` / PR #664.
- Certified Phase 9A implementation source: `bf17e2493654620229d1acdeaae0fbaba21caf63`.
- PR #665 remained open, draft, mergeable, unmerged, and undeployed at certification.
- Integration PR #648 remained open, draft, mergeable, and unmerged.
- The exact implementation delta contains the permanent Phase 10A.1 workflow, authority audit, scope, typed contracts, structural verification, and deterministic lock/replay/rollback/two-game simulations. No temporary writer/controller workflow remains after this certification commit.
- No migration, runtime persistence, API route, Player control, deployment, secret mutation, or live database mutation occurred.

### What is now authoritative

- A future Business seller-offer purchase is defined as one indivisible economic transaction binding one exact offer, quote, Buyer Checking debit, Business cash credit, Store Listing-to-Buyer Inventory transfer, revenue/COGS result, offer-version transition, and immutable public receipt.
- Browser input expresses only offer/quote/quantity/version/idempotency intent. Game, Buyer, seller, Business, custody, money, and Inventory scope are trusted server authority.
- The public receipt identity is `spr_[0-9a-f]{32}`; internal ledger and table UUIDs remain private.
- All economic row locking begins with the seller offer. Buyer money or Inventory may never be locked before the offer.
- Purchase-first may complete atomically and advance the offer once; withdrawal-first changes the offer to `withdrawal_pending` and forces purchase rejection before any economic mutation.
- Matching replay returns immutable recorded receipt evidence. Conflicting idempotency reuse fails closed. Any posting failure rolls the full conceptual transaction back.
- The retained seeded Store purchase channel remains unchanged and is not silently repurposed for Business seller offers.

### Exact-head verification on `1abc8b878df5b08716107adb467bd013e85b6df4`

- **Business Store Purchase Settlement Foundation V2 — PASS** (`32753253910`): Phase 10A.1 structural/type/race/replay/conflict/rollback/two-game contracts; Database Replay twice and lint; retained Store/Inventory/Business Economy/Banking/workforce/payroll/equipment/manufacturing; all Backend/Edge TypeScript; Player Edge bundleability; Admin API; required game timezone; exchange calendar; Player Terminal; Chromium.
- **Business Store Withdrawal Safety V2 — PASS** (`32753253771`).
- **Repository Quality — PASS** (`32753253904`).
- **Supply Chain Security — PASS** (`32753253694`).

### Phase 10A.1 exit result

- Immutable public receipt and trusted command boundary: **met**.
- Fixed seller-offer-first economic lock order: **met**.
- Purchase-first and withdrawal-first ordering model: **met**.
- Replay, conflicting reuse, rollback, and two-game deterministic coverage: **met**.
- Complete retained exact-head matrix: **met**.
- Temporary machinery zero net; PR draft/unmerged; no deployment/live mutation: **met**.
- Runtime quote, settlement, money movement, Inventory movement, revenue/COGS posting, and Player cutover: **not implemented and not claimed**.

### Decisions and unresolved boundaries

- Checkpoint 10A.2 must introduce a durable offer-aware quote rather than widening the retained seeded compatibility quote.
- The quote must bind exact offer/version/seller/Business/custody/item/quantity/price/currency/expiry and immutable request hash.
- Checkpoint 10A.3 remains the first authority allowed to debit Buyer Checking, credit Business cash, transfer Inventory, or recognize seller revenue/COGS.
- Player Store read/UI cutover, automatic consumer sales, equity/IPO, merge, staging, and production remain unauthorized.

### Next authorized step

**Phase 10 checkpoint 10A.2 — immutable offer-aware quote authority is OPEN.** Add only the durable quote schema, service-only quote command/repository, exact replay and conflict behavior, expiry/version/custody validation, typed public contract, deterministic tests, and exact-head certification. Do not add Buyer debit, seller credit, Inventory transfer, revenue/COGS, Player route/UI, automatic sales, equity/IPO, merge, deployment, secrets, or live database mutation.

---

## 2026-08-25 — Phase 10A.2 COMPLETE: immutable Business seller-offer quote authority

### Certified source and repository state

- **Exact certified implementation and verification source:** `ad57d5b9307178229a6b47b3206d258f1bd9b70d`.
- Feature branch: `feat/business-store-offer-aware-quote-v2`.
- Stacked draft PR: #666, based on the clean certified Phase 10A.1 handoff `34776a124e6595b67ffb7e52357fd5a1d9194435` / PR #665.
- PR #666 remained open, draft, mergeable, unmerged, and undeployed at certification.
- Integration PR #648 remained open, draft, and unmerged.
- No merge, staging deployment, production deployment, secret mutation, or live database mutation was performed.
- The later documentation-only certification commit does not replace `ad57d5b9307178229a6b47b3206d258f1bd9b70d` as the exact tested implementation source.

### What is now authoritative

- `public.store_offer_purchase_quotes` is a separate Store-owned quote authority for Business seller offers; the retained seeded Store quote table retains its historical compatibility meaning.
- One immutable public `quote_...` record binds trusted game and Buyer scope to one exact active Business offer/version, Business, seller party, Store item, canonical item, offer-scoped listing account, quantity, availability snapshot, unit/total price, currency, pricing version, creation time, expiry, and request hash.
- Quote creation accepts only trusted game/Buyer scope plus offer key, quantity, expected version, and idempotency key. Business, seller, catalog, item, custody, country, currency, pricing, and expiry values remain server derived.
- Quotes are non-reserving. Phase 10A.3 must re-lock and revalidate the offer/version and exact canonical availability before any economic mutation.
- The first Business-offer purchase path is same-currency only with `exchangeRate = 1`; cross-currency settlement remains closed until a named FX-clearing authority and two-sided immutable evidence exist.
- Durable Buyer-scoped replay resolves before mutable state validation; exact retries converge to one quote, conflicting key reuse fails closed, and replay cannot extend, reprice, reserve, or reactivate a quote.
- Seller-offer-first locking makes quote-first snapshot the pre-mutation version while withdrawal-first changes the offer to `withdrawal_pending` and causes the later quote to reject.
- Service-role-only persistence, forced RLS, immutable identity/lifecycle guards, public-key-only contracts, and two-game isolation remain enforced.

### Exact-head verification on `ad57d5b9307178229a6b47b3206d258f1bd9b70d`

- **Business Store Offer-Aware Quotes V2 — PASS** (`32790518745`).
- `contract-and-quality` — **PASS**: Phase 10A.2 contracts/types/simulations, retained 10A.1/9A/8A/7A authority, migration validation, deterministic architecture inventory, Repository Quality, and Supply Chain Security.
- `retained-runtime` — **PASS**: Business formation/economy/domain/stockroom/procurement/Banking, workforce/payroll, equipment, timed manufacturing, Store/Inventory lifecycle, all Backend/Edge TypeScript, and Player Edge entrypoints.
- `database-replay` — **PASS**: complete replay from zero twice plus rebuilt-database lint.
- `player-and-browser` — **PASS**: standalone Player Terminal verification, adapter/capability/runtime integration, and Chromium.

### Phase 10A.2 exit result

- Immutable quote identity and exact offer/version/seller/custody scope: **met**.
- Trusted Buyer/game scope and server-derived economic identity: **met**.
- Same-currency deterministic pricing and exact two-minute expiry: **met**.
- Non-reserving canonical availability snapshot: **met**.
- Replay, idempotency conflict, concurrency, quote/withdrawal ordering, expiry, reserved-stock, sold-out, self-purchase, cross-currency, and two-game guards: **met**.
- Complete database, backend/all Edge, retained Business/Banking/Store/Inventory/workforce/equipment/manufacturing, repository, security, Player, and Chromium matrix: **met**.
- No economic settlement, Player cutover, deployment, or live mutation: **met**.

### Decisions and unresolved boundaries

- A quote is price evidence, not an Inventory reservation. Settlement must revalidate current offer status/version and exact unreserved listing quantity.
- Cross-currency Business Store settlement remains unsupported by design.
- The retained seeded quote/purchase authority remains unchanged until an explicit later cutover.
- Buyer Checking debit, Business cash credit, Store Listing-to-Buyer transfer, revenue/COGS, receipt completion, Player routes/UI, automatic demand convergence, equity/IPO, merge, staging, and production remain unauthorized.
- Temporary Phase 10A.2 finalizer workflows have zero net presence in the final branch tree.

### Next authorized step

**Phase 10A.3 — atomic economic settlement is OPEN.** Create a separate stacked draft branch/PR from the clean Phase 10A.2 handoff. Implement one service-owned transaction with the fixed offer-first lock order: replay resolution, quote and offer revalidation, listing holding, Buyer Checking, Business cash, Buyer Inventory, canonical ledger/Inventory posting, immutable `spr_...` receipt completion, quote consumption, and offer-version advancement. Prove paid-without-item, item-without-payment, one-sided money movement, settlement-without-receipt, purchase/withdrawal inversion, conflicting replay, rollback, and cross-game mutation are impossible. Do not include authenticated Player route/UI cutover, automatic sales convergence, equity/IPO, merge, deployment, secrets, or live database mutation.

---

## 2026-08-25 — Phase 10A.3 verified starting state

- Fetched `origin/main` at `dcb68958102f4ecbf07fe9e52d6eede4d5e692ff` before implementation.
- PR #667 is open, draft, unmerged, mergeable, and based on the exact certified Phase 10A.2 handoff `38d040748a62c5aa21a7111eeab80cd7e74b9263`.
- PR #667 head is `2a163a0d036973fa1b3f5b237a516fb10b2add4c`; its net parent-relative diff is exactly this checkpoint's scope document.
- The temporary Phase 10A.3 source-snapshot workflow has zero net presence.
- PRs #665, #666, and integration PR #648 are open, draft, unmerged, and undeployed. The Business V2 stack #654–#667 remains open and unmerged.
- No repository evidence identifies a Business V2 staging or production release from the certified or stacked sources. No deployment, secret mutation, or live database mutation is authorized for this checkpoint.
- Controlling roadmap item: `BUSINESS-V2-10A3`. The authorized later sequence is `BUSINESS-V2-10A4`, Phase 11, Phase 12, Phase 13, and Phase 14A–14D, each through a separately bounded stacked checkpoint.
- Implementation continues on the existing owner branch `feat/business-store-atomic-settlement-v2`; no replacement branch was created.

---

## 2026-08-25 — Phase 10A.3 IMPLEMENTATION IN PROGRESS: atomic Business seller-offer settlement

### Current repository and evidence boundary

- Existing owner branch: `feat/business-store-atomic-settlement-v2`.
- Existing stacked draft PR: #667 over the clean certified Phase 10A.2 handoff `38d040748a62c5aa21a7111eeab80cd7e74b9263` / PR #666.
- PR #667 and integration PR #648 remain draft, open, unmerged, and undeployed. This entry does not mark Phase 10A.3 `VERIFIED_COMPLETE` or certified.
- **Exact implementation SHA:** `PENDING — current evidence is from the local implementation worktree, not one immutable committed source`.
- **Exact-head workflow run and jobs:** `PENDING — no Phase 10A.3 CI run is claimed`.
- **Clean handoff SHA:** `PENDING — requires green exact-head evidence and zero temporary machinery`.

### Forward database authority implemented locally

- `20260825110000_business_store_offer_purchase_receipt_v2.sql` adds immutable completed `public.store_offer_purchase_receipts`, same-game composite evidence foreign keys, exact public snapshots, Buyer-scoped idempotency, one receipt per quote, insert-evidence validation, update/delete immutability, forced RLS, and explicit least-privilege ACLs.
- `20260825110010_business_store_offer_purchase_receipt_result_v2.sql` adds private public-key-only projection helper `economy_private.read_store_offer_purchase_receipt_result_v2(uuid, boolean)`.
- `20260825110020_business_store_offer_atomic_settlement_v2.sql` adds service-owned `public.settle_business_store_offer_v2(uuid, uuid, text, text, integer, bigint, text)` with replay-before-current-state interpretation and fixed offer-first economic locking.
- `20260825110030_business_store_offer_settlement_assertions_v2.sql` asserts the receipt schema, keys, RLS, ACLs, triggers, helper isolation, RPC privilege, and required settlement-authority tokens fail closed.
- Private `economy_private.validate_store_offer_purchase_receipt_v2()` verifies the inserted receipt references the exact committed Buyer debit, Business credit, and canonical Inventory transaction. Private `economy_private.guard_store_offer_purchase_receipt_v2()` rejects receipt updates and deletions.

### Store application and permanent verification surface

- `backend/src/domains/store/contracts/storeOfferSettlementContracts.ts` owns bounded command/result parsing and public-key-only receipt invariants.
- `backend/src/domains/store/infrastructure/supabaseStoreOfferSettlementRepository.ts` projects trusted server game/Buyer scope into the settlement RPC.
- `backend/src/domains/store/application/settleBusinessStoreOffer.ts` exposes the Store application service and maps fail-closed repository outcomes.
- `backend/src/domains/store/index.ts` exports only the new Store application, contract, and repository surfaces.
- Permanent present scripts: `scripts/business-phase10-atomic-settlement-contract.mjs`, `scripts/business-phase10-atomic-settlement-types.mjs`, and `scripts/business-phase10-atomic-settlement-simulation.mjs`.
- Permanent exact-head workflow present: `.github/workflows/business-store-atomic-settlement-v2.yml`.
- Permanent real-database support and harnesses now exist at `scripts/business-phase10-atomic-settlement-database-support.mjs`, `scripts/business-phase10-atomic-settlement-database.mjs`, and `scripts/business-phase10-atomic-settlement-concurrency.mjs`. Workflow presence and local passes are not exact-head completion evidence.

### Authority, precision, and atomicity decisions

- Buyer Checking, Business cash, ledger debit/credit, and gross revenue must be exact two-decimal totals. A total with excess monetary precision or outside the canonical ledger range rejects before mutation.
- Canonical Inventory average unit cost remains exact to four decimal places. Receipt COGS is `sourceUnitCost * quantity` at four-decimal precision, and gross margin is `grossRevenue - COGS` at four decimals. No silent cost-basis rounding is allowed.
- `public.store_offer_purchase_receipts` has enabled and forced RLS. `anon` and `authenticated` have no table or settlement-RPC privilege. `service_role` may select immutable receipts and execute `public.settle_business_store_offer_v2(...)`, but cannot directly insert, update, delete, truncate, reference, trigger, or maintain the receipt table and cannot directly execute private result/trigger helpers.
- The security-definer settlement function owns the validated receipt insert. The completed receipt's same-game ledger and Inventory evidence is checked before insert and is immutable afterward.
- One transaction binds exact quote/offer/version validation, Store-listing holding, Buyer Checking, Business cash, Buyer Inventory, debit/credit, canonical Inventory posting, Business activity, receipt completion, quote consumption, and offer version advancement. Matching replay returns the immutable receipt before current mutable state is reinterpreted; conflicting reuse fails closed.

### Current local evidence — not exact-head certification

- Complete disposable PostgreSQL 17.6 reset from zero: **PASS twice**.
- Static migration validator: **PASS 356/356**.
- Rebuilt-database lint: **executed; no new Phase 10A.3 finding**, with inherited baseline findings retained rather than suppressed.
- Independent real-database quote/settlement/replay probe: **PASS**. Exact state vector was Buyer Checking `100 -> 85`, Business cash `20 -> 35`, Store listing `10 -> 8`, Buyer Inventory `0 -> 2`, one receipt, two ledger entries, two ledger lines, one `PURCHASED` Inventory event, one Business activity, quote version 2 used, offer version `2 -> 3`, and matching completion timestamp. Fixture execution was wrapped in an outer transaction and rollback left zero durable fixture rows.
- Permanent serial PostgreSQL harness: **PASS locally**. It atomically seeds a localhost-only disposable two-game fixture; compares complete rows across Store, legacy Store, money, Inventory, Business, identity, receipt, withdrawal, and idempotency tables; proves the expanded malformed/wrong-scope/lifecycle/custody/currency/funds/stock/precision failure matrix; proves the retained seeded purchase and economic replay state; validates exact two-line cost/provenance evidence; rejects receipt update/delete; proves receipt-first replay/conflict; and proves rollback after all seven internal posting stages.
- Permanent concurrency PostgreSQL harness after an independent full rebuild: **PASS locally**. Held psql transactions and `pg_stat_activity` prove actual lock waits for matching idempotency, same-offer no-oversell, Buyer Checking, listing holding, Business cash overflow, purchase-first/withdrawal-first ordering, and concurrent two-game isolation. The workflow performs the same full rebuild between serial and concurrency suites rather than bypassing immutable receipt protection for cleanup.
- Phase 10A.3 structural, typed, and deterministic simulation checks: **PASS locally**.
- Retained Phase 7A, 8A, 9A, 10A.1, and 10A.2 checks: **PASS locally** after correcting a stale temporal fixture without weakening the authority contract.
- Backend `typecheck:all`: **PASS**. Store tests: **14/14 PASS**. Inventory tests: **50/50 PASS**.
- Retained Business economy, workforce, payroll, equipment, and manufacturing scripts plus migration, diff, YAML, interaction, and security checks: **PASS locally**.
- Deterministic architecture inventory regenerated to **1,083 source files and 38 Store files**.

### Unresolved completion work and exclusions

- Commit one immutable implementation source, run the permanent exact-head workflow and all required retained jobs—including the now-green local serial and concurrency harnesses—against that exact SHA, resolve any real failure without weakening boundaries, then record the clean handoff SHA.
- No authenticated Player Store route/UI or browser cutover is present. No automatic consumer/NPC demand convergence, equity/IPO, Marketplace/Contracts integration, merge, deployment, secret mutation, or live database mutation is present or authorized. The two resets and probes used only a disposable local database.

### Next exact roadmap item

Phase 10A.3 remains active until its exact implementation SHA, exact-head workflow jobs, and clean handoff are durably recorded. Its permanent serial and concurrency harnesses now exist and pass locally. After that separately evidenced boundary, **Phase 10A.4 — authenticated Player Store route/UI cutover and connected browser acceptance** is next. Phase 11 automatic-sales convergence, Phase 12 workspace UX, Phase 13 Admin supervision, and Phase 14A–14D remain closed until their own dependency-ordered checkpoints.

---

## 2026-08-25 — Phase 10A.3 EXACT-HEAD VERIFIED: atomic Business seller-offer settlement

This entry supersedes the `PENDING` evidence fields in the preceding implementation-in-progress snapshot. The checkpoint status is `IMPLEMENTED_NOT_MERGED`, not `VERIFIED_COMPLETE`.

### Exact source and workflow evidence

- **Exact implementation and verification source:** `5a8ffeb59c857b99f5fbd88726cc9b985f7682a2`.
- **Business Store Atomic Settlement V2 — PASS** (`32817713404`):
  - `Replay complete database twice and lint` — `97709253285`, **success**;
  - `Verify retained Player Terminal and Chromium` — `97709253398`, **success**;
  - `Verify atomic settlement authority and retained Store phases` — `97709253437`, **success**;
  - `Verify database settlement, rollback, races, and isolation` — `97709253468`, **success**;
  - `Verify retained Business, Store, Inventory, Backend, and Edge runtime` — `97709253519`, **success**.
- Every required job was terminal `success`. Conditional failure-diagnostic steps did not run because their jobs succeeded; no required job was queued, skipped, cancelled, neutral, timed out, or in progress at certification.
- **Clean durable handoff:** this later documentation-only certification commit. Its immutable SHA is recorded in draft PR #667 and the Phase 10A.4 parent record; it does not replace `5a8ffeb59c857b99f5fbd88726cc9b985f7682a2` as the tested implementation identity.
- PR #667 remained draft, open, mergeable, unmerged, and without a Business Backend, Edge, or database staging/production release at certification. Integration PR #648 remained draft and unmerged.
- Temporary repair, writer, controller, certifier, finalizer, and source-snapshot machinery has zero net presence in the parent-relative diff.
- The global beta completion ledger was not edited in this tranche because active ARCH-100F PR #668 owns the same roadmap file. This checkpoint remains `IMPLEMENTED_NOT_MERGED`; Phase 10A.4 must re-audit that owner and reconcile Scope Intake without overwriting its work.

### Exit result

- Atomic Buyer debit, Business credit, canonical Inventory delivery, revenue/COGS/margin evidence, immutable receipt, quote consumption, and offer advancement: **met**.
- Exact replay/conflict, seven-stage rollback, money/cost precision, receipt immutability, observed-lock races, no oversell, purchase/withdrawal ordering, retained seeded purchase/replay, and two-game isolation: **met**.
- Exact-head retained Backend/Edge/Business/Store/Inventory/Player/Chromium matrix: **met**.
- Browser roles remain unable to access receipt persistence or settlement RPC authority; internal UUIDs remain outside the public result contract: **met**.
- Status: `IMPLEMENTED_NOT_MERGED`; not `VERIFIED_COMPLETE` because PR #667 is not merged into `main`.
- No authenticated Player Store cutover, automatic consumer/NPC sales convergence, equity/IPO, merge, Business staging/production deployment, secret mutation, or live database mutation was included.

### Next exact roadmap item

**Phase 10A.4 — authenticated Player Store route/UI cutover and connected browser acceptance is OPEN.** It must begin from this clean documentation-only handoff on a separate stacked branch and draft PR. Phase 11 and later phases remain closed until 10A.4 is separately certified.

---

## 2026-08-25 — Phase 10A.4 verified starting state and bounded scope

### Repository and owner audit

- Fetched `origin/main` at `80f5eb8e24a364bc878de11acfdf196add878f10`; the Business stack merge base remains `dcb68958102f4ecbf07fe9e52d6eede4d5e692ff`, and the clean Phase 10A.3 handoff is 18 current-main commits behind.
- Phase 10A.3 clean parent handoff: `6f9231b0030a7851bba5abe8519afa790071c32c`, pushed to `feat/business-store-atomic-settlement-v2` / draft PR #667.
- PR #667 is open, draft, mergeable, unmerged, and clean at that exact handoff. No Business Backend, Edge, or database staging/production release is identified.
- No existing branch or open PR owned `BUSINESS-V2-10A4`; the dedicated child branch `feat/business-player-store-cutover-v2` was created from the exact handoff without rebasing or replacing its parents.
- Open PR #624 owns overlapping Player Terminal CSS/realtime/browser surfaces and is currently conflicting with `main`; exact-path edits must preserve that owner.
- PR #626 closed without merge at `474370b4e96670c4a3e394ac41779ed87ce26d15`; its Business acceptance/capability changes are donor evidence only, not an active owner.
- Open draft PR #668 owns ARCH-100F and the global beta roadmap file. This checkpoint must preserve that roadmap owner and cannot claim `VERIFIED_COMPLETE` while unmerged.
- Future `ARCH-100I` owns Store context propagation. Phase 10A.4 consumes current authenticated scope derivation and does not absorb that refactor.

### Bounded checkpoint

- Controlling item: `BUSINESS-V2-10A4`.
- Controlling scope: `docs/roadmaps/business-phase10-player-store-cutover-scope-v1.md`.
- Parent implementation identity: `5a8ffeb59c857b99f5fbd88726cc9b985f7682a2`; parent clean handoff: `6f9231b0030a7851bba5abe8519afa790071c32c`.
- Retained seeded routes remain separate. The default Business-offer route design adds explicit offer quote/purchase and Buyer-authorized receipt paths behind the same-origin Player BFF.
- Player Store reads must aggregate multiple seeded/Business offers under one canonical product card while exposing only bounded public offer/seller/Business identity.
- Browser intent is limited to public offer/quote, quantity, expected version, and idempotency intent. Every trusted economic and ownership value remains server derived.
- Required evidence includes stable errors, rate limits/capabilities, committed Buyer and seller convergence, seeded compatibility, real database vectors, both withdrawal orderings, two authenticated browser contexts, two games, accessibility/responsive behavior, and the full retained exact-head matrix.

### Scope-only boundary

- No Phase 10A.4 runtime source, migration, implementation SHA, exact-head workflow result, merge, Business staging/production deployment, secret mutation, or live database mutation is claimed.
- The scope-only branch must be pushed and opened as a separate draft PR over `feat/business-store-atomic-settlement-v2` before runtime implementation begins.
- Phase 11 and later phases remain closed until Phase 10A.4 obtains its own exact-head certification and clean handoff.

### Durable scope handoff

- Exact scope commit: `75d2a3c0b594017bc38f78e2618926f78ca2754e`.
- Stacked draft PR: #670, base `feat/business-store-atomic-settlement-v2`, head `feat/business-player-store-cutover-v2`.
- The branch and draft PR were pushed/opened before runtime implementation. They remain open, draft, unmerged, and without a Business staging/production release.

---

## 2026-08-26 — Phase 10A.4A implementation freeze and canonical FX dependency insertion

This entry supersedes only the stale scope-only state recorded above. It does not alter any certified Phase 10A.1–10A.3 source, workflow, or handoff identity.

### Exact implementation candidate and status

- Roadmap item: `BUSINESS-V2-10A4A`, under parent `BUSINESS-V2-10A4`.
- Frozen implementation candidate: `88944e18520913ca9779c2706bd005f644c60050` on `feat/business-player-store-cutover-v2` / draft PR #670.
- Parent Phase 10A.3 implementation remains `5a8ffeb59c857b99f5fbd88726cc9b985f7682a2`; its clean handoff remains `6f9231b0030a7851bba5abe8519afa790071c32c`. Neither identity is rewritten by this record.
- The candidate adds authenticated Player Store catalog/offer/quote/purchase/receipt wiring, explicit seeded-versus-Business route separation, committed Buyer/seller projections, Player Terminal offer purchase flow, and permanent structural/connected acceptance machinery. It adds no new database migration.
- Canonical status: `IMPLEMENTED_NOT_MERGED`. The candidate is not exact-head certified and is not `VERIFIED_COMPLETE`; final certification is blocked by the missing canonical FX and shared multi-currency funding authority.
- Draft PR #670 remains open, draft, unmerged, undeployed, and without any secret or staging/production database mutation. This record freezes its runtime candidate; subsequent dependency work belongs on new bounded branches.

### Current certification failures

1. The connected readiness helper sends `Origin: http://127.0.0.1:...` while probing proxied `bootstrap-api`. That service intentionally accepts only configured HTTPS browser origins, so it returns `403` and the helper expects success. This is a probe-contract defect, not evidence that the Edge runtime failed to start. Final repair must send no browser `Origin` for the health probe and must not weaken production CORS.
2. `player-terminal/tests/store-local-currency.mjs` still requires copy claiming an authoritative quote converts the final amount into a THD local wallet. The frozen candidate implements same-currency Store settlement only. The stale assertion must be replaced after canonical retail FX/funding semantics exist, not edited to bless an interim assumption.
3. `docs/operations/contracts/player-cross-cutting-verification-authority-v1.json` is a mutable singleton still bound to PR #661. The current verifier therefore cannot provide immutable PR #670 authority evidence. Final convergence must use PR-bound authority files selected from trusted PR context and must fail closed locally without an explicit PR number.

### Root-cause decision

- The Store candidate cannot become the permanent checkout authority while exchange rates remain independently written pair rows, ECO is absent from the canonical registry, Banking cannot assign canonical accounts to a clearing party or reserve delayed funds, and Store/Marketplace/Stocks/Business apply incompatible currency assumptions.
- Do not repair these root gaps inside PR #670. Preserve that branch as the Phase 10A.4A implementation freeze and insert the dependency stack before final certification.
- The global beta completion roadmap remains untouched here because draft PR #668 owns that exact file. Its owner must reconcile Scope Intake independently without overwriting this Business-stack record.

### Dependency-ordered owner stack

| Item | Branch | Outcome before the next checkpoint |
| --- | --- | --- |
| `BUSINESS-V2-10A4B1` / `BETA-FX-V1-001` | `feat/canonical-fx-authority-v1` | ECO registry/numeraire, deterministic game-local 08:00 fixing, immutable current/history evidence, Story-shock convergence, and guarded legacy-rate cutover. |
| `BUSINESS-V2-10A4B2` | `feat/banking-fx-clearing-v1` | Canonical account identities, balanced posting groups, holds, named clearing/reserve parties, capped liquidity, and standard/instant FX. |
| `BUSINESS-V2-10A4C0` | `feat/multicurrency-funding-core-v1` | Immutable maximum-three-Checking-account funding quote and private atomic funding composer. |
| `BUSINESS-V2-10A4C1` | `feat/multicurrency-store-funding-v1` | Seeded/NPC and Business Store settlement consume the shared funding authority. |
| `BUSINESS-V2-10A4C2` | `feat/multicurrency-marketplace-funding-v1` | Marketplace preserves listing currency and stops competing treasury balance writes. |
| `BUSINESS-V2-10A4C3` | `feat/multicurrency-stock-funding-v1` | Existing securities receive ECO listing currency without rewriting historical trades; new buys/sales settle in listing currency. |
| `BUSINESS-V2-10A4C4` | `feat/business-multicurrency-treasury-v1` | Business-owned foreign Checking accounts, bounded treasury FX, and procurement funding. |
| `BUSINESS-V2-10A4D` | `feat/business-player-store-fx-final-v2` | Converge the frozen candidate, repair the three secondary failures, and run final Store/FX/two-browser/two-game certification. |

Each branch is a bounded draft PR against its immediate predecessor and must identify one exact implementation SHA before advancing. No merge, deployment, secret mutation, or staging/production database mutation is authorized.

### Next exact roadmap item

Begin `BUSINESS-V2-10A4B1` / `BETA-FX-V1-001` from the frozen 10A.4A documentation handoff on `feat/canonical-fx-authority-v1`. Phase 11 remains closed until 10A.4D is exactly certified and handed off; Phases 12, 13, and 14A–14D remain dependency ordered after Phase 11.

---

## 2026-08-26 — Canonical FX authority scope established

- Roadmap items: `BUSINESS-V2-10A4B1` / `BETA-FX-V1-001`.
- Owner branch: `feat/canonical-fx-authority-v1`, created from exact Phase 10A.4A documentation handoff `cb4041b68ecd322c87d2fb6bb08000da28807af3` without rebasing or changing the frozen candidate.
- Controlling scope: `docs/roadmaps/canonical-fx-authority-scope-v1.md`.
- Scope commit: `f499e828d57a6a146f528d89e714502807ab36b1`.
- Status: `IN_PROGRESS` — scope authority only; no B1 migration, runtime source, implementation SHA, workflow result, merge, deployment, secret mutation, or staging/production database mutation is claimed by this record.
- Exact boundary: ECO registry/numeraire, deterministic game-local 08:00 fixing, immutable current/history evidence, queue-only Story shocks, provisioning/bootstrap, and guarded legacy cutover. Banking accounts/holds/clearing/settlement and purchase funding remain closed for B2 and C0–C4.
- Next exact action: create the immutable scope handoff, publish a bounded draft PR against `feat/business-player-store-cutover-v2`, then implement only B1 and certify one exact head before opening B2.

---

## 2026-08-26 — Canonical FX authority exact-head implementation handoff

### Identity and status

- Roadmap items: `BUSINESS-V2-10A4B1` / `BETA-FX-V1-001`.
- Owner: `feat/canonical-fx-authority-v1` / stacked draft PR #671, based on exact Phase 10A.4A documentation handoff `cb4041b68ecd322c87d2fb6bb08000da28807af3`.
- Controlling scope commit: `f499e828d57a6a146f528d89e714502807ab36b1`; immutable scope handoff: `23da0aa419438d2f9bc996df7f4f08c86959fd23`.
- Exact implementation and verification source: `41bc2d978fe67cd06a8f2133f7310075492ecd99`.
- Canonical status: `IMPLEMENTED_NOT_MERGED`, not `VERIFIED_COMPLETE`, because PR #671 remains draft, open, and unmerged and no production runtime evidence is claimed. This later documentation-only handoff does not replace the tested implementation identity.

### Implemented authority

- Forward migration `backend/supabase/migrations/20260825223806_canonical_fx_authority_v1.sql` extends the single registry with ECO, persists immutable policy/fixing/value/input/component/shock evidence, owns leased runtime state, queues Story shocks exactly once, freezes legacy pair writes after guarded cutover, and retains `convert_currency_amount` only as a deprecated compatibility reader.
- `backend/src/domains/fx/**` provides fixed-point deterministic policy calculation, contracts, repository, leased fixing runner, orchestration HTTP boundary, and focused tests. `backend/supabase/functions/fx-orchestrator/index.ts` exposes the trusted scheduled worker root.
- The RPC surface comprises generic and delegated Stock timezone reads; new-game/bootstrap initialization; due-game claim, input load, apply, and claim-failure paths; canonical rate/current/history/runtime reads; Story-shock authorization; an inert scheduler configurator; guarded legacy initialization; and compatibility conversion.
- Daily publication is one game-local 08:00 fixing including weekends. It uses the latest complete ten-country set effective by the boundary, records exact input identities/digest and actual calculation time, does not replay paused dates, and leaves the prior fixing active with overdue evidence when inputs are incomplete.
- Existing games cut over only from a complete pairwise-consistent legacy matrix. New games require ten macro snapshots, eleven currency values, a distinct bootstrap fixing, and valid runtime state before readiness. Prior rates and Story rows are not rewritten or reapplied.
- The existing `game_settings.stock_market_window.timezone` is the only timezone source. Once FX is bootstrapped, timezone mutation is rejected to preserve the uniqueness of a game/local-date fixing while unrelated stock-window edits remain permitted.
- `PUBLIC`, browser roles, and `service_role` were re-audited explicitly: immutable evidence is append-only, privileged mutation is service-only, reads are bounded, internal UUIDs are not exposed through browser contracts, and the service role does not retain direct evidence DML through inherited grants.

### Verification evidence

- Local deterministic FX suite: 39/39. Focused Story convergence: 16/16. Full Backend smoke suite: green.
- Adjacent suites: Player World 17/17, World runtime 11/11, Player Banking 6/6, ledger 3/3, Stock calendar 38/38, Player market assets 74/74, and Player Store 20/20.
- Backend typecheck and every one of 26 discovered Edge roots passed. Edge manifest/config/source parity passed 7/7. Exact workflow contract, authorization boundaries, migration audit, secret scan, architecture inventory/ratchets, high-priority route checks, asset and interaction checks, formatting, and `git diff --check` passed.
- Two final disposable PostgreSQL 17 resets replayed every forward migration from zero. Rollback-only canonical-FX database acceptance passed after each final reset. Rebuilt-schema lint exited successfully while reporting 61 pre-existing repository findings, including 19 errors, and zero B1/FX findings; the repository-wide debt remains explicit.
- Exact-head **Canonical FX Authority V1** run `32912008039` succeeded at `41bc2d978fe67cd06a8f2133f7310075492ecd99`: exact-head static authority job `98007902296`; FX and adjacent-domain compatibility job `98007902407`; disposable migration replay and lint job `98007902485`. The database job performed both zero-to-head replays, live acceptance, rebuilt-schema lint, and clean disposable-stack teardown.

### Safety, blockers, and next item

- The scheduler configurator was not invoked. No merge, deployment, scheduled job installation, credential/secret change, staging or production SQL, or live-environment mutation occurred.
- Intentionally unresolved and excluded from B1: Banking-owned account identities, balanced grouped posting, holds, clearing/reserve accounts, capped facility capacity, customer quotes/orders/settlement, Player Banking FX, and all shared purchase funding.
- Next exact item: create `feat/banking-fx-clearing-v1` from this documentation-only handoff, establish a controlling B2 scope record, and open its draft PR against `feat/canonical-fx-authority-v1` before runtime implementation.

---

## 2026-08-26 — Banking FX clearing scope established

- Roadmap item: `BUSINESS-V2-10A4B2`.
- Owner branch: `feat/banking-fx-clearing-v1`, created from exact B1 documentation handoff `5e427e8f5b39e5b77cac0c912873fe505493565d`; parent B1 implementation remains `41bc2d978fe67cd06a8f2133f7310075492ecd99` on draft PR #671.
- Controlling scope: `docs/roadmaps/banking-fx-clearing-scope-v1.md`.
- Scope commit: `ce50306400b3173a489e2413f0531cef58c863a6`.
- Status: `IN_PROGRESS` — scope authority only; no B2 migration, runtime source, implementation SHA, workflow result, merge, deployment, scheduler installation, secret mutation, or staging/production database mutation is claimed by this record.
- Transition decision: pre-B2 ledger economic identity and amounts remain immutable `legacy_v1` while deterministic account/transaction linkage metadata is backfilled; every post-cutover monetary write, including calls through legacy wrappers, must be account-linked, hold-aware, and balanced per currency as `balanced_v2`. A dedicated non-spendable compatibility contra preserves old domain behavior without consuming FX reserve authority or beginning C1-C4.
- Exact boundary: Banking account identity, balanced grouped posting, holds, clearing/reserve/fee capacity, capped facility evidence, standard/instant Player FX, authoritative Banking reads/routes/UI, readiness, and cross-domain hold enforcement. Multi-account retail funding and Store/Marketplace/Stocks/Business currency convergence remain closed for C0-C4.
- Key collision controls: an explicit superseding interface decision leaves `fxf_...` exclusively with B1 fixing keys and assigns B2 clearing evidence `fxc_...` or internal identity; #668 retains the global roadmap; PR #624 overlapping Player files are avoided until re-audited; broad `service_role` monetary DML is revoked explicitly rather than treated as safe through RLS alone.
- Next exact action: create the immutable scope handoff, publish a bounded draft PR against `feat/canonical-fx-authority-v1`, then implement only B2 and certify one exact head before opening C0.

---
## 2026-08-27 — Banking FX clearing EXACT-HEAD VERIFIED: B2 certification recovery complete

### Certified source and status

- Roadmap item: `BUSINESS-V2-10A4B2`.
- **Exact implementation and verification source:** `ce931f8320861117e64eba4403b84d6e7fe8da25`.
- Permanent B2 certification workflow: `banking-fx-clearing-v1`, run `33045836351`.
- Canonical checkpoint status: `IMPLEMENTED_NOT_MERGED`, not `VERIFIED_COMPLETE` because PR #672 remains draft, open, unmerged, and undeployed.
- Later documentation-only commits do not replace `ce931f8320861117e64eba4403b84d6e7fe8da25` as the tested implementation identity.
- No merge, staging deployment, production deployment, scheduler installation, secret mutation, staging/production SQL, or live database mutation occurred during the B2 recovery/certification tranche.

### Recovery defects closed

1. Banking/FX game-owned tables are registered with the canonical resumable whole-game purge authority, and the database acceptance harness uses the actual `fx_settlement_receipts` authority.
2. Business and Player monetary identity is resolved by `business_id` or `player_id`; a Business owner's Player identity is not treated as the Business's monetary identity.
3. Retained Store settlement fixtures no longer overwrite `account_balances`. Test funding goes through canonical `record_business_ledger_entry_v2` and `record_player_ledger_entry` calls, preserving the B2 projection guard and balanced journal semantics.
4. The permanent Banking/FX workflow now has separate source/static, disposable-PostgreSQL, and Chromium lanes. The broken self-mutating certification finalizer is not part of the permanent workflow.
5. The previously failing connected Player Store Buyer-funding journey is green without weakening Banking or bypassing account holds/projection authority.

### Durable B2 surface

- Forward migrations: `20260826010811_banking_fx_purge_registry_v1.sql`, `20260826090000_banking_account_identity_v1.sql`, `20260826091000_banking_transaction_holds_v1.sql`, `20260826092000_fx_clearing_liquidity_v1.sql`, `20260826093000_player_banking_fx_v1.sql`, `20260826094000_player_banking_fx_commands_v1.sql`, `20260826095000_player_banking_fx_order_commands_v1.sql`, `20260826096000_player_banking_fx_settlement_v1.sql`, `20260826097000_player_banking_fx_worker_v1.sql`, `20260826098000_banking_fx_readiness_v1.sql`, `20260826100000_business_bank_identity_runtime_v1.sql`, `20260826101000_banking_staff_adjustment_compatibility_v1.sql`, and `20260826102000_banking_fx_postcutover_purge_registry_v1.sql`.
- Canonical B2 records: `bank_accounts`, `bank_transactions`, `bank_account_holds`, `bank_account_hold_events`, `fx_liquidity_cap_snapshots`, `fx_liquidity_events`, `fx_quotes`, `fx_orders`, `fx_order_events`, `fx_settlement_receipts`, and private `fx_order_runtime_state`, while `ledger_entries` and `account_balances` remain the sole money journal/projection.
- Service commands/read projections include the balanced Player/Business ledger gateways, canonical account/activity reads, quote/overview/history/order reads, standard submit/cancel, instant execution, and leased standard-order claim/settle/fail commands.
- Player Banking FX routes remain exact-path parsed under `/players/me/banking/fx` for overview, history, orders, quotes, standard submission, instant execution, and standard cancellation.
- Detailed files, RPCs, routes, migrations, browser/database evidence, and next-step boundaries are recorded in `docs/roadmaps/banking-fx-clearing-implementation-handoff-v1.md` and `docs/roadmaps/banking-fx-clearing-scope-v1.md`.

### Permanent three-lane B2 gate on `ce931f83...`

- **Source/static — PASS** (`98429498128`): exact-SHA guard, PR authority verification, Banking/FX tests, Deno/backend checks, migration validation, local Edge runtime contract, and `git diff --check`.
- **Disposable PostgreSQL — PASS** (`98429498313`): disposable Supabase/PostgreSQL startup, zero-to-head database reset, Banking/FX database acceptance, rebuilt-database lint, and clean teardown.
- **Chromium — PASS** (`98429498040`): exact-SHA guard, Player Terminal dependencies, Chromium installation, browser-only runtime fixture, and full Playwright browser verification.
- Parent workflow run `33045836351`: **success**.

### Complete inherited exact-head matrix

All 30 pull-request-triggered workflow runs returned for `ce931f8320861117e64eba4403b84d6e7fe8da25` completed successfully. High-signal evidence includes:

- Database Replay `33045836076` — **PASS**.
- Business Player Store Cutover V2 `33045836240` — **PASS**, including connected authenticated Buyer/seller Store journey in two games and full Chromium.
- Business Store Atomic Settlement V2 `33045836230` — **PASS**.
- Business Store Seller Offers V2 `33045836311` — **PASS**.
- Business Store Withdrawal Safety V2 `33045836342` — **PASS**.
- Business Store Listing Inventory V2 `33045836231` — **PASS**.
- Player Terminal Verify `33045836354` — **PASS**.
- Backend Typecheck `33045836366` — **PASS**.
- Repository Quality `33045836246` — **PASS**.
- Beta Security Contract `33045836157` — **PASS**.
- Supply Chain Security `33045836208` — **PASS**.
- Business Banking Runtime `33045836219` — **PASS**.
- Player Local Currency Authority `33045836277` — **PASS**.
- Business Economy V2 `33045836303` — **PASS**.
- Business Timed Manufacturing V2 `33045836323` — **PASS**.
- Business Workforce Hiring V2 `33045836267` — **PASS**.
- Business Workforce Payroll V2 `33045836126` — **PASS**.
- Business Workforce Production Payroll V2 `33045836302` — **PASS**.
- Marketplace Preconvergence `33045836116` — **PASS**.
- Environment Neutral Browser `33045836347` — **PASS**.
- Progression Runtime `33045836266` — **PASS**.
- Runtime Interaction Wiring `33045836299` — **PASS**.
- World Runtime `33045836348` — **PASS**.
- Required Game Market Timezone `33045836180` — **PASS**.
- Exchange Calendar Runtime `33045836279` — **PASS**.
- Admin API Check `33045836109` — **PASS**.
- Admin Game Lifecycle Controls `33045836310` — **PASS**.
- Staging Readiness Preflight `33045836289` — **PASS**.

The exact source exposed 60 completed check runs with no failure, cancellation, timeout, or pending/in-progress check at certification. Conditional diagnostics and unauthorized release/deployment steps remained skipped where not applicable.

### B2 exit result

- Canonical Player/Business/system bank-account identity: **met**.
- Historical amount preservation and deterministic account/journal backfill: **met**.
- Per-currency balanced grouped posting and compatibility-offset evidence: **met**.
- Holds and posted/held/available balance enforcement: **met**.
- FX clearing/reserve/fee accounts and bounded facility snapshots: **met**.
- Standard delayed FX and instant FX with separate fee authority: **met**.
- Player Banking public routes/read model/UI and browser-safe public keys: **met**.
- Retained Store/Business/Marketplace/Banking compatibility at the B2 boundary: **met**.
- Static, disposable-database, Chromium, connected Store, two-game, security, repository, backend/all Edge, and inherited exact-head gates: **met**.
- Merge/deployment/live-environment completion: **not claimed**.

### Next authorized step

**`BUSINESS-V2-10A4C0` — shared multi-currency funding core is OPEN** on `feat/multicurrency-funding-core-v1`, stacked from the clean B2 documentation handoff. C0 may implement one immutable server-authoritative funding quote using at most three canonical Player Checking accounts and a private atomic funding composer that consumes B2 FX for foreign-currency legs. Store, Marketplace, Stocks, and Business-specific integration remain closed for C1-C4. Phase 11 remains closed until the full 10A.4 dependency chain reaches its own final certification.

---

## 2026-08-28 — Multi-Currency Store Funding C1 EXACT-HEAD VERIFIED

### Identity and status

- Roadmap item: `BUSINESS-V2-10A4C1`.
- Owner: `feat/multicurrency-store-funding-v1` / stacked draft PR #674 over C0 draft PR #673.
- Parent C0 implementation: `fd1511d716c1efd291cf6f45415a32a8d7550db4`; parent clean handoff: `0aec6cd3b97058a918ff60acdef0143cfcd97d06`.
- **Exact C1 implementation and verification source:** `1cf6f413f10a761265cdec6076ceb9b2b3afcbf5`.
- Canonical status: `IMPLEMENTED_NOT_MERGED`, not `VERIFIED_COMPLETE`; PR #674 remains draft, open, unmerged, and undeployed.
- This later documentation-only record does not replace the exact implementation SHA.

### Implemented boundary

- Seeded/NPC Store bills settle in item currency to the named Store revenue Checking account.
- Business seller-offer bills settle in offer currency to the seller Business's canonical active Checking account.
- Buyers may allocate the exact Store bill across one to three unique canonical Player Checking accounts. Same-currency legs use rate `1`; foreign legs consume certified C0 retail funding and B1/B2 fixing, clearing, reserve, and facility authorities.
- Store retains commercial, quote/receipt, stock, withdrawal, Inventory, acquisition-basis, COGS/margin, and Store-root-first lock authority. C0 retains funding quote/composer authority; B2 retains balanced Banking and FX clearing.
- Store and C0 evidence is linked immutably. Payment, target credit, FX effects, Inventory delivery, receipts, quote consumption, and seller/system evidence commit atomically or roll back together.
- No Store wallet, duplicate exchange-rate engine, Savings checkout, parallel balance table, or fabricated single-ledger-entry cross-currency receipt was introduced.

### Exact-head evidence

- **`multicurrency-store-funding-v1` — PASS** (`33114174603`): source/scope job `98664460581`; disposable zero-to-head replay-twice/database-acceptance/lint job `98664460167`.
- **`Business Player Store Cutover V2` — PASS** (`33114174711`): connected two-browser rerun `98676659699`; database replay/lint `98676660883`; Player Chromium `98676661493`; serial/concurrency/two-game acceptance `98676700370`; retained authority/quality/security `98676700536`; Backend/all-Edge Store verification `98676705692`.
- The first connected attempt's sanitized artifact showed two independent transient local-runtime `503` reads for Contracts and Messages that each recovered to `200`; every Store settlement and isolation assertion was already true. The unchanged exact SHA passed the strict console-clean journey on rerun. No code, economic invariant, or test expectation was weakened.
- All 20 pull-request-triggered workflows returned for the implementation SHA completed successfully.
- Durable evidence: `docs/roadmaps/multicurrency-store-funding-implementation-handoff-v1.md` and `docs/roadmaps/multicurrency-store-funding-scope-v1.md`.

### Exit and next item

- C1 exit criteria are met and the checkpoint is `IMPLEMENTED_NOT_MERGED`.
- No merge, deployment, scheduler installation, secret mutation, staging/production SQL, or live database mutation occurred.
- **`BUSINESS-V2-10A4C2` — Marketplace multi-currency funding is OPEN** only after the clean C1 documentation handoff. Stocks remain C3, Business treasury/procurement remains C4, final Store/FX convergence remains 10A.4D, and Phase 11 remains closed until the dependency chain is complete.

## 2026-08-29 — BUSINESS-V2-10A4C2 exact implementation certification

- Status: `IMPLEMENTED_NOT_MERGED`.
- Exact implementation and verification source: `9b95009dd7e73ed70987a0a99716d3ee32f2662d`.
- Draft PR: #675, open, draft, mergeable, unmerged, and undeployed at closeout.
- Marketplace listing currency remains authoritative through quote, settlement, order, dispute, and refund.
- One-to-three canonical Checking-account funding consumes C0 retail checkout FX, B1 fixing, and B2 Banking/clearing/liquidity authority.
- Buyer funding, seller/fee/tax distribution, Inventory delivery, listing/reservation/order mutation, and immutable evidence commit atomically.
- Funded refunds reverse original source-account and FX evidence without current-rate repricing.
- Permanent C2 gate `33142563231`, Database Replay `33142563190`, Player Terminal `33142563193`, Banking FX `33142563236`, retained C1 `33142563169`, retained C0 `33143124382`, independent browser/database `33143316570`, and Store-listing rerun `33142563234` attempt 2 passed on the exact source.
- The initial inherited Store-listing Chromium failure was superseded by a successful unchanged-source job rerun and is not accepted as final evidence.
- No merge, deployment, scheduler, secret, staging/production SQL, or live-database operation occurred.
- Next authorized work: C3 Stock Market multi-currency funding intake on a separate stacked draft branch after this clean documentation handoff.

## 2026-08-31 — C3 controller reconciliation before C4 closeout

- `BUSINESS-V2-10A4C3F` remains `IMPLEMENTED_NOT_MERGED` on `feat/multicurrency-stock-funding-v1` / draft PR #676.
- The immutable C3 implementation identity is `058162d7b9688809e885d9e6fe77ed42978c7a03`; its clean documentation/controller head is `18fde31be5e1599c7d9a65d681b248fcb4756dc4`.
- Detailed C3 migrations, routes, tests, workflow runs, exclusions, and source-of-truth rules remain in `docs/roadmaps/multicurrency-stock-funding-implementation-handoff-v1.md` and the current-checkpoint manifest. This reconciliation does not replace or recertify C3.

## 2026-08-31 — BUSINESS-V2-10A4C4 exact implementation certification

### Identity and status

- Roadmap item/checkpoint: `BUSINESS-V2-10A4C4` / `BUSINESS-V2-10A4C4F`.
- Owner: `feat/business-multicurrency-treasury-v1` / draft PR #678 over the C3F controller `18fde31be5e1599c7d9a65d681b248fcb4756dc4`.
- **Exact implementation and verification source:** `46bfc611834dca4db3084d9dce8197c499d61fcd`.
- Status: `IMPLEMENTED_NOT_MERGED`, never `VERIFIED_COMPLETE`; PR #678 remains draft, open, unmerged, and undeployed.
- Implementation progression: scope reconciliation `93e51b0598f1a8fc5da3ea03336ce8735a5d0972`; initial implementation `1746273f3354bdc5bba704fcc0eeeb6f2d9ecf1e`; source/UI repair `08864acb513ae07fd79a63d7c3f72e981e901c4a`; quote-transition repair `1c78c7b9e00aebe91d3c27f93f628d9d5b1d0b85`; final manifest-bound settlement repair and exact implementation `46bfc611834dca4db3084d9dce8197c499d61fcd`.

### Implemented boundary

- C4A generalizes existing B2 FX and C0 funding evidence to exactly one Player or Business owner, backfills existing rows as Player-owned without changing economic evidence, and exposes one zero-value canonical Business Checking account per active currency.
- C4B adds Business wrappers over unchanged B1/B2 standard and instant FX, preserving the 0.50% spread, next strictly later local 08:00 standard settlement, separate 2.00% instant fee, holds, clearing, liquidity, replay, cancellation, and owner-neutral worker behavior.
- C4C puts Business one-to-three-account procurement funding behind the retained C0 authority and rejects non-Business, Savings, system, legacy, restricted, closed, duplicate, wrong-game, and wrong-owner sources.
- C4D binds one commercial Business Store quote to one immutable funding quote and commits funding/FX, target credit, Store stock, Inventory/Warehouse delivery, weighted-average cost, receipt, and activity evidence atomically. Unbound legacy quotes return `410 business_store_procurement_payment_retired`.
- C4E adds the locked Player Treasury and funded procurement controls with public keys, exact currency/precision evidence, spread/fee/fixing/rounding disclosures, expiry/conflict/cancellation, immutable receipts, accessibility, responsive layout, and refresh recovery.
- C4F adds the durable `business-multicurrency-treasury-v1` three-lane workflow and exact-head source/database/concurrency/Chromium evidence.
- The inherited Marketplace settlement UI is now bound to the server-advertised `marketplacePurchase` capability descriptor, which advertises the real quote and settlement operations rather than the retired purchase path.

### Migrations, routes, and RPCs

- Forward migrations: `20260831100000_business_multicurrency_owner_identity_v1.sql`, `20260831101000_business_treasury_fx_commands_v1.sql`, `20260831102000_business_procurement_funding_v1.sql`, and `20260831103000_business_multicurrency_assertions_v1.sql`.
- No game-scoped table was added, so no C4 purge-registry migration was created.
- Authenticated routes: Treasury read; account open; FX quote; standard order; instant order; order cancellation; funded Business Store quote; funded Business Store purchase under `/players/me/business/...`.
- Principal public service-role-only RPCs: `list_player_business_bank_accounts_v1`, `ensure_business_banking_account_v1`, `create_business_fx_quote_v1`, `submit_business_standard_fx_order_v1`, `execute_business_instant_fx_v1`, `cancel_business_standard_fx_order_v1`, `list_business_fx_orders_v1`, `get_business_treasury_overview_v1`, `create_business_purchase_funding_quote_v1`, `create_business_store_quote_v2`, and `purchase_business_store_quote_v2`.
- Implementation files are grouped under the Business/Business Banking and owner-neutral Banking FX domains, shared Player Business dispatch and both Player Edge roots, Player Terminal Treasury/procurement modules, four migrations, the permanent workflow, and the C4 contract/database/concurrency/browser evidence. The exact inventory is recorded in `docs/roadmaps/business-multicurrency-treasury-implementation-handoff-v1.md`.

### Exact-head evidence

- Permanent C4 run `33351825999`: source/authority/application job `99366568097` — pass; C0/C4 zero-to-head replay, rebuilt-schema lint, database, rollback, isolation, and concurrency job `99366567927` — pass; desktop/mobile Player Chromium and accessibility job `99366568058` — pass.
- Connected Marketplace run `33351825985` — pass. Sanitized evidence proves listing create/activate/persist, funding quote apply/replay, settlement apply/replay, purchase persistence, dispute, cancellation, unauthenticated rejection, UUID privacy, and clean console/page state.
- All 31 PR-triggered workflows returned for `46bfc611834dca4db3084d9dce8197c499d61fcd` completed successfully: Admin API, Backend, security, database replay, repository/supply-chain/timezone, Player/runtime/browser, Banking FX, C1-C3 funding, Business Store phases, Business Banking/economy/workforce/manufacturing, progression, world, and permanent C4 gates.
- Superseded Marketplace attempts failed closed before transport because the connected session did not advertise the synthetic settlement endpoint key. The final repair maps that client operation to the one authoritative server capability and updates the operation manifest; no economic invariant, privacy rule, test expectation, production CORS boundary, or scheduler was weakened.

### Safety, blocker, and next item

- No PR was merged. Nothing was staged or deployed. No scheduler/cron, secret, staging/production SQL, or live data was changed. Database and connected evidence used disposable local CI services only.
- `BETA-LIVE-MIGRATION-PARITY-001` remains a release/runtime-evidence blocker and prevents `VERIFIED_COMPLETE`; it does not block this repository implementation record.
- The next exact item is `BUSINESS-V2-10A4D` on `feat/business-player-store-fx-final-v2`, created only from the separate clean C4 documentation/controller handoff.
