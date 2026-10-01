# REF-043 — Banking response row selection

Status: IN_PROGRESS; bounded repository refactor, no deployment.
Base: `eed2b365f2314f7b788bd658b419cf05bc42200a`. R2; REF-005 verified complete.
Maps to ARCH-500/501. Current main fetched before editing. Live open-PR audit
found #624 owns Player Banking pagination/CSS, not Admin Banking; #668 owns
Staff context/backend and global ledger, not this adapter. Protected auth,
release, Phase 15, World and dependency owners remain untouched. REF-039b
owns Stocks separately; parent serializes generated inventory and backlog.

## Exact scope

Meaningful files (eight maximum, including parent closeout/authority):
- `admin/v2/src/routes/banking/BankingResponse.js`: one internal row reader
- `admin/v2/src/routes/banking/BankingController.js`: two reader callers only
- `scripts/admin-v2-banking.test.mjs`: characterization in existing imported suite
- this record
- `docs/roadmaps/refactor-execution-v1/tasks/REF-043.md`
- `docs/roadmaps/refactor-execution-v1/backlog.json`: REF-043 only
- exact-PR cross-cutting verification authority, if required

Generated architecture inventory is separately listed. No API client, BFF,
auth, backend, account projection, renderer, mutation/retry, package, workflow,
SQL or deployment change. Stop on baseline failure, API defect, ownership
collision, privacy change, or semantic diff exceeding 400 lines.

## Characterized contract

One duplicated envelope traversal becomes one Banking-owned reader. Candidate
order stays result, value, data, data.data, payload; only records qualify.
Players alone accept a bare array. Within each candidate players precedes
roster, so an earlier roster wins over later players. History accepts only
ledgerEntries. First valid array wins even when empty; no match stays null,
and the unchanged normalizers raise INVALID_RESPONSE. Slice-before-filter
limits remain 2,000 players and 250 history rows. Numeric conversion, currency
identity, Checking/Savings, safe text/UUID redaction, internal request identity,
and frozen outputs stay in the controller. No new response contract is added.

Read callers are the two exported normalizers and their controller lifecycle.
Existing BankingApi keeps GET players/history-audit and POST ledger-adjustments,
economy.adjust, selected game, existing aborts, mutation deduplication,
idempotency headers and authoritative refresh. Transport diagnostics continue
through shared error-envelope normalization unchanged. The API's stricter
data envelope validation is deliberately not replaced by presentation fallback.

## Validation plan

Add tests first, run against unchanged controller, then extract and repeat.
Run focused Banking, Admin unit/browser, Player Banking public and Admin
economic writes; shared architecture/high-priority/legacy/interaction/secrets,
root tests, backend typecheck/smoke and diff checks. Use pinned Node 22.23.1,
npm 10.9.8 and Deno 2.9.3 with existing dependencies. Fixtures are synthetic;
local browser evidence is not staging or live runtime certification.
Rollback is a normal revert of these source/caller/tests, preserving other work.
