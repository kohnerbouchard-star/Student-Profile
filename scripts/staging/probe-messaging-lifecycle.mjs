#!/usr/bin/env node

const plan = Object.freeze({
  mode: "plan",
  connectedExecution: false,
  connectedHarness: "scripts/staging/messaging-connected-acceptance.sql",
  residueHarness: "scripts/staging/verify-messaging-zero-residue.sql",
  guards: Object.freeze([
    "manual dispatch from exact candidate head only",
    "protected staging environment",
    "known production project refs rejected",
    "Supabase database URL must match the declared staging project ref",
    "exact source SHA and artifact digest binding",
    "exact Messaging migration ledger binding",
    "transactional rollback and independent zero-residue verification",
    "attachments remain disabled",
    "all uploaded evidence and diagnostics are sanitized",
  ]),
  lifecycle: Object.freeze([
    "policy and attachment-disablement validation",
    "same-game participant-scoped thread creation",
    "thread creation idempotent replay and conflicting replay denial",
    "exact participant-scoped thread read",
    "database-side search and full-inbox unread accounting",
    "message send and committed-success replay",
    "read receipt",
    "message hide and unhide",
    "thread disable, recovery, and closed-state denial",
    "transaction rollback",
    "independent post-rollback zero-residue query",
  ]),
});

if (process.argv.includes("--plan")) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

throw new Error(
  "The legacy mutating HTTP Messaging probe is disabled. Run the exact-head transactional SQL acceptance harness through the protected staging workflow.",
);
