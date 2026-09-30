# REF-015 — Admin shim retirement preflight

Status: BLOCKED. The bounded candidate review is finished; the removal task is not complete.
Observed main: `368db59335d9f417c818881d19e3d4d9cd56fb67`; tree `820f50237f3f0441a5494393a360311c3cdddb49`.
Owner branch: `refactor/ref-015-admin-shim-retirement`; PR #765; parent REF-015 / ARCH-700.

## Authority and scope

The owner first requested “Start task15”, then explicitly approved the proposed sequence: finish a bounded candidate review, preserve active or uncertain files, document the removal blocker, and continue to REF-016 after its independent ownership checks. This is not the historical Phase 15 deployment program. REF-012, REF-013 and REF-014 are VERIFIED_COMPLETE.

The PR contains five documentation/data paths: this preflight, the initial `retirement-audit.json`, the authoritative `final-disposition.md`, the REF-015 task, and only the REF-015 backlog entry. Application, tests, workflows, generated bundles, classification rules, inventory ceilings, database, secrets and release settings are protected. The task retains its ten-meaningful-file ceiling and maximum of three proven-unused deletions; three is not a quota.

## Provenance

Local Git clone failed DNS. GitHub artifact `11079350479` was read again and its SHA-256 verified as `34df65ef6e15bf9daf3dfe20d66557fb3140e84ed8405b7cb8caedc0f83bd7e6`. Independently indexing its tracked source reproduces tree `fd6a465b8964b710691dc204b0510e88244b637b`, matching implementation merge `c9d57b9bb1e75009e158f13aea8e1750f560e86d`.

A fresh GitHub comparison of that merge to observed main contains only four REF-014 closeout documentation/data paths. Runtime, build, tests and policy sources inspected locally therefore match observed main byte-for-byte. The current-main backlog was reconstructed and its Git blob verified as `c7d3973ffff400390052a85dcfb992d352e2f0b0` before editing REF-015. No local synthetic commit is represented as a GitHub commit.

## Current disposition and historical evidence

Read `final-disposition.md` for the eight reviewed candidates, positive source consumers, exact source blobs, required reopening gates and fresh supplementary validation. Every candidate remains retained. No replacement feature is created merely to make a filename deletable.

`retirement-audit.json` is the preserved initial start-tranche snapshot from `d0c1b962d6b23e139b5d4bad04214d226de31c8e`; its IN_PROGRESS status and next-action fields are historical. This preflight, the task, backlog and final disposition supersede those fields. Historical test hashes are not reused as fresh-run evidence.

The documentation PR can be reviewed and merged independently of the blocked deletion. A docs merge does not fulfill deletion/browser acceptance or grant production certification. Source request/listener changes are zero; unperformed browser measurements remain unknown. Reopening requires actual candidate-specific consumer/replacement proof, not a filename, test pass or deletion quota.

Rollback is a normal documentation-only revert. There is no runtime change to undo. Do not waive retirement policy, remove negative tests, alter auth/context ownership, merge unrelated PRs, deploy or mutate a database.
