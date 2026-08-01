# Release Integrity Gates v1 — Runtime Amendment 1

Status: binding amendment to `docs/operations/release-integrity-gates-v1.md`

Date: 2026-08-01

Branch: `fix/release-integrity-gates`

## Reason for amendment

The governing design was committed before implementation, as required. Its initial runtime section set both the exact local/CI toolchain and the deployable runtime floor to Node.js `22.23.1` and npm `10.9.8`.

After `.npmrc` enabled `engine-strict=true`, Vercel preview deployment `dpl_Bez3cpLPLp5ZzLXQsBKGuV87Wz8Y` failed before build execution. The Vercel build log recorded:

- Vercel selected the Node.js 22.x line because of `package.json`;
- actual build Node.js: `22.22.2`;
- actual build npm: `10.9.7`;
- required Node.js: `>=22.23.1 <23`;
- required npm: `>=10.9.8 <11`;
- npm terminated with `EBADENGINE`.

Vercel's documented contract permits selection of a Node.js major line and automatically advances its minor and patch release. A repository must therefore distinguish the exact, reproducible validation toolchain from the minimum currently deployable platform runtime.

## Superseding runtime contract

This amendment supersedes only the Node.js and npm range statements in the original document. All other scope limits and invariants remain unchanged.

The corrected contract is:

- local development and GitHub Actions use Node.js `22.23.1` and npm `10.9.8` exactly;
- `.nvmrc` remains `22.23.1`;
- `packageManager` remains `npm@10.9.8`;
- deployable runtimes must satisfy Node.js `>=22.22.2 <23` and npm `>=10.9.7 <11`;
- `.npmrc` remains `engine-strict=true`;
- exact mode validates the local/CI pins;
- compatible mode validates the bounded deployable ranges;
- Node.js 23 or 24 and npm 11 remain rejected;
- a runtime below Vercel's verified Node.js `22.22.2`/npm `10.9.7` floor remains rejected.

The production range is not a claim that `22.22.2` is the preferred developer version. It is a compatibility floor proven by the current hosting platform. CI remains pinned to the newer Node.js `22.23.1` and npm `10.9.8` release.

## Required implementation order

1. Commit this amendment.
2. Change `package.json` engine ranges.
3. Change the corresponding root package metadata in `package-lock.json`.
4. Keep `.nvmrc`, `packageManager`, and CI setup versions unchanged.
5. Rerun unit and workflow contract tests.
6. Require a successful Vercel preview from the amended branch head.

## Acceptance additions

The branch is not ready for review until:

- Vercel dependency installation succeeds with `engine-strict=true`;
- the build log contains no `EBADENGINE` error;
- exact CI mode still requires Node.js `22.23.1` and npm `10.9.8`;
- compatible mode accepts Node.js `22.22.2` and npm `10.9.7`;
- compatible mode rejects Node.js `22.22.1`, Node.js 23+, npm `10.9.6`, and npm 11+.

## Security impact

This amendment does not weaken the major-version boundary and does not disable engine enforcement. It replaces a non-deployable patch floor with a verified platform floor while preserving a newer exact validation toolchain.
