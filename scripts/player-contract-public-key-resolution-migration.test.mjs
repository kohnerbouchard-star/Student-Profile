import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const originalMigration =
  "backend/supabase/migrations/20260718112000_accept_player_contract_by_key_v2.sql";
const repairMigration =
  "backend/supabase/migrations/20260731133100_resolve_player_contract_public_key_v3.sql";

test("Contract public-key resolution is a forward-only exact-first repair", async () => {
  const [original, repair] = await Promise.all([
    readFile(originalMigration, "utf8"),
    readFile(repairMigration, "utf8"),
  ]);

  assert.match(original, /create or replace function public\.accept_player_contract_by_key/u);
  assert.match(repair, /^begin;/u);
  assert.match(repair, /create or replace function public\.accept_player_contract_by_key/u);
  assert.match(repair, /contract\.contract_key = v_public_contract_key/u);
  assert.match(repair, /template\.template_key = v_public_contract_key/u);
  assert.match(repair, /for update of template/u);
  assert.match(repair, /limit 2\s+for share of contract/u);
  assert.match(repair, /if v_alias_count > 1 then\s+raise exception 'PLAYER_CONTRACT_PUBLIC_KEY_AMBIGUOUS'/u);
  assert.match(repair, /contract_key := v_public_contract_key/u);
  assert.doesNotMatch(
    repair,
    /contract\.contract_key = v_public_contract_key\s+or\s+template\.template_key/u,
  );
  assert.doesNotMatch(repair, /order by[\s\S]*contract\.updated_at desc/u);

  const exactIndex = repair.indexOf("contract.contract_key = v_public_contract_key");
  const aliasIndex = repair.indexOf("template.template_key = v_public_contract_key");
  assert.ok(exactIndex >= 0 && aliasIndex > exactIndex, "Exact live key resolution must precede alias resolution.");
});
