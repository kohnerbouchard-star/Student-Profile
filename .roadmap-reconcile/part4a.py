from pathlib import Path
import re
path = Path('docs/roadmaps/econovaria-beta-completion-roadmap-v1.md')
text = path.read_text(encoding='utf-8')

phase4 = '''### Current PR #163 evidence boundary

- PR #163 remains draft and is a validated design-definition/calibration branch, not a deployable seed release. Current audited head: `ad73fbe23dffd8556e58f363b6dd833daa93cd74`.
- The definition layer contains ten 320-record country JSONLs: exactly 3,200 unique stable IDs, symbols, and display names, with 1,675 stable issuer or administrator IDs. Every record remains activation-disabled and runtime-unverified.
- The bounded-selection layer contains 240 candidate instruments across all ten countries. Four country candidates are curated/enriched; six are selection-complete and enrichment-pending. No candidate is activation-authorized.
- The physical-economy layer contains 144 item definitions. Numeric prices, effects, recipes, production import, and runtime capability remain approval-blocked.
- Ten machine-readable arrival packages, messages, tutorials, and stabilization Contracts exist. Numeric starting values and runtime instantiation remain blocked.
- The deterministic coverage audit reports 11/11 target groups met: 50 Contracts, 10 banking products, 10 progression levels, 20 achievements, 25 events, 10 event chains, 5 crisis arcs, 50 interactions, 30 news templates, 10 tutorials, and 30 notification templates.
- Northreach, Yrethia, Thaloris, and Solvend have deterministic pilot evidence. The other six countries and cross-market calibration remain incomplete.
- Current validation reports zero structural errors, all nine seed-preflight tests passing, and 16 remaining blockers: 15 runtime/dependency domains plus the unverified 50-location map registry.
- No executable importer, production migration, deployment, runtime activation, approved numeric calibration, rollback rehearsal, or staging load exists.

- [x] Ingest the 3,200-instrument library into repository-controlled definition-layer source files.
- [ ] Select and approve a bounded active market subset. `IN_PROGRESS`: 240 candidates are selected, but six require enrichment and all remain activation-disabled.
- [ ] Complete issuer, exchange, sector, industry, commodity, and benchmark registries. `IN_PROGRESS`: stable issuer IDs and canonical exchanges exist; enrichment/editorial approval remains incomplete.
- [ ] Verify canonical countries, currencies, locations, adjacency, and routes. The 50-location map registry remains unverified.
- [ ] Correct map profiles and coordinates using the approved artwork and polygon evidence.
- [x] Convert ten arrival packages, messages, tutorials, and stabilization Contracts into machine-readable definition records.
- [ ] Approve numeric starting balances, items, Contracts, affordability, and recovery paths through simulation.
- [ ] Create bounded runtime Store catalogs. Item definitions exist; prices, scarcity, and import remain blocked.
- [x] Create tutorial and introductory Contract definitions.
- [x] Create campaign event, news, interaction, tutorial, and notification definition coverage.
- [x] Create deterministic fixture and audit inputs for the definition layer and four pilot simulations.
- [ ] Implement an environment-restricted, idempotent seed importer.
- [ ] `SEED-PREFLIGHT-001` Merge deterministic fail-closed seed-content preflight validation. `IMPLEMENTED_NOT_MERGED` on draft PR #163; all nine focused tests pass and staging/production modes remain fail-closed while blockers exist.
- [ ] Implement deactivation and rollback.
- [ ] Run reproducible economic and market simulations for all ten countries. `IN_PROGRESS`: four country pilots are current; six remain.
- [ ] Complete cross-market calibration and record approved seeds, inputs, outputs, integrity checks, and balance decisions.
- [ ] Load only a bounded approved subset into isolated staging and verify Admin/Player behavior.

'''
text, count = re.subn(r'### Current PR #163 evidence boundary\n\n.*?(?=\*\*Exit gate:\*\*)', phase4, text, count=1, flags=re.MULTILINE | re.DOTALL)
if count != 1: raise SystemExit('Expected one Phase 4 evidence boundary.')
path.write_text(text, encoding='utf-8')
