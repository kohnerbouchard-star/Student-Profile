# Generated Market Universe Files

Status: committed and structurally validated; editorial and economic approval pending

This directory contains ten deterministic country catalogs:

- `northreach.jsonl`;
- `yrethia.jsonl`;
- `thaloris.jsonl`;
- `solvend.jsonl`;
- `eldoran.jsonl`;
- `valerion.jsonl`;
- `lumenor.jsonl`;
- `xalvoria.jsonl`;
- `dravenlok.jsonl`;
- `syndalis.jsonl`.

Each catalog contains exactly 320 line-oriented JSON records, for 3,200 records total.

## Reproducibility

`scripts/generate-seed-market-universe.mjs` is the authoritative deterministic generator for this design-candidate universe.

Run:

```bash
node scripts/generate-seed-market-universe.mjs --check
```

The check fails when any country source or `manifest-v1.json` differs from the deterministic output. The manifest records a SHA-256 checksum for every country JSONL file.

Repository validation currently proves:

- exactly 320 records per country and 3,200 globally;
- globally unique stable IDs, symbols, and display names;
- consistent issuer ID-to-name mappings;
- required shared instrument fields;
- non-tradable index and reference records;
- fail-closed `activationAuthorized: false` state;
- deterministic file contents and checksums.

## Remaining review boundary

The catalog is not staging-ready or production-authorized. Before selecting records for a bounded active market:

1. Complete editorial, pronunciation, resemblance, cultural-association, and trademark-risk review.
2. Reconcile the full issuer universe with the curated 24-instrument active-country candidates.
3. Calibrate financial values, bond terms, fund holdings, index methods, benchmark units, and event exposures.
4. Select and simulate a bounded staging subset rather than activating all 3,200 records.
5. Verify capability compatibility, importer idempotency, deactivation, rollback, and cross-surface behavior.

No JSONL record is authority for live ownership, pricing, trading, or session state.
