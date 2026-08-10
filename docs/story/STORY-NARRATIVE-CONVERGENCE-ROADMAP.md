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

Status: COMPLETE ON BRANCH / CONNECTED STAGING PENDING

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

Status: IN PROGRESS

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

### Run 2026-08-10 — S1 recurring character messaging landed

Workflow run: `31368924799`
Source head verified by runner: `ddda96d58a1018a7dfce937d9fa241a31f34d0d0`
Migration: `20260810081110_add_story_character_messaging_v1.sql`

Result: SOURCE + FOCUSED REGRESSION GREEN ON BRANCH.

Implemented:

- first-class read-only `story` Messaging thread subtype;
- one persistent private conversation per game + Player + recurring character;
- immutable per-message storyline/event provenance;
- server-owned idempotent `character_message` story-effect delivery;
- Player character-name projection without ownership/event UUID exposure;
- Admin moderation visibility without character impersonation;
- immutable story-thread membership through generic Admin participant controls;
- moderation-suppressed character delivery does not stall global story progression.

Verification completed:

- manifest SHA-256 verification of the staged S1 payload;
- `git diff --check`;
- `npm run typecheck:all`;
- `npm run test:player-messaging`;
- `npm run test:stock-market-calendar`;
- `npm run test:admin-api`;
- `node --test scripts/admin-v2-messages.test.mjs`.

Remaining S1 acceptance:

- connected staging database replay/acceptance before merge.

Next: S2 structured narrative response windows.

### Run 2026-08-10 — S2 structured response window bootstrap

Workflow run: `31369710126`
Starting branch head: `f89d05c41c6662791f0759b2f965de0a26f1fc99`

Design locked before implementation:

- a response window is an immutable private extension of one S1 `story_messages` row;
- `character_message` may carry an optional authored response window, but only when it has a stable `interactionKey`;
- every window has 2–5 stable `choiceKey` options, an authored prompt, optional close duration, and optional default choice;
- Player identity comes only from the authenticated Player session; browser payloads never supply ownership UUIDs;
- selection is one immutable authoritative row per Player interaction with exact idempotent replay and conflict on divergent reuse;
- expired windows are derived from `closesAt`; if a default choice exists, `effectiveChoiceKey` becomes that default after expiry without a second scheduler;
- open/selected/expired state and safe option data are projected through existing Player/Admin Messaging reads;
- Player UI shows authored choice buttons only while a window is open; resolved/expired windows are read-only;
- Admin receives read-only decision visibility through Messages moderation and no endpoint for choosing on behalf of a Player;
- S3 relationship state and S4 consequence callbacks will consume the authoritative effective choice later; S2 itself does not invent relationship or consequence mechanics.

Planned implementation surfaces:

- new CLI-generated Supabase migration for interaction/selection tables, RLS, immutable audit constraints, V2 character delivery, Player selection RPC, and Messaging projections;
- story effect contracts + Supabase story-message writer;
- Player Messaging route/handler and reviewed rate-limit dispatch;
- Player capability manifest and terminal endpoint/capability/resource plan;
- Player Messages UI choice rendering/submission;
- Admin Messages read model projection only;
- migration, handler, rate-limit, capability, UI, replay, expiry/default, and privacy regression tests.

Next in this run: generate S2 migration with pinned Supabase CLI, implement the bounded interaction lifecycle, run the full S1+S2 focused regression set, and update this roadmap with every failure or successful landing.

### Run 2026-08-10 — S2 verification attempt 1

Workflow run: `31371662557`
Workflow head: `e53aef1af12d460ee414c40555f9a39f4b4c87ad`

Result: FAILED BEFORE MIGRATION GENERATION OR SOURCE APPLICATION.

Passed before failure:

- exact story branch checkout and S1 ancestor boundary;
- pinned Node 22.23.1, Deno 2.9.3, and Supabase CLI 2.109.1 setup.

Failure:

- all five staged S2 transport chunks differed from the local pre-stage SHA-256 values;
- the runner stopped at per-chunk integrity verification;
- no S2 migration was generated;
- no S2 source transformation or tests executed.

Immediate action: diagnose the exact GitHub-stored chunk bytes before retrying; do not weaken manifest verification.

### Run 2026-08-10 — S2 transport diagnostic and roadmap persistence

Workflow run: `31371796042`
Diagnostic source head: `56f559e4432b82dbe23c8d6570028ee5c1aa8fa4`

Actual GitHub-stored chunk evidence:

- `bootstrap.part00`: 6000 bytes, SHA-256 `9fce911a7aaa21ef3092a37e43f0e8c7b544334045a9dc34b279ccafa02e3ad4`, trailing-newline `false`;
- `bootstrap.part01`: 6000 bytes, SHA-256 `7817e848203cdd55eff7c4b4fecf4ae0f6423bafba60ec35bc69898ebb860c9b`, trailing-newline `false`;
- `bootstrap.part02`: 6000 bytes, SHA-256 `2d38ca8c87745c81014c20b21161fd6f32d43f81ce0676e146d843048c25ec31`, trailing-newline `false`;
- `bootstrap.part03`: 6000 bytes, SHA-256 `7c7be9623d3f0193a0534ad653242cdea6c99fe8a6ba9b78fc4dc55193ed6614`, trailing-newline `false`;
- `bootstrap.part04`: 220 bytes, SHA-256 `078f6b92de937efbab6e94e6931d7097ad2dd7e90f2f8362405f1604c388f9cd`, trailing-newline `false`;

Next: update only the temporary runner's expected transport hashes to these stored values, then require archive SHA-256 plus per-member manifest SHA-256 verification before migration generation or source application.

### Run 2026-08-10 — S2 reconstructed archive diagnostic

Workflow run: `31371908365`
Diagnostic source head: `f7ba49a4e328f3300f0bd0d6a95671fa28b64ad8`

Reconstructed archive SHA-256: `9487a4fc4cf35ce580e6c6f53257ca7520c0954353736d709aca1c354e9690d4`
gzip/tar readable: `true`
per-member MANIFEST verification: `false`


Archive diagnostic error: `KeyError: "filename 'MANIFEST.json' not found"`

Next: if archive/member verification is green, update the temporary S2 verification runner to the actual stored chunk hashes plus this reconstructed archive hash; retain per-member manifest verification before migration generation.

### Run 2026-08-10 — S2 prefixed archive member diagnostic

Workflow run: `31371996395`
Diagnostic source head: `a47817dd67c4d7964fb2ce792c0473688d5b56cb`

Correction to prior diagnostic: the tar archive intentionally stores payloads under top-level `s2bundle/`; the prior check looked for the manifest at archive root.

Reconstructed archive SHA-256: `9487a4fc4cf35ce580e6c6f53257ca7520c0954353736d709aca1c354e9690d4`
Resolved archive prefix: `s2bundle/`
per-member MANIFEST verification: `true`

- `apply_structured_response_windows_v1.py`: verified `true` (24428 bytes sha256=027d6770c36a952be1a2c4eb4a480094fb84eb82d5c7cc5150b90e5900848d51);
- `apply_structured_response_windows_v1_followup.py`: verified `true` (41247 bytes sha256=a186835f15687d9a47fcce190d09cd293630fdd7c3ca8774f35b28d818d95f00);
- `structured_response_windows_v1.sql.body`: verified `true` (27857 bytes sha256=52faae72fece6ab83c949119b5a1bf89735556c46c833dca9e9a24ddfe3e1a28);

Next: if every member verifies, correct the temporary S2 landing workflow to use the actual stored chunk hashes, reconstructed archive hash, and resolved top-level payload directory; keep all manifest checks before migration generation.

### Run 2026-08-10 — S2 verification attempt 2

Workflow run: `31372150461`
Workflow head: `6d7d86f1d6664d2bc6d7e602ce9048ce7adac870`

Result: FAILED BEFORE MIGRATION GENERATION OR SOURCE APPLICATION.

Passed before failure:

- exact branch/S1 boundary;
- pinned Node, Deno, and Supabase CLI setup.

Failure:

- temporary per-chunk SHA expectations still disagreed with checkout bytes;
- the runner stopped before archive decode, migration generation, source changes, dependency install, or tests.

Decision:

- remove brittle individual chunk hash assertions;
- retain the independently diagnosed full reconstructed archive SHA-256 plus mandatory per-member MANIFEST byte-count/SHA-256 checks;
- this is a stronger content-integrity boundary because no payload can be applied unless the complete archive and every implementation member are verified.

### Run 2026-08-10 — S2 attempt-2 roadmap persistence

Workflow run: `31372236884`
Logging source head: `0239839f5c91396895ede96630c883791cba66d2`

Next: rerun the complete S2 landing sequence from archive verification onward; do not skip any source or regression step.

### Run 2026-08-10 — S2 verification attempt 3

Workflow run: `31372413808`
Workflow head: `c77355f4c6850847349c576b549427bd71ac6c16`
Generated migration during ephemeral verification: `20260810094310_add_story_structured_response_windows_v1.sql`

Result: FAILED DURING GUARDED SOURCE APPLICATION; NO S2 SOURCE COMMIT PUBLISHED.

Passed before failure:

- exact story branch and S1 ancestor boundary;
- pinned Node, Deno, and Supabase CLI setup;
- reconstructed S2 archive SHA-256 verification;
- per-member MANIFEST byte-count/SHA-256 verification for all S2 implementation members;
- Python patch-script compilation;
- Supabase CLI migration generation.

Failure:

- the primary guarded patch expected the S1 `character_message` parser block with wrapped `characterName` / `interactionKey` calls;
- current S1 source keeps those two calls on single lines;
- the guard aborted at `storyEffectContracts.ts` before applying S2 source changes;
- dependency install and all S2 tests were skipped.

Correction:

- add an exact pre-application compatibility normalization that accepts only the current verified S1 parser block and rewrites it to the patcher's expected formatting;
- keep the S2 semantic patch, archive/member integrity gates, and full regression sequence unchanged;
- rerun from migration generation through every focused S1+S2 test.

### Run 2026-08-10 — S2 attempt-3 roadmap persistence

Workflow run: `31372621765`
Logging source head: `98ab76b494b86745df20931dc38bd994ba3b6bc8`

Next: rerun S2 with the exact S1 formatting compatibility guard, then surface the first semantic/type/test failure if one remains.

## Run-completion rule

A story-development run is incomplete until this file is updated with:

- exact branch/base/head context;
- files/mechanics changed;
- tests/verification actually run;
- unresolved blockers or risks;
- the next concrete work item.
