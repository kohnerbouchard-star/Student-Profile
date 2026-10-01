# Scoped intake — BETA-REFACTOR-EXECUTION-001

**State:** IN_PROGRESS — ticket-by-ticket execution, not whole-program completion.
**Owner acknowledgement date:** 2026-09-22.
**Audited application baseline:** `196b88e6dec9fc951ae0e690fe96057d67bf7bf5`.

## Direct owner acknowledgement

After the proposed bounded REF-001 closeout was explained, the product owner instructed: “Ok then let’s do it and continue the tasks.” This authorizes accepting the accurately documented baseline, clarifying REF documentation ownership, reviewing and normally merging the plan/evidence, and continuing the task sequence with a stop and report after each task. It is not a blanket merge or deployment instruction for other open work.

The REF execution owner maintains this package, its task-status metadata and its bounded evidence. For documentation-only REF-001, this scoped intake is the approved acknowledgement and companion roadmap entry. It supersedes the earlier requirement to wait for a separate #668/global-ledger acknowledgement before accepting the baseline. It does not claim that #668 replied, transfer its context implementation, overwrite its other ledger entries, or declare the overall beta/release program complete. The global completion ledger remains authoritative for the wider program and is deliberately unchanged by this bounded closeout.

## Acceptance boundary

REF-001 records exact source identities, known results, missing evidence, incidents and protected ownership. It does not require all production incidents to be repaired. Missing local tests, authenticated probes and provider evidence remain NOT_RUN or RE_AUDIT_REQUIRED. They continue to block later source changes where their evidence is required, not publication of an honest baseline.

REF-001 receives VERIFIED_COMPLETE only after its documentation evidence is merged and applicable checks pass, with actual implementation/merge identities in `backlog.json` and `tasks/REF-001.md`. No prospective merge SHA or PR prose counts as acceptance. The audited application SHA remains fixed even when documentation merges advance main.

## Protected work and execution scope

Preserve #668 context; #624 Player CSS; #690 Living World/DELIGHT; #730/#731 Phase 15; #735 release origin; #736 Player-auth repair. These are recorded ownership observations, not permanent locks. Recheck live heads, changed paths and accepted ownership before each relevant task. REF-001 neither chooses between release owners nor merges their branches. A purpose or file collision blocks the affected source change, not unrelated read-only measurement.

The current closeout changes five documentation/data files only: REF-001 baseline JSON and Markdown, this intake, REF-001's task record and the backlog manifest. No application source, historical migration, SQL routine, workflow, release request, environment variable, secret, scheduler or cloud resource is changed. Root AGENTS and all security, atomicity, isolation, privacy, validation and release controls are preserved.

The original publication had 50 PLANNED packages. Current individual status is in the manifest; no other task gains completion credit from REF-001. Next is REF-002, read-only route/import mapping, after REF-001's merge/verification checkpoint. Do not start it in the same run that closes REF-001. Every later code task still requires its own dependencies, bounded scope, characterization and applicable exact-source validation.

## Supplemental intake — REF-UNBLOCK-001 (2026-10-02)

**Status:** PLANNED. **Observed main:** `26820b10f8ad8e74ca3606b6ad48f34c1a8bf02d`.

The owner requested a small roadmap add-on to resolve the remaining blockers and asked to review architectural options before decisions are made. [REF-UNBLOCK-001 — Blocker-resolution addendum](BLOCKER-RESOLUTION-ADDENDUM.md) records that request as one supplemental work item with eight bounded packages, acceptance evidence, owner coordination and four pending decisions. It does not add a 51st primary REF task.

This request authorizes publication of the plan/options, not adoption of its recommendations, implementation, a merge of existing runtime/release PRs, cloud changes or production promotion. No architecture or lending/Markets/retirement policy is selected here. The existing modular-monolith baseline remains unchanged. Each package requires fresh ownership and scope acceptance; the decision-dependent packages also require the recorded owner selection.

The historical REF-001 material above is preserved. The 50-task manifest, all original dependencies/statuses, global beta/context ledger and release authorities are unchanged. No downstream task is unblocked by adding this entry. Recommended first repair scopes are the release-rehearsal prerequisite for REF-032 and the Admin browser baseline for REF-043; original acceptance remains mandatory.
