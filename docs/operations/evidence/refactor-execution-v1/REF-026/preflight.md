# REF-026 Store purchase-handler verification

Status: VERIFIED_COMPLETE (verification-only). Verified main:
`488bc9051dfa0e053f7c4314921617f399763d6d`. REF-023/024 are complete.
No active Store owner overlaps this task; REF-029 owns separate Contract reads.

## Scope and current-source reconciliation

Only this evidence record, `docs/roadmaps/refactor-execution-v1/tasks/REF-026.md`
and REF-026's entry in `docs/roadmaps/refactor-execution-v1/backlog.json` change.
Three meaningful docs, below the twelve-file budget. No runtime, SQL, workflow,
package, generated inventory, policy, credential or production changes.

REF-026 step 2 explicitly permits documenting an unreachable flagged handler
without creating a new service. A repository scan of source, scripts, manifests,
HTML/build inputs and non-document configuration finds the old handler path and
its three exports only in `store/api/playerStorePurchaseHttpHandler.ts` itself:
`handlePlayerStoreQuoteRequest`, `handlePlayerStorePurchaseRequest`, and
`handlePlayerStorePurchaseHistoryRequest`. Store's public index does not export
that file. Both actual roots (`player-api/runtime.ts` and `classroom-api/index.ts`)
parse Store routes through `readPlayerStorePublicRoutePath`, then dispatch to
`handlePlayerStorePublicRequest` through the existing reviewed rate limiter.

The canonical public handler has zero raw `.from`/`.rpc` calls. It resolves the
active Player session and server-owned request context, validates public intent,
and delegates to existing repositories. System/seeded offers invoke
`create_system_store_offer_funding_quote_v2` and
`settle_system_store_offer_funding_v2`; Business offers retain
`create_business_store_offer_funding_quote_v1` and
`settle_business_store_offer_funding_v2`. Public receipt translation remains in
Store's existing repository/projector path. No independent debit/grant/credit
sequence is introduced.

The old quote handler's single raw Store lookup remains physically present.
Reachable-handler persistence is zero before/after; the retained file's one raw
lookup and three unreferenced exports are unchanged, not claimed removed.
This is repository reachability evidence, not proof about unknown historical
hosted consumers or a production quiet window. The file is retained for separately
gated retirement. There is no reason to extract a new service for it.

## Exact current-main focused validation

On `488bc9051dfa0e053f7c4314921617f399763d6d`, all required local focused commands
passed: backend `test:player-store-public` 39, `test:player-inventory` 50,
`test:economic-ledger-invariants` 25; Player `store-flow`, `store-connected`,
`store-negative`, `business-workspace`, and `business-workspace-boundary`.
These Player commands are local contract tests, not connected runtime credit.
JSON/dependency/link/scope and diff checks pass for the documentation candidate.

## Reused identical-code R3 evidence, not a fresh candidate runtime run

Accepted source `e6ea82d7f92a29abcaeee99b3a2df27e4d7798e5` merged as
`83485695cf2ff3205ddd147b2f76420a6ca98558`. Both that source and verified main
`488bc9051dfa0e053f7c4314921617f399763d6d` have identical complete trees:

- Backend (including all migrations/configuration): `ed33c44baf4da859d3dd26dee5fcd678b7c9a2ef`
- Player Terminal: `59d33aab284d8ca58a42344cd43a8507602be3ae`
- Store/FX workflow blob: `1e3afb4ff146c02d2708b4b8e0aa2b9b77abdfa2`

The full repository diff since `83485695` contains only REF-024's new qualification
script/workflow additions and REF-024/028 documentation. All existing Store/FX
serial/race/support scripts, root configuration and package/lockfiles are identical.
No result below is relabeled as a fresh execution at the REF-026 candidate SHA.
The verification-only disposition reuses accepted evidence for identical code;
fresh candidate checks cover documentation and repository policy only.

[Store/FX run 36825498881](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36825498881)
passed source/database/connected/browser jobs
`110250158447/110250158622/110250158575/110250158751` at the accepted source.
Database logs were inspected: actual funded serial settlement, ordered allocations,
replay/conflict, rollback and two-game isolation pass. Observed PostgreSQL races
cover quote/settlement replay, reversed allocation order, purchase/withdrawal in
both orders, and the retained same-offer oversell, buyer-funds and holding races.
These are real command executions, not merely SQL-text assertions.

Downloaded archives and independently verified SHA256:
- [Connected artifact 11144957561](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36825498881/artifacts/11144957561): `9b2c7098bcd000bbe6328823e5eb6876b5a8f98a7b203e7061aa328f52eaf8db`
- [Browser artifact 11145087529](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36825498881/artifacts/11145087529): `65fc0329019a5cb72bc2109204954c6b3382db32447b1de7c497bd8bb9a78c2d`

Connected JSON identifies accepted source prefix `e6ea82d7f92a`, outcome passed,
disposable local runtime, system and Business purchases, exact replay receipt,
post-commit refresh recovery, two-browser cross-currency purchases and two-game
isolation. Privacy/error checks pass. This certifies neither hosted production
nor an otherwise clean database; existing lint findings are not waived.

REF-026 requires no code extraction. Its implementation/merge identities in the
backlog identify the already-merged main verified here, not an invented runtime
change for this docs PR. Other 49 task records remain unchanged. REF-025 stays
blocked, therefore dependent REF-027 stays ineligible; REF-029 is independently
owned and in progress. No successor implementation is included in this closeout.
