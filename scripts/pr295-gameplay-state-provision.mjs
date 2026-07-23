#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertGameplayProvisionBindings,
  buildGameplayEvidence,
  selectGameplayTargetGame,
  validateGameplayProvisionedState,
  validatePhysicalEconomyPack,
} from "./pr295-gameplay-state-provision-lib.mjs";

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function safeError(error) {
  return String(error?.message ?? error ?? "Unknown gameplay provisioning error")
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
      ...(options.count ? { Prefer: "count=exact", Range: "0-0" } : {}),
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
    const details = body && typeof body === "object" ? String(body.details ?? "") : "";
    const hint = body && typeof body === "object" ? String(body.hint ?? "") : "";
    const error = new Error(
      `Gameplay staging request failed (${response.status}:${code})` +
      `${message ? ` message=${message}` : ""}` +
      `${details ? ` details=${details}` : ""}` +
      `${hint ? ` hint=${hint}` : ""}`,
    );
    error.status = response.status;
    error.code = code;
    throw error;
  }
  if (!options.count) return body;
  const match = String(response.headers.get("content-range") ?? "").match(/\/(\d+)$/);
  if (!match) throw new Error("Gameplay staging count response is missing Content-Range");
  return Number(match[1]);
}

async function rpc(baseUrl, serviceRoleKey, name, body) {
  const result = await requestJson(baseUrl, serviceRoleKey, `rpc/${name}`, {
    method: "POST",
    body,
  });
  if (Array.isArray(result)) return result[0] ?? null;
  return result;
}

async function count(baseUrl, serviceRoleKey, resource) {
  return await requestJson(baseUrl, serviceRoleKey, `${resource}${resource.includes("?") ? "&" : "?"}select=id`, { count: true });
}

export async function runGameplayStateProvisioning() {
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const bindings = assertGameplayProvisionBindings({
    projectRef: required("SUPABASE_PROJECT_REF"),
    expectedProjectRef: required("EXPECTED_STAGING_PROJECT_REF"),
    productionProjectRef: required("PRODUCTION_PROJECT_REF"),
    supabaseUrl: required("SUPABASE_URL").replace(/\/$/, ""),
    releaseCommit: required("RELEASE_COMMIT").toLowerCase(),
    targetGameName: required("TARGET_GAME_NAME"),
    targetGameIdSha256: required("TARGET_GAME_ID_SHA256").toLowerCase(),
  });
  const packPath = path.resolve(required("PHYSICAL_ECONOMY_PACK_PATH"));
  const evidencePath = process.env.EVIDENCE_PATH || "/tmp/pr295-gameplay-state-provision.json";
  const pack = JSON.parse(await readFile(packPath, "utf8"));
  const packIdentity = validatePhysicalEconomyPack(pack, bindings.releaseCommit);

  const games = await requestJson(
    bindings.supabaseUrl,
    serviceRoleKey,
    `game_sessions?select=id,name,status,lifecycle_state,owner_staff_user_id&name=${exact(bindings.targetGameName)}`,
  );
  const game = selectGameplayTargetGame(games, bindings);
  const importIdempotencyKey = `pr295.physical.import.${bindings.releaseCommit.slice(0, 12)}.${bindings.targetGameIdSha256.slice(0, 12)}`;
  const activationIdempotencyKey = `pr295.physical.activate.${bindings.releaseCommit.slice(0, 12)}.${bindings.targetGameIdSha256.slice(0, 12)}`;

  const importOutcome = await rpc(bindings.supabaseUrl, serviceRoleKey, "import_physical_economy_pack_v1", {
    p_game_session_id: game.id,
    p_staff_user_id: game.owner_staff_user_id,
    p_pack: pack,
    p_content_digest: packIdentity.contentDigest,
    p_idempotency_key: importIdempotencyKey,
  });
  const activationOutcome = await rpc(bindings.supabaseUrl, serviceRoleKey, "activate_physical_economy_pack_v1", {
    p_game_session_id: game.id,
    p_staff_user_id: game.owner_staff_user_id,
    p_pack_key: packIdentity.packKey,
    p_content_version: packIdentity.contentVersion,
    p_idempotency_key: activationIdempotencyKey,
  });

  const activePlayers = await requestJson(
    bindings.supabaseUrl,
    serviceRoleKey,
    `players?select=id&game_session_id=${exact(game.id)}&status=eq.active&order=created_at.asc`,
  );
  if (!Array.isArray(activePlayers) || activePlayers.length === 0) throw new Error("No active Players found for Progression initialization");
  for (const player of activePlayers) {
    await rpc(bindings.supabaseUrl, serviceRoleKey, "ensure_player_progression_profile_v1", {
      p_game_session_id: game.id,
      p_player_id: player.id,
    });
  }

  const contentPacks = await requestJson(
    bindings.supabaseUrl,
    serviceRoleKey,
    `physical_economy_content_packs?select=id,pack_key,content_version,content_digest,status&pack_key=${exact(packIdentity.packKey)}&content_version=${exact(packIdentity.contentVersion)}&content_digest=${exact(packIdentity.contentDigest)}`,
  );
  if (!Array.isArray(contentPacks) || contentPacks.length !== 1) throw new Error("Physical economy content pack did not resolve exactly once");
  const contentPack = contentPacks[0];
  const packLinks = await requestJson(
    bindings.supabaseUrl,
    serviceRoleKey,
    `game_session_physical_economy_packs?select=status,pack_id&game_session_id=${exact(game.id)}&pack_id=${exact(contentPack.id)}`,
  );
  if (!Array.isArray(packLinks) || packLinks.length !== 1) throw new Error("Game physical economy pack link did not resolve exactly once");
  const packLink = packLinks[0];

  const itemCount = await count(bindings.supabaseUrl, serviceRoleKey, `physical_economy_item_definitions?pack_id=${exact(contentPack.id)}`);
  const activeItemCount = await count(bindings.supabaseUrl, serviceRoleKey, `physical_economy_item_definitions?pack_id=${exact(contentPack.id)}&status=eq.active`);
  const recipeCount = await count(bindings.supabaseUrl, serviceRoleKey, `game_session_recipe_availability?game_session_id=${exact(game.id)}`);
  const enabledRecipeCount = await count(bindings.supabaseUrl, serviceRoleKey, `game_session_recipe_availability?game_session_id=${exact(game.id)}&enabled=eq.true`);
  const supplyCount = await count(bindings.supabaseUrl, serviceRoleKey, `game_session_item_supply?game_session_id=${exact(game.id)}&country_code=eq.*`);
  const progressionProfileCount = await count(bindings.supabaseUrl, serviceRoleKey, `player_progression_profiles?game_session_id=${exact(game.id)}`);
  const reputationCount = await count(bindings.supabaseUrl, serviceRoleKey, `player_reputation_scores?game_session_id=${exact(game.id)}`);

  validateGameplayProvisionedState({
    packLink,
    contentPack,
    itemCount,
    activeItemCount,
    recipeCount,
    enabledRecipeCount,
    supplyCount,
    activePlayerCount: activePlayers.length,
    progressionProfileCount,
    reputationCount,
    packIdentity,
  });

  const verification = {
    activePlayers: activePlayers.length,
    physicalItems: itemCount,
    activePhysicalItems: activeItemCount,
    recipes: recipeCount,
    enabledRecipes: enabledRecipeCount,
    regulatedRecipes: packIdentity.regulatedRecipeCount,
    supplyRows: supplyCount,
    progressionProfiles: progressionProfileCount,
    reputationRows: reputationCount,
  };
  const evidence = buildGameplayEvidence({
    generatedAt: new Date().toISOString(),
    sourceCommit: bindings.releaseCommit,
    workflowCommit: process.env.GITHUB_SHA ?? null,
    projectRef: bindings.projectRef,
    targetGameName: bindings.targetGameName,
    targetGameIdSha256: bindings.targetGameIdSha256,
    packIdentity,
    importOutcome,
    activationOutcome,
    verification,
  });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(evidence, null, 2));
  return evidence;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runGameplayStateProvisioning().catch(async (error) => {
    const failure = {
      schemaVersion: "econovaria-gameplay-state-provision-failure-v1",
      generatedAt: new Date().toISOString(),
      error: safeError(error),
      status: Number.isInteger(error?.status) ? error.status : null,
      code: typeof error?.code === "string" ? error.code.slice(0, 120) : null,
      productionTouched: false,
      credentialsRecorded: false,
      rawInternalIdentifiersRecorded: false,
    };
    const evidencePath = process.env.EVIDENCE_PATH || "/tmp/pr295-gameplay-state-provision.json";
    await writeFile(evidencePath, `${JSON.stringify(failure, null, 2)}\n`, "utf8").catch(() => {});
    console.error(JSON.stringify(failure));
    process.exitCode = 1;
  });
}
