from pathlib import Path

path = Path("docs/roadmaps/econovaria-beta-completion-roadmap-v1.md")
text = path.read_text(encoding="utf-8")
heading = "## 33. Change ledger\n\nAppend entries in reverse chronological order.\n\n"
entry = """### 2026-07-20 — Phase 0 program-control completion seal

- PR #251 merged owner-safe program control as `89bfadfb0d609ef92081fda575f0e1e998b2650d` after Repository Quality #1084, Database Replay #345, Staging Readiness Preflight #99, and Admin Game Lifecycle Controls #33 passed.
- Preserved PR #245 over duplicate market PR #246 and PR #247 over duplicate recovery PR #253; consumed or explicitly dispositioned useful donor material before retirement. Premature roadmap seal PR #255 was also retired without merge.
- Confirmed refs `agent/player-market-portfolio-v1`, `feat/player-recovery-states-v1`, and `docs/program-control-phase0-seal-v1` no longer exist. Branch Hygiene run #100 is immutable deletion evidence for PR #246; the later duplicate refs were absent from the final remote branch inventory.
- Recorded unique active capability authorities: #163 seed content, #244 story delivery, #245 market/Portfolio, #248 Messaging, and #249 Marketplace. Recovery #247, supply-chain #250/#258, incident readiness #252, and Dashboard/Profile #254/#257 are merged rather than active owners.
- Reconciled repository state through `ad889a2bdf9d5587fff3275d70751c79992171c7`, including Dashboard/Profile manifest `2026-07-20.1`, merged Player recovery, supply-chain security, and incident readiness without overstating Portfolio, connected staging, or release completion.
- Marked `P0-006` and all of Phase 0 `VERIFIED_COMPLETE`; corrected the scoreboard to Program control 10/10, Operations 2/22, and 69 verified / 169 open / 238 total.
- Documentation and policy reconciliation only; no application source, migration, route, RPC, seed definition, credential, environment, runtime, or deployment changed in this seal.

"""
if entry.strip() in text:
    raise SystemExit("Phase 0 ledger entry already exists")
if text.count(heading) != 1:
    raise SystemExit("change-ledger heading not found exactly once")
path.write_text(text.replace(heading, heading + entry, 1), encoding="utf-8")
