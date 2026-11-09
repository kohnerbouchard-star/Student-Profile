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
