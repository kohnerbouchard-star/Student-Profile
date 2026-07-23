import assert from "node:assert/strict";
import test from "node:test";

import {
  MARKETPLACE_POLICY,
  MESSAGING_POLICY,
  assertPolicyBindings,
  buildPolicyEvidence,
  selectPolicyTargetGame,
  sha256,
  validatePolicyState,
} from "./pr295-game-policy-provision-lib.mjs";

const stagingRef = "eecvbssdvarfcykcfrny";
const productionRef = "cgiukdjwicykrmtkhudh";
const releaseCommit = "a".repeat(40);
const gameId = "00000000-0000-4000-8000-000000000001";
const gameHash = sha256(gameId);
const gameName = "Econovaria Staging Preview";

function bindings(overrides = {}) {
  return {
    projectRef: stagingRef,
    expectedProjectRef: stagingRef,
    productionProjectRef: productionRef,
    supabaseUrl: `https://${stagingRef}.supabase.co`,
    releaseCommit,
    targetGameName: gameName,
    targetGameIdSha256: gameHash,
    ...overrides,
  };
}

test("policy bindings reject production and source drift", () => {
  assert.equal(assertPolicyBindings(bindings()).projectRef, stagingRef);
  assert.throws(
    () => assertPolicyBindings(bindings({ projectRef: productionRef, expectedProjectRef: productionRef })),
    /Production policy provisioning is prohibited/,
  );
  assert.throws(() => assertPolicyBindings(bindings({ releaseCommit: "main" })), /exact Git SHA/);
});

test("policy game is unique, active, owner-bound, and hash-bound", () => {
  const selected = selectPolicyTargetGame([{
    id: gameId,
    name: gameName,
    owner_staff_user_id: "00000000-0000-4000-8000-000000000002",
    status: "active",
    lifecycle_state: "active",
  }], bindings());
  assert.equal(selected.name, gameName);
  assert.throws(() => selectPolicyTargetGame([], bindings()), /resolve exactly once/);
});

test("reviewed policy defaults validate exactly", () => {
  assert.equal(validatePolicyState({
    messaging: {
      player_threads_enabled: MESSAGING_POLICY.playerThreadsEnabled,
      max_player_thread_participants: MESSAGING_POLICY.maxParticipants,
      default_retention_days: MESSAGING_POLICY.defaultRetentionDays,
      attachments_enabled: MESSAGING_POLICY.attachmentsEnabled,
    },
    marketplace: {
      marketplace_enabled: MARKETPLACE_POLICY.marketplaceEnabled,
      cross_country_trading_enabled: MARKETPLACE_POLICY.crossCountryTradingEnabled,
      moderation_required: MARKETPLACE_POLICY.moderationRequired,
      fee_rate: MARKETPLACE_POLICY.feeRate,
      tax_rate: MARKETPLACE_POLICY.taxRate,
      listing_duration_hours: MARKETPLACE_POLICY.listingDurationHours,
      purchase_reservation_minutes: MARKETPLACE_POLICY.purchaseReservationMinutes,
      dispute_window_days: MARKETPLACE_POLICY.disputeWindowDays,
      disputes_enabled: MARKETPLACE_POLICY.disputesEnabled,
      country_fee_overrides: {},
      blocked_country_codes: [],
    },
  }), true);
});

test("attachments remain disabled and policy evidence is sanitized", () => {
  const evidence = buildPolicyEvidence({
    generatedAt: "2026-07-24T00:00:00.000Z",
    sourceCommit: releaseCommit,
    workflowCommit: "b".repeat(40),
    projectRef: stagingRef,
    targetGameName: gameName,
    targetGameIdSha256: gameHash,
  });
  assert.equal(evidence.messaging.attachmentsEnabled, false);
  assert.equal(evidence.safety.domainOwnedRpcsUsed, true);
  assert.equal(evidence.safety.productionDenied, true);
  assert.doesNotMatch(JSON.stringify(evidence), new RegExp(gameId));
});
