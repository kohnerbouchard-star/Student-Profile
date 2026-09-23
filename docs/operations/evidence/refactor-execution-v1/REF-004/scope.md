# REF-004 continuation scope

Owner: existing PR #742, `refactor/ref-004-behavior-parity-fixtures`. Verified main: `53c29cbda56d2f7457b43743ea4ce553bb6659ce`. Continuation starts from `31ab2df9958c44ad9e8d2e052df940666dcfa2e5`. Risk R1; ARCH-300/ARCH-400. REF-002 is the accepted dependency. Preserve REF-003 and every other task/dependency.

The continuation preserves the already-published request characterization and completes the selected Contracts and Player credential handler fixtures. It adds no application implementation, transaction, route, runtime registry, production record, dependency or workflow.

## Exact editable paths

1. `backend/tests/admin/ref004RequestParity.test.ts`: existing request fixture relocated out of application inventory roots; retain its behavior assertions.
2. `backend/tests/domains/contracts/ref004Parity.test.ts`: selected Staff progress/review handler characterization.
3. `backend/tests/domains/players/ref004Parity.test.ts`: Player credential handler characterization.
4. `backend/supabase/functions/admin-api/common.test.ts`: additive import registering only the Admin request fixture in `test:admin-api`; preserve all original assertions.
5. `backend/src/domains/contracts/api/playerContractAcceptanceRoutePaths.test.ts`: additive import registering the Contract fixture in the existing strict `test:player-contract-acceptance` suite; preserve every original test.
6. `backend/src/domains/players/api/playerRequestScope.test.ts`: additive import registering the credential fixture in the existing strict `test:player-request-scope` suite; preserve every original test.
7. `docs/operations/evidence/refactor-execution-v1/REF-004/scope.md`.
8. `docs/operations/evidence/refactor-execution-v1/REF-004/parity-matrix.json`.
9. `docs/roadmaps/refactor-execution-v1/tasks/REF-004.md`.
10. `docs/roadmaps/refactor-execution-v1/backlog.json`: only REF-004's existing object.

The net merge diff is limited to these ten meaningful test/evidence/metadata files, at the task ceiling. The earlier branch-added `backend/supabase/functions/admin-api/ref004RequestParity.test.ts` is removed only after its fixture is preserved at path 1. The matrix's original proposed source-tree leaf files are superseded by the test directories above. No replacement branch is created. Existing package scripts, compiler configuration and permissions are unchanged.

## Executed integration findings

At `31ab2df9`, Repository Quality run `35808299477`, job `107013900601`, failed the deterministic architecture-inventory check: the new source-tree test was counted as an additional source file, fetch shim and compatibility marker. Preserve that failed result. Isolate test-only source under `backend/tests/` and register it explicitly from existing suites rather than raising architecture ceilings or changing the scanner. Tests remain visible in Git, PR diff and suite output. This changes no production import or executable handler.

At `f1363fc93329f273eb0a153c890642c38391cbd0`, Repository Quality passes after relocation, but Admin API run `35812173054`, job `107025919291`, rejects the new leaf imports under Admin's relaxed compiler configuration. Its ten discriminated-union errors occur in unchanged Staff handler/service code. Correct suite ownership: Admin request fixtures use Admin config; Staff Contract and Player credential fixtures use their existing strict domain suites. No `--no-check`, source suppression, compiler-option change or production-source repair is permitted. The failed attempt is retained, not relabeled as runtime test execution.

## Test boundaries and side effects

Use the actual Admin entrypoint and actual Staff handlers, with synthetic Auth/PostgREST/repository/credential dependencies. Capture `Deno.serve` without opening a listener. Temporarily substitute environment reads and fetch only inside the test worker and restore them in `finally`. Unexpected network destinations and unlisted persistence operations must fail. Do not execute archived applications, connect to a provider, or use real credentials.

Assertions preserve exact method/alias behavior, scope predicates, denial order, status/error envelopes, significant headers, opaque identifiers, credential aliases, monetary/currency values, invocation counts and sequential-write boundaries. Inject fixed clock/material where supported; where the identifier-only handler exposes no clock injection, assert its timestamp against the execution interval rather than scrubbing it. Fake RPC receipts do not prove SQL atomicity; credential retries are not assigned invented idempotency; the older Staff reward implementation is not substituted for Admin's existing atomic reward authority.

## Validation and publication

Run existing Admin API, Admin local-mutation, Player Contract acceptance, Player request-scope and relevant auth suites, then shared architecture/high-priority/legacy audits, secret scanning, root tests, backend typecheck/smoke and diff checks. Inspect exact-head CI logs and distinguish executed suites from unexecuted checks. Container Git failed DNS resolution and the alternate source archive was unavailable; no complete local checkout or local Deno execution is claimed. Existing pinned full-checkout CI is the executable validation path. No temporary workflow or phone action is required.

No production deployment, release dispatch, SQL/migration, secret/cloud-setting change, or REF-005 implementation is authorized by this scope. Keep REF-004 IN_PROGRESS until actual acceptance and normal integration are established.
