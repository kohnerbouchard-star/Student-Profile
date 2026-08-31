# Business Player Store / FX Final Authority Audit v2

**Roadmap item:** `BUSINESS-V2-10A4D`  
**Audit source:** `51ffd008ed84f6a9acd029c8941b3f9b40733735`  
**Audit date:** 2026-08-31  
**Status:** `RESOLVED_FOR_SCOPE`

## Repository and owner identity

- Owner branch: `feat/business-player-store-fx-final-v2`.
- Draft pull request: #679, based on `feat/business-multicurrency-treasury-v1`.
- Exact parent implementation: `46bfc611834dca4db3084d9dce8197c499d61fcd`.
- Exact clean parent controller: `51ffd008ed84f6a9acd029c8941b3f9b40733735`.
- PR-bound authority: `docs/operations/contracts/player-cross-cutting/pr-679.json`.
- Merge, deployment, scheduler, secret, staging/production SQL, and live-data mutation remain prohibited.

No pre-existing branch or open pull request owned 10A.4D at intake. PR #670 is a frozen predecessor and is not edited, rebased, replaced, or force-pushed.

## Resolved runtime authority

The certified funded Store repository already owns both active commercial settlement families:

- seeded/NPC: `create_seeded_store_funding_quote_v1` and `settle_seeded_store_funding_v1`;
- Business seller: `create_business_store_offer_funding_quote_v1`, `settle_business_store_offer_funding_v1`, and immutable receipt reread.

The live authenticated Store handler nevertheless composes legacy mutation-capable Store repositories. 10A.4D must replace that composition with one `SupabasePlayerStoreFundingPublicRepository` and narrow read-only catalog/history adapters. Both Player Edge roots already delegate through the same handler, so no second runtime authority or Edge-specific mutation implementation is permitted.

## Public contract decisions

- Quote intent accepts one to three ordered unique `bac_...` Player Checking keys.
- Every non-final row contains a positive canonical decimal string in bill currency; the final row contains `targetAmount: null` and is derived by the server.
- Seeded and Business purchases accept only the immutable Store quote key and idempotency key.
- Business offer identity, quantity, price, currency, expected version, custody, seller proceeds, and Store target account remain server-derived or quote-bound.
- Funding quote and receipt projections enumerate complete public evidence and never pass through internal UUIDs, request hashes, account IDs, or private context.
- Exact decimal strings remain strings across SQL, TypeScript, and browser boundaries; converting the inherited C4 precision-formatted evidence through JavaScript `Number` is rejected.

## Read and mutation separation

The seeded catalog/history and Business offer-product catalog remain available through mutation-free adapters. Checkout fails closed when canonical Banking/FX account evidence is unavailable, while catalog reads remain usable. Static evidence must reject any live handler import or construction of the legacy mutation repositories and any reachable `purchase_quoted_store_item` call.

## Lock and replay decisions

- Submitted allocation order determines final-remainder intent; canonical account-key order remains the C0/B2 monetary lock order.
- The handler does not pre-lock accounts.
- Business quote-key-only settlement performs read-only immutable derivation and delegates to the retained funded settlement command, which preserves offer → quote → listing custody → C0/B2 → Buyer Inventory ordering and rechecks drift transactionally.
- Historical all-positive allocation signatures and request hashes remain valid for retained callers and replays.
- Player Store execution keeps Business owner request context unset; buyer money remains Player-owned.

## Proven forward-migration need and collision

The inherited Store funding normalizer requires every allocation amount before authoritative Store pricing. The two active funded quote functions therefore cannot accept a final-null remainder without a forward function-only repair. The Business purchase function also needs a service-only quote-key/idempotency entrypoint that derives immutable offer fields and delegates to the retained atomic command.

`supabase migration new business_player_store_fx_final_v2 --workdir backend` was invoked from the live predecessor as required. At 2026-08-31 03:13 UTC it generated the empty version `20260831031333`, which sorts before C4's reserved `20260831100000`–`20260831103000` migrations. The zero-byte untracked file was removed and is not part of repository history. It was not renamed, preassigned, or populated. Application, browser, and test work may proceed, but SQL implementation must wait for a newly generated version that sorts strictly after the live predecessor.

The permitted migration may redefine or add functions only. It may not add a table, column, direct DML grant, RLS change, alternate funding composer, or purge-registry entry. It must use a fixed `search_path`, explicit execute revokes from `public`, `anon`, and `authenticated`, and service-only grants.

## Player Terminal decisions

The Store modal will filter canonical Checking accounts, preserve ordered allocation intent, display a server-derived final remainder, invalidate quotes on every intent change, and render authoritative fixing, spread, rounding, debit/contribution, target-credit, receipt, and transaction evidence. It will not aggregate a synthetic wallet or optimistic result. `LOCAL WALLET`, `LOCAL AVAILABLE BALANCE`, THD conversion, same-currency-only, and obsolete cross-currency copy are retired.

## Audit conclusion

10A.4D can converge both seeded and Business offers onto the existing funded Store/C0/B1/B2/Inventory authorities without another commercial or monetary path. Source implementation is authorized only within PR #679's exact-path manifest. Phase 11 remains closed until one exact D implementation and later clean controller handoff are green.
