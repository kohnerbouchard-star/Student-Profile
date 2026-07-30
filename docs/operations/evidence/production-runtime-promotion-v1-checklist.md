# Production Runtime Promotion V1 Checklist

- [x] Exact production project ref is hard-bound.
- [x] Staging project ref is explicitly denied as a write target.
- [x] Workflow runs only from a merged `main` push.
- [x] Production user, Staff, Player, and game data are preserved.
- [x] Equivalent migration identities are reconciled before replay.
- [x] Missing migrations execute atomically in repository order.
- [x] Canonical Edge Functions deploy from the same merged source.
- [x] Missing readable Game Codes are issued after schema convergence.
- [x] Sanitized before/after evidence is retained.
- [x] Production Seed activation remains separately gated.
