import assert from "node:assert/strict";
import fs from "node:fs";

const adminReadModel = fs.readFileSync(
  "backend/supabase/functions/admin-api/readModels.ts",
  "utf8",
);
const storeCatalogRepository = fs.readFileSync(
  "backend/src/domains/store/infrastructure/supabaseStoreCatalogRepository.ts",
  "utf8",
);
const storeCatalogMapper = fs.readFileSync(
  "backend/src/domains/store/infrastructure/storeCatalogRepository.ts",
  "utf8",
);

assert.match(
  adminReadModel,
  /game_item:game_items!store_items_game_item_scope_fk\(source_kind\)/,
  "Legacy Admin Store reads must join canonical game-item provenance.",
);
assert.match(
  adminReadModel,
  /sourceType:\s*storeSourceType\(row\)/,
  "Legacy Admin Store DTOs must expose explicit provenance.",
);
assert.match(
  adminReadModel,
  /\["store_created", "admin_created"\]\.includes\(sourceKind\)\) return "custom"/,
);
assert.match(
  adminReadModel,
  /\["physical_pack", "system"\]\.includes\(sourceKind\)\) return "seeded"/,
);

assert.match(
  storeCatalogRepository,
  /game_item:game_items!store_items_game_item_scope_fk\(source_kind\)/,
  "Canonical Store persistence reads must carry game-item source_kind.",
);
assert.match(
  storeCatalogMapper,
  /sourceType:\s*toStoreItemSourceType\(record\.game_item\?\.source_kind\)/,
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
  adminReadModel,
  /sourceType[\s\S]{0,120}index\s*[<>=]/,
  "Admin API provenance must never depend on collection position.",
);

console.log(
  "Store provenance authority contract passed: Admin and canonical Store reads derive custom/seeded state from game_items.source_kind.",
);
