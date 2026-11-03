# Story player-context read boundary: bounded extraction

Status: `REGISTRATION_ONLY`. This initial draft registration contains this evidence file only. The independently reviewed source is prepared locally and must be bound to the actual pull request number before publication. Original exact-head CI and Preview have not yet qualified the source.

Base main: `a93643082e931fa75c125240b3ef85b4f6e8dbc3`. This extracts the Story player-context query and its actual Stock callers from open draft PR #888, head `1b350848b00140d1b1069615afc2ea8a0de4b49a`; it does not merge the donor branch or claim another owner's acknowledgement. It contributes to `ARCH-209`, `ARCH-401`, `ARCH-402` and `ARCH-601` without claiming those roadmap items complete.

The proposed source scope is the Story player-context query and test, Stock runner HTTP handler and test, the stock-market-runner Story hook, and the stock-market-orchestrator wiring contract test. Two existing Story test fixtures contain only corrections needed for the actual baseline. The generated architecture inventory is rebuilt from this actual source union. The intended additional paths are this record and an exact PR-bound Player authority manifest; the existing authority verifier and its test will remain read-only locks.

Independent source review accepted tree `62169afe7332107820f1e376da4bdb669f72a25c`, preserving lazy game-scoped reads, error identity, and persistence-before-context-before-effects ordering. Local qualification passed 65 focused tests, 68 Stock calendar tests, the backend TypeScript project check, all 28 Edge root checks, and the architecture ratchet. Its provisional inventory measures 1,289 source files, 151 cross-domain deep imports and five foreign infrastructure imports; this describes the candidate, not current main.

The inventory also appears in open PRs #885, #884, #736 and #668 and was regenerated from current main without assuming acknowledgement from those owners. The donor and other branches remain unchanged. No migration, shared dependency pin, lockfile, security setting, hosted database, release hold, or workflow is changed by this draft.

The retained orchestrator wiring test matches the existing Stock Market Runtime Scheduler Release main-push filter. Merging it would automatically deploy the Stock orchestrator and call the production scheduler-configuration RPC. A fresh, explicit user confirmation of that production consequence is required before merge. CI, Preview, metadata review and that confirmation remain pending; no production action is authorized by this registration.
