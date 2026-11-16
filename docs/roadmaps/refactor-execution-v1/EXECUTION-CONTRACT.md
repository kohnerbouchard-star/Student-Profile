# Execution contract for every REF task

This contract is mandatory alongside the task file and root repository instructions. The package authorizes planning, not automatic implementation, merge or deployment.

## 1. Preflight and scope lock

Fetch live main and record its full SHA. Read the beta/controller ledger, architecture roadmap and relevant current PRs. Resolve every initial read path and all inbound callers before editing. Inspect deployment roots, HTML/module loading, generated bundles, dynamic imports, string dispatch, SQL routines/triggers, scheduled functions and tests as relevant. Do not infer unused code from a filename or zero TypeScript imports.

Name the task, inherited ARCH item, existing owner, exact base, dependencies and incident blockers. Use the active owner branch where one exists. A new branch is `refactor/ref-NNN-<seam>` from current main only when ownership is clear. The documentation branch for this package is not an implementation branch.

Create a scope record under `docs/operations/evidence/refactor-execution-v1/REF-NNN/` (proposed evidence root). Enumerate exact editable paths, allowed symbols, protected paths, commands and expected changes. A directory in a ticket is a discovery boundary, not blanket write permission. Default maximum is 15 meaningful source/test files and one conceptual change. Above 400 semantic diff lines, explain the mechanical versus behavioral portion and obtain a smaller scope; do not conceal changes as formatting. Generated inventory/evidence files are listed separately, never ignored.

If a budget is exceeded, define `REF-NNNa`, `REF-NNNb`, etc. with explicit scopes/dependencies before editing. Do not quietly carry the whole package into one giant PR. A parent stays incomplete while a required child is open.

## 2. Characterize before moving

Capture the existing route method, path matching, auth sequence, capability, game/actor context, request schema, status/error envelope, headers, timeout/retry behavior, idempotency key, database command and side effects. Prefer extending the nearest existing test, not a parallel test framework.

For economic changes, record the single authoritative transaction/RPC and its locks, replay receipt, rounding, currency and reservation rules. For reads, record query count, ordering, pagination, null/empty behavior and scope predicates. For UI changes, record event ownership, cancellation, remount/disposal, focus, selection and post-write refresh behavior. Preserve existing behavior; an independently discovered bug is a separately owned correction, not an unannounced refactor side effect.

## 3. Non-negotiable invariants

- Identity and game scope originate on the server. Preserve frozen context/reference identity where established. Do not re-resolve actor identity from a browser body, URL UUID or global cache.
- Keep Admin/Player session separation, HttpOnly/BFF contracts, CSRF, origin/method checks, service-role binding, denial order, replay protection and rate limits. Never make auth fail open because a dependency is unavailable.
- All money, shares, rewards, inventory, contract settlement and FX effects keep their existing atomic authoritative transaction. A public service interface is not permission to replace one SQL RPC with separate JavaScript balance/inventory writes. No distributed transaction illusion across independent HTTP calls.
- Never dual-write, add a second ledger, recalculate authoritative balances in the browser, mix currencies, change precision, or convert Checking/Savings into a Cash/wallet model.
- Keep internal ownership UUIDs and credentials out of browser contracts and retained evidence. Preserve safe error redaction. Use only synthetic fixtures; never commit student or production records.
- Preserve routes, request/response contracts, capabilities, status/error codes, ordering, audit behavior and retry semantics unless separately authorized.
- Preserve accepted UI, accessibility, real-time semantics, preview isolation and runtime recovery. Normal defaults, image placeholders, focus restoration and offline fallbacks are not automatically legacy debt.
- No historical migration rewrite, SQL/RPC replacement, schema change, dependency upgrade, secret rotation, cloud settings change or release-policy weakening inside these code-refactor tickets.

## 4. Implementation pattern

Add the smallest type/port or extracted function under its current owner; reuse an existing public boundary first. Move behavior without improving formulas or changing validation order. Retain a one-way forwarding export only where callers genuinely need it; it must delegate to the same implementation, have a named owner and a removal gate. No permanent parallel path or dual execution of a mutation.

Change one caller family, verify it, then retire the old path in a subsequent bounded deletion task after reachability evidence. Avoid broad `export *` barrels: expose only required symbols, preserve type-only imports, check import cycles and Edge runtime dependency closure. An aggregation read model may read multiple owners when explicitly scoped; do not replace efficient scoped reads with an N+1 chain of services.

## 5. Validation and reporting

Run the ticket's focused checks and the shared matrix in `VALIDATION.md`. Use installed, lockfile-pinned tool versions. Inspect script side effects before running them and keep production credentials absent from local/test processes. Missing Deno, browser, Docker, dependency downloads or authorized staging is BLOCKED/NOT_RUN, not PASSED or N/A. Do not edit tests, budgets, retries or workflow conditions merely to turn red green.

Record command, exact source SHA, exit status, relevant counts, fixture identity and sanitized evidence location. Distinguish static source contracts, local unit tests, fixture browser tests, connected staging and live production. An HTTP 200 health route is not an authenticated login/write proof. Never imply deployment from a source merge or use a different SHA's results as exact-head verification.

Required report fields: task/status; base/head; paths and symbols; behavior-parity evidence; before/after debt measures with scan denominators; remaining callers; tests passed/failed/not-run; PR; runtime authorization/evidence; blockers; next exact ticket. For new tests, register them in the existing owning suite; a minimal edit to that single package script is permitted only after checking ownership. Broad package/CI rewrites are not.

## 6. Dead-code removal and rollback

A deletion requires a record of no required static/dynamic/build/HTML caller, no external route/job/RPC/trigger consumer, retained behavior/evidence coverage, and an approved retirement gate. External reachability unknown means retain. A quiet window must cover representative classroom use and follow the existing runtime-retirement policy; this package does not shorten it.

Rollback is a normal revert of the bounded source PR and restoration of its exact previous module/asset wiring. Preserve all subsequently accepted incident/security fixes. Never force-push main, restore revoked credentials, re-enable a disabled runtime or undo a production migration as a code rollback. Database/live-runtime corrections use a separately authorized forward/release procedure.

Stop before widening scope if ownership is unresolved, baseline tests fail in the affected seam, a schema/formula/API change is necessary, transaction atomicity cannot be maintained, external consumers are unverified, or proposed deletion removes an active safety check. Record the blocker and the smallest next action; do not label it complete.
