# Production Admin probe authorization guard — PR #871

Roadmap item: `BETA-PRODUCTION-ADMIN-PROBE-GUARD-001`.
Status: `IMPLEMENTED_NOT_MERGED`; final exact-head hosted qualification and owner review remain required. This scoped record supplements the authoritative beta completion ledger; it is not a new release authority.

## Verified starting point and bounded ownership

On 2026-10-07, authoritative main was `853b225dd684a50c710a65f3d4afdd006df6ec71`. Continue existing draft #871 / `fix/production-admin-probe-authorization-v1`, starting at `e4142eb98e6569b392214d82e90207ebf09d3363`; do not create a replacement branch. The prior 13 successes/seven skips do not certify this correction.

The owner's 2026-10-07 instruction divides the shared `.github/workflows/production-web-session-vercel-proxy-verify.yml` responsibility: #871 owns only bounded trigger/authorization safety; draft #735 owns canonical-origin convergence. The matching `sharedWorkflowOwnership` records in the #871 and #735 exact-path contracts preserve this division. Only #735's scope manifest, from `8867919947f48ef014365dcddda13a0efcf12d76`, is recorded here with the clarification; none of its eight workflow-origin edits, CORS, release-request or recovery-authorization implementation is imported. Its original 16 allowed paths, three required files, four checks and three false prohibition flags are retained. The #735 branch itself is not reconciled or qualified by this work.

#871 changes exactly six paths: the shared workflow, `scripts/production-admin-probe-guard.sh`, `scripts/production-admin-probe-guard.test.mjs`, the two scope contracts and this record. The shared authority verifier/regression files remain locked and unchanged. There are no application routes, RPCs, migrations, runtime adapters or economic changes.

## Authorization semantics

Dispatch inputs travel through environment variables and quoted Bash comparisons, never GitHub-expression interpolation into shell source. The protected `production` job compares the exact requested SHA to the run SHA, fetches authoritative `refs/heads/main` through the fixed GitHub API endpoint, and only then emits `approved_commit`. Repository, event, main ref, action and origin must all match; malformed/unavailable lookups fail closed without logging the response or token. A rerun requires a new dispatch and approval.

Every downstream side-effect job consumes the protected job's exact SHA output. The production verifier rechecks current main immediately before each POST, including after every retry delay. Status publishers also recheck and target only that approved SHA. The original 72-attempt bound, 10-second delay, request timeouts, 15-minute job timeout and controlled-response validation remain unchanged. Read-main failures do not retry automatically or permit a POST. If main advances after a pending status, publication stops rather than reporting stale success; the pending commit status may remain, with the failed Actions run providing the rejection evidence. A fresh separately approved dispatch is required.

These are immediate authoritative freshness checks, not an atomic GitHub-main/production transaction or a cross-workflow merge lock. Any future authorized probe needs a coordinated no-merge observation window; this patch neither grants that window nor alters main merge policy. Protected-environment enforcement must be verified independently before any later live dispatch; a YAML environment name alone does not prove required-reviewer/no-bypass settings.

The live endpoint is deliberately not invoked here. Its BFF can cause nonce claim/expiry cleanup; it is not represented as database-effect-free. Canonical-origin convergence remains a separate #735 prerequisite for useful production verification. Existing origin constants are unchanged.

## Evidence and qualification

The synthetic suite executes the real helper and extracted workflow shell with test-only `curl` and `sleep` executables. The fake curl has no network implementation and rejects unexpected destinations. It covers command substitutions, backticks, quote/newline breakouts, wildcard-like values, missing/wrong identities, reused approvals, malformed API results, lookup failures, main advancing during approval/queue/retry, approved-SHA status publication, stale-success rejection and all 72 unchanged retry attempts. It also retains the existing observable workflow contract. Ownership tests use the unchanged shared authority verifier and reject unauthorized paths/PR/base/prohibition changes.

Local source verification uses a partial exact-file fixture, not a full clone; the starting workflow blob is verified as `275293cea2716816c0774057044aa33e81a2dcc7`. The container's Git transport cannot resolve github.com, so full `npm ci`, root `npm test`, backend `typecheck:all` and backend `smoke` are not claimed locally. GitHub PR-triggered checks must qualify the final remote SHA; previous/intermediate runs cannot substitute. Record the final immutable head and check results in #871's qualification report, avoiding a self-referential commit hash in this file.

## Release and dependency holds

No merge, live workflow dispatch, endpoint probe, production deployment, Auth change, recovery attempt, factor deletion, credential creation, persistent access or lending activation. Merged #868's automatic-production-Auth-writer removal remains untouched. #862 remains at `28e745554fcf28affe209dfeda43f6e2f4e3a1e1`; dependent #863 remains at `e4c85e98beb79b71385bacffab8483f567afd921`, plan-only and execution-disabled. Do not reconcile either onto #871 as though this guard had reached main. REF-019/020 and existing release holds remain. Any later main merge requires separate owner authorization, fresh qualification against then-current main and coordination with the loan workstream.

Next exact item: final #871-head synthetic/required-check qualification and owner handoff. Recovery authority selection and any later trusted-adapter implementation remain separately gated.

## External recovery authority proposal — not selected or implemented

Use an owner-controlled Microsoft Entra workforce tenant (not the game or an employer's tenant) as the proposed human identity authority. Pin the tenant issuer and immutable directory object IDs; authorize dedicated external Recovery Operator/Recovery Approver assignments checked server-side. Require device-bound FIDO2 security-key authentication with fresh, transaction-bound user verification, primary/backup authenticators, and no weaker fallback for this privilege. Conditional Access authentication strength is a supporting control, not by itself proof that a fresh FIDO2 ceremony occurred for this request.

An external recovery broker must bind an independently approved canonical request hash to the operator and a distinct approver, the target's immutable identity, exact staging project `eecvbssdvarfcykcfrny`, approved operation/factor set, source SHA, adapter digest, run ID/attempt, audience, nonce and a proposed 15-minute maximum grant lifetime. No self-approval; the recovery target cannot act as its own independent approver. At execution, revalidate live assignments/revocation, request identity, grant freshness and authoritative main, then atomically consume the one-use grant with the existing one-shot recovery-effect acquisition. Ambiguous provider effects stay restricted for external reconciliation, never automatic retry/takeover.

GitHub OIDC can attest the workload using repository ID `1264495890`, workflow ref/SHA, main ref, environment, run ID/attempt and audience. It must not substitute for the independently authenticated human approval. A GitHub actor name, typed phrase, game role or unsigned JSON is not recovery authority. Proposed broker signing keys belong in a separately administered managed key store; no provider credential is exposed to the browser or general Actions job. Audit grants/denials and lifecycle receipts outside the application, without tokens/passwords/factor secrets.

Owner decision: select the actual external identity-provider tenant and designate the accountable operator plus an independent human approver. If no independent approver is available, this design remains blocked; do not silently replace dual control with self-approval. Selection does not itself authorize tenant configuration, credential creation, persistent access, live adapters, factor operations, recovery or deployment. #863 remains execution-disabled until separately reviewed identity/approval/provider bindings and staging acceptance are explicitly authorized.

Design references: GitHub Actions documentation, “Script injections”, “Deployments and environments”, and “OpenID Connect reference”; Microsoft Learn, “Conditional Access authentication strengths” (consulted 2026-10-07). These describe platform mechanisms, not evidence that the repository/tenant has been configured accordingly.
