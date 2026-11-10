# Player Store live-status focus preservation

- Roadmap: `PLAYER-STORE-LIVE-FOCUS-001`.
- Owner: `fix/player-store-live-focus-v1`.
- Freshly fetched base: `150ca9935ace3182c0a069e2b92691a4b58f2a0f`.
- Status: `IMPLEMENTED_NOT_MERGED`; independent review, publication and exact-head hosted qualification remain pending.
- No deployment, real student data, live economic mutation or gate waiver is authorized or performed.

## Diagnosis and ownership

PR #938's unchanged Player Store qualification failed twice after keyboard-only receipt dismissal in [job 130178900665](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/42916128983/job/130178900665). Its diagnostics artifact `13809184227` has SHA-256 `5b0e892e1069dabe3671e03e110b7b90fb706e2f524a314cf2bd40f0fc88b985` and 37,270,129 bytes. Both traces show an enabled, settled Business offer after closure. The retry closes at trace time 62836.436 ms and replaces the entire Store shell by 62867.978 ms, before the first focus check. The first attempt replaces it within the Enter operation. This is a real later DOM replacement, not a stale locator or absent/disabled offer. The traces do not identify the publisher directly.

A deterministic source reproduction with the real API, freshness coordinator, store and realtime controller establishes a matching sequence: a realtime read is superseded by authoritative Store convergence; its obsolete completion leaves live status `updating`; the next idle poll publishes only `connected`. The terminal previously subscribed its full-shell renderer to every store update. That metadata-only update detached the restored purchase control. The background controller also does not recognize the body-mounted Store overlay as an interaction guard; changing refresh ownership or convergence is deliberately outside this repair.

The refreshed changed-file audit of all fourteen open PRs found no competing owner of these frontend source/package/test paths; targeted branch searches likewise found no Store focus owner. The separate funded-quote expiry repair #945 owns backend Store quote parsing, not these frontend files. Main includes World extraction #939; older unmerged roadmap wording is historical source status only. Market #941, Banking #940, names-only roster #938/#933 and the funded-quote repair retain their separate owners and gates. Shared intake, inventory and eventual authority/workflow additions must be merged as an additive union.

## Narrow runtime change

- `player-terminal/src/core/terminal-render-subscription.js` suppresses a shell render only when `live` changed and all other own fields retain exactly the same presence and value/reference. Unknown and symbol fields are included. No whitelist of status values or broad debounce is introduced.
- `player-terminal/src/app.js` uses that subscription helper. Initial loading, explicit `requestRender`, meaningful data/UI/modal/session/navigation updates, and same-state notification behavior remain intact.
- State publication and every other subscriber remain unchanged. The existing live-status presenter still announces connection state and updates its own indicator without replacing the shell. No status is hidden or suppressed.
- No Store purchase/receipt implementation, backend, migration, RPC, auth, economic contract, CSS, dependency, refresh cancellation, sleep or retry policy changes.

## Regression evidence and required qualification

- Baseline red: the new real-terminal Node test fails against unchanged base with eight shell writes instead of seven for a late live-only reconnect; presenter isolation and post-resource reconnect tests also fail. Twelve negative controls pass on baseline.
- Candidate: sixteen deterministic cases pass. Coverage includes the actual API/coordinator/controller supersession sequence; all current non-live state fields; new fields, symbol keys and field removal; real terminal resource publication; explicit render; subscribers; the existing live-status presenter and its cleanup; same-state behavior and terminal destroy.
- `player-terminal/package.json` registers the regression in the existing realtime verification gate.
- The original keyboard-only Business acceptance retains every assertion. Added checks drive late updating/offline/reconnecting/connected publications, verify native focus and visible focus, require the same purchase DOM node and the existing accessible live indicator, then prove an actual resource refresh still replaces the node and preserves settled stock. No sleeps or assertion relaxations are added.
- Full Player `verify` and root `npm test`: PASS. Sixteen new cases, both retained Store cutover/FX source contracts, browser syntax, secret scan and whitespace checks: PASS. The root suite retains its existing database-dependent skip; no skip was added.
- Backend TypeScript: PASS. Full `typecheck:all` and `smoke`: BLOCKED at the unchanged frozen `esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs` import with connection refusal. Earlier smoke stages passed; neither aggregate is claimed green, and subsequent stages remain unexecuted.
- Native browser tests remain unexecuted locally: earlier pinned Chromium download and installed-browser socket restrictions are known; no blocked attempt was repeated. Hosted desktop/mobile execution is mandatory and is not replaced by the Node element seam.
- Generated architecture inventory: sources 1,337 to 1,338, oversized sources remain 98, all other counts and ceilings unchanged. Toolchain: Node 22.23.1, npm 10.9.8, Deno 2.9.3.
- Actual-number PR authority and any required bounded test-only workflow scheduling follow parent-coordinated review/publication. Existing required/critical checks and production holds must be retained in full.

Next: independent source review of the isolated candidate, separate draft PR, final exact-head hosted browser and aggregate qualification, then owner-authorized merge consideration. No broad beta completion or deployed runtime claim.
