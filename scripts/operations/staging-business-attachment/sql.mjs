import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateDatabaseUrlProjectRef} from '../../release-integrity/database-binding.mjs';
import {readPinnedCertificate} from '../staging-inert-sidecar/policy.mjs';
import {baseline,birthMatches,births,isHash,phaseReceipt,project,shape,uuid,verifyPacket} from './policy.mjs';

// Fixed staged-only action packets; no data mutation/other-lane RPC.
export const readPacket=file=>readFileSync(new URL(file,import.meta.url));
const lit=x=>"'"+String(x).replaceAll("'","''")+"'";
const ledger='supabase_migrations.schema_migrations';
const business='staging_economic_pause';
const auth='staging_app_auth_guard';
const marker='STAGING_BUSINESS_OPEN_PHASE_COMMITTED_V1';
const guardNames="'a00_staging_economic_guard','a00_staging_economic_row_guard'";
function catalogDigest(schemas,extraFunction='true',extraTrigger='true') {
  return `(with n as (
    select oid,nspname,nspowner,nspacl from pg_namespace where nspname in (${schemas.map(lit).join(',')})
  ), c as (
    select c.*,n.nspname from pg_class c join n on n.oid=c.relnamespace where c.relkind not in ('i','I','t')
  ), p as (
    select p.*,n.nspname from pg_proc p join n on n.oid=p.pronamespace where p.prokind in ('f','p','w') and (${extraFunction})
  )
  select encode(sha256(convert_to(jsonb_build_object(
   'schemas',(select jsonb_agg(jsonb_build_array(nspname,nspowner::regrole::text,nspacl::text) order by nspname) from n),
   'relations',(select jsonb_agg(jsonb_build_array(
     nspname,relname,relowner::regrole::text,relkind,relacl::text,relpersistence,relrowsecurity,relforcerowsecurity,
     reloptions::text,relreplident,
     (select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text,a.attidentity,
           a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
     (select jsonb_agg(jsonb_build_array(z.conname,pg_get_constraintdef(z.oid),z.convalidated) order by z.conname,z.contype)
      from pg_constraint z where z.conrelid=c.oid),
     (select jsonb_agg(pg_get_indexdef(i.indexrelid) order by ci.relname) from pg_index i join pg_class ci on ci.oid=i.indexrelid
      where i.indrelid=c.oid),
     (select jsonb_agg(jsonb_build_array(t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) order by t.tgname)
      from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal and (${extraTrigger})),
     (select jsonb_agg(pg_get_ruledef(r.oid) order by r.rulename) from pg_rewrite r where r.ev_class=c.oid),
     (select jsonb_agg(jsonb_build_array(z.polname,z.polcmd,z.polpermissive,z.polroles::text,
        pg_get_expr(z.polqual,z.polrelid),pg_get_expr(z.polwithcheck,z.polrelid)) order by z.polname)
      from pg_policy z where z.polrelid=c.oid)
   ) order by nspname,relname) from c),
   'functions',(select jsonb_agg(jsonb_build_array(nspname,proname,pg_get_function_identity_arguments(oid),
    proowner::regrole::text,proacl::text,pg_get_functiondef(oid)) order by nspname,proname,pg_get_function_identity_arguments(oid))
    from p))::text,'UTF8')),'hex'))`;
}
const census=`(with tables as (
 select c.oid,c.relname,c.relkind,c.relowner,c.relacl,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='staging_app_auth_guard' and c.relkind not in ('i','I','t')
), funcs as (
 select p.*,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='staging_app_auth_guard' or
 (n.nspname='public' and p.proname in ('staging_track_password_reset_begin_v1','staging_track_password_reset_complete_v1'))
)
select jsonb_build_object(
 'namespace',(select jsonb_build_array(nspowner::regrole::text,nspacl::text) from pg_namespace where nspname='staging_app_auth_guard'),
 'tables',(select coalesce(jsonb_agg(jsonb_build_object(
  'name',t.relname,'kind',t.relkind,'owner',t.relowner::regrole::text,'acl',t.relacl::text,'permanence',t.relpersistence,
  'rls',t.relrowsecurity,'force',t.relforcerowsecurity,
  'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
   from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
   where a.attrelid=t.oid and a.attnum>0 and not a.attisdropped),
  'constraints',(select jsonb_agg(jsonb_build_array(x.conname,pg_get_constraintdef(x.oid),x.convalidated) order by x.conname)
   from pg_constraint x where x.conrelid=t.oid),
  'indexes',(select jsonb_agg(pg_get_indexdef(i.indexrelid) order by ci.relname)
   from pg_index i join pg_class ci on ci.oid=i.indexrelid where i.indrelid=t.oid),
  'triggers',(select jsonb_agg(jsonb_build_array(g.tgname,pg_get_triggerdef(g.oid),g.tgenabled) order by g.tgname)
   from pg_trigger g where g.tgrelid=t.oid),
  'rules',(select jsonb_agg(pg_get_ruledef(r.oid) order by r.rulename)
   from pg_rewrite r where r.ev_class=t.oid),
  'policies',(select jsonb_agg(jsonb_build_array(z.polname,z.polcmd,z.polpermissive,
   z.polroles::text,pg_get_expr(z.polqual,z.polrelid),pg_get_expr(z.polwithcheck,z.polrelid)) order by z.polname)
   from pg_policy z where z.polrelid=t.oid)
 ) order by t.relname),'[]'::jsonb) from tables t),
 'routines',(select coalesce(jsonb_agg(jsonb_build_object(
   'namespace',f.nspname,'name',f.proname,'args',pg_get_function_identity_arguments(f.oid),
   'source',pg_get_functiondef(f.oid),'owner',f.proowner::regrole::text,'acl',f.proacl::text
 ) order by f.nspname,f.proname,pg_get_function_identity_arguments(f.oid)),'[]'::jsonb) from funcs f)
))`;
const authDigest=`encode(sha256(convert_to((${census})::text,'UTF8')),'hex')`;
export function stageDbEnv(raw,root,readonly=false) {
  assert(typeof raw==='string' && raw.length<=8192 && !/[\x00-\x20\x7f\\#]/.test(raw));
  assert.match(raw,/^postgres(?:ql)?:\/\//);
  const u=new URL(raw);
  assert.equal(u.pathname,'/postgres');assert.equal(u.port,'5432');
  assert(!raw.includes('?')||u.search==='?sslmode=verify-full'&&raw.endsWith('?sslmode=verify-full'));
  const user=decodeURIComponent(u.username),password=decodeURIComponent(u.password);
  assert(password && !/[\x00-\x1f\x7f]/.test(password));
  const binding=validateDatabaseUrlProjectRef({databaseUrl:raw,expectedProjectRef:project});
  if(binding.connectionType==='direct') {assert.equal(u.hostname,'db.'+project+'.supabase.co');assert.equal(user,'postgres');}
  else {assert.equal(binding.connectionType,'pooler');assert.equal(u.hostname,'aws-1-ap-northeast-2.pooler.supabase.com');
    assert.equal(user,'postgres.'+project);}
  return {PATH:'/usr/bin:/bin',PGHOST:u.hostname,PGPORT:'5432',PGDATABASE:'postgres',PGUSER:user,PGPASSWORD:password,
    PGSSLROOTCERT:readPinnedCertificate(root),PGSSLMODE:'verify-full',PGGSSENCMODE:'disable',PGCONNECT_TIMEOUT:'10',
    PGPASSFILE:'/dev/null',PGSERVICEFILE:'/dev/null',PGAPPNAME:'econovaria-staging-business-open',
    ...(readonly?{PGOPTIONS:'-c default_transaction_read_only=on'}:{})};
}
const businessDigest=catalogDigest([business]);
const verifiedGuard=`(t.tgname in (${guardNames}) and
  t.tgfoid=to_regprocedure('${business}.require_economic_write_open()') and
  c.nspname='public' and c.relname in (select relation_name from ${business}.economic_targets()))`;
const appDigest=catalogDigest(['public','private','auth'],'true','not '+verifiedGuard);
const guardDigest=`(select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(
  n.nspname,c0.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by n.nspname,c0.relname,t.tgname),'[]'::jsonb)::text,'UTF8')),'hex')
  from pg_trigger t join pg_class c0 on t.tgrelid=c0.oid join pg_namespace n on n.oid=c0.relnamespace
  where not t.tgisinternal and (t.tgname in (${guardNames}) or
    t.tgfoid=to_regprocedure('${business}.require_economic_write_open()')))`;
const state=`(select epoch from ${business}.scopes where scope='economic-db')`;
const authEpoch=`(select epoch from ${auth}.control)`;
const cronMatch=`jobname='econovaria-autonomous-timed-services-v1'`;
const cronGuard=`(select count(*)=1 and coalesce(bool_and(active and schedule='* * * * *'
  and database=current_database() and username='postgres'
  and command='select * from public.run_due_autonomous_timed_services_v1(clock_timestamp());'),false)
  from cron.job where ${cronMatch})`;
const cronDigest=`(select encode(sha256(convert_to(jsonb_agg(to_jsonb(j) order by jobid)::text,'UTF8')),'hex')
  from cron.job j where ${cronMatch})`;
const core=`current_database()='postgres' and session_user='postgres' and current_user='postgres'
  and not pg_is_in_recovery() and current_setting('server_version_num')::int/10000=17
  and (select count(*)=468 and max(version)='20260921044500' and
   encode(sha256(convert_to(jsonb_agg(to_jsonb(m) order by m.version collate "C")::text,'UTF8')),'hex')=${lit(baseline)} from ${ledger} m)
  and not exists (select 1 from pg_namespace where nspname in ('staging_campaign','staging_non_campaign','staging_writer_hold','staging_writer_admission'))`;
const window=req=>`clock_timestamp()>=${lit(req.maintenance.startsAt)}::timestamptz and
  clock_timestamp()<${lit(req.maintenance.endsAt)}::timestamptz`;
const noUsage=s=>`not exists (select 1 from (values ('anon'),('authenticated'),('service_role')) a(r)
  where has_schema_privilege(a.r,'${s}','USAGE') or has_schema_privilege(a.r,'${s}','CREATE'))`;
const assertSql=(tag,predicate)=>`do $${tag}$ begin
  if (${predicate}) is distinct from true then raise exception '${tag.toUpperCase()}'; end if;
end $${tag}$;\n`;
const authority=`(select count(*)=23 and bool_and(c.oid is not null and
  pg_has_role(current_user,c.relowner,'USAGE') and has_table_privilege(current_user,c.oid,'TRIGGER'))
  from ${business}.economic_targets() s left join pg_class c
    on c.relname=s.relation_name and c.relnamespace='public'::regnamespace)`;
const phase=(attached)=>`(select count(*)=1 from ${business}.scopes)
 and exists(select 1 from ${business}.scopes where scope='economic-db' and not held and attached=${attached})
 and ${noUsage(business)} and ${noUsage(auth)}
 and (select count(*)=1 from ${auth}.control)
 and exists(select 1 from ${auth}.control where singleton and deployment is null and held_at is null)
 and not exists(select 1 from ${auth}.pending) and ${authority} and ${cronGuard}`;
const assertions=(req,attached,ro)=>assertSql('business_boundary',core+' and '+window(req)+
  " and current_setting('transaction_read_only')="+lit(ro?'on':'off'))+
  assertSql('business_phase_drift',phase(attached))+
  `select ${business}.check_private_acl();
select ${business}.check_economic_topology(${attached});\n`;
const observation=`jsonb_build_object('epoch',${state},'authEpoch',${authEpoch},
  'businessCatalog',${businessDigest},'authCatalog',${authDigest},'guardDigest',${guardDigest},
  'cronDigest',${cronDigest},'appDigest',${appDigest})`;
const startsAttached=req=>req.action==='detach-open';
export function preflightSql(req) {
  return `\\set ON_ERROR_STOP on
begin isolation level repeatable read read only;
set local search_path=pg_catalog,pg_temp;
set local lock_timeout='2s';
set local statement_timeout='8s';
${assertions(req,startsAttached(req),true)}
select ${observation};
rollback;
`;
}
function checkObservation(o) {
  shape(o,'epoch authEpoch businessCatalog authCatalog guardDigest cronDigest appDigest');
  assert([o.epoch,o.authEpoch].every(x=>typeof x==='string'&&uuid.test(x)));
  assert(['businessCatalog','authCatalog','guardDigest','cronDigest','appDigest'].every(k=>isHash(o[k])));
  return o;
}
export function parsePreflight(text,req) {
  const o=checkObservation(JSON.parse(text));
  assert.equal(o.authCatalog,births.auth.catalogDigest);
  assert.equal(o.businessCatalog,births.business.catalogDigest);
  birthMatches('auth',o.authEpoch);
  if(!startsAttached(req)) birthMatches('business',o.epoch);
  else assert.equal(phaseReceipt({...req.attach,action:'attach-open',epoch:o.epoch,
    catalogDigest:o.businessCatalog,guardDigest:o.guardDigest,priorReceipt:births.business.receiptSha256}),
    req.attach.receiptSha256,'BUSINESS_ATTACHMENT_RECEIPT_DRIFT');
  return o;
}

export function protectedSql(req,o) {
  checkObservation(o);
  const art=verifyPacket(req.action,readPacket);
  assert.equal(art.split('\nbegin;\n').length,2);
  assert.equal(art.split('\ncommit;\n').length,2);assert(art.endsWith('\ncommit;\n'));
  const pre=`set local search_path=pg_catalog,pg_temp;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table ${ledger} in share mode;
${assertSql('business_serialize',"pg_try_advisory_xact_lock(hashtextextended('econovaria.stage.inert-sidecar.v1',0))")}
lock table ${auth}.control, ${auth}.pending in share mode;
${assertions(req,startsAttached(req),false)}
${assertSql('business_observation_drift',observation+'='+lit(JSON.stringify(o))+'::jsonb')}
`;
  const after=!startsAttached(req);
  const finish=assertions(req,after,false)+assertSql('business_out_of_scope_delta',
    state+'<>'+lit(o.epoch)+'::uuid and '+authEpoch+'='+lit(o.authEpoch)+'::uuid and '+
    [['businessCatalog',businessDigest],['authCatalog',authDigest],['appDigest',appDigest],['cronDigest',cronDigest]]
      .map(([k,e])=>e+'='+lit(o[k])).join(' and '))+
    `select jsonb_build_object('epoch',${state},'catalogDigest',${businessDigest},'guardDigest',${guardDigest});
commit;
select '${marker}';
`;
  const prepared=art.replace('\nbegin;\n','\nbegin;\n'+pre);
  return `\\set ON_ERROR_STOP on\n\\set economic_epoch '${o.epoch}'\n${prepared.slice(0,-'commit;\n'.length)}${finish}`;
}
export function parseCommit(text,{req,head,runId},old) {
  const lines=text.trim().split('\n').filter(line=>line.trim()!=='');
  assert.equal(lines.length,2);assert.equal(lines.at(-1),marker,'BUSINESS_COMMIT_UNCONFIRMED');
  const o=JSON.parse(lines[0]);
  shape(o,'epoch catalogDigest guardDigest');
  assert.equal(o.catalogDigest,old.businessCatalog);
  assert.notEqual(o.epoch,old.epoch);
  assert.notEqual(o.guardDigest,old.guardDigest);
  const priorReceipt=req.attach?.receiptSha256??births.business.receiptSha256;
  return {status:'BUSINESS_OPEN_PHASE_COMMITTED',projectRef:project,action:req.action,head,runId,
    ledgerSha256:baseline,held:false,attached:!startsAttached(req),guardCount:startsAttached(req)?0:24,
    authUnboundUnchanged:true,cronWitnessUnchanged:true,hostedDrainAttested:false,catalogDigest:o.catalogDigest,
    guardDigest:o.guardDigest,priorReceipt,receiptSha256:phaseReceipt({head,runId,action:req.action,priorReceipt,...o})};
}
