# Admin Share smoke readiness

Roadmap item: `MAINT-ADMIN-SHARE-SMOKE-READINESS`.

## Bounded follow-up

Base main `5e730e059dc0d91357f61a84231a4634069e0989` has the same tree as merged PR917 head `3b974207fcbb07c7b728e8513adb864d9f1c1708`. This follow-up changes only the browser smoke readiness step and its evidence/roadmap entry. Runtime source, CSS, packages, workflow, width limits and all existing assertions remain unchanged.

The failing [Admin Game Session Controls job](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42562220984/job/128980919638) observed width760 in the no-logout-module scenario. The [original PR917 run](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42538872276) passed with identical Admin source, browser smoke, workflow and Playwright1.65. Existing controls add the normalization class after two animation frames; separate share-link repair can establish context and links before that happens. A bounded offline diagnostic confirmed the native-to-normalized width transition, but did not reproduce the exact hosted failure.

The smoke now waits at most five seconds for the same connected, visible modal element to acquire `econovaria-admin-share-game-access`. It does not wait for a width predicate or call the runtime repair itself. The existing snapshot and every assertion execute afterward unchanged. Missing readiness still fails.

## Qualification

- Pinned Node22.23.1/npm10.9.8 and locked install pass.
- Full root suite passes with its existing macOS GNU-tar archive skip.
- Backend TypeScript and all28 Edge roots pass; full backend smoke passes.
- Exact Playwright1.65.0/Chromium158.0.8127.18 passes the retained account-menu logout scenario and four complete Share/direct-logout runs, including close/Escape/backdrop, fallback, early/late-close, late-native, reopen and unrelated-close coverage. An isolated port4175 fixture was used because4173 belongs to another workspace; temporary fixture copies translate only the origin, and the server serves the same no-logout-module variant asCI without changing tracked application files.
- Independent read-only review found no remaining issue after retaining the same modal handle through snapshot/disposal. Its bounded offline cases confirm delayed normalization succeeds; missing normalization and replacement during readiness time out; replacement or lost normalization after readiness rejects the snapshot.
- Existing Admin control/source, shell identity, accepted-v606 drift and logout-trigger contracts pass. Secret scan, syntax and whitespace checks pass.

Hosted exact-head qualification remains pending. Local checks do not certify production.

## Boundaries

The owner explicitly authorized pushing and merging this bounded follow-up after verification. No production deployment, data mutation, credentials, manual workflow dispatch, unrelated test cleanup or check waiver. The approved but unpublished PR917-specific record remains separate and is not applied to main or reused for this follow-up. Publication requires an actual follow-up identity and any necessary bounded verification registration.
