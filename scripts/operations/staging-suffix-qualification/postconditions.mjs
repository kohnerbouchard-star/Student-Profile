import assert from 'node:assert/strict';
import {sha256} from './compiler.mjs';
const requireSQL=condition=>`do $check$ begin if not (${condition}) then raise exception 'SYNTHETIC_POSTCONDITION_FAILED'; end if; end $check$;`;
export function predicates(rows){
 return Object.fromEntries(rows.map((row,index)=>{
  const names=[...row.body.matchAll(/create(?: or replace)? function (\w+\.\w+)\(/gi)].map(m=>m[1]);
  let sql=names.map(name=>requireSQL(`exists(select from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='${name.split('.')[0]}' and p.proname='${name.split('.')[1]}')`)).join('\n');
  if(index===0)sql+=requireSQL("(select count(*)=2 from pg_constraint where conname in ('loan_applications_business_liability_disabled_v1','player_loans_business_liability_disabled_v1') and convalidated)");
  if(index===1)sql+=requireSQL("(select edge_count=460 and fk_graph_sha256='0c932d6e620cec801b527e81f3e4d3e91bd8d70fd4fb45d6e1a72166ff0c7a82' from public.get_game_data_purge_fk_graph_digest_v1())")+requireSQL(`not exists(select from qualification_probe.purge_before b join pg_proc p on p.oid=b.signature::regprocedure where (to_jsonb(p)-'prosrc')<>b.metadata or replace(replace(pg_get_functiondef(p.oid),'0c932d6e620cec801b527e81f3e4d3e91bd8d70fd4fb45d6e1a72166ff0c7a82','fe88cafd56ca4c21ab3c1d34385e21f4c3d8be201eae44ee7f5539a34a98f329'),'v_fk_count <> 460','v_fk_count <> 456')<>b.definition)`);
  if(index===8)sql+=requireSQL("(select count(*)=2 and bool_and(position('request.jwt.claims' in prosrc)>0 and prosecdef and has_function_privilege('service_role',oid,'EXECUTE') and not has_function_privilege('anon',oid,'EXECUTE') and not has_function_privilege('authenticated',oid,'EXECUTE')) from pg_proc where oid in ('public.sync_game_item_catalog_v2(uuid,jsonb)'::regprocedure,'public.validate_economic_asset_core_v2(uuid)'::regprocedure))");
  if(index===6)sql+=requireSQL('not exists(select from recovery_private.target)');
  if(index===12)sql+=requireSQL("(select format_type(atttypid,atttypmod)='numeric(16,4)' from pg_attribute where attrelid='public.business_inventory'::regclass and attname='unit_cost')")+requireSQL("(select count(*)=2 from pg_trigger where tgrelid='public.business_inventory'::regclass and tgname in ('assign_business_inventory_context_v2','project_business_inventory_v2') and tgenabled='O')")+`do $$ begin begin perform * from public.claim_due_business_manufacturing_jobs_v2(null,10,90); raise exception 'CLAIM_GUARD_MISSING'; exception when raise_exception then if sqlerrm <> 'BUSINESS_MANUFACTURING_COMPLETION_CLAIM_INVALID' then raise; end if; end; end $$;`;
  assert(sql.length>0,`${row.filename}: missing predicate`);
  return[row.version,{reviewed:true,sql,sha256:sha256(sql)}];
 }));
}
export const BASELINE_PROBE=`create schema qualification_probe;
create table qualification_probe.purge_before as select oid::regprocedure::text signature,to_jsonb(p)-'prosrc' metadata,pg_get_functiondef(oid) definition from pg_proc p where oid in ('public.execute_game_data_purge_db_batch_v2(uuid,integer)'::regprocedure,'public.finalize_game_data_purge_v1(uuid)'::regprocedure);`;
