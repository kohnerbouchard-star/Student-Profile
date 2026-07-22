import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../backend/supabase/migrations/20260721131000_add_crafting_pack_import_v1.sql",
    import.meta.url,
  ),
  "utf8",
);

test("Seed scarcity bands map monotonically into the runtime supply enum", () => {
  for (const [seedBand, runtimeBand] of [
    ["low", "abundant"],
    ["available", "available"],
    ["moderate", "constrained"],
    ["high", "scarce"],
    ["strategic", "scarce"],
  ]) {
    assert.match(
      migration,
      new RegExp(`when '${seedBand}' then '${runtimeBand}'`),
      `${seedBand} must project to ${runtimeBand}`,
    );
  }
  assert.match(migration, /else 'unavailable'/, "Unknown Seed scarcity must fail closed.");
  assert.doesNotMatch(
    migration,
    /coalesce\(nullif\(lower\(v_item #>> '\{scarcityPolicy,band\}'\),''\),'available'\),/,
    "The importer must not write immutable Seed bands directly into the runtime enum.",
  );
});
