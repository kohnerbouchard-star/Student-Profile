import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const attendanceApi = fs.readFileSync(
  "admin/v2/src/routes/attendance/AttendanceApi.js",
  "utf8",
);
const attendanceRoute = fs.readFileSync(
  "admin/v2/src/routes/attendance/AttendanceRoute.js",
  "utf8",
);
const bankingRoute = fs.readFileSync(
  "admin/v2/src/routes/banking/BankingRoute.js",
  "utf8",
);
const contractForm = fs.readFileSync(
  "admin/v2/src/routes/contracts/ContractForm.js",
  "utf8",
);
const storeController = fs.readFileSync(
  "admin/v2/src/routes/store/StoreController.js",
  "utf8",
);
const adminReadModels = fs.readFileSync(
  "backend/supabase/functions/admin-api/readModels.ts",
  "utf8",
);
const adminMutation = fs.readFileSync(
  "backend/src/platform/supabase/adminMutation.ts",
  "utf8",
);
const safetyMigration = fs.readFileSync(
  "backend/supabase/migrations/20260811072424_admin_v2_teacher_safety_v1.sql",
  "utf8",
);

test("Attendance reward adjustments cannot select global currency or savings", () => {
  const start = attendanceApi.indexOf("function adjustAttendanceReward");
  const end = attendanceApi.indexOf("\n  function setAttendanceLock", start);
  assert.ok(start >= 0 && end > start, "Expected the Admin V2 Attendance reward adapter.");
  const functionSource = attendanceApi.slice(start, end);
  assert.match(functionSource, /currencyMode:\s*"player_country"/);
  assert.match(functionSource, /accountType:\s*"checking"/);
  assert.doesNotMatch(functionSource, /currencyCode/);

  assert.doesNotMatch(attendanceRoute, /name:\s*"currency"/);
  assert.doesNotMatch(attendanceRoute, /name:\s*"account"/);
  assert.doesNotMatch(attendanceRoute, /currencyCode:\s*currency\.control\.value/);
  assert.doesNotMatch(attendanceRoute, /accountType:\s*account\.control\.value/);
});

test("Banking balance corrections require review before the ledger mutation", () => {
  assert.match(bankingRoute, /AdminConfirmDialog/);
  assert.match(bankingRoute, /currentBalance \+ numericAmount/);
  assert.match(bankingRoute, /onAdjust\(player, selectedAccount/);
  assert.match(bankingRoute, /confirm\.open/);
});

test("Contract monetary rewards no longer accept a UI-selected currency", () => {
  assert.doesNotMatch(contractForm, /name:\s*"rewardCurrency"/);
  assert.doesNotMatch(contractForm, /CURRENCY_PATTERN/);
  assert.match(
    contractForm,
    /rewardPayload:\s*rewardAmount > 0[\s\S]*?\{ cash:\s*\{ amount:/,
    "The existing Admin API compatibility boundary still receives the cash alias.",
  );
  assert.doesNotMatch(
    contractForm,
    /rewardPayload:[\s\S]{0,240}currencyCode/,
    "Contract creation must not persist a teacher-selected reward currency.",
  );

  assert.match(safetyMigration, /v_account_type text := 'checking'/);
  assert.match(safetyMigration, /player_country_assignments/);
  assert.match(safetyMigration, /country_profiles/);
  assert.match(safetyMigration, /where key_name not in \('checking', 'cash', 'items'\)/);
  assert.match(safetyMigration, /v_reward \? 'cash'/);
  assert.match(safetyMigration, /v_currency_mode := 'player_country'/);
});

test("Seeded Store definitions cannot be updated or archived", () => {
  assert.match(storeController, /STORE_SOURCE_TYPES = new Set\(\["seeded", "custom"\]\)/);
  assert.match(storeController, /sourceType:/);
  assert.match(storeController, /item\?\.sourceType === "seeded"/);

  assert.match(
    adminReadModels,
    /game_item:game_items!store_items_game_item_scope_fk\(source_kind\)/,
    "Admin Store reads must include canonical game-item provenance.",
  );
  assert.match(
    adminReadModels,
    /sourceType:\s*\["physical_pack", "system"\]\.includes\(row\.game_item\?\.source_kind\)[\s\S]*?"seeded"[\s\S]*?\["store_created", "admin_created"\]\.includes\(row\.game_item\?\.source_kind\)[\s\S]*?"custom"/,
    "Admin Store reads must expose the canonical seeded/custom sourceType mapping.",
  );

  assert.match(safetyMigration, /ADMIN_STORE_SEEDED_ITEM_PROTECTED/);
  assert.match(safetyMigration, /game_item\.source_kind in \('physical_pack', 'system'\)/);
  assert.match(safetyMigration, /v_operation in \('update', 'archive'\)/);
  assert.match(adminMutation, /seeded_store_item_protected/);
});
