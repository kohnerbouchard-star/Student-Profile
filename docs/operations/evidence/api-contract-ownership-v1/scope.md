# API capability, routing and refresh ownership checkpoint

Status: IMPLEMENTED_NOT_MERGED; local main baseline `39685d2c29394caa425d928649804a433806e521`, fetched 2026-11-16. Related architecture package: REF-005 seam contracts. This is a fresh source measurement, not live traffic or production certification. Global roadmap belongs to the coordinator; reconcile this evidence there before publication. No remote writes, deployment, SQL changes or browser redesign.

## Fresh measurements

| Surface | Count on baseline |
| --- | ---: |
| Terminal endpoint catalogue | 105 (37 reads, 68 writes) |
| Generic adapter registry | 99 unique identities |
| Marketplace-specific adapter | 7 catalogue identities, handled separately |
| Server capability manifest | 90 identities, 100 HTTP operations |
| Manifest route/action flags | 17 / 58 |
| Terminal route resource plans | 16 |
| Explicit write refresh policies | 63 |
| Idempotent write identities | 65 |
| Writes missing refresh policy | 5 |
| Writes missing generated idempotency | 3 |

The adapter union covers all 105 catalogue entries. Generic keys additionally include logout, which is not a catalogue action. Raw counts deliberately differ: bootstrap maps to session; inventoryRedemptions maps to inventoryUse; Store offer operations are aliases; marketplacePurchase covers purchase plus settlement; crafting is grouped/optional. The 18 catalogue identities without an identically named manifest entry are NOT evidence of 18 broken endpoints. The existing current-capability-manifest regression passes.

[Full per-endpoint map](endpoint-map.csv) records all105 endpoint identities by logical domain, method, terminal path, adapter owner, same-key server operations and post-fix local refresh policy. Domain grouping is editorial by endpoint prefix, not a new code ownership hierarchy.

## Actual ownership and duplication

| Concern | Current owner/source | Necessary relationship / risk |
| --- | --- | --- |
| Terminal action identity/method/path | `player-terminal/src/api/endpoints.js` | UI-relative paths intentionally differ from backend paths. |
| Server-advertised authority | `backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts`, composed from four `player*CapabilityEndpoints.ts` files | Server defines supported operations; frontend must not self-authorize a missing capability. |
| Client capability flags | `player-terminal/src/api/capabilities.js` | Separate action list duplicates manifest concepts; not all flags are HTTP mutations. |
| Manifest aliases and requirements | `player-terminal/src/integrations/student-profile-capability-manifest.js` | ENDPOINT_COVERAGE, ROUTE_REQUIREMENTS and ACTION_REQUIREMENTS are manually maintained maps. Keep explicit aliases, fail-closed core and optional quarantine. |
| Actual client request translation | `player-terminal/src/api/backend-routes.js`, `backend-routes-core.js`, domain route modules; Marketplace independently composed by `integrations/student-profile-api-call.js` | Business bridge repeats keys because the core resolver delegates; publication in one registry does not automatically wire every registry. |
| Server route recognition and validation | Domain `api/player*RoutePaths.ts` and request validators/executors | Concrete path and ownership checks belong to the server domain, not the client catalogue. |
| Resource capability grouping | `player-terminal/src/api/resource-support.js` | Business stockroom/recipes/equipment explicitly depend on business capability. A raw key equality check would be wrong. |
| Load dependencies, mutation refresh and idempotency selection | `player-terminal/src/api/resource-plan.js`, consumed by `player-api.js` | Previously idempotency derived from incomplete refresh list plus two extra quote keys. |
| TTL and realtime refresh | `player-terminal/src/api/freshness.js`, realtime/freshness owners | Complement invalidation; TTL is not a substitute for successful-write invalidation. |

## Confirmed defect and local correction

Business formation propose/respond/activate existed in catalogue, server manifest and adapter, but not refresh/idempotency policy. Normal PlayerApi execution failed adapter validation (`idempotencyKey is required`) before transport. Domain server executor correctly requires idempotency; do not weaken it.

Added explicit policies: propose/respond invalidate business; activation invalidates dashboard/business/banking/businessTreasury, matching the direct formation economic read surface. Added intentionally empty Store quote/offer-quote policies, eliminating the two policy exceptions without changing quote refresh behavior. All68 write policies now own the derived idempotency set; no second quote-key append list.

Regression runs real PlayerApi through StudentProfile adapter into a synthetic request sink. It tests generated keys, body/both-header identity, transient failed mutation does not auto-retry or invalidate, explicit retry reuses key, successful mutation evicts the real Business read cache and the next read refetches, valid public formation keys pass the real backend route parser, and a later successful operation gets a new key. Coverage guard requires every current catalogue write to declare refresh and idempotency policy. Registered in the existing idempotency-header-parity verify stage. Test failed against baseline missing policy and passes after correction.

This is API wiring, not a complete co-owner formation UI: no current ordinary Player UI invokes these three commands. Cross-player notifications, durable formation listing and full proposal/consent UX remain separate work. Tests use synthetic requests, not production writes or database replay.

## Next bounded steps

1. Independently review this correction and integration tests; run final scoped/aggregate checks; integrate after #985 with its five exact policy-debt exceptions removed, not retained as stale allowlist entries.
2. Make Business export its own adapter key registry and compose it once, replacing the manually maintained bridge while preserving resolver priority and payload normalization. Characterize before changing.
3. Add checked per-domain descriptors for catalogue/adapter/manifest coverage, with explicit alias/group mappings. Server remains capability authority; avoid sharing server implementation into browser bundles.
4. Extend contract checks to every declared successful-write refresh resource and route dependency. Require named intentional empty policies for quote/prepare operations. Check actual mounted callers separately from exported API availability.
5. Expand ownership review to Admin capabilities/permissions and realtime signal-to-resource mapping in separate work units. Current counts are Player API scope, not whole-repository duplication totals.

No cleanliness percentage or full architecture completion is inferred from these counts.

## Validation checkpoint

Full Player `verify` passed on the first local revision; final strengthened focused regression passes with pinned Node22.23.1 and independent review found its actionable concerns addressed. Root `npm test` stopped with five security-metadata failures caused by missing @supabase/supabase-js in this worktree; it is not an aggregate pass. Final full Player `verify` rerun passed, including strengthened regression, source checks and both audits. No hosted CI, browser/database replay or production qualification is claimed.

## Main reconciliation 2026-11-16

Rebased onto fetched main `192b5de848a974ce00e2b640d5614b8789683f60` after #985 and #986. Removed precisely the five resolved write-policy exceptions from `player-write-policy-baseline.json`; the generic ratchet remains unchanged and now requires zero missing policies. Earlier39685 measurements remain explicitly historical, not fresh post-merge totals. This work remains local pending independent review, actual PR authority and hosted qualification.

Reconciled local validation: full root `npm test` passes with one existing PostgreSQL skip; full Player `verify` passes. Independent post-rebase review found no actionable concerns and inspected Store quote procedures: they persist quotes but do not settle funds/inventory, so empty displayed-resource invalidations preserve the existing semantics. This is not a live database replay.

Draft #987 source tree exactly matched local verified tree e649870207946afb262a743e4a8e97ec93ed5324. PR-bound authority includes 81 required identities and 49 critical job identities derived from 28 naturally triggered workflows for the exact changed paths, plus four mandatory Player contracts. Manual-only production/staging gates and branch-close hygiene are excluded; no guarded jobs are enabled. Initial source-only Player scope failure is expected before the actual-number authority; final-head qualification remains required.
