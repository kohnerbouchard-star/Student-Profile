from pathlib import Path

path = Path('docs/roadmaps/econovaria-beta-completion-roadmap-v1.md')
text = path.read_text(encoding='utf-8')

old = '**Current audited main baseline:** `b700147f03be26e1663437135878c6736f55b805`'
new = '**Audited application-state baseline:** `b700147f03be26e1663437135878c6736f55b805`'
if text.count(old) != 1:
    raise SystemExit(f'Expected one current-main baseline label; found {text.count(old)}.')
text = text.replace(old, new, 1)

old_evidence = '- PR #239 merged the full roadmap reconciliation as `b700147f03be26e1663437135878c6736f55b805`; this merge is the current audited `main` baseline.'
new_evidence = '- PR #239 merged the full roadmap reconciliation as `b700147f03be26e1663437135878c6736f55b805`; this is the audited application-state baseline. Later roadmap-only merge commits do not advance application implementation status.'
if text.count(old_evidence) != 1:
    raise SystemExit(f'Expected one current baseline evidence line; found {text.count(old_evidence)}.')
text = text.replace(old_evidence, new_evidence, 1)

old_ledger = '- Updated the current audited `main` baseline to the reconciliation merge itself so the authoritative ledger is not immediately stale after merge.'
new_ledger = '- Defined `b700147f03be26e1663437135878c6736f55b805` as the audited application-state baseline; later roadmap-only merge commits are evidence updates and do not imply application-state changes.'
if text.count(old_ledger) != 1:
    raise SystemExit(f'Expected one baseline ledger line; found {text.count(old_ledger)}.')
text = text.replace(old_ledger, new_ledger, 1)

path.write_text(text, encoding='utf-8')
