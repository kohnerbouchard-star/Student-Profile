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
- this evidence record
- `docs/roadmaps/refactor-execution-v1/tasks/REF-041.md`
- `docs/roadmaps/refactor-execution-v1/backlog.json` (REF-041 only, parent integration)
- the PR-specific Player cross-cutting authority (after draft number is known)

Generated architecture inventory is separate and serialized by the parent.
No production source, package/lock, workflow, backend, schema, UI or protected
owner files change. Existing inventory-read runs in Player verify and its CI.
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
Final expanded suite, aggregate Player verify and shared guards pending.
No live credentials, data queries, runtime deployment or production proof.

Rollback is a normal revert of qualification tests/evidence only. Other resource
owners are unchanged. REF-042 remains a separate #624 ownership-gated task.
