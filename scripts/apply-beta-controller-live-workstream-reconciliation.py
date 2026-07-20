from pathlib import Path

ROADMAP = Path("docs/roadmaps/econovaria-beta-completion-roadmap-v1.md")
text = ROADMAP.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    text = text.replace(old, new, 1)


replace_once(
    "| Player story-notification delivery | `IN_PROGRESS`; not merge-ready | PR #244, branch `agent/player-story-delivery-v1`; owns `BETA-NOTIF-005` and `BETA-NOTIF-006`; branch is 32 commits behind audited `main`, the permanent diff still contains patch carriers rather than application source, and the application workflow fails |",
    "| Player story-notification delivery | `IN_PROGRESS`; not merge-ready | PR #244, branch `agent/player-story-delivery-v1`; owns `BETA-NOTIF-005` and `BETA-NOTIF-006`; synchronized with audited `main`, but the permanent diff still contains only temporary patch carriers and all visible final-head workflows require action |",
    "story snapshot",
)
replace_once(
    "| Staging and release readiness | `IN_PROGRESS` | Fail-closed preflight tooling merged through PR #169 as `ca642b1dfd6a2965612869e05b4fa1bd5840c437`; Chat 2 now owns bounded release-platform PR #280, while distinct staging identities, migration reconciliation, connected smoke, approval, rollback, restore, and promotion evidence remain open |",
    "| Staging and release readiness | `IN_PROGRESS` | Fail-closed preflight tooling merged through PR #169 as `ca642b1dfd6a2965612869e05b4fa1bd5840c437`; Chat 2 owns 22-file immutable release-platform PR #280 at `849f320064c3ede18e3a5e3a5b81d9741c3ec020` with its visible release, replay, quality, supply-chain, preflight, and incident checks passing while final required CI completes; distinct staging identities, deployment, connected smoke, approval, rollback, restore, and promotion evidence remain open |",
    "release snapshot",
)
replace_once(
    "| Live migration reconciliation | `PLANNED`; branch reserved | Chat 3, branch `agent/live-migration-reconciliation-v1`; no PR or implementation evidence yet |",
    "| Live migration reconciliation | `IMPLEMENTED_NOT_MERGED`; evidence incomplete | Chat 3, PR #282, branch `agent/live-migration-reconciliation-v1`; seven-file read-only migration/schema/metadata reconciliation tooling with Repository Quality, Supply Chain Security, and Staging Readiness Preflight passing; clean replay, connected live comparison, isolated-staging application, and retry evidence remain open |",
    "migration snapshot",
)
replace_once(
    "| Live legacy-runtime retirement | `PLANNED`; branch reserved | Chat 4, branch `agent/legacy-runtime-retirement-v1`; no PR or production-traffic evidence yet |",
    "| Live legacy-runtime retirement | `IMPLEMENTED_NOT_MERGED`; evidence incomplete | Chat 4, PR #283, branch `agent/legacy-runtime-retirement-v1`; repository route/transport audit controls exist, but current traffic, connected auth probes, credential rotation, owner-approved shutdown, and rollback evidence remain open |",
    "legacy snapshot",
)
replace_once(
    "| Beta security and rate-limit closure | `PLANNED`; branch reserved | Chat 5, branch `agent/beta-security-rate-limit-v1`; branch currently equals audited `main` |",
    "| Beta security and rate-limit closure | `IN_PROGRESS`; not merge-ready | Chat 5, PR #284, branch `agent/beta-security-rate-limit-v1`; rate-limit keying, attendance abuse controls, tests, staging probe, and forward migration `20260720150000_harden_request_rate_limit_operations_v2.sql` exist, but multiple required workflows were cancelled and proxy/HMAC/concurrency/NAT/privacy staging evidence remains open |",
    "security snapshot",
)
replace_once(
    "| Backup and restore rehearsal | `PLANNED`; branch reserved | Chat 7, branch `agent/beta-backup-restore-v1`; branch currently equals audited `main` |",
    "| Backup and restore rehearsal | `IMPLEMENTED_NOT_MERGED`; rehearsal not executed | Chat 7, PR #285, branch `agent/beta-backup-restore-v1`; runbooks, retention/manifest contracts, evidence templates, and a contract workflow exist; referenced automation, distinct synthetic target, restore execution, integrity, connected smoke, RPO, and RTO evidence remain open |",
    "backup snapshot",
)
replace_once(
    "| Final Phase 6 E2E and pilot | `BLOCKED`; branch reserved | Chat 10, branch `agent/beta-e2e-pilot-v1`; blocked on release, migration, story, seed, security, observability, and restore gates |",
    "| Final Phase 6 E2E and pilot | `BLOCKED`; harness `IMPLEMENTED_NOT_MERGED` | Chat 10, PR #286, branch `agent/beta-e2e-pilot-v1`; fail-closed 52-scenario orchestration and evidence contracts exist, but no scenario is complete until release, migration, security, story, seed, observability, and restore dependencies are merged and deployed to isolated staging |",
    "e2e snapshot",
)

replace_once(
    "- [ ] `BETA-AUTH-005` Add shared rate limiting by IP, identity, game, and action. `IN_PROGRESS`: the atomic HMAC-keyed foundation, reviewed post-auth dispatch, and credential-blind login pre-auth enforcement merged through PR #158. Staging proxy/HMAC configuration, SQL concurrency evidence, shared-NAT tuning, telemetry, cleanup, and connected runtime probes remain open.",
    "- [ ] `BETA-AUTH-005` Add shared rate limiting by IP, identity, game, and action. `IN_PROGRESS`: the atomic HMAC-keyed foundation, reviewed post-auth dispatch, and credential-blind login pre-auth enforcement merged through PR #158. PR #284 adds hardened operation keying, attendance abuse integration, focused tests, staging probes, and forward migration `20260720150000_harden_request_rate_limit_operations_v2.sql`, but is unmerged with cancelled required workflows. Staging proxy/HMAC configuration, SQL concurrency evidence, shared-NAT tuning, telemetry, cleanup, and connected runtime probes remain open.",
    "BETA-AUTH-005",
)
replace_once(
    "- [ ] `BETA-AUTH-006` Verify no credentials, token hashes, session tokens, or internal UUIDs appear in browser output, logs, fixtures, artifacts, or errors. `IN_PROGRESS`: Backend DTO privacy, browser-payload, fixture, rendered-output, and artifact regression coverage merged through PRs #158, #141, and #222. Connected staging network/log/trace and screenshot evidence remains open.",
    "- [ ] `BETA-AUTH-006` Verify no credentials, token hashes, session tokens, or internal UUIDs appear in browser output, logs, fixtures, artifacts, or errors. `IN_PROGRESS`: Backend DTO privacy, browser-payload, fixture, rendered-output, and artifact regression coverage merged through PRs #158, #141, and #222; PR #284 is the sole active closure authority. Connected staging network/log/trace, screenshot, and reviewed proxy evidence remain open.",
    "BETA-AUTH-006",
)

replace_once(
    "**Goal:** Prove the complete classroom simulation with bounded users.\n\nRequired scenarios:",
    "**Goal:** Prove the complete classroom simulation with bounded users.\n\nPR #286 on `agent/beta-e2e-pilot-v1` contains a fail-closed 52-scenario harness, synthetic fixture contracts, defect reporting, redaction, and evidence digests. Its own preflight record is correctly `BLOCKED_BY_ENVIRONMENT`; harness coverage is not staging or product acceptance evidence, and no scenario below is complete.\n\nRequired scenarios:",
    "Phase 6 harness note",
)
replace_once(
    "- [ ] Retire all unknown legacy backend traffic. `IN_PROGRESS`: repository Player transport/source retirement is complete, while live Worker and legacy-function traffic/disposition evidence remains open.",
    "- [ ] Retire all unknown legacy backend traffic. `IN_PROGRESS`: repository Player transport/source retirement is complete; PR #283 adds route/transport allowlisting and audit controls, while live Worker traffic, connected auth, credential rotation, approved shutdown, and rollback evidence remain open.",
    "legacy architecture line",
)
replace_once(
    "- [ ] Maintain an immutable release and change-control process. `IN_PROGRESS`: branch/PR gates, repeated database replay, a fail-closed staging manifest contract, and protected workflow tooling exist; immutable artifact promotion, approvals, rollback, restore, and production evidence remain open.",
    "- [ ] Maintain an immutable release and change-control process. `IN_PROGRESS`: branch/PR gates, repeated database replay, fail-closed staging validation, and PR #280 immutable artifact/promotion tooling exist; distinct environment identities, connected deployment, approvals, rollback, restore, and production evidence remain open.",
    "immutable release line",
)

replace_once(
    "- Current capability ownership remains unique: seed content #163 and story delivery #244 are active beta capability authorities; release-platform PR #280 is active beta tooling; Messaging #248, Marketplace #249, and Progression #261 remain preserved sole authorities but are product-owner-paused and excluded from the beta merge queue. Market/Portfolio #245, Recovery #247, supply-chain #250/#258, incident readiness #252, and Dashboard/Profile #254/#257 are merged rather than active authorities.",
    "- Current capability ownership remains unique: seed content #163, story delivery #244, release-platform #280, migration reconciliation #282, legacy retirement #283, security/rate limits #284, backup/restore #285, and final E2E harness #286 are the active beta authorities; Chat 6 retains the unmodified observability branch without a PR. Messaging #248, Marketplace #249, and Progression #261 remain preserved sole authorities but are product-owner-paused and excluded from the beta merge queue. Market/Portfolio #245, Recovery #247, supply-chain #250/#258, incident readiness #252, and Dashboard/Profile #254/#257 are merged rather than active authorities.",
    "ownership summary",
)

old_ledger = """### 2026-07-20 — Production-beta controller and ten-workstream reconciliation

- Audited `main` at `f44b0735763da6700fc18513fa7026dbd95aff86`, `CONTRIBUTING.md`, the authoritative roadmap, all open PRs, assigned workstream branches, divergence, changed files, migrations, and current-head workflow evidence.
- Established Chat 1 as sole roadmap and merge-gate authority on `docs/beta-program-controller-v1` and added `docs/operations/econovaria-beta-coordination-matrix-v1.md` with exact ownership, prohibited-file, dependency, CI, blocker, and next-action fields for all ten chats.
- Reserved missing prescribed branches `agent/live-migration-reconciliation-v1` and `agent/legacy-runtime-retirement-v1`; Chats 5, 6, 7, and 10 remain zero-commit placeholders at audited `main`; Chat 2 owns draft PR #280.
- Returned PR #248 to draft and recorded product-owner pause gates on PRs #248, #249, and #261 without closing or deleting them. They remain sole expansion authorities but are excluded from the production-beta merge queue.
- Rejected current merge readiness for PR #256 because required Admin workflows fail; PR #244 because its application workflow fails and permanent source has not materialized; PR #163 because it is non-mergeable, 132 commits behind audited `main`, lacks current-head workflow evidence, and remains non-executable; and PR #249 because four required workflows fail.
- No application feature, database migration, production schema, credential, environment, or deployment behavior changed in this controller reconciliation.
"""
new_ledger = """### 2026-07-20 — Production-beta controller and ten-workstream reconciliation

- Audited `main` at `f44b0735763da6700fc18513fa7026dbd95aff86`, `CONTRIBUTING.md`, the authoritative roadmap, every open PR, the complete remote-branch inventory, divergence, changed files, migrations, and current-head workflow evidence.
- Established Chat 1 as sole roadmap and merge-gate authority on draft PR #281 and added `docs/operations/econovaria-beta-coordination-matrix-v1.md` plus `docs/operations/econovaria-remote-branch-inventory-v1.md`.
- Reconciled all ten workstreams: Chat 2 owns PR #280; Chat 3 PR #282; Chat 4 PR #283; Chat 5 PR #284; Chat 6 retains the unmodified observability branch with no PR; Chat 7 PR #285; Chat 8 PR #244; Chat 9 PR #163; and Chat 10 PR #286. Draft PRs #282 through #286 were opened on the existing branches to prevent silent ownership and replacement branches.
- Returned PR #248 to draft and recorded product-owner pause gates on PRs #248, #249, and #261 without closing or deleting them. They remain sole expansion authorities but are excluded from the production-beta merge queue.
- Rejected current completion and merge claims lacking evidence: PR #244 still contains patch carriers with final-head workflows requiring action; PR #163 remains stale, non-mergeable, non-executable, and without current-head CI; PR #284 has cancelled required workflows; PRs #283, #285, and #286 remain running or externally blocked; and PRs #248, #249, and #261 are paused.
- PRs #280 and #282 contain bounded repository release/reconciliation tooling, but their merges would not prove isolated staging, migration application, rollback, restore, live retirement, or beta completion.
- No application feature was implemented by Chat 1 and no production schema, credential, environment, deployment, Worker, or runtime was changed in this controller reconciliation.
"""
replace_once(old_ledger, new_ledger, "controller ledger")

ROADMAP.write_text(text, encoding="utf-8")
