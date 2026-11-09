# Validation matrix and evidence rules

Commands below were read from the observed repository manifests; re-resolve scripts against the execution SHA. These are execution requirements, not claims that the author ran the application tests while publishing documentation. Use the repository's pinned Node/npm/Deno and lockfiles. Do not substitute `latest` tools.

## Shared checks

For a source refactor, run focused tests while iterating, then the repository-required final checks:

```sh
npm run audit:architecture
npm run audit:high-priority-boundaries
npm run audit:legacy-runtime
npm run security:secrets
npm test
npm --prefix backend run typecheck:all
npm --prefix backend run smoke
git diff --check
```

Follow CONTRIBUTING for installs (`nvm use`, `npm ci`, `npm --prefix backend ci`). Browser packages use their own existing lockfiles. Inventory regeneration may alter a tracked evidence file; examine that diff, never raise a ceiling automatically. A docs-only task runs document/link/JSON/dependency/scope checks and applicable repository policy checks; it does not earn backend/runtime test credit.

## Focused suites by seam

| Seam | Existing commands |
|---|---|
| Admin/compatibility routing | `npm --prefix backend run test:admin-api`; `npm --prefix backend run test:admin-local-mutations`; `npm run test:admin-local-mutation-ui` |
| Auth/context | `npm run test:auth-boundaries`; `npm run test:web-session-release`; `npm --prefix backend run test:player-request-scope`; `npm --prefix backend run test:player-security`; `npm --prefix backend run test:player-capabilities` |
| Game-session preservation | `npm --prefix backend run test:game-sessions`; `npm --prefix backend run test:game-lifecycle`; `npm run test:admin-game-lifecycle` |
| Ledger/Banking | `npm --prefix backend run test:player-banking-public`; `npm --prefix backend run test:economic-ledger-invariants`; `npm run test:admin-economic-writes` |
| FX preservation | `npm --prefix backend run test:fx`; `npm --prefix backend run test:player-banking-fx`; `npm --prefix backend run test:banking-fx-orchestrator` |
| Inventory/Crafting | `npm --prefix backend run test:player-inventory`; `npm --prefix backend run test:player-crafting`; `npm run test:crafting-runtime` |
| Marketplace | `npm --prefix backend run test:player-marketplace`; `npm --prefix player-terminal run marketplace-connected` |
| Store | `npm --prefix backend run test:player-store-public`; `npm --prefix player-terminal run store-flow`; `npm --prefix player-terminal run store-connected`; `npm --prefix player-terminal run store-negative` |
| Business preservation | `npm --prefix player-terminal run business-workspace`; `npm --prefix player-terminal run business-workspace-boundary`; current Business V2 workflow matrix from the authoritative checkpoint, resolved before activation |
| Contracts | `npm --prefix backend run test:player-contract-acceptance`; `npm --prefix backend run test:player-contract-lifecycle`; `npm --prefix player-terminal run contracts-connected`; `npm --prefix player-terminal run contracts-submit`; `npm --prefix player-terminal run story-decisions` |
| Countries/World/Story | `npm --prefix backend run test:player-world`; `npm --prefix backend run test:world-runtime`; `npm --prefix player-terminal run world-runtime`; `npm --prefix player-terminal run world-news-route` |
| Notifications/Messaging | `npm --prefix backend run test:player-notifications`; `npm --prefix backend run test:player-messaging`; `npm --prefix player-terminal run notifications-inbox`; `npm --prefix player-terminal run messaging-connected`; `npm --prefix player-terminal run story-delivery` |
| Progression | `npm --prefix backend run test:player-progression`; `npm run test:progression-simulation`; `npm run test:admin-progression` |
| Stocks/Markets | `npm --prefix backend run test:stock-market-calendar`; `npm --prefix backend run test:player-market-assets`; `npm run test:market-trigger`; `npm --prefix player-terminal run market-flow`; `npm --prefix player-terminal run market-holdings` |
| Player data plane | `npm --prefix player-terminal run verify`; `npm --prefix player-terminal run read-ordering`; `npm --prefix player-terminal run realtime`; `npm --prefix player-terminal run recovery`; `npm --prefix player-terminal run route-refresh` |
| Admin UI | `npm run test:admin-v2`; `npm run test:admin-v2:browser`; affected route/browser suite and `npm run audit:interaction-wiring` |
| Runtime/retirement/release tooling | `npm run test:legacy-runtime`; `npm run test:player-runtime-cutover`; `npm run test:release-platform`; `npm run test:web-session-release`; `npm run test:observability` |

Where an exact domain test is not registered (for example a newly extracted pure helper), identify the current Deno configuration and locked permissions from the owning package script; add that test to the existing suite instead of inventing an unverified npm command. Database/race acceptance and affected Business checks remain mandatory for R3 economic seams even when SQL is unchanged. Run them in a disposable authorized database, never against production by default.

## Required case matrix

Authentication/route adapters: valid owner, anonymous, wrong role, wrong game/player, expired/revoked session, missing capability, malformed input, unsupported method, unavailable dependency, duplicate request and conflicting replay where relevant. Check no unauthorized database command executes.

Economic/stateful seams: successful commit, rejected insufficient funds/stock/capacity, currency/rounding boundaries, exact retry receipt, same key/different payload conflict, concurrent competing actions, rollback after injected failure, game-state denial, and no extra ledger/inventory/audit effect. Preserve transaction and effect counts, not just UI success text.

UI/data seams: loading/empty/error/success, stale response after session switch, cancellation, duplicate click, successful write followed by authoritative read, remount/disposal, keyboard operation, focus restoration and desktop/mobile layout. Synthetic browser tests do not certify human enjoyment or actual cloud runtime.

## Runtime promotion boundary

No live runtime actions are part of this documentation request. When separately authorized, use the established release controller on exact source/artifact/migration identities. Auth acceptance includes expected invalid-input/nonexistent-user responses, successful authenticated bootstrap and representative protected reads; a generic health 200 is insufficient. Economic acceptance adds a synthetic protected fixture and cleanup evidence. Production may only be called certified after its own required evidence, not after local tests or PR merge.
