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
