import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL(
  "../backend/supabase/migrations/20260721131300_harden_crafting_pack_version_identity_v1.sql",
  import.meta.url,
), "utf8");

test("one pack key and version resolves to one exact runtime digest", () => {
  assert.match(migration, /PHYSICAL_ECONOMY_PACK_VERSION_AMBIGUOUS/i);
  assert.match(migration, /group by pack_key, content_version/i);
  assert.match(migration, /having count\(\*\) > 1/i);
  assert.match(
    migration,
    /create unique index if not exists physical_economy_pack_version_identity_idx/i,
  );
  assert.match(
    migration,
    /on public\.physical_economy_content_packs\(pack_key, content_version\)/i,
  );
});

test("enabled salvage definitions cannot publish an empty output set", () => {
  assert.match(migration, /physical_economy_salvage_outputs_nonempty/i);
  assert.match(migration, /check \(jsonb_array_length\(outputs\) > 0\)/i);
});
