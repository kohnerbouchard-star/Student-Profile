# Econovaria Player Dashboard and Profile Completion Record

**Date:** 2026-07-20  
**Authoritative roadmap:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Implementation PR:** #254  
**Implementation merge:** `1156cf11cb9c4ecd9626779d3cab15fc40940315`  
**Status:** `VERIFIED_COMPLETE`

## Completed roadmap subsection

The Dashboard and Profile authoritative-runtime portions of `BETA-PLAYER-008` are complete.

This completion record supersedes the following stale statements in the current authoritative roadmap for this bounded subsection:

- Player capability manifest `2026-07-19.4` is no longer current; the merged manifest is schema `1`, version `2026-07-20.1`.
- Dashboard is no longer unadvertised. `GET /players/me/game/dashboard` is a reviewed, manifest-advertised Player route.
- Profile is no longer unadvertised. `GET /players/me` is the reviewed, manifest-advertised Profile/bootstrap route.
- The Phase 2 read gap is now Portfolio only. Dashboard and Profile are connected; Portfolio remains owned by PR #245.

`BETA-PLAYER-008` as a whole remains `IN_PROGRESS` solely because Portfolio is still open under the separate market-reconciliation authority. This record does not mark Portfolio or the full item complete.

## Merged authoritative behavior

### Profile/bootstrap

- Capability endpoint key: `bootstrap`.
- Route capability: `profile`.
- Operation: `GET /players/me`.
- The endpoint consumes the active Player session, derives Player and game scope server-side, returns private session/profile state, and remains `Cache-Control: private, no-store`.
- The Player Terminal maps the manifest endpoint to the existing `session` adapter route and accepts only the exact `/players/me` path or a `/players/me/` descendant where appropriate; lookalike paths such as `/players/me-unsafe` fail closed.

### Dashboard

- Capability endpoint key: `dashboard`.
- Route capability: `dashboard`.
- Operation: `GET /players/me/game/dashboard`.
- The endpoint consumes the active Player session and game scope, returns the existing authoritative Dashboard read model, and preserves UUID-private output.
- Classroom API dispatch now routes Dashboard reads through `dispatchRateLimitedReviewedPlayerRequest`.
- Reviewed rate-limit operation: action `player.dashboard.read`, profile `read`.

## Implementation evidence

PR #254 merged the following authoritative files:

- `backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts`;
- `backend/src/domains/players/contracts/playerCapabilityManifestContracts.test.ts`;
- `backend/src/security/playerRateLimitDispatch.ts`;
- `backend/src/security/classroomApiRateLimitDispatch.test.ts`;
- `backend/supabase/functions/classroom-api/index.ts`;
- `player-terminal/src/integrations/student-profile-capability-manifest.js`;
- `player-terminal/tests/dashboard-profile-capabilities.mjs`;
- `player-terminal/package.json`.

The final implementation head was `62271f938cd87bfdfa9183f96b3e95a38fb5f364` and passed:

- Backend Typecheck run #1265, including Backend smoke;
- Player Terminal Verify run #348, including the full Node verification chain and Chromium browser verification;
- Repository Quality run #1110;
- Exchange Calendar Runtime run #220;
- Required Game Market Timezone run #249.

Focused verification covers:

- manifest schema and version;
- Dashboard and Profile route-capability publication;
- exact Backend endpoint-to-frontend adapter coverage;
- exact `/players/me` bootstrap mapping;
- Dashboard route resolution;
- missing endpoint-descriptor rejection;
- malformed or lookalike operation-path rejection;
- central reviewed Dashboard rate-limit dispatch;
- preservation of the existing Player session, game-scope, UUID-privacy, and Dashboard negative-state tests in the complete Backend smoke chain.

## Collision and release boundary

This completed subsection does not own or alter:

- Portfolio, market orders, market ticks, or market committed-success work owned by PR #245;
- story delivery owned by PR #244;
- Player recovery states owned by PR #247;
- Messaging owned by PR #248;
- Marketplace owned by PR #249;
- incident readiness owned by PR #252;
- seed definitions, activation, importer, calibration, or rollback owned by PR #163;
- isolated-staging bootstrap and network evidence under `BETA-PLAYER-010`, `BETA-AUTH-005`, `BETA-AUTH-006`, and Phase 5.

No staging or production deployment is claimed. Repository-integrated Dashboard and Profile runtime authority is complete; isolated-staging validation remains a separate release gate.

## Roadmap state transition

- Dashboard portion of `BETA-PLAYER-008`: `IN_PROGRESS` → `VERIFIED_COMPLETE`.
- Profile portion of `BETA-PLAYER-008`: `IN_PROGRESS` → `VERIFIED_COMPLETE`.
- `BETA-PLAYER-008` aggregate: remains `IN_PROGRESS` because Portfolio is open.
- Phase 2 “Connect all beta reads”: remains `IN_PROGRESS`, with Portfolio now the only unadvertised read surface.
