# Funded Business Store quote expiry contract

## Scope and ownership

- Roadmap item: `STORE-FUNDED-QUOTE-EXPIRY-001`.
- Status: `IMPLEMENTED_NOT_MERGED`; local implementation awaits independent review and draft publication. No hosted or merged-main completion credit.
- Owner: `fix/store-funded-quote-expiry-v1`.
- Exact base: `150ca9935ace3182c0a069e2b92691a4b58f2a0f`, including merged World presentation PR #939.
- Implementation commit: `dfd98486bc8b1c3fbad1017754e3748d08fe06ac`; tree `02d6ba427795bf07852e6a55f3ab4148bc0c237d`.
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
- Root `npm test` passes, retaining its one existing GNU-tar platform skip. Full Player `verify` and backend TypeScript pass.
- Offer-aware quote structural, simulation and typed contracts; multi-currency Store funding; atomic settlement; Player Store cutover; architecture/seam ratchets; secret scan and diff checks pass.
- Full backend smoke completed 23 Deno groups / 968 cases before the unchanged Game Sessions import required the unavailable pinned Supabase SDK. Full Edge typechecking fails at that same SDK import with connection refused. Neither aggregate is reported as passing; configuration and lockfiles are unchanged.
- No database, connected-browser, new-head hosted, staging or production verification has been run for this local correction. No SQL changed.

## Remaining gates and rollback

Obtain independent source/test review before draft publication. Register the actual new PR number in a separate exact-path Player authority, preserving current main's required/critical checks and read-only verifier locks; do not invent a PR number. Qualify all applicable exact-head hosted checks, including connected Store and Player journeys. The distinct mobile-focus and stale FX fixture issues remain separately owned.

Rollback is the normal reviewed revert of the two runtime changes and their tests/metadata. There is no schema or data rollback. No deployment, workflow dispatch, hosted mutation, production operation or `VERIFIED_COMPLETE` claim is authorized or performed here.
