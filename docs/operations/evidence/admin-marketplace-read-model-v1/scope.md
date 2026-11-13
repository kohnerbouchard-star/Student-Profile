# Admin Marketplace read-model extraction

## Scope and ownership

- Intake ID: `ARCH-LARGE-ADMIN-MARKETPLACE-001`.
- Status: `IMPLEMENTED_NOT_MERGED`, local preparation only, 2026-11-13.
- Owner branch: `refactor/marketplace-controller-read-model-20261113`.
- Exact main base: `7d49ad1db7fb2a45c2413e99672c7c72cee9b4e7`.
- The owner requested batch refactors of large files while preserving ongoing work. Fresh open-PR inspection found #624, #668, #731, #735, #933 and #938; none owns this controller or its tests. Contracts, World, Attendance, roster, Player styling, runtime ownership and release work remain outside this batch.
- This is a bounded frontend module extraction, not the Marketplace backend convergence program. It does not close `ARCH-100N`, `ARCH-204`, any global beta item, or any hosted/release gate.

## Implementation

- `admin/v2/src/routes/marketplace/MarketplaceController.js` retains request cancellation, permission checks, loading state, idempotency, mutation deduplication, authoritative refresh, filters and view lifecycle. It decreases from 553 to 267 physical lines.
- `MarketplaceReadModel.js` owns the existing pure snapshot normalization, public-ID filtering, display sanitization, policy bounds, dispute projection and immutable read model in 293 physical lines. Every normalization function body is unchanged.
- The existing controller normalizer export remains available and is the exact same function. A frozen listing-status array supplies the two private Sets; status values and ordering are unchanged.
- No UI, network contract, API, persistence, dependency, workflow, database, gameplay, deployment or production change.

## Evidence

- Node 22.23.1 and npm 10.9.8. Both root/backend lockfile installs succeed with `--ignore-scripts` and a writable temporary npm cache.
- Owning Marketplace suite: 15/15 passed, including eight new characterization tests imported by the already-registered suite. Covers old/new import identity, envelopes, invalid responses and IDs, privacy, fractional amounts, policy bounds, dispute resolution projection, collection limits, immutability and input non-mutation.
- Complete Admin v2 suite: 254/254 passed.
- Complete root `npm test`: passed with the deterministic per-batch inventory temporarily staged. The inventory is intentionally excluded from this independent implementation commit and must be regenerated on the combined integration tree before publication or repeating the composite gate.
- Official static builder: passed using synthetic local staging configuration only; emitted controller and new module match source bytes. No deployment occurred.
- Syntax, secret scan and staged diff checks: passed.
- Independent review: no blocking findings. Exact-base comparison confirmed byte-identical normalizer and retained controller function bodies, preserved public export, no dependency cycle and recursive build asset inclusion.
- Deterministic inventory for this batch: 1,353 to 1,354 source files; 93 to 92 oversized files; all other debt counters flat. The inventory counts a trailing empty line, so its original controller count is 554 rather than the physical-line count 553. Shared inventory/roadmap integration is deferred to the batch coordinator, preserving active ownership.

## Validation holds and next step

- Backend `typecheck:all` and full smoke were attempted with Deno 2.9.3 and the frozen repository lock. Both stop when the existing `https://esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs` import returns connection refused. Earlier smoke groups passed, but neither full backend gate is certified. No dependency pins or locks were altered.
- Browser smoke is unverified: the official pinned Playwright Chromium installer failed with a truncated ZIP / missing end-of-central-directory signature. Static copying and source tests are not browser evidence.
- Hosted checks, publication, merge and production remain unperformed. Preserve the required qualification gates.
- Before integration, refresh main and active owners, carry this source/test delta forward, add the intake record through the global roadmap owner, regenerate the one combined architecture inventory and rerun the applicable combined-tree checks. Then complete browser/backend verification when the official dependencies are reachable.
