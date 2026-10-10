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
