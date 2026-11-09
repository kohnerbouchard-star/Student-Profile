# REF025a / U5 loan characterization

Status: IMPLEMENTED_NOT_MERGED; REF025 BLOCKED; REF027 depends on025+026. Base: `b7f0e1374163f665124cc2ff02e9f4313ccb6679`; parent reviews/merges. Draft
PR834: `refactor/ref-025a-characterization`; hard 399-line ceiling. Parent approved four characterization paths, generated inventory and PR834 authority:
- `backend/src/domains/business-banking/api/playerBusinessBankingRoutePaths.test.ts`
- `backend/supabase/functions/admin-api/businessBankingOperations.test.ts`
- `scripts/business-banking-runtime-contract.mjs`
- `docs/operations/evidence/refactor-execution-v1/REF-025/u5-characterization.md`
- `docs/architecture/inventories/econovaria-architecture-inventory-v2.json`
- `docs/operations/contracts/player-cross-cutting/pr-834.json`

No runtime, SQL, policy or workflow changes; verifier/test entries are locks only. Protect #668 context/global ledger/backend manifest, #736 Player
auth/runtime, REF042 Player API/app/Inventory/realtime, REF040 Markets, #624 UI and nine U1 guards. No live access, credentials/settings, captures,
dispatch, deployment or restoration. Treasury's accepted public-contract/single-RPC extraction remains intact. Rollback: revert the six scoped files. No
production ports or queries moved.

## Characterization and corrected source lineage

HTTP envelope/body/method denial precedes configuration, then scope/repository. Application rounds money, forwards server scope once and returns
private/no-store. Admin recovery aliases use server scope/one RPC; review decision denial precedes key validation. Synthetic clients do not authenticate
real sessions or execute SQL. Loans reads use economic-context RPC plus five queries for zero/one/two businesses. Products filter currency; loans filter
game/player; business keys filter game/owner. Two currencies project 30.8 without currency fields: a representation limitation. Defaults, ordering, limits
and schedules stay characterized; no live mixed-loan claim.

Correction to initial preflight: Aug12 repayment definitions are historical inputs. `20260826100000_business_bank_identity_runtime_v1.sql` rewrites both
account triggers and repay_player_loan_v1. Business balance lookups use business_id (resolved business, new.business_id and v_loan.business_id
respectively); personal lookups use player_id. The script reconstructs the three exact one-occurrence source replacements, asserts replacement
execution/count guards and tests their resulting predicates. No SQL runs. Game/account/currency locks remain; borrower and business-owner authorization
remain player-scoped. Stable business money identity already exists, not proposed new work. Later migration definitions/rewrite targets were inspected at
the recorded base: Aug31 Treasury/procurement/store rewrites target other routines; convergence's generic purge rewrite targets DELETE triggers, while
these triggers are INSERT/UPDATE only. September source rewrites target store/formation, not these three loan routines.

Application remains Aug6; review/servicing July21 core; recovery July21 signature fix. Source checks cover lock/denial order, interest-first payment and
installment advance. Known limits: payable-state denial precedes payment replay; approval replays terminal application state; recovery uses audit key
without payload hash. No stronger claim. Callers remain Player/retained Classroom, Loans UI, Admin review/recovery/supervision and autonomous servicing. No
retirement, debt transfer or personal guarantee inferred.

## Validation and exact-head limits

Pinned Node22.23.1/npm10.9.8/Deno2.9.3; frozen locks; inherited secrets stripped. Baseline owning Deno12/12; candidate19/19 (five Player, two Admin
additions). PASS: corrected source contract; Banking38/38; FX16/16; ledger25/25; Treasury9/9; economic simulations8/8; Player
banking-read/FX/business-workspace; guards80; legacy audits; secret scan; Phase15 hosted-guard contract4/4; diff whitespace. Parent-approved test-title
correction removes only a lexical false positive: compatibility209 unchanged; generated oversized test inventory99->100, ceiling unchanged. Root suite now
passes after locked dependency install with a writable temporary npm cache. Local full Edge/smoke remains blocked by frozen esm.sh HTTP403; no local DB
run.

Published head `28509d6e85116c040724436f0beb798a7bd7f3fc`: all42 workflows terminal, 20 success/19 failure/3 skipped. This is not a green qualification or
the corrected head. Backend Typecheck36979851585 passes full backend/Edge typecheck and full smoke. Business Banking Runtime36979851499,
AdminV2Loans36979851461, AdminAPI36979851672 pass. BankingFX36979851606: disposable database reset/acceptance/lint and Chromium pass; source fails missing
PR834-bound authority. Treasury36979851639 database replay, isolation/rollback/concurrency and browser pass; source has same authority failure. Other
source jobs fail the old lexical marker or authority; neither is waived. Multiplayer36979851608 fails messages HTTP503; cause/baseline not established.
StoreFX36979851628 connected startup fails occupied Docker port54322. Vercel fails build-rate limit; no retry/settings change. Preview remains missing.
Head06e3785b: root/authority/ratchets and enforced full backend typecheck/smoke pass; Banking FX/Treasury source authority passes. StoreFX connected
passes; Vercel success without retry. Multiplayer now fails residency POST-response timeout60s, not messages503; no retry proposed. Convergence source
found new Admin-test formatting; corrected with unchanged assertions/inventory ceilings. Fresh-head CI/independent review required. Banking FX lint gate
passes but reports17 errors, including retained review_player_loan_application_v1 ambiguous status (also on28509d6e); not clean SQL qualification. Database
CI evidence is suite-specific, not proof of every loan transaction/race.

## Owner decisions, not implementation approval

Preserve existing obligations, accounts, terms, schedules and repayment rights. New business liability vs operator permission follows approved D2-B, using
existing stable game/business/currency identity. Mandate change alone must not transfer debt. Proposed income: positive game/business/currency ledger
inflows across operators over 84 days; exclude banking/loans and capitalization_in/ownership_cash_transfer_in;
capital_contribution_in/ipo_primary_subscription are additional proposed exclusions. Exclude personal Checking/Savings and FX conversion. Current Aug6
affordability uses player_id and admits Checking/business account. Keep income/12*frequency rounded2, ratio100 if income<=0 otherwise
min(100,round(payment/income,6)); product limit controls. Working Capital seed0.45 is not a new hardcoded cap. Owner must approve changed inputs.
Applicant-score proposal retains actor credit vs actual product minimum (seed600; table default550), as eligibility only, not guarantee/business score.
Needs approval. Current July21 servicing recalculates loan.player_id credit, including business defaults: -120/default, -35/delinquent posted-payment join
row, score clamped300..850. Business-only default attribution would change policy and needs approval. Preserve accrual principal*annual_rate*days/365
rounded2 and product grace/default terms pending review. Recovery/guarantor/debt-transfer/FX policy is not invented; other U5 children remain unapproved.
Parent controls policy, scope, merge and REF025 unblock.
