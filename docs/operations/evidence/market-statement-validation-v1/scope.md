# Market statement validation ownership

- Item: `ARCH-LARGE-MARKET-STATEMENT-VALIDATION-001`.
- Status: `IMPLEMENTED_NOT_MERGED`; local preparation only, no PR, push, merge or deployment.
- Owner: `refactor/market-financial-statements-20261115`.
- Base: freshly fetched main `874355480e31eafc5b4b3b2fa4f2fbccf14db9e7`.
- The coordinator audited all nine open PR pathsets (#973, #972, #938, #933,
  #735, #731, #668, #624 and #620): none owns Market domain source. Only the
  generated inventory is shared. Global-ledger ownership remains #668, so the
  proposed intake entry is returned to that coordinator, not inserted here.

## Bounded design and preservation

`financialStatements.ts` retains the generation types, frozen policy instance,
complete generator, deterministic shares and factor rounding. Its public path
and export set remain unchanged. `financialStatementValidation.ts` owns complete
statement reconciliation, generation input validation, policy validation and
private decimal equality. It imports generation types only, so the dependency
back to the generation module creates no runtime cycle. The public validator is
re-exported directly, never wrapped or duplicated. The generator imports the same
validator binding used by existing callers.

All 13 original declarations retain their complete exact source bodies. Only the
moved input validator gains an internal-module export. No formula, decimal
rounding, PRNG call order, optional prior behavior, error precedence, returned
shape or policy bound changes. No public API, route, RPC, SQL, migration, economic
write, dependency, package script, workflow, credential, UI or production change.
The original unused decimal import is retained rather than mixing cleanup into
this extraction. Fixed-income ownership is separate and untouched.

Physical source lines: original 589 to 386; new validation owner 221. Inventory
counts: 1,411 to 1,412 sources and 77 to 76 oversized files. Every other debt count
and ceiling is unchanged. Inventory scanner lines include the final empty split
line, so the original entry reports 590 rather than 589 physical lines.

## Characterization and checks

- 63 public-entrypoint characterization tests pass on untouched baseline source
  and candidate (three retained and 60 new). Cover complete first/prior output
  SHA-256, frozen default policy, all seven finite/ordered bounds, constrained
  ratio endpoints, base amounts, required nonnegative fields, malformed decimals,
  six-place rounding, error/check ordering, negative generated amounts, losses,
  prior accounting and shape-only calendar behavior.
- Full Market domain: 207 passed, zero failures. Existing workflow recursively
  discovers these tests; no package scripts or REF-003 evidence are changed.
- Retained Stocks engine: 90 passed, zero failures.
- Deterministic reference simulation accepted with the unchanged configuration
  and `--no-lock --node-modules-dir=manual` to prevent irrelevant package install.
- Core backend TypeScript, full root `npm test`, architecture inventory/ratchet,
  secret scan and whitespace checks pass. Root's existing PostgreSQL fixture
  skip remains explicit, not a database qualification.
- Test formatting passes. Original and extracted runtime declarations retain
  inherited Deno formatting debt to preserve exact source; full runtime formatting
  is not claimed. Baseline and candidate formatting diagnostics are retained.
- Full Edge typecheck fails at the frozen Supabase SDK retrieval with connection
  refused. No pin or security setting is changed and no aggregate Edge pass is
  claimed. Full backend smoke is recorded separately in recovery evidence.

The first root attempt stopped at unstaged generated-inventory drift; regenerating
and staging the truthful inventory allowed the full retained root suite to pass.
An initial reference invocation waited on automatic npm resolution and was
interrupted; the manual-node-modules configured run passed. These preparation
failures are retained, not relabeled as successful runs.

## Recovery and qualification boundary

Private recovery contains complete Git archive, binary patch and bundle, exact
commit/tree identities, source hashes, preservation review and all test logs.
The implementation commit is the commit adding this record; identities are
recorded in the recovery manifest rather than a self-referential commit field.
The coordinator must independently restore and review the final committed tree,
then obtain authorized publication and fresh exact-head hosted qualification.
No staging/runtime evidence, broader capability completion, release or production
permission is asserted. Next exact item is the same bounded item's independent
recovery/source review and qualification, before normal serial integration.

## Actual Campaign-main integration (2026-11-15)

The initial local-only/publication-boundary text above records the source stage.
The owner subsequently authorized publication and serial integration; this worker
performs local preparation only and the coordinator controls all remote actions.
Normal merge integrates freshly fetched actual Campaign main
`b7e37658f1f5cbbc64a9a19fd011f0996fbcadd9`, including merged Notifications #972 and
Campaign #973. Their earlier unmerged roadmap statements are historical source
records, not current postmerge certification. The global ledger remains byte-for-
byte actual main; proposed bounded intake is returned separately to its owner.

Only generated inventory conflicted and was regenerated from the complete union.
All three reviewed Market source/test files remain byte-identical to
`fd2cdad067b8c87e7820a88c601e8cb1f6036957`. Every unrelated main file, package,
REF-003 record, predecessor authority and workflow guard remains unchanged.
Main-relative inventory is 1,418 to 1,419 sources and 75 to 74 oversized files;
all other counts and ceilings remain unchanged. Fresh committed-head local gates
and independent recovery review are required before coordinator publication.
No unchanged blocked SDK request is retried: earlier Edge/smoke limitations are
retained explicitly, not represented as a new-head full pass. Final remote merge
also waits for Campaign #973 postmerge clearance and exact published-head gates.

Integration merge `587714ff873e3ab712373c7ff28074a7ea17b69b` passes fresh Market
207/207, Stocks 90/90, core TypeScript, complete root tests, architecture and
secret checks. The root's retained PostgreSQL fixture skip remains. The
coordinator expressly authorized exactly one bounded scope-intake insertion;
all prior roadmap bytes are preserved, including both complete #972/#973 records.
The final evidence/intake commit preserves every runtime and test blob from the
reviewed implementation. Its exact commit/tree and final verification logs live
in the new integration recovery manifest. Independent review, actual-number
authority, exact published-head qualification and normal serial integration are
still required; earlier qualification does not certify a later published head.
