# REF-040 U6a — initial interim-outcome amendment

## Identity and bounded authority

- Audited/fetched main: `5e392fd3adcf890b989ecf2af70311504b1874ff`, 2026-10-02.
- Branch: `refactor/ref-040-u6a-interim-outcome`; draft only, parent reviews/merges.
- REF-040 remains BLOCKED; dependency REF-038 remains VERIFIED_COMPLETE.
  ARCH-206/ARCH-402 mappings and all 50 primary IDs/dependencies are unchanged.
- Authority: [approved U6a addendum](../../../../roadmaps/refactor-execution-v1/BLOCKER-RESOLUTION-ADDENDUM.md),
  [execution contract](../../../../roadmaps/refactor-execution-v1/EXECUTION-CONTRACT.md),
  [validation](../../../../roadmaps/refactor-execution-v1/VALIDATION.md), and the
  delegated initial documentation scope. No current expansion owner is assigned here.
- Exact editable paths: `docs/roadmaps/refactor-execution-v1/tasks/REF-040.md`,
  this evidence file, and only REF-040's evidence pointer in
  `docs/roadmaps/refactor-execution-v1/backlog.json`.
- Budget: three meaningful files, fewer than 400 semantic changed lines; no source
  symbols changed. Expected change is explicit outcome/closeout reconciliation.
- Protected: historical [preflight](preflight.md), all application/test/formula
  code, public indexes, migrations, packages, workflows, registration/controller
  documents, global ledgers, REF-042/Inventory/realtime paths, and CampusPay.
  No credential, capture, dispatch, deployment or runtime action is part of this work.

## Historical outcome versus approved stabilization outcome

The original task required a minimal public calculation seam used by actual
production consumers with identical numeric/error outputs. That outcome remains
undelivered. D3-B is the long-term product goal; D3-A approves retained, isolated
calculations and owning tests during stabilization. An unused barrel, deletion
or test retention alone cannot fulfill either original consumer migration or
fresh U6a qualification. This amendment neither completes U6a nor changes status.

The original preflight at `b85a337bd74683484aa6395483cecaecd55072c8` is preserved
byte-for-byte. Its 136 Markets / 31 Stock-engine / 73 market-asset passes are
historical, not current-head results. Full typecheck/smoke were NOT_RUN there.
A read-only `git diff` from that SHA to audited main found no Markets-domain
source changes; unchanged bytes do not substitute for fresh required evidence.

## Fresh source and ownership findings

Read-only `git ls-files` counted 4,106 tracked paths, including 2,928 paths with
extensions ts/js/mjs/cjs/html/json/yaml/yml/sql. Repository-wide
`git grep -n -E 'bondMath|callableBondPolicy|fixedIncomeAnalytics' -- ':!docs'`
returned exactly five importing files. Inspection included imports, exported
helper references, runtime/HTML/Edge roots, scheduled and workflow registrations.
This is static source evidence, not a deployed-runtime reachability assertion.

- Three direct bondMath importers: its test, `callableBondPolicy.ts` and
  `fixedIncomeAnalytics.ts`; the latter two import day-count and coupon schedule
  helpers and each has only its own test as an importer.
- Zero external production consumers or Markets public index files were found.
  Before/after counts are identical; no consumer was migrated.
- Runtime dependency closure remains `bondMath.ts` plus `decimalMath.ts`;
  `financialMarketContracts.ts` is type-only. Inspection found no IO, external
  imports, mutable module state, hidden current-clock read or cycle in this closure.
  Date construction uses explicit inputs. No import-time initialization was added.
- The existing Markets workflow runs directory tests and a separate reference
  simulation CLI; inspection found no path from that CLI to this bond family.
- Seven pure functions and five interfaces remain intact. Six-decimal/BigInt
  amount arithmetic, half-away-from-zero multiplication/division, existing UTC
  date validation, rate validation, continuous discounting, default/recovery,
  early-zero behavior and error ordering are retained without qualification claims.
- `git ls-remote --heads origin` found no live full-financial-expansion branch or
  REF-040 owner branch at kickoff. Legacy Stock branches are separate owners.
- Connected GitHub search returned nine open PRs: #829, #736, #735, #731, #730,
  #690, #668, #624, #620. None owns this Markets continuation; #829 owns REF-042.
  CLI GraphQL/REST reads returned Forbidden; connected GitHub reads succeeded.
- Fresh metadata for [PR #305](https://github.com/kohnerbouchard-star/Student-Profile/pull/305)
  confirms merge at `2026-07-25T02:19:59Z`, commit
  `8e07ba06fec84adfc4154515a2b544f04387dd35`. Its body and the pure-domain checkpoint
  still say draft/unmerged; those statements are historical and stale.

## Accountable expansion handoff remains a closeout gate

The [existing expansion authority](../../../../markets/full-financial-markets-expansion-authority-v1.md)
records FULL_FINANCIAL_MARKETS_EXPANSION and EXP-MKT-001 through EXP-MKT-016, with
`AUTHORITY_REGISTRATION_PENDING_CONTROLLER`. Historical Chat 3 / branch
`agent/full-financial-markets-expansion-v1` / PR #305 is not a current accepted
continuation handoff. A docs search finds the milestone range, but no sufficiently
concrete individual milestone mapping for these undelivered requirements.
Do not invent a new program, accountable owner or individual milestone IDs.

| Undelivered requirement | Existing destination and unresolved mapping | Required exit evidence |
|---|---|---|
| Actual public calculation consumers, minimal named/type-only seam and import migration | FULL_FINANCIAL_MARKETS_EXPANSION; exact EXP-MKT milestone and accountable continuation owner unresolved | Implemented consumer inventory; output/error parity, cycle and dependency-closure qualification |
| One complete instrument lifecycle: terms/offer, purchase/allocation, holding, scheduled payments, principal redemption where applicable, receipts/history | Same existing program; individual lifecycle milestones and accountable owner unresolved | Approved instrument policy; funded atomic game-scoped lifecycle; concurrency/replay/rollback, precision, failure, privacy and wrong-role/game evidence; UI freshness |
| Persistence, shared capability/API publication and authorized release | Same existing program; exact integration/release milestones and owners unresolved | Controller registration, exclusive migration range, shared-file collision rules, merge position, capability/API ownership and release-train decisions; exact-source staging, authenticated lifecycle and release approval |

The controller/expansion owner must accept each mapping, prerequisites and
lifecycle exit criteria at kickoff and before REF-050 certification. Until that
handoff and fresh required qualification are accepted and merged, REF-040 stays
BLOCKED. REF-038's completed dependency is not new expansion/release authority.
No downstream certification gate or official completion count (35) changes.

U6b must reconcile existing Stocks/Markets holding and settlement ownership;
canonical Banking/Economy retains atomic money writes without a second ledger,
duplicated liability or unfunded payouts. Instrument, issuer, funding/liability,
terms, currency, rate/date conventions and default/recovery remain owner
choices. A one-currency fixed-rate bond is only a candidate, not approved policy.
The [pure-domain checkpoint](../../../../markets/full-financial-markets-pure-domain-completion-v1.md)
continues to separate retained calculations from integration and activation.

## Qualification resolution and limits

At audited main, `.github/workflows/full-financial-markets-expansion.yml`
registers `deno test --no-lock backend/src/domains/markets` and the Stock engine
test. The existing frozen-lock preflight invocation resolves to present paths:

```sh
deno test --config backend/supabase/functions/deno.json --lock=backend/supabase/functions/deno.lock --frozen backend/src/domains/markets
deno test --config backend/supabase/functions/deno.json --lock=backend/supabase/functions/deno.lock --frozen backend/src/domains/stocks/calculations/stockMarketEngine.test.ts
npm --prefix backend run test:player-market-assets
npm --prefix backend run test:stock-market-calendar
```

The backend manifests retain the existing neutral-config, frozen-lock market
asset/calendar commands and full `typecheck:all`/`smoke` scripts. The workflow's
`--no-lock` spelling is recorded, not recommended as a substitute for the
execution contract's frozen qualification. No script/workflow was changed.
Deno is absent in this disposable workspace: all four commands above, full
backend typecheck/smoke and fresh numerical qualification are NOT_RUN here.
No new source tests were added. Existing tests do not establish exhaustive
precision/date/invalid/nonfinite/error coverage; U6a qualification must explicitly
record coverage and remaining gaps, preserving numerical/security acceptance.
Any discovered semantic defect needs a separate bounded correction.

Documentation/link/JSON/dependency/scope and applicable secret/release-hold
policy checks are recorded with publication evidence in the draft PR. These
checks earn no backend/runtime qualification credit. Architecture inventory
regeneration and full application suites are NOT_RUN for this documentation
amendment; their applicable U6a gates remain open. Connected staging, database
acceptance and production certification are NOT_RUN. U1's disposable production
rehearsal is not release certification; staging access remains blocked per the
existing U1 record. All nine literal-false hosted guards and the removed automatic
production chain remain unchanged. No capture or dispatch was attempted.

## Local documentation validation

Checks used Node 22.23.1 / npm 10.9.8 installed outside the repository in `/tmp`;
no repository dependencies or lockfiles were edited. Results against audited
main plus this three-file documentation delta:

- `python3 /tmp/ref040-doc-check.py`: exit 0; parsed manifest, compared all records
  with base (only REF-040 evidence pointer differs), verified 50 stable IDs,
  35 unchanged completions, task paths, acyclic dependency graph, REF-038 state,
  REF-040 BLOCKED/dependency, relative Markdown links, exact three-path scope,
  and byte-identical historical preflight. Script is disposable validation tooling.
- `npm run security:secrets`: exit 0, no high-confidence credentials.
- `node --test scripts/operations/live-migration-reconciliation/phase15-production-workflow.test.mjs`:
  exit 0, four passed, zero failed; nine hosted guards and removed automatic
  chain checked without hosted actions.
- `node --test scripts/operations/live-migration-reconciliation/readonly-rehearsal.test.mjs`:
  exit 0, one static contract passed, one disposable PostgreSQL test skipped
  because `REF032_PG_BIN` is unset. No rehearsal or capture was run.
- `git diff --check`: exit 0. Exact published head, draft PR and CI outcomes are
  reported in publication evidence; no anticipated CI result is claimed here.

## Next step and rollback

Parent reviews the exact three-file draft and its checks; parent alone owns merge.
Then perform bounded U6a qualification and obtain the accountable expansion
handoff above. A later closeout must name the accepted interim outcome and still
outstanding production integration, never claim retention delivered it. Rollback
is a normal revert of this documentation amendment only, retaining historical
preflight, calculation source, concurrent work and release holds.
