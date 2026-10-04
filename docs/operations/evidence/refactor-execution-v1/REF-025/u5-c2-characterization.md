# REF025c2-0 — existing-behaviour characterization

Parent-approved test-only scope; base e3e603edf138d286579c19c98d7df48a19ee72b3.
Original three-path/200-line scope, amended by parent solely for PR-bound authority:
exactly four paths /240 semantic changed lines, including this evidence:
- `scripts/banking-fx-database-acceptance.sql`
- `scripts/business-banking-runtime-contract.mjs`
- `docs/operations/evidence/refactor-execution-v1/REF-025/u5-c2-characterization.md`
- `docs/operations/contracts/player-cross-cutting/pr-854.json`

Business-banking owns these tests; Business/Banking retain runtime authority.
Fresh open owners #668/#736/#849 share inventory; #624 owns UI; #730/#731/#735
own release/control. None of their shared paths is included. No c2 owner collision.
No further path, migration, runtime/ledger/product behaviour or gate change.
The income-policy answer is pending; c2-1 onward remains proposal-only.

Register existing runners: `node scripts/business-banking-runtime-contract.mjs`
and `node scripts/banking-fx-database-acceptance.mjs`. The latter already loads
the approved SQL in Banking/FX and Treasury CI. No package/workflow registration edit.
Scope: existing84-day/query exclusions and formula, both receipt provenance forms,
canonical operating-authority versus retained owner binding, legacy review replay
and known ambiguity, plus the unchanged c1 INSERT/UPDATE gate tests.
Disposable fixtures roll back; source assertions and isolated deployed-query tests
are labelled separately from complete settlement/command qualification.

Implemented coverage: deployed affordability SELECT/formula is extracted unchanged,
with only its ledger relation replaced by temporary boundary rows. This query-unit
test covers inclusive84days, older rows, game/player/currency/account, negative
amounts, existing exclusions, fixed12week normalization and empty-income ratio100.
Hypothetical eligible-player capital/IPO/FX rows expose the old exclusion-list
semantics; this does not claim such credits exist live or approve future income.
Real review calls preserve ambiguous-status failure and terminal replay despite
changed decision/key. A real mandate resolves while retained application binding
rejects the non-owner; subtransaction rollback restores the original c1 fixture.
The deployed receipt trigger rejects missing provenance in both formats on temp
rows. Exact successful-linkage predicates are SOURCE assertions, not a new complete
Store settlement fixture. Existing Store suites retain positive settlement proof.
Existing c1 postgres/service-role INSERT/UPDATE gate assertions remain unchanged.
No copied production routine, ledger trigger bypass, live access or runtime edit.

Source runner/whitespace PASS. Draft PR854 initial head39fc8899 database job
111538201960 PASS (full replay/reset and rollback acceptance). Source job111538202180
FAIL: absent PR854 authority falls back to the incompatible historical PR661 manifest.
Parent accepted pr-854.json only and total4paths/240lines; the required manifest is
now installed. Verifier/test bytes stay unchanged. Final-head qualification pending.
Preserve inherited142 lint findings/17errors; no clean-lint claim.
REF025 BLOCKED; REF027 depends025+026. Both creation gates and nine U1 holds stay.
Parent controls independent review/merge; no live SQL/capture/deployment/settings.
