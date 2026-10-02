# DELIGHT — Player Flavor, Identity and Enjoyment

Status: **PLANNED** · Planning revision: **1.1.0-planning** · Approved planning addition: 2026-09-20

Repository baseline: `22dc9ce5023eb200a6608d5bb90a9ac30cb36c90`.
Roadmap predecessor: `7cbe0e3a51c9f08744a87e0df72dd535465026ca`, PR #690.

## Purpose and authority

Make Econovaria a life players want to explore, not a collection of financial forms. The intended loop is **Discover → Decide → Act → Consequence → Story → Progress → New opportunity**. The player should be able to recall a person, a place and a choice, not merely a balance change.

The product owner requested this eighth, cross-cutting track after reviewing the seven technical roadmaps. This document adds eight milestones; the complete program now has 70 milestones: 64 product milestones, four foundations and two integration gates. It extends the original technical master rather than replacing its economic, privacy or release rules. Read `11-player-value-gates.md` for mandatory acceptance additions across every track. All new gameplay remains planned. Enjoyment is a testable design hypothesis, not something certified by publishing this document.

## Preserve and extend

Reuse the existing character-reply engine and relationship memory, Story/World scheduling, canonical receipts, Progression achievements, Player Profile, notification delivery and accepted visual systems. DELIGHT coordinates experience and authored content; it does not own another wallet, ledger, inventory, scheduler, notification queue, achievement engine or unrestricted AI agent.

Life and Banking own the underlying payslip, tenancy, bill and payment facts. Market owns trade and forecast evidence. World owns visited locations and campaign history. Progression owns earned achievements and eligibility. Relationships owns permitted memory and reactions. UX renders these facts and honors accessibility and notification settings. A souvenir or title is not authority to grant cash, alter a price or bypass eligibility.

## Experience principles

Give players a life rather than only an account. Mark first work, first income, a new home, a qualification, a costly mistake and a recovery without moralizing about wealth. Make each country recognizable through places, everyday activities, institutions and varied characters. Mix pressure with calm, curiosity, humor and small positive surprises. Let relationships matter through remembered commitments and legitimate introductions, not hidden guaranteed profit. Offer optional collection and self-expression. Explain consequential callbacks where evidence supports them. Automate repetition while preserving decisions.

No paid random rewards, manipulative streak loss, compulsory daily login, artificial urgency, fabricated social activity or fear-of-missing-out progression. Optional enjoyment must not become a condition for grades, basic livelihood or essential recovery. Players can decline an invitation, mute flavor and take a break without an invisible penalty. Keep classroom suitability, safety and privacy ahead of engagement metrics.

## Candidate content and interfaces

Plan versioned presentation definitions for life milestones, receipt-backed memory cards, country flavor packs, character callbacks, cosmetic collections, micro-events and playtest records. Before proposing tables or routes, locate existing definitions and projections that can represent them. A presentation record should reference a stable public source key, definition version, earned/occurred time, visibility and relevant locale. Separate rendered prose from economic commands and immutable source evidence.

Content records specify the trigger, audience, prerequisites, location/campaign availability, expiry, cooldown, selection policy, consequence owner, skip behavior, correction policy, accessibility copy and notification budget. Any material reward needs a funded, domain-owned command and explicit review. Unfunded flavor produces no monetary result. Public cards never expose private balances, grades, messages, internal UUIDs or student identity data.

## Proposed initial content scope

Use a small quality-reviewed pilot before expanding volume: two contrasting countries; six meaningful life moments; a modest cosmetic selection; a local event; and several character callbacks. DELIGHT-03 defines the cultural boundaries for all ten countries, but runtime rollout can begin with two. Initial quantities are scoping candidates, not evidence of adequate year-long content. Expand only after playtesting and coverage checks.

## Milestones

### DELIGHT-01 — Map the emotional journey and player-value contract

**Dependencies:** `FND-01`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Map arrival, first opportunity, first income, first setback, first deliberate trade-off, midgame progress, crisis, recovery and the campaign ending. For each beat, state the player goal, intended feeling, meaningful choice, supporting system, consequence, friction risk and observation that could disprove the design. Define different paths for a cautious player, an explorer, a social player, an optimizer and a player returning after absence; do not infer those preferences from personal student data.

**Player and Admin experience.** Prototype an arrival introduction, first-payday moment and recovery conversation. Keep numerical facts readable beside the flavor. A confident player can bypass guidance; a beginner can reopen it. Admin can preview the experience without simulating a real award.

**Content deliverables.** An emotional-journey matrix, a short voice/tone guide, the player-value evidence card from the companion gate document and a first-pilot experience storyboard. Include quiet periods and satisfying stopping points, not constant escalation.

**Acceptance and failure tests.** Walk through failure and no-response alternatives. Ask whether each scene offers a choice, payoff, identity expression or less friction. Reject celebration before a transaction commits, shaming copy, dependency on wealth ranking, inaccessible effects and reward claims unsupported by the source domain.

**Exit gate.** Every planned player-facing improvement names its intended benefit and how it will be observed. Technical-enabler work names its downstream beneficiary without claiming a direct enjoyment improvement. This gate approves a hypothesis and test plan, not a claim that students already enjoy the game.

### DELIGHT-02 — Build a life timeline and receipt-backed memory artifacts

**Dependencies:** `DELIGHT-01`, `FND-04`, `UX-01`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Project meaningful, completed events into a private chronological life timeline: arrival, first employment, first posted pay, tenancy, qualification, relocation, debt repayment and recovery. Create readable offer-letter, payslip, lease, ticket, trade-confirmation and newspaper views over existing authoritative records. Do not create a parallel transaction history or treat rendered documents as settlement authority. Show pending offers as pending, not earned milestones.

**Player and Admin experience.** Players revisit or pin a memory and open its original receipt. Repeated paydays collapse into history; a first payday may receive a skippable, accessible celebration. Corrections link to the earlier record without silently rewriting financial facts. Admin previews templates and diagnoses missing projections through existing permissions.

**Content deliverables.** Six pilot milestone treatments, receipt layouts, private/public display rules and reduced-motion/static alternatives. Illustrative payday copy should combine posted pay, the next known obligation and a player-selected goal; never invent a goal or sum unlike currencies. A character congratulations message requires that character to know the fact legitimately.

**Acceptance and failure tests.** Test duplicate event delivery, refresh, account switching, revoked visibility, corrected records, out-of-order timestamps and missing source access. A duplicated source cannot award two stamps or show two first-payday celebrations. Unavailable data is shown as unavailable rather than fabricated.

**Exit gate.** A player can recount and revisit a meaningful milestone using source-backed history, and hiding or skipping its presentation leaves all gameplay intact.

### DELIGHT-03 — Give countries everyday culture and seasonal identity

**Dependencies:** `DELIGHT-01`, `WORLD-01`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Produce a canon-linked flavor brief for each of the ten countries: neighborhoods, transport, food, industries, local customs, public places, holidays, visual motifs, frustrations and multiple contrasting local viewpoints. Reconcile existing location, institution and character identifiers before authoring new entities. Distinguish presentation-only details from proposed economic mechanics and from locations that are actually visitable.

**Player and Admin experience.** World and travel views expose a short destination introduction, discoveries and approved local opportunities. A passport stamp requires a completed, eligible visit; inspecting a map is a discovery, not proof of travel. Admin previews seasonal availability and can withhold an unfinished country pack.

**Content deliverables.** Ten concise country briefs, fully playable samples for the two pilot countries, a seasonal calendar and a terminology/localization glossary. Everyday pleasures should be represented alongside scarcity and institutional tensions. Use the existing fictional canon, not stereotypes copied from real nationalities or an assumption that every resident agrees.

**Acceptance and failure tests.** Check geography, currency, institution links, chronology, readable names and accessible presentation. Test an event during a route closure and a local holiday during a paused game. Do not advertise an inaccessible location or invent a Store discount simply to make a festival sound appealing.

**Exit gate.** Pilot players can explain a distinctive reason to stay in or visit either pilot country beyond its numeric modifier. Final coverage requires coherent reviewed briefs for all ten; no untested claim of player preference is recorded.

### DELIGHT-04 — Add personal relationship rewards and visible callbacks

**Dependencies:** `DELIGHT-02`, `DELIGHT-03`, `REL-04`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Extend the existing reply and relationship mechanisms with authored callbacks to verified choices, fulfilled commitments, earlier advice, shared experiences and changes of circumstances. Separate what the player asserted from what the character can verify. A callback records the relevant source, character knowledge boundary and response template version. Where multiple causes contributed, use qualified explanation rather than claiming one player action caused everything.

**Player and Admin experience.** A familiar character congratulates a promotion, admits that earlier advice was wrong, offers a local introduction or recognizes help during a disruption. Replies may be warm, skeptical or humorous while preserving the character's established voice. Players may disagree, decline or leave the thread. Admin can inspect the sanitized trigger and report inappropriate copy through the existing moderation boundary.

**Content deliverables.** A callback matrix covering positive, neutral, refusal, absence, failure and recovery paths; alternate wording; and a small set of legitimate opportunity introductions. REL-05 remains the dependency for new actionable opportunities, while this milestone may reuse already-supported ones. Private relationship flavor cannot leak another player's information or unpublished tradable market facts.

**Acceptance and failure tests.** Test false player claims, stale or cancelled offers, simultaneous messages, repeated callbacks, lost relationships and amended source evidence. Fulfilling a friendship condition never directly creates money, a qualification or a vacancy. Material benefits require the receiving domain's current eligibility and command checks.

**Exit gate.** Reviewers can trace a personal callback to permitted history, and playtesters recognize the connection without reading implementation diagnostics.

### DELIGHT-05 — Add titles, collections and cosmetic self-expression

**Dependencies:** `DELIGHT-02`, `DELIGHT-03`, `PROG-02`, `UX-03`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Extend existing achievements, Inventory or entitlement definitions as appropriate for earned titles, passport stamps, event memorabilia, country frames and selected profile badges. Keep one authority for acquisition and ownership; a new profile display must not become a second achievement-award engine. Define acquisition, deactivation, correction, visibility, equip and unequip semantics.

**Player and Admin experience.** Players preview an earned cosmetic, select what represents them and decide what to show to same-game peers. Private is the default for a financial milestone. A debt-free badge must not reveal former balances, debts or repayment details. Equal-quality recognition should be available through exploration, reliability, learning, relationships and recovery, not wealth alone.

**Content deliverables.** A small starter collection with text equivalents and a distribution plan across multiple play styles. Use reviewed, fictional titles such as Trusted Negotiator or First Home; avoid stigmatizing failure or turning fictional conflict into a prestige requirement. Collections need an affordable acquisition path and accessible alternatives where appropriate.

**Acceptance and failure tests.** Verify ownership at equip time, duplicate-award prevention, invalid IDs, visibility changes, two-game separation, content retirement and corrections. No real-money exclusives, random paid packs, paid power, irreversible missed-day exclusives or hidden economic bonuses. Cosmetics must not alter financial outcomes.

**Exit gate.** Players can express different identities using legitimate earned items, with privacy and fairness preserved and no mandatory collection grind.

### DELIGHT-06 — Introduce bounded micro-events and pleasant surprises

**Dependencies:** `DELIGHT-03`, `WORLD-03`, `FND-03`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Add reusable low-stakes content through the existing World/Story scheduler: a local invitation, a harmless commute anecdote, a public research tip, a neighborhood activity, an unexpected thank-you or a previously authorized offer. Each definition states eligibility, cooldown, state exclusions, deduplication key, skip outcome, delivery budget and consequence owner. Persist the selected variant so retries or refresh cannot reroll it.

**Player and Admin experience.** Surprise invites curiosity, not urgent obligation. Players can read later, decline or mute optional flavor without losing core progression. Materially changed terms require explicit review; a decorative train-delay anecdote cannot secretly debit money or alter travel. Admin previews pools and frequency, disables an unsuitable template and preserves already-issued rights.

**Content deliverables.** A pilot pool balancing calm, humor, discovery and minor opportunities; country-specific variants; no-response copy; and a workload/notification budget. Proposed starting cap: no more than one optional interruptive micro-event per active session, with further items in the feed. Tune the cap from evidence; an empty day is acceptable.

**Acceptance and failure tests.** Exercise duplicate workers, rapid refresh, absence, pause/resume, eligibility changes, exhausted pools, high-notification load and two-game isolation. Test repeated selections and variant diversity over a simulated year. Any bonus or discount must be funded and honored by existing domain authority; pure flavor has no economic side effect.

**Exit gate.** Players encounter varied small moments without spam, hidden liability, mandatory daily participation or an exploitable reward loop.

### DELIGHT-07 — Remove chores while preserving meaningful decisions

**Dependencies:** `DELIGHT-01`, `UX-05`, `LIFE-04`, `WORLD-05`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Identify routine actions by observing the pilot journey. Reuse LIFE payment mandates, UX filters, saved views and notification preferences, and WORLD returning-player summaries. Add only the missing presentation and controls. Distinguish a repeated task from a consequential decision; do not automate assessments, investment choices, job acceptance or irreversible commitments by default.

**Player and Admin experience.** A player can choose capped autopay, view its next execution, revoke it, follow a savings goal, filter vacancies and review one digest rather than many alerts. New payees, higher caps, changed currency or materially changed terms require explicit consent. A digest links back to original records and does not mark unresolved work complete.

**Content deliverables.** An anti-chore inventory with before/after task counts, mandatory versus optional actions, automation ownership, interruption reasons and recovery copy. Proposed pilot target: at least a 30% reduction in observed routine interactions versus the matched manual flow, with no loss of understanding. It is a calibration target, not a measured result or permission to hide necessary confirmations.

**Acceptance and failure tests.** Race manual payment against autopay, revoke before execution, simulate insufficient funds and handle uncertain outcomes through receipt reconciliation. Test preference persistence, wrong-player access, notifications off and a player returning after a long absence. Reading a summary must never repeat a financial command.

**Exit gate.** Routine upkeep takes fewer interactions while players can still explain commitments, stop automation and choose the next meaningful action.

### DELIGHT-08 — Playtest enjoyment and close experience defects

**Dependencies:** `DELIGHT-02`, `DELIGHT-03`, `DELIGHT-04`, `DELIGHT-05`, `DELIGHT-06`, `DELIGHT-07`, `PILOT-01`, `UX-06`, `UX-07`. **Relative size:** M. **Status:** PLANNED.

**Implementation scope.** Run at least two proposed playtest rounds with a bounded volunteer cohort, including beginners, experienced users and returning-player scenarios. A 6–10-person first cohort is a planning candidate, not a representative survey. Include simulated setbacks and recovery without collecting real household finances. Obtain applicable school/parent permissions, keep participation separate from grades, and use anonymized observations; no raw student messages or recordings enter the repository.

**Player and Admin experience.** First let participants pursue a goal with minimal prompting. Afterwards ask what they enjoyed, what felt like homework, which person/place they remember, what consequence made sense, what they would do next and whether they would voluntarily play again. Continuing is optional and declining has no penalty. Admin records help requests and workload rather than manufacturing a positive result.

**Evidence deliverables.** Versioned scenarios, source SHA, participant counts, declared hypotheses, anonymized notes, task outcomes, routine-interaction counts, memorable-event recall, callback understanding, voluntary continuation responses, accessibility issues and an actioned defect ledger. Report counts and limitations rather than a misleading universal fun score. Compare the revised experience with its own first-round baseline.

**Acceptance and failure tests.** Technical, security and accessibility gates remain required. Proposed experience targets are captured before each round and not changed retroactively to turn failure into success. Resolve all experience-blocking confusion, coercive pressure, repetitive interruption and recovery dead ends. Retest fixes with fresh tasks and record dissenting reactions.

**Exit gate.** The product owner accepts scoped, observed playtest evidence and records unresolved limitations. No human playtest means this milestone remains PLANNED or IN_PROGRESS; synthetic tests, bots, screenshots and developer preference cannot certify enjoyment. SYSTEM-01 additionally requires this evidence before closing the eight-track program.

## Delivery and exclusions

Start DELIGHT-01 alongside early foundation design. Deliver a small receipt-backed memory, two-country identity, one permitted NPC callback, one optional micro-event and one anti-chore improvement inside PILOT-01. Those are bounded integration slices, not claims that every DELIGHT milestone is complete. Do not delay the first pilot until the full collection or all seasonal content exists. DELIGHT-08 follows the pilot; the pilot must not depend on DELIGHT-08.

Do not open a parallel application redesign, monetization project, AI companion platform or new runtime service. No production, live SQL, secret, scheduler or release change is authorized by this planning addition. Re-audit exact code and ownership before implementation, and retain the original Phase 15 and canonical domain boundaries.

## Source basis

Product-owner direction in this conversation: add the proposed flavor, enjoyment and player-value layer to the roadmap stack. Technical baseline: the existing FND/LIFE/MAC/REL/WORLD/CAP/PROG/UX/INT documents at the roadmap predecessor above. Their factual claims remain pinned to their recorded sources. This revision adds design requirements, not new runtime findings or observed user-research results.
