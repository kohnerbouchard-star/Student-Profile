from pathlib import Path
import re
path = Path('docs/roadmaps/econovaria-beta-completion-roadmap-v1.md')
text = path.read_text(encoding='utf-8')

def item(key, line):
    global text
    text, count = re.subn(rf'^- \[[ x]\] `{re.escape(key)}`.*$', line, text, count=1, flags=re.MULTILINE)
    if count != 1: raise SystemExit(f'Expected one item: {key}')

item('OPS-RATE-001', '- [ ] `OPS-RATE-001` Add rate limiting. `IN_PROGRESS`: shared HMAC-keyed storage, atomic consumption, reviewed Player post-auth dispatch, and credential-blind login pre-auth enforcement merged through PR #158. Runtime proxy/HMAC configuration, SQL concurrency evidence, shared-NAT tuning, cleanup, telemetry, and staging probes remain open.')
pattern = r'PR #169 / branch `agent/staging-readiness-preflight-v1` provides an `IMPLEMENTED_NOT_MERGED` fail-closed evidence validator at `7d3c62c377c57bd5e90cf59336fbea58d7bc55db`\..*?external evidence\.'
replacement = 'PR #169 merged the fail-closed staging-readiness validator, protected workflow, template, and operator runbook as `ca642b1dfd6a2965612869e05b4fa1bd5840c437`. The tooling supports `OPS-STAGE-001` through `OPS-STAGE-007`, `OPS-ARTIFACT-001`/`002`, `OPS-STAGE-004`, and `OPS-RESTORE-001`/`002`, but does not claim the still-missing external environment, migration-ledger, artifact, rollback, restore, approval, or promotion evidence.'
text, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE | re.DOTALL)
if count != 1: raise SystemExit('Expected current PR #169 paragraph.')

ledger = '''### 2026-07-20 — Full merged-repository and roadmap reconciliation

- Audited `main` at `4e3c123c98c37a2b5d26a93e67bfb31c3b722925`, all open PRs, merged PR metadata, current Backend tests, Player runtime adapter, capability manifest `2026-07-19.4`, and the current PR #163 seed evidence boundary.
- Reclassified stale PR #158, #141, #169, Contract, Store, Inventory, Market-read/watchlist, notification, Player adapter, Phase 0, Phase 1, and Phase 2 statements against merged authority. Historical ledger entries were preserved as historical evidence rather than rewritten.
- Marked only repository-proven items complete. Kept shared rate-limit runtime proof, connected leak evidence, Contract concurrency, market orders/Portfolio, full Player read/write coverage, isolated-staging bootstrap, Banking migration application, seed runtime activation, map verification, six country simulations, release operations, and beta E2E open.
- Confirmed PR #163 remains the sole open seed authority and remains draft/non-deployable. No seed code, migration, runtime, deployment, or content activation changed in this reconciliation.
- Roadmap-only branch: `agent/roadmap-full-reconciliation-v1`. No application source, migration, route, RPC, credential, environment, or runtime was modified.

'''
marker = 'Append entries in reverse chronological order.\n\n'
if text.count(marker) != 1: raise SystemExit('Expected change ledger marker.')
text = text.replace(marker, marker + ledger, 1)

current = text.split('## 33. Change ledger', 1)[0]
for token in [
    'BLOCKED` for production connection until Backend PR #158',
    'Production-integration donor | `IMPLEMENTED_NOT_MERGED`; donor only | PR #141',
    'PR #169, branch `agent/staging-readiness-preflight-v1`',
]:
    if token in current: raise SystemExit(f'Stale current-state token remains: {token}')

complete = [
'BETA-AUTH-001','BETA-AUTH-002','BETA-AUTH-004',
'BETA-CAP-001','BETA-CAP-002','BETA-CAP-003','BETA-CAP-004','BETA-CAP-005','BETA-CAP-006',
'BETA-CONTRACT-001','BETA-CONTRACT-002','BETA-CONTRACT-004','BETA-CONTRACT-005',
'BETA-STORE-001','BETA-STORE-002',
*[f'BETA-INV-{n:03d}' for n in range(1,15)],
'BETA-MKT-001','BETA-MKT-002',
'BETA-NOTIF-001','BETA-NOTIF-002','BETA-NOTIF-003','BETA-NOTIF-004',
*[f'BETA-PLAYER-{n:03d}' for n in range(1,8)],'BETA-PLAYER-011','BETA-PLAYER-012']
for key in complete:
    if not re.search(rf'^- \[x\] `{re.escape(key)}`', text, flags=re.MULTILINE):
        raise SystemExit(f'Expected complete item: {key}')
open_items = ['BETA-AUTH-005','BETA-AUTH-006','BETA-CONTRACT-003','BETA-MKT-003','BETA-MKT-004','BETA-MKT-005','BETA-PLAYER-008','BETA-PLAYER-009','BETA-PLAYER-010','BETA-PLAYER-013','BETA-PLAYER-014','OPS-RATE-001','SEED-PREFLIGHT-001']
for key in open_items:
    if not re.search(rf'^- \[ \] `{re.escape(key)}`', text, flags=re.MULTILINE):
        raise SystemExit(f'Expected open item: {key}')
path.write_text(text, encoding='utf-8')
