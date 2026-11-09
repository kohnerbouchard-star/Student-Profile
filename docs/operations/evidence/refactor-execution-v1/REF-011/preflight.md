# REF-011 preflight and initial tranche

Date: 2026-09-27. Historical start record; subsequent implementation and qualification are recorded in `execution.md` in this directory.

## Authority

Owner request: "Start task 11", subsequently "Finish task 11". Repository: `kohnerbouchard-star/Student-Profile`. Initial base/main: `fbbe89cfa994a905aff9bd588ff170af6ebab347`. Existing owner branch: `refactor/ref-011-neutral-deno-test-config`, PR #757.

REF-010 was VERIFIED_COMPLETE on inspected main. No existing REF-011 branch or PR was found before this branch was created. REF-011 depends on completed REF-006 and is limited to Deno test configuration ownership and exact test-script/config references plus the task-specific ratchet. No runtime router, SQL, migration, workflow, lockfile, dependency, browser, deployment, or production-state change is authorized.

## Configuration comparison

Inspected on initial base main:

- `backend/supabase/functions/deno.json`: only `compilerOptions.strict: true`.
- `backend/supabase/functions/classroom-api/deno.json`: `compilerOptions.strict: true` plus Classroom-local `tasks.check = "deno check index.ts"`.
- `backend/supabase/functions/admin-api/deno.json`: intentionally relaxed compiler settings, not a replacement target for canonical Player suites.
- Shared lockfile: `backend/supabase/functions/deno.lock`, with `--frozen` preserved.

The initial comparison found no import-map or compiler-option difference. It was not execution evidence. Subsequent full old/neutral parity, shared-lock byte comparison, smoke and all-root typechecking are documented with exact artifact identities in `execution.md`.

## Corrected ownership / collision check

The initial statement that #668 did not own this package seam was too broad. Its actual changed-file list and package patch show additions to `test:staff-bootstrap` and `test:smoke`. Those keys and the related context/bootstrap/global-ledger work remain untouched. REF-011 changes only its nineteen registered config operands, the new verification command and the outer `smoke` wrapper. This is key-level separation within a shared file, not absence of a package overlap.

PR #736 owns Player authentication/service-role correction, not these package keys. No donor commit from #668 or #736 is imported. No replacement REF-011 branch is created.

## Initial bounded tranche — Player scope/security

The start changed only `test:player-request-scope`, `test:player-security`, `test:player-capabilities` and `test:player-logout` to the neutral configuration. All test paths and permissions were retained, including the explicit Classroom source-read permission in Player security. These four registrations were changed before old/neutral execution; that sequencing gap was disclosed and rectified with actual parity before the remaining fifteen migrations.

The Classroom-owned `typecheck:edge` command intentionally remains on Classroom config. Required compatibility tests are not retired. Config borrowing and explicit source-read permissions remain distinct.

## Subsequent execution and retained stop conditions

All nineteen suites, including the initial four, passed under both configs before the remaining registration change: 612 test identities under each, zero skipped, frozen shared-lock bytes unchanged. See `execution.md` for the downloaded artifact digest and per-child counts. The remaining fifteen registrations and strict package ratchet have now been implemented on this same branch; final-head checks and actual normal merge are still required for completion credit.

Stop and revert only config registrations on any effective-resolution, permission, frozen-lock or test-set mismatch. Never widen read/env/net permissions, regenerate the lockfile, remove a test or change runtime code to force parity. REF-012 is not started, and repository qualification is not production certification.
