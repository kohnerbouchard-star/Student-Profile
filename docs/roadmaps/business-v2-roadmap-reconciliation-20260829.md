# Business V2 Roadmap Reconciliation — 2026-08-29

## Authority

This record reconciles the Business V2 roadmap and PR metadata to the exact repository state observed on 2026-08-29. It does not replace any checkpoint-specific implementation handoff or tested SHA.

## Current canonical state

- Program: `BETA-BUSINESS-V2-001`.
- Status: `IMPLEMENTED_NOT_MERGED`.
- Integration PR: #648, still draft, unmerged, and conflicting with `main`.
- Latest completed checkpoint: `BUSINESS-V2-10A4C3A`.
- Latest checkpoint branch / PR: `feat/multicurrency-stock-funding-v1` / #676.
- Exact C3A implementation and verification source: `f5fb9716ee4a8ab209cbc535d3583925c6d261c7`.
- Documentation head before this reconciliation: `e90d011eb9ca8062f17f82ab4448d909a87af4bc`.
- C3A permanent workflow run: `33245689981` — success.
- Parent C2 implementation: `9b95009dd7e73ed70987a0a99716d3ee32f2662d`.
- Parent C2 clean handoff: `ba033ac4a7759d068233513431891fc9de3ae95a`.

The machine-readable current checkpoint is `docs/roadmaps/business-v2-current-checkpoint-v1.json`.

## Completed dependency stack through C3A

The following checkpoints have exact implementation identities and exact-head evidence on their bounded stacked branches, but none is `VERIFIED_COMPLETE` because the Business/FX stack is not merged into `main` and no production release is authorized:

1. Business V2 Phases 0 through 6 — domain, recipes, stockroom/procurement, workforce/payroll, equipment, and timed manufacturing.
2. Phase 7A — Store seller-offer authority.
3. Phase 8A — physical Store-listing custody.
4. Phase 9A — withdrawal safety.
5. Phase 10A.1 through 10A.3 — settlement foundation, immutable offer quote, and atomic Business Store settlement.
6. Phase 10A.4A — frozen authenticated Player Store implementation candidate.
7. `BUSINESS-V2-10A4B1` / `BETA-FX-V1-001` — canonical ECO FX authority.
8. `BUSINESS-V2-10A4B2` — Banking account/hold/clearing authority and standard/instant FX.
9. `BUSINESS-V2-10A4C0` — one-to-three-account purchase funding core.
10. `BUSINESS-V2-10A4C1` — multi-currency Store funding.
11. `BUSINESS-V2-10A4C2` — multi-currency Marketplace funding.
12. `BUSINESS-V2-10A4C3A` — Stock listing-currency, market-liquidity identity, and legacy/current evidence schema.

## C3A certification

Exact implementation `f5fb9716ee4a8ab209cbc535d3583925c6d261c7` passed:

- `multicurrency-stock-funding-v1` run `33245689981`;
- Database Replay `33245690010`;
- Backend Typecheck `33245690000`;
- Banking FX clearing `33245689996`;
- Business Player Store Cutover V2 `33245689980`;
- Exchange Calendar Runtime `33245689984`;
- Required Game Market Timezone `33245689991`;
- Repository Quality `33245689987`;
- Supply Chain Security `33245690004`;
- Admin API Check `33245690031`;
- Staging Readiness Preflight `33245690011`.

The checkpoint-specific handoff remains `docs/roadmaps/multicurrency-stock-funding-c3a-handoff-v1.md` and controls detailed C3A semantics.

## Next authorized work

`BUSINESS-V2-10A4C3B` is the next implementation checkpoint.

C3B is limited to one immutable immediate-buy Stock quote that binds the exact current Stock price/tick to one C0 purchase-funding quote. C3B must not move money or shares, consume either quote, create an order/trade, alter Player API/UI, activate sell settlement, merge, deploy, change scheduler/secrets, run staging/production SQL, or mutate a live database.

After C3B, the dependency order remains C3C atomic buy settlement, C3D atomic sell settlement, C3E Player API/UI cutover, C3F final Stock certification, C4 Business multi-currency treasury/procurement, and 10A.4D final Store/FX convergence. Phases 11–14 remain closed until 10A.4D is exactly certified and handed off.

## Release and integration blockers

- PR #648 remains an index/integration record rather than a merge-ready integration tree; its head is stale relative to the later stack and it conflicts with `main`.
- `BETA-LIVE-MIGRATION-PARITY-001` remains a global release blocker and requires a separately owned forward-only reconciliation before exact-source release evidence can become green.
- No merge, production deployment, scheduler installation/change, secret mutation, staging/production SQL, or live database mutation is authorized by this reconciliation.

## Reporting rule

From this point forward, the machine-readable checkpoint manifest plus checkpoint-specific handoff and exact-head workflow evidence control the reported current Business V2 state. PR bodies and older roadmap prose are indexes and must be reconciled when they lag those records.
