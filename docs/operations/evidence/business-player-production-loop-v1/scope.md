# Business Player production loop

Roadmap item: BUSINESS-PLAYER-LOOP-001. Status: IMPLEMENTED_NOT_MERGED.

Base: main `08134650d1e0c8cfebb811a5d97331196ebe08e3`.
Branch: `feat/business-player-production-loop-v1`.
Draft PR: https://github.com/kohnerbouchard-star/Student-Profile/pull/926.
Verification authority: `docs/operations/contracts/player-cross-cutting/pr-926.json`.

## Scope and ownership

The owner requested a separate branch and PR completing installation, manufacturing,
listing stock and sales revenue. Existing Business Phase 12–14 implementation is
already merged. The live open-PR audit found no competing owner of these commands.
Loans, Crafting, Banking, the Player CSS owner and release-repair branches stay separate.

Add authenticated Player commands for installing Business-owned equipment, creating
an offer draft, stocking its listing from Finished Goods and explicitly publishing
it. Read installation candidates and eligible Store catalog identities from canonical
Business ownership. Keep existing timed manufacturing, Store buyer settlement,
seller Checking credit, receipt accounting and withdrawal controls unchanged.

The new forward migration adds a service-only options read and a guarded idempotent
publication wrapper plus owned wrappers around canonical install/create/stock commands.
All mutations lock the active game, player and requested Business before resolving
controller authority in a fresh statement; canonical ownership writers take the
conflicting Business lock. This prevents authorization races with revocation.
No new table, policy, browser grant, balance, inventory ledger, worker, schedule or
economic policy is introduced. Canonical commands retain their idempotency and ledgers. Each step is explicit; partial chained writes are
not presented as one transaction. Public requests never accept a player/game/Business
owner ID or direct status/currency/custody assignment.

## Validation

- Full Player verify passed after UI/API wiring.
- Four Chromium cases passed on desktop/mobile using the real terminal, command
  normalization, resource coordinator and DOM with a synthetic transport. Covers
  install → manufacture → draft → stock → publish, displayed committed receipt
  revenue/COGS/margin, repeated submission and navigation during an in-flight write.
  These fixtures are not PostgreSQL settlement evidence.
- Registered Node coverage proves exact catalog matching, unavailable-read and
  capability gating, payload allowlists, invalidation, repeated-click coalescing and
  idempotency-key reuse after an uncertain response for all four new commands.
- Root `npm test` passed. Backend `typecheck:all` passed, including all 28 Edge roots.
- Migration identity audit and high-confidence secret scan passed. Architecture debt
  ceilings, retained regression arguments and release gates are unchanged.
- Full backend `smoke` passed on the final guard changes. Focused Business HTTP and
  command regressions passed: 28 tests, including all four trusted actor bindings and
  actionable conflict/error mappings.
- Disposable SQL acceptance is registered in the existing atomic-settlement job. It
  covers owned install/create/stock/publish, replay/conflict, scoped options, actor/game
  denial, Finished Goods/listing conservation and service-only function permissions.
  This SQL suite has not been executed locally.
- Independent review caught and corrected the ownership race, stale conflict mappings
  and retired equipment candidates before publication.

Docker is not running on this Mac. Disposable database replay, new SQL runtime
assertions, connected buyer/seller settlement and exact-head hosted checks remain
required. No live/staging/production mutation, deployment or completion claim.

## Rollout and rollback

Apply the forward migration before the Edge/backend update. The frontend requires
explicit action advertisement; an older backend cannot enable the new controls.
Roll back application commits to hide commands while retaining the additive functions.
Do not delete committed seller sales or reverse balances manually. Production rollout
requires a separate owner decision and the repository's existing release gates.

Next: qualify all exact-head checks, review the draft, and separately authorize merge
and deployment only after required database/connected evidence is available.

## Hosted CI follow-up

At head `3b51fa1e4f9eff070560081a97f2430277d14d08`, Backend Typecheck
failed before code execution because the pinned Deno download returned HTTP 504;
only that failed job was retried. Database Replay correctly rejected the unregistered
new post-bundle migration before any database was started. The follow-up registers
its exact raw/source hashes in `build-phase15-rehearsal-plan.mjs`, preserving all
historical suffixes, immutable certificates and rejection assertions.

The Mac went offline after Docker Desktop started, before any test database reset.
Existing local data was not touched. Registry correction tests run in an isolated
cloud checkout. All 23 suffix/rehearsal tests pass under pinned Node 22.23.1,
11 retained audit/production-workflow tests pass, 435 frozen migration identities
remain unchanged, and the authority accepts 37 changed paths under 39 locked paths.
Hosted database/settlement qualification remains pending.
