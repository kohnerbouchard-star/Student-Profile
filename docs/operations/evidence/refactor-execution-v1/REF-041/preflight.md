# REF-041 — Inventory shared read lifecycle qualification

Status: IN_PROGRESS; verification-only disposition, not completion or deployment.
Base: `900ab8691959dca8cb9279fde871de711355abed`. Risk R2; dependency REF-005
is VERIFIED_COMPLETE. Ticket maps ARCH-500/502; actual Player client belongs to
ARCH-501. This qualification does not rewrite the wider architecture ledger.

## Scope and ownership

On 2026-10-01, live PR search found #801 Stock extraction and protected
#624/668/690/730/731/735/736. #624's changed-path audit includes main.js,
player-invalidation-controller.js, realtime-freshness.mjs and CSS, not the
Inventory read suite or shared API implementation. Preserve all those paths.

Exact meaningful edit allowlist (ten maximum; fewer than 400 semantic lines):
- `player-terminal/tests/inventory-read-model.mjs`
- `.github/workflows/backend-typecheck.yml` (exact Inventory test filters only)
- this evidence record
- `docs/roadmaps/refactor-execution-v1/tasks/REF-041.md`
- `docs/roadmaps/refactor-execution-v1/backlog.json` (REF-041 only, parent integration)
- the PR-specific Player cross-cutting authority (after draft number is known)

Generated architecture inventory is separate and serialized by the parent.
No production source, package/lock, backend, schema, UI or protected owner
files change. One existing workflow receives exact test-path filters only. Existing inventory-read runs in Player verify and its CI.
Stop on baseline failure, ownership collision or any need for runtime changes.

## Existing owner and invariants

PlayerApi.request owns stable GET:inventory:/inventory cache identity, freshness,
concurrent deduplication, caller/session abort composition, sessionVersion and
readGeneration rejection, and identity-safe in-flight cleanup. loadResources
owns unique-key dispatch, supported-resource gating and frozen shared status.
Inventory does not duplicate this lifecycle; another helper would add needless
indirection. Empty successful reads remain ready; failures are unavailable,
never fabricated success. Feature/read-model adapters normalize values only.

GET /inventory maps to GET /players/me/inventory. No endpoint, request shape,
normalization, auth, capability, retry, polling, preview or display policy changes.
Existing six focused suites passed before characterization. Qualification uses
synthetic adapters and deferred responses, not staging or browser interaction.

## Validation

Pinned Node 22.23.1/npm 10.9.8. Baseline: read-ordering, connected-reads,
session-browser-safe, inventory-read, recovery and runtime-integration pass.
Final expanded Inventory suite and complete Player verify pass. Architecture,
80 high-priority boundaries, legacy-runtime, interaction-wiring, secrets and
root npm test pass. Root first attempt lacked the existing pinned root modules;
linking the unchanged installed dependencies resolved that environment issue.
Backend TypeScript passes; Edge typecheck and complete smoke are BLOCKED by
refused esm.sh download of pinned Supabase 2.108.2. Existing Store Cutover CI
runs every Edge root; full backend smoke remains explicitly not completed locally. No dependency or network control was changed.
No live credentials, data queries, runtime deployment or production proof.

Rollback is a normal revert of qualification tests/evidence only. Other resource
owners are unchanged. REF-042 remains a separate #624 ownership-gated task.


## Measured qualification and review boundary

Added 146 lines to the existing Inventory suite, including explanatory comments.
Measured adapter requests: concurrent/duplicate/fresh cache 1; invalidation with
out-of-order stale completion 2; caller abort, logout and game switch 2 each;
failed read followed by authoritative empty recovery 2; manifest denial 0.
A transport deliberately ignoring abort still rejects old-session completion
and preserves the new in-flight operation (2 reads).
Statuses, abort propagation, cache keys, cache emptiness after denial/cancellation
and settled in-flight bookkeeping are asserted. Existing normalization, item
policy, currency, privacy, session/browser-safe, preview/recovery and runtime
integration tests remain in the unchanged owning verify chain.

Production source delta 0; lifecycle owners 1 before/after; new helpers/caches 0.
Inventory source normalization functions remain separate adapters, not competing
request lifecycle owners. Scan denominator remains 1,265 files, with 99 oversized,
162 cross-domain deep imports, 52 persistence-outside-infrastructure and 209
compatibility markers; generated inventory is byte-identical. No ceiling change.

Draft PR #803 reserves this bounded qualification. Exact-path authority is
`docs/operations/contracts/player-cross-cutting/pr-803.json`; verifier and tests
remain untouched. Six meaningful files, no generated change, below 400 semantic
lines. Exact-head CI/independent review are pending. Parent owns
normal merge and one integration after the separate REF-038 closeout. Local fixture
checks are not hosted browser, authenticated staging or production evidence.


CI scope binds the four mandatory Player contracts and all six Store Cutover
jobs, including every Edge root, serial/race/isolation, twice replay/lint,
Chromium and connected synthetic journeys. The older Store FX final workflow
is not triggered by this scope; authority uses actual Store Cutover job IDs.
CONTRIBUTING still requires complete backend smoke. After scope review, add only
the exact Inventory test path to Backend Typecheck's PR/main-push filters and
one explanatory comment. Its existing full smoke/typecheck commands, enforcement,
permissions and jobs are unchanged. No deployment dependencies or workflow_run
consumers exist for this workflow. Exact-head backend-typecheck is mandatory;
its smoke result cannot be replaced by focused Store checks or local network
limitations. This approved wiring makes six meaningful files, below the budget.


## Exact-head qualification and serialized integration

Initial complete head `d812fb2c730a82c8b15340d1b7d64b098c380dc8` passed all
16 observed workflows. Backend Typecheck `36865981821` specifically passed
full smoke enforcement. Player Verify `36865981732` and all six Store Cutover
jobs in `36865981785` passed, including Chromium and connected/database gates.
Multiplayer `36865981747` attempt 1 failed on a zero-byte 503 from
GET /players/me/story-deliveries in the World/Marketplace browser journey;
connected Inventory redemption had passed and 30/40 load was not run. Runtime
was unchanged. One failed-job-only retry on the same head passed every journey
and the required 30/40 load (attempt 2). This resolves the check, not a proven
root cause; no assertion or retry policy was weakened and no runtime was patched.

After REF-038 closeout, integrate main
`e0f4f59b23c6bb1f398288f572308d11f5be4885` once by normal merge. Retain its
Stock source, tests, evidence and manifest records. Inventory regeneration is
unchanged. Fresh combined-head CI is required; prior-head success is not reused
as combined-head evidence. Parent retains independent review and merge authority.
