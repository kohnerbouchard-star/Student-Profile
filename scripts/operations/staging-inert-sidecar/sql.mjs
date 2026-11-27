// Renders two fixed independent inert packets; no caller-supplied SQL.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateDatabaseUrlProjectRef} from '../../release-integrity/database-binding.mjs';
import {baseline,project,verifyPacket,uuid,isHash,readPinnedCertificate,receiptDigest} from './policy.mjs';
import {renderInertInstall,renderInertUndo} from './auth/review.mjs';

export const readPacket=f=>readFileSync(new URL(f,import.meta.url));
export const successMarker='STAGING_INERT_SIDECAR_COMMITTED_V1';
const ledger='supabase_migrations.schema_migrations', cutoff='20260921044500';
const authNames="'staging_track_password_reset_begin_v1','staging_track_password_reset_complete_v1'";
const businessSchema='staging_economic_pause', authSchema='staging_app_auth_guard';
const guardNames="'a00_staging_economic_guard','a00_staging_economic_row_guard'";
const lit=x=>"'"+String(x).replaceAll("'","''")+"'";
const scheduleWindow=req=>"clock_timestamp()>="+lit(req.maintenance.startsAt)+"::timestamptz and "+
  "clock_timestamp()<"+lit(req.maintenance.endsAt)+"::timestamptz";
const ledgerGuard=`((select count(*)=468 and
  encode(sha256(convert_to(jsonb_agg(to_jsonb(m) order by m.version collate "C")::text,'UTF8')),'hex')=${lit(baseline)}
  and coalesce(max(version)=${lit(cutoff)},false) from ${ledger} m) is true)`;
const primary=`(current_database()='postgres' and session_user='postgres' and current_user='postgres' and
  not pg_is_in_recovery() and current_setting('server_version_num')::int/10000=17)`;
const absentForbidden=`to_regnamespace('staging_campaign') is null and
  to_regnamespace('staging_non_campaign') is null and to_regnamespace('staging_writer_hold') is null
  and to_regnamespace('staging_writer_admission') is null`;
const authAbsent=`to_regnamespace('${authSchema}') is null and not exists(
  select 1 from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and p.proname in(${authNames}))`;
const noBusinessTrigger=`not exists (select 1 from pg_trigger where tgname in (${guardNames})
  or tgfoid=to_regprocedure('${businessSchema}.require_economic_write_open()'))`;
const businessAbsent=`to_regnamespace('${businessSchema}') is null and ${noBusinessTrigger}`;
const unbound=`(select count(*)=1 from ${authSchema}.control)
  and exists(select 1 from ${authSchema}.control where singleton and deployment is null and held_at is null)
  and not exists(select 1 from ${authSchema}.pending)`;
const unattached=`(select count(*)=1 from ${businessSchema}.scopes)
  and exists(select 1 from ${businessSchema}.scopes where scope='economic-db' and not held and not attached)
  and ${noBusinessTrigger}`;
const assertion=(label,expr)=>`do $${label}$ begin if (${expr}) is distinct from true
  then raise exception '${label.toUpperCase()}'; end if; end $${label}$;\n`;
const accessOwnerOnly=schema=>`not exists (select 1 from (values ('anon'),('authenticated'),('service_role')) a(r)
  where has_schema_privilege(a.r,'${schema}','USAGE') or has_schema_privilege(a.r,'${schema}','CREATE'))`;
const authAcl=`${accessOwnerOnly(authSchema)} and
 (select count(*)=2 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in(${authNames}))
 and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in(${authNames}) and
   (not has_function_privilege('service_role',p.oid,'EXECUTE') or has_function_privilege('anon',p.oid,'EXECUTE')
    or has_function_privilege('authenticated',p.oid,'EXECUTE') or exists(
      select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where a.grantee=0 or a.grantee not in (p.proowner,'service_role'::regrole))))`;
const businessAcl=accessOwnerOnly(businessSchema);

// Scope-local digest excludes data, allocated OIDs and opaque epoch; captures
// identities, ACLs, definitions, attributes, constraints, rules and triggers.
function catalogDigest(schemas,extraFunction='true') {
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
      from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),
     (select jsonb_agg(pg_get_ruledef(r.oid) order by r.rulename) from pg_rewrite r where r.ev_class=c.oid),
     (select jsonb_agg(jsonb_build_array(z.polname,z.polcmd,z.polpermissive,z.polroles::text,
        pg_get_expr(z.polqual,z.polrelid),pg_get_expr(z.polwithcheck,z.polrelid)) order by z.polname)
      from pg_policy z where z.polrelid=c.oid)
   ) order by nspname,relname) from c),
   'functions',(select jsonb_agg(jsonb_build_array(nspname,proname,pg_get_function_identity_arguments(oid),
    proowner::regrole::text,proacl::text,pg_get_functiondef(oid)) order by nspname,proname,pg_get_function_identity_arguments(oid))
    from p))::text,'UTF8')),'hex'))`;
}
const businessDigest=catalogDigest([businessSchema]);
const appDigest=catalogDigest(['public','private','auth'],`not (n.nspname='public' and p.proname in(${authNames}))`);
const fields={
 business:{absent:businessAbsent,inert:unattached,acl:businessAcl,epoch:`(select epoch from ${businessSchema}.scopes)`,locks:`${businessSchema}.scopes`},
 auth:{absent:authAbsent,inert:unbound,acl:authAcl,epoch:`(select epoch from ${authSchema}.control)`,locks:`${authSchema}.control,${authSchema}.pending`},
};
function laneFor(req) { assert(Object.hasOwn(fields,req.lane));return fields[req.lane]; }
function noOtherActive(req,lock=false) {
  const [ns,f]=req.lane==='auth'?[businessSchema,fields.business]:[authSchema,fields.auth];
  return `do $sidecar_other$ begin if to_regnamespace('${ns}') is not null then
    ${lock?'lock table '+f.locks+' in share mode;':''}
    if (${f.inert} and ${f.acl}) is distinct from true then raise exception 'SIDECAR_OTHER_SCOPE_NOT_INERT'; end if;
  elsif (${f.absent}) is distinct from true then raise exception 'SIDECAR_OTHER_SCOPE_RESIDUE'; end if; end $sidecar_other$;\n`;
}
export function preflightSql(req) {
  const f=laneFor(req);
  return `\\set ON_ERROR_STOP on
begin read only;
set local search_path=pg_catalog,pg_temp;
set local lock_timeout='2s';
set local statement_timeout='8s';
${assertion('sidecar_preflight_identity',primary+' and '+ledgerGuard+' and '+absentForbidden+' and '+scheduleWindow(req))}
${noOtherActive(req)}${assertion('sidecar_preflight_state',req.action==='install'?f.absent:f.inert+' and '+f.acl)}
select jsonb_build_object('readOnly',current_setting('transaction_read_only')='on',
 'epoch',${req.action==='undo'?f.epoch:'null'});
rollback;
`;
}
export function protectedSql(req, epoch=null) {
  const f=laneFor(req);
  verifyPacket(req.lane,req.action,readPacket);
  assert(req.action==='install' || req.action==='undo');
  const undo=req.action==='undo';
  if(undo) assert(typeof epoch==='string' && uuid.test(epoch) && isHash(req.install.catalogDigest));
  else assert.equal(epoch,null);
  let art=req.lane==='auth'?(undo?renderInertUndo({epoch,catalogDigest:req.install.catalogDigest}):renderInertInstall())
    :readPacket(undo?'business/remove-inert.sql':'business/install-inert.sql').toString('utf8');
  art=art.replace(/^\\set ON_ERROR_STOP on\n/,'');
  assert.equal(art.split('\nbegin;\n').length,2);
  assert.equal(art.split('\ncommit;\n').length,2);assert(art.endsWith('\ncommit;\n'));
  const common=`set local search_path=pg_catalog,pg_temp;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table ${ledger} in share mode;
${assertion('sidecar_write_boundary',primary+' and '+ledgerGuard+' and '+absentForbidden+' and '+scheduleWindow(req)+
  " and current_setting('transaction_read_only')='off'")}
${assertion('sidecar_write_serialized',"pg_try_advisory_xact_lock(hashtextextended('econovaria.stage.inert-sidecar.v1',0))")}
${noOtherActive(req,true)}
${undo?'lock table '+f.locks+' in access exclusive mode;\n':''}
${assertion('sidecar_inert_precondition',undo?f.inert+' and '+f.acl+' and '+f.epoch+'='+lit(epoch)+'::uuid':f.absent)}
${undo&&req.lane==='business'?assertion('sidecar_business_catalog_drift',businessDigest+'='+lit(req.install.catalogDigest)):''}
select set_config('econovaria.sidecar.catalog_before',${appDigest},true);
`;
  const finish=`${assertion('sidecar_inert_postcondition',ledgerGuard+' and '+absentForbidden+' and '+scheduleWindow(req)+' and '+
    (undo?f.absent:f.inert+' and '+f.acl)+' and '+appDigest+"=current_setting('econovaria.sidecar.catalog_before')")}
${!undo&&req.lane==='business'?`select jsonb_build_object('scope','economic-db','epoch',${f.epoch},'catalogDigest',${businessDigest},
 'held',false,'attached',false);\n`:''}commit;
select '${successMarker}';
`;
  const prepared=art.replace('\nbegin;\n','\nbegin;\n'+common);
  const psqlArgs=undo&&req.lane==='business'?`\\set economic_epoch '${epoch}'\n`:'';
  return '\\set ON_ERROR_STOP on\n'+psqlArgs+prepared.slice(0,-'commit;\n'.length)+finish;
}
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
    PGPASSFILE:'/dev/null',PGSERVICEFILE:'/dev/null',PGAPPNAME:'econovaria-staging-inert-sidecar',
    ...(readonly?{PGOPTIONS:'-c default_transaction_read_only=on'}:{})};
}
export function parsePreflight(out,req,{runId}={}) {
  const obj=JSON.parse(out);
  assert.deepEqual(Object.keys(obj).sort(),['epoch','readOnly']); assert.equal(obj.readOnly,true);
  if(req.action==='undo') {
    assert.notEqual(req.install.runId,runId);
    assert(typeof obj.epoch==='string'&&uuid.test(obj.epoch));
    assert.equal(receiptDigest({lane:req.lane,head:req.install.head,runId:req.install.runId,epoch:obj.epoch,
      catalogDigest:req.install.catalogDigest}),req.install.receiptSha256,'SIDECAR_BIRTH_RECEIPT_MISMATCH');
    return obj.epoch;
  }
  assert.equal(obj.epoch,null);return null;
}
export function parseCommit(out,{req,head,runId}) {
  const lines=out.split('\n').map(s=>s.trim()).filter(Boolean);
  assert.equal(lines.at(-1),successMarker,'SIDECAR_COMMIT_NOT_CONFIRMED');
  const data=lines.filter(s=>s.startsWith('{'));
  const receipt={projectRef:project,scope:req.lane,action:req.action,ledgerSha256:baseline,ledgerUnchanged:true,
    attached:false,bound:false,held:false,hostedDrainAttested:false,status:'INERT_MAINTENANCE_COMMITTED',head,runId};
  if(req.action==='undo') {assert.equal(data.length,0);return receipt;}
  assert.equal(data.length,1);
  const proof=JSON.parse(data[0]);
  assert.equal(proof.held,false);
  const {epoch,catalogDigest}=proof;
  if(req.lane==='auth'){
    assert.equal(proof.scope,'app-password-reset-only');assert.equal(proof.bound,false);
    assert.equal(proof.activePermits,0);assert.equal(proof.managedOriginAttested,false);
  } else {assert.equal(proof.scope,'economic-db');assert.equal(proof.attached,false);}
  return {...receipt,catalogDigest,receiptSha256:receiptDigest({lane:req.lane,head,runId,epoch,catalogDigest})};
}
