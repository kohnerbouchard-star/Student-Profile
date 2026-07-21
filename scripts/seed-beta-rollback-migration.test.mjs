import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL(
  '../backend/supabase/migrations/20260721094000_harden_transactional_seed_release_rollback_v1.sql',
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
