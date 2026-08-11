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
const storeRoute = fs.readFileSync(
  "admin/v2/src/routes/store/StoreRoute.js",
  "utf8",
);
const navigation = fs.readFileSync(
  "admin/v2/src/components/AdminNavigation.js",
  "utf8",
);
const topbar = fs.readFileSync(
  "admin/v2/src/components/AdminTopbar.js",
  "utf8",
);
const adminMutation = fs.readFileSync(
  "backend/src/platform/supabase/adminMutation.ts",
  "utf8",
);
const teacherSafetyMigration = fs.readFileSync(
  "backend/supabase/migrations/20260811072424_admin_v2_teacher_safety_v1.sql",
  "utf8",
);

test("Attendance teacher reward adjustments are local-currency Checking only", () => {
  const functionSource = attendanceApi.match(
    /function adjustAttendanceReward\([\s\S]*?\n  \}/,
  )?.[0] ?? "";
  assert.ok(functionSource, "Expected the Admin V2 Attendance reward adapter.");
  assert.match(functionSource, /currencyMode:\s*"player_country"/);
  assert.match(functionSource, /accountType:\s*"checking"/);
  assert.doesNotMatch(functionSource, /currencyCode/);

  assert.match(attendanceRoute, /Reward correction · local currency → Checking/);
  assert.doesNotMatch(attendanceRoute, /name:\s*"currency"/);
  assert.doesNotMatch(attendanceRoute, /name:\s*"account"/);
  assert.match(attendanceRoute, /Confirm attendance reward correction/);
  assert.match(attendanceRoute, /Lock attendance for today\?/);
  assert.match(attendanceRoute, /AdminConfirmDialog/);
});

test("Banking balance corrections require consequence review before mutation", () => {
  assert.match(bankingRoute, /Correct balance/);
  assert.match(bankingRoute, /Review correction/);
  assert.match(bankingRoute, /Confirm balance correction/);
  assert.match(bankingRoute, /Apply correction/);
  assert.match(bankingRoute, /currentBalance \+ numericAmount/);
  assert.match(bankingRoute, /AdminConfirmDialog/);
  assert.match(bankingRoute, /Teacher reason/);
});

test("Contract money rewards hide ledger routing and converge through the compatibility boundary", () => {
  assert.match(contractForm, /label:\s*"Money reward"/);
  assert.match(contractForm, /active-country currency/);
  assert.doesNotMatch(contractForm, /name:\s*"rewardCurrency"/);
  assert.match(
    contractForm,
    /rewardPayload:\s*rewardAmount > 0[\s\S]*?\{ cash:\s*\{ amount:/,
    "The current Admin API compatibility adapter still receives its bounded cash alias.",
  );
  assert.doesNotMatch(
    contractForm,
    /rewardPayload:[\s\S]{0,240}currencyCode/,
    "The teacher Contract form must not choose a reward currency.",
  );

  assert.match(teacherSafetyMigration, /v_account_type text := 'checking'/);
  assert.match(teacherSafetyMigration, /player_country_assignments/);
  assert.match(teacherSafetyMigration, /country_profiles/);
  assert.match(teacherSafetyMigration, /where key_name not in \('checking', 'cash', 'items'\)/);
  assert.match(teacherSafetyMigration, /v_reward \? 'cash'/);
  assert.match(teacherSafetyMigration, /v_currency_mode := 'player_country'/);
});

test("Seeded Store definitions are protected by canonical provenance at every layer", () => {
  assert.match(storeController, /STORE_SOURCE_TYPES = new Set\(\["seeded", "custom"\]\)/);
  assert.match(storeController, /sourceType:\s*STORE_SOURCE_TYPES\.has\(sourceTypeValue\)/);
  assert.match(storeController, /item\?\.sourceType === "seeded"/);
  assert.match(storeRoute, /if \(item\.sourceType === "seeded"\)/);
  assert.match(storeRoute, /Included content · definition locked/);
  assert.match(storeRoute, /item\.sourceType === "custom"/);

  assert.match(teacherSafetyMigration, /ADMIN_STORE_SEEDED_ITEM_PROTECTED/);
  assert.match(teacherSafetyMigration, /game_item\.source_kind in \('physical_pack', 'system'\)/);
  assert.match(teacherSafetyMigration, /v_operation in \('update', 'archive'\)/);
  assert.match(adminMutation, /seeded_store_item_protected/);
  assert.match(adminMutation, /Included Store items cannot be edited or archived/);
});

test("Teacher presentation vocabulary does not alter internal route authority", () => {
  for (const expected of [
    "Teacher Console",
    "Students",
    "Stock Market",
    "Student Banking",
    "Student Loans",
    "Student Businesses",
    "Marketplace Review",
    "Redemption Requests",
    "World & Simulation",
    "Student Progress",
    "Simulation Settings",
    "Activity History",
  ]) {
    assert.match(navigation, new RegExp(expected.replace(/[&]/g, "\\&")));
  }
  assert.match(topbar, /Teacher Console/);
  assert.match(topbar, /administrator/);
  assert.match(topbar, /return !text \|\| text\.toLowerCase\(\) === "administrator" \? "Teacher"/);

  const registry = fs.readFileSync(
    "admin/v2/src/core/navigation-registry.js",
    "utf8",
  );
  assert.match(registry, /id:\s*"players"/);
  assert.match(registry, /permission:\s*"players\.manage"/);
  assert.match(registry, /id:\s*"world-management"/);
  assert.match(registry, /permission:\s*"world\.manage"/);
});
