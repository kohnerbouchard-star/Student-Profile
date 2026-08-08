# Admin UI V2 Banking — Verification

Base: `5469e47cfc160d1821e7e99e4bd19985eabcc72b`

Branch: `refactor/admin-ui-v2-banking-v1`

Dependency status: PR #501 and backend issue #528 / PR #529 are resolved. Banking now has a matching `economy.adjust` route and backend authority.

## Focused Banking coverage

`scripts/admin-v2-banking.test.mjs` covers:

- zero-player dataset;
- normal and 1,500-player datasets;
- positive and zero balances;
- strict Checking/Savings-only normalization;
- rejection of non-canonical personal account rows;
- HWC, KRW, and LOC authoritative currency preservation;
- no route-owned ECO fallback;
- no cross-currency monetary aggregation;
- long Korean/Unicode player names;
- UUID-shaped display-text suppression and UUID-free public row keys;
- posted Checking/Savings transfer presentation;
- exclusion of non-banking/legacy/loan ledger rows;
- exact `economy.adjust` Banking roster/history/adjustment paths;
- missing-currency adjustment rejection;
- idempotent adjustment to an existing active Checking/Savings account;
- stale-state retention after failed refresh;
- fail-closed `economy.adjust` controller permission handling.

The focused Banking suite is imported by `scripts/admin-v2-unit.test.mjs` and therefore runs through the repository's standard `npm run test:admin-v2` Admin V2 verification path.

## Canonical account verification

The Banking controller accepts only `checking` and `savings`. Non-canonical account rows are discarded rather than converted into Checking. The API adapter likewise restricts adjustment account types to `checking` and `savings`.

Focused fixtures intentionally include a legacy `cash` row only to prove rejection; no generic Cash account is represented in the route model or mutation contract.

## Backend authority verification

PR #529 adds the Banking-specific Admin resource family under the server's existing `economy.adjust` mapping.

The UI adapter is required to use only:

- `GET /api/admin/games/:gameId/banking/players`;
- `GET /api/admin/games/:gameId/banking/players/:playerId/history-audit`;
- `POST /api/admin/games/:gameId/banking/players/:playerId/ledger-adjustments`.

The focused test asserts these exact URLs and asserts that every Banking request uses the `/banking/players` resource family.

The separate Players administration resource remains protected by `players.manage`; Banking V2 no longer depends on it.

## Transfer contract

The merged Admin/BFF contract does not expose a personal Checking ↔ Savings transfer mutation. Transfer support in this route is supervisory: authoritative posted transfer ledger entries are shown in transaction history, and no unsupported initiation control is rendered.

## Responsive implementation

The route CSS defines explicit desktop/tablet/mobile behavior:

- four-column summary → two columns → one column;
- two-column filters → one column;
- management/activity tables → semantic stacked-card rows at `900px` and below;
- narrower mobile field-label/value layout at `640px` and below;
- long names use `overflow-wrap:anywhere`;
- account amount labels use tabular numeric formatting and do not force a fixed currency symbol.

## Inherited guardrails

Banking does not own or modify generic Admin architecture-debt thresholds or legacy scroll assertions.

The following files are absent from the Banking PR diff and remain authoritative from `main`:

- `scripts/admin-architecture-ratchet.mjs`
- `scripts/admin-scroll-integrity-contract.test.mjs`

The authoritative architecture ratchet remains at `mutationObservers: 11`. No allowed-debt threshold is increased. No inherited scroll assertion is weakened or rewritten for Banking.

## Security/diff gates

- no Banking route source contains a generic Cash compatibility conversion;
- no Banking route source introduces a MutationObserver;
- no Banking route DOM text/attribute uses player resource UUIDs;
- no browser Authorization header is introduced by the route adapter;
- Banking calls remain on the same-origin Admin BFF transport;
- all Banking BFF paths are in the `banking` resource family authorized by `economy.adjust`;
- authoritative currency is required for adjustments and revalidated by the backend;
- all already-converged Admin V2 route registrations from current `main` remain intact;
- no Backend, Supabase, migration, Loans, Market implementation, Marketplace, business-banking, shared-permission, roadmap, generic architecture, or generic scroll implementation is added by PR #512.

## Merge gate

PR #501 dependency: **cleared**.

Backend permission-authority blocker #528: **cleared by merged PR #529**.

Architecture-ratchet/scroll ownership blocker: **cleared**.

Remaining gate: normalize PR #512 directly on current `main`, confirm its diff remains limited to the 12 authorized Banking/UI/evidence files, and pass exact-head accumulated Admin V2 CI before merge.
