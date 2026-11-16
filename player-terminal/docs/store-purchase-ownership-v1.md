# Player Store purchase ownership

Date: 2026-11-06. Child: `ARCH-501/502-PLAYER-STORE-OWNERSHIP-001`.
Local owner: `fix/player-store-purchase-ownership-v1`.
Verified source main: `767bc0e8998d548b2cb0de9e649000fe23f92630`.
Implementation commit: `efc17c1d4d0d41bcdd7dc50bd6929cc9252466a1`.
Status: `IMPLEMENTED_NOT_MERGED`; independent review remains pending.
No publication, push, pull request, merge, deployment or hosted-data mutation is
authorized or performed. Parent ARCH-501/502 and live capability are not complete.

## Reproduction and correction

The original 32-case native ownership suite on a detached, unchanged-main checkout
fails 22 cases and passes ten. Its synthetic adapter holds responses while using
the real terminal renderer, store, freshness coordinator, PlayerApi, funding form
and quote/receipt validators. The reproduced defects are:

- Funding account, fixed amount or quantity edits (including change/back) still
  permit an old quote to replace the edited form with review, for both offer kinds.
- Game/CSRF rotation and route leave/return permit obsolete quote effects,
  including session-invalid dispatch from a late 401.
- Aggregate invalidation does not retire a pending quote or prevent confirmation
  of an accepted quote based on old funding evidence.
- A late immutable-receipt 401 can invalidate a replacement modal/session.
- Pending settlement can publish a receipt into a retired view/session.
- Idle select/review/receipt actions can start traffic under a replacement session.

The seven-case Node convergence suite fails three and passes four on unchanged
main. It reproduces reads starting after owner retirement and characterizes the
bounded supersession recovery described below. Baseline passing cases are kept:
destroy/close-reopen quote retirement, repeated actions, committed refresh warnings,
same-session convergence after receipt close and current-session 401 recovery.

Store now uses the existing terminal coordinator through its existing PlayerApi.
The bounded owner in `store-purchase-convergence.js` separates modal generation,
route/status lifecycle and transaction session from committed read convergence.
Quotes additionally capture Store/Banking/BankingFX/session resource generations
and snapshot identities. Funding edits abort/retire the pending intent and release
its button; old callbacks cannot restore review, errors or focus. Confirmation
rechecks the quote's owner. Idle actions recheck the original transaction session
before making traffic. Session/route retirement never declares a server rollback.

The first candidate exposed a regression in the retained receipt-navigation test:
shared-coordinator invalidation let a competing route/realtime publisher supersede
the committed aggregate refresh; Store stock remained three instead of one. The
same retained case passes on main. The correction delegates **one** new attempt
to `terminal.refreshResources` only for `REQUEST_SUPERSEDED`. Repeated contention
stays pending. No private publisher/cache, arbitrary network retry, polling or
settlement retry is introduced. The unchanged retained test then passes on both
desktop and mobile; the Node suite proves the two-attempt bound. A strengthened held-settlement
regression also demonstrated route retirement aborting the command transport;
settlement now retains session ownership separately from modal cancellation and
refreshes the committed stock after leaving/returning without reopening a receipt.

## Preserved behavior

- Server ownership, endpoints, quote/purchase payloads, pricing, allocation
  validation, idempotency and economic transactions remain unchanged.
- Confirmation remains explicit. Normal dismissal remains blocked while an
  economic POST awaits its result. Route departure retires modal effects while
  preserving the confirmed command and its same-session read convergence; session
  retirement/destruction aborts this adapter. Abort is not proof of rollback.
- Committed receipt and immutable Business receipt validation remain authoritative.
  Receipt close/navigation permits same-session refresh; a replaced modal cannot
  receive obsolete effects. Failed refresh remains committed success with pending
  warnings and a read-only Retry refresh action.
- The existing fan-out remains dashboard, Store, inventory, Banking and BankingFX.
  The terminal alone publishes refreshed snapshots and settles aggregate freshness.
- No visual-system, backend, SQL, RPC, migration, dependency, lock or release change.

## Exact local scope and coordination

1. `player-terminal/src/features/store/store-purchase-flow.js`
2. `player-terminal/src/features/store/store-purchase-convergence.js`
3. `player-terminal/tests/store-purchase-ownership.mjs`
4. `player-terminal/tests/browser/player-store-ownership.spec.mjs`
5. `player-terminal/package.json` (append the Node suite to existing `store-flow`)
6. This record.

Current main was fetched before work and re-fetched unchanged after implementation.
All 17 current open PRs and their complete changed-file lists were inspected.
No active branch/PR owns this correction. #624's CSS, main/realtime, existing
browser and disclosure paths stay byte-identical. #888's Dashboard/Loans sources,
diagnostics, tests and authority remain untouched. No donor code is acquired.

The as-built helper fits in an existing Store module: source-file count, every
architecture inventory field and all ceilings remain unchanged. Regenerating the
actual-checkout inventory produces no diff. Existing Store test files, #624
protected scopes, authority verifier/regressions, all prior manifests/check lists,
protected hashes and release holds remain unchanged. New browser coverage is
automatically discovered by the existing runner; `verify` reaches the expanded
`store-flow`. The unchanged isolated Player scope verifier accepts the entire
six-file diff, so no invented PR number or authority manifest is used.

The shared roadmap/status correction is expressly excluded by parent direction
and handled separately. This scoped record supplies the implementation status and
next action without overwriting the shared ledger owner's work.

## Qualification and review

Initial local qualification at `5ce9d32f646b0015ee302383a5e0af07fbf72bfe`
(raw logs under `/tmp/player-store-evidence/`). The independent-review amendment
below supersedes this source qualification for the corrected candidate:

| Check | Result |
| --- | --- |
| Same final ownership browser suite on unchanged main | 22 failed, ten passed, no skips |
| Same seven-case Node suite on unchanged main | Three failed, four passed, no skips |
| Candidate ownership Node suite | Seven passed, no failures/skips |
| Candidate native browser plus unchanged retained Store suite | 76 passed, zero failures/flaky; two existing mobile duplicate-layout skips |
| Complete Player `verify` | Passed, including registered ownership suite |
| Root `npm test` | Passed |
| Backend `typecheck:all` | Passed TypeScript and all 28 Edge roots |
| Backend `smoke` | Passed 1,422 Deno tests and 18 Node tests |
| Unchanged authority regression suite | 16 passed |
| Entire six-file isolated Player scope | Passed unchanged verifier |
| Actual-checkout architecture inventory regeneration | Byte-identical; no debt or count delta |
| Changed-file secret scan and whitespace checks | Passed |

The two retained mobile skips are the existing desktop-parameterized multi-width
and zoom tests, which execute under the desktop project and cover their own
mobile viewport cases. Every new ownership case runs on both projects with zero
skips. No original test or assertion was changed. Both retained navigation cases
pass after the bounded supersession correction. Final source also passes the
strengthened pending-settlement command/stock-convergence assertions.

 Tests use
Node 22.23.1, npm 10.9.8 and Deno 2.9.3. Browser fallback is system Chromium
151.0.7922.173: pinned Playwright Chromium 147 download was denied by network
policy (`403 Domain forbidden` at `cdn.playwright.dev`). Local-only configuration
disables unavailable video recording and retains screenshots/traces. Checked-in
browser configuration and assertions are unchanged. This does not qualify the
pinned hosted browser, connected database/load, staging or production.

Native independent review was attempted with `codex review --uncommitted` and
failed before review, exit 1:

```text
WARNING: proceeding, even though we could not create PATH aliases: Read-only file system (os error 30)
Error: failed to initialize in-process app-server client: Read-only file system (os error 30)
```

No independent-review success is claimed. The delivery artifacts contain the full
diff including new files, exact source hashes, baseline/candidate reports, failed
baseline screenshots/traces, original regression evidence and this exact reviewer
error for external independent review. Next: obtain that review, resolve findings
and return the concrete local candidate for parent review. Publication requires
separate approval; hosted qualification follows only after authorized publication.


## Independent-review amendment: ambiguous settlement retry

Independent review of `5ce9d32f646b0015ee302383a5e0af07fbf72bfe` found a P1
regression: beginning settlement advances modal generation, but a failed response
restored the preceding quote owner. Confirm then rejected the original quote and
forced a new one. Readiness was not granted; the original logs and source remain
preserved as historical evidence.

A new real-terminal regression for each offer kind commits in the synthetic
server and loses the response with `REQUEST_TIMEOUT`. On the reviewed candidate,
both desktop cases fail: a second Confirm cannot reach the receipt. The test
also refreshes Store/BankingFX evidence and advances local quote expiry before
retry, so a committed command cannot accidentally become a newly quoted purchase.

The correction retains a separate `commandRequest` after a non-reset settlement
failure. Confirmation retries that same session/view-owned command rather than
reapplying resource freshness or local expiry checks intended for an unconfirmed
quote. The existing PlayerApi alone retains/reuses the ambiguous command's
idempotency key; neither payload construction nor API retry-key policy changes.
Fresh quote acceptance, funding/quantity edits and authoritative quote-reset
failures explicitly clear the command owner. Session/route retirement, explicit
confirmation, stale-quote protection before first settlement, immutable receipt
validation and read-only convergence remain intact.

Focused before/after evidence: two new cases fail on the reviewed candidate;
all four desktop/mobile cases pass after correction, with zero skips. They assert
one quote, two identical purchase payloads with the same nonempty idempotency key,
and one stock decrement after a lost committed response. `review-regression-before`
and `review-regression-after` JSON/log/trace artifacts retain this comparison.
Correction implementation commit: `62b0ec6f7ddbe187f9d00da6ab4d9121441cc848`.
Full corrected-candidate results follow in the final qualification record. No API, coordinator, backend, lock, dependency,
existing test, scope verifier, manifest, inventory or shared-roadmap change.
Previous Chromium download denial and system-browser qualification limits remain.
This amendment needs independent re-review; no publication is authorized.


### Corrected-candidate final qualification

| Check | Result |
| --- | --- |
| P1 reproduction on reviewed `5ce9d32f` | Both new desktop offer-kind cases fail |
| Focused corrected desktop/mobile regressions | Four passed; zero failures/skips |
| Full corrected ownership + retained Store browser suites | 80 passed; two existing mobile duplicate-layout skips; zero failures/flaky |
| Complete Player `verify`, including seven Node ownership tests | Passed |
| Root `npm test` | Passed |
| Unchanged authority regression suite | 16 passed |
| Entire six-file isolated scope, secret scan, whitespace | Passed |
| Actual-checkout architecture inventory regeneration | Byte-identical; no debt/count/ceiling change |

Only Store flow, its new browser suite and this existing scoped evidence document
change relative to the reviewed candidate. Existing tests and all protected scopes
remain byte-identical. Backend source and contracts are unchanged; backend suites
were not rerun for this frontend-only amendment, and the initial TypeScript/28 Edge
root and 1,422 Deno/18 Node qualification remains historical evidence, not a new
execution claim. Prior native reviewer initialization error, download denial,
original review finding and original test artifacts are retained. No independent
re-review success or hosted qualification is claimed. Next: independently re-review
correction `62b0ec6f7ddbe187f9d00da6ab4d9121441cc848` and its amended evidence;
publication still requires separate authorization.
