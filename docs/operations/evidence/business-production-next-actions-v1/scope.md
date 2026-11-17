# Business production-to-sale next actions

Roadmap item: `BUSINESS-PLAYER-NEXT-ACTIONS-001`.
Base: main `956ad02db949ae9c4cff7d709a18ec28d20c0788`.
Owner: `feat/business-production-next-actions-v1`.

## Ownership audit

Fetched main and inspected the roadmap, contribution rules and live open PRs on
2026-11-17. Open PRs were #983, #938, #933, #735, #731, #624 and #620. No active
Business feature owner overlaps this bounded feature. Existing #926 production
controls are already in main; older unmerged ledger wording is historical.
Do not replace or duplicate those commands. Co-owner formation UI is separate.

## Implementation

- `player-terminal/src/pages/business-next-actions.js`: read-only advisory
  projection and existing-style panel, linked to existing workspace sections.
- `player-terminal/src/pages/business-workspace-sections.js`: include the panel.
- `player-terminal/tests/business-next-actions.mjs`: unavailable/invalid/ready
  reads, missing identities, blocked inputs, equipment, finished stock,
  draft/paused/active/withdrawal offers, receipts and repeated pure rendering.
- Existing Business production-loop browser test checks guidance transitions and
  verifies clicking guidance submits no command. Its transport remains synthetic,
  not proof of database settlement.
- Existing Player verification aggregate includes the new Node tests.
- Deterministic architecture inventory regenerated: 1,624 source files; all
  other counts unchanged (84 persistence candidates; no increased ratchets).

No new route, RPC, migration, mutation, credential, permission, CSS or deployment
change. No balances or inventory are inferred or written. Published listings are
explicitly not described as earned revenue. No automated purchases or publication.
The panel is suppressed unless the Business read is ready; dependent stock and
equipment advice requires its own ready read. Existing forms/server retain all
capability, ownership, freshness, idempotency and transaction checks.

## Verification limits

Focused Node tests and full Player verification pass. Root aggregate passed with
its retained explicit PostgreSQL skip (no new SQL). Core backend TypeScript passes.
Full Edge typecheck remains blocked on the unchanged frozen Supabase SDK import
from esm.sh (connection refused). Local Chromium tests cannot launch because this
executor denies process singleton sockets (`Operation not permitted`), including
an escalated attempt. None of the four desktop/mobile test bodies ran. Hosted
exact-head browser qualification is required; no browser pass is claimed.

No staging/production runtime acceptance or deployment is claimed. Draft remains
unqualified pending independent review and applicable hosted exact-head checks.
Next: publish draft, qualify unchanged commands/gates, and reconcile current main
serially before any separately authorized merge.
