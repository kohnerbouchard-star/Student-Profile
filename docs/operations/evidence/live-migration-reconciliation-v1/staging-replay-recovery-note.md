# Isolated staging replay parser recovery

- Target: `ECON SIM STAGING` (`eecvbssdvarfcykcfrny`)
- Production modified: no
- Initial linked replay head: `20260713193000` (46 migrations)
- Supabase CLI 2.81.3 rejected `20260713194500_issue_contract_rewards_atomic_v1.sql` with SQLSTATE `42601` because the function definition and trailing privilege statements were grouped into one prepared statement.
- Direct `psql` execution over the linked session-pooler URL completed the migration atomically.
- Before repairing history, the table, function, RLS state, and function grants were verified:
  - `contract_reward_issuances` exists;
  - `issue_contract_rewards_atomic_v1(...)` exists;
  - `service_role` has execute;
  - `anon` and `authenticated` do not have execute;
  - RLS is enabled.
- Migration history was then repaired from the `backend` project directory.
- Verified checkpoint after recovery: 47 migrations, head `20260713194500`.
- Remaining migrations are applied in repository order through `psql --single-transaction`; each version is recorded only after SQL success and exact version/name verification.
