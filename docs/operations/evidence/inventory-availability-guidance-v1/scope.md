# Inventory availability guidance

Roadmap: `INVENTORY-AVAILABILITY-GUIDANCE-001`.
Baseline: `03adc6891995fe1d780fe34629b1daf14470ea39`.
Status: `IMPLEMENTED_NOT_MERGED`; local branch `feat/inventory-availability-guidance`.

## Scope

Current Inventory cards show owned, reserved and available quantities but do not explain why ownership need not expose a Use or redemption control. Add per-card explanatory text from the same quantity/action projection used by existing controls. Distinguish reserved stock, no available units, direct Use, teacher-reviewed redemption and no supported action. Do not infer a reservation's destination because the read contract does not provide one. No new action, API call, state owner, storage, backend, migration, RPC or permission change. No visual-system redesign. A scoped card-grid correction follows the hosted geometry regression described below.

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

## Hosted geometry follow-up

Draft PR #1012 at `fcdd23289d48ef97ba410e7ecabf043d7cf0da8d` failed the
unchanged card-skeleton geometry check: Inventory card 353x1289 versus skeleton
353x380. The legacy desktop three-column row squeezed copy between a 98px image
and at least 136px of metadata inside an auto-fit narrow card; added guidance
amplified that squeeze. Correct the loaded card, not the skeleton or its tolerance:
use image/copy columns, a full-width guidance row and full-width wrapping metadata.
Keep all information visible. Add desktop/mobile browser assertions for readable
copy width, full-width rows and no overflow. Existing skeleton thresholds remain
unchanged. Local browser launch is still blocked by socket permissions; hosted
exact-head browser evidence is required before claiming this correction qualified.

Scoped PR authority is recorded in `pr-1012.json`: 73 required and 45 critical
workflow/job identities plus the retained mandatory verifier coverage; live-job
guards remain unchanged. Local authority validation and its 16 regression cases
pass. Final local root and Player aggregates pass after the geometry correction.
Independent review corrections preserve the <=460px single-column layout, wrap
long totals, and target the total-value field rather than the optional status
pill in the new browser stress test. Hosted requalification remains pending.
