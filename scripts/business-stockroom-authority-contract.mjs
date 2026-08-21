#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const foundationPath =
  "backend/supabase/migrations/20260819064100_business_stockroom_read_v2.sql";
const locationsPath =
  "backend/supabase/migrations/20260821130000_business_stockroom_locations_v2.sql";
const snapshotMigrationPath =
  "backend/supabase/migrations/20260821131000_business_stockroom_snapshot_v2.sql";
const contractsPath =
  "backend/src/domains/business/contracts/playerBusinessContracts.ts";
const parserPath =
  "backend/src/domains/business/application/stockroom/businessStockroomResultParser.ts";
const snapshotPath =
  "backend/src/domains/business/application/stockroom/businessStockroomSnapshot.ts";
const repositoryPath =
  "backend/src/domains/business/infrastructure/supabaseBusinessStockroomReadRepository.ts";
const handlerPath =
  "backend/src/domains/business/api/playerBusinessHttpHandler.ts";

const [
  foundation,
  locations,
  snapshotMigration,
  contracts,
  parser,
  snapshot,
  repository,
  handler,
] = await Promise.all([
  readFile(foundationPath, "utf8"),
  readFile(locationsPath, "utf8"),
  readFile(snapshotMigrationPath, "utf8"),
  readFile(contractsPath, "utf8"),
  readFile(parserPath, "utf8"),
  readFile(snapshotPath, "utf8"),
  readFile(repositoryPath, "utf8"),
  readFile(handlerPath, "utf8"),
]);

assert.match(foundation, /create or replace function public\.resolve_player_business_v2/u);
assert.match(foundation, /business_ownership_positions/u);
assert.match(foundation, /ownership\.status = 'active'/u);
assert.match(foundation, /ownership\.ended_at is null/u);
assert.match(
  foundation,
  /ownership_model_version = 1[\s\S]{0,120}owner_player_id = p_player_id/u,
);

assert.match(locations.trim(), /^--[\s\S]*\nbegin;/u);
assert.match(locations.trim(), /commit;$/u);
assert.doesNotMatch(locations, /create\s+table/iu);
assert.doesNotMatch(locations, /public\.business_inventory/iu);

const ensureAccount = requiredSection(
  locations,
  /create or replace function economy_private\.ensure_business_inventory_account_v2/u,
);
for (const accountKind of [
  "warehouse",
  "work_in_progress",
  "finished_goods",
  "in_transit",
]) {
  assert.match(ensureAccount, new RegExp(`'${accountKind}'`, "u"));
}
assert.match(ensureAccount, /public\.economic_parties/u);
assert.match(ensureAccount, /public\.inventory_accounts/u);
assert.match(ensureAccount, /on conflict[\s\S]*account_kind/iu);

const ensureAll = requiredSection(
  locations,
  /create or replace function economy_private\.ensure_business_stockroom_accounts_v2/u,
);
assert.match(ensureAll, /foreach v_account_kind in array/u);
assert.match(ensureAll, /ensure_business_inventory_account_v2/u);
assert.match(locations, /after insert on public\.business_entities/u);
assert.match(locations, /provision_business_stockroom_accounts_v2/u);
assert.match(
  locations,
  /for v_business in[\s\S]*business_entities[\s\S]*ensure_business_stockroom_accounts_v2/u,
);

const locationRead = requiredSection(
  locations,
  /create or replace function public\.read_owned_business_stockroom_locations_v2/u,
);
const itemReadPattern =
  /create or replace function public\.read_owned_business_stockroom_v2/u;
const itemRead = requiredSection(locations, itemReadPattern);
const dropItemReadIndex = locations.search(
  /drop function if exists public\.read_owned_business_stockroom_v2\(uuid, uuid\);/u,
);
const createItemReadIndex = locations.search(itemReadPattern);
assert.ok(
  dropItemReadIndex >= 0 && dropItemReadIndex < createItemReadIndex,
  "Phase 3C must explicitly drop the Phase 3A Stockroom RPC before changing its OUT row type.",
);

for (const readSource of [locationRead, itemRead]) {
  assert.match(readSource, /public\.resolve_player_business_v2/u);
  assert.match(readSource, /public\.economic_parties/u);
  assert.match(readSource, /public\.inventory_accounts/u);
  assert.match(readSource, /public\.inventory_holdings/u);
  assert.match(readSource, /public\.game_items/u);
  for (const accountKind of [
    "warehouse",
    "work_in_progress",
    "finished_goods",
    "in_transit",
  ]) {
    assert.match(readSource, new RegExp(`'${accountKind}'`, "u"));
  }
  assert.doesNotMatch(
    readSource,
    /\binsert\s+into\b|\bupdate\b|\bdelete\s+from\b|ensure_business_/iu,
  );
}

assert.match(locationRead, /account\.public_key/u);
assert.match(locationRead, /case account\.account_kind/u);
assert.match(locationRead, /count\(item\.id\)::bigint/u);
assert.match(locationRead, /quantity_owned/u);
assert.match(locationRead, /quantity_reserved/u);
assert.match(locationRead, /quantity_available/u);
assert.match(itemRead, /account\.public_key/u);
assert.match(itemRead, /item\.public_key/u);
assert.match(itemRead, /holding\.average_unit_cost/u);
assert.match(itemRead, /holding\.cost_currency_code/u);
assert.match(itemRead, /holding\.version/u);
assert.match(itemRead, /holding\.quantity_owned - holding\.quantity_reserved/u);

assert.match(snapshotMigration.trim(), /^--[\s\S]*\nbegin;/u);
assert.match(snapshotMigration.trim(), /commit;$/u);
const coherentSnapshot = requiredSection(
  snapshotMigration,
  /create or replace function public\.read_owned_business_stockroom_snapshot_v2/u,
);
assert.match(coherentSnapshot, /\breturns jsonb\b/u);
assert.match(coherentSnapshot, /\bstable\b/u);
assert.match(coherentSnapshot, /security definer/u);
assert.match(coherentSnapshot, /read_owned_business_stockroom_locations_v2/u);
assert.match(coherentSnapshot, /read_owned_business_stockroom_v2/u);
assert.match(coherentSnapshot, /jsonb_array_length\(v_locations\) <> 4/u);
assert.match(coherentSnapshot, /BUSINESS_STOCKROOM_LOCATIONS_INCOMPLETE/u);
assert.match(coherentSnapshot, /'business_key'/u);
assert.match(coherentSnapshot, /'locations'/u);
assert.match(coherentSnapshot, /'items'/u);
assert.doesNotMatch(
  coherentSnapshot,
  /\binsert\s+into\b|\bupdate\b|\bdelete\s+from\b|ensure_business_/iu,
);
assert.match(
  snapshotMigration,
  /read_owned_business_stockroom_snapshot_v2\(\s*uuid,\s*uuid\s*\)[\s\S]{0,120}to service_role/iu,
);
assert.doesNotMatch(
  snapshotMigration,
  /grant execute on function public\.read_owned_business_stockroom_snapshot_v2[^;]+to (?:public|anon|authenticated)/iu,
);

for (const signature of [
  /read_owned_business_stockroom_locations_v2\(\s*uuid,\s*uuid\s*\)[\s\S]{0,120}to service_role/iu,
  /read_owned_business_stockroom_v2\(\s*uuid,\s*uuid\s*\)[\s\S]{0,120}to service_role/iu,
]) {
  assert.match(locations, signature);
}
assert.doesNotMatch(
  locations,
  /grant execute on function public\.read_owned_business_stockroom[^;]+to (?:public|anon|authenticated)/iu,
);

assert.match(contracts, /BUSINESS_STOCKROOM_LOCATION_KEYS/u);
assert.match(contracts, /BusinessStockroomLocationKey/u);
assert.match(contracts, /BusinessStockroomLocationDto/u);
assert.match(contracts, /BusinessStockroomSnapshotDto/u);
assert.match(
  contracts,
  /BusinessStockroomItemDto[\s\S]{0,240}accountKey:[\s\S]{0,120}locationKey:/u,
);

assert.match(parser, /MAX_STOCKROOM_ITEMS = 500/u);
assert.match(parser, /SNAPSHOT_KEYS/u);
assert.match(parser, /parseStockroomEnvelope/u);
assert.match(parser, /BUSINESS_STOCKROOM_LOCATION_KEYS/u);
assert.match(parser, /business_stockroom_result_invalid/u);
assert.match(parser, /Stockroom quantity invariant failed/u);
assert.match(parser, /UUID/u);
assert.match(snapshot, /Stockroom aggregate does not reconcile/u);
assert.match(snapshot, /Stockroom item account does not match/u);
assert.match(snapshot, /internal UUID/u);
assert.match(snapshot, /Duplicate Stockroom holding/u);

assert.match(repository, /read_owned_business_stockroom_snapshot_v2/u);
assert.match(repository, /parseStockroomEnvelope/u);
assert.match(repository, /parseStockroomLocations/u);
assert.match(repository, /parseStockroomItems/u);
assert.match(repository, /buildBusinessStockroomSnapshot/u);
assert.match(repository, /snapshot\.businessKey !== envelope\.businessKey/u);
assert.doesNotMatch(repository, /Promise\.all/u);
assert.doesNotMatch(repository, /"read_owned_business_stockroom_locations_v2"/u);
assert.doesNotMatch(repository, /"read_owned_business_stockroom_v2"/u);

assert.match(
  handler,
  /route\.resource === "stockroom"[\s\S]{0,180}privateJson\(\s*200,\s*await readBusinessStockroom\(client, publicScope\)/u,
);
assert.doesNotMatch(
  handler,
  /route\.resource === "stockroom"[\s\S]{0,160}\{\s*items:\s*await readBusinessStockroom/u,
);

console.log(
  "Business Phase 3C coherent location-complete Stockroom authority contract passed.",
);

function requiredSection(source, startPattern) {
  const startMatch = source.match(startPattern);
  assert.ok(startMatch?.index !== undefined, `Missing section: ${startPattern}`);
  const start = startMatch.index;
  const end = source.indexOf("$function$;", start);
  assert.notEqual(end, -1, `Unterminated section: ${startPattern}`);
  return source.slice(start, end + "$function$;".length);
}
