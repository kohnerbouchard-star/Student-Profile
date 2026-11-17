import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { assertStoryDatabaseEnvironment } from './story-execution-database.mjs';
const sha = 'a'.repeat(40);
const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'pull_request', GITHUB_REPOSITORY: 'kohnerbouchard-star/Student-Profile' };
const event = { pull_request: { head: { sha }, base: { ref: 'main' } } };
test('Story acceptance permits only exact PR source on hosted disposable runner', () => {
  assert.doesNotThrow(() => assertStoryDatabaseEnvironment(env,sha,event));
  for (const change of [{GITHUB_ACTIONS:'false'},{GITHUB_EVENT_NAME:'push'},{GITHUB_REPOSITORY:'other/repo'},
    ...['DATABASE_URL','SUPABASE_DB_URL','SUPABASE_ACCESS_TOKEN','DOCKER_HOST','DOCKER_CONTEXT'].map(key=>({[key]:'external'}))]) {
    assert.throws(() => assertStoryDatabaseEnvironment({...env,...change},sha,event));
  }
  assert.throws(() => assertStoryDatabaseEnvironment(env,'b'.repeat(40),event));
  assert.throws(() => assertStoryDatabaseEnvironment(env,sha,{pull_request:{head:{sha},base:{ref:'production'}}}));
});
test('Story SQL is rollback-only and contains semantic assertions rather than migration text checks', () => {
  const sql = readFileSync('scripts/story-execution-database.sql','utf8');
  assert.match(sql,/^\\set ON_ERROR_STOP on\nbegin;/);
  assert.match(sql,/rollback;\nselect 'STORY_EXECUTION_DATABASE_ACCEPTANCE_PASSED';\s*$/);
  assert.doesNotMatch(sql,/\bcommit\s*;/i);
  for(const marker of ['Draft game accepted Story execution','Story fixture lifecycle did not activate','Expected busy without token','Cross-game lease token accepted','Stale lease token accepted','Retry changed frozen identity or plan','Duplicate resolution','Replay overwrote result','Unexpected RPC privilege']) assert(sql.includes(marker));
});

test('Story fixture honors canonical lifecycle and never disables database guards', () => {
  const sql = readFileSync('scripts/story-execution-database.sql','utf8');
  assert.match(sql,/status,lifecycle_state,game_join_code_status/);
  assert.match(sql,/'disabled','draft','pending'/);
  assert.match(sql,/set lifecycle_state='active', status='active'/);
  assert.doesNotMatch(sql,/disable trigger|session_replication_role|alter function/i);
  assert(sql.indexOf('Draft game accepted Story execution') < sql.indexOf("set lifecycle_state='active'"));
});
