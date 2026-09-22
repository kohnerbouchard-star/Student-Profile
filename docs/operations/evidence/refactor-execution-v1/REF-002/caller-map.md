# REF-002 — Current route and entrypoint evidence

Task status: **IN_PROGRESS**. This report is evidence only, not runtime configuration or deletion approval. It extends PR #739 checkpoint `fcf0489ce212207659dbe98061e58fcb113f8f62` against application source `7569a829905ec5104e5b98c3e29e8dd24b158c0f` on 2026-09-22. REF-003 is unstarted.

## Coverage and interpretation

The source tables below contain **199 declarations**: 79 retained-Admin action descriptors, 24 retained-Admin read descriptors, and 96 Player capability operations across 86 keys. The Admin tables have 98 distinct pre-translation method/path pairs after removing query strings; the Player table has 96. Preserve every caller name, including the five duplicate pair occurrences; they are multiple callers, not deletion candidates. These are 194 distinct pairs across the two named namespaces, not 194 independently verified working endpoints.

The original 23 detailed cases and 57 source-reference records are preserved. The reconciled [routes.json](routes.json) now contains 24 detailed cases, including the dynamic export-status case, and eight separately classified export branches. The [entrypoints.json](entrypoints.json) index now has 76 source records, including all 16 tracked API files. These overlapping counts are not additive endpoint totals. Both JSON files now carry the bundle-readability and built-default-HTML corrections rather than relying on prose to contradict stale fields. The original task requirements are unchanged.

The rows were transcribed from the named immutable source tables and validated locally for counts, allowed methods, identifier uniqueness and duplicate pairs. No whole-repository extraction or application execution is claimed. Dynamic paths, browser transformations, disabled operations and server handlers require the separate classification below.

## Preserved detailed mapping

The [previous immutable report](https://github.com/kohnerbouchard-star/Student-Profile/blob/fcf0489ce212207659dbe98061e58fcb113f8f62/docs/operations/evidence/refactor-execution-v1/REF-002/caller-map.md) remains the history for the original 23 cases. The reconciled JSON evidence retains the original cases, aliases, guards, scope, persistence and response profiles; caller descriptions now agree with the inspected bundle tables and adapters. The following constraints still apply:

- Contract progress forwarding drops the original query when constructing the Classroom URL; changing that behavior needs a separately reviewed correction.
- The submission-decision alias currently falls back to `game.update` and adds rewards after an approved review. Other review aliases use `contracts.manage` and do not automatically reward. The two-step decision path is not one atomic transaction.
- Reward issuance is already intercepted locally inside `proxyClassroom` and calls `issue_contract_rewards_atomic_v1`. REF-009 must preserve that authority, not switch to the older reward-then-mark implementation.
- Access-code replacement still forwards to the scoped Staff handler and uses `set_player_identity_and_access_credential_v2`; identifier-only updates have different revocation behavior. Forwarded request identity is not proof of credential idempotency.
- Canonical Player Messaging imports the Classroom-owned dispatcher as source, not HTTP. Its public thread IDs, scoped RPCs and applied/replayed outcomes remain protected.
- Settings already uses `admin_update_game_settings_v1`; the Settings error bridge is a DOM observer, not a fetch interceptor. The creation credential event still closes the old dialog and opens the one-time confirmation.
- Neutral and Classroom Deno configurations are strict; Admin's configuration is not. Neither tests nor compiler permissions may be silently weakened.

## Immutable sources inspected

| Key | Source at audited main | Git blob |
| --- | --- | --- |
| bundle | [admin/dist/admin-overview-terminal.js](https://github.com/kohnerbouchard-star/Student-Profile/blob/7569a829905ec5104e5b98c3e29e8dd24b158c0f/admin/dist/admin-overview-terminal.js) | `03cf8d402136502688994e6cce670b9701f8f74f` |
| build | [scripts/build-vercel-runtime-config.mjs](https://github.com/kohnerbouchard-star/Student-Profile/blob/7569a829905ec5104e5b98c3e29e8dd24b158c0f/scripts/build-vercel-runtime-config.mjs) | `7a5f654939cea1e43f5b36c7e02af067c102ec4e` |
| boot | [admin/dist/admin-overview-boot.js](https://github.com/kohnerbouchard-star/Student-Profile/blob/7569a829905ec5104e5b98c3e29e8dd24b158c0f/admin/dist/admin-overview-boot.js) | `5b86b15fee648f871b676be9a8d6a41248ffad4f` |
| auth | [admin/admin-auth.js](https://github.com/kohnerbouchard-star/Student-Profile/blob/7569a829905ec5104e5b98c3e29e8dd24b158c0f/admin/admin-auth.js) | `299b29ddd7d821e21b82e1e6bffe06c5321acf9c` |
| catalog | [backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts](https://github.com/kohnerbouchard-star/Student-Profile/blob/7569a829905ec5104e5b98c3e29e8dd24b158c0f/backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts) | `f910cf5cf66edd54aa93a757edff513c105b7096` |
| playerIndex | [backend/supabase/functions/player-api/index.ts](https://github.com/kohnerbouchard-star/Student-Profile/blob/7569a829905ec5104e5b98c3e29e8dd24b158c0f/backend/supabase/functions/player-api/index.ts) | `c66cd29ecf05ce803478d63bf46a31ffb4233683` |
| messageHandler | [backend/src/domains/messaging/api/playerMessagingHttpHandler.ts](https://github.com/kohnerbouchard-star/Student-Profile/blob/7569a829905ec5104e5b98c3e29e8dd24b158c0f/backend/src/domains/messaging/api/playerMessagingHttpHandler.ts) | `9863984bc857c23c2fc94d7c1203c58cbbf6de02` |
| interaction | [admin/interaction-quality.js](https://github.com/kohnerbouchard-star/Student-Profile/blob/7569a829905ec5104e5b98c3e29e8dd24b158c0f/admin/interaction-quality.js) | `cdf1f4e2d75c9ebc3723d1485e7ec0df9097efcd` |

`GitHub.fetch` on the Git-data blob endpoint exposed the decoded retained bundle. The ordinary file getter's empty content was a retrieval limitation, not an empty file or proof of inactivity. Its API tables, selected call sites, public exports and export poller were inspected. Git identities are observed repository metadata; the original large bundle was not independently downloaded and re-hashed locally.

## Build and mount correction

`buildVercelDeployment` copies the six `BROWSER_ROOTS`, including `admin/`, then calls `canonicalizeAdminV2`. That function writes the contents of `admin/v2.html` to the output `admin/index.html`. Therefore the raw repository's retained HTML and the built default Admin HTML are different. The old bundle and bridges are copied as assets, but the built default page loads V2, not that retained script stack. This is a source-build conclusion, not a fresh inspection of the hosted deployment.

For the raw retained page, the inspected loading path is `admin/index.html` -> runtime/session helpers -> `admin/admin-auth.js` -> retained bundle and directly listed adapters -> `admin/dist/admin-overview-boot.js` -> `EconovariaAdminAuth.attachTerminal` -> `mountTerminal`. Mounting waits for DOM readiness, obtains a usable session and selected game, renders `feature.renderShell`, then releases the session gate. The boot script installs an Admin-session-refreshed listener and authenticated model-property bridges. No full unmount/disposal path is exposed in that boot script.

`admin-bootstrap.js` still serially imports its literal phase modules on the raw retained page. It is not loaded by the V2 HTML. Historical clients, other hosts and direct/manual script consumers remain unverified. Neither copied-but-unloaded assets nor positive raw-HTML callers establish a production quiet window. REF-015 still requires retirement evidence.

## Selected bundle-to-server paths

The bundle's `requestAdminTerminalApiAction` resolves a descriptor and stable tokens, checks pending game switches and CSRF, builds/validates its typed payload, derives idempotency identity, applies action locks, and reads `window.fetch` at request time. It preserves request timeout, mutation outcome and post-write refresh behavior. The wrapper stack therefore matters; bypassing a fetch patch can change more than the URL.

For combined Settings saving, the selected bundle action submits `PUT /games/:gameId/settings/difficulty` with an explicit-save payload. The Attendance bridge augments that existing request; `admin-auth.js::normalizeAdminRequest` translates it to `PATCH /games/:gameId/settings` before the BFF. Attendance-only saving remains a separate verification GET plus one PATCH, with the existing controller's payload-bound retry key. A refactor must not turn combined saving into two writes or silently change when the key is calculated.

For the retained submission-review descriptor, `PATCH /contracts/:contractId/submissions/:submissionId/review` becomes `POST /contracts/:contractId/progress/:submissionId/review` in `normalizeAdminRequest`. A retained GET to contract-specific submissions becomes a progress GET. The legacy submission-decision POST follows its own path and retains the already-recorded automatic reward behavior. The modern V2 Contracts client uses its explicit progress/review/reward routes and does not load this retained global normalizer.

The bundle declares `confirm-player-code-reset` and supplies a legacy-shaped typed payload. That declaration alone is not proof that every old reset control remains operative. The separately traced `player-identity-wiring.js` -> `EconovariaPlayerAccessCodeBridge.updatePlayerIdentity` path and the creation credential-event consumers remain required source relationships. Preserve those consumers; do not equate replacing one control with retiring the complete bridge.

## Other source-observed browser translations

These are selected actual `normalizeAdminRequest` branches, not a new routing registry. They explain why logical declarations cannot be blindly counted as network routes.

| Logical retained-browser request | Transport request / effect |
| --- | --- |
| POST contract archive or duplicate | POST contract collection with the matching `adminOperation` and contract ID |
| PATCH contract submissions review | POST contract progress review |
| GET contract-specific submissions | GET contract progress |
| PATCH Store item status | PATCH Store item with normalized status |
| POST Store restock or rebalance | PATCH Store item with operation and item ID |
| PUT/PATCH/POST Settings difficulty | PATCH Settings collection |
| POST Settings group reset | PATCH Settings collection with reset operation and group |
| POST log export | GET log export, then browser-generated completed-download response |
| POST Attendance export | GET Attendance history with selected filters, then CSV/download response |
| GET log related record | GET logs with `eventId`, then adapted response |

This list is selected source evidence, not an assertion that all request-normalizer branches have been enumerated or browser-tested. Existing guards, session headers and normalization order must be retained.

## Dynamic and declaration-only cases

The bundle's `getAdminTerminalExportStatusUrl` accepts a validated same-API-origin status URL or constructs `/games/:gameId/exports/:jobId`; `pollAdminTerminalExportJob` uses GET. The separately inspected `queueExportJob` section prefers `downloadPath`/`downloadUrl` before `jobId`/`id`, so its direct-download path does not poll. A job-only response enters its bounded 24-attempt GET loop. These caller names and branches are preserved, not collapsed. The dynamic template remains outside the constant tables. `EXPORT-01` in routes.json records the current source boundary: no matching export-status case in gameRoutes or the inspected disabled-operation list; the unhandled owned-game fallback is **501 `admin_route_not_implemented`**, not a working asynchronous job endpoint or the non-game 404. Earlier session, permission, rate-limit and ownership failures remain possible. This is source evidence, not executed browser/runtime evidence. External consumers remain unknown and no deletion is approved.

The Player manifest still labels its service `classroom-api`, while the inspected canonical Player index loads `trustedClientIpServe.ts` and `runtime.ts`. The response label is not evidence of a Classroom HTTP dependency. The 96-row manifest is an advertised catalog, not the router itself.

The advertised threadless `POST /players/me/messages/read` is parsed as a read action with no thread ID and returns a 400 validation error after Player-scope resolution. It is not a mark-all-read operation. The thread-specific path remains distinct. This is a documented source inconsistency, not permission to change behavior during REF-002.

## Retained Admin action descriptors

Columns: key, method, path template. These are the complete `ADMIN_TERMINAL_API_ENDPOINTS` declaration table as inspected, including disabled/unverified declarations. Do not treat them as all wired controls.

```text
confirm-admin-signout POST /auth/sign-out
edit-admin-profile PATCH /account/profile
save-admin-account-settings PATCH /account/preferences
reset-admin-account-settings POST /account/preferences/reset
resolve-admin-notification POST /notifications/:notificationId/resolve
enable-email-alerts PUT /notifications/preferences/email-alerts
mute-low-priority-alerts PUT /notifications/preferences/low-priority-muted
mark-notifications-reviewed POST /notifications/reviewed
review-admin-sessions GET /account/sessions
reset-admin-password POST /account/password-reset
begin-admin-2fa-enrollment POST /account/security/2fa/enrollment
confirm-admin-2fa-enrollment POST /account/security/2fa/enrollment/verify
disable-admin-2fa DELETE /account/security/2fa
regenerate-admin-2fa-recovery-codes POST /account/security/2fa/recovery-codes
open-help-start-game GET /help/start-game
open-help-players GET /help/players
open-help-attendance GET /help/attendance
open-help-market GET /help/market
open-help-store GET /help/store
open-help-troubleshooting GET /help/troubleshooting
copy-admin-diagnostics GET /diagnostics/admin-console
open-admin-docs GET /docs/admin-console
report-admin-issue POST /support/issues
archive-game POST /games/:gameId/archive
switch-admin-game POST /games/:gameId/switch
submit-attendance-scan POST /games/:gameId/attendance/scans
attendance-adjust-reward POST /games/:gameId/attendance/reward-adjustments
export-attendance POST /games/:gameId/attendance/exports
manual-attendance-correction POST /games/:gameId/attendance/corrections
lock-attendance POST /games/:gameId/attendance/lock
notify-absent POST /games/:gameId/attendance/absent-notifications
attendance-mark-present POST /games/:gameId/attendance/corrections
attendance-mark-late POST /games/:gameId/attendance/corrections
attendance-mark-absent POST /games/:gameId/attendance/corrections
attendance-mark-excused POST /games/:gameId/attendance/corrections
attendance-add-note POST /games/:gameId/attendance/notes
create-player POST /games/:gameId/players
confirm-player-code-reset POST /games/:gameId/players/:playerId/access-code/reset
confirm-player-balance-adjustment POST /games/:gameId/players/:playerId/ledger-adjustments
confirm-player-flag POST /games/:gameId/players/:playerId/flags
confirm-player-settings-save PATCH /games/:gameId/players/:playerId/settings
confirm-player-delete DELETE /games/:gameId/players/:playerId
confirm-player-message-send POST /games/:gameId/players/:playerId/messages
copy-selected-player-code GET /games/:gameId/players/:playerId/access-code
view-unused-player-codes GET /games/:gameId/player-access-codes/unused
connect-google-classroom POST /integrations/google-classroom/connect
import-roster-csv POST /games/:gameId/players/imports/csv
create-contract POST /games/:gameId/contracts
upload-contract-material POST /games/:gameId/contract-materials/uploads
delete-contract-material-upload DELETE /games/:gameId/contract-materials/uploads/:materialId
create-contract-submission POST /games/:gameId/contracts/:contractId/submissions
review-contract-submission PATCH /games/:gameId/contracts/:contractId/submissions/:submissionId/review
duplicate-contract POST /games/:gameId/contracts/:contractId/duplicate
archive-contract POST /games/:gameId/contracts/:contractId/archive
audit-contract-rewards GET /games/:gameId/contracts/:contractId/reward-audit
contract-submission-confirm-decision POST /games/:gameId/contract-submissions/:submissionId/decision
confirm-contract-submission-message POST /games/:gameId/contract-submissions/:submissionId/messages
save-store-item POST /games/:gameId/store/items
update-store-item PATCH /games/:gameId/store/items/:itemId
toggle-store-item PATCH /games/:gameId/store/items/:itemId/status
restock-store-item POST /games/:gameId/store/items/:itemId/restock
rebalance-store-price POST /games/:gameId/store/items/:itemId/rebalance-price
pause-store POST /games/:gameId/store/pause
open-market-event GET /games/:gameId/market/events/:eventId
create-market-event POST /games/:gameId/market/events
edit-market-event PATCH /games/:gameId/market/events/:eventId
pause-market-event POST /games/:gameId/market/events/:eventId/pause
broadcast-market-news POST /games/:gameId/market/news
audit-market-impact GET /games/:gameId/market/impact-audit
save-settings PUT /games/:gameId/settings/difficulty
edit-settings-group PATCH /games/:gameId/settings/:group
reset-settings-group POST /games/:gameId/settings/:group/reset
audit-settings-changes GET /games/:gameId/settings/audit
open-related-record GET /games/:gameId/logs/:eventId/related-record
flag-log-event POST /games/:gameId/logs/:eventId/flag
export-logs POST /games/:gameId/logs/exports
flag-player-log-event POST /games/:gameId/player-logs/:eventId/flag
export-player-logs POST /games/:gameId/player-logs/exports
audit-student-history GET /games/:gameId/players/:playerId/history-audit
```

## Retained Admin read descriptors

Complete `ADMIN_TERMINAL_API_READ_ENDPOINTS` table; preserve query templates and the distinct Games/AdminGames callers.

```text
SessionBootstrap GET /session/bootstrap
AttendanceHistory GET /games/:gameId/attendance/history?playerId=:playerId&date=:date&period=:period&search=:search
Overview GET /games/:gameId/dashboard
Games GET /games
AdminGames GET /games
Players GET /games/:gameId/players?include=ledger,portfolio,activity,flags
PlayerAccessCodes GET /games/:gameId/player-access-codes
Attendance GET /games/:gameId/attendance/today?include=ledger,exceptions,rewards
Contracts GET /games/:gameId/contracts?include=submissions,rewards,locations,materials,submissionRequirements
ContractSubmissions GET /games/:gameId/contract-submissions?status=open,reviewed&include=attachments,responses,feedback
Store GET /games/:gameId/store/items?include=stock,prices,purchaseStats
MarketplaceAssets GET /games/:gameId/market/assets?include=quotes
MarketplaceAssetProfile GET /games/:gameId/market/assets/:assetId/profile
MarketplaceAssetChart GET /games/:gameId/market/assets/:assetId/chart?range=:range
MarketplaceAssetFinancials GET /games/:gameId/market/assets/:assetId/financials
MarketplaceTrades GET /games/:gameId/market/trades/recent?scope=all-players
MarketplaceEvents GET /games/:gameId/market/events?status=active,recent
Settings GET /games/:gameId/settings
Logs GET /games/:gameId/logs?include=relatedRecords&limit=200
AdminProfile GET /account/profile
AdminSettings GET /account/preferences
AdminNotifications GET /notifications?scope=admin-console
AdminSecurity GET /account/security?include=sessions,events
AdminHelp GET /help/admin-console
```

## Player advertised operations

Complete `REVIEWED_ENDPOINTS` operations; repeated endpoint keys represent separate method/path declarations. These need dispatch verification before being called working endpoints.

```text
bootstrap GET /players/me
capabilities GET /players/me/capabilities
worldRuntime GET /players/me/world-runtime
arrivalClass POST /players/me/arrival-class
travelQuote POST /players/me/travel/quotes
travelExecute POST /players/me/travel
travelComplete POST /players/me/travel/:journeyId/complete
residencyRequest POST /players/me/residency
banking GET /players/me/ledger
bankingFx GET /players/me/banking/fx
bankingFxHistory GET /players/me/banking/fx/history
bankingFxOrders GET /players/me/banking/fx/orders
bankingFxQuote POST /players/me/banking/fx/quotes
bankingFxStandard POST /players/me/banking/fx/orders/standard
bankingFxInstant POST /players/me/banking/fx/orders/instant
bankingFxCancel POST /players/me/banking/fx/orders/:orderKey/cancel
bankTransfer POST /players/me/banking/transfers
savingsTransfer POST /players/me/banking/savings/transfers
business GET /players/me/business
businessIpos GET /players/me/business/ipos
businessIpoPropose POST /players/me/business/ipos/proposals
businessIpoVote POST /players/me/business/ipos/:ipoKey/votes
businessIpoSubscribe POST /players/me/business/ipos/:ipoKey/subscriptions
businessTreasury GET /players/me/business/treasury
businessTreasuryAccountOpen POST /players/me/business/treasury/accounts
businessTreasuryFxQuote POST /players/me/business/treasury/fx/quotes
businessTreasuryFxStandard POST /players/me/business/treasury/fx/orders/standard
businessTreasuryFxInstant POST /players/me/business/treasury/fx/orders/instant
businessTreasuryFxCancel POST /players/me/business/treasury/fx/orders/:orderKey/cancel
businessStoreQuote POST /players/me/business/store/quotes
businessStorePurchase POST /players/me/business/store/purchases
businessWorkforce GET /players/me/business/workforce/candidates
businessCreate POST /players/me/businesses
businessFormationPropose POST /players/me/business/formations
businessFormationRespond POST /players/me/business/formations/:formationKey/respond
businessFormationActivate POST /players/me/business/formations/:formationKey/activate
businessProductCreate POST /players/me/business/products
businessProduction POST /players/me/business/production-runs
businessManufacturingJobs GET /players/me/businesses/:businessKey/manufacturing/jobs
businessManufacturingStart POST /players/me/businesses/:businessKey/manufacturing/jobs
businessManufacturingCancel POST /players/me/businesses/:businessKey/manufacturing/jobs/:jobKey/cancel
businessPrice POST /players/me/business/products/:productKey/pricing
businessCandidateHire POST /players/me/business/workforce/candidates/:candidateKey/hire
businessTerminate POST /players/me/business/employees/:employeeKey/terminate
businessStatus POST /players/me/business/status
loans GET /players/me/banking/loans
loanApply POST /players/me/banking/loans/applications/:offerKey
loanRepay POST /players/me/banking/loans/:loanKey/payments
contractAccept POST /players/me/contracts/:contractKey/accept
contractSubmit POST /players/me/contracts/:contractKey/submit
contracts GET /players/me/contracts
countries GET /players/me/world/countries
country GET /players/me/world/countries/:countryCode
dashboard GET /players/me/game/dashboard
news GET /players/me/world/news
market GET /players/me/stocks/assets
marketAsset GET /players/me/stocks/assets/:ticker
marketOrder POST /players/me/stocks/orders
marketWatchlist GET /players/me/stocks/watchlist
marketWatchlist PUT /players/me/stocks/watchlist/:ticker
marketWatchlist DELETE /players/me/stocks/watchlist/:ticker
portfolio GET /players/me/stocks/portfolio
progression GET /players/me/progression
progressionUnlock POST /players/me/progression/skills/:skillId/unlock
progressionClaim POST /players/me/progression/rewards/:rewardId/claim
store GET /players/me/store/items
storeQuote POST /players/me/store/quotes
storeQuote POST /players/me/store/offer-quotes
storePurchase GET /players/me/store/purchases
storePurchase POST /players/me/store/purchases
storePurchase POST /players/me/store/offer-purchases
storePurchase GET /players/me/store/receipts/:receiptKey
inventory GET /players/me/inventory
inventoryRedemptions GET /players/me/inventory/redemptions
inventoryRedemptions POST /players/me/inventory/:itemId/redemptions
inventoryRedemptions GET /players/me/inventory/redemptions/:requestId
marketplace GET /players/me/marketplace/listings
marketplaceListing POST /players/me/marketplace/listings
marketplaceActivate POST /players/me/marketplace/listings/:listingId/activate
marketplacePurchase POST /players/me/marketplace/listings/:listingId/quotes
marketplacePurchase POST /players/me/marketplace/reservations/:reservationId/settlements
marketplaceCancel POST /players/me/marketplace/listings/:listingId/cancel
marketplaceDispute POST /players/me/marketplace/orders/:orderId/disputes
messages GET /players/me/messages
messageThread GET /players/me/messages/threads/:threadId
messagePolicy GET /players/me/messages/policy
messageSearch GET /players/me/messages/search
messageThreadCreate POST /players/me/messages/threads
messageSend POST /players/me/messages/threads/:threadId/messages
messageRead POST /players/me/messages/read
messageRead POST /players/me/messages/threads/:threadId/read
notifications GET /players/me/notifications
notificationsRead POST /players/me/notifications/read
storyDeliveries GET /players/me/story-deliveries
storyDeliveryState POST /players/me/story-deliveries/:deliveryId/state
logout POST /players/me/session/logout
```

## Source continuation: export, proxy and tracked-root reconciliation

Audited application source: `f92f1075d87468d81069753428e693044b80d82d`, tree `1aa13faf5016c78df27edc2ec0e90e0330364c99`; it differs from the recorded main only in REF-002 documentation/data. Publication preflight head: `b13f7607e76844b9ef7aa6be2958b93eba437a33`. No later implementation or merge identity is predicted in this report.

### Export boundary

The exact direct Edge branches are now distinct from the retained browser rewrites. POST Attendance, Logs and Player Logs export handlers return 200, `status: completed`, a freshly generated job ID and a direct CSV download path. They do not create a persisted export job. GET Attendance export aliases use pages of 200 with at most 50 pages; the inspected Logs CSV path requests 500 records. These source observations do not certify the backing query implementations or a hosted export run.

`GET /games/:gameId/exports/:jobId` resolves `game.read` through the permission fallback. The security guard reads staff state, requires active `game_admin` and current permission/security claims, resolves the grant, skips mutation-only AAL2 enforcement for GET, then consumes the read rate limit before the explicit owned-game check. An unknown/non-owned game returns 404 `game_not_found`. For a UUID game path, the export resource normalizes to `staff.admin.read.unknown`; a non-UUID path segment stays in the `games` resource. The eventual unimplemented response is 501 with `code`, `message` and `path`. Staff authorization/rate-limit persistence must not be misreported as an export-job or economic transaction.

Alias permissions are not silently equalized: direct `logs` export branches use `audit.read`, while direct `player-logs` uses the fallback `game.read` for GET and `game.update` for POST. Retained browser normalization may transform a logical export POST into a different read transport. This discrepancy is mapped, not changed.

### Complete selected proxy-callsite census

The full inspected `gameRoutes.ts` contains six `proxyClassroom` callsites: progress read, access-code reset, legacy submission decision, submissions review, progress review and reward issue. The case-ID groups are recorded in routes.json. The review aliases remain separate. The reward helper call is intercepted locally and uses `issue_contract_rewards_atomic_v1`; it is not an additional Classroom HTTP call. The legacy decision route still performs review and conditional reward sequentially, not atomically as one operation.

### Tracked API denominator and Player outer dispatch

The immutable API tree `e552fa91e6d308d5dc2010fabe68b41aada10cc1` returned `truncated: false` and exactly **16 blob/file rows**. All are stored with source identities in entrypoints.json. A local reconstruction from the 16 path/blob/mode records reproduces that exact Git tree hash. This closes the API filename denominator only: helpers, catch-all files, dedicated requests and aliases are not sixteen verified endpoints. Body-level forwarding-target and method reconciliation remains incomplete.

The canonical Player runtime's **29 outer dispatch families** are recorded in source order in entrypoints.json. `dispatchPlayerBusinessRequest` runs before `readPlayerBusinessBankingRoutePath`. The latter is not a competing first authority. Messaging is `dispatchClassroomMessagingRequest` imported as source. Inventory and Banking FX pass an application context through the reviewed limiter; the legacy Contract and Attendance clock-in paths call their handlers directly, which is not proof that the handlers contain no limiter.

The runtime includes stock holdings, stock order reads, stock trades, login and Attendance clock-in paths beyond the advertised catalog. For stock orders, POST selects trading and non-POST selects the read handler; this does not establish acceptance of every non-POST method. Leaf parser and handler method checks are still required. OPTIONS and the suffix-matched health response precede publishable/environment validation; the health branch has no other method condition. No path-only parser, catalog entry or nearby method text is treated as method-specific acceptance proof.

### Reproduction and execution boundary

The source census used immutable connector tree/file reads. Equivalent checkout commands below are reproducibility instructions, **not commands claimed to have run against a complete application checkout here**:

```bash
SOURCE=f92f1075d87468d81069753428e693044b80d82d
git rev-parse "$SOURCE^{tree}"
git ls-tree -r --full-tree "$SOURCE" -- api
git ls-tree -r --name-only "$SOURCE" -- backend/supabase/functions admin player-terminal frontend auth
# After obtaining the exact original files and repository-pinned Node:
node scripts/admin-bundle-contract-audit.mjs
node scripts/admin-contract-review-source-audit.mjs
git diff --check
```

The first original audit reads the bundle and manifest; the second writes only its local `artifacts/admin-contract-review-source.json` report. Neither was executed against complete original source in this continuation. The available excerpt/fixture is not the original bundle and was not substituted to manufacture a pass. Direct Git checkout failed at DNS resolution, archive transfer was unavailable, and Library materialization failed; connector source reads and branch writes worked. No credentials were requested, no cloud setting changed, and no workflow was edited or dispatched to evade this limitation.

The local copies of all three prior evidence files were independently re-hashed to their Git blob identities before edits. Local documentation validation checks the preserved original cases and table multisets, namespace method/path uniqueness, 76 source-record IDs and SHA syntax, 16 API rows, 29 ordered Player families, JSON/Markdown count and finding agreement, links, and whitespace. It does not claim a whole-repository path census, full source audit, application typecheck or runtime certification. The backlog stays unchanged, so all 50 task objects and dependency links are preserved. Only this task's evidence and task record change; the PR stays within its existing five-file documentation/data scope.

Unknown hosted consumers remain downstream retention/deletion gates. They are not the reason for withholding completion; missing source closure and unexecuted required original audits are real current acceptance gaps. Authenticated production tests, database replay and unrelated application suites are not added as requirements for this R0 task.

## Remaining acceptance work

**MAP-01:** complete remaining retained-wrapper/event-consumer and selected browser root-to-resolver closure; bundle readability and declaration tables are no longer the blocker.

**MAP-02:** finish every current Admin V2 client/controller operation, Player leaf-parser method acceptance/rejection (including unadvertised routes), all BFF forwarding bodies, and full function/worker/import-root reconciliation against the tracked source. The complete api filename denominator and Player outer precedence are now recorded, not substituted for those missing traces.

**MAP-03:** execute required original source audits against complete original inputs, finish evidence review and applicable final-head checks, then normal merge. A full checkout/archive was unavailable; no fixture or historical CI is substituted. Unknown hosted consumers remain downstream retention gates, not extra production-test prerequisites.

Local documentation validation covers the three tables' exact row counts, keys/methods/path syntax, preserved duplicate pairs, source SHA formats, companion links and whitespace. The reported numbers are declaration counts, never dead-code quantities. Full checkout, bundle audit execution, application build, backend/Deno tests, browser crawl and authenticated/SQL/provider probes remain NOT_RUN.

No application code, generated asset, database, migration, workflow, configuration, dependency or runtime was modified. No source was deleted. Stop at REF-002.
