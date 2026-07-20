# Active Work Claim — Program Control and Repository Consolidation

**Status:** `IN_PROGRESS`  
**Started:** 2026-07-20  
**Branch:** `chore/program-control-consolidation-v1`  
**Authoritative roadmap:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`

## Owned roadmap scope

- Entire `Phase 0 — Program control and repository consolidation` completion boundary.
- `P0-006` owner-safe superseded branch and pull-request cleanup.
- Active capability-ownership reconciliation after parallel chats created overlapping market PRs.

## Current collision found

PRs #245 and #246 both claim `BETA-MKT-003` through `BETA-MKT-007`. The substantive implementation branch will be preserved; the duplicate claim will be retired only after its useful source-snapshot role is accounted for.

## Collision boundary

This branch does not implement market, story, seed-content, Player, Admin, or staging capabilities. PR #163 remains the sole seed-content authority, PR #244 remains the story-delivery authority, and the surviving market PR retains exclusive market ownership.

## Completion gate

Phase 0 is complete only when active PR ownership is unique, superseded work is explicitly accounted for, branch-hygiene policy safely handles merged and deliberately superseded same-repository branches, repository documentation and the authoritative roadmap are reconciled, required checks pass, and this temporary work-claim file is removed before merge.
