import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL(
  '../backend/supabase/migrations/20260721094000_harden_transactional_seed_release_rollback_v1.sql',
  import.meta.url,
);
const promotionCompatibilityPath = new URL(
  '../backend/supabase/migrations/20260903163000_seed_store_identity_promotion_compatibility_v1.sql',
  import.meta.url,
);

test('seed rollback restores and deletes only from the current release member', async () => {
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

  assert.match(sql, /v_previous_row\s*:=\s*v_member\.previous_row/);
  assert.match(sql, /if\s+v_member\.created_by_release\s+then/);

  assert.doesNotMatch(sql, /v_created_by_any_release/);
  assert.doesNotMatch(sql, /order\s+by\s+m\.created_at/);
  assert.doesNotMatch(
    sql,
    /select\s+m\.previous_row\s+into\s+v_previous_row\s+from\s+public\.seed_content_release_members/s,
  );
});

test('seed rollback preserves shared templates and remains service-role only', async () => {
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

  assert.match(
    sql,
    /v_member\.object_type\s+in\s*\('stock_template',\s*'contract_template'\)\s+and\s+v_other_reference\s+then\s+continue/s,
  );
  assert.match(sql, /security\s+definer/);
  assert.match(sql, /set\s+search_path\s*=\s*''/);
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.rollback_seed_content_release_v1[\s\S]*from\s+public,\s*anon,\s*authenticated/,
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.rollback_seed_content_release_v1[\s\S]*to\s+service_role/,
  );
});

test('seed forward promotion preserves exact Store identity authority', async () => {
  const sql = (await readFile(promotionCompatibilityPath, 'utf8')).toLowerCase();

  assert.match(sql, /is_seed_store_identity_promotion_authorized_v1/);
  assert.match(sql, /app\.seed_store_identity_promotion_release_id/);
  assert.match(sql, /member_row\.object_type = 'store_item'/);
  assert.match(sql, /member_row\.created_by_release/);
  assert.match(sql, /offer_row\.seller_kind = 'seeded'/);
  assert.match(sql, /offer_row\.replenishment_policy = 'canonical_supply'/);
  assert.match(sql, /offer_row\.metadata->>'compatibilitysource' = 'store_items'/);
  assert.match(sql, /economic_core_store_mapping_has_offer_history/);
  assert.match(sql, /update public\.store_items[\s\S]*set[\s\S]*game_item_id = v_target_item\.id/i);
  assert.match(sql, /update public\.store_seller_offers[\s\S]*set[\s\S]*game_item_id = v_target_item\.id/i);
  assert.match(sql, /version = version \+ 1/);
  assert.match(sql, /exception when others then/);
});

test('seed promotion does not grant browser or ordinary Store mutation authority', async () => {
  const sql = (await readFile(promotionCompatibilityPath, 'utf8')).toLowerCase();

  assert.match(sql, /revoke all on function private\.is_seed_store_identity_promotion_authorized_v1[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(sql, /store_seller_offer_store_item_identity_immutable/);
  assert.doesNotMatch(sql, /grant execute[\s\S]*to anon/);
  assert.doesNotMatch(sql, /grant execute[\s\S]*to authenticated/);
});
