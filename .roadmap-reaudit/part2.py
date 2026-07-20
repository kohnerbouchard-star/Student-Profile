from pathlib import Path
import re
from collections import defaultdict

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


item(
    'OPS-STAGE-004',
    '- [ ] `OPS-STAGE-004` Contain or retire legacy Edge Functions and Cloudflare Worker routes. `IN_PROGRESS`: PRs #217 and #222 removed the browser Cloudflare transport and legacy Player source from the repository; live traffic inventory, observation window, credential rotation, Worker/function disablement, and restore evidence remain open.',
)
item(
    'OPS-STAGE-007',
    '- [ ] `OPS-STAGE-007` Add protected approval for staging and production. `IN_PROGRESS` at the tooling layer: the merged staging preflight targets a named GitHub `staging` environment, but actual isolated environment identities, required approvers, and production protection evidence remain absent.',
)
item(
    'OPS-ARTIFACT-001',
    '- [ ] `OPS-ARTIFACT-001` Build immutable artifacts from merge commits. `IN_PROGRESS` at the validation-contract layer through PR #169; no reviewed immutable frontend and Edge artifact set has been built and promoted.',
)
item(
    'OPS-ARTIFACT-002',
    '- [ ] `OPS-ARTIFACT-002` Generate release manifest with hashes, migration head, config version, and feature flags. `IN_PROGRESS`: a fail-closed manifest schema and validator merged through PR #169, but no complete evidence-backed release manifest exists.',
)
item(
    'OPS-SUPPLY-001',
    '- [ ] `OPS-SUPPLY-001` Add secret scanning, dependency review, SBOM/provenance, and patch cadence. `IN_PROGRESS`: exact Node/npm/tool pins, lockfiles, high-severity dependency audit thresholds, and package-signature checks run in Repository Quality; secret scanning, dependency-review enforcement, SBOM, provenance, automated update policy, and approved patch cadence remain open.',
)

exact(
    'PR #169 merged the fail-closed staging-readiness validator, protected workflow, template, and operator runbook as `ca642b1dfd6a2965612869e05b4fa1bd5840c437`.',
    'PR #169 merged the fail-closed staging-readiness validator, protected workflow, template, and operator runbook as `ca642b1dfd6a2965612869e05b4fa1bd5840c437`. Repository Quality also enforces pinned toolchains, dependency vulnerability thresholds, package-signature checks, repository audits, and backend dependency audits.',
)

exact(
    '## 23. Business and employment system\n\n**Status:** `PLANNED`.',
    '## 23. Business and employment system\n\n**Status:** `PLANNED` for an authoritative runtime. PR #163 contains supporting business-oriented Contracts, banking products, items, events, and simulation assumptions, but no coherent business-entity lifecycle or executable persistence model.',
)

exact(
    '## 25. Crafting\n\n**Status:** `PLANNED`.',
    '## 25. Crafting\n\n**Status:** `IMPLEMENTED_NOT_MERGED` for the activation-disabled definition/specification layer on PR #163; runtime persistence, atomic jobs, UI, and approved balance remain `PLANNED` or `IN_PROGRESS`.',
)
item(
    'EXP-CRAFT-001',
    '- [ ] `EXP-CRAFT-001` Define recipe schema and stable public IDs. `IMPLEMENTED_NOT_MERGED` on PR #163 with a 60-recipe versioned manifest and stable recipe/item keys.',
)
item(
    'EXP-CRAFT-002',
    '- [ ] `EXP-CRAFT-002` Define material quantities, tools, difficulty, duration, output, quality, and failure rules. `IMPLEMENTED_NOT_MERGED` at the definition/specification layer on PR #163 through tiered recipes, difficulty-resolved matrices, deterministic rules, and a backend contract; final runtime DTO/storage approval remains open.',
)
item(
    'EXP-CRAFT-005',
    '- [ ] `EXP-CRAFT-005` Connect scarcity and country availability. `IMPLEMENTED_NOT_MERGED` at the definition layer on PR #163 through scarcity/restock, substitution, source-country, difficulty, and demand policies; runtime supply persistence and event application remain open.',
)
item(
    'EXP-CRAFT-008',
    '- [ ] `EXP-CRAFT-008` Add deterministic fixtures and balance simulation. `IN_PROGRESS`: PR #163 includes deterministic physical-economy fixtures and 16,000 runs, but 3/28 quantitative gates fail and substitution, salvage/recraft, buyback-arbitrage, concurrency, and complete country calibration remain unresolved.',
)

exact(
    '## 27. Progression, reputation, and achievements\n\n**Status:** `PLANNED`.',
    '## 27. Progression, reputation, and achievements\n\n**Status:** `IMPLEMENTED_NOT_MERGED` for basic activation-disabled level and achievement definitions on PR #163; authoritative reads, claims, unlocks, reputation, Admin correction, and full balance remain `PLANNED`.',
)
item(
    'EXP-PROG-001',
    '- [ ] `EXP-PROG-001` Define experience, levels, skills, rewards, achievements, and public/private fields. `IMPLEMENTED_NOT_MERGED` in part on PR #163: ten levels and twenty achievements are machine-readable, while numeric thresholds, skills, economic rewards, privacy classification, and runtime storage remain incomplete.',
)
item(
    'EXP-PROG-008',
    '- [ ] `EXP-PROG-008` Simulate progression speed and exploit resistance. `IN_PROGRESS` only at the physical-economy access layer on PR #163; complete progression timing, reward inflation, claim replay, class interaction, and exploit simulation remain open.',
)

exact(
    '## 28. Arrival class system\n\n**Status:** `PLANNED`; current Workstream 11.',
    '## 28. Arrival class system\n\n**Status:** `PLANNED`; PR #163 explicitly records Workstream 11 as deferred and implementation not started. Candidate dimensions, class families, constraints, storage requirements, and tests are backlog guidance only.',
)

exact(
    '## 29. Geography, locations, travel, and immigration\n\n**Status:** `PLANNED`.',
    '## 29. Geography, locations, travel, and immigration\n\n**Status:** `IN_PROGRESS` at the activation-disabled definition layer on PR #163; current runtime supports country-level map interaction only. Exact locations, adjacency, routes, travel, immigration, and war-route behavior are not executable.',
)
item(
    'EXP-GEO-001',
    '- [ ] `EXP-GEO-001` Verify 50 canonical locations. `IN_PROGRESS`: PR #163 defines 50 stable candidate locations, five per country, but every map point is null and final naming/artwork verification remains pending.',
)
item(
    'EXP-GEO-002',
    '- [ ] `EXP-GEO-002` Verify exact coordinates and map artwork. `PLANNED` after the structural audit: active artwork, terrain, coastlines, capital-marker semantics, Lumenor/Xalvoria profile correction, and all 50 coordinates require visual evidence.',
)
item(
    'EXP-GEO-003',
    '- [ ] `EXP-GEO-003` Define land, sea, air, and Meridian route adjacency. `IN_PROGRESS`: PR #163 proposes 13 route families, but explicitly approves no land-border claim and lacks verified adjacency, endpoint geometry, movement rules, and wartime behavior.',
)
item(
    'EXP-GEO-008',
    '- [ ] `EXP-GEO-008` Implement map interaction and route visualization. `IN_PROGRESS`: country polygon interaction exists in the Player Terminal; capital, city, site, route, disruption, and travel visualization remain unimplemented.',
)

exact(
    '## 30. Long-term architecture and production maturity\n\n**Status:** `PLANNED`.',
    '## 30. Long-term architecture and production maturity\n\n**Status:** `IN_PROGRESS`. Several containment and ratchet steps are merged, but the target architecture and production operating model are not complete.',
)
exact(
    '- [ ] Retire all unknown legacy backend traffic.',
    '- [ ] Retire all unknown legacy backend traffic. `IN_PROGRESS`: repository Player transport/source retirement is complete, while live Worker and legacy-function traffic/disposition evidence remains open.',
)
exact(
    '- [ ] Establish one typed versioned client.',
    '- [ ] Establish one typed versioned client. `IN_PROGRESS`: the Player runtime adapter and versioned capability contract are authoritative; Admin and remaining domains do not yet share one strict typed client.',
)
exact(
    '- [ ] Eliminate global fetch wrappers.',
    '- [ ] Eliminate global fetch wrappers. `IN_PROGRESS`: the first global interception layer was removed and the current Admin architecture ratchet permits a maximum of 7 `window.fetch` assignments; the target remains zero.',
)
exact(
    '- [ ] Reduce MutationObservers to genuine DOM-observation requirements.',
    '- [ ] Reduce MutationObservers to genuine DOM-observation requirements. `IN_PROGRESS`: explicit mounted-event work reduced the current Admin ratchet maximum to 11 observers; every remaining site still requires justification or extraction.',
)
exact(
    '- [ ] Maintain an immutable release and change-control process.',
    '- [ ] Maintain an immutable release and change-control process. `IN_PROGRESS`: branch/PR gates, repeated database replay, a fail-closed staging manifest contract, and protected workflow tooling exist; immutable artifact promotion, approvals, rollback, restore, and production evidence remain open.',
)

# Generate a stable identified-item scoreboard after all status corrections.
pattern = re.compile(r'^- \[([ x])\] `((P0|BETA|SEED|OPS|EXP)-[A-Z0-9-]+)`', re.MULTILINE)
counts = defaultdict(lambda: {'complete': 0, 'open': 0})
for mark, _item_id, prefix in pattern.findall(text):
    counts[prefix]['complete' if mark == 'x' else 'open'] += 1

order = ['P0', 'BETA', 'SEED', 'OPS', 'EXP']
rows = []
total_complete = 0
total_open = 0
labels = {
    'P0': 'Program control',
    'BETA': 'Beta capability items',
    'SEED': 'Seed-specific items',
    'OPS': 'Operations/release items',
    'EXP': 'Expansion items',
}
for prefix in order:
    complete = counts[prefix]['complete']
    opened = counts[prefix]['open']
    total_complete += complete
    total_open += opened
    rows.append(f'| {labels[prefix]} | {complete} | {opened} | {complete + opened} |')
rows.append(f'| **Total identified items** | **{total_complete}** | **{total_open}** | **{total_complete + total_open}** |')

scoreboard = '''### Current identified-item scoreboard

This table counts stable roadmap IDs only. A checked item is merged and evidence-backed at its stated boundary. An open item may be `IMPLEMENTED_NOT_MERGED`, `IN_PROGRESS`, `PLANNED`, or externally blocked; the detailed line remains authoritative.

| Scope | Verified/checked | Open | Total |
|---|---:|---:|---:|
''' + '\n'.join(rows) + '''

### Current phase situation

- **Phase 0 — Program control:** substantially complete; superseded branch-ref cleanup remains open.
- **Phase 1 — Authoritative Player Backend:** complete and merged.
- **Phase 2 — Player connection:** mostly complete; Dashboard, Portfolio, Profile, market orders, and isolated-staging bootstrap remain open.
- **Phase 3 — Beta gameplay gaps:** Contracts, Store/Inventory, notifications, and game lifecycle are repository-integrated; onboarding, cutscenes, Player recovery, market trade/portfolio, and a runtime story chain remain open.
- **Phase 4 — Seed content/calibration:** definition coverage is broad and measurable, but PR #163 is stale against `main`, six market simulations remain, physical-economy calibration has failed gates, and no importer/rollback/staging activation exists.
- **Phase 5 — Security/release/operations:** validation tooling and several repository controls exist; isolated environments, live migration reconciliation, immutable artifacts, observability, legacy retirement, backup/restore, incident readiness, and staging smoke remain open.
- **Phase 6 — End-to-end pilot:** not yet executed as one authoritative staging-backed sequence.

### Current dependency-ordered priorities

1. Reconcile migration history and establish an isolated staging environment with protected approval.
2. Complete `BETA-MKT-003` through `BETA-MKT-007` so market orders and Portfolio can join the authoritative Player loop.
3. Complete onboarding, cutscene/purpose-built story delivery, and Player recovery states.
4. Synchronize PR #163 with current `main`, preserve its sole ownership, close its failed calibration/map/import/rollback gates, and load only a bounded staging subset.
5. Run the complete Phase 6 sequence, including backup/restore, retry/idempotency, lifecycle pause/end, and cross-game denial.

'''
exact('- final end-to-end beta verification.\n\n---', '- final end-to-end beta verification.\n\n' + scoreboard + '---')

ledger = '''### 2026-07-20 — Comprehensive repository and roadmap re-audit

- Audited current `main` `3b6c6d3b120a17121fb1168c41bf039b2e66dd00`; application implementation remains represented by baseline `b700147f03be26e1663437135878c6736f55b805` because all later mainline changes are roadmap-only.
- Confirmed PR #163 is the only open PR and sole seed authority at `ad73fbe23dffd8556e58f363b6dd833daa93cd74`; it is 407 seed commits beyond merge base `d403cf7baefeb3c1015c282cdbd748d2050e87ac` and 98 current-main commits behind.
- Reclassified understated unmerged definition work for Contracts, Store scarcity, items, Crafting, financial-market registries, banking products, progression, campaign content, locations, and routes while preserving all runtime, approval, staging, and production blockers.
- Recorded the 144-item/60-recipe physical-economy graph and its 16,000-run calibration result: 25/28 quantitative gates pass; three quantitative failures plus substitution, salvage/recraft, arbitrage, and concurrency gaps prevent activation.
- Reclassified operations and architecture controls as partial where evidence exists: dependency auditing, package signatures, pinned tooling, replay/lint, staging validation, Player legacy-source retirement, capability versioning, and Admin fetch/observer ratchets.
- Added a generated identified-item scoreboard, phase situation, and dependency-ordered priority sequence. No application source, migration, route, RPC, seed runtime, credential, environment, or deployment changed in this roadmap-only tranche.

'''
exact('Append entries in reverse chronological order.\n\n', 'Append entries in reverse chronological order.\n\n' + ledger)

PATH.write_text(text, encoding='utf-8')
