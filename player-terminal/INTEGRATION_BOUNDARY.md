# Player Terminal Integration Boundary

This directory contains the isolated Econovaria player-terminal v7.4 baseline and its frontend-only verification tools.

## Current phase

The package is intentionally **not connected to production Supabase or the deployed Edge Functions**. It is being imported as the visual and interaction baseline for the v7.5 API-readiness hardening release.

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

The first staging slice should be limited to:

1. player session handoff;
2. dashboard read;
3. Store quote and purchase;
4. authoritative inventory refresh.

No additional route should be enabled until its capability, response contract, authorization, idempotency, and refresh behavior are verified.

## Collision policy

Backend work can continue independently because this package uses a new directory and a package-scoped workflow. If another branch modifies a protected path listed above, resolve that work outside this branch rather than pulling backend changes into the player-terminal commit.
