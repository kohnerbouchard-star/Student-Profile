from pathlib import Path

path = Path('docs/roadmaps/econovaria-beta-completion-roadmap-v1.md')
text = path.read_text(encoding='utf-8')

old_baseline = '**Current audited main baseline:** `4e3c123c98c37a2b5d26a93e67bfb31c3b722925`'
new_baseline = '**Current audited main baseline:** `b700147f03be26e1663437135878c6736f55b805`'
if text.count(old_baseline) != 1:
    raise SystemExit(f'Expected one pre-merge baseline; found {text.count(old_baseline)}.')
text = text.replace(old_baseline, new_baseline, 1)

section_marker = '### 2026-07-20 full repository reconciliation\n\n'
section_evidence = '- PR #239 merged the full roadmap reconciliation as `b700147f03be26e1663437135878c6736f55b805`; this merge is the current audited `main` baseline.\n'
if text.count(section_marker) != 1:
    raise SystemExit(f'Expected one full reconciliation section; found {text.count(section_marker)}.')
text = text.replace(section_marker, section_marker + section_evidence, 1)

ledger_marker = 'Append entries in reverse chronological order.\n\n'
ledger_entry = '''### 2026-07-20 — Post-merge roadmap baseline seal

- PR #239 merged the full application-state reconciliation as `b700147f03be26e1663437135878c6736f55b805`.
- Updated the current audited `main` baseline to the reconciliation merge itself so the authoritative ledger is not immediately stale after merge.
- Roadmap-only correction; no application source, migration, route, RPC, seed content, credential, environment, or runtime changed.

'''
if text.count(ledger_marker) != 1:
    raise SystemExit(f'Expected one change-ledger marker; found {text.count(ledger_marker)}.')
text = text.replace(ledger_marker, ledger_marker + ledger_entry, 1)

if new_baseline not in text or section_evidence.strip() not in text:
    raise SystemExit('Post-merge baseline evidence was not applied.')

path.write_text(text, encoding='utf-8')
