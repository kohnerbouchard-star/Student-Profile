from pathlib import Path
import re

path = Path('docs/roadmaps/econovaria-beta-completion-roadmap-v1.md')
text = path.read_text(encoding='utf-8')

def exact(old, new):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected one occurrence of {old!r}; found {count}.')
    text = text.replace(old, new, 1)

def rx(pattern, replacement, label):
    global text
    text, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE)
    if count != 1:
        raise SystemExit(f'Expected one match for {label}; found {count}.')

def item(item_id, line):
    rx(rf'^- \[[ x]\] `{re.escape(item_id)}`.*$', line, item_id)

def row(label, line):
    rx(rf'^\| {re.escape(label)} \|.*$', line, f'table row {label}')

exact('**Last baseline audit:** 2026-07-19', '**Last baseline audit:** 2026-07-20')
exact('**Current audited main baseline:** `ece5876b0dfc79458afb5b5aaa9266b9884ecbcb`', '**Current audited main baseline:** `4e3c123c98c37a2b5d26a93e67bfb31c3b722925`')
row('Player runtime cutover and legacy source removal', '| Player runtime cutover and legacy source removal | `VERIFIED_COMPLETE` for repository code; operations remain `IN_PROGRESS` | PR #217 merged as `8a50a0880b8a24bd244e740dc5c81cb8a7452b0e`; PR #222 merged as `3b74340830da8db4fdabe2926915c3a32471b7c8`; connected isolated staging and live Worker retirement remain release gates |')
row('Production integration donor', '| Player runtime adapter | `VERIFIED_COMPLETE` | Cleaned PR #141 merged as `566d99fab5668cf42d6275ec8d12c580239a3137`; capability preflight and explicit `classroom-api` routing are authoritative |')
row('Inventory-redemption donor', '| Inventory redemption lifecycle | `VERIFIED_COMPLETE` at repository-integrated boundary | Backend PR #158, Admin review PR #177, and connected lifecycle PR #224 merged; PR #143 remains donor/reference only |')
row('Staging and release readiness', '| Staging and release readiness | `IN_PROGRESS` | Fail-closed preflight tooling merged through PR #169 as `ca642b1dfd6a2965612869e05b4fa1bd5840c437`; isolated environment evidence, rollback, restore, approval, and promotion remain open |')
exact('### 2026-07-18 repository reconciliation', '### Historical 2026-07-18 repository reconciliation (superseded)')
exact('### 2026-07-19 runtime reconciliation', '### Historical 2026-07-19 runtime reconciliation')

reconciliation = '''### 2026-07-20 full repository reconciliation

- Re-audited `main` at `4e3c123c98c37a2b5d26a93e67bfb31c3b722925` and all open PR ownership. PR #163 remains the sole open seed-content authority and remains draft; no replacement Backend, Player, lifecycle, or staging-preflight feature branch is active.
- PR #158 merged the authoritative Player Backend as `d403cf7baefeb3c1015c282cdbd748d2050e87ac`. PR #141 was cleaned and merged as the authoritative Player runtime adapter at `566d99fab5668cf42d6275ec8d12c580239a3137`; it is no longer donor-only. PR #143 remains donor/reference only.
- Later merged tranches completed connected logout (#182), Contract reads/acceptance/submission/lifecycle (#190, #201, #205), Store lifecycle and race guards (#207, #210, #211), notification inbox behavior (#216), Inventory Admin review and connected redemption (#177, #224), runtime cutover and legacy source removal (#217, #222), Banking reads (#213, #221), and game lifecycle controls (#229).
- The current Player capability manifest is schema `1`, manifest `2026-07-19.4`. It advertises reviewed Contracts, Store, Inventory redemption, Banking, notification, logout, market-read, asset-detail, and watchlist operations. It deliberately does not advertise market orders, Portfolio, Dashboard, or Profile; those connected-runtime items remain open.
- PR #169 merged the fail-closed staging-readiness validator as `ca642b1dfd6a2965612869e05b4fa1bd5840c437`. A green validator proves the gate works; it does not supply the still-missing isolated-staging, rollback, restore, approval, or production-cutover evidence.
- PR #163 now contains the complete 3,200-record definition-layer market universe, 240 activation-disabled candidates, ten arrival packages, 11/11 machine-readable core-content target groups, and four deterministic country simulation pilots. It remains non-deployable: importer, runtime activation, six country simulations, map evidence, calibration, rollback, and staging load remain blocked or incomplete.

'''
exact('### Current release condition\n', reconciliation + '### Current release condition\n')
exact('**Overall status:** `VERIFIED_COMPLETE`, with logout/runtime integration still active under Backend reconciliation.', '**Overall status:** `VERIFIED_COMPLETE` for merged identity, session, authorization, and logout boundaries; shared rate-limit runtime tuning and connected leak-evidence capture remain `IN_PROGRESS`.')
item('BETA-AUTH-001', '- [x] `BETA-AUTH-001` Merge authoritative player logout route. `VERIFIED_COMPLETE` through PR #158 merged as `d403cf7baefeb3c1015c282cdbd748d2050e87ac`; `POST /players/me/session/logout` is session-derived, private/no-store, game-scoped, and revokes the current Player session.')
item('BETA-AUTH-002', '- [x] `BETA-AUTH-002` Connect Player Terminal Logout to the reviewed host revocation lifecycle. `VERIFIED_COMPLETE` through PR #182 merged as `6085f5a4c72aec524ee9cb8a3026a43d9610eced`.')
item('BETA-AUTH-004', '- [x] `BETA-AUTH-004` Add final brute-force, replay, revoked-session, expired-session, and cross-game authorization matrix. `VERIFIED_COMPLETE` through PR #158 with the standard Player security and request-scope suites on the final merged head.')
item('BETA-AUTH-005', '- [ ] `BETA-AUTH-005` Add shared rate limiting by IP, identity, game, and action. `IN_PROGRESS`: the atomic HMAC-keyed foundation, reviewed post-auth dispatch, and credential-blind login pre-auth enforcement merged through PR #158. Staging proxy/HMAC configuration, SQL concurrency evidence, shared-NAT tuning, telemetry, cleanup, and connected runtime probes remain open.')
item('BETA-AUTH-006', '- [ ] `BETA-AUTH-006` Verify no credentials, token hashes, session tokens, or internal UUIDs appear in browser output, logs, fixtures, artifacts, or errors. `IN_PROGRESS`: Backend DTO privacy, browser-payload, fixture, rendered-output, and artifact regression coverage merged through PRs #158, #141, and #222. Connected staging network/log/trace and screenshot evidence remains open.')
caps = {
'BETA-CAP-001': '- [x] `BETA-CAP-001` Publish authenticated `GET /players/me/capabilities`. `VERIFIED_COMPLETE` through PR #158 merged as `d403cf7baefeb3c1015c282cdbd748d2050e87ac`.',
'BETA-CAP-002': '- [x] `BETA-CAP-002` Version the manifest schema and capability mapping independently. `VERIFIED_COMPLETE`; current schema is `1` and current manifest is `2026-07-19.4`.',
'BETA-CAP-003': '- [x] `BETA-CAP-003` Advertise only reviewed, implemented Backend operations and represent unsupported operations as unavailable. `VERIFIED_COMPLETE`; the reviewed endpoint registry drives route/action flags and market orders, Portfolio, Dashboard, and Profile remain false or absent.',
'BETA-CAP-004': '- [x] `BETA-CAP-004` Keep the manifest private/no-store, session-scoped, game-isolated, and free of internal UUIDs. `VERIFIED_COMPLETE` through merged request-scope and capability-contract coverage.',
'BETA-CAP-005': '- [x] `BETA-CAP-005` Add exact route, method, malformed-path, unsupported-method, expired, revoked, wrong-game, UUID-injection, and response-contract tests. `VERIFIED_COMPLETE` through the merged Player capability and security suites.',
'BETA-CAP-006': '- [x] `BETA-CAP-006` Reconcile the manifest after every later Backend tranche and before runtime adapter execution. `VERIFIED_COMPLETE`; current manifest `2026-07-19.4` includes only the merged reviewed endpoint set.',
}
for key, value in caps.items(): item(key, value)
path.write_text(text, encoding='utf-8')
