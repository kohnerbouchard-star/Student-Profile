#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const PACK_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content', 'executable', 'beta-pack-v1');
const DATABASE_URL = process.env.DB_URL ?? process.env.DATABASE_URL;

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(name) {
  return JSON.parse(await readFile(path.join(PACK_ROOT, name), 'utf8'));
}

function dollarQuote(tag, value) {
  const delimiter = `$${tag}$`;
  requireCondition(!value.includes(delimiter), `Seed payload unexpectedly contains SQL delimiter ${delimiter}.`);
  return `${delimiter}${value}${delimiter}`;
}

function runPsql(scriptPath) {
  const result = spawnSync('psql', [DATABASE_URL, '-X', '-v', 'ON_ERROR_STOP=1', '-f', scriptPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error([
      'Transactional seed release probe failed.',
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  return result.stdout.trim();
}

async function main() {
  requireCondition(DATABASE_URL, 'DB_URL or DATABASE_URL is required.');

  const [pack, integrity, market, contracts, store] = await Promise.all([
    readJson('pack-v1.json'),
    readJson('integrity-manifest-v1.json'),
    readJson('market-templates-v1.json'),
    readJson('tutorial-contract-chains-v1.json'),
    readJson('store-catalog-v1.json'),
  ]);

  requireCondition(Array.isArray(market.templates) && market.templates.length === 240, 'Expected 240 market templates.');
  requireCondition(Array.isArray(contracts.templates) && contracts.templates.length === 30, 'Expected 30 contract templates.');
  requireCondition(Array.isArray(store.items) && store.items.length === 50, 'Expected 50 store items.');
  requireCondition(pack.packId === integrity.packId && pack.version === integrity.version, 'Pack identity mismatch.');

  const marketSql = dollarQuote('seed_market_payload', JSON.stringify(market.templates));
  const contractsSql = dollarQuote('seed_contract_payload', JSON.stringify(contracts.templates));
  const storeSql = dollarQuote('seed_store_payload', JSON.stringify(store.items));
  const packId = pack.packId.replaceAll("'", "''");
  const version = pack.version.replaceAll("'", "''");
  const digest = integrity.packSha256.replaceAll("'", "''");

  const sql = String.raw`\set QUIET 1
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

begin;
select set_config('request.jwt.claim.role', 'service_role', true);

insert into public.staff_users (id, supabase_auth_user_id, email, display_name)
values (
  '16300000-0000-4000-8000-000000000001',
  '16300000-0000-4000-8000-000000000011',
  'seed-probe@example.invalid',
  'Seed Release Probe'
)
on conflict (id) do update set display_name = excluded.display_name;

insert into public.game_sessions (id, owner_staff_user_id, name, status, lifecycle_state)
values
  ('16300000-0000-4000-8000-000000000101', '16300000-0000-4000-8000-000000000001', 'Seed Probe Game One', 'active', 'draft'),
  ('16300000-0000-4000-8000-000000000102', '16300000-0000-4000-8000-000000000001', 'Seed Probe Game Two', 'active', 'draft')
on conflict (id) do update set name = excluded.name;

do $probe$
declare
  v_market jsonb := ${marketSql}::jsonb;
  v_contracts jsonb := ${contractsSql}::jsonb;
  v_store jsonb := ${storeSql}::jsonb;
  v_game_one constant uuid := '16300000-0000-4000-8000-000000000101';
  v_game_two constant uuid := '16300000-0000-4000-8000-000000000102';
  v_pack_id constant text := '${packId}';
  v_version constant text := '${version}';
  v_digest constant text := '${digest}';
  v_first jsonb;
  v_second jsonb;
  v_failed jsonb;
  v_resumed jsonb;
  v_deactivated jsonb;
  v_rolled_back jsonb;
  v_reimported jsonb;
  v_game_one_release uuid;
  v_game_two_release uuid;
  v_asset_before uuid;
  v_asset_after uuid;
begin
  v_first := public.apply_seed_content_release_v1(
    v_game_one, v_pack_id, v_version, v_digest, 'test', true,
    'transactional-probe-authorization', 'database-replay-probe',
    v_market, v_contracts, v_store, null
  );
  if v_first->>'outcome' <> 'applied' then
    raise exception 'Expected first import outcome applied, got %', v_first;
  end if;
  v_game_one_release := (v_first->>'releaseId')::uuid;
  if (v_first->>'operationCount')::integer <> 590 then
    raise exception 'Expected 590 operations, got %', v_first;
  end if;
  if (select count(*) from public.seed_content_release_members where release_id = v_game_one_release) <> 590 then
    raise exception 'Expected 590 release members.';
  end if;
  if (select count(*) from public.game_session_stock_assets where game_session_id = v_game_one and is_active) <> 240 then
    raise exception 'Expected 240 active game stock assets.';
  end if;
  if (select count(*) from public.game_session_contracts where game_session_id = v_game_one and status = 'active' and visibility = 'public') <> 30 then
    raise exception 'Expected 30 active tutorial Contracts.';
  end if;
  if (select count(*) from public.store_items where game_session_id = v_game_one and status = 'active' and visibility = 'visible') <> 50 then
    raise exception 'Expected 50 visible Store items.';
  end if;

  select id into v_asset_before
  from public.game_session_stock_assets
  where game_session_id = v_game_one
  order by ticker
  limit 1;

  v_second := public.apply_seed_content_release_v1(
    v_game_one, v_pack_id, v_version, v_digest, 'test', true,
    'transactional-probe-authorization', 'database-replay-probe',
    v_market, v_contracts, v_store, null
  );
  if v_second->>'outcome' <> 'replayed'
     or v_second->>'releaseId' <> v_first->>'releaseId'
     or (select count(*) from public.seed_content_release_members where release_id = v_game_one_release) <> 590 then
    raise exception 'Repeated import was not a stable idempotent replay: %', v_second;
  end if;

  begin
    perform public.apply_seed_content_release_v1(
      v_game_one, v_pack_id, v_version || '-conflict', v_digest, 'test', true,
      'transactional-probe-authorization', 'database-replay-probe',
      v_market, v_contracts, v_store, null
    );
    raise exception 'Expected conflicting version rejection.';
  exception when unique_violation then
    null;
  end;

  v_failed := public.apply_seed_content_release_v1(
    v_game_two, v_pack_id, v_version, v_digest, 'test', true,
    'transactional-probe-authorization', 'database-replay-probe',
    v_market, v_contracts, v_store, 5
  );
  if v_failed->>'outcome' <> 'failed'
     or coalesce((v_failed->>'transactionRolledBack')::boolean, false) is not true then
    raise exception 'Expected transaction-wrapped partial failure: %', v_failed;
  end if;
  if exists (select 1 from public.game_session_stock_assets where game_session_id = v_game_two)
     or exists (select 1 from public.game_session_contracts where game_session_id = v_game_two)
     or exists (select 1 from public.store_items where game_session_id = v_game_two) then
    raise exception 'Partial failure left game-scoped seed rows behind.';
  end if;

  v_resumed := public.apply_seed_content_release_v1(
    v_game_two, v_pack_id, v_version, v_digest, 'test', true,
    'transactional-probe-authorization', 'database-replay-probe',
    v_market, v_contracts, v_store, null
  );
  if v_resumed->>'outcome' <> 'applied' then
    raise exception 'Failed release did not resume successfully: %', v_resumed;
  end if;
  v_game_two_release := (v_resumed->>'releaseId')::uuid;
  if v_game_two_release = v_game_one_release then
    raise exception 'Cross-game releases reused one release identity.';
  end if;

  v_deactivated := public.deactivate_seed_content_release_v1(v_game_one, v_pack_id, v_version, v_digest);
  if v_deactivated->>'outcome' <> 'deactivated' then
    raise exception 'Expected deactivated outcome: %', v_deactivated;
  end if;
  if exists (select 1 from public.game_session_stock_assets where game_session_id = v_game_one and is_active)
     or exists (select 1 from public.game_session_contracts where game_session_id = v_game_one and visibility <> 'hidden')
     or exists (select 1 from public.store_items where game_session_id = v_game_one and visibility <> 'hidden') then
    raise exception 'Deactivation did not disable only game-one release rows.';
  end if;
  if (select count(*) from public.game_session_stock_assets where game_session_id = v_game_two and is_active) <> 240
     or (select count(*) from public.game_session_contracts where game_session_id = v_game_two and status = 'active') <> 30
     or (select count(*) from public.store_items where game_session_id = v_game_two and status = 'active') <> 50 then
    raise exception 'Game-one deactivation affected game-two release rows.';
  end if;

  v_rolled_back := public.rollback_seed_content_release_v1(v_game_one, v_pack_id, v_version, v_digest, true);
  if v_rolled_back->>'outcome' <> 'rolled_back'
     or coalesce((v_rolled_back->>'playerHistoryPreserved')::boolean, false) is not true then
    raise exception 'Expected history-preserving rollback: %', v_rolled_back;
  end if;
  if exists (select 1 from public.game_session_stock_assets where game_session_id = v_game_one)
     or exists (select 1 from public.game_session_contracts where game_session_id = v_game_one)
     or exists (select 1 from public.store_items where game_session_id = v_game_one) then
    raise exception 'Rollback left game-one release rows behind.';
  end if;
  if (select count(*) from public.game_session_stock_assets where game_session_id = v_game_two and is_active) <> 240 then
    raise exception 'Game-one rollback affected game-two assets.';
  end if;

  v_reimported := public.apply_seed_content_release_v1(
    v_game_one, v_pack_id, v_version, v_digest, 'test', true,
    'transactional-probe-authorization', 'database-replay-probe',
    v_market, v_contracts, v_store, null
  );
  if v_reimported->>'outcome' <> 'applied'
     or v_reimported->>'releaseId' <> v_first->>'releaseId' then
    raise exception 'Re-import did not preserve immutable release identity: %', v_reimported;
  end if;
  select id into v_asset_after
  from public.game_session_stock_assets
  where game_session_id = v_game_one
  order by ticker
  limit 1;
  if v_asset_after <> v_asset_before then
    raise exception 'Stable game asset ID changed across rollback and re-import.';
  end if;

  begin
    perform public.apply_seed_content_release_v1(
      v_game_one, 'wrong-environment-probe', v_version, v_digest, 'production', false,
      null, null, v_market, v_contracts, v_store, null
    );
    raise exception 'Expected production environment rejection.';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.apply_seed_content_release_v1(
      v_game_one, 'malformed-count-probe', v_version, v_digest, 'test', false,
      null, null, v_market - 0, v_contracts, v_store, null
    );
    raise exception 'Expected malformed bounded-count rejection.';
  exception when invalid_parameter_value then
    null;
  end;

  perform public.rollback_seed_content_release_v1(v_game_one, v_pack_id, v_version, v_digest, true);
  perform public.rollback_seed_content_release_v1(v_game_two, v_pack_id, v_version, v_digest, true);
end;
$probe$;

select jsonb_build_object(
  'result', 'PASS',
  'packId', '${packId}',
  'version', '${version}',
  'packSha256', '${digest}',
  'operationCountPerGame', 590,
  'cleanImport', true,
  'repeatedImport', true,
  'conflictingVersionRejected', true,
  'partialFailureRolledBack', true,
  'resumable', true,
  'crossGameIsolation', true,
  'deactivation', true,
  'rollback', true,
  'reimportStableIds', true,
  'wrongEnvironmentRejected', true,
  'malformedContentRejected', true,
  'productionTouched', false
)::text;

rollback;
`;

  const directory = await mkdtemp(path.join(os.tmpdir(), 'econovaria-seed-db-probe-'));
  try {
    const scriptPath = path.join(directory, 'seed-release-probe.sql');
    await writeFile(scriptPath, sql, 'utf8');
    const output = runPsql(scriptPath);
    const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const finalLine = lines.at(-1);
    const summary = JSON.parse(finalLine);
    requireCondition(summary.result === 'PASS', `Unexpected probe result: ${finalLine}`);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
