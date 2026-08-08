# Admin UI V2 Players — verification record

**Exact audited start base:** `b7827211f0ff15b8a963219a63738180b33a1b3d`

**Current convergence target main:** `2b8c8ae245fea4e51d173d14489a21458b7935c8`

**Verified implementation head:** `2b5100d4971ebe31be588bf89014e5be47e73521`

**Draft PR:** #519

The Players implementation was originally reconciled against `4c17b942fcf4b2a6f60b629549f192d066053ba4`. Since then, the Admin baseline advanced through the narrow pre-convergence cleanup PRs #523, #524, #525, and #526. Those changes repair scroll-contract acceptance, remove excess `MutationObserver` debt without raising the ratchet, align the v606 drift audit with the fluid Admin shell, and retire the remaining share-code runtime style injection. They do not change Admin V2 Players route source, its authoritative Admin/BFF contracts, or its permission model.

The current convergence target is therefore `2b8c8ae245fea4e51d173d14489a21458b7935c8`. GitHub PR checks on the current branch head must validate the Players tranche against that target before controller merge.

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

## Baseline cleanup status

The formerly inherited repository failures are resolved on current `main` before Players convergence:

- Admin Scroll Integrity is green after PR #523 corrected stale fluid-shell contract assertions.
- Repository Quality is green after PR #524 reduced Admin observer debt back to the authoritative maximum of 11 without raising the threshold, and PR #525 reconciled the accepted v606 drift audit with the fluid shell.
- Admin Shell Smoke and Admin Browser E2E are green after PR #526 retired the remaining runtime share-code style injection.

The Players tranche itself still does not modify the legacy Admin scroll subsystem, global architecture ratchet, backend, database, or Supabase ownership model. Final merge remains contingent on fresh PR checks against the current convergence target.
