# Market Identity Reconciliation Audit v1

Status: **canonicalization-required**  
Production authorization: false

## Result

- universe records checked: 3200;
- curated active-candidate records checked: 96;
- exact canonical matches: 0;
- conflicting reused-symbol identities: 92;
- missing universe symbols: 4;
- active-ID conflicts: 0;
- exchange mismatches: 0;
- blocking findings: **96**.

## Coverage

| Country | Active records |
|---|---:|
| northreach | 24 |
| solvend | 24 |
| thaloris | 24 |
| yrethia | 24 |

## Decision

The curated active-candidate identity is canonical for every overlapping symbol because enrichment and simulation evidence already reference those IDs. Generated identities are placeholders and may not coexist as separate instruments under the same symbol.

The ten country-qualified public-institution role families are approved for design use. The fifteen generated corporate roots remain placeholder taxonomy and are not approved for public activation.

## Required correction

1. Overlay curated active IDs, names, issuer IDs, issuer names, exchanges, and compatible identity fields into matching universe records.
2. Preserve active enrichment and simulation references or migrate them atomically.
3. Regenerate checksums and rerun all seed-content audits.
4. Keep runtime activation disabled.
