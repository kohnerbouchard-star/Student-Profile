# Portfolio disclosures: bounded T048 slice

Base: main `03adc6891995fe1d780fe34629b1daf14470ea39`.
Reviewed implementation: `1a3bf677e`; independent re-review accepted the finite
computed-percentage guard and reran all five focused tests successfully.

## Behavior

Returns without a valid positive computed basis, or with nonfinite inputs or
results, render `Return unavailable`; positive-basis zero P&L preserves `+0.00%`.
An absent explicit basis still uses the quantity-times-average-cost fallback. Empty unavailable reads
say positions unavailable, not no active holdings. Retained counts are labeled
last loaded. No financial calculations, persistence, credentials or write paths
change. Upstream missing-value normalization is explicitly out of scope.

## Exact scope

- player-terminal/src/features/market/portfolio-positions-view.js
- player-terminal/tests/portfolio-positions-disclosures.mjs
- player-terminal/tests/browser/portfolio-disclosures.spec.mjs
- player-terminal/package.json (register regression in existing market-holdings gate)
- docs/roadmaps/econovaria-beta-completion-roadmap-v1.md
- this evidence file
- PR-bound cross-cutting verification authority and exact integrated roster pins

No workflow/filter/assertion reduction. No production deployment, DB access,
quota change, merge or feature-completion claim.

## Evidence

Focused holdings reconciliation, five disclosure tests, and Player smoke pass.
Initial aggregate attempts lacked dependencies. Lockfile-only root, backend and
Player installs subsequently succeeded with Node22.22.2/npm10.9.8; aggregate
results are recorded below when complete. Browser specs are renderer DOM checks,
not visual qualification; local Chromium aborted before all four cases executed,
including an approved retry (SIGABRT/ptrace permissions). Browser remains pending.

After lockfile installs: root `npm test` PASS; full Player `verify` PASS. Backend
TypeScript check passes, but aggregate `typecheck:all` remains blocked at the
Deno Edge check (spawn deno ENOENT). No backend aggregate pass claimed.

## Approved draft publication

Draft PR #1015 publishes reviewed source `630faf392d2fac8d7c58b8e9fad189cca0e8bbbe`,
exact reviewed tree `97af219d22dba4018ebaeb098df8edf52ef07245`. PR-specific
authority locks eight changed paths plus two read-only verifier/test paths,
25 naturally applicable workflow families and all executable PR job identities.
Only the three existing guarded manual staging/release/parity jobs are excluded.
Final integrated roster pins must reference the metadata-complete public source
in a separate pin-only child; no runtime or gate weakening.
Hosted exact-head checks remain pending. No merge, deployment or live acceptance.
