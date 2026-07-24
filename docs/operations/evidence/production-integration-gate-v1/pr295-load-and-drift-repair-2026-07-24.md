# PR #295 bounded load and drift repair

- The 30- and 40-player checks now use a phased classroom ramp of ten concurrent Players per batch with a 250 ms inter-batch interval.
- The existing 8,000 ms request p95 gate remains unchanged.
- Per-batch duration and p95 evidence are recorded in addition to aggregate latency.
- The connected staging capture remains preserved; current repository migration identity is re-derived against that capture.
- Applied staging migration history is not rewritten, deleted, or relabeled.
- Production remains unmodified and final release operations remain unauthorized.
