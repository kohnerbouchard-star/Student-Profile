# T027 Banking hold and availability qualification

Status: `IMPLEMENTED_NOT_MERGED`, partial. Owner branch:
`fix/t027-bank-authoritative-hold-offline`. Integration commit `71a0517d59`
normally merges fetched main `73ee21a984` with donor checkpoints `22d03fcc33`
and `71fcca7cbe`. The original `fix/t027-bank-availability-offline` branch and
worktree are preserved. GitHub search found no open Banking PR; CLI auth is
unavailable. Initial qualification did not push or create a PR. The subsequent owner instruction authorizes draft-only GitHub CI publication after the safety audit below.

## Scope and behavior

The shared `parsePlayerBankAccounts` producer requires reported, valid,
nonnegative held funds. Incomplete/malformed required account evidence fails
through the existing ledger 500 / FX 503 boundaries. Explicit zero and signed
posted/available amounts retain their existing contracts. No row is silently
removed. Both ledger and FX overview use the shared mapper.

The Player projection and mounted renderer distinguish posted, held, and
available amounts; missing availability is derived only from a bounded exact
posted/hold pair. Unknown availability stays unavailable in Banking, Dashboard,
and shell. Advisory form validation honors reported zero and leaves unknown
availability for server validation. Dashboard currency projection preserves
loaded Banking evidence rather than replacing it with posted cash.

Implementation files are the economy public repository; Player
`api/banking-balance-values.js`, `api/banking-read-model.js`, `api/read-model.js`,
`components/layout.js`, `core/player-terminal-forms.js`,
`integrations/student-profile-api-call.js`,
`integrations/student-profile-currency-projection.js`,
`pages/banking-page.js`, and `pages/dashboard-page.js`.
No routes, RPC definitions, migrations, DTOs, workflows, or capabilities change.
Reads remain `list_player_bank_accounts_v1`, `list_player_bank_activity_v1`,
and the existing FX overview. Existing server ownership boundaries are retained.

This tranche adds five mounted-terminal read/render cases (ten desktop/mobile
project cases) at `player-terminal/tests/browser/player-banking-availability.spec.mjs`.
They exercise reported hold, fully held/zero availability, unknown hold,
independently reported availability, and an exact decimal remainder through
`createPlayerTerminal` and its real read normalization/render subscription,
using mocked responses and the actual index stylesheets.

## Local qualification, 2026-11-25

Required Node 22.23.1 / npm 10.9.8 lockfile installs succeeded for root, backend,
and Player; native Deno 2.9.6 was acquired temporarily. Lockfiles are unchanged.

- Full `npm --prefix player-terminal run verify`: PASS; 529 Node test-runner
  cases passed, plus the repository's script assertion suites.
- Full root `npm test`: PASS; 561 Node test-runner cases passed, one existing
  conditional PostgreSQL skip, plus script suites.
- Focused `node --test player-terminal/tests/banking-availability.mjs`: six pass.
- Native Deno scoped economy HTTP/session/repository and FX HTTP/hold/repository
  tests: 72 pass, zero fail in the nonduplicated package-equivalent run. Explicit `--deny-net`, repository config and frozen
  lock used. Both HTTP test roots register their session/hold boundary files. An
  earlier explicit-file run also passed 112 executions including repeated imports.
- Core backend TypeScript: PASS during `typecheck:all`.
- Aggregate Edge typecheck: BLOCKED at frozen Supabase SDK import from esm.sh,
  connection refused. No import substitution or lock change made.
- Aggregate backend smoke: BLOCKED at the same frozen SDK import during
  game-session tests; preceding suites, including Banking, passed. No full
  backend smoke pass is claimed.
- New browser spec syntax and Playwright registration: PASS, ten cases found.
- Desktop/mobile browser execution: BLOCKED before all 48 selected tests could
  execute (new spec plus existing freshness, FX, and transfer suites). Pinned
  Chromium 147 download returned HTTP 403. Available `/usr/bin/chromium` points
  through `/usr/lib/chromium` to missing `/opt/codex/browsers/chromium`; launch
  fails before page creation. Disposable apt package fallback found no package.
  No browser, visual, responsive, or connected-runtime pass is claimed.
- Whitespace check: PASS.

Commands for the scoped Deno run, from backend:

```sh
deno test --deny-net --config supabase/functions/deno.json \
  --lock=supabase/functions/deno.lock --frozen \
  src/domains/economy/api/playerBankingPublicHttpHandler.test.ts \
  src/domains/economy/infrastructure/supabasePlayerBankingPublicRepository.test.ts \
  src/domains/banking-fx/api/playerBankingFxHttpHandler.test.ts \
  src/domains/banking-fx/infrastructure/supabasePlayerBankingFxRepository.test.ts
```

Unique local logs: `/tmp/t027-20261125-player-verify.log`,
`/tmp/t027-20261125-root-test.log`, `/tmp/t027-20261125-deno-scoped.log`,
`/tmp/t027-20261125-typecheck-deno.log`,
`/tmp/t027-20261125-backend-smoke.log`, and
`/tmp/t027-20261125-browser.log`. Browser output is under
`/tmp/t027-20261125-browser-results`, using disposable HTTP port 42727.

## Remaining gates

Do not mark T027 complete. High-range backend money conversion still uses
JavaScript Number and existing eight-place subtraction; full monetary
precision needs a separately bounded contract decision. Tiny browser decimal
underflow and formatting beyond two fractional display places also remain
unqualified. No economic mutation, database replay, hosted data, live account,
production deployment, or staging certification was attempted.

Next exact action is T027 mounted desktop/mobile qualification with a working
pinned browser, then frozen SDK aggregate Edge/smoke qualification and review of
this exact owner branch before authorizing any backend publication. The owner subsequently authorized a draft to run these exact-head checks under
the audited non-applying publication path. Keep it draft while gates remain open.

## Draft publication safety audit, 2026-11-25

Owner instruction: continue GitHub native desktop/mobile and SDK qualification
if draft publication cannot apply a hosted backend. No merge, deployment,
manual workflow dispatch, direct hosted write, integration change or gate waiver.

Fetched main remains `73ee21a984`. No workflow file is changed. Exact source
diff includes four backend source/test paths but no migration, Supabase config,
Edge root, release request, environment manifest, or deployment file.

Supabase Preview is a provider GitHub App check, not an Actions workflow in this
repository. Read-only GitHub check-run `139059239019` on current draft #1054
head `89f18f6a40ce95406cd9913e3528472d434a0a3c` reports `completed/skipped`:
“Creating a new preview branch per PR is disabled. You can re-enable it in
Project Integrations Settings.” Its details URL identifies the production
project's integration settings. T027's remote owner branch did not exist at
audit time, so no existing preview branch association can be updated by this
first push. Earlier checks on #1044, #1038 and #1009 merely said unassociated;
those weaker messages alone were not treated as proof of disabled creation.
No Supabase setting was read through a DB query or changed.

Actions path and job audit against the actual diff:
- Player Terminal Verify schedules the full native desktop/mobile browser suite;
  Backend Typecheck schedules the native Deno/frozen SDK/full backend smoke.
- Banking FX clearing and the other matched economic/browser gates use
  disposable runner databases, synthetic credentials, and local services.
- Release Promote matches the evidence path but only its PR contract-tests job
  runs. Its authorize-promotion job requires workflow_dispatch.
- Release Integrity matches every main PR; its live-parity job requires
  workflow_dispatch on refs/heads/main.
- Staging Readiness matches evidence; staging-preflight requires workflow_dispatch.
- Edge inventory convergence has main-only push paths for backend/src/**,
  but both applying jobs additionally require an explicit authorized dispatch
  on refs/heads/main. Branch pushes/PRs cannot apply them.
- Production Git Release is main-push/explicit-dispatch only for this diff;
  Production Web Session Orchestrator PR paths do not match; its applying job
  requires a main push. Player UI convergence and PR500 production releases are
  main-only and their path filters do not match T027. World Staging Provision
  neither matches this diff nor this PR identity (its applying job is PR325-only).
- Branch Hygiene handles only closed PRs; no close/merge is requested.
No matched active PR job references hosted database/service credentials.
Guarded live/release jobs remain guarded; no workflow or verifier is changed.

Publication sequence: push the existing owner source branch, create exactly one
draft PR against main, add only the actual-number exact-path authority manifest,
then publish its source checkpoint. Refresh both integrated-composite Roster
pins to that identical public SHA/tree in a pin-only follow-up. The existing
Roster runtime projection, source classifications, verifier, modes, overlays,
workflow coverage and all gates remain unchanged. An initial stale-pin/scope
failure is not a waiver; qualify the final exact head. Supabase Preview must
remain skipped on the resulting PR. No production readiness follows from CI.

## Actual draft and supplemental mounted qualification

Draft PR [#1055](https://github.com/kohnerbouchard-star/Student-Profile/pull/1055)
uses the existing owner branch against main. Initial public source
`a290082e972b5061b1ed9a376f614b58c17465f0` has exact tree
`5f921b4e6feee2a0c398f00897d7752cb0db6085`, equal to local audited
`1473f1b45d`. CLI push failed for missing credentials and did not execute;
the connected GitHub tree/commit API published the identical reviewed bytes.
Local integrated donor history is retained under
`refs/checkpoints/t027-local-integrated-20261125`; the clean worktree was aligned
to the public source only after whole-tree equality. No other worker was edited.

Actual-number authority `docs/operations/contracts/player-cross-cutting/pr-1055.json`
locks 29 exact paths (the 27 final changed paths plus the read-only verifier and
its regression test). All requirements from the current main PR1044 manifest
are retained, with matching workflow/job identities added: 127 required /
76 critical. Derivation inspects actual pull-request path filters and job guards;
44 workflows match this diff. Main-only or explicit-dispatch release jobs remain
intended guarded skips. No workflow/verifier/test policy was changed.

Using the Loan History lane's already-installed temporary
`@sparticuz/chromium@158.0.0`, all 48 selected native browser cases passed:
24 desktop and 24 Pixel 7 mobile, including all ten new availability cases.
The suites mount the real Player terminal and exercise read/render, freshness,
FX intent/error handling and transfer forms with mocked API responses. Original
assertions and project viewports were retained. Temporary config uses HTTP port
42727 and disables video because ffmpeg is unavailable; failure screenshots and
traces remain enabled. No repository dependency or lockfile changed. Log:
`/tmp/t027-20261125-browser-fallback.log`; config:
`/tmp/t027-20261125-playwright-fallback.config.mjs`; results:
`/tmp/t027-20261125-browser-fallback-results`.

This supplements, and does not replace, required pinned Chromium 147 GitHub CI.
The earlier missing-binary failures remain historical attempts. Aggregate frozen
SDK checks and connected authentication/database acceptance remain unverified.
Exact PR1055 path verification and strict Roster projection must pass after the
final pin-only publication; public source checkpoint/pin SHA is recorded by the
pin commit and returned to the parent. No merge or deployment is authorized.
