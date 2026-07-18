# Generated Market Universe Files

Status: generated and structurally validated; repository ingestion pending

The `manifest-v1.json` file describes ten generated country catalogs:

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

Each catalog contains 320 line-oriented JSON records, for 3,200 records total.

The complete generated files currently exist in the accompanying review package as:

- `econovaria_market_universe_3200_v1.xlsx`;
- `econovaria_market_universe_3200_v1.csv`;
- `econovaria_market_universe_3200_v1.zip`, including all ten JSONL country catalogs.

The ten large JSONL files are not yet checked into this GitHub branch. The connected repository writer used for this content pass does not accept local generated files as direct file uploads, and duplicating the records manually would create avoidable corruption risk.

This means:

- the allocation decision, schema, manifest, and validation record are committed;
- the actual 3,200-row catalog is generated and available for review;
- repository ingestion of the ten JSONL files remains a controlled follow-up step;
- the catalog is not staging-ready or production-authorized.

Before repository ingestion:

1. Review the workbook or CSV.
2. Run editorial and resemblance checks.
3. Preserve the manifest counts and stable identifiers.
4. Verify every JSONL file against its recorded checksum.
5. Add the files in one intentional market-content commit or dedicated data PR.
6. Re-run uniqueness and reference validation after ingestion.
