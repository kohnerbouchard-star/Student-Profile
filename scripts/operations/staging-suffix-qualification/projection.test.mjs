import assert from 'node:assert/strict';
import {normalizeOuterDumpNonce,legacySnapshotDigest,TEST_DUMP_KEY} from './run.mjs';
import test from 'node:test';
import {loadBatch} from './compiler.mjs';
import {withSyntheticPostgres} from './native-test-support.mjs';
import {projectionFixture,projectionAssertions} from './manufacturing-fixture.mjs';
test('actual immutable manufacturing projection preserves four decimals and canonical holding', {skip:!process.env.STAGING_SUFFIX_SYNTHETIC_PG_BIN&&'NOT_RUN: verified native PG17 required'},async()=>{
 const rows=await loadBatch(process.cwd());
 const body=rows[12].body;
 const start=body.indexOf('create or replace function economy_private.refresh_manufacturing_inventory_projection_v1(');
 const end=body.indexOf('$function$;',body.indexOf('as $function$',start)+14);
 if(start<0||end<0)throw Error('IMMUTABLE_MANUFACTURING_BOUNDARY_DRIFT');
 const definition=body.slice(start,end+11);
 await withSyntheticPostgres(async({sql})=>sql('postgres',projectionFixture+definition+projectionAssertions));
});

test('real PostgreSQL no-op dumps reproduce trimmed-footer false mismatch; deterministic dumps retain data and ACL differences',{skip:!process.env.STAGING_SUFFIX_SYNTHETIC_PG_BIN&&'NOT_RUN: verified native PG17 required'},async()=>{
 await withSyntheticPostgres(async({sql,dump})=>{
  sql('postgres',"create table public.snapshot_probe(value text);create sequence public.snapshot_probe_seq;insert into public.snapshot_probe values('trailing space ');grant select on public.snapshot_probe to service_role;");
  const a=dump('postgres').trim(),b=dump('postgres').trim();
  assert(a.includes('\\restrict '));assert.notEqual(a,b);
  assert.notEqual(legacySnapshotDigest(a),legacySnapshotDigest(b));
  assert.equal(normalizeOuterDumpNonce(a),normalizeOuterDumpNonce(b));
  const flags=['--restrict-key='+TEST_DUMP_KEY],fixed=dump('postgres',flags).trim();
  assert.equal(fixed,dump('postgres',flags).trim());
  sql('postgres',"update public.snapshot_probe set value='changed';");assert.notEqual(fixed,dump('postgres',flags).trim());
  sql('postgres',"update public.snapshot_probe set value='trailing space ';revoke select on public.snapshot_probe from service_role;");assert.notEqual(fixed,dump('postgres',flags).trim());
  sql('postgres','grant select on public.snapshot_probe to service_role;');assert.equal(fixed,dump('postgres',flags).trim());
  sql('postgres',"select nextval('public.snapshot_probe_seq');");assert.notEqual(fixed,dump('postgres',flags).trim());
 });
});
