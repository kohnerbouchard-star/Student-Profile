# Admin UI V2 Players — verification record

**Exact audited start base:** `b7827211f0ff15b8a963219a63738180b33a1b3d`

**Current reconciled main/base:** `4c17b942fcf4b2a6f60b629549f192d066053ba4`

**Verified implementation head:** `2b5100d4971ebe31be588bf89014e5be47e73521`

**Draft PR:** #519

While the branch was being built, `main` advanced by PR #507. The intervening delta touched Player Terminal ownership/coordinator files and had no Admin V2 Players overlap. The Players branch was reconciled onto `4c17b942fcf4b2a6f60b629549f192d066053ba4` and no further main reconciliation was required before final verification.

## Focused acceptance

GitHub Actions workflow `Admin V2 Players`, run `31174677427`, passed on implementation head `2b5100d4971ebe31be588bf89014e5be47e73521`.

Passed gates:

- changed JavaScript syntax checks;
- `git diff --check` against the PR base;
- repository committed-secret scan;
- Overview/Store/Market/Players source-owned V2 contract regressions: 30 passed, 0 failed;
- authentication-boundary regressions: 16 passed, 0 failed;
- signed Admin BFF request-auth regressions: 8 passed, 0 failed;
- Chromium Players browser acceptance: 4 scenario groups passed.

The browser acceptance covers:

- desktop, tablet, and mobile layouts with horizontal-overflow checks;
- 0, 1, and 48-player rosters;
- long and Korean/non-ASCII Player names;
- search, account-status filtering, and session-presence filtering;
- selection and detail drawer behavior;
- administrative profile editing through the authoritative settings contract;
- Player ID/RFID and Access Code replacement without revealing existing credentials;
- Player creation through the authoritative roster contract;
- loading, ready, refreshing, stale, empty, failed/retry, and permission-denied behavior;
- no protected Players request when `players.manage` is absent;
- no private ownership UUID or backend diagnostic exposure in rendered DOM.

The browser run exposed and then verified the fix for the final route defect: Players dialog action buttons live in the shared dialog footer outside the form element, so the submit button now explicitly owns its Players form through the HTML `form` attribute. This preserves the shared dialog architecture while making create/edit/credential mutations submit correctly.

## Browser evidence artifact

Workflow artifact: `admin-v2-players-evidence`

Artifact ID: `8992362988`

Digest: `sha256:1b2bb095239555e853c8b3ecd25193705b8076e1e70f53f52e6b1f7a060e9962`

The artifact contains `admin-v2-players-browser-results.json` plus the generated representative Players screenshots. It expires under the workflow's seven-day retention policy.

## Preview/build

The implementation head received a successful automatic Git-connected Vercel preview build. No manual deployment or production promotion was performed.

## Inherited repository failures

These failures are outside the bounded Players tranche and were not modified:

- `Admin Scroll Integrity` fails against unchanged legacy Admin scroll-contract assertions that expect the previous viewport CSS representation.
- `Admin Shell Smoke` inherits the same scroll-integrity failure because it invokes that contract.
- `Repository Quality` reaches the pre-existing Admin architecture ratchet and reports 12 `MutationObserver` uses against an allowed maximum of 11. The Players tranche adds no `MutationObserver`.

Per the Players concurrency/scope rules, no legacy scroll subsystem, global Admin architecture ratchet, backend, database, Supabase, or other Admin route was changed to mask these inherited failures.
