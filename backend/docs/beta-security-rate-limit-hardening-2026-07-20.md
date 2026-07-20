# Beta Security and Rate-Limit Hardening

Status: repository implementation complete; connected isolated-staging verification pending.

## Implemented

- Rate-limit key material must be high-entropy base64url text between 43 and 128 characters with at least 20 distinct characters.
- Trusted client-IP metadata must contain exactly one proxy-overwritten IPv4 or IPv6 address. Forwarding chains and line-break injection are rejected.
- The ingress helper strips browser-supplied forwarding aliases before writing the configured trusted header.
- Reviewed action names support the existing multi-segment Player story and inventory operations.
- Classroom login uses broad IP and narrower action-per-IP limits without reading credentials.
- Player attendance uses authenticated Player/game scope and a tight per-identity policy.
- The staff scanner verifies staff identity and game ownership before limiting, then limits before body parsing and mutation.
- Limiter configuration or storage failure returns a private fail-closed response.
- Migration `20260720150000_harden_request_rate_limit_operations_v2.sql` adds bounded cleanup and aggregate-only telemetry functions restricted to `service_role`.

## Repository evidence

Focused tests cover HMAC configuration, privacy-safe dimensions, proxy parsing and overwrite, classroom login dispatch, Player story mappings, attendance/scanner ordering, fail-closed behavior, and migration privileges and output shape.

## Connected completion boundary

Repository tests are not connected acceptance. Isolated staging must still prove atomic concurrent limiter consumption, shared-NAT behavior, scanner bursts, trusted-header overwrite and spoof rejection, limiter-storage outage behavior, bounded cleanup, aggregate telemetry, and retained-evidence privacy. Staff Auth configuration changes remain separately approval-gated.

Production is unchanged.
