# REF-032 / OPS-STAGE-001 runtime catalog attribution

Local source based on main b62f10ffda169fd6f884cc3a254c136fbd6b862d.
Protected run 45744262169 (artifact 15083066361) matched application schema and
authorization after the disposable suffix replay. Its runtime comparator exited
2 with positional schema and cron counts 3 and 1. The clean replay was run
45743387893 (artifact 15081938756). The historical artifact does not contain the
differing identities. The raw pair was removed.

The protected capture includes only the schema definitions of public, private
and economy_private and the selected migration ledger. It excludes cron job
rows. This diagnostic compares the clean replay catalog and **post-disposable**
catalog, so it makes no claim about the active scheduler inventory on staging.

The existing artifact step validates the exact comparator's two recorded input
paths and digests. It reuses that comparator on the same private pair, with
bounded execution and its output held in memory. Missing, inconsistent or
invalid evidence cannot produce labels. Both private inputs are cleaned by the
existing workflow. The output contains fixed labels, directions, confidence and
bounded counts. Object names, owners, commands, role or command hashes, paths and
raw errors stay private.

| Labels | Reviewed identity anchors |
| --- | --- |
| P01–P09 | auth, cron, extensions, graphql, graphql_public, net, realtime, storage, vault, in order. Whole name/owner tuples are checked against both historical supplements. |
| U01, U02 | _realtime and supabase_functions. The historical clean schema proves names only. Owner attribution remains unresolved. |
| S01–S06 | Expired staff signup cleanup, daily macro progression, autonomous timed services, game license expiration, Story reply worker, Story reply log pruning, in order. Exact job name, schedule, active state, database, username and literal command digest must match both historical supplements and the pinned migration source. |

The reviewed profile checks source-file digests. It gives no favorable
classification to unverified ownership, changed scheduler behavior, unknown
identities, restored-only static jobs or drift in other catalog categories.
Even an all-known result leaves parity, apply and release flags false. The
protected rehearsal's application status is distinct from the staging apply
validator, which still requires runtime comparator exit 0. No comparison rule,
migration, restore, capture, credential scope or release authority changes.

## Verification

Pinned Node 22.23.1 and jq exercise the real comparator and the exact protected
projection. Fixtures cover identical 3/1 positional counts with different
identity conclusions, stale input substitution, owner and scheduler drift,
malformed and duplicate records, reordering, and artifact privacy.

A separate reproducible test ran the unchanged catalog exporter on three
socket-free PostgreSQL 17.12 databases with synthetic schemas and an inert
cron.job table. Both comparisons emitted schemas=3, cron=1 and exact exit 2.
One produced seven labels for one provider tuple and six verified static jobs.
The other marked the unknown schema unresolved and did not disclose its name.
The native test does not run pg_cron or recreate the provider database.
The protected Supabase image was unavailable in this environment.

## Next operation for the reviewer

Review the local source and preserve the named staging protections. Obtain a
successful natural Database Replay push run for the resulting reviewed main SHA.
Only with separate operator approval, make one first-attempt protected staging
rehearsal bound to that SHA and replay run. Inspect the sanitized identity labels
and unresolved counts before selecting any parity correction. The old replay
artifact is target evidence for its own SHA. The fresh protected run and actual
mismatch attribution remain pending.
