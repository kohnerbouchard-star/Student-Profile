# Reusable single-ticket Codex instruction

Replace only the selected ID. Start with REF-001; do not paste the whole 50-task backlog as one implementation request.

```text
Work on Econovaria repository kohnerbouchard-star/Student-Profile.
Selected work package: REF-001.

Read root AGENTS.md and CONTRIBUTING.md, the authoritative beta/controller ledger,
docs/roadmaps/econovaria-architecture-hardening-roadmap-v2.md, and:
docs/roadmaps/refactor-execution-v1/README.md
docs/roadmaps/refactor-execution-v1/SOURCE-RECONCILIATION.md
docs/roadmaps/refactor-execution-v1/SCOPE-INTAKE.md
docs/roadmaps/refactor-execution-v1/EXECUTION-CONTRACT.md
docs/roadmaps/refactor-execution-v1/VALIDATION.md
docs/roadmaps/refactor-execution-v1/backlog.json
docs/roadmaps/refactor-execution-v1/tasks/REF-001.md

Fetch current main. Do not assume the planning SHA is still current.
Inspect open PRs and reuse the live owner branch where applicable. Resolve the
selected ticket's dependencies, incident blockers and exact editable-file set.
Do not take global-ledger ownership from its existing controller.

Execute only the selected bounded ticket when its gates permit. If already
implemented, prove it and record verification-only disposition; do not recreate it.
If blocked, produce the specific evidence and smallest next action without changing
unrelated files. If scope exceeds 15 meaningful source/test files or one conceptual
change, specify child tickets before editing instead of expanding silently.

Preserve routes, auth/context/privacy, atomic RPCs, currency/ledger/inventory
invariants, gameplay, UI and release controls. Never convert one SQL transaction
into multiple JavaScript writes. Never infer dead code from names or import counts.

Use existing tests and exact-head evidence. Report passes, failures and tests not run
separately. Do not weaken assertions or substitute another commit's results.
Publish a bounded draft PR with implementation paths, before/after measurements,
remaining callers, evidence, blockers and next exact ticket. Do not merge, deploy,
modify live databases/secrets/jobs or advance to another ticket unless separately
authorized. Do not call a draft/local/fixture-only result VERIFIED_COMPLETE.
```

For a later ticket replace REF-001 in both the selection and task-file path. Keep the shared contract intact. A planning chat can prepare the next scope, but it must not certify results it has not inspected.
