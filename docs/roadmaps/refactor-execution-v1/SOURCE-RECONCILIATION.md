# Source reconciliation and limitations — 2026-09-22

## Exact source observed

GitHub `main` resolved to `196b88e6dec9fc951ae0e690fe96057d67bf7bf5`, tree `ac2fd0125af42c9015f9eae325dccc1eff6cabc3`. The preceding conversation's module scores and deletion percentages are informal estimates, not measured dead-code totals, test-coverage results or acceptance targets. Do not copy those percentages into deletion scripts.

The committed architecture inventory is a broad static candidate inventory. Its baseline metadata and historical narrative do not by themselves prove it has been rerun for the execution SHA. REF-001/003 must recompute and reconcile it. A `fallback` token can be a normal default; a MutationObserver can implement accessibility; a 500-line test is not a 500-line production monolith. Tests, fixtures, generated files, applied migrations and historical archives must be counted separately from reachable production source.

## Source facts used to scope the tickets

- `backend/src/domains/players/index.ts` already exports the context factory, scope checks, route segmentation and active-session helpers. REF-016 adopts these existing exports; it does not create another Players facade or context model.
- `backend/supabase/functions/admin-api/compatibilityOperations.ts` already invokes local Contract, Store, Player archive and Settings application operations. Do not repeat those migrations from the older structured-refactor roadmap.
- `backend/supabase/functions/admin-api/gameRoutes.ts` still forwards Contract progress GET, three Contract-review path families, reward issuance and Player access-code reset through `proxyClassroom`. REF-007–010 target those exact residual boundaries. A fresh route census must confirm all additional callers before retirement.
- `backend/supabase/functions/admin-api/common.ts` and its tests still contain `proxyClassroom`. Removing one call does not prove the helper or Classroom runtime is unused.
- `backend/package.json` registers numerous domain suites through `supabase/functions/classroom-api/deno.json` while neutral `supabase/functions/deno.json` also exists. Configuration migration must preserve effective compiler/import/lock/permission behavior.
- `player-terminal/package.json` identifies a source-owned JavaScript terminal and explicit verification/read-ordering/realtime/recovery/browser scripts. Do not invent a root Next.js application or replace the framework as cleanup.
- `docs/roadmaps/econovaria-architecture-hardening-roadmap-v2.md` supersedes stale assumptions in the older structured roadmap and records already-completed inventory, ratchet and context tranches. Preserve their work.

These are source observations, not fresh production-health assertions. Read the source at the exact execution commit before implementing a ticket.

## Open work observed; recheck, do not assume

| PR | Branch | Relevance |
|---|---|---|
| #668 | `refactor/multi-game-bootstrap-context-hydration-v1` | Existing ARCH-100F/context and global-ledger ownership; conflicted/stale ownership needs reconciliation, not replacement |
| #624 | `fix/player-ui-css-convergence-20260817` | Player CSS ownership; do not fold its visual changes into data-plane cleanup |
| #690 | `docs/living-world-roadmaps-v1` | Living World/DELIGHT planning; still separate from refactoring |
| #730 | `fix/phase15-certification-controls-v1` | Existing Phase 15 provenance/control work |
| #731 | `phase15/final-certification-repair` | Existing final-certification work; reconcile overlap with #730 rather than creating a third release owner |
| #735 | `fix/production-web-session-canonical-origin-v1` | Production origin and release-trigger changes; a docs refactor must not trigger these |
| #736 | `fix/player-service-role-key-v1` | Player service-role source repair; an open PR is not production resolution |

PR bodies contain historical runtime observations; this publication did not independently query Supabase/Vercel logs, run authenticated production probes, prove quiet windows or execute the application test suites. Public clone/archive access was unavailable in the authoring environment; source inspection used connected GitHub reads. The initial read sets are grounded starting points, not claims of a full transitive call-graph audit. REF-001–005 supply execution-time evidence before code work.

## Source references

Use the frozen main SHA above with these repository paths: root `AGENTS.md`, `CONTRIBUTING.md`; the beta/architecture roadmaps; `docs/architecture/inventories/econovaria-architecture-inventory-v2.json`; `backend/src/domains/players/index.ts`; `backend/supabase/functions/admin-api/compatibilityOperations.ts`; `backend/supabase/functions/admin-api/gameRoutes.ts`; `backend/supabase/functions/admin-api/common.ts`; `backend/supabase/functions/classroom-api/README.md`; `backend/supabase/functions/player-api/runtime.ts`; root/backend/Player package manifests; and the seven PRs listed above. Git history and current source outrank stale summary prose.
