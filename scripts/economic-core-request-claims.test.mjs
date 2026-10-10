import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MIGRATION, OLD_ROLE, NEW_ROLE, assertDisposable } from "./economic-core-request-claims-acceptance.mjs";
const sql = readFileSync(new URL(`../${MIGRATION}`, import.meta.url), "utf8");
const config = { DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres", API_URL: "http://127.0.0.1:54321", SERVICE_ROLE_KEY: "synthetic", ANON_KEY: "synthetic" };
const env = { CI: "true", ECONOMIC_CORE_DISPOSABLE_TEST: "1", DATABASE_URL: config.DB_URL, RELEASE_COMMIT: "a".repeat(40) };
test("only explicitly attested local CI configuration is accepted", () => assert.doesNotThrow(() => assertDisposable(config, env)));
for (const key of ["CI", "ECONOMIC_CORE_DISPOSABLE_TEST", "DATABASE_URL", "RELEASE_COMMIT"]) {
  test(`missing ${key} fails closed before fixture operations`, () => assert.throws(() => assertDisposable(config, { ...env, [key]: "" })));
}
for (const [key, value] of [["DB_URL", "postgresql://postgres@example.invalid/postgres"], ["API_URL", "https://example.invalid"], ["SERVICE_ROLE_KEY", ""], ["ANON_KEY", ""]]) {
  test(`unavailable or nonlocal ${key} is rejected`, () => assert.throws(() => assertDisposable({ ...config, [key]: value }, env)));
}
test("migration uses the tested modern-first expression exactly", () => {
  assert.ok(sql.includes(`$old$${OLD_ROLE}$old$`));
  assert.ok(sql.includes(`$new$${NEW_ROLE}$new$`));
  assert.match(NEW_ROLE, /when nullif\(current_setting\('request\.jwt\.claims', true\), ''\) is not null/);
  assert.ok(!NEW_ROLE.includes("user_metadata") && !NEW_ROLE.includes("current_user"));
});
test("only the two existing guard definitions may change", () => {
  assert.match(sql, /'public\.sync_game_item_catalog_v2\(uuid,jsonb\)',\s*'public\.validate_economic_asset_core_v2\(uuid\)'/);
  assert.match(sql, /execute replace\(definition, old_role, new_role\)/);
  assert.match(sql, /length\(old_role\) <> 1/);
  assert.match(sql, /after_row - 'prosrc'.*is distinct from/s);
  assert.match(sql, /replace\(before_row ->> 'prosrc', old_role, new_role\)/);
  assert.ok(!/^\s*(grant|revoke|alter|drop|create\s+(?:or\s+replace\s+)?function)\b/im.test(sql));
  assert.match(sql, /ECONOMIC_CORE_CLAIMS_AUTHORITY_DRIFT/);
  assert.match(sql, /ECONOMIC_CORE_CLAIMS_POSTCONDITION_FAILED/);
  assert.match(sql, /begin;/);
  assert.ok(sql.trim().endsWith("commit;"));
});
