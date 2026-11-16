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
