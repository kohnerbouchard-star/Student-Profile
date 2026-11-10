import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const read = path => readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const sql = read('backend/supabase/migrations/20261110180000_admin_import_player_roster_v1.sql');
test('roster SQL composes canonical writes under one atomic receipt and audit boundary',()=>{
  assert.match(sql,/^begin;/);
  assert.match(sql,/commit;\s*$/);
  assert.equal((sql.match(/private.begin_admin_mutation_v1\(/g)||[]).length,1);
  assert.equal((sql.match(/private.complete_admin_mutation_v1\(/g)||[]).length,1);
  assert.match(sql,/public.create_player_with_balanced_country_assignment\(/);
  assert.match(sql,/public.set_player_identity_and_access_credential_v2\(/);
  assert.match(sql,/jsonb_build_object\('studentNames', p_student_names\)/);
  assert.doesNotMatch(sql,/insert into public\.(players|player_access_credentials|player_balances)/i);
  assert.doesNotMatch(sql,/'accessCode'|'studentCode'/);
  assert.match(sql,/600000/);
  assert.doesNotMatch(sql,/from public\.game_sessions[^;]*for update/i);
});
test('new API and application modules do not access persistence clients',()=>{
  for(const file of ['api/playerRosterImportHttpHandler.ts','application/importPlayerRoster.ts']) {
    const source=read(`backend/src/domains/players/${file}`);
    assert.doesNotMatch(source,/\.rpc\(|(?:client|service)\.from\(|infrastructure\//);
    assert.ok(source.split('\n').length<500);
  }
});
test('secured entrypoint owns auth and scope before roster dispatcher; one-time response is not cached',()=>{
  const index=read('backend/supabase/functions/admin-api/index.ts');
  assert.ok(index.indexOf('const security = await guardAdminRequest(')<index.indexOf('const localGameMutation = await handleLocalAdminGameMutation('));
  assert.ok(index.indexOf('const game = ensureOwnedGame(securedContext, gameId)')<index.indexOf('const localGameMutation = await handleLocalAdminGameMutation('));
  assert.match(index, /"Cache-Control": "private, no-store, max-age=0"/);
  const proxy=read('api/_admin-bff-proxy.js');
  assert.match(proxy,/cache: "no-store"/);
  assert.match(proxy,/response.setHeader\("Cache-Control", "private, no-store, max-age=0"\)/);
  assert.doesNotMatch(proxy,/console\.|logger\./);
});
