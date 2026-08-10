# Econovaria Story Narrative Convergence Roadmap

Status: ACTIVE  
Working branch: `feat/story-narrative-convergence-v1`  
Authoritative base at roadmap creation: `8394595b898957676869fb3c692e96969ad0e09e`  
Created: 2026-08-10  
Last updated: 2026-08-10

## Purpose

This file is the persistent source of truth for the remaining Econovaria story/narrative work. Every implementation run on this branch must update this document before the run is considered complete.

The goal is not to add a disconnected dialogue system. The goal is to make the existing systemic storyline runtime feel like a living, authored campaign by connecting recurring characters, player-facing conversations, structured decisions, delayed consequences, relationship state, country-specific developments, economic shocks, business/contract opportunities, and multiple campaign outcomes to the authoritative simulation systems already in the repository.

## Non-negotiable architecture rules

1. Do not invent a second story scheduler. Reuse the existing authoritative storyline runner and timed services.
2. Do not create fake staff accounts for narrative characters.
3. Do not expose Player ownership UUIDs, story/event UUIDs, service-role data, or internal authorization identifiers to browsers.
4. Narrative content must use stable public/content keys. Internal UUIDs remain server-side.
5. Story consequences must flow through existing authoritative systems: ledger/banking, contracts, policies, flags, world/travel, notifications, messaging, market/news, business/economic systems where contracts already exist.
6. Do not weaken existing RLS, moderation, idempotency, privacy, retention, or security ratchets.
7. Player choice must be deterministic and auditable. No free-form AI interpretation is permitted as authoritative game state.
8. Character conversations are private per Player unless an explicitly authored future mechanic says otherwise.
9. Admin may supervise and moderate story communications but may not impersonate narrative characters.
10. New story mechanics must be added as bounded domain contracts and tested before authored content depends on them.

## Current authoritative story foundation

The repository already has a meaningful systemic story runtime:

- scheduled/condition/market-tick storyline events;
- player-rule targeting;
- story flags;
- cash credit/debit effects through the authoritative ledger;
- tax and immigration policy effects;
- contract unlocks;
- cutscene/impact notifications;
- public market-news integration;
- market status changes;
- automatic post-stock-tick story progression;
- autonomous daily country macro progression;
- world/campaign runtime with 10 countries, 50 locations, 13 routes, and Arrival-class support;
- canonical seeded economic assets, Store, Inventory, Crafting, Marketplace, Business, and Contracts foundations.

The remaining problem is primarily narrative density, continuity, player agency, and authored consequence chains rather than absence of a story engine.

## Baseline narrative assessment

Working assessment from the 2026-08-10 story audit:

- Seed/world/economic breadth: strong.
- Story engine/systemic consequences: strong.
- Authored narrative density and branching: incomplete.
- Replayability: incomplete.
- Recurring-character continuity: not yet first-class on `main`.
- Structured player decisions: not yet first-class.
- Relationship state: not yet first-class.
- Contract/policy time-based autonomous transitions: still a known broader runtime gap; do not silently invent unrelated lifecycle mechanics inside narrative work.

## Workstreams

### S0 — Persistent roadmap and convergence ledger

Status: COMPLETE

Deliverables:

- [x] Create this roadmap before story implementation resumes.
- [x] Record branch, base SHA, architecture rules, workstreams, verification expectations, and run log.
- [x] Update this document during every story implementation/verification run, including failed runs.

### S1 — Recurring character messaging foundation

Status: IMPLEMENTATION STAGED / VERIFICATION IN PROGRESS

Target behavior:

- first-class `story` conversation subtype;
- one persistent private conversation per `(game, player, character)` across multiple story arcs;
- immutable per-message storyline/event provenance;
- stable character identity and authored body;
- idempotent server-owned delivery;
- Player sees character name rather than generic `System`;
- story conversations are initially read-only;
- Admin can inspect/moderate but cannot author fake character messages;
- story-thread membership cannot be widened through Admin participant controls;
- moderation suppression does not stall the entire storyline.

Prepared implementation package from the prior run is being reconciled and verified against this branch rather than blindly copied.

### S2 — Structured narrative response windows

Status: NEXT

Goal: give Players explicit authored choices without making free-form text authoritative.

Required contracts:

- stable public `interactionKey` for an authored decision window;
- 2–5 authored response options with stable `choiceKey` values;
- opens-at / closes-at lifecycle tied to authoritative story time or explicit event resolution;
- one authoritative selection per Player with exact idempotent replay;
- optional default/expiry outcome when a Player does not answer;
- immutable audit record of selected choice, source character, source story event, and resolved time;
- participant-scoped Player read endpoint;
- Player UI renders buttons/options only while the window is open;
- Admin read-only visibility of decision state unless a separately authorized correction contract exists.

Safety boundary:

- no free-form Player prose is converted to story state;
- no Admin ability to select a response on behalf of a Player through generic Messaging;
- choice submission must derive Player identity from the authenticated Player session.

### S3 — Relationship state

Status: PLANNED

Goal: make recurring characters remember how the Player has treated them across the campaign.

Required state model:

- relationship keyed by `(game, player, characterKey)`;
- bounded dimensions such as trust, respect, affinity, obligation, suspicion, or equivalent authored metrics;
- deterministic deltas only through authoritative story effects;
- stable relationship flags/tiers usable by story conditions;
- no browser writes to relationship tables;
- Player presentation exposes only intentional narrative-facing state, not internal scoring unless explicitly designed.

### S4 — Choice consequences and delayed callbacks

Status: PLANNED

Goal: ensure a Player response changes later events, access, economics, or relationships.

Examples of supported consequence classes using existing systems:

- story flags;
- relationship deltas;
- cash/ledger adjustments;
- contract unlocks;
- policy effects;
- market/news consequences;
- world/travel restrictions or opportunities where an authoritative contract already exists;
- later message variants;
- later branch eligibility;
- delayed callback events.

### S5 — Narrative content saturation tranche

Status: PLANNED

Goal: fill dead periods and reduce repeated situations across a multi-week classroom campaign.

Content requirements:

- recurring-character arcs that cross multiple chapters;
- country-specific developments for all 10 countries;
- economic shock chains rather than isolated alerts;
- political/geopolitical developments with simulation consequences;
- business opportunities and failures;
- contract chains;
- world/travel consequences;
- multiple ending paths;
- quiet interpersonal beats between major crises;
- authored variants conditioned on Player country, finances, contracts, choices, and relationship state.

### S6 — Campaign saturation/reachability audit

Status: PLANNED

Required analysis:

- count all seeded story events and player rules;
- enumerate trigger types;
- enumerate effect diversity;
- identify unreachable/orphaned branches;
- calculate recurring-character message/choice density;
- identify dead periods with no eligible narrative beats;
- estimate repeated-content pressure for 30–40 concurrent Players;
- verify all 10 countries receive meaningful narrative attention;
- verify at least several materially different campaign paths exist;
- verify endings are reachable and mutually coherent.

### S7 — Full story acceptance

Status: PLANNED

Minimum acceptance before declaring narrative convergence complete:

- database replay/migrations pass;
- backend typecheck and Edge checks pass;
- story contract/unit tests pass;
- Player Messaging tests pass;
- Admin Messaging moderation tests pass;
- runtime storyline-loop smoke passes;
- connected staging acceptance demonstrates automatic event -> character message -> response window -> choice -> consequence -> later callback;
- exact replay produces no duplicate messages, decisions, notifications, ledger entries, or relationship mutations;
- browser payload contains no private ownership/story UUIDs;
- Admin cannot impersonate story characters;
- story-thread membership cannot be altered through generic participant controls;
- existing game/economic/world regressions remain green.

## Recommended implementation order

1. Land S1 recurring character messaging foundation.
2. Implement S2 structured response windows.
3. Implement S3 relationship state.
4. Connect S4 consequence effects and delayed callbacks.
5. Author S5 narrative saturation content using only proven mechanics.
6. Run S6 reachability/saturation simulation and fill gaps.
7. Complete S7 staging/full-regression acceptance.

## Current run log

### Run 2026-08-10 — Roadmap bootstrap

Base: `8394595b898957676869fb3c692e96969ad0e09e`

Completed:

- created dedicated branch `feat/story-narrative-convergence-v1` from exact current `main`;
- created this roadmap as the first branch change;
- captured the prior character-messaging design and the remaining narrative convergence sequence.

### Run 2026-08-10 — S1 verification attempt 1

Workflow run: `31367442589`  
Workflow head: `b541471c97f2a0aac456baf3b7072122bb0496a7`

Result: FAILED BEFORE SOURCE APPLICATION.

Evidence:

- exact story branch checkout passed;
- Node, Deno, and pinned Supabase CLI setup passed;
- failure occurred while reassembling the staged implementation bundle;
- no migration was generated and no S1 application source was changed by the runner.

Action: added per-chunk integrity diagnostics before retrying.

### Run 2026-08-10 — S1 verification attempt 2

Workflow run: `31367558782`  
Workflow head: `15fcc3c5a278ef0e5a1183bf8d38bfdb61edd361`

Result: FAILED BEFORE SOURCE APPLICATION.

Evidence:

- chunks 00, 01, 02, and 04 matched the audited local SHA-256 values;
- chunk 03 was the only transport mismatch;
- Node, Deno, and Supabase CLI setup remained green;
- no migration or implementation source was applied.

Action: isolated the archive corruption instead of retrying source changes.

### Run 2026-08-10 — S1 bundle diagnostic

Workflow run: `31367985372`  
Workflow head: `e4a8578bebe734f70012c57462cea3ef77650736`

Result: DIAGNOSTIC GREEN.

Findings:

- staged chunk 03 SHA-256 is `6e55f23f5f5dcfaaf65bdd2a1b5079a971d5d171eeb66ca04b7a89bbc24d2a48`;
- reconstructed transport ZIP SHA-256 is `46ac7cf88aadc9341f0bc9ebd8d65136217862effbbe08357049f06730180604`;
- all 13 archived member payloads pass ZIP CRC validation;
- warnings are limited to three corrupted ZIP local filename-header bytes for test files;
- the central-directory filenames are correct and the member data is intact.

Action: changed the runner to verify every extracted file byte count and SHA-256 against `MANIFEST.json` before source application.

### Run 2026-08-10 — S1 verification attempt 3

Workflow run: `31368221103`  
Workflow head: `20490b04a26382b3e5f9c9b7dd9ee821ea89e627`  
Generated migration during ephemeral verification: `20260810080120_add_story_character_messaging_v1.sql`

Result: FAILED AT TYPECHECK AFTER CLEAN SOURCE APPLICATION.

Passed before failure:

- exact branch/base boundary;
- pinned Node/Deno/Supabase setup;
- all staged chunk checks;
- reconstructed ZIP check;
- manifest byte-count and SHA-256 verification for all listed payload files;
- bundle structural validation;
- Supabase CLI migration generation;
- guarded S1 source transformation;
- `git diff --check`;
- `npm ci`.

Failure:

- TypeScript rejected `storyCharacterMessageContract.test.ts` because the test accessed `messagePurpose` and `interactionKey` on the full `StoryEffect` union before narrowing the discriminant to `type === "character_message"`.
- Runtime implementation files did not produce the reported type error.

Correction:

- narrow the parsed effect to `character_message` in the test before reading character-message-specific fields;
- rerun the entire S1 verification sequence, not just the failing test.

### Run 2026-08-10 — S1 verification attempt 4

Workflow run: `31368435905`  
Workflow head: `bfc2b7ac7f7b39112ce87f6eb5f665a9fceabbf9`

Result: FAILED BEFORE JOB CREATION.

Evidence:

- GitHub reported zero jobs for the run;
- no repository checkout, migration generation, source transformation, or tests executed;
- failure was a temporary workflow YAML parse error caused by an outdented Python triple-quoted replacement literal.

Correction:

- replace the temporary multiline Python literals with escaped single-line strings that remain inside the YAML block scalar;
- retain the discriminated-union test correction;
- rerun the full S1 sequence.

### Run 2026-08-10 — S1 verification attempt 5

Workflow run: `31368684311`
Workflow head: `5e7968c9bc0e633ca07a9769bc2d5e37530b9a1d`
Generated migration during ephemeral verification: `20260810080746_add_story_character_messaging_v1.sql`

Result: ALL S1 SOURCE AND FOCUSED REGRESSIONS GREEN; FAILED ONLY IN ROADMAP BOOKKEEPING.

Passed:

- exact branch/base boundary;
- pinned Node/Deno/Supabase setup;
- staged chunk and reconstructed ZIP integrity checks;
- manifest byte-count and SHA-256 verification for all listed payload files;
- Supabase CLI migration generation;
- guarded S1 source transformation;
- discriminated-union test correction;
- `git diff --check` before roadmap mutation;
- `npm ci`;
- `npm run typecheck:all`;
- `npm run test:player-messaging` — 41 passed, 0 failed;
- `npm run test:stock-market-calendar` — 38 passed, 0 failed;
- `npm run test:admin-api` — 159 passed, 0 failed;
- `node --test scripts/admin-v2-messages.test.mjs` — 7 passed, 0 failed.

Failure:

- the generated roadmap success entry used Markdown hard-break trailing spaces on the workflow/head lines;
- `git diff --check` correctly rejected those two newly added trailing-whitespace lines;
- cleanup and branch commit were skipped, so no unverified implementation source was published.

Correction:

- remove Markdown hard-break spaces from generated roadmap lines;
- rerun the complete verification sequence once more and publish S1 only after the roadmap update also passes `git diff --check`.

Next:

- complete S1 branch commit with all temporary bootstrap transport removed;
- confirm roadmap and branch head;
- then move to S2 structured narrative response windows.

## Run-completion rule

A story-development run is incomplete until this file is updated with:

- exact branch/base/head context;
- files/mechanics changed;
- tests/verification actually run;
- unresolved blockers or risks;
- the next concrete work item.
