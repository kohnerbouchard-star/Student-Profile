// Offline AUTH-only review compiler. This program cannot connect or apply SQL.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const ref='eecvbssdvarfcykcfrny';
const slug='password-reset-api';
const knownId='3e471aa1-660d-4094-9e35-3ac65d4683cf';
const v20Body='7969383482acf747a6d0f7a6c915a4b006bff3e743a46a64a828826cb0af36a0';
const stageLedger='abe640a61ab112cafeeae89dd93c27e93796b7122680b94c1661ef092c7bc312';
const stagePool='aws-1-ap-northeast-2.pooler.supabase.com';
const caps={installAuthorized:false,deployAuthorized:false,bindAuthorized:false,holdAuthorized:false,
  undoAuthorized:false,migrationAuthorized:false,managedOriginAttested:false};
const sha256=v=>createHash('sha256').update(v).digest('hex');
const validHash=/^[a-f0-9]{64}$/u;
const validUuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
export const expected=Object.freeze({ref,slug,knownId,v20Body,stageLedger});
export const caSha256='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7';
const pins=Object.freeze({
  'install-inert.sql':'54bad91a017d06665a24afd2b35e3f8b73f7b3a3eb2303e82f99bb5a92bc985c',
  'remove-unbound.sql':'3bd4b57676d295e9ee8f8cbe7372af0bd94ace5748d1aa8c67b790d874a371f7',
  'render-staging-password-reset.mjs':'aae96be56e1e253b03076588b99825da27e26130ca29d27fc8b950e5796249ae',
  'trackPasswordReset.ts':'1abf61e16a0c5ff68d2be062a05eb64b79f270066cd3b97266e94372d1909fa6',
});
const now=()=>Date.now();
const literal=s=>"'"+String(s).replaceAll("'","''")+"'";
const commit='commit;\n';

function must(ok,label){if(ok!==true) throw new Error(label);}
function substitute(source,anchor,replacement){
  must(source.split(anchor).length===2,'SOURCE_ANCHOR_DRIFT');
  return source.replace(anchor,()=>replacement);
}
function jsonFiles(file){
  must(Object.hasOwn(pins,file),'UNAPPROVED_SOURCE_FILE');
  const bytes=readFileSync(new URL('./original/'+file,import.meta.url));
  must(sha256(bytes)===pins[file],'SOURCE_BLOB_DRIFT');
  return bytes.toString('utf8');
}
export function exactCertificate(){
  const cert=readFileSync(new URL('./supabase-ca.crt',import.meta.url));
  must(sha256(cert)==='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7','UNAPPROVED_CA');
  return fileURLToPath(new URL('./supabase-ca.crt',import.meta.url));
}

// Identifier parsing only. Never export, log, persist or include the password as an arg.
export function parseStagingDsn(raw) {
  must(typeof raw==='string' && raw.length<=4096 && !/[\r\n\0]/u.test(raw),'REJECTED_STAGING_DSN');
  let u; try{u=new URL(raw);}catch{throw Error('REJECTED_STAGING_DSN');}
  const ssl=[...u.searchParams.entries()];
  must((u.protocol==='postgresql:' || u.protocol==='postgres:') &&
    u.port==='5432' && u.pathname==='/postgres' && !u.hash &&
    (ssl.length===0 || (ssl.length===1 && ssl[0][0]==='sslmode' && ssl[0][1]==='verify-full')),'REJECTED_STAGING_DSN');
  let user,password;try{user=decodeURIComponent(u.username);password=decodeURIComponent(u.password);}catch{throw Error('REJECTED_STAGING_DSN');}
  must(Boolean(password && !/[\r\n\0]/u.test(password)),'REJECTED_STAGING_DSN');
  const connectionType=u.hostname===`db.${ref}.supabase.co` && user==='postgres'?'direct':
    u.hostname===stagePool && user==='postgres.'+ref?'session-pooler':null;
  must(connectionType!==null,'REJECTED_STAGING_DSN');
  return Object.freeze({host:u.hostname,user,password,port:'5432',database:'postgres',sslmode:'verify-full',connectionType});
}

export function checkCurrentObservation(input, action, time=now()) {
  must(['install-inert','undo-inert'].includes(action),'INVALID_REVIEW_PHASE');
  must(input && input.projectRef===ref && input.slug===slug && input.functionId===knownId &&
    input.version===20 && input.status==='ACTIVE' && input.verifyJwt===true && input.bundleSha256===v20Body &&
    input.trackedOverlayObserved===false,'BASELINE_RUNTIME_DRIFT');
  const age=time-Date.parse(input?.observedAt);
  must(Number.isFinite(age) && age>=0 && age<=90000,'STALE_RUNTIME_OBSERVATION');
  must(input.ledgerRows===468 && input.ledgerDigest===stageLedger && input.primaryNominalOperator===true &&
    input.pg17===true,'LEDGER_OR_OBSERVER_DRIFT');
  if (action==='install-inert') must(input.sidecarAbsent===true,'AUTH_SIDECAR_NOT_ABSENT');
  if (action==='undo-inert') {
    must(input.sidecarAbsent===false && input.neverBound===true && input.held===false &&
      input.activePermits===0,'AUTH_UNDO_UNBOUND_ZERO_PERMITS_REQUIRED');
  }
  return {scope:'app-password-reset-only',status:'REVIEW_ONLY',action,exactProtectedRunnerVerified:false,...caps};
}

// No output from here signs or authorizes any action. No provider deployment
// verification is given by the old v20 bundle, a JSON assertion or an Edge 200.
export function assessOverlay(environment, time=now()) {
  const age=time-Date.parse(environment?.observedAt);
  const supported=Boolean(environment?.projectRef===ref && environment?.slug===slug &&
    environment?.functionId===knownId && Number.isInteger(environment.version) && environment.version>20 &&
    environment.status==='ACTIVE' && environment.verifyJwt===true &&
    validHash.test(environment.bundleSha256??'') && environment.bundleSha256!==v20Body &&
    environment.bundleSha256===environment.independentlyReviewedBundleSha256 &&
    environment.deployment===`${ref}_${knownId}_${environment.version}` &&
    environment.trackedOverlayObserved===true && environment.activePermits===0 &&
    Number.isFinite(age) && age>=0 && age<=90000);
  return {scope:'app-password-reset-only',status:supported?'UNVERIFIED_MATCH_REVIEW_REQUIRED':'RESET_OVERLAY_BLOCKED',...caps};
}

const ledgerDigest=`(select encode(sha256(convert_to(jsonb_agg(to_jsonb(m) order by m.version collate "C")::text,'UTF8')),'hex') from supabase_migrations.schema_migrations m)`;
const operatorGuard=`(current_database()='postgres' and current_user='postgres' and session_user=current_user and not pg_is_in_recovery() and current_setting('server_version_num')::int/10000=17)`;
const absent=`(to_regnamespace('staging_app_auth_guard') is null and to_regprocedure('public.staging_track_password_reset_begin_v1(text)') is null and to_regprocedure('public.staging_track_password_reset_complete_v1(uuid,text)') is null)`;
const ledgerGuard=`((select count(*) from supabase_migrations.schema_migrations)=468 and ${ledgerDigest}='${stageLedger}')`;
export const verifyOnlySql=`\\set ON_ERROR_STOP on
begin read only;
set local search_path=pg_catalog,pg_temp;
set local statement_timeout='8s';
select jsonb_build_object('observerPrimaryNominalOperator',${operatorGuard},
 'schemaCreateAuthority',has_database_privilege(current_user,current_database(),'CREATE') and has_schema_privilege(current_user,'public','CREATE'),
 'ledgerRows',(select count(*) from supabase_migrations.schema_migrations),'ledgerDigestMatches',${ledgerGuard},'authSidecarAbsent',${absent},
 'serverStatus','read-only');
rollback;
`;

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
const fingerprint=`encode(sha256(convert_to((${census})::text,'UTF8')),'hex')`;
const migrationLock='lock table supabase_migrations.schema_migrations in share mode;';
const lockSidecar='lock table staging_app_auth_guard.control, staging_app_auth_guard.pending in access exclusive mode;';
const serialize=`do $app_reset_review$ begin
 if not ${operatorGuard} or not ${ledgerGuard}
 then raise exception 'STAGING_AUTH_REVIEW_BINDING_FAILED'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('econovaria.staging.app-password-reset.maintenance',0))
 then raise exception 'STAGING_AUTH_REVIEW_OPERATION_BUSY'; end if;
end $app_reset_review$;`;
const neverBound=`((select count(*) from staging_app_auth_guard.control)=1 and
 exists(select 1 from staging_app_auth_guard.control where singleton and deployment is null and held_at is null) and
 not exists(select 1 from staging_app_auth_guard.pending))`;

export function renderInertInstall(){
  const original=jsonFiles('install-inert.sql');
  must(original.endsWith(commit),'SOURCE_COMMIT_BOUNDARY_DRIFT');
  const beforeDdl=`${serialize}
do $app_reset_no_previous$ begin
 if not ${absent} then raise exception 'STAGING_AUTH_REVIEW_OBJECT_ALREADY_EXISTS'; end if;
end $app_reset_no_previous$;
`;
  const guarded=substitute(original,'create schema staging_app_auth_guard;',beforeDdl+'create schema staging_app_auth_guard;');
  return '\\set ON_ERROR_STOP on\n'+guarded.slice(0,-commit.length)+`do $app_reset_unbound$ begin
 if not ${neverBound} or not ${ledgerGuard} then raise exception 'STAGING_AUTH_INERT_POSTCONDITION'; end if;
end $app_reset_unbound$;
select jsonb_build_object('scope','app-password-reset-only','epoch',(select epoch from staging_app_auth_guard.control),
 'catalogDigest',${fingerprint},'held',false,'bound',false,'activePermits',0,'managedOriginAttested',false);
${commit}`;
}
export function renderInertUndo({epoch,catalogDigest}={}){
  must(validUuid.test(epoch??'') && validHash.test(catalogDigest??''),'INVALID_ORIGINAL_INSTALL_RECEIPT');
  const original=jsonFiles('remove-unbound.sql');
  must(original.endsWith(commit),'SOURCE_COMMIT_BOUNDARY_DRIFT');
  const withGuard=substitute(original,lockSidecar,`${migrationLock}
${serialize}
${lockSidecar}
do $app_reset_exact_undo$ begin
 if not ${neverBound} or not exists(select 1 from staging_app_auth_guard.control where singleton
  and epoch=${literal(epoch)}::uuid) or ${fingerprint} is distinct from ${literal(catalogDigest)}
 then raise exception 'STAGING_AUTH_UNDO_EXACT_UNBOUND_RECEIPT_REQUIRED'; end if;
end $app_reset_exact_undo$;`);
  return '\\set ON_ERROR_STOP on\n'+withGuard.slice(0,-commit.length)+`do $app_reset_removed$ begin
 if not ${absent} or not ${ledgerGuard} then raise exception 'STAGING_AUTH_INVERSE_POSTCONDITION'; end if;
end $app_reset_removed$;
${commit}`;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  // Tiny non-mutating entry, for local and protected source review only.
  if(process.argv.length!==2){console.error('OFFLINE_REVIEW_ONLY');process.exitCode=1;}
  else {
    for(const name of Object.keys(pins)) jsonFiles(name);
    exactCertificate();
    console.log(JSON.stringify({status:'LOCAL_INPUTS_VERIFIED_REVIEW_ONLY',scope:'app-password-reset-only',...caps}));
  }
}
