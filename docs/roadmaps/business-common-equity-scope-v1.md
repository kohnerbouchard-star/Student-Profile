# Phase 14B — Common-equity invariants

Roadmap item: `BUSINESS-V2-14B`, within `BETA-BUSINESS-V2-001`.
Status: `IN_PROGRESS`; no completion or live-runtime claim.

## Ownership and dependency

The owner is `feat/business-common-equity-v2`, stacked on the exact green Phase 14A documentation handoff `bcc53a5f6f4c3dcca1938e385e63239d59cdad7a`. The predecessor's implementation certificate remains `aed8c3f6462d927cec3ebc55602854d48a460a9b` on draft PR #684. This tranche receives its own bounded draft PR. Phase 14C and 14D retain separate successor owners.

The owner authorized completion of all Phase 14 implementation and verification. Merge, deployment, live SQL, scheduler and secret changes remain outside this draft-stack scope. Live migration parity is a separate release blocker.

## Canonical authority and transaction contract

`business_ownership_positions`, `business_ownership_transactions` and `business_corporate_share_structures` remain the only common-equity position, immutable receipt and share-capacity authorities. Both `corporation` and `c_corporation` aliases are covered. No Market holding, balance, Inventory table or parallel cap table is introduced.

At every committed corporate boundary:

- Active positions contain integer common shares, with exactly one voting unit per share.
- Positive aggregate position units equal outstanding shares. Existing constraints preserve `authorized >= issued >= outstanding` and the treasury difference.
- Every receipt records equal share and voting units; self-transfers are invalid.
- Each player's net immutable receipt history equals that player's active units; unexplained issuance, deletion and ownership changes fail closed.
- Business and game identity cannot be moved between scopes. Corporate entity conversion requires a future named authority.

Existing SECURITY DEFINER formation and retained transfer commands can update all canonical rows atomically. Deferred constraints inspect the final transaction state. Mutations serialize on the Business row; the native authorized-capacity constraint rejects the losing concurrent issuance. Raw cap-table DML is removed from `service_role`, while command execution and existing reads remain available. Public/anonymous/authenticated roles gain no mutation or helper-execution privilege.

Canonical game purge retains only its existing request-bound table authorization. The deferred DELETE trigger's `WHEN` predicate is evaluated while that token is live; no client flag, broad bypass or disabled trigger is added. No tables or foreign keys are added, so the predecessor's purge registry/FK/order fingerprints remain unchanged.

The existing public ownership assertion preserves all noncorporate rules and adds the common-share assertion before its legacy-model early return. The migration audits existing corporate state without inventing historical receipts or silently repairing ownership.

## Verification

Permanent source and disposable-database jobs verify the exact PR head. The database starts from zero twice and runs advisors. Acceptance exercises real C-corporation proposal, approval, activation and replay; invalid votes, ownership kind, share totals, capacity, missing structure, identity change and unmatched receipts; role denial; receipt immutability; atomic fixture transfer; a two-session race for the last authorized shares; and another game's unchanged economic state. The fixture-only transfer/issuance probes do not reopen the retired valuation-dependent transfer command or introduce an economic API.

Retained reporting, Admin, Banking/FX, Store settlement/purge, connected Player and classroom-load gates remain required. Seven existing PR branch filters explicitly admit this stack's predecessor branches so required checks cannot disappear merely because a PR is stacked. Existing action pins and all manual deployment conditions remain intact.

Exact implementation SHA, run/job identities, results and evidence limits will be recorded after publication and verification; until then this item stays `IN_PROGRESS`.

## Rollout and correction

The forward migration is created with the pinned Supabase CLI and replayed only in disposable CI. Existing incompatible corporate data causes a transactional migration failure; investigate and use a reviewed forward correction instead of synthesizing receipt history. No live application is performed here. A future authorized release must satisfy migration parity, restore/staging and immutable-artifact gates. Corrections use another forward migration; do not rewrite this migration after application.

## Next item

After this exact source and handoff are green, `BUSINESS-V2-14C` adds fixed-price primary IPO eligibility, approved immutable terms and atomic issuance. Primary investors must not acquire operating or treasury authority merely by owning shares. `14D` then consumes versioned Business events through a Market-owned integration and proves secondary trading through the existing Financial Market/Portfolio.
