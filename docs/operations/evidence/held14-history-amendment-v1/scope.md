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

## PR982 local implementation checkpoint

Status: IMPLEMENTED_NOT_MERGED. The scope-seed narrative above is historical. Actual draft PR #982 owns this correction on exact predecessor `023ca4d70948bebf8cdc71460cbe8c6141af6934`, not an assumed future PR number. The owner approved the eight checkout changes, the single Admin formatting repair, and this bounded CI amendment. Local candidate evidence is not hosted qualification, independent review, merge clearance or completion.

Only the eight listed checkout configurations gain full Git history. Exact own `pr-982.json` pull-request path registrations are derived from the unchanged ordered 151 required and 105 critical identities; Lab is not applicable and its workflow remains unchanged. The four Player names are unconditional Player Terminal Verify step/script contracts, not four extra workflow jobs. Dynamic CodeQL is accounted for separately. Naturally triggered workflow families and guarded jobs must be qualified on the actual published head, not inferred from an earlier source-family count.

The original `control-bootstrap.json` PR979 fields and complete manifest are preserved. One `amendment` object identifies schema1, PR982, the exact repository/main/predecessor, fixed repair reason, immutable predecessor bootstrap/registry blob and mode identities, and every changed control path except the bootstrap record itself. There is no amendment list or new source record. The successor manifest includes the replacement registry and every changed executable, workflow, authority and evidence byte. Only existing registry/bootstrap data files remain excluded from the source baseline digest. Source events consume their trusted event-base validator and cannot change either data record or any control file. The original PR980 record remains identical; only PR981's base digest and complete old/new blob/mode snapshot are re-pinned. Independent exact-tree review, not self-authored hashes, authorizes this new control transition.

The control PR follows Markets' unchanged default no-held-runtime path. That guard checks runtime scope and is not policy-authentication evidence. Direct Lab invocation must deny the unrelated control PR and Admin source. The original PR979 fallback remains restricted to PR979 on exact f5db with no event-base validator.

The separate corrected Admin candidate preserves all 45 extraction paths and 16 support paths. Only the explicitly reviewed Admin entrypoint import-specifier ordering and blank line change; its executable body, imported bindings and dispatch remain equal. The unchanged generator produces the same inventory. All shared control/data records are inherited without source-side edits. Treasury's actual historical 87-path assertion and 59 reader regressions remain unchanged and require real history.

Remaining gates: independent review of exact local control/source trees and recoveries; every applicable fresh PR982 hosted result; normal merge and actual-main push qualification; normal integration of verified amended main into existing PR981; then every corrected actual-head PR981 obligation and connected browser/database qualification. Local frozen Supabase SDK retrieval limitations are not Edge/Admin/smoke passes. The earlier browser port54322 conflict remains undiagnosed and no workaround is included. No deployment or production mutation is permitted.
