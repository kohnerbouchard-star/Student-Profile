# Beta Pilot Controls

Repository status: contract-ready. Connected pilot execution is not authorized by this document.

## Bounds

- Recommended initial class count: one.
- Recommended player count: 30; hard maximum: 40.
- Synthetic-only staging data.
- One immutable release artifact for the entire 52-scenario run.
- No rebuild, source substitution, environment fallback, or production data.

## Support and escalation

- Name one operator, one approver, one support owner, and one rollback owner before execution.
- Record support hours and escalation contacts in the connected evidence package, not in public source.
- Stop the pilot for any cross-game data exposure, duplicate financial mutation, unrecoverable authentication failure, corrupted ledger state, or inability to restore the approved release.
- Triage defects by severity, affected scenario, reproducibility, release identity, and evidence references.

## Evidence and retention

For every scenario retain a redacted JSON result, timestamps, assertion results, relevant response metadata, screenshot references where applicable, and the immutable release identity. Retain the combined JUnit report, scenario-set digest, fixture identity, environment identity, and restore comparison. Credentials, tokens, access codes, raw internal identifiers, and sensitive bodies are prohibited.

## Go/no-go

Go requires all 52 scenarios to execute continuously against one approved staging release, no unresolved critical defect, successful recovery comparison, acceptable security/load evidence, and named owner approval. Synthetic contract tests alone are not product acceptance.
