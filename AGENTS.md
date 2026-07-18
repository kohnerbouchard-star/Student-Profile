# Econovaria Agent Instructions

These instructions apply to every AI agent and automated coding session working in this repository.

## Mandatory roadmap check

Before planning, coding, reviewing, or claiming completion, read:

`docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`

This roadmap is the authoritative completion ledger and sequencing document for Econovaria.

Do not rely only on chat memory, handoff summaries, preview fixtures, PR descriptions, donor branches, or prior completion claims. Audit the current codebase, migrations, tests, active branches, pull requests, and available runtime evidence against the roadmap.

## Required start-of-session behavior

1. Fetch current `main`.
2. Read the roadmap and `CONTRIBUTING.md`.
3. List relevant active branches and pull requests.
4. Identify the existing branch that owns the requested capability.
5. Do not create a replacement branch when an active branch already owns the work.
6. Reconcile stale roadmap status before implementation.
7. Name the roadmap item IDs being addressed.

## Required completion behavior

A roadmap item may be marked `VERIFIED_COMPLETE` only when it is merged into `main`, its required tests pass, and any required staging or runtime evidence exists.

At the end of each implementation tranche, update the roadmap with:

- item status;
- pull request and commit SHA;
- implementation files;
- migrations, routes, and RPCs;
- tests and workflow results;
- staging or runtime evidence;
- unresolved blockers;
- next exact roadmap item.

Code in a local workspace, preview, draft PR, donor branch, or documentation-only design is not complete.

## Scope control

The beta scope remains unlocked until the product owner explicitly locks it. Add new requests to the roadmap's Scope Intake section and assess their dependencies and beta impact. Do not independently mark work `DEFERRED_BY_OWNER` or `REMOVED_BY_OWNER`.

## Architecture and safety

- Preserve server-derived player and game ownership.
- Keep internal UUIDs out of browser contracts.
- Keep economic writes transactional, game-scoped, server-authoritative, and idempotent.
- Never dual-write balances, inventory, rewards, Contracts, or market state.
- Use forward migrations; do not perform normal production schema changes manually.
- Preserve the accepted Admin v606 and Player Terminal visual systems unless the product owner requests a redesign.
- Do not weaken tests or security boundaries to make a branch pass.
- Never commit credentials, tokens, secrets, or student-sensitive data.

For a complete reusable execution instruction, read:

`docs/prompts/econovaria-complete-program-execution-prompt-v1.md`
