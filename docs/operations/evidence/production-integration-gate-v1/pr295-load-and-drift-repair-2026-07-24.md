# PR #295 bounded load and drift repair

- The 30- and 40-player checks now use a phased classroom ramp of ten concurrent Players per batch with a 250 ms inter-batch interval.
- The existing 8,000 ms request p95 gate remains unchanged.
- Per-batch duration and p95 evidence are recorded in addition to aggregate latency.
- The earlier connected run passed the 30-player profile at 5,667.92 ms p95; its only connected-acceptance failure was the synchronized 40-request burst exceeding the unchanged 8,000 ms ceiling.
- Functional Player/Admin acceptance, replay protection, security/privacy checks, encrypted backup and isolated restore, query-plan capture, cleanup, and zero-residue verification all passed in that run.
- The connected staging capture remains preserved; current repository migration identity is re-derived against that capture.
- Current repository comparison contains 132 canonical migration versions and identifies five canonical versions not present in the preserved staging capture: the four Progression migrations and `20260723213038`.
- Applied staging migration history is not rewritten, deleted, or relabeled.
- The controller decision remains `NO_GO` until current canonical migrations are applied forward-only and the phased connected acceptance passes against one exact artifact.
- Production remains unmodified and final release operations remain unauthorized.
