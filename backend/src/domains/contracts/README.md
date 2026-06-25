# Contracts

Backend foundation for Econovaria game contracts.

This slice adds the durable schema and TypeScript parsing contracts for
teacher-created, system-seeded, and story-created contracts. All three sources
share the same live `game_session_contracts` model and use strict enum parsing
for source, lifecycle, visibility, completion mode, and per-player progress
state.

Payloads are intentionally data-only in this PR. Targeting, requirements,
rewards, evidence, results, and metadata are validated as JSON objects, but they
are not executed. Cash rewards, item rewards, score/grade modifiers, story flag
placeholders, manual requirements, stock trade requirements, attendance
requirements, and story flag requirements remain future backend work.

Deferred work:

- staff/player HTTP handlers
- Supabase repository implementation
- storyline runner integration
- reward issuance
- cash, inventory, ledger, stock, and player-state mutations
- frontend contract UI
