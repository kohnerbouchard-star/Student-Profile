# Staff Contract HTTP responsibility extraction

Roadmap item: `ARCH-LARGE-STAFF-CONTRACT-HTTP-001`. Base:
`d2d951e542b12e9e47f6db1783bdf4ef9993e930` (merged PR #975).

## Bounded ownership

- `staffContractHttpHandler.ts` retains dispatch, authentication, game
  ownership, repository construction, mutation calls, dependency contract, and
  error mapping.
- `staffContractRequestParser.ts` owns body, filter, review-action and authority
  validation.
- `staffContractProgressHttpHandler.ts` owns progress listing/review and the
  scoped contract lookup used by progress and rewards. Existing public functions
  remain direct exports from the original entrypoint with identical function
  identity.
- `staffContractRewardHttpHandler.ts` owns the unchanged reward sequence, replay
  branches, deterministic idempotency key and reward response mapping.

Every original function body and signature is preserved byte-for-byte; only
module imports, private export modifiers and direct reexports change. No schema,
route, RPC, authentication, economic, security, deployment or live-data changes.
All four runtime owners are below 500 physical lines (303, 295, 145, 167).

## Verification contract

The same public-entrypoint characterization tests run against baseline and
candidate. They cover method/auth/ownership precedence, filter ordering,
validation failures before repository access, direct progress/review
entrypoints, reward read/write ordering, replay gates, server-derived reward
authority, idempotency key and mark failure. Candidate identity tests ensure
direct bindings. Existing tests remain unchanged except two additive imports in
the retained `adminContractMutation.test.ts` test suite. Package manifests and
workflows are unchanged, preserving REF-003 evidence inputs.

Required qualification includes full root tests, core TypeScript, Contracts
domain tests, retained REF-009 parity, architecture, secrets, formatting and
whitespace checks; observed outcomes and blockers are below. Full Edge/smoke
qualification remains blocked by the previously documented frozen esm.sh SDK
connection refusal; it is not claimed passed. No repeated blocked SDK download
or dependency/lockfile workaround is included.

This local implementation is not verified complete or merged. Parent owns the
main roadmap update, publication metadata, independent review, and merge gates.

## Observed qualification

- Baseline characterization: 8 passed. Candidate Staff suite: 36 passed,
  including eight characterization tests and the public-binding identity test.
- Root `npm test`, core TypeScript, architecture, secrets, and new-source
  formatting pass.
- Broad Contracts discovery: candidate 260 passed / 1 failed; baseline 250
  passed / 1 failed. The identical existing failure is
  `playerContractHttpHandler.test.ts:40`, whose legacy route assertion expects
  `{ kind: "contracts" }` but receives null. This extraction leaves that test
  and route implementation unchanged. Extra candidate tests are additive
  registrations.
- REF-009 parity is blocked importing the frozen Supabase 2.108.2 SDK from
  esm.sh. Full Edge/smoke remain unqualified under the same recorded SDK
  blocker.
- The retained `adminContractMutation.test.ts` already has formatting drift in
  unchanged test bodies; those bodies are deliberately preserved byte-for-byte.
  Formatting passes for every new or extracted runtime/test file and this note.

The stale route assertion conflicts with the explicit retirement in
`playerContractRoutePaths.ts` (commit
`bc0f03b89b2d541a98a58a4ebce8cdba9201e1ec`) and the dedicated
`playerContractRoutePaths.test.ts` retirement assertions. The registered
`test:player-contract-acceptance` suite covers the same list URL through
`playerContractPublicListHttpHandler.test.ts` and the dedicated public-list
parser. Both `classroom-api/index.ts` and `player-api/runtime.ts` dispatch
public submit/list parsers before consulting the retired compatibility parser.
The stale assertion remains visible and unchanged, not waived or silently
removed.
