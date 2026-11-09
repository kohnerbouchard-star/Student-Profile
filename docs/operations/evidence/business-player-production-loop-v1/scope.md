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
Business ownership. Preserve canonical timed manufacturing policy, Store buyer settlement, seller
Checking credit, receipt accounting and withdrawal controls. Runtime-only repairs
to manufacturing are described below; buyer settlement itself is unchanged.

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
  The initial publication did not execute this SQL locally; the supplemental run below
  now exercises the new loop and retained settlement behavior.
- Independent review caught and corrected the ownership race, stale conflict mappings
  and retired equipment candidates before publication.

The initial Mac validation had no running Docker daemon. A later isolated local
database now provides supplemental SQL evidence below. Connected browser settlement
and exact-head hosted checks remain required. No live/staging/production mutation,
deployment or completion claim.

## Rollout and rollback

Apply both forward migrations, in order, before the Edge/backend update. The frontend requires
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
At exact head `1dba6b202d7f96f4d26d6b645e5d64e4f790ccc4`, hosted Database Replay
([run 42582641219](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42582641219))
passed zero-to-head twice. Store Sales Convergence database, worker and browser jobs
also passed; its source job found one newly introduced allowlist formatting issue,
now corrected. Newer supplemental repairs still need their own exact-head CI.

## Supplemental disposable PostgreSQL evidence

After reconnection, all 459 migrations replayed on a newly created local project
`business-loop-pr926-isolated`. Existing local projects were left untouched. The
retained harness copy differed only in its fixed localhost port, 55432 instead of
54322; no repository host restriction or security assertion was weakened.

- New loop SQL passes canonical equipment/catalog options, install/create/stock/
  publish and exact replays, scope/actor/game denial and stock/cost conservation.
- Full retained serial settlement passes 58 logged assertions, including those new
  loop checks, balanced buyer/seller money, inventory/accounting/receipt evidence,
  rollback injection, self-purchase rejection and two-game isolation.
- A second clean reset passes retained real PostgreSQL concurrency/ordering/isolation.
- Fixture setup was corrected to increment the canonical offer version, keep paused
  game status consistent, and seed its own rolled-back physical equipment definition.
- Four new button-evidence entries point to the existing desktop/mobile browser
  tests as `local_browser`, with explicit synthetic-response limits. The ledger
  validates all 63 Player actions and 38 Admin mutations; historical entries remain
  unchanged.

## Canonical manufacturing runtime correction

`20261109121000_repair_business_manufacturing_runtime_v2.sql` fixes defects reproduced
by real PostgreSQL execution: labor schema field names, deferred labor identity,
claim/completion SQL ambiguities, recipe output quantity, transition evidence and
unsupported inventory-event labels. It recreates only the affected canonical
routines and preserves funding, scheduling, lease, replay and no-double-payroll rules.

Manufacturing now refreshes the existing Business compatibility projection from
locked canonical holdings after its single inventory posting. The refresh verifies
that quantity, reservations, currency and held unit cost remain unchanged by the
compatibility trigger. Widening `business_inventory.unit_cost` from numeric(14,2) to
numeric(16,4) keeps the original 12 integer digits and canonical held-cost precision.
The two column-dependent triggers are recreated identically inside the transaction.
Completion receipt precision remains six decimals; no new economic rounding rule,
inventory ledger or cash posting is introduced.

The real rolled-back fixture in `scripts/business-player-manufacturing-database.mjs`
uses the public Player start wrapper, stages three material units, preserves two
unrelated reserved units, reserves five labor minutes, waits for actual due time,
claims and completes once, then drafts/stocks/publishes and sells the actual output.
It verifies material cost 6 plus labor 5, three output units at held cost 3.6667 and
receipt cost 3.666667, one ECO 12 buyer debit/seller Checking credit, committed inventory
and receipt evidence, remaining stock 2, and unchanged balances/events/postings/receipts
on replay. Wrong owner, insufficient labor, changed idempotency and wrong lease fail.

After this correction all 460 migrations replayed cleanly twice; the combined serial
harness passed 60 logged assertions including manufacturing start races, and retained
PostgreSQL settlement races passed. Full root
`npm test`, backend smoke/typecheck, Player verify and 16 retained/new desktop/mobile
browser cases passed. All 24 suffix identity/rehearsal tests passed under Linux
Node 22.23.1 with Bash 5; the macOS Bash 3 run could not execute its mapfile-based shell
fixture, so the complete suite was rerun in an ephemeral Linux container.

The final review identified a shared-to-exclusive Business lock upgrade in start.
A dedicated private start guard now acquires game/player shared locks and the final
Business exclusive lock before resolving authority in a fresh statement. It does not
change the existing install/listing guard. A two-session regression gates both starts
at the Business row and asserts the requested exclusive lock before release: same-key
requests commit one job plus replay; distinct intents commit two jobs, with exactly
three material postings, six events, three labor holds and no additional cash writes.
The new private guard remains unavailable to service-role direct callers.

The retained mobile fixture was detached from the real shell root class and therefore
missed its 44px control rule. Adding that existing class fixes the fixture, without CSS
changes or weakening touch-size assertions. New button-evidence entries remain
explicitly synthetic local browser proof.

Full schema lint still reports 12 inherited errors outside the corrected routines
(funding temporary-table analysis, campaign/arrival/message ambiguities, legacy
production/workforce/recipe setup, ownership transfer and initial balance setup).
None is reported in the new/changed Player loop or manufacturing routines. Lint is
not certified clean. This is isolated SQL evidence, not connected-browser or live
service completion, and no production activity is authorized.


## Main integration after #928

Published implementation `727f8e9dacb44d9d393d59180a8a3de68f5f88a8` completed hosted
qualification with 56 passing workflows, one expected skip and the shared Admin
redirect-diagnostic failure. Database Replay and all five Atomic Settlement jobs
passed, including real manufacturing-to-sale, idempotent revenue, start/settlement
races, backend/Edge and Chromium qualification. The runner port collision in REF-009
was retried once and passed. These results apply to that implementation head.

Main `0d314bbe53832afcdc94b9dab8d3e09515f2762f` merged #928's Admin readiness and
interruption diagnostics. This branch integrates that exact main commit without
changing any Teacher implementation file or Business runtime/migration. The sole
merge conflict was additive roadmap intake; both entries are preserved. The #926
authority retains its exact original 118 required and 87 critical checks, file locks
and production/secret denials. #928's four added Shell/Scroll names belong to its
PR-specific authority, not the shared legacy authority or verifier. Their workflows
are path-filtered to Admin files that this PR does not change relative to main.
Their qualification remains attached to merged #928; no trigger is altered and no
pre-existing Business gate is removed. The proposed union was not published. Renewed exact-head CI is required before a
merge decision; no production action is authorized.

Integration validation on the isolated cloud checkout: root `npm test`, full Player
verify, backend `tsc`, and 44 migration/authority/redirect-diagnostic regressions
pass. Edge checking and backend smoke stop while importing the unchanged pinned
Supabase module because esm.sh refuses the connection. The pinned Chromium archive
is truncated; the installed system Chromium also fails before any browser assertion
because its process socket is unavailable. Docker is not installed in this checkout.
These are local execution limits, not passing browser/database/Edge evidence. The
renewed hosted checks must provide those exact-head results without substitutions
or relaxed assertions.
