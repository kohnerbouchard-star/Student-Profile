# Dashboard owner read ports: bounded extraction

Status: PR number pending; the reviewed source candidate is prepared locally and is not yet included in this registration commit. This record does not claim completed CI, merge or deployment.

Base main: `2b0fdf1a41acd7372311f91905bae358e01fd3fa`. This is a bounded current-main extraction of the Dashboard read-port work from open draft PR #888, head `1b350848b00140d1b1069615afc2ea8a0de4b49a`. Its donor branch remains unchanged; no other owner's acknowledgement is assumed. The work contributes to the existing `ARCH-401`/`ARCH-402` boundary effort and does not complete those roadmap items.

The intended application scope is exactly the Dashboard handler, its test, contracts and Supabase repository; the Stocks and Contracts public indexes; the Store Dashboard read model and owned query; and the timezone transformation compatibility script. The generated architecture inventory will be rebuilt from this actual source union. The only additional paths will be this evidence record and the exact PR-number-bound Player authority manifest, with the existing verifier and its tests retained as read-only locks.

Local source qualification on the post-#887 base passed 48 Dashboard tests, 67 Stock calendar tests, backend TypeScript project checking, two complete six-helper timezone replays without drift, malformed-wiring rejection controls, and the architecture ratchet. Independent source review found no blocking defect. The provisional generated inventory measures 1,287 source files, 151 cross-domain deep imports and six foreign infrastructure imports; these are candidate measurements, not a main-branch completion claim.

No migration, RPC, shared dependency pin, lockfile, security setting, hosted database, production deployment, or release hold is changed. Automatic Preview and original CI are separate future qualification steps. A PR-number-specific authority record and exact-head review are required before the source is published.
