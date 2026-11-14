# Campaign runtime row translation

- Roadmap ID: `ARCH-LARGE-CAMPAIGN-RUNTIME-ROWS-001`.
- Status: `IMPLEMENTED_NOT_MERGED`.
- Owner: `refactor/campaign-runtime-rows-20261115`.
- Baseline: fetched main `6f858ca6804ac8539f993e31ad53ab9d1ee964a1`.
- PR: not published. Implementation identity: the commit containing this scope and its subsequent bounded evidence commits; exact SHA/tree are recorded in the external recovery manifest to avoid a self-referential hash.

## Scope and ownership

Move only adapter-local database result/row contracts and pure row mapping/validation into `backend/src/domains/campaign/infrastructure/campaignRuntimeRows.ts`. Keep the complete three repository factories, `readStatusRequired`, public interfaces and client overloads unchanged in `supabaseCampaignRuntimeRepository.ts`. The helper's references back to public admin DTOs are type-only and introduce no runtime import cycle.

The current open-PR audit supplied by the coordinating owner identifies Storyline #968, Store #969, roster #938/#933, release #735/#731, global ledger #668, CSS #624 and dependencies #620 as separate owners. No active Campaign adapter owner was found. This branch neither imports nor replaces their work. The global roadmap is changed only by adding this bounded Scope Intake entry.

No schema, migration, API, route, RPC definition, dependency, economics, UI, permission, credentials, live-data or production change. Existing query/RPC order, game/campaign scope, validation/error precedence, numeric coercion, timestamp handling, freezing and reference identity remain unchanged.

## Evidence

- All 35 original top-level declarations are retained verbatim after ignoring only newly necessary `export` modifiers on moved declarations. All eight original public exports are unchanged. Complete persistence factories and `readStatusRequired` are byte-identical.
- 26 new public-entrypoint characterization cases pass against untouched main and candidate. They are registered in the existing `test:world-runtime` command without removing any retained tests or permissions.
- Cases cover exact query/RPC traces, scope, result cardinality, DB error sanitization/conflict retryability, invalid-row order, hidden status validation, numeric boundaries/coercion, strict boolean acknowledgements, array/object freezing, payload identity, schedule admission, execution projection, persisted initialize/control rereads and public status shape.
- `npm ci` and `npm --prefix backend ci` pass with the shared npm cache and pinned Node/npm toolchain.
- `npm test`, backend core `typecheck`, `test:world-runtime` (218 + 15 tests), architecture inventory generation/ratchet, secret scan and diff checks pass.
- Full `typecheck:all` was attempted with the frozen lock and shared Deno cache. It stops at the existing esm.sh Supabase SDK connection failure; no lock, source or gate was relaxed. Full backend smoke reaches the retained game-session suite and stops on the same frozen SDK connection refusal; earlier suites pass. Logs are retained in the private recovery evidence.
- Physical runtime source lines: repository 563 to 309; cohesive row/helper module 286. Inventory oversized count 80 to 79; source files 1401 to 1403, all other debt counts/ceilings unchanged. Initial test-title wording matched the compatibility-marker heuristic; changing only that description to “default” preserves the baseline marker count of 210.
- Independent review confirms all 35 declarations and eight public exports, byte-identical factory/reread bodies, retained test registration and 26 independently passing candidate cases; no actionable findings.
- No staging/runtime evidence is claimed. Local source and tests do not confer merge or deployment authority.

## Next exact action

For `ARCH-LARGE-CAMPAIGN-RUNTIME-ROWS-001`, finish independent review and recovery verification, then obtain parent-controlled publication and fresh exact-head hosted qualification before normal serial merge. Production remains held; do not mark this item complete before merge and required qualification.

## Store-merged main integration

Status remains `IMPLEMENTED_NOT_MERGED`. Normal merge `d4f0ca67494d469667eda432b4e9af257a30f486` integrates fetched main `2dc93b7266eb30371da182378ea002bd79c293ac` (including merged Storyline #968 and Store #969). The only conflict was the generated architecture inventory, resolved by its retained generator. All Campaign runtime/test bytes from source `1fec35984bd73219e745dca01f6614e3b48faa46` remain unchanged. All qualified main source, workflows and unrelated roadmap text are preserved. Integrated inventory is 77 oversized source files versus 78 on this main. Fresh root, core TypeScript, registered World, secret and diff gates are required before parent-controlled publication; exact-head hosted qualification and serial merge remain pending. The original frozen recovery package is unchanged; integration recovery is separate. Production remains held.

### Committed-head test registration correction

The first integrated committed-head root run exposed REF-003's exact supporting-source binding for `backend/package.json`. The earlier source-stage root check had observed the pre-commit HEAD and did not catch this. Preserve that guard and all REF-003 evidence unchanged: restore the package bytes exactly to main and register the unchanged 26-case module through one side-effect import in the already registered `campaign/services/campaignStateMachine.test.ts`. Its entire existing test body remains unchanged. Runtime source and the characterization module are unchanged. The exact World test set and flags are preserved; no test is removed or weakened. Run all final gates after committing this bounded registration correction; retain failed-run evidence and the original source recovery without alteration.

## Published draft authority

Draft [PR #973](https://github.com/kohnerbouchard-star/Student-Profile/pull/973) publishes source `e4bce4cfe5552eb5a01fbc05e31bf84804f1ba34`, reproducing reviewed local source `cf47170fc6dd08b10ed56379e2461f5752f87cf6` and tree `20d73072bc754b0277229a87a24a03e6a1423548`. Actual-number authority inherits all ordered 149 required and 104 critical checks, unchanged read-only verifiers and false production/mutation/secret flags from PR #969. The same 49 workflows receive only the exact PR #973 authority path in their pull-request filters; all commands, pins, guards, permissions and push/production triggers remain unchanged. Its exact allowlist binds 57 changed paths plus two unchanged read-only verifiers. Runtime, characterization and existing test registration bytes are unchanged. The package and REF-003 supporting evidence retain exact main bytes. Status remains `IMPLEMENTED_NOT_MERGED`; exact final-head hosted qualification and normal serial merge are pending. Production remains held.
