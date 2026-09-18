# Phase 14C — Fixed-price primary IPO issuance

Roadmap item: `BUSINESS-V2-14C`, within `BETA-BUSINESS-V2-001`.
Status: `IN_PROGRESS`, draft PR #686. This document establishes the existing authorized successor owner; it is not an implementation certificate.

Owner: `feat/business-ipo-issuance-v2`, based on exact green Phase 14B handoff `bab8393cd8f0d30a84be5ad36ad90f41f9cae75f`. Its 28 workflows passed, with 53 successful jobs and three expected manual staging/parity skips. The predecessor implementation certificate remains `197caa4034214e21b8033a3f4363dc07a13b5dcf` on draft PR #685. Vercel passed. The connected workflow and both 30/40-player loads also passed on the handoff.

The owner authorized implementation and verification through Phase 14D. This bounded draft owns primary issuance. It does not authorize merging Phase 14, deployment, live SQL/data changes, schedulers, or secrets. `BETA-LIVE-MIGRATION-PARITY-001` remains a separate runtime/release blocker.

## Contract

- Only an active operational corporation with reconciled closed-period statements, positive equity, actual committed Store sales, a supported national currency and authorized share capacity may propose an IPO.
- Fixed price and whole-share quantity are immutable governance terms. The proposal freezes the voting snapshot; approval is required before subscriptions. Rejected/expired terms cannot issue shares.
- Each subscription atomically debits canonical Player Checking, credits canonical Business Checking, updates canonical common-share positions and capitalization, and records immutable evidence. Retries return the original receipt. Allocation locks prevent oversubscription.
- Shares issue on each paid subscription. The successor Market integration lists the issuer after full allocation. Existing operating owners retain explicit operating/treasury mandates; passive investments confer shares/votes without operating access. Passive investments do not consume a Player's operating-Business slot.
- Player scope comes from the authenticated session. Browser contracts contain public keys and exact decimal strings only. Both Player roots share the same routes, capability manifest and sensitive-write rate limits.
- Business Finance supports proposal and voting review; Market supports primary subscription review. Current reads are required for writes. Committed success survives a follow-up read failure; uncertain writes reuse their idempotency key.
- No new Inventory, Banking balance or Market price authority is introduced. New game-scoped evidence joins canonical child-first purge with observed replay fingerprints and isolation tests.

## Required evidence before handoff

Two fresh migration replays and advisors; canonical formation → Store sale → reconciled close → proposal → vote → subscriptions; concurrent final-allocation race; exact money/share conservation; immutable terms/evidence; ownership/treasury separation; denied roles and foreign/inactive scopes; authenticated route and privacy tests; desktop/mobile forms, keyboard review, stale/unavailable states, uncertain retries and committed-success refresh failure; retained repository, application, security, connected and load gates on the exact published commit.

## Next dependency

After this source and handoff are certified, `BUSINESS-V2-14D` consumes versioned Business events through a Market-owned integration, publishes the listing, reuses canonical Market orders/funding and derives common holdings from Business share authority. No secondary trade may mint shares.

## Candidate verification and corrections

Initial candidate `8ba46d6e94fc77d5787a0f7a8639463630a7cd88` passed IPO source and all IPO/retained workspace desktop/mobile browser checks on run `35324179840`. The fresh database rebuilt through all migrations; the test stopped on an invalid paused-game fixture. Retained Edge checks identified an overly broad mixed-facade route type, and retained ownership source assertions required reconciliation to the canonical resolver. These are corrected with explicit retained delegation and a test proving ambiguous authority cannot fall back to investment ownership.

Fresh database job `105533302010` observed registry `ab44a67a1247fd706636c3aeb627f352344ca08bde6b6c7159f686a873612a48` / 206 tables; FK graph `343f1966b3750e7a639fb82059bab1049edd44591e27d59cd08017c19be46198` / 455 edges; delete order `f2fe1c6ad5d11bf7c73e1bd761153e6e6cfa726d9b26f780b62e42eb603667b6` / 205 tables; final cursor 206. CLI-generated forward migration `20260918083200_business_primary_ipo_purge_convergence_v1.sql` advances only those fingerprint/cursor constants in the canonical writers. Source comparison preserves every request, entitlement, environment, token and physical zero-row guard. A populated IPO purge test and first-subscription held-funds rollback test are added. Certification still requires the corrected candidate's complete exact-commit matrix.
