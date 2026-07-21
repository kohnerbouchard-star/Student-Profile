# PR #249 — Player Marketplace Lifecycle Evidence

## Scope and dependency gate

This evidence applies only to branch `agent/player-marketplace-lifecycle-v1`, PR #249, and capabilities `EXP-MP-001` through `EXP-MP-009`.

Marketplace integrates only after Crafting PR #300. While Crafting remains unmerged:

- PR #249 remains open and draft;
- no Marketplace migration identity is final;
- the branch is not repeatedly synchronized with changing `main`;
- no staging or production database migration is authorized;
- no Marketplace merge is authorized.

The workstream does not own Seed definitions, World, Business/Banking, Crafting internals, Messaging, Progression, story delivery, the authoritative roadmap, or the controller coordination matrix.

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
- The one-use purification workflow removed itself and is not part of the permanent diff.
- No operational, backup, observability, pilot, incident, release, or environment-neutrality implementation was added.

## Provisional migration state

The current migration filenames are provisional and must be rekeyed once after Crafting merges and the controller assigns a range later than Crafting and earlier than Messaging:

- `20260721140000_add_marketplace_reference_scopes_v1.sql`;
- `20260721141000_add_player_marketplace_lifecycle_v2.sql`;
- `20260721142000_harden_marketplace_resolution_replay_v1.sql`.

The lifecycle migration explicitly installs `pgcrypto` in the standard `extensions` schema and calls `extensions.digest(...)`; this repairs zero-state replay without introducing a public digest shim.

## Current verification posture

At the pre-purification exact head `4d7b9d1b3f8ee540bc1b6e85cfd145857cd8bad7`, these checks passed:

- Backend Typecheck;
- Admin API Check;
- Repository Quality;
- Beta Security Contract;
- Admin Game Lifecycle Controls;
- Required Game Market Timezone;
- Exchange Calendar Runtime;
- Supply Chain Security;
- Environment Neutral Browser;
- Staging Readiness Preflight;
- Admin Bundle Contract Audit.

That head failed:

- Database Replay because the Marketplace fingerprint function used an unqualified `digest(...)` call;
- Player Terminal Chromium coverage;
- Admin Shell Smoke after unrelated attendance-settings feedback validation.

The digest defect and hidden Admin-loader coupling have been corrected on the purified branch. Exact-head workflows must pass again before any post-Crafting integration decision.

## Required pre-Crafting test expansion

Before the dependency gate lifts, branch-local tests must explicitly cover:

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

- Isolated-staging Marketplace acceptance: **not executed on this provisional migration range**.
- Production project touched: **no**.
- Production deployment authorized: **no**.

## Post-Crafting completion gate

After Crafting merges, Chat 8 must:

1. record the exact Crafting merge SHA;
2. synchronize the existing branch once with final `main`;
3. obtain the controller-assigned migration range;
4. rekey the unmerged Marketplace migrations once;
5. reconcile World, Business, Crafting, Store, Inventory, security, capability, route, Admin, package, and test registrations additively;
6. replay from zero twice and lint;
7. run complete exact-head CI and desktop/mobile browser coverage;
8. execute isolated-staging Marketplace acceptance;
9. clear review threads;
10. merge PR #249 and publish the exact merge SHA and Messaging handoff.

## Current merge posture

- existing PR #249 and branch retained;
- PR open, draft, and unmerged;
- no unresolved inline review threads;
- no replacement branch or PR created;
- Crafting dependency remains the controlling external gate.
