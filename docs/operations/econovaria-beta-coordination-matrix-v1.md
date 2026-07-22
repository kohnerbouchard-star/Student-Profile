# Econovaria Coordination Matrix

Main: `6ced5aa36e60dfbd82620463f4f4bf6f56a349dd`  
Controller: Chat 1  
Production authorized: No

| Order | PR | Head | Ahead / behind | Status | Next gate |
|---:|---:|---|---:|---|---|
| 1 | #163 | merged as `6ced5aa36e60dfbd82620463f4f4bf6f56a349dd` | merged | `BLOCKED` | Source merged; connected Seed acceptance moves to a new isolated target built from final main |
| 2 | #294 | `b96e21fe03ad66858d0d9a208893e8341d00e452` | 63 / 535 | `RE_AUDIT_REQUIRED` | Sync Seed main, remove snapshot, reorder migrations, publish Player/Admin routes, repair CI |
| 3 | #299 | `7de7deb9a0e00fd30edec0cbd70137074e3204df` | 82 / 531 | `RE_AUDIT_REQUIRED` | Sync after World, reconcile shared routes, repair runtime contract, rerun CI |
| 4 | #300 | `2d950a118fc90e9c744dfebf236fb48c072a7f82` | 21 / 535 | `BLOCKED` | Remove transport/materializer files and commit permanent runtime source |
| 5 | #249 | `4d7b9d1b3f8ee540bc1b6e85cfd145857cd8bad7` | 42 / 532 | `RE_AUDIT_REQUIRED` | Sync after Crafting and repair replay, Admin, and Player regressions |
| 6 | #248 | `23440eb4d2d728782e0b2c4c4b9d437325457fe7` | 70 / 529 | `RE_AUDIT_REQUIRED` | Sync after Marketplace, move migrations later, fix review/security/dispatch gates |
| 7 | #261 | `30f5c0a322208ad6f0ffedfd4c7bd417613b2945` | 58 / 531 | `RE_AUDIT_REQUIRED` | Sync after Messaging, remove snapshot, move migrations later, repair Admin/scope gates |
| 8 | convergence | — | — | `BLOCKED` | Begin after all source merges |
| 9 | #295 | `83e4511c830987a7b8ceb9e3111868490c75df65` | 30 / 531 | `BLOCKED` | Remove snapshot/controller overlap and run connected acceptance last |

Shared integration order: `#294 → #299 → #300 → #249 → #248 → #261 → convergence`.

Main contains 76 canonical migration versions after Seed. Historical staging contains 77 and remains evidence only. World must be after Seed and before Business; Business retains `12xxxx`; Crafting precedes Marketplace `14xxxx`; Messaging follows Marketplace; Progression follows Messaging.

All remaining PRs must include current main, use one permanent source head, remove transport/snapshot carriers, preserve shared security and isolation contracts, resolve reviews, become non-draft and mergeable, and pass every applicable exact-head workflow.

Decision: `BLOCKED` / `NO_GO`. Production remains unauthorized.