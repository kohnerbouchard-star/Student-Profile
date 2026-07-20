# Econovaria Arrival Class System Amendment

**Date:** 2026-07-20  
**Authority:** Section 28 of `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Owned IDs:** `EXP-CLASS-001` through `EXP-CLASS-011`  
**Status:** `IN_PROGRESS`  
**Branch:** `agent/arrival-class-system-v1`

## Ownership declaration

This branch exclusively owns the complete Arrival class system section. It will define and implement the bounded arrival questionnaire, explainable class scoring, player review and override, game-scoped class persistence, idempotent starting grants, Player onboarding integration, Admin visibility, and deterministic balance verification across every class-country combination.

## Collision boundary

This branch does not own seed-content definitions or activation in PR #163, Player story delivery in PR #244, Stock Market reconciliation in PRs #245/#246, Player recovery states in PR #247, Messaging in PR #248, generic onboarding story content, staging environment operations, or redesign of the accepted Admin v606 and Player Terminal visual systems.

PR #163 may remain the source for country and arrival-package definition references. This branch owns only the runtime class system and its bounded canonical class catalog. It must not import, activate, or rewrite unrelated seed content.

## Acceptance requirements

- six to eight balanced canonical classes;
- ten country variants for every class without country-exclusive lockout;
- short nonsensitive questionnaire with bounded answer values;
- deterministic, explainable, versioned scoring;
- player review and one-time pre-confirmation override;
- game-session-scoped immutable confirmation record with explicit versioning;
- idempotent, transactional starting grants with exactly-once ledger and inventory outcomes;
- no permanent lockout from other economic paths;
- authenticated UUID-private Player reads and writes;
- Admin read visibility and audited correction only where explicitly authorized;
- complete class-country simulation and dominance analysis;
- wrong-role, wrong-game, replay, duplicate-confirmation, conflicting-key, expired/revoked-session, privacy, and concurrency coverage;
- capability-manifest and Player adapter integration;
- full repository checks and roadmap reconciliation before merge.

## Completion rule

The section may be marked `VERIFIED_COMPLETE` only after the implementation is merged into `main`, required checks pass, and all repository-integrated acceptance evidence is recorded. Any isolated-staging-only evidence remains separately governed by Phase 5 and does not permit unsupported production claims.
