# Names-only roster provisioning backend

Status: published in draft [PR #938](https://github.com/kohnerbouchard-star/Student-Profile/pull/938), not runtime-qualified. Original base: c616ece3e1cebea79fd33c58f5f04ed961121407; current-main integration: 56c72864429f8a27681e4cc01964a582a41e56fa. Initial published source e0745b21276e84d1ab4f3115b12d0e5f46351d27 has exact reviewed tree c7f0b3c5b504c4eb6ebe4ae114c431aafd0fe1e8; actual-number authority is registered in pr-938.json. Existing draft PR933 owns frontend review; this branch adds its separate atomic backend.

## Contract

Authenticated POST /games/:gameId/players/imports/csv accepts application/json with exactly {studentNames: string[]}. Require 1–200 nonblank names, each at most 240 JavaScript UTF-16 units without control/bidi/replacement characters or internal UUIDs, and a stable Idempotency-Key header. Reject unknown fields, raw uploads and bodies above 256,000 bytes. Trim outer whitespace and normalize Unicode to NFC. Repeated names remain distinct students and never match/update/delete existing players.

HTTP201 response: {data:{createdCount,replayed,credentialsAvailable,students:[{row,displayName,playerIdentifier,accessCode?}]}}. Rows are one-based. Identifiers are STU- plus 24 uppercase random hex characters (96 bits). Codes are 32 uppercase random hex characters (128 bits). They use the existing credential pepper/runtime and 600,000 PBKDF2 iterations. No new runtime secret or package dependency.

A successful creating transaction alone receives access codes. An idempotency replay returns the original receipt without codes, including a race where another request commits after the read-only replay check. Preserve the same key after timeouts or uncertain outcomes; do not automatically generate a new import. Lost codes require the existing protected credential-reset flow. Receipts expose no internal UUIDs or credential material. Raw codes are not passed to any RPC, logger, audit event or replay body.

## Persistence and authorization

The existing Admin entrypoint authenticates, checks active/versioned staff, players.manage, AAL2, CSRF, rate limits and owned game before dispatch. The new boundary additionally checks its reviewed staff context. Application/contracts use a narrow repository port; only the infrastructure adapter invokes RPCs.

Forward migration 20261110180000_admin_import_player_roster_v1.sql defines service-role-only admin_import_player_roster_v1. One begin_admin_mutation_v1 claim fingerprints only ordered names, game and operation. One complete_admin_mutation_v1 stores the public receipt and aggregate audit event. All rows call canonical create_player_with_balanced_country_assignment and set_player_identity_and_access_credential_v2 in the same database transaction. Canonical creation owns the per-game advisory transaction lock shared with single-player creation; the import does not introduce a competing game-row lock order. Any row failure rolls back every row and the claim. No raw CSV is retained.

No prior migration is edited. Normal rollout requires review, mandatory disposable database qualification and separately authorized deployment. Roll back application routing only if needed; preserve committed students. Any schema correction must be a new forward migration, not destructive rollback.

## Verification

Passed locally: ten focused Deno application/adapter/HTTP cases, three Node boundary/source checks, 22 existing-plus-extended Admin guard/dispatcher/control tests, backend TypeScript, migration-source audit (463 unique versions), 27 immutable Phase15 forward-bundle/rehearsal checks, and whitespace checks. New source modules remain below 500 lines. New API/application modules contain no persistence calls.

Full Edge typecheck cannot finish because the frozen Supabase SDK esm.sh fetch is refused in this environment. The dedicated workflow invokes the focused Deno suite directly, leaving the frozen backend package/snapshot intact. Full root validation passes on committed current-main integration 7113ffdd (tree identical to published e0745b21) with the regenerated inventory; all existing architecture, migration, release and source-census guards remain intact. Local psql/Docker are absent, so scripts/player-roster-import-database.sql has NOT executed. The dedicated Player Roster Import workflow requires clean disposable migration replay, real SQL rollback/replay/conflict/scope assertions, and database lint. Static source checks do not replace that SQL gate. Full smoke also stopped at the frozen SDK import. Exact-head hosted results remain required. The added concurrency harness is syntax-checked but unexecuted locally: it starts real separate disposable Docker psql sessions, verifies advisory-lock waiting before release, and proves same-key replay, distinct-import serialization, and import/single-player-create lock-order compatibility. The new migration is the exact-digest fifteenth suffix; all fourteen predecessor registrations and immutable manifests remain unchanged.

## Runtime feasibility hold

Offline Deno2.9.3 synthetic benchmark (benchmarkRosterCredentialHashing.ts, --no-config): 1 row 82ms; 30 rows 2,510ms; 200 rows 17,272ms wall time, each using 600,000 PBKDF2 iterations. No codes or credential material were printed. These are local wall measurements, not Edge CPU evidence. Vercel API maxDuration is 30 seconds; Edge CPU/wall limits may be stricter. Do not activate or mark ready until realistic authorized disposable/staging Edge timing passes. If it cannot, design a separate bounded durable-worker import flow rather than lowering hashing, silently chunking the transaction, or returning fake replay codes.

The BFF uses fetch cache:no-store and returns private,no-store,max-age=0 with Pragma/Expires. Admin API responses also use private,no-store,max-age=0. BFF contains no payload logging. The new HTTP handler catches unknown errors into a fixed message without logging exception objects. Frontend must keep one-time codes only in memory and discard on close/logout/game switch.


## Review and integration metadata

Independent parent source review identified the now-corrected canonical lock-order inversion and server/client name-validation mismatch. Source re-review confirms the game-row lock is removed, names are NFC-normalized and invalid controls/UUIDs rejected, public response fields are explicitly projected, and no raw code enters persistence. Real SQL and concurrency execution is still required before source readiness.

The visible-route inventory now marks the names-only JSON endpoint implemented. This does not support the retained legacy bundle's raw-file payload or claim that legacy upload UI is functional: unsupported payloads still fail closed. Native #933 is the sole frontend integration owner. The dedicated unique job is `Atomic roster provisioning and replay` under `Player Roster Import`.

The owner authorized draft publication of this names-only backend source, tests and supporting records, including generated inventory. Initial draft publication is complete with actual-number authority registration in this follow-up. No runtime deployment, merge or real student data action is included.


Supplemental cross-layer contract check passed using the actual names-only parser, Admin API client, HTTP handler, application and real 600,000-iteration hashing across the two local owner trees. Synthetic repeated names created three response rows; same-key replay performed no second create and exposed no codes. Its repository was an in-memory test double, so this is protocol agreement only, not PostgreSQL, browser, authorization-boundary or deployed Edge qualification.


## Current-main integration

Normal merges through main 56c72864 preserve every merged #932 Crafting guidance and #937 public-ID hashing runtime/test/workflow/authority/evidence byte and their full roadmap intake. Roster implementation bytes are unchanged from reviewed 87f636b4; only integration metadata and deterministic inventory reconciliation change. Native frontend #933 remains separate. Fresh root, focused and TypeScript checks are required for this combined head; predecessor passes do not qualify it. Database/Edge resource holds above remain mandatory.


## Exact PR qualification scope

PR938 authority locks the 22 changed paths and two unchanged read-only verifier/test paths. It retains every PR937 required and critical check in original order and adds Player Roster Import / Atomic roster provisioning and replay (131 required / 95 critical). All deployment, production mutation and secret-value grants remain false. Initial hosted runs have started; no SQL, concurrency or deployed resource success is inferred before their exact-head results.
