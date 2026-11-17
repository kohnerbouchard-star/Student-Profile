# Facility-bound repayment account disclosure

Roadmap: `LOANS-REPAYMENT-ACCOUNT-DISCLOSURE-001`.
Base: `956ad02db949ae9c4cff7d709a18ec28d20c0788`.

The existing Loans read fetches player/game-scoped facilities including
`repayment_account_type`, but its public projection omitted the bound account.
A player could choose Savings at application and later see no indication of the
account that a payment would debit. The existing server command remains the sole
binding/funds/currency authority.

## Implementation

- `backend/src/domains/business-banking/infrastructure/supabasePlayerBusinessBankingRepository.ts`: whitelist canonical persisted Checking/Savings/business-key categories into `repaymentAccountType`; no identifier returned and no added query.
- `backend/src/domains/business-banking/contracts/playerBusinessBankingContracts.ts`: optional additive category for older/injected repositories.
- `player-terminal/src/pages/loans-page.js`: show category and facility currency before the existing payment form. Invalid/missing metadata is unavailable, not guessed. No input, mutation or balance behavior changes.
- Existing backend route characterization, Player lifecycle tests and browser lifecycle suite gain category, missing/invalid, refreshed metadata and no-write cases.

## Verification

Node lifecycle suite: 11/11 passing. Backend route characterization: 13/13 passing
under native Deno (also passed under Node TypeScript transform). Full Player
`verify` passes. This is not real database or Edge runtime certification. Existing read-call assertions prove no
additional persistence operation or relaxed scope. Full aggregate/typecheck/browser
qualification recorded separately when finished. No real database, staging or
production acceptance is claimed.

## Rollout and compatibility

No migration, RPC, route, permission, CSS or deployment change. Old responses keep
existing payment controls and display an explicit unavailable account notice.
New response property is additive; old clients ignore it. The server continues to
reject invalid accounts, currencies or insufficient funds. The disclosure is not
a balance reservation or a payoff quote. No merge or deploy in this tranche.

## PR996 qualification correction

Draft PR #996 source `ba1d5128f373f809bc655b94a2a3a6612309682a` failed eight
workflow authority gates because its own PR-bound manifest had not been published.
The ninth failure was the retained exact golden snapshot, which omitted the new
explicit-null repayment category. The correction adds that one expected property
and retains every original expected value and strict equality; no runtime or
verifier changes. All 96 tests in the exact Loans lifecycle Deno command pass.

The actual-number authority locks the complete diff and unchanged verifier/tests.
The CI contract records 33 workflow families,58 active tuples and5 intentional
guarded skips; no workflow, deployment or production permission changes. Fresh
exact-head hosted checks and full browser acceptance are pending, not certified.
