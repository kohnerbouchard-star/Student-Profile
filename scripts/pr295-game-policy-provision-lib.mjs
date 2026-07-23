import { createHash } from "node:crypto";

export const MESSAGING_POLICY = Object.freeze({
  playerThreadsEnabled: true,
  maxParticipants: 2,
  defaultRetentionDays: 365,
  attachmentsEnabled: false,
});

export const MARKETPLACE_POLICY = Object.freeze({
  marketplaceEnabled: true,
  crossCountryTradingEnabled: true,
  moderationRequired: false,
  feeRate: 0.025,
  taxRate: 0,
  listingDurationHours: 168,
  purchaseReservationMinutes: 5,
  disputeWindowDays: 7,
  disputesEnabled: true,
  countryFeeOverrides: Object.freeze({}),
  blockedCountryCodes: Object.freeze([]),
});

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function assertPolicyBindings({
  projectRef,
  expectedProjectRef,
  productionProjectRef,
  supabaseUrl,
  releaseCommit,
  targetGameName,
  targetGameIdSha256,
}) {
  requireCondition(/^[a-z0-9]{20}$/.test(projectRef), "SUPABASE_PROJECT_REF is invalid");
  requireCondition(projectRef === expectedProjectRef, "Policy provisioning is not bound to exact staging");
  requireCondition(projectRef !== productionProjectRef, "Production policy provisioning is prohibited");
  requireCondition(supabaseUrl === `https://${projectRef}.supabase.co`, "SUPABASE_URL does not match staging");
  requireCondition(/^[a-f0-9]{40}$/.test(releaseCommit), "RELEASE_COMMIT must be an exact Git SHA");
  requireCondition(typeof targetGameName === "string" && targetGameName.trim().length >= 3, "TARGET_GAME_NAME is invalid");
  requireCondition(/^[a-f0-9]{64}$/.test(targetGameIdSha256), "TARGET_GAME_ID_SHA256 is invalid");
  return Object.freeze({
    projectRef,
    supabaseUrl,
    releaseCommit,
    targetGameName: targetGameName.trim(),
    targetGameIdSha256,
  });
}

export function selectPolicyTargetGame(rows, bindings) {
  requireCondition(Array.isArray(rows), "Policy game response is invalid");
  const matching = rows.filter((row) => row?.name === bindings.targetGameName);
  requireCondition(matching.length === 1, "Policy target game must resolve exactly once");
  const game = matching[0];
  requireCondition(typeof game.id === "string" && sha256(game.id) === bindings.targetGameIdSha256, "Policy target game hash mismatch");
  requireCondition(typeof game.owner_staff_user_id === "string" && game.owner_staff_user_id, "Policy target owner is missing");
  requireCondition(game.status === "active" && game.lifecycle_state === "active", "Policy target game is inactive");
  return game;
}

function equalNumber(value, expected, label) {
  requireCondition(Math.abs(Number(value) - expected) < 1e-12, `${label} mismatch`);
}

export function validatePolicyState({ messaging, marketplace }) {
  requireCondition(messaging?.player_threads_enabled === MESSAGING_POLICY.playerThreadsEnabled, "Messaging player thread policy mismatch");
  requireCondition(Number(messaging?.max_player_thread_participants) === MESSAGING_POLICY.maxParticipants, "Messaging participant limit mismatch");
  requireCondition(Number(messaging?.default_retention_days) === MESSAGING_POLICY.defaultRetentionDays, "Messaging retention mismatch");
  requireCondition(messaging?.attachments_enabled === false, "Messaging attachments must remain disabled");

  requireCondition(marketplace?.marketplace_enabled === MARKETPLACE_POLICY.marketplaceEnabled, "Marketplace enabled state mismatch");
  requireCondition(marketplace?.cross_country_trading_enabled === MARKETPLACE_POLICY.crossCountryTradingEnabled, "Marketplace country scope mismatch");
  requireCondition(marketplace?.moderation_required === MARKETPLACE_POLICY.moderationRequired, "Marketplace moderation state mismatch");
  equalNumber(marketplace?.fee_rate, MARKETPLACE_POLICY.feeRate, "Marketplace fee rate");
  equalNumber(marketplace?.tax_rate, MARKETPLACE_POLICY.taxRate, "Marketplace tax rate");
  requireCondition(Number(marketplace?.listing_duration_hours) === MARKETPLACE_POLICY.listingDurationHours, "Marketplace listing duration mismatch");
  requireCondition(Number(marketplace?.purchase_reservation_minutes) === MARKETPLACE_POLICY.purchaseReservationMinutes, "Marketplace reservation duration mismatch");
  requireCondition(Number(marketplace?.dispute_window_days) === MARKETPLACE_POLICY.disputeWindowDays, "Marketplace dispute window mismatch");
  requireCondition(marketplace?.disputes_enabled === MARKETPLACE_POLICY.disputesEnabled, "Marketplace disputes state mismatch");
  requireCondition(marketplace?.country_fee_overrides && Object.keys(marketplace.country_fee_overrides).length === 0, "Marketplace fee overrides must be empty");
  requireCondition(Array.isArray(marketplace?.blocked_country_codes) && marketplace.blocked_country_codes.length === 0, "Marketplace blocked countries must be empty");
  return true;
}

export function buildPolicyEvidence({
  generatedAt,
  sourceCommit,
  workflowCommit,
  projectRef,
  targetGameName,
  targetGameIdSha256,
}) {
  const evidence = {
    schemaVersion: "econovaria-staging-game-policy-provision-v1",
    generatedAt,
    sourceCommit,
    workflowCommit,
    project: { ref: projectRef, environment: "staging", production: false },
    targetGame: { name: targetGameName, idSha256: targetGameIdSha256, rawIdRecorded: false },
    messaging: MESSAGING_POLICY,
    marketplace: MARKETPLACE_POLICY,
    safety: {
      domainOwnedRpcsUsed: true,
      exactProjectBinding: true,
      exactGameHashBinding: true,
      exactSourceBinding: true,
      attachmentsDisabled: true,
      productionDenied: true,
      credentialsRecorded: false,
      rawInternalIdentifiersRecorded: false,
    },
  };
  const serialized = JSON.stringify(evidence);
  requireCondition(!/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized), "Policy evidence contains raw UUID");
  requireCondition(!/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/.test(serialized), "Policy evidence contains a key");
  return evidence;
}
