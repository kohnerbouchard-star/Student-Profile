#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PACK_PATH = process.env.PHYSICAL_ECONOMY_PACK || "/tmp/physical-economy-runtime-pack.json";
const OUTPUT_DIR = process.env.ECONOVARIA_PLAYER_BROWSER_OUTPUT_DIR || "/tmp/econovaria-player-browser";
const GAME_NAME = process.env.ECONOVARIA_BROWSER_GAME_NAME || "Player Multiplayer E2E";
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

const evidence = {
  generatedAt: new Date().toISOString(),
  packValidated: false,
  imported: false,
  importReplaySafe: false,
  activated: false,
  activationReplaySafe: false,
  activePackVerified: false,
  recipeAvailabilityVerified: false,
  productionDenied: false,
};

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function redact(value) {
  return String(value || "")
    .replace(UUID_PATTERN, "[uuid-redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt-redacted]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[supabase-key-redacted]")
    .slice(0, 5000);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonSql(value, tag = "pack") {
  const serialized = JSON.stringify(value);
  requireCondition(!serialized.includes(`$${tag}$`), `Crafting pack contains reserved ${tag} delimiter.`);
  return `$${tag}$${serialized}$${tag}$::jsonb`;
}

function psql(sql) {
  const directory = mkdtempSync(join(tmpdir(), "econovaria-crafting-pack-"));
  const statementPath = join(directory, "statement.sql");
  writeFileSync(statementPath, `${String(sql).trim()}\n`, "utf8");
  try {
    return execFileSync("psql", [DATABASE_URL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", statementPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 30 * 1024 * 1024,
    }).trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function parseJsonLine(output, label) {
  const lines = String(output || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  requireCondition(lines.length > 0, `${label} returned no JSON.`);
  try {
    return JSON.parse(lines.at(-1));
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}

await mkdir(OUTPUT_DIR, { recursive: true });
let failure;

try {
  const pack = JSON.parse(await readFile(PACK_PATH, "utf8"));
  requireCondition(pack?.schemaVersion === "econovaria-physical-economy-runtime-pack-v1", "Crafting pack schema is invalid.");
  requireCondition(typeof pack.packKey === "string" && pack.packKey.length > 0, "Crafting pack key is missing.");
  requireCondition(typeof pack.contentVersion === "string" && pack.contentVersion.length > 0, "Crafting content version is missing.");
  requireCondition(/^[0-9a-f]{64}$/.test(String(pack.contentDigest || "")), "Crafting content digest is invalid.");
  requireCondition(pack.activationAuthorization?.productionAuthorized === false, "Crafting pack must deny production activation.");
  requireCondition(pack.activationAuthorization?.catalogAuthorized === true, "Crafting catalog is not authorized.");
  requireCondition(pack.activationAuthorization?.recipeAuthorized === true, "Crafting recipes are not authorized.");
  requireCondition(pack.activationAuthorization?.calibrationAuthorized === true, "Crafting calibration is not authorized.");
  evidence.packValidated = true;

  const scope = parseJsonLine(psql(`
    select jsonb_build_object(
      'gameId', game.id,
      'staffId', game.owner_staff_user_id
    )::text
    from public.game_sessions game
    where game.name = ${sqlLiteral(GAME_NAME)}
      and game.status = 'active'
      and game.lifecycle_state = 'active'
    order by game.created_at desc
    limit 1;
  `), "Crafting game scope");
  requireCondition(scope.gameId && scope.staffId, "Connected Crafting game scope is unavailable.");

  const importResult = parseJsonLine(psql(`
    select public.import_physical_economy_pack_v1(
      ${sqlLiteral(scope.gameId)}::uuid,
      ${sqlLiteral(scope.staffId)}::uuid,
      ${jsonSql(pack)},
      ${sqlLiteral(pack.contentDigest)},
      'player.connected.crafting.pack.import.v1'
    )::text;
  `), "Crafting pack import");
  requireCondition(["imported", "replayed"].includes(importResult.outcome), `Unexpected Crafting import outcome ${String(importResult.outcome)}.`);
  evidence.imported = true;

  const importReplay = parseJsonLine(psql(`
    select public.import_physical_economy_pack_v1(
      ${sqlLiteral(scope.gameId)}::uuid,
      ${sqlLiteral(scope.staffId)}::uuid,
      ${jsonSql(pack)},
      ${sqlLiteral(pack.contentDigest)},
      'player.connected.crafting.pack.import.v1'
    )::text;
  `), "Crafting pack import replay");
  requireCondition(importReplay.replayed === true || importReplay.outcome === "replayed", "Crafting import replay was not idempotent.");
  evidence.importReplaySafe = true;

  const activateResult = parseJsonLine(psql(`
    select public.activate_physical_economy_pack_v1(
      ${sqlLiteral(scope.gameId)}::uuid,
      ${sqlLiteral(scope.staffId)}::uuid,
      ${sqlLiteral(pack.packKey)},
      ${sqlLiteral(pack.contentVersion)},
      'player.connected.crafting.pack.activate.v1'
    )::text;
  `), "Crafting pack activation");
  requireCondition(activateResult.status === "active", "Crafting pack did not become active.");
  requireCondition(activateResult.durabilityEnabled === false, "Crafting durability must remain disabled.");
  requireCondition(activateResult.repairEnabled === false, "Crafting repair must remain disabled.");
  evidence.activated = true;

  const activationReplay = parseJsonLine(psql(`
    select public.activate_physical_economy_pack_v1(
      ${sqlLiteral(scope.gameId)}::uuid,
      ${sqlLiteral(scope.staffId)}::uuid,
      ${sqlLiteral(pack.packKey)},
      ${sqlLiteral(pack.contentVersion)},
      'player.connected.crafting.pack.activate.v1'
    )::text;
  `), "Crafting activation replay");
  requireCondition(activationReplay.replayed === true, "Crafting activation replay was not idempotent.");
  evidence.activationReplaySafe = true;

  const state = parseJsonLine(psql(`
    select jsonb_build_object(
      'activePackCount', (
        select count(*)
        from public.game_session_physical_economy_packs game_pack
        join public.physical_economy_content_packs pack_row on pack_row.id = game_pack.pack_id
        where game_pack.game_session_id = ${sqlLiteral(scope.gameId)}::uuid
          and game_pack.status = 'active'
          and pack_row.status = 'active'
          and pack_row.pack_key = ${sqlLiteral(pack.packKey)}
          and pack_row.content_version = ${sqlLiteral(pack.contentVersion)}
      ),
      'recipeAvailability', (
        select count(*)
        from public.game_session_recipe_availability availability
        join public.physical_economy_recipe_definitions recipe on recipe.id = availability.recipe_id
        join public.physical_economy_content_packs pack_row on pack_row.id = recipe.pack_id
        where availability.game_session_id = ${sqlLiteral(scope.gameId)}::uuid
          and availability.enabled = true
          and pack_row.pack_key = ${sqlLiteral(pack.packKey)}
          and pack_row.content_version = ${sqlLiteral(pack.contentVersion)}
      ),
      'productionAuthorized', (
        select (pack_row.metadata #>> '{activationAuthorization,productionAuthorized}')::boolean
        from public.physical_economy_content_packs pack_row
        where pack_row.pack_key = ${sqlLiteral(pack.packKey)}
          and pack_row.content_version = ${sqlLiteral(pack.contentVersion)}
      )
    )::text;
  `), "Crafting active-state verification");
  requireCondition(Number(state.activePackCount) === 1, "Crafting active pack scope is invalid.");
  requireCondition(Number(state.recipeAvailability) > 0, "Crafting recipe availability was not materialized.");
  requireCondition(state.productionAuthorized === false, "Crafting production authorization must remain denied.");
  evidence.activePackVerified = true;
  evidence.recipeAvailabilityVerified = true;
  evidence.productionDenied = true;
} catch (error) {
  failure = error;
  evidence.failure = redact(error?.stack || error);
} finally {
  evidence.finalizedAt = new Date().toISOString();
  await writeFile(
    `${OUTPUT_DIR}/player-crafting-pack-activation-acceptance.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
}

if (failure) throw failure;
console.log(JSON.stringify({ ok: true, evidence }));
