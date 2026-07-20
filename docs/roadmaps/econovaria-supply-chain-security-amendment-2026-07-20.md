# Econovaria Supply-Chain Security Amendment

**Date:** 2026-07-20  
**Authority:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Owned item:** `OPS-SUPPLY-001`  
**Status:** `IN_PROGRESS`  
**Branch:** `agent/supply-chain-security-v1`

## Ownership

This branch exclusively owns the bounded Phase 5 software supply-chain security subsection while it is active. It does not own isolated staging, release promotion, Player recovery, messaging, market reconciliation, story delivery, or seed content.

Open-PR collision audit at claim time found:

- PR #163: seed-content authority;
- PR #244: story-notification delivery;
- PRs #245 and #246: overlapping market reconciliation;
- PR #247: Player recovery states;
- PR #248: messaging and communication.

No active PR owned `OPS-SUPPLY-001`.

## Completion contract

The tranche must deliver all of the following before merge:

1. deterministic repository-local secret scanning with bounded false-positive controls;
2. pull-request dependency review with a high-severity fail threshold;
3. reproducible CycloneDX SBOM generation for root and Backend dependency graphs;
4. immutable workflow artifacts containing SBOMs and their SHA-256 manifest;
5. build provenance attestation for the SBOM bundle on trusted `main` or manual runs;
6. an explicit dependency patch and exception policy with owner, cadence, SLA, and emergency handling;
7. tests that prove the scanners reject representative secrets, accept safe fixtures, and produce valid SBOM/manifest output;
8. repository quality integration and passing GitHub checks;
9. final reconciliation in the authoritative roadmap after merge evidence is available.

## Completion boundary

Repository controls and workflow evidence can complete this item. GitHub organization settings, isolated staging, artifact promotion, runtime observability, backup/restore, and production approval remain governed by their separate roadmap items.
