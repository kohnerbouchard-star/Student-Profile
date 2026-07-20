# Isolated Staging Security Verification

This runbook is restricted to the synthetic staging project. It does not authorize production access, secret rotation, Auth changes, or destructive testing.

## Authority

Record the immutable release commit, migration head, staging project identity, operator, approver, and evidence directory. Stop if the target is missing, is not synthetic-only, or matches the production guard identity.

## Configuration checks

- Confirm the runtime contains the reviewed rate-limit HMAC secret by name only; never print its value.
- Confirm one trusted client-IP header is selected.
- Confirm ingress overwrites that header and strips all browser-supplied forwarding aliases.
- Confirm Admin and Classroom runtimes use the same reviewed migration and action contracts.

## Database checks

Against isolated staging only:

1. Verify the exact migration is recorded.
2. Run bounded concurrent authenticated and pre-auth limiter calls.
3. Verify all requested dimensions update atomically and denied calls return a consistent limiting dimension and retry interval.
4. Verify cleanup deletes no more than the requested batch size.
5. Verify telemetry contains aggregate policy shape only and no key, IP, actor, game, token, or credential material.
6. Simulate the approved limiter-storage outage and confirm private fail-closed responses.

## HTTP checks

- Shared classroom NAT login succeeds within the reviewed class burst and then limits predictably.
- Credential variations do not alter the pre-auth key dimensions.
- Spoofed forwarding headers are discarded at ingress.
- Player attendance limits per resolved Player/game scope.
- Staff scanner limits after staff and ownership verification and before body parsing or mutation.
- `429` includes `Retry-After`; `503` contains no internal dependency detail.

## Evidence controls

Retain redacted response metadata, aggregate timing, assertion results, screenshots where required, migration identity, release identity, and operator/approver timestamps. Scan JSON, logs, traces, HAR files, screenshots, fixtures, and archives before retention. Credentials, tokens, access codes, raw HMAC keys, raw internal identifiers, request bodies, and sensitive response bodies are prohibited.

Connected completion requires every check to pass on one immutable staging release. Production remains unchanged.
