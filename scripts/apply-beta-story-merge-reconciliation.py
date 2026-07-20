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
    "**Repository state audited through:** `92563c58304517e911816627a9cac0c74db92aef`",
    "**Repository state audited through:** `35462edd60edbb86b0222f38cdb42bb41aac0efe`",
    "repository audit boundary",
)

replace_once(
    "| Seed-content foundation | `IN_PROGRESS`; not merge-ready | PR #163, branch `agent/seed-content-foundation-v1`; sole seed-content authority; 407 commits ahead and 132 behind audited `main`, non-mergeable, with no current-head workflow evidence and no executable importer or staging activation |",
    "| Seed-content foundation | `IN_PROGRESS`; not merge-ready | PR #163, branch `agent/seed-content-foundation-v1`, head `74bcac12127244f232c563b4b018703b53cab4ff`; sole seed-content authority; 439 commits ahead and one commit behind audited `main`, with no workflow runs on the actual current head and no approved connected importer or staging activation |",
    "seed snapshot",
)
replace_once(
    "| Player story-notification delivery | `IN_PROGRESS`; not merge-ready | PR #244, branch `agent/player-story-delivery-v1`; owns `BETA-NOTIF-005` and `BETA-NOTIF-006`; synchronized with audited `main`, but the permanent diff still contains only temporary patch carriers and all visible final-head workflows require action |",
    "| Player story-notification delivery | `VERIFIED_COMPLETE` | PR #244 merged as `35462edd60edbb86b0222f38cdb42bb41aac0efe` from final head `86f7243a89dc9e02cdd1dd939ccafaa552b06b9d`; the permanent 37-file diff contains normal Backend and Player source, tests, bounded workflow changes, and one evidence document with no reconstruction artifacts. All ten final-head workflows passed |",
    "story snapshot",
)
replace_once(
    "| Staging and release readiness | `IN_PROGRESS` | Fail-closed preflight tooling merged through PR #169 as `ca642b1dfd6a2965612869e05b4fa1bd5840c437`; Chat 2 owns draft release-platform PR #280. Its branch advanced during controller review after an earlier green head and was returned to draft, so the permanent final diff and all final-head workflows must be re-audited before merge. Distinct staging identities, deployment, connected smoke, approval, rollback, restore, and promotion evidence remain open |",
    "| Staging and release readiness | `IN_PROGRESS` | Fail-closed preflight tooling merged through PR #169 as `ca642b1dfd6a2965612869e05b4fa1bd5840c437`; Chat 2 owns draft PR #280, currently seven commits behind audited `main`. Historical green checks do not authorize its stale head. Distinct staging identities, environment-neutral runtime configuration, deployment, connected smoke, approval, rollback, restore, and promotion evidence remain open |",
    "staging snapshot",
)
replace_once(
    "| Live migration reconciliation | `IMPLEMENTED_NOT_MERGED`; evidence incomplete | Chat 3, PR #282, branch `agent/live-migration-reconciliation-v1`; seven-file read-only migration/schema/metadata reconciliation tooling with Repository Quality, Supply Chain Security, and Staging Readiness Preflight passing; clean replay, connected live comparison, isolated-staging application, and retry evidence remain open |",
    "| Live migration reconciliation | `IMPLEMENTED_NOT_MERGED`; stale and evidence incomplete | Chat 3, PR #282, branch `agent/live-migration-reconciliation-v1`; read-only migration/schema/metadata tooling exists but the branch is seven commits behind audited `main`. It must synchronize and rerun final-head CI before clean replay, connected comparison, isolated-staging application, and retry evidence can be accepted |",
    "migration snapshot",
)
replace_once(
    "| Live legacy-runtime retirement | `IMPLEMENTED_NOT_MERGED`; evidence incomplete | Chat 4, PR #283, branch `agent/legacy-runtime-retirement-v1`; repository route/transport audit controls exist, but current traffic, connected auth probes, credential rotation, owner-approved shutdown, and rollback evidence remain open |",
    "| Live legacy-runtime retirement | `IMPLEMENTED_NOT_MERGED`; stale and evidence incomplete | Chat 4, PR #283, branch `agent/legacy-runtime-retirement-v1`; preparatory audit controls exist but the branch is seven commits behind audited `main`. Current traffic, connected auth, Cloudflare evidence, credential rotation, owner-approved shutdown, observation, and rollback remain open |",
    "legacy snapshot",
)
replace_once(
    "| Beta security and rate-limit closure | `IN_PROGRESS`; not merge-ready | Chat 5, PR #284, branch `agent/beta-security-rate-limit-v1`; rate-limit keying, attendance abuse controls, tests, staging probe, and forward migration `20260720150000_harden_request_rate_limit_operations_v2.sql` exist, but multiple required workflows were cancelled and proxy/HMAC/concurrency/NAT/privacy staging evidence remains open |",
    "| Beta security and rate-limit closure | `IN_PROGRESS`; not merge-ready | Chat 5, PR #284, branch `agent/beta-security-rate-limit-v1`, actual head `a3fc83190fd7eea6af34831dc23a610df421526c`; the branch is one commit behind audited `main` and has no workflow runs on that actual head. It must reconcile merged story capability/rate-limit files and pass the complete final-head matrix before proxy/HMAC/concurrency/NAT/privacy/access staging evidence |",
    "security snapshot",
)
replace_once(
    "| Beta observability and performance | `IMPLEMENTED_NOT_MERGED`; runtime activation open | Chat 6, PR #287, branch `agent/beta-observability-performance-v1`; structured-event contracts, request observation wrapper, dashboard/alert definitions, load profile/runner, connected query-plan evidence, and CI exist with all visible final-head workflows passing; isolated runtime events, protected dashboard activation, bounded load execution, post-load index review, and shared-dispatch integration remain open |",
    "| Beta observability and performance | `IMPLEMENTED_NOT_MERGED`; stale and runtime activation open | Chat 6, PR #287, branch `agent/beta-observability-performance-v1`; repository contracts and historical green CI exist, but the branch is seven commits behind audited `main`. Shared-dispatch integration, isolated runtime events, protected dashboards, bounded load, and post-load query-plan/index review remain open |",
    "observability snapshot",
)
replace_once(
    "| Backup and restore rehearsal | `IMPLEMENTED_NOT_MERGED`; rehearsal not executed | Chat 7, PR #285, branch `agent/beta-backup-restore-v1`; runbooks, retention/manifest contracts, evidence templates, and a contract workflow exist; referenced automation, distinct synthetic target, restore execution, integrity, connected smoke, RPO, and RTO evidence remain open |",
    "| Backup and restore rehearsal | `IMPLEMENTED_NOT_MERGED`; stale and rehearsal not executed | Chat 7, PR #285, branch `agent/beta-backup-restore-v1`; tooling and historical green CI exist, but the branch is seven commits behind audited `main`. A distinct synthetic target, encrypted off-platform backup, restore execution, integrity, connected smoke, RPO, and RTO evidence remain open |",
    "backup snapshot",
)
replace_once(
    "| Final Phase 6 E2E and pilot | `BLOCKED`; harness `IMPLEMENTED_NOT_MERGED` | Chat 10, PR #286, branch `agent/beta-e2e-pilot-v1`; fail-closed 52-scenario orchestration and evidence contracts exist, but no scenario is complete until release, migration, security, story, seed, observability, and restore dependencies are merged and deployed to isolated staging |",
    "| Final Phase 6 E2E and pilot | `BLOCKED`; harness `IMPLEMENTED_NOT_MERGED` and stale | Chat 10, PR #286, branch `agent/beta-e2e-pilot-v1`; story delivery is now merged, but the harness branch is seven commits behind audited `main` and no scenario is complete. Release, migration, security, seed, observability/load, backup/restore, and isolated-staging dependencies remain open |",
    "e2e snapshot",
)

replace_once(
    "**Overall status:** `IN_PROGRESS`; the merged event/notification foundation exists, and PR #163 supplies an unmerged activation-disabled campaign definition layer. No complete campaign is runtime-playable.",
    "**Overall status:** `IN_PROGRESS`; the notification foundation and bounded authenticated Player story-delivery/cutscene lifecycle are `VERIFIED_COMPLETE`, while PR #163 supplies an unmerged activation-disabled campaign definition layer. No complete campaign, runner, scheduler, or staging playthrough is runtime-authoritative.",
    "story overall status",
)
replace_once(
    "- [ ] `BETA-NOTIF-005` Connect story cutscene modal.",
    "- [x] `BETA-NOTIF-005` Connect story cutscene modal. `VERIFIED_COMPLETE` through PR #244 merged as `35462edd60edbb86b0222f38cdb42bb41aac0efe`: the accepted Player Terminal now uses the authenticated story-delivery capability, exact adapters, an accessible modal with dialog semantics, focus trap/restoration, Escape/backdrop handling, required-acknowledgement enforcement, safe session-expiry exit, and desktop/mobile Chromium verification.",
    "BETA-NOTIF-005",
)
replace_once(
    "- [ ] `BETA-NOTIF-006` Preserve purpose-built story payload delivery without exposing generic raw payload JSON.",
    "- [x] `BETA-NOTIF-006` Preserve purpose-built story payload delivery without exposing generic raw payload JSON. `VERIFIED_COMPLETE` through PR #244: authenticated private/no-store list/state routes use public `ndl_` and `ntf_` identifiers, session-derived game/player ownership, a bounded cutscene DTO, safe category normalization, replay-safe `seen`/`dismissed`/`acknowledged` transitions, committed-success and concurrent-state reconciliation, UUID/privacy tests, and no generic payload rendering.",
    "BETA-NOTIF-006",
)

anchor = "### 2026-07-20 — Paused Messaging bypass containment\n\n"
entry = """### 2026-07-20 — Player story-delivery merge and operations queue reset

- Re-audited PR #244 at exact head `86f7243a89dc9e02cdd1dd939ccafaa552b06b9d` against `main` `5153c9c2352fc4902fab0c84fb9ecfbd06b31cf5`. The permanent 37-file diff contained normal Backend and Player Terminal source, tests, two bounded existing-workflow changes, and `docs/operations/evidence/pr-244-player-story-delivery.md`; no patch chunks, `.tmp` transport, reconstruction workflows, snapshot carriers, staging fragments, or finalizer scripts remained.
- Verified PR #244 was 39 commits ahead and zero behind, mergeable, and had no unresolved review threads. Backend Typecheck #1371, Database Replay #504, Repository Quality #1425, Player Terminal Verify #434 with desktop/mobile Chromium, Supply Chain Security #309, Staging Readiness Preflight #269, Player Runtime Cutover Verify #45, Required Game Market Timezone #388, Exchange Calendar Runtime #323, and Admin Game Lifecycle Controls #183 all passed on the exact final head.
- Merged PR #244 as `35462edd60edbb86b0222f38cdb42bb41aac0efe`; marked `BETA-NOTIF-005` and `BETA-NOTIF-006` `VERIFIED_COMPLETE` only at their bounded code-integrated acceptance boundary. Campaign content, runner, scheduler, seed activation, and staging playthrough remain open.
- Recomputed the active queue against the merge: PRs #280, #282, #283, #285, #286, and #287 are seven commits behind; PRs #284 and #163 are one commit behind and have no workflow runs on their actual current heads. Every active branch must synchronize and rerun final-head CI before merge consideration.
- Confirmed PRs #248, #249, and #261 remain open drafts and outside the beta merge queue. No production deployment, schema mutation, credential change, manual SQL, seed activation, or connected environment change was performed.

### 2026-07-20 — Paused Messaging bypass containment

"""
if text.count(anchor) != 1:
    raise SystemExit(f"ledger anchor: expected one match, found {text.count(anchor)}")
text = text.replace(anchor, entry, 1)

ROADMAP.write_text(text, encoding="utf-8")
