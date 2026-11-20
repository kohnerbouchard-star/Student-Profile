# Persistence candidate semantic audit

Baseline: `a29f4439368aca18e14a06819e5a7ad6040ac74d`, read-only source audit. All line references below are immutable baseline source. No source/tracking changes, production action, or deletion approval. Active-PR reconciliation is recorded in scope.md; this source classification does not certify hosted runtime traffic.

## Findings first

The 53 are **files with lexical matches**, not database calls, proven architectural violations, or proven production-reachable files. The meaningful split below is a prioritization judgment, not a new ratchet or an assertion every adapter is ideally located. Mixed code deserves bounded extraction; adapters already represent legitimate read/write authority and should not be rewritten merely to move a metric.

Player clock-in is a genuine HTTP persistence seam, but REF-019’s explicit unresolved-login/throttle stop gate remains unresolved. The separate Staff Attendance reward-policy file is also a mixed-read candidate. Neither is changed here.

Best alternative small active non-auth seam: `storylines/services/storyDecisionRoleplayService.ts` decision/definition/relationship reads, consumed through Storylines public index by `contracts/api/playerContractPublicSubmitHttpHandler.ts:154`. Extract a domain-owned read port/infrastructure adapter, preserving lookup order, scoped filters, all null/error/fallback behavior, provider input and timeout. Living World PR #690 is merged, no current open PR owns these paths, and scope.md records the bounded supplemental intake. This does not broaden REF-030. Existing Storylines infrastructure includes decision-resolution adapters, but no matching three-read roleplay port was established in this audit.

## Exact denominator and limits

`scripts/architecture/build-architecture-inventory.mjs:6–9,62–68` scans `.js,.mjs,.cjs,.ts,.tsx` in five roots: backend/src, backend/supabase/functions, admin, frontend/src, player-terminal/src. It excludes dist/node_modules/coverage segments, removes standard JS/typed-array `.from` constructor matches, then selects files containing `.from(`, `.rpc(`, or `createClient(` outside `/infrastructure/`, `backend/src/platform/supabase/`, and `backend/src/supabase/`. It does NOT parse ASTs or remove comments/string literals, does not prove reachability, and does not treat jobs/client factories specially. Recorded inventory: 1,325 source files and 53 persistence candidates. Its hardcoded historical baselineMainSha is not the audited current commit identity.

`scripts/architecture/refactor-candidate-audit.mjs` uses immutable Git blobs and imports paths from that recorded inventory without recomputing it (`inventoryRecomputedHere: false`). Its broader candidate set has different denominators and overlapping flags. Dispositions are canonical, confirmed_dead, compatibility_required, legacy_candidate, historical_archive, defensive_fallback, generated_or_fixture, unknown. Unreviewed files default to unknown (tests/fixtures/generated output default generated_or_fixture); those are not semantic persistence verdicts. No current reviewed register entry grants deletion; safeToDelete is always false. Do not equate this report's categories with registered audited dispositions.

## Mixed persistence and request/application behavior (27)

- `backend/src/domains/attendance/api/attendanceRewardPolicy.ts` (baseline lines 162, 178, 192, 217, 233, 256).
- `backend/src/domains/attendance/api/playerAttendanceClockInHttpHandler.ts` (baseline lines 138, 168).
- `backend/src/domains/auth/api/staffBootstrapHttpHandler.ts` (baseline lines 108).
- `backend/src/domains/auth/api/staffLoginHttpHandler.ts` (baseline lines 157).
- `backend/src/domains/auth/api/staffSignupHttpHandler.ts` (baseline lines 148, 165).
- `backend/src/domains/economy/api/staffLedgerAdjustmentHttpHandler.ts` (baseline lines 118).
- `backend/src/domains/economy/api/staffPlayerLedgerHistoryHttpHandler.ts` (baseline lines 124).
- `backend/src/domains/game-sessions/api/gameSettingsHttpHandler.ts` (baseline lines 126).
- `backend/src/domains/players/api/playerAccessCodeResetHttpHandler.ts` (baseline lines 121, 166, 187).
- `backend/src/domains/players/api/playerLoginHttpHandler.ts` (baseline lines 112, 135, 163).
- `backend/src/domains/players/api/playerSessionBootstrapHttpHandler.ts` (baseline lines 74, 106, 131, 162, 193, 221).
- `backend/src/domains/players/api/playerSessionHttpHelpers.ts` (baseline lines 40, 84, 121).
- `backend/src/domains/storylines/services/storyDecisionRoleplayService.ts` (baseline lines 39, 54, 72).
- `backend/supabase/functions/admin-api/accountOperations.ts` (baseline lines 23, 120, 157, 180, 200, 268).
- `backend/supabase/functions/admin-api/attendanceOperations.ts` (baseline lines 49, 67, 82, 150, 160, 171 and more).
- `backend/supabase/functions/admin-api/bankingOperations.ts` (baseline lines 34, 46, 50, 53, 58, 117).
- `backend/supabase/functions/admin-api/businessBankingOperations.ts` (baseline lines 46, 62, 89, 99, 361).
- `backend/supabase/functions/admin-api/common.ts` (baseline lines 125, 129, 145, 163).
- `backend/supabase/functions/admin-api/gameProvisioningOperations.ts` (baseline lines 197, 210).
- `backend/supabase/functions/admin-api/gameRoutes.ts` (baseline lines 59, 70, 419, 439).
- `backend/supabase/functions/admin-api/idempotentLedgerOperations.ts` (baseline lines 53, 63, 146).
- `backend/supabase/functions/admin-api/logs.ts` (baseline lines 60, 81, 194, 211, 237).
- `backend/supabase/functions/admin-api/marketAssetOperations.ts` (baseline lines 48, 81, 130).
- `backend/supabase/functions/admin-api/marketplaceOperations.ts` (baseline lines 118, 119, 120, 121, 122, 123 and more).
- `backend/supabase/functions/admin-api/mutationAdapters.ts` (baseline lines 473, 490, 525, 574, 584).
- `backend/supabase/functions/admin-api/playerOperations.ts` (baseline lines 38, 56, 114, 128, 234, 296 and more).
- `backend/supabase/functions/admin-api/worldRuntimeOperations.ts` (baseline lines 178, 217, 244, 289, 330, 360 and more).

## Persistence-shaped adapter/infrastructure ownership (21)

- `backend/src/domains/auth/api/staffSignupCancelHttpHandler.ts` (baseline lines 52).
- `backend/src/domains/economy/api/initialBalanceSeedHttpHandler.ts` (baseline lines 123).
- `backend/src/security/authenticationThrottle.ts` (baseline lines 87).
- `backend/supabase/functions/_shared/econovariaAuth.ts` (baseline lines 106, 115, 128).
- `backend/supabase/functions/admin-api/adminSecurityGuard.ts` (baseline lines 90, 153).
- `backend/supabase/functions/admin-api/businessBankingLoanSupervision.ts` (baseline lines 21, 25, 29, 33, 37, 52).
- `backend/supabase/functions/admin-api/contractRewards.ts` (baseline lines 57, 115, 121).
- `backend/supabase/functions/admin-api/craftingOperations.ts` (baseline lines 145).
- `backend/supabase/functions/admin-api/readExtensions.ts` (baseline lines 60, 238, 241, 243, 248, 251 and more).
- `backend/supabase/functions/admin-api/readModels.ts` (baseline lines 107, 111, 114, 118, 120, 124 and more).
- `backend/supabase/functions/admin-api/routeData.ts` (baseline lines 82, 89, 92, 165, 175, 210 and more).
- `backend/supabase/functions/game-data-purger/index.ts` (baseline lines 48, 59, 65, 90, 119, 252 and more).
- `backend/supabase/functions/license-email-worker/index.ts` (baseline lines 84, 108, 192, 219, 426).
- `backend/supabase/functions/license-issuance-worker/index.ts` (baseline lines 49, 73, 97, 98, 148).
- `backend/supabase/functions/license-payment-webhook/index.ts` (baseline lines 188, 196).
- `backend/supabase/functions/password-reset-api/index.ts` (baseline lines 87, 154).
- `backend/supabase/functions/staff-mfa-api/index.ts` (baseline lines 82).
- `backend/supabase/functions/staff-mfa-api/systemRecovery.ts` (baseline lines 113, 137).
- `backend/supabase/functions/stock-market-orchestrator/index.ts` (baseline lines 43, 54, 60, 110).
- `backend/supabase/functions/stock-tick-archiver/index.ts` (baseline lines 63, 70, 143, 207, 224, 260).
- `backend/supabase/functions/stripe-checkout-session/index.ts` (baseline lines 304, 308).

## Retained noncanonical candidates; no deletion approval (2)

- `backend/src/domains/economy/api/playerLedgerHistoryHttpHandler.ts` (baseline lines 94, 126, 151).
- `backend/src/domains/store/api/playerStorePurchaseHttpHandler.ts` (baseline lines 98).

## Test-string false positives (2)

- `backend/src/domains/store/tests/playerStoreNegativeStateMatrix.test.ts` (baseline lines 46).
- `backend/src/security/attendanceRateLimitContract.test.ts` (baseline lines 23).

## Compatibility composition root (1)

- `backend/supabase/functions/classroom-api/index.ts` (baseline lines 861, 868).

## Interpretation and bounded follow-ups

- **Mixed group:** source-visible raw queries share HTTP handling, validation, orchestration or policy calculation. This establishes coupling, not production deployment of each route. Canonical Player runtime imports the login/bootstrap/Attendance handlers; bootstrap/web-session roots consume Staff auth handlers; Admin runtime modules consume Admin operation modules. Staff/Classroom-only routes retain compatibility significance. Preserve existing server-derived scope and economic RPCs.
- **Adapter group:** security throttle RPC wrapper, staff permission guard, client factories, projection loaders and worker transaction calls legitimately need persistence. Some combine translation/error mapping and could later gain an explicit infrastructure home, but moving them all would add indirection without proving better ownership. Initial-balance seed and signup cancel are thin atomic command adapters; Crafting validates requests then calls existing RPC authority. Contract rewards keeps one atomic reward RPC followed by response reads; do not split its mutation.
- **Retained group:** REF-026 explicitly records the old Store purchase handler has no repository caller and must remain unchanged pending separate retirement gates. Current source search likewise found Player ledger-history handler only in tests, not a runtime import; classify as unproven/reachability-review-needed, not confirmed dead. Its remaining reads are session scope; REF-021 already extracted ledger reads. Neither should be refactored to chase the lexical count.
- **Compatibility root:** Classroom creates clients and delegates to handlers. Those factories are appropriate composition-root work. Presence of the candidate does not authorize removing the deployed compatibility root; roadmap requires separate HTTP/SQL/job/external-consumer quiet-window evidence.
- **Tests:** Store negative-state test line 46 and Attendance rate-limit contract line 23 assert literal `.from(...)` strings. They perform no production persistence and must remain as protective tests, adapted only when the actual contract changes.
- **Archives:** zero of these 53 reside in archive/legacy directories. The broader REF-003 register does include historical Apps Script sources, which are outside this five-root candidate denominator. No deletion is approved for them, and archived placement is not evidence that external schedules are inactive.
- **Shadowed branches, not whole dead files:** Admin `attendancePlayerOperations.ts:18–23` invokes idempotentLedgerOperations before attendanceOperations; both recognize reward-adjustments. The older adjustment branch in attendanceOperations is shadowed through this dispatcher, but its notes/lock routes remain live. Any future retirement must check direct/exported/external callers and preserve those other responsibilities. Never delete the module based on one shadowed route.
- **Next larger seams:** isolate a single Admin `mutationAdapters.ts` difficulty-policy read/write responsibility, or one `playerOperations.ts` scoped read projection, after fresh ownership review. Avoid bundling all Admin queries. The banking and Business files need their current REF-025/U5 owner and dependency checks; do not disturb newly merged lending/settlement semantics. Auth/session files await the actual incident/ownership gate. REF-018 completion is bounded Staff persistence extraction, not removal of every Admin Attendance candidate.

This audit is static source evidence only. It neither certifies current deployed reachability nor proves absence of dynamic or external consumers. Implementation qualification is reported separately in scope.md.
