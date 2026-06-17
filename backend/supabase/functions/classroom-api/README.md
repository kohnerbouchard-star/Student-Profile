# Classroom API

Supabase Edge Function compatibility API router for Eco Novaria / Classroom API traffic.

## Checkpoint status

The Edge/API structure checkpoint is now open.

This folder is no longer only a placeholder, but it is still not a live public runtime route yet. Do not add production request handlers until the route wiring checkpoint is intentionally opened and reviewed.

## Current safe scope

Allowed in this checkpoint:

- document the Edge/API route structure
- define route naming conventions
- define dependency wiring expectations
- define auth/header/body parsing expectations
- prepare non-runtime structure files

Not allowed in this checkpoint:

- no production request handlers
- no service-role key exposure
- no frontend wiring
- no database schema changes
- no RLS policy changes
- no purchase-code redemption outside the transaction-safe RPC
- no direct plaintext purchase-code persistence

## Planned route structure

Future classroom API routes should flow through the backend source handlers first, then be wired into Edge runtime adapters.

Planned licensing activation route:

```text
POST /licensing/activate
```

Expected internal flow:

```text
Supabase Auth user
→ staff identity resolution
→ licensing API boundary handler
→ activation handler composition
→ request parser
→ purchase-code normalization/hash boundary
→ transaction-safe activation RPC
→ safe response mapper
```

Current backend source boundary:

```text
backend/src/domains/licensing/api/activationRouteHandler.ts
```

The Edge runtime wrapper should call this backend boundary instead of duplicating licensing business logic inside the Edge folder.

## Required runtime dependencies

The future Edge runtime wrapper must provide:

- verified `SupabaseAuthUser`
- staff access repository
- licensing activation repository
- Web Crypto runtime
- request body as `unknown`
- request metadata such as request id and route source

## Safety rule

The Edge runtime wrapper must remain thin. It should only translate HTTP/runtime concerns into the existing backend API boundary.
