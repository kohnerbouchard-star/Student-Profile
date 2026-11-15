# Story effect execution responsibility extraction

- Roadmap item: `ARCH-LARGE-STORY-EFFECT-ENGINE-001`.
- Status: `IMPLEMENTED_NOT_MERGED`, local preparation only. Parent owns global roadmap reconciliation, publication, hosted qualification and serial merge.
- Base: `d2d951e542b12e9e47f6db1783bdf4ef9993e930`, current main after PR #975. Seven fresh open PR pathsets were inspected by the coordinator; no competing Story effect runtime/test owner was found. Roster, CSS, release, dependencies and global roadmap remain separate.

## Boundaries and preservation

The retained `storyEffectEngine.ts` owns public dispatch, batch sequencing, cash/message/contract/flag execution and outcome translation. Its two public exports remain their original function declarations. The former 778-line owner becomes 385 physical lines.

- `storyGameEffectExecutors.ts` (155 lines) owns market-news, route, location and currency writer construction and execution.
- `storyGameEffectPayload.ts` (130 lines) owns game-effect payload validation and official currency membership.
- `storyPolicyEffectExecutor.ts` (121 lines) owns policy scope, payload, expiry and ordered policy/impact writes.
- `storyEffectWriteSupport.ts` (24 lines) owns the shared effect idempotency key and write-result ID projection.

All 27 original declarations, including the currency constant, retain their exact source text except an export modifier where required. Imports and inter-declaration whitespace are the only other runtime changes. No wrapper, duplicate implementation or dynamic export binding is introduced. The public dispatcher and batch bodies remain byte-identical. Preserve optional-writer and player-context precedence, first-validation-error order, scoped keys, object identity/freezing, formulas, async/write order, skipped/failed shape and batch continuation. No API, RPC, database, economic, security, dependency, deployment or live-data changes.

Original tests are byte-identical except one additive import in `prepareStoryEffects.test.ts`, which registers the new characterization suite in the retained Story replay workflow. Package and workflow bytes are unchanged, preserving REF-003 evidence bindings.

## Qualification

- Identical public-entrypoint characterization plus original engine tests: 37 passed on untouched baseline and candidate (25 new, 12 retained).
- Retained Story replay workflow test command, including additive characterization: 272 passed.
- Core backend TypeScript: passed.
- Source-preservation check: all 27 declarations exact; retained test and package checks passed.
- Generated architecture inventory: 1,423 to 1,428 source files; 73 to 72 oversized sources. All other debt counts and thresholds unchanged.
- Full root, committed-head architecture, secrets, runtime/new-test formatting and whitespace checks: passed. The retained registration test keeps inherited formatting unchanged.
- Independent source review confirmed all 27 declarations remain exact. Final evidence-head gates and durable recovery are checked before coordinator handoff.

Full Edge/backend smoke remain incomplete at the unchanged frozen `esm.sh` SDK retrieval refusal. This extraction does not change imports, SDK pins or lockfiles that could resolve it. The coordinator instructed against repeating materially unchanged blocked downloads. Earlier blocked attempts are retained in the predecessor recovery; no Edge or smoke pass is claimed.

Next: finish committed-head local gates, independently review source and durable recovery, then parent-controlled actual-main integration and exact-head hosted qualification. Local preparation does not certify merge or production readiness.
