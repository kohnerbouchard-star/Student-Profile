# REF-016 — Messaging public-import security impact

Status: qualification required; not a production certificate.
Owner: PR #766, `refactor/ref-016-messaging-players-public-boundary`.
Base: `b4f803fb3957ee7ad33bab2c0a8eea53952bb231`.
Scope authority: `docs/operations/evidence/refactor-execution-v1/REF-016/preflight.md`, including its predeclared security-qualification adjustment.

## Change and authority boundaries

Four Messaging modules replace six deep value-import declarations with named imports of three functions already exported by the unchanged Players index: `resolvePlayerRequestScope`, `resolveActivePlayerSession`, and `readPlayerApiRouteSegments`. No new public export, permission, service factory, runtime root, token, endpoint, RPC or database write is introduced. Non-import bodies, dispatcher and Player context/session implementations are unchanged.

The authenticated scope still comes from the existing server-side session resolver. Request bodies cannot introduce game/player ownership. Existing denial order, expired/revoked-session checks, frozen context, limiter, idempotency, public identifiers and private response behavior are preserved. This does not implement a new dispatcher-to-handler context-propagation design.

Both route families retain supported bare, Player and retained Classroom prefixes. Added tests explicitly reject spoofed and Admin namespaces. All prior tests remain registered and unchanged. Existing atomic Messaging RPCs remain the single mutation authority; no dual execution or transaction split is introduced.

## Initialization and dependency review

The existing public index resolves to the same implementations. Static/re-export and literal-dynamic import analysis found no new cycle or unresolved computed import in the five inspected roots. Complete Player and retained Classroom runtime closures remain unchanged at 234 and 305 local modules respectively; Messaging dispatch adds only the existing index, 22 to 23.

A standalone route parser now reaches six rather than two modules through the barrel. The added existing response module reads its browser-origin constant on initialization; it was already in both complete runtime closures. This standalone initialization cost is disclosed, not mislabeled as no effect. No additional external specifier or service client enters either complete runtime root.

## Required qualification

The PR-bound authority requires the unchanged Beta Security Contract as well as native request-scope, Player-security and Messaging suites, full backend typecheck/smoke, Player verification and applicable repository/integration gates. This document is within the existing `docs/security/**` review filter, so the full security workflow runs without altering its conditions or assertions. Missing, failed or pending checks block merge; no older-head result substitutes for final-head acceptance.

Candidate `f2e835716aae0356e9b6beeb5d7766f31ac747a7` passed native 81 request-scope, 59 Player-security and 34 Messaging tests, full backend smoke and all 28 Edge-root typechecks. The inspected diagnostics are artifacts `11090331480` (SHA-256 `c53adc0e1f05f5cae974682b9b4edf777b7a2cbcae65237e02ca864ea7a1d622`) and `11089664362` (`7ee1935330006a5dd035e5947ab74913bf0a5c489ca8a23ec5263a04ada511e1`). These are historical candidate results; the subsequent exact head must qualify independently.

## Release and rollback

No deployment, hosted database operation, secret change or production authorization is included. REF-015 remains BLOCKED; REF-017 is not started. Rollback is a normal revert of the bounded import/test/evidence changes, preserving later security fixes. The temporary inventory-publication helper is absent from the final diff; existing verification workflows remain unchanged.
