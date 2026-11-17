# Marketplace order history

Item: PLAYER-MARKETPLACE-ORDER-HISTORY-001

Base: 956ad02db949ae9c4cff7d709a18ec28d20c0788.

Read-only disclosure of current Marketplace orders already returned by the protected read API. Buyer total and seller proceeds remain distinct, each record retains currency and status, and displayed values are explicitly original settled amounts rather than current balances. No cross-currency aggregate or complete-statement claim. Empty lists remain explicit. Existing native details and panel styles are reused. No route, RPC, migration, dependency, permission, economic command or deployment change.

Files: player-terminal/src/pages/marketplace-page.js; existing registered marketplace-connected-lifecycle.mjs and marketplace-lifecycle-core.mjs tests; this scope and additive roadmap intake.

Focused Node tests pass for buyer/seller, refund, empty, escaping, missing date, and no form/command in receipts. Desktop/mobile browser test extends existing authenticated harness to expand/collapse receipts without quotes, settlements or hash changes. Initial full root and Player aggregates pass on the implementation. Independent review identified receipt-reference wrapping risk; fixed with escaped word-break chunks and a browser range-overflow assertion. Baseline negative control fails against unchanged main. Final aggregate reruns follow the wrapping fix. Core TypeScript passes; full Edge stops because Deno is not on PATH. Browser attempted desktop/mobile but cannot launch because the pinned Chromium executable is absent, so no actual browser pass is claimed. Exact PR authority and hosted qualification remain pending. No live evidence, merge or deployment claimed.
