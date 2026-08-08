# Admin UI V2 Banking Architecture

## Scope

This document defines the source-owned Admin UI V2 Banking route on branch `refactor/admin-ui-v2-banking-v1`.

Reconciled base: `5469e47cfc160d1821e7e99e4bd19985eabcc72b`.

The route is limited to the authoritative personal Banking Admin/BFF contract merged by PR #529. It does not modify Backend, Supabase, migrations, legacy Admin banking, Loans, Market, Marketplace, business banking, roadmap ownership, or inherited architecture/scroll guardrails.

## Dependency resolution

PR #501 merged the canonical Checking/Savings and currency-scoped personal banking authority.

PR #529 resolved issue #528 by adding a dedicated personal Banking Admin/BFF surface under the `banking` resource family, which is protected by `economy.adjust` without weakening the separate `/players` → `players.manage` boundary.

Banking V2 is therefore no longer coupled to the Players administration permission.

## Canonical account model

The Admin V2 Banking surface exposes only two personal account types:

- **Checking**
- **Savings**

There is no generic Cash account in the UI, route state, normalization boundary, filters, summaries, adjustment controls, or activity labels. Any non-canonical account row is ignored by the client, and the authoritative backend Banking surface also filters non-canonical personal accounts.

Loans and business accounts remain outside this personal Banking read model.

## Authoritative Admin/BFF contracts

| Capability | Authoritative contract | V2 behavior |
| --- | --- | --- |
| Player Checking/Savings balances | `GET /api/admin/games/:gameId/banking/players` | Reads the Banking-specific roster and canonical currency-scoped `checking` / `savings` balances. |
| Posted player banking activity | `GET /api/admin/games/:gameId/banking/players/:playerId/history-audit` | Loads canonical ledger presentation fields on demand for the selected player. |
| Administrative balance correction | `POST /api/admin/games/:gameId/banking/players/:playerId/ledger-adjustments` | Posts an idempotent correction to an explicit Checking/Savings account and currency. |
| Personal Checking ↔ Savings transfer initiation | None | No transfer control is rendered. Posted authoritative transfer ledger entries are displayed read-only. |
| Account status / savings interest metadata | None | No status/interest control or invented value is rendered. |

The route-owned API adapter remains on the same-origin `/api/admin` boundary and uses the shared Admin BFF transport for selected-game scope, HttpOnly session behavior, CSRF, device binding, MFA enforcement, and idempotency headers.

## Permission boundary

The Banking navigation and backend resource contract are both:

`economy.adjust`

The Banking route no longer consumes `/games/:gameId/players...` for roster, history, or adjustment operations. The Players administration surface remains separately protected by `players.manage`.

The UI fails closed when `economy.adjust` is absent, and the BFF remains authoritative for server-side authorization and MFA requirements.

## Currency rules

Banking is multi-currency and authoritative-player/local-currency aware.

- No route-owned formatter defaults to `ECO`.
- Missing/invalid currency codes remain unavailable rather than being replaced with ECO.
- Administrative adjustments are disabled for account rows that lack an authoritative currency code.
- The mutation adapter rejects an adjustment without a valid currency code before making a request.
- The backend Banking mutation revalidates the requested currency through the merged player ledger currency authority.
- Summary metrics count players/accounts/currencies; monetary balances are never cross-summed across currencies.
- Amount presentation uses numeric locale formatting plus the authoritative code instead of assuming the code is an ISO legal-tender currency accepted by `Intl.NumberFormat({style: "currency"})`.

## Read model and privacy boundary

The backend Banking DTO is intentionally narrower than the Players administration projection.

- It provides only Banking presentation identity, country display name, status, and canonical balance rows required by this route.
- Player UUIDs are retained by the controller only as internal `resourceId` values needed for scoped BFF requests.
- DOM row keys are route-local (`banking-player-N`, `banking-entry-N`).
- UUID-shaped player-facing strings are suppressed.
- Ledger entry IDs, source IDs, player IDs, and ownership identifiers are not copied into the activity presentation model.
- The route does not place resource UUIDs in text, ARIA labels, `data-*` attributes, or table row keys.

Posted activity keeps only canonical account type, amount, currency code, entry type, safe source classification, safe description, and timestamp.

## Transfer presentation

A canonical Checking/Savings ledger entry whose authoritative source domain/action identifies a transfer is labeled `Account transfer`. The UI displays the account associated with that ledger row as Checking or Savings.

The route does **not** infer a from-account/to-account pair and does not expose a transfer mutation button because no authoritative Admin personal-transfer mutation exists.

## Administrative adjustments

Adjustments are available only when all of the following are true:

1. The route has `economy.adjust` permission.
2. The player has an internal BFF resource identity.
3. The player is active.
4. The selected account already exists in the normalized Banking read model.
5. The account is Checking or Savings.
6. The account has an authoritative currency code.
7. The amount is finite and non-zero.
8. A reason is supplied.

The client sends the same idempotency key in the request header and mutation body. A retryable failure retains the key for the same mutation fingerprint; a successful or non-retryable request releases it. The backend records the operation through the existing idempotent staff ledger service under `admin.banking.ledger_adjustment` and rejects retired `cash` before persistence.

## Admin V2 data states

Banking uses the shared Admin V2 data-state machine:

- initial loading
- ready
- refreshing
- stale with retained resolved data
- empty
- failed/retry

Permission denied remains owned by the shared `AdminPermissionBoundary`. Player activity has an independent read state so opening one player's history does not block or replace the account roster.

## Responsive behavior

The desktop layout uses the existing Admin V2 data-table component. Below the route breakpoint, account and activity rows become semantic stacked cards with explicit field labels. Summary metrics and filters collapse to a single column on narrow screens. Long player names wrap rather than widening the viewport.

## Shared-file ownership

Shared application edits are limited to:

- `admin/v2.html`: load Banking route CSS.
- `admin/v2/src/app.js`: register the Banking controller and share the existing BFF transport.
- `admin/v2/src/core/navigation-registry.js`: change Banking from `planned` to `v2` while retaining `economy.adjust`.
- `scripts/admin-v2-unit.test.mjs`: update canonical V2 migration assertions and include Banking regression tests.

Inherited architecture and generic scroll assertions remain owned by `main` and are not weakened or rewritten by Banking. In particular, `scripts/admin-architecture-ratchet.mjs` and `scripts/admin-scroll-integrity-contract.test.mjs` remain authoritative mainline files and are not part of this PR diff.
