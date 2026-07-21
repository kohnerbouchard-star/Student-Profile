# PR #249 — Player Marketplace Lifecycle Evidence

## Scope

This evidence applies only to branch `agent/player-marketplace-lifecycle-v1`, PR #249, and capabilities `EXP-MP-001` through `EXP-MP-009`.

The workstream did not modify repository seed definitions, Business internals, Crafting internals, Messaging internals, Progression internals, campaign implementation, the authoritative roadmap, or the controller coordination matrix.

## Implemented lifecycle

The authoritative Marketplace state model covers:

- draft listing;
- active listing;
- Inventory reservation at listing creation;
- bounded purchase reservation;
- atomic settlement;
- seller cancellation and Inventory release;
- listing and purchase-reservation expiration;
- moderation hold, approval, and rejection;
- immutable order, posting, receipt, and audit evidence;
- dispute opening;
- buyer refund;
- seller resolution;
- dispute rejection;
- exact terminal replay and conflicting-terminal-action rejection.

## Economic invariants

Settlement executes atomically as one balanced posting group:

- buyer debit;
- seller credit;
- Marketplace fee credit;
- country/game tax credit;
- Inventory transfer from the seller reservation to the buyer.

Buyer refund executes atomically as a second balanced posting group:

- buyer refund credit;
- seller proceeds reversal;
- Marketplace fee reversal;
- tax reversal;
- Inventory return from buyer to seller.

Both posting groups are required to round to zero at four decimal places before the transaction can commit.

## Public boundary and privacy

Player HTTP routes derive game and Player scope from the authenticated Player session. Browser payloads use only:

- `lst_...` listing identifiers;
- `mpr_...` purchase-reservation identifiers;
- `ord_...` order identifiers;
- `dsp_...` dispute identifiers;
- stable item keys and public Player references.

Internal ownership UUIDs, service-role credentials, game scope, and Player ownership fields are not accepted from browser payloads and are not returned by the Player or Admin Marketplace APIs.

Player responses and errors use `Cache-Control: private, no-store`, `Pragma: no-cache`, and credential-sensitive `Vary` headers.

## Reviewed routes

Player capability-manifest and central rate-limit coverage includes:

- Marketplace read;
- listing creation;
- listing activation;
- listing purchase;
- seller cancellation;
- dispute opening.

Admin Marketplace controls remain behind existing staff ownership and game-lifecycle mutation guards and include:

- lifecycle/audit read;
- policy update;
- moderation hold;
- approval;
- rejection;
- buyer refund;
- seller resolution;
- dispute rejection.

## Automated verification

Final branch verification passed:

- canonical migration validation;
- two-reset database replay and database lint;
- backend TypeScript and Edge Function typechecks;
- Marketplace HTTP privacy and malicious-payload tests;
- Marketplace migration-contract tests;
- concurrent-buyer lifecycle model;
- duplicate settlement replay;
- stale-version and cancellation-race rejection;
- insufficient-funds reservation release;
- expiration behavior;
- Admin Marketplace API tests;
- central rate-limit-dispatch tests;
- full Player Terminal verification;
- Desktop Chrome browser verification;
- Mobile Chrome browser verification;
- Repository Quality;
- Supply Chain Security;
- Beta Security Checks;
- Environment-Neutral Browser Verification;
- Staging Readiness Preflight;
- Admin Bundle Contract Audit;
- Admin Game Lifecycle Controls;
- Required Game Market Timezone;
- Exchange Calendar Runtime;
- Player Runtime Cutover Verify.

## Connected isolated-staging evidence

Project role: isolated staging  
Project reference: `bddqbcmfclugrltrrhav`  
Evidence key: `chat8-pr249-final`  
Production project touched: **no**

The connected staging gate executed the repository Marketplace RPC lifecycle against restored application data and persisted evidence only after all assertions passed:

1. create a draft listing with atomic seller Inventory reservation;
2. activate the listing, including moderation approval when policy required it;
3. reserve a purchase using the authoritative listing version;
4. settle the reservation;
5. replay settlement and receive the original committed order;
6. open a dispute;
7. refund the buyer;
8. replay the exact refund using the original request/version context;
9. reject a conflicting terminal seller resolution;
10. verify balanced settlement postings;
11. verify balanced refund postings;
12. verify final order status `refunded`;
13. verify final dispute status `resolved_buyer`.

The staging evidence table intentionally retains only public Marketplace identifiers and test assertions. No production credentials or ownership UUIDs are recorded in this repository evidence document.

## Merge posture

- existing PR #249 and branch retained;
- branch synchronized with current `main` at final verification;
- zero commits behind;
- PR open, non-draft, and mergeable;
- no unresolved review threads;
- no replacement branch or replacement PR created;
- merge remains the Program Controller’s decision.
