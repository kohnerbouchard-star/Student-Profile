# Seed Content Preflight Operator Guide v1

Status: executable design-catalog validation; staging import remains blocked
Owner branch: `agent/seed-content-foundation-v1`
Pull request: #163
Production authorization: false

## Purpose

The preflight command deterministically validates the repository-controlled seed-content JSON before any importer, database connection, migration, fixture load, or runtime activation is allowed.

This tranche is read-only. It does not connect to Supabase, acquire an import lock, create an audit row, write a reusable definition, load a fixture, deactivate a pack, or mutate player/game-session state.

## Commands

Validate the current design catalog and list every known staging blocker:

```bash
npm run preflight:seed-content
```

Emit the same deterministic report as JSON:

```bash
node scripts/seed-content-preflight.mjs --environment test --mode design --format json
```

Exercise the fail-closed staging gate:

```bash
npm run preflight:seed-content:staging
```

Run focused automated coverage:

```bash
npm run test:seed-content-preflight
```

An explicit environment is mandatory when calling the script directly. There is no default environment and `production` is rejected because the current pack is not production-authorized or production-eligible.

## Validation contract

The command checks:

- every JSON document parses;
- declared record counts equal committed record arrays;
- definition keys are unique within each owning catalog;
- item and recipe manifest counts reconcile;
- recipe inputs, outputs, and entitlements resolve to catalog item keys;
- active-market candidates have unique IDs and symbols and valid issuer references;
- the active-country rollout count is truthful;
- the ten 320-record market-universe JSONL sources exist before the 3,200-record uniqueness claims can pass;
- location map verification and arrival-package mechanical gaps remain visible blockers;
- recorded simulation input, output, and script checksums are verifiable;
- reusable JSON contains no runtime-shaped UUID, player ownership field, Access Code, session token, game-session identity, service-role key, password, or secret;
- activation and production-authorization flags remain false on PR #163;
- declared file paths cannot escape their approved content root;
- staging mode blocks unsupported domains and disabled runtime activation.

## Exit codes

| Exit | Meaning |
|---:|---|
| `0` | Design mode found no structural/security errors. Known non-executable blockers may still be present and are printed. |
| `1` | Structural, referential, privacy, activation, checksum, or authorization error. |
| `2` | Staging mode found unresolved readiness blockers. |
| `64` | Invalid or incomplete operator arguments. |

Exit `0` in design mode is not staging approval and is not import approval. The report's `stagingReady` field remains false until staging mode has zero errors and zero blockers.

## Current expected blockers

The current PR intentionally reports blockers rather than hiding them:

- the ten full market-universe JSONL files are absent;
- only four of ten bounded country market candidates are committed;
- location map points remain unverified;
- arrival packages still lack approved starting values and introductory references;
- the exact Northreach simulation input and raw output files are absent;
- the committed simulation script no longer matches the checksum recorded by the prior run;
- multiple design-manifest domains remain definition-only or blocked;
- runtime activation remains disabled.

These findings prevent staging mode from passing. They do not authorize the validator to invent content, update economic values, or bypass Backend capability dependencies.

## Retry and recovery

Preflight has no write phase, so interruption is safe: rerun the same command against the same immutable commit. For unchanged inputs, the ordered report is byte-for-byte deterministic.

The future importer must consume a passing staging preflight report and separately implement import locking, idempotent upserts, interrupted-load recovery, immutable audit, pack deactivation, fixture isolation, and rollback preservation. None of those write behaviors are claimed by this tranche.
