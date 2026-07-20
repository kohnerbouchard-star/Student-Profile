from pathlib import Path
import re
path = Path('docs/roadmaps/econovaria-beta-completion-roadmap-v1.md')
text = path.read_text(encoding='utf-8')

def section(pattern, replacement, label):
    global text
    text, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE | re.DOTALL)
    if count != 1: raise SystemExit(f'Expected one section: {label}')

def exact(old, new):
    global text
    if text.count(old) != 1: raise SystemExit(f'Expected one occurrence: {old}')
    text = text.replace(old, new, 1)

phase1 = '''## 17. Phase 1 — Authoritative Player Backend (completed)

**Goal:** Make the authenticated Player API authoritative and mergeable.

PR #158 merged as `d403cf7baefeb3c1015c282cdbd748d2050e87ac`. The historical implementation sequence covered notifications, logout, capability manifest, Contract acceptance, Inventory redemption, security/privacy, migration replay/lint, runtime contracts, and full verification.

Required gates:

- [x] Backend Typecheck.
- [x] Backend tests and complete smoke chain.
- [x] Database Replay twice from zero.
- [x] Database lint.
- [x] Repository Quality.
- [x] Admin API Check.
- [x] Player Terminal contract verification where shared contracts were affected.
- [x] Wrong-role, wrong-game, wrong-player, expired, revoked, replay, idempotency, and UUID-injection tests.
- [x] No production deployment occurred before merge; isolated-staging promotion remains governed by Phase 5.

**Exit gate:** Met. PR #158 is merged, donor work is no longer required for Backend authority, and the current implemented endpoint set is represented by capability manifest `2026-07-19.4`.

'''
section(r'## 17\. Phase 1 — Finish Backend PR #158\n\n.*?(?=---\n\n## 18\.)', phase1, 'Phase 1')

phase2 = '''## 18. Phase 2 — Connect the Player Terminal

**Goal:** Convert the hardened standalone Player Terminal into the authoritative live client.

- [x] Install adapter before API client construction.
- [x] Bind explicitly to `classroom-api`.
- [x] Consume normalized host Player session.
- [x] Validate capability manifest schema and version.
- [x] Reconcile every advertised endpoint key with a reviewed frontend route.
- [ ] Connect all beta reads. `IN_PROGRESS`: Dashboard, Portfolio, and Profile are not advertised by manifest `2026-07-19.4`.
- [ ] Connect all beta writes. `IN_PROGRESS`: market-order execution is not advertised; reviewed Store, Contract, watchlist, notification, redemption, and logout writes are connected.
- [x] Connect logout through the host revocation lifecycle.
- [x] Add fail-closed integration mismatch states.
- [x] Run repository-connected browser tests.
- [x] Run mobile and desktop tests.
- [x] Verify preview isolation.
- [x] Verify no speculative or `/api/player` fallback requests.
- [ ] Run isolated-staging connected bootstrap, retry, and network-evidence capture.

**Exit gate:** Open. A real authenticated Player must still complete the full base loop in isolated staging without preview data, including the currently unavailable market-order and remaining read surfaces.

'''
section(r'## 18\. Phase 2 — Connect the Player Terminal\n\n.*?(?=---\n\n## 19\.)', phase2, 'Phase 2')

exact('- [ ] Contract acceptance.', '- [x] Contract acceptance. Repository-integrated lifecycle verified through PRs #190, #201, and #205.')
exact('- [ ] Inventory redemption.', '- [x] Inventory redemption. Player/Admin shared lifecycle verified through PRs #158, #177, and #224.')
exact('- [ ] Notification inbox and cutscenes.', '- [x] Notification inbox, unread count, pagination, mark-read, and player-safe categories.\n- [ ] Story cutscene modal and purpose-built payload delivery.')
exact('- [ ] One complete Store purchase/redemption chain.', '- [x] One complete Store purchase and Inventory redemption chain at the repository-integrated boundary through PRs #207, #210, #211, and #224.')
path.write_text(text, encoding='utf-8')
