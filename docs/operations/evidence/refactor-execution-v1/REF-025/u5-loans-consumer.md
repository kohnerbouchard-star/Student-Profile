# REF-025b3 — Actual Loans currency consumer
Base: d2aa78c8ddd25d086db08dadc66e7af47ec598bd (accepted PR842).
Merged-base qualification:17 successful runs/five expected skips, all terminal.
Parent approved <=360 changed lines/seven paths and the narrow Player handoff.
Editable: player-terminal/src/pages/loans-page.js, src/api/response-normalizer.js,
tests/business-banking-surface.mjs, tools/connected-banking-loans-mutation-runner.mjs
(all under player-terminal); this evidence; PR-bound Player authority manifest;
scripts/business-banking-player-commerce-browser-acceptance.core.mjs (separate
parent-approved commerce handoff). Inventory regeneration produced no change.
#624 layout/disclosures/accessibility and #668/#736 inventory authority remain.
No read-model/API/app/realtime/CSS, backend, schema or economic-policy change.
## Behavior and compatibility
The reachable Loans page consumes currencyProjection v1 and authoritative row
currencyCode. Exact decimal strings are grouped as strings, never cast to Number.
Legacy numeric row values retain the existing numeric formatter with row currency.
Valid zero remains zero; unknown row currency is explicitly unavailable.
Missing/malformed/incomplete projections show unavailable summaries; empty complete
projections show no currency obligations/offers. No legacy mixed-currency total is
relabelled as local currency. Valid application and repayment controls remain.
Optional projection validation reads the original response before generic sanitizer
truncation, rejects oversized arrays/strings, duplicate currency groups, bad version,
non-string money or inconsistent completeness; only known validated fields survive.
Six-digit next-due strings pass through unchanged. No new grouping or FX semantics.
Forms, operation IDs, request payloads, business account selection, loan eligibility,
repayment rights, refresh and server-authoritative transaction/replay rules remain.
## Qualification
Existing surface suite adds exact/zero/mixed/unknown/old/malformed/truncation cases.
Existing Loans runner adds desktop/mobile synthetic rendering, keyboard/focus and
no-overflow cases, plus a connected authoritative-projection-to-page assertion.
Its original application/repayment persistence, replay and anonymous rejection stay.
Response capture waits for the new main-frame navigation and consumes its body
immediately; a forced old-document response reproduces failure before this fix.
Local surface tests, full Player verify, root npm test and synthetic browser pass.
Browser fixtures use installed Chromium; pinned full browser/connected acceptance
and backend checks require exact-head CI, recorded in PR metadata.
Local backend typecheck/smoke hit the baseline esm.sh tunnel failure; neither passed.
Commerce balance reads wait for ready Banking/finished route loading and a DOM
amount matching the authoritative currency row; ready absent currency retains zero.
The existing30-second deadline and credit/transfer/replay assertions are unchanged.
No live database, settings, credentials, dispatch, deployment or U1 guard change.
Rollback reverts this consumer only; no balances, liabilities or server writes move.
REF025 remains BLOCKED; 025c and original acceptance remain. REF027 needs025+026.

Parent approved five-line synthetic-page isolation after the capture probe: retain
the shell, retire its controller, preserve all assertions. Deterministic late refresh
overwrites the old fixture; isolated exact/legacy/incomplete/empty fixtures pass at
1440/390 with keyboard/overflow checks. Real connected mutation checks run first.
