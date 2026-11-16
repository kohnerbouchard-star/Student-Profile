## Summary

Retire 27 disconnected runtime modules, one unused SVG and ten obsolete test/support files. Migrate necessary tests to current owners and preserve active authorization, transactional financial paths, migrations, audit history and browser integrations. No deployment/settings/permission changes.

Local source: `93aaa4e30`, reviewed on main `1327a2602a08fe8b5c4cac7d1205d9cfe73de460`. 69 changed paths, +421/-7096 lines. Exact changed/deleted lists accompany this packet. This is a draft body, not an existing PR.

## Domain breakdown

- Contracts: unreachable legacy handler/parser and old-only tests; current public-key route/security coverage retained.
- Store: obsolete unfunded/raw-ID adapters; funded checkout, public reads, Staff operations and dashboard shared contracts retained.
- Economy: dead Player ledger handler; current public session/read tests expanded, Staff ledger coverage retained.
- Auth/config/Supabase: unused generic scaffolds removed; current Player scope/session and verified Staff identity retained.
- Game/Staff creation: uncalled standalone creators and their repositories retired together. Timezone validation tests registered on actual licensing boundary; verified signup creation remains. Old audit semantics are not asserted equivalent.
- Countries: unused profile scaffold, not a claim former planned mutation features are complete.
- Licensing: unconsumed purchase-code rules; atomic RPC authority unchanged.
- Asset: unused Store fallback SVG; current media resolution retained.

## Evidence

Independent exact-union review confirms incoming main/ratchets preserved; only generated architecture census conflicted and was regenerated. Full root npm test passed, 470 summarized passes and one explicit optional PostgreSQL skip. Checked Store39, Banking44, Contracts124, World23 and Player scope85 passed on combined tree. Backend tsc passed; current runtime-size/Player-write guards pass. Negative file restoration tests detect retired modules returning.

## Not yet cleared

Edge-all typecheck is blocked by an uncached esm.sh dependency download. Full Game Sessions dependency failure and paired-baseline licensing smoke failure remain explicit. Manual timezone reconciler reports three identical preexisting drifts before/after; historical migration bytes were preserved. No hosted CI, browser, disposable database or staging pass is claimed. Final exact-PR authority/CI checklist must be produced after actual number assignment and coordinator clearance.

## Current-main integration and independent review

PR #988 merged as `1327a2602a08fe8b5c4cac7d1205d9cfe73de460`. Normal local merge `93aaa4e30` preserves all incoming source and both realtime workflow selectors. Only generated inventory conflicted and was regenerated. Independent review found no actionable source/merge defect; 34 retirement/auth/realtime coverage tests and size/write-policy ratchets pass. Fresh root tests and checked Store39, Banking44, Contracts124, World23 and Player scope85 pass using Node22.23.1/npm10.9.8 and exact-lock cached dependencies. Core TypeScript passes; full Edge and backend smoke are blocked by the locked esm.sh SDK download connection refusal and are not qualified. No hosted qualification is claimed.

Draft [PR #989](https://github.com/kohnerbouchard-star/Student-Profile/pull/989) publishes source `34c28a2937411c7524b55569e0c9433426a7cb8e`, with exact reviewed local tree `5ff7ed918fb54ef32c3bf3378d5c72d15c6c013d`. The actual-number authority `docs/operations/contracts/player-cross-cutting/pr-989.json` locks this bounded diff and unchanged verifier/test. [CI derivation](ci-contract.json) records naturally triggered workflows, applicable job identities and guarded skips from current workflow definitions, not a cloned predecessor list. Final exact-head qualification remains pending. Existing production synchronization remains unchanged. No merge authorized by this evidence alone.

## Explicit exclusions

Story fallback migration, alternate staging entrypoints, browser/Attendance compatibility bridges, historical SQL and credential-version compatibility remain separate. Their deletion needs semantic/deployed/client evidence, not zero-import assumptions.
