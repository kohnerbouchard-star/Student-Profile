# Business V2 recovery note — 2026-08-19

## Why this file exists

A previous development turn reported Phase 1–5 progress that was not durably attached to PR #648. The actual PR branch still ended at `9d139391723c1c0f1f7dbd8c5b1a924ee81ae761`, while the main execution log still ended at Phase 0. Several reported later commit SHAs were missing or dangling and therefore could not be treated as completed work.

## Recovery action

The integration branch `refactor/business-ux-mechanics-v1` was force-restored to `28ae44a1aefead1a9c7efc3fc174075115b81255`, the last known-good extraction commit before the broken classroom-api edits.

The discarded commits introduced concrete breakage, including malformed import paths and a syntax error in `backend/supabase/functions/classroom-api/index.ts`. The broken `9d139391...` head had widespread red CI even though Database Replay itself remained green.

## Evidence for the restored checkpoint

At `28ae44a1aefead1a9c7efc3fc174075115b81255`, the following important checks were green:

- Database Replay
- Business Economy V2
- Business Banking Runtime
- Backend Typecheck
- Beta Security Contract
- Player Response Privacy
- Crafting Item Runtime
- Crafting Activation Connected V2
- World Runtime
- Runtime Interaction Wiring
- Staging Readiness Preflight
- Admin API Check
- Admin Browser E2E
- Release Integrity

Repository Quality was still red because the deterministic architecture inventory had not yet been committed for the extracted Business domain. Seed Executable Beta Pack also had an unrelated red result and must not be used as evidence of Business completion.

## Accurate phase status after recovery

- Phase 0: COMPLETE and durably logged.
- Phase 1: PARTIALLY IMPLEMENTED. `backend/src/domains/business/` owns Business route/contracts/handler/repository and `player-api` dispatches Business through the extracted boundary. The classroom-api compatibility path still routes Business through `business-banking`, so the façade extraction is not yet complete.
- Phase 2: NOT DURABLY IMPLEMENTED.
- Phase 3: NOT DURABLY IMPLEMENTED.
- Phase 4: NOT DURABLY IMPLEMENTED.
- Phase 5: NOT DURABLY IMPLEMENTED.

## Locked product decisions retained

The recovery does not change the approved Business V2 product decisions:

- exact existing catalog items only; no free-form physical product creator and no variants;
- exact existing canonical recipes define material requirements;
- material cost derives from actual acquired stockroom cost basis;
- employees are paid while employed regardless of production utilization;
- production later consumes finite labor/equipment/time capacity without double-paying payroll;
- completed production enters Business Finished Goods;
- Business products sell through multi-seller Store offers under one catalog item;
- Store-listed stock physically leaves Finished Goods;
- listing cancellation/reduction blocks purchases immediately and uses a mandatory five-minute cooling-off period before unsold stock returns;
- Marketplace remains secondary Player resale;
- IPO/Financial Market integration follows only after the operating loop is stable.

## Next authorized work

1. Finish Phase 1 safely without editing the large classroom-api composition unnecessarily: keep the existing classroom route as a compatibility façade but forward Business handling into `domains/business`.
2. Commit the deterministic architecture inventory and restore Repository Quality.
3. Update the primary execution log with Phase 1 completion evidence.
4. Start Phase 2 canonical recipe-access authority only after Phase 1 exact-head gates are green.
