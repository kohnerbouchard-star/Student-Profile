# Inventory availability guidance

Roadmap: `INVENTORY-AVAILABILITY-GUIDANCE-001`.
Baseline: `03adc6891995fe1d780fe34629b1daf14470ea39`.
Status: `IMPLEMENTED_NOT_MERGED`; local branch `feat/inventory-availability-guidance`.

## Scope

Current Inventory cards show owned, reserved and available quantities but do not explain why ownership need not expose a Use or redemption control. Add per-card explanatory text from the same quantity/action projection used by existing controls. Distinguish reserved stock, no available units, direct Use, teacher-reviewed redemption and no supported action. Do not infer a reservation's destination because the read contract does not provide one. No new action, API call, state owner, storage, backend, migration, RPC or permission change. No redesign or CSS change.

## Files and checks

- `player-terminal/src/pages/inventory-page.js`: pure guidance helper and escaped text rendering; existing controls unchanged.
- `player-terminal/tests/inventory-availability-guidance.mjs`: six cases covering quantity/policy precedence, use aliases, unknown quantities, unsupported actions, safe rendering and preserved redemption control.
- `player-terminal/package.json`: new tests appended to the existing `inventory-read` verification chain.
- Focused cases and existing Inventory read/lifecycle checks pass.
- Full Player verification and root `npm test` pass with Node 22.23.1/npm 10.9.8. Root database reservation proof remains explicitly skipped without PostgreSQL. The initial shallow-history root failure was resolved by fetching its required immutable predecessor, without changing the verifier.
- Core TypeScript passed. Full Edge typecheck and backend smoke could not complete because Deno is absent (`spawnSync deno ENOENT`). No backend files changed.
- Independent source review found no blocking correctness, security or accessibility issues; its wording refinement was accepted. Focused tests were repeated after that text-only revision.
- Browser execution not qualified: bundled Playwright browser absent; installed Chromium cannot start because `socket() failed: Operation not permitted`. Do not interpret static HTML tests as browser proof.
- No database calls or live environment mutations were made. Database-dependent acceptance remains deferred under the owner's quota constraint.

## Completion boundary

This source tranche is not merged, deployed, or live-verified. Real desktop/mobile render qualification, hosted exact-head checks and coordinator integration remain required before merge readiness. Reservation origin/history needs a separately designed authoritative read contract, not guessed frontend labels.
