# REF-029 — Contract progress read projection

Status: VERIFIED_COMPLETE (bounded repository seam only). Original base: `28257436a9603b5e7d4094c15a501dbeb7cd55dc`.
Maps to ARCH-401; dependencies REF-007/008/009/028 are VERIFIED_COMPLETE.

## Scope and ownership

2026-10-01 open-PR check: #783 owns independent Marketplace qualification;
#736/#735/#731/#730/#690/#668/#624/#620 retain their existing protected scopes.
None owns this progress read family. Shared inventory/backlog/authority integration
is serialized with the parent before merging; global beta ledger stays untouched.

Permitted files (ten maximum):
- `backend/src/domains/contracts/infrastructure/supabaseContractRepository.ts`
- `backend/src/domains/contracts/infrastructure/contractProgressReadProjection.ts`
- `backend/tests/domains/contracts/ref004Parity.test.ts` (registered acceptance suite)
- this record
- `docs/roadmaps/refactor-execution-v1/tasks/REF-029.md`
- `docs/roadmaps/refactor-execution-v1/backlog.json` (REF-029 only)
- PR-specific `docs/operations/contracts/player-cross-cutting/pr-785.json`

Generated architecture inventory is counted separately. No package, SQL, auth,
UI, workflow, transaction or production changes. Existing repository tests remain
in their owning file and are imported by the registered acceptance suite.

## Characterization contract

Extract only getPlayerContractProgress, listPlayerContractProgress,
listContractProgressForStaff and getContractProgressById, reusing the same client.
Each makes exactly one player_contract_progress select with the same 12 columns.
Player single: game/contract/player predicates, maybeSingle, missing => null.
Player list: game/player, optional nonempty status filter, created_at descending.
Staff list: game/contract, optional nonempty statuses and truthy player, submitted_at
(descending, nulls last), then created_at descending. ID single: game/contract/id,
maybeSingle, missing => null. List null data => []; no pagination or joins.
Query errors precede mapping, retain code/table/operation/message and empty-message
fallback. Existing mapper retains null timestamps, config validation and payloads.
Progress DTO mapping/select are reused by unchanged write methods; no duplicate
queries, per-row reads or mutation extraction. Single projection ownership is
internal infrastructure, no public repository API change.

Callers remain playerContractHttpHandler (list/submit),
playerContractPublicListHttpHandler (list), playerContractPublicSubmitHttpHandler
(submit lookup), staffContractHttpHandler (progress/review/reward lookups).
Auth/capability/DTO ordering remains in those unedited handlers.

Validation: baseline/post acceptance and repository query traces, lifecycle,
Admin API, Player fixture flows, root npm test, typecheck:all, smoke, architecture,
high-priority/legacy audits, secrets and diff. Network-blocked checks must be
reported as blocked pending exact-head CI, never credited as local passes.
Rollback: revert projection and forwarding together, with no database operation.

## Local evidence checkpoint

Pinned Node 22.23.1, npm 10.9.8 and Deno 2.9.3 with the existing frozen lock/cache.
- Unchanged baseline acceptance: 67 passed; repository: 18 passed.
- Pre-extraction characterization: 95 passed (67 existing acceptance, 18 existing
  repository cases, ten new REF-029 trace/error/filter cases).
- Post-extraction acceptance: 95 passed; lifecycle: 1 passed.
- Player contracts-public, contracts-connected, contracts-submit and
  story-decisions fixture suites passed. These are not live runtime evidence.
- Architecture ratchet, high-priority boundaries, legacy runtime, secrets and
  diff checks passed. Initial root test stopped only because freshly generated
  inventory was not committed; final committed-source rerun is required.
- Backend TypeScript passes; typecheck:all Edge phase and Admin API are locally
  BLOCKED fetching pinned esm.sh Supabase 2.108.2 (connection refused). Full
  smoke is subject to the same unavailable dependency. Exact-head CI must pass
  those checks; local blocked stages receive no passing credit.

Measured production lines: repository 835 -> 726, new projection 199. The
single responsibility is now independently reviewable; net source increases
90 lines for typed read-only seam/delegation rather than claiming code deletion.
Tests add 77 lines; existing 1,131-line repository test remains unchanged.
Of the 417 source/test textual additions/deletions, 121 removed production lines
move verbatim apart from export markers and are not new behavior. Remaining
semantic surface is below the 400-line threshold: internal client interface,
read-only composition/forwarding, equivalent query-error construction and tests.
Scan denominator: source/test files 1,258 -> 1,259, Contracts files 44 -> 45.
All debt and zero-tolerance counts remain unchanged, including oversized files
99. No unsupported score, percentage or debt-count reduction is claimed.

Final committed-source `npm test` passed. Draft PR #785 published from connector
commit `fa18ddcc651cef73e74a184558b63323366b63ae`; its tree equals locally
validated tree `3b4ae3eb9c3b0cc8a7afbcad79281f896f6ebe1b`. PR authority
is added in a following bounded commit, before final exact-head CI qualification.

Independent static review at local `97ca76b4e05f64befb8b57895ec68a8aa5b29369`
(the same published tree) found no actionable defect. All four selected method
bodies/signatures, all ten remaining methods, row/select and mapper match base
exactly. Equivalent direct error construction, unchanged client identity and
acyclic imports were checked. Conservative non-move source/test surface is at
most 177 lines. Review does not replace unavailable live/Edge aggregate evidence.

## Serialized main integration

Merged verified REF-024 closeout main `488bc9051dfa0e053f7c4314921617f399763d6d`
normally into this branch. No conflicts; all REF-024 qualification and completion
records are preserved. Recomputed architecture inventory is unchanged.
Pre-integration head `3fb2e1e5b19f04e92cea4dd983bcb702c424affc` passed Backend
Typecheck/full smoke (run `36829931917`), Repository Quality and REF-009 reward
qualification (run `36829931602`). Its separate REF-018/022 qualification failure
(run `36829931566`, job `110263974849`) was exact-head/main-workflow skew:
main's new workflow asked the older head for the not-yet-inherited REF-024 script.
The integration includes that already-reviewed script/workflow unchanged, and
requires fresh combined-head CI. Historical pre-integration passes do not qualify
the new head. No workflow repair or test weakening was made in REF-029.

Subsequent REF-026 verification-only closeout main
`87bb58889c4412db023c3ccf858b116630bf77b0` was integrated normally at the
parent's direction before final merge. Its three documentation changes are
preserved; executable tree and the REF-029 extraction are unchanged. Inventory
regeneration remains identical. Prior candidate `7809fd1488085e675f7ce3e164cca0926e2f54b8`
passed Backend typecheck/full smoke (`36831044952`), REF-009 reward qualification
(`36831045016`) and combined REF-018/022/023/024 database/race qualification
(`36831044841`). The reward archive `11147019512` was downloaded and its SHA256
verified as `00c8275f2361fba054b0002f636eb4d795e21f4fca8e55c1561309fc50f9e898`:
198-table snapshot, replay/conflict, rollback/retry, denied/wrong-association
no-effects and two observed concurrent waiters all pass; production untouched.
Independent integration review found no defect and confirmed all eight authorized
paths. Final documentation-combined candidate still requires its own fresh CI.

## Historical CI failures retained — candidate 8be33191

All 28 other workflows passed. Player Multiplayer and Load E2E run
`36832570071` failed twice; neither run qualifies this candidate.
- Job `110272317029`: connected World Marketplace listing returned retryable
  `503 player_marketplace_service_unavailable`. Earlier journeys, including
  Contract lifecycle, passed; load skipped. Downloaded artifact `11148242849`
  SHA256 `79ca18047af9f30d6132e48dc1e626c4a2b8812734524a38bc24acaf7dac4b2f`
  verified. Gateway diagnostics contain repeated upstream connection resets and
  broken pipes; a transient service explanation is a hypothesis, not established.
- One unchanged-job retry `110276346661`: Marketplace passed. Crafting's first
  start click timed out at 30 seconds after Playwright reported visible, enabled,
  stable and "scrolling into view if needed". No crafting POST was observed;
  fixture prepared, login/GETs returned 200, console/page errors were empty.
  Primary artifact failure is `locator.click` timeout at runner line 502.
  Later `page.waitForResponse: Target page, context or browser has been closed`
  at line 498 is secondary: finally closes context with a pending response wait.
  Downloaded artifact `11148791850` SHA256
  `f8965c22d56c026440318e9488871de50238da4405d100f4cf31c9853fac19ee`
  verified. Exact UI/scroll geometry cause remains unproven (no screenshot/trace).
  Contract lifecycle again passed; load skipped. No further blind retry made.

No source, harness, timeout, assertion, CSS or workflow was changed to bypass
these failures. A repeated click failure after legitimate final-main integration
requires separate focused diagnosis, not expansion of this read-refactor scope.

## REF-031 verified-main integration

Integrated `eabf3d032768771ebdee652a9d6d1ce35d655734` (REF-031 source and
closeout) normally at the parent's direction. Countries source/tests, PR-788
authority and completed records are preserved. Inventory regenerated for both
seams: combined source/test denominator is 1,260 versus latest-main 1,259;
Contracts count remains 45 versus latest-main 44, all debt counts unchanged.
This source integration requires new combined-head CI, not a blind rerun of the
old candidate. Both historical Player failures above remain unresolved evidence;
no browser fix or root-cause resolution is claimed. Repeated click failure must
stop this qualification for a separate diagnostic scope.

## Accepted final head and merge — 2026-10-01

PR #785 merged normally as `4dd2fff7d58f2ff86b7986b3adc37a1c3a40e3e6` from
accepted head `2d0eadd9ea5d68cdb9c81b5e94dbdd4af28286cf`. Both trees equal
`be66b669b803c52b74a8728bf86d002f8219d5bf`; main was fetched and checked locally.
All 29 final-head workflows passed, with 60 successful jobs and four expected
conditional skips (read-only staging/live parity, staging evidence, architecture
materialization, unchanged release artifacts). Vercel succeeded; no review threads.
Independent code and every integration review found no actionable defect.

Final-head qualifying runs:
- Backend typecheck/full smoke: `36837851778`
- Contract reward database/race qualification: `36837851676`
- REF-018/022/023/024 database/race qualification: `36837851666`
- Critical Store/FX source/database/browser/connected: `36837851627`
- Player connected Contract/Crafting/World and 30/40 load: `36837851777`,
  job `110289513542`

Player archive `11150466596` was downloaded and SHA256 verified:
`38c6e07d3618ee8847bdbed8c2cc186e33f70ac3c048e2d4aa2fad41fd40d8ad`.
All Contract accept/submit persistence, replay and unauthorized denials pass;
Crafting start/cancel/claim/equip/use/salvage persistence/replay/denials all pass.
All seven World sub-journeys pass. Load provisions 40 players: baseline 30 logs
in successfully and reads 210/210 HTTP 200; burst 40 reads 280/280 HTTP 200.
One World-runtime 503 recovered within the existing bounded retry policy; this
is disclosed, not hidden as zero transient errors. No production access involved.

Other final-head artifact identities below are GitHub-reported SHA256 metadata,
not claims of locally downloaded ZIP verification:
- rewards `11150023245`: `ed9a89554c0c659ec5f10e0adce34e9b8a1f796589d04ac15a15ed50f81a5032`
- staff/reservation qualification `11149404478`: `a21b658b71b43957ccc958aaf4418993ea86afeede34c6d15cec4a077c79e234`
- backend smoke `11150117467`: `3f54cfa57478c85709b9af8e11551494b40f787ba4991c862e0890cfa20b8ace`
- backend typecheck `11149833103`: `c3a7f47b3dd115b4ff60a4acc0da529a6b7aa5f14f1a4850ec80fc5778e817d8`
- Store/FX browser `11149044808`: `2dc481c79f9ee9e762f1887f69ffc765f00042e6cf2e7ec8cc3fc3ef57b76d56`
- Store/FX connected `11149763763`: `ba13a96c3fe84453be88ed9a377f67b1729beabf3ae6d4daaf2daae6eb5df5e3`

Final-head Store atomic-settlement job `110289514790` initially failed before
tests because Docker could not bind host port 54322 (address already in use).
Four sibling jobs passed. Only the failed job was retried with unchanged source:
`110295103959` passed in run `36837851844`. This infra failure is retained and
no source, test, timeout or workflow was changed. Historical Player failures
above remain recorded; passing combined-source qualification is not proof of
their exact root cause or a claimed browser fix.

Local exact-merge acceptance 95, lifecycle 1 and Player World 23 re-passed.
Merged-main verification: all 16 observed exact-merge workflows are terminal,
15 successful and one expected Edge-inventory skip. Across their jobs: 33
successful and seven expected skips (two Edge inventory, four release/live-parity,
one dependency review). No failure or pending job. These conditional skips do
not confer deployment/live-runtime certification. The exact merge has no separate
Vercel status; accepted PR head Vercel passed as recorded above.

Distinct exact-main backend artifacts from run `36840377560` (GitHub-reported
SHA256, not locally downloaded):
- typecheck `11151411828`: `97c1270a30dbe63f75f588368d4d1acbe164440726b55965e4f00f825380ecf7`
- smoke `11151118011`: `f41a28ab951603eb97aa2067ff5345a78c693d9f8f2db07ac736eb040106d4a2`

- Push on main: [run 36840452973](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36840452973), success
- Edge Function Inventory Convergence: [run 36840377505](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36840377505), skipped
- Runtime Interaction Wiring: [run 36840377499](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36840377499), success
- Required Game Market Timezone: [run 36840377623](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36840377623), success
- Beta Security Contract: [run 36840377492](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36840377492), success
- Production Git Release: [run 36840377607](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36840377607), success
- Beta Pilot Contract: [run 36840377674](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36840377674), success
- Supply Chain Security: [run 36840377500](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36840377500), success
- Business Timed Manufacturing V2: [run 36840377612](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36840377612), success
- Backend Typecheck: [run 36840377560](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36840377560), success
- Business Store Seller Offers V2: [run 36840377638](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36840377638), success
- Business Store Withdrawal Safety V2: [run 36840377656](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36840377656), success
- Business Store Listing Inventory V2: [run 36840377668](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36840377668), success
- Business Player Store Cutover V2: [run 36840377629](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36840377629), success
- Repository Quality: [run 36840377293](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36840377293), success
- Business Store Atomic Settlement V2: [run 36840377339](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36840377339), success

Closeout edits only this record, REF-029 task and its own backlog entry. No
runtime, inventory, authority, workflow, package or other task changes. REF-029
is repository-complete; wider ARCH-401 and production gates remain separate.
Next: independently owned REF-032 integration/qualification after this closeout;
REF-025/030 ownership gates stay unchanged. No successor receives automatic
implementation authority from this evidence.
