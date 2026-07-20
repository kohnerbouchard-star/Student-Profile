from pathlib import Path

ROADMAP = Path("docs/roadmaps/econovaria-beta-completion-roadmap-v1.md")
WORKFLOW = Path(".github/workflows/incident-roadmap-finalize.yml")
TRIGGER = Path(".github/incident-roadmap-finalize.trigger")
SELF = Path(__file__)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one {label} occurrence, found {count}: {old}")
    return text.replace(old, new, 1)


text = ROADMAP.read_text(encoding="utf-8")

text = replace_once(
    text,
    "- [ ] `OPS-INCIDENT-001` Define incident severity, ownership, communications, classroom fallback, and correction procedures.",
    "- [x] `OPS-INCIDENT-001` Define incident severity, ownership, communications, classroom fallback, and correction procedures. `VERIFIED_COMPLETE` through PR #252 merged as `08b524e3230b6bbda79d9c0e2aa08e8cc9063fb4`; final head `afdbd18882db30b3b08d7815a4cacb527dc7b766` passed Incident Readiness #6, Repository Quality #1140, Staging Readiness Preflight #110, Supply Chain Security #24, Admin Game Lifecycle Controls #59, and Database Replay #378 with two clean migration replays and database lint.",
    "incident checklist",
)
text = replace_once(
    text,
    "| Operations/release items | 0 | 22 | 22 |",
    "| Operations/release items | 1 | 21 | 22 |",
    "operations scoreboard",
)
text = replace_once(
    text,
    "| **Total identified items** | **66** | **172** | **238** |",
    "| **Total identified items** | **67** | **171** | **238** |",
    "total scoreboard",
)
text = replace_once(
    text,
    "- **Phase 5 — Security/release/operations:** validation tooling and several repository controls exist; isolated environments, live migration reconciliation, immutable artifacts, observability, legacy retirement, backup/restore, incident readiness, and staging smoke remain open.",
    "- **Phase 5 — Security/release/operations:** validation tooling and several repository controls exist; incident readiness is repository-operationally complete, while isolated environments, live migration reconciliation, immutable artifacts, observability, legacy retirement, backup/restore, performance, and staging smoke remain open.",
    "Phase 5 status",
)

completion_heading = "### 2026-07-20 incident-readiness completion"
if completion_heading not in text:
    completion_section = "\n".join(
        (
            completion_heading,
            "",
            "- PR #252 merged `OPS-INCIDENT-001` as `08b524e3230b6bbda79d9c0e2aa08e8cc9063fb4` after a current ownership audit confirmed no active pull request owned the subsection.",
            "- Final implementation head `afdbd18882db30b3b08d7815a4cacb527dc7b766` passed Incident Readiness #6, Repository Quality #1140, Staging Readiness Preflight #110, Supply Chain Security #24, Admin Game Lifecycle Controls #59, and Database Replay #378 with two clean migration replays and database lint.",
            "- The merged P0–P3 policy, incident-command runbook, classroom continuity and exactly-once economic-correction procedure, privacy-safe communication templates, sanitized issue intake, deterministic validator, regression tests, and CI enforcement are authoritative at the repository-operational boundary.",
            "- This completion does not satisfy isolated-environment, observability, backup/restore, performance, or staging-smoke evidence owned by separate Phase 5 items.",
            "",
            "",
        )
    )
    text = replace_once(
        text,
        "### Current release condition\n",
        completion_section + "### Current release condition\n",
        "current release condition marker",
    )

ledger_heading = "### 2026-07-20 — Incident-readiness completion on PR #252"
if ledger_heading not in text:
    ledger_entry = "\n".join(
        (
            ledger_heading,
            "",
            "- Completed `OPS-INCIDENT-001` with objective P0–P3 severity and stop conditions, explicit incident command, the full response lifecycle, classroom continuity, privacy-safe communications, and auditable idempotent economic correction.",
            "- Added sanitized incident intake, a deterministic fail-closed contract validator, positive and negative regression coverage, dedicated CI, and root audit/test integration while preserving merged branch-hygiene and supply-chain checks.",
            "- Final head `afdbd18882db30b3b08d7815a4cacb527dc7b766` passed all six required workflows; PR #252 had no comments or unresolved review threads.",
            "- PR #252 merged as `08b524e3230b6bbda79d9c0e2aa08e8cc9063fb4`. External environment, observability, backup/restore, performance, and staging-smoke gates remain separately open.",
            "",
            "",
        )
    )
    marker = "Append entries in reverse chronological order.\n\n"
    text = replace_once(text, marker, marker + ledger_entry, "change ledger marker")

ROADMAP.write_text(text, encoding="utf-8")

for temporary in (WORKFLOW, TRIGGER, SELF):
    if not temporary.exists():
        raise SystemExit(f"Required temporary finalizer file is missing: {temporary}")

WORKFLOW.unlink()
TRIGGER.unlink()
SELF.unlink()
