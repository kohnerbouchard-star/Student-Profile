from pathlib import Path

path = Path("docs/roadmaps/econovaria-beta-completion-roadmap-v1.md")
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected one match, found {count}: {old[:160]!r}")
    text = text.replace(old, new, 1)


replace_once(
    "**Repository state audited through:** `222fd3e5b6491b32f79d7c56c0d84455411f6f77`",
    "**Repository state audited through:** `ad889a2bdf9d5587fff3275d70751c79992171c7`",
)

replace_once(
    "| Seed-content foundation | `IN_PROGRESS`; branch synchronization required | PR #163, branch `agent/seed-content-foundation-v1`, head `ad73fbe23dffd8556e58f363b6dd833daa93cd74`; 407 seed commits beyond the common base and 98 commits behind the audited repository state |\n"
    "| Player story-notification delivery | `IN_PROGRESS` | PR #244, branch `agent/player-story-delivery-v1`; owns `BETA-NOTIF-005` and `BETA-NOTIF-006` without owning campaign content |\n"
    "| Player market orders and Portfolio | `IN_PROGRESS` | PR #245, branch `agent/player-market-reconciliation-v1`; surviving authority for `BETA-MKT-003` through `BETA-MKT-007` after duplicate PR #246 retirement |\n"
    "| Program-control consolidation | `IMPLEMENTED_NOT_MERGED` | PR #251, branch `chore/program-control-consolidation-v1`; reconciles overlapping ownership and hardens owner-safe branch retirement |",
    "| Seed-content foundation | `IN_PROGRESS`; branch synchronization required | PR #163, branch `agent/seed-content-foundation-v1`; sole seed-content authority |\n"
    "| Player story-notification delivery | `IN_PROGRESS` | PR #244, branch `agent/player-story-delivery-v1`; owns `BETA-NOTIF-005` and `BETA-NOTIF-006` without owning campaign content |\n"
    "| Player market orders and Portfolio | `IN_PROGRESS` | PR #245, branch `agent/player-market-reconciliation-v1`; sole authority for `BETA-MKT-003` through `BETA-MKT-007` |\n"
    "| Messaging and communication | `IN_PROGRESS` | PR #248, branch `agent/messaging-communication-v1`; owns `EXP-MSG-001` through `EXP-MSG-007` |\n"
    "| Player Marketplace lifecycle | `IN_PROGRESS` | PR #249, branch `agent/player-marketplace-lifecycle-v1`; owns `EXP-MP-001` through `EXP-MP-009` |\n"
    "| Program-control consolidation | `VERIFIED_COMPLETE` | PR #251 merged as `89bfadfb0d609ef92081fda575f0e1e998b2650d`; all known duplicate claims are closed and their refs deleted |\n"
    "| Player Dashboard and Profile runtime | `VERIFIED_COMPLETE` at the repository-integrated boundary | PR #254 merged as `1156cf11cb9c4ecd9626779d3cab15fc40940315`; evidence PR #257 merged as `9918fb33c71d59f2247da8c2af7574076beecf62`; aggregate `BETA-PLAYER-008` remains open for Portfolio |\n"
    "| Player recovery states | repository tranche `VERIFIED_COMPLETE`; connected evidence `IN_PROGRESS` | PR #247 merged as `ad889a2bdf9d5587fff3275d70751c79992171c7`; isolated-staging recovery evidence remains under `BETA-PLAYER-014` |\n"
    "| Software supply-chain security | `VERIFIED_COMPLETE` | PR #250 merged as `476cfba30666b1303d32d6c2e46560483b641edf`; evidence seal PR #258 merged as `0d9afbf7fb8688841858e4f75460ab91f02820d9` |\n"
    "| Incident readiness | `VERIFIED_COMPLETE` | PR #252 merged as `08b524e3230b6bbda79d9c0e2aa08e8cc9063fb4`; deterministic validator and incident process suite are authoritative |",
)

replace_once(
    "- The merged Player capability manifest remains schema `1`, version `2026-07-19.4`. Dashboard, Portfolio, Profile, market orders, Crafting, Loans, Business, Marketplace writes, Messages, and Progression remain unadvertised or unavailable.",
    "- The merged Player capability manifest is schema `1`, version `2026-07-20.1`. Dashboard and Profile are authoritative through PR #254; Portfolio, market orders, Crafting, Loans, Business, Marketplace writes, Messages, and Progression remain unadvertised or unavailable.",
)
replace_once(
    "- Operations and architecture are partially implemented: pinned toolchains, dependency audits, package-signature checks, repeated migration replay/lint, fail-closed staging validation, repository runtime cutover, and Admin architecture ratchets exist. They do not provide isolated environments, immutable release artifacts, SBOM/provenance, observability, backup/restore, incident readiness, or live legacy retirement evidence.",
    "- Operations and architecture are partially implemented: supply-chain security and incident readiness are now `VERIFIED_COMPLETE`; pinned toolchains, repeated migration replay/lint, fail-closed staging validation, repository runtime cutover, and Admin architecture ratchets also exist. Isolated environments, immutable application promotion, observability, backup/restore rehearsal, and live legacy retirement evidence remain open.",
)

replace_once(
    "### 2026-07-20 parallel-work ownership reconciliation\n\n"
    "- Re-audited open pull requests after parallel roadmap sessions created overlapping claims. PR #163 remains the sole seed-content authority and PR #244 uniquely owns Player story-notification delivery.\n"
    "- PRs #245 and #246 both claimed `BETA-MKT-003` through `BETA-MKT-007`. PR #245 contains the substantive public-safe market contract implementation and is the surviving authority. PR #246 contains only a temporary source-snapshot workflow and claim marker; its artifact was consumed for this audit and the PR is approved for explicit duplicate retirement.\n"
    "- PR #251 owns only Phase 0 program control. It adds fail-closed branch retirement for merged branches and explicitly `duplicate`-labeled closed branches, preserves the default and accepted Admin source refs, and adds a repository test ratchet.\n"
    "- Until PR #251 merges and PR #246 is closed/deleted, `P0-006` remains `IMPLEMENTED_NOT_MERGED`; no market, story, seed, Player, Admin, migration, runtime, or deployment capability is advanced by this program-control tranche.",
    "### 2026-07-20 final parallel-work ownership reconciliation\n\n"
    "- PR #251 merged owner-safe branch retirement as `89bfadfb0d609ef92081fda575f0e1e998b2650d`; its final head passed Repository Quality #1084, Database Replay #345, Staging Readiness Preflight #99, and Admin Game Lifecycle Controls #33.\n"
    "- Market collision: PR #245 remains the sole authority for `BETA-MKT-003` through `BETA-MKT-007`. Duplicate PR #246 was labeled, closed after its source artifact was consumed, and `agent/player-market-portfolio-v1` was deleted by Branch Hygiene run #100.\n"
    "- Recovery collision: earlier PR #247 was preserved over replacement PR #253. PR #253 was labeled `duplicate`, closed, and `feat/player-recovery-states-v1` no longer exists; its useful donor ideas were dispositioned on PR #247 before PR #247 merged as `ad889a2bdf9d5587fff3275d70751c79992171c7`.\n"
    "- Premature seal PR #255 was labeled `duplicate`, closed without merge, and `docs/program-control-phase0-seal-v1` no longer exists. The merged PR #251 branch was retired automatically.\n"
    "- Current active capability ownership is unique: seed content #163, story delivery #244, market/Portfolio #245, Messaging #248, and Marketplace #249. Recovery #247, supply-chain #250/#258, incident readiness #252, and Dashboard/Profile #254/#257 are merged rather than active authorities.\n"
    "- Branch-only work without an open pull request is not authoritative. Future agents must search this roadmap and current open pull requests before creating a branch.",
)

replace_once("| Program control | 9 | 1 | 10 |", "| Program control | 10 | 0 | 10 |")
replace_once("| Operations/release items | 0 | 22 | 22 |", "| Operations/release items | 2 | 20 | 22 |")
replace_once("| **Total identified items** | **66** | **172** | **238** |", "| **Total identified items** | **69** | **169** | **238** |")

replace_once(
    "- **Phase 0 — Program control:** `IMPLEMENTED_NOT_MERGED` on PR #251; duplicate market ownership is reconciled and safe duplicate-branch retirement is pending merge and execution against PR #246.",
    "- **Phase 0 — Program control:** `VERIFIED_COMPLETE`; all ten items are merged and evidence-backed, overlapping market and recovery claims are retired, and active capability ownership is unique.",
)
replace_once(
    "- **Phase 2 — Player connection:** mostly complete; Dashboard, Portfolio, Profile, market orders, and isolated-staging bootstrap remain open.",
    "- **Phase 2 — Player connection:** mostly complete; Dashboard and Profile are repository-integrated through PR #254, while Portfolio, market orders, and isolated-staging bootstrap remain open.",
)
replace_once(
    "- **Phase 3 — Beta gameplay gaps:** Contracts, Store/Inventory, notifications, and game lifecycle are repository-integrated; onboarding, cutscenes, Player recovery, market trade/portfolio, and a runtime story chain remain open.",
    "- **Phase 3 — Beta gameplay gaps:** Contracts, Store/Inventory, notifications, game lifecycle, and the repository Player recovery tranche are integrated; onboarding, cutscenes, market trade/portfolio, connected recovery evidence, and a runtime story chain remain open.",
)
replace_once(
    "- **Phase 5 — Security/release/operations:** validation tooling and several repository controls exist; isolated environments, live migration reconciliation, immutable artifacts, observability, legacy retirement, backup/restore, incident readiness, and staging smoke remain open.",
    "- **Phase 5 — Security/release/operations:** supply-chain security and incident readiness are complete; isolated environments, live migration reconciliation, immutable application promotion, observability, legacy retirement, backup/restore rehearsal, and staging smoke remain open.",
)
replace_once(
    "3. Complete onboarding, cutscene/purpose-built story delivery, and Player recovery states.",
    "3. Complete onboarding and cutscene/purpose-built story delivery, then capture connected isolated-staging recovery evidence.",
)

replace_once(
    "- [x] `BETA-PLAYER-004` Consume authoritative capability manifest and version. `VERIFIED_COMPLETE`; startup consumes schema `1`, manifest `2026-07-19.4`.",
    "- [x] `BETA-PLAYER-004` Consume authoritative capability manifest and version. `VERIFIED_COMPLETE`; startup consumes schema `1`, manifest `2026-07-20.1` after PR #254 merged as `1156cf11cb9c4ecd9626779d3cab15fc40940315`.",
)
replace_once(
    "- [ ] `BETA-PLAYER-008` Connect Dashboard, World, News, Market, Portfolio, Store, Contracts, Inventory, Banking, Notifications, and Profile. `IN_PROGRESS`: manifest-advertised World, News, Market reads, Store, Contracts, Inventory, Banking, and Notifications are connected; Dashboard, Portfolio, and Profile are not advertised by manifest `2026-07-19.4`.",
    "- [ ] `BETA-PLAYER-008` Connect Dashboard, World, News, Market, Portfolio, Store, Contracts, Inventory, Banking, Notifications, and Profile. `IN_PROGRESS`: Dashboard and Profile are authoritative through PR #254 and manifest `2026-07-20.1`; all named reads except Portfolio are connected. Portfolio remains active on PR #245, so the aggregate item stays open.",
)
replace_once(
    "- [ ] `BETA-PLAYER-014` Verify offline, timeout, ambiguous write, 429, and session-expiry recovery. `IN_PROGRESS`: frontend recovery contracts and safe expiry exit are merged; connected isolated-staging retry/rate-limit evidence remains open.",
    "- [ ] `BETA-PLAYER-014` Verify offline, timeout, ambiguous write, 429, and session-expiry recovery. `IN_PROGRESS`: PR #247 merged the repository recovery tranche as `ad889a2bdf9d5587fff3275d70751c79992171c7` after all ten final workflows passed; connected isolated-staging retry/rate-limit evidence remains open.",
)

replace_once(
    "- [x] `P0-001` Re-audit current `main`, active PR ownership, branch divergence, and deployed-runtime evidence boundaries. Refreshed on 2026-07-20 for `main` `222fd3e5b6491b32f79d7c56c0d84455411f6f77`; PR #163 owns seed content, PR #244 owns story delivery, PR #245 owns market reconciliation, and duplicate PR #246 is approved for retirement by PR #251.",
    "- [x] `P0-001` Re-audit current `main`, active PR ownership, branch divergence, and deployed-runtime evidence boundaries. Refreshed on 2026-07-20 through `main` `ad889a2bdf9d5587fff3275d70751c79992171c7`; unique active capability authorities are PRs #163, #244, #245, #248, and #249.",
)
replace_once(
    "- [ ] `P0-006` Close or archive superseded branch refs after their useful work is accounted for and after confirming no other active chat owns them. `IMPLEMENTED_NOT_MERGED` on PR #251: open-PR ownership was reconciled, substantive market work was preserved on PR #245, PR #246 was classified as the duplicate after its source artifact was consumed, and Branch Hygiene now fail-closes deletion to merged or explicitly `duplicate`-labeled same-repository PRs. Completion requires PR #251 merge plus PR #246 closure and branch-deletion evidence.",
    "- [x] `P0-006` Close or archive superseded branch refs after their useful work is accounted for and after confirming no other active chat owns them. `VERIFIED_COMPLETE` through PR #251 merged as `89bfadfb0d609ef92081fda575f0e1e998b2650d`: PR #245 was preserved over duplicate #246; PR #247 was preserved over duplicate #253 with donor ideas dispositioned before merge; premature seal #255 was retired; all duplicate PRs are closed; refs `agent/player-market-portfolio-v1`, `feat/player-recovery-states-v1`, and `docs/program-control-phase0-seal-v1` no longer resolve.",
)

replace_once(
    "| Player market orders and Portfolio | PR #245 / `agent/player-market-reconciliation-v1` | `IN_PROGRESS` | Sole surviving authority for `BETA-MKT-003` through `BETA-MKT-007`; PR #246 is a duplicate retirement target. |\n"
    "| Program-control consolidation | PR #251 / `chore/program-control-consolidation-v1` | `IMPLEMENTED_NOT_MERGED` | Owns only `P0-006`, ownership reconciliation, and branch-hygiene policy; no feature implementation. |",
    "| Player market orders and Portfolio | PR #245 / `agent/player-market-reconciliation-v1` | `IN_PROGRESS` | Sole authority for `BETA-MKT-003` through `BETA-MKT-007`; do not create another market reconciliation branch. |\n"
    "| Messaging and communication | PR #248 / `agent/messaging-communication-v1` | `IN_PROGRESS` | Sole authority for `EXP-MSG-001` through `EXP-MSG-007`. |\n"
    "| Player Marketplace lifecycle | PR #249 / `agent/player-marketplace-lifecycle-v1` | `IN_PROGRESS` | Sole authority for `EXP-MP-001` through `EXP-MP-009`. |\n"
    "| Player recovery states | PR #247 / merge `ad889a2bdf9d5587fff3275d70751c79992171c7` | repository tranche `VERIFIED_COMPLETE`; connected evidence `IN_PROGRESS` | Do not reopen duplicate PR #253; connected recovery evidence remains governed by `BETA-PLAYER-014`. |\n"
    "| Incident readiness | PR #252 / merge `08b524e3230b6bbda79d9c0e2aa08e8cc9063fb4` | `VERIFIED_COMPLETE` | Preserve severity, ownership, classroom fallback, correction, evidence, and postmortem controls. |\n"
    "| Program-control consolidation | PR #251 / merge `89bfadfb0d609ef92081fda575f0e1e998b2650d` | `VERIFIED_COMPLETE` | Phase 0 is sealed; preserve the unique-authority registry and fail-closed branch-retirement policy. |",
)
replace_once(
    "**Exit gate:** No overlapping active branch owns the same capability, and this roadmap reflects the current repository.",
    "**Exit gate:** Met. No overlapping active pull request owns the same capability, superseded duplicate refs are retired, and this roadmap reflects the repository through `ad889a2bdf9d5587fff3275d70751c79992171c7`.",
)

replace_once(
    "**Exit gate:** Met. PR #158 is merged, donor work is no longer required for Backend authority, and the current implemented endpoint set is represented by capability manifest `2026-07-19.4`.",
    "**Exit gate:** Met. PR #158 is merged, donor work is no longer required for Backend authority, and the current implemented endpoint set is represented by capability manifest `2026-07-20.1`.",
)
replace_once(
    "- [ ] Connect all beta reads. `IN_PROGRESS`: Dashboard, Portfolio, and Profile are not advertised by manifest `2026-07-19.4`.",
    "- [ ] Connect all beta reads. `IN_PROGRESS`: Dashboard and Profile are authoritative through PR #254 and manifest `2026-07-20.1`; Portfolio remains active on PR #245.",
)
replace_once(
    "- [ ] Player-facing recovery states.",
    "- [x] Player-facing recovery states at the repository boundary through PR #247; connected isolated-staging retry/rate-limit evidence remains open under `BETA-PLAYER-014`.",
)
replace_once(
    "- [ ] `OPS-INCIDENT-001` Define incident severity, ownership, communications, classroom fallback, and correction procedures.",
    "- [x] `OPS-INCIDENT-001` Define incident severity, ownership, communications, classroom fallback, and correction procedures. `VERIFIED_COMPLETE` through PR #252 merged as `08b524e3230b6bbda79d9c0e2aa08e8cc9063fb4`; Incident Readiness, Repository Quality, Staging Readiness Preflight, Supply Chain Security, Admin Game Lifecycle Controls, and Database Replay passed.",
)

replace_once(
    "Append entries in reverse chronological order.\n\n### 2026-07-20 — Software supply-chain security completion seal",
    "Append entries in reverse chronological order.\n\n"
    "### 2026-07-20 — Phase 0 program-control completion seal\n\n"
    "- PR #251 merged owner-safe program control as `89bfadfb0d609ef92081fda575f0e1e998b2650d` after Repository Quality #1084, Database Replay #345, Staging Readiness Preflight #99, and Admin Game Lifecycle Controls #33 passed.\n"
    "- Preserved PR #245 over duplicate market PR #246 and PR #247 over duplicate recovery PR #253; consumed or explicitly dispositioned useful donor material before retirement. Premature seal PR #255 was also retired without merge.\n"
    "- Confirmed refs `agent/player-market-portfolio-v1`, `feat/player-recovery-states-v1`, and `docs/program-control-phase0-seal-v1` no longer exist. Branch Hygiene run #100 is immutable deletion evidence for PR #246; the later duplicate refs were absent from the final remote branch inventory.\n"
    "- Recorded unique active capability authorities: #163 seed content, #244 story delivery, #245 market/Portfolio, #248 Messaging, and #249 Marketplace. Recovery #247, supply-chain #250/#258, incident readiness #252, and Dashboard/Profile #254/#257 are merged rather than active owners.\n"
    "- Reconciled repository state through `ad889a2bdf9d5587fff3275d70751c79992171c7`, including Dashboard/Profile manifest `2026-07-20.1`, merged Player recovery, supply-chain security, and incident readiness without overstating Portfolio, connected staging, or release completion.\n"
    "- Marked `P0-006` and all of Phase 0 `VERIFIED_COMPLETE`; corrected the scoreboard to Program control 10/10, Operations 2/22, and 69 verified / 169 open / 238 total.\n"
    "- Documentation and policy reconciliation only; no application source, migration, route, RPC, seed definition, credential, environment, runtime, or deployment changed in this seal.\n\n"
    "### 2026-07-20 — Software supply-chain security completion seal",
)

path.write_text(text, encoding="utf-8")
