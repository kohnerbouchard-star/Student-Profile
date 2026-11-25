import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildDisposablePurgeControlFixture, seedFile } from './build-disposable-purge-control-fixture.mjs';
const root=new URL('../../../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');
test('fixture extracts only pinned canonical repository control seeds',async()=>{
 const source=await read(`backend/supabase/migrations/${seedFile}`);
 const sql=buildDisposablePurgeControlFixture(source);
 assert(sql.includes('DISPOSABLE_FIXTURE_LOCAL_ONLY'));
 assert(sql.includes('DISPOSABLE_FIXTURE_TARGET_NOT_EMPTY'));
 assert(!sql.includes('truncate table')); assert(!sql.includes('game_data_purge_requests as request_row'));
 assert(!sql.includes('supabase_migrations'));
 assert(sql.includes('207::bigint')); assert(sql.includes('456::bigint')); assert(sql.includes('206::bigint'));
 assert.throws(()=>buildDisposablePurgeControlFixture(source+'\n'),/source drift/);
 const shell=await read('scripts/operations/live-migration-reconciliation/rehearse-live-shaped-upgrade.sh');
 assert(shell.indexOf('run-captured-staging-purge-fixture.mjs')>shell.indexOf('schema_restored=true'));
 assert(shell.indexOf('run-captured-staging-purge-fixture.mjs')<shell.indexOf('all_pending=('));
});
const enabled=process.env.REF032_EMBEDDED_MODULE && process.env.REF032_CANONICAL_SCHEMA;
test('PostgreSQL: reproduce empty-registry failure and restore exact baseline controls', {skip:!enabled&&'Set REF032_EMBEDDED_MODULE and REF032_CANONICAL_SCHEMA'},async()=>{
 const {default:EmbeddedPostgres}=await import(process.env.REF032_EMBEDDED_MODULE);
 const dir=await mkdtemp(path.join(tmpdir(),'ref032-purge-fixture-'));
 const pg=new EmbeddedPostgres({databaseDir:path.join(dir,'db'),port:57639,user:'postgres',password:'disposable-only',persistent:false,postgresFlags:['-k','','-h','127.0.0.1'],onLog:line=>{if(process.env.REF032_DEBUG)console.log(line)},onError:line=>{if(process.env.REF032_DEBUG)console.error(line)},autoRehydrateSymlinks:true});
 let client;
 try {
  await pg.initialise();await pg.start();const admin=pg.getPgClient('postgres','127.0.0.1');await admin.connect();await admin.query('create database ref032_disposable_purge_fixture');await admin.end();client=pg.getPgClient('ref032_disposable_purge_fixture','127.0.0.1');await client.connect();
  await client.query("create schema private;create schema economy_private;create schema extensions;create schema auth;create function extensions.digest(text,text) returns bytea language sql immutable as $$select sha256(convert_to($1,'UTF8'))$$;set search_path=public,pg_catalog;set ref032.disposable_fixture='repository-only-v1';");
  const snapshotBytes=await readFile(process.env.REF032_CANONICAL_SCHEMA);
  assert.equal(createHash('sha256').update(snapshotBytes).digest('hex'),'772b1b8c90344007c7f44a0c69a5e8e2f72434064d07fa0bfb8828dc7c7bc55b','Exact-main clean-replay catalog fixture drift');
  const snapshot=JSON.parse(snapshotBytes).structural;
  const q=value=>'"'+value.replaceAll('"','""')+'"';
  const tables=new Map();
  const removed=new Set(['liability_kind','initiating_operator_player_id','borrower_business_id','obligation_currency_code']);
  for(const c of snapshot.columns){
   if(c.schema==='public'&&['loan_applications','player_loans'].includes(c.table)&&removed.has(c.name))continue;
   const key=c.schema+'.'+c.table;if(!tables.has(key))tables.set(key,new Map());
   const type=c.table==='game_data_purge_table_registry'?(c.name==='registered_at'?'timestamptz default now()':'text'):c.table==='game_data_purge_delete_order_v1'?(['position','dependency_depth'].includes(c.name)?'integer':'text'):'uuid';
   tables.get(key).set(c.name,type);
  }
  // Skeleton uses only repository clean-replay catalog identifiers and FK topology;
  // all other types/rows/functions are deliberately NOT a full application replay.
  for(const c of snapshot.constraints.filter(c=>c.type==='f')){
   const m=c.definition.match(/REFERENCES (?:(\w+)\.)?(\w+)\(([^)]+)\)/);assert(m);
   const key=(m[1]||'public')+'.'+m[2];
   if(!tables.has(key))tables.set(key,new Map(m[3].split(',').map(n=>[n.trim(),'uuid'])));
  }
  for(const [name,cols]of tables){const [schema,table]=name.split('.');await client.query(`create schema if not exists ${q(schema)};create table ${q(schema)}.${q(table)} (${[...cols].map(([name,type])=>`${q(name)} ${type}`).join(',')});`);}
  const excluded=new Set(['loan_applications_operator_scope_fk_v1','loan_applications_borrower_scope_fk_v1','player_loans_operator_scope_fk_v1','player_loans_borrower_scope_fk_v1']);
  const constraints=snapshot.constraints.filter(c=>['p','u','f'].includes(c.type)&&!excluded.has(c.name));
  const external=new Map();
  for(const c of constraints.filter(c=>c.type==='f')){
   const m=c.definition.match(/REFERENCES (?:(\w+)\.)?(\w+)\(([^)]+)\)/);const schema=m[1]||'public';
   external.set(`${schema}.${m[2]}|${m[3]}`,m[3]);
  }
  let refIndex=0;for(const [key,cols]of external)await client.query(`alter table ${key.split('|')[0]} add constraint fixture_reference_${refIndex++} unique (${cols})`);
  for(const type of ['p','u','f'])for(const c of constraints.filter(c=>c.type===type))await client.query(`alter table ${q(c.schema)}.${q(c.table)} add constraint ${q(c.name)} ${c.definition}`);
  const controlSource=await read('backend/supabase/migrations/20260920081600_phase15_reassert_current_purge_contract_v1.sql');
  for(const name of ['get_game_data_purge_registry_digest_v1','get_game_data_purge_fk_graph_digest_v1','get_game_data_purge_delete_order_digest_v1','execute_game_data_purge_db_batch_v2','finalize_game_data_purge_v1']){
   const start=controlSource.indexOf(`create or replace function public.${name}(`);assert(start>=0);
   const end=controlSource.indexOf('$function$;',controlSource.indexOf('as $function$',start))+12;
   await client.query(controlSource.slice(start,end));
  }
  const loan=await read('backend/supabase/migrations/20261004145731_add_loan_liability_contract_v1.sql');
  const reconcile=await read('backend/supabase/migrations/20261004202506_reconcile_loan_liability_purge_graph_v1.sql');
  const fixture=buildDisposablePurgeControlFixture(await read(`backend/supabase/migrations/${seedFile}`));
  const graph=async()=> (await client.query('select * from public.get_game_data_purge_fk_graph_digest_v1()')).rows[0];
  assert.equal((await graph()).edge_count,'0');
  await client.query("set ref032.disposable_fixture='unapproved'");
  await assert.rejects(client.query(fixture),e=>e.message==='DISPOSABLE_FIXTURE_LOCAL_ONLY');
  await client.query('rollback');await client.query("set ref032.disposable_fixture='repository-only-v1'");

  await client.query(loan);
  await assert.rejects(client.query(reconcile),e=>e.code==='P0001'&&e.message==='REF025_UNEXPECTED_PURGE_GRAPH');await client.query('rollback');
  // Rewind loan DDL by recreating this exact skeleton's affected tables is unsafe;
  // instead undo only the added constraints/indexes/columns in this disposable DB.
  for(const table of ['loan_applications','player_loans'])await client.query(`alter table public.${table} drop column liability_kind cascade,drop column initiating_operator_player_id cascade,drop column borrower_business_id cascade${table==='loan_applications'?',drop column obligation_currency_code cascade':''}`);
  await client.query('create table public.fixture_unapproved_game_scope(game_session_id uuid)');
  await assert.rejects(client.query(fixture),e=>e.message==='DISPOSABLE_REGISTRY_BASELINE_MISMATCH');
  await client.query('rollback');
  assert.equal((await client.query('select count(*) as n from private.game_data_purge_table_registry')).rows[0].n,'0');
  assert.equal((await client.query('select count(*) as n from private.game_data_purge_delete_order_v1')).rows[0].n,'0');
  await client.query('drop table public.fixture_unapproved_game_scope');
  await client.query(fixture);
  assert.deepEqual(await graph(),{fk_graph_sha256:'fe88cafd56ca4c21ab3c1d34385e21f4c3d8be201eae44ee7f5539a34a98f329',edge_count:'456'});
  await assert.rejects(client.query(fixture),e=>e.message==='DISPOSABLE_FIXTURE_TARGET_NOT_EMPTY');await client.query('rollback');
  await client.query(loan);assert.deepEqual(await graph(),{fk_graph_sha256:'0c932d6e620cec801b527e81f3e4d3e91bd8d70fd4fb45d6e1a72166ff0c7a82',edge_count:'460'});
  await client.query(reconcile);
  assert.equal((await client.query("select position('v_fk_count <> 460' in pg_get_functiondef('public.finalize_game_data_purge_v1(uuid)'::regprocedure))>0 as ok")).rows[0].ok,true);
 } finally {await client?.end();if(pg.process?.exitCode===null)await pg.stop();await rm(dir,{recursive:true,force:true});}
});
