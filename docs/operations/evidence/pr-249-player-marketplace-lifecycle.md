# PR #249 — Player Marketplace Lifecycle Evidence

## Scope and convergence authority

This evidence applies only to branch `agent/player-marketplace-lifecycle-v1`, PR #249, and capabilities `EXP-MP-001` through `EXP-MP-009`.

Crafting PR #300 merged into `main` as `4f332e4799162ddce31d760c98ce7467d63657e6` from immutable Crafting head `0107c3ceb1eb788d6ea6fd513d27c0ea22d0e7d4`. The existing Marketplace branch performed its single authorized convergence from pre-convergence head `18d3dd7b9b3215528ab03872f5f17d19e5e361e2`.

The converged tree preserves World, Business/Banking, Crafting, Store, Inventory, Story, session, privacy, capability, rate-limit, Admin, Classroom API, and Player Terminal behavior while adding Marketplace-owned registrations only.

The workstream does not own Seed definitions, World, Business/Banking, Crafting internals, Messaging, Progression, story delivery, the authoritative roadmap, or the controller coordination matrix. Production remains unauthorized.

## Implemented lifecycle

The branch contains Marketplace source for:

- draft and active listings;
- Inventory reservation at listing creation;
- bounded purchase reservation;
- atomic purchase settlement;
- seller cancellation and Inventory release;
- listing and purchase-reservation expiration;
- moderation hold, approval, and rejection;
- immutable order, posting, receipt, and audit evidence;
- dispute opening;
- buyer refund;
- seller resolution;
- dispute rejection;
- exact terminal replay and conflicting-terminal-action rejection.

Attachments and arbitrary payload rendering are not part of Marketplace.

## Economic invariants

Settlement is modeled as one atomic balanced posting group:

- buyer debit;
- seller credit;
- Marketplace fee credit;
- country/game tax credit;
- Inventory transfer from the seller reservation to the buyer.

Buyer refund is modeled as a second atomic balanced posting group:

- buyer refund credit;
- seller proceeds reversal;
- Marketplace fee reversal;
- tax reversal;
- Inventory return from buyer to seller.

Both groups must balance at four decimal places before commit. Seller settlement and Inventory transfer are replay-safe and must occur exactly once.

## Public boundary and privacy

Player routes derive game and Player scope from the authenticated Player session. Browser payloads use only:

- `lst_...` listing identifiers;
- `mpr_...` purchase-reservation identifiers;
- `ord_...` order identifiers;
- `dsp_...` dispute identifiers;
- stable item keys and public Player references.

Internal ownership UUIDs, service-role credentials, game scope, and Player ownership fields are not accepted from browser payloads and are not returned by Player or Admin Marketplace APIs.

Player responses use private, no-store caching and credential-sensitive `Vary` behavior.

## Reviewed routes

Player capability and central rate-limit registrations cover:

- Marketplace read;
- listing creation;
- listing activation;
- listing purchase;
- seller cancellation;
- dispute opening.

Admin Marketplace operations remain behind existing staff ownership and game-lifecycle mutation guards and cover:

- lifecycle and audit read;
- policy update;
- moderation hold;
- approval;
- rejection;
- buyer refund;
- seller resolution;
- dispute rejection.

## Branch purification record

Purification was completed in place without creating a replacement branch or PR.

- The effective branch delta is limited to Marketplace-owned files and narrow shared registrations.
- `backend/supabase/functions/classroom-api/index.ts` was reconstructed from the branch merge base and now contains only two Marketplace imports and one additive route block.
- The shared router diff was reduced from 656 deletions to zero deletions.
- `admin/inventory-redemption-queue-loader.js` was restored to Inventory-only ownership.
- Marketplace now loads independently through the existing deterministic Admin deferred-loader chain.
- All one-use purification and fixture workflows removed themselves and are not part of the permanent diff.
- No operational, backup, observability, pilot, incident, release, or environment-neutrality implementation was added.

## Final migration state

The controller-assigned collision-free Marketplace migration family is final and appears exactly once after Crafting:

- `20260721140000_add_marketplace_reference_scopes_v1.sql`;
- `20260721141000_add_player_marketplace_lifecycle_v2.sql`;
- `20260721142000_harden_marketplace_resolution_replay_v1.sql`.

The lifecycle migration installs `pgcrypto` in the standard `extensions` schema and calls `extensions.digest(...)`; no public digest shim is introduced. The Crafting migration family `20260721130000–20260721135700` is preserved unchanged.

## Convergence verification posture

The converged working tree passed the following repository-owned local validation before publication:

- `git diff --check` and zero unresolved merge markers;
- complete Player Terminal `npm run verify`;
- Marketplace connected lifecycle;
- Student-Profile adapter and capability preflight;
- World runtime Player publication;
- backend TypeScript compilation with ES2022, DOM, and DOM iterable libraries;
- Admin shell identity and source contracts;
- Admin loading-scope, v606 drift, Inventory redemption, modal accessibility, Crafting oversight, World console, bundle, and game-lifecycle contracts;
- repository-owned asset reference audit.

The complete GitHub exact-head workflow matrix, two clean database replays, database lint, desktop/mobile browser execution, isolated-staging acceptance, zero-residue cleanup, and production non-modification proof remain required after the converged commit is published. No local result is represented as connected-staging evidence.

## Completed pre-Crafting test expansion

Branch-local tests explicitly cover:

- atomic listing and Inventory reservation;
- concurrent buyers and stale listing versions;
- duplicate purchase and settlement retries;
- seller cancellation and expiration release;
- pause, ended-game, and session-expiry denial;
- fee and tax arithmetic;
- moderation transitions;
- refund and dispute recovery;
- wrong-game denial and UUID privacy;
- invalid transitions and malicious payloads;
- committed-success behavior when authoritative refresh fails;
- desktop and mobile accessibility and overflow.

## Connected staging and production

- Isolated-staging Marketplace acceptance: **not yet executed on the converged final migration range**.
- Production project touched: **no**.
- Production deployment authorized: **no**.

## Remaining exact-head completion gate

Before PR #249 can be marked ready or merged, the published immutable head must satisfy:

1. complete exact-head repository and browser workflow matrix;
2. two zero-state database replays and database lint;
3. focused reservation, lifecycle, replay, concurrency, privacy, pause, ended-game, and expiry validation;
4. isolated-staging Marketplace acceptance;
5. synthetic cleanup with zero residue;
6. production non-modification verification;
7. zero unresolved review threads;
8. final controller return and explicit merge authorization.

## Current merge posture

- existing PR #249 and branch retained;
- single authorized convergence with Crafting-merged `main` completed;
- final Marketplace migration identities preserved;
- shared files reconstructed additively;
- PR remains open, draft, unmerged, and unauthorized for production;
- no replacement branch or PR created;
- exact-head CI and connected-staging acceptance remain the controlling gates.
