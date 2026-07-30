# Vercel production deployment record — 2026-07-30

## Purpose

Trigger the normal Git-integrated Vercel production deployment after the Admin authentication routing hardening merged to `main`.

## Source

- Required application source commit: `2f402ac8fd271a3fce3ae324b2be4410040f88a2`
- Deployment branch: `main`
- Target: Vercel production

## Included repairs

- Signed Admin logout BFF route
- Complete Admin authentication route manifest protection
- Gated signed Admin namespace proxy and wildcard rewrite
- Build-time rejection of missing, placeholder, malformed, or retired critical authentication routes

## Excluded operations

This deployment record does not authorize or perform Supabase database migrations, production game provisioning, legacy-function retirement, or feature activation. Game creation must remain fail-closed until the production schema migration chain is validated and explicitly promoted.

## Required verification

After deployment, verify the deployed Git commit and test Admin password login, MFA enrollment and QR rendering, MFA verification, session bootstrap, Admin API routing, logout, password recovery, and session-expiry behavior.
