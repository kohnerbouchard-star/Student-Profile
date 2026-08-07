# Admin UI V2 Crafting — Evidence

## Scope

- Repository: `kohnerbouchard-star/Student-Profile`
- Branch: `refactor/admin-ui-v2-crafting-v1`
- Original implementation base: `b7827211f0ff15b8a963219a63738180b33a1b3d`
- Reconciled `main`: `4c17b942fcf4b2a6f60b629549f192d066053ba4`
- Reconciliation commit: `9c44517a2cdb9bb27f8d97113546797b74dbadd9`
- Focused V2 CI addition: `41eea3fb3aa1f4cf66ccc88dfb1861800bfdd791`
- Draft PR: #510
- No Backend/Supabase file is modified.
- No Inventory/Business semantic file is modified.
- No Player application file is modified by the Crafting tranche.
- Draft PR only; no production promotion.

## Dependency gate — PR #503

PR #503 (`feat/economic-asset-ownership-core-v2`) is still open and draft at the latest review. Its current scope includes canonical asset ownership and a canonical Crafting read model, while its own remaining work still includes Crafting mutation cutover, Business material-flow cutover, compatibility/replay work, and Store → Inventory → Crafting → Business acceptance.

**Required merge condition:** PR #510 must be reconciled against the finalized #503 contracts before merge. This branch must not consume an unmerged #503 API/DTO shape directly.

The final reconciliation must re-check only:

- finalized Admin Crafting read fields;
- finalized Crafting mutation/recovery semantics;
- canonical Inventory ownership requirements and identifiers;
- Store → Inventory → Crafting → Business relationship preservation;
- privacy/public-identifier boundaries.

## Focused contract evidence

The authoritative Admin surface on the reconciled `main` supports:

- `GET /games/:gameId/crafting/oversight?status=&limit=`;
- `POST /games/:gameId/crafting/jobs/:jobKey/recover`;
- `POST /games/:gameId/crafting/supply/:itemKey`.

No supported recipe CRUD is exposed by this Admin contract.

The current Admin oversight DTO exposes Crafting job recipe identity/name, job lifecycle/timing, physical-economy supply state, effects, pack metadata, and Inventory/Crafting invariant counters. It does not expose standalone recipe input/output lines or per-player canonical holdings on this reconciled `main`.

V2 therefore:

- derives **Observed recipes** only from authoritative Crafting job records;
- does not invent recipe create/edit/delete actions;
- does not fabricate required ingredient lines or sufficiency;
- does not fabricate output item lines;
- distinguishes physical-economy supply availability from player Inventory ownership;
- leaves Crafting reservation/consumption/output grants to existing server authority;
- displays Inventory/Crafting invariant counters read-only;
- uses `inventory.redeem` as the V2 route permission and fails closed client-side when absent.

A backend permission-resource mismatch remains outside this UI tranche: the backend Crafting resource is not explicitly mapped to `inventory.redeem` on this reconciled `main`. This branch records the mismatch but does not change Backend/Supabase policy.

## Test matrix

| Case | Coverage |
|---|---|
| No recipes/jobs | Empty oversight model and observed-recipe empty state |
| Many recipes/jobs | Normalizer supports the authoritative 250-job read limit |
| Missing/sufficient ingredients | Not fabricated; physical supply quantity/scarcity remains distinct from Inventory ownership |
| Crafted outputs | Completed/claimed job states shown; output item lines omitted when absent from Admin DTO |
| Long/Korean names | Preserved/wrapped; API/controller and browser fixtures include Korean/long content |
| Permission denial | Route/controller require `inventory.redeem`; fail closed before read/mutation |
| Safe failures | 403/5xx normalized through shared safe Admin error envelope; raw diagnostics suppressed |
| Private IDs | UUID-like private identifiers stripped; public Crafting job key is never rendered |
| Mobile/desktop | Dedicated browser smoke checks both layouts and horizontal overflow |
| Overview/Store/Market regression | `npm run test:admin-v2` retains the existing V2 unit/Store/Market suites and adds Crafting |
| Player Crafting/Inventory regression | Existing `Crafting Item Runtime` workflow runs Crafting runtime, backend player-crafting tests, player-terminal verify, and desktop/mobile Player Crafting browser coverage |

## Focused verification commands

```sh
npm run test:admin-v2
npm run test:admin-v2:crafting-browser
npm run test:crafting-runtime
npm run test:player-runtime-cutover
git diff --check
```

The local execution sandbox cannot resolve `github.com`, so authenticated GitHub Actions is used for execution rather than claiming an unavailable local run.

### GitHub execution launched

On code head `41eea3fb3aa1f4cf66ccc88dfb1861800bfdd791`:

- **Admin V2 Crafting** run `31175180126` — dedicated `npm run test:admin-v2` plus Crafting desktop/mobile browser smoke; state at evidence capture: queued.
- **Crafting Item Runtime** run `31175180043` — `test:crafting-runtime`, backend Player Crafting integration/typechecks, player-terminal verification, and Player Crafting desktop/mobile browser matrix; state at evidence capture: queued.
- Existing Admin shell/browser, security, typecheck, repository-quality, and release-contract checks were also triggered by the PR, but they are supplemental rather than substitutes for the two focused gates above.

The final chat report must state the latest observed outcomes; queued checks are not represented as passing.

## Status

`IMPLEMENTED_NOT_MERGED`

Merge is blocked until both conditions are satisfied:

1. final contract reconciliation with PR #503 after its Crafting/asset contracts stabilize; and
2. focused Crafting V2 + Player Crafting/Inventory verification is green or any failures are resolved/explicitly identified.
