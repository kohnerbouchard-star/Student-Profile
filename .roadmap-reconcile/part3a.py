from pathlib import Path
import re
path = Path('docs/roadmaps/econovaria-beta-completion-roadmap-v1.md')
text = path.read_text(encoding='utf-8')

def item(key, line):
    global text
    text, count = re.subn(rf'^- \[[ x]\] `{re.escape(key)}`.*$', line, text, count=1, flags=re.MULTILINE)
    if count != 1: raise SystemExit(f'Expected one item: {key}')

def section(pattern, replacement, label):
    global text
    text, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE | re.DOTALL)
    if count != 1: raise SystemExit(f'Expected one section: {label}')

lines = {
'P0-001': '- [x] `P0-001` Re-audit current `main`, active branches, open PRs, and deployed-runtime evidence boundaries. Completed on 2026-07-20 at `4e3c123c98c37a2b5d26a93e67bfb31c3b722925`.',
'P0-002': '- [x] `P0-002` Update this roadmap baseline SHA and active authority table. Completed in the 2026-07-20 full reconciliation.',
'P0-003': '- [x] `P0-003` Keep PR #158 as the only Backend reconciliation authority through merge. Completed: PR #158 merged as `d403cf7baefeb3c1015c282cdbd748d2050e87ac`; no replacement Backend reconciliation PR is active.',
'P0-004': '- [x] `P0-004` Keep PR #163 as the current seed-content foundation branch. Verified: it remains the sole open seed-content authority and remains draft.',
'P0-005': '- [x] `P0-005` Reconcile donor work intentionally. PR #143 remains donor/reference only; PR #141 was cleaned, bounded, verified, and merged as the authoritative Player runtime adapter.',
'P0-006': '- [ ] `P0-006` Close or archive superseded branch refs after their useful work is accounted for and after confirming no other active chat owns them.',
'P0-007': '- [x] `P0-007` Add and maintain a capability ownership registry.',
'P0-008': '- [x] `P0-008` Add a reverse-chronological change ledger to this document after every merged tranche.',
'P0-009': '- [x] `P0-009` Require every future implementation prompt to reference this exact authoritative path.',
'P0-010': '- [x] `P0-010` Check branch and PR ownership before creating a new branch.',
}
for key, line in lines.items(): item(key, line)

ownership = '''### Capability ownership registry

| Capability | Authority | Status | Collision rule |
|---|---|---|---|
| Authenticated Player Backend | PR #158 / merge `d403cf7baefeb3c1015c282cdbd748d2050e87ac` | `VERIFIED_COMPLETE` | No replacement Backend reconciliation branch; later work must use a narrowly owned roadmap item. |
| Seed-content definition, calibration, and executable-content preparation | PR #163 / `agent/seed-content-foundation-v1` | `IN_PROGRESS` | Sole active seed authority; do not create another seed-content branch or merge/activate before its gates close. |
| Player runtime adapter and capability preflight | PR #141 / merge `566d99fab5668cf42d6275ec8d12c580239a3137` | `VERIFIED_COMPLETE` | Preserve explicit `classroom-api` routing and fail-closed manifest validation. |
| Player runtime cutover and legacy source retirement | PRs #217 and #222 | repository code `VERIFIED_COMPLETE`; operations `IN_PROGRESS` | Do not restore the legacy frontend or Cloudflare browser transport; retire live Worker only through approved operational change control. |
| Inventory redemption lifecycle | PRs #158, #177, and #224 | `VERIFIED_COMPLETE` at repository-integrated boundary | Extend the existing public-key, row-locked, idempotent lifecycle; PR #143 remains reference only. |
| Staging readiness validation | PR #169 / merge `ca642b1dfd6a2965612869e05b4fa1bd5840c437` | tooling `VERIFIED_COMPLETE`; external evidence `IN_PROGRESS` | Do not claim staging readiness from validator tests alone; supply current environment, migration, artifact, rollback, restore, and approval evidence. |
| Banking and economic-ledger invariants | PRs #213, #221, and #230 | reads `VERIFIED_COMPLETE`; staff-adjustment staging application `IN_PROGRESS` | Apply and verify the merged migration in isolated staging before runtime promotion. |
| Admin game lifecycle controls | PR #229 / merge `ece5876b0dfc79458afb5b5aaa9266b9884ecbcb` | `VERIFIED_COMPLETE` | Preserve canonical lifecycle states, mutation gating, idempotency, and session/join-code revocation semantics. |
| Accepted Admin source preservation | `frontend/admin-terminal-source-v1` | retained exception | Preserve per `CONTRIBUTING.md`; do not treat as active feature authority. |

'''
section(r'### Capability ownership registry\n\n.*?(?=\*\*Exit gate:\*\*)', ownership, 'ownership registry')
path.write_text(text, encoding='utf-8')
