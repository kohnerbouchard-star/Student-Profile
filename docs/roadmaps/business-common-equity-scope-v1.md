# Phase 14B — Common-equity invariants

Current status (2026-09-19): repository implementation verified and **merged**, PR #685, merge `c2d892cb4e39625c2b5cdd7de65c41149502d203`, exact verified head `5b058a23ac46e696fc9274c9df2409e9a37926d1`. Overall roadmap status is `BLOCKED` only for separate `BETA-LIVE-MIGRATION-PARITY-001` live/release evidence. No deployment or live mutation occurred. Final A–D application main is `017a4732ce52c29b31f8fb3666e4662420b19188`; the [merge record](../operations/evidence/phase14-repository-merge-verification-2026-09-19.json) retains exact checks, corrections, prior failures and post-merge verification. No Phase 14 feature merge remains.

Original implementation history follows. Older draft, unmerged or merge-pending references describe their recorded checkpoints and are superseded by the current integration status above; original source certificates and economic contracts remain intact.

Roadmap item: `BUSINESS-V2-14B`, within `BETA-BUSINESS-V2-001`.
Status: `IMPLEMENTED_NOT_MERGED`, exact certified implementation `197caa4034214e21b8033a3f4363dc07a13b5dcf`. No live-runtime claim.

## Ownership and dependency

The owner is `feat/business-common-equity-v2`, stacked on the exact green Phase 14A documentation handoff `bcc53a5f6f4c3dcca1938e385e63239d59cdad7a`. The predecessor's implementation certificate remains `aed8c3f6462d927cec3ebc55602854d48a460a9b` on draft PR #684. This tranche owns draft PR #685. Phase 14C and 14D retain separate successor owners.

The owner authorized completion of all Phase 14 implementation and verification, then ordered normal repository integration on 2026-09-19. Phase 14A PR #684 is merged as `46cde60e80eb285733f01aa99dcba3c3ec0deedd`; #685 now targets main with the same exact-path/check boundaries. New exact-head checks remain required. Deployment, live SQL, scheduler and secret changes remain unauthorized. Live migration parity is a separate release blocker.

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

Retained reporting, Admin, Banking/FX, Store settlement/purge, connected Player and classroom-load gates remain required. Seven existing PR branch filters explicitly admit this stack's predecessor branches so required checks cannot disappear merely because a PR is stacked. Player Terminal verification also triggers for PR-bound authority manifests, preserving its required security/resilience checks on SQL-only tranches. Existing action pins and all manual deployment conditions remain intact.

Exact implementation `197caa4034214e21b8033a3f4363dc07a13b5dcf` passed all 28 workflows, 53 applicable jobs and Vercel. Three manual staging/parity jobs skipped as expected. Common-equity run `35320024755`: source `105520237288`, database `105520237526`, both passed; database acceptance ran after two fresh replays and advisors passed. Connected run `35320024704`, job `105520237048`, passed every retained journey, 30/40-player load and final enforcement. Full identities are in `phase14b_certification` in the checkpoint.

Earlier candidate `1780f1a741c931596118a577ee72e9a62e54ad6a` failed the Beta commerce-fixture lookup twice. Final acceptance strengthens rendered-creation request/response identity checks and safe lookup diagnostics; it passed without weakening an assertion. The earlier failure's root cause remains unproven, so no product repair is claimed. The two bounded browser-core scripts are verification changes only. Evidence is from disposable CI, not live staging/production.

## Rollout and correction

The forward migration is created with the pinned Supabase CLI and replayed only in disposable CI. Existing incompatible corporate data causes a transactional migration failure; investigate and use a reviewed forward correction instead of synthesizing receipt history. No live application is performed here. A future authorized release must satisfy migration parity, restore/staging and immutable-artifact gates. Corrections use another forward migration; do not rewrite this migration after application.

## Next item

After this exact source and handoff are green, `BUSINESS-V2-14C` adds fixed-price primary IPO eligibility, approved immutable terms and atomic issuance. Primary investors must not acquire operating or treasury authority merely by owning shares. `14D` then consumes versioned Business events through a Market-owned integration and proves secondary trading through the existing Financial Market/Portfolio.
