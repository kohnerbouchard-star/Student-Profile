# Backup and Isolated Restore Runbook

Status: repository preparation only. No production operation is authorized by this document.

## Phase 1 — Select authority

Record the source release commit, migration head, source project identity, isolated target identity, production guard identity, operator, approver, and evidence location. Stop if any identity is missing or if source, target, and production are not distinct as required.

## Phase 2 — Capture recovery package

Use an approved operator procedure to create an encrypted package that covers schema, migration ledger, application data, Auth mapping, Storage inventory, exact Edge Function source, and configuration names. Record archive SHA-256, byte size, timestamps, and immutable storage custody. Secret values and connection strings must not appear in repository evidence.

## Phase 3 — Verify before restore

Independently verify the archive digest and confirm that the selected target is isolated, synthetic-only, and not production. Confirm the restore window, rollback owner, and monitoring owner.

## Phase 4 — Restore and reconstruct

Execute the provider-approved restore procedure only after authorization. Reconstruct configuration names from approved sources and deploy the exact release source represented by the recorded commit. Do not rebuild or substitute source during the rehearsal.

## Phase 5 — Validate

Verify migration identity, balances, ledger references, Inventory, Contracts, stock holdings and orders, notifications, Auth mapping, Storage inventory, and exact Edge Function source. Run connected Admin, Player desktop, and Player mobile smoke tests.

## Phase 6 — Finalize evidence

Record start/end timestamps, achieved RPO and RTO, failures, manual interventions, smoke evidence, archive identity, and target identity. Confirm production was not modified and scan the evidence package for credentials, tokens, access codes, internal identifiers, and sensitive payloads.

Repository validation proves only that the control contract is present and fail-closed. A real rehearsal is complete only after connected evidence exists.
