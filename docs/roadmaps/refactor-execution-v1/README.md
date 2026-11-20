# Econovaria: bounded refactor execution backlog

**Program:** ECON-REFACTOR-EXECUTION-V1  
**Published planning date:** 2026-09-22  
**Observed main:** `196b88e6dec9fc951ae0e690fe96057d67bf7bf5`  
**State:** PLANNED — documentation publication, not implementation or release certification.

## Start here

This is the implementation-ticket decomposition requested by the product owner, not a replacement architecture or another feature expansion. Read root `AGENTS.md`, `CONTRIBUTING.md`, the authoritative [beta completion ledger](../econovaria-beta-completion-roadmap-v1.md), the [architecture-hardening roadmap](../econovaria-architecture-hardening-roadmap-v2.md), [source reconciliation](SOURCE-RECONCILIATION.md), [execution contract](EXECUTION-CONTRACT.md), [validation matrix](VALIDATION.md), and exactly one task below. Use the [Codex prompt](CODEX-PROMPT.md) to start a work session.

The existing modular-monolith architecture, same-origin Admin/Player BFFs, domain services and transactional database authorities remain the target. Do not introduce Next.js, microservices, a second ledger, another authentication system, a new frontend framework, or empty domain scaffolding merely to satisfy this backlog. The real roots include `backend/src/domains/`, `backend/supabase/functions/`, `admin/v2/`, `admin/`, `player-terminal/` and `frontend/`.

These are **50 primary work packages**, not a promise that exactly 50 PRs will remove all technical debt. Each package is one bounded seam. If the verified implementation exceeds its budget, split it into explicit children before editing; the parent cannot close until its children and evidence close. A task already satisfied on current main is a verification-only disposition, not an excuse to recreate its implementation. Remaining debt must be reported, not silently declared out of scope or deleted.

## Authority and active work

Root `AGENTS.md` and the beta/controller ledger retain completion and sequencing authority. This package refines existing ARCH items; it does not reopen completed ARCH-000/001 or supersede ARCH-100 ownership. [Scope intake](SCOPE-INTAKE.md) records this documentation request without taking the global ledger away from its active owner.

At publication, open work includes #668 (multi-game context and global ledger), #624 (Player CSS), #690 (Living World/DELIGHT planning), #730/#731 (Phase 15 controls), #735 (production origin/release triggers) and #736 (Player service-role binding). Recheck all of them before implementation; a PR title or historical status is not merge/runtime proof. Context/auth work must not overlap #668/#736. Release/workflow retirement must not overlap #730/#731/#735. No debt-cleanup task may absorb those changes as a donor patch.

Documentation, inventory and characterization can proceed without pretending production is healthy. Behavior-changing refactoring of an affected runtime waits for an accepted baseline and the relevant incident/owner gate. No merge, deployment, live SQL, credential change or runtime disablement is authorized merely by publishing this package.

## What every task contains

Each file gives its dependency IDs, risk, initial read set, bounded permitted edits, concrete implementation sequence, protected behavior, focused validation, evidence required for acceptance and a rollback/stop rule. The shared contract applies even when not repeated. Paths labeled **proposed** are new targets, not claims that they already exist. Initial read paths must be resolved against current main; a missing/renamed path is a reconciliation event, not permission to invent a replacement subsystem.

`backlog.json` is the machine-readable queue and dependency graph. All tasks start PLANNED, with no implementation/merge/evidence credit. The numeric order is the recommended serial order; explicit dependencies and ownership gates are mandatory. Do not run two tasks that own the same route registry, request context, package script, migration authority or browser transport concurrently.

## Task index

| ID | Bounded outcome | Risk |
|---|---|---|
| [REF-001](tasks/REF-001.md) | Exact-main baseline and owner gates | R0 |
| [REF-002](tasks/REF-002.md) | Route, import-root and browser-entrypoint census | R0 |
| [REF-003](tasks/REF-003.md) | Evidence-backed dead/legacy classification | R1 |
| [REF-004](tasks/REF-004.md) | Behavior-parity fixtures | R1 |
| [REF-005](tasks/REF-005.md) | Existing architecture ratchet extension | R1 |
| [REF-006](tasks/REF-006.md) | Neutral ownership of Messaging dispatcher | R2 |
| [REF-007](tasks/REF-007.md) | Local Admin Contract progress GET | R2 |
| [REF-008](tasks/REF-008.md) | Three Contract review aliases, one use case | R3 |
| [REF-009](tasks/REF-009.md) | Local Contract reward issuance | R3 |
| [REF-010](tasks/REF-010.md) | Local Player access-code reset | R3 |
| [REF-011](tasks/REF-011.md) | Neutral Deno test configuration | R2 |
| [REF-012](tasks/REF-012.md) | Explicit Attendance browser adapter | R2 |
| [REF-013](tasks/REF-013.md) | Explicit Player access-code UI adapter | R2 |
| [REF-014](tasks/REF-014.md) | Explicit Settings error lifecycle | R2 |
| [REF-015](tasks/REF-015.md) | First proven-unused Admin shim batch | R2 |
| [REF-016](tasks/REF-016.md) | Adopt existing Players public exports | R2 |
| [REF-017](tasks/REF-017.md) | Player roster repository seam | R2 |
| [REF-018](tasks/REF-018.md) | Staff Attendance repository seam | R3 |
| [REF-019](tasks/REF-019.md) | Player clock-in repository seam | R3 |
| [REF-020](tasks/REF-020.md) | Staff-login persistence seam | R3 |
| [REF-021](tasks/REF-021.md) | Economy ledger-history read port | R2 |
| [REF-022](tasks/REF-022.md) | Existing atomic ledger-adjustment command | R3 |
| [REF-023](tasks/REF-023.md) | Inventory reservation boundary for Crafting | R3 |
| [REF-024](tasks/REF-024.md) | Marketplace use of Inventory public ports | R3 |
| [REF-025](tasks/REF-025.md) | Business-banking/loan read boundary | R2 |
| [REF-026](tasks/REF-026.md) | Store purchase-handler persistence extraction | R3 |
| [REF-027](tasks/REF-027.md) | Retained Business creation compatibility containment | R3 |
| [REF-028](tasks/REF-028.md) | Contract availability policy separation | R2 |
| [REF-029](tasks/REF-029.md) | One Contract read-projection extraction | R2 |
| [REF-030](tasks/REF-030.md) | Contract/Story submission adapter separation | R3 |
| [REF-031](tasks/REF-031.md) | Country reference versus game projections | R2 |
| [REF-032](tasks/REF-032.md) | Scoped World-runtime read application | R2 |
| [REF-033](tasks/REF-033.md) | Pure Story-effect preparation | R3 |
| [REF-034](tasks/REF-034.md) | Existing Story-notification transaction boundary | R3 |
| [REF-035](tasks/REF-035.md) | One Messaging thread use case | R2 |
| [REF-036](tasks/REF-036.md) | Progression reward authority | R3 |
| [REF-037](tasks/REF-037.md) | Dashboard read composition | R2 |
| [REF-038](tasks/REF-038.md) | One pure Stock-engine calculation family | R3 |
| [REF-039](tasks/REF-039.md) | Stock-runner trigger/execution separation | R3 |
| [REF-040](tasks/REF-040.md) | Minimal generic Markets calculation exports | R2 |
| [REF-041](tasks/REF-041.md) | One Player read-resource lifecycle | R2 |
| [REF-042](tasks/REF-042.md) | Player Inventory invalidation | R2 |
| [REF-043](tasks/REF-043.md) | Admin Banking response/error adapter | R2 |
| [REF-044](tasks/REF-044.md) | Admin Contracts rendering extraction | R2 |
| [REF-045](tasks/REF-045.md) | Licensing worker/application boundary | R3 |
| [REF-046](tasks/REF-046.md) | Campaign scheduler/application boundary | R3 |
| [REF-047](tasks/REF-047.md) | Historical source archive and namespace reconciliation | R1 |
| [REF-048](tasks/REF-048.md) | Gated Classroom source-retirement preparation | R3 |
| [REF-049](tasks/REF-049.md) | One superseded hotfix workflow retirement | R3 |
| [REF-050](tasks/REF-050.md) | Exact-main module reassessment and scoped certification | R0 |

Risk is change risk, not a quality score: R0 documentation/read-only; R1 tooling or non-runtime evidence; R2 bounded read/UI/structural change; R3 authentication, money, inventory, state-machine, worker or release sensitivity.

## Coverage and preservation

The task map covers authentication, Players, game/session context, Attendance, Economy, Banking/FX, Business/loans, Store, Inventory, Crafting, Marketplace, Contracts, Countries, World, Storylines, Notifications, Messaging, Progression, Dashboard, Stocks/Markets, licensing, schedulers, both UIs and compatibility/tooling. Game Sessions, Arrival and generic reference data are preserved at the interfaces used by these tasks; do not manufacture work in already-clean domains. Audit/analyst/games namespaces are classified in REF-047, not deleted because a directory appears empty.

Business ownership, workforce, treasury, accounting, IPO and financial-market authority are protected, not rebuilt. Banking keeps Checking and Savings, currency identity, rounding and ledger semantics. Story/World and UI cleanup must preserve player choices, consequences, map interaction, accessibility and useful defensive fallbacks. New player-delight features remain under their own roadmap rather than being disguised as refactoring.

## Completion meaning

Success means verified behavior parity for completed seams, reduced measured coupling where targeted, evidence-backed removal decisions and a smaller unresolved register. It does not mean an invented 9/10 architecture score, a fixed deletion percentage or a production-ready claim based on a build/health endpoint. REF-050 reports every remaining blocker, retained compatibility dependency and module not deeply inspected. Repository acceptance and production acceptance remain separate.
