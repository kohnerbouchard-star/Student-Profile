# Econovaria Player Recovery States Amendment

**Parent roadmap:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Owning branch:** `feat/player-recovery-states-v1`  
**Implementation PR:** #253  
**Roadmap section:** Phase 3 — Player-facing recovery states  
**Status:** `IMPLEMENTED_NOT_MERGED`  
**Started:** 2026-07-20  
**Implementation baseline:** `b0a6df91aa3d34dd156c64d6d9993a0276a53d1c`

## Ownership

This branch is the sole authority for the bounded Player-facing recovery-states tranche. It does not own story delivery on PR #244, seed content on PR #163, market-order execution, isolated-staging operations, or a redesign of the accepted Player Terminal visual system.

## Completed implementation boundary

The Player Terminal now provides accessible and non-destructive recovery behavior for:

- offline and restored connectivity;
- request timeout and temporary service unavailability;
- rate limiting with bounded retry timing;
- route-level stale or unavailable data;
- economic writes that committed but whose follow-up refresh failed;
- game pause and ended-game mutation denial;
- expired or revoked sessions through the existing safe sign-in exit;
- visible focus and keyboard access for recovery actions;
- cleanup on terminal destruction with no leaked listeners, timers, or observers.

## Safety guarantees

- Economic writes are never retried automatically.
- Ambiguous writes and committed-but-unrefreshed writes lock new mutations until an authoritative terminal refresh succeeds.
- Paused and ended lifecycle locks cannot be dismissed locally and survive connectivity changes and route rerenders.
- Rate limits cannot be bypassed with a dismiss action and use a bounded retry countdown.
- Recovery controls restore only controls that the recovery controller disabled.
- Player-visible copy does not expose UUIDs, credentials, tokens, raw payloads, request identifiers, or internal error objects.
- The accepted Player Terminal information architecture and route layout are unchanged.

## Implementation evidence

Authoritative implementation files:

- `player-terminal/src/recovery/recovery-policy.js`;
- `player-terminal/src/recovery/player-recovery-controller.js`;
- `player-terminal/src/api/errors.js`;
- `player-terminal/src/main.js`;
- `player-terminal/css/player-terminal-recovery.css`;
- `player-terminal/index.html`.

Focused verification files:

- `player-terminal/tests/player-recovery-states.mjs`;
- `player-terminal/tests/player-recovery-contracts.mjs`;
- `player-terminal/tests/browser/player-recovery.spec.mjs`.

`player-terminal/package.json` includes the focused recovery suite in the complete Player Terminal verification chain while preserving the merged Dashboard/Profile capability gate from PR #254.

## Upstream reconciliation

The implementation branch was reconciled with current `main` through merge commits and is zero commits behind the authoritative baseline at this record. It preserves:

- Phase 0 repository consolidation from PR #251;
- Dashboard and Profile runtime publication from PR #254 and completion record #257;
- supply-chain security controls from PR #250.

## Remaining transition

This bounded subsection is implemented. It becomes `VERIFIED_COMPLETE` only after the final reconciled PR head passes required GitHub workflows and PR #253 is merged. Isolated-staging and production-promotion evidence remain separate roadmap gates and are not claimed here.
