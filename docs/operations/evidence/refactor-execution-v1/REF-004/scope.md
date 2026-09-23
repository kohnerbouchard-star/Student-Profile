# REF-004 continuation scope

Owner: existing PR #742, `refactor/ref-004-behavior-parity-fixtures`. Verified main: `53c29cbda56d2f7457b43743ea4ce553bb6659ce`. Continuation head: `31ab2df9958c44ad9e8d2e052df940666dcfa2e5`. Risk R1; ARCH-300/ARCH-400. REF-002 is the accepted dependency. Preserve REF-003 and every other task/dependency.

The continuation preserves the already-published request characterization and completes the selected Contracts and Player credential handler fixtures. It adds no application implementation, transaction, route, runtime registry, production record, dependency or workflow.

## Exact editable paths

- `backend/tests/admin/ref004RequestParity.test.ts`: relocate the existing request fixture, changing only its relative import and explicitly documented fixture assertions.
- `backend/tests/domains/contracts/ref004Parity.test.ts`: selected Staff progress/review handler characterization.
- `backend/tests/domains/players/ref004Parity.test.ts`: Player credential handler characterization.
- `backend/supabase/functions/admin-api/common.test.ts`: additive imports registering these fixtures in the existing `test:admin-api` suite; retain every original test byte.
- `backend/supabase/functions/admin-api/ref004RequestParity.test.ts`: remove only the branch-added copy after preserving it at the test-only path.
- This scope, `parity-matrix.json`, `tasks/REF-004.md`, and only REF-004's existing backlog object.

The net merge diff is limited to eight meaningful test/evidence/metadata files, below the task's ten-file ceiling. The original matrix's proposed source-tree leaf files are superseded by the domain-specific test directories above. No replacement branch is created.

## Why the fixture placement changes

At `31ab2df9`, Repository Quality run `35808299477`, job `107013900601`, failed the deterministic architecture-inventory check: the new test was counted as an additional source file, fetch shim and compatibility marker. Preserve that failed result. Isolate test-only source under `backend/tests/` and register it explicitly from the existing owning suite rather than raising architecture ceilings, weakening the scanner, or editing generated inventory to treat a synthetic fetch stub as new production debt. The tests remain visible in Git, the PR diff and suite output. This changes no production import or executable handler.

## Test boundaries and side effects

Use the actual Admin entrypoint and actual Staff handlers, with synthetic Auth/PostgREST/repository/credential dependencies. Capture `Deno.serve` without opening a listener. Temporarily substitute environment reads and fetch only inside the test worker and restore them in `finally`. Unexpected network destinations and unlisted persistence operations must fail. Do not execute archived applications, connect to a provider, or use real credentials.

Assertions preserve exact method/alias behavior, scope predicates, denial order, status/error envelopes, significant headers, opaque identifiers, credential aliases, monetary/currency values, invocation counts and sequential-write boundaries. Inject a fixed clock/material where supported. Do not pretend that fake RPC receipts prove SQL atomicity, that credential retries are idempotent, or that the older Staff reward implementation is the Admin atomic reward authority. Missing live/external evidence is not fabricated.

## Validation and publication

Run the existing Admin API, Admin local-mutation, Player Contract acceptance and relevant auth suites, then shared architecture/high-priority/legacy audits, secret scanning, root tests, backend typecheck/smoke and diff checks. Inspect exact-head CI logs and distinguish executed suites from unexecuted checks. Current container Git failed DNS resolution and the alternate source archive was unavailable; do not claim a full local checkout or local Deno run. Existing pinned full-checkout CI is the executable validation path. No temporary workflow or phone action is required.

No production deployment, release dispatch, SQL/migration, secret/cloud-setting change, or REF-005 implementation is authorized by this scope. Keep REF-004 IN_PROGRESS until actual acceptance and normal integration are established.
