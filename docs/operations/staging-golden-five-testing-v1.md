# Econovaria Golden Five staging test environment

## Purpose

The Golden Five environment is the canonical integration-test surface for Econovaria. Localhost remains appropriate for isolated UI work, pure-domain tests, and mocked contracts. Connected authentication, Edge Functions, RLS, seeded game content, and multiplayer behavior are tested against the isolated staging Supabase project.

Production is never a valid target for these commands.

## Staging fixture

- Project reference: `eecvbssdvarfcykcfrny`
- Game: `Econovaria Golden Five`
- Public Game Code: `ECO-GOLDEN-FIVE-584`
- Lifecycle: active
- Provisioning: ready

The fixture contains five reusable players:

| Slot | Player ID | Arrival class |
| --- | --- | --- |
| 1 | `GOLD-ALPHA` | analyst |
| 2 | `GOLD-BRAVO` | builder |
| 3 | `GOLD-CHARLIE` | trader |
| 4 | `GOLD-DELTA` | maker |
| 5 | `GOLD-ECHO` | navigator |

Each player is assigned to a different country and has a completed Arrival grant, funded checking account, progression profile, residency state, and travel state.

Plaintext Player Access Codes are staging credentials. They must be stored only in the GitHub `staging` environment or Codespaces secrets and must never be committed.

## Repository commands

Validate the connected fixture and migration contract:

```bash
npm run staging:golden:verify
```

Run the full hosted acceptance after the same-origin staging gateway is available:

```bash
npm run test:staging
```

Start an interactive Codespaces preview:

```bash
npm run preview:staging:codespace
```

The Codespaces command starts the existing hardened staging gateway on an internal loopback port and exposes a separate private forwarded port. Only the Supabase publishable key enters the preview process. Service-role and database credentials are not accepted by the preview command.

## GitHub staging environment secrets

The manual `Staging Golden Five Acceptance` workflow requires:

- `PRODUCTION_SUPABASE_PROJECT_REF`
- `STAGING_POOLER_URL`
- `STAGING_SUPABASE_DB_PASSWORD`
- `STAGING_SUPABASE_PUBLISHABLE_KEY`
- `GOLDEN_ALPHA_ACCESS_CODE`
- `GOLDEN_BRAVO_ACCESS_CODE`
- `GOLDEN_CHARLIE_ACCESS_CODE`
- `GOLDEN_DELTA_ACCESS_CODE`
- `GOLDEN_ECHO_ACCESS_CODE`

The workflow fails closed when the production reference equals staging, when a required secret is absent, or when the browser key is not an `sb_publishable_` key.

Codespaces requires these repository or user Codespaces secrets:

- `ECONOVARIA_SUPABASE_PUBLISHABLE_KEY`
- `PRODUCTION_PROJECT_REF`

The forwarded preview port must remain private.

## Acceptance coverage

The connected fixture verifier checks:

- exact staging-project binding and production denial;
- required staging migrations;
- one active, ready golden game with the expected public Game Code;
- canonical content counts for Markets, Contracts, Store, Crafting, World, Arrival, and Story;
- exactly five complete players;
- five distinct country assignments;
- expected Arrival classes;
- completed grants and funded checking accounts;
- sanitized evidence with no raw UUIDs, credentials, JWTs, or Supabase keys.

The browser acceptance runs five isolated Playwright contexts concurrently and checks:

- Player web-session login;
- Dashboard, World, Banking, Store, Contracts, Market, Inventory, and Progression route rendering;
- no failed connected requests during each route;
- no browser-visible Authorization header;
- no raw UUIDs in rendered content;
- route and session persistence after refresh;
- clean logout for all five players.

Evidence is written under `/tmp/econovaria-golden-five` and uploaded by GitHub Actions for fourteen days.

## Operating rules

Do not use `Test` or `kohner's game` as automated fixtures. Those games are personal staging data and must remain unchanged.

Do not rotate the Golden Five Game Code outside the fixture contract. Do not place real student data in the golden game. Do not run destructive experiments against the fixture while the hosted acceptance workflow is active.

The browser journey is intentionally non-destructive in version 1. Economic mutations, Admin operations, and deterministic snapshot restoration should be added only with exact cleanup and post-cleanup zero-residue verification.
