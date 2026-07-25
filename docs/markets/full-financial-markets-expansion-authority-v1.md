# Full Financial Markets Expansion Authority V1

**Authority ID:** `FULL_FINANCIAL_MARKETS_EXPANSION`  
**Product-owner assignment:** Chat 3  
**Branch:** `agent/full-financial-markets-expansion-v1`  
**Starting main:** `6ced5aa36e60dfbd82620463f4f4bf6f56a349dd`  
**Status:** `AUTHORITY_REGISTRATION_PENDING_CONTROLLER`  
**Production deployment authorized:** No  
**Production data or schema modification authorized:** No

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
