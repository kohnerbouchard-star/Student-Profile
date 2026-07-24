#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runImporter } from "./seed-beta-importer.mjs";
import {
  assertExactStagingBindings,
  buildSanitizedProvisioningEvidence,
  selectExactTargetGame,
  summarizeCountryCounts,
  summarizeMemberCounts,
  validatePackBundle,
  validateProvisionedState,
} from "./pr295-persistent-staging-provision-lib.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const PACK_ROOT = path.join(REPO_ROOT, "docs", "seed-content", "executable", "beta-pack-v1");

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function safeError(error) {
  return String(error?.message ?? error ?? "Unknown provisioning error")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "[uuid-redacted]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[key-redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]");
}

async function readJson(name) {
  return JSON.parse(await readFile(path.join(PACK_ROOT, name), "utf8"));
}

async function requestJson(baseUrl, serviceRoleKey, resource, { count = false } = {}) {
  const response = await fetch(`${baseUrl}/rest/v1/${resource}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(count ? { Prefer: "count=exact", Range: "0-0" } : {}),
    },
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
    throw new Error(`Connected staging read failed (${response.status}:${code})`);
  }
  if (!count) return body;
  const match = String(response.headers.get("content-range") ?? "").match(/\/(\d+)$/);
  if (!match) throw new Error("Connected staging count response is missing Content-Range");
  return Number(match[1]);
}

function exactFilter(value) {
  return encodeURIComponent(`eq.${value}`);
}

async function resolveTargetGame(bindings, serviceRoleKey) {
  const resource = `game_sessions?select=id,name,status,lifecycle_state&name=${exactFilter(bindings.targetGameName)}`;
  const rows = await requestJson(bindings.supabaseUrl, serviceRoleKey, resource);
  return selectExactTargetGame(rows, bindings);
}

async function verifyConnectedState({ bindings, serviceRoleKey, game, pack }) {
  const gameFilter = exactFilter(game.id);
  const packFilter = exactFilter(pack.packId);
  const releases = await requestJson(
    bindings.supabaseUrl,
    serviceRoleKey,
    `seed_content_releases?select=id,status,operation_count,pack_id,version,pack_sha256&game_session_id=${gameFilter}&pack_id=${packFilter}`,
  );
  if (!Array.isArray(releases) || releases.length !== 1) {
    throw new Error("Persistent seed release did not resolve to exactly one journal row");
  }
  const release = releases[0];
  if (release.version !== pack.version || release.pack_sha256 !== pack.packSha256) {
    throw new Error("Persistent seed release identity does not match the canonical pack");
  }

  const members = await requestJson(
    bindings.supabaseUrl,
    serviceRoleKey,
    `seed_content_release_members?select=object_type&release_id=${exactFilter(release.id)}&order=object_type.asc,stable_key.asc&limit=1000`,
  );
  const memberCounts = summarizeMemberCounts(members);

  const activeAssets = await requestJson(
    bindings.supabaseUrl,
    serviceRoleKey,
    `game_session_stock_assets?select=country_code&game_session_id=${gameFilter}&is_active=eq.true&order=country_code.asc,ticker.asc&limit=500`,
  );
  const countryCounts = summarizeCountryCounts(activeAssets);
  const activePublicContractCount = await requestJson(
    bindings.supabaseUrl,
    serviceRoleKey,
    `game_session_contracts?select=id&game_session_id=${gameFilter}&status=eq.active&visibility=eq.public`,
    { count: true },
  );
  const activeVisibleStoreItemCount = await requestJson(
    bindings.supabaseUrl,
    serviceRoleKey,
    `store_items?select=id&game_session_id=${gameFilter}&status=eq.active&visibility=eq.visible`,
    { count: true },
  );

  validateProvisionedState({
    release,
    memberCounts,
    countryCounts,
    activeAssetCount: activeAssets.length,
    activePublicContractCount,
    activeVisibleStoreItemCount,
  });

  return {
    release,
    memberCounts,
    countryCounts,
    activeAssetCount: activeAssets.length,
    activePublicContractCount,
    activeVisibleStoreItemCount,
  };
}

export async function runPersistentStagingProvisioning() {
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const bindings = assertExactStagingBindings({
    supabaseUrl: required("SUPABASE_URL").replace(/\/$/, ""),
    projectRef: required("SUPABASE_PROJECT_REF"),
    expectedProjectRef: required("EXPECTED_STAGING_PROJECT_REF"),
    productionProjectRef: required("PRODUCTION_PROJECT_REF"),
    releaseCommit: required("RELEASE_COMMIT").toLowerCase(),
    targetGameName: required("TARGET_GAME_NAME"),
    targetGameIdSha256: required("TARGET_GAME_ID_SHA256").toLowerCase(),
  });
  const approvedBy = required("PROVISION_APPROVED_BY");
  const evidencePath = process.env.EVIDENCE_PATH || "/tmp/pr295-persistent-staging-provision.json";
  const workflowCommit = String(process.env.GITHUB_SHA ?? "").trim() || null;

  const [pack, integrity, market, contracts, store] = await Promise.all([
    readJson("pack-v1.json"),
    readJson("integrity-manifest-v1.json"),
    readJson("market-templates-v1.json"),
    readJson("tutorial-contract-chains-v1.json"),
    readJson("store-catalog-v1.json"),
  ]);
  const packIdentity = validatePackBundle({ pack, integrity, market, contracts, store });
  const game = await resolveTargetGame(bindings, serviceRoleKey);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "pr295-persistent-provision-"));
  const authorizationPath = path.join(temporaryRoot, "activation-authorization.json");
  const now = Date.now();
  const authorization = {
    schemaVersion: "econovaria-beta-seed-activation-authorization-v2",
    authorizationId: `pr295-persistent-${bindings.releaseCommit.slice(0, 12)}-${bindings.targetGameIdSha256.slice(0, 12)}`,
    allowActivation: true,
    productionAuthorized: false,
    environment: "staging",
    projectRef: bindings.projectRef,
    gameSessionId: game.id,
    sourceSha: bindings.releaseCommit,
    packId: packIdentity.packId,
    version: packIdentity.version,
    packSha256: packIdentity.packSha256,
    approvedBy,
    approvedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 30 * 60_000).toISOString(),
  };

  try {
    await writeFile(authorizationPath, `${JSON.stringify(authorization, null, 2)}\n`, "utf8");
    process.env.SEED_TARGET_ENVIRONMENT = "staging";
    process.env.SEED_PRODUCTION_PROJECT_REF = required("PRODUCTION_PROJECT_REF");

    const importResult = await runImporter({
      mode: "import",
      environment: "staging",
      "pack-root": PACK_ROOT,
      "audit-root": temporaryRoot,
      "expected-project-ref": bindings.projectRef,
      "game-session-id": game.id,
      "source-sha": bindings.releaseCommit,
      activate: true,
      authorization: authorizationPath,
    });

    const verified = await verifyConnectedState({
      bindings,
      serviceRoleKey,
      game,
      pack: packIdentity,
    });
    const evidence = buildSanitizedProvisioningEvidence({
      generatedAt: new Date().toISOString(),
      releaseCommit: bindings.releaseCommit,
      workflowCommit,
      projectRef: bindings.projectRef,
      targetGameName: bindings.targetGameName,
      targetGameIdSha256: bindings.targetGameIdSha256,
      pack: packIdentity,
      outcome: importResult.outcome,
      memberCounts: verified.memberCounts,
      countryCounts: verified.countryCounts,
      activeAssetCount: verified.activeAssetCount,
      activePublicContractCount: verified.activePublicContractCount,
      activeVisibleStoreItemCount: verified.activeVisibleStoreItemCount,
    });
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(evidence, null, 2));
    return evidence;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPersistentStagingProvisioning().catch((error) => {
    console.error(JSON.stringify({
      error: safeError(error),
      productionTouched: false,
      credentialsRecorded: false,
      rawInternalIdentifiersRecorded: false,
    }));
    process.exitCode = 1;
  });
}
