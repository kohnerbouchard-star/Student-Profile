# Admin UI V2 Loans Evidence

This directory records the corrected and fully reconciled UI-only Loans Admin V2 migration.

- Branch: `refactor/admin-ui-v2-loans-v1`
- Reconciled base: `cfe51cb1b22077a4b1341bde9d6aa790d16a0d7b`
- Permission: `economy.adjust`
- Route ownership: source-owned Admin V2
- Runtime state: `not_configured`
- Network behavior: zero Loans requests
- Banking: separate and already merged
- Backend/Supabase changes in PR #516: none

Current `main` still lacks an authoritative browser-safe GET contract for outstanding loans plus repayment history. Existing loan product/application reads remain partial and are not used as a substitute.

See `contract-audit.md` for the narrow authoritative-contract recheck and `verification.md` for the exact convergence gates.
