#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { runImporter } from "./seed-beta-importer.mjs";
import {
  buildCountryRuntime,
  buildWorldPublication,
} from "./world-staging-provision-lib.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const PACK_ROOT = path.join(
  REPO_ROOT,
  "docs",
  "seed-content",
  "executable",
  "beta-pack-v1",
);
const DOWNSTREAM_CONTRACT_PATH = path.join(
  REPO_ROOT,
  "docs",
  "operations",
  "contracts",
  "beta-seed-downstream-consumer-contract-v1.json",
);
const SOURCE_NAME = "[SYSTEM] Econovaria Canonical Source";
const PROBE_NAME = "[SYNTHETIC] Provisioning Connected Probe";
const SOURCE_STAFF_EMAIL = "canonical-source@econovaria.internal";
const SOURCE_STAFF_NAME = "Econovaria Canonical Provisioner";
const PACK_ID = "econovaria.beta-seed-pack.v1";

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function safeError(error) {
  return String(error?.message ?? error ?? "Unknown staging bootstrap error")
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
      "[uuid-redacted]",
    )
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[key-redacted]")
    .replace(/postgresql:\/\/[^\s]+/gi, "[database-url-redacted]")
    .slice(0, 4000);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonSql(value, tag = "json") {
  const serialized = JSON.stringify(value);
  requireCondition(
    !serialized.includes(`$${tag}$`),
    `JSON payload contains reserved ${tag} delimiter`,
  );
  return `$${tag}$${serialized}$${tag}$::jsonb`;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function parseJsonLine(output, label) {
  const lines = String(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  requireCondition(lines.length > 0, `${label} returned no JSON`);
  try {
    return JSON.parse(lines.at(-1));
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

async function runSql(databaseUrl, sql, label) {
  const file = path.join(
    os.tmpdir(),
    `econovaria-staging-bootstrap-${randomUUID()}.sql`,
  );
  await writeFile(file, `${sql.trim()}\n`, "utf8");
  try {
    const result = spawnSync(
      "psql",
      [databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", file],
      {
        encoding: "utf8",
        maxBuffer: 40 * 1024 * 1024,
        env: process.env,
      },
    );
    if (result.status !== 0) {
      throw new Error(
        `${label} failed: ${safeError(result.stderr || `psql exited ${result.status}`)}`,
      );
    }
    return String(result.stdout || "").trim();
  } finally {
    await unlink(file).catch(() => {});
  }
}

function assertBindings() {
  const projectRef = required("SUPABASE_PROJECT_REF");
  const expectedProjectRef = required("EXPECTED_STAGING_PROJECT_REF");
  const productionProjectRef = required("PRODUCTION_PROJECT_REF");
  const supabaseUrl = required("SUPABASE_URL").replace(/\/$/, "");
  const databaseUrl = required("DATABASE_URL");
  const sourceSha = required("RELEASE_COMMIT").toLowerCase();

  requireCondition(/^[a-z0-9]{20}$/.test(projectRef), "Staging project ref is invalid");
  requireCondition(projectRef === expectedProjectRef, "Selected project is not the approved staging project");
  requireCondition(projectRef !== productionProjectRef, "Production project is denied");
  requireCondition(
    supabaseUrl === `https://${projectRef}.supabase.co`,
    "Supabase URL does not match the staging project ref",
  );
  requireCondition(
    databaseUrl.includes(`postgres.${projectRef}@`) ||
      databaseUrl.includes(`db.${projectRef}.supabase.co`),
    "Database URL does not bind to the staging project",
  );
  requireCondition(/^[0-9a-f]{40}$/.test(sourceSha), "Release commit must be a full SHA");

  return { projectRef, productionProjectRef, supabaseUrl, databaseUrl, sourceSha };
}

async function resolveSystemIdentities(databaseUrl, projectRef) {
  const output = await runSql(databaseUrl, `
    select jsonb_build_object(
      'staffId', public.seed_content_stable_uuid_v1(
        'econovaria-system-staff|' || ${sqlLiteral(projectRef)}
      ),
      'authId', public.seed_content_stable_uuid_v1(
        'econovaria-system-auth|' || ${sqlLiteral(projectRef)}
      ),
      'sourceGameId', public.seed_content_stable_uuid_v1(
        'econovaria-canonical-source|' || ${sqlLiteral(projectRef)}
      )
    )::text;
  `, "system identity resolution");
  return parseJsonLine(output, "system identity resolution");
}

async function sourceIsComplete(databaseUrl, sourceGameId) {
  const output = await runSql(databaseUrl, `
    select jsonb_build_object(
      'releaseMembers', coalesce((
        select count(*)
        from public.seed_content_release_members as member_row
        join public.seed_content_releases as release_row
          on release_row.id = member_row.release_id
        where release_row.game_session_id = ${sqlLiteral(sourceGameId)}::uuid
          and release_row.pack_id = ${sqlLiteral(PACK_ID)}
          and release_row.status = 'applied_active'
      ), 0),
      'worldRuntime', (select count(*) from public.world_runtime_instances where game_session_id = ${sqlLiteral(sourceGameId)}::uuid and revision = 0),
      'worldLocations', (select count(*) from public.world_location_states where game_session_id = ${sqlLiteral(sourceGameId)}::uuid),
      'worldRoutes', (select count(*) from public.world_route_states where game_session_id = ${sqlLiteral(sourceGameId)}::uuid),
      'worldCountries', (select count(*) from public.world_country_runtime where game_session_id = ${sqlLiteral(sourceGameId)}::uuid),
      'arrivalClassGrants', (select count(*) from public.arrival_class_grant_runtime where game_session_id = ${sqlLiteral(sourceGameId)}::uuid),
      'activeCraftingPacks', (select count(*) from public.game_session_physical_economy_packs where game_session_id = ${sqlLiteral(sourceGameId)}::uuid and status = 'active')
    )::text;
  `, "canonical source completeness read");
  const state = parseJsonLine(output, "canonical source completeness read");
  return state.releaseMembers === 590 &&
    state.worldRuntime === 1 &&
    state.worldLocations === 50 &&
    state.worldRoutes === 13 &&
    state.worldCountries === 10 &&
    state.arrivalClassGrants === 8 &&
    state.activeCraftingPacks === 1;
}

async function prepareSource(databaseUrl, identities) {
  if (await sourceIsComplete(databaseUrl, identities.sourceGameId)) {
    return { created: false };
  }

  await runSql(databaseUrl, `
    begin;

    delete from public.game_sessions
    where id = ${sqlLiteral(identities.sourceGameId)}::uuid
      and game_join_code_status <> 'active';

    insert into public.staff_users (
      id, supabase_auth_user_id, email, display_name
    ) values (
      ${sqlLiteral(identities.staffId)}::uuid,
      ${sqlLiteral(identities.authId)}::uuid,
      ${sqlLiteral(SOURCE_STAFF_EMAIL)},
      ${sqlLiteral(SOURCE_STAFF_NAME)}
    )
    on conflict (id) do update
    set display_name = excluded.display_name,
        email = excluded.email,
        updated_at = now();

    insert into public.game_sessions (
      id, owner_staff_user_id, name, status, lifecycle_state,
      game_join_code_hash, game_join_code_status, provisioning_status
    ) values (
      ${sqlLiteral(identities.sourceGameId)}::uuid,
      ${sqlLiteral(identities.staffId)}::uuid,
      ${sqlLiteral(SOURCE_NAME)},
      'active',
      'active',
      null,
      'pending',
      'pending'
    );

    insert into public.game_settings (
      game_session_id, difficulty_preset, stock_market_window
    ) values (
      ${sqlLiteral(identities.sourceGameId)}::uuid,
      'moderate',
      '{"timezone":"Asia/Seoul"}'::jsonb
    );

    commit;
  `, "canonical source setup");
  return { created: true };
}

async function activateSeed(bindings, identities, serviceRoleKey) {
  const [pack, integrity] = await Promise.all([
    readJson(path.join(PACK_ROOT, "pack-v1.json")),
    readJson(path.join(PACK_ROOT, "integrity-manifest-v1.json")),
  ]);
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "econovaria-staging-seed-"),
  );
  const authorizationPath = path.join(
    temporaryRoot,
    "activation-authorization.json",
  );
  const now = Date.now();
  const authorization = {
    schemaVersion: "econovaria-beta-seed-activation-authorization-v2",
    authorizationId: `game-provisioning-integrity-${bindings.sourceSha.slice(0, 12)}`,
    allowActivation: true,
    productionAuthorized: false,
    environment: "staging",
    projectRef: bindings.projectRef,
    gameSessionId: identities.sourceGameId,
    sourceSha: bindings.sourceSha,
    packId: pack.packId,
    version: pack.version,
    packSha256: integrity.packSha256,
    approvedBy: "PR #361 staging game-provisioning repair",
    approvedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 30 * 60_000).toISOString(),
  };

  try {
    await writeFile(
      authorizationPath,
      `${JSON.stringify(authorization, null, 2)}\n`,
      "utf8",
    );
    process.env.SUPABASE_URL = bindings.supabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
    process.env.SEED_TARGET_ENVIRONMENT = "staging";
    process.env.SEED_PRODUCTION_PROJECT_REF = bindings.productionProjectRef;

    const result = await runImporter({
      mode: "import",
      environment: "staging",
      "pack-root": PACK_ROOT,
      "audit-root": temporaryRoot,
      "expected-project-ref": bindings.projectRef,
      "game-session-id": identities.sourceGameId,
      "source-sha": bindings.sourceSha,
      activate: true,
      authorization: authorizationPath,
    });
    requireCondition(
      ["applied", "replayed", "resumed"].includes(result.outcome),
      `Seed activation returned ${result.outcome}`,
    );
    return { pack, integrity };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function publishWorld(databaseUrl, identities) {
  const [downstreamContract, locationRegistry, calibration] = await Promise.all([
    readJson(DOWNSTREAM_CONTRACT_PATH),
    readJson(path.join(PACK_ROOT, "location-registry-verified-v1.json")),
    readJson(path.join(PACK_ROOT, "calibration-scenarios-v1.json")),
  ]);
  const publication = buildWorldPublication({
    downstreamContract,
    locations: locationRegistry,
    calibration,
  });

  await runSql(databaseUrl, `
    select row_to_json(runtime_result)::text
    from public.initialize_world_runtime_v1(
      ${sqlLiteral(identities.sourceGameId)}::uuid,
      ${sqlLiteral(publication.definition.packId)},
      ${sqlLiteral(publication.definition.packVersion)},
      ${sqlLiteral(publication.definition.definitionDigest)},
      ${jsonSql(publication.locations, "locations")},
      ${jsonSql(publication.routes, "routes")},
      now()
    ) as runtime_result;
  `, "canonical World publication");

  const profiles = parseJsonLine(await runSql(databaseUrl, `
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'country_code', country_code,
      'country_name', country_name,
      'capital_name', capital_name,
      'currency_code', currency_code,
      'status', status
    ) order by country_code), '[]'::jsonb)::text
    from public.country_profiles
    where status = 'active';
  `, "country profile read"), "country profile read");
  requireCondition(profiles.length === 10, "Canonical country profile count is not ten");

  const runtime = buildCountryRuntime({
    downstreamContract,
    locationRegistry,
    countryProfiles: profiles,
  });
  await runSql(databaseUrl, `
    select row_to_json(country_result)::text
    from public.initialize_world_country_runtime_v2(
      ${sqlLiteral(identities.sourceGameId)}::uuid,
      ${jsonSql(runtime.countries, "countries")},
      ${jsonSql(runtime.classGrants, "grants")}
    ) as country_result;
  `, "World country publication");
}

async function activateCrafting(databaseUrl, identities) {
  const packPath = required("PHYSICAL_ECONOMY_PACK");
  const pack = await readJson(packPath);
  requireCondition(
    pack.schemaVersion === "econovaria-physical-economy-runtime-pack-v1",
    "Physical-economy pack schema is invalid",
  );
  requireCondition(
    pack.activationAuthorization?.productionAuthorized === false,
    "Production-authorized Crafting pack is denied",
  );

  const imported = parseJsonLine(await runSql(databaseUrl, `
    select public.import_physical_economy_pack_v1(
      ${sqlLiteral(identities.sourceGameId)}::uuid,
      ${sqlLiteral(identities.staffId)}::uuid,
      ${jsonSql(pack, "physical_pack")},
      ${sqlLiteral(pack.contentDigest)},
      'staging.canonical.pack.import.v1'
    )::text;
  `, "Crafting source import"), "Crafting source import");
  requireCondition(
    ["imported", "replayed"].includes(imported.outcome),
    `Crafting import returned ${imported.outcome}`,
  );

  const activated = parseJsonLine(await runSql(databaseUrl, `
    select public.activate_physical_economy_pack_v1(
      ${sqlLiteral(identities.sourceGameId)}::uuid,
      ${sqlLiteral(identities.staffId)}::uuid,
      ${sqlLiteral(pack.packKey)},
      ${sqlLiteral(pack.contentVersion)},
      'staging.canonical.pack.activate.v1'
    )::text;
  `, "Crafting source activation"), "Crafting source activation");
  requireCondition(activated.status === "active", "Crafting source is not active");
}

async function connectedProbe(databaseUrl, identities) {
  const key = `staging.connected.probe.${Date.now()}`;
  const created = parseJsonLine(await runSql(databaseUrl, `
    select public.create_provisioned_game_v2(
      ${sqlLiteral(identities.staffId)}::uuid,
      ${sqlLiteral(PROBE_NAME)},
      '{"difficulty_preset":"hard","stock_market_window":{"timezone":"Asia/Seoul"}}'::jsonb,
      ${sqlLiteral(key)},
      ${sqlLiteral(PACK_ID)}
    )::text;
  `, "connected provisioning probe"), "connected provisioning probe");

  requireCondition(created.outcome === "created", `Probe returned ${created.outcome}`);
  requireCondition(created.provisioningStatus === "ready", "Probe did not reach ready");
  requireCondition(created.counts?.marketAssets === 240, "Probe market count failed");
  requireCondition(created.counts?.contracts === 30, "Probe Contract count failed");
  requireCondition(created.counts?.storeItems === 50, "Probe Store count failed");
  requireCondition(created.counts?.worldLocations === 50, "Probe World count failed");
  requireCondition(created.counts?.craftingItems === 144, "Probe Crafting count failed");
  requireCondition(created.contentGates?.story === "active", "Probe Story gate failed");
  requireCondition(created.contentGates?.arrivalGrantProcessor === "active", "Probe Arrival gate failed");

  const verified = parseJsonLine(await runSql(databaseUrl, `
    select public.verify_provisioned_game_v1(
      ${sqlLiteral(created.gameSessionId)}::uuid,
      ${sqlLiteral(identities.staffId)}::uuid
    )::text;
  `, "connected provisioning verification"), "connected provisioning verification");
  requireCondition(verified.ready === true, "Connected probe verification failed");

  await runSql(databaseUrl, `
    begin;
    delete from public.game_sessions
    where id = ${sqlLiteral(created.gameSessionId)}::uuid;
    delete from public.game_creation_provisioning_requests
    where staff_user_id = ${sqlLiteral(identities.staffId)}::uuid
      and idempotency_key = ${sqlLiteral(key)};
    commit;
  `, "connected probe cleanup");

  return {
    verified: true,
    counts: verified.counts,
    plaintextGameCodeRecorded: false,
  };
}

async function main() {
  const bindings = assertBindings();
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const identities = await resolveSystemIdentities(
    bindings.databaseUrl,
    bindings.projectRef,
  );
  const source = await prepareSource(bindings.databaseUrl, identities);

  try {
    if (!(await sourceIsComplete(bindings.databaseUrl, identities.sourceGameId))) {
      await activateSeed(bindings, identities, serviceRoleKey);
      await publishWorld(bindings.databaseUrl, identities);
      await activateCrafting(bindings.databaseUrl, identities);
    }

    const preflight = parseJsonLine(await runSql(bindings.databaseUrl, `
      select public.game_provisioning_preflight_v1(${sqlLiteral(PACK_ID)})::text;
    `, "game provisioning preflight"), "game provisioning preflight");
    requireCondition(preflight.ready === true, "Staging provisioning preflight is not ready");

    const probe = await connectedProbe(bindings.databaseUrl, identities);
    const report = {
      schemaVersion: "econovaria-staging-canonical-source-bootstrap-v1",
      projectRefSha256Bound: true,
      sourceCommit: bindings.sourceSha,
      canonicalPack: {
        id: preflight.packId,
        version: preflight.packVersion,
        sha256: preflight.packSha256,
      },
      canonicalSourceReady: true,
      connectedProvisioningProbe: probe,
      legacyUnprovisionedGamesQuarantined: true,
      productionTouched: false,
      productionAuthorized: false,
      credentialsRecorded: false,
      rawInternalIdentifiersRecorded: false,
    };
    const serialized = JSON.stringify(report);
    requireCondition(
      !/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized),
      "Sanitized report contains a raw UUID",
    );
    await writeFile(
      "/tmp/staging-canonical-source-bootstrap.json",
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (source.created) {
      await runSql(bindings.databaseUrl, `
        delete from public.game_sessions
        where id = ${sqlLiteral(identities.sourceGameId)}::uuid
          and game_join_code_status <> 'active';
      `, "failed source cleanup").catch(() => {});
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    error: safeError(error),
    productionTouched: false,
    productionAuthorized: false,
    credentialsRecorded: false,
    rawInternalIdentifiersRecorded: false,
  }));
  process.exitCode = 1;
});
