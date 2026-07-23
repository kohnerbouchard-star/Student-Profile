# Progression pre-convergence ledger v1

Status: `CONVERGED_AFTER_MESSAGING_PENDING_EXACT_HEAD_ACCEPTANCE`

Authority: PR #261, branch `agent/progression-reputation-achievements-v1`.

Final predecessor: Messaging PR #248, merge SHA `955c97a9a2c8e734cfd89e5202a052afc74edacd`. The one authorized synchronization and migration rekey are complete. Canonical staging, production, ready-for-review, and merge remain unauthorized pending exact-head acceptance.

## Permanent Progression scope completed before convergence

The branch owns permanent Progression implementation and focused verification for experience, levels, skills, bounded rewards, achievements, country/career/story/relationship reputation, private Player state, public-profile filtering, atomic Player commands, stable-source replay, duplicate delivery, committed-success retries, lifecycle denial, owner-scoped Admin correction, immutable correction audit, and correction-history review.

Stable predecessor compatibility fixtures are maintained without copied predecessor internals for:

- `business.operation.completed` from `business`;
- `crafting.recipe.completed` from `crafting`;
- `market.order.settled` from `market`;
- `story.chapter.completed` from `story`.

## Final migration rekey map — placeholders only

Do not rename these files until Messaging has merged and Chat 1 assigns the final monotonic Progression range.

| Provisional migration | Final placeholder | Dependency |
|---|---|---|
| `20260721160000_add_progression_reputation_runtime_v1.sql` | `PROGRESSION_SLOT_01_add_progression_reputation_runtime_v1.sql` | First Progression migration after final Messaging range |
| `20260721161000_fix_progression_read_volatility_v1.sql` | `PROGRESSION_SLOT_02_fix_progression_read_volatility_v1.sql` | Immediately after slot 01 |
| `20260721162000_harden_progression_event_idempotency_v1.sql` | `PROGRESSION_SLOT_03_harden_progression_event_idempotency_v1.sql` | Immediately after slot 02 |
| `20260721163000_rebalance_progression_curve_v1.sql` | `PROGRESSION_SLOT_04_rebalance_progression_curve_v1.sql` | Immediately after slot 03 |

The authoritative operation is one rename pass after the exact Messaging merge SHA and final controller range are known. No additional migration family is planned.

## Exact migration-reference inventory

Every reference below must be updated in the same authoritative rekey commit:

1. `backend/package.json`
   - `test:player-progression` `--allow-read` migration list.
2. `backend/src/domains/progression/tests/progressionMigrationContract.test.ts`
   - `MIGRATION`.
   - `IDEMPOTENCY_MIGRATION`.
   - `CURVE_AND_LIFECYCLE_MIGRATION`.
3. `.github/workflows/progression-runtime-v1.yml`
   - migration path filter remains wildcard-based but must be checked after rename.
4. `scripts/validate-supabase-migrations.mjs`
   - no current exact Progression filename; verify after final main synchronization.
5. PR #261 body and exact-head checkpoint comments.
6. This ledger and final merge handoff.

Rekey acceptance requires a repository search showing zero remaining references to the four provisional timestamps.

## Shared-file collision matrix

Shared files must be reconstructed from final post-Messaging `main`; do not select the old branch version wholesale.

| Shared surface | Progression additive contribution | Required predecessor preservation |
|---|---|---|
| `backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts` and tests | Progression capability declarations only | World, Business, Crafting, Marketplace, Messaging, Story, Contracts, Store, Inventory and existing security fields |
| `backend/src/security/playerRateLimitDispatch.ts` and tests | Explicit `progression`, `progressionUnlock`, `progressionClaim` dispatch | Login/pre-auth, World, Business, Crafting, Marketplace, Messaging, Story, Store, Inventory and proxy protections |
| `backend/supabase/functions/classroom-api/index.ts` | Explicit Progression route parse/dispatch | Every predecessor route and existing CORS/session/rate-limit behavior |
| `backend/supabase/functions/admin-api/index.ts` | Progression review, correction-history and correction dispatch | Every predecessor Admin operation and authorization boundary |
| `player-terminal/src/api/backend-routes.js` | Progression read/unlock/claim transport adapter | All predecessor endpoint builders |
| `player-terminal/src/api/endpoints.js` | Progression endpoint publication | All predecessor endpoint constants |
| `player-terminal/src/api/capabilities.js` | Progression capability consumption | All predecessor capability mappings |
| `player-terminal/src/api/resource-plan.js` and `resource-support.js` | Progression resource declaration | All predecessor resources and optional-resource behavior |
| `player-terminal/src/api/payload-normalizer.js` | Progression command payload allowlist | All predecessor payload validation and idempotency semantics |
| `player-terminal/src/api/response-normalizer.js` | Progression private read/command normalization | Story/notification and every predecessor response contract |
| `player-terminal/src/data/empty-read-models.js` | Progression empty private model | All predecessor empty models |
| `player-terminal/src/pages/progression-page.js` | Progression page rendering | Existing Player shell, navigation, lifecycle and accessibility behavior |
| `admin/index.html` | One deterministic Progression loader insertion | Final predecessor Admin boot order and all accepted loaders |
| root and backend `package.json` | Progression tests/simulations | Every predecessor script and package constraint |
| `.github/workflows/player-terminal-verify.yml` | Progression browser inclusion only | Final predecessor workflow ratchets |

## Additive route and capability plan

### Classroom API

- `GET /players/me/progression`
  - action: `progression`;
  - private `no-store` self read;
  - authenticated session-derived game and immutable Player UUID;
  - fail-closed read-model allowlist.
- `POST /players/me/progression/skills/{skillId}/unlock`
  - action: `progressionUnlock`;
  - atomic command with a bounded idempotency key.
- `POST /players/me/progression/rewards/{rewardId}/claim`
  - action: `progressionClaim`;
  - atomic command with a bounded idempotency key.

The Capability Manifest remains descriptive. It must not become the Progression dispatcher.

### Admin API

- `GET /games/{gameId}/progression`
  - owner-scoped bounded Player review;
  - action: `staff.progression.read`.
- `GET /games/{gameId}/progression/corrections`
  - owner-scoped immutable correction history;
  - optional bounded public Player-ID filter;
  - action: `staff.progression.read`.
- `POST /games/{gameId}/progression/players/{playerId}/corrections`
  - owner-scoped, lifecycle-gated, immutable audited mutation;
  - action: `staff.progression.correct`.

### Rate-limit profile

- `progression`: authenticated Player read profile.
- `progressionUnlock`: authenticated Player mutation profile, keyed by game, Player, action and IP.
- `progressionClaim`: authenticated Player sensitive mutation profile, keyed by game, Player, action and IP.
- `staff.progression.read`: bounded Admin read profile, keyed by game, staff identity, action and IP.
- `staff.progression.correct`: sensitive Admin mutation profile, keyed by game, staff identity, action and IP.
- Rate-limit infrastructure failures remain fail closed.

## Player and Admin publication plan

1. Synchronize once with final post-Messaging `main` only after the exact Messaging merge SHA and controller range are recorded.
2. Rekey the four migrations once and update every exact reference.
3. Rebuild shared API, capability, rate-limit, endpoint, resource and loader files from final `main` plus narrow additive Progression hunks.
4. Publish Player self read, skill unlock and reward claim through the deployable Classroom API.
5. Publish Admin Player review, immutable correction history and correction mutation through the deployable Admin API.
6. Preserve private achievement/reward details for the authenticated Player only; public profiles expose completed achievements and explicitly public reputation only.
7. Preserve every predecessor lifecycle, privacy, wrong-game, session-expiry, CORS, proxy and rate-limit control.

## Deterministic simulation thresholds

The exact-head Progression simulation fails when any bound is exceeded:

- level 10 earlier than day 10;
- level 20 earlier than day 30;
- total deterministic achievement skill-point rewards above 16;
- any specialization share above 36%;
- specialization HHI above 0.30;
- Business/Crafting/Marketplace aggregate specialization spread above 0.12;
- positive relationship-reputation gain above 30 points per day;
- coordinated Business/Crafting/Marketplace loop above 2,640 XP per day;
- catch-up multiplier above 1.15;
- late-player catch-up ratio below 0.70 or above 1.10;
- more than one award from duplicate stable-source delivery;
- any new Progression award in paused or ended games;
- failure to replay a previously committed event after pause or end.

## Final shared-convergence checklist

The immutable Progression head may be returned to Chat 1 only after all items are complete:

- [x] exact Messaging merge SHA recorded;
- [x] final controller-assigned Progression migration range recorded;
- [x] one authoritative migration rekey completed;
- [x] zero provisional migration references remain;
- [x] one synchronization with final predecessor `main` completed;
- [x] shared files reconstructed additively from final `main`;
- [x] migration uniqueness and monotonic ordering verified;
- [x] Capability Manifest complete and descriptive only;
- [x] central Player and Admin rate limits complete;
- [x] Classroom API Progression read/unlock/claim reachable;
- [x] Admin API review/history/correction reachable;
- [x] Player endpoint, resource, invalidation, adapter and page publication complete;
- [x] Admin loader publication complete;
- [ ] experience, levels, skills, rewards, achievements and all four reputation types verified;
- [ ] public/private profile boundaries verified;
- [ ] atomic claim/unlock and committed-success retry verified;
- [ ] duplicate, delayed and out-of-order event delivery verified;
- [ ] malformed, stale, source-mismatched and wrong-game events denied;
- [ ] paused, ended and session-expired behavior verified;
- [ ] Admin authorization and immutable audit/history verified;
- [ ] deterministic progression, inflation, concentration, dominance, farming, coordinated-loop, specialization and catch-up simulations green;
- [ ] replay from zero twice and database lint green;
- [ ] complete exact-head Backend, Player, Admin, browser, security, privacy, accessibility and repository matrix green;
- [ ] isolated-staging Progression acceptance green;
- [ ] zero unresolved review threads;
- [ ] immutable head returned to Chat 1;
- [ ] controller authorization obtained before leaving draft;
- [ ] production unchanged.

After the authorized Progression merge, rerun the full merged-main migration, route, capability, rate-limit, Classroom API, Admin API, Player publication, package/workflow, lifecycle, security, replay and repository convergence audit before PR #295 immutable release assembly.
