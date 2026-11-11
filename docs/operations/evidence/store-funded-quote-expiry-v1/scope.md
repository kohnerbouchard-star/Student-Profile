# Funded Business Store quote expiry contract

## Scope and ownership

- Roadmap item: `STORE-FUNDED-QUOTE-EXPIRY-001`.
- Status: `IMPLEMENTED_NOT_MERGED`; independently reviewed source is published as draft [PR #945](https://github.com/kohnerbouchard-star/Student-Profile/pull/945). No final-head hosted or merged-main completion credit.
- Owner: `fix/store-funded-quote-expiry-v1`.
- Exact base: `150ca9935ace3182c0a069e2b92691a4b58f2a0f`, including merged World presentation PR #939.
- Local implementation commit: `dfd98486bc8b1c3fbad1017754e3748d08fe06ac`; tree `02d6ba427795bf07852e6a55f3ab4148bc0c237d`. Published source commit `84bffa5de1a32e1d1eb51e97b20fe492493a7ec0` has the exact reviewed candidate tree `da281ed8e2d97a1a4413d979a05d99ed2176fb3d`.
- All fourteen open PR pathsets were inspected on 2026-11-10. None overlaps the four runtime/test paths below. PR #620 owns dependency workflow changes, which are untouched. The separate Store mobile-focus correction does not overlap this backend contract work.
- Existing roster PRs #933 and #938 remain separate. Their Store source was unchanged from common base `a44d8e52119b9f2f3e6642dad0caabf845c46b39`.

## Failure and canonical authority

Connected Business quote requests failed with HTTP 500 at 22:59:19.724 UTC on PR #933 and 22:59:01.019 UTC on PR #938 on 2026-11-10. The fixture selects Asia/Seoul, whose next 08:00 FX fixing was 23:00 UTC. Original quote response bodies and PostgreSQL error evidence were not retained, so these timestamps support the diagnosis without proving their precise internal exception.

The independent defect is deterministic: `20260827093000_multicurrency_store_funding_schema_v1.sql` permits `0 < expires_at - created_at <= 2 minutes`; `20260827093500_multicurrency_store_funding_quote_commands_v1.sql` caps Business quote expiry at the funding expiry; funding authority additionally caps expiry at the next FX fixing. The shared TypeScript quote parser instead demanded exactly two minutes. A valid shortened funded quote therefore threw before the public HTTP handler returned a generic 500.

A distinct connected Player failure after the same boundary returned `FX_RATE_VERSION_STALE` and HTTP 409. That canonical stale-authority guard is correct and unchanged. This correction does not advance FX authority, make a stale quote valid, or repair the disposable workflow's missing daily fixing worker.

Evidence sources:
- PR #933 Business quote job `130177729331` and PR #938 Business quote job `130178901206`; timestamps are retained in the diagnostic record. Original quote payloads are unavailable.
- [PR #938 stale FX quote failure](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42916127876/job/130178895719).
- [PR #933 successful pre-boundary Player journey](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42915792109/job/130177728341).

## Implementation boundary

- `backend/src/domains/store/contracts/storeOfferQuoteContracts.ts`: one shared validator, with an explicit funded entrypoint accepting positive lifetimes up to 120000 milliseconds. The original unfunded entrypoint still requires exactly 120000 milliseconds. Every other DTO, price, currency, key, status and timestamp check is shared and unchanged.
- `backend/src/domains/store/infrastructure/supabasePlayerStoreFundingPublicRepository.ts`: only funded Business quote projection selects the funded entrypoint. RPC arguments, server-derived scope, immutable funding binding, identity lookup and returned DTO stay unchanged.
- `backend/src/domains/store/infrastructure/supabasePlayerStoreFundingPublicRepository.test.ts`: valid full/shortened quotes, replay preservation, scoped seller lookup, public privacy, malformed lifetime and funding/identity rejection coverage.
- `scripts/business-phase10-offer-aware-quote-types.mjs`: retains every existing assertion and adds funded acceptance plus unfunded rejection for shortened quotes, zero/negative/overlong boundaries, invalid timestamps and public contract rejection cases.
- Generated inventory adds only this existing test file's capability-location entry. All inventory counts and ceilings remain unchanged: 1337 source files, 98 oversized sources, 210 compatibility-marker files, 70 cross-domain deep imports and 52 persistence candidates outside infrastructure.

No SQL, migrations, routes, RPC definitions, economic writes, authentication, rate limits, secrets, dependencies, workflow jobs, browser UI, mobile focus or roster source change. Quote expiry remains server-authoritative; the parser does not extend, replace or refresh an expiry.

## Verification

Pinned Node 22.23.1, npm 10.9.8 and Deno 2.9.3 were used.

- Before the correction, the added repository regression suite passed 5/11 and failed 6/11: five valid shortened lifetimes were rejected, and that early rejection prevented the intended identity/binding rejection test from reaching its later checks.
- After the correction: all 11 repository cases pass. Lifetimes 120000, 119999, 60000, 40276, 58981 and 1 milliseconds preserve the exact authoritative expiry; zero, negative and 120001 milliseconds remain rejected.
- The complete retained Player Store suite passes 47/47, including authorization, wrong-scope, privacy, lifecycle, replay, negative-state and rate-limit contracts.
- Root `npm test` passes, retaining one skipped PostgreSQL mixed-reservation proof because `MARKETPLACE_FIXTURE_DATABASE_PROOF` was not enabled; that explicit disposable-database proof is not claimed locally. Full Player `verify` and backend TypeScript pass.
- Offer-aware quote structural, simulation and typed contracts; multi-currency Store funding; atomic settlement; Player Store cutover; architecture/seam ratchets; secret scan and diff checks pass.
- Full backend smoke completed 23 Deno groups / 968 cases before the unchanged Game Sessions import required the unavailable pinned Supabase SDK. Full Edge typechecking fails at that same SDK import with connection refused. Neither aggregate is reported as passing; configuration and lockfiles are unchanged.
- No database, connected-browser, new-head hosted, staging or production verification has been run for this local correction. No SQL changed.

## Remaining gates and rollback

Independent review cleared the source, tests and initial metadata and independently repeated all 47 Store tests, typed contract boundaries, inventory and whitespace checks. The PR945 authority/filter follow-up below requires separate review before publication. Qualify all applicable exact-head hosted checks, including connected Store and Player journeys. Initial source-only CI is interim; the distinct mobile-focus and stale FX fixture issues remain separately owned.

Rollback is the normal reviewed revert of the two runtime changes and their tests/metadata. There is no schema or data rollback. No deployment, workflow dispatch, hosted mutation, production operation or `VERIFIED_COMPLETE` claim is authorized or performed here.

## Actual-number authority and workflow-filter audit

PR #945 is verified as draft at published source head `84bffa5de1a32e1d1eb51e97b20fe492493a7ec0`. The new `docs/operations/contracts/player-cross-cutting/pr-945.json` retains main PR939's ordered 129 required and 94 critical checks and both read-only verifier paths unchanged. Its exact allowlist covers the seven reviewed source/metadata files, its own manifest and the eighteen workflow paths listed below; the verifier and regression script remain read-only.

All 46 explicitly named required workflow families were matched individually against their actual pull-request path filters and this PR's changed paths. Twenty-eight already match or are unfiltered. Eighteen need one exact own-authority path addition; generic `verify` checks are not used as substitutes. Every retained critical job has a mapping within the named families. CodeQL is a retained repository-managed check, not a workflow file modified here.

All eighteen workflows add exactly one `docs/operations/contracts/player-cross-cutting/pr-945.json` entry in `on.pull_request.paths`. Three also bind their existing checkout to `${{ github.event.pull_request.head.sha || github.sha }}` with `persist-credentials: false`: Admin Shell Smoke, Button Action Coverage and Environment Neutral Browser. Current main lacked these three exact-head bindings. Removing those additions reconstructs the original workflow bytes; YAML structure confirms no other command, step, job, guard, permission, branch restriction or push-trigger change. Every newly scheduled pull-request test job checks out the PR head. The disabled live-shaped Database Replay job retains its exact `false && (github.event_name == 'push' && github.ref == 'refs/heads/main')` guard and unchanged checkout. All existing World/Market and other PR entries stay intact.

- `.github/workflows/admin-browser-e2e.yml`
- `.github/workflows/admin-scroll-integrity.yml`
- `.github/workflows/admin-shell-smoke.yml`
- `.github/workflows/admin-v2-crafting.yml`
- `.github/workflows/banking-fx-clearing-v1.yml`
- `.github/workflows/business-financial-market.yml`
- `.github/workflows/business-primary-ipo.yml`
- `.github/workflows/button-action-coverage.yml`
- `.github/workflows/crafting-item-runtime.yml`
- `.github/workflows/database-replay.yml`
- `.github/workflows/economic-core-request-claims.yml`
- `.github/workflows/environment-neutral-browser.yml`
- `.github/workflows/loans-lifecycle-read-v1.yml`
- `.github/workflows/player-button-click-safety.yml`
- `.github/workflows/player-multiplayer-load-e2e.yml`
- `.github/workflows/player-response-privacy.yml`
- `.github/workflows/story-replay-safety.yml`
- `.github/workflows/world-runtime.yml`

This is preparation for independent review, not a claim that the final authority/filter head has passed hosted CI. No dispatch or production operation is performed.

## Provisional runner-predecessor preparation (2026-11-11)

This is **LOCAL ONLY** and `IMPLEMENTED_NOT_MERGED`. Existing published quote head remains `209a4821f93200dbe4eb8bbd1eeb85e15bb5d8b2`. The coordinator authorized preparing the same owner against frozen reviewed runner PR #949 head `5c3514e019fea887bc5312ba15d2c4c98684bc55`, tree `4e1d4b08bb57955955e35e4130c523c30885d6e4`, while that PR's fresh hosted qualification runs. Actual main is still `c5c6003705ecf056f7075df546b1fc8815d6379f`; this is not a claim that PR949 has merged or that this candidate has current-main ancestry.

Preserve the complete predecessor, including all teacher controls, six presentation refactors, readiness repairs, the one Ubuntu runner pin, every PR949 scheduling entry and all evidence/roadmap records. All four quote runtime/test blobs remain byte-identical to published `209a4821`. The deterministic inventory is regenerated from the combined source: 1,352 source files, 93 oversized sources, 52 persistence exceptions, with every other count/ceiling unchanged. Its only predecessor-relative change is the original existing repository-test capability location.

PR945 authority inherits merged PR944's ordered 143 required / 101 critical identities and unchanged production/mutation/secret denials plus two read-only verifier locks. Predecessor-relative scope is 33 changed paths / 35 locks. Preserve the original eighteen exact PR945 filters and three checkout bindings; add only seven exact PR945 authority entries for newly inherited Lifecycle, Settings, Market, Banking, News, Attendance and Messages families. All 53 named required families are audited individually; generic names are bound to their workflow identity, including Attendance's `focused`. No predecessor command, assertion, action, permission, job, non-PR trigger or guard is changed.

Published quote head `209a4821` completed 55 workflow runs: 52 successful, two intended skips and one confirmed unsupported Ubuntu 26.04 / Player Playwright 1.59.1 browser-install failure. That failure motivates separate runner PR949; the single disposable Attendance bind-collision retry passed. This historical evidence does not qualify the provisional combined tree. Committed provisional union `47711183ee22ea1a8bd8dc7c6d37bbb1d56e3478`, tree `a860cc9aa881884949b3d4bcb3d3451996b558bb`, passes fresh full root, all 47 retained Store cases, 16 authority cases plus CLI, three Offer-aware contracts, full Player verify, TypeScript, security, deterministic inventory and whitespace checks. Preservation checks verify all 4,492 predecessor tree entries outside scope, the complete predecessor roadmap and four original quote runtime/test blobs; reversing exactly 25 own-authority lines and three original checkout bindings reconstructs predecessor workflow bytes. Independent provisional source review is clear and repeats the 47 Store cases plus authority CLI/diff. The root PostgreSQL reservation proof is explicitly skipped because `MARKETPLACE_FIXTURE_DATABASE_PROOF` is not enabled. Full Edge and backend smoke stop at the unchanged frozen Supabase SDK connection refusal; smoke completes 23 Deno groups / 968 cases (including a 19-group / 819-case parity subset) with no executed-case failure before that import. No aggregate backend pass or local browser/runtime qualification is claimed. This final evidence-only amendment still requires independent review, and all previously recorded limits remain unwaived. After runner949 merges, verify its actual merge tree equals the frozen predecessor, reconcile actual-main ancestry and evidence, repeat exact committed checks and obtain independent final review before one qualification push. No publication, merge, live staging, production, deployment dispatch or broad completion claim is made here.

## Actual merged-main reconciliation (2026-11-11)

PR #949 is now normally merged as `01af400b7786e151b768d59e4ab0861bbbdb9534`. Fresh GitHub and local verification prove its tree `4e1d4b08bb57955955e35e4130c523c30885d6e4` is exactly the frozen predecessor used for the independently reviewed provisional quote candidate `1f20a237349f16f74926032e21e348e1356750c7`. The normal ancestry merge `63d358a8e7979732f389d988f6e530f48cac560f` preserves that candidate's exact tree `8b6749dad6496a989e89a98a88e2ae4979a22f6e`; no source, test, workflow or inventory conflict or change is needed. Earlier unmerged/provisional predecessor statements are historical.

Runner949 qualified all 143 required / 101 critical identities, 60 workflows and all four Offer-Aware jobs at source `5c3514e019fea887bc5312ba15d2c4c98684bc55` before its expected-head normal merge. The selected Ubuntu24.04 browser job actually installed Chromium and passed 291 cases with 11 source-defined complementary-project skips. All 107 successful job logs bind exact source or the verified identical-tree synthetic merge; 13 job skips retain source-proven production/live/dispatch guards. These are predecessor proofs, not qualification of this quote union, and inherited 142 database lint diagnostics remain unchanged rather than clean. [Runner qualification](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42989453800).

The quote correction stays `IMPLEMENTED_NOT_MERGED` at existing draft PR945. This actual-main amendment changes only its authority note, own scope and additive roadmap checkpoint. All 33 changed paths / 35 locks, ordered 143/101 identities, 25 exact scheduling additions, three original checkout bindings, four original quote runtime/test blobs, 1,352/93 inventory and every merged predecessor byte outside scope are retained. Other Store focus and roster draft heads were refreshed and remain separate unchanged owners. Actual-main committed candidate `33d30f25b51ff05ee05cc54d080668049624e103`, tree `96801c86614665d54d0c1f9fbcd967000c0c1588`, passes fresh full root, 47 Store cases, 16 authority cases and CLI, all three Offer-aware contracts, full Player verify, TypeScript, security, deterministic inventory, exact scope/preservation and whitespace checks. The root PostgreSQL reservation proof remains explicitly skipped; full Edge and backend smoke reproduce the same frozen SDK connection refusal after 23 completed Deno groups / 968 cases, including the 19-group / 819-case parity subset, with no executed-case failure. Independent actual-main source/record review is clear. This final evidence-only amendment requires review before publication and all renewed exact-head hosted gates. No earlier local or hosted result substitutes for that final qualification. No production, workflow dispatch, branch deletion, bypass, additional feature scope or completion claim.
