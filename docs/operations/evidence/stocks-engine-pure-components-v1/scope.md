# Stocks engine pure component extraction

- Roadmap item: ARCH-LARGE-STOCKS-ENGINE-001.
- Status: IMPLEMENTED_NOT_MERGED; local-only preparation, no PR or hosted qualification.
- Base: c59ed0afe1ac794bb5c4788f477020e535c3587b, freshly fetched 2026-11-13.
- Owner: refactor/stocks-engine-pure-components-20261113.

## Scope and ownership

The original pure engine mixed input validation/settings, regime resolution, economic factors, shock selection and accumulation, tick orchestration and output projection. Extract the first four responsibilities into calculation-local modules. Keep calculateNextStockMarketTick, the exact asset iteration/call order and output construction in stockMarketEngine.ts. Preserve its original exports via direct re-exports, including profile object identities. All original declaration bodies remain unchanged apart from their export modifiers. No new domain barrel or cross-domain dependency is introduced.

Input normalization helpers stay with engine input interpretation; factor and shock modules import them directly. Regime type imports do not create runtime cycles. The runner, persistence, network/query order, contracts, schema, RPCs, economic write paths and visual systems are untouched. This is behavior-preserving source decomposition, not a claim that existing numeric semantics or all feature edge cases are ideal. For example, normalized exposure aliases preserve first-match selection and history retains stable duplicate tick ordering.

Seven open PRs were inspected (#620, #624, #668, #731, #735, #933, #938); none owns these Stocks calculation files. Shared roadmap ownership and existing roster, Player, CI and release work remain unchanged. Main already contains #953/#954/#955; older intake states are historical, not current merge evidence. Parallel Player read-model work is independent. Integration remains serialized and must refresh actual main and generated inventory.

## Characterization and validation

The existing 31 engine tests passed before edits. Before extraction, add 59 tests to the existing registered engine test entry: 22 complete-output fingerprints with explicit prices/noise values, 33 exact first-error fixtures, settings merge/validation/scope, existing profile identity and macro API, asset-local seeded iteration independence, and a carried-forward 30-tick full-result fingerprint. The 22 valid fixtures also enforce input immutability and shared explanation identities. All 90 pass on unchanged main and on the candidate. Fingerprints capture full ordered JSON, not only price; fixtures include normalized duplicate countries/sectors, exposure aliases, all six regimes, shock scopes/timing/decay/order, seed delimiters/Unicode, price floor, volatility units, fallback capitalization and missing optional fields. Expected values were captured before source extraction, not regenerated from candidate output.

The existing engine test imports the new characterization test. Its fixture module contains synthetic non-personal data only. Existing tests are preserved; no test-import redesign or skipped regression.

Local commands and final outcomes are recorded below after verification. Independent review and a verified private recovery archive precede integration. Preserve all existing required workflow identities. Before publication, register actual PR authority and ensure the existing full financial-market engine test command and backend checks qualify the exact candidate. No production deployment or approval waiver.

## Size and integration boundary

Physical line counts: engine 1,370 to 429; engine input 420; regime 112; factors 291; shocks 140. All new runtime files are below 500 lines. The deterministic inventory must be regenerated on each integration union; standalone reduction is one oversized file, not a cumulative count for other pending branches. Source-size thresholds and all architecture ratchets remain unchanged.

No migration, API, request context, database, release setting, dependency, production deployment, workflow command or permission change in this local preparation. Browser UI qualification is not applicable to a pure backend source extraction; full backend/hosted qualification is still required. Next exact item: local final review/recovery, then coordinator-controlled actual-main reconciliation and draft publication for ARCH-LARGE-STOCKS-ENGINE-001.

## Local qualification result

Reviewed implementation `0135b1d0f55a49a80844401a3ff2c04bcdb6c411`, tree `d0ca0746e91fe815937fe6616f3de48af54e8029`, has no actionable independent-review finding. The reviewer reconstructed the original engine directly from git `c59ed0af`, checked unchanged dependencies and all 62 declarations, compared runtime export names/identities, and independently ran all 90 engine tests against baseline and candidate with network denied. Runtime imports are acyclic and remain within the Stocks domain. The asset-order fixture is non-palindromic and retains a duplicate ticker to test per-asset seeding.

Passed on Node 22.23.1, Deno 2.9.3:
- Existing registered engine suite: 90/90 (31 retained plus 59 new). New characterization suite alone also passes 59/59 against the unchanged-main executable.
- Broad Stocks domain suite: 388/388, run from backend with the required migration read permission; the imported characterization entry is not independently supplied a second time.
- Full root `npm test`, retaining its explicit existing PostgreSQL fixture skip.
- Backend core TypeScript, committed deterministic inventory, secret scan and whitespace checks.
- All 62 original function/interface/constant declarations preserved byte-for-byte except export modifier and trailing declaration-boundary whitespace.

Inventory: 1,364 sources / 87 oversized / 52 persistence candidates / 70 cross-domain import candidates / 26 browser transport shims / 210 compatibility-marker files. No ceiling is raised. New synthetic test labels describe capitalization rather than adding misleading compatibility-marker matches; original runtime normalization remains unchanged.

Incomplete, not waived: `typecheck:all` passes core TypeScript and then the frozen Supabase 2.108.2 SDK download is refused in Edge checking. Backend smoke executes 23 Deno groups / 1,027 passed cases and 18 Node cases, then the same dependency refusal blocks the Game Sessions group. Neither aggregate is a pass. Hosted exact-head qualification, publication and merge are not performed. No new staging/runtime feature claim.

The root and standalone suite had two setup-only corrections before the recorded pass: regenerate and commit inventory before the root's clean-inventory guard, and run the broad Stocks test command from backend so its migration paths resolve. These did not require changing tests, authorization boundaries or engine behavior. Future actual-main integration must rerun qualification and regenerate the union inventory.

## Actual-main integration after Player #956

The owner authorizes publication and qualified serial merge, with production held. PR #956 merged as `245bfc5685455963fb0ffdbe7ff6601140dd5dbd` and its 26 expected main-push workflows have passed. This candidate integrates that actual main, retaining every Player source, characterization, workflow selector, authority and evidence byte. Only additive roadmap intake and regenerated inventory required reconciliation. Earlier local-only statements are historical preparation, not the current publication instruction.

The complete Stocks source and tests remain byte-identical to reviewed `0135b1d0`; the engine and each pure helper retain their tested semantics. Existing engine-selecting workflow filters already cover the helpers; no helper-trigger expansion is needed. The existing Backend smoke command imports the registered engine suite, including all 59 added characterizations. Combined inventory is 1,369 sources / 86 oversized files, with 52 persistence candidates, 70 cross-domain import matches and other ratchet counts unchanged. Fresh local verification and actual-number exact-head hosted qualification remain required before merge; previous-head CI is not reused. No production deployment, database change, feature change or gate waiver.
