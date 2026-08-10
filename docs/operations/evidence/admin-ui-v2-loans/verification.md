# Loans Completion Verification

## Scope

The completion is bounded to the existing Loans/Admin Business Banking authority:

- add a privacy-safe supervisory Loans snapshot to the current Admin Business Banking handler;
- replace the zero-network Loans V2 placeholder with real BFF reads and existing authoritative mutations;
- add focused backend/privacy, V2 contract, and CI coverage;
- update stale Loans architecture/evidence documents.

No migration, schema change, new loan table, new ledger authority, repayment rewrite, Banking redesign, or generic Admin architecture threshold change is included.

## Required invariants

1. `economy.adjust` remains the Loans permission.
2. V2 uses the HttpOnly Admin BFF transport only.
3. Internal player, loan, payment, application, product and business UUIDs never appear in the Loans supervisory response.
4. Currency totals stay currency-scoped and are never cross-summed.
5. Application review, product upsert, restructure and servicing reuse existing authoritative RPCs.
6. Repayment remains a player-owned operation.
7. Failed or stale reads use the standard Admin V2 data-state/error envelope.
8. Exact-head focused Loans CI and accumulated Admin V2 regression must pass before merge.

## Acceptance

The route is considered complete when the exact PR head passes focused Loans CI plus the repository's applicable backend typecheck, Admin Browser E2E, Repository Quality, security, release-integrity and runtime checks, and the merge lands cleanly on current `main`.
