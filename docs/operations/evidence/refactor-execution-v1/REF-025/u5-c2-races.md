# REF025 disposable race phase — Child 1

APPROVED_SCOPE: user approved the disposable test method; parent controls review/merge.
Base: 7004ada7a0cd2a5138085a05ba0d0561b63d0819. Child 1: five paths, <=360 semantic changed lines.
- scripts/ref025-business-loan-concurrency.mjs
- scripts/ref025-business-loan-concurrency.test.mjs
- .github/workflows/banking-fx-clearing-v1.yml
- docs/operations/evidence/refactor-execution-v1/REF-025/u5-c2-races.md
- docs/operations/contracts/player-cross-cutting/pr-865.json (draft PR865).

Only banking-fx-clearing-v1/database-acceptance, attested exclusively disposable local database.
Reuse unchanged Store openPsqlSession; track backend PID/start, exact blocker, deadline, client/backend exit.
Child 1 keeps both gates installed; no committed business fixtures or submission calls.
Always full reset after attempted phase, then independent exact gate/migration/fixture verification.
Failures remain failures; cancellation/runner loss cannot guarantee restoration. No backend termination.
No hosted access, migrations/packages/shared helper/Player/Markets/auth changes or release-hold restoration.
PR859 remains superseded and unqualified: busy source (2 unidentified sessions), deadline/list-GUC/null-marker/cleanup gaps.
Its code is not imported. Original failure: run37255720724/job111592230701; local Docker capacity failure retained there.
PR620 overlaps only unchanged upload-artifact pins; PR863 and other open owners have no selected-path collision.
REF025 BLOCKED; REF027 depends025+026; all nine U1 holds remain. No production lending activation.
Implementation: scoped async wrapper plus harmless advisory-lock barrier and SQL-timeout probe; no fixture writes.
Local pinned Node22.23.1: focused tests and authority tests pass; scope/whitespace verification required before push.
CI must prove exact blocker PID/start, client/backend exit, full reset and independent restored gates/ledger checks.
Child1 fixture-absence checks assert zero nonlegacy applications/loans; future fixtures need their own registered checks.
No GUC copying, clone, marker-based ownership or atomic DROP claims. Existing background sessions are not terminated.
Next: exact-head Child1 qualification and parent review, then separately registered Child2; runtime evidence NOT_RUN until CI.
