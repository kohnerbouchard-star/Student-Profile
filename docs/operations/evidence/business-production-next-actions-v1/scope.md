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

## Actual-number authority

Draft PR #994 source publication is `2ed94f1512e980fae556e813b6bf6cc65397f546`,
matching local tree `e61cd8d45ab5c1a6120d0f3af208189e33f57c9f` exactly.
The actual-number manifest locks ten changed paths plus two read-only verification
files; it preserves deployment, production-mutation and secret denials. Current
workflow filter derivation records 37 families, 79 active workflow/job tuples and
four guarded skips, with 115 ordered required identities and 74 unique critical
job names. No workflow trigger, command, permission or condition changes. Manifest
verification and its 16 regression tests pass. Source-only hosted CI is interim;
metadata head must receive fresh qualification and independent review.


## Hosted navigation correction (2026-11-17)

Head `4fea9422` failed the retained production-loop browser journey on desktop
and mobile: the equipment advice anchor changed the global hash to a section ID,
which the route parser treated as Dashboard. The new bounded delegated handler
prevents hash routing for allowlisted Business workspace links, requires the ready
Business route and no modal, then focuses/scrolls the existing section. Both advice
and existing workspace navigation are covered, including repeated clicks, inactive
contexts, unknown sections and missing targets. Existing economic assertions and
commands remain unchanged. Independent source review is clear.

Full root and Player verification passed after correction. Local Chromium again
failed before test execution at process-singleton socket creation (EPERM), so
hosted browser requalification remains mandatory. A separate original FX database
job failed before tests because host port 54322 was already occupied; this is not
attributed to navigation and is not waived. New-head CI must qualify it normally.

CI scope is now 11 changed / 13 locked paths, 38 workflow families, 80 active job
tuples and four guarded skips. Backend Typecheck is additionally triggered by the
core action handler. No workflow commands, conditions or permissions are changed.

## Main reconciliation after PR998

Reconciled reviewed published Business head `7c270588b12d19c0a23e89242fbcc65d27de4970` with actual main `9df2064d6835b64ab9f7a3bde19ed1da5356cded`. The sole conflict was additive roadmap intake; both records are retained exactly. Every Business implementation/test blob is unchanged and every Crafting predecessor change is retained. The prior head completed 39 workflows successfully; this does not qualify the union. The actual-PR scope remains 11 changed paths/13 locks and 38 families/80 active tuples/four guarded skips. Fresh local aggregate, independent union review, exact-head hosted and browser qualification remain required. No merge/deployment or live acceptance claimed.
