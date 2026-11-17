# Facility-linked loan payment receipts

Roadmap: `LOANS-FACILITY-PAYMENT-RECEIPTS-001`.
Draft PR: #1007. Source `7254a511226252b95589ecac41e7ab09b0dcbced`.
Base `03adc6891995fe1d780fe34629b1daf14470ea39`.

## Audit and scope

Prior Loans forecast/history and repayment-account disclosure are source-merged.
Existing payment history is a flat list referring to opaque facility keys, making
multiple facilities difficult to reconcile. The new native keyboard-operable
receipt disclosures group only already authorized, normalized payment records by
facility. Current product name is reference metadata, not historical loan terms.

The existing normalized facility public key is the sole join. No current offer,
player home currency, array index, name, or debt total determines that join.
Orphan receipts remain visible when the bounded facility window omits their loan.
Every receipt retains its currency, principal/interest allocations, posted or
reversed state, public key and recorded/applied dates. No payment total or payoff
quote is synthesized. Both section and disclosure retain incomplete-window
warnings. Refreshing unavailable lifecycle data removes the stale receipts.

Implementation: `player-terminal/src/pages/loans-history.js`.
Tests: `player-terminal/tests/loans-lifecycle-forecast.mjs` and
`player-terminal/tests/browser/player-loans-lifecycle.spec.mjs`.
No migration, RPC, backend/query, route, permissions, CSS or mutation changes.

## Evidence and remaining gates

- Focused lifecycle Node tests: 14/14 pass, including three new grouping/orphan/escaping regressions that fail unchanged main.
- Full Player verify and full root npm test pass under Node 22.23.1/npm 10.9.8.
- Backend core TypeScript passes. Full Edge check fails retrieving the frozen esm.sh Supabase SDK; no skip or version replacement.
- Desktop/mobile receipt disclosure regression added. Local pinned Chromium unavailable; browser behavior remains unqualified until hosted execution.
- Independent source review found no actionable issue and independently passed all 14 lifecycle cases and the Loans surface contract. Independent metadata review also confirms 25 workflow families, 47 active tuples, 3 guarded skips and complete 7-changed/9-locked scope with no workflow edits. Fresh exact-head hosted qualification remains required. No real database, staging or production acceptance claimed.

Actual-number authority and CI contract are derived from current main-target
pull_request filters against the complete changed scope. Read-only verifier paths
are locked, not edited. All production/deployment/secret denials remain false.

Next: qualify exact-head checks and return the draft for review. No merge/deploy.
