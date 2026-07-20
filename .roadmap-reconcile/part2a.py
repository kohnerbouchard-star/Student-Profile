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

exact('**Overall status:** `VERIFIED_COMPLETE` except authoritative Contract acceptance and final connected runtime verification.', '**Overall status:** `VERIFIED_COMPLETE` for the repository-integrated Contract lifecycle; tutorial content and isolated-staging concurrency evidence remain open.')
item('BETA-CONTRACT-001', '- [x] `BETA-CONTRACT-001` Implement atomic `POST /players/me/contracts/:contractKey/accept`. `VERIFIED_COMPLETE` through PR #158 merged as `d403cf7baefeb3c1015c282cdbd748d2050e87ac`.')
item('BETA-CONTRACT-002', '- [x] `BETA-CONTRACT-002` Reject acceptance for unavailable, expired, non-targeted, already-completed, or locked Contracts while replaying the reviewed desired-state success. `VERIFIED_COMPLETE` through PR #158.')
item('BETA-CONTRACT-003', '- [ ] `BETA-CONTRACT-003` Make acceptance retry-idempotent. `IN_PROGRESS`: scoped uniqueness, row locking, atomic acceptance, and `alreadyAccepted` replay merged through PR #158; isolated-database concurrency and connected staging evidence remain open.')
item('BETA-CONTRACT-004', '- [x] `BETA-CONTRACT-004` Connect Player Terminal accept action to the authoritative public-key route. `VERIFIED_COMPLETE` through PR #190 merged as `edabec186da3e751a63a25da239ff43f18cf83a3`.')
item('BETA-CONTRACT-005', '- [x] `BETA-CONTRACT-005` Verify full connected flow: available → accept → submit → revision → resubmit → approve → reward. `VERIFIED_COMPLETE` at the repository-integrated boundary through PRs #201 and #205; PR #205 merged as `83534ac261b54bc6d96fa599414ba73cc2cd6940` with idempotent reward replay evidence.')
item('BETA-STORE-001', '- [x] `BETA-STORE-001` Verify connected catalog, quote, purchase, receipt, ledger, and inventory flow. `VERIFIED_COMPLETE` at the code-integrated and clean-replay boundary through PR #207 merged as `520aabc671c1225147907034d1893de3833fca7a`.')
item('BETA-STORE-002', '- [x] `BETA-STORE-002` Verify insufficient funds, insufficient stock, expired quote, duplicate request, game pause, ended-game behavior, and settlement races. `VERIFIED_COMPLETE` through PR #210 merged as `71cf70da537b38a8e1a03b7cc8034600d2d94eba` plus atomic race guard PR #211 merged as `0c74d8bd7312f231bc8e4dfcd6b869b73c6d2303`.')

exact('## 11. Inventory, item use, equipment, materials, and redemption\n\n**Overall status:** `IN_PROGRESS`.', '## 11. Inventory, item use, equipment, materials, and redemption\n\n**Overall status:** `VERIFIED_COMPLETE` for authenticated reads and the repository-integrated redemption lifecycle; the broader automated item-effect system remains `PLANNED`.')
items = {
'BETA-INV-001': '- [x] `BETA-INV-001` Merge authenticated `GET /players/me/inventory`. `VERIFIED_COMPLETE` through PR #158 merged as `d403cf7baefeb3c1015c282cdbd748d2050e87ac`.',
'BETA-INV-002': '- [x] `BETA-INV-002` Preserve bounded reads, public item keys, no per-item query loops, and explicit empty/unavailable states. `VERIFIED_COMPLETE` through PR #158 and the connected adapter validation merged with PR #141.',
'BETA-INV-003': '- [x] `BETA-INV-003` Define redemption state machine. `VERIFIED_COMPLETE` through PR #158 and connected lifecycle proof in PR #224.',
'BETA-INV-004': '- [x] `BETA-INV-004` Add migration for redemption request, transition, and audit history. `VERIFIED_COMPLETE` through merged migration `20260718113000_add_inventory_redemption_player_workflow_v1.sql` and repeated Database Replay.',
'BETA-INV-005': '- [x] `BETA-INV-005` Add atomic request/reserve RPC. `VERIFIED_COMPLETE`; the service-role RPC is row-locked, scoped, reservation-safe, and idempotent.',
'BETA-INV-006': '- [x] `BETA-INV-006` Add Player redemption request route. `VERIFIED_COMPLETE` as `POST /players/me/inventory/:itemId/redemptions` with public item keys and session-derived ownership.',
'BETA-INV-007': '- [x] `BETA-INV-007` Add Player redemption history/status read. `VERIFIED_COMPLETE` for collection and public `red_` request-ID reads.',
'BETA-INV-008': '- [x] `BETA-INV-008` Add Admin pending and historical queue. `VERIFIED_COMPLETE` through PR #177 merged as `00ffc841cb7072cb98610e23d20eb4d0cfd60cf8`.',
'BETA-INV-009': '- [x] `BETA-INV-009` Add approve action. `VERIFIED_COMPLETE` through the merged atomic staff-review boundary and PR #224 connected replay evidence.',
'BETA-INV-010': '- [x] `BETA-INV-010` Add reject-with-reason action. `VERIFIED_COMPLETE`; rejection requires a bounded reason and releases the reservation exactly once.',
'BETA-INV-011': '- [x] `BETA-INV-011` Add fulfill action. `VERIFIED_COMPLETE`; fulfillment releases the reservation, consumes owned quantity once, and appends typed evidence atomically.',
'BETA-INV-012': '- [x] `BETA-INV-012` Prevent invalid transitions and repeated consumption. `VERIFIED_COMPLETE` through row locks, transition validation, staff idempotency, uniqueness guards, and PR #224 negative-state evidence.',
'BETA-INV-013': '- [x] `BETA-INV-013` Preserve committed success if refresh fails. `VERIFIED_COMPLETE` through PR #224 merged as `6f9b2f883dd5cba61e059fecf287e5c7a569d7ff`.',
'BETA-INV-014': '- [x] `BETA-INV-014` Verify full connected Store → Inventory → Redemption lifecycle. `VERIFIED_COMPLETE` at the shared-state Player/Admin boundary through PR #224 with exact reservation/consumption accounting, UUID privacy, replay, rejection, and wrong-game denial.',
}
for key, line in items.items(): item(key, line)
path.write_text(text, encoding='utf-8')
