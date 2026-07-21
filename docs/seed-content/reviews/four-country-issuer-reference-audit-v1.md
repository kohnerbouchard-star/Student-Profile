# Four-Country Issuer Reference Audit v1

Date: 2026-07-18

Pull request: #163

Branch: `agent/seed-content-foundation-v1`

Scope: Northreach, Yrethia, Thaloris, and Solvend active-market source candidates. This audit was performed before any additional Solvend financial enrichment.

## Audit criteria

For each country, the audit verified:

- declared `instrumentCount` against the actual instrument-array length;
- declared `issuerCount` against the actual issuer-array length;
- uniqueness of instrument IDs;
- uniqueness of issuer IDs;
- every instrument's `issuerId` resolves to exactly one issuer;
- every instrument appears exactly once in its issuer's `instrumentIds`;
- every issuer `instrumentIds` entry resolves to an instrument;
- every issuer backreference agrees with the instrument's declared `issuerId`;
- no orphaned instruments;
- no orphaned issuers;
- no duplicate or one-way issuer/instrument references.

## Source files

Northreach uses separate source files:

- `markets/active-subsets/northreach-active-market-candidate-v1.json`
- `markets/active-subsets/northreach-active-issuer-registry-v1.json`

The other countries use combined candidate and issuer-registry files:

- `markets/active-subsets/yrethia-active-market-candidate-and-issuers-v1.json`
- `markets/active-subsets/thaloris-active-market-candidate-and-issuers-v1.json`
- `markets/active-subsets/solvend-active-market-candidate-and-issuers-v1.json`

## Results

| Country | Declared instruments | Actual instruments | Unique instrument IDs | Declared issuers | Actual issuers | Unique issuer IDs | Reference defects |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Northreach | 24 | 24 | 24 | 21 | 21 | 21 | 0 |
| Yrethia | 24 | 24 | 24 | 17 | 17 | 17 | 0 |
| Thaloris | 24 | 24 | 24 | 17 | 17 | 17 | 0 |
| Solvend | 24 | 24 | 24 | 17 | 17 | 17 | 0 |

## Determination

No source candidate file requires issuer-count or issuer-reference correction.

All 96 instruments resolve to valid issuers. All issuer-to-instrument backreferences are complete, unique, and bidirectionally consistent. No missing, duplicate, orphaned, or one-way references were found.

## Validation gap and remediation

The existing seed-content preflight validated combined-file issuer counts and forward instrument-to-issuer references, but it did not validate issuer `instrumentIds` backreferences. It also did not join Northreach's separate candidate and issuer-registry files for referential validation.

`scripts/seed-content-issuer-audit.mjs` now performs this complete audit for every active-market candidate, including split candidate/registry layouts. The seed-content audit command must run it before the broader preflight.

## Gate decision

The issuer-reference gate is cleared for Northreach, Yrethia, Thaloris, and Solvend. Further Solvend enrichment may proceed only after the new automated issuer audit is included in the repository audit command and remains green.
