# Story–Stocks news local candidate

Roadmap: `ARCH-402-STORY-STOCKS-NEWS-001` (partial `ARCH-402`). Status: `IMPLEMENTED_NOT_MERGED`; local implementation only. Baseline refreshed from `origin/main`: `8be9516e39705e411a839c601cb57ba84c6cc863`, PR #906 merge. Candidate branch: `refactor/story-stocks-news-local-8be9516e` in `/workspace/story-stocks-news`. The pre-existing `/workspace/Student-Profile` worktree was left intact. No PR, push, merge, deployment, hosted SQL, setting/permission change or other external mutation.

## Change and preservation

`stocks/news.ts` explicitly exports six news runtime symbols and eight news types from the canonical news contract. Story's two production consumers and one test use this narrow entrypoint. No wildcard, broad Stocks index, infrastructure import, copied parser, wrapper or database change. The parser and writer implementations remain unchanged except for the writer's import path. `deno info --json` confirms the entrypoint's graph contains exactly itself and `contracts/stockMarketNewsContracts.ts`.

Characterization covers system-source and game override, provenance metadata precedence and retained fields, explicit tick (including zero) before frozen tick before current tick plus one, ignored invalid frozen ticks, rejected unsafe explicit/computed ticks before persistence, deterministic 128-character boundary and unsafe-key hashing, empty-key rejection, canonical runtime identity and exact export set, parser defaults/normalization/metadata identity, target scope rules, validation order and canonical error class/code/status/message. Existing repository idempotency and game-scope tests also pass.

The Story replay workflow now registers the public-boundary test, existing news parser test, Story contract test and expanded writer test without changing permissions or existing tests. Both PR and main-push path filters include the four exact Stocks boundary/canonical news paths, so future news-only changes also trigger preservation checks.

## Ownership and source reconciliation

The GitHub connector returned 20 open PRs. Changed-file pages were checked for each; #620 required two pages (150 files). None changes the three news consumers or adds this entrypoint. #888 remains open draft at `1b350848b00140d1b1069615afc2ea8a0de4b49a`, with 36 changed files; its body references an older source. Its broad Stocks index, runner, Story loop/context and realtime work is not included here. Existing local branches/worktrees and remote branch names were also checked; no news implementation owner was found.

Shared documentation conflicts remain: inventory with #888/#885/#884/#736/#668; roadmap with #735/#668. Regenerate the actual union on any future integration. No ownership acknowledgement is inferred. The stale #893 draft status in the beta roadmap was reconciled only to its verified source merge `924c1b566e96c7843f58f07be7f9148dc96f7290`, accepted head `37d79483c5ffaf71342086ac3a125cadd07162af`; historical tests were not relabeled as new runtime certification.

## Inventory

Deterministic regeneration passed. Source files: 1,307 → 1,309. Lexical deep imports: **71 → 71**, comprising 23 non-test and 48 test edges. Foreign infrastructure imports: **0 → 0**. All other measured counts unchanged. Semantic effect: three Story dependencies (two production, one test) use the named Stocks-owned news boundary instead of its private contract path. The scanner still counts non-index entrypoints and lists only `stocks/index.ts` as a public boundary. No scanner, exemption, baseline or ceiling was changed to alter that result.

## Passed local checks

Tooling installed in `/tmp/news-tooling`, without repository pin/lock changes: Node 22.22.2, npm 10.9.8, Deno 2.9.3. `npm ci` and `npm --prefix backend ci` succeeded. Set `PATH=/tmp/news-tooling/node_modules/.bin:$PATH` and `DENO_DIR=/tmp/news-deno-cache` to reproduce.

- `npm test`: passed, including architecture/high-priority/migration/legacy audits and required root aggregate checks. Log `/tmp/news-root-test.log`.
- `npm --prefix backend run typecheck:all`: backend TypeScript and all 28 Edge roots passed. Log `/tmp/news-typecheck-all.log`.
- `npm --prefix backend run smoke`: passed; 1,415 Deno tests across 27 reported summaries, plus its neutral-config checks. Log `/tmp/news-smoke.log`.
- Updated Story replay workflow's exact test command: **93 passed, 0 failed**. Log `/tmp/news-story-replay.log`; includes the **23-test** focused subset in `/tmp/news-focused.log`.
- News repository, repository idempotency, Story news effect and Story loop suites: **12 passed, 0 failed**. Log `/tmp/news-integration.log`.
- `node --test scripts/player-cross-cutting-authority.test.mjs`: **16 passed, 0 failed**. Log `/tmp/news-authority.log`. No future PR-scoped authority is invented for this unpublished candidate.
- `npm run audit:architecture`, deterministic inventory regeneration, `npm run security:secrets`, Deno formatting and `git diff --check`: passed. Logs `/tmp/news-architecture.log`, `/tmp/news-inventory-final.log`, `/tmp/news-secrets.log`.

Inventory was staged before the aggregate because its existing determinism gate compares regenerated output with the index. This preserves the tracked inventory diff for review and does not waive the gate. Later regeneration produced no unstaged inventory difference.

## Review, failures and remaining gates

Initial independent read-only agent review found **no actionable source findings** and independently ran the boundary/writer tests (**9 passed, 0 failed**). No reviewer edits were made. Follow-up review found a workflow trigger gap: the newly registered Stocks tests would not run for future Stocks-only changes. Added the four exact boundary/canonical news paths to both PR and main-push filters; this finding was addressed within scope and independent re-review confirmed closure with no remaining actionable findings.

The exact requested native CLI command, `codex review --uncommitted` in this worktree, **could not execute a review**: `failed to initialize in-process app-server client: Read-only file system (os error 30)`. Log `/tmp/news-native-review.log`. This was an environment initialization failure, not an approval denial. The independent agent review does not substitute a claim of native CLI completion. Native review remains a blocker for that requested gate.

Initial new-test typechecking caught a widened tuple fixture type; it was corrected with an explicit tuple-array type, then focused tests and full typechecking passed. Two local command attempts used the wrong working-directory-relative paths; corrected commands passed. These development attempts are not final test failures.

Not run: hosted CI/Preview, connected staging, deployment, hosted SQL, database replay/lint, pinned Edge Runtime bundling or live behavior probes. There is no schema/query/runtime implementation change; no live or release readiness is asserted from local tests. Future publication needs its own authorization, fresh scope/authority reconciliation and exact-head checks. Next: native review in a writable reviewer environment and parent review; separately reconcile Stocks realtime with #888.

## Complete changed-file list

- `.github/workflows/story-replay-safety.yml`
- `backend/src/domains/stocks/news.ts`
- `backend/src/domains/stocks/news.test.ts`
- `backend/src/domains/storylines/contracts/storylineContracts.ts`
- `backend/src/domains/storylines/infrastructure/stockMarketStoryNewsWriter.ts`
- `backend/src/domains/storylines/infrastructure/stockMarketStoryNewsWriter.test.ts`
- `docs/architecture/inventories/econovaria-architecture-inventory-v2.json`
- `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`
- `docs/operations/evidence/story-stocks-news-local-v1.md`
