# Econovaria Player Recovery States Amendment

**Parent roadmap:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Owning branch:** `feat/player-recovery-states-v1`  
**Roadmap section:** Phase 3 — Player-facing recovery states  
**Status:** `IN_PROGRESS`  
**Started:** 2026-07-20

## Ownership

This branch is the sole authority for the bounded Player-facing recovery-states tranche. It does not own story delivery on PR #244, seed content on PR #163, market-order execution, isolated-staging operations, or a redesign of the accepted Player Terminal visual system.

## Completion boundary

The tranche is complete only when the Player Terminal provides tested, accessible, and non-destructive recovery behavior for:

- offline and restored connectivity;
- request timeout and temporary service unavailability;
- rate limiting with bounded retry timing;
- route-level stale or unavailable data;
- economic writes that committed but whose follow-up refresh failed;
- game pause and ended-game mutation denial;
- expired or revoked sessions through the existing safe sign-in exit;
- focus restoration and keyboard access for recovery actions;
- cleanup on terminal destruction with no leaked listeners, timers, or observers.

## Required evidence

- focused Node test suite for recovery classification and controller behavior;
- Player Terminal verification chain updated to include the suite;
- source audit and existing session-timeout coverage remain green;
- roadmap reconciliation after the final branch head is verified;
- no UUID, credential, token, raw payload, or internal error leakage.
