# Player Market loaded-summary honesty

- Status: IMPLEMENTED_NOT_MERGED; bounded T047 follow-up, not completion of T047 or the 100-task plan.
- Owner: `fix/market-read-state-20261118`.
- Audited main: `03adc6891995fe1d780fe34629b1daf14470ea39`.
- Intake: user requested code-grounded completion work, deferring quota-blocked database qualification.
- Ownership: fetched main and inspected open PRs and Market branch search; no active Market directory-summary owner found. Existing Inventory, Contracts, Business, Banks and Loans owners remain separate.

## Scope and acceptance

The Market summary previously rendered an absent `cel-index` as price zero/change zero and labeled the sum of only loaded rows as market-wide volume. The renderer now discloses unavailable index fields, preserves genuine numeric zero, and labels volume `LOADED VOLUME / Across loaded instruments`. No API, data normalization, query, write, database, financial authority or pagination behavior changes.

Acceptance: absent index and nonnumeric/nonfinite renderer fields cannot masquerade as numeric index observations; finite price/change remain independently visible; aggregate coverage is explicitly limited to loaded instruments. Existing upstream normalization may already convert absent backend fields to zero; this patch does not claim to fix that separate boundary.

## Evidence

- Added eight summary regression cases to existing directory suite. Before the implementation the new unavailable/coverage assertions failed; afterwards all 31 directory cases plus existing market-order flow passed.
- `npm test`: PASS.
- `npm --prefix player-terminal run verify`: PASS.
- Independent read-only review: no blocking findings; reviewer independently ran passing market-flow checks.
- Toolchain: Node 22.23.1, npm 11.9.0 (npm differs from pinned npm 10.9.8).
- `npm --prefix backend run typecheck:all`: BLOCKED at Deno spawn, `ENOENT`; no backend typecheck pass claimed.
- `npm --prefix backend run smoke`: BLOCKED by neutral-config Deno invocation assertion; no backend smoke pass claimed.
- Existing desktop directory browser spec: BLOCKED before tests execute because Playwright Chromium headless executable is absent. No layout/browser pass claimed.
- No database calls/tests, migration, quota change, merge or deployment performed.

## Remaining qualification

Review/publish draft if authorized, exact-head CI and browser qualification, then any separately authorized merge. Database-dependent integration/runtime evidence stays deferred; this local UI slice is not production readiness or full feature completion.

## Draft publication

Draft PR #1014 publishes source commit `7197b731a868bbcf6387d7defe268a5db168d2da`,
whose tree `d25000ef35dbaf1b4999e4d35299d619da74dd8f` exactly matches reviewed local
implementation `af7c0b062`. Its PR-bound authority locks only changed files plus
unchanged verifier/regression files, preserving all existing required and critical
check identities. Integrated roster pins will select the final published source/tree including
this scope and authority file for both sides, followed only by a pins-only commit. Authority verifier accepts six changed paths
under eight locked paths; its 16 regression cases pass. Hosted/browser qualification
remains outstanding. No check, workflow filter, assertion or manual guard is weakened.

## Authority completeness correction

Hosted inspection at `cd55fc2c` found all 25 naturally scheduled workflows passing,
but the manifest omitted `multicurrency-stock-funding-v1` and its two C3C source
and disposable-database job identities. Both jobs had passed. The correction only
appends those exact three required identities and two critical identities, yielding
76 required / 47 unique critical checks. Existing order and entries are preserved;
three dispatch-only guarded jobs remain guarded, with no bypass or workflow edits.
Fresh metadata-complete source publication and pins-only refresh are required;
earlier green results do not qualify the new head. No live database test or
production mutation was performed by this work.

## Actual-main serial integration (2026-11-18)

Normally integrate actual main `9d0518906f4f5746b87a5cc179922145b29d767e`, preserving complete predecessor source/tests/authorities and package registrations. Market page/tests and corrected Stock funding authority remain byte-identical to qualified `2ae47914`. Resolve inherited source pins; roadmap merge is additive. Six-path/eight-lock scope retained. Publish metadata-complete integration then a four-value pin-only child, independently review and qualify every fresh exact-head gate. No manual deployment, provider configuration or live DB action.
