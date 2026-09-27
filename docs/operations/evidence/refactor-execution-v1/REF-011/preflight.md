# REF-011 preflight and initial tranche

Date: 2026-09-27

## Authority

Owner request: "Start task 11". Repository: `kohnerbouchard-star/Student-Profile`. Exact base/main: `fbbe89cfa994a905aff9bd588ff170af6ebab347`. Owner branch: `refactor/ref-011-neutral-deno-test-config`.

REF-010 is already VERIFIED_COMPLETE on main. No existing REF-011 branch or PR was found before this branch was created. REF-011 depends on completed REF-006 and is limited to Deno test configuration ownership and exact test-script/config references. No runtime router, SQL, migration, workflow, lockfile, dependency, browser, deployment, or production-state change is authorized.

## Configuration comparison

Inspected on exact base main:

- `backend/supabase/functions/deno.json`: only `compilerOptions.strict: true`.
- `backend/supabase/functions/classroom-api/deno.json`: `compilerOptions.strict: true` plus a Classroom-local `tasks.check = "deno check index.ts"` entry.
- `backend/supabase/functions/admin-api/deno.json`: intentionally different relaxed compiler settings and is not a neutral replacement target for canonical Player suites.
- Shared lockfile remains `backend/supabase/functions/deno.lock` with `--frozen` preserved.

No import-map key or compiler-option mismatch exists between the neutral and Classroom configs as committed. The Classroom task entry does not alter `deno test --config ...` compiler resolution for the migrated suites, but exact-head CI must still execute the representative suites before merge credit.

## Ownership / collision check

- PR #668 remains open/draft and owns multi-game request/application-context work and its global ledger; it does not own the canonical `backend/package.json` test-config seam used here.
- PR #736 remains open and owns Player authentication/service-role correction; it does not own this package registration seam.
- No existing REF-011 branch was found.

No donor commit from #668 or #736 is imported.

## Initial bounded tranche — Player scope/security

Only these script keys are migrated from `supabase/functions/classroom-api/deno.json` to the existing neutral `supabase/functions/deno.json`:

1. `test:player-request-scope`
2. `test:player-security`
3. `test:player-capabilities`
4. `test:player-logout`

Every test path and explicit permission argument is preserved apart from the config path. In particular, `test:player-security` keeps its explicit Classroom source-read permission, so genuine compatibility coverage is not disguised as canonical ownership.

The Classroom-owned `typecheck:edge` command intentionally remains on `classroom-api/deno.json` because it checks the Classroom root itself and is not a canonical-suite borrowing case.

## Required next evidence before this tranche can merge

Run the representative Player suite with both old and neutral config at the same source/lockfile and compare pass/fail/test counts. Then run all four migrated script keys on the branch, full backend smoke, and `typecheck:all`. Exact-head CI is authoritative; queued or path-skipped jobs are not passes.

If any effective resolution, permission, frozen-lock, or test-set mismatch appears, revert only these four config references. Do not widen read/env/net permissions, regenerate the lockfile, remove a test, or modify runtime code to force parity.

## Parent remainder

REF-011 remains IN_PROGRESS after this start. The read/notification and economic/stateful groups still require bounded migration, and the parent still needs a ratchet preventing unrelated canonical suites from newly borrowing Classroom config. REF-012 is not started.
