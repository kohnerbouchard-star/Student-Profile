from pathlib import Path

ROADMAP = Path("docs/roadmaps/econovaria-beta-completion-roadmap-v1.md")
text = ROADMAP.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    text = text.replace(old, new, 1)


replace_once(
    "**Repository state audited through:** `ad889a2bdf9d5587fff3275d70751c79992171c7`",
    "**Repository state audited through:** `e167ea3976da3a5825cc1cc079c994c4f887eaf6`",
    "repository audit boundary",
)

replace_once(
    "- Current active capability ownership is unique: seed content #163, story delivery #244, market/Portfolio #245, Messaging #248, Marketplace #249, and Progression #261. Recovery #247, supply-chain #250/#258, incident readiness #252, and Dashboard/Profile #254/#257 are merged rather than active authorities.",
    "- Current active capability ownership is unique: seed content #163, story delivery #244, Messaging #248, Marketplace #249, and Progression #261. Market/Portfolio #245, Recovery #247, supply-chain #250/#258, incident readiness #252, and Dashboard/Profile #254/#257 are merged rather than active authorities.",
    "active capability summary",
)

replace_once(
    "- [x] `P0-001` Re-audit current `main`, active PR ownership, branch divergence, and deployed-runtime evidence boundaries. Refreshed on 2026-07-20 through `main` `ad889a2bdf9d5587fff3275d70751c79992171c7`; unique active capability authorities are PRs #163, #244, #245, #248, #249, and #261.",
    "- [x] `P0-001` Re-audit current `main`, active PR ownership, branch divergence, and deployed-runtime evidence boundaries. Refreshed on 2026-07-20 through `main` `e167ea3976da3a5825cc1cc079c994c4f887eaf6`; unique active capability authorities are PRs #163, #244, #248, #249, and #261. Market/Portfolio PR #245 is merged as `64d6a5badc52a1fad4394b0eaa53ac1f97e8855a`.",
    "P0-001 ownership audit",
)

replace_once(
    "- [x] `P0-006` Close or archive superseded branch refs after their useful work is accounted for and after confirming no other active chat owns them. `VERIFIED_COMPLETE` through PR #251 merged as `89bfadfb0d609ef92081fda575f0e1e998b2650d`: PR #245 was preserved over duplicate #246; PR #247 was preserved over duplicate #253 with donor ideas dispositioned before merge; premature seal #255 was retired; all duplicate PRs are closed; refs `agent/player-market-portfolio-v1`, `feat/player-recovery-states-v1`, and `docs/program-control-phase0-seal-v1` no longer resolve.",
    "- [x] `P0-006` Close or archive superseded branch refs after their useful work is accounted for and after confirming no other active chat owns them. `VERIFIED_COMPLETE` through PR #251 merged as `89bfadfb0d609ef92081fda575f0e1e998b2650d`, seal PR #259 merged as `e2483e25d767cbe5714735c627093d9968507908`, and default-branch cleanup through `e167ea3976da3a5825cc1cc079c994c4f887eaf6`: market duplicate #246, recovery duplicate #253, premature seal #255, and incident-verification duplicates #260, #270, and #273 are closed with their useful evidence consumed or dispositioned; the obsolete incident finalizer workflow, trigger, and script are deleted from `main`.",
    "P0-006 cleanup evidence",
)

replace_once(
    "| Player market orders and Portfolio | PR #245 / `agent/player-market-reconciliation-v1` | `VERIFIED_COMPLETE` at repository-integrated boundary | `BETA-MKT-003` through `BETA-MKT-007` are complete; preserve the ticker-only, session-derived, rate-limited public boundary and keep active-market selection under PR #163. |",
    "| Player market orders and Portfolio | PR #245 / merge `64d6a5badc52a1fad4394b0eaa53ac1f97e8855a` | `VERIFIED_COMPLETE` at repository-integrated boundary | `BETA-MKT-003` through `BETA-MKT-007` are complete; preserve the ticker-only, session-derived, rate-limited public boundary and keep active-market selection under PR #163. |",
    "market authority registry",
)

replace_once(
    "**Exit gate:** Met. No overlapping active pull request owns the same capability, superseded duplicate refs are retired, and this roadmap reflects the repository through `ad889a2bdf9d5587fff3275d70751c79992171c7`.",
    "**Exit gate:** Met. No overlapping active pull request owns the same capability, superseded duplicate refs and finalizer artifacts are retired, and this roadmap reflects the repository through `e167ea3976da3a5825cc1cc079c994c4f887eaf6`.",
    "Phase 0 exit gate",
)

ledger_marker = "Append entries in reverse chronological order.\n\n"
ledger_heading = "### 2026-07-20 — Default-branch incident-finalizer retirement"
if ledger_heading not in text:
    entry = """### 2026-07-20 — Default-branch incident-finalizer retirement

- Confirmed Phase 0 remained `VERIFIED_COMPLETE` after market/Portfolio PR #245 merged as `64d6a5badc52a1fad4394b0eaa53ac1f97e8855a`.
- Retired duplicate incident-verification PRs #260, #270, and #273 and the unmerged push-gated replacement #275 after PR #259 had already made the incident checkbox, scoreboards, Phase 5 status, amendment, verification record, and ledger authoritative.
- Removed `.github/workflows/incident-roadmap-finalize.yml`, `.github/incident-roadmap-finalize.trigger`, and `scripts/finalize-incident-roadmap.py` from `main` through commits `14fe5833a7cae23bd41703565a64217082025301`, `67510771742340f22261cbe0dd7d9946ac33ee11`, and `7846ee95ec539de6005c327e13e918792cbe3eb0`; recorded the cleanup in `e167ea3976da3a5825cc1cc079c994c4f887eaf6`.
- Current active capability authorities are #163 seed content, #244 story delivery, #248 Messaging, #249 Marketplace, and #261 Progression. No application source, migration, route, RPC, seed definition, credential, environment, runtime, or deployment behavior changed in this reconciliation.

"""
    count = text.count(ledger_marker)
    if count != 1:
        raise SystemExit(f"change ledger marker: expected exactly one match, found {count}")
    text = text.replace(ledger_marker, ledger_marker + entry, 1)

ROADMAP.write_text(text, encoding="utf-8")
