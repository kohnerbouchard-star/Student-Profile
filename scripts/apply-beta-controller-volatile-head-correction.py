from pathlib import Path

path = Path("docs/roadmaps/econovaria-beta-completion-roadmap-v1.md")
text = path.read_text(encoding="utf-8")
old = "| Staging and release readiness | `IN_PROGRESS` | Fail-closed preflight tooling merged through PR #169 as `ca642b1dfd6a2965612869e05b4fa1bd5840c437`; Chat 2 owns 22-file immutable release-platform PR #280 at `849f320064c3ede18e3a5e3a5b81d9741c3ec020` with its visible release, replay, quality, supply-chain, preflight, and incident checks passing while final required CI completes; distinct staging identities, deployment, connected smoke, approval, rollback, restore, and promotion evidence remain open |"
new = "| Staging and release readiness | `IN_PROGRESS` | Fail-closed preflight tooling merged through PR #169 as `ca642b1dfd6a2965612869e05b4fa1bd5840c437`; Chat 2 owns draft release-platform PR #280. Its branch advanced during controller review after an earlier green head and was returned to draft, so the permanent final diff and all final-head workflows must be re-audited before merge. Distinct staging identities, deployment, connected smoke, approval, rollback, restore, and promotion evidence remain open |"
if text.count(old) != 1:
    raise SystemExit(f"expected one release snapshot match, found {text.count(old)}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
