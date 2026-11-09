# Admin scanner startup-read completion

## Scope and evidence

Roadmap: `MAINT-ADMIN-SCANNER-STARTUP-READS-001`. Base: freshly fetched main `9fe4a5c2fe145cdaf6c0f9d53e5f99fbe731a375`, which preserves merged Loans #925 and qualified shared repair #928. Loans source, authority and its complete intake entry are unchanged. This separate bounded follow-up changes only the shared scanner harness, its existing fixture helper and retained deterministic contract, plus intake/evidence/actual-PR authority. No application, dependency, workflow, backend, schema, migration, route, RPC, release or production change. No feature branch is silently modified.

PR #924 integrated head `2df1aa48` Shell run `42596280711` job `129089590139` and PR #927 integrated head `66109e1b` run `42596292462` job `129089623075` both fail `Audit verification skeleton and scanner lifecycle` on the exact fixture game's dashboard GET with `net::ERR_ABORTED`. Both preserve PR #928 harness files byte-for-byte. The single join-code boundary can complete before the four concurrent Overview reads, so a test-driven viewport reload cancels a valid delayed dashboard read. The unchanged fixture intentionally delays reads 450 ms.

`loadAdminTerminalSessionBootstrap` renders the authenticated shell before awaiting `loadAdminTerminalPageData`. The latter loads the `Overview` map's dashboard, games, notifications and Store requests concurrently. Persisted Game Code is an independent startup GET. The observer must begin before navigation and require all five exact GET paths, HTTP 200 and completed response bodies under one 15-second deadline. Await completion only after existing viewport/scanner snapshots and assertions, before another test-driven navigation or final errors check. Preserve all requestfailed, CSRF, authority, session, geometry, loading and scanner assertions, and the fixture delay.

## Qualification

Implementation and deterministic qualification pass with Node 22.23.1 and npm 10.9.8. Each of the five startup endpoints is held last in turn, with separately deferred headers and bodies. Every endpoint rejects HTTP 500, redirect 302, response rejection, body failure, missing headers and a hanging body. The contract also binds the actual four-read Overview source map and preserves assertion-before-wait ordering. All 25 retained redirect, scroll and authority cases pass, as do the complete root `npm test`, backend TypeScript, secret scan and whitespace check. Independent read-only review found no actionable finding and reran the loading contract plus all 25 retained redirect, scroll and authority cases. Exact-head hosted qualification remains pending. The cloud cannot launch the pinned browser locally: official Chromium download returns an unavailable page, installed Chromium is blocked by the sandbox's socket restriction, and the supported browser cannot reach the shell fixture network. No restriction is bypassed. Hosted Shell must qualify the final published head. Broader backend smoke and Edge checks are blocked locally by the unchanged esm.sh connection restriction; no pass is inferred.

No deployment, manual release dispatch, live data mutation or broad readiness claim.

## Draft registration

Draft [PR #929](https://github.com/kohnerbouchard-star/Student-Profile/pull/929) publishes independently reviewed implementation `eed455a6d7086291a747ccf9820747b743622315`. Actual-PR authority binds six changed paths plus two unchanged read-only verifier/test paths to `main`, preserving byte-identical 122 required / 89 critical current-main checks and all three production/mutation/secret denials. Registration changes only this evidence, the additive intake and the new authority manifest. Exact final-head CI remains pending; source publication is not a browser pass.
