# Fractional Banking transfer inputs

- Roadmap item: `PLAYER-BANKING-FRACTIONAL-TRANSFERS-001`.
- Branch: `fix/banking-fractional-transfer-inputs`.
- Baseline: `08134650d1e0c8cfebb811a5d97331196ebe08e3`.
- Local implementation: `b79e8114cb66a4d99a024e8bd2904d4bc0830c12`.
- Draft PR: [#923](https://github.com/kohnerbouchard-star/Student-Profile/pull/923). Published implementation `d953c3d6154fde9a97681d1fac8eeccc7f7fffee` has tree `09053e59e94ce3d7397bc57bf9e80001d5e0cc26`, identical to the tested local tree.
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
- Full Player verification, full root `npm test`, backend TypeScript, secret scan and whitespace checks PASS on Node 22.23.1/npm 10.9.8/Deno 2.9.3. The initial inventory regeneration was byte-identical; the local-currency correction updates only the generated read-model line count/order, preserving every architecture ceiling and debt count.
- Full Edge and backend smoke remain unqualified locally: the identical baseline dependency graph was blocked in the sibling Crafting run by connection refusal for frozen `esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs`. No dependency changes or checksum bypass.
- Browser execution is unqualified locally: the pinned browser download is truncated and system Chromium fails before test execution with socket permission denial even after the approved elevated attempt. Hosted pinned-browser checks are required. No browser assertion was waived.
- No staging, production or disposable database was mutated locally.

Files: the Banking renderer and read normalizer, existing Player read-model test, new browser test, existing handler test, generated architecture inventory, this evidence, additive roadmap intake and actual-numbered PR authority. Independent review and exact-head CI remain required before merge consideration.

Actual-PR registration `pr-923.json` locks the nine edited paths and two unchanged verifier/test paths. It preserves all 118 required and 87 critical checks from current-main PR921, with production and secret handling denied.

## Review follow-up: local-currency account selection

Independent review of `8ac41cc642edb29fe7461e52cbaca1fd648587c0` found no introduced defect, but reproduced an existing bug directly affecting transfers: ledger balances sorted by account kind and currency selected the first checking/savings account, even when its currency differed from the authenticated session. A foreign ECO checking balance of zero incorrectly blocked a valid NRC 0.50 transfer. The owner requested this bounded correction in #923.

- `normalizeBankingRead` now uses the authenticated session currency when selecting the local checking and savings summaries. All returned balances and their per-currency posted/held/available amounts remain intact for display and FX. Command currency remains exclusively server-derived.
- Missing local checking is explicitly unconfigured with unknown (null) amounts rather than a foreign or stale balance. Missing local savings remains unconfigured. Peer transfers need local checking; internal transfers need both local accounts plus the existing independent grants.
- The added Node regression fails before the fix (`ECO !== NRC`) and passes afterward. It covers foreign balances sorting first, distinct posted/held/available amounts, unchanged complete balances, and either/both local accounts missing after a prior valid read.
- The real-form browser fixture now uses the normalizer with foreign-first balances. Added checks cover savings-to-checking at the exact held-adjusted 7.50 balance versus invalid 7.51, and disabled transfers when local checking/savings is absent. Existing checking-to-savings and peer fractions remain covered.
- Shared `app.js`, command payloads, API routes, server economics, CSS and workflows remain unchanged. The generated inventory gains only four source lines in `read-model.js`; no architecture limits are relaxed.
- Renewed full Player verification, full root tests, backend TypeScript, 12 handler tests, 16 authority regressions, architecture ratchet, secret and whitespace checks pass. The root inventory gate was rerun after staging the deterministic generated inventory; no gate or ceiling changed. Independent re-review found no actionable defect and independently checked account-order permutations, normalized currency text, held-adjusted fractional availability, foreign-only and unknown-local cases. Browser additions were inspected but not run locally. Fresh exact-head hosted browser/Edge qualification remains required.
- Reviewed source blobs: read normalizer `78496d37d0c9388718c29cd9d5aaf7b1a19e0d2a`; renderer `1e35c620be4da1d8520acb983b271fef72b4fef5`; Node regression `23a2dfd117e865837526f8de832ac9959654b9c8`; browser regression `c8e6199876d269d2d3bd1a133887f7cc69b1e755`.

## Main-forward integration

Main `f6ef470e39bc4b40c191daf160ad55e57ff02328` includes merged Admin #928, Loans #925, provisioning/Campaign #885 and Business #926. Preserve all inherited files and shared intake entries; do not reinterpret their prior draft wording as current source status. The scoped feature source/tests are unchanged, except the Banking handler test retains the new main Loans assertion plus its existing transfer regression. Crafting has only an additive roadmap conflict; Banking additionally regenerates the combined architecture inventory with its four-line read-model delta. Authority check arrays now exactly retain current-main PR885 (125 required/92 critical), with no new writable paths or production/secret permission.

The owner authorized finishing and merging qualified PRs. This integration remains unmerged and needs new exact-head CI; prior-head success is historical only. No deployment or live mutation.

Integrated-tree local checks: full Player verification, full root tests, architecture ratchet, actual-PR scope verifier, secret and whitespace checks pass. The shared backend TypeScript step passes; full Edge and backend smoke stop on the unchanged frozen esm.sh Supabase module connection refusal, not a source/test failure. Banking also passes 26 merged Loans/transfer handler and forecast tests. Original feature source/browser test blobs remain unchanged; fresh hosted Chromium and exact-head checks remain required.

Serial continuation: qualified Crafting #922 merged as `ea24905ef5770567c96cf128897335f69074fcd6` with exactly reviewed tree `9099e8892a68acc15668b24e58c4211200e64a6a`. Its 24 workflows pass, with 50 successful checks and four guarded skips. Banking integrates that main before publication, preserving all Crafting source, authority and intake bytes. Banking feature and backend test blobs are unchanged from independently reviewed local integration `26a504daf37c4f495b4f45af7fa856c2e502ba50`; only the shared roadmap insertion required additive resolution. Prior Crafting draft wording is historical, not current source status. Fresh combined full Player/root, 16 authority regressions, actual scope verification, architecture/inventory, secrets and whitespace checks pass. Backend source/tests are byte-identical to the preceding integration, retaining its TypeScript and 26-test evidence and its explicit local Edge/smoke dependency limit. New exact-head CI remains required for Banking.

## Final prerequisite integration

Main `6c605615cbbda33b730224b5b2e8a22be4d2a6fd` adds qualified #930 Market review refresh and #931 Marketplace reservation fixture isolation. Preserve all their source, tests, workflow, authority and additive roadmap content. PR931 merged tree `86f1a5e48df4ee77414d31396df7952d2f2f6307` exactly matched independent review and 44 successful workflows, with 73 successful checks and 14 guarded skips. Its mandatory PostgreSQL proof and full ordered Inventory-to-Marketplace/World and 30/40-player load passed. Main automatic production deployment remains disabled.

Banking head `b347f74bb410bfa3ad2382b06d985228880d1920` completed 42 successful workflows and two expected staging/release skips, with only the pre-existing Marketplace fixture projection mismatch failing. All 279 Player Chromium cases passed, including all 24 Banking cases. Independent diagnosis traced a fixture that zeroed projected reserved inventory despite an authoritative pending redemption; #931 preserves reservations and the unchanged fail-closed runtime guard. This normal integration changes no Banking source, browser, Node or handler test bytes. Historical results do not qualify the combined head: independent union review and fresh exact-head hosted checks remain mandatory. No production deployment or live settlement certification.

Fresh integrated local validation passes full root tests (including architecture/inventory gates), full Player verification, all 16 authority regressions, actual nine-edited/eleven-locked scope, four fixture boundary regressions, secret scan and whitespace checks. The real PostgreSQL proof is explicitly skipped locally because psql/Docker are unavailable; its new-head hosted execution and full ordered browser/load remain required. Backend source/tests are byte-identical to the earlier Banking integration, preserving its TypeScript/26-test evidence and explicit local frozen-Edge-dependency limitation.
