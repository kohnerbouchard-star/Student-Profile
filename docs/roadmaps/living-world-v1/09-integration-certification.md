# INT — Cross-track integration and final certification

Status: **PLANNED** · Baseline: `22dc9ce5023eb200a6608d5bb90a9ac30cb36c90` · Planning date: 2026-09-20

## Intended result

Deliver useful experiences incrementally and distinguish completed code from a certified runtime.

## Verified starting point and limits

These are proposed program gates, not existing completed phases. Keep Phase 15’s release evidence and authorization requirements intact.

## Ownership and integration boundaries

A single integration owner coordinates cross-track acceptance and shared-file merges. Domain owners retain their state and commands.

## Candidate records and interfaces

Versioned scenario fixture, exact-source evidence manifest, defects ledger and release mapping.

No new runtime command authority is created by these milestones.

## Content and fixture scope

Use synthetic players and approved fictional-world content.

## Explicit exclusions

No claim of production readiness from unit tests, documentation, fixture-only screenshots or a simulated 365-day run.

## Milestones

### PILOT-01 — Prove the first complete four-week player journey

**Dependencies:** `LIFE-05`, `REL-04`, `WORLD-03`, `PROG-03`, `UX-05`, `MAC-02`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Run an accelerated four-week scenario in two contrasting countries. A player obtains a job, receives two or more pay periods, chooses housing, pays recurring costs, responds to a known route/price disruption, uses a character conversation and earns a practical qualification. Use the currently authorized macro/world model for active effects; candidate MAC-02 calculations remain shadow until MAC-07 is approved. This is the first coordinated product release target, not a requirement to finish all advanced finance first.

**Player and Admin experience.** Player and Admin journeys must both complete through supported interfaces. Include a second player competing for the same vacancy/housing and a returning player. Capture how the scenario changed the available choices, not merely a page count.

**Acceptance and adversarial tests.** Require canonical receipts, correct balances/custody, one effect per source, no cross-game leakage, no impossible offer, a non-borrowing recovery option and manageable notifications. Run loss-of-response and worker-restart variants.

**Exit gate.** A small coherent game loop is accepted before adding more countries, products or content volume. Simulated scenario duration is not a delivery-time estimate.

### SYSTEM-01 — Certify the seven-track program and hand off release evidence

**Dependencies:** `PILOT-01`, `LIFE-08`, `MAC-08`, `REL-08`, `WORLD-08`, `CAP-09`, `PROG-07`, `UX-08`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Re-audit the exact merged source and run all applicable retained and new gates. Reconcile definitions, migrations, active feature versions, queues, read models and ownership. Verify every accepted milestone against evidence rather than checklist prose. Test populated forward migrations and historical-read compatibility, then run authorized isolated staging and runtime checks under the release program. Document remaining exclusions and rollback/forward-remediation boundaries.

**Player and Admin experience.** Complete the whole player/admin loop with multiple games, late joiners, a pause, a content upgrade and a disruption/recovery cycle. Operations can find stalled work, disable new feature activity safely and preserve previously issued rights. Keep class learning outcomes separate from financial winnings.

**Acceptance and adversarial tests.** Require exact-source tests, migration replay, two-game isolation, canonical monetary/custody reconciliation, deterministic simulations, no unresolved critical defects, accessibility evidence, operational recovery and sanitized artifact provenance. Runtime verification must record actual environment, versions and observed results.

**Exit gate.** Repository-complete, merged, staging-certified and production-certified are separately evidenced. Production activation occurs only through the separately authorized release process; this roadmap never self-authorizes it.

## Source basis

**R1 — Fresh main branch resolution.** Resolved on 2026-09-20 to 22dc9ce5023eb200a6608d5bb90a9ac30cb36c90; not a runtime certification. Source: `https://api.github.com/repos/kohnerbouchard-star/Student-Profile/branches/main`.



---
