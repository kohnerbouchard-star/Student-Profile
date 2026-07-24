#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MARKETPLACE_POLICY,
  MESSAGING_POLICY,
  assertPolicyBindings,
  buildPolicyEvidence,
  selectPolicyTargetGame,
  validatePolicyState,
} from "./pr295-game-policy-provision-lib.mjs";

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function safeError(error) {
  return String(error?.message ?? error ?? "Unknown policy provisioning error")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "[uuid-redacted]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[key-redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .slice(0, 2000);
}

function exact(value) {
  return encodeURIComponent(`eq.${value}`);
}

async function requestJson(baseUrl, serviceRoleKey, resource, options = {}) {
  const response = await fetch(`${baseUrl}/rest/v1/${resource}`, {
    method: options.method ?? "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const code = body && typeof body === "object" ? String(body.code ?? "unknown") : "non_json";
    const message = body && typeof body === "object" ? String(body.message ?? "") : "";
    const error = new Error(`Policy staging request failed (${response.status}:${code})${message ? ` message=${message}` : ""}`);
    error.status = response.status;
    error.code = code;
    throw error;
  }
  return body;
}

async function rpc(baseUrl, serviceRoleKey, name, body) {
  const result = await requestJson(baseUrl, serviceRoleKey, `rpc/${name}`, {
    method: "POST",
    body,
  });
  return Array.isArray(result) ? result[0] ?? null : result;
}

export async function runGamePolicyProvisioning() {
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const bindings = assertPolicyBindings({
    projectRef: required("SUPABASE_PROJECT_REF"),
    expectedProjectRef: required("EXPECTED_STAGING_PROJECT_REF"),
    productionProjectRef: required("PRODUCTION_PROJECT_REF"),
    supabaseUrl: required("SUPABASE_URL").replace(/\/$/, ""),
    releaseCommit: required("RELEASE_COMMIT").toLowerCase(),
    targetGameName: required("TARGET_GAME_NAME"),
    targetGameIdSha256: required("TARGET_GAME_ID_SHA256").toLowerCase(),
  });
  const evidencePath = process.env.EVIDENCE_PATH || "/tmp/pr295-game-policy-provision.json";
  const games = await requestJson(
    bindings.supabaseUrl,
    serviceRoleKey,
    `game_sessions?select=id,name,status,lifecycle_state,owner_staff_user_id&name=${exact(bindings.targetGameName)}`,
  );
  const game = selectPolicyTargetGame(games, bindings);

  await rpc(bindings.supabaseUrl, serviceRoleKey, "set_admin_message_policy_v1", {
    p_game_session_id: game.id,
    p_staff_user_id: game.owner_staff_user_id,
    p_player_threads_enabled: MESSAGING_POLICY.playerThreadsEnabled,
    p_default_retention_days: MESSAGING_POLICY.defaultRetentionDays,
  });
  await rpc(bindings.supabaseUrl, serviceRoleKey, "set_marketplace_policy_admin_v2", {
    p_game_session_id: game.id,
    p_staff_user_id: game.owner_staff_user_id,
    p_marketplace_enabled: MARKETPLACE_POLICY.marketplaceEnabled,
    p_cross_country_trading_enabled: MARKETPLACE_POLICY.crossCountryTradingEnabled,
    p_moderation_required: MARKETPLACE_POLICY.moderationRequired,
    p_fee_rate: MARKETPLACE_POLICY.feeRate,
    p_tax_rate: MARKETPLACE_POLICY.taxRate,
    p_listing_duration_hours: MARKETPLACE_POLICY.listingDurationHours,
    p_purchase_reservation_minutes: MARKETPLACE_POLICY.purchaseReservationMinutes,
    p_dispute_window_days: MARKETPLACE_POLICY.disputeWindowDays,
    p_disputes_enabled: MARKETPLACE_POLICY.disputesEnabled,
    p_country_fee_overrides: MARKETPLACE_POLICY.countryFeeOverrides,
    p_blocked_country_codes: MARKETPLACE_POLICY.blockedCountryCodes,
  });

  const [messagingRows, marketplaceRows] = await Promise.all([
    requestJson(
      bindings.supabaseUrl,
      serviceRoleKey,
      `message_game_policies?select=player_threads_enabled,max_player_thread_participants,default_retention_days,attachments_enabled&game_session_id=${exact(game.id)}`,
    ),
    requestJson(
      bindings.supabaseUrl,
      serviceRoleKey,
      `marketplace_policies?select=marketplace_enabled,cross_country_trading_enabled,moderation_required,fee_rate,tax_rate,listing_duration_hours,purchase_reservation_minutes,dispute_window_days,disputes_enabled,country_fee_overrides,blocked_country_codes&game_session_id=${exact(game.id)}`,
    ),
  ]);
  if (!Array.isArray(messagingRows) || messagingRows.length !== 1) {
    throw new Error("Messaging policy did not resolve exactly once");
  }
  if (!Array.isArray(marketplaceRows) || marketplaceRows.length !== 1) {
    throw new Error("Marketplace policy did not resolve exactly once");
  }
  validatePolicyState({ messaging: messagingRows[0], marketplace: marketplaceRows[0] });

  const evidence = buildPolicyEvidence({
    generatedAt: new Date().toISOString(),
    sourceCommit: bindings.releaseCommit,
    workflowCommit: process.env.GITHUB_SHA ?? null,
    projectRef: bindings.projectRef,
    targetGameName: bindings.targetGameName,
    targetGameIdSha256: bindings.targetGameIdSha256,
  });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(evidence, null, 2));
  return evidence;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runGamePolicyProvisioning().catch(async (error) => {
    const failure = {
      schemaVersion: "econovaria-staging-game-policy-provision-failure-v1",
      generatedAt: new Date().toISOString(),
      error: safeError(error),
      status: Number.isInteger(error?.status) ? error.status : null,
      code: typeof error?.code === "string" ? error.code.slice(0, 120) : null,
      productionTouched: false,
      credentialsRecorded: false,
      rawInternalIdentifiersRecorded: false,
    };
    const evidencePath = process.env.EVIDENCE_PATH || "/tmp/pr295-game-policy-provision.json";
    await writeFile(evidencePath, `${JSON.stringify(failure, null, 2)}\n`, "utf8").catch(() => {});
    console.error(JSON.stringify(failure));
    process.exitCode = 1;
  });
}
