# Combined Campaign/provisioning source qualification — 2026-10-31

Status: IN_PROGRESS; local source candidate only. No release or parent completion.

## Registration before reconciliation

The product owner instructed GPT-6.1 Max to execute the independently planned
source integration and disposable qualification. This supersedes only the
earlier exclusion of combining the existing Campaign and claims source. It does
not lift shared-file caps, U1 holds or any production/staging action gate.
No other owner's acknowledgement is inferred from coordination comments.

- Main: `a4dd2651d0ba964cce0cf28bf35f76975f35fd13`.
- Existing Campaign tip PR884: `a9a532be4deb884aa864c9489b7d174e8f33f167`,
  including the existing PR879–883 ancestors; do not separately accept red tips.
- Existing claims PR885: `a03c1720dfd1df8db95e0b00e738428a12f8fb47`.
- Local detached worktree starts at PR885. Merge the exact Campaign tip locally;
  existing owner target remains `fix/game-provisioning-service-claims-v1`.
- PR885 retains `main`: inspection showed its claims workflow is main-only;
  retargeting to Campaign would skip required qualification. The initial local
  retarget proposal is superseded before publication. Its exact-path authority
  includes only the inherited Campaign-tip delta plus the existing claims scope.
  Remote PR base/head remain unchanged until a safe, qualified owner update.

New reconciliation edits are restricted to the two existing shared files,
PR885's authority and this already-allowed convergence record:

1. `scripts/operations/live-migration-reconciliation/build-phase15-rehearsal-plan.mjs`:
   retain the original eight literal identities, Campaign ninth and claims tenth;
   preserve raw/source hashes and every loader/ledger/digest/order guard. Keep
   PR885's existing 15-changed-line cap relative to the Campaign tip.
2. `scripts/operations/live-migration-reconciliation/phase15-forward-bundle.test.mjs`:
   retain both exact migration regressions, update literal count/index/order and
   assert the combined suffix length. Keep the existing 30-changed-line cap
   relative to the Campaign tip. No absent-file or conditional exemption.
3. `docs/operations/contracts/player-cross-cutting/pr-885.json`: retain main,
   register the exact inherited Campaign-tip paths and required checks/note;
   verifier/test stay read-only. This grants no new edit to inherited bytes.
4. This record: exact provenance, evidence, unresolved gates and next action.

Inherited Campaign application, harnesses, historical failure evidence, approved
migration and workflow deltas are imported byte-for-byte from the named tip.
Claims migration, harness, tests and workflow remain byte-for-byte from PR885.
Immutable Phase15 manifests/migrations, package/action pins, all nine U1 holds,
REF parent IDs/statuses, loan CHECK gates and other owners' paths are protected.
Do not add a replacement PR, modify the live runner or absorb Player CSS work.

## Qualification boundary

Require both original migration hashes, original-eight vector digest, negative
registry tests, focused Campaign/claims tests, required repository/backend/
Player/Admin checks, two clean database replays and real provisioning/Campaign
acceptance on this combined source. Disposable resources need ownership and
independent teardown receipts. Fixture/unit evidence cannot replace real SQL,
PostgREST, concurrent-worker or deployed-state acceptance.

No push before checking workflow and Git-connected deployment side effects.
No remote merge/approval, deployment, hosted SQL, hold restoration, credential
or permission change, feature activation, account operation or file upload.
An unavailable prerequisite is BLOCKED/NOT_RUN, not a waived or passing check.
