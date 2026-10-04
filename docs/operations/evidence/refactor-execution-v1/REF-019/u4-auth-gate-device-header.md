# U4 auth-gate device header prerequisite

Status: IMPLEMENTED_NOT_MERGED. Base f590dadd4c70d53fad0db797cbc20b5284da45ac.
Parent approved narrow #736 test-harness handoff on 2026-10-04; REF-019/020
remain paused. This does not extract auth persistence or certify live auth.

Exact editable scope: scripts/staging/player-auth-gate.mjs (including its existing
selfTest), scripts/staging/golden-five-contract.test.mjs (existing staging CI
contract suite), this evidence record and the PR-specific authority manifest.
The contract suite invokes the embedded selfTest without live requests. Under 200 changed lines. #736 remains open
at 8070f58d4145951d8aee3e74a2b1e00d90c54385; key/runtime ownership stays there.
No backend, guard, error semantics, Player UI, workflow, SQL, credential, setting,
deployment, production, origin/OIDC/security policy or global roadmap change.

Failed manual run 37177431019 on main d2aa78c8: malformed login400 passed, then
nonexistent login500 instead of401; GOLD-ALPHA login not reached, cleanup not_needed.
Artifact11293499181 SHA25615e1812d5e812286b5546afc148f8716de3bcb57ac623cc852e56a18c1d85003.
Harness omitted mandatory x-econovaria-device-id. Deployed login/throttle source
matches; device validation throws before database lookup and is mapped to500.
Local actual-handler plus actual-harness reproduction produced400/500 without
network/DB; supplying valid device reached unknown-player401. Required throttle
and session RPC metadata exists; no matching throttle/session RPC call or DB
error was observed in the failed run window. No raw gateway logs/secrets read.

Correction: one random UUIDv4 per run, stable on all requests including cleanup;
new runs receive new IDs. Existing selfTest verifies shape, stability, per-run
uniqueness and exclusion of device/key/code/cookie/CSRF material from evidence.
All10request/route/status assertions, timeouts, no-retry and cleanup behavior stay.
Parent owns review/merge. No live rerun until qualified harness and fresh v2
metadata; no credential reset. Historical failure remains preserved.

Local validation: pinned Node22.23.1/npm10.9.8; embedded gate regressions,
actual-handler synthetic prefix400/401, full npm test, secret scan and authority
contracts passed. Generated inventory unchanged. Full local backend typecheck
and smoke remain blocked by the frozen esm.sh import tunnel; CI must qualify applicable gates.

Draft PR #848; authority accepts the four exact editable paths under six locks.
