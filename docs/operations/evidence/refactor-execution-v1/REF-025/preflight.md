# REF-025 read-boundary preflight — 2026-10-01

## Disposition

**BLOCKED for runtime extraction; no completion credit.** Current main already
places the Loans projection in its repository and canonical Business treasury
behind its public contract and one aggregate RPC. The remaining mixed Loans
ownership cannot safely be replaced with Business operating authority as a
behavior-preserving refactor. Honor the task's explicit ambiguous-loan-ownership
stop rule. This is a bounded documentation record, not a new lending
policy or certification of the whole task.

- Exact fetched main and audited source: `207eb2cd4e72e4cee7a95b147a3a0eeb37b00ed9`
- Task: REF-025, R2; inherited ARCH-205/ARCH-207
- Dependency REF-021 is `VERIFIED_COMPLETE` in the current backlog, merge
  `124ff72e587830ac98f59efd16a18f8ec1b50749`
- Live open-PR census: #779, #736, #735, #731, #730, #690, #668, #624, #620;
  no existing REF-025 implementation owner
- Isolated branch: `refactor/ref-025-business-read-boundary`; no shared-checkout edits
- Exact editable paths: this preflight document, `tasks/REF-025.md`, and only
  the REF-025 entry in `backlog.json`. Allowed change: source characterization
  and honest blocker/evidence/status recording
- Protected: all runtime source, tests, package manifests, SQL/migrations,
  workflows, generated inventory, every other backlog entry/global authority,
  UI and credentials
- PR, implementation SHA and runtime rollout: none

## Reachability and existing boundaries

The canonical `player-api/runtime.ts` and retained `classroom-api/index.ts` both
try `_shared/playerBusinessDispatch.ts` before the mixed Business/Banking parser.
Canonical Business requests therefore use `domains/business/index.ts`, the
reviewed/rate-limited Player dispatcher, and its approved
`PlayerRequestApplicationContext`. The Business handler consumes the context
rather than resolving identity again. The mixed facade delegates retained
Business routes to that same Business handler; it is not a second treasury owner.

For `GET /players/me/business/treasury`,
`playerBusinessTreasuryHttpDispatch.ts` calls
`BusinessTreasuryRepositoryV1.readSnapshot`; `SupabaseBusinessTreasuryRepository`
performs exactly one `get_business_treasury_overview_v1` RPC and passes its result
to `businessTreasuryProjection.ts`. No direct database projection is present in
the HTTP adapter. Current source already meets the selected treasury boundary;
adding a second port or moving its repository would manufacture debt.

For `GET /players/me/banking/loans`, `playerBusinessBankingHttpHandler.ts` validates
the envelope/method/body, reads runtime configuration, resolves server scope,
constructs `SupabasePlayerBusinessBankingRepository`, and invokes `readLoans`.
The read returns the DTO directly with private/no-store headers. Its persistence
and projection already reside together in the repository, not the HTTP handler.
The repository performs one economic-context RPC followed by five parallel
queries, with no per-business/account N+1 calls. No extraction candidate was
found outside that repository. POST loan application and repayment remain
separate retained routes and unchanged atomic SQL commands.

## Field authorities and unresolved semantics

Loans uses `resolve_player_economic_context_v1` for local currency. Its five reads:

1. `loan_products`: game and local-currency predicates; minimum amount ascending
2. `player_loans`: game/player predicates; creation descending, no currency predicate
3. `credit_profiles`: game/player predicates, limit one
4. `loan_payments`: game/player predicates, creation descending, limit 500
5. `business_entities`: game and `owner_player_id` predicates; selects id/public key/status

Credit score and on-time rate come from the credit profile; posted payment count
comes from payments; offers and terms come from products. Loan principal,
interest, state, due date and payment amount come from player loans. Business
public keys are joined from the fifth query. Active includes active, delinquent
and restructured states. Existing numeric conversion/rounding/defaults and
schedule generation remain unchanged. Missing query results and missing values
already use default arrays/numbers; database errors remain mapped errors, not a
new unavailable-success response.

Business-purpose offer eligibility currently means an active/restructuring
`business_entities.owner_player_id` match. By contrast, the latest
`resolve_player_business_v2` in
`20260918080340_business_primary_ipo_operator_authority_v1.sql` uses
`private.business_controller_matches_request_v1`, including management mandates
and prior ownership rules. It rejects zero businesses with `BUSINESS_NOT_FOUND`
and multiple controllable businesses with `BUSINESS_OWNERSHIP_AMBIGUOUS`.
Treasury's latest public overview wrapper in
`20260917214421_admin_business_supervision_v2.sql` uses that resolver before the
private Business treasury aggregation. Investment alone does not confer a
management mandate once mandates exist.

The retained loan application/repayment bindings separately require the legacy
owner predicate (see `20260806093000_provision_player_banking_and_credit_v1.sql`
and `20260812113000_bind_loan_repayment_accounts_v1.sql`). Substituting the
Business resolver in the Loans read could change empty/multiple-business
behavior, which businesses qualify for offers, and read/write consistency.
The repository's active-loan total also sums returned balances without a currency
filter or currency-bearing DTO. Products alone are local-currency-filtered.
This is a source-level semantic risk, not evidence that mixed-currency production
loans exist or that an authorized correction has been defined.

## Acceptance versus evidence

- Explicit owner and unchanged queries: already present for treasury and Loans
  persistence; there is no justified persistence move
- Approved Player context and canonical operating authority: present for canonical
  treasury; the retained Loans handler resolves its own server scope and uses
  the different legacy loan borrower predicate
- Exact treasury money/currency projection: existing tests cover 0/3/18 decimal
  precision and preserve long decimal strings
- No business, multiple businesses, shareholder without mandate and wrong game:
  SQL source authority traced; no new real-database qualification in this preflight
- Unavailable lending and mixed loan currencies: no new runtime qualification;
  requirements cannot be certified from treasury tests or a lexical source scan
- Debt before/after: 0/0 moved runtime files; 0/0 newly added ports; selected
  treasury query count 1/1, Loans query shape 1 RPC + 5 reads unchanged
- No behavior-changing fix, account merge, FX algorithm, lending algorithm,
  money/loan state migration, production SQL, security or release action

## Local checks on the unchanged audited source

Pinned Deno 2.9.3 and Node 22.23.1; frozen repository Deno lock. These are local
contracts/fixtures, not connected staging or production evidence.

- PASS, exit 0: from backend, `deno test --config
  supabase/functions/classroom-api/deno.json --lock=supabase/functions/deno.lock
  --frozen src/domains/business-banking/api/playerBusinessBankingRoutePaths.test.ts
  src/domains/business/api/playerBusinessTreasury.test.ts
  src/domains/business/infrastructure/businessTreasuryDatabaseErrors.test.ts
  src/domains/business/infrastructure/supabaseBusinessTreasuryRepository.test.ts`:
  12 passed, 0 failed. Includes exact approved context consumed once and browser
  identity rejected before repository work
- PASS, exit 0: `node player-terminal/tests/banking-read-model.mjs`
- PASS, exit 0: `node player-terminal/tests/banking-fx-surface.mjs`
- PASS, exit 0: `node player-terminal/tests/business-workspace-resources.mjs`
- PASS, exit 0: `node scripts/supply-chain-secret-scan.mjs`,
  `node scripts/architecture/architecture-ratchet-v2.mjs`, and
  `node scripts/high-priority-boundary-ratchet.mjs`
- PASS: JSON/scope/link checks preserve 50 unique IDs and dependencies, resolve
  all task files and the new evidence link, and prove every non-REF-025 backlog
  entry plus top-level metadata is byte-equivalent after JSON parsing
- PASS, exit 0: `git diff --check`
- NOT_RUN: full shared source-refactor matrix, backend aggregate Banking/FX/
  economic suites, full smoke/typecheck, connected/staging/database acceptance.
  Runtime extraction was stopped before implementation; focused results do not
  replace these missing gates

## Smallest next action

Keep REF-025 incomplete. Have the owning roadmap decision distinguish a
verification-only treasury disposition from a separately scoped reconciliation
of personal/business loan borrower authority and currency representation. Do not
silently choose either policy, relocate the lending system, or claim completion
from already-clean treasury alone. The integration owner authorized this three-file blocked-status publication;
REF-023 owns only its separate backlog entry and qualification workflow. REF-028 may be considered independently
only after its own dependencies and owner gates are rechecked.
