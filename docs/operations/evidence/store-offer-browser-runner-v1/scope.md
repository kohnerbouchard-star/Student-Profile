# Offer-Aware Store browser runner compatibility

## Bounded correction

- Roadmap item: `CI-STORE-OFFER-BROWSER-RUNNER-001`.
- Status: `IMPLEMENTED_NOT_MERGED`; local preparation only. No PR number is assigned. The coordinator has opened the runner prerequisite slot; independent actual-main union review remains required before publication.
- Owner: `fix/store-offer-browser-runner-v1`.
- Audited base: `3b6c713e460bea08565bf67b6314ec85c5183b64`, including merged World #939 and Market #941. Older unmerged wording in their intake records is historical source status, not a new completion claim here.
- Implementation commit: `dd94f15b629577cf23117952cfe61e452062b94a`.
- Exactly one operational value changes: `.github/workflows/business-store-offer-aware-quotes-v2.yml`, job `player-and-browser`, `runs-on: ubuntu-latest` to `runs-on: ubuntu-24.04`.
- All other workflow bytes, commands, assertions, checkout bindings, permissions, guards, triggers, actions and jobs remain identical. Package manifests and locks, application source, migrations, routes, RPCs and original-base 131 required / 95 critical authority records are untouched.
- Fifteen open PR pathsets were audited. Only Dependabot #620 overlaps this workflow, and its patch changes action versions rather than the runner. Those action lines remain unchanged. Store quote #945 and focus #946 stay separately owned.

## Verified failure and supported platform

[PR #945, Offer-Aware Quotes job 130206885264](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42924351962/job/130206885264) ran on Ubuntu 26.04.1 (`ubuntu-26.04` image). After the retained Player verification passed, installation reported `Cannot install dependencies for ubuntu26.04-x64 with Playwright 1.59.1` and `Playwright does not support chromium on ubuntu26.04-x64`. No browser test ran in that job.

The Player lock pins `@playwright/test`, `playwright` and `playwright-core` to 1.59.1. Official source for that exact version marks Ubuntu 24.04 as supported, supplies Chromium/headless-shell download mappings and declares its native dependencies:

- [Platform detection](https://github.com/microsoft/playwright/blob/v1.59.1/packages/playwright-core/src/server/utils/hostPlatform.ts)
- [Browser download registry](https://github.com/microsoft/playwright/blob/v1.59.1/packages/playwright-core/src/server/registry/index.ts)
- [Native dependencies](https://github.com/microsoft/playwright/blob/v1.59.1/packages/playwright-core/src/server/registry/nativeDeps.ts)

This is the sole workflow with observed evidence of this installation failure in the audited PR945 run. `business-store-purchase-settlement-foundation-v2.yml` has another `ubuntu-latest` job using the same Player package, but it was not scheduled on that head and is only potentially affected. It is not changed. Sixteen other direct browser-install jobs use the root package's different Playwright 1.65.0; the observed 1.59.1 failure does not justify changing them.

## Verification and authority boundary

- Inverse byte comparison and parsed YAML equality prove that only the selected runner value changes.
- The retained Offer-Aware structural, simulation and typed contracts pass. All five supply-chain control tests pass.
- Secret scan and whitespace checks pass. Full root `npm test` passes, with the existing explicit PostgreSQL reservation proof skipped because `MARKETPLACE_FIXTURE_DATABASE_PROOF` is not enabled.
- Backend TypeScript passes. Full `typecheck:all` stops at the unchanged frozen Supabase SDK import with connection refused; aggregate Edge success is not claimed.
- Full backend smoke completed 19 retained groups / 811 cases, then stopped at the same unavailable frozen SDK import. Aggregate smoke success is not claimed. Hosted browser installation and browser assertions must run on the eventual published exact head; no local runner-platform emulation or browser pass is claimed.
- The existing self-path already schedules all four jobs of the Offer-Aware workflow. Current pull-request triggers also schedule eleven existing repository/supervision/release-contract families. The three-path CI/documentation delta does not match Player Terminal Verify or change Player/application scope, so no new cross-cutting manifest or unrelated filter expansion is required. Existing authority guards and checks remain unchanged and must not be bypassed if actual hosted behavior differs.

## Remaining work and rollback

Independent current-main union review is required before publication. The coordinator has opened the runner prerequisite slot; reconcile once with actual main and qualify the unchanged browser commands on the final published head before a coordinated normal merge. The candidate remains unmerged and has no hosted completion credit.

Rollback is the normal reviewed revert of this single runner value and its scope/roadmap records. No deployment, workflow dispatch, schema change, economic write, secret handling or production action is authorized or performed.

## Current-main union and serialized qualification

The coordinator opened this prerequisite slot after Settings #924, native lifecycle #927, World #939, Market #941, Banking #940, News #942, Attendance #943 and Messages #944 merged. Fresh actual main is `c5c6003705ecf056f7075df546b1fc8815d6379f`. Merge it once into the existing reviewed owner; the original one-line runner delta is unchanged. Every current-main tree entry outside this three-path scope, all main roadmap bytes, the deterministic inventory and ordered 143 required / 101 critical predecessor checks remain exact. No cross-cutting manifest or filter expansion is added.

Nine current open PR pathsets were refreshed. Only Dependabot #620 overlaps this workflow, and only through its already-audited action-version bumps. Quote #945 and focus #946 remain unchanged, and no competing runner owner exists.

Committed union `625ea66fdb0266b8231cc69802e14667a9be6bf3` passes fresh full root tests, all three retained Offer-Aware contracts, five supply-chain tests, backend TypeScript, secrets, whitespace and byte/semantic preservation audits. All 4,519 main tree entries outside the three-path scope remain exact, including the 1,352-source / 93-oversized / 52-persistence inventory and current 143/101 authority records. Root retains the explicit PostgreSQL fixture skip. Full Edge typechecking and backend smoke stop at the unchanged frozen Supabase SDK connection refusal; smoke completed 23 Deno groups / 960 cases, including 19 parity-recorded groups / 811 cases, with no failed executed case. No aggregate Edge/smoke or local browser pass is claimed. This final evidence-only amendment changes no qualified workflow or main source bytes. Independent union review must clear before separate draft publication. Hosted qualification must bind the exact workflow/jobs to the published source SHA, verify Ubuntu 24.04 and actual Chromium installation/execution, pass all four retained Offer-Aware jobs, and confirm deployment jobs remain guarded. Merge only in the coordinator's slot, then reconcile quote #945 once on merged runner main. No earlier #945 success qualifies this union, and no production action is authorized.
