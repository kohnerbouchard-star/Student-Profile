# Market Identity Reconciliation Audit v1

Status: **active-identities-reconciled**
Production authorization: false

## Result

- universe records checked: 3200;
- active-candidate records checked: 240;
- exact canonical matches: 240;
- conflicting reused-symbol identities: 0;
- missing universe symbols: 0;
- active-ID conflicts: 0;
- exchange mismatches: 0;
- blocking findings: **0**.

## Identity authority

| Authority | Records |
|---|---:|
| curated-active-candidate | 96 |
| universe-derived-selection | 144 |

Curated active candidates override generated identity fields for their symbols because enrichment and simulation evidence already references those IDs. Universe-derived selections inherit canonical identity directly and do not override the universe.

## Coverage

| Country | Active records |
|---|---:|
| dravenlok | 24 |
| eldoran | 24 |
| lumenor | 24 |
| northreach | 24 |
| solvend | 24 |
| syndalis | 24 |
| thaloris | 24 |
| valerion | 24 |
| xalvoria | 24 |
| yrethia | 24 |

## Required invariants

1. Preserve curated IDs or migrate every reference atomically.
2. Keep universe-derived selections identical on canonical identity fields.
3. Regenerate checksums and rerun all seed-content audits after identity changes.
4. Keep runtime activation disabled until capability, enrichment, simulation, and release gates pass.
