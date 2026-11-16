# Persistence and transaction ownership, immutable main 39685d2c

All runtime source references in this document refer to
`39685d2c29394caa425d928649804a433806e521`, not to deployed bytes. The generated
inventory is a file-level lexical census. Location outside `infrastructure/` does
not itself prove an ownership violation, and an `atomic` function name alone does
not prove atomicity or a successfully deployed migration.

## Newly visible candidates: exactly 27 files

Paths below are relative to the named directory. All 27 contain actual source
member calls with TypeScript type arguments at this immutable head; their call
counts are intentionally not equated with the file denominator.

### Domain API: six

- `backend/src/domains/auth/api/staffSignupResendHttpHandler.ts:71`:
  `claim_staff_signup_resend_v1`. Auth owns continuation/throttle state. Keep
  claim-before-Auth-email sequencing and retry/replay handling unchanged.
- `backend/src/domains/business/api/playerBusinessIpoHttpDispatch.ts:50`:
  dynamic read/propose/vote/subscribe RPC from a finite dispatch at lines 32–48.
  Business owns offering lifecycle; subscription coordinates Banking/ownership.
  Preserve server-derived `publicScope`, decimal strings, idempotency and the
  single database command, not a new client-side debit/credit sequence.
- `backend/src/domains/business/api/playerBusinessManufacturing.ts:113`:
  finite list/start/cancel commands. Business owns job/capacity/stockroom effects;
  the API helper currently mixes validation, response translation and persistence.
- `backend/src/domains/messaging/api/playerMessageThreadLifecycleHttpHandler.ts:72`:
  scoped policy read only. Other lifecycle mutations already use its repository.
- `backend/src/domains/messaging/api/playerMessagingHttpHandler.ts:112,125,155,178`:
  thread/inbox reads, `send_player_message_atomic_v1`, and mark-read. Messaging
  owns threads/messages/unread lifecycle; send and its idempotency stay one RPC.
- `backend/src/domains/progression/api/playerProgressionHttpHandler.ts:97,112,121`:
  read, atomic skill unlock and reward claim. Progression owns progression state;
  reward side effects remain within the existing command transaction.

### Domain services: three

- `backend/src/domains/contracts/services/contractRewardLedgerWriter.ts:19,47`:
  this class is already an explicit RPC writer adapter despite its directory.
  `apply_contract_rewards_atomic_v1` owns complete reward-plan application;
  `record_player_ledger_entry` is an Economy-owned primitive. Do not split the
  complete plan into separate TypeScript balance, Inventory or progress writes.
- `backend/src/domains/economy/services/idempotentStaffLedgerAdjustment.ts:66`:
  explicit `record_idempotent_staff_ledger_adjustment_v1` adapter plus input/error
  translation. Economy owns ledger/balance authority. Its SQL transaction inserts
  and row-locks the scoped idempotency key, checks immutable request equality,
  calls the canonical ledger function and completes replay evidence together
  (`20260719193000_add_idempotent_staff_ledger_adjustment_v1.sql:5–185`).
- `backend/src/domains/progression/services/progressionIntegrationEventService.ts:37`:
  validates trusted events before one `record_progression_integration_event_v1`
  call. Progression owns deduplication, source-event conflict and award result.
  Validation and RPC error precedence must survive any adapter extraction.

### Shared security: three

- `backend/src/security/staffMessagingRateLimitDispatch.ts:180`.
- `backend/src/security/staffRequestRateLimit.ts:66`.
- `backend/src/security/supabaseRateLimitRepository.ts:31`.

These call the shared rate-limit authority, directly or via the configured
`rpcName`; they are legitimate security persistence, not economic write bypasses.
The named Supabase repository is outside the path allowlist, illustrating why
location-only counts cannot be treated as violations. Never move or relax these
calls merely to reduce the debt metric or change guard ordering.

### Admin boundary modules: eight

Paths under `backend/supabase/functions/admin-api/`:

- `gameLifecycleOperations.ts:151,207`: lifecycle read and transition command;
  Game Sessions owns transition state and its atomic transaction.
- `inventoryRedemptionOperationsCore.ts:123,212`: redemption queue read and
  `review_inventory_redemption_atomic_v1`; Inventory owns custody/redemption.
- `messagingOperations.ts:147,168,210`: policy read/set and v2 moderation.
- `messagingOperationsCore.ts:138,231,282,324`: thread read/create, retained v1
  moderation and expired-thread deletion.
- `messagingParticipantOperations.ts:84`: participant transition command.
- `progressionOperations.ts:133,162,222`: reads and atomic correction command.
- `progressionRateLimit.ts:107`: shared security rate-limit command.
- `worldRuntimeValidation.ts:20`: game/public-ID-scoped `campaign_instances`
  read only. This is not a Campaign write owner.

Messaging, Progression, Inventory and Game Sessions own the respective command
semantics, not the Admin router. The Admin boundary derives Staff/game identity
and permission scope before calling them. Preserve existing RPC transactions and
wrong-game/role/idempotency/error behavior. V1/V2 retained moderation surfaces are
not declared redundant or removable by this census.

### Composition-root replay protection: seven

Paths under `backend/supabase/functions/`:

- `business-operations-worker/index.ts:46`.
- `stock-market-player-read/index.ts:47`.
- `stock-market-read/index.ts:47`.
- `stock-market-runner/index.ts:52`.
- `stock-market-seed-copy/index.ts:47`.
- `stock-market-trading/index.ts:47`.
- `web-session-api/index.ts:78`.

Each typed call here is `claim_internal_runner_nonce_v2`, supplied to the
internal-runner authentication/replay boundary. Security owns nonce consumption;
this does not make the root an owner of Business/Stock economic settlement. Even
a read entrypoint can correctly perform a nonce-security write. Preserve
signature/timestamp checking, single-use consumption and fail-closed order.

## Important previously counted seams, not newly discovered violations

- Attendance `playerAttendanceClockInHttpHandler.ts:153,192`: scoped settings
  read plus `record_player_attendance_clock_in`. The migration wrapper in
  `20260805023228_admin_local_application_mutations_v1.sql:571–619` calls the
  shared private attendance transaction; it is not safe to split attendance and
  reward writes across HTTP calls. `attendanceRewardPolicy.ts` also reads
  difficulty, Player-country and country-economic projections. Its cross-domain
  reads need a named read port; REF-019's unresolved login/throttle hold still
  blocks the Player Attendance extraction.
- Admin `contractRewards.ts`: atomic Contract reward command followed by response
  projections. Follow-up reads are not part of the transaction and cannot be
  used to invent a second mutation on a retry.
- Admin `idempotentLedgerOperations.ts` and Staff
  `economy/api/staffLedgerAdjustmentHttpHandler.ts`: input/scope boundaries that
  converge on Economy's idempotent ledger service, not independent balance owners.
- Existing `gameReadSupport.ts`, `gameResourceReadModels.ts`, `playerReadModel.ts`
  and related Admin projections are cross-domain read models. Their explicit
  read ownership still needs review; reads are not balance/Inventory write bypasses.
- `classroom-api/classroomClients.ts` is a client composition module, not domain
  policy. Test-string candidates remain in the inventory intentionally. Retained
  `playerLedgerHistoryHttpHandler.ts` and `playerStorePurchaseHttpHandler.ts` are
  not declared dead or deletion-approved. The earlier Story roleplay port is
  already extracted in current main and remains unchanged.

## Database authority evidence and limits

The latest direct `CREATE [OR REPLACE] FUNCTION` definitions found in ordered
repository migrations are listed here to anchor inspection, not to assert live
parity. Later wrappers, dynamic SQL, grants or delegated callees can also change
semantics; a complete effective-schema audit and live replay are not performed.

| Boundary | Latest direct definition in repository |
|---|---|
| Staff ledger adjustment | `20260719193000_add_idempotent_staff_ledger_adjustment_v1.sql:5` |
| Canonical ledger write | `20260826091000_banking_transaction_holds_v1.sql:1822` |
| Contract complete reward plan | `20260816090000_add_contract_story_flag_rewards_v1.sql:3` |
| Player attendance wrapper | `20260805023228_admin_local_application_mutations_v1.sql:571` |
| Trusted Progression event | `20260721162000_harden_progression_event_idempotency_v1.sql:19` |
| Player message send | `20260721153000_compat_messaging_player_status_v1.sql:941` |
| Skill unlock / reward claim | `20260721160000_add_progression_reputation_runtime_v1.sql:779,872` |
| Manufacturing start | `20260823110500_business_manufacturing_player_api_v2.sql:104` |
| IPO subscription | `20260918080404_business_primary_ipo_commands_v1.sql:316` |
| Internal nonce claim | `20260921044500_reconcile_internal_runner_nonce_service_role_authority_v1.sql:3` |

## First bounded change and remaining unknowns

The safe first change is the tooling correction in this tranche: expose typed
candidates, preserve the old set, and stop using an incomplete count for planning.
No runtime economic or security change is required for it.

The next runtime candidate should be a separately scoped Messaging policy-read
port (`playerMessageThreadLifecycleHttpHandler.ts:72`), reusing the existing
Messaging repository seam and preserving validation/read/mutation order. That is
one read, not a rewrite of all Messaging commands. Before implementation, verify
all current roots/consumers and active ownership, characterize denied/null/error
behavior, and preserve game/player scalars from the authenticated scope. Its
merit is explicit ownership, not getting below a number. Do not reopen held Auth,
Attendance, Business lending or settlement code for a cosmetic relocation.

Unknowns remain: exact deployed route traffic, deployed schema/RPC definitions,
external/dynamic consumers, complete SQL cross-domain write graph, and current
live migration parity. This audit neither closes ARCH-401/ARCH-300 nor proves
zero unauthorized economic writes. It introduces no new owner permissions.
