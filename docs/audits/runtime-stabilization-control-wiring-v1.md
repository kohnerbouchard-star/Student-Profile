# Runtime Stabilization and Control Wiring Audit V1

## Authority and scope

- repository: `kohnerbouchard-star/Student-Profile`
- exact starting main: `8fb44c6bb83d37ce755088f0898beabb8d95309b`
- synchronized main: `887ccfc80ec0cf932de47c3d6d14650c6fd2c624`
- branch: `agent/full-runtime-stabilization-audit-v1`
- objective: make the existing application function as designed without architecture changes, schema changes, feature redesign, production deployment, or integration of held work

This tranche does not integrate Full Financial Markets PR #305 or release-gate PR #295. It does not enable limit-order execution or message attachments because those authorities are not part of current main.

## Audit method

The runtime audit combines:

1. static tracing from rendered Player forms and delegated actions to registered endpoint keys;
2. verification that every registered Player endpoint resolves to a connected Student-Profile backend route;
3. source inventory of Player and Admin button templates;
4. existing browser smoke coverage for Admin navigation, create workflows, game lifecycle, contracts, player identity, attendance, modal behavior, keyboard behavior, and responsive layouts;
5. targeted tests for newly connected local controls;
6. the normal Player Terminal verification suite and repository CI.

The repository-owned command is:

```bash
npm run audit:interaction-wiring
```

## Confirmed existing connected flows

The existing runtime already contains specialized connected flows for:

- Player session bootstrap and capability discovery;
- Store quote, confirmation, purchase receipt, and refresh;
- immediate stock market orders and receipt handling;
- Banking pagination;
- Contracts acceptance and submission;
- Inventory redemption;
- Marketplace lifecycle actions;
- Messaging lifecycle actions;
- Progression unlock and claim actions;
- Story delivery state;
- World, travel, residency, notifications, logout, and session-safe exit;
- Admin game creation and automatic game-content provisioning;
- Admin game lifecycle, players, attendance, contracts, Store, Messaging, Progression, inventory redemptions, settings, and account surfaces covered by existing browser/contract smoke suites.

## Fixed in this tranche

### Market search

The visible market search control now opens a real search field and filters listed instruments by rendered symbol, company, type, and sector text. The control maintains `aria-expanded`, reports the number of matches, and renders a truthful empty state.

### Market chart ranges

The visible `1D`, `1M`, `3M`, `1Y`, and `ALL` controls now select bounded portions of the currently loaded market history and update the SVG chart. Active-state and `aria-pressed` attributes are synchronized.

### Banking export

The visible Banking Export control now creates a CSV file from the authoritative posted transactions already loaded in the Player Terminal. CSV escaping covers commas, quotes, and line breaks. No new backend endpoint is required.

### Capability truthfulness

The three local-only capabilities above are enabled independently of the backend manifest because they operate solely on already-authorized data in the browser. Backend-dependent features remain manifest-gated.

## Intentionally unavailable on current main

- Limit orders: the current stock backend supports immediate market orders only. The existing UI shows a non-submitting backend-integration-pending state.
- Message attachments: attachments remain disabled and fail closed.
- Features owned exclusively by held PRs are not copied or partially activated.

## Validation

Targeted validation:

```bash
npm run audit:interaction-wiring
npm --prefix player-terminal run local-controls
npm --prefix player-terminal run verify
```

Repository and browser workflows remain authoritative for the final branch result. Production deployment is not authorized by this audit.
