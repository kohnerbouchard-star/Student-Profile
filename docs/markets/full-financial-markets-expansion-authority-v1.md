# Full Financial Markets Expansion Authority V1

**Authority ID:** `FULL_FINANCIAL_MARKETS_EXPANSION`  
**Product-owner assignment:** Chat 3  
**Branch:** `agent/full-financial-markets-expansion-v1`  
**Starting main:** `6ced5aa36e60dfbd82620463f4f4bf6f56a349dd`  
**Status:** `AUTHORITY_REGISTRATION_PENDING_CONTROLLER`  
**Production deployment authorized:** No  
**Production data or schema modification authorized:** No

The assignment, branch and Chat 1/Chat 3 references below preserve the historical
registration proposal. The [bounded continuation](#bounded-continuation-registration--2026-10-02)
records current accountability for EXP-MKT-011–016; it does not release the broader hold.

## Scope

This branch is the proposed sole implementation authority for `EXP-MKT-001` through `EXP-MKT-016`:

- deterministic editorial ingestion of the inactive 3,200-instrument definition library;
- canonical issuer, exchange, listing, sector, industry, benchmark, commodity, index, fund, trust, bond, order, reservation, fill, trade, fee, holding, valuation, financial-statement, yield-curve, credit-event, corporate-action, calendar, and market-event-exposure contracts;
- corporate, sovereign, and agency bonds;
- preferred and bounded convertible equity;
- ETFs, funds, listed trusts, indexes, commodity and sector benchmarks;
- yield curves, coupons, maturity, accrued interest, default, and recovery;
- market and limit orders, atomic reservations, cancellation, expiry, fill-at-tick, and only after reservation proof, partial fills;
- additive Player, Admin, capability, API, rate-limit, resource-plan, and adapter publication;
- deterministic simulation, security, replay, staging, and rollback evidence.

## Existing authorities and non-overlap

This is a new production-expansion authority. It does not reopen or extend PR #163 and does not commit to the deleted merged Seed branch.

The branch consumes the merged Seed downstream contract at:

`docs/operations/contracts/beta-seed-downstream-consumer-contract-v1.json`

The bounded Seed pack remains immutable:

- pack: `econovaria.beta-seed-pack.v1`;
- version: `1.0.0-beta`;
- digest: `190d09e5d0be729388af1d8e304d27e630bef40fba1f055c4272377f39b3f5e8`;
- stable bounded members: 590;
- activation authorized: false;
- production authorized: false.

This branch must not modify the internal semantics owned by PRs #294, #299, #300, #249, #248, #261, or #295. It may consume only versioned public contracts from those systems.

Marketplace listing, seller settlement, refunds, disputes, and item reservation remain owned by PR #249. This authority owns only financial-instrument order, reservation, fill, trade, fee, and valuation semantics.

## Controller registration required before schema implementation

Chat 1 must record all of the following before this branch creates any market migration:

1. sole ownership of `EXP-MKT-001` through `EXP-MKT-016`;
2. this branch name;
3. the draft PR number;
4. an exclusive migration range reserved after all earlier serial feature migrations;
5. additive shared-file collision rules;
6. the eventual merge position relative to the current beta serial queue and shared convergence;
7. whether isolated-staging acceptance occurs under PR #295 or a later expansion release train.

No migration version is invented or reserved in this document.

## Shared-file rules proposed for controller approval

Until Chat 1 records a different rule, this branch will:

- avoid controller roadmap and coordination files;
- avoid editing shared capability, route, dispatcher, package, API-registration, endpoint-map, resource-plan, and Player-adapter files during the active beta serial sequence;
- implement domain contracts, services, tests, simulations, and branch-local audit documents first;
- reconcile shared files additively only after the predecessor sequence and shared convergence are merged;
- never restore stale capability, routing, rate-limit, privacy, or game-isolation behavior.

## Safety invariants

All economic writes must be server-authoritative, game-scoped, session-scoped, transactional, idempotent, replay-safe, cross-game isolated, rate-limited, and auditable.

Internal UUIDs must not appear in Player URLs, payloads, rendered UI, evidence, logs, screenshots, or browser storage.

The following remain disabled unless separately approved:

- short selling;
- derivatives;
- real-world market feeds;
- physical commodity delivery;
- unrestricted complex convertible pricing;
- automatic activation of the 3,200-instrument library.

## Initial audit gate

No schema or runtime implementation begins until the current market audit and target architecture are reviewed on this draft PR. The audit must distinguish reusable multi-asset abstractions from stock-specific tables and handlers.

## Completion boundary

Chat 1 remains the sole merge authority. This PR must remain draft until controller registration, collision-free migrations, complete exact-head verification, isolated-staging acceptance, zero unresolved review threads, and explicit merge-order authorization are recorded.

## Bounded continuation registration — 2026-10-02

**Implementation lead:** dot's Econovaria Markets continuation, which accepts accountability.
**Product-policy decisions and explicit release authorization:** the user.
**Scope, independent review, merge and reviewed release execution coordination:**
the parent coordinator of the user-authorized Econovaria continuation.
**Allocation:** accepted by the coordinator for registration review; this documentation
handoff awaits independent parent review and merge. **Delivery state:** all six
milestones below remain PLANNED; no production-consumer integration is claimed.

This is a newly accepted continuation allocation within FULL_FINANCIAL_MARKETS_EXPANSION,
not recovered historical definitions. At `b7f0e1374163f665124cc2ff02e9f4313ccb6679`,
repository and connected GitHub searches found the EXP-MKT-001–016 range but no
individual milestone definitions. Broader EXP-MKT-001–010 obligations remain
unreconciled and unchanged; this bounded allocation neither removes nor completes them.
Historical Chat 3 / PR #305 does not identify the current continuation lead. PR #305
merged on 2026-07-25 as `8e07ba06fec84adfc4154515a2b544f04387dd35`; its stale draft
prose does not grant persistence, shared registration or activation authority.

The [approved D3 decision](../roadmaps/refactor-execution-v1/BLOCKER-RESOLUTION-ADDENDUM.md#d3--approved-staged-markets-integration)
remains D3-A retention/qualification during stabilization and D3-B integration as the
long-term objective. This allocation implements ownership coordination under that
existing decision; it does not ask the user to choose D3 again.

### Accepted allocation and sequential delivery gates

M05–M18 below refer to the existing [design-only migration graph](full-financial-markets-migration-integration-design-v1.md#3-migration-dependency-graph),
not allocated migration versions or implemented schema. Each milestone requires its
predecessor and the applicable product/controller gates below. The continuation lead
owns the requirement, evidence and explicit remaining gaps for every row.

| Milestone | Sequential dependency | Undelivered requirement and existing design references | Exit evidence |
|---|---|---|---|
| EXP-MKT-011 | Reviewed U6a qualification and bounded caller/contract scope | Calculation contract and caller boundary; M05–M06, M12, M17 | Reviewed numerical/error contract and named production-consumer plan; public seam only with actual callers, parity and cycle/closure checks. A plan alone does not deliver consumer migration. |
| EXP-MKT-012 | EXP-MKT-011; user-approved product policy | Terms and authoritative offer; M05–M06, M10–M11; [inactive definitions](full-financial-markets-migration-integration-design-v1.md#41-global-inactive-reference-definitions) | Approved instrument/issuer/terms, versioned definitions and player-visible authoritative offer; no fabricated terms. |
| EXP-MKT-013 | EXP-MKT-012; funding and controller integration gates | Funded purchase/allocation and holdings; M14–M16; [order execution](full-financial-markets-migration-integration-design-v1.md#62-order-execution) | Atomic game-scoped funding/allocation/holding effects; concurrency, insufficient-funds, replay/conflict and rollback proof. |
| EXP-MKT-014 | EXP-MKT-013; payment/redemption/failure policy and affected recovery defect resolution | Scheduled payments, principal redemption where applicable, failure/default/recovery; M06, M13, M16; [scheduled processing](full-financial-markets-migration-integration-design-v1.md#63-valuation-and-scheduled-processing) | Funded authoritative lifecycle, exact payment/redemption idempotency, precision, failure and rollback evidence; no duplicated liability or unfunded payout. |
| EXP-MKT-015 | EXP-MKT-014; approved shared API/capability coordination | Actual public consumers, receipts/history and UI freshness; M17; [read projections](full-financial-markets-migration-integration-design-v1.md#64-read-projections), [Player resources](full-financial-markets-migration-integration-design-v1.md#13-player-resource-plan) | Registered real consumers, minimal named/type-only seam where needed, privacy/auth boundaries, authoritative history and refresh/remount evidence. |
| EXP-MKT-016 | EXP-MKT-015; complete predecessor evidence and separate explicit user release authorization | Complete lifecycle qualification and controlled release; M18; [RLS/grants](full-financial-markets-migration-integration-design-v1.md#7-rls-and-grants-design), [staging](full-financial-markets-migration-integration-design-v1.md#16-isolated-staging-plan), [acceptance](full-financial-markets-migration-integration-design-v1.md#19-acceptance-evidence-required-after-hold-release) | Full numerical/security/backend and authenticated lifecycle evidence at exact source/artifact identities, staging and rollback acceptance, then separately authorized release. A preview or source merge is insufficient. |

### Decisions and controls retained before implementation

- The user must decide the instrument, issuer, funding source and liability, terms,
  currency, rate/date conventions, schedule and failure/default/recovery policy before
  dependent implementation. A one-currency fixed-rate bond remains a candidate only.
- The parent must confirm the bounded implementation branch/PR and predecessor main,
  exclusive migration allocation, shared-file collision/merge rules, capability/API
  publication responsibility and release-train ownership before schema/shared work.
  No range is allocated and no shared registry is transferred by this document.
- Stocks/Markets holding and settlement responsibilities must be reconciled with
  canonical Banking/Economy atomic money writes; no second ledger or economic authority.
- Exact-source staging, authenticated lifecycle, rollback and release evidence remain
  mandatory before activation. Release requires separate explicit user authorization;
  the parent coordinates reviewed execution.
  Existing hold/approval controls are unchanged. No capture, dispatch or live action
  is authorized by this registration.

**Broader status remains AUTHORITY_REGISTRATION_PENDING_CONTROLLER.** Accepted bounded
accountability and the six-item allocation do not register the entire expansion or
release the original schema/shared-activation hold. They establish who must deliver
and coordinate the outstanding work; they do not settle unresolved product policy.

### Recovery issue and REF-040 closeout boundary

The continuation lead owns the separate potential `recoveredAt` defect recorded by
[U6a characterization](../operations/evidence/refactor-execution-v1/REF-040/u6a-qualification.md):
any non-null value, including malformed or future dates, suppresses recovery flows
without date validation/comparison while retaining recovery valuation. Characterization
does not bless that behavior. A separately reviewed product decision and bounded
resolution with regression evidence are mandatory before affected recovery consumers.

[REF-040](../roadmaps/refactor-execution-v1/tasks/REF-040.md) stays BLOCKED in this draft;
all task states, dependencies and completion counts are unchanged. After this accepted
handoff is merged and qualification evidence is complete, the parent may separately
review explicit interim closeout, naming retained calculations and still-undelivered
production integration. Review the handoff again at expansion kickoff and before
REF-050 certification. No milestone is satisfied merely by this registration.
