# PR917 root dependency qualification

Roadmap item: `MAINT-ROOT-DEPENDENCIES-917`.

## Scope

Continue the existing Dependabot PR917 and its exact proposed root versions, Supabase JS 2.119.0 and Playwright 1.65.0. Current main `16bae864189b8579c3778d0d6674876f6e15d22e` was merged forward as `a7fa863701b1f2fc380f52999ab4b00f8d4813ad`. The four Ubuntu 26.04/Player Playwright 1.59.1 failures are addressed by inherited, already-merged Ubuntu 24.04 pins. No new workflow, nested package or runtime source change is part of this repair.

The security contract retains an exact reviewed Supabase version, additionally checks both lockfile declarations, and runs the unchanged metadata operator against the real installed SDK with a fully mocked fetch. Dry-run, bounded metadata merge, current/missing users, query/update errors and zero-request production/project rejection paths are covered. No fixture requests reach Supabase. All existing manual, exact-project, confirmation, data-scope and production gates remain.

## Verification

Repository-pinned Node 22.23.1 and npm 10.9.8. Exact locked npm install passes with zero audit vulnerabilities. Unchanged contract reproduced 5 passes and one exact-version failure. Reviewed implementation: `ee937eb84d8085941fad8b3de7c74eac5b5479b9`.

- Focused contract: 10/10 passed, including all original six cases and four new offline groups.
- Full root `npm test`: passed, with one existing macOS skip requiring GNU tar for deterministic release archives. Exact-head Linux CI must execute it.
- Full Player `verify`: passed, with Player source, test registrations and dependencies identical to current main.
- Backend `typecheck:all`: passed TypeScript and all 28 Edge roots using Deno 2.9.3 and normal system CA verification.
- Backend `smoke`: completed successfully with retained network-denied fixtures.
- Web-session release contracts: 43/43 plus 6/6 passed.
- Dependency audit: zero vulnerabilities; all 19 installed packages have verified registry signatures, with 18 verified attestations.
- Supply-chain tests: 5/5; secret scan and whitespace checks passed.
- Independent read-only review reran all 10 focused cases under Node 22.23.1 and found no actionable issue or weakening of the original security boundary. No runtime, workflow, nested package or deployment source differs from current main.

Exact-head hosted CI is pending publication. These local results do not certify live Supabase behavior or supersede Linux/browser qualification.

## Boundaries

No merge, ready-for-review transition, auto-merge, deployment, real Auth/SQL request, data mutation, credential change or production authorization. Existing #920 remains separate. Source status does not certify live or staging behavior.
