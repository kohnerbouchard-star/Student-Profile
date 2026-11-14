# Contract repository row translation

## Scope and ownership

- Roadmap item: `ARCH-LARGE-CONTRACT-REPOSITORY-ROWS-001`.
- Status: `IMPLEMENTED_NOT_MERGED`, local preparation only.
- Baseline: `96988b6f2745112a6b91ce9bb5b83ca17ae2f42f`; branch `refactor/contract-repository-rows-20261114`.
- Live open PRs #938, #933, #735, #731, #668, #624 and #620 and their complete changed-path sets were checked. None owns the selected Contract infrastructure sources. Roster, Storyline, CSS, release controls and the global roadmap keep their separate ownership. Retained Contract donor branches are not imported.
- #620's mechanical Actions upgrade overlaps the existing Backend Typecheck workflow. This tranche adds only one frozen, network-denied repository test step; every existing action version, command, path trigger, permission and gate is unchanged. No backend package script or global roadmap edit is made because #668 retains those shared owners.
- Move adapter-local query contracts, persisted row shapes and select strings into `contractRepositoryRows.ts`, and pure template/Contract mapping, sparse progress-upsert translation and availability matching into `contractRepositoryRowMapping.ts`.
- Preserve the entire repository class and local error helpers. Queries, scoped filters, write ownership, idempotency guards, validation order, payload references, sparse null/omitted fields, numeric conversions and public exports remain unchanged. `ContractProgressReadProjection` is untouched.
- No API, RPC, route, schema, migration, economic policy, transaction, UI, dependency, credential, permission, hosted-data or production change. No push, PR publication, merge or deployment is part of this preparation.

## Implementation

The repository falls from 726 to 440 physical lines. Adapter-local row contracts are 155 lines and pure mappings are 170 lines. The new characterization suite is 450 lines; no existing test is removed, moved or weakened. The original public class, row type and mapper remain importable from the original module.

Architecture inventory changes from 1,392 to 1,395 source files and from 82 to 81 oversized files. Every other measured debt count and limit is unchanged. The new test adds one location to the existing `contract.title` capability token, not a new capability.

## Local qualification

- Pinned Node 22.23.1, npm 10.9.8 and Deno 2.9.3. Reused dependency trees have byte-identical root/backend lockfiles to the fetched baseline; no lockfile changed.
- 36 new public-entrypoint characterization cases plus all 18 retained repository cases pass on untouched baseline and candidate, with frozen lock, TypeScript checking and network-denied Deno execution. Tests cover complete select/filter/order traces, one-query large lists, null data, conversion/validation order, public mapping/reference identity, exact targeting, sparse upsert omissions/nulls, validation-before-query and persistence error precedence.
- Contract acceptance 124/124; Contract lifecycle 21/21; Admin local mutations 80/80; Admin Contracts client 19/19, Player Contracts flow and complete Player Terminal verification pass. Core backend TypeScript passes.
- Complete root `npm test` passes, including deterministic architecture inventory and all retained root audits. Secret scan, formatting and whitespace checks pass.
- Expanded Contract domain run: 168 pass, one unchanged retired-route expectation fails at `playerContractHttpHandler.test.ts:40`. Independent baseline reproduction confirms the same failure (actual `null`, expected `{kind: "contracts"}`). It is neither corrected nor waived in this behavior-preserving tranche.
- Full Edge typecheck and Admin API checks are blocked by the existing frozen SDK import `https://esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs` returning connection refused. Full backend smoke stops at that same dependency after 1,160 Deno and 18 Node cases pass. No aggregate Edge/backend or hosted pass is claimed.
- Independent source review reproduces baseline/candidate 54/54 and verifies all 23 original top-level declarations, including the entire repository class, text-identical after export modifiers/trailing whitespace. Final review and recovery evidence accompany the local handoff.

## Proposed scope intake for the global roadmap owner

`ARCH-LARGE-CONTRACT-REPOSITORY-ROWS-001` — Separate Contract repository row translation: `IMPLEMENTED_NOT_MERGED`; local owner `refactor/contract-repository-rows-20261114` from fetched main `96988b6f2745112a6b91ce9bb5b83ca17ae2f42f`. Keep all queries and writes in the unchanged repository class, preserving its original public exports. Repository 726 to 440 lines; row contracts 155, pure mappings 170; oversized inventory 82 to 81 with all other debt counts unchanged. Baseline/candidate 54/54, Contract acceptance 124/124, lifecycle 21/21, Admin local 80/80, full root and core TypeScript pass. Broader domain retains one independently reproduced baseline retired-route failure. Full Edge/Admin API/backend smoke qualification remains limited by frozen SDK retrieval. No roster, Storyline, economic, schema, UI, production or publication change. Next: independently verified local recovery, then fresh ownership/base reconciliation and explicit preview-safe publication clearance before any hosted qualification. Production remains held.

## Rollback and remaining gates

Revert the two helper modules, repository imports/re-exports, characterization registration and generated inventory as one source unit. There is no database rollback.

Local recovery must preserve source commit/tree, source archive, patch, changed-path hashes, baseline prerequisite and test/review logs, and be restored independently. Publication remains held until the coordinator establishes preview safety and releases the serial lane. Any later publication needs an actual-number authority manifest and fresh exact-head hosted qualification. This tranche does not certify live Contract capability or production readiness.
