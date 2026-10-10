# Econovaria: application audit and codebase recovery roadmap

Audit date: 10 October 2026. Repository documentation snapshot.

## Executive assessment

Econovaria has substantial implemented systems and meaningful automated safeguards. It does not need a wholesale rewrite. Its remaining difficulty is concentrated in large orchestration modules, overlapping legacy and replacement paths, incomplete route-level data contracts, and a release process that has not brought current main to the canonical website.

The recommended approach is to establish a trustworthy release baseline, repair concrete failures, and untangle one complete player journey at a time. A visual refresh should reuse those same workflow boundaries rather than introduce a second implementation.

## Evidence boundary

This is a read-only architecture and readiness audit, combining current GitHub sources and CI metadata, Vercel deployment metadata, today's earlier authenticated production observations, and a fresh attempt to inspect the Player application. It is not a penetration test, full financial transaction certification, or a new execution of the repository's entire test suite. The later Player browser session had expired; unauthenticated checks and static analysis continued. No production data, credentials, repository files, configuration, deployments or migrations were changed during this audit.

## Verified baseline

- Repository: `kohnerbouchard-star/Student-Profile`.
- Main: `a4dd2651d0ba964cce0cf28bf35f76975f35fd13`.
- Vercel reports `www.econovaria.com` and `econovaria.com` assigned to READY deployment `dpl_HdaQC3VvDaxwzxXBU8eU1VRNCUuw`, commit `196b88e6dec9fc951ae0e690fe96057d67bf7bf5` on `release/production`.
- GitHub reports main is 525 commits ahead of that deployment commit, zero behind. This count is not a count of missing features or defects. The comparison returns only 300 changed files, so that file list is not exhaustive.
- The current-main Actions query returned 23 completed workflow runs: 13 successful and 10 skipped, including nine skipped Vercel verification dispatches. This is existing CI evidence, not tests rerun by this audit.
- Production Git Release run `37896872649` succeeded only in its contract-validation job. Staging capture, production capture, live-parity enforcement and publication were skipped.

Sources: [main](https://github.com/kohnerbouchard-star/Student-Profile/commit/a4dd2651d0ba964cce0cf28bf35f76975f35fd13), [release comparison](https://github.com/kohnerbouchard-star/Student-Profile/compare/196b88e6dec9fc951ae0e690fe96057d67bf7bf5...a4dd2651d0ba964cce0cf28bf35f76975f35fd13), [production-release run](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/37896872649), [Vercel deployment](https://vercel.com/econovaria/econovaria/HdaQC3VvDaxwzxXBU8eU1VRNCUuw).

This is the first dependency to resolve: identify the intended release candidate and prove its frontend, API, Edge functions, database schema and configuration belong together. Do not blindly promote 525 commits or assume merging a PR updated the live game.

## Observations from today's production review

All 18 Administrator sections were visited earlier today; Player coverage was sampled. These observations belong to the deployed application, not automatically to current main.

- Administrator Contract Details failed for the sampled contract while the contracts list loaded; retry failed again.
- World Geography/Campaign anchors and Skip to Main from Logs navigated to Overview. Document titles did not follow visible route headings.
- Administrator-generated `/play?gameCode=…&mode=student` link returned 404; homepage Player sign-in worked.
- A newly created synthetic Player could sign in, but location was unassigned, residency uninitialized and no campaign active while the dashboard directed the player toward contracts. This needs prerequisite/state-contract review, not invented onboarding progress.
- Banking showed unavailable FX and unconfigured credit. Treat these as unavailable/configuration states until diagnosed; do not enable lending to make the UI look complete.
- Administrator screens had overly technical copy, inconsistent counts, nested scrolling and raw identifiers. Store availability copy counted zero-stock products as purchasable.
- User-reported refund and Arrival Class corrections returned HTTP 400. The refund response details were not captured. The Arrival Class generic response has a plausible source-level SQL cause that still needs disposable reproduction or deployed log evidence.

No contracts were accepted, economic transactions performed, Arrival Class answers submitted or balances changed in this audit. Store/Market loading observations alone do not establish a persistent failure.

## Fresh live release inventory

Read-only Supabase inventory during this audit verified production project `cgiukdjwicykrmtkhudh` and staging project `eecvbssdvarfcykcfrny`. Both report healthy project status; that status does not certify application workflows.

- Production migration ledger: 464 rows. Staging: 468 rows. Both latest reported entry: `20260921044500_reconcile_internal_runner_nonce_service_role_authority_v1`.
- Both ledgers lack exact entries for seven October migrations already on main: loan liability, loan purge graph, business-loan bindings, private sales assessment, gated submission, system recovery, and recovery targets.
- Sixteen August canonical identities differ from live identities with similar names. These are historical reconciliation candidates, not an instruction to rerun sixteen migrations. Ledger counts alone do not establish schema equivalence or identify a safe migration plan.
- Edge inventory: 22 production functions and 30 staging functions. Staging has additional test/licensing functions. Matching names or `ACTIVE` status does not certify equal source, configuration or behavior; exact candidate-bound attestations remain required.

The seven October identities to review are `20261004145731`, `20261004202506`, `20261004221307`, `20261004235046`, `20261005004013`, `20261005212732`, and `20261007221252`. Loan preparation must not silently enable lending. Recovery preparation must not reset existing accounts or expand operator credentials as a side effect.

## What “untangling” should mean

The complete repository tree contains 4,208 files, with 1,280 JS/TS files in the architecture inventory's source roots, 456 SQL migrations, 28 Edge entrypoints and 181 workflow YAML files. The checked-in inventory flags 168 cross-domain deep-import matches, 54 persistence-location candidates and 100 files of at least 500 physical lines. These are screening metrics, not defect counts. Five public domain seams already exist and should be reused.

The clearest structural hotspots are `player-terminal/src/app.js` (1,171 lines and several lifecycle owners), its shared `api/read-model.js`, overlapping Admin request clients, cross-domain construction in the Dashboard repository and Stock runner adapter, and the compressed Business workspace renderer. That renderer is about 49 KB in only 131 lines, illustrating why a line-count-only cleanup target misses complexity. The existing aggregate persistence guard permits 100 candidates despite a current count of 54; add touched-area/per-domain non-regression guards rather than relying on old global ceilings.

Keep the existing modular monolith. A module should own one responsibility and expose a narrow public contract. HTTP adapters authenticate and validate, application services coordinate use cases, domain code calculates policy, and repositories/RPCs persist effects. Database transactions remain the authority for money, inventory, replay and concurrency. UI code renders state and requests commands; it should not recreate economic rules.

Do not introduce microservices, a game engine, a new UI framework or a replacement database merely to reduce file size. Keep existing functional boundaries and remove legacy code only after caller and rollback evidence exists.

## Roadmap: ordered milestones

### R0. Establish one truthful release baseline
Priority: immediate. No feature redesign prerequisite.

1. Pin the candidate main SHA and record the actual frontend, Edge and schema/configuration identities for each environment.
2. Reconcile existing release owners #730/#731/#735/#736 and their conflicts with current holds. Do not create a competing release workflow.
3. Resolve migration aliases and missing October suffixes through the existing provenance policy, without editing applied history or broadening drift exceptions.
4. Publish a release checklist that distinguishes source-qualified, staging-qualified, production-parity-qualified, promoted and post-release-verified.

Exit: one candidate-bound release plan, exact missing changes, fresh schema/function evidence, rollback/recovery procedure and explicit remaining blockers. A green skipped workflow is never a pass for its skipped work.

### R1. Repair concrete failures before broad extraction
Priority: immediate; small independent fixes with characterization tests.

- Finish existing game-provisioning PR #885. Its Database Replay job currently stops at unapproved/missing migration suffix `20261010040738_economic_core_request_claims_v1.sql`. Coordinate the suffix registry with the existing #884 amendment; preserve exact source/digest guards. Prove real service-context success and anonymous/authenticated/malformed/contradictory-claim denial, provisioning replay and rollback.
- Repair MFA/web-session awaited dispatch and recovery BFF response classification. Test the real entry handlers through the BFF, including provider failures and non-JSON responses.
- Reproduce and address password-reset RPC issue #755 using the full migration chain and actual function, not a reduced test stub.
- Repair route versus in-page anchor ownership; test actual clicks, Back/Forward and focus, not merely link counts.
- Reproduce Arrival Class correction and replay semantics in disposable PostgreSQL; qualify any forward migration before rollout.
- Diagnose Administrator Contract Details and the reported refund failure with matched request/error evidence. A generic 400 is insufficient to infer the refund cause.

Exit: each failure has a regression reproducing the defect, a minimal correction and exact-head executable evidence. No unrelated UI or architecture rewrite bundled into authentication or financial corrections.

### R2. Make a new player's first session coherent
Priority: next product milestone; coordinate with the existing Player-refresh chat and #624.

1. Define a single server-backed readiness view: session valid, game available, country/location assigned, required onboarding complete, and which actions are enabled with reasons.
2. Make the dashboard lead to the next valid action, preserving progress on refresh and re-login. Do not infer completion from visiting a page.
3. Every route declares its required and optional resources. Direct entry must work without first visiting another route. Distinguish not loaded, loading, empty, unavailable, forbidden and failed.
4. Correct empty-filter behavior, partial Crafting rendering and misleading environment-specific error copy.
5. Establish a first-session scenario using synthetic data: sign in → complete prerequisites → accept/complete one suitable contract → receive one reward → buy one permitted item → inspect inventory. Expand to production/selling only where the game's prerequisites actually support it.

Exit: first-use and returning-player journeys pass against disposable services, including interrupted requests, repeated clicks, expired sessions and mobile layouts. One failed optional panel must not blank unrelated useful data.

### R3. Split the Player composition root and data projections
Priority: first substantial code cleanup; implement in small behavior-preserving PRs.

- Extract route lifecycle/navigation from the Player app coordinator.
- Extract typed command dispatch and in-flight/replay handling, retaining existing financial command identities.
- Separate route-specific projections from the broad shared read model; assign one owner to each state slice.
- Keep the existing freshness coordinator as the authority. Do not add another event bus, timer system or mirrored snapshot store.
- Introduce shared layout, typography, spacing, form, table, dialog and status components during the Player refresh. Feature modules consume them without embedding network or business policy.

Suggested extraction order: route/anchor behavior → readiness and resource contracts → Contracts/Inventory projections → Business/Loans projections → mutation dispatch → remaining shell responsibilities. Characterize each seam before moving it.

Exit: adding or fixing a feature no longer requires unrelated central switch blocks and multiple state owners. Deep-link, stale-response, unmount/remount, game-switch and focus behavior remains qualified. New cross-domain imports use public seams.

### R4. Finish existing domain and scheduler boundaries
Priority: parallel only where ownership and tests are disjoint.

- Integrate the existing Campaign #879–884 stack in dependency order after reconciliation, preserving its stale-worker counterexample and fencing fix. The held live-shaped rehearsal is not a pass.
- Finish REF025 repayment, servicing/default attribution and consistent business borrowing lifecycle qualification. Reuse merged loan race work; do not restart superseded PR #859.
- Resume REF019/020 only after their auth baseline and #668/#736 ownership prerequisites.
- Continue Dashboard, Stock runner and World repository extraction at explicit orchestration seams. Preserve atomic load/calculate/apply behavior and transaction boundaries.
- Standardize transport/error semantics through one bounded shared adapter while keeping domain-specific authorization and replay policy explicit.

Exit: domain dependencies flow through owned interfaces; scheduler acknowledgements match actual persisted outcomes; repeated/concurrent commands preserve exactly the accepted effects and return stable results.

### R5. Retire compatibility and redundant scaffolding with proof
Priority: after active workflow and release risks.

- Finish REF015's demonstrated stylesheet-order repair in PR #861 before deleting any compatibility path.
- Continue REF027/047/048/049 using caller inventory, replacement evidence and rollback criteria.
- Reconcile stale roadmap entries and superseded PRs; close or delete only after owner disposition and verification of retained work.
- Consolidate repetitive qualification helpers where semantics match. Preserve distinct security and deployment gates; 181 workflow files alone is not proof that any specific one is removable.

Exit: one supported path per migrated responsibility; no unowned compatibility imports; no broken old URL or external consumer; documentation agrees with current source and release state.

### R6. Certify a release and keep it maintainable
Priority: release prerequisite plus continuing discipline.

- Stage and qualify the exact schema, Edge and frontend candidate together using the existing release process.
- Rehearse recovery and interrupted financial workflows with synthetic data; preserve private backups and evidence.
- Verify canonical-domain deployment identity and perform approved post-release checks. New lending, payment or recovery capabilities remain separate activation decisions where held.
- Add enforced aggregate branch checks, subject to explicit approval for security-sensitive repository settings.
- Cover every dependency graph, including Player and Deno, in supply-chain inventory; use executable behavior tests alongside source assertions.
- Re-run REF050 reassessment after its actual dependencies complete. Report source, staging and production status independently.

Exit: the intended release is visibly deployed, critical journeys pass, remaining known limitations are deliberate and documented, and future merges cannot silently skip required acceptance.

## Recommended first three bounded coding assignments

1. Existing PR #885: resolve the migration-registration dependency, then pass real game-provisioning qualification. This fixes the immediate staging setup obstacle.
2. Existing release owner: produce the exact current-main convergence plan and rehearse it against fresh staging evidence. No forced promotion, ledger rewrite or arbitrary removal of holds.
3. Existing Player UI owner: fix route/anchor and resource-readiness behavior first, then implement the refreshed shell with tested onboarding. Do not create another Player redesign branch without reconciling that owner.

MFA/recovery repairs can run alongside these only with disjoint file ownership. The final release candidate should include accepted fixes rather than blindly target whatever happens to be newest main at dispatch time.

## Working rules and measurements

- One authoritative owner per change lane and one registered purpose per PR. Put infrastructure scaffolding in service of a defined next executable test, not an endless series of preparatory changes.
- Measure cross-domain imports, persistence outside repositories, shared mutable state, route-order dependencies, duplicate transport implementations, actual browser journey failures and recovery outcomes. Line counts are hotspot signals only.
- For each PR record: behavior preserved/changed; exact head; tests executed; tests mocked; skipped/blocked stages; evidence; rollback; and remaining deployment work.
- Add a narrow ratchet after an extraction is proven so new code cannot recreate the boundary violation. Do not silence existing findings by growing broad allowlists.
- Keep historical migrations intact. New schema changes are forward-only and separately rehearsed.
- Definition of usable initial release: a new player can sign in, complete setup and finish the agreed earning/spending loop without operator rescue; an administrator can manage that loop with clear errors; balances/inventory/replay remain correct; the live deployment matches its qualified evidence.

## Document status

This is an audit and proposed sequencing record, not a release certificate, implementation completion claim, or replacement for the authoritative beta/REF ledgers. Existing task owners must register bounded follow-up work and reconcile the authoritative ledgers. No code, database, configuration or deployment changes are included.


---

# Appendix A: architecture evidence and extraction units

# Econovaria architecture audit and decomposition plan

Audited repository: kohnerbouchard-star/Student-Profile  
Audited source: main at a4dd2651d0ba964cce0cf28bf35f76975f35fd13  
Read-only inspection date: 2026-10-10 UTC

## Bottom line

Econovaria is a modular monolith in the middle of a real, partially successful migration. It already has useful domain services, repository ports, explicit frontend feature flows, transaction RPCs, public boundaries, and regression guards. The main problem is that the composition layers still know too much: the Player shell owns too many lifecycles, API adapters repeat transport/session behavior, consolidated repositories construct other domains' infrastructure, and compatibility scaffolding remains intertwined with active entrypoints.

Continue the existing refactor in small, behavior-preserving slices. Do not replace the framework, introduce microservices, build another universal state manager, or restart completed REF tasks. An extraction counts as progress when it removes a dependency or gives a lifecycle one clear owner, not merely when a file becomes shorter.

## Scope and strength of evidence

- GitHub's main branch endpoint resolves to a4dd2651d0ba964cce0cf28bf35f76975f35fd13, the merge of PR #878, dated 2026-10-09. The recursive tree response reports truncated=false.
- The complete tree contains 4,812 entries, including 4,208 blobs. Independently counted from that tree: 1,280 JS/TS source files in the existing inventory's scan roots; 28 Edge index.ts entrypoints; 456 SQL migration files; 181 workflow YAML files.
- 556 files have .test. or .spec. in their filename. This is not the test count: many Player tests are ordinary .mjs files, and one file can contain many tests.
- Selected current source files, composition roots, public seams, architecture scripts, tests, and existing refactor records were read in detail. This is a repository-wide structural inventory plus a risk-targeted source audit, not a line-by-line review of all 1,280 source files.
- No app, test, typecheck, build, browser journey, SQL replay, staging flow, or production operation was executed. Existing documents' test claims remain historical claims, not tests independently rerun by this audit.
- Counts from the checked-in generated architecture inventory are labeled as such. The source-file and entrypoint counts were independently checked against the full tree; all source contents were not rescanned.

[Immutable audited commit](https://github.com/kohnerbouchard-star/Student-Profile/commit/a4dd2651d0ba964cce0cf28bf35f76975f35fd13)

### Current inventory, interpreted correctly

The [checked-in architecture inventory](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/docs/architecture/inventories/econovaria-architecture-inventory-v2.json#L1-L23) reports:
- 29 domain directories, including two with no source files: analyst and audit
- 168 cross-domain deep-import matches: 119 in non-test files and 49 in .test/.spec files
- 64 of the 119 non-test matches target Players
- 9 cross-domain infrastructure-import matches
- 54 persistence-location candidates, including two test files
- 100 source files at or above 500 physical lines, comprising 82 non-test and 18 test files
- 210 files with compatibility/fallback/legacy markers

These are lexical candidates, not 168 invalid dependencies or 54 unauthorized database accesses. Type imports, intentional read models, tests, and recognized adapters require different treatment. For example, the detector only recognizes a domain-root index.ts as public, so it also classifies three imports of the deliberately public notifications/public/storyNotifications.ts as deep imports.

The current tree has five root public barrels: banking-fx, business, economy, players, and store. The [older ownership document](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/docs/architecture/econovaria-domain-ownership-v2.md) still says only Store has one; it should not be used as a current fact.

## What has already improved and must be preserved

The [current execution backlog](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/docs/roadmaps/refactor-execution-v1/backlog.json) records 40 VERIFIED_COMPLETE, 2 BLOCKED, and 8 PLANNED tasks. Those are ledger classifications, not a new full-program certification.

Important completed boundaries visible in current code:
- Players has an explicit [public boundary](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/src/domains/players/index.ts#L1-L23). Adopt it where appropriate rather than inventing a new request-scope framework.
- Stock tick execution is already in [runStockMarketRunner](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/src/domains/stocks/application/runStockMarketRunner.ts#L25-L104), preserving load, calculate, atomic apply, then best-effort public event ordering.
- Dashboard financial projection helpers are already extracted. [REF037's bounded record](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/docs/operations/evidence/refactor-execution-v1/REF-037/preflight.md#L27-L43) explicitly preserves the 15-operation batch, repository, and leaderboard.
- REF043 extracted Banking response traversal. Its [scope record](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/docs/operations/evidence/refactor-execution-v1/REF-043/preflight.md#L12-L21) specifically excludes API/transport/auth/BFF changes. Remaining transport duplication does not mean that task failed.
- Player freshness already has a [terminal-local coordinator](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/api/resource-freshness-coordinator.js#L1-L45), and the shell defaults to using it. Preserve its generation, publication, and cancellation protections.
- The retirement gate already demands [hash-bound caller, owner, and parity evidence](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/scripts/architecture/refactor-seam-ratchet.mjs#L105-L140). Keep that protection.

## Findings and precise next boundaries

### 1. Player shell combines presentation, async publication, and feature command dispatch

Priority: high. Confidence: directly observed.

[player-terminal/src/app.js](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/app.js) is 1,171 lines, but its responsibilities matter more than its length:
- terminal state, request versions, freshness tickets, focus/effect ownership: lines 44–123
- render and full mount replacement: lines 189–235
- route loading, bootstrap, session connection, resource refresh: lines 277–440
- payload validation, mutation execution, refresh publication, feedback, and control restoration: lines 455–547
- generic click dispatch: lines 609–837
- form validation and submit dispatch: lines 918–1015
- session, navigation, keyboard, network, and destroy lifecycle toward the end

Feature installers already exist in [main.js:38–88](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/main.js#L38-L88). The problem is shared responsibility between those feature flows and the shell, not the lack of modules.

Small extraction units:
1. Extract a read-publication helper that takes the store, config, and existing freshness coordinator, and owns the repeated resourceStatus merge, capability recomputation, and settlement sequence. Start with refreshResources only; do not move all loading methods at once.
2. Extract route loading after the first helper is proven. Keep capture/admission/settlement and superseded retry order unchanged.
3. Extract generic command execution into a command controller, preserving the existing feature-specific flows and invalidation map.
4. Move one related action/form family at a time to its existing feature owner. Avoid a universal event bus.

Acceptance:
- Delayed response from game/session A cannot overwrite B.
- Logout/destroy/remount during a read or mutation produces no late store, focus, toast, or button effect.
- A committed mutation with failed refresh remains a committed mutation, not a retryable write.
- Equal concurrent reads coalesce only under the existing identity rules.
- Current browser route-refresh, connected Inventory, realtime, Store, Marketplace, and session-exit tests remain passing.
- Record endpoint call counts before and after; no extra load or refresh calls.

### 2. Player projection ownership is spread across a large normalizer and a stateful integration adapter

Priority: high. Confidence: directly observed; runtime failure not demonstrated.

[read-model.js:920–975](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/api/read-model.js#L920-L975) projects one dashboard response into news, market, portfolio, Store, Inventory, Contracts, notifications, Banking, session, dashboard, and progression. [mergeTerminalRead:999–1112](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/api/read-model.js#L999-L1112) is another endpoint switch that updates overlapping slices.

Separately, [student-profile-api-call.js:328–442](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/integrations/student-profile-api-call.js#L328-L442) keeps rawSession, capabilityManifest, snapshot, and sessionFingerprint, while [PlayerApi:135–178](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/api/player-api.js#L135-L178) owns caches, read generations, in-flight reads/writes, retry idempotency keys, and session cancellation. The shell also has its own state. These are different layers, but their ownership is difficult to reason about.

A concrete immutability hazard exists: mergeTerminalRead shallow-copies data and then calls applyDashboardSnapshot, which writes nested banking/session/progression objects. This is a directly observed mutation pattern; this audit has not reproduced a user-visible stale-state defect.

Small extraction units:
- First extract pure Banking projection (read-model.js:522–614), then Market (400–513), then Store/Inventory (616–803), into existing feature owners.
- Keep the old exports as a temporary delegating adapter to avoid simultaneous caller migration.
- Make projection functions return owned slice patches. Give one explicit composition function responsibility for cross-slice dependencies such as currency, dashboard cash, and notification count.
- Document exactly which layer owns raw transport data, normalized projection, cache admission, and published UI state. Do not introduce an additional cache.

Acceptance:
- Golden payloads preserve unknown, missing, zero, negative, multi-currency, and malformed-value semantics.
- Projection tests deep-freeze inputs and verify no caller-owned nested object changes.
- Each endpoint is normalized once at its documented layer; intentional validation at another layer is distinguished from normalization.
- Session/capability/dashboard load order stays unchanged.
- Existing connected adapter and currency/banking tests continue to run, not just preview fixtures.

### 3. Admin has a canonical security transport but repeated request mechanics above it

Priority: high. Confidence: directly observed.

The [908-line admin-api-client.js](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/admin/v2/src/api/admin-api-client.js) combines endpoint paths, validators, body shaping, network diagnostics, abort/timeouts, read cancellation/versioning, and mutation de-duplication.

[requestAdminJson:259–308](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/admin/v2/src/api/admin-api-client.js#L259-L308) substantially overlaps [BankingApi.requestJson:142–188](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/admin/v2/src/routes/banking/BankingApi.js#L142-L188). Both link abort signals, create timers, use credentials/include/no-store/error redirects, parse JSON, normalize errors, and unlink in finally. There are real differences in body serialization and diagnostics; do not erase them by assuming textual equivalence.

There is also near-duplicate in-flight mutation machinery within [storeMutation and playerMutation:668–746](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/admin/v2/src/api/admin-api-client.js#L668-L746). Meanwhile [admin-bff-transport.js](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/admin/v2/src/api/admin-bff-transport.js#L96-L158) owns security-specific transport behavior. Keep that owner intact.

Small extraction units:
1. Characterize the two request functions with the same response/abort matrix.
2. Extract a small request kernel accepting a response parser/validator and explicit body/header policy.
3. Move Store to it, then Players, then Banking in separate changes.
4. Extract the in-flight logical-mutation registry only after preserving fingerprint conflict and cleanup behavior.
5. Keep business path builders, amount/currency validation, and domain error adaptation route-owned.

Acceptance:
- Pre-aborted and mid-flight aborts do not retry; timeout and user abort remain distinguishable.
- MFA/401/session exit fires once.
- CSRF and idempotency remain supplied by the canonical BFF transport.
- Same logical mutation coalesces, changed input with the same key rejects, and both success and rejection clean the in-flight entry.
- Malformed/non-JSON responses and retry-after preserve existing safe error envelopes.
- Existing [behavioral Store API tests](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/scripts/admin-v2-store-api.test.mjs#L63-L156) remain, along with Banking tests and connected mutation/replay journeys.

### 4. Domain public boundaries exist, but adoption is incomplete and current metrics blur safe versus unsafe imports

Priority: medium-high. Confidence: inventory plus inspected imports.

The 64 non-test Players deep-import matches are the largest repeated family. For example:
- [Countries handler:14–15](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/src/domains/countries/api/playerWorldReadHttpHandler.ts#L14-L15) imports session and scope helpers directly.
- [Business-banking handler:11–12](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/src/domains/business-banking/api/playerBusinessBankingHttpHandler.ts#L7-L20) already uses the Business public seam but deep-imports Players helpers.
- The [Players public seam](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/src/domains/players/index.ts#L1-L23) already exports those scope/session symbols.

First unit: migrate only the Countries read-handler family to the existing Players seam, with no function-body or authorization changes. Then migrate another family. This can reduce private dependency spread without changing behavior.

Do not automatically move every contract/type import into a barrel or export all internals. Distinguish public contract imports, composition-only imports, and forbidden infrastructure imports. The Notifications public publisher intentionally wraps an existing Storylines repository; [its 16-line implementation](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/src/domains/notifications/public/storyNotifications.ts#L1-L15) is a migration seam, not independent proof of final ownership.

Acceptance:
- Selected family has zero private Players imports.
- Existing function identities, error envelopes, auth ordering, and scope derivation remain unchanged.
- No browser-provided UUID becomes authoritative.
- No new public exports beyond the consumed contract.
- New runtime cycles and cross-domain infrastructure imports are rejected.

### 5. Dashboard remains a cross-domain composition repository

Priority: medium-high. Confidence: directly observed.

The [Dashboard repository:14–57](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/src/domains/game-dashboard/infrastructure/supabasePlayerGameDashboardRepository.ts#L14-L57) imports Stocks and Contracts infrastructure and DTO mappers directly. Its [read method:299–343](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/src/domains/game-dashboard/infrastructure/supabasePlayerGameDashboardRepository.ts#L299-L343) constructs SupabaseContractRepository and composes 15 operations in one Promise.all.

It also reads game-wide balances and holdings for player projection/leaderboards and player-scoped orders, trades, inventory, and purchases. That is legitimate consolidated read-model work; it should not be converted into many HTTP calls or labeled unauthorized cross-domain mutation.

Next units, preserving REF037:
1. Extract pure Store/Inventory/Order/Trade mapping functions.
2. Introduce a narrow Dashboard contract-read port for the two existing contract operations and inject the existing implementation at the composition root.
3. Introduce the Stocks read port similarly.
4. Keep one explicit dashboard query/composition owner, with a measured query budget.

Acceptance:
- Same 15 high-level operations, no sequential waterfall or per-player N+1 query.
- Exact game/player scopes, select lists, orderings, limits, and error translation retained.
- Multi-currency valuation, leaderboard behavior, and safe DTO filtering unchanged.
- Query spy records are golden-tested before/after; do not use only DTO snapshots.
- No domain infrastructure imports from Dashboard after the specifically approved ports are adopted.

### 6. Stock runner still composes Story and Contract infrastructure in its HTTP adapter

Priority: medium-high. Confidence: directly observed.

REF039 already extracted tick execution. The residual [HTTP hook factory:397–431](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/src/domains/stocks/api/stockMarketRunnerHttpHandler.ts#L397-L431) directly constructs Storyline, player-story context, Contract, and Story-effect ledger repositories. It is responsible for assembling another domain's workflow.

[HTTP lines 198–242](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/src/domains/stocks/api/stockMarketRunnerHttpHandler.ts#L198-L242) make important ordering explicit: validate clock, check market open, run the tick, then run the best-effort Story hook. Preserve it.

Next unit: move only the Story hook's construction behind a Storylines-owned factory with the same injected callable contract. Do not combine this with the active Campaign lease/acknowledgement work or alter scheduling.

Acceptance:
- One successful tick apply precedes the hook.
- Failed tick apply invokes neither public success behavior nor Story effects.
- Story failure does not replay or roll back the already committed tick.
- Exact clock timestamp and tick index are forwarded.
- No new transaction split, message broker, retry engine, or scheduler.
- Stocks HTTP no longer imports those four foreign infrastructure implementations.

### 7. Large rendered views and compressed modules evade useful complexity measurement

Priority: medium. Confidence: directly observed.

[CraftingRoute.js](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/admin/v2/src/routes/crafting/CraftingRoute.js) is 1,078 lines and contains multiple independent panels plus recovery and supply dialogs:
- recovery dialog: 600–710
- supply dialog: 711–961
- route/dialog lifecycle composition: 963 onward

Extract these two dialogs independently, preserving route-owned lifecycle and callbacks. Then extract jobs and supply panels. This is useful because it reduces independently changing responsibilities, not just line count.

The more revealing example is [business-workspace-sections.js](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/pages/business-workspace-sections.js), 49,167 bytes but only 131 lines. Its longest line has 5,339 characters, so it falls below the 500-line ratchet despite containing many distinct business panels. It also imports unrelated route pages and includes a second [route table and world-route renderer:120–130](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/pages/business-workspace-sections.js#L120-L130), duplicating responsibilities in the canonical [core/route-renderer.js](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/core/route-renderer.js#L64-L90).

The observed import consumer is business-workspace-page.js importing only renderBusinessWorkspacePage. That makes the duplicate route exports a strong dead-code candidate, not sufficient retirement proof by itself.

Next units:
- Formatting-only stabilization of this compressed source, with exact rendered-output parity.
- Caller audit of the duplicate route exports using the existing retirement rules.
- One panel per meaningful owner: Treasury, Procurement, Workforce, Financial reporting.
- Keep financial calculations and settlement rules out of template components.

Acceptance:
- Exact forms, data attributes, button actions, currency text, and visible output retained.
- Dialog focus, cancel/Escape, repeated open/close, destroy, and pending-submit tests remain.
- Neither a formatter nor an extraction changes rounding, values, or action permissions.
- Deleted exports require caller evidence, including dynamic imports and build/runtime references.

### 8. Authentication/persistence cleanup is real debt, but belongs behind existing ownership gates

Priority: high consequence, gated sequencing. Confidence: directly observed.

[Player attendance:137–179](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/src/domains/attendance/api/playerAttendanceClockInHttpHandler.ts#L137-L179) reads settings, computes attendance/reward choice, and invokes the atomic clock-in RPC in the HTTP handler. [Attendance reward policy](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/src/domains/attendance/api/attendanceRewardPolicy.ts#L43-L90) mixes policy resolution and database reads. REF019 already owns this next boundary and is not complete.

Even after the ledger-history query extraction, [Player ledger history:93–155](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/src/domains/economy/api/playerLedgerHistoryHttpHandler.ts#L93-L155) retains its own session/game/player read sequence. REF021 completion does not mean all session resolution is centralized.

[web-session-api/index.ts](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/functions/web-session-api/index.ts) still handles login, status, logout, MFA, proxying, session refresh/revocation, bounded bodies, and cookies. Staff login remains an HTTP/persistence seam. These are not the first places to perform cosmetic extraction while recovery/service-role/context ownership is active.

Sequence only after owner reconciliation:
- Finish the existing REF019/020 gates before opening overlapping work.
- Capture exact status/error/order/side-effect traces.
- Move a persistence port without changing auth, clocks, reward policy, transaction authority, or cookie policy.
- Keep attendance plus reward in its existing one-RPC transaction.

Acceptance includes wrong-role/game/player, revoked/expired session, AAL2 and recovery restrictions, replay/idempotency, rate limiting, and valid owner. Synthetic tests alone do not establish live-session readiness.

## Architecture guardrails need a sharper scoreboard

The existing guards are valuable. Improve them rather than replacing them.

1. The [inventory generator:5–8](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/scripts/architecture/build-architecture-inventory.mjs#L5-L8) scans backend/src, Edge functions, admin, frontend/src, and Player src; it omits root api, auth, and index.html. The seam ratchet has broader roots, so this is inconsistent coverage rather than a complete absence of protection.
2. The [public-boundary detector:30–32](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/scripts/architecture/build-architecture-inventory.mjs#L30-L32) recognizes only root index files, not approved public subpaths.
3. Its reported baselineMainSha is hard-coded to an older baseline. Preserve baseline identity, but add a distinct sourceTreeSha/content-manifest identity for the measurement.
4. [Aggregate maxima](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/scripts/architecture/architecture-ratchet-v2-baseline.json#L4-L18) allow up to 100 persistence-location matches even though the current inventory has 54. An increase from 54 to 99 could pass. Global file counts also permit unrelated debt to be traded between modules.
5. The 500-physical-line threshold misses compressed source and conflates tests with runtime. Add function responsibility/size and bytes/token or formatted-line candidates, and report tests separately.
6. Regex/source-contract tests can pin spelling and placement. For example, [admin-local-handler-architecture-contract.test.mjs:31–67](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/scripts/admin-local-handler-architecture-contract.test.mjs#L31-L67) asserts source substring order. Keep architectural guards where they prove a boundary, but pair security/order claims with executable injected-spy tests. Refactoring a function name should not force weakening a security property.
7. Root npm test, backend smoke/typecheck, Player verify, browser suites, and database replay are separate aggregates. Maintain a machine-readable suite/owner/trigger matrix so a successful root npm test is never presented as all application tests passing.

Initial acceptance for the scoreboard:
- Existing selected-seam ratchet remains enforced.
- Every approved public boundary is explicitly listed; no wildcard export escape.
- Runtime/test/fixture/generated classifications and scan roots are explicit.
- Per-domain/per-file forbidden edges cannot increase, even if the global count decreases.
- Touching a critical flow selects its behavioral and connected tests.
- Report new, retired, unchanged, and approved-exception dependencies separately.

## Recommended implementation order

These are proposed future units, not changes made by this audit.

1. Reconcile exact main, current owner PRs, and the source-versus-runtime evidence matrix. Preserve all release holds. Rebase/requalify existing owners rather than creating replacement branches.
2. Tighten the touched-area measurement and add characterization tests for the first extraction. Avoid a huge tooling rewrite.
3. Extract one pure Player projection, starting Banking, with input immutability and output parity tests.
4. Extract one Player refresh/publication lifecycle using the existing freshness coordinator. Only then split route loading and generic command dispatch.
5. Extract the Admin request kernel and migrate one client at a time.
6. Adopt the existing Players public seam in one low-risk consumer family.
7. Extract a Dashboard contract-read port, then a Stocks read port, preserving the existing query batch.
8. Move the Stock-to-Story hook construction behind its domain owner.
9. Split Crafting dialogs and the compressed Business panels; remove duplicate route exports only after caller proof.
10. Resume gated auth/Attendance/Business work under existing REF ownership. Complete the active Campaign qualification stack under its owner.
11. Retire proven compatibility code under REF015/047/048/049 only after replacement, mounted caller, parity, and owner evidence.
12. Finish REF050 with current measurements and exact-head validation; certify only the checked source/runtime scope.

Parallelism: pure projection/view units and backend port units may run independently if their file scopes do not overlap. Serialize Player freshness/lifecycle changes; Admin transport changes; auth/scope changes; Campaign scheduling; and shared ledger/inventory updates. Do not mix extraction with feature work or schema changes.

Current open-owner conflicts observed through GitHub:
- #668 multi-game context hydration
- #624 Player CSS convergence
- #735/#736 auth/release boundary fixes
- #730/#731 Phase 15 certification
- #859 Business/loan disposable isolation
- #861 Settings caller cutover
- #879–#884 Campaign qualification/lease/acknowledgement stack
- #885 game provisioning service-claim compatibility

A source audit does not authorize merging, deploying, editing migrations, or altering production.

## Definition of done for every extraction

- One responsibility moves to one owner; caller and dependency changes are explicit.
- Existing public entrypoints may temporarily delegate; no parallel write path or duplicate cache.
- No new foreign infrastructure import, global browser fetch patch, or unowned state lifecycle.
- Existing transaction/RPC boundaries remain atomic, game-scoped, idempotent, and server-authoritative.
- Before/after golden behavior includes failures, cancellation, replays, ordering, and query/request counts.
- Relevant focused tests plus required aggregate checks are run on the final source.
- UI changes include real mounted/browser interaction and cleanup checks; SQL changes include disposable replay/lint and isolation checks.
- Exact commit, commands, results, skipped stages, and runtime evidence are recorded separately.
- Only proven source scope is closed; source merge is not production certification.



---

# Appendix B: Player route-by-route audit

# Econovaria Player experience: route and workflow audit

Date: 10 October 2026. Scope: read-only Player experience, route completeness, empty/loading/error/gated states, hidden workflows, and proposed UX seams. No economic writes, authentication attempts, repository changes, code execution, or tests were performed.

## Evidence boundary

- **New live observation:** the cloud browser had only an existing Administrator Console tab and a new-tab page, not the previously used Player tab. Opening the supplied `https://www.econovaria.com/player-terminal/` in a separate tab redirected to `https://www.econovaria.com/?mode=player&reason=session-invalid`, showing “Your session ended. Sign in again.” AX and a desktop screenshot confirmed this. This is a session/coverage limitation, **not a newly diagnosed application bug**. Authentication controls were not used, and the administrator tab was not inspected or changed.
- **Earlier live evidence from the earlier coordinated audit:** the synthetic Player could read Dashboard, World, Contracts and Inventory; World showed location unassigned, residency uninitialized and no active campaign; Dashboard directed the Player to contracts; 35 contracts were readable; Inventory was empty; Banking showed credit not configured and FX unavailable. Store/Market were seen only in loading states. These observations are historical within today's audit, not reverified by this audit pass.
- **Source evidence:** GitHub `kohnerbouchard-star/Student-Profile`, pinned main commit `a4dd2651d0ba964cce0cf28bf35f76975f35fd13`. The actual Player implementation is under `player-terminal/src/`, not `frontend/src/player-terminal/`.
- **Release distinction:** the coordinating audit identified canonical production as an older `196b88…` revision. None of the source findings below certify the current deployed Player behavior. Reproduce on a composed application at the exact release-candidate SHA before assigning deployed incidence.
- **Unverified:** fresh authenticated route rendering, responsive/mobile Player screenshots, writes, performance timings, actual API error causes, browser-history behavior, keyboard/screen-reader behavior, and backend configuration correctness. Existing test files were read, never run.

## Most important findings

### P1 candidate: Business section anchors conflict with the application's hash router

The configured Business workspace creates eleven in-page links such as `#business-workspace-products`, `#business-workspace-stockroom`, and `#business-workspace-finance`. The router accepts only sixteen top-level route names and maps an unknown hash to Dashboard. The application's global `hashchange` handler immediately changes route, closes modal/menu state, reloads route resources, and scrolls to the top.

No corresponding workspace-link interception was found in the application, bootstrap, local-controls or business-treasury handlers inspected. The source path therefore strongly predicts that clicking a Business section link will leave Business for Dashboard rather than scroll to the section. Treat this as a source-derived defect candidate pending a composed-app reproduction, not a live-certified failure.

- [Business navigation, lines 50–52](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/pages/business-workspace-sections.js#L50-L52)
- [Hash router, lines 1–14](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/core/router.js#L1-L14)
- [Application hash handler, lines 1087–1099](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/app.js#L1087-L1099)
- [Existing workspace test, lines 325–349](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/tests/browser/player-business-workspace.spec.mjs#L325-L349) checks link count, labels and Tab order, but the inspected block does not activate a link in the live router.

Recommended seam: distinguish top-level routing from section navigation. Either retain `#business` while scrolling/focusing the named section, or formally support a Business section parameter. Test all eleven links inside the real app, keyboard activation, browser Back/Forward, direct-link refresh, and mobile scrolling. The expected route must remain Business.

### P2: Contracts cannot display a user-selected empty status tab

`renderContractsPage` replaces the requested status with the first populated status whenever the requested status has no records. The click handler does correctly remember the selected tab, but the renderer overrides it. With Available contracts and zero Completed contracts, selecting “Completed (0)” therefore renders Available again. This is deterministic source behavior, not merely absent data.

- [Renderer, lines 106–118](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/pages/contracts-page.js#L106-L118)
- [Tab click handler, lines 713–716](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/app.js#L713-L716)

Preserve any valid explicitly chosen tab and show its zero-state. Choose the first populated tab only on initial entry when the user has not made a choice. Acceptance: select every zero-count tab with another populated tab present; selection and heading stay on the chosen state, detail panel clears, and zero-state copy appears.

### P2 conditional: Empty Crafting recipe catalog hides existing operations

The Crafting page returns immediately when recipes are absent. That prevents rendering the independently meaningful queue, equipment, usable effect items, active effects and effect history. A game with existing jobs/equipment but temporarily unavailable or removed recipes will hide those records and their eligible recovery/claim controls.

- [Early return, lines 44–48](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/pages/crafting-page.js#L44-L48)
- [Independent operations, lines 82–104](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/pages/crafting-page.js#L82-L104)

Render the recipe browser's empty state within the route rather than replacing the whole route. Keep queue/equipment/history independently visible. Acceptance fixture: `recipes=[]` with a claimable or cancellable job, equipment and active effects. Records stay visible and only capabilities approved by the server are actionable. This fixture condition was not established in production.

### P2 latent/release-held: Loans business eligibility depends on prior navigation

Loans obtains the business identifier only from `data.business.configured` and `data.business.company.id`. Its route resource plan requests Loans and optional Banking, but not Business. The initial read model has no configured business. Thus a business owner entering Loans directly can be told to create/recover an active business and have the application disabled, whereas visiting Business first can supply the missing context.

- [Loans dependency and eligibility, lines 47–55 and 70–78](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/pages/loans-page.js#L47-L78)
- [Route resource plan](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/api/resource-plan.js)
- [Initial Business read model](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/data/empty-read-models.js#L34-L56)

The existing release record notes that Loans is behind a release hold; this is not evidence of currently exposed production impact. Fix the candidate before enabling it. Prefer a borrower-context projection delivered with Loans, or an explicit resource dependency and separate loading/unavailable/no-business states. Verify direct entry, reload, Business → Loans, Loans → Business → Loans, and session switching produce equivalent eligibility.

### P2: World unavailable copy claims a deployment cause without evidence

The World route can use a country-only fallback when no usable runtime model exists. That fallback labels travel “Not deployed” and states that the “staging game service has not deployed” the runtime. The same model path can follow an optional-resource failure, so it does not prove a missing deployment. This is particularly misleading on the production domain.

- [World fallback selection, lines 27–59](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/core/route-renderer.js#L27-L59)
- [World fallback text, lines 81–100](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/pages/world-page.js#L81-L100)

Use neutral unavailable text and a retry action unless the server supplies an explicit disabled/not-provisioned reason. Keep the country directory useful during a runtime outage. Test unsupported capability, no configuration, timeout, server error, stale cached model, and offline separately.

### P2 improvement: Optional requests still block first route paint

Required and optional resources enter one `Promise.allSettled` batch. The application holds a full-route skeleton until the batch completes. Store requires only its catalog but waits for Banking, Banking FX and Inventory; Market also waits for News, Banking, Banking FX, Portfolio, Countries and IPO data. Optional failure is isolated after completion, but optional latency is not isolated from initial paint. The default request timeout is 15 seconds.

- [Resource batching and loadRoute, lines 329–401](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/api/player-api.js#L329-L401)
- [Application route skeleton, lines 206–218](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/app.js#L206-L218)
- [Default request timeout](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/config/player-terminal.config.js)

This is an architectural explanation worth measuring, **not proof that the earlier observed Store/Market loading was stuck or caused by FX**. Publish the required read model first and show local loading/error states for optional panels, while keeping writes disabled until their exact dependencies are ready. Preserve existing generation/session/freshness protections when doing this. Test slow optional response, optional timeout, and rapid route changes with no false zeros or premature enabled checkout.

### P2 design: New-player next action does not account for onboarding readiness

Earlier live evidence had unassigned location and uninitialized residency while Dashboard led with contracts. Source Dashboard selects its first action from active/available contracts and does not load World runtime in its route resource plan. Source World says residency will appear “after onboarding” without a concrete onboarding continuation action. Missing campaign or credit configuration may be intentional; the issue is ambiguous ownership and guidance rather than proof those services are broken.

- [Dashboard next-action selection, lines 45–72 and 88](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/pages/dashboard-page.js#L45-L88)
- [Residency empty state, lines 69–73](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/pages/world-page.js#L69-L73)

Introduce server-described Player readiness: what is required, what is optional, who can unblock it, and the next safe step. Surface “Continue setup” only when genuinely required; otherwise explain that the game is ready to play and optional systems are not configured. Do not invent a prerequisite that blocks otherwise valid contracts.

## Full route / workflow inventory

The route registry contains **16 routes**. There is an Account/Profile view, not a separate Settings route. Desktop navigation uses seven groups; mobile shows Home, Finance, Work, Trade plus More, with World, Messages and Profile under More. Context navigation reveals sibling routes. The app preserves disabled product surfaces when configured and applies capability guards.

Source: [navigation layout](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/components/layout.js), [route renderer](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/core/route-renderer.js), [resource plan](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/api/resource-plan.js), [capability controls](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/core/capability-controls.js).

| Route | Current source surface and hidden controls | State / coverage conclusion |
|---|---|---|
| Dashboard | Financial/activity summary, three next actions, country intelligence map, world signals, portfolio snapshot, recent ledger activity | Earlier live read. Useful optional-resource copy exists. Needs readiness-aware action and honest unknown values; no fresh mobile certification. |
| World | Campaign/history, Arrival Class questionnaire/assignment, locations/routes disclosures, destination/modes/quote/travel, active journey, residency request | Earlier live uninitialized/configuration states. Country-only fallback, loading, error/retry, offline/stale labels exist. Missing campaign alone is not a bug. Mutations untested. |
| News | Category/list/detail intelligence browsing | Source only in this audit pass. Verify empty category, no stories, selection after filtering, map/news links and mobile master/detail flow. |
| Market | Asset directory, hidden search, sector filter, chart-range controls, Watch, holdings/news context, buy split funding, sale destination, IPO panel | Earlier live loading only. Source has no-assets/sector empty states and funding guards. Hidden controls must be reviewed through installed local-controls flow, not app fallback toast alone. Do not certify trades. |
| Portfolio | Canonical holdings view when `holdings` exists; older metrics/chart/allocation/exposure fallback otherwise; market deep links | Source only. Verify canonical/empty/fallback consistency, unpriced holdings, currencies, and portfolio → specific asset navigation. |
| Banking | Posted/held/available accounts, savings/credit setup states, FX quote/history/orders, account transfer disclosure, player transfer disclosure, ledger export/load-more | Earlier live credit not configured/FX unavailable. These are states, not verified backend defects. Existing not-configured, unavailable and empty distinctions should be preserved and made actionable. |
| Loans | Offers, currency-specific totals, application disclosure, repayment-account selection, active facilities/payment disclosures, schedule | Source only, release held. Nav-order business dependency candidate above. Do not imply enabled in production. |
| Contracts | Status counts/list/detail, lifecycle/timeline/rewards, accept, written/evidence/quiz/Story submissions, revision/review/approval/completion states | Earlier live 35 readable contracts. Empty-tab selection defect above. No accept or submission performed. |
| Business | Formation when unconfigured; otherwise eleven-section workspace: Overview, Products/Recipes, Stockroom, Procurement, Production, Workforce, Equipment, Sales, Finance, Ownership/Governance, Activity | Source only. Business anchors need composed-router test. Treasury retry, unavailable canonical datasets, blocked readiness and immutable receipt/recovery states exist. Extensive disclosures conceal consequential actions and need per-panel coverage. |
| Crafting | Recipes/materials/output, quantity, job queue/cancel/claim, equipment/equip/salvage, usable effects, active effects/history | Source only. Recipe early-return conditional hides independent work. Test blocked ingredients/unlock/max quantity and interrupted jobs without economic writes on production. |
| Store | Category/search, item art, stock/owned count, exact seller offers/prices/currencies, per-offer funding state, quote/confirmation flow | Earlier live loading only. No catalog certification. Source catalog remains useful after optional funding failure; distinguish no published catalog, no matching category/search, sold out, no active offer and unavailable funding. |
| Marketplace | Open listings/filter/detail, funded quote, draft listing disclosure, own listings/activation/cancel, dispute disclosure/history | Source only. Policy-disabled is explicit; absence of inventory/listings is ordinary emptiness. Draft creation reserves inventory and is a write. Do not inspect by submission. |
| Inventory | Owned/available/reserved counts, categories/capacity, server-published Use or Request redemption actions | Earlier live empty. Empty state currently gives prose directions to Contracts/Store/Marketplace; direct permitted CTAs would help. Preserve backend policy-driven actions. |
| Messages | Thread list/detail, hidden “Start a Player thread” disclosure, reply composer for active writable threads, disabled attachment button and administrator-visibility notice | Source only. No-conversation state is clear. Opening an unread conversation may mark it read through the installed message-read flow, so a strict read-only audit must inspect that side effect before clicking unread threads. No message sent. |
| Progression | Overview/Skills/Achievements/Licenses tabs; reputation/milestones; skill minimum level/prerequisite/points; reward claims | Source only. Empty content text exists. Review tablist keyboard pattern and focus/selection after rerender; no fresh accessibility certification. Unlock/claim are writes. |
| Profile / Account | Player identity/country/currency/session, Refresh section, Sign out; developer diagnostics only in development | Source only. No general settings editor exists in the inspected route. Do not report settings coverage as missing implementation unless a separate requirement says it should exist. |

Primary route source files are available at the pinned [pages directory](https://github.com/kohnerbouchard-star/Student-Profile/tree/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/player-terminal/src/pages). Explicitly read files include all sixteen route modules, configured Business workspace sections/wrapper, layout, app, router, API/resource plan, capability controls, empty models, and installed local-controls wiring.

## Cross-cutting UX recommendations

1. **Make failure ownership clear.** Use a common panel state shape: loading, empty, blocked by Player prerequisite, disabled by game policy, unavailable service, stale readable data, and ready. Include a safe next action and who can fix configuration. “Backend integration pending,” “canonical,” “no substitute,” “C3B/C3C,” and “authoritative” are implementation language repeated throughout core Player tasks.
2. **Keep technical integrity but rewrite its presentation.** A player can understand “Review price and fees,” “Funds available,” “Materials needed,” “Purchase complete; updating balances,” and “Ask your game administrator.” Put receipt IDs/version/fixing details under expandable technical details. Do not remove exact amounts, fees, expiry, irreversible effects, or trust/decision consequences.
3. **Separate independent panels.** Recipe emptiness should not erase jobs. Funding failure should not erase a catalog. World travel failure should not erase countries. Successful receipt evidence should survive a failed refresh. Existing receipt/recovery components are a foundation to preserve.
4. **Use a single intentional navigation contract.** Distinguish route changes, local section links, tabs and master/detail selection. A navigation click should not unexpectedly reset scroll, selected filter or draft. Add composed-app tests, not only independently mounted HTML fixtures.
5. **Expose blocked reasons visibly.** Many capability guards add only a disabled attribute/title. Hover titles are a weak mobile and keyboard explanation. Place a short inline reason near the disabled action, without promoting backend messages or raw identifiers into the primary UI.
6. **Stage Business complexity.** The eleven-section page has real operational depth, but a first-time owner needs a compact readiness checklist and a highlighted next step, with advanced governance/status/FX controls progressively disclosed. Preserve all existing operations in the information architecture rather than hiding them behind arbitrary feature removal.
7. **Review keyboard patterns using the composed app.** Existing skip link, map keyboard affordances, modal inert handling, focus restoration and mobile dialog semantics are useful foundations. Verify Arrow/Home/End behavior for declared tablists, visible focus in dense cards, closed/empty/disabled branches, alert announcements, and focus return after menu/modal dismissal.

## Runtime completion checklist

Run on a provisioned disposable audit game at an explicitly recorded deployment/commit; do not equate main source or public root assets with the release under test.

### First, establish coverage without writes

- [ ] Record exact deployed SHA/build and current Player fixture; no session tokens or secrets in screenshots.
- [ ] Capture desktop Dashboard and all sixteen reachable routes, recording ready/empty/gated/error state, rather than marking a loading screenshot as a pass.
- [ ] Record actual supported routes from UI/capability evidence, including release-held Loans; distinguish intentionally gated from missing.
- [ ] At mobile widths (e.g. 390 and 768), verify Home/Finance/Work/Trade/More, sibling context navigation, all More entries, no horizontal clipping, readable labels, and accessible scroll to bottom.
- [ ] Open/close safe disclosures and menus, use Escape/Back/Forward, and ensure no unintended submission. Inspect any read-marking behavior before opening unread communications.
- [ ] Reproduce Business anchor routing, Contracts empty tabs and Loans direct-entry dependency in the composed app.
- [ ] Inspect all World country/runtime/onboarding distinctions; confirm whether the game intentionally lacks campaign/location/residency.
- [ ] Wait for Store/Market to reach a terminal ready/error state and record visible duration before classifying a defect; measure required vs optional resource latency in an authorized development fixture.

### Then, with isolated fixture authorization

- [ ] For each route: no data, one record, many records, no matching filter, required 4xx/5xx/timeout, optional failure, stale/offline/retry.
- [ ] Slow optional Banking FX while Store/Market primary data is ready; no false empty state or premature enabled write.
- [ ] Empty Crafting recipes with existing queued job/equipment/effects; operations remain visible.
- [ ] Session expiry, logout and new-session handoff during pending read; no old user data, stale completion, duplicate toast or re-enabled control leaks.
- [ ] Rapid navigation, repeated click and refresh during draft/modal/disclosure; preserve relevant state and discard obsolete reads.
- [ ] Complete authorized economic journeys only in a disposable game: quote → review → confirm → immutable receipt → refreshed authoritative values; include expiry, rejection, replay/double-click and refresh-pending recovery. No production economic writes are authorized by this audit.

### Definition of done for the Player audit

Every route has recorded desktop/mobile visible state and exact build; key safe controls and navigation are exercised; unavailable/configuration states have explicit ownership; source candidates are either reproduced, disproved or retained as conditional; write flows are separately marked tested/blocked/not authorized. A source review plus earlier screenshots does not certify the full Player experience.


---

# Appendix C: security, transaction and test boundaries

# Econovaria: safety, transaction and release-boundary audit

Audit date: 2026-10-10, approximately 05:04–05:08 UTC.
Source: kohnerbouchard-star/Student-Profile, main a4dd2651d0ba964cce0cf28bf35f76975f35fd13, independently verified through GitHub branch metadata.
Method: read-only GitHub source, workflow/check metadata, and official language documentation. No repository modifications, credential reads, live mutations, financial operations or application test execution.

## Executive finding

The useful next step is to harden boundaries before moving more code: async HTTP dispatch/error handling; a single replay contract for commands; explicit recovery workflow state; and evidence linking source, database, Edge functions and frontend deployment. Existing transaction/authorization machinery is substantial and should be preserved rather than replaced wholesale.

Source findings below apply to the audited main commit. They are not proof that the same source is deployed. The coordinating audit independently found the public Vercel deployment at an older release/production commit (196b88e6dec9fc951ae0e690fe96057d67bf7bf5), 525 commits behind main. That is a separate deployed frontend fact, not proof of any current Edge-function or database version.

## Prioritized findings

### S1. Async MFA errors escape the HTTP error boundary
Priority: P1, confirmed source defect; deployed impact unverified.

[backend/supabase/functions/staff-mfa-api/index.ts:87–119](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/functions/staff-mfa-api/index.ts#L87-L119) returns handleStatus, handleEnroll, handleVerify and handleUnenroll without awaiting them inside try/catch. A rejection from those async functions escapes that catch. Verification deliberately throws MfaRequestError for invalid codes and failed challenge verification at [backend/supabase/functions/staff-mfa-api/index.ts:206–238](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/functions/staff-mfa-api/index.ts#L206-L238); these cannot reach the intended structured response mapping at lines 109–119 through normal routes. Recovery dispatch at lines 88–92 does await its handler, so it behaves differently.

The same ineffective wrapper pattern exists around login/status/logout/MFA/admin proxy dispatch in [backend/supabase/functions/web-session-api/index.ts:161–211](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/functions/web-session-api/index.ts#L161-L211). For example, a rejected network request from an awaited inner function can become an unhandled handler rejection instead of its intended safe error envelope.

This is availability/error-contract failure, not evidence of an auth bypass. The exact hosting-generated response requires runtime verification. [JavaScript await semantics](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await) explain why an awaited rejection is thrown into the surrounding async function.

Recommended boundary:
- Export an injectable HTTP handler factory; keep Deno.serve as a minimal composition root.
- Await async dispatch at the boundary, convert known domain failures once, and map unknown failures to safe 500 responses with a correlation ID.
- Preserve distinctions among invalid code, expired factor handle, session expiry, unavailable key/provider and throttling.
- Add tests invoking the real entry handler with rejecting dependencies: invalid code, expired handle, unknown fields, malformed JSON, listFactors failure, enrollment provider failure, network rejection and key/config failure.

Acceptance: every request resolves to a Response; expected 400/401/403/429/503 contracts survive all applicable proxy layers; no sensitive token or OTP is logged.

### S2. Recovery BFF masks malformed upstream responses
Priority: P2, confirmed source behavior and diagnostic weakness.

The specific affected BFF is api/password-reset.js, not every administrator proxy. [api/password-reset.js:206–239](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/api/password-reset.js#L206-L239) parses upstream MFA bytes at line 228 before checking upstream status. [api/password-reset.js:419–454](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/api/password-reset.js#L419-L454) does the same for approved system recovery at line 440. Plain-text/HTML/truncated upstream errors become parse exceptions and the outer catch returns generic password_reset_unavailable 502, [api/password-reset.js:198–202](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/api/password-reset.js#L198-L202).

This compounds S1 if the runtime returns a non-JSON failure. That end-to-end production chain is a hypothesis until matched request logs or a disposable integration reproduction exists.

The ordinary web-session MFA parser already handles JSON parsing without throwing: [backend/supabase/functions/web-session-api/index.ts:404–420](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/functions/web-session-api/index.ts#L404-L420) and [backend/supabase/functions/web-session-api/index.ts:885–890](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/functions/web-session-api/index.ts#L885-L890). Avoid claiming the same parser defect exists there.

Recommended boundary:
- Shared bounded upstream adapter returning a discriminated result: network failure, invalid body, valid upstream domain error, or validated success.
- Emit a safe explicit upstream_invalid_response classification; preserve appropriate retry hints/status semantics without returning raw provider bodies.
- Keep internal upstream status/content type, request ID and sanitized error classification in telemetry.
- Tests for non-JSON 401/429/500, empty body, invalid UTF-8, oversized response, and malformed successful response.

### S3. Arrival correction contains an ambiguous SQL reference
Priority: P1 investigation/correction candidate; high-confidence source issue under default PostgreSQL settings; production cause unproven.

[backend/supabase/migrations/20260721105000_bind_world_country_and_class_grants_v1.sql:366–386](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/migrations/20260721105000_bind_world_country_and_class_grants_v1.sql#L366-L386) declares a RETURNS TABLE output variable named revision. The same routine uses unqualified revision = revision + 1 at [backend/supabase/migrations/20260721105000_bind_world_country_and_class_grants_v1.sql:435–455](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/migrations/20260721105000_bind_world_country_and_class_grants_v1.sql#L435-L455). No per-function variable-conflict directive is present in that definition.

Under PostgreSQL's default variable_conflict=error, the RHS can refer to either the output variable or the table column. The official documentation states ambiguous references error by default and that some SQL errors are first detected when their statement is executed, explaining why migration creation alone may pass. [PostgreSQL PL/pgSQL implementation](https://www.postgresql.org/docs/current/plpgsql-implementation.html)

Recommended:
- Add a forward migration qualifying the UPDATE target alias and RHS column. Do not edit applied historical migrations.
- Execute the complete routine against a disposable database with the current migration chain and production-equivalent variable-conflict settings.
- Verify stale expectedRevision rejects, success increments exactly once and the audit row is written atomically.
- Record the deployed function definition/hash and actual SQLSTATE before attributing a reported live generic 400 to this defect.

### S4. Arrival correction's replay contract differs from the ledger contract
Priority: P2, confirmed source contract defect/risk.

[backend/supabase/migrations/20260721105000_bind_world_country_and_class_grants_v1.sql:418–445](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/migrations/20260721105000_bind_world_country_and_class_grants_v1.sql#L418-L445) looks up previous work by game_session_id + idempotency_key and immediately replays it. It does not compare the requested assignment, class, reason, actor or expected revision against the accepted command. It also reads the current assignment to form a replay response, rather than storing and replaying the original response.

Consequences:
- Reusing a key for a different correction can report an unrelated prior operation as successful.
- A later change to that assignment can alter the response returned for an old key.
- The initial lookup is before assignment locking; concurrent duplicate callers can both miss it, after which one can encounter a revision conflict rather than an identical replay. This race is inferred from statement ordering and needs a two-connection test.

This is unlike the stronger staff-ledger boundary: request hash comparison, row locking and saved response in [backend/supabase/migrations/20260719193000_add_idempotent_staff_ledger_adjustment_v1.sql:62–142](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/migrations/20260719193000_add_idempotent_staff_ledger_adjustment_v1.sql#L62-L142).

Recommended command contract:
- Define scope + canonical payload fingerprint + accepted result + retention policy.
- Claim/lock by command key before mutation, conflict on changed payload, replay the saved result after completion.
- Test sequential duplicate, concurrent duplicate, changed payload, same key in another game, response loss after commit and replay after later unrelated edits.
- Exclude server-generated transport timestamps from logical request identity unless explicitly part of the command contract.

### S5. World DB faults are misclassified as client errors
Priority: P2, confirmed source behavior.

[backend/supabase/functions/admin-api/worldRuntimeOperations.ts:654–674](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/functions/admin-api/worldRuntimeOperations.ts#L654-L674) handles revision conflicts and a few missing-schema SQLSTATEs, then maps every other DB error to generic HTTP 400/world_admin_operation_failed. An ambiguous-column SQLSTATE 42702 is not recognized. Infrastructure, privilege, constraint and unexpected server faults can therefore appear to be user mistakes, frustrating diagnosis and retry decisions.

At [backend/supabase/functions/admin-api/worldRuntimeOperations.ts:166–169](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/functions/admin-api/worldRuntimeOperations.ts#L166-L169), unexpected thrown errors are also treated as invalid request errors and their Error.message is forwarded. That is an inconsistent safe-error policy; actual sensitive disclosure was not established.

Recommended:
- Separate request validation errors, domain conflict/not-found errors and infrastructure/programmer failures.
- Preserve SQLSTATE internally; maintain an allowlist of public domain errors, generic safe 500/503 for unknown failures.
- Add classification tests for 42702, 42P01, 42501, 40001, 23505 and network failures; decide conflicts deliberately instead of treating all SQL constraints the same.

### S6. CI green does not establish a releasable or deployed version
Priority: P1 release-evidence/control gap, verified metadata.

On the exact main SHA, GitHub reports completed successful Backend Typecheck, Repository Quality, Admin API Check, Supply Chain, CodeQL and the Store database replay/race/browser jobs. Those are useful positive signals.

However, [Production Git Release run 37896872649](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/37896872649) succeeded with only its tokenless contract-validation job run; staging live parity, production live parity, parity enforcement and release branch publication were skipped. That is expected from the explicit manual authorization conditions at [.github/workflows/production-git-release.yml:74–80](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/.github/workflows/production-git-release.yml#L74-L80), [.github/workflows/production-git-release.yml:140–146](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/.github/workflows/production-git-release.yml#L140-L146), [.github/workflows/production-git-release.yml:187–190](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/.github/workflows/production-git-release.yml#L187-L190) and [.github/workflows/production-git-release.yml:259–262](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/.github/workflows/production-git-release.yml#L259-L262). It is not evidence that a deployment failed or that a production release happened.

The nine latest Vercel Git Production Verification dispatch runs visible for the SHA (04:10–04:36 UTC Oct 10) were skipped, including [run 38024633006](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/38024633006). Those runs also cannot prove release verification.

Repository control metadata returned main protected=false, required_status_checks enforcement off, and an empty repository ruleset list. Sources: [main branch metadata](https://api.github.com/repos/kohnerbouchard-star/Student-Profile/branches/main), [repository rulesets](https://api.github.com/repos/kohnerbouchard-star/Student-Profile/rulesets). This is a verified main-branch enforcement gap as of the audit, not a claim about GitHub environment approval settings or release/production protection (not inspected).

Recommended:
- Keep manual production authorization.
- Create an always-run, stable-name aggregate source qualification check and protect main against bypass; apply appropriately scoped protection to the release branch after checking existing settings.
- Publish one release manifest binding source SHA, schema/migration digest, Edge function inventory/source digests, runtime configuration identity and frontend deployment ID.
- Show source-qualified, parity-qualified, promoted and post-deploy-verified as separate states.
- Keep the audited older deployment distinct from current-main code defects until the actual deployed artifacts are compared.

### S7. Important boundary tests are mocks/source checks, so green is narrower than it looks
Priority: P2, confirmed test-design limitation.

- Staff MFA entry contract [backend/supabase/functions/staff-mfa-api/index.contract.test.ts:6–19](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/functions/staff-mfa-api/index.contract.test.ts#L6-L19) checks source string ordering for trusted-IP/session handling, not rejected promises at the entry handler.
- Admin MFA browser test fulfills API requests, including successful enrollment and verify: [scripts/admin-mfa-browser-smoke.mjs:111–123](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/scripts/admin-mfa-browser-smoke.mjs#L111-L123) and [scripts/admin-mfa-browser-smoke.mjs:195–233](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/scripts/admin-mfa-browser-smoke.mjs#L195-L233).
- Recovery browser test runs the real Node BFF but replaces upstream fetch with JSON fixtures, including bad-code 401: [scripts/password-recovery-mfa-browser.test.mjs:12–33](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/scripts/password-recovery-mfa-browser.test.mjs#L12-L33). It cannot expose a real Edge handler returning non-JSON on rejection.
- World correction test records RPC arguments; its fake RPC always succeeds: [backend/supabase/functions/admin-api/worldRuntimeOperations.test.ts:101–114](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/functions/admin-api/worldRuntimeOperations.test.ts#L101-L114) and [backend/supabase/functions/admin-api/worldRuntimeOperations.test.ts:134–143](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/functions/admin-api/worldRuntimeOperations.test.ts#L134-L143).
- The economic invariant file includes useful fixture behavior tests plus SQL source assertions: [backend/src/domains/economy/tests/economicMutationLedgerInvariant.test.ts:186–198](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/src/domains/economy/tests/economicMutationLedgerInvariant.test.ts#L186-L198).

Do not call the entire repo “untested”: [Store qualification run](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/37896872632) includes successful database replay, ordering races and two-game isolation jobs. The finding is that critical MFA and arrival failure boundaries need executable coverage alongside existing broader suites.

Recommended layered gates: pure unit tests; actual entry-handler component tests with dependency ports; disposable DB migration+RPC tests; multi-connection race tests; browser tests against disposable services; separately authorized production read-only verification.

### S8. Supply-chain controls are incomplete, not absent
Priority: P2, confirmed coverage gaps; no specific dependency vulnerability established.

Positive controls: npm lockfiles, frozen Deno lock flags, pinned runtime/tool versions, dependency review, source secret scanning, deterministic SBOMs and attestations exist. [Supply Chain Security run](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/37896872681) passed on the audited SHA.

Coverage gaps:
- SBOM generator covers only root and backend npm lockfiles: [scripts/generate-supply-chain-sbom.mjs:70–73](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/scripts/generate-supply-chain-sbom.mjs#L70-L73). It omits the separate player-terminal package and Deno remote-import dependency graph.
- Dependabot config only lists root npm, backend npm and GitHub Actions: [.github/dependabot.yml:1–48](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/.github/dependabot.yml#L1-L48); no player-terminal entry is present.
- Action-pinning regression test enumerates six workflows: [scripts/workflow-action-pinning.test.mjs:5–12](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/scripts/workflow-action-pinning.test.mjs#L5-L12). Other workflows, including Backend Typecheck, use mutable action tags: [.github/workflows/backend-typecheck.yml:57–77](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/.github/workflows/backend-typecheck.yml#L57-L77).

Recommended: inventory all package graphs; scan/attest Deno and player-terminal dependencies; derive action-pinning policy from all workflow files with explicitly reviewed exceptions; schedule full dependency rescans in addition to changed-dependency review. No CVE/advisory is asserted here and no clean-bill-of-health vulnerability assessment was performed.

### S9. Recovery is intentionally fail-closed but needs a clear resumability boundary
Priority: P2 architecture/operational risk, not a demonstrated security bypass.

Recovery spans SQL reservations, provider MFA enrollment, factor recording, handle generation, password updates, security version changes, provider metadata and completion. It is not one database transaction:
- Reservation precedes provider enrollment and factor recording: [backend/supabase/functions/staff-mfa-api/systemRecovery.ts:104–158](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/functions/staff-mfa-api/systemRecovery.ts#L104-L158).
- SQL explicitly makes reservations one-shot and requires operator reconciliation after interruption: [backend/supabase/migrations/20261005212732_system_account_recovery_v1.sql:157–172](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/migrations/20261005212732_system_account_recovery_v1.sql#L157-L172).
- Password-reset sequence exposes partial-state outcomes: [backend/supabase/functions/password-reset-api/index.ts:82–155](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/functions/password-reset-api/index.ts#L82-L155).

Preserve these safety properties. Do not “fix retries” by blindly repeating password/factor operations. Extract an explicit recovery state machine with typed provider ports, documented operator reconciliation and injected failure tests after every irreversible step. A factor can be created/recorded before handle generation or response delivery fails; that path must have an intentional supported recovery outcome.

Configuration concern: [backend/src/platform/supabase/edgeStaffSession.ts:566–581](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/src/platform/supabase/edgeStaffSession.ts#L566-L581) returns true for recovery access on projects outside the hardcoded two-project allowlist, defined at [backend/src/platform/supabase/edgeStaffSession.ts:600–602](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/src/platform/supabase/edgeStaffSession.ts#L600-L602). The current known staging/production projects are included. New environments would not automatically get that restriction check. Make supported environment/security mode explicit and validate it at startup/deploy, without silently changing legacy behavior.

### S10. Checkout “idempotency” is scoped to a single attempt, not a customer intent
Priority: P2 resilience improvement, confirmed source behavior.

[backend/supabase/functions/stripe-checkout-session/index.ts:383–404](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/functions/stripe-checkout-session/index.ts#L383-L404) generates a new random Stripe Idempotency-Key for each invocation and returns retryable after a timeout. A retry creates a distinct checkout request; the server cannot reconcile an unknown original outcome using a stable intent key.

This establishes possible duplicate checkout sessions, not proof of duplicate charges or duplicate license issuance. The fulfillment pipeline has separate stronger deduplication.

Recommended: establish an explicit purchase-intent identifier and bounded stable idempotency scope, persist/reconcile its checkout session, validate amount/product/market identity on replay and test timeout-after-provider-acceptance with a provider stub. Keep all qualification in test mode/disposable environments.

## Boundaries worth preserving

1. Staff authorization centralization: provider getUser validation, staff status/role, permission/security version checks, AAL gating and fail-closed rate limits are present in edgeStaffSession.ts. Refactor callers onto this authority rather than replicate checks in UI or each route.
2. Staff ledger adjustment: canonical payload fingerprint, transactional row lock, atomic ledger write and cached replay result. [backend/supabase/migrations/20260719193000_add_idempotent_staff_ledger_adjustment_v1.sql:62–201](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/migrations/20260719193000_add_idempotent_staff_ledger_adjustment_v1.sql#L62-L201). Preserve post-cutover provenance rules described in [backend/supabase/migrations/20260826101000_banking_staff_adjustment_compatibility_v1.sql:1–10](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/migrations/20260826101000_banking_staff_adjustment_compatibility_v1.sql#L1-L10).
3. Real-money license fulfillment: Stripe signature verification, paid-state/price/amount checks, authenticated internal ingress, durable enqueue, payment/event mismatch rejection, materialization leases and atomic outbox creation. [backend/supabase/functions/stripe-license-webhook/index.ts:125–148](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/functions/stripe-license-webhook/index.ts#L125-L148), [backend/supabase/functions/stripe-license-webhook/index.ts:550–585](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/functions/stripe-license-webhook/index.ts#L550-L585), [backend/supabase/functions/license-payment-webhook/index.ts:196–239](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/functions/license-payment-webhook/index.ts#L196-L239), [backend/supabase/migrations/20260813090000_add_durable_license_issuance_queue_v1.sql:318–365](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/migrations/20260813090000_add_durable_license_issuance_queue_v1.sql#L318-L365), [backend/supabase/migrations/20260813103100_add_atomic_license_materialization_outbox_v2.sql:280–309](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/migrations/20260813103100_add_atomic_license_materialization_outbox_v2.sql#L280-L309).
4. Keep simulated economic ledger transactions and real-money checkout/license fulfillment as separate domains with separate command/result contracts and provider adapters.

## Recommended sequence and exit criteria

### Phase A: establish release truth and repair failure semantics
Scope: S1–S3, S5–S7.
Deliverables: source/deployment inventory; deterministic handler tests; explicit upstream error adapter; disposable arrival RPC reproduction and forward migration if confirmed; actionable correlation IDs.
Exit: negative MFA/recovery flows resolve with stable typed errors; arrival correction succeeds/replays/rejects correctly in disposable DB; release dashboard cannot label skipped parity steps as deployment proof.

### Phase B: normalize command and workflow boundaries
Scope: S4, S9, S10; preserve existing ledger/outbox guarantees.
Deliverables: shared command identity policy; explicit recovery state machine; purchase-intent lifecycle; ownership for each irreversible effect.
Exit: simultaneous/repeated commands make exactly one accepted effect; changed payload conflicts; response-loss replay returns original result; operator recovery is documented and tested without blind re-execution.

### Phase C: enforce sustainable qualification
Scope: S6–S8.
Deliverables: protected aggregate checks; full dependency inventory/attestations; all-workflow pinning guard; disposable DB/handler/browser matrix; reproducible source→schema→Edge→frontend release manifest.
Exit: every merge and release identifies exactly what was checked, mocked, executed or skipped, with immutable evidence tied to the relevant SHA.

## Explicit limits

- No full suite, application runtime, DB function or financial transaction was run by this audit.
- Exact current production database definitions, Edge source and runtime settings were not inspected.
- Branch protection/ruleset metadata applies to main and the returned repository ruleset list at audit time; it does not establish all environment settings.
- Source-based race/ambiguity findings require disposable integration qualification. The supplied live generic World 400 is not by itself proof of its cause.
- No exploitable dependency advisory, account compromise, unauthorized balance mutation or auth bypass was demonstrated.



---

# Appendix D: existing REF tasks and PR ownership

# Econovaria roadmap and open-PR reconciliation

Read-only GitHub audit, 2026-10-10 05:04–05:09 UTC. No repository edits, test execution, workflow dispatch, merge, deployment, or live database access. Status below separates observed GitHub facts, checked-in evidence, and recommendations.

## Bottom line

Continue the existing modular-monolith and the existing REF program. There is considerable reusable implementation and qualification work; starting another refactor program would duplicate it. The main problems are unfinished integration, stale status summaries, a few real correctness gaps, and a release train deliberately held apart from source refactoring.

Main is still [`a4dd2651d0ba964cce0cf28bf35f76975f35fd13`](https://github.com/kohnerbouchard-star/Student-Profile/commit/a4dd2651d0ba964cce0cf28bf35f76975f35fd13), merged October 9 through PR878. The [current main backlog](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/docs/roadmaps/refactor-execution-v1/backlog.json) contains exactly 40 VERIFIED_COMPLETE, 2 BLOCKED, and 8 PLANNED primary tasks. This is a ledger count, not a percentage of application correctness, technical debt eliminated, or release readiness. Forty task entries were counted; this audit did not rerun their historical acceptance suites.

The repository currently has 18 open PRs. Six belong to the dependent Campaign qualification/fix stack, one is an already-superseded loan-isolation attempt, and several older integration/release/CSS PRs are conflicted. The open-PR count therefore exaggerates the number of independent active implementations.

## The ten unfinished REF tasks

| Task | Ledger | Actual current position | Next bounded outcome / dependency |
|---|---|---|---|
| REF015 Admin shim retirement | BLOCKED | Preparatory Settings and logout owner migrations are merged. PR861 is a failed caller-cutover experiment: reused-session/post-save CSS order changes, while tested rollback restores parity. Required compatibility URLs remain. | Resolve exact existing-owner stylesheet order, then baseline/candidate/rollback browser proof. Full removal needs separately accepted retirement criteria. Do not equate fewer requests with safe removal. |
| REF019 Player clock-in persistence | PLANNED | REF018 dependency is complete, but auth/throttle incident and ownership pause persists. | Accepted relevant auth baseline plus #668/#736 boundary resolution; then extract only Player-specific persistence, retain reward transaction and race/replay proof. |
| REF020 Staff-login persistence | PLANNED | REF005 is complete. Still explicitly gated on known-good auth and reconciled #668/#736 ownership. Recent recovery source merges do not resume it automatically. | Resolve auth/recovery acceptance, then one Auth repository seam preserving provider/auth/session ordering. |
| REF025 Business-bank/loan boundary | BLOCKED | Much more implemented than the task summary implies: currency-aware row/read/UI work, inert liability/submission foundations and numerous merged real-DB race children. PR859 is superseded, not the current execution blocker. | Finish scoped submission proof/disposition, then registered c3 repayment, c4 servicing/default attribution, c5 consistent offer/read/command integration and complete qualification. Keep creation gates until separately accepted activation. |
| REF027 Business compatibility containment | PLANNED | REF026 complete; waits on REF025. | Inventory existing legacy creation authority/callers, contain only needed translation, ratchet new usage. Evidence-only closeout is allowed if no source change is warranted; no SQL retirement by implication. |
| REF046 Campaign scheduler | PLANNED | Task label is stale relative to active work. Existing entrypoint is already thin. PR878 characterization merged; PR879–884 contain DB qualification, cleanup, lease proof, and correction of an actual stale-worker defect. | Integrate and accept existing stack after current-main reconciliation and decision on live-shaped rehearsal applicability; preserve old failure evidence. No new scheduler wrapper. |
| REF047 Historical archive/namespaces | PLANNED | Waits on REF003 and REF015. Mostly hygiene. | One proven historical family or documented already-archived disposition. Keep registered tests and useful history. |
| REF048 Classroom source retirement | PLANNED | Earlier route/config dependencies complete, but REF015 and retained external/client evidence remain. | Residual caller/config dossier; separate source-prepared, staging-verified, and production-retired states. Unknown clients mean retain. |
| REF049 Superseded hotfix workflow | PLANNED | Waits on REF045, REF046, REF048; release owners #730/#731/#735 remain active. | Prove canonical replacement and no required recovery caller before retiring exactly one workflow. Repetition in YAML alone is not deletion evidence. |
| REF050 Final reassessment | PLANNED | Depends on every REF001–049 and required children. Not presently eligible for full completion. | Exact-main source scorecard and remaining-debt register can report partial progress. Certification must separately identify repository, staging, and production evidence. |

Task definitions: [REF execution tasks](https://github.com/kohnerbouchard-star/Student-Profile/tree/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/docs/roadmaps/refactor-execution-v1/tasks).

Dependency paths that actually remain:

- REF015 → REF047 and REF048 → REF049 → REF050
- REF025 → REF027 → REF050
- REF046 + REF045 + REF048 → REF049
- Auth/ownership acceptance → REF019/020 → REF050
- REF032/033 are already complete, so do not restart the World/Story chain to begin REF046

These reflect the current backlog; accepting a changed completion scope belongs to the owner, not this audit.

## Important reconciliation details

### REF015: preserve work and fix the demonstrated order defect

[PR861](https://github.com/kohnerbouchard-star/Student-Profile/pull/861) remains draft at `7a11a11a707585402f0b0d40295899f36c2ec9d2`. Its own body says DO NOT MERGE: final-polish moves ahead of Attendance/Settings CSS in reused-session/post-save samples. Listener signatures match. Baseline, candidate, and isolated revert are recorded; rollback restores order, listeners, and requests. The 25-check Admin V2 journey passing does not override the explicit CSS parity failure. Pinned-browser qualification was not achieved locally; installed Chromium was supplementary.

The [representative-use/reversible-retirement amendment](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/docs/operations/evidence/refactor-execution-v1/REF-015/reversible-retirement-amendment.md) says the proposed 24-hour and seven-day terms are not elapsed evidence or automatic full-task approval. Eight caller migrations would still not establish safe old-URL deletion. Attendance's compatibility stub has no modern bootstrap request to remove and is explicitly retained. There is no reason to force this hygiene task ahead of an active staging incident.

### REF025: reuse merged loan proofs; do not restart the superseded attempt

[Current race record](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/docs/operations/evidence/refactor-execution-v1/REF-025/u5-c2-races.md) explicitly describes PR859 as superseded/unqualified. Replacement children cover disposable isolation/reset, submission, authority, eligibility, qualifying-income visibility, credit-profile/borrower lock chains, and canonical game-pause/submission races.

GitHub verifies [PR875](https://github.com/kohnerbouchard-star/Student-Profile/pull/875) merged as `c4e16e42b5850de9c5042949d421ad5eeb7b97b4` and [PR877](https://github.com/kohnerbouchard-star/Student-Profile/pull/877) merged as `b48476c1a8a49ad626a7de50a777062256669916`, despite append-only evidence retaining prior pending-review sentences. Their source evidence reports actual disposable lock identity/race and cleanup proof. It expressly does not qualify the entire legacy repayment/servicing lock graph, whole lifecycle/FX graph, or nonempty-session revocation.

The [existing continuation design](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/docs/operations/evidence/refactor-execution-v1/REF-025/u5-forward-change-design.md) already registers c3 repayment, c4 servicing/default attribution, and c5 complete authority/qualification/activation. This is a feature-readiness gate for business lending; it need not block unrelated cleanup or safe operation of disabled lending.

### REF046: a real bug found, with an existing qualified source fix

[PR883](https://github.com/kohnerbouchard-star/Student-Profile/pull/883) reproduces stale A failing B's reclaimed command; B persists a destination effect but reports a completion after its completion RPC returns false. This is a real disposable runtime defect, not a theoretical architectural concern.

[PR884](https://github.com/kohnerbouchard-star/Student-Profile/pull/884) at `a9a532be4deb884aa864c9489b7d174e8f33f167` fences acknowledgements by command/attempt generation and preserves destination idempotency. Current exact-head GitHub check API independently confirms 84 completed checks: 79 success, five skipped, zero failure. [Campaign job](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/37891984279/job/113696057116) and [Database Replay job](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/37891984339/job/113694727432) succeeded. The [live-shaped rehearsal job](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/37891984339/job/113696243435) is skipped, not passed. It remains explicitly held by U1 and bound to merged main; restoring it is a separate release decision.

The stack is #879 registration → #880 event harness → #881 cleanup registration → #882 accepted disposable cleanup → #883 lease defect proof → #884 fix. Their shared paths are intentional stacked dependencies, not six independent competing owners. Main has only #878 characterization. Preserve accepted harness/fix work and reconcile the stack rather than rebuilding it.

## Open PR map and ownership

All 16 human-authored open PRs are by `kohnerbouchard-star`; #620/#857 are Dependabot. No open PR has an assignee. [.github/CODEOWNERS](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/.github/CODEOWNERS) defaults every path and critical boundaries to `@kohnerbouchard-star`. Thus operational ownership is carried by registered branches/scopes, not distinct assignees.

| PRs | Existing lane | Audit position |
|---|---|---|
| [885](https://github.com/kohnerbouchard-star/Student-Profile/pull/885) | Current staging provisioning incident | Six implemented paths, 388 additions at `9fa9ee70`; body still describes preregistration. Evidence records staging purchase-code failures in economic-core service claim handling. Qualification and suffix-owner reconciliation remain. |
| [879](https://github.com/kohnerbouchard-star/Student-Profile/pull/879)–[884](https://github.com/kohnerbouchard-star/Student-Profile/pull/884) | REF046 | Preserve dependent stack; newest source proof is #884, not #880 teardown failure or #883 unfixed defect. |
| [861](https://github.com/kohnerbouchard-star/Student-Profile/pull/861) | REF015 | Explicit CSS-order parity stop. |
| [859](https://github.com/kohnerbouchard-star/Student-Profile/pull/859) | Old REF025 clone-isolation attempt | Superseded by merged proof children; retain failure history, consider closure only through owner disposition. |
| [736](https://github.com/kohnerbouchard-star/Student-Profile/pull/736) | Player service-role binding | Source candidate remains open. GitHub says clean, but old CI/source and historical incident text do not establish current runtime success. |
| [735](https://github.com/kohnerbouchard-star/Student-Profile/pull/735) | Canonical production origin/release requests | Merge-conflicted. Merging release-request path can trigger release; must coordinate after applicable auth fixes and release approval. |
| [731](https://github.com/kohnerbouchard-star/Student-Profile/pull/731) | Phase15 certification controls | Merge-conflicted, 35 paths; preserves recovery, provenance, exact-load, advisor and runtime gates. Must preserve later U1 holds. |
| [730](https://github.com/kohnerbouchard-star/Student-Profile/pull/730) | Earlier Phase15 continuation | Actual current diff is only three temporary helper workflows. Its narrative is not evidence that final repair is implemented. Reconcile with #731 rather than create a third release owner. |
| [668](https://github.com/kohnerbouchard-star/Student-Profile/pull/668) | Multi-game context and global beta ledger | Merge-conflicted. Owns shared Staff/Admin context, backend package, inventory and ledger. Refactor work must preserve this integration boundary. |
| [624](https://github.com/kohnerbouchard-star/Student-Profile/pull/624) | Player CSS/disclosures/realtime | Merge-conflicted. Rebase/integrate selectively with merged REF042 freshness ownership; do not reintroduce reference/timer workaround. |
| [690](https://github.com/kohnerbouchard-star/Student-Profile/pull/690) | Living World/DELIGHT planning | Separate optional future product program, 70 planned milestones; not a stabilization prerequisite. |
| [620](https://github.com/kohnerbouchard-star/Student-Profile/pull/620), [857](https://github.com/kohnerbouchard-star/Student-Profile/pull/857) | Routine Actions/root dependencies | #620 is conflicted across 137 workflow files; versions/pins require coordinated integration. Maintenance unless a separately established security requirement makes one urgent. |

Observed conflict states were read at 05:06 UTC; they can change. A clean merge state is not acceptance or permission.

### Actual shared-file coordination

- #668/#736/#884 all change the generated architecture inventory. Regenerate after integration; do not choose one stale generated snapshot.
- #668/#735 both change the global beta roadmap. That ledger requires a single reconciled writer.
- #620 overlaps #731 in six release/replay workflows, #735 in seven production web-session workflows, #624 in its release workflow, and REF046 in qualification workflows. Separate pin ownership from job/gate ownership.
- #884 and #885 currently have no changed-file collision, but #885 explicitly needs the same Phase15 suffix registry that #884 amends. This is a semantic/migration-release dependency missed by a filename-only census.
- #730's present helper-workflow diff has no direct file overlap with #731; they still share certification/control purpose and must not become parallel competing release implementations.

## Stale record corrections and residual source risk

1. The REF README still says PLANNED and uses September 22 main, while backlog.json says IN_PROGRESS and counts 40 verified task entries. Read per-task latest closeout plus GitHub merge state, not the introductory snapshot.
2. Global beta Scope Intake still contains draft/unmerged statements for #863/#876. GitHub confirms #862 merged `8f5ca008`, #863 merged `1de01562`, and #876 merged `a6c00b0d`. These source merges do not prove hosted recovery readiness or authorize REF019/020 resumption.
3. [Issue677](https://github.com/kohnerbouchard-star/Student-Profile/issues/677)'s original 21-versus-20 ledger and eleven-routine-drift counts are historical. The [REF032 latest closeout](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/docs/operations/evidence/refactor-execution-v1/REF-032/preflight.md) records later successful schema-shaped staging and historical production disposable rehearsals, with `releaseCertificate:false`, no populated-data/live-runtime certification, and nine U1 holds intact. Reconcile this as outstanding release alignment/evidence, not an unchanged fresh eleven-drift incident.
4. [Issue755](https://github.com/kohnerbouchard-star/Student-Profile/issues/755) remains a source-supported unresolved password-reset RPC risk. Main [security-state migration](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/migrations/20260726091000_add_staff_security_state_v2.sql) defines permission_version INTEGER; [transition migration](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/backend/supabase/migrations/20260726096000_add_staff_password_reset_security_transition_v2.sql) returns the uncast column under a BIGINT result contract. GitHub code search found no replacement definition or column alteration. The [REF010 harness lines247–252](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/scripts/ref-010-access-reset-acceptance.ts#L247-L252) explicitly tests the Admin stale-generation guard by direct disposable increment, avoiding the unrelated password-reset RPC. Therefore REF010 completion does not establish this RPC is repaired. The newer system-recovery migration calls it; its DB unit fixture stubs a reduced transition. Require full-replay actual-RPC/handler evidence before recovery rollout. This is not a newly observed production failure; this audit ran no database test.
5. REF040 is verified only for the approved U6a interim outcome: isolated retained calculation family plus accepted handoff. Its [closeout](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/docs/operations/evidence/refactor-execution-v1/REF-040/u6a-closeout.md) explicitly says original production public consumers remain undelivered under EXP-MKT011–016. Do not describe it as complete financial-market integration or reopen retention work.

## Recommended order: release alignment and refactoring are separate

**Immediate next task is existing PR885's suffix-registration integration, not another implementation PR.** At exact head `9fa9ee70d69926f5c99b260f68dbc7d3b892fd3e`, GitHub reports 57 terminal checks: 49 success, seven skipped, one failed. [Database Replay job114132677723](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/38024614077/job/114132677723) fails four registry tests with `Unapproved or missing post-bundle suffix` naming `20261010040738_economic_core_request_claims_v1.sql`, before actual replay. The existing six-path scope explicitly excludes the two shared registry files. The current owner therefore needs a bounded approved scope amendment coordinating with PR884's ninth suffix identity, preserving all earlier identities and immutable-bundle/digest/negative guards, followed by exact-head requalification. Repeating the failed job without that correction cannot resolve the cause; restoring release holds is unrelated and remains separately controlled.

1. **Stabilize proven active failures.** Finish the existing #885 staging game-creation repair with actual service-context, canonical provisioning/replay/rollback proof. Preserve the #884 Campaign correction and make its source-acceptance/rehearsal decision explicitly. Investigate/qualify #755 before relying on password-reset recovery. These have concrete user/correctness impact.
2. **Reconcile one release train.** Reconcile #730/#731/#735/#736 and existing main holds against the exact deployment target and accumulated suffix migrations. Reuse existing recovery/provenance/economic/auth gates. Source CI is not deployed acceptance. The coordinating audit separately verified canonical domains at deployment commit `196b88e6`, with main 525 commits ahead; use its live verification sources when assembling the final report. No instruction in this audit authorizes releasing that gap or restoring holds.
3. **Integrate existing structural owners.** Resolve #668 context integration and #624 Player CSS with current main and accepted REF042 ownership. Do not rebuild these modules or indiscriminately merge donor branches. Reconcile global status records as part of their existing owner path.
4. **Finish the two bounded substantive refactor branches.** REF025's remaining business liability/lifecycle qualification and REF015's exact stylesheet-order caller correction can proceed independently only where paths/authority are disjoint. Resume REF019/020 only after their explicit auth gates. Keep lending disabled pending its own criteria.
5. **Do reversible hygiene last.** REF027/047/048/049 should use reachability, real consumer, replacement and rollback evidence. Preserve compatibility where unknown. They are formal REF completion dependencies but generally are not themselves proof of an urgent product defect.
6. **Certify exact scope.** REF050 reports completed seams, retained compatibility, inspected/uninspected modules, remaining feature handoffs, exact test identities and separate source/staging/production outcomes. No deletion target, invented completion percentage, or 9/10 architecture score.

The existing [execution README](https://github.com/kohnerbouchard-star/Student-Profile/blob/a4dd2651d0ba964cce0cf28bf35f76975f35fd13/docs/roadmaps/refactor-execution-v1/README.md) already specifies the correct target: modular monolith, same-origin BFFs, domain services, transactional database authorities, bounded seams, and verification-only disposition when a seam is already clean. That is reusable direction, not a need for another architecture.
