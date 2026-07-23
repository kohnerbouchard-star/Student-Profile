#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PACK_ID,
  PACK_VERSION,
  buildCountryRuntime,
  buildWorldPublication,
  sha256,
  validateWorldConnectedState,
} from "./world-staging-provision-lib.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const PACK_ROOT = path.join(REPO_ROOT, "docs", "seed-content", "executable", "beta-pack-v1");
const CONTRACT_PATH = path.join(REPO_ROOT, "docs", "operations", "contracts", "beta-seed-downstream-consumer-contract-v1.json");

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function safeError(error) {
  return String(error?.message ?? error ?? "Unknown World provisioning error")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "[uuid-redacted]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[key-redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
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
    const code = body && typeof body === "object" ? body.code ?? "unknown" : "non_json";
    throw new Error(`World staging request failed (${response.status}:${code})`);
  }
  if (!options.count) return body;
  const match = String(response.headers.get("content-range") ?? "").match(/\/(\d+)$/);
  if (!match) throw new Error("World staging count response is missing Content-Range");
  return Number(match[1]);
}

function exact(value) {
  return encodeURIComponent(`eq.${value}`);
}

async function resolveTargetGame(baseUrl, serviceRoleKey, targetGameName, targetGameIdSha256) {
  const rows = await requestJson(
    baseUrl,
    serviceRoleKey,
    `game_sessions?select=id,name,status,lifecycle_state&name=${exact(targetGameName)}`,
  );
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("World target game must resolve to exactly one row");
  const game = rows[0];
  if (sha256(game.id) !== targetGameIdSha256) throw new Error("World target game hash binding failed");
  if (game.status !== "active" || game.lifecycle_state !== "active") throw new Error("World target game is not active");
  return game;
}

async function rpc(baseUrl, serviceRoleKey, name, body) {
  const result = await requestJson(baseUrl, serviceRoleKey, `rpc/${name}`, { method: "POST", body });
  if (Array.isArray(result)) return result[0] ?? null;
  return result;
}

async function count(baseUrl, serviceRoleKey, table, gameId) {
  return await requestJson(
    baseUrl,
    serviceRoleKey,
    `${table}?select=id&game_session_id=${exact(gameId)}`,
    { count: true },
  );
}

export async function runWorldStagingProvisioning() {
  const projectRef = required("SUPABASE_PROJECT_REF");
  const expectedProjectRef = required("EXPECTED_STAGING_PROJECT_REF");
  const productionProjectRef = required("PRODUCTION_PROJECT_REF");
  const baseUrl = required("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const targetGameName = required("TARGET_GAME_NAME");
  const targetGameIdSha256 = required("TARGET_GAME_ID_SHA256").toLowerCase();
  const sourceCommit = required("RELEASE_COMMIT").toLowerCase();
  const evidencePath = process.env.EVIDENCE_PATH || "/tmp/world-staging-provision.json";

  if (projectRef !== expectedProjectRef) throw new Error("World provisioning is not bound to the exact staging project");
  if (projectRef === productionProjectRef) throw new Error("Production World provisioning is prohibited");
  if (baseUrl !== `https://${projectRef}.supabase.co`) throw new Error("SUPABASE_URL does not match staging project");
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error("RELEASE_COMMIT must be an exact Git SHA");
  if (!/^[a-f0-9]{64}$/.test(targetGameIdSha256)) throw new Error("TARGET_GAME_ID_SHA256 is invalid");

  const [downstreamContract, locationRegistry, calibration] = await Promise.all([
    readJson(CONTRACT_PATH),
    readJson(path.join(PACK_ROOT, "location-registry-verified-v1.json")),
    readJson(path.join(PACK_ROOT, "calibration-scenarios-v1.json")),
  ]);
  const publication = buildWorldPublication({ downstreamContract, locations: locationRegistry, calibration });
  const game = await resolveTargetGame(baseUrl, serviceRoleKey, targetGameName, targetGameIdSha256);
  const countryProfiles = await requestJson(
    baseUrl,
    serviceRoleKey,
    "country_profiles?select=id,country_code,country_name,capital_name,currency_code,status&status=eq.active&order=country_code.asc",
  );
  const countryRuntime = buildCountryRuntime({ downstreamContract, locationRegistry, countryProfiles });
  const initializedAt = new Date().toISOString();

  const worldOutcome = await rpc(baseUrl, serviceRoleKey, "initialize_world_runtime_v1", {
    p_game_session_id: game.id,
    p_pack_id: PACK_ID,
    p_pack_version: PACK_VERSION,
    p_definition_digest: publication.definition.definitionDigest,
    p_locations: publication.locations,
    p_routes: publication.routes,
    p_initialized_at: initializedAt,
  });
  const countryOutcome = await rpc(baseUrl, serviceRoleKey, "initialize_world_country_runtime_v2", {
    p_game_session_id: game.id,
    p_countries: countryRuntime.countries,
    p_class_grants: countryRuntime.classGrants,
  });
  const assignmentMirror = await rpc(baseUrl, serviceRoleKey, "assert_player_country_assignment_compatibility_v1", {
    p_game_session_id: game.id,
  });

  const connected = {
    runtimeCount: await count(baseUrl, serviceRoleKey, "world_runtime_instances", game.id),
    locationCount: await count(baseUrl, serviceRoleKey, "world_location_states", game.id),
    routeCount: await count(baseUrl, serviceRoleKey, "world_route_states", game.id),
    countryCount: await count(baseUrl, serviceRoleKey, "world_country_runtime", game.id),
    grantCount: await count(baseUrl, serviceRoleKey, "arrival_class_grant_runtime", game.id),
  };
  validateWorldConnectedState({ ...connected, assignmentMirror });

  const evidence = {
    schemaVersion: "econovaria-world-staging-provision-v1",
    generatedAt: new Date().toISOString(),
    sourceCommit,
    workflowCommit: process.env.GITHUB_SHA ?? null,
    project: { ref: projectRef, environment: "staging", production: false },
    targetGame: { name: targetGameName, idSha256: targetGameIdSha256, rawIdRecorded: false },
    definition: {
      packId: PACK_ID,
      packVersion: PACK_VERSION,
      definitionDigest: publication.definition.definitionDigest,
      publicationDigest: publication.publicationDigest,
    },
    outcomes: {
      world: String(worldOutcome?.initialization_outcome ?? "unknown"),
      countries: String(countryOutcome?.initialization_outcome ?? "unknown"),
    },
    verification: {
      worldRuntimeInstances: connected.runtimeCount,
      locations: connected.locationCount,
      routes: connected.routeCount,
      countries: connected.countryCount,
      arrivalClassGrants: connected.grantCount,
      activeCountryAssignments: Number(assignmentMirror?.active_assignment_count ?? 0),
      mirroredPlayers: Number(assignmentMirror?.mirrored_player_count ?? 0),
      assignmentMismatches: Number(assignmentMirror?.mismatch_count ?? -1),
    },
    safety: {
      productionDenied: true,
      idempotentInitialization: ["initialized", "replayed"].includes(String(worldOutcome?.initialization_outcome ?? "")) &&
        ["initialized", "replayed"].includes(String(countryOutcome?.initialization_outcome ?? "")),
      playerHistoryDeleted: false,
      credentialsRecorded: false,
      rawInternalIdentifiersRecorded: false,
    },
  };
  const serialized = JSON.stringify(evidence);
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized)) {
    throw new Error("World provisioning evidence contains a raw UUID");
  }
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(evidence, null, 2));
  return evidence;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runWorldStagingProvisioning().catch((error) => {
    console.error(JSON.stringify({
      error: safeError(error),
      productionTouched: false,
      credentialsRecorded: false,
      rawInternalIdentifiersRecorded: false,
    }));
    process.exitCode = 1;
  });
}
