# Held Admin CI history and provenance amendment

Status: PLANNED / SCOPE SEED ONLY. Roadmap items ARCH-LARGE-PARALLEL-LOCAL-001 and ARCH-LARGE-EDGE-ADMIN-BATCH-001.

This owner-approved correction precedes the existing Admin/Classroom refactor PR #981. Current main is 023ca4d70948bebf8cdc71460cbe8c6141af6934 after the qualified normal merges of controls #979 and Economy #980. PR981 head 234d6a2e2c252c60b1cb4ca7c1dd5c0dab1576b7 remains a draft with real failed checks. This seed changes documentation only and is not an implemented control transition or qualification result.

## Exact intended correction

Add full checkout history with fetch-depth: 0 in eight existing workflows, preserving checkout refs, action pins, credentials, permissions, commands and guards:

- .github/workflows/business-workforce-production-payroll-v2.yml
- .github/workflows/ref-010-access-reset-qualification.yml
- .github/workflows/repository-quality.yml
- .github/workflows/business-workforce-hiring-v2.yml
- .github/workflows/business-equipment-capacity-v2.yml
- .github/workflows/business-manufacturing-resource-hold-v2.yml
- .github/workflows/business-manufacturing-completion-v2.yml
- .github/workflows/business-manufacturing-recovery-v2.yml

The first four are current PR981 failures. The other four are proven dormant callers of the same root-test chain. The new finite-reader regression executes the unchanged Treasury CLI, including its real historical Git scope assertion. Shallow checkouts omit that prerequisite. Local depth-one/depth-ten reproduction fails; supplying real history without changing source makes the original suites and historical assertion pass. No assertion will be skipped, mocked or removed.

A narrowly bounded successor control amendment must preserve the original PR979 bootstrap manifest and provenance, append one exact reviewed control-PR/predecessor record, and re-pin only the future PR981 snapshot. Preserve the existing two data-file digest exclusions, default restrictions, original PR980 record, original bootstrap boundary, and source-side prohibition on policy edits. Register the new amendment's exact authority path wherever needed for retained required checks. Independent review of the exact amendment is required; self-authored hashes do not establish authorization.

The existing Admin source candidate separately needs canonical formatting in backend/supabase/functions/admin-api/index.ts. That formatting-only change belongs in the re-pinned PR981 candidate, not this preceding control PR. Binding, executable-body and dispatch parity are verified locally; the unchanged architecture generator produces no inventory diff. No runtime, route, RPC, schema, dependency, economic policy or permission change is intended.

## Qualification and remaining blocker

Preserve every original test and required/critical identity, add adversarial amendment coverage, derive actual PR and main-push workflow applicability, and qualify each exact published head before normal merge. The amended main must pass its own postmerge checks before PR981 resumes. No stale, seed-only, skipped, failed or local-only result substitutes for required execution.

Admin Browser's earlier static rendered suite passed, but its connected Create Game and ledger flows did not run because disposable Supabase startup could not bind host port 54322. The retained diagnostics do not identify the port owner. No browser policy or setup workaround is included here; fresh qualification must resolve that blocker without waiving connected tests.

No production deployment, activation, live database operation or secret access is authorized. Next: assign this draft's actual PR number, implement and independently review the bounded amendment and exact future source snapshot, then qualify and merge serially only if all required checks and reviews pass.
