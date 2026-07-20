from pathlib import Path
import re
path = Path('docs/roadmaps/econovaria-beta-completion-roadmap-v1.md')
text = path.read_text(encoding='utf-8')

def exact(old, new):
    global text
    if text.count(old) != 1: raise SystemExit(f'Expected one occurrence: {old}')
    text = text.replace(old, new, 1)

def item(key, line):
    global text
    text, count = re.subn(rf'^- \[[ x]\] `{re.escape(key)}`.*$', line, text, count=1, flags=re.MULTILINE)
    if count != 1: raise SystemExit(f'Expected one item: {key}')

exact('**Overall status:** `VERIFIED_COMPLETE` for common-equity market orders and portfolio accounting; broader financial universe remains planned.', '**Overall status:** `VERIFIED_COMPLETE` for the Backend market engine and authenticated market reads/watchlist; connected Player market orders, Portfolio, scheduled staging ticks, and broader financial instruments remain `IN_PROGRESS` or `PLANNED`.')
item('BETA-MKT-001', '- [x] `BETA-MKT-001` Merge bounded market collection and asset-detail routes. `VERIFIED_COMPLETE` through PR #158 merged as `d403cf7baefeb3c1015c282cdbd748d2050e87ac`.')
item('BETA-MKT-002', '- [x] `BETA-MKT-002` Merge watchlist list/add/remove. `VERIFIED_COMPLETE` through PR #158; current manifest `2026-07-19.4` advertises the reviewed GET/PUT/DELETE watchlist operations.')
item('BETA-MKT-004', '- [ ] `BETA-MKT-004` Publish capability manifest for market reads, watchlist, and market orders. `IN_PROGRESS`: manifest `2026-07-19.4` truthfully advertises market reads, asset detail, and watchlist; `marketOrder` remains false until the public-ticker order boundary is reconciled under `BETA-MKT-003`.')
item('BETA-MKT-005', '- [ ] `BETA-MKT-005` Connect Player Terminal to authoritative market and portfolio routes. `IN_PROGRESS`: market reads, asset detail, and watchlist are connected; Portfolio and market-order execution are not advertised by the current manifest.')

for key, line in {
'BETA-NOTIF-001': '- [x] `BETA-NOTIF-001` Merge notification list. `VERIFIED_COMPLETE` through PR #158 merged as `d403cf7baefeb3c1015c282cdbd748d2050e87ac`.',
'BETA-NOTIF-002': '- [x] `BETA-NOTIF-002` Merge mark-read. `VERIFIED_COMPLETE` through PR #158; current manifest advertises `POST /players/me/notifications/read`.',
'BETA-NOTIF-003': '- [x] `BETA-NOTIF-003` Add unread count and pagination to Player Terminal. `VERIFIED_COMPLETE` through PR #216 merged as `3a8e8e045aa6d2c53bc79061447dfa8800e95264`.',
'BETA-NOTIF-004': '- [x] `BETA-NOTIF-004` Render player-safe notification categories. `VERIFIED_COMPLETE` through PR #216 with bounded category normalization and no generic raw-payload rendering.',
}.items(): item(key, line)

exact('**Overall status:** `VERIFIED_COMPLETE` as a hardened standalone frontend; `BLOCKED` for production connection until Backend PR #158 is authoritative.', '**Overall status:** `VERIFIED_COMPLETE` for the hardened frontend, authoritative runtime adapter, capability preflight, and manifest-advertised routes; full beta read/write coverage and isolated-staging bootstrap remain `IN_PROGRESS`.')
players = {
'BETA-PLAYER-001': '- [x] `BETA-PLAYER-001` Install the Student-Profile adapter before `PlayerApi` construction. `VERIFIED_COMPLETE` through cleaned PR #141 merged as `566d99fab5668cf42d6275ec8d12c580239a3137`.',
'BETA-PLAYER-002': '- [x] `BETA-PLAYER-002` Select `/functions/v1/classroom-api` explicitly. `VERIFIED_COMPLETE` through PR #141.',
'BETA-PLAYER-003': '- [x] `BETA-PLAYER-003` Prohibit `/api/player` fallback in Student-Profile connected mode. `VERIFIED_COMPLETE` through PR #141 and the runtime-cutover ratchets merged in PRs #217 and #222.',
'BETA-PLAYER-004': '- [x] `BETA-PLAYER-004` Consume authoritative capability manifest and version. `VERIFIED_COMPLETE`; startup consumes schema `1`, manifest `2026-07-19.4`.',
'BETA-PLAYER-005': '- [x] `BETA-PLAYER-005` Validate advertised capability-to-adapter coverage at startup. `VERIFIED_COMPLETE` through PR #141 capability-contract validation.',
'BETA-PLAYER-006': '- [x] `BETA-PLAYER-006` Fail closed before execution when capability and route mappings disagree. `VERIFIED_COMPLETE` through PR #141.',
'BETA-PLAYER-007': '- [x] `BETA-PLAYER-007` Preserve approved product surfaces with truthful Integration Pending or Unavailable states. `VERIFIED_COMPLETE` through PR #180 merged as `6a30e48d23f5ecb8b4e69794823863a49ce7254a`.',
'BETA-PLAYER-008': '- [ ] `BETA-PLAYER-008` Connect Dashboard, World, News, Market, Portfolio, Store, Contracts, Inventory, Banking, Notifications, and Profile. `IN_PROGRESS`: manifest-advertised World, News, Market reads, Store, Contracts, Inventory, Banking, and Notifications are connected; Dashboard, Portfolio, and Profile are not advertised by manifest `2026-07-19.4`.',
'BETA-PLAYER-009': '- [ ] `BETA-PLAYER-009` Connect Store, Contract, Market, watchlist, notification, redemption, and logout writes. `IN_PROGRESS`: Store, Contract, watchlist, notification-read, redemption, and logout writes are connected; `marketOrder` remains unavailable.',
'BETA-PLAYER-010': '- [ ] `BETA-PLAYER-010` Verify desktop and mobile connected bootstrap in isolated staging. Repository-connected desktop/mobile fixtures pass; environment-backed staging evidence remains open.',
'BETA-PLAYER-011': '- [x] `BETA-PLAYER-011` Verify session replacement abort and stale-result rejection. `VERIFIED_COMPLETE` through the Player Terminal verification chain retained by PR #141 and later runtime-cutover merges.',
'BETA-PLAYER-012': '- [x] `BETA-PLAYER-012` Verify no ownership UUID appears in URLs, payloads, models, fixtures, or rendered output. `VERIFIED_COMPLETE` for repository and Chromium evidence through PRs #158, #141, and #224; connected logs/traces remain separately tracked under `BETA-AUTH-006`.',
'BETA-PLAYER-013': '- [ ] `BETA-PLAYER-013` Verify committed-success behavior for every economic write. `IN_PROGRESS`: Store, Contract, and Inventory redemption committed-success paths are covered; market-order execution and isolated-staging ambiguity evidence remain open.',
'BETA-PLAYER-014': '- [ ] `BETA-PLAYER-014` Verify offline, timeout, ambiguous write, 429, and session-expiry recovery. `IN_PROGRESS`: frontend recovery contracts and safe expiry exit are merged; connected isolated-staging retry/rate-limit evidence remains open.',
}
for key, line in players.items(): item(key, line)
path.write_text(text, encoding='utf-8')
