# Econovaria bounded refactor backlog — entrypoint

**Status:** PLANNED; documentation publication only.  
**Observed source:** main `196b88e6dec9fc951ae0e690fe96057d67bf7bf5` (2026-09-22).

Start at [the 50-task execution package](refactor-execution-v1/README.md). It contains individual REF-001–REF-050 specifications, explicit dependencies/owner gates, permitted source boundaries, implementation sequences, behavior-preservation tests and rollback/removal conditions.

The [machine-readable backlog](refactor-execution-v1/backlog.json) and [single-ticket Codex instruction](refactor-execution-v1/CODEX-PROMPT.md) support sequential execution. Begin with REF-001, not a whole-repository rewrite request.

This package decomposes the existing [architecture-hardening roadmap](econovaria-architecture-hardening-roadmap-v2.md). Root AGENTS.md and the [beta completion ledger](econovaria-beta-completion-roadmap-v1.md) retain authority. [Scoped intake](refactor-execution-v1/SCOPE-INTAKE.md) preserves the existing controller's ownership and requires reconciliation before code implementation. Do not recreate completed architecture work or absorb in-flight auth, context, UI, Living World or Phase 15 changes.

No runtime source, SQL, applied migration, workflow, secret, cloud configuration or production release request is changed by this documentation package. Publication is not refactor implementation, merge authorization or production certification.
