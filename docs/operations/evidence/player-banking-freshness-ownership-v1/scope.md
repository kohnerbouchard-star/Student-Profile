# Player Banking publication ownership

Date: 2026-11-05. Roadmap child: `ARCH-501/502-PLAYER-BANKING-FRESHNESS-001`.
Local branch: `fix/player-banking-freshness-ownership-v1`.
Source baseline: `45715997599942fccc3af0fa592ffa4a3a66a37d` (merged #911).
Status: `IMPLEMENTED_NOT_MERGED`. Draft [PR #912](https://github.com/kohnerbouchard-star/Student-Profile/pull/912), targeting `main`.
The owner authorized publication of the reviewed nine files plus the actual-numbered
verification manifest and hosted test qualification. Merge and deployment remain unauthorized.
Implementation commit: `a7279798893cff7d4f86d6c0b562991578fc9e88`.
Final main re-fetch remains the identical baseline; the local worktree is isolated.

## Reproduced problem and correction

The Banking controller constructed an independent `PlayerApi`, captured Banking
before awaiting a page, then assigned the merged old value into a current store
snapshot and replaced its DOM. A newer terminal refresh could be overwritten.
FX histories, order lists and quotes had the same publication gap; quote form
edits, session rotation, route departure and destruction did not reject every
late state/error/toast/focus effect.

The local regression first held pagination, published a newer Checking balance
of `98765`, and released the old page. Unchanged main reverted the balance to
`32680`. The native browser regression also lost the newer activity marker from
the real terminal DOM. These are reproduced failures, not inferred mechanisms.

The new bounded Banking owner uses `terminal.freshness` and the existing
`updateStoreFromSnapshot` mechanism. It checks aggregate resource generations,
captured resource identities, session, route lifecycle and FX intent immediately
before publication or effects. API transport admission defers freshness settlement;
partial pages, histories, order lists and quotes never settle an aggregate
invalidation. The existing full-resource publisher retains that responsibility.
Previously accepted store snapshots remain immutable and subscribers render the
new state. FX draft values and applicable control precision survive publication.

Route departure retires pending reads and local effects; destruction also aborts
this adapter without resetting sibling freshness. Confirmed FX commands retain
their server-authoritative result if a subsequent refresh fails. Existing API
normalization, endpoints, request/idempotency identity, prices and financial
transaction semantics remain unchanged.

## Ownership reconciliation

- Freshly fetched main equals the requested baseline. No open branch/PR owns
  this correction. The historical `feat/banking-fx-clearing-v1` head
  `029ea568adc722f0b7c1cd57a02c49f88ceaf716` is an ancestor of this main with no
  unmerged Banking-controller changes.
- #624 head `83a9d2af37d2eab3202eee7293780dbd31443edb` owns UI/CSS,
  `main.js`, the realtime controller, `tests/realtime-freshness.mjs`, the existing
  pagination browser test and disclosure surfaces. All remain byte-identical
  to baseline. New browser coverage has its own filename.
- #888 head `1b350848b00140d1b1069615afc2ea8a0de4b49a` adds Loans diagnostic
  imports and appended tests to `tests/banking-read-model.mjs`. Its exact patch
  leaves the inherited `state.data.banking = banking` source assertion unchanged.
  This slice explicitly replaces that obsolete assertion with a prohibition of
  direct assignment plus a publisher assertion and the stronger registered
  real-store regressions. None of #888's diagnostics is edited or imported.
- The generated inventory is regenerated from this actual main-based checkout.
  Its only delta is `sourceFiles: 1311 -> 1312`. Every debt count and ceiling is
  unchanged; no scanner exemption or donor inventory is used.
- There is no checkout `.agents/skills` directory; `/workspace/.agents` is empty.
  Root `AGENTS.md`, `CONTRIBUTING.md`, the beta ledger and relevant architecture
  roadmap were read. No Settings/#861, Store action ownership, backend, SQL,
  dependency/lock, hosted state, release hold or singleton authority change.

## Exact publication file scope

1. `player-terminal/src/features/banking/banking-read-flow.js`
2. `player-terminal/src/features/banking/banking-read-owner.js`
3. `player-terminal/tests/banking-freshness-ownership.mjs`
4. `player-terminal/tests/browser/player-banking-freshness.spec.mjs`
5. `player-terminal/tests/banking-read-model.mjs` (the single obsolete assertion)
6. `player-terminal/package.json` (append the new suite to `banking-read`)
7. `docs/architecture/inventories/econovaria-architecture-inventory-v2.json`
8. `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`
9. This scope/evidence record.
10. `docs/operations/contracts/player-cross-cutting/pr-912.json` (publication-only authority).

No route, RPC, migration, dependency or deployment change. All original
verification commands and browser registrations remain; `verify` invokes the
expanded `banking-read`, and the browser runner discovers the new spec normally.

## Executed local evidence

Pinned local tools: Node `22.23.1`, npm `10.9.8`, Deno `2.9.3`.

| Check | Result |
| --- | --- |
| First pre-fix Node regression | Reproduced stale balance `32680 !== 98765`, snapshot mutation and obsolete effects |
| Final regression suite on exact unchanged main | 29 failures, zero passes/skips, retained in `baseline-expanded-node.tap` |
| Native regression on exact unchanged main | Failed: newer activity marker disappeared after releasing old pagination |
| New registered Node suite | 29 passed, zero failed/skipped |
| Focused native browser suite plus original pagination test | 12 passed: desktop and Pixel 7/mobile, real terminal/API/coordinator/store |
| `npm --prefix player-terminal run verify` | Passed, including the registered 29-case suite |
| Root `npm test` | Passed, including architecture/inventory and existing security/release/UI source gates |
| `npm --prefix backend run typecheck:all` | Passed TypeScript and all 28 Edge roots |
| `npm --prefix backend run smoke` | Passed 1,422 Deno tests and 18 Node tests |
| Secret scan and `git diff --check` | Passed for changed tracked and untracked source |

The Node suite exercises held asynchronous responses with real coordinator,
API and store, and a minimal DOM boundary. It covers pagination ordering,
immutable/subscriber publication, deduplication, focus, session/config rotation,
destruction, route leave/return, obsolete 401/error/toast/focus effects, FX
aggregate generations, all four quote-intent fields (including change/back),
normal history/order merging, rejected publisher admission, independent adapter
abort and confirmed-command refresh failures. Native tests additionally use the
real terminal renderer and draft preserver on desktop/mobile.

Raw logs, the failed-baseline screenshot and trace, and a temporary local
browser configuration are retained under `/tmp/player-banking-evidence/`.
The browser configuration changes only local executable/output/video settings;
the repository configuration, projects, assertions and CI gates are unchanged.
The bundled Chromium 147 download returned HTTP 403 `Domain forbidden`; local
native runs use available `/usr/bin/chromium` version `151.0.7922.173` with
repository Playwright `1.59.1`. This is successful local Chromium evidence, not
qualification of the CI browser binary or hosted runtime.

## Raw evidence identity

All files below are in `/tmp/player-banking-evidence/`; hashes identify the
retained bytes, including the unchanged-main failures.

| File | SHA-256 |
| --- | --- |
| `baseline-expanded-node.tap` | `634f8101cc09f3ba0889dc9259c2c478a96873f20f972862f632c17474ff7f38` |
| `baseline-browser.log` | `9bb4a5d89ddbd52ce07a8024c257b5355c3d45a69cf932ae9382bc8c8577cdf2` |
| `expanded-node.tap` | `c835bb8b4c186beb9528b92ecdf580c9dd2481f489566fce80c66d57b43d2f91` |
| `banking-read-final.log` | `598eb0426f8f9735674087ebcd0d984d8b13b120bbcde6471f7fab14208b6d3f` |
| `browser-final.log` | `81f4075bdd6e4a2c53285276623a3bf0e095e7a0369710b339a8bc9edbd28f8b` |
| `player-verify-final.log` | `e7ffcbf028aeb2b8eec30c4730f738dc825612208bc98ced2f59f02e934b2c8b` |
| `root-test.log` | `3e9b5e2fcbd3243443d51701e9676c587d170ff13a5a42311edf0670b2f8fb33` |
| `backend-typecheck.log` | `0cc57fbbdfa5d57e4da048a003e7e9a674b68d90e18e83f437f47da5d1215942` |
| `backend-smoke.log` | `e34e2dbade8e20f10c668a6fcb04e67796f9445da9ebbb433973c5f45ef48ead` |

The final `banking-read` command reran the strengthened suite after the full
Player verification run; the additional nested-resource/DOM assertions pass.
All 29 identical strengthened tests fail on the exact baseline.

## Authorized draft publication

The owner answered “Publish” to the explicit public-repository draft request for
nine reviewed files plus the required verification manifest, with no merge or
deployment. PR912 initially publishes reviewed head
`68453aa3dbc46a4421e3d0c0f486c4597904d2d0`; the final publication commit adds only
its actual-numbered manifest and truthful metadata in this record and the
existing beta ledger. Reviewed implementation, tests, script registration and
inventory bytes remain unchanged from that head.

`docs/operations/contracts/player-cross-cutting/pr-912.json` binds exactly ten
edited paths and two read-only verifier/test locks (twelve total). It retains all
94 predecessor required checks and all 72 critical checks, adding the applicable
Banking/FX, financial, Player, Admin and browser obligations for totals 117 and 86.
No existing authority, verifier, workflow or test gate is weakened or replaced.
Independent read-only publication review found no actionable source finding.
The reviewer independently verified the exact ten-path/twelve-lock scope,
unchanged reviewed code/tests/registration/inventory, complete predecessor
94/72 check preservation, applicable workflow/job coverage, actual-PR authority
and all 16 authority tests. The temporary expected-run census was corrected to
exclude Branch Hygiene, which triggers only when a PR closes; no source change
was needed. Preservation, secret and whitespace checks pass.

Initial source head `68453aa3` ran Player Terminal Verify `42001356944` / job `127157096373`
and failed at Authorize pull-request scope with “Player authority identifier is
not bound to this pull request” before the actual PR912 manifest was added.
This initial failure is retained and is not evidence against the later final head.

The initial exact-head PR census contains 35 pull-request workflows plus dynamic
CodeQL; existing path filters select Player Multiplayer/Load automatically.
No duplicate dispatch is required if that final-head run exists. Guarded
release/staging/historical jobs must remain reported as skips rather than passes.
The shell CLI workflow-catalogue GET returned `Forbidden`; it was not retried.
Connected GitHub run/job/check reads support an explicit paginated census.

## Review, limits and next action

Independent read-only review by `/root/review_banking_ownership` examined the
actual staged, tracked and untracked implementation, registrations and
before/after evidence. No actionable findings. The reviewer independently reran
all 29 strengthened regressions successfully, with zero skips, and inspected
the native browser and exact-baseline logs. No review edits were made. Review
limits: no hosted runtime review, full browser-suite run or independent rerun
of backend gates; CI bundled-browser qualification remains outstanding.

The evidence above is local qualification. Hosted qualification runs against the
exact final remote head in PR912, including the existing full browser, disposable
DB and Multiplayer/Load jobs selected by `player-terminal/**`. This source
checkpoint claims no terminal hosted outcome. Final run/job/check identities and
limits belong in the PR qualification result and parent handoff without changing
the qualified source tree. No authenticated live staging/database exercise or
release qualification is authorized. Source is published only as a draft; no
merge, auto-merge, manual deployment or hosted application-state mutation.
Parent ARCH-501/502 completion and Settings rollback remain separate.

Next exact action: finish exact-final-head hosted qualification and parent review
of draft PR912. Preserve #624/#888 work and all release holds. Store action
ownership remains the next separately bounded architecture slice.
