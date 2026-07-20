from pathlib import Path
import re

PATH = Path('docs/roadmaps/econovaria-beta-completion-roadmap-v1.md')
text = PATH.read_text(encoding='utf-8')


def exact(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected one occurrence of {old!r}; found {count}.')
    text = text.replace(old, new, 1)


def line(pattern: str, replacement: str, label: str) -> None:
    global text
    text, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE)
    if count != 1:
        raise SystemExit(f'Expected one line match for {label}; found {count}.')


def item(item_id: str, replacement: str) -> None:
    line(rf'^- \[[ x]\] `{re.escape(item_id)}`.*$', replacement, item_id)


exact(
    '**Audited application-state baseline:** `b700147f03be26e1663437135878c6736f55b805`',
    '**Audited application-state baseline:** `b700147f03be26e1663437135878c6736f55b805`\n**Current repository audit head:** `3b6c6d3b120a17121fb1168c41bf039b2e66dd00`',
)

line(
    r'^\| Seed-content foundation \|.*$',
    '| Seed-content foundation | `IN_PROGRESS`; branch synchronization required | PR #163, branch `agent/seed-content-foundation-v1`, head `ad73fbe23dffd8556e58f363b6dd833daa93cd74`; 407 seed commits beyond the common base and 98 current-main commits behind |',
    'seed-content snapshot row',
)

reaudit = '''### 2026-07-20 comprehensive repository and roadmap re-audit

- Re-audited current `main` at `3b6c6d3b120a17121fb1168c41bf039b2e66dd00`. Every commit after application-state baseline `b700147f03be26e1663437135878c6736f55b805` is roadmap-only, so no later application capability is being inferred.
- PR #163 remains the only open PR and the sole seed-content authority. Its current head is `ad73fbe23dffd8556e58f363b6dd833daa93cd74`; the branch has 407 seed commits beyond merge base `d403cf7baefeb3c1015c282cdbd748d2050e87ac` and is 98 current-main commits behind. It must be synchronized and revalidated before merge.
- The merged Player capability manifest remains schema `1`, version `2026-07-19.4`. Dashboard, Portfolio, Profile, market orders, Crafting, Loans, Business, Marketplace writes, Messages, and Progression remain unadvertised or unavailable.
- PR #163 contains substantial definition-layer progress that was understated in the expansion ledger: 144 item definitions, 60 recipe definitions, Store scarcity/difficulty policies, 10 banking products, 10 levels, 20 achievements, 50 locations, 13 proposed route families, 50 Contracts, 25 events, 10 event chains, 5 crisis arcs, 50 interactions, 30 news templates, 10 tutorials, and 30 notification templates.
- Definition coverage is not runtime completion. All PR #163 content remains production-unauthorized and activation-disabled; map coordinates and adjacency are unverified; an importer, persistence, rollback, runtime capability mapping, staging load, and human approval remain absent.
- Physical-economy calibration is active rather than merely planned: 16,000 deterministic country/difficulty/scenario/seed runs completed, with 25 of 28 quantitative gates passing. Easy and Moderate border-disruption supply recovery and Hard baseline craft success remain failed gates; substitution coverage and salvage/arbitrage checks also remain open.
- Operations and architecture are partially implemented: pinned toolchains, dependency audits, package-signature checks, repeated migration replay/lint, fail-closed staging validation, repository runtime cutover, and Admin architecture ratchets exist. They do not provide isolated environments, immutable release artifacts, SBOM/provenance, observability, backup/restore, incident readiness, or live legacy retirement evidence.

'''
exact('### Current release condition\n', reaudit + '### Current release condition\n')
exact(
    '- executable seed content and staging activation;',
    '- synchronize PR #163 with current `main`, then revalidate its seed definitions and tooling;\n- executable seed content and staging activation;',
)

item(
    'BETA-CONTRACT-006',
    '- [ ] `BETA-CONTRACT-006` Add introductory tutorial Contract chain. `IMPLEMENTED_NOT_MERGED` at the definition layer on PR #163: ten arrival tutorials and ten stabilization Contracts exist, but no merged runtime onboarding chain is instantiated.',
)
item(
    'BETA-CONTRACT-007',
    '- [ ] `BETA-CONTRACT-007` Expand seeded Contract library by country, difficulty, economic system, and story phase. `IMPLEMENTED_NOT_MERGED` at the definition layer on PR #163 with 50 machine-readable Contracts across all ten countries; numeric rewards, runtime import, activation, and full phase calibration remain open.',
)
item(
    'BETA-STORE-003',
    '- [ ] `BETA-STORE-003` Load a bounded approved Store catalog for all ten countries. `IN_PROGRESS`: PR #163 defines 144 country-distributed items, but approved numeric prices, runtime Store records, import, and staging evidence do not exist.',
)
item(
    'BETA-STORE-004',
    '- [ ] `BETA-STORE-004` Define Store item scarcity and difficulty rules. `IMPLEMENTED_NOT_MERGED` on PR #163 through named scarcity bands, restock policy, difficulty policy, resolved matrices, substitutions, maintenance, salvage, and demand records; calibration approval and runtime enforcement remain open.',
)

exact(
    '### Full item-system expansion\n',
    '### Full item-system expansion\n\nPR #163 provides an activation-disabled definition and specification layer. The checkboxes remain open because none of these expansion capabilities is merged or executable.\n',
)
item(
    'EXP-ITEM-001',
    '- [ ] `EXP-ITEM-001` Define canonical item taxonomy: consumables, materials, equipment, tools, collectibles, quest items, licenses, documents, and real-world rewards. `IMPLEMENTED_NOT_MERGED` in part on PR #163: 144 definitions cover materials, components, equipment, consumables, and blueprints/authorizations; collectibles, quest items, documents, and real-world-reward approval remain incomplete.',
)
item(
    'EXP-ITEM-002',
    '- [ ] `EXP-ITEM-002` Define effect contracts, duration, stacking, cooldown, scope, and audit. `IN_PROGRESS` on PR #163: effect intent, tangible use, difficulty/scarcity policy, server-authority boundaries, and candidate audit records exist; final duration, stacking, cooldown, activation, and persistence contracts are not approved.',
)
item(
    'EXP-ITEM-005',
    '- [ ] `EXP-ITEM-005` Implement durability and repair if approved. `IN_PROGRESS` at the definition/specification layer on PR #163 through equipment-maintenance and salvage records plus a unique-equipment backend contract; no runtime implementation is authorized.',
)
item(
    'EXP-ITEM-006',
    '- [ ] `EXP-ITEM-006` Implement item scarcity by country, difficulty, events, and production. `IMPLEMENTED_NOT_MERGED` at the definition layer on PR #163; runtime supply persistence, event application, Store integration, and staging calibration remain open.',
)
item(
    'EXP-ITEM-007',
    '- [ ] `EXP-ITEM-007` Implement materials and recipe requirements. `IMPLEMENTED_NOT_MERGED` at the definition layer on PR #163 with 42 materials, 30 components, 60 recipes, difficulty-resolved quantities, substitutions, and demand matrices; atomic runtime consumption is not implemented.',
)
item(
    'EXP-ITEM-009',
    '- [ ] `EXP-ITEM-009` Simulate balance and exploit resistance for every item effect. `IN_PROGRESS`: PR #163 ran 16,000 deterministic physical-economy combinations and passed 25/28 quantitative gates; three balance gates, substitution exercise, salvage/recraft, buyback-arbitrage, and malicious-concurrency coverage remain open.',
)

item(
    'EXP-MKT-001',
    '- [ ] `EXP-MKT-001` Ingest and editorially review the full 3,200-instrument library. `IN_PROGRESS` on PR #163: all 3,200 records are materialized and automated structural/editorial checks pass, but the branch is unmerged, eleven lexical warning groups require human review, generated corporate roots are placeholders, and production activation is unauthorized.',
)
item(
    'EXP-MKT-002',
    '- [ ] `EXP-MKT-002` Build issuer master registry. `IN_PROGRESS` on PR #163 with 1,675 stable issuer or administrator IDs and four curated issuer-enrichment sets; six country candidates and final editorial/runtime authority remain incomplete.',
)
item(
    'EXP-MKT-003',
    '- [ ] `EXP-MKT-003` Build exchanges, sectors, industries, commodities, and reference benchmarks. `IN_PROGRESS` on PR #163: ten canonical exchange codes and reference/identity registries exist, while full sector, industry, commodity, benchmark, and runtime integration remains incomplete.',
)
item(
    'EXP-MKT-004',
    '- [ ] `EXP-MKT-004` Add calibrated issuer financial statements and event exposure. `IN_PROGRESS` on PR #163: Northreach, Yrethia, Thaloris, and Solvend have deterministic enrichment/simulation evidence; six countries and cross-market calibration remain open.',
)
item(
    'EXP-BANK-005',
    '- [ ] `EXP-BANK-005` Define loan products, eligibility, and disclosures. `IMPLEMENTED_NOT_MERGED` at the definition layer on PR #163 through ten banking products, including credit, training, equipment-finance, trade-finance, and recovery products with disclosure and recovery requirements; rates, fees, limits, eligibility calculations, and runtime authority remain calibration-pending.',
)

exact(
    '**Overall status:** `IN_PROGRESS`.\n\n### Complete foundation',
    '**Overall status:** `IN_PROGRESS`; the merged event/notification foundation exists, and PR #163 supplies an unmerged activation-disabled campaign definition layer. No complete campaign is runtime-playable.\n\n### Complete foundation',
)
exact(
    '### Beta campaign\n',
    '### Beta campaign\n\nPR #163 defines immigrant openings, economic opportunity and pressure events, Meridian disruption, confidence, cyber, food/energy, reconstruction, ten country chains, and five crisis arcs. These records are definition-only and do not satisfy runner, cutscene, persistence, scheduling, or staging acceptance.\n',
)
item(
    'BETA-STORY-001',
    '- [ ] `BETA-STORY-001` Implement one complete playable campaign arc. `IN_PROGRESS`: PR #163 contains a complete definition-layer campaign graph, but no merged runtime runner, scheduler, persistence, cutscene delivery, or staging playthrough exists.',
)
item(
    'BETA-STORY-002',
    '- [ ] `BETA-STORY-002` Begin with the player arriving as a new immigrant. `IMPLEMENTED_NOT_MERGED` at the definition layer on PR #163 through ten country immigrant openings, arrival packages, messages, tutorials, and stabilization Contracts; runtime onboarding remains open.',
)
item(
    'BETA-STORY-003',
    '- [ ] `BETA-STORY-003` Establish the Meridian boom and economic opportunity. `IN_PROGRESS` at the definition layer on PR #163 through ten country sector-expansion events and Meridian opportunity content; runtime activation remains open.',
)
item(
    'BETA-STORY-004',
    '- [ ] `BETA-STORY-004` Introduce rivalry, shortages, and political hostility. `IN_PROGRESS` at the definition layer on PR #163 through country pressure events, interactions, news, scarcity, and corridor-disruption records; runtime activation remains open.',
)
item(
    'BETA-STORY-005',
    '- [ ] `BETA-STORY-005` Trigger a Meridian attack with uncertain attribution. `IN_PROGRESS` at the narrative-definition layer on PR #163; executable trigger, attribution state, player evidence flow, and staging proof remain absent.',
)
item(
    'BETA-STORY-006',
    '- [ ] `BETA-STORY-006` Escalate to open war and civilian economic adaptation. `IN_PROGRESS` at the definition layer on PR #163 through war, disruption, shortage, adaptation, and recovery content; no executable campaign state machine is merged.',
)
item(
    'BETA-STORY-007',
    '- [ ] `BETA-STORY-007` Introduce loyalty, residency, and relationship pressure. `IN_PROGRESS` at the narrative-definition layer on PR #163; runtime reputation, residency, relationship persistence, and choice consequences remain unimplemented.',
)
item(
    'BETA-STORY-008',
    '- [ ] `BETA-STORY-008` Resolve through ceasefire, continued conflict, or reconstruction paths. `IN_PROGRESS` at the definition layer on PR #163 through resolution models, cancellation matrices, outcome reactions, and reconstruction events; runtime branching remains open.',
)
item(
    'BETA-STORY-009',
    '- [ ] `BETA-STORY-009` Keep the player economically influential but not automatically a national leader or military commander. `IMPLEMENTED_NOT_MERGED` as a narrative constraint on PR #163; runtime enforcement and complete playtest evidence remain open.',
)
item(
    'BETA-STORY-010',
    '- [ ] `BETA-STORY-010` Add bounded news, events, Contracts, Store scarcity, market shocks, and notifications for every campaign phase. `IN_PROGRESS` at the definition layer on PR #163 with machine-readable coverage across these domains; cross-domain runtime execution and calibration remain open.',
)
item(
    'BETA-STORY-012',
    '- [ ] `BETA-STORY-012` Add replay-safe and idempotent event execution. `IN_PROGRESS`: the merged foundation includes idempotent event resolution and PR #163 defines cancellation/progression policies, but the campaign runner and connected replay evidence remain absent.',
)

exact(
    '- [ ] Minimal onboarding.',
    '- [ ] Minimal onboarding. `IN_PROGRESS`: PR #163 defines ten arrival packages, messages, tutorials, and stabilization Contracts; the arrival class system is explicitly not started and no runtime onboarding flow is merged.',
)
exact(
    '- [ ] One complete tutorial Contract chain.',
    '- [ ] One complete tutorial Contract chain. `IMPLEMENTED_NOT_MERGED` at the definition layer on PR #163; runtime instantiation and staging playthrough remain open.',
)
exact(
    '- [ ] One complete story event and notification chain.',
    '- [ ] One complete story event and notification chain. `IN_PROGRESS` at the definition layer on PR #163; runtime event activation, notification/cutscene delivery, and replay evidence remain open.',
)

exact(
    '- PR #163 remains draft and is a validated design-definition/calibration branch, not a deployable seed release. Current audited head: `ad73fbe23dffd8556e58f363b6dd833daa93cd74`.',
    '- PR #163 remains draft and is a validated design-definition/calibration branch, not a deployable seed release. Current audited head: `ad73fbe23dffd8556e58f363b6dd833daa93cd74`. It is 98 current-main commits behind and must be synchronized before merge review.',
)
exact(
    '- The physical-economy layer contains 144 item definitions. Numeric prices, effects, recipes, production import, and runtime capability remain approval-blocked.',
    '- The physical-economy layer contains 144 item definitions and a 60-recipe graph with difficulty, substitution, scarcity, maintenance, salvage, and demand policies. Numeric prices, effect coefficients, recipe activation, production import, and runtime capability remain approval-blocked.',
)
exact(
    '- Current validation reports zero structural errors, all nine seed-preflight tests passing, and 16 remaining blockers: 15 runtime/dependency domains plus the unverified 50-location map registry.',
    '- Current validation reports zero structural errors, all nine seed-preflight tests passing, and 16 remaining blockers: 15 runtime/dependency domains plus the unverified 50-location map registry. Physical-economy calibration completed 16,000 deterministic runs with 25/28 quantitative gates passing.',
)
exact(
    '- [ ] Verify canonical countries, currencies, locations, adjacency, and routes. The 50-location map registry remains unverified.',
    '- [ ] Verify canonical countries, currencies, locations, adjacency, and routes. `IN_PROGRESS`: PR #163 defines 50 candidate locations and 13 proposed route families, but map points are null, adjacency and geometry are unverified, and no runtime schema is approved.',
)
exact(
    '- [ ] Create bounded runtime Store catalogs. Item definitions exist; prices, scarcity, and import remain blocked.',
    '- [ ] Create bounded runtime Store catalogs. `IN_PROGRESS`: 144 item definitions plus scarcity/difficulty/restock policies exist; approved numeric prices, executable Store import, and staging activation remain blocked.',
)
exact(
    '- [ ] Implement an environment-restricted, idempotent seed importer.',
    '- [ ] Complete physical-economy calibration. `IN_PROGRESS`: 16,000 deterministic runs passed 25/28 quantitative gates; Easy/Moderate border-disruption recovery, Hard baseline crafting, substitution coverage, salvage/recraft, and buyback-arbitrage checks remain open.\n- [ ] Implement an environment-restricted, idempotent seed importer.',
)

item(
    'P0-001',
    '- [x] `P0-001` Re-audit current `main`, active PR ownership, branch divergence, and deployed-runtime evidence boundaries. Refreshed on 2026-07-20 at current `main` `3b6c6d3b120a17121fb1168c41bf039b2e66dd00`; PR #163 remains the only open PR.',
)
item(
    'P0-002',
    '- [x] `P0-002` Update this roadmap audit metadata, active authority table, current status precision, and identified-item scoreboard. Refreshed in the 2026-07-20 comprehensive re-audit.',
)
item(
    'P0-006',
    '- [ ] `P0-006` Close or archive superseded branch refs after their useful work is accounted for and after confirming no other active chat owns them. Temporary roadmap branches were removed after merge; a reliable owner-safe inventory and cleanup of older superseded refs remains open because the branch-search connector returned no authoritative listing.',
)

PATH.write_text(text, encoding='utf-8')
