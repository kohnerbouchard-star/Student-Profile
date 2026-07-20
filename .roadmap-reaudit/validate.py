from pathlib import Path
import re

path = Path('docs/roadmaps/econovaria-beta-completion-roadmap-v1.md')
text = path.read_text(encoding='utf-8')

required = [
    '**Current repository audit head:** `3b6c6d3b120a17121fb1168c41bf039b2e66dd00`',
    'PR #163 remains the only open PR and the sole seed-content authority.',
    '16,000 deterministic country/difficulty/scenario/seed runs completed',
    '`BETA-STORE-004` Define Store item scarcity and difficulty rules. `IMPLEMENTED_NOT_MERGED`',
    '`EXP-CRAFT-001` Define recipe schema and stable public IDs. `IMPLEMENTED_NOT_MERGED`',
    '`EXP-PROG-001` Define experience, levels, skills, rewards, achievements, and public/private fields. `IMPLEMENTED_NOT_MERGED`',
    '`EXP-GEO-001` Verify 50 canonical locations. `IN_PROGRESS`',
    '`OPS-SUPPLY-001` Add secret scanning, dependency review, SBOM/provenance, and patch cadence. `IN_PROGRESS`',
    '### Current identified-item scoreboard',
    '### Current phase situation',
    '### Current dependency-ordered priorities',
    '### 2026-07-20 — Comprehensive repository and roadmap re-audit',
]
for marker in required:
    if marker not in text:
        raise SystemExit(f'Missing required roadmap marker: {marker}')

for stale in [
    '- [ ] `BETA-CONTRACT-006` Add introductory tutorial Contract chain.\n',
    '- [ ] `BETA-STORE-004` Define Store item scarcity and difficulty rules.\n',
    '## 25. Crafting\n\n**Status:** `PLANNED`.',
    '## 27. Progression, reputation, and achievements\n\n**Status:** `PLANNED`.',
    '## 29. Geography, locations, travel, and immigration\n\n**Status:** `PLANNED`.',
    '## 30. Long-term architecture and production maturity\n\n**Status:** `PLANNED`.',
]:
    if stale in text:
        raise SystemExit(f'Stale roadmap state remains: {stale!r}')

ids = re.findall(r'^- \[[ x]\] `((?:P0|BETA|SEED|OPS|EXP)-[A-Z0-9-]+)`', text, flags=re.MULTILINE)
duplicates = sorted({item_id for item_id in ids if ids.count(item_id) > 1})
if duplicates:
    raise SystemExit(f'Duplicate stable roadmap IDs: {duplicates}')
if len(ids) < 100:
    raise SystemExit(f'Unexpectedly low stable roadmap ID count: {len(ids)}')

if 'productionAuthorized":true' in text or 'activationAuthorized":true' in text:
    raise SystemExit('Roadmap must not claim seed production or activation authorization.')

print({'status': 'pass', 'stableRoadmapIds': len(ids)})
