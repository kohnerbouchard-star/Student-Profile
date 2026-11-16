# Player story delivery row translation

## Scope and ownership

- Roadmap item: `ARCH-LARGE-PLAYER-STORY-DELIVERY-ROWS-001`.
- Baseline: freshly fetched main `6f858ca6804ac8539f993e31ad53ab9d1ee964a1`.
- Isolated branch: `refactor/player-story-delivery-rows-20261115`.
- Nine live open PR pathsets (#968, #969, #938, #933, #735, #731, #668, #624 and #620) were checked. None owns the Notifications runtime or test paths. Shared generated inventory and this bounded intake are reconciled separately; global ledger, roster, CSS, release control and dependency work retain their current owners. The prepared Stock and parallel Campaign batches are separate.
- Extract adapter-local query contracts and select constants into `playerStoryDeliveryRows.ts`; pure row projection, validation, state projection and error translation into `playerStoryDeliveryProjection.ts`.
- Retain the complete repository class byte-for-byte, including read/write order, game/player scope, notification lookup, pending filtering, priority/date/ID sorting, caller limit semantics, terminal precedence, atomic null guards, retry reads and error behavior.
- No API, route, RPC, schema/migration, economic policy, UI, dependency, credentials, permissions, live-data or production change.

## Implementation

The repository decreases from 531 to 201 physical lines (532 to 202 under the inventory's trailing-line convention). Row/query declarations are 71 physical lines; projection/validation is 289. The original repository's sole export remains `SupabasePlayerStoryDeliveryRepository`. All 40 original top-level declarations are preserved exactly apart from helper export modifiers and imports; the complete class is unchanged.

The deterministic inventory changes from 1,401 to 1,406 source files and from 80 to 79 oversized files. Every other measured debt count and threshold is unchanged. All new source and test modules remain below 500 lines.

## Qualification

- 105 new public-entrypoint characterizations plus seven retained tests pass on untouched main and the candidate: 112/112 on each.
- The retained adapter test imports both new characterization suites, so the existing `test:player-notifications` command exercises them without command or workflow changes. The complete Notifications suite passes 145/145.
- Cases cover exact selects/query ordering, dependent-read admission, game/player scope, provider/schema errors, malformed identities/content/timestamps, bounded text and asset keys, optional defaults and numeric coercion, input immutability, priority/date/public-ID ordering, pending filtering and caller limit slicing. State cases cover exact guarded writes, terminal/replay precedence, acknowledgement requirements, retained seen timestamps, update privacy, malformed results, lost races, conflict retryability and disappearing rows.
- Independent read-only source review confirms all 40 declarations, byte-identical complete class and original public export; independently rerun baseline and candidate 112/112 tests pass. No actionable findings.
- Full root tests, backend core TypeScript, architecture inventory/ratchet, new-test formatting, secret scan and whitespace checks pass.
- Full local Edge typecheck and backend smoke both exit 1 at the unchanged frozen `https://esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs` connection refusal. Smoke first passes 1,265 Deno and 18 Node cases. Neither aggregate passes; no gate is waived and exact-head hosted qualification remains mandatory.
- No staging/runtime or production verification is claimed. The status is `IMPLEMENTED_NOT_MERGED`.

## Next gate

Freeze and independently restore a recoverable commit, patch, bundle and source archive. Reconcile current main normally, publish a separate draft only through the coordinator, register actual-number authority without weakening predecessor checks, and qualify the exact final head before any coordinated merge. Production remains held.

## Current-main integration

Normal merge of Store-merged main `2dc93b7266eb30371da182378ea002bd79c293ac` retains the complete qualified Storyline #968 and Store #969 source, tests, authorities and workflow registrations. Only the generated architecture inventory conflicted; it was rebuilt from the combined source. Original Notifications runtime and characterization bytes remain unchanged. The merged-main inventory is 78 oversized files; this candidate is 77, with all other debt counts and thresholds preserved. Fresh full root, backend core TypeScript and 145 Notifications cases pass. Initial baseline/preparation counts above describe their recorded older source. Actual-number registration, exact-head hosted qualification and serial merge after Stock remain pending. No production action.

## Published draft authority

Draft [PR #972](https://github.com/kohnerbouchard-star/Student-Profile/pull/972) publishes source `da28f9ee2e2d93419f61fdba39bd52045e67997a`, reproducing reviewed local source `4a9703e11ef7d35ff10e40cf2daaada374ba43db` and tree `fc78ce400ecdd55f40b330fbc1dbe15a6b88f512`. Actual-number authority inherits all ordered 149 required and 104 critical checks, unchanged read-only verifiers and false production/mutation/secret flags from PR #969. The same 49 workflows receive only the exact PR #972 authority path in their pull-request filters; all commands, pins, guards, permissions and push/production triggers remain unchanged. Its exact allowlist binds 60 changed paths plus two unchanged read-only verifiers. Runtime and test bytes are unchanged. Status remains `IMPLEMENTED_NOT_MERGED`; exact final-head hosted qualification and normal serial merge are pending. Production remains held.

## Stock-main reconciliation and retained retry evidence

Stock #971 merged normally as `874355480e31eafc5b4b3b2fa4f2fbccf14db9e7`, tree `4b240b6c7604f8c051eb43971084f38db78d7ae4`. Normal integration preserves its complete source, tests, actual-number authority and workflow registrations, including the deterministic Admin-session security test correction. Shared workflow filters combine both PR paths without changing commands, permissions or production guards. Only generated inventory conflicted and was rebuilt: current main has 77 oversized files; the combined candidate has 76. Original Notifications runtime and test blobs remain unchanged. The authority retains all ordered 149 required and 104 critical identities and the exact 60-change/62-lock scope.

On the preceding Notifications head `1cab54ee86cfc40b553432689de4a6480fc0ac2b`, Admin Browser E2E run `43638548742` failed when the unchanged ledger replay harness lost its Playwright execution context during navigation. The rendered Create Game/Admin journey passed; no replay result was waived. Independent review found the harness/core/wrapper identical to main and the same journey passing on Campaign #973. One failed-job-only retry ran as attempt 2, job `132599999665`, and completed successfully without source changes. The failed attempt remains preserved separately. Those results do not qualify this reconciled head: fresh committed-head local checks, independent review, exact-head hosted qualification and Stock postmerge clearance precede any normal merge. Production remains held.
