# REF-001 baseline and owner-gate record

Status: **BLOCKED — baseline captured; task not VERIFIED_COMPLETE.**

Collected on 2026-09-22 at 04:41:09 UTC. This record executes REF-001 only. REF-002 and all later tasks remain unstarted. The machine-readable companion is [baseline.json](baseline.json).

## Exact source and publication boundary

Observed main: `196b88e6dec9fc951ae0e690fe96057d67bf7bf5`.
Main tree: `ac2fd0125af42c9015f9eae325dccc1eff6cabc3`.
The live `release/production` Git ref points to the same commit. This is Git-ref evidence, not a fresh authenticated runtime certificate.

The task definition is pinned to planning commit `59daa14a62531726936e26261918cff1aa5a1066`, on [planning PR #737](https://github.com/kohnerbouchard-star/Student-Profile/pull/737). That PR remains draft and unmerged. This execution uses a separate `refactor/ref-001-baseline-owner-gates` evidence branch based on observed main; the planning branch is used only for task-status metadata.

The user's instruction to execute tasks one at a time authorizes this bounded baseline capture, not merging, deployment, credential changes or takeover of other PRs. Exactly two evidence files are proposed. No application code, migration, workflow, release request or cloud setting is changed. Global beta/controller ledgers are preserved. No assertion of a clean application worktree is made: the local clone failed, and the owner's Mac is not accessible.

## Active ownership and concrete collisions

| Owner | Exact observed head | Finding and next action |
| --- | --- | --- |
| [#668](https://github.com/kohnerbouchard-star/Student-Profile/pull/668), ARCH-100F/context and claimed global ledger | `faaf908bdd5131b451c7e87e91ed4991ad8f839d` | Open draft; not mergeable; 32 changed files. Existing controller must acknowledge REF intake and reconcile main/conflicts. Do not recreate Staff/Admin context work. |
| [#730](https://github.com/kohnerbouchard-star/Student-Profile/pull/730), Phase 15 control work | `8856648da15b821f591c09bf08a805d405dc5a96` | Open draft; three changed files, all temporary workflow helpers. Its description is not proof that certification repairs are implemented. |
| [#731](https://github.com/kohnerbouchard-star/Student-Profile/pull/731), Phase 15 certification repair | `38d1124a13d22aaa2b30e8579ee8bfd9c7775dea` | Open; 35 changed files. Contains broader acceptance, recovery, runtime-probe and release changes. Reconcile ownership with #730 rather than silently superseding either. |
| [#735](https://github.com/kohnerbouchard-star/Student-Profile/pull/735), production-origin/release work | `8867919947f48ef014365dcddda13a0efcf12d76` | Open draft; 14 changed files. A release-request merge can trigger deployment. Preserve its separate auth/release sequencing. |
| [#736](https://github.com/kohnerbouchard-star/Student-Profile/pull/736), Player service-role binding | `8070f58d4145951d8aee3e74a2b1e00d90c54385` | Open; five changed files. Key-class root cause is not established. Requires its own exact-head and authenticated runtime acceptance. |

Changed-file reads identify two concrete shared paths: #668/#735 both touch `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`; #668/#736 both touch `docs/architecture/inventories/econovaria-architecture-inventory-v2.json`. #730/#731 have no same-file intersection in their current diffs, but overlap in claimed Phase 15 control purpose. A zero file intersection does not resolve release authority.

#730 currently changes only `phase15-control-review-source.yml`, `phase15-exact-load-dispatch.yml` and `phase15-prepare-certification-tree.yml`, under `.github/workflows/`. Do not import these temporary helpers into REF work.

Open search also identifies #624 (Player CSS), #620 (Actions dependencies) and #690 (Living World/DELIGHT). Their detailed heads were not freshly collected here; they remain protected collision candidates, not accepted implementations. No active REF-001 branch was found before creating this evidence branch.

## Baseline checks: observed, not invented

[Exact-main Repository Quality, run 35567007648](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35567007648), job `106230743504`, completed successfully. Reviewed step metadata includes successful repository audit/source checks, committed-source credential scan, supply-chain controls and pinned-tool installation. These are existing CI results; the job's raw test log and every individual suite were not independently reviewed or rerun.

[Production verification, run 35567710563](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35567710563), job `106232736158`, succeeded on the same source at 2026-09-21 06:16:12 UTC. Its reviewed log verifies the release ref and canonical `/api/health` environment, project and sourceCommit. It does **not** test an authenticated session. The log reports artifact `10625030819` and SHA-256 `9471845397643788acd2fba3a4f771cd3a3d7d3d2445f838aa9b628ff1583587`; the artifact was not independently downloaded/hash-verified.

The newer run `35687234422`, job `106616567429`, is skipped at 2026-09-22 04:31:56 UTC. It adds no fresh runtime proof. Main's API listings report 20 workflow runs and 49 check runs; this record does not claim an independently classified all-green matrix. PR prose, skipped checks and other SHAs receive no acceptance credit.

The committed architecture snapshot reports 1,236 source files, 29 domains, 55 persistence-location candidates, 168 deep imports, 27 browser shim/observer candidates, 209 compatibility-marker files and 100 oversized files. Snapshot blob: `9bf80e593e95cd2cad2b1cffc278a3af142375cc`. Its embedded historical baseline is `72cefb73a0038aa2bc24261d63e70c113cb7c24c`, distinct from the current source commit serving the file. The snapshot was not locally regenerated. These are candidate counts, not proven dead code or deletion quotas. No debt reduction is claimed.

## Known failures and evidence gaps

Player-login limiter 503: reported by #736, not reproduced in this session. Its exact deployed failure SHA is unknown here. The required closure is an approved fixture demonstrating invalid input reaches the intended 400 response, nonexistent login reaches 401, and valid login/bootstrap/protected reads succeed. Do not make throttling or authentication fail open.

Release-origin failure: #735 reports the obsolete Vercel alias returning DEPLOYMENT_NOT_FOUND. Its current runtime status was not probed here. Canonical-origin release changes stay with #735 and the resolved release controller.

Admin login: main includes the PR #734 binding repair, but no fresh authenticated Admin acceptance was collected. The historical login incident is not labeled resolved from source merge or generic health alone.

The exact path `docs/operations/contracts/phase15-acceptance-evidence-v1.json` returned 404 at observed main. It is in #731's changed-file set. This proves absence of that path at main, not absence of every possible certificate. Current Supabase Edge byte identity, migration-ledger identity and staging source identity remain unknown. No live provider settings, SQL, authentication attempts or student data were accessed.

## Local verification limits

Application clone failed with exit 128: `Could not resolve host: github.com`. Available tools are Git 2.47.3, Node 22.16.0 and npm 10.9.2; Deno and Docker are absent. The repository requires Node >=22.22.2 <23 and npm >=10.9.7 <11. No substitute versions or weakened checks were used.

Architecture/legacy audits, secret-scan command, root tests, backend typechecks/smoke, focused auth/Contract suites and authenticated runtime probes are NOT_RUN locally. Existing CI observations above are a separate evidence class. Documentation JSON, local-link/scope consistency and `git diff --check` are validated in a documents-only staging repository, not an application checkout; publication-specific results belong in the evidence PR.

## Remaining gates and stopping point

REF001-CONTROLLER: existing controller associated with #668 must record the scoped REF intake or explicitly reassign ownership. This record and a coordination comment do not substitute for a merged global-ledger acknowledgement.

REF001-RELEASE-OWNERSHIP: #730/#731 and the Phase 15 controller must resolve retained deliverables and the certification path. REF001-RUNTIME: #736/#735 and that controller must establish the fresh authenticated baseline before affected source refactors. REF001-LOCAL-TOOLS: execute required baseline suites in a pinned, authorized checkout. REF001-PUBLICATION: normal review/checks and merge evidence remain outstanding.

The next task is REF-002, read-only route/import mapping, after controller acceptance of this checkpoint and normal evidence review. A production incident alone need not block documentation measurement, but does block unverified refactoring of its affected runtime. **Stop here. REF-002 was not started.**

Rollback is limited to reverting these new evidence files and their planning-status update. Never restore revoked credentials, change deployment, rewrite migrations or discard another owner's fixes to make this baseline green.
