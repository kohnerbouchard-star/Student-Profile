# Admin UI V2 Crafting — Evidence

## Scope

- Repository: `kohnerbouchard-star/Student-Profile`
- Branch: `refactor/admin-ui-v2-crafting-v1`
- Exact base: `b7827211f0ff15b8a963219a63738180b33a1b3d`
- Base includes native Admin V2 Overview, Store, and Market.
- No Backend/Supabase file is modified.
- No Inventory/Business semantic file is modified.
- Draft PR only.

## Focused audit evidence

Audited current-main Crafting/Inventory authority:

- `admin/crafting-oversight-client.js`
- `admin/crafting-oversight-loader.js`
- `admin/crafting-oversight-surface.js`
- `backend/supabase/functions/admin-api/craftingOperations.ts`
- `backend/supabase/functions/admin-api/craftingOperations.test.ts`
- `backend/supabase/functions/admin-api/adminSecurityGuard.ts`
- `backend/supabase/migrations/20260721135000_add_admin_crafting_read_v1.sql`
- `backend/supabase/migrations/20260721135500_add_admin_crafting_recovery_v1.sql`
- `scripts/admin-crafting-oversight-contract.mjs`

No unsupported recipe CRUD was found. The authoritative Admin surface supports oversight read, job recovery, and physical-economy supply override only.

## Contract boundary findings

The current Admin oversight DTO does not enumerate standalone recipe definitions, required ingredient lines, output item lines, per-player holdings, or Business inventory rows. V2 therefore:

- derives **Observed recipes** only from Crafting job records;
- does not invent recipe create/edit/delete actions;
- does not show fabricated ingredient sufficiency;
- distinguishes physical-economy supply availability from player Inventory ownership;
- leaves Crafting reservation/consumption/output grants to the existing server implementation;
- displays Inventory/Crafting invariant counters read-only.

A backend permission mismatch exists on this base: V2 requires `inventory.redeem`, but the current Admin security resource mapper has no explicit `crafting` key and falls back to `game.read`/`game.update`. This UI branch records but does not modify that backend policy.

## Test matrix

| Case | Coverage |
|---|---|
| No recipes/jobs | Empty oversight model and observed-recipe empty state |
| Many recipes/jobs | Normalizer supports up to the authoritative 250-job read limit |
| Missing/sufficient ingredients | Not fabricated; physical supply quantities/scarcity shown separately from Inventory ownership |
| Crafted outputs | Completed/claimed job states shown; output item lines omitted because Admin DTO does not expose them |
| Long/Korean names | Preserved and wrapped; normalization tests include Korean/long recipe content |
| Permission denial | Route permission is `inventory.redeem`; controller fails closed before read/mutation |
| Safe failures | 403/5xx normalized through shared safe error envelope; raw diagnostics suppressed |
| Private IDs | UUID-like player/private identifiers stripped; job public key never rendered |
| Mobile/desktop | Route CSS has <=1100/900/600 responsive layouts; browser smoke checks desktop/mobile overflow |
| Overview/Store/Market regression | Existing Admin V2 unit/API/browser suites remain in place |
| Player Crafting/Inventory regression | No Player files changed; existing `test:crafting-runtime` and `test:player-runtime-cutover` remain required |

## Verification commands

The implementation is intended to be verified with:

```sh
node --test scripts/admin-v2-crafting-api.test.mjs
node scripts/admin-v2-crafting-browser-smoke.mjs
npm run test:admin-v2
npm run test:crafting-runtime
npm run test:player-runtime-cutover
git diff --check
```

Local repository checkout was unavailable in this session because the sandbox could not resolve `github.com`; source access and writes use the authenticated GitHub connector. GitHub PR checks are therefore the authoritative execution evidence for repository-wide suites.

## Status

Implementation evidence will remain `IMPLEMENTED_NOT_MERGED` while the pull request is a draft. It must not be promoted to verified/merged/production status from this branch.
