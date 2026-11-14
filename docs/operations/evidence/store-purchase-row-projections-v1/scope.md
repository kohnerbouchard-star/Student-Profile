# Store purchase row projections: reconstructed local preparation

## Scope and authority

- Roadmap item: `ARCH-LARGE-STORE-PURCHASE-ROWS-001`; status `IMPLEMENTED_NOT_MERGED`.
- Baseline: freshly fetched main `2198e7a907d2d87a9eb79867abf9c2f6615cdd59`, containing merged #964. Branch: `refactor/store-purchase-rows-rebuilt-20261114`.
- This is a new reconstruction from current main. The former local candidate was unavailable; it was not recovered, and historical test results or commit identities are not used as evidence for this source.
- Live open PR audit found #938, #933, #735, #731, #668, #624 and #620. None owns these Store/Stock runtime or test paths. #668 retains global roadmap and package ownership; #620 owns action-version updates in the existing workflow, requiring coordinated later integration of our additive registration. Other prepared local batches remain separate.
- Extract only five pure row projections and their five row interfaces. Retain the complete repository class byte-for-byte, including all queries/writes, filters, awaits, error precedence, clocks, sorting and transaction boundaries. Preserve all original public exports.
- No API, route, RPC, schema, migration, business/economic policy, UI, dependency, credential, permission, external data or production change. No push, PR, hosted execution, merge or deployment in this local preparation.

## Implementation and measurement

Repository physical lines fall from 554 to 369; `storePurchaseRowMapping.ts` has 199 lines. Every original declaration is retained exactly after allowing only the necessary export modifier: 28 declarations, including the full repository class. Original public import paths are unchanged and helpers do not import their repository.

The isolated main-relative inventory changes from 1,395 to 1,397 source files and 81 to 80 oversized files. Other counts and all thresholds remain unchanged. These are independent branch counts, not cumulative credit for the prepared queue. Regenerate inventory when integrating branches. New tests and fixtures remain below 500 physical lines.

Add two source/test trigger paths and a separate frozen Deno test step to existing Business Economy V2. Preserve every prior path, action, job and test command. The backend package and frozen REF-003/REF-011 command census remain untouched; no test is removed, no permission is expanded and no gate is weakened.

## Local qualification

- Toolchain: Node 22.23.1, npm 10.9.8, Deno 2.9.3. Reused dependencies have byte-identical root/backend lockfiles to the baseline; no install or lockfile change.
- Public-entrypoint characterization: 28/28 on untouched baseline and candidate. All four pre-existing public mapper exports remain direct re-exports at the original path. Cases cover exact quote/receipt/history/inventory fields, numeric and nullish defaults, metadata reference identity, country lookup/pricing/write order, selected columns, game/player scope, write payload and early errors.
- Entire Store domain: 82/82 on candidate, using frozen Deno lock/config and network denied.
- Full root `npm test`, core backend TypeScript, deterministic architecture inventory/ratchets, secrets and whitespace pass. Changed workflow YAML parses.
- Full Edge typecheck remains incomplete at the unchanged frozen SDK import `https://esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs` returning connection refused. Full backend smoke is separately recorded in the recovery evidence and is not claimed as an aggregate pass.
- Independent source and frozen-recovery review reports accompany the recovery package. No browser, database replay, hosted staging or production runtime qualification is claimed.

## Proposed intake for global roadmap owner

`ARCH-LARGE-STORE-PURCHASE-ROWS-001` — Store purchase row projections: `IMPLEMENTED_NOT_MERGED`; newly reconstructed local owner on main `2198e7a907d2d87a9eb79867abf9c2f6615cdd59`. Original adapter 554 to 369 lines, row helper 199, oversized count 81 to 80, all other debt/thresholds unchanged. All 28 original declarations and original public exports preserved. Baseline/candidate 28, complete Store domain 82, full root and core TypeScript pass; full Edge/backend qualification remains limited by SDK retrieval. Existing shared owners remain separate. Next exact step: independently verify immutable local recovery; coordinator must reconcile current main/ownership and permit preview-safe publication, then add actual-number authority and qualify the final exact hosted head before any normal serial merge. Production remains held.

## Recovery and remaining gates

Revert the adapter, extracted helper, characterization tests/fixtures, additive workflow registration and inventory together. There is no database rollback.

Frozen recovery must include exact source commit/tree and baseline, full tracked-tree archive, binary patch, thin exact-commit bundle with baseline prerequisite, changed-path hashes, ownership, preservation and qualification logs. Verify all checksums, independently reconstruct the same tree and rerun characterization. The parent owns publication and integration; current Supabase, migration parity and production holds are not relaxed by local passing tests.
