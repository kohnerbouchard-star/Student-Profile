# Marketplace repository row translation: new preparation

## Scope and identity

- Roadmap item: `ARCH-LARGE-MARKETPLACE-REPOSITORY-ROWS-001`.
- Status: `IMPLEMENTED_NOT_MERGED`; local source preparation only.
- Baseline: freshly fetched main `2198e7a907d2d87a9eb79867abf9c2f6615cdd59`, including merged Contract PR #964.
- Owner: `refactor/marketplace-repository-rows-reprepared-20261114`.
- This is newly prepared source from current main, not recovery of the unavailable earlier Marketplace candidate. No prior source hash, test result or review is credited to this preparation.
- Six open PRs remain separately owned: roster #933/#938, Player CSS #624, release controls #731/#735 and global roadmap #668. No donor implementation is imported. The global roadmap and root/backend package manifests stay unchanged; proposed intake below is for the coordinator.

Move existing adapter-local query contracts and select strings to `marketplaceRepositoryRows.ts`; move existing pure row/DTO interpretation, normalization and error translation to `marketplaceRepositoryRowMapping.ts`. Keep the original public repository export and the complete repository class unchanged. Preserve all 40 original top-level declarations, including the currently unused optional asset parser.

All reads, expiry calls, exact selects, game/player filters, limits, sequential admission, dependent reference lookups, first-row deduplication, relationship checks, UUID-to-public-key mapping, validation/error precedence, defaults, coercion, clocks, RPC arguments, idempotency and mutation results remain unchanged. No API, RPC, route, schema, migration, policy, transaction, economic write, UI, dependency, credential, permission, service setting or live-data change.

## Test discovery and architecture

The only workflow change is an additive frozen, network-denied Marketplace repository characterization step in Backend Typecheck. The inherited Contract characterization step and every existing action version, command, filter, permission and enforcement gate remain byte-identical. No denied workflow changes or preview/deployment setting changes are attempted.

Repository source decreases from 580 to 291 physical lines; adapter-local row contracts are 33 lines and mapping helpers are 296 lines. The new characterization tests exercise only the original public repository, using synthetic local clients. Existing tests remain untouched. The test files are split into row characterization (460 lines), command/error characterization (342 lines) and synthetic fixtures (316 lines). Inventory changes from 1,395 to 1,400 sources and from 81 to 80 oversized files. All other measured counts and ceilings remain unchanged. The first root run caught the compatibility-marker scan counting two new test titles; descriptive title-only changes removed that false positive without changing assertions, runtime or ratchet ceilings.

## Local qualification

Qualification was rerun for this new source. Pinned tools are Node 22.23.1, npm 10.9.8 and Deno 2.9.3. Reused root/backend dependencies have byte-identical lockfiles to baseline; no dependency or lockfile change.

- All 40 original declarations and the whole repository class are text-identical after removing only helper export modifiers. Original public exports are unchanged. Independent review separately verifies the same source preservation.
- All 40 new public-entrypoint characterization cases pass on untouched baseline and candidate. Together with all four retained repository cases, independent baseline and candidate runs pass 44/44. Full read/query graphs, dependent lookups, public-key privacy, normalization/bounds, defaults, status variants, validation/error precedence, every command RPC argument and result/short-circuit are covered.
- Core backend TypeScript passes on the final test layout. All 49 registered Marketplace cases pass; combined expanded Marketplace is 89/89 and combined inherited Contract plus Marketplace characterization is 98/98.
- Complete root `npm test`, deterministic inventory, existing architectural ratchets, secret scan and whitespace checks pass. New tests/fixtures pass frozen Deno typecheck and formatting. Runtime declaration formatting remains exact rather than being reformatted during extraction.
- Full Edge typecheck stops at unchanged frozen `https://esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs` retrieval with connection refused. This is not a full Edge pass and is not waived.
- Full backend smoke reaches 1,160 passing Deno cases plus 18 Node cases, then stops on the same unchanged frozen SDK retrieval. No aggregate backend smoke, Edge, hosted or runtime pass is claimed.
- Independent source review finds no semantic defect; its only EOF-whitespace finding was corrected. Exact final source hashes and independent baseline/candidate evidence are retained in recovery. Durable recovery is validated separately against the committed tree before handoff.

## Proposed intake for the global roadmap owner

`ARCH-LARGE-MARKETPLACE-REPOSITORY-ROWS-001` — Separate Marketplace repository row translation: `IMPLEMENTED_NOT_MERGED`; newly prepared owner `refactor/marketplace-repository-rows-reprepared-20261114` from main `2198e7a907d2d87a9eb79867abf9c2f6615cdd59`. Preserve the whole persistence class and all 40 declarations while separating existing private query contracts and pure row mapping. The earlier unavailable local candidate is not claimed recovered. No roster, Contract source, global roadmap, package, economic, API, schema, UI, permission, service-setting or production change. Next: verify durable recovery, then coordinator-controlled actual-number registration and fresh exact-head hosted qualification before any merge. Production remains held in this preparation lane.

## Rollback and remaining gates

Revert the repository imports, two helpers, characterization files, additive test discovery and generated inventory together. There is no database rollback. Recovery must retain exact source/base identities, Git bundle, complete source archive, binary patch, changed-file hashes and validation/review evidence, and restore the exact tree independently.

No push, PR creation, merge, deployment, staging mutation or service setting change has been performed. Later publication remains the coordinator's responsibility and requires appropriate external-check safety clearance, actual-number authority and fresh exact-head hosted qualification. This source refactor does not certify a live Marketplace capability or production readiness.

## PR 965 publication and qualification

Published reviewed tree `28672ff4c91c4d1a3d966167e2a82bf017fcd965` as source commit `c3acbe9e2c1d0fc85802bfc37f27c0d32651cf0f` in [PR #965](https://github.com/kohnerbouchard-star/Student-Profile/pull/965). Actual-number authority preserves all 149 required and 104 critical check identities from PR #964 in their original order, with additive PR-path registration in the same 49 workflows. No production trigger, permission, workflow command or runtime source changes are part of qualification metadata. Final-head hosted checks, normal serial merge and postmerge verification remain pending; production is held.
