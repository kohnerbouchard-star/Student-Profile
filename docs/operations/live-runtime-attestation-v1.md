# Live Runtime Attestation and Vercel Promotion v1

## Status

Design and implementation contract. Production promotion remains blocked until the database, Edge Function, and staged Vercel evidence all pass for the exact same current `main` commit.

## Control objective

A merge to `main` must not automatically move production traffic. Production traffic moves only after:

1. Release Integrity reports `PASS` for live staging/production database parity.
2. Edge Function Inventory reports `PASS` for exact inventory, `verify_jwt`, source digest, and source-commit parity.
3. The exact current `main` commit builds as a staged production deployment with no production-domain alias.
4. `/api/health` reports both Staff and Player session boundaries ready, bound to the production Supabase project, and bound to that exact source commit.
5. The staged deployment has no error logs.
6. A protected production-environment workflow promotes that exact deployment.
7. The promoted production endpoint repeats the exact-source health and error-log checks.

## Git deployment policy

`vercel.json` disables automatic deployment for `main`. Other branches may continue to produce preview deployments. The production workflow uses Vercel CLI with the linked project identifiers supplied through the protected GitHub `production` environment.

Required GitHub production secrets:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

The workflow fails before build when any required secret or exact artifact binding is absent.

## Evidence binding

The production workflow requires:

- exact lowercase 40-character current `main` SHA;
- Release Integrity workflow run ID;
- Edge Function Inventory workflow run ID;
- `release-integrity-live-<sha>` artifact;
- `edge-function-inventory-<sha>` artifact.

The Release Integrity artifact must contain a passing attestation whose `sourceSha` equals the requested SHA. The Edge Function artifact must have `ok: true` and `sourceCommit` equal to the same SHA. Artifacts from another source identity cannot be used.

## Staged production build

The workflow:

1. Pulls the Vercel production environment.
2. Builds with the pinned Node and Vercel CLI versions.
3. Deploys a production-targeted artifact with `--skip-domain` and explicitly stamps `ECONOVARIA_SOURCE_SHA` into the deployment runtime.
4. Verifies `/api/health` on the unaliased deployment and requires an exact source-commit match.
5. Inspects the deployment and rejects current error logs.
6. Promotes the verified deployment.
7. Repeats exact-source health and error-log checks on production.

The workflow never uses an unverified Git-generated production deployment.

## Runtime health contract

`/api/health` is rewritten into the existing Player-session Vercel function so the Hobby deployment remains within its 12-function budget. The underscore-prefixed health helper validates the configured environment, exact Supabase project ref, exact project URL, and available deployment source identity. It then probes:

- `web-session-api/health`
- `player-web-session-api/health`

It returns `ready` only when both boundaries return a bounded successful health payload. It exposes no secret values, tokens, user data, database details, or internal error messages.

The login UI consumes only the same-origin `/api/health` route. It displays checking, ready, degraded, or unavailable state rather than a static connectivity claim.

## CSP policy

Browser network and form destinations are restricted to the exact production and staging Supabase project hosts. Wildcard `*.supabase.co` access is prohibited. Both explicit hosts remain necessary because the same static project configuration supports controlled staging previews as well as production.

## Rollback

Vercel promotion is atomic at the routing layer. If post-promotion health fails, restore the previously verified Vercel deployment rather than rebuilding from another source. Supabase and database changes are controlled by their own candidate/promotion workflows and are not rolled back by Vercel deployment movement.

## Vercel function budget

The repository intentionally stays at no more than 12 deployable Vercel Node functions on the connected Hobby project. Runtime health reuses the existing `player-session-proxy` function; `_runtime-health.js` is a bundled helper rather than a separately discovered Serverless Function. The release contract fails if the deployable API surface grows beyond that budget.
