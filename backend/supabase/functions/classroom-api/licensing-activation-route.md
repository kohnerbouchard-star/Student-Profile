# Licensing Activation Edge Route Contract

## Route

```text
POST /licensing/activate
```

## Status

Contract checkpoint only. This file documents the route before a runtime handler is added.

## Purpose

Activate a staff user's purchase code and create the initial game session through the transaction-safe licensing activation RPC.

## Runtime boundary

The future Supabase Edge wrapper should remain thin. It should translate HTTP/runtime inputs into the existing backend API boundary:

```text
backend/src/domains/licensing/api/activationRouteHandler.ts
```

The Edge wrapper must not duplicate licensing business logic.

## Request auth

Requires a verified Supabase Auth user.

Missing auth must return:

```json
{
  "ok": false,
  "error": {
    "code": "missing_staff_auth_user",
    "message": "A verified Supabase Auth user is required to activate licensing.",
    "retryable": false
  }
}
```

Expected status:

```text
401
```

## Request body

Expected JSON object:

```json
{
  "purchaseCode": "string",
  "gameName": "string",
  "difficultyPreset": "standard",
  "attendanceWindow": {},
  "businessMarketWindow": {},
  "stockMarketWindow": {},
  "newsSchedule": {}
}
```

Required fields:

- `purchaseCode`
- `gameName`

Optional fields:

- `difficultyPreset`
- `attendanceWindow`
- `businessMarketWindow`
- `stockMarketWindow`
- `newsSchedule`

## Success response

Expected status:

```text
200
```

Expected body shape:

```json
{
  "ok": true,
  "activation": {
    "gameSessionId": "uuid",
    "entitlementId": "uuid",
    "purchaseCodeId": "uuid",
    "purchaseCodeStatus": "active",
    "redeemedCount": 1,
    "maxRedemptions": 1,
    "activatedAt": "iso-date-time"
  }
}
```

## Safe error response

Expected body shape:

```json
{
  "ok": false,
  "error": {
    "code": "safe_error_code",
    "message": "Safe user-facing message.",
    "retryable": false
  }
}
```

## Required dependencies

The Edge wrapper must provide:

- `SupabaseAuthUser`
- staff access repository
- licensing activation repository
- Web Crypto runtime
- raw request body as `unknown`
- request metadata

## Security rules

- Do not store plaintext purchase codes.
- Do not send plaintext purchase codes to repository/RPC boundaries.
- Do not expose service-role keys to the frontend.
- Do not bypass the transaction-safe activation RPC.
- Do not duplicate activation logic inside the Edge runtime wrapper.
