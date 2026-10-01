# REF-030 — Contract submission adapter

Status: IN_PROGRESS. Base: `c799110e2d89d76c7d013ae49adce50c22b6c81e`.
Dependency REF-029 is verified. Maps to ARCH-208/ARCH-400; risk R3.
Open-owner recheck 2026-10-01: #736 `8070f58d4145951d8aee3e74a2b1e00d90c54385`
and #668 `faaf908bdd5131b451c7e87e91ed4991ad8f839d` remain unchanged.
No submit owner competes; #790 owns independent World tests.

## Explicit child split and edit boundary

Qualification plus extraction exceeds the 400 semantic-line review threshold.
The approved split preserves all 50 parent IDs; parent completion requires both:
- REF-030a: real disposable PostgreSQL baseline qualification. Edit only
  `scripts/ref-030-submission-acceptance.ts`, the existing
  `.github/workflows/ref-018-attendance-qualification.yml`, these task/evidence
  records, REF-030's backlog entry, and a PR-specific authority if required.
- REF-030b: after accepted baseline, mechanically move bounded body parsing and
  Story classification/validation to internal `playerContractSubmissionAdapter.ts`;
  edit its existing HTTP caller and registered submission tests, evidence/backlog,
  exact PR authority and generated inventory only. No package edits.
Each child stays below twelve meaningful files and 400 semantic lines.
Global ledger, SQL/migrations/triggers, auth/context, eligibility, repository
writes, roleplay renderer, browser, dependencies and production remain protected.

## Source reconciliation and invariants

Older ticket wording suggests separate Contract/Story dispatch. Current source
has one authoritative `upsertPlayerContractProgress` for BOTH modes. Story capture
is the existing AFTER trigger `capture_player_story_decision_v1`; roleplay is
optional best-effort AFTER commit. No second Story write is permitted.
Body parsing precedes session lookup; Story semantic validation follows auth and
availability, before progress lookup. Null/absent evidence becomes an empty object.
Whitespace is trimmed for validation only; progress stores original payload.
SQL normalizes the captured option/rationale. Same-option retry can update rationale;
different-option retry fails atomically. There is no request nonce/receipt to invent.
Qualification must prove actual trigger effects, same-choice retries, changed-choice
rejection, concurrent upserts and rollback, not claim mock traces are DB evidence.

Baseline local acceptance: 95 passed, zero failed with pinned Node 22.23.1,
npm 10.9.8, Deno 2.9.3 and frozen lock. Docker/psql absent locally; real DB proof
must come from the existing exact-head disposable GitHub qualification workflow.
Existing Story Replay Safety is unit/static, not a substitute. Missing proof blocks
extraction/completion. Runtime baseline failure or necessary policy change stops work.
Rollback: revert the bounded code/harness PR; never alter stored Story data.

REF-030a local qualification-source check passes using the owning neutral Deno
configuration. Root npm test, acceptance 95/95, lifecycle 1/1, architecture,
high-priority boundaries, legacy-runtime, secrets, YAML and diff checks pass.
Independent static review corrected the fixture source_type to the existing
teacher enum and strengthened race winner, rationale-edit and error assertions.
This is not yet a real database pass. Existing schema/transaction behavior is
unchanged; no clean production or hosted-runtime certification is implied.

## Accepted REF-030a database baseline

Qualification head `ef5af7d62a02ae3c45f81ab118852dcd17186f2d`, tree
`e9faeee2efa10f334302775786d40342ce8860c5`, passed all eight triggered workflows.
[Run 36844450147](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36844450147),
job `110311580486`, passed full migration replay, backend typecheck/smoke,
existing economic qualifications and the new actual submission/trigger harness.
The harness snapshots 208 game-scoped tables; both definitions, preserved raw
payload, same-choice retry, permitted rationale edits, rejected choice changes,
normal submission, cross-game isolation, renderer failure after commit, injected
post-relationship rollback/retry and both races passed. Each race observed two
real database lock waiters before releasing the held progress row.

[Artifact 11153176138](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36844450147/artifacts/11153176138)
was downloaded and independently SHA256-verified:
`a2c3764a1f772518c3493da3a6fe1c64cde187ab19f8e4f37945f1cec5b51795`.
Its source-bound qualification JSON reports pass. Lint parity preserves 142
existing findings including 17 errors, with no additions/removals; this does not
certify a clean database. Static review approved the exact tree after correcting
a test-only same-choice replay timestamp assumption. Auth context is synthetic
and injected; real hosted authentication and production are not exercised.
