# Fractional Banking transfer inputs

- Roadmap item: `PLAYER-BANKING-FRACTIONAL-TRANSFERS-001`.
- Branch: `fix/banking-fractional-transfer-inputs`.
- Baseline: `08134650d1e0c8cfebb811a5d97331196ebe08e3`.
- Local implementation: `b79e8114cb66a4d99a024e8bd2904d4bc0830c12`.
- Status: `IMPLEMENTED_NOT_MERGED`. Keep the PR draft. No merge or deployment.

## Contract review

The owner requested separate branches and PRs for the smaller integration fixes, including review of fractional Banking transfers. No active PR owns this input correction. Existing Banking freshness ownership is already on main and is preserved; Crafting visibility is separate PR922.

The current source supports two-decimal transfers through the complete source path:

1. `player-terminal/src/core/format.js` serializes form amounts without truncation. `business-banking-backend-routes.js` converts them with `Number`, retaining cents. It excludes browser-selected player/game scope and currency from transfer payloads.
2. `backend/src/domains/business-banking/api/playerBusinessBankingHttpHandler.ts` resolves authenticated scope and current economic currency, accepts 0.01 through 1,000,000 and normalizes to two decimals for both transfer commands.
3. `20260721122100_fix_business_banking_rpc_signatures_v1.sql` delegates the scoped peer-transfer overload to the atomic command. `20260721122200_fix_business_connected_banking_v1.sql` accepts numeric amounts and posts rounded, matching debits/credits with idempotency. `20260806070000_canonicalize_player_checking_wallet_v1.sql` rewrites its legacy cash account literals to checking.
4. `20260806093000_provision_player_banking_and_credit_v1.sql` defines the current numeric checking/savings command, rounds to cents, checks funds, records both legs and returns the posted amount, retaining replay checks.
5. `20260826091000_banking_transaction_holds_v1.sql` preserves numeric ledger amounts and requires every posting to match its currency's decimal precision. The UI therefore uses at most two decimals, narrowed for a published 0- or 1-decimal local currency. When currency metadata is absent, the existing authenticated command's cent contract is used; server-side currency and funds validation remain authoritative.

This is source-contract review plus adapter/HTTP unit evidence, not a new live settlement or database certification. No SQL, RPC, route, authorization, idempotency or backend runtime is changed. Normal transfers still use server-resolved local currency and do not become multi-currency account selection.

## Change and verification

- Both transfer amount controls use the supported minimum/step and a decimal keyboard hint. Existing limits, available-balance checks, same-account validation and capability gates are preserved.
- Updated `banking-read-model.mjs` is already registered by `banking-read`. It covers default/0/1/2/4 currency precision, limits, grants and exact 0.01, 0.50 and 12.34 adapter payloads with no scope/currency injection.
- Added handler regression in `playerBusinessBankingRoutePaths.test.ts`: all 12 file tests pass, including both transfer types at 0.01/0.50/12.34 and out-of-range rejection before RPC execution.
- New `player-banking-transfers.spec.mjs` uses real terminal submission and adapter resolution, testing the same fractions, full 12.34 balance, invalid precision, zero/negative/over-limit/insufficient funds, and recovery to a valid amount. It does not simulate database settlement as a passing database test.
- New input regression fails on unchanged main and passes candidate.
- Full Player verification, full root `npm test`, backend TypeScript, secret scan and whitespace checks PASS on Node 22.23.1/npm 10.9.8/Deno 2.9.3. Inventory regeneration is byte-identical.
- Full Edge and backend smoke remain unqualified locally: the identical baseline dependency graph was blocked in the sibling Crafting run by connection refusal for frozen `esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs`. No dependency changes or checksum bypass.
- Browser execution is unqualified locally: the pinned browser download is truncated and system Chromium fails before test execution with socket permission denial even after the approved elevated attempt. Hosted pinned-browser checks are required. No browser assertion was waived.
- No staging, production or disposable database was mutated locally.

Files: the Banking renderer, existing Player read-model test, new browser test, existing handler test, this evidence, additive roadmap intake and actual-numbered PR authority. Independent review and exact-head CI remain required before merge consideration.
