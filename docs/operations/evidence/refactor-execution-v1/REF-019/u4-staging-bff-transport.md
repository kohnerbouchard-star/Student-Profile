# U4 staging browser BFF transport repair

Status: IN_PROGRESS. Base: `486b5e2d0f2fc042be444840fff2d4f11c4ac72c`.
Parent approved this exact six-path scope on 2026-10-04 after the user's narrow
staging routing/test-preparation approval. REF-019/020 remain paused; this is
prerequisite repair, not their persistence extraction or auth-baseline acceptance.

## Scope and ownership

Editable paths:
- `scripts/build-vercel-runtime-config.mjs`: deploymentConfiguration transport.
- `frontend/src/core/runtime-config.js`: validated transport and six BFF URLs.
- `scripts/runtime-config-contract.test.mjs`: transport regression matrix.
- `scripts/vercel-deployment-contract.test.mjs`: generated config execution.
- This evidence document.
- `docs/operations/contracts/player-cross-cutting/pr-840.json`.

One conceptual change, fewer than 400 semantic changed lines. Parent owns review
and merge. Open owners rechecked: #736 at `8070f58d4145951d8aee3e74a2b1e00d90c54385`
(Player credentials), #735 at `8867919947f48ef014365dcddda13a0efcf12d76`
(production origins/releases), #668 at `faaf908bdd5131b451c7e87e91ed4991ad8f839d`
(context/global ledger). No donor hunks or owner files are imported. Player app,
API, realtime, backend, authority verifier/tests, workflows and global ledgers
are protected. No database, credentials, live settings, deployment, release-hold,
origin-list, OIDC, cookie, CSRF, MFA, authorization or policy changes.

## Characterization and correction

Before: only environment=production selected the six existing same-origin BFF
routes. Vercel staging generated an empty apiProxyUrl and called Edge directly.
After: Vercel build emits apiTransport=same-origin-bff independently of backend
environment. Missing transport retains existing production and non-Vercel
behavior; unknown transports and BFF/proxy conflicts fail closed. Staging remains
bound to eecvbssdvarfcykcfrny. No handler, route, auth sequence or retry changes.

Baseline focused tests: 17 passed, zero failed on the base SHA.
Required verification: focused runtime/deployment and environment-neutral tests;
auth boundaries/web-session release; npm test; backend typecheck:all/smoke;
architecture/high-priority/legacy guards, secret scan and git diff --check.
Synthetic tests do not certify deployed auth, OIDC or staging login. No live auth
test is authorized. Next: parent review of exact-head checks, then separately
approved staged runtime evidence before any REF-019/020 pause release.
Rollback: revert this bounded source change, preserving all security repairs.


## Fixture discovery (read-only, 2026-10-04)

The exact staging Golden Five game is active/ready; GOLD-ALPHA is active.
Metadata-only aggregate lookup confirms exactly one active pbkdf2-sha256-v2
credential. No hashes, salts, codes, tokens or other players were retrieved.
The current gate consumes STAGING_SUPABASE_PUBLISHABLE_KEY and
GOLDEN_ALPHA_ACCESS_CODE, not SUPABASE_DB_URL (the separate DB rehearsal does).
The access code remains unknown; creating a new player or resetting a code and
running any live auth test requires separate exact approval. The old Phase 15
multi-fixture provisioner writes sha256-v1 and must not be used for this task.

Draft PR: #840. No runtime certification or pause release claimed.

## Local verification

Node 22.23.1 / npm 10.9.8, lockfile installs; source implementation a6ad0408.
61 focused deployment/runtime/environment-neutral/Trusted Types/authority tests
passed. Full npm test passed, including architecture inventory (zero generated
diff). Auth boundaries, web-session release, high-priority/legacy guards and
secret scan passed. Authority accepts exactly six changed paths under eight
locks (verifier/test unchanged). Initial attempts with environment Node 24 and
missing dependencies/tools were setup failures, superseded by pinned installs.
Backend full checks and exact-head CI remain pending; no live auth was run.
