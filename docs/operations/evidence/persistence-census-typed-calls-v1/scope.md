# Reconciliation after #668: 2026-11-16

PR #991 retains its existing owner branch and is reconciled with merged #668
main `41792bd9ea1b5b7e196dbdf489dda22f4e9b7b8e`. The only textual merge conflict
was the generated inventory; it was regenerated, not hand-combined. Current
same-root counts are 1,611 source files: predecessor detector 59 persistence
candidate files, corrected detector 86, exactly 27 additions and no removals.
All other inventory counts and all ceilings are unchanged. The immutable
`e71a92a2` regression remains historical coverage, not a current-main assertion.
Earlier qualification belongs to head `b7e8d64a`; renewed local checks,
independent review and exact-head hosted qualification are required for this
union. No runtime, migration, route, RPC, permission or deployment change.
Production parity remains unresolved independently of this tooling correction.
Next: qualify and serially merge #991, then reconcile #990 against actual main.

# Current integration checkpoint: 2026-11-16

Supersedes the historical local-preparation status below. Existing owner branch
`fix/persistence-census-typed-calls-39685` has normally merged freshly fetched main
`e71a92a2df85bc359a480570b20882603c9df1b9` after #989. This is tooling-only
`PERSISTENCE-CENSUS-TYPED-001` under `ARCH-401`, not runtime ownership closure.

Current identical-root census: 1,596 sources, old detector 60 candidate files,
corrected detector 87 (85 non-test), exactly 27 additions and no removals. Other
inventory measurements are unchanged. The existing ceiling remains 100; no
ceiling is increased. The focused regression suite is now registered in
`audit:architecture` and therefore root `npm test`. Its immutable predecessor
regression uses current main e71a92a2, not obsolete local source. The historical
candidate audit below remains provenance for those 27 additions, not a claim
that its old line numbers or denominator are current.

Main already contains #985–#989. A narrow additive roadmap checkpoint reconciles
these merges without rewriting old intake history or #668 ownership. Two existing REF-009/REF-018 qualification checkouts gain `fetch-depth: 0` so
the immutable predecessor regression remains executable when aggregated. No
workflow command, permission, gate or trigger changes. All runtime, route, SQL,
deployment, permission and economic behavior is unchanged.
Hosted qualification and independent final review remain required before merge.
Local full Edge/backend smoke retain the frozen SDK-download limitation.

## Historical preparation (preserved)

# Typed persistence-candidate census correction

## Scope and authority

Local preparation for `ARCH-401`, supplemental item `PERSISTENCE-CENSUS-TYPED-001`.
Audited immutable main: `39685d2c29394caa425d928649804a433806e521`.
Status: local implementation only, not merged or runtime-certified. No publication,
merge, deployment or database action is performed by this tranche.

The separate architecture regression ratchet is draft PR #985. Its scope explicitly
excludes this correction. The existing global roadmap owner remains PR #668; this
supplement records the scope without overwriting its ledger. No currently open
persistence owner was returned by the 2026-11-16 connector PR/branch search. The
previous Story roleplay port is already present in this audited main and is not
reimplemented. Remote Git fetching could not authenticate in this execution
workspace; main identity is the supplied immutable checkout, not a newly fetched
remote-main certification.

## Finding and exact denominator

The old inventory recognizes `.from(`, `.rpc(` and `createClient(`, after excluding
standard collection constructors. TypeScript calls such as `.rpc<unknown>(...)`
are invisible unless another untyped match happens to occur in the same file.
The old 62 is consequently an incomplete *lexical candidate-file* count, not a
count of actual calls or architectural violations.

The corrected detector includes a member named `from` or `rpc` followed by `(`
or `<`. The latter deliberately recognizes generic member candidates without
parsing nested TypeScript types. Standard Array/typed-array constructors remain
excluded, now including their generic forms. Existing comments/string candidates
remain covered. Generic instantiation expressions and relational expressions can
also match; bracket access, aliases, dynamic calls, Auth SDK access and SQL-only
ownership bypasses are not comprehensively detected. This is not an AST audit,
reachability proof, deployed-runtime inventory or security certification.

Unchanged five roots: `backend/src`, `backend/supabase/functions`, `admin`,
`frontend/src`, `player-terminal/src`. Unchanged extensions:
`.js,.mjs,.cjs,.ts,.tsx`. Unchanged generated/dependency exclusions and approved
infrastructure paths. No source is relocated or reclassified to lower a metric.

| Measurement | Old | Corrected |
|---|---:|---:|
| Sources in existing census | 1,628 | 1,628 |
| Candidate files outside approved infrastructure paths | 62 | 89 |
| Domain API candidates | 16 | 22 |
| Domain service candidates | 0 | 3 |
| Domain test candidates | 1 | 1 |
| Outside-domain candidates, including security/Edge/tests | 45 | 63 |
| Old candidates removed | 0 | 0 |
| Newly visible candidates | 0 | 27 |

Every other recorded count and every ratchet ceiling remains unchanged. The
immutable predecessor-candidate regression verifies all 62 old candidates still
match. The exact 27 additions are classified in [candidate-audit.md](candidate-audit.md).

## Implementation and preserved boundaries

- `scripts/architecture/persistence-call-candidates.mjs`: small exported lexical
  detector, used by the existing generator.
- `scripts/architecture/persistence-call-candidates.test.mjs`: focused positive,
  negative, nested/multiline/function-type, collection-constructor, retained
  comment/string, generic-instantiation and immutable-predecessor coverage.
- Existing inventory generator and generated JSON: only persistence measurement
  and explanatory caveats change.
- REF-003 canonical generator review record: only the reviewed source hash and
  additive reason amendment change. All dispositions, other records and deletion
  holds remain intact. The first committed-head root run stopped at its stale
  source binding, which is reconciled rather than waived.
- No runtime JS/TS, migration, table, RPC, route, economic formula, balance,
  Inventory, reward, Contract, market, auth, request scope, idempotency or UI change.

Do not silently raise a ceiling or rewrite #985 while integrating. Main's
predecessor ceiling of 100 admits the corrected 89, but #985's proposed tightened
62 ceiling must be separately reconciled against the changed measurement after
its reviewed sequence. A corrected denominator is not economic debt growth and
must not be portrayed as a resolved persistence violation.

The new focused test remains a standalone command in this held local tranche.
Aggregate registration must be integrated explicitly in the successor after #985;
its existing package/test registration is not overwritten here. This tranche is
not ready for publication or merge until registration and exact-head qualification
are resolved.

## Qualification record

Pinned Node 22.23.1 focused tests pass 34/34; eight generic regressions fail
against the old detector. Independent review found no actionable issue. A
separate Python census confirms 89 files, all 62 old candidates retained, exactly
27 added and no other count changes. The unchanged architecture ratchet passes
at 89/100. Repeated generation gives SHA-256
`1de033d2080fc1fdfcf2374019f0a109b6b4f7417ed75ebbab39e18cc129c030`.
Secret and whitespace checks pass. Full-root qualification is recorded in the
local handoff, separately from these focused results. Required checks:

```sh
node --test scripts/architecture/persistence-call-candidates.test.mjs
node scripts/architecture/build-architecture-inventory.mjs
node scripts/architecture/architecture-ratchet-v2.mjs
npm test
npm run security:secrets
git diff --check
```

Inventory generation must be repeated with byte-identical output. A separate
simple source scan should confirm the 27 additions, all old candidates retained,
and no non-persistence count change. Unit regressions must fail against the old
detector, not merely pass with the candidate. No browser/database/staging proof is
claimed or needed to establish a lexical tooling fix; runtime ownership changes
would require their own focused tests and connected gates.

## Next exact step

Hold this local candidate until #985's serial sequence. Independently review the
census detector/limits and ownership map, explicitly register focused tests in
that successor, reconcile the persistence ceiling as a measurement correction,
then qualify the exact integrated head. Keep the first runtime extraction
separate from this tooling repair and from feature/size refactors.
