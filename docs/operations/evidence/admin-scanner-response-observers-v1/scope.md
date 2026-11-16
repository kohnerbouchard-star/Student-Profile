# Admin scanner response observers

ID: `ARCH-ADMIN-SCANNER-OBSERVERS-001`
Status: `IN_PROGRESS`, reconstructed on main `41792bd9` after merged #668.

This restores the previously reviewed local fcb99f3f tranche after its executor
worktree became unavailable. No preserved bundle was found. The four runtime
files on current main were verified byte-identical to prior base e71a92a2;
source and all ten regression cases were reconstructed from the recorded patch,
not inferred from a summary. Fresh independent review and qualification are
required; no previous pass is inherited as current evidence.

Replace only scanner identity/reward global fetch wrappers with explicit
presentation subscribers on the existing Admin request lifecycle owner.
Transport dispatch, idempotency and lifecycle remain authoritative; observers
cannot mutate outgoing requests, consume caller response bodies or turn render
failures into failed writes. Separate response clones retain subscriber isolation.
Only successful same-origin Admin attendance POST responses are observed.
Capture scanner/reward element identity before dispatch and ignore delayed
renders following UI replacement. The create-action adapter synchronously passes
unowned paths through, avoiding the async JSON-parse capture race independently
found in the first revision. Preserve current identity, fallback-code, reward,
currency and duplicate-ledger display.

Actual browser interception files fall eight to six. Remove exactly two retired
scanner allowances from the existing seam ratchet, retain all other guards.
No backend, SQL, RPC, permissions, generated bundle, economic write, visual
redesign or production configuration changes. Existing #668 context work,
#990 Messaging, #991 census and separate autofocus/World/form fixes remain owned
by their existing branches; the scanner observer branch is not a replacement.

## Qualification plan

- Ten Node observer tests plus retained economic/create-action tests.
- Full root aggregate and backend checks; record blocked stages separately.
- Dedicated desktop/mobile real-browser contract through the lifecycle,
  create-action and Player access wrapper chain: success/body preservation,
  repeated scans, navigation/replacement, failures, malformed JSON and abort.
- Register observer tests in the existing economic/root suite and browser
  contract in Runtime Stabilization Onboarding, with pinned Playwright install.
- Reconcile corrected inventory after #991 and #990 before final CI. Actual PR
  authority and exact-head hosted tests/review must pass before coordinator merge.

Local native-browser installation initially remains blocked by truncated CDN
archives; no browser or live acceptance is claimed by Node fixtures. A hosted
run is required if local installation stays unavailable. No manual production
changes; existing automatic sync stays untouched.

## Fresh local qualification (2026-11-17)

- Full `npm test` passed with pinned Node 22.23.1.
- Independent source review found no actionable runtime/security issue; all
  12 observer/economic Node cases passed independently.
- `npm --prefix backend run typecheck:all` reached the all-Edge check, then
  failed fetching Supabase SDK 2.108.2 from esm.sh (connection refused).
- Pinned Playwright Chromium download returned truncated archives; optional
  system Chromium also could not launch under executor socket restrictions.
  The desktop/mobile browser contract is registered as a hosted gate, not
  represented as locally passed. No live acceptance/deployment credit.
- Fresh backend smoke completed its preceding domain groups, then stopped at
  game-sessions imports on the same esm.sh SDK connection-refused error; the
  complete smoke aggregate is not qualified locally.

Draft PR [#992](https://github.com/kohnerbouchard-star/Student-Profile/pull/992)
publishes source `84dd2c3e004ddf2849e9383b148ef66f6c43ae31`, tree
`3e7880621306604f51b9de77214d32fb4a1a8fa7`, exactly matching independently
reviewed local source. PR-number authority and CI contract registration are
qualification metadata; no merge/live acceptance is implied. Reconcile after
#991/#990 and require final exact-head hosted checks before serial merge.

## Serial main reconciliation

Merged actual main `9193d4e9865cc591d9d4a3c7289b48b6721574c4` after
#991 and #990. Preserved both roadmap intake blocks and regenerated inventory
with the corrected census: 1,619 sources and 85 persistence candidates unchanged
from main; scanner interception owners remain reduced from eight to six. All
four runtime files and both scanner regression scripts remain byte-identical to
reviewed source `84dd2c3e`. No predecessor runtime or workflow changes reverted.
Prior head `2c8994f8` hosted Runtime Stabilization run `43963748024` passed all
three jobs, including the real desktop/mobile scanner browser step. That is
historical evidence, not qualification of this new integration head. Fresh root,
independent union/metadata review and exact-head hosted checks required.

Fresh integrated `npm test` passed on pinned Node 22.23.1. Independent union
review confirms unchanged runtime/tests and predecessor preservation; 12 observer/
economic and 36 corrected-census tests pass independently. Metadata rederivation
confirms 14 changed paths, 16 locks, 57 workflow families, 95 active tuples and
10 existing guarded skips; authority CLI and 16 regressions pass. Final hosted
qualification still pending; no live deployment claim.
