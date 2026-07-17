# Player Terminal Integration Boundary

This directory contains the isolated Econovaria player-terminal v7.4 visual baseline and its production API-adapter foundation.

## Current phase

The package is route-ready for the existing authenticated `classroom-api` player capabilities, but it does not deploy or change production Supabase resources from this branch. The direct transport maps only verified backend contracts and rejects unsupported provisional paths.

## Ownership boundary

Work in this branch may change:

- `player-terminal/**`
- `.github/workflows/player-terminal-verify.yml`

Work in this branch must not change:

- `backend/**`
- `admin/**`
- the existing `frontend/**`
- root `index.html`, `app.js`, or `styles.css`
- Supabase migrations, Edge Functions, RLS policies, or deployed configuration
- production hosting or routing configuration

The existing root player application and admin console remain the production paths until a later, explicitly reviewed cutover.

## Backend connection policy

When integration begins, the terminal must connect through authenticated, server-owned API boundaries such as `classroom-api`. It must not query or mutate economic tables directly from the browser.

The reviewed staging foundation is limited to:

1. player session handoff;
2. dashboard read;
3. Store quote and idempotent purchase;
4. authoritative inventory refresh through `GET /players/me/inventory`;
5. player-safe market directory and bounded history reads;
6. token-scoped ledger balances and history.

No additional direct route should be enabled until its capability, response contract, authorization, idempotency, and refresh behavior are verified. The aggregate dashboard supplies the initial snapshot; dedicated routes supply bounded authoritative refreshes. Unsupported mutations stay disabled rather than borrowing preview behavior.

## Collision policy

Backend work can continue independently because this package uses a new directory and a package-scoped workflow. If another branch modifies a protected path listed above, resolve that work outside this branch rather than pulling backend changes into the player-terminal commit.
