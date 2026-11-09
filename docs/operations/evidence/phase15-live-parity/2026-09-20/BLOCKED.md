# Phase 15A blocked checkpoint — 2026-09-20

Status: **BLOCKED at 15A. Phase 15B–15F have not opened.**
Owner: PR [#689](https://github.com/kohnerbouchard-star/Student-Profile/pull/689), branch `fix/phase15-live-migration-parity-v1`.
Verified source main: `22dc9ce5023eb200a6608d5bb90a9ac30cb36c90`.

## Completed read-only audit work

Phase 14 feature and closure PRs #684–#688 are merged. The final-main workflow results and expected live-release skips are retained. The canonical 435-file manifest has unique versions and identities, valid filenames, stable ordering, and raw-byte SHA-256 hashes. The original 70-file checksum baseline is unchanged; migrations present at the production application's source are also unchanged.

Fresh staging/production ledgers contain 316/294 entries. Those counts are inventories, not parity. Every identity has a conservative preliminary classification. No alias is approved as equivalent. The old July review cannot be reused as a current mapping: all ten old live identities are absent and their canonical identities are now present. The archive metadata and current byte-equal candidates are recorded in `historical-ledger-revalidation.json`; byte equality alone does not close effective-state or data-effect review.

Two fresh zero-to-head replays of all 435 migrations passed at candidate `6219b0605e632f1aec248b11028deb5164d18d03`. Application-schema fingerprints and runtime-catalog fingerprints match across both resets. Database lint passed. This proves a reproducible clean repository state, not a safe live upgrade. Artifact/run identities are in `canonical-replay-certification.json`.

## Confirmed production guard conflict

Both live projects report 224 foreign-key edges and graph digest `8d82b09bae9d4cf0703b7bc388c2e621258e277afc4592d28006e5670d11092a`. Production's `execute_game_data_purge_db_batch_v2` and `finalize_game_data_purge_v1` still require 213 edges and digest `72aa93c5ab2a84f915a3e025879bb71db9b740256e17f295107e1039870eadb0`. Staging expects the actual 224-edge graph.

The production functions would raise `GAME_PURGE_FK_GRAPH_DRIFT` if those guards are reached. This conclusion follows from inspected definitions and read-only metadata digests; destructive purge operations were not invoked. See `purge-guard-conflict.json`. A future repair must retain fail-closed guards and cover the complete target purge registry after Phase 14 convergence. Updating the number alone is not a reviewed convergence package.

## Canonical schema comparison

Comparison includes public, private and economy_private application objects, column dimensions/defaults/identity attributes, constraints/indexes, function signatures and definition hashes, ownership, security/search paths, triggers, RLS and grants. A separate catalog captures extensions, other non-system schemas, views, non-extension routine security, scheduler hashes and trigger state.

| Structural difference from clean canonical replay | Staging | Production |
| --- | ---: | ---: |
| Canonical-only relations | 70 | 74 |
| Live-only relations | 1 | 1 |
| Canonical-only routines | 349 | 366 |
| Live-only routines | 12 | 12 |
| Changed shared routine definitions | 83 | 64 |

The live-only relation is `private.platform_storage_health`. The twelve live-only routine identities include storage-health and retention helpers and game-purge review/confirmation routines. Current scheduled jobs depend on operational behavior absent from the clean target. These objects must be explained and retained, migrated or superseded with evidence before an exact convergence sequence can be approved. Do not drop them or blindly replay every repository-only migration.

The existing staging-versus-production enforcement also fails: eleven unapproved routine differences remain. Nine are candidates for formatting or local-alias equivalence, not proven equivalents. The two purge guard differences are substantive. Three scheduler command hashes still differ after substituting only known project references. No broad allowlist was added.

## Hard-gate disposition

- **15A BLOCKED:** unknown alias effects and live-only objects remain unresolved; production has a confirmed guard conflict; no exact safe staging convergence path is approved.
- **15B NOT OPENED:** no corrective migration or populated-state upgrade certificate. Clean replays are useful evidence but do not satisfy this tranche by themselves.
- **15C–15F NOT OPENED:** no hosted SQL writes, ledger edits, Edge promotions, scheduler changes, controlled economic transactions or production deployment.
- **Runtime/security/recovery NOT CERTIFIED:** advisor findings are captured but not yet individually classified. Healthy HTTP version probes do not substitute for browser, connected, load, conservation, authorization or backup/restore gates.

The PR's original nine source-check failures are retained in `candidate-6219-ci-evidence.json`. They rejected the missing PR-689 authority manifest. The bounded correction adds the existing verifier's exact PR/path binding and negative tests; it does not alter or waive the verifier, checks, load thresholds, retries or production restrictions. Only new-head results can demonstrate that correction.

## Execution constraint and safe resumption

The local execution environment disconnected with `409 environment_offline: Environment is not connected` after the canonical artifact was downloaded and compared. Repeated ordinary connection attempts failed. The downloaded archive and detailed local comparison reports were not committed before disconnection; their verified artifact identity, fingerprints, observed comparison counts and live-only object identities are preserved here. GitHub and read-only Supabase access remain available, but an isolated live-shaped upgrade experiment has not been completed.

Resume with a working isolated database/test environment, fetch the exact PR head, and verify main and both live projects again. Preserve local unpublished evidence if the prior workspace returns. Retrieve the recorded canonical artifact (or reproduce it from its immutable workflow source), regenerate the detailed comparison, finish alias/live-only and scheduler effect reviews, and establish the staging sequence. Only after 15A passes may a minimal forward-only 15B package be constructed and certified. Production remains behind all pre-production gates.

No approval of live mutation is requested at this checkpoint. The owner's conditional authorization remains in force; its prerequisites have not passed.
