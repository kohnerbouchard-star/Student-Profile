# Stock player-read row translation: reconstructed local preparation

## Scope and authority

- Roadmap item: `ARCH-LARGE-STOCK-PLAYER-READ-ROWS-001`; status `IMPLEMENTED_NOT_MERGED`.
- Baseline: freshly fetched main `2198e7a907d2d87a9eb79867abf9c2f6615cdd59`, containing merged #964. Branch: `refactor/stock-player-read-rows-rebuilt-20261114`.
- This is a new reconstruction from current main. The former local candidate was unavailable; it was not recovered, and historical test results or commit identities are not used as evidence for this source.
- Live open PR audit found #938, #933, #735, #731, #668, #624 and #620. None owns these Store/Stock runtime or test paths. #668 retains global roadmap and package ownership; #620 owns action-version updates in the existing workflow, requiring coordinated later integration of our additive registration. Other prepared local batches remain separate.
- Extract only six row interfaces, query-error shape, and ten pure session, DTO, numeric, deduplication and error helpers. Retain the complete repository class byte-for-byte, including all queries/writes, filters, awaits, error precedence, clocks, sorting and transaction boundaries. Preserve all original public exports.
- No API, route, RPC, schema, migration, business/economic policy, UI, dependency, credential, permission, external data or production change. No push, PR, hosted execution, merge or deployment in this local preparation.

## Implementation and measurement

Repository physical lines fall from 532 to 347; `stockMarketPlayerReadRows.ts` has 209 lines. Every original declaration is retained exactly after allowing only the necessary export modifier: 29 declarations, including the full repository class. Original public import paths are unchanged and helpers do not import their repository.

The isolated main-relative inventory changes from 1,395 to 1,398 source files and 81 to 80 oversized files. Other counts and all thresholds remain unchanged. These are independent branch counts, not cumulative credit for the prepared queue. Regenerate inventory when integrating branches. New tests and fixtures remain below 500 physical lines.

Add the new characterization suite to the existing Business Financial Market Deno invocation. Preserve every prior test argument and command; its existing Stocks wildcard already covers all changed source/tests. The backend package and frozen REF-003/REF-011 command census remain untouched; no test is removed, no permission is expanded and no gate is weakened.

## Local qualification

- Toolchain: Node 22.23.1, npm 10.9.8, Deno 2.9.3. Reused dependencies have byte-identical root/backend lockfiles to the baseline; no install or lockfile change.
- Public-entrypoint characterization: 44/44 on untouched baseline and candidate. The repository remains the sole original public export. Cases cover exact session expiry and injected clock, schema classification and all query failures, number/nonfinite and negative-zero policy, six-place arithmetic ordering, missing assets, first-seen deduplication, foreign position rejection, exact DTO fields, query scope/order and concurrent cash/holdings admission after the session read.
- Entire Stocks domain: 498/498 on candidate, using frozen Deno lock/config and network denied.
- Full root `npm test`, core backend TypeScript, deterministic architecture inventory/ratchets, secrets and whitespace pass. Changed workflow YAML parses.
- Full Edge typecheck remains incomplete at the unchanged frozen SDK import `https://esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs` returning connection refused. Full backend smoke is separately recorded in the recovery evidence and is not claimed as an aggregate pass.
- Independent source and frozen-recovery review reports accompany the recovery package. No browser, database replay, hosted staging or production runtime qualification is claimed.

## Proposed intake for global roadmap owner

`ARCH-LARGE-STOCK-PLAYER-READ-ROWS-001` — Stock player-read row translation: `IMPLEMENTED_NOT_MERGED`; newly reconstructed local owner on main `2198e7a907d2d87a9eb79867abf9c2f6615cdd59`. Original adapter 532 to 347 lines, row helper 209, oversized count 81 to 80, all other debt/thresholds unchanged. All 29 original declarations and original public exports preserved. Baseline/candidate 44, complete Stocks domain 498, full root and core TypeScript pass; full Edge/backend qualification remains limited by SDK retrieval. Existing shared owners remain separate. Next exact step: independently verify immutable local recovery; coordinator must reconcile current main/ownership and permit preview-safe publication, then add actual-number authority and qualify the final exact hosted head before any normal serial merge. Production remains held.

## Recovery and remaining gates

Revert the adapter, extracted helper, characterization tests/fixtures, additive workflow registration and inventory together. There is no database rollback.

Frozen recovery must include exact source commit/tree and baseline, full tracked-tree archive, binary patch, thin exact-commit bundle with baseline prerequisite, changed-path hashes, ownership, preservation and qualification logs. Verify all checksums, independently reconstruct the same tree and rerun characterization. The parent owns publication and integration; current Supabase, migration parity and production holds are not relaxed by local passing tests.

## Current-main integration, 2026-11-14

The reviewed recovery commit `8d0fba89bb55519e5501f00568ff467c8b8fa1ad` and its exact Space identity were reverified, including all 56 current package checksum entries and the thin bundle prerequisite. Continue the existing branch; this is not a replacement reconstruction. Main `6f858ca6804ac8539f993e31ad53ab9d1ee964a1` now contains the qualified session correction #966, release correction #967, frontend readiness #970 and Marketplace extraction #965. Their historical unmerged wording elsewhere is not a claim that they remain unmerged.

Integration retains every incoming main file and all four reviewed Stock source/test files byte-for-byte. The only conflict was the generated architecture inventory, regenerated from the combined tree. The Business Financial Market workflow keeps both prior PR registrations and the one additive Stock characterization argument. No source behavior, public export, dependency, permission, release guard, route, RPC or migration changes. Current ownership remains Storyline #968, Store #969, dependency actions #620, roster #933/#938, CSS #624 and global ledger #668; no open PR owns these Stock implementation paths. Shared workflow additions must be retained when those branches advance.

Fresh integrated full root tests, core TypeScript, architecture/ratchet, secret scan and all 498 Stocks domain cases pass with frozen configuration/lock and network denied for domain execution. Independent review confirms all 29 original declarations and the complete class, runs 44 baseline/candidate cases successfully, and rejects exact-expiry and game-scope mutations. Combined inventory is 1,404 source files and 79 oversized files versus current main's 1,401 and 80; all other counts and thresholds are unchanged. Full Edge typecheck remains incomplete at the unchanged frozen Supabase SDK connection refusal; backend smoke separately reaches 1,160 Deno and 18 Node passes before the same external import blocks game-session checks. Those aggregate gates are not claimed as passed. Initial local invocation mistakes (a nonexistent typecheck script and incorrect migration-read paths) are retained in evidence; corrected documented core and exact two-file Stocks permissions pass without source changes.

Actual-number authority and fresh exact-head hosted qualification remain required after the preceding Storyline #968 and Store #969 lanes clear. Preparation does not certify database, staging or production state. The parent owns global roadmap reconciliation and serial publication/merge decisions. No deployment is authorized.

## Serial Storyline and Store reconciliation

Actual main `2dc93b7266eb30371da182378ea002bd79c293ac` now also contains qualified Storyline #968 and Store #969. Integrate them normally before Stock publication; their complete source, tests, authorities and workflow registrations remain unchanged. Only the generated inventory conflicted and was regenerated. Four original Stock source/test files remain exact, and only the same seven owned paths differ from this base. The current isolated Stock reduction is one oversized file; earlier aggregate counts are historical. Fresh full root/core, 498 Stocks cases, secrets and whitespace pass on this combined tree. Independent review confirms incoming preservation and 44 focused cases. Inventory is 1,408 to 1,411 source files and 78 to 77 oversized files, with other debt and thresholds unchanged. Actual-number authority and exact-head hosted qualification remain required before a normal merge. No production deployment.
