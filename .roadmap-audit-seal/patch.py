from pathlib import Path

path = Path('docs/roadmaps/econovaria-beta-completion-roadmap-v1.md')
text = path.read_text(encoding='utf-8')


def exact(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected one occurrence of {old!r}; found {count}.')
    text = text.replace(old, new, 1)


exact(
    '**Current repository audit head:** `3b6c6d3b120a17121fb1168c41bf039b2e66dd00`',
    '**Repository state audited through:** `3b6c6d3b120a17121fb1168c41bf039b2e66dd00`',
)

count = text.count('98 current-main commits behind')
if count < 1:
    raise SystemExit('Expected at least one current-main divergence phrase.')
text = text.replace(
    '98 current-main commits behind',
    '98 commits behind the audited repository state',
)

exact(
    'Re-audited current `main` at `3b6c6d3b120a17121fb1168c41bf039b2e66dd00`.',
    'Re-audited repository state through `3b6c6d3b120a17121fb1168c41bf039b2e66dd00`. PR #242 merged the resulting roadmap-only reconciliation as `35c26ba1bdda6aef46f562c3adebb69a28db95b0`; that documentation merge does not advance application, runtime, staging, or operational evidence.',
)

text = text.replace(
    'Refreshed on 2026-07-20 at current `main` `3b6c6d3b120a17121fb1168c41bf039b2e66dd00`',
    'Refreshed on 2026-07-20 for repository state through `3b6c6d3b120a17121fb1168c41bf039b2e66dd00`',
)
text = text.replace(
    'Audited current `main` `3b6c6d3b120a17121fb1168c41bf039b2e66dd00`',
    'Audited repository state through `3b6c6d3b120a17121fb1168c41bf039b2e66dd00`',
)

required = [
    '**Repository state audited through:** `3b6c6d3b120a17121fb1168c41bf039b2e66dd00`',
    'PR #242 merged the resulting roadmap-only reconciliation as `35c26ba1bdda6aef46f562c3adebb69a28db95b0`',
    '98 commits behind the audited repository state',
]
for marker in required:
    if marker not in text:
        raise SystemExit(f'Missing audit-seal marker: {marker}')
if 'Current repository audit head' in text or '98 current-main commits behind' in text:
    raise SystemExit('Recursive audit metadata remains.')

path.write_text(text, encoding='utf-8')
