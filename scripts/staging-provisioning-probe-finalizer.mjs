#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PACK_ID = "econovaria.beta-seed-pack.v1";
const PROBE_NAME = "[SYNTHETIC] Provisioning Connected Probe";
const EVIDENCE_PATH = "/tmp/staging-canonical-source-bootstrap.json";

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function safeError(error) {
  return String(error?.message ?? error ?? "Unknown probe finalizer error")
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
      "[uuid-redacted]",
    )
    .replace(/postgresql:\/\/[^\s]+/gi, "[database-url-redacted]")
    .slice(0, 3000);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
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
    `econovaria-probe-finalizer-${randomUUID()}.sql`,
  );
  await writeFile(file, `${sql.trim()}\n`, "utf8");
  try {
    const result = spawnSync(
      "psql",
      [databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", file],
      {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
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
  const databaseUrl = required("DATABASE_URL");
  const sourceCommit = required("RELEASE_COMMIT").toLowerCase();

  requireCondition(projectRef === expectedProjectRef, "Selected project is not approved staging");
  requireCondition(projectRef !== productionProjectRef, "Production project is denied");
  requireCondition(
    databaseUrl.includes(`postgres.${projectRef}@`) ||
      databaseUrl.includes(`db.${projectRef}.supabase.co`),
    "Database URL does not bind to staging",
  );
  requireCondition(/^[0-9a-f]{40}$/.test(sourceCommit), "Release commit must be a full SHA");
  return { projectRef, databaseUrl, sourceCommit };
}

async function writeEvidence(value) {
  const serialized = JSON.stringify(value);
  requireCondition(
    !/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized),
    "Sanitized evidence contains a raw UUID",
  );
  await writeFile(EVIDENCE_PATH, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const bindings = assertBindings();
  const identity = parseJsonLine(await runSql(bindings.databaseUrl, `
    select jsonb_build_object(
      'staffId', public.seed_content_stable_uuid_v1(
        'econovaria-system-staff|' || ${sqlLiteral(bindings.projectRef)}
      )
    )::text;
  `, "system staff resolution"), "system staff resolution");

  const preflight = parseJsonLine(await runSql(bindings.databaseUrl, `
    select public.game_provisioning_preflight_v1(${sqlLiteral(PACK_ID)})::text;
  `, "provisioning preflight"), "provisioning preflight");
  requireCondition(preflight.ready === true, "Canonical provisioning source is not ready");

  let probe = parseJsonLine(await runSql(bindings.databaseUrl, `
    select coalesce((
      select jsonb_build_object('gameId', game_row.id)
      from public.game_sessions as game_row
      where game_row.owner_staff_user_id = ${sqlLiteral(identity.staffId)}::uuid
        and game_row.name = ${sqlLiteral(PROBE_NAME)}
        and game_row.status = 'active'
        and game_row.provisioning_status = 'ready'
      order by game_row.created_at desc
      limit 1
    ), '{}'::jsonb)::text;
  `, "existing probe lookup"), "existing probe lookup");

  if (!probe.gameId) {
    const key = `staging.connected.finalizer.${Date.now()}`;
    const created = parseJsonLine(await runSql(bindings.databaseUrl, `
      select public.create_provisioned_game_v2(
        ${sqlLiteral(identity.staffId)}::uuid,
        ${sqlLiteral(PROBE_NAME)},
        '{"difficulty_preset":"hard","stock_market_window":{"timezone":"Asia/Seoul"}}'::jsonb,
        ${sqlLiteral(key)},
        ${sqlLiteral(PACK_ID)}
      )::text;
    `, "connected provisioning probe creation"), "connected provisioning probe creation");
    requireCondition(created.outcome === "created", `Probe returned ${created.outcome}`);
    requireCondition(created.provisioningStatus === "ready", "Probe did not reach ready");
    probe = { gameId: created.gameSessionId };
  }

  const verified = parseJsonLine(await runSql(bindings.databaseUrl, `
    select public.verify_provisioned_game_v1(
      ${sqlLiteral(probe.gameId)}::uuid,
      ${sqlLiteral(identity.staffId)}::uuid
    )::text;
  `, "connected provisioning verification"), "connected provisioning verification");

  requireCondition(verified.ready === true, "Connected provisioning verification failed");
  requireCondition(verified.counts?.marketAssets === 240, "Market count failed");
  requireCondition(verified.counts?.contracts === 30, "Contract count failed");
  requireCondition(verified.counts?.storeItems === 50, "Store count failed");
  requireCondition(verified.counts?.worldLocations === 50, "World location count failed");
  requireCondition(verified.counts?.worldRoutes === 13, "World route count failed");
  requireCondition(verified.counts?.worldCountries === 10, "World country count failed");
  requireCondition(verified.counts?.arrivalClassGrants === 8, "Arrival grant count failed");

  await runSql(bindings.databaseUrl, `
    begin;

    create temporary table probe_game_ids on commit drop as
    select game_row.id
    from public.game_sessions as game_row
    where game_row.owner_staff_user_id = ${sqlLiteral(identity.staffId)}::uuid
      and game_row.name = ${sqlLiteral(PROBE_NAME)};

    delete from public.audit_log
    where game_session_id in (select id from probe_game_ids);

    delete from public.game_feature_activation_evidence
    where game_session_id in (select id from probe_game_ids);

    delete from public.store_items
    where game_session_id in (select id from probe_game_ids);

    delete from public.seed_content_releases
    where game_session_id in (select id from probe_game_ids);

    delete from public.game_creation_provisioning_requests
    where game_session_id in (select id from probe_game_ids);

    delete from public.game_settings
    where game_session_id in (select id from probe_game_ids);

    delete from public.game_sessions
    where id in (select id from probe_game_ids);

    commit;
  `, "connected probe cleanup");

  const residue = parseJsonLine(await runSql(bindings.databaseUrl, `
    select jsonb_build_object(
      'probeGames', (
        select count(*)
        from public.game_sessions
        where owner_staff_user_id = ${sqlLiteral(identity.staffId)}::uuid
          and name = ${sqlLiteral(PROBE_NAME)}
      ),
      'unreadyJoinableGames', (
        select count(*)
        from public.game_sessions
        where status = 'active'
          and game_join_code_status = 'active'
          and provisioning_status <> 'ready'
      )
    )::text;
  `, "post-cleanup residue verification"), "post-cleanup residue verification");

  requireCondition(residue.probeGames === 0, "Synthetic probe residue remains");
  requireCondition(residue.unreadyJoinableGames === 0, "An unready joinable game remains");

  const report = {
    schemaVersion: "econovaria-staging-canonical-source-bootstrap-v1",
    status: "passed",
    completedStage: "connected-provisioning-probe-cleanup",
    sourceCommit: bindings.sourceCommit,
    canonicalPack: {
      id: preflight.packId,
      version: preflight.packVersion,
      sha256: preflight.packSha256,
    },
    canonicalSourceReady: true,
    connectedProvisioningProbe: {
      verified: true,
      counts: verified.counts,
      cleanupVerified: true,
    },
    legacyUnprovisionedGamesQuarantined: true,
    productionTouched: false,
    productionAuthorized: false,
    credentialsRecorded: false,
    rawInternalIdentifiersRecorded: false,
  };
  await writeEvidence(report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch(async (error) => {
  const report = {
    schemaVersion: "econovaria-staging-canonical-source-bootstrap-v1",
    status: "failed",
    failedStage: "connected-provisioning-probe-finalization",
    error: safeError(error),
    productionTouched: false,
    productionAuthorized: false,
    credentialsRecorded: false,
    rawInternalIdentifiersRecorded: false,
  };
  await writeEvidence(report).catch(() => {});
  console.error(JSON.stringify(report));
  process.exitCode = 1;
});
