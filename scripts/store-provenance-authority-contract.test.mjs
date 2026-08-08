import assert from "node:assert/strict";
import fs from "node:fs";

const storeCatalogRepository = fs.readFileSync(
  "backend/src/domains/store/infrastructure/supabaseStoreCatalogRepository.ts",
  "utf8",
);
const storeCatalogMapper = fs.readFileSync(
  "backend/src/domains/store/infrastructure/storeCatalogRepository.ts",
  "utf8",
);

assert.match(
  storeCatalogRepository,
  /game_item:game_items!store_items_game_item_scope_fk\(source_kind\)/,
  "Canonical Store persistence reads must carry game-item source_kind.",
);
assert.match(
  storeCatalogMapper,
  /sourceType:\s*toStoreItemSourceType\(record\.game_item\?\.source_kind\)/,
  "Store DTO provenance must be derived from canonical game-item source_kind.",
);
assert.match(
  storeCatalogMapper,
  /sourceKind === "store_created" \|\| sourceKind === "admin_created"/,
);
assert.match(
  storeCatalogMapper,
  /sourceKind === "physical_pack" \|\| sourceKind === "system"/,
);
assert.doesNotMatch(
  storeCatalogMapper,
  /sourceType[\s\S]{0,160}index\s*[<>=]/,
  "Canonical Store provenance must never depend on collection position.",
);

console.log(
  "Store provenance authority contract passed: canonical Store reads derive custom/seeded state from game_items.source_kind.",
);
