# Combined Backend, Markets, Contracts, Story and test refactor batch

Roadmap: `ARCH-LARGE-PARALLEL-BACKEND-001`. Status: `IMPLEMENTED_NOT_MERGED`.

## Scope and source identities

First of three coordinated publication batches, followed by Edge/Admin tests and Browser/Admin. Base freshly fetched main `d2d951e542b12e9e47f6db1783bdf4ef9993e930`. Reviewed union `3253f12cc009d3ca5477e8ecc99aeb2b62021430`, tree `79b85660982dd2bb82371419015b30e07403322f`. Combined owner `refactor/large-file-backend-batch-20261115` retains intermediate `a01dc3ce0` and its complete original extraction/review history. Bounded source commit `e0dc70a5e` restores all seven files belonging to the two Edge Admin test splits to main; those changes publish only with Edge.

All 163 changed backend source/test paths are byte-identical to the reviewed union. The sole changed script, `scripts/admin-mfa-bff-contract.test.mjs`, retains the reviewed standalone Backend BFF composition reader from `a01dc3ce0`, without referencing future Edge helpers. Existing assertions remain unchanged. No runtime body edits were made during batch assembly. Original per-component scope documents remain historical extraction evidence, not promises of separate PRs.

No workflow, dependency, lockfile, package, schema, migration, RPC, UI, deployment or live-data change. No REF-003 or REF-005 modification: the current source bindings still match because Edge/browser/package files are unchanged. No unused future Edge/browser source readers, maps or synthetic fixtures are introduced. Those final-union paths stay assigned to subsequent batches, including the Edge static-value-import support helper. Final three-batch union accounting must include them then.

Fresh owner-path audit identifies overlapping unmerged roster PR #938 at `playerLoginHttpHandler.ts`; preserve current-main declarations, do not import its feature into this batch, and require owner reconciliation when that branch integrates. Other roster, Edge, CSS, release-control and shared-verifier owners remain separate.

## Inventory and preserved behavior

The unchanged 500-line inventory changes from 73 to 35 oversized sources, removing exactly 38 assigned originals. Total sources: 1,423 to 1,546. Persistence owners52, deep imports71, compatibility markers210 and capability strings140 stay unchanged; no ceiling increases. All target files are now at most495 physical lines. Original entrypoint exports, declaration bodies, query/write authority, validation/error order, endpoint ordering and test registration/fixture identity retain their prior independently reviewed preservation proofs.

## Local qualification

On the bounded source commit, pinned Node22.23.1 and frozen Deno locks:

- Full root `npm test`, core TypeScript, architecture/inventory/retirement guards and secret scan pass.
- BFF authentication/composition:17 pass. Markets:327 pass. Player security:59 pass. Additional Attendance/Inventory lifecycle suites:10 pass.
- Broad Contracts, Dashboard, Messaging, Players, Stocks, Story, economy simulation and Supabase suites:1,396 pass and one retained route assertion failure. `player contract route paths parse list and submit routes` still expects `{kind:"contracts"}` for a retired route returning null. The identical assertion/failure is recorded on untouched baseline; it is not fixed or waived by this behavior-preserving batch.
- Initial extra-suite invocation included a nonexistent Store test path and did not run. Corrected Attendance/Inventory invocation passes; both logs are preserved.
- Full Edge/typecheck and aggregate smoke must be attempted on this candidate and retain any frozen external SDK blocker. Hosted checks, normal merge and predecessor postmerge clearance remain required. No production or rendered-browser acceptance is claimed.

## Original target accounting

| Original path | Before | After |
| --- | ---: | ---: |
| `backend/src/domains/attendance/application/recordAttendanceForAuthorizedStaff.test.ts` | 655 | 4 |
| `backend/src/domains/contracts/api/playerContractHttpHandler.test.ts` | 776 | 3 |
| `backend/src/domains/contracts/api/staffContractHttpHandler.test.ts` | 833 | 3 |
| `backend/src/domains/contracts/api/staffContractHttpHandler.ts` | 859 | 303 |
| `backend/src/domains/contracts/api/staffContractReviewHttpHandler.test.ts` | 919 | 3 |
| `backend/src/domains/contracts/contracts/contractContracts.ts` | 599 | 472 |
| `backend/src/domains/contracts/infrastructure/supabaseContractRepository.test.ts` | 1131 | 4 |
| `backend/src/domains/contracts/services/contractRewardService.ts` | 550 | 363 |
| `backend/src/domains/contracts/tests/playerContractFullLifecycleIntegration.test.ts` | 568 | 4 |
| `backend/src/domains/game-dashboard/api/playerGameDashboardHttpHandler.test.ts` | 2536 | 9 |
| `backend/src/domains/game-dashboard/infrastructure/supabasePlayerGameDashboardRepository.ts` | 522 | 464 |
| `backend/src/domains/inventory/tests/playerInventoryRedemptionFullLifecycleIntegration.test.ts` | 576 | 2 |
| `backend/src/domains/markets/calculations/bondMath.ts` | 546 | 353 |
| `backend/src/domains/markets/calculations/collectiveInvestmentAnalytics.ts` | 626 | 287 |
| `backend/src/domains/markets/calculations/financialStatementAnalytics.ts` | 556 | 306 |
| `backend/src/domains/markets/contracts/financialMarketContracts.ts` | 682 | 455 |
| `backend/src/domains/markets/state/orderReservationStateMachine.ts` | 620 | 468 |
| `backend/src/domains/markets/state/priceTimeOrderBookStateMachine.ts` | 696 | 495 |
| `backend/src/domains/messaging/api/playerMessagingHttpHandler.ts` | 508 | 199 |
| `backend/src/domains/players/api/playerLoginHttpHandler.ts` | 544 | 450 |
| `backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts` | 959 | 276 |
| `backend/src/domains/stocks/api/playerStockMarketReadHttpHandler.test.ts` | 715 | 3 |
| `backend/src/domains/stocks/api/stockMarketRunnerHttpHandler.test.ts` | 907 | 8 |
| `backend/src/domains/stocks/api/stockMarketRunnerHttpHandler.ts` | 560 | 447 |
| `backend/src/domains/stocks/calculations/stockMarketEngine.test.ts` | 895 | 6 |
| `backend/src/domains/stocks/infrastructure/supabaseStockMarketPlayerReadRepository.test.ts` | 705 | 4 |
| `backend/src/domains/stocks/infrastructure/supabaseStockMarketRunnerRepository.test.ts` | 1053 | 8 |
| `backend/src/domains/store/api/playerStorePurchaseHttpHandler.ts` | 503 | 413 |
| `backend/src/domains/storylines/infrastructure/supabaseStorylineRepository.test.ts` | 557 | 5 |
| `backend/src/domains/storylines/services/econovariaStorylineLoopSmoke.test.ts` | 1194 | 2 |
| `backend/src/domains/storylines/services/storyEffectEngine.ts` | 777 | 385 |
| `backend/src/domains/storylines/services/storylineRunner.test.ts` | 865 | 3 |
| `backend/src/domains/storylines/services/storylineRunner.ts` | 591 | 175 |
| `backend/src/platform/supabase/edgeStaffSession.ts` | 602 | 449 |
| `backend/src/security/adminBffRequestAuth.ts` | 642 | 443 |
| `backend/src/simulations/economy/creditRecoveryScenarioSimulation.ts` | 591 | 431 |
| `backend/src/simulations/economy/deterministicEconomicSimulation.ts` | 747 | 344 |
| `backend/src/supabase/tableTypes.ts` | 809 | 341 |

## Recovery and next gate

A main-relative binary patch, exact-head Git bundle, tracked-source archive, changed-path list and SHA-256 manifest are generated together for this combined batch; immutable original component and full-union recoveries remain preserved. Coordinator owns actual PR-number authority, hosted workflow binding and publication. No PR number or remote mutation is claimed here. Next: independent combined-batch review, coordinator metadata and exact-head hosted qualification, normal serial integration, then the Edge/Admin-test batch. The item is not `VERIFIED_COMPLETE`.
