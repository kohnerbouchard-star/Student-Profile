from pathlib import Path

path = Path("docs/roadmaps/econovaria-beta-completion-roadmap-v1.md")
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    text = text.replace(old, new, 1)


replace_once(
    "| Beta observability and performance | `PLANNED`; branch reserved | Chat 6, branch `agent/beta-observability-performance-v1`; branch currently equals audited `main` |",
    "| Beta observability and performance | `IMPLEMENTED_NOT_MERGED`; runtime activation open | Chat 6, PR #287, branch `agent/beta-observability-performance-v1`; structured-event contracts, request observation wrapper, dashboard/alert definitions, load profile/runner, connected query-plan evidence, and CI exist with all visible final-head workflows passing; isolated runtime events, protected dashboard activation, bounded load execution, post-load index review, and shared-dispatch integration remain open |",
    "observability snapshot",
)
replace_once(
    "- [ ] `OPS-OBS-001` Add structured logs, request IDs, release SHA, safe actor/game identifiers, latency, DB metrics, and outcome classes.",
    "- [ ] `OPS-OBS-001` Add structured logs, request IDs, release SHA, safe actor/game identifiers, latency, DB metrics, and outcome classes. `IMPLEMENTED_NOT_MERGED` on PR #287 at the contract/wrapper layer with allow-listed fields, HMAC-pseudonymous scope identifiers, request-ID propagation, bounded failure classification, and secret/body/raw-identifier rejection; shared dispatcher integration and isolated-staging runtime evidence remain open.",
    "OPS-OBS-001",
)
replace_once(
    "- [ ] `OPS-OBS-002` Add dashboards and alerts.",
    "- [ ] `OPS-OBS-002` Add dashboards and alerts. `IMPLEMENTED_NOT_MERGED` on PR #287 with 13 defined panels and 12 alert policies; protected provider activation and connected alert evidence remain open.",
    "OPS-OBS-002",
)
replace_once(
    "- [ ] `OPS-PERF-001` Add load fixtures and query-plan review.",
    "- [ ] `OPS-PERF-001` Add load fixtures and query-plan review. `IMPLEMENTED_NOT_MERGED` on PR #287 with a deterministic 30-player expected / 40-player maximum profile, plan-only isolated runner, five connected high-value query plans, and fail-closed plan review; approved isolated-staging execution remains open.",
    "OPS-PERF-001",
)
replace_once(
    "- [ ] `OPS-PERF-002` Add missing foreign-key indexes based on evidence.",
    "- [ ] `OPS-PERF-002` Add missing foreign-key indexes based on evidence. `IN_PROGRESS`: PR #287 records 19 advisor notices but correctly adds no index migration because current critical tables contain only 1-15 rows and the five reviewed plans already use appropriate indexes; post-load evidence and index reconsideration remain required.",
    "OPS-PERF-002",
)
replace_once(
    "- Current capability ownership remains unique: seed content #163, story delivery #244, release-platform #280, migration reconciliation #282, legacy retirement #283, security/rate limits #284, backup/restore #285, and final E2E harness #286 are the active beta authorities; Chat 6 retains the unmodified observability branch without a PR. Messaging #248, Marketplace #249, and Progression #261 remain preserved sole authorities but are product-owner-paused and excluded from the beta merge queue. Market/Portfolio #245, Recovery #247, supply-chain #250/#258, incident readiness #252, and Dashboard/Profile #254/#257 are merged rather than active authorities.",
    "- Current capability ownership remains unique: seed content #163, story delivery #244, release-platform #280, migration reconciliation #282, legacy retirement #283, security/rate limits #284, backup/restore #285, final E2E harness #286, and observability/performance #287 are the active beta authorities. Messaging #248, Marketplace #249, and Progression #261 remain preserved sole authorities but are product-owner-paused and excluded from the beta merge queue. Market/Portfolio #245, Recovery #247, supply-chain #250/#258, incident readiness #252, and Dashboard/Profile #254/#257 are merged rather than active authorities.",
    "ownership summary",
)
replace_once(
    "- Reconciled all ten workstreams: Chat 2 owns PR #280; Chat 3 PR #282; Chat 4 PR #283; Chat 5 PR #284; Chat 6 retains the unmodified observability branch with no PR; Chat 7 PR #285; Chat 8 PR #244; Chat 9 PR #163; and Chat 10 PR #286. Draft PRs #282 through #286 were opened on the existing branches to prevent silent ownership and replacement branches.",
    "- Reconciled all ten workstreams: Chat 2 owns PR #280; Chat 3 PR #282; Chat 4 PR #283; Chat 5 PR #284; Chat 6 PR #287; Chat 7 PR #285; Chat 8 PR #244; Chat 9 PR #163; and Chat 10 PR #286. Draft PR authorities exist on every active implementation branch, preventing silent ownership and replacement branches.",
    "controller ledger workstreams",
)

path.write_text(text, encoding="utf-8")
