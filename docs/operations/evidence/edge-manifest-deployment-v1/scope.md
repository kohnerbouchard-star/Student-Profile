# Manifest-driven Edge deployment

Roadmap item: `BETA-EDGE-DEPLOY-MANIFEST-001`.
Owner: `fix/edge-manifest-deployment-20261114`.
Baseline: `2198e7a907d2d87a9eb79867abf9c2f6615cdd59` (merged PR #964).

## Source-only correction

The staging and production convergence steps each hard-coded 20 functions, while the unchanged canonical/compatibility manifest contains 22. Both lists omitted `banking-fx-orchestrator` and `fx-orchestrator`. A read-only deployment planner now validates the complete manifest before producing any output, selects only canonical plus compatibility entries, and supplies the exact `verifyJwt` setting to both deployment loops. The result summary counts that executed plan instead of reporting a constant 20.

The plan rejects duplicate/overlapping categories, unsafe slugs, mismatched entrypoints, missing/empty deployment arrays, non-boolean JWT settings and invalid manifest policy. Temporary staging, source-only and retired functions remain excluded. Shell loops stop on validation or deployment failure. The existing inventory validator remains the single manifest-policy validator; its only source change is exporting that function.

## Preserved boundaries

- Explicit owner-authorized manual dispatch, current-main binding, staging-before-production, protected environments, action pins, Supabase CLI version and every release hold remain unchanged.
- No runtime source, manifest/config policy, API, route, RPC, migration, economic write, credentials, dependency/lockfile, release branch or hosted data changes.
- No workflow dispatch, deployment, live deletion, scheduler activation or production mutation is part of this task.
- Active dependency PR #620 retains its action-version scope. Open #735/#731 release work, #933/#938 roster, #624 CSS and #668 global-ledger ownership remain separate; no donor commits are imported.

## Verification

- On the original baseline workflow, 21 of 22 new regression cases fail. The sole passing test checks the new pure planner independently of the workflow.
- The candidate passes all 22 new cases and all 50 focused inventory/config/runtime/release contracts under Node 22.23.1. Tests execute the actual workflow shell against a temporary mock Supabase binary, never a real deployment.
- Covered: exact 22 slugs and JWT/project flags in both environments; future manifest additions; invalid-manifest zero-call behavior; stop-on-first-deploy-failure; dynamic summary count; retained CI registration.
- Full root `npm test`, core TypeScript, architecture inventory/ratchets, secret scan and whitespace checks pass. Pinned tooling uses Node 22.23.1 and npm 10.9.8.
- Full Edge typecheck cannot complete locally because the frozen Supabase SDK URL at esm.sh refuses connections. Backend smoke has the same external retrieval prerequisite; no local full-backend pass is claimed.
- Independent read-only review found no actionable introduced defect and separately passed all 29 planner/inventory tests. Runtime source, release guards and action pins were compared against baseline.

## Remaining qualification

Publish a draft, record its exact head and actual PR number, qualify applicable hosted checks, and merge normally only after gates pass. Current source preparation is `IMPLEMENTED_NOT_MERGED`; it is not live release or runtime completion evidence. `BETA-LIVE-MIGRATION-PARITY-001` remains separately blocked. A future deployment requires a separate owner-authorized release under production change control.
