# Contracts edit preservation

- Scope: `MAINT-ADMIN-CONTRACT-EDIT-PRESERVATION-001`.
- Status: `IMPLEMENTED_NOT_MERGED`, local only; no PR, push, merge or deployment.
- Owner branch: `fix/admin-contract-edit-preservation-20261113`.
- Base: freshly fetched main `7d49ad1db7fb2a45c2413e99672c7c72cee9b4e7`.

## Reproduced defects and bounded correction

1. UUID-only and mixed player targeting were incorrectly considered editable because the display sanitizer removes UUIDs before checking array length. The editor then reconstructed an incomplete audience. Capability checks now use raw array presence; existing controller/route restrictions continue to block unsupported targeting without exposing ownership UUIDs.
2. Unrelated edits reconstructed cash with amount only. The adapter supplied ECO/checking defaults and SQL shallowly replaced the original NRC/savings cash object. Unchanged cash is now omitted from the update. When the amount changes, the form retains its existing server-provided currency and account. Explicit zero still removes cash. Contract creation retains the cash alias and existing defaults without a teacher currency selector.
3. The shared create/update adapter invented empty materials/submissionRequirements arrays when an edit omitted them. PATCH now preserves omission, nested metadata survives, and explicitly supplied arrays (including empty arrays) still replace their keys. POST retains its empty-array defaults when no value is supplied.

No SQL, RPC, lifecycle, permission, ownership or reward issuance behavior is changed. No production deployment was performed. The retained teacher-safety source contract is unchanged. Three additive path filters ensure the existing Contracts workflow includes the newly imported DOM fixture and backend adapter/crypto dependencies. No job, command, guard, permission or existing trigger is removed.

## Verification

Pinned toolchain: Node 22.23.1, npm 10.9.8. Dependency lockfiles match the previously installed local validation dependencies.

- New regressions replayed against unchanged main: 8/12 pass; four expected new cases fail. Those cover UUID targeting eligibility, unrelated-edit preservation, edited reward destination and nested/omitted metadata.
- Corrected Contracts cases: 12/12 pass; independent Contracts plus unchanged teacher-safety review: 16/16 pass.
- Existing Contracts CI Node suite: 131/131 pass.
- Broad Admin V2 glob: 596/598 pass. The two failures are inherited stale Inventory explanatory-text and World planned-route expectations; the independent test-coverage repair owns those files. This is not an all-Admin pass.
- Full root `npm test`: pass, with the existing source-defined PostgreSQL skip. Inventory was regenerated and staged before the inventory equality gate.
- Existing Deno mutation adapter suite: 7/7 pass.
- Backend TypeScript: pass. Aggregate Edge typecheck and full smoke stop at the frozen Supabase SDK import from esm.sh with connection refused. No package substitution, access bypass or aggregate backend pass is claimed.
- Secret scan, syntax checks and diff whitespace checks pass.
- Inventory remains 93 oversized files, 52 persistence-location candidates and 70 cross-domain import candidates, with zero cross-domain infrastructure imports. No new source file or architectural exception is introduced.

Independent source/test review found no blocking introduced defect and independently repeated the 16 focused cases. The metadata/reward regression models the existing SQL shallow merge using synthetic values; it is not database execution. Native Chromium is absent locally, so browser acceptance and live database proof remain unrun.

## Integration and remaining limits

The independent Contracts controller/read-model extraction moves the normalization code changed here. Reconcile the raw-target guard and reward account field into that extracted read model without restoring the old sanitizer-based check, then rerun both sets of tests. Regenerate the shared inventory on the final combined tree and preserve every additive roadmap record.

The inherited country-list display cap of 24 can also make a reconstructed audience incomplete. It is deliberately outside these three reproduced fixes and needs a separate explicit guard/preservation decision. Do not claim all possible Contracts-edit loss is eliminated.

Before publication: reconcile against current main and the extraction owner, independently review the combined tree and bind normal hosted qualification to the actual PR/head. Hosted browser/database qualification and production remain separate gates; no production release is authorized.

## Combined integration qualification (2026-11-13)

The two reviewed local candidates `feac09e4f1441a021f8e6145b1380d5946bd6b1c` and `b17683daf7ebe98f8d091b9d5c152f4baf35fc4f` are integrated on freshly fetched and API-verified main `7d49ad1db7fb2a45c2413e99672c7c72cee9b4e7` in `fix/admin-contracts-preservation-coverage-20261113`. Integrated source/evidence commit `71e43e1494f1cfef0f270150d77a0cf529192967` has tree `ed709f36099f72f599097605d9c2d960b4a6c2be`. The only conflict was the two new Scope Intake entries; both and every historical entry were preserved. No roster or other active PR source was changed.

Fresh combined validation passes all 601 Admin cases, the 264-case focused Admin suite, full root tests, backend TypeScript, the seven frozen-lock Deno adapter cases, inventory equality and whitespace checks. Independent review repeated Contracts/teacher safety 16/16, retained coverage 18/18, focused Admin 264/264 and adapters 7/7, finding no introduced blocking defect. The combined tree removes the two inherited stale-test failures rather than excluding them.

Aggregate Edge typecheck remains blocked by the frozen Supabase SDK connection refusal. Full backend smoke and native-browser qualification are not claimed complete; the pinned Chromium installer returned truncated archive errors. These local environment limits do not waive exact-head hosted qualification. Current production release and Admin cutover workflows require separate manual authorization; no production dispatch or deployment was performed. The existing 24-country targeting cap remains a separate unresolved limitation.

Next: publish this bounded correction as a draft, verify the exact public tree and all applicable hosted checks (including native Contracts/browser and database checks), and merge only after they pass. The four-controller extraction follows the resulting current-main commit and must preserve these correction and coverage semantics. No feature, full-roadmap or staging completion claim.

## PR #953 exact-head qualification authority

Draft PR #953 publishes source `ab8340524b3158d8e599e70d265297dda3b20f78` with the exact independently reviewed tree `126c5da651aa329983d94404d96c19880af10e07`, sole parent main `7d49ad1db7fb2a45c2413e99672c7c72cee9b4e7`. Initial source CI is interim, not merge qualification.

The actual-number authority `docs/operations/contracts/player-cross-cutting/pr-953.json` preserves all ordered 143 required and 101 critical predecessor checks, then adds the Contracts and Admin API workflow/job identities for 147 required and 103 critical identities across 55 workflow families. Its exact scope is 27 changed paths and 29 locks, with the existing verifier/test read-only. Eleven otherwise-unselected prerequisite workflows receive only the exact PR953 authority path. Admin API checkout binds the actual PR head with persisted credentials disabled; its commands, tests, permissions and guards remain unchanged. All existing workflow events and paths remain. Production deployment, production mutation and secret handling are denied by the authority.

The complete authority/source union must pass its fresh hosted checks before normal merge. Earlier local-only and no-PR statements above describe candidate preparation, not the current published state. No roster merge, live staging certification or production action is authorized by this change.
