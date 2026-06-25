# Contracts

Backend foundation for Econovaria game contracts.

The current implementation includes the durable schema, TypeScript parsing
contracts, and a Supabase-backed repository for teacher-created, system-seeded,
and story-created contracts. All three sources share the same live
`game_session_contracts` model and use strict enum parsing for source,
lifecycle, visibility, completion mode, and per-player progress state.

The repository owns database access for reusable templates, live
game-session-scoped contracts, simple player availability reads, and per-player
progress upserts. All game-session and player progress queries are scoped by
`gameSessionId`; player progress reads/writes are also scoped by `playerId`.
Player availability is intentionally conservative: active public contracts are
visible to all, and targeted contracts are included only when the targeting
payload explicitly names the player id or matches an optional country code or
roster label supplied by a future caller.

Payloads are intentionally data-only in this PR. Targeting, requirements,
rewards, evidence, results, and metadata are validated as JSON objects, but they
are not executed. Cash rewards, item rewards, score/grade modifiers, story flag
placeholders, manual requirements, stock trade requirements, attendance
requirements, and story flag requirements remain future backend work.

Deferred work:

- staff/player HTTP handlers
- storyline runner integration
- reward issuance
- cash, inventory, ledger, stock, and player-state mutations
- frontend contract UI
