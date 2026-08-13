# Convergence freeze baseline — 2026-08-13

Authoritative repository baseline: `1204ccc59b51bc645de4e6578211f21c8e75fc6f`.

## Completed

- All open pull requests were converged or closed; no open pull requests remain.
- Supabase staging contains the full eight-migration durable licensing stack and all five licensing/Stripe Edge Functions from the authoritative source.
- Staging licensing remains inert: no active Stripe product mappings, no licensing scheduler jobs, and empty payment, issuance, and email queues.
- Supabase production contains the four Story safety-runtime migrations for currency effects, world revision correctness, replay-safe cash effects, and execution leases.
- The live production Story runner invokes the promoted execution-lease and replay-safe effect RPCs.
- Production licensing remains intentionally unpromoted.
- The three Meridian narrative-content migrations remain intentionally unpromoted because the active production game is already beyond their scheduled trigger hours.

## Deliberate holds

Do not activate or promote the following during the change freeze without a separate controlled release:

- production Stripe/licensing migrations, functions, products, or schedulers;
- `20260812103000_seed_meridian_customs_security_intrusion_v1`;
- `20260812111000_seed_meridian_security_center_attack_v1`;
- `20260812114000_seed_meridian_emergency_response_v1`.

## Remaining blockers

### Vercel

The exact baseline commit is eligible for Git deployment, but Vercel rejected it for the account build-rate limit. The connected Vercel API also returned repeated upstream HTTP 502 responses, including a direct deployment attempt. Do not generate a no-op commit merely to probe the limit.

### Edge Function inventory

The canonical shared Edge Function bundles do not currently have a fresh exact-main, cross-environment digest attestation. The protected convergence workflow cannot be safely retriggered unchanged because active operational functions are outside the manifest:

- staging: `stock-tick-archiver`, `game-data-purger`;
- production: `stock-tick-archiver`, `stock-tick-archive-config-check`, `game-data-purger`.

These functions must first be given repository source ownership and an explicit manifest classification, or be intentionally retired through a separately reviewed release. Do not weaken `productionUnexpectedFunctionsAllowed` or bypass the digest ratchet.

### Remote branch cleanup

Residual remote branches include backup, release, staging, and historical feature refs. Delete only branches whose commits are proven fully contained in `main`; preserve unique backup and operational history. No destructive branch cleanup was performed without ancestry proof.

## Exit criteria

1. Vercel successfully deploys an exact authoritative `main` commit and reports a healthy production deployment.
2. Every active operational Edge Function has repository source ownership and an explicit manifest classification.
3. The protected staging-first Edge Function convergence workflow passes, including exact cross-environment canonical digest matching.
4. Only fully merged, fully contained remote branches are deleted.
5. Production licensing and held Meridian content remain disabled unless separately approved and released.
