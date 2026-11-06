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
