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
