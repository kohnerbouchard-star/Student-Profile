# Paired-source roster integration gate

Roadmap item: `CLASSROOM-ROSTER-ATOMIC-PROVISION-001`. Backend #938 owns this
bounded qualification deliverable; frontend #933 remains its separate owner.
This harness is not merged-main, deployed-path or hosted-capacity evidence.

## Source and execution contract

`sources.json` pins both full published SHAs and Git trees. `prepare.mjs` creates
an ephemeral backend workspace, overlays exactly seven frontend runtime files,
and records each copied blob/SHA-256 plus the composite Git tree and exact harness
head/tree. Harness package.json and package-lock.json must byte-match the pinned
backend dependency baseline before its node_modules can be reused; their SHA-256
hashes are recorded. Shared workflows, inventory and roadmap are not overlaid. Existing CI
files, required/critical check identities, trust maps, migrations, credential
hashing and the 200-student limit are untouched.

The added workflow uses Ubuntu 24.04, Node 22.23.1, npm 10.9.8 and the backend's
locked Supabase/Playwright dependencies. Playwright 1.65.0 is the actual package
pin at the selected backend head (not the earlier reported 1.59.1). Ubuntu 24.04
is explicitly supported by the installed Playwright platform registry; it avoids
the moving `ubuntu-latest` image. The runtime manifest records observed versions.

Run `node --test scripts/roster-connected/*.test.mjs` for harness contracts. The
manifest contract needs Git objects for both pinned commits. Run the connected
job only on a fresh disposable runner with Docker, psql and Chromium installed.
The runner refuses an existing `econovaria` stack and an occupied gateway port.
Set `ECONOVARIA_ROSTER_EVIDENCE_DIR=$RUNNER_TEMP/roster-safe-evidence` and run
`node scripts/roster-connected/run.mjs`.

All migrations and canonical content provisioning run before synthetic staff
setup. The retained canonical provisioning helper writes SQL, including a synthetic
one-time Game Code comparison, to a temporary file. A separate disposable helper
copy replaces only its exact-hash-checked runSql transport with psql stdin and
suppresses raw command errors. Every SQL statement, caller and assertion outside
that seam is inverse-checked byte-for-byte. Original/adapted source hashes and
purpose are recorded separately as fixture instrumentation, not included in the
seven-file runtime composite claim. The repository helper remains unchanged. Real rendered login, TOTP enrollment/verification, current security and
permission counters, licensed game creation and signed same-origin BFF/Edge
requests are required. No mocked session or service key enters the browser.
The existing rollback and three concurrency races also run, without replacing
their original CI jobs. Setup keeps the established 180-second gateway allowance;
the gateway is restarted with 30 seconds before roster tests. An independent
monotonic deadline of strictly less than 30 seconds runs from confirmation click
through parsed, rendered receipts for fresh 30/40 batches and their replays.

The gate covers optional-header and headerless names, repeated names and NFC,
ordered one-time credentials, exact canonical DB deltas, unchanged existing rows,
600,000-iteration v2 credentials, same-controller replay, real committed-response
loss followed by explicit code-free retry, foreign-game denial, changed-payload
and other-owned-game conflicts, missing session, bad CSRF, genuine AAL1 and fresh
correctly-versioned permission denial. Close/navigation/late response/sign-out
clear codes. Sign-out invokes the existing shell action while a fresh receipt
is still mounted so removal is non-vacuous. Names may remain in the Players list.

## Representative imported-student account access

After every original import/replay/security snapshot and Admin privacy check, a
separate phase authenticates two returned credentials: row 1 of the 30-student
batch and row 2 of the 40-student batch. Both have the same synthetic display
name but distinct generated STU identities. This is evidence for **two
representative accounts, not all 70 credentials**. All-row receipt, database,
600,000-iteration metadata, replay and privacy assertions remain independent.

Licensed creation must already report active lifecycle, ready provisioning and
active join-code status. A read-only check binds that exact creation game ID and
normalized join-code hash to the imported STU, active credential and both session
foreign keys. No lifecycle transition, SQL guard workaround or production change
is used. Internal IDs and credential material fingerprints stay in memory.

Each fresh context submits a deliberately wrong code through the rendered Player
form with the same target Game Code and STU, requiring rejection, anonymous status
and no session creation. It then submits the original returned 32-character code,
requires a real successful login and fresh status/bootstrap, exact public STU and
known game-name projection, and a new session bound to that exact game and player.
The existing login path exercises the persisted canonical 600,000-iteration v2
verifier. The public student DTO has no game ID; none is added or required.

The rendered profile logout must clear native storage/cookies and revoke the
server session. A protected read without a cookie and a status request replaying
only the genuinely issued, now revoked cookie must both be rejected. No session
is fabricated or injected into the browser. Each account has a separate bounded
120-second authentication phase and timing report; neither changes the strict
30-second import/receipt deadline or grants hosted-capacity credit.

Only the exact source-defined public student session DTO and browser-generated
device key are permitted in that context's native storage while authenticated.
It is validated before logout and again afterward, then the context closes before
the unchanged blanket Admin privacy scan. All issued codes, wrong-code controls,
Game Code, CSRF values and observed cookies/tokens join the in-memory log/artifact
leak corpus. Access codes, raw tokens, credential fields and internal UUIDs remain
forbidden in student DTOs/storage. The public device UUID is restricted to its
existing localStorage key, not an application identity exemption.

The teacher fixture separately validates exact existing login/status/MFA/create
response schemas. Only the documented staff/game identity slots may hold UUIDs;
unknown fields, private credential fields and UUIDs elsewhere are rejected. This
corrects a source-detected harness mismatch with existing Admin responses, not an
observed hosted production failure. The strict roster/student UUID boundary and
all original Admin storage/privacy assertions remain unchanged.

## Privacy and cleanup

No screenshots, HAR, video, trace, response body, TOTP, credential or raw logs are
written as evidence. Browser, gateway and four server logs are checked in memory
against exact names, identifiers and codes; persisted receipts may contain public
names/IDs but never codes/private credential fields. Audit events contain only
aggregate data. Browser storage/cookies are checked for roster values and password/
TOTP material; ordinary CSRF/session state retains its existing application design.
Only allowlisted aggregate `result.json` and `source-manifest.json` are uploaded.
Errors never print raw Playwright call logs or database output. Failed setup reports
its bounded stage without claiming execution of later stages.

All contexts close, gateway terminates, local `.env`/runtime config are removed,
Supabase stops with `--no-backup`, and the ephemeral workspace is deleted. A final
`--cleanup` step retries cleanup after cancellation using a mode-0600 path-only
marker restricted to this runner's generated temporary directory. Cleanup failure
fails the gate, preserves the marker for recovery and never turns into a pass.

## Fail-closed current-runtime equivalence

`runtime-equivalence.mjs` runs immediately after exact-head checkout, before Node
setup, npm installation or any connected operation. `run.mjs` and `prepare.mjs`
repeat it before Docker inspection and before creating the composite archive.
It uses only Node built-ins and Git. A fixed status is the only CLI output;
Git, filesystem and JSON errors never disclose raw contents or local paths.

The versioned `sources.json` requires one explicit mode and API relation. There
is no environment override, automatic mode selection or fallback:

- `backend-owned` requires `apiRelation: roster-two-line-inverse`. The entire
  checked-out runtime/input projection equals the backend pin, including all
  seven native pre-overlay files and the absence of new frontend-only files.
  The full frontend API must equal the backend API with exactly the reviewed
  import at the beginning and roster member after createPlayer; inverse equality
  protects every lifecycle method and all other shared content. The ephemeral
  runtime still overlays exactly seven complete frontend files. This qualifies
  backend inputs plus those overlays, **not the frontend owner's non-overlay
  package commands, test helpers, workflow inputs or complete source head**.
- `integrated-composite` requires `apiRelation: exact-equality` and identical
  backend/base and frontend SHAs **and** trees. Freeze one reviewed, public,
  source-only integration after backend and frontend reconciliation as both
  pins. Here the base contains both implementations and every non-overlay
  package/test/helper/workflow input. A later harness/metadata-only commit must
  match that complete source projection and every full overlay/API blob.
  Distinct commits with identical trees are rejected, as are hybrid pins.

`runtime-inputs.mjs` classifies every unlisted tracked path as a runtime/input.
That includes applications, APIs, Edge roots, migrations, gateway/provisioning
helpers, all package manifests/locks, runtime-read documentation/contracts,
configuration, assets, seeds and test commands. Six exact metadata paths are
excluded: the architecture inventory, completion roadmap, PR938 and PR933
authorities, and the two roster scope records. Only the explicitly listed
connected-gate files are classified as harness. No blanket docs, tests, scripts,
workflow or package.json exemption exists. Unknown additions and deletions fail.

Runtime entries compare whole Git blobs and modes, not suffixes or snippets.
Actual on-disk runtime **and harness** files must match HEAD, including bytes,
executable modes and non-symlink parent directories, independently of index stat
caches/assume-unchanged flags. Staged changes and relevant untracked or ignored
files fail. Only the exact generated root, backend and Player node_modules roots
are ignored as npm-ci-installed tools; nested impostors, .env, runtime config and
Python bytecode remain checked. Allowed metadata-only edits do not change the
runtime digest; harness-only commits get a new attested harness identity.

The workflow's ordered path filters are checked against this same classification:
all paths by default, minus the six exact metadata paths, with both owner
authority paths added back. New source roots and harness/pin changes schedule
preflight. This deliberately fails stale pins early rather than running an old
source snapshot and granting a newer head a false pass. It does not alter other
workflows or their required-check registration.

The safe source manifest records HEAD/tree, explicit mode/relation, base role,
qualification scope, frontend non-overlay coverage boolean, runtime projection
and policy/trigger digests, clean-disk assertions, both pins, composite and
harness identities. It contains no self-referential commit pin. Metadata/harness
exclusions are attestable policy and require independent review to change.

`mode-fixtures.mjs` also runs the **complete** harness suite in two clean temporary
Git checkouts built from fixed historical development objects. The backend-owned
fixture retains its paired pins; the integrated fixture first commits both
runtime sets plus frontend package/test inputs, then pins that single fixture
source twice in a separate harness commit. Both suites must pass without skips
and with matching case counts. These are unit/manifest fixtures, never public
source pins or connected-runtime evidence. They create no accounts, invoke no
Docker/browser/runtime journey, keep child output in memory, emit aggregate
counts only and remove both temporary repositories. The actual checkout's own
preflight and suite remain required before this matrix and connected execution.

The historical pair below remains unchanged for local guard development only.
It does not certify the newer provisional roster integrations. After actual main
reconciliation, independently select public runtime pins and repeat the full
source review, local checks and connected qualification before claiming results.

## Pin refresh and release hold

The initial pair is backend `1ab7aaad04d95c020e5211d69735106a58da31ce` /
frontend `db4aec4c5203ef44618b8718f871dd400eaa4f48`. Do not claim this result for
later World, Market, Store or shared-metadata integrations. After the serialized
queue reaches roster, reconcile each existing owner, independently review the
new exact heads, update both SHA/tree pins together, recheck the seven-file
allowlist for runtime overlap, regenerate the composite manifest, and rerun the
connected workflow. Parent integration separately updates authority, inventory,
roadmap and check registration; this isolated tranche does not edit those files.

Even a passing job proves only paired local Auth/BFF/Edge/PostgreSQL integration
and observed disposable-runner wall time. It does not certify hosted Supabase
CPU/memory budgets, Vercel cold start/OIDC/network overhead or its actual 30-second
termination, percentile reliability, concurrent classes, or 200-row capacity.
Those explicit release holds remain. No production deployment, new hosted project,
trust expansion, real student data, merge or broad completion is authorized here.

Local connected execution is currently unrun: Docker/psql are unavailable, frozen
Edge SDK cache misses remain, and prior browser installation/socket failures are
not retried by this tranche. Source/static tests do not waive hosted execution.
