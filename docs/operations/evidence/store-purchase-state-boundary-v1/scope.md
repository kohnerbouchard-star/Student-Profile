# Store purchase transaction state boundary

ID: `ARCH-STORE-PURCHASE-STATE-001`
Status: `IN_PROGRESS`; base main `03adc6891995fe1d780fe34629b1daf14470ea39`.

Current-main and open-PR audit found no competing Store purchase-state owner.
Earlier feature/roster draft-status entries in the shared roadmap are historical;
this base includes their actual merges. CSS owner #624 remains independent.

Extract pure quote/review/settlement/receipt-refresh transitions from the existing
Store controller. The API still owns idempotency, the existing request owner still
fences asynchronous publication and session/navigation retirement, and the terminal
remains the sole authoritative read publisher. No new transport, cache or persisted
state. Ambiguous command failures retain exact quote and command lineage; committed
receipts remain committed when receipt/resource reads fail and retries perform
reads only. Invalid stale confirm/edit events are ignored while settling or after
commit; no legitimate UI flow or authoritative amount changes.

No backend, route, RPC, SQL, permission, dependency, CSS or visual change. No merge,
deployment, live purchase, or production acceptance is authorized by this tranche.

## Verification

- Pure state regression covers exact evidence identity, duplicate confirmation,
  ambiguous-response replay lineage, invalidated offers, retained receipts,
  repeated failed refresh/read-only retry, edit locking and retired views.
- Retain full Store contract, ownership, negative-state and connected fixtures.
- Real-browser synthetic transport suite retains both offer kinds, real API replay
  keys, lost post-commit response, session/navigation retirement and duplicate
  clicks. Add repeated refresh failure/retry and stale control rejection.
- Register Node state suite in full Player verification, which existing relevant
  CI workflows run. Exact-number scope/CI metadata follows draft publication.
- Full root/Player/core/Edge and browser checks must report actual outcomes; unit
  fixtures do not qualify connected database behavior or live economic parity.

Next: independent source review, final local qualification and authorized draft
publication, then exact-head CI. No completion/merge claim.

Local qualification (2026-11-17): Node 22 root aggregate, full Player verify,
backend core TypeScript, 19 focused Store tests and 65 finite-reader contract
regressions pass. The Business cutover static reader now follows the explicitly
reachable state module and preserves equivalent transition assertions; negative
mutations reject severed imports and missing refresh logic. Independent source
review found no blocker. Full Edge TypeScript and backend smoke remain blocked
by esm.sh Supabase 2.108.2 connection refusal (smoke reaches game-sessions).
All 36 browser cases could not launch: pinned Chromium 1217 absent and its download
archive is truncated. No local browser/connected/live acceptance credit is claimed;
exact-head hosted browser verification is required before considering a merge.

## Actual-main serial integration (2026-11-18)

Normally integrate actual main `51445fff957b15ffa6f8c0496300db255f2f4a03`, including merged Loans #1007 and Crafting #1008, into this existing owner. Preserve complete source/tests/authorities for all three capabilities; resolve additive roadmap intake and source pins, and regenerate the combined architecture inventory. Store source/tests remain unchanged from qualified `b8175443`. Bind both runtime roles to the published metadata-complete integration in a separate pin-only child. Independent review and fresh exact-head hosted gates remain required. No manual deployment, live DB mutation or provider-setting change.
