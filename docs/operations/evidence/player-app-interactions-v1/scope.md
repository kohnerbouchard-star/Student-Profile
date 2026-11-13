# Player terminal interaction extraction

## Scope and ownership

- Roadmap item: `ARCH-LARGE-PLAYER-APP-INTERACTIONS-001`, a bounded ARCH-501/ARCH-502 follow-on to merged lifecycle PR #959.
- Baseline: freshly fetched `main` at `94d7edc97c0d46b7009e7dbc2fde7e65b0d2c3ea`. The older pending #958/#959 intake records are historical preparation, not a competing active owner.
- Reviewed implementation: `22ae13b04beee9c2e14258463f878f7006b39d17`, tree `658ad2dc575ae40664e18b7bb65e44a2296fb303`. Later record-only changes preserve runtime/test hashes.
- Owner: `refactor/player-app-interactions-20261114`. This record covers local implementation and qualification, not publication, merge or production completion.
- Fresh open-PR inventory covers #938, #933, #735, #731, #668, #624 and #620. None owns the selected app/handler/test runtime paths. Roster #933/#938, CSS/main/realtime #624 and global-ledger #668 keep their separate owners. Shared architecture inventory and additive roadmap intake must be reconciled serially. Two workflow files also overlap #938/#620 metadata; this tranche adds only dependency selectors and preserves their jobs and permissions.
- Preserve the sole public app export, `createPlayerTerminal`, its returned object and receiver-independent methods, mounted event phase/order, capture-phase feature precedence, existing lifecycle and API ownership, native navigation, and the accepted Player visual system.
- No API, RPC, route, migration/schema, economic policy, persistence, permission, credential, dependency, live-data or production change. No network or external communication is added.

## Implementation and binding audit

- `player-terminal/src/app.js`: 847 to 394 physical lines, retaining render, focus state, keyboard/resize/hash handling, session admission, lifecycle composition, and event registration/removal.
- `player-terminal/src/core/player-terminal-actions.js`: 302 lines, one cohesive ordered click/local-action dispatcher. It receives stable shell focus callbacks and the existing lifecycle owner. Host logout still calls `lifecycle.prepareForLogout()` before the unchanged callback and event.
- `player-terminal/src/core/player-terminal-forms.js`: 185 lines, one cohesive owner for form validation, input estimates/search, and form-to-endpoint dispatch. API normalization and server-derived authority remain unchanged.
- All 27 original named helper functions remain present. Twenty-five are byte-identical. The only body adaptations are explicit shell-owned `focusElement`/`prepareRouteFocus` delegation in click/hash handlers. Their before/after semantics are covered by public-entrypoint focus tests. The public terminal return object is byte-identical. No copied state or generic mutable dependency bag was added.
- Both new factories only capture dependencies and return stable callbacks during construction. The shell adds and removes those same function identities in the original phase and order. The lifecycle factory and returned lifecycle methods remain unchanged.
- `structural-comparison.json` binds these findings to source SHA-256 values. Pinned compiler diagnostics contain no unresolved name, missing binding or missing module diagnostics. Existing broad JavaScript type diagnostics remain; this is not claimed as a full checkJs pass.
- The existing source audit reads app and its new direct dependencies and retains every prior assertion. New behavioral tests are additive to Player `verify`. The two pre-existing exact-app-path workflow selectors additionally cover both dependencies; no previous selector, job, command, trigger, permission or gate is removed.
- Deterministic inventory: 1,374 source files and 84 oversized files, down from 85. Persistence-outside-infrastructure (52), deep imports (70), and all other debt counts are unchanged. No ceiling increases.

## Verification

- 72 new public-entrypoint interaction cases pass on an untouched baseline archive and the candidate with pinned Node 22.23.1/npm 10.9.8. They use real terminal/API/store/lifecycle/renderers with synthetic DOM and transport boundaries.
- Coverage includes every selector state update, dispatch precedence and capability denial, repeated/closed overlays, country related records, clipboard success/denial, all click mutation payload/parameter paths, input estimates/search, separate Marketplace stock and affordability rejection, form validation clearing/retry, all special form parameter paths, logout callback/event ordering, actual focus restoration and listener identity/removal. The retained 29 lifecycle characterizations also pass.
- Root tests and backend core TypeScript pass. Clean pinned root, backend and Player dependency installs succeed. Architecture ratchets, inventory, secrets, whitespace, and workflow semantic comparison pass. Full Player `verify` passes including the 72 new interaction cases. Independent runtime/caller review finds no actionable defect and separately reruns 101 interaction/lifecycle cases.
- Full backend `typecheck:all` and smoke remain incomplete at the unchanged frozen import `https://esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs` with connection refusal. Smoke passed 1,027 Deno cases in 23 groups and 18 Node cases before reaching that blocker; these partial results are not an aggregate pass.
- Retained click-safety/route-refresh Chromium tests cannot launch because the required Playwright 1.59.1 headless shell revision 1217 is absent. The prior same-environment official pinned download already failed with a truncated archive; no duplicate installation attempt is represented as progress. No browser assertion passed locally.

## Next gate

Freeze and restore a private recovery after final source review and local verification. Re-fetch actual main and reconcile shared metadata in the parent-controlled serial lane. Publication must be draft, followed by actual-number authority preserving all predecessor required/critical identities, fresh exact-head hosted browser/backend qualification and a normal qualified merge. Historical hosted successes do not qualify this source. Production remains held.

## Serial-lane continuation

The parent confirmed #959 postmerge is clear and roster remains local, and released the serial lane for this bounded batch. The owner authorizes draft publication, fresh exact-head qualification, normal qualified merge and postmerge verification. Coordinate any main-base changes with the roster owner. Earlier local-only wording describes preparation; production remains held.
