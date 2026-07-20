# Legacy Runtime and Credential Retirement

Status: repository preparation is complete. Live retirement is not authorized.

This tranche covers runtime inventory, caller attribution, bounded traffic evidence, credential-name ownership, rollback preparation, and repository guardrails. It does not disable, delete, rotate, revoke, or change authentication behavior.

## Runtime dispositions

| Runtime class | Disposition | Remaining gate |
|---|---|---|
| Canonical Admin, Classroom, and market runtimes | Retain | Normal release, health, and rollback evidence |
| Legacy monolith runtimes | Replace only after attribution | Complete caller inventory, retained source/configuration, quiet window, approval |
| Staging tombstone runtime | Retain temporarily | Quiet window, post-disable observation, recovery retention, approval |
| Former external Worker | Retain until ownership is proven | Provider routes, DNS, analytics, bindings, source/configuration, credential names |
| Previously observed obsolete market runtimes | Preserve deletion evidence only | Historical archive, traffic evidence, credential ownership, owner execution record |

## Evidence rules

Traffic evidence is collected in daily UTC slices no longer than 24 hours and no larger than 1,000 records. Retained evidence excludes authorization data, API keys, cookies, request bodies, sensitive query parameters, and raw client addresses. Unknown consumers may be represented only by a stable non-reversible identifier.

Every response counts as traffic, including denied and not-found responses. Any unknown consumer or successful legacy request blocks retirement and restarts the quiet-window clock.

Machine-readable records live under `ops/legacy-runtime/` and define:

- runtime identity and disposition;
- route allow-list;
- bounded log-query contract;
- traffic-evidence request;
- credential-name ownership and rotation sequence;
- provider snapshots and rollback requirements.

## Required windows

1. Fourteen consecutive quiet days before an approved disablement.
2. Seven days of post-disable monitoring.
3. Thirty days of recoverable retention before permanent deletion.

Any rollback, unknown caller, legacy traffic, or unapproved route or credential change restarts the applicable window.

## Change authorization

Before any live change, retain and hash the exact runtime source and configuration; identify the runtime owner, operator, monitoring owner, rollback owner, and revocation authority; complete caller and credential matrices; pass authentication and ownership probes with separately approved test identities; complete the quiet window; and record explicit owner approval.

Rollback restores only the retained runtime and configuration needed to recover service. It does not automatically restore browser transport or revoked credentials.

## Repository verification

```zsh
npm run audit:legacy-runtime
npm run test:legacy-runtime
npm run test:player-runtime-cutover
```

## Remaining external gates

Repository tooling is complete. Live completion still requires provider read-only exports, historical traffic, retained legacy source and configuration, exact credential consumers and owners, the required elapsed observation windows, and explicit approval for every runtime or credential change.

Production remains unchanged.
