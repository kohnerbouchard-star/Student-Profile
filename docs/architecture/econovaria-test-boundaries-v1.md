# Econovaria test boundaries v1

Roadmap item: `ARCH-402-TEST-BOUNDARIES-001`. Local owner:
`refactor/test-domain-boundaries-v1`; status and qualification are in the
[scope record](../operations/evidence/test-domain-boundaries-v1/scope.md). The
audited base is freshly fetched main `d3ed3208518c813d041813a42cc85993d5b8d66a`
(tree `5309e07916de5a62a3dab0d5e74e5f96aa25dc1e`).

## Classification rule

Keep all ten suites colocated and keep their real collaborators where the
assertion compares two domains. A test may intentionally couple to a concrete
parser or service to characterize integration behavior. A new production export,
barrel, mock or file move solely to reduce an inventory count adds no value
here.

The unchanged inventory scanner counts relative `from` and dynamic `import()`
declarations crossing domain folders, exempting only a target
`index.ts`/`index.js`. It counts named public entries too, and omits bare
registration imports. These are lexical declarations, not numbers of symbols,
tests or violations. The full inventory remains 70: 22 production and 48 test
declarations. Before this change, four counted test declarations use supported
public entries, one uses an obsolete private type path, and 43 characterize
integration. After the one path correction, five use public entries and 43
characterize integration; all 48 remain counted. No scanner, schema, exemption
or ceiling changes.

This approach follows
[testing through maintained interfaces](https://abseil.io/resources/swe-book/html/ch12.html)
and
[using real collaborators where practical](https://abseil.io/resources/swe-book/html/ch13.html).
Those principles do not require exposing otherwise-private APIs to production
just to satisfy a test inventory metric.

## Exact counted declarations

Consumer paths below are relative to `backend/src/domains/`. Each target is the
literal source specifier relative to that consumer. One row is one counted
import declaration. `Public` means an existing intentionally supported entry;
`Integration` means a retained real cross-domain collaborator, not a production
boundary approval. The generated architecture inventory is listed separately
from the two meaningful code/workflow edits.

### `crafting/api/playerCraftingInventoryBridge.test.ts` — 2 declarations

Inventory/Crafting dispatch integration. Keep the real Inventory handler and
parser: exact accepted/denied/malformed dispatch parity, rate-key mapping,
configuration/auth/rate/failure ordering, exact RPC arguments, selected
dependency reads and restoration of the original Deno.env property descriptor.

| Target                                                  | Classification |
| ------------------------------------------------------- | -------------- |
| `../../inventory/api/playerInventoryReadHttpHandler.ts` | Integration    |
| `../../inventory/api/playerInventoryRoutePaths.ts`      | Integration    |

### `crafting/contracts/playerCraftingCapabilityManifest.test.ts` — 1 declarations

Manifest decoration integration. Use the real predecessor Player manifest to
check preserved capabilities, reviewed Crafting routes and endpoint uniqueness.

| Target                                                         | Classification |
| -------------------------------------------------------------- | -------------- |
| `../../players/contracts/playerCapabilityManifestContracts.ts` | Integration    |

### `economy/tests/economicMutationLedgerInvariant.test.ts` — 1 declarations

Economic/Contract integration. Keep the real Contract reward service and
retained Staff/Attendance collaborator: one-write, zero-write and replay cases,
exact balances, replay-before-write SQL contracts and atomic reward semantics.

| Target                                              | Classification |
| --------------------------------------------------- | -------------- |
| `../../contracts/services/contractRewardService.ts` | Integration    |

### `game-dashboard/api/playerGameDashboardHttpHandler.test.ts` — 2 declarations

Supported public boundaries. Store owns dashboardReadModel; Story owns
notificationCapabilities. Preserve scoped query traces, defaults, ordering,
fresh injected reads, privacy and known/unknown error identity. Existing
Contracts/Stocks index imports are exempt from this lexical metric and remain
unchanged.

| Target                                                | Classification |
| ----------------------------------------------------- | -------------- |
| `../../store/dashboardReadModel.ts`                   | Public         |
| `../../storylines/server/notificationCapabilities.ts` | Public         |

### `notifications/public/storyNotifications.test.ts` — 1 declarations

Notification/Story integration. Run the real Story notification service against
the public publisher: notification writes precede deliveries, awaited insertion,
partial failure/retry, replay and existing read-state preservation.

| Target                                                  | Classification |
| ------------------------------------------------------- | -------------- |
| `../../storylines/services/storyNotificationService.ts` | Integration    |

### `players/api/playerCapabilityManifestRoutePaths.test.ts` — 17 declarations

Real route-parser integration. Compare all migrated route families with their
real independent parsers, preserving exact direct/Edge paths, spoof-prefix
rejection and supported dispatch. Public manifests must continue to agree with
dispatch.

| Target                                                          | Classification |
| --------------------------------------------------------------- | -------------- |
| `../../business-banking/api/playerBusinessBankingRoutePaths.ts` | Integration    |
| `../../contracts/api/playerContractAcceptanceRoutePaths.ts`     | Integration    |
| `../../contracts/api/playerContractPublicListRoutePaths.ts`     | Integration    |
| `../../contracts/api/playerContractPublicSubmitRoutePaths.ts`   | Integration    |
| `../../countries/api/playerWorldRoutePaths.ts`                  | Integration    |
| `../../crafting/api/playerCraftingRoutePaths.ts`                | Integration    |
| `../../economy/api/playerBankingPublicRoutePaths.ts`            | Integration    |
| `../../inventory/api/playerInventoryRoutePaths.ts`              | Integration    |
| `../../marketplace/api/playerMarketplaceRoutePaths.ts`          | Integration    |
| `../../messaging/api/playerMessageThreadLifecycleRoutePaths.ts` | Integration    |
| `../../messaging/api/playerMessagingRoutePaths.ts`              | Integration    |
| `../../notifications/api/playerNotificationRoutePaths.ts`       | Integration    |
| `../../notifications/api/playerStoryDeliveryRoutePaths.ts`      | Integration    |
| `../../progression/api/playerProgressionRoutePaths.ts`          | Integration    |
| `../../stocks/api/playerStockAssetListRoutePaths.ts`            | Integration    |
| `../../store/api/playerStorePublicRoutePaths.ts`                | Integration    |
| `../../world/api/playerWorldRuntimeRoutePaths.ts`               | Integration    |

### `players/contracts/playerCapabilityManifestContracts.test.ts` — 18 declarations

Manifest/dispatch integration. Preserve manifest shape, disabled/planned
actions, UUID privacy, independent route matching and exact method/pathTemplate
contracts, including Inventory redemption and Stock asset routes.

| Target                                                          | Classification |
| --------------------------------------------------------------- | -------------- |
| `../../economy/api/playerBankingPublicRoutePaths.ts`            | Integration    |
| `../../countries/api/playerWorldRoutePaths.ts`                  | Integration    |
| `../../world/api/playerWorldRuntimeRoutePaths.ts`               | Integration    |
| `../../contracts/api/playerContractAcceptanceRoutePaths.ts`     | Integration    |
| `../../contracts/api/playerContractPublicListRoutePaths.ts`     | Integration    |
| `../../contracts/api/playerContractPublicSubmitRoutePaths.ts`   | Integration    |
| `../../inventory/api/playerInventoryRoutePaths.ts`              | Integration    |
| `../../inventory/api/playerInventoryRedemptionRoutePaths.ts`    | Integration    |
| `../../marketplace/api/playerMarketplaceRoutePaths.ts`          | Integration    |
| `../../messaging/api/playerMessageThreadLifecycleRoutePaths.ts` | Integration    |
| `../../messaging/api/playerMessagingRoutePaths.ts`              | Integration    |
| `../../notifications/api/playerNotificationRoutePaths.ts`       | Integration    |
| `../../notifications/api/playerStoryDeliveryRoutePaths.ts`      | Integration    |
| `../../stocks/api/playerStockAssetListRoutePaths.ts`            | Integration    |
| `../../stocks/api/playerStockMarketPublicRoutePaths.ts`         | Integration    |
| `../../store/api/playerStorePublicRoutePaths.ts`                | Integration    |
| `../../business-banking/api/playerBusinessBankingRoutePaths.ts` | Integration    |
| `../../progression/api/playerProgressionRoutePaths.ts`          | Integration    |

### `stocks/api/stockMarketRunnerHttpHandler.test.ts` — 1 declarations

Supported public boundary. Use canonical publicRealtime projection/validation;
retain game/channel/privacy/sequence checks before transport and
commit-before-publish, stop-on-failure and best-effort behavior.

| Target                                   | Classification |
| ---------------------------------------- | -------------- |
| `../../game-dashboard/publicRealtime.ts` | Public         |

### `storylines/infrastructure/stockMarketStoryNewsWriter.test.ts` — 1 declarations

Supported public boundary. Stocks owns news.ts. Preserve source/game/provenance
precedence, metadata, deterministic bounded IDs, tick precedence including zero,
and pre-persistence rejection.

| Target                 | Classification |
| ---------------------- | -------------- |
| `../../stocks/news.ts` | Public         |

### `storylines/services/econovariaStorylineLoopSmoke.test.ts` — 4 declarations

One supported public boundary plus Stocks/Story integration. Replace only the
realtime type path. Keep the real Stocks HTTP handler and Story execution with
their engine/repository types, deterministic fixtures, cutscene and ledger
effects, one Contract creation and idempotent rerun assertions. No runtime
export changes.

| Target                                                 | Classification |
| ------------------------------------------------------ | -------------- |
| `../../game-dashboard/publicRealtime.ts`               | Public         |
| `../../stocks/api/stockMarketRunnerHttpHandler.ts`     | Integration    |
| `../../stocks/contracts/stockMarketEngineContracts.ts` | Integration    |
| `../../stocks/contracts/stockMarketRunnerContracts.ts` | Integration    |

## Owning runners and registration edges

| Suite/consumer             | Normal runner retained                                       | Registration details                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Player route/manifest pair | Backend `test:player-capabilities`, included in smoke        | Three explicit roots; the HTTP manifest suite also remains registered.                                                                                                                                  |
| Crafting bridge/decorator  | Crafting Item Runtime workflow                               | The workflow explicitly runs both plus `playerCraftingRateLimitDispatch.test.ts`; Backend Typecheck also explicitly runs the bridge. Backend `test:player-crafting` does not itself register this pair. |
| Economic invariant         | Backend `test:economic-ledger-invariants`, included in smoke | Bare same-domain import registers `economy/api/staffLedgerAdjustmentHttpHandler.test.ts`.                                                                                                               |
| Dashboard                  | Business Financial Market workflow                           | Explicit Dashboard test; that workflow watches `game-dashboard/**`. Dashboard is not in backend smoke or `classroomApiSmokeTest.ts`; no registration change is needed.                                  |
| Notification publisher     | Backend `test:player-notifications`, included in smoke       | Bare cross-domain import registers `storylines/server/notificationCapabilities.test.ts`.                                                                                                                |
| Stocks HTTP/calendar       | Backend `test:stock-market-calendar`, included in smoke      | HTTP suite has bare imports of Stocks runtime cursor repositories, engine tests and the Story factory suite.                                                                                            |
| Story news writer          | Story Replay Safety workflow                                 | Explicit existing entry; all provenance/ID/tick tests retained.                                                                                                                                         |
| Story loop                 | Story Replay Safety workflow, newly appended                 | Base audit found no workflow, script, config or import registering this test normally. It is now an explicit argument with the original allow-read list and all other arguments retained.               |

The scanner omits these **two cross-domain bare test-registration edges** in the
reviewed suite graph; they exist on base and are unchanged:

- `notifications/public/storyNotifications.test.ts` →
  `../../storylines/server/notificationCapabilities.test.ts`.
- `stocks/api/stockMarketRunnerHttpHandler.test.ts` →
  `../../storylines/server/stockTickStorylineRunner.test.ts`.

Also preserve the same-domain bare edges from Stocks HTTP to
`../infrastructure/runtimeCursorStockMarketRepositories.test.ts` and
`../calculations/stockMarketEngine.test.ts`, from Story's
`services/storylineRunnerGameScope.test.ts` to
`../server/stockTickStorylineRunner.test.ts`, and from the economic invariant to
`../api/staffLedgerAdjustmentHttpHandler.test.ts`. The four factory tests
therefore run transitively in both Stocks/calendar and Story Replay. The loop
remains a separate direct entry. Runtime-expanded test identities and skips,
including loop-generated cases and imported registrations, are compared using
JUnit output; lexical `Deno.test` counts are not used as coverage evidence.

## Bounded change and preservation

Only `econovariaStorylineLoopSmoke.test.ts` changes an import specifier. Its two
realtime names remain type-only and already exported by `publicRealtime.ts`. Its
executable body, fixtures and every assertion are byte-identical to base. The
other nine inventoried test files are byte-identical. The owning Story workflow
gains one test argument; permissions, read allowlist, checks, filters and
existing roots are preserved. The generated inventory changes one target string
and no counts.

No production source/export, route, RPC, SQL/schema, package/lock, dependency,
UI, release policy or hosted state changes. In particular `backend/package.json`
remains blob `8f8fe07cb0e446a121fcbc519cb692447c2e1b68`, preserving its three
REF-003 hash bindings and generator-owned calendar command. Draft #888's broader
donor implementation is not acquired. This bounded cleanup does not complete
ARCH-402 or certify any live capability.
