# Dependency Patch and Software Supply-Chain Policy

**Owner:** Econovaria repository maintainers  
**Applies to:** root application tooling, Backend dependencies, GitHub Actions, generated SBOMs, and release-support artifacts  
**Review cadence:** quarterly and after every supply-chain incident

## Required controls

Every pull request must pass the repository secret scan and the GitHub dependency review gate. Dependency changes with a known high or critical vulnerability are rejected unless a time-bounded exception has been approved and recorded.

Every trusted `main` or manually dispatched Supply Chain Security workflow run must:

1. install the pinned Node and npm toolchain;
2. run the deterministic high-confidence secret scan;
3. generate root and Backend CycloneDX SBOMs from committed lockfiles;
4. verify reproducibility and SHA-256 checksums;
5. upload the SBOM bundle under a commit-specific artifact name;
6. create GitHub artifact attestations for the generated bundle.

Secrets, credentials, token hashes, student-sensitive data, and production environment exports must never be placed in an SBOM artifact.

## Dependency update cadence

Dependabot checks root npm dependencies, Backend npm dependencies, and GitHub Actions every Monday in `Asia/Seoul`. Routine patch and minor updates are grouped by ecosystem to reduce review noise while preserving separate root, Backend, and Actions authority.

Major updates remain separate because they require explicit compatibility review, migration assessment, and rollback planning.

## Vulnerability response objectives

| Severity | Triage objective | Patch or mitigation objective | Required handling |
|---|---:|---:|---|
| Critical or known exploited | Same business day | 24 hours | Stop affected promotion, identify reachable paths, patch or disable the affected capability, and record an incident decision. |
| High | 2 business days | 7 calendar days | Patch, upgrade, remove, or add a reviewed compensating control. |
| Moderate | 10 business days | 30 calendar days | Include in the next scheduled maintenance tranche. |
| Low | Quarterly review | 90 calendar days | Patch when operationally safe or document why the dependency is not reachable. |

A shorter deadline applies whenever active exploitation, credential exposure, remote code execution, cross-game access, economic-integrity risk, or student-data exposure is plausible.

## Exception process

A dependency exception must be recorded in a GitHub issue or pull request and include:

- package or Action name and exact affected version;
- advisory identifier and severity;
- runtime reachability assessment;
- compensating control;
- named maintainer owner;
- approval date;
- expiration date no later than 30 days after approval;
- patch, replacement, or removal plan.

Expired exceptions fail review. Exceptions may not suppress the repository secret scanner or permit committed credentials.

## Emergency patch procedure

For an emergency dependency or Action patch:

1. create a narrowly scoped branch from current `main`;
2. update the lockfile or exact Action version without unrelated refactoring;
3. run Repository Quality, Supply Chain Security, relevant Backend or browser tests, and database replay when runtime behavior or migrations are affected;
4. record the affected release SHA, validation evidence, rollback target, and observation window;
5. merge through normal review unless the documented emergency production-change path is invoked;
6. regenerate and attest the SBOM bundle from the merged commit.

## Verification

The canonical local verification command is:

```zsh
npm ci
npm run security:verify
```

The generated files are:

- `artifacts/supply-chain/econovaria-root.cdx.json`;
- `artifacts/supply-chain/econovaria-backend.cdx.json`;
- `artifacts/supply-chain/SHA256SUMS`.

Artifact provenance can be verified against the repository and commit with GitHub CLI attestation verification after downloading the workflow artifact.

## Evidence and retention

Supply-chain workflow artifacts are retained for 30 days for pull-request and merge validation. Long-term release evidence belongs in the immutable release manifest governed by `OPS-ARTIFACT-001` and `OPS-ARTIFACT-002`; this policy does not independently authorize production promotion.
