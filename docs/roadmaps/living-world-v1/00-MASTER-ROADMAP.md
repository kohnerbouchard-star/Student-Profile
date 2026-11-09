# Econovaria — Living World Detailed Roadmaps

**Program:** `ECON-LIVING-WORLD-ROADMAP-V1` · **Version:** `1.0.0-planning` · **Date:** 2026-09-20

**Repository:** `kohnerbouchard-star/Student-Profile` · **Baseline main:** `22dc9ce5023eb200a6608d5bb90a9ac30cb36c90`

**Seven product tracks · 56 feature milestones · 4 shared foundation milestones · 2 integration gates · 62 total milestones**

The plan prioritizes an everyday player economy, causal World response, meaningful relationships and coherent UX. Advanced markets and Analyst gameplay run as a staged expansion, not a prerequisite for the first useful Life release.

## Contents

Shared foundation and scope control; Player Life Economy; Macroeconomy V2; Characters and Relationships V2; One-Year World; Advanced Markets and Analyst; Progression and Credentials; Player Identity and UX; Integration gates; dependency manifest and source register.

## How to use this program

This is a proposed execution-ready roadmap, not a change to the repository’s authoritative controller files. All 62 milestones are PLANNED. No code, pull request, issue, migration, live database, scheduler, secret, deployment or production setting was changed while preparing this pack. Repository facts are pinned to the recorded source; actual implementation must resolve the live baseline again.

The program deliberately retains the existing Phase 15 deployment/convergence work. Planning, isolated experiments and source work may proceed under scoped approval, but release-bound shared files must not drift underneath an exact-SHA release certificate. Coordinate branch ownership and merge order; do not merge all seven tracks simultaneously. The recommended work-in-progress limit is two implementation owners plus read-only design/test work, with one integration owner serializing shared changes.

The roadmap is dependency-based, not a promise of completion dates. Relative size S means a bounded audit or small contract change; M means a focused feature slice; L means a cross-domain lifecycle with database/browser evidence. These labels are not estimates of engineering days. A milestone may require several reviewable PRs; it is not automatically one enormous PR.

### Corrections carried forward from the prior audit

Character replies are not missing. PR #643 already added a durable intent/topic-aware reply pipeline with relationship memory and operational controls. REL extends this implementation. Likewise, export, Market search and chart-range actions have installed handlers. UX audits and improves their actual semantics, coverage and precision rather than rewriting them as nonexistent features. The macro migration demonstrates a simple mechanism but is not alone proof of every current live writer. Historical roadmap statuses are preserved as history, not treated as fresh runtime evidence. Sources: R1–R5.

## Product contract and proposed defaults

The player remains an individual building a life inside the fictional economy, not a ruler who unilaterally starts or ends wars. Business V2 is reused, not reopened. Markets provide opportunities but are not mandatory for basic livelihood. The main loop is arrive, earn, choose, build resilience, pursue goals, respond to change and develop an identity. Administrative convenience never justifies arbitrary direct money or Inventory edits.

The following are proposed defaults to freeze in FND-01/LIFE-01 before implementation, not newly approved mechanics:

| Decision | Proposed starting policy | Review boundary |
|---|---|---|
| Player employment | One primary job and a bounded side-work commitment | Explicit capacity policy; no login-hour surveillance |
| New NPC pay cadence | Weekly pay is a useful first pilot candidate | Preserve existing Business payroll cadence and signed terms |
| Housing/bills | Monthly invoicing with explicit proration/period rules | No hidden charges or retroactive liability |
| Bill collection | Manual payment first; capped opt-in autopay later | No forced loan, hidden overdraft or automatic asset seizure |
| Distress | Grace, funded aid, temporary housing and retraining before stronger consequences | No permanent gameplay lockout; outages/approved pauses handled distinctly |
| NPC responses | Deterministic intent/context engine and authored wording first | Generative wording optional, unprivileged and independently evaluated |
| Skill benefit | Access, information, credentials and choices | No guaranteed profit or course-grade manipulation |
| Limit orders | Prefunded listing-currency Checking holds initially | Existing immediate split funding and FX remain unchanged |
| Assets | Small fixed-rate bond/fund/reference subset | No automatic activation of the full library or excluded derivatives |
| Profile/publicity | Earned identity, privacy-first public projection | No public private finances, grades, messages or distress status |
| World workload | Few consequential choices with optional breadth | Coverage/saturation thresholds are calibrated, not arbitrary facts |
| Content change | New versions and future effective dates | Historical choices, agreements and receipts remain readable |

## Canonical state ownership

Money remains in canonical bank accounts and the ledger. A budget is a plan, not a new wallet; an unpaid wage is an obligation, not posted cash. Inventory, quantities and reservations remain with Inventory/custody owners. Business keeps its legal entity, payroll and common-share authority. FX keeps the daily fixing, historical values and quotes; no feature computes an alternative trusted rate. World owns location, routes, travel and residency. Story/relationships owns narrative facts and consequences; Messaging transports and moderates messages. Progression owns verified awards and qualifications, and receiving domains independently authorize use.

New record names in the track sections are conceptual candidates. The implementation inventory decides whether to reuse a table, extend an existing public contract or add a genuinely missing record. Do not create one new domain per screen. Personal employment and living costs may justify bounded ownership modules, but not microservices or a second database.

## The concurrency and consequence contract

Atomic settlement includes all required money, hold, custody, obligation and receipt changes within the existing transaction authority. No notification, NPC reply, analytics update or XP projection may be used as proof that a payment occurred. Those consequences follow through the established outbox/ingress with source identity and deduplication. The worker can deliver at least once; the domain effect must be idempotent. Do not claim globally exactly-once message delivery.

Each command uses authenticated server-derived scope, public object handles, expected source version and stable idempotency identity. Committed-success replay returns the same result even after a later pause where the domain contract permits replay. Conflicting use of an idempotency key is rejected. Locks and isolation must be chosen per invariant, with bounded whole-transaction retries for deadlock/serialization failures where required. Do not globally change the database isolation level as a substitute for understanding invariants. Technical reference: E1.

The first integration contract needs source event ID, source domain, aggregate/version, scope, effective time, causal linkage, policy version and public receipt reference. It does not need a new generic orchestration platform.

## Time and economic causality

Retain the existing IANA game timezone and 08:00 daily FX boundary. Define effective time independently of the worker’s eventual processing time. Different subsystems have legitimate different cadence: market-open ticks, daily macro publication, payroll periods, monthly costs and immediate messages. One calendar authority does not mean one universal tick for everything.

Use prior completed FX evidence to value trade observations; build the next complete macro batch from an explicit cutoff; let the next fixing consume that eligible batch. This avoids a circular same-boundary relationship in which an FX result depends on trade valued using that same uncomputed FX result. Late data creates a future version or explicit correction, not a rewrite of settled money. A missing country keeps the prior published complete state with an explanation.

Distinguish individual inactivity, a planned game pause, an application outage and an ended game. Already-earned wages remain owed. A pause must not create an unreviewed month of surprise penalties. Optional stale news is summarized; committed obligations are not deleted to make a catch-up report look clean. FND-02 documents the policy for each subsystem.

## Delivery sequence and parallel work

**Wave A — Verify and repair the baseline.** Complete FND-01 through FND-04, then begin LIFE-01/02, REL-01/02, UX-01/02 and MAC-01/02. Read-only policy/content design can run in parallel. UI correctness repairs should not wait until the whole world engine is complete.

**Wave B — Make everyday life playable.** Complete wages, bills, housing, practical eligibility and the integrated overview. Add a small authored relationship/recurrence slice. Run PILOT-01 on the existing approved macro/world authority while the new macro model remains a prototype/shadow source.

**Wave C — Make the world respond.** Integrate causal labor/prices/trade, deepen relationship actions and arcs, add absence recovery and educator pacing, then publish a guarded macro cutover only after shadow evidence and source contracts pass.

**Wave D — Add research and advanced capital.** Analyst commitments can begin after CAP-02 using existing stocks. Limit orders, bonds and funds follow their own custody, settlement and valuation gates. They do not block the first useful Life release.

**Wave E — Prove long-term depth.** Complete retraining, balanced progression, accessibility/usability closure and 365-day synthetic continuity. SYSTEM-01 reconciles all track completion evidence and hands off to the separately authorized runtime/release program.

An early product release may contain the first certified vertical slice. It must not be described as completion of all seven tracks. Conversely, an optional generative wording layer, derivatives, mortgages and free-form attachment support do not block completion because they are explicitly excluded.

## First integrated scenario: Arrival to resilience

Use synthetic players in two contrasting existing countries. Start with a finite job board and housing supply. Player A accepts a job, receives a canonical payday receipt, signs a tenancy, sees the next bills and pays one. Player B competes for the same scarce vacancy or room and receives a coherent alternative rather than a race-condition failure. A known route disruption affects an eligible cost/offer under the active approved model. A character remembers the player’s prior choice, offers information and surfaces a real next step. Player A completes evidence for a practical credential and can see the newly eligible action. A returning player receives a summary and a viable recovery path.

Replay with a lost payment response, a restarted worker, insufficient employer funds, a closed route, a paused game and a second game with overlapping public display names. Compare final ledger, holds, housing capacity, employment agreement, bill, message and progression evidence. Simulating four weeks is a scenario scope, not a promise that implementation will take four weeks.

## Standard acceptance gate for every implementation milestone

**Authority and scope.** Correct Player/Admin authentication and permissions; game/player isolation; no browser-selected owner UUID; safe errors; no private identifiers/secrets in logs, HTML, URLs, screenshots or artifacts. Check source and receiving-domain permission separately.

**Persistence.** Forward-only migrations from the actual current predecessor; no hand-invented timestamp reservations; two blank-database replays and rebuilt-schema checks when applicable; populated upgrade/backfill fixtures; explicit treatment of legacy records and active agreements. A new feature must not silently bill historical periods before activation.

**Economic correctness.** Exact currency/minor-unit arithmetic; canonical posted/held/available balances; custody/slot conservation; rollback after every posting boundary; replay/conflict and true race tests. Test wrong currency, stale quote, wrong scope, unavailable service and insufficient funds. A halted UI is not proof of server enforcement.

**Experience.** Connected Player and Admin journeys; loading, empty, blocked, partial, stale, failed and committed-but-refreshing states; draft preservation; keyboard and mobile behavior; truthful receipts and consequences. Fixture tests must be labelled as fixtures, not live runtime proof.

**Balance and content.** Every numerical threshold is documented as existing policy, proposed calibration or observed result. Preserve failed seeds, data coverage and input versions. Do not call a prose scenario a simulation run. No gameplay reward automatically determines a real academic grade.

**Operations.** Bounded worker work, deduplication, safe kill switch where necessary, dead-letter/recovery visibility, content retirement and a forward recovery path. A disabled feature cannot strand already-posted money or mandatory releases of held assets.

**Evidence.** Record source SHA, test command/run identity, environment, fixture seed, policy/content versions, result, artifact digest and limitations. Track repository implementation, merge, staging and production evidence separately. Do not mark VERIFIED_COMPLETE because a roadmap checkbox or a documentation-only commit exists.

## Migration, rollout and recovery policy

Introduce new features dormant and capability-gated where appropriate. Preview populated migrations and default policies in synthetic data before enabling them. Do not create retroactive jobs, leases, wages, bills or credentials for an existing player without an explicit mapping/consent policy. Preserve existing public IDs, history, immutable receipts and prior-model labels.

Use shadow calculation for macro changes and a small per-game pilot for new Life/content functionality. For long-lived agreements, stop new issuance first when a problem occurs while preserving required settlement, cancellation, refund and hold-release paths. Reverse a payment only through an authorized compensating transaction; reverse a narrative statement through a correction/supersession record. Never roll back economic history by deploying an older schema blindly.

The final runtime gate verifies the actual deployed version and behavior in an authorized environment. It does not infer deployment from GitHub merge. All Phase 15 restrictions and release controls remain in force.

## Evidence and success measures

Use existing classroom-load profiles for regression; any higher-load stress target is explicitly new and separately approved. Establish p95 latency, query count, worker backlog and storage-growth baselines before setting budgets. Do not increase budgets simply to pass a failing test.

Product measures include time to first legitimate income, comprehension of a payslip/bill, ability to compare housing, reachable recovery, quality of character follow-through, useful weekly choices, pathway diversity, analyst reflection and returning-player comprehension. Economic measures include duplicate-payment count, reconciliation differences, stale publication, unfunded obligations, price/output volatility and inequality of access across calibrated starts. Privacy, correctness and irreversible-loss defects are hard gates; adoption percentages are pilot observations, not invented guarantees.

## Risk register and stop conditions

| Risk | Early indicator | Prevention / stop condition |
|---|---|---|
| Duplicate economic authority | Another wallet, payroll writer, share table or FX calculator appears | Stop implementation until ownership is reconciled |
| Scope explosion | Seven large branches edit shared API/manifest files | Limit concurrent owners; merge verified vertical slices |
| Unfair personal economy | Some starting states cannot earn or recover | Block activation and recalibrate before charging bills |
| Macro instability | Oscillation, clipped extremes or unexplained output | Keep shadow; preserve inputs and failing seeds |
| Double-counted shocks | One event directly and indirectly applies the same delta | Canonical cause and consumer deduplication |
| NPC fabrication | Reply claims nonexistent offer, payment or future event | Verified facts, proposal revalidation, deterministic fallback |
| Reward farming | Repetitive low-value actions dominate progress | Verified outcomes, source uniqueness and calibrated caps |
| Advanced-order lockup | Cancelled/expired orders retain funds or custody | Block product release until lifecycle reconciliation passes |
| Historical corruption | New policies change old agreements/receipts | Prospective effective dates and forward corrections |
| Attention overload | Returning player faces repeated modals or hundreds of tasks | Saturation budgets, grouping and catch-up summary |
| Evidence inflation | Source checks reported as browser/live certification | Separate evidence types and exact-source manifests |

## PR-sized work package template

Each implementation owner should create a bounded scope note before code: milestone ID; current main/base and existing owner; user-visible outcome; reused domain contracts; exact paths; migration requirement; proposed public interface; idempotency/locking; event and read-model effects; Player/Admin acceptance; negative/race/rollback cases; content/balance fixtures; compatibility/backfill; operational recovery; documentation/evidence outputs; and explicitly excluded work.

Split large milestones into independently reviewable slices: contract and pure calculation; persistence and authority; Player/Admin publication; connected acceptance; then documentation/handoff. Do not merge a half-lifecycle that permits creating a commitment but cannot safely settle, cancel or expire it. Candidate branch names should follow the repository’s current policy and be created from a freshly verified predecessor; this pack reserves no branch, PR number or migration version.



---

# FND — Shared foundation and scope control

Status: **PLANNED** · Baseline: `22dc9ce5023eb200a6608d5bb90a9ac30cb36c90` · Planning date: 2026-09-20

## Intended result

Make seven product improvements composable without starting another platform rewrite.

## Verified starting point and limits

Planning baseline is main at the recorded SHA, freshly resolved through GitHub on the planning date. No live runtime, migration, deployment, or performance certification was performed for this roadmap. The previous audit overstated two gaps: PR #643 already provides intent/topic-aware character replies and relationship memory; installed local-control handlers already implement export, Market search, and chart-range changes.

## Ownership and integration boundaries

Retain the modular monolith, existing authenticated Player/Admin boundaries, canonical Banking/FX, Inventory, Contracts, Market, Business, World, Story, Messaging and Progression owners. This is a coordination layer, not a new service, database, event bus or universal workflow interpreter.

## Candidate records and interfaces

An evidence-backed ownership map; versioned clock policy; an integration contract; a fixture registry; an explicit source/implementation/merge/runtime evidence manifest. These are mostly documents and adapters, not necessarily new tables.

Existing domain commands remain the only economic writers. New interfaces in this pack are candidate semantic names; exact route and table names require FND-01 collision review.

## Content and fixture scope

Use synthetic identities and deterministic fixtures. Never copy actual student messages, real household data, credentials, or production records into development evidence.

## Explicit exclusions

No repository write, pull request, merge, migration execution, scheduler change, secret change or deployment is authorized by creation of this planning pack. Phase 15 remains a separate release program.

## Milestones

### FND-01 — Reconcile the live baseline and assign one owner per capability

**Dependencies:** None. **Relative size:** S. **Status:** PLANNED.

**Implementation scope.** Resolve main and the authoritative roadmap/checkpoint again at implementation time. Inventory live code paths, migrations, public contracts, existing branches and open PRs for every affected feature. Follow capture-phase handlers and installed modules rather than treating fallback strings as executed behavior. Classify each proposed item as reuse, extend, new, or remove. Reconcile the existing EXP-MKT authority rather than creating a competing market roadmap. Record all shared-file owners and the source SHA.

**Player and Admin experience.** Review existing Player routes, Admin permissions and capability publication together. Produce an as-is/to-be matrix with user-visible gaps and a concrete reproduction where a defect is claimed. Keep unsupported attachments separate from broken functionality.

**Acceptance and adversarial tests.** Every new table/route proposal has a searched existing equivalent; every claimed bug has a source trace or reproducible case; no open PR ownership conflict is unresolved; all seven tracks have a named engineering owner and product reviewer.

**Exit gate.** A reviewed scope and ownership manifest exists. The rest of the milestones remain PLANNED, and no implementation is described as complete.

### FND-02 — Define time, pause, absence and effective-date semantics

**Dependencies:** `FND-01`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Use the existing game IANA timezone; do not introduce a second clock authority. Define UTC storage, local display, effectiveAt, occurredAt, publishedAt, dueAt and economic-period keys. Preserve the daily 08:00 FX fixing and exchange-specific trading calendars. Specify how wages, rent, loans, story deadlines and training behave on pause/resume, weekends, school breaks and outages. Distinguish pausing a game from an individual not logging in. Document deterministic same-boundary ordering and late-input treatment.

**Player and Admin experience.** Players see local due dates, coverage periods and what continues while absent. Admin can preview the effect of a proposed calendar/pause setting before it affects unopened periods. A setting change never silently rewrites existing agreements.

**Acceptance and adversarial tests.** Exercise daylight-saving transitions, leap day, month-end, midnight and 07:59:59/08:00 boundaries; a 7/14/30-day absence; paused versus unavailable service; delayed execution. Already-earned money remains owed; paused intervals do not become surprise bill backlogs.

**Exit gate.** One clock-policy contract is approved and consumed by new features, with no change to already-certified FX behavior.

### FND-03 — Create the shared acceptance harness without replacing CI

**Dependencies:** `FND-01`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Extend existing tests with synthetic game/player factories, canonical account and Inventory setup commands, a controllable test clock and event trace collection. Establish unit, database, connected-browser, adversarial, economic-simulation and accessibility layers. Persist random seeds and policy/content versions. Use failure injection at actual commit boundaries. Keep a compact source-to-user-action coverage manifest; do not substitute string-search tests for database or browser outcomes.

**Player and Admin experience.** A review report separates engineering correctness, economic calibration and usability. Admin-facing diagnostics use public operation identifiers; internal trace details remain restricted. The same scenario can be rerun without production credentials.

**Acceptance and adversarial tests.** The harness proves replay, divergent-key rejection, cross-game denial, stale-state recovery, genuine simultaneous writes and post-commit lost-response recovery. Two fresh migration replays and rebuilt-schema checks remain required for schema work. Bound deadlock/serialization retries rather than claiming transactions cannot fail.

**Exit gate.** A deterministic fixture and evidence format is available to all tracks; no existing required gate or architecture ceiling is weakened.

### FND-04 — Agree minimal cross-domain consequence and access contracts

**Dependencies:** `FND-02`, `FND-03`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Specify a small versioned event envelope: event ID, aggregate/version, source owner, server-derived scope, effective time, causation/correlation, policy version and public receipt reference. Reuse the durable outbox and consumer deduplication facilities already present, extending only demonstrated gaps. Distinguish an atomic money/ownership transaction from asynchronous news, relationship and progression consequences. Define a read-only access-decision interface with eligibility, missing requirements and denial reasons; the receiving domain still authorizes the action.

**Player and Admin experience.** All material actions follow inspect, review, confirm, receipt and consequence. Display committed-but-refreshing and delayed consequence states accurately. No generic success toast may imply that an asynchronous reward or NPC reply has already completed.

**Acceptance and adversarial tests.** An at-least-once delivery creates one business effect; conflicting payloads cannot reuse a source ID; projection failure cannot reverse a successful payment; replay after pause returns the original receipt without issuing a new benefit. Unauthorized domains cannot emit trusted award events.

**Exit gate.** Only the interfaces needed by the first vertical slice are adopted. There is no parallel balance, scheduler, XP ledger, relationship store or business authority.

## Source basis

**R1 — Fresh main branch resolution.** Resolved on 2026-09-20 to 22dc9ce5023eb200a6608d5bb90a9ac30cb36c90; not a runtime certification. Source: `https://api.github.com/repos/kohnerbouchard-star/Student-Profile/branches/main`.

**R2 — Merged PR #643 — durable story-character reply engine.** Merged 2026-08-18. Metadata describes existing intent/topic classification, memory, queue, coalescing, retry and kill switch. Historical staging claims were not rerun for this plan. Source: `https://github.com/kohnerbouchard-star/Student-Profile/pull/643`.

**R3 — Installed local-controls implementation.** Export, local Market search and range handler; range limits currently expressed as sample counts; CSV amount conversion uses Number. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/player-terminal/src/features/local-controls/local-controls-flow.js`.

**R4 — Player entrypoint wiring.** Imports and installs installLocalControlsFlow; verified by current-main search excerpts. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/player-terminal/src/main.js`.

**R9 — Canonical FX authority scope.** Single currency/fixing authority, 08:00 game-local cadence, immutable provenance and pause rules. Historical PR labels are not current merge status. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/docs/roadmaps/canonical-fx-authority-scope-v1.md`.



---

# LIFE — Player Life Economy

Status: **PLANNED** · Baseline: `22dc9ce5023eb200a6608d5bb90a9ac30cb36c90` · Planning date: 2026-09-20

## Intended result

Give the player a persistent livelihood: secure work, receive wages, manage housing and bills, build resilience, and change direction without needing to own a business.

## Verified starting point and limits

The inspected Player navigation has Contracts, Business and Crafting under Work, but no dedicated employment or household destination. Arrival and world content describe living costs. This is evidence of a product-surface gap, not proof that every candidate employment field or helper is absent; FND-01 must inventory payroll and related records before adding anything.

## Ownership and integration boundaries

Employment owns offers, appointments and earned-pay obligations. Household/living-cost ownership covers personal commitments and bill status. Banking alone settles money and holds; World owns location/residency; Business alone owns real Business payroll and employer operations; Contracts remains the educational submission/review system.

## Candidate records and interfaces

Candidate entities: job definition, vacancy, application, employment agreement, earnings period, wage obligation, payslip reference, personal budget plan, recurring obligation, bill, housing offer, tenancy, deposit reference and assistance case. Reuse existing equivalents. Store only game-world facts, never actual student income or family circumstances.

Candidate commands: applyForJob, acceptEmploymentOffer, resignEmployment, settleEarnedWages, createPaymentMandate, reviewBill, payBill, signTenancy, endTenancy and requestAssistance. Monetary inputs identify reviewed obligations/accounts, not browser-authored wages or prices.

## Content and fixture scope

Proposed first slice: two contrasting fictional countries, three job archetypes and three housing choices each, and one complete four-week simulated budget. Later expand to all ten countries, at least two viable entry pathways per supported class-country combination and explicit recovery options. These are proposed targets, not current counts.

## Explicit exclusions

No real-money financial services, complex mortgages, private real-estate trading, unlimited overtime, hunger/death penalties, real attendance surveillance or automatic grade effects. Player employment inside a Business is an adapter to Business authority, not a second payroll engine.

## Milestones

### LIFE-01 — Approve the personal-economy rules and data boundaries

**Dependencies:** `FND-02`, `FND-01`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Specify job types, maximum concurrent commitments, pay cadence, eligibility, probation, resignation, termination, recurring-cost periods, housing capacity and emergency assistance. Default the first version to one primary job and limited side work, subject to product review. Distinguish story employment from assessed classroom work. Define funds sources for NPC employers and assistance through canonical economic parties. Declare whether partial bill payments exist; default to no hidden overdraft or forced loan.

**Player and Admin experience.** Provide a readable example of a first month with wages, rent, food/transport budget, savings and an adverse event. Admin previews affordability by country/class before enabling charges. The player sees why an offer is unavailable and a viable next step.

**Acceptance and adversarial tests.** Test sample starts with low funds, no job, no qualifying skill, a full housing market and a paused game. Every start retains at least one authorized income/recovery path. Reused Business/Banking fields cannot acquire conflicting ownership.

**Exit gate.** Versioned employment, cost, absence and recovery policies are approved before new liabilities are enabled.

### LIFE-02 — Implement vacancies, applications and employment agreements

**Dependencies:** `LIFE-01`, `FND-04`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Use a finite vacancy lifecycle: draft, open, filled/closed; application lifecycle: submitted, eligible/ineligible, offered, accepted, declined, expired or withdrawn. On acceptance, lock the vacancy and the player commitment record, validate skills/location and freeze wage, currency, cadence, duties and notice terms. Offers expire; accepting one cannot overbook the same vacancy or violate commitment limits. Add NPC employers first, mapping them to canonical parties without inventing Business entities or share issuers.

**Player and Admin experience.** Add a Jobs view under Work with salary, expected take-home estimate, location, commute, commitment and eligibility comparison. Use Apply, Compare, Accept and Decline controls. Admin can open/close vacancies and correct an application with a reason, but cannot silently replace accepted terms.

**Acceptance and adversarial tests.** Race two applicants for one slot; accept an expired offer; retry a successful acceptance; change qualifications or location before confirmation; attempt another player/game offer key. Assert one agreement and one seat consumption.

**Exit gate.** A player can obtain and inspect a durable job agreement through the authenticated interface; every decision has a reason and audit event.

### LIFE-03 — Connect earned wages and atomic payment

**Dependencies:** `LIFE-02`, `FND-03`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Accrue pay from server-defined agreement periods, not clicks or time spent online. Preserve already-earned wages after termination. Freeze gross pay, deductions, currency, coverage and policy in a pay obligation; settle employer debit, player credit and authorized tax/fee lines through Banking in one transaction. Reuse Business payroll for Business employers through a narrow adapter. An unfunded employer creates unpaid-wage state, not invented cash; NPC funding and assistance require explicit approved sources.

**Player and Admin experience.** Show next payday, earned-but-unpaid wages, paid payslips and their canonical receipt. Keep estimate, earned amount and posted amount distinct. Admin sees unpaid obligations and bounded recovery actions; manual correction uses a compensating command, never a direct balance edit.

**Acceptance and adversarial tests.** Inject failure after debit, deduction, credit and receipt creation; retry after response loss; run simultaneous payday workers; terminate at a period boundary; change account status; test every currency minor unit and tax rounding. Wage and receipt totals reconcile.

**Exit gate.** Multiple consecutive pay periods settle exactly once, with explainable arrears and no separate salary wallet.

### LIFE-04 — Implement recurring bills, budgets and payment mandates

**Dependencies:** `LIFE-03`, `FND-04`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Create versioned personal commitments for recurring costs, distinguishing actual contracted bills from optional planning envelopes. Generate one bill per obligation/period. Use scheduled, due, paid, overdue, disputed, waived or cancelled states with additive history. Quote exact payment from eligible Checking accounts; automatic payment requires explicit limited consent with account, cap, purpose and expiry. Lack of funds does not create unauthorized debt. A budget earmark is advisory unless the player has explicitly created a canonical Banking hold.

**Player and Admin experience.** Add a Life overview showing the next 7/30 days, expected income, committed bills, liquid funds and estimated discretionary amount. Show unknown costs as unknown. Offer pay, dispute, reschedule-request and mandate-revoke actions. Admin can grant documented grace without deleting the original bill.

**Acceptance and adversarial tests.** Race autopay with a manual payment; revoke a mandate during processing; vary bill price before issue versus after issue; simulate 30 days offline and pause/resume. Ensure budget displays do not double-count holds or treat a pending wage as spendable.

**Exit gate.** Players can explain and manage their obligations from one screen; mandate and manual paths cannot double-pay.

### LIFE-05 — Add housing choice, tenancy and relocation trade-offs

**Dependencies:** `LIFE-04`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Model housing offers by canonical location, capacity, periodic rent, deposit, utilities responsibility, minimum term and notice policy. Atomically reserve a slot and post a deposit through canonical holds/escrow when a tenancy is confirmed. Keep residence, physical travel location and legal residency separate. Integrate relocation with World quote/arrival/residency commands rather than directly changing country. Define exit inspection, permitted deductions and deposit release as reviewed events.

**Player and Admin experience.** Compare at least three meaningful options: lower rent/longer commute, central/higher rent and bounded temporary accommodation. The player reviews total move-in and recurring cost before signing. Admin has occupancy, expiring temporary stays and deposit-dispute queues, with an emergency housing path.

**Acceptance and adversarial tests.** Compete for the last room; retry lease acceptance; close a route before relocation; cancel before versus after travel; expire a lease during pause; race deposit refund with a dispute. No negative capacity, double deposit, impossible relocation or permanent exclusion is allowed.

**Exit gate.** Housing changes real cost and opportunity access, with a complete sign/live/move/out/refund lifecycle and recoverable failure states.

### LIFE-06 — Extend careers, training and employer mobility

**Dependencies:** `LIFE-03`, `PROG-02`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Add bounded promotion prerequisites, wage offers, credential-based vacancies, retraining and job-switch notice. Connect progression entitlements to receiving-domain eligibility rather than calculating salary from arbitrary XP. Freeze new terms prospectively and preserve earlier payslips. Business employment integration must resolve the employee to a canonical player and fund pay through the existing employer command; no duplicate employee or payroll authority. Side work consumes a defined commitment budget rather than rewarding constant login.

**Player and Admin experience.** Show career pathways as choices with prerequisites, cost, expected commitment and uncertainty. Provide a before/after job-switch comparison that includes commute and housing. Admin reviews eligibility exceptions and employer disputes without awarding qualifications merely by changing a display label.

**Acceptance and adversarial tests.** Test resignation before payday, retraining while employed, overlapping commitments, promotion/retry races, invalid credential claims and cross-country move restrictions. Prove that hiring a player does not double-count NPC labor or pay the same period twice.

**Exit gate.** At least two distinct career progressions are playable, and employment works independently of Business ownership.

### LIFE-07 — Implement distress, assistance and return-to-play recovery

**Dependencies:** `LIFE-05`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Support job loss, temporary reduced pay, unpaid wages, rent arrears and emergency expense events with bounded consequences. Implement explicit assistance eligibility, funding source, usage cap, review reason and follow-up path. Preserve the difference between an unpaid bill and a loan. Add grace periods, affordable relocation and retraining routes before stronger penalties. Prevent assistance loops through case uniqueness and eligibility evidence, not arbitrary punishment.

**Player and Admin experience.** Provide a clear recovery plan: what is due, what can be deferred, available income, temporary housing and assistance. Do not display a humiliating public poverty marker. Admin can preview and apply approved recovery policy; students are not penalized for an application outage or an approved classroom pause.

**Acceptance and adversarial tests.** Run compound shocks, zero liquid funds, employer insolvency, 7/14/30-day absence and repeated assistance attempts. Check that assistance is ledger-funded once, recovery does not erase legitimate debts/history, and every supported scenario retains a reachable non-borrowing recovery action.

**Exit gate.** Distress creates choices and consequences without an irreversible soft lock or need for off-system teacher money edits.

### LIFE-08 — Certify personal-economy balance and end-to-end usability

**Dependencies:** `LIFE-06`, `LIFE-07`, `UX-03`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Run deterministic 30-, 90- and 365-day cohorts for every supported country, class and difficulty, including cautious, active, irregular and returning players. Measure disposable income, rent burden, missed payments, aid use, pathway concentration and recovery time. Publish distributions and worst cases rather than only an average. Use real domain commands for sampled integration cohorts; accelerated pure-model tests do not certify live settlement.

**Player and Admin experience.** Observe representative testers finding work, explaining a payslip, paying rent, comparing housing, changing jobs and recovering from a shock. Admin completes the same oversight journey using supported commands and bounded queues. Record confusion and unnecessary clicks as defects.

**Acceptance and adversarial tests.** Retain all money, scoping, race, replay, accessibility and lifecycle gates. Proposed acceptance: every declared starter scenario has a viable path; no modeled replay produces duplicate pay/bills; no supported absence scenario is unrecoverable. Affordability thresholds require product calibration, not invented pass marks.

**Exit gate.** Life is feature-complete only with Player/Admin workflows, calibrated fixtures and exact-source evidence; production activation is a separate gate.

## Source basis

**R10 — Current Player navigation registry.** Inspected lines 1–37 show Work/Finance/World/Profile destinations; supports navigation-gap assessment only. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/player-terminal/src/components/layout.js`.

**R6 — One-year real-time content/cadence contract.** Requirements for recurrence, seasonal activity, opportunity coverage and recovery; not a fresh inventory of implemented features. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/docs/seed-content/17-one-year-real-time-content-and-market-cadence-contract-v1.md`.

**R9 — Canonical FX authority scope.** Single currency/fixing authority, 08:00 game-local cadence, immutable provenance and pause rules. Historical PR labels are not current merge status. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/docs/roadmaps/canonical-fx-authority-scope-v1.md`.



---

# MAC — Macroeconomy V2

Status: **PLANNED** · Baseline: `22dc9ce5023eb200a6608d5bb90a9ac30cb36c90` · Planning date: 2026-09-20

## Intended result

Replace mechanically drifting country indicators with an explainable, bounded causal simulation whose outputs influence everyday choices.

## Verified starting point and limits

The inspected daily macro migration moves indicators 10% toward configured targets. This proves a simple existing mechanism, not the absence of all other shocks or overrides. FND-01 must locate the latest function definitions and every writer. FX already consumes versioned macro evidence; it is not to be rebuilt.

## Ownership and integration boundaries

Economy/Countries own aggregate economic observations and snapshots. Existing World/Story owns authorized scenario shocks; Banking owns financial settlement; FX alone publishes exchange-rate fixings. Business, player employment and commerce provide versioned observations through public contracts. Macroeconomic statistics are not permission to post money.

## Candidate records and interfaces

Candidate records: model-policy version, country-sector observation, input provenance, simulation checkpoint, macro batch and explanation contributions. Keep existing country_economic_snapshots as the published read boundary where compatible; do not create a second authoritative GDP series by accident.

Candidate interfaces: collectEconomicObservations, calculateMacroStep, publishMacroBatch, previewScenario and readCountryEconomicExplanation. State input units and horizons. Publish full-country batches atomically with stable source identities.

## Content and fixture scope

Start with three aggregate sectors and two countries in deterministic offline experiments; then use all ten countries and canonical route exposure. Preserve a declared residual economy for non-player activity. Country calibration and representative-player weights must be explicit simulation policy, not fictional observed national data.

## Explicit exclusions

No full agent-based economy, arbitrary money printing, real-world forecasting claim, live policy experimentation on classroom state, or second FX writer. Do not include share trading, loan principal, transfers and repeated intermediate sales as newly produced GDP.

## Milestones

### MAC-01 — Define economic measurement and accounting boundaries

**Dependencies:** `FND-02`, `FND-01`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Define stocks versus flows, nominal versus real measures, period lengths, currency conversion bases, seasonal adjustment policy and player-to-national scaling. Choose value-added or final-expenditure measurement with a reconciliation check; label missing measurements honestly. Separate classroom activity from the non-player economy and ensure the residual sector does not count player production twice. Map existing ledger/activity events into observation categories with known coverage and exclusions.

**Player and Admin experience.** Create a country economic dictionary with units, time period, freshness and method. Admin sees coverage and missing-input diagnostics. Players see understandable labels such as a price index or a growth rate rather than ambiguous percentages.

**Acceptance and adversarial tests.** Test that a share sale, loan principal transfer and movement between accounts do not increase output; intermediate goods are not counted repeatedly; FX revaluation is not production; zero activity differs from unavailable data; per-period and annual rates cannot be interchanged silently.

**Exit gate.** A reviewed measurement contract and baseline dataset exist before model coefficients are tuned.

### MAC-02 — Build a bounded production and demand model

**Dependencies:** `MAC-01`, `FND-04`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Implement pure deterministic sector calculations using productive capacity, labor availability, input availability, demand and capacity utilization. Consume canonical completed activity, not merely orders or UI intentions. Start with transparent equations and versioned coefficients. Separate observed classroom flows, modeled non-player flows and scenario shocks. Use inventories consistently so goods produced, stored and sold are not double-counted. Record a reason decomposition for each changed indicator.

**Player and Admin experience.** Show sector demand, bottlenecks and supply pressure with a data-quality label. The player should distinguish current observations from forecasts. Admin can run a no-write scenario preview and compare baseline versus candidate model versions.

**Acceptance and adversarial tests.** Exercise no demand, excess demand, labor shortage, material shortage, idled capacity and inventory accumulation. Identical seed/policy/input yields identical output; changing input order does not change a result. Confirm bounded nonnegative quantities and sensible conservation relationships.

**Exit gate.** A small sector model explains its outcomes in unit tests and produces compatible country observations without changing the active macro writer.

### MAC-03 — Connect labor demand, wages, living costs and inflation

**Dependencies:** `MAC-02`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Link vacancies, employment, wage offers, essential-goods baskets and input costs through lagged, bounded relationships. Distinguish wage levels from wage growth and relative price changes from broad inflation. Specify basket weights and avoid updating wages, demand and prices in an instantaneous circular loop. Keep tax/interest policy rates separate from mechanically estimated market variables. Use agreed prior-period snapshots for inputs.

**Player and Admin experience.** Provide an explanation such as increased freight costs raising the essentials basket, or expanding service demand creating vacancies. Life reads published wage/rent indexes for future offers and unopened bills, never rewrites signed agreements or already-issued bills.

**Acceptance and adversarial tests.** Test supply shock versus demand shock, wage pressure under labor scarcity, a large single-sector price increase, and a shrinking workforce. Require coefficient sensitivity and stability analysis. Evaluate counterexamples: not every higher wage automatically creates identical inflation or job loss.

**Exit gate.** Labor and cost-of-living outcomes have explicit causal provenance, lags and contract-protection rules.

### MAC-04 — Model trade routes, import exposure and substitution

**Dependencies:** `MAC-02`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Use existing World routes and locations to model bounded bilateral or sector exposure, capacity, shipping cost, delay, imports, exports and substitution. Distinguish trade order, transit and delivered flow. Declare how modeled external trade and observed in-game trade reconcile. Route closures change capacity and relative costs, not arbitrary unrelated countries. Define the economic-period FX valuation basis using an already-completed fixing so same-day trade and FX do not form a circular calculation.

**Player and Admin experience.** Extend economic map overlays with essential imports, route exposure, substitutes and time-to-arrival. Show why another location becomes attractive, without inventing opportunities not represented by real listings or travel access. Admin can inspect the exposure matrix and scenario assumptions.

**Acceptance and adversarial tests.** Test one closed route, two competing routes, delayed reopening, domestic substitution, all routes unavailable and inverse trade accounting. Verify no double-counted shipment, impossible route, same-tick FX feedback or negative available supply.

**Exit gate.** A logistics shock propagates to specific countries/sectors with reproducible costs, delays and recovery.

### MAC-05 — Add fiscal, credit and business-cycle policy transmission

**Dependencies:** `MAC-03`, `MAC-04`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Define scenario-owned tax, subsidy, spending and interest-rate policy changes with effective dates and bounded lags. Distinguish an aggregate modeled government sector from any actual canonical treasury account. A game payment requires funded ledger authority; a macro index alone never authorizes a debit or credit. Model demand, credit pressure and stabilization effects conservatively. Identify balancing assumptions explicitly and retain counter-scenarios rather than making one policy universally superior.

**Player and Admin experience.** Show preconditions, lag, uncertainty and distributional effects in a simulation explanation panel. Admin may preview an approved scenario-policy change; players respond economically rather than gaining unilateral control of a country or its war decisions.

**Acceptance and adversarial tests.** Run recession, recovery, demand boom, supply contraction and conflicting shocks. Check policy time consistency, no retroactive loan repricing, funded benefits, finite tax bases and absence of explosive positive feedback. Evaluate outcomes under several coefficient sets.

**Exit gate.** Policy transmission is an explainable simulation model with documented limits, not an unqualified statement about actual national economies.

### MAC-06 — Run the model in shadow with deterministic snapshots

**Dependencies:** `MAC-05`, `LIFE-03`, `LIFE-04`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Read immutable observation cutoffs and calculate complete country batches without changing active gameplay. Store model version, input digest, calculation time and country coverage. Compare candidate outputs with the current engine and flag divergence; do not grade the new model solely by agreement with old target convergence. Bound runner work and use the established scheduler/lease pattern. Keep shadow observations entirely non-authoritative.

**Player and Admin experience.** Admin sees baseline/candidate differences, worst-case changes, missing inputs and economic explanations. Player screens remain on the active model. A selected synthetic replay can demonstrate how wages, bills and purchasing activity feed the model without exposing student records.

**Acceptance and adversarial tests.** Stop and resume mid-batch; repeat a batch; deliver an input late; omit one country; change a policy version; run multiple workers. Candidate outputs must not affect balances, prices, FX fixings or downstream gameplay until an explicit future cutover.

**Exit gate.** Shadow runs are reproducible and complete across all ten countries, with calibrated discrepancy thresholds and no active-game writes.

### MAC-07 — Integrate published macro evidence with FX and gameplay

**Dependencies:** `MAC-06`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Introduce a guarded per-game model-version cutover after approval. Publish one complete macro batch effective before the 08:00 FX boundary, or keep the prior authoritative batch with stale evidence. Preserve FX input selection, immutable fixings and no replay of paused dates. Store, loans, employment offers, World and Market consume supported snapshot fields at their own contractual boundaries. Preserve prior policy and model provenance for historical explanations.

**Player and Admin experience.** Players can inspect which macro release affected a quote, vacancy, loan offer or market signal. Show downstream lag instead of pretending every change is instantaneous. Admin has a cutover preview and a forward recovery procedure for future periods; old financial history is never recalculated.

**Acceptance and adversarial tests.** Test 07:59/08:00 races, missing-country input, current versus prior FX valuation, new quote versus committed transaction, paused games, resumed games, and stale consumers. Assert no duplicate Story shock through both direct and macro channels.

**Exit gate.** A single causal shock propagates through authoritative owners exactly once and remains explainable across each affected surface.

### MAC-08 — Certify model stability, fairness and explanation quality

**Dependencies:** `MAC-07`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Run 365-day simulations across all ten countries with multiple reproducible seeds, difficulty settings, player participation levels and shock combinations. Include sensitivity sweeps, parameter perturbation, extreme boundary cases and long-run equilibrium checks. Measure volatility, recovery, living-cost affordability, employment availability, cross-country opportunity and residual-model dominance. Report failed seeds and capped behavior, not just successful averages.

**Player and Admin experience.** An independent reviewer should explain representative changes using the stored contribution breakdown. Test whether a player can distinguish observed data, modeled estimates and future uncertainty. Admin can reproduce any published batch from the recorded inputs.

**Acceptance and adversarial tests.** Require numerical stability, no unexplained money creation, complete source provenance, no unsupported country permanently losing all recovery options, and identical replay. Product-calibrated bounds for inflation, output movement and recovery remain proposed until approved with evidence.

**Exit gate.** Macroeconomy V2 is accepted as a bounded educational simulation, with exact-source and shadow/integration evidence; broader realism claims remain excluded.

## Source basis

**R5 — Daily country macro progression migration.** Inspected source lines 172–218 show 10% movement toward configured targets. Locate any superseding writer before implementation. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/backend/supabase/migrations/20260810120000_add_daily_country_macro_runtime_v1.sql`.

**R9 — Canonical FX authority scope.** Single currency/fixing authority, 08:00 game-local cadence, immutable provenance and pause rules. Historical PR labels are not current merge status. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/docs/roadmaps/canonical-fx-authority-scope-v1.md`.



---

# REL — Characters and Relationships V2

Status: **PLANNED** · Baseline: `22dc9ce5023eb200a6608d5bb90a9ac30cb36c90` · Planning date: 2026-09-20

## Intended result

Make conversations remember the player, respond to the substance of a message, and connect naturally to verified opportunities and consequences.

## Verified starting point and limits

Merged PR #643 already contains a durable reply queue, bounded intent/topic classification, deterministic country-aware responses, relationship memory, coalescing, leases/retries, dead-letter handling and a kill switch. This track deepens that existing system; it must not build those components again or assume production activation from repository presence.

## Ownership and integration boundaries

Messaging owns threads/messages, delivery and moderation. Story/relationship ownership retains character identity, memory and narrative consequences. Employment, Housing, World, Banking and Contracts authorize any resulting action. A character can offer information or initiate a reviewable proposal, not directly mutate money, ownership or grades.

## Candidate records and interfaces

Extend existing character definitions, scoped memory and reply records where possible. Candidate additions: verified fact reference, confidence-qualified interpretation, relationship dimension, commitment, topic cooldown, response variant and structured action proposal. Distinguish player statements from verified facts.

Candidate commands: interpretReply, recordRelationshipObservation, selectCharacterResponse, proposeDomainAction and confirmCharacterProposal. Free text is not itself acceptance of a financial or irreversible operation.

## Content and fixture scope

Start with four existing characters with contrasting roles, then cover the existing character roster rather than assume a fixed count. For each pilot character author greeting, advice, disagreement, employment, housing, finance, refusal, follow-up and repair branches. Support polite disagreement and no-response cases.

## Explicit exclusions

No unrestricted autonomous agents, character authority to invent world events or prices, unbounded prompt memory, guaranteed truthfulness about future events, pay-for-trust, or real-person psychological profiling. A generative-language layer is optional and separately gated.

## Milestones

### REL-01 — Audit the reply engine and formalize character contracts

**Dependencies:** `FND-01`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Trace the merged queue, classifier, processor, message insertion and memory update end to end. Catalogue current intent/topic coverage and response repetition. For each character define role, voice, allowed knowledge, private knowledge, institutional limits, goals, uncertainty and topics they cannot answer. Use existing canonical character keys and thread identity. Establish a comparison corpus of current replies before changing behavior.

**Player and Admin experience.** Present characters consistently in threads with a role and context, not an AI omniscience indicator. Admin can inspect safe classification/reply diagnostics without granting extra access to private player data. Unsupported topics receive an honest bounded response.

**Acceptance and adversarial tests.** Test a normal reply, rapid messages, processing failure, retry, kill-switch pause, expired player access and wrong-game character reference. Preserve all existing queue/coalescing/replay evidence. Confirm character definitions do not leak unrevealed scenario outcomes.

**Exit gate.** The V1 engine and reusable components are mapped; V2 scope is limited to verified gaps.

### REL-02 — Improve bounded intent, topic, stance and ambiguity handling

**Dependencies:** `REL-01`, `FND-04`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Extend interpretation from coarse intent/topic to optional stance, requested action, referenced entity, question type and confidence. Retain deterministic rules as the default. Treat quoted speech, negation, sarcasm and mixed messages carefully. An uncertain interpretation asks a short clarifying question or offers structured choices. Bind classifications to the specific message and policy version; never retroactively reclassify committed actions.

**Player and Admin experience.** Players can choose Ask for details, Disagree, Request an introduction, Compare options or Clarify while retaining free text for expression. Consequential interpretations are shown for review. Admin can label evaluation examples without rewriting a player message.

**Acceptance and adversarial tests.** Use a held-out labelled corpus covering negation, spelling mistakes, Korean/English where supported, quoted instructions, abuse, long text, conflicting requests and ambiguous references. Report precision/recall per consequential intent. Low confidence must not trigger an economic command.

**Exit gate.** Interpretation improves on a measured V1 baseline, with an explicit safe path for uncertainty instead of pretending to understand every message.

### REL-03 — Add durable, bounded and provenance-aware memory

**Dependencies:** `REL-02`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Store only useful game-world memory: verified past decisions, outstanding commitments, recent topics, relevant prior replies and policy-bounded relationship observations. Separate claimed facts from confirmed domain receipts. Make trust, reliability and institutional standing distinct where they yield actual gameplay, and avoid numerous invisible meters. Add relevance/expiry rules, memory size caps and immutable correction provenance. Retain pre-existing relationship history during migration.

**Player and Admin experience.** Show a brief relationship summary with known commitments and recent interactions, not hidden classifier scores. Provide a way to clarify misunderstood statements. Admin can review a harmful or incorrect memory association using a bounded correction process.

**Acceptance and adversarial tests.** Test fact contradictions, stale facts, a fulfilled commitment, cross-player thread mixing, replayed messages and archive/purge behavior. A statement such as I already paid rent is not treated as proof without the relevant receipt. Verify memory retrieval stays bounded.

**Exit gate.** Characters remember relevant verified history without becoming an unrestricted second player database.

### REL-04 — Implement state-aware dialogue and response variation

**Dependencies:** `REL-03`, `REL-02`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Select responses from authored graphs using character role, conversation context, relationship observations, current public World facts and verified player action. Include follow-up questions, respectful disagreement, refusal, changed advice after new evidence and repaired misunderstandings. Track recently used variants and topic cooldowns. Variation must preserve the same verified facts and supported actions; it is not permission to randomize prices, promises or outcomes.

**Player and Admin experience.** Responses feel distinct by character and acknowledge earlier decisions. Provide concise replies with optional details rather than long unsolicited exposition. Players can decline or leave a conversation without automatic relationship damage. Admin previews a response path against a synthetic state.

**Acceptance and adversarial tests.** Evaluate repeated conversations, identical intent with different history, same history with different stance, delayed reply after World changes and competing response variants. Require no contradictory canon, no invented availability and reduced exact-text repetition on the benchmark corpus.

**Exit gate.** The pilot characters support coherent multi-turn interactions and context-sensitive refusal, not just more greeting templates.

### REL-05 — Connect conversations to explicit, verified opportunities

**Dependencies:** `REL-04`, `LIFE-05`, `PROG-02`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Allow characters to surface real vacancies, housing offers, Contracts, training and travel options by public handle. A proposed action includes source version, terms summary, expiry and receiving-domain command. Revalidate eligibility and current state on confirmation. Record promises as bounded commitments and resolve them from actual outcomes. An NPC introduction may improve access or information under policy, but cannot mint a job, payment or qualification.

**Player and Admin experience.** Render action cards inside a thread with View offer, Review terms, Accept or Decline. Show when a vacancy has filled or an offer changed. A player must separately approve a payment or binding agreement. Admin can trace conversation proposal to domain receipt.

**Acceptance and adversarial tests.** Test stale listings, changed wages, expired housing, wrong-player offers, forged chat text, simultaneous acceptance and loss of response after commit. The same proposal can complete once only; prose claiming consent cannot bypass review.

**Exit gate.** A conversation can lead to a real opportunity through canonical commands, with no narrative-to-database back door.

### REL-06 — Add relationship arcs and delayed follow-through

**Dependencies:** `REL-04`, `WORLD-02`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Author multi-step arcs with prerequisites, cooldowns, commitment windows and event-driven follow-up. Reuse the existing Story scheduling/worker infrastructure. Include relationships that evolve through fulfillment, disagreement, professional reliability and changed circumstances. Delayed messages verify that their context is still valid before delivery; obsolete follow-ups are superseded, not sprayed into the inbox.

**Player and Admin experience.** Players see a small number of pending commitments and meaningful reactions after choices. Admin can preview scheduled relationship work, pause an arc or retire a definition prospectively. Major world outcomes remain scenario-owned, not controlled by one conversation.

**Acceptance and adversarial tests.** Test branch changes, fulfilled and missed commitments, no reply, paused games, stale scheduled messages, conflicting arcs and a 30-day absence. Repetition and notification caps must hold even after worker recovery.

**Exit gate.** Relationships evolve over multiple simulated weeks with preserved chronology and without requiring constant login.

### REL-07 — Harden moderation and optionally evaluate generative wording

**Dependencies:** `REL-02`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Keep the existing deterministic engine as the fallback. Add abuse/spam limits, reporting, age-appropriate authored boundaries and an operational per-game stop control. Only after the deterministic path is complete, evaluate an optional language-model renderer that receives an allowlisted context and a fixed action schema. Treat player text and retrieved text as untrusted; validate output before display. The model receives no privileged database or payment tools. Record model/prompt versions and latency/cost caps.

**Player and Admin experience.** Explain that game messages are moderated and may be visible to authorized staff. Let a player report a response. Admin can disable generation without disabling ordinary messaging or the deterministic reply path. Never imply guaranteed privacy where staff oversight exists.

**Acceptance and adversarial tests.** Test prompt injection, requests for hidden outcomes, another player’s data, invented balances, unsafe URLs, output-schema violations, provider outage and budget exhaustion. Require fallback and no unauthorized consequence. Model quality results are separate from economic correctness.

**Exit gate.** Safety and continuity do not depend on a model behaving perfectly; optional generation is not a prerequisite for V2 delivery.

### REL-08 — Certify narrative quality and cross-system continuity

**Dependencies:** `REL-05`, `REL-06`, `REL-07`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Run multi-turn scripted and adversarial conversations across roles, countries, histories and world phases. Measure intent accuracy, response relevance, factual grounding, repeated text, stalled proposals and unfulfilled callbacks. Use blind reviewer comparisons with V1. Trace sampled conversations to real domain receipts and subsequent relationship updates. Keep historical V1 memory and thread IDs intact.

**Player and Admin experience.** Test with players who use short messages, long messages, disagreement, silence and the structured options only. Observe whether they understand the character’s authority and the difference between advice and an executable offer. Admin can resolve reports without deleting economic history.

**Acceptance and adversarial tests.** Require zero cross-game disclosure, zero chat-authorized economic writes, no duplicate replies, bounded queue recovery and coherent fact provenance. Proposed release criterion: every pilot character supports a complete multi-week arc; final roster coverage follows the actual current roster.

**Exit gate.** V2 improves believable continuity and useful interactions on top of the existing reply engine; runtime activation still requires explicit certification.

## Source basis

**R2 — Merged PR #643 — durable story-character reply engine.** Merged 2026-08-18. Metadata describes existing intent/topic classification, memory, queue, coalescing, retry and kill switch. Historical staging claims were not rerun for this plan. Source: `https://github.com/kohnerbouchard-star/Student-Profile/pull/643`.

**R6 — One-year real-time content/cadence contract.** Requirements for recurrence, seasonal activity, opportunity coverage and recovery; not a fresh inventory of implemented features. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/docs/seed-content/17-one-year-real-time-content-and-market-cadence-contract-v1.md`.



---

# WORLD — One-Year Living World and Campaign Continuity

Status: **PLANNED** · Baseline: `22dc9ce5023eb200a6608d5bb90a9ac30cb36c90` · Planning date: 2026-09-20

## Intended result

Fill the time between major story events with recurring opportunities, obligations, seasonal pressures, persistent choices and manageable return-to-play summaries.

## Verified starting point and limits

The repository already has World travel/residency and a campaign/story foundation. Its year-long content contract calls for recurrence, variation, seasonal effects, recovery and full-year evidence. That requirements document is not proof that each feature is missing today; the opening milestone reconciles requirements with the active implementations and content packs.

## Ownership and integration boundaries

World owns geography, travel and route state; Campaign/Story owns authored scenario sequencing and narrative conditions. Economy owns macro outcomes; domain commands own actual payments and inventories. Scheduling extends the current infrastructure rather than creating an independent calendar, bus or universal simulation engine.

## Candidate records and interfaces

Candidate records extend existing definitions: recurrence rule, eligibility predicate, variant key, cooldown, delayed consequence, commitment reference, saturation budget, opportunity coverage record, event correction and catch-up summary. Keep reusable content definitions separate from live game instances.

Candidate commands: scheduleEligibleOpportunity, commitPlayerDecision, dispatchDelayedConsequence, buildReturningPlayerSummary, previewCampaignPeriod and retireContentVersion. Every domain effect has one owner and idempotent cause; the scheduling system cannot directly credit money.

## Content and fixture scope

Proposed coverage target: every active player can find at least two viable optional opportunities per simulated week; no more than three simultaneously highlighted required actions without explicit scenario approval. Start with six recurring families and seasonal variants before expanding volume. These are calibration targets, not already-approved limits.

## Explicit exclusions

No second scheduler, one-click player declaration of war, infinite procedural prose, compulsory daily grind, retroactive rewriting of resolved choices, forced real-world political choices or a separate map geometry redesign.

## Milestones

### WORLD-01 — Build an executable content and coverage inventory

**Dependencies:** `FND-01`, `FND-02`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Map each current campaign phase, Story arc, recurring opportunity, tutorial, event and notification to its actual runtime consumer. Distinguish authored text from executable prerequisites and effects. Record country/class availability, required state, reward owner, cancellation path, cooldown and content version. Identify dead ends and stale documentation. Create a day-by-day coverage view without activating more content.

**Player and Admin experience.** Admin can preview a sample player’s next 7/30 days and see why something is eligible or blocked. Player availability remains authoritative; the preview does not invent open offers. Show an explicit content gap rather than a fabricated event.

**Acceptance and adversarial tests.** Validate references, impossible prerequisites, circular chains, duplicated rewards, incompatible versions and paths with no available recovery action. Every executable effect resolves to an existing command or a named future dependency.

**Exit gate.** A coverage map states precisely what is already supported and which experience gaps this track must close.

### WORLD-02 — Extend recurrence and delayed-consequence scheduling

**Dependencies:** `WORLD-01`, `FND-04`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Add only missing recurrence/cooldown capabilities to existing scheduling infrastructure. Support daily observations, weekly opportunities, monthly obligations/reviews and quarterly/seasonal changes using the common time policy. Persist due occurrence identity, eligibility snapshot and processing status. Bounded leases/retries must resume safely. Separate missed mandatory economic obligations from optional news that should be compacted rather than replayed in full.

**Player and Admin experience.** Admin previews due work and saturated channels, and can pause a definition prospectively. Players see deadlines and the consequence of taking no action. Low-priority recurrence does not produce a modal every time a worker catches up.

**Acceptance and adversarial tests.** Run duplicate workers, out-of-order completion, a missed month boundary, daylight-saving change, revoked eligibility and content retirement. Assert one occurrence/effect and no backlog burst. Verify no competing cron path executes the same economic period.

**Exit gate.** Recurring content uses one coherent clock and durable execution path with observable pending/failed/replayed states.

### WORLD-03 — Add seasonal systems and repeatable economic opportunities

**Dependencies:** `WORLD-02`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Create bounded families for work, trade, training, community service, information gathering and resilience. Vary by location, time, resources and prior choices using approved template parameters. Add seasonal demand/supply inputs for existing sectors and routes. Tag one canonical cause when an event affects both a physical condition and a derived price, preventing duplicate shocks. Resolve rewards through Contracts, Banking, Inventory or Progression as appropriate.

**Player and Admin experience.** Expose an Opportunity feed with eligibility, deadline, effort, uncertainty and expected type of benefit. Link to real actions rather than prose-only tasks. Admin can inspect template coverage and disable a problematic variant without deleting prior completions.

**Acceptance and adversarial tests.** Test resource-poor, highly progressed, inactive and recently relocated players. Validate that variants are economically distinct enough to matter, fit real availability and remain bounded. The same cause cannot apply a scarcity or FX effect twice.

**Exit gate.** At least six recurring families operate through genuine game mechanics, with coverage and repetition measured over multiple simulated weeks.

### WORLD-04 — Deepen choices, agreements and branching consequence memory

**Dependencies:** `WORLD-03`, `REL-04`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Author multi-option decisions with visible trade-offs, deferred consequences, expiry and explicit no-response behavior. Store choice receipt and policy/content version before dispatching secondary effects. Where player-to-player commitments are appropriate, introduce bounded agreements through the existing Contract/commitment authorities, not a universal smart-contract engine. Preserve both fulfilled and abandoned commitments historically. World escalation remains scenario-owned; individual choices affect exposure and recovery rather than deciding the war.

**Player and Admin experience.** Players review immediate costs, likely risks and what remains uncertain. Show later consequences linked back to the original choice without revealing every future branch. Admin can review stuck chains and apply a documented correction, preserving the initial record.

**Acceptance and adversarial tests.** Exercise conflicting choices, simultaneous group responses, stale eligibility, no response, revised content and delayed effect failure. Ensure no option becomes a universally correct answer solely because of a hidden arbitrary reward.

**Exit gate.** A complete scenario has more than one viable path and a safe no-response path, with consequences grounded in persistent state.

### WORLD-05 — Implement returning-player summaries and continuity recovery

**Dependencies:** `WORLD-02`, `LIFE-04`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Summarize changes since the last acknowledged checkpoint: posted money, unpaid obligations, completed travel, changed routes, relevant news, new opportunities and outstanding commitments. Collapse duplicate low-priority notifications while retaining an accessible history. Separate facts from recommendations and never resubmit a completed action as a catch-up step. Apply approved absence rules rather than retroactively forgiving everything or issuing surprise penalties.

**Player and Admin experience.** Offer a single What changed panel and a small prioritized action list, with direct links to the source records. Players may skip the summary without losing access. Admin can preview the experience after a school break and detect impossible recommendations.

**Acceptance and adversarial tests.** Simulate 1, 7, 14 and 30 days away, including world-phase transition, paid/unpaid bills, expired offers and terminated jobs. Confirm no modal flood, no repeated read-state writes, no duplicate consequences and complete critical-obligation visibility.

**Exit gate.** A returning player can understand their position and take a viable next step without reading the entire missed event stream.

### WORLD-06 — Build educator pacing and scenario supervision tools

**Dependencies:** `WORLD-04`, `WORLD-05`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Add a read-first campaign calendar, country opportunity coverage, required-action saturation, upcoming effects and recovery-path checks. Support previewing approved scenario changes, pausing/resuming applicable content and retiring future definitions. Bound edits by permissions, effective dates and versioning. Manual controls never bypass canonical payment/Inventory/relationship commands or silently reverse already-completed economic effects.

**Player and Admin experience.** Admin sees the classroom’s workload and can inspect representative player experiences without impersonating their financial actions. Provide consequence previews and a reason field for exceptional adjustments. Player-facing notices explain changes without exposing internal diagnostics.

**Acceptance and adversarial tests.** Test permission separation, paused games, content publication after preview, stale Admin forms, multiple staff changes and correction after some recipients have already received an event. No partial replay may cause mixed or duplicated effects.

**Exit gate.** An educator can run and recover a multi-week campaign using the product interface, not SQL or off-system bookkeeping.

### WORLD-07 — Build full-year content, saturation and recovery simulation

**Dependencies:** `WORLD-03`, `FND-03`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Run 365-day synthetic schedules across all ten countries, supported classes, difficulty bands and participation patterns. Track meaningful opportunities, repetitions, required workload, income access, unresolved chains, expired promises, unread backlog and recovery availability. Use seeded generation and policy snapshots. Combine fast pure coverage runs with sampled domain integration runs; explicitly distinguish those evidence types.

**Player and Admin experience.** Produce a heatmap-ready dataset and a readable report identifying empty periods and overloaded weeks. Admin can select a failed case and replay its chronology. Include worst-case players, not only a median active participant.

**Acceptance and adversarial tests.** Proposed thresholds: no supported player state lacks a viable income/recovery opportunity for more than one active simulated week; required-action caps hold; each mandatory chain resolves, suspends coherently or exposes recovery. Product review may tighten calibrated limits, never hide failing cases.

**Exit gate.** A complete simulated year has evidence-backed coverage and bounded interruption, with every gap assigned to a content or runtime owner.

### WORLD-08 — Certify integrated long-term world continuity

**Dependencies:** `WORLD-06`, `WORLD-07`, `MAC-07`, `REL-06`, `LIFE-07`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Integrate seasonal opportunity generation, life obligations, relationship follow-up and macro transmission without shared mutable shortcuts. Execute scenario checkpoints for arrival, growth, shortage, conflict, adaptation and recovery using existing canon. Reproduce a past checkpoint and verify the same future result under the same inputs. Exercise a forward content-version change mid-campaign and preserve completed story and economic history.

**Player and Admin experience.** Observe a four-week accelerated player journey and an extended passive soak. Verify that players understand why their options changed and how to recover. Educator dashboards must expose stuck work and overload before those become classroom disruption.

**Acceptance and adversarial tests.** Require no duplicate effects, no irrecoverable approved player state, no unsupported control over geopolitical outcomes, complete consequence provenance and bounded worker backlog. Passing a 365-day simulation is not a claim that a year-long classroom pilot already occurred.

**Exit gate.** The world supports continuity between major plot beats; further content expansion is evidence-led rather than a quota of new text.

## Source basis

**R6 — One-year real-time content/cadence contract.** Requirements for recurrence, seasonal activity, opportunity coverage and recovery; not a fresh inventory of implemented features. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/docs/seed-content/17-one-year-real-time-content-and-market-cadence-contract-v1.md`.

**R9 — Canonical FX authority scope.** Single currency/fixing authority, 08:00 game-local cadence, immutable provenance and pause rules. Historical PR labels are not current merge status. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/docs/roadmaps/canonical-fx-authority-scope-v1.md`.

**R10 — Current Player navigation registry.** Inspected lines 1–37 show Work/Finance/World/Profile destinations; supports navigation-gap assessment only. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/player-terminal/src/components/layout.js`.



---

# CAP — Advanced Financial Markets and Analyst Gameplay

Status: **PLANNED** · Baseline: `22dc9ce5023eb200a6608d5bb90a9ac30cb36c90` · Planning date: 2026-09-20

## Intended result

Expand from reliable immediate stock trading into research, controlled order lifecycles and a small coherent multi-asset market without weakening settlement.

## Verified starting point and limits

The repository has an existing full-financial-markets authority document with EXP-MKT items and explicit exclusions. It describes bonds, funds, benchmarks and advanced orders as an expansion program. Reconcile its live status and owner before implementation. The older Analyst design is a design source, not current runtime proof.

## Ownership and integration boundaries

Market/Stocks owns instrument identity, quotes, orders, trades and custody appropriate to each instrument. Business remains sole authority for Business common shares. Banking owns accounts, holds and money settlement; FX owns conversions. Analyst owns forecast commitments/evaluations, not market prices or automatic grading.

## Candidate records and interfaces

Candidate extensions: typed instrument definition, trading calendar, order, hold reference, fill, cancellation/expiry, bond terms, coupon occurrence, recovery event, fund basket/NAV provenance, benchmark membership, forecast, evaluation policy, locked forecast and evaluation result. Reuse existing records before proposing successors.

Candidate commands: submitLimitOrder, cancelOrder, processEligibleFill, settleCoupon, matureBond, calculateFundNav, submitForecast, lockForecast and evaluateForecast. Preserve existing immediate order/quote commands and their supported split-funding behavior.

## Content and fixture scope

Proposed initial expansion: a small representative group of sovereign/corporate bonds, equity-only funds and reference benchmarks, rather than activating the full instrument library. Analyst can launch against existing stocks before advanced asset classes are ready.

## Explicit exclusions

Short selling, margin, derivatives, real-market feeds and physical commodity delivery remain excluded. First standing limit orders use prefunded listing-currency Checking funds with canonical holds; this restriction does not remove existing immediate-purchase split-funding/FX. Preferred or convertible instruments require a later separately approved scope.

## Milestones

### CAP-01 — Reconcile the market expansion authority and current contracts

**Dependencies:** `FND-01`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Audit the EXP-MKT authority, relevant open branches and existing Stocks/Markets boundaries. Catalogue implemented instrument types, calendar rules, quote/settlement paths, position ownership, dividends/corporate actions and archived design work. Identify exactly which abstractions can be extended without migrating certified common-share history. Register one owner for the eventual schema and shared endpoint changes; do not resurrect an obsolete branch blindly.

**Player and Admin experience.** Document what a player can currently trade and what is only a displayed benchmark. Audit Market versus Marketplace naming so goods commerce cannot be confused with securities. Admin has a truthful capability/readiness matrix.

**Acceptance and adversarial tests.** Trace one immediate buy and sell through the canonical funds and custody authorities. Confirm current orders/holdings remain unchanged by this planning/contract work. Every expansion item maps to its original or reconciled authority.

**Exit gate.** A reviewed expansion crosswalk exists, with no competing instrument or share-ownership writer.

### CAP-02 — Add typed instruments and trustworthy market read models

**Dependencies:** `CAP-01`, `FND-04`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Define common read fields and explicit type-specific properties: quote currency, unit/lot/tick, tradability, market state, issuer, source/freshness and relevant risk. A benchmark is not automatically a security. Bonds and funds cannot inherit stock assumptions such as share count or simple price-only return. Preserve public handles and old stock routes through compatible adapters. Add validation for impossible or missing terms before publication.

**Player and Admin experience.** Provide an instrument detail view with a clear type, trading eligibility, price basis, calendar and relevant disclosures. Empty or unsupported fields are omitted or labelled, never fabricated. Admin reviews listing readiness and can halt an instrument under authorized policy.

**Acceptance and adversarial tests.** Test a common share, bond, fund and nontradable index; invalid ticker mapping; missing terms; stale quotes; inactive issuer; and a halted instrument. Retain finite common-share custody and same-game isolation.

**Exit gate.** The shared Market UI can represent several instrument types honestly without changing certified immediate stock settlement.

### CAP-03 — Implement reservations and a bounded limit-order ticket

**Dependencies:** `CAP-02`, `FND-03`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Introduce explicit order states: submitted/open, partially filled only when later enabled, filled, cancelled, expired and rejected. Freeze side, quantity, listing currency, limit, expiry and policy at acceptance. Reserve exact maximum buy obligation plus authorized fees through canonical Checking holds, or reserve owned sell quantity through the custody owner. Default first release to listing-currency funds and no shorting. Currency conversion occurs explicitly before creating the hold; an expiring retail FX quote is not a standing multi-day funding promise.

**Player and Admin experience.** Show limit versus current price, held funds/quantity, expiry and the fact that execution is not guaranteed. Keep immediate orders separate and unchanged. Admin can monitor outstanding exposure and reject/halt via reasoned commands, not edit the order book directly.

**Acceptance and adversarial tests.** Race multiple orders against one balance/holding; retry a submission; use wrong currency; expire during a closed exchange; attempt unsupported margin or another player’s position. A rejected order must leave no durable hold.

**Exit gate.** Open orders cannot exceed available money or custody, and every reservation has a terminal release or settlement path.

### CAP-04 — Implement tick execution, cancellation, expiry and partial fills

**Dependencies:** `CAP-03`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Specify price/time priority and a bounded simulation liquidity policy rather than imply a real exchange order book. Evaluate only after an order’s accepted timestamp against eligible authoritative ticks, preventing hindsight fills. Atomically consume reservation, post cash, transfer custody, create fill/receipt and update remaining quantity. Add cancellation and expiry races before partial fills. Enable partial fill only after quantity, price, fee rounding and remainder-hold behavior are proven; otherwise retain all-or-none execution.

**Player and Admin experience.** Provide an order history with accepted, held, partially filled, filled, cancelled and expired evidence. Show average execution price and remaining commitment separately. Cancellation response distinguishes cancelled, already final and already filled.

**Acceptance and adversarial tests.** Test fill/cancel/expiry races, multiple workers, tick replay, price gaps, exchange closure, partial-fill rounding, insufficient remaining funds and message loss after fill commit. Sum of fills plus remaining quantity must equal ordered quantity under the lifecycle rules.

**Exit gate.** Orders have a complete economically reconciled lifecycle; no ghost holds, negative custody or retroactive fills remain.

### CAP-05 — Add a minimal fixed-income market

**Dependencies:** `CAP-04`, `MAC-05`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Implement fixed-rate bullet bonds first with face value, issue price, coupon schedule, maturity, day-count convention, minimum denomination and explicit default/recovery policy. Distinguish clean from dirty price, accrued interest, coupon rate and yield. Define record-date ownership and payment funding. A simulated issuer that cannot pay enters a bounded credit-event path; unpaid coupon cannot be manufactured into player cash. Use a versioned, disclosed curve/spread model and retain immutable payment occurrences.

**Player and Admin experience.** Show next coupon, maturity, accrued interest, principal, price basis and a plain explanation of interest-rate/default risk. Admin monitors funding and due payments. Buying a bond must review the exact total cash price, not just its quoted clean price.

**Acceptance and adversarial tests.** Test maturity on a holiday, leap-year accrual, ownership transfer around record time, duplicate coupon processing, unfunded issuer, early default and recovery. Reconcile principal/coupon/deductions with Banking receipts and holdings.

**Exit gate.** A bond can be issued, traded, pay or miss a coupon, mature/default and recover under one coherent lifecycle.

### CAP-06 — Add funds, indexes and commodity reference series

**Dependencies:** `CAP-05`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Distinguish three mechanisms: a nontradable reference index; a genuinely backed fund with defined units and custody; and a commodity reference series with no physical delivery. Start with a small equity-only fund if broader backing is not ready. Define basket weights, rebalance timing, fees, distributions, NAV inputs, missing-price policy and FX valuation fixing. Do not create a tradable promise without specifying its backing, issuer and settlement model. Reuse finite common-share custody for underlying Business shares.

**Player and Admin experience.** Players see constituents, concentration, valuation time, fees and whether an item is tradable. Admin can inspect NAV provenance and halt new transactions on stale constituents. Benchmark performance uses a clear base and return convention.

**Acceptance and adversarial tests.** Test constituent halt, missing price, corporate action, rebalance replay, currency mismatch, stale FX, duplicate distribution and fund ownership consistency. Fund units and underlying custody cannot both be treated as unencumbered player assets.

**Exit gate.** Each added product has a defensible lifecycle and valuation; reference series are never mislabelled as purchasable assets.

### CAP-07 — Implement Analyst forecast commitment using existing stocks

**Dependencies:** `CAP-02`, `FND-02`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Create a forecast containing asset, opinion, target, horizon, confidence, thesis, risks and invalidation condition. Capture authoritative baseline price/tick and deadline at submit; keep immutable revision history and lock before future evaluation data is available. Limit submissions by player/asset/horizon. Make visibility policy explicit, such as delayed publication after lock, to reduce copying. No position ownership is required to participate and forecasts do not move prices automatically.

**Player and Admin experience.** Add an Analyst workspace within the Market experience, with a structured submission and an explanation field. Show active forecasts, lock time and what evidence will be used to evaluate them. Admin can review reasoning separately from price accuracy and void an invalid case with a reason.

**Acceptance and adversarial tests.** Test late entry, repeated submissions, horizon alteration, missing baseline tick, halted asset, future-data leakage, edited thesis after lock and cross-player access. A saved draft is not presented as a locked submitted forecast.

**Exit gate.** Students can commit a research thesis against a reproducible baseline before the outcome occurs.

### CAP-08 — Evaluate forecasts fairly and build analyst reputation

**Dependencies:** `CAP-07`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Choose and version a transparent scoring policy before accepting scored submissions. Separate directional accuracy, target error, confidence calibration and teacher-reviewed reasoning. Handle missing/halted evaluation ticks, splits/distributions where supported, delisting and invalidation with an explicit pending/void policy. Store component calculations and evaluation evidence; corrections append a new version. Prefer bounded credentials/reputation over cash incentives for trading volume or lucky gains. Any reward is issued by Progression once.

**Player and Admin experience.** Show forecast versus outcome, score components and a reflection prompt. Teacher rubric evidence stays separate from deterministic market accuracy and actual course grading. Rankings require comparable horizon/sample size and should not imply expertise from one lucky forecast.

**Acceptance and adversarial tests.** Test replayed evaluation, manipulated confidence, copied forecasts, zero/near-zero reference prices, price adjustments, missing future ticks and evaluation-policy updates. Benchmark constant guessing and excessive high-confidence strategies before approving incentives.

**Exit gate.** A forecast result is reproducible, explainable and educational; rewards cannot be farmed through submission volume.

### CAP-09 — Certify market expansion and educational value

**Dependencies:** `CAP-04`, `CAP-05`, `CAP-06`, `CAP-08`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Run end-to-end multi-player and cross-currency scenarios covering all included products, order states, corporate-share custody, delayed payments and forecast evaluation. Stress the active-instrument budget rather than activate the entire definition library. Measure outstanding holds, cancellation latency, fill consistency, valuation coverage and speculative reward exploits. Distinguish model-based liquidity simulation from actual market matching.

**Player and Admin experience.** Observe beginners reviewing a limit order, reading a bond quote, distinguishing an index from a fund and learning from an inaccurate forecast. Admin completes halt, coupon-failure review and evaluation-void workflows. Preserve the familiar immediate trading experience.

**Acceptance and adversarial tests.** Require funds/custody conservation, one terminal effect per operation, no speculative grade linkage, no impossible fund backing, no stale fabricated valuation and no regression in Business common-share authority. Keep excluded complex instruments visibly absent.

**Exit gate.** Advanced products ship in separate certified slices; Analyst may ship early, while full track completion waits for every included lifecycle.

## Source basis

**R7 — Existing financial-market expansion authority.** Existing EXP-MKT program, proposed authority/registration rules and explicit exclusions. Reconcile live owner status rather than treating historical branch status as current. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/docs/markets/full-financial-markets-expansion-authority-v1.md`.

**R9 — Canonical FX authority scope.** Single currency/fixing authority, 08:00 game-local cadence, immutable provenance and pause rules. Historical PR labels are not current merge status. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/docs/roadmaps/canonical-fx-authority-scope-v1.md`.



---

# PROG — Progression, Credentials and Economic Pathways

Status: **PLANNED** · Baseline: `22dc9ce5023eb200a6608d5bb90a9ac30cb36c90` · Planning date: 2026-09-20

## Intended result

Make progress unlock meaningful actions and learning pathways while preserving the existing XP, reputation and achievement systems.

## Verified starting point and limits

The repository’s progression ledger describes a bounded 20-level curve, skill prerequisites, atomic unlocks/reward claims, four reputation families and replay-resistant event ingress. Its historical workflow statuses are not fresh completion evidence. Do not replace this with another level curve or duplicate event awards.

## Ownership and integration boundaries

Progression owns earned qualifications, XP, skills, achievements and approved reputations. A receiving feature owns authorization and offer eligibility. Contracts owns assessed submissions; Analyst owns deterministic forecast evaluation; teacher grading remains separate. Profile only displays approved public projections.

## Candidate records and interfaces

Reuse current skills, achievements, profiles, event ingress and corrections. Candidate extensions: versioned eligibility requirement, credential evidence reference, entitlement projection, expiry/renewal record, retraining request and historical grant provenance.

Candidate commands: evaluateEligibility, awardCredentialFromVerifiedEvidence, renewCredential, requestRetraining and reviewCorrection. Existing unlock/claim commands remain canonical; browser buttons do not grant an entitlement by themselves.

## Content and fixture scope

Map every existing skill to a real consumer or label it informational. Proposed pilot pathways: employment qualification, better research tools, advanced Contracts and institutional introductions. Use no more new skills than the receiving features can actually support.

## Explicit exclusions

No second XP/achievement ledger, automatic course grades from wealth or forecast accuracy, unbounded profit multipliers, permanent career lockout, retroactive grant removal without policy, or meaningless skill labels with no real effect.

## Milestones

### PROG-01 — Map existing progression to actual gameplay consumers

**Dependencies:** `FND-01`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Inventory the current level curve, events, caps, skills, rewards, reputations, correction commands and browser routes. For each skill, identify its real effect, responsible domain, eligibility check and player explanation. Trace event emission from successful domain actions rather than assuming an event name proves a working integration. Mark purely descriptive benefits honestly. Preserve existing earned rights and historical reward claims.

**Player and Admin experience.** Create a coverage matrix showing skill, source evidence, available action and missing adapter. Admin can identify a skill advertised as practical but not consumed. Player copy must not promise access that the receiving feature cannot provide.

**Acceptance and adversarial tests.** Trace at least one earn/unlock/use path for every current track; test duplicate source events and corrections; verify a paused game cannot grant a new award. Do not treat a fixture-only event as connected runtime proof.

**Exit gate.** Every current progression item is classified as operational, informational, pending consumer or obsolete, with a bounded remediation owner.

### PROG-02 — Implement a shared eligibility read contract and domain enforcement

**Dependencies:** `PROG-01`, `FND-04`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Define an allowlisted eligibility response with eligible, missing requirements, source version and safe reasons. Reuse existing skill/credential records; cache only with invalidation and never use a stale cache as mutation authority. Receiving domains validate requirements at command time. Handle grandfathering, expiry and revocation separately from general XP levels. The contract is a small policy interface, not a new all-purpose permissions framework.

**Player and Admin experience.** Show exactly which qualification is needed and how it can be earned. An unavailable service differs from ineligibility. Admin reviews the effect of a new requirement before it applies to future offers or actions.

**Acceptance and adversarial tests.** Test a forged browser level, stale unlock state, expired credential, service failure, policy change between preview/confirm, wrong-game credential and grandfathered agreement. Existing signed jobs and paid rights are not silently invalidated.

**Exit gate.** A practical unlock can be proven at the receiving command boundary and explained in the UI.

### PROG-03 — Connect credentials to real careers, Contracts and tools

**Dependencies:** `PROG-02`, `LIFE-03`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Wire a small set of current skills into employment eligibility, advanced Contract availability, Crafting recipes where already supported, research views and institutional introductions. Benefits prioritize new choices and information rather than guaranteed returns. Each adapter consumes a public Progression contract and retains the receiving domain’s cost, stock, location and safety checks. Add future Market/Analyst integrations when their own milestones are accepted.

**Player and Admin experience.** Present pathways such as qualification, eligible job, experience and specialization. Show a preview of the actual unlocked action and its remaining requirements. Admin can test representative profiles and identify unreachable combinations before enabling content.

**Acceptance and adversarial tests.** Exercise low-level access to basic income, cross-path mobility, multiple prerequisites, credential expiry, saved offers and conflicts with country/residency restrictions. Unlocking never bypasses insufficient funds, unavailable stock or legal-in-game travel rules.

**Exit gate.** At least four real actions are tied to verified progression without creating a permanent advantage or circular prerequisite dead end.

### PROG-04 — Add evidence-based learning milestones

**Dependencies:** `PROG-02`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Define credential evidence using existing Contract review, completed economic actions and bounded Analyst outcomes when available. Reward understanding, justified decisions, recovery and reflection instead of number of clicks or speculative profit. Keep automatic event completion distinct from staff-reviewed reasoning. Record the rubric/policy version and evidence receipt behind each award; do not duplicate private answer keys in the Player DTO.

**Player and Admin experience.** Show what evidence is required, what has been recorded and what remains under review. Admin can approve, return for revision or correct an award with a reason. Coursework grading is a separate decision, never inferred from in-game wealth.

**Acceptance and adversarial tests.** Test identical submissions, unreviewed claims, delayed approvals, revoked source evidence, cross-game copying and repeated reward claims. A market loss with good reasoning must remain compatible with a learning achievement.

**Exit gate.** Each new achievement has a measurable, legitimate evidence source and a transparent review path.

### PROG-05 — Support retraining and specialization changes

**Dependencies:** `PROG-03`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Define switching rules, prospective skill allocation changes, bounded retraining requirements and optional credential renewal. Preserve lifetime completion and already-claimed reward history. Decide explicitly which entitlements survive a respecialization and which new actions become unavailable; accepted contracts and owned items cannot disappear. Keep beginner access and recovery routes independent of advanced specialization.

**Player and Admin experience.** Offer a before/after comparison of active tools and requirements before confirmation. Players can change direction without guessing hidden penalties. Admin sees exceptional restoration requests and cannot erase historical achievements as a shortcut.

**Acceptance and adversarial tests.** Test repeated respec/claim loops, concurrent unlocks, job eligibility after respec, held orders, owned advanced items and content retirement. Verify the same original achievement cannot award its bonus again.

**Exit gate.** Players can change economic direction without duplicating rewards or losing valid historical rights.

### PROG-06 — Rebalance exploitation, catch-up and pathway concentration

**Dependencies:** `PROG-04`, `PROG-05`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Extend current caps and simulations with new Life, Relationship and Analyst sources. Detect circular farming such as repeated transfers, self-dealing, trivial chat, low-value trade churn and colluding confirmations. Use verified outcomes, source uniqueness, meaningful cooldowns and diminishing eligible opportunities. Preserve existing earned XP; policy changes apply prospectively. Test catch-up support without requiring constant activity or advantaging one country/class irreversibly.

**Player and Admin experience.** Explain a cap or delayed award in understandable terms. Do not expose an opaque public trust score as a punishment. Admin can inspect the source trace and apply an audited correction where legitimate activity was misclassified.

**Acceptance and adversarial tests.** Run active/inactive cohorts, coordinated players, duplicate delivery, event reordering and adversarial loops. Compare pathway diversity and time-to-access distributions against the current baseline. Existing cap thresholds are not relaxed just to pass a new model.

**Exit gate.** New sources preserve bounded rewards and multiple viable development paths under adversarial and ordinary play.

### PROG-07 — Certify useful progression across the product

**Dependencies:** `PROG-06`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Execute end-to-end earn, inspect, unlock, use, retrain and correction journeys through actual receiving features. Verify event replay, cross-domain versioning, migrated histories and privacy. Retain the established 20-level system unless a separately justified curve change is approved. Build a coverage report linking every active practical skill to a tested real action.

**Player and Admin experience.** Test whether beginners understand their next attainable milestone and experienced players can identify meaningful specialization choices. Admin verifies an award without reading raw database IDs or manually posting XP.

**Acceptance and adversarial tests.** Require one effect per verified source, no skill with a false practical promise, no permanent basic-income lockout and no leak of private progress/review details to public profiles. Demonstrate a returning player can re-enter a useful pathway.

**Exit gate.** Progression is accepted by its effect on gameplay and learning, not by the number of badges or levels added.

## Source basis

**R8 — Progression scope and acceptance ledger.** Documents existing scope, 20-level curve, awards, reputation and event boundaries. Historical workflow status and numerical results were not re-certified. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/docs/workstreams/progression-preconvergence-v1.md`.



---

# UX — Player Identity, Information and UX Closure

Status: **PLANNED** · Baseline: `22dc9ce5023eb200a6608d5bb90a9ac30cb36c90` · Planning date: 2026-09-20

## Intended result

Make the player’s situation understandable, their identity persistent and every visible action truthful, accessible and recoverable.

## Verified starting point and limits

The current profile page presents identity, country, game/session details and refresh/sign-out. However, the prior audit’s blanket dead-control claim was incorrect: local-controls-flow.js is installed from main.js and implements export, Market search and range changes. Its range mapping uses fixed sample counts, and export converts amounts through Number; those deserve precision/semantics review rather than a claim that no implementation exists.

## Ownership and integration boundaries

Player Terminal owns presentation and local interaction state, not economic truth. Backend domains own queries and mutations. Profile displays public approved achievements/identity; Messaging/Notifications own delivery/read state; Banking owns transaction records. Preserve Admin V2, authentication boundaries, the World map and existing design tokens.

## Candidate records and interfaces

Candidate additive state: player display preferences, selected earned cosmetics, notification preferences, accessible read-model metadata and public accomplishment projection. Never introduce a parallel wallet, action result cache treated as authority or a public private-finance profile.

Candidate interfaces: readPlayerLifeOverview, updateDisplayPreferences, selectEarnedCosmetic, readNotificationHistory and exportOwnLedgerRange. Actual endpoints require contract audit; existing local search/export should be reused where accurate.

## Content and fixture scope

Test real routes at narrow mobile, desktop, zoom, keyboard-only, screen reader, reduced motion, long text and supported languages. Use a small set of synthetic beginner, established, distressed and returning-player personas, not real students’ profiles.

## Explicit exclusions

No another full shell rewrite, hidden money controls, decorative social feed, unrestricted attachment uploader, exposure of private balances/messages/reputation, or placeholder buttons presented as working capabilities.

## Milestones

### UX-01 — Audit actual interaction wiring and write a closure ledger

**Dependencies:** `FND-01`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Trace each visible control from render to capture-phase handler, API descriptor, public route, authorization, result mapping and refresh. Classify working, incorrect, incomplete, intentionally disabled or obsolete. Include feature-installed handlers before reading app.js fallbacks. Inventory loading, empty, disabled, error, stale, processing and replay states. Review messaging search separately; attachments remain a policy decision, not an automatic implementation task.

**Player and Admin experience.** Produce a screen-by-screen action ledger with a real reproduction and outcome. Remove only demonstrably obsolete controls or give an accurate disabled reason. Preserve existing good flows and the interactive map rather than replacing the shell.

**Acceptance and adversarial tests.** Exercise actual browser clicks and keyboard submissions in the production entrypoint under synthetic authentication. Test route changes, reinstalls and duplicate event handlers. A fallback string alone cannot substantiate a dead-button finding.

**Exit gate.** Every visible interactive control has a truthful disposition and an acceptance case.

### UX-02 — Fix chart semantics, search coverage and export fidelity

**Dependencies:** `UX-01`, `FND-03`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Change chart windows to use timestamped authoritative series and actual time ranges, with explicit downsampling/coverage, rather than equating 24 samples to one day or 365 samples to a year. Preserve gaps and unknown history instead of inventing zero prices. Distinguish searching loaded rows from server-wide search. Export exact decimal text, correct currency, stable ordering, coverage range and pagination. Review untrusted text for formula injection; choose and test a target-aware safe export strategy rather than rely only on comma/quote escaping.

**Player and Admin experience.** Show as-of time, available history and whether search/export covers the current page or a complete selected range. Offer clear empty results and partial/unavailable data. Keep current functional local handlers while improving their semantics.

**Acceptance and adversarial tests.** Test irregularly spaced ticks, missing days, exchange closures, sparse series, huge exact decimals, multi-currency amounts, long Unicode descriptions, leading formula characters, repeated pagination and concurrent data updates. Do not claim a confirmed exploit without establishing an input path.

**Exit gate.** Range labels mean actual time windows; search scope is honest; downloaded records preserve authorized data and monetary precision.

### UX-03 — Build an integrated Life overview and useful profile

**Dependencies:** `UX-01`, `LIFE-04`, `PROG-02`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Create a read model combining Signals, Opportunities, Obligations, Consequences and Position from canonical sources. Profile adds earned credentials, selected badges/titles, career summary, residency summary and major accomplishments. Show private finances and commitments only to the player and authorized staff. Separate display-name preferences from immutable identity and mutable public Player ID. Use earned catalog cosmetics with moderation/availability rules, not arbitrary uploaded assets in the first release.

**Player and Admin experience.** Players should answer: What changed? What requires attention? What can I do next? What have I achieved? Keep current account/session controls. Add privacy-preview controls for any public profile; financial distress, private reputation, grades and messages are not public by default.

**Acceptance and adversarial tests.** Test missing one upstream service, stale data, revoked cosmetic, renamed Player ID, cross-game profile, very long names and a new player with no achievements. A zero value must not stand in for unavailable money.

**Exit gate.** The profile reflects a persistent game identity and the overview provides a usable next decision without becoming a second economic system.

### UX-04 — Upgrade notifications into an actionable attention system

**Dependencies:** `UX-01`, `FND-04`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Extend existing notification delivery/read history with categories, severity, source links, grouping, expiry and user preferences where justified. Count unread state from the authoritative summary, not the length of a paginated list. Avoid marking a notification read merely because it rendered; define an explicit viewed/acknowledged rule. Group repeated low-priority updates while preserving critical obligations and an accessible audit trail.

**Player and Admin experience.** Add a searchable/filterable history and action links for bills, offers, completed orders, Contract review and relevant World changes. Let players mute optional categories or choose digests without concealing unavoidable commitments. Admin can diagnose delivery without reading unrelated private messages.

**Acceptance and adversarial tests.** Test pagination, mark-read races, multiple tabs, duplicate events, expired deep links, changed permissions, missed weeks and empty state. One user preference change cannot affect another game or player.

**Exit gate.** Notifications help players act rather than merely increase unread counts; critical items remain visible without modal overload.

### UX-05 — Unify review-confirm-receipt and recovery patterns

**Dependencies:** `UX-02`, `UX-03`, `UX-04`, `LIFE-05`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Apply a shared interaction pattern to new jobs, leases, bill payments, character offers, credentials and existing commerce: glance, inspect, act, review, confirm and inspect consequence. Preserve exact costs, funding source, expiry and irreversible terms before confirmation. Keep browser form drafts separate from committed server state. After ambiguous failure, reconcile the existing operation ID rather than generating a new payment automatically.

**Player and Admin experience.** Use dropdowns, constrained numeric fields and clear buttons for actions; reserve free text for reasoning, messages and approved notes. Provide back/cancel controls, stable focus and pending-but-committed messaging. Hide secondary detail only when decision-critical information stays visible.

**Acceptance and adversarial tests.** Test double-click, Enter submission, browser back/refresh, second-tab completion, failed refresh after successful mutation, a stale quote and network loss. Ensure no blanket retry changes a non-idempotent action into a duplicate.

**Exit gate.** Material actions follow a consistent truthful flow and recover safely without the player needing technical knowledge.

### UX-06 — Complete accessibility and responsive acceptance

**Dependencies:** `UX-05`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Apply a WCAG 2.2 AA-oriented test plan across changed screens, combining automated checks with manual keyboard and assistive-technology review. Verify focus visibility/order, error association, status announcements, labels, touch target spacing, contrast, text scaling, reduced motion and responsive reflow. Retain the existing map’s keyboard/hit areas; a decorative redesign is out of scope. Avoid relying on color alone for profit/loss or severity.

**Player and Admin experience.** Test the actual review forms, timed quotes, tables, drawers, dialogs and navigation. Players must be able to inspect terms and cancel with a keyboard. Admin tables must remain usable at zoom and on supported smaller screens.

**Acceptance and adversarial tests.** Exercise narrow mobile, portrait/landscape, 200%/400% zoom where applicable, screen-reader live regions, long translated text and loading/error states. Record manual exceptions; passing an automated scanner alone is not a compliance certificate.

**Exit gate.** Changed workflows satisfy the adopted accessibility criteria with documented manual evidence and no regression to protected map/navigation behavior.

### UX-07 — Observe multiplayer usability and information freshness

**Dependencies:** `UX-05`, `REL-04`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Test beginners, experienced players, distressed players and returning players on realistic multi-user sessions. Check that updates to vacancies, housing capacity, market prices, messages and bills reach the right surfaces without full-page refresh dependence. Prefer targeted reconciliation and preserve manual refresh fallback. Measure actual request/query counts and protect existing performance budgets rather than inventing new thresholds after failures.

**Player and Admin experience.** Observe whether participants can find income, understand a due bill, compare a job/housing choice, ask a character a useful question and locate a completed receipt. Admin should identify stuck players and operational failures without a separate spreadsheet.

**Acceptance and adversarial tests.** Run concurrent supported classroom-load profiles, tab switching, reconnect, expired session, stale market data and simultaneous claims. Capture task completion, misunderstanding, unnecessary clicks, focus loss, p95 latency and console errors.

**Exit gate.** Prioritized usability defects have reproducible cases and owners; no critical decision depends on a misleading stale view.

### UX-08 — Close UX debt and certify the complete player experience

**Dependencies:** `UX-06`, `UX-07`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Re-run the action closure ledger against the accepted build and production entrypoints. Remove truly unreachable obsolete fallback code only after proving all supported callers use the canonical path. Update current documentation and keep historical docs labelled as historical. Complete per-feature screenshots, manual accessibility notes and recovery recordings using synthetic data. Preserve architectural ceilings and reduce local debt where the changed feature makes that possible.

**Player and Admin experience.** Walk through onboarding, earning, spending, communicating, learning and returning after absence. Each route is either useful and functional, clearly unavailable for a valid policy reason, or absent. The player should not see developer diagnostics outside the approved environment.

**Acceptance and adversarial tests.** Require zero known false-success flows, zero actionable controls with no legitimate implementation, exact money/history semantics, complete session-expiry behavior and no exposed internal IDs. Confirm no hidden duplicate handlers remain.

**Exit gate.** The Player experience is accepted as a coherent product, with remaining optional enhancements explicitly separated from defects.

## Source basis

**R3 — Installed local-controls implementation.** Export, local Market search and range handler; range limits currently expressed as sample counts; CSV amount conversion uses Number. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/player-terminal/src/features/local-controls/local-controls-flow.js`.

**R4 — Player entrypoint wiring.** Imports and installs installLocalControlsFlow; verified by current-main search excerpts. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/player-terminal/src/main.js`.

**R10 — Current Player navigation registry.** Inspected lines 1–37 show Work/Finance/World/Profile destinations; supports navigation-gap assessment only. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/player-terminal/src/components/layout.js`.

**R11 — Current Player Profile page.** Identity/country/game/session display and refresh/sign-out controls; development-only diagnostics. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/player-terminal/src/pages/profile-page.js`.

**E2 — OWASP — CSV Injection.** Primary security guidance for formula-injection threat modelling and target-aware export testing. No blanket claim of a proven Econovaria exploit. Source: `https://community.owasp.org/attacks/CSV_Injection`.

**E3 — W3C WAI — Understanding WCAG 2.2.** Informative guidance supporting the proposed accessibility acceptance plan, not a certification of conformance. Source: `https://www.w3.org/WAI/WCAG22/Understanding/`.



---

# INT — Cross-track integration and final certification

Status: **PLANNED** · Baseline: `22dc9ce5023eb200a6608d5bb90a9ac30cb36c90` · Planning date: 2026-09-20

## Intended result

Deliver useful experiences incrementally and distinguish completed code from a certified runtime.

## Verified starting point and limits

These are proposed program gates, not existing completed phases. Keep Phase 15’s release evidence and authorization requirements intact.

## Ownership and integration boundaries

A single integration owner coordinates cross-track acceptance and shared-file merges. Domain owners retain their state and commands.

## Candidate records and interfaces

Versioned scenario fixture, exact-source evidence manifest, defects ledger and release mapping.

No new runtime command authority is created by these milestones.

## Content and fixture scope

Use synthetic players and approved fictional-world content.

## Explicit exclusions

No claim of production readiness from unit tests, documentation, fixture-only screenshots or a simulated 365-day run.

## Milestones

### PILOT-01 — Prove the first complete four-week player journey

**Dependencies:** `LIFE-05`, `REL-04`, `WORLD-03`, `PROG-03`, `UX-05`, `MAC-02`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Run an accelerated four-week scenario in two contrasting countries. A player obtains a job, receives two or more pay periods, chooses housing, pays recurring costs, responds to a known route/price disruption, uses a character conversation and earns a practical qualification. Use the currently authorized macro/world model for active effects; candidate MAC-02 calculations remain shadow until MAC-07 is approved. This is the first coordinated product release target, not a requirement to finish all advanced finance first.

**Player and Admin experience.** Player and Admin journeys must both complete through supported interfaces. Include a second player competing for the same vacancy/housing and a returning player. Capture how the scenario changed the available choices, not merely a page count.

**Acceptance and adversarial tests.** Require canonical receipts, correct balances/custody, one effect per source, no cross-game leakage, no impossible offer, a non-borrowing recovery option and manageable notifications. Run loss-of-response and worker-restart variants.

**Exit gate.** A small coherent game loop is accepted before adding more countries, products or content volume. Simulated scenario duration is not a delivery-time estimate.

### SYSTEM-01 — Certify the seven-track program and hand off release evidence

**Dependencies:** `PILOT-01`, `LIFE-08`, `MAC-08`, `REL-08`, `WORLD-08`, `CAP-09`, `PROG-07`, `UX-08`. **Relative size:** L. **Status:** PLANNED.

**Implementation scope.** Re-audit the exact merged source and run all applicable retained and new gates. Reconcile definitions, migrations, active feature versions, queues, read models and ownership. Verify every accepted milestone against evidence rather than checklist prose. Test populated forward migrations and historical-read compatibility, then run authorized isolated staging and runtime checks under the release program. Document remaining exclusions and rollback/forward-remediation boundaries.

**Player and Admin experience.** Complete the whole player/admin loop with multiple games, late joiners, a pause, a content upgrade and a disruption/recovery cycle. Operations can find stalled work, disable new feature activity safely and preserve previously issued rights. Keep class learning outcomes separate from financial winnings.

**Acceptance and adversarial tests.** Require exact-source tests, migration replay, two-game isolation, canonical monetary/custody reconciliation, deterministic simulations, no unresolved critical defects, accessibility evidence, operational recovery and sanitized artifact provenance. Runtime verification must record actual environment, versions and observed results.

**Exit gate.** Repository-complete, merged, staging-certified and production-certified are separately evidenced. Production activation occurs only through the separately authorized release process; this roadmap never self-authorizes it.

## Source basis

**R1 — Fresh main branch resolution.** Resolved on 2026-09-20 to 22dc9ce5023eb200a6608d5bb90a9ac30cb36c90; not a runtime certification. Source: `https://api.github.com/repos/kohnerbouchard-star/Student-Profile/branches/main`.



---

# Dependency and evidence manifest

The companion `roadmap-manifest.json` contains every milestone, its exact prerequisite IDs, full scope, Player/Admin surfaces, tests and exit gate. The dependency graph has been mechanically checked for missing references and cycles. All milestones remain PLANNED.

## One valid dependency-safe ordering

This is not a requirement to serialize every item; independent milestones can run in parallel within the work-in-progress limit.

```text
FND-01 → FND-02 → FND-03 → REL-01 → CAP-01 → PROG-01 → UX-01 → FND-04 → LIFE-01 → MAC-01 → WORLD-01 → UX-02 → LIFE-02 → MAC-02 → REL-02 → WORLD-02 → CAP-02 → PROG-02 → UX-04 → LIFE-03 → MAC-03 → MAC-04 → REL-03 → REL-07 → WORLD-03 → CAP-03 → CAP-07 → PROG-04 → LIFE-04 → LIFE-06 → MAC-05 → REL-04 → WORLD-07 → CAP-04 → CAP-08 → PROG-03 → LIFE-05 → MAC-06 → REL-06 → WORLD-04 → WORLD-05 → CAP-05 → PROG-05 → UX-03 → LIFE-07 → MAC-07 → REL-05 → WORLD-06 → CAP-06 → PROG-06 → UX-05 → LIFE-08 → MAC-08 → REL-08 → WORLD-08 → CAP-09 → PROG-07 → UX-06 → UX-07 → PILOT-01 → UX-08 → SYSTEM-01
```

# Full source register

**R1 — Fresh main branch resolution.** Resolved on 2026-09-20 to 22dc9ce5023eb200a6608d5bb90a9ac30cb36c90; not a runtime certification. Source: `https://api.github.com/repos/kohnerbouchard-star/Student-Profile/branches/main`.

**R2 — Merged PR #643 — durable story-character reply engine.** Merged 2026-08-18. Metadata describes existing intent/topic classification, memory, queue, coalescing, retry and kill switch. Historical staging claims were not rerun for this plan. Source: `https://github.com/kohnerbouchard-star/Student-Profile/pull/643`.

**R3 — Installed local-controls implementation.** Export, local Market search and range handler; range limits currently expressed as sample counts; CSV amount conversion uses Number. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/player-terminal/src/features/local-controls/local-controls-flow.js`.

**R4 — Player entrypoint wiring.** Imports and installs installLocalControlsFlow; verified by current-main search excerpts. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/player-terminal/src/main.js`.

**R5 — Daily country macro progression migration.** Inspected source lines 172–218 show 10% movement toward configured targets. Locate any superseding writer before implementation. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/backend/supabase/migrations/20260810120000_add_daily_country_macro_runtime_v1.sql`.

**R6 — One-year real-time content/cadence contract.** Requirements for recurrence, seasonal activity, opportunity coverage and recovery; not a fresh inventory of implemented features. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/docs/seed-content/17-one-year-real-time-content-and-market-cadence-contract-v1.md`.

**R7 — Existing financial-market expansion authority.** Existing EXP-MKT program, proposed authority/registration rules and explicit exclusions. Reconcile live owner status rather than treating historical branch status as current. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/docs/markets/full-financial-markets-expansion-authority-v1.md`.

**R8 — Progression scope and acceptance ledger.** Documents existing scope, 20-level curve, awards, reputation and event boundaries. Historical workflow status and numerical results were not re-certified. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/docs/workstreams/progression-preconvergence-v1.md`.

**R9 — Canonical FX authority scope.** Single currency/fixing authority, 08:00 game-local cadence, immutable provenance and pause rules. Historical PR labels are not current merge status. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/docs/roadmaps/canonical-fx-authority-scope-v1.md`.

**R10 — Current Player navigation registry.** Inspected lines 1–37 show Work/Finance/World/Profile destinations; supports navigation-gap assessment only. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/player-terminal/src/components/layout.js`.

**R11 — Current Player Profile page.** Identity/country/game/session display and refresh/sign-out controls; development-only diagnostics. Source: `https://github.com/kohnerbouchard-star/Student-Profile/blob/22dc9ce5023eb200a6608d5bb90a9ac30cb36c90/player-terminal/src/pages/profile-page.js`.

**E1 — PostgreSQL — Transaction Isolation.** Primary technical guidance consulted for concurrency/isolation and whole-transaction retry principles; does not identify the deployed database version. Source: `https://www.postgresql.org/docs/current/transaction-iso.html`.

**E2 — OWASP — CSV Injection.** Primary security guidance for formula-injection threat modelling and target-aware export testing. No blanket claim of a proven Econovaria exploit. Source: `https://community.owasp.org/attacks/CSV_Injection`.

**E3 — W3C WAI — Understanding WCAG 2.2.** Informative guidance supporting the proposed accessibility acceptance plan, not a certification of conformance. Source: `https://www.w3.org/WAI/WCAG22/Understanding/`.

**E4 — OWASP — LLM Prompt Injection Prevention.** Primary guidance for optional generative NPC wording: untrusted input separation, output validation and least privilege. Source: `https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html`.
