# API route ownership

Status: non-normative Phase 1 inventory seed  
Machine-readable seed: `docs/architecture/api-route-ownership.json`  
Authentication authority: `docs/security/auth-boundary-ledger-v1.json`  
Audited source: `22c2d396f29dc34ba486e25eeb38e70daebb03f1`

The JSON seed inventories the method/path families and top-level dispatch
markers found in the audited Classroom sources. It is useful for planning and
repeatable census work, but it is not yet a release gate or a complete route
security authority. Surface defaults intentionally identify fields that still
need route-by-route verification.

## Current ownership result

- Every Player route duplicated by `classroom-api` is also dispatched by
  `player-api`.
- Production browser source has zero direct Classroom endpoint URLs in the
  current browser matcher. The first tooling matcher found thirteen connected
  QA/runner files with 41 direct Classroom URL occurrences; a broader audit
  must still classify references under `scripts/`, staging compatibility
  entrypoints, and test fixtures.
- Every Staff route duplicated by `classroom-api` is also dispatched by
  `staff-api`, except `POST /staff/signup`; its intended canonical replacement
  is `bootstrap-api`. The legacy Classroom signup handler is pre-auth and
  throttle-protected, but it is not purchase-code protected.
- Admin `GET /games/{gameUuid}/join-code/reset` now targets the game-session
  read application service directly. POST rotation remains a transitional
  Classroom proxy until its mutation-specific slice.
- `player-api` still imports the Messaging dispatcher from the Classroom
  directory. Runtime ownership and source ownership are therefore not yet the
  same.
- Dedicated Player and Staff APIs enforce a publishable-key application gate;
  the compatibility router does not. Duplicate route presence does not imply
  an equivalent outer security boundary.

## Ratchet

`npm run audit:api-boundaries` and `npm run test:api-boundaries` are opt-in
inventory checks. They are deliberately not wired into required CI yet. Before
promotion to a required gate, the inventory must cover every executable caller,
protect per-callsite identity, and replace inherited placeholders with exact
route-owned security and behavior fields.

The seed records 31 line-ending-neutral route-source SHA-256 fingerprints.
These are evidence for the audited source, not a claim that lexical discovery
is a complete substitute for a declarative route registry.

The seed does not authorize staging or production deployment and does not mark
Phase 1 complete. Classroom retirement still requires all Workstream 1G
traffic, source, configuration, release, and acceptance gates.
