import test from 'node:test';
import { validateIndividualRecovery, individualRecoveryDigest } from './security/individual-account-recovery.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
// Dedicated, network-isolated disposable database; never accepts a database URL.
const container = `econovaria-recovery-test-${process.pid}`;
const sql = text => execFileSync('docker', ['exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At'], {input:text,encoding:'utf8'});
const migration = readFileSync(new URL('../backend/supabase/migrations/20261005212732_system_account_recovery_v1.sql',import.meta.url),'utf8');
test('recovery transactions: grants, identity, revoked sessions, exact factors and fail-closed completion', { skip: process.env.ECONOVARIA_RECOVERY_DATABASE_TEST !== '1' }, () => {
  execFileSync('docker',['run','--detach','--rm','--name',container,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24'],{stdio:'pipe'});
  try {
  execFileSync('docker',['exec',container,'sh','-c','for i in $(seq 1 30); do read process_name </proc/1/comm; [ "$process_name" = postgres ] && pg_isready -U postgres >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1'],{stdio:'pipe'});
  sql(`
    drop schema if exists recovery_private cascade; drop schema if exists auth cascade; drop schema public cascade; create schema public;
    do $$ begin create role anon; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role; exception when duplicate_object then null; end $$;
    grant usage on schema public to anon,authenticated,service_role;
    create schema auth;
    create table auth.users(id uuid primary key, raw_app_meta_data jsonb default '{}');
    create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz default clock_timestamp(),not_after timestamptz);
    create table auth.mfa_factors(id uuid primary key,user_id uuid,factor_type text,status text,created_at timestamptz default clock_timestamp());
    create table public.staff_users(supabase_auth_user_id uuid primary key,status text,mfa_required boolean,security_version bigint);
    create function public.complete_staff_password_reset_security_v2(p_user uuid) returns table(security_version bigint,staff_status text)
      language sql as $$ update public.staff_users set security_version=staff_users.security_version+1
        where supabase_auth_user_id=p_user returning staff_users.security_version,staff_users.status $$;
    insert into auth.users values('00000000-0000-4000-8000-000000000001','{"security_version":1}');
    insert into public.staff_users values('00000000-0000-4000-8000-000000000001','active',true,1);
  `);
  sql(migration);
  const result=sql(`
    create function public.expect_denied(q text) returns void language plpgsql as $$
    begin
      begin execute q; exception when others then return; end;
      raise exception 'unexpected success: %',q;
    end $$;
    do $$ declare u uuid:='00000000-0000-4000-8000-000000000001';
      r uuid:='00000000-0000-4000-8000-000000000002';
      s uuid:='00000000-0000-4000-8000-000000000003';
      f uuid:='00000000-0000-4000-8000-000000000004';
      b uuid:='00000000-0000-4000-8000-000000000005';
      other_session uuid:='00000000-0000-4000-8000-000000000006';
      rogue uuid:='00000000-0000-4000-8000-000000000007';
      src text:=repeat('a',40); g text:=repeat('b',64); signature regprocedure;
      delivery_expiry timestamptz:=date_trunc('milliseconds',clock_timestamp())+interval '10 minutes';
    begin
      for signature in select oid::regprocedure from pg_proc where proname like 'system_recovery_%_v1' loop
        if has_function_privilege('anon',signature,'EXECUTE') or has_function_privilege('authenticated',signature,'EXECUTE')
        then raise exception 'browser RPC exposed'; end if;
      end loop;
      if has_schema_privilege('authenticated','recovery_private','USAGE') then raise exception 'private data exposed'; end if;
      insert into auth.sessions(id,user_id) values(s,u);
      if not public.system_recovery_access_v1(u,s) then raise exception 'normal session denied'; end if;
      perform public.system_recovery_begin_v1(r,u,'eecvbssdvarfcykcfrny',src,'external-operator','review/two-channels',delivery_expiry);
      perform public.expect_denied(format('select public.system_recovery_begin_v1(%L,%L,%L,%L,%L,%L,%L)',r,u,'eecvbssdvarfcykcfrny',src,'external-operator','review/two-channels',delivery_expiry+interval '1 second'));

      perform public.expect_denied(format('select public.system_recovery_notice_v1(%L,%L,%L,%L)',r,u,src,'completed'));
      perform public.system_recovery_notice_v1(r,u,src,'started',true);
      perform public.system_recovery_begin_v1(r,u,'eecvbssdvarfcykcfrny',src,'external-operator','review/two-channels',delivery_expiry);
      perform public.expect_denied(format('select public.system_recovery_begin_v1(%L,%L,%L,%L,%L,%L,%L)',r,u,'cgiukdjwicykrmtkhudh',src,'external-operator','review/two-channels',delivery_expiry));
      if public.system_recovery_access_v1(u,s) then raise exception 'restriction bypass'; end if;
      if (public.system_recovery_operator_state_v1(r,u,src,'review/two-channels')->>'phase') is distinct from 'restricted'
        then raise exception 'operator state unavailable'; end if;
      perform public.expect_denied(format('select public.system_recovery_operator_state_v1(%L,%L,%L,%L)',r,u,repeat('c',40),'review/two-channels'));

      perform public.system_recovery_advance_v1(r,u,src,'restricted','revoking');
      perform public.expect_denied(format('select public.system_recovery_advance_v1(%L,%L,%L,%L,%L)',r,u,src,'restricted','revoking'));
      perform public.expect_denied(format('select public.system_recovery_advance_v1(%L,%L,%L,%L,%L)',r,u,src,'revoking','revoked'));
      delete from auth.sessions;
      perform public.expect_denied(format('select public.system_recovery_advance_v1(%L,%L,%L,NULL,%L)',r,u,src,'removed'));
      perform public.system_recovery_advance_v1(r,u,src,'revoking','revoked');
      perform public.system_recovery_advance_v1(r,u,src,'revoked','removing');
      perform public.expect_denied(format('select public.system_recovery_advance_v1(%L,%L,%L,%L,%L)',r,u,src,'revoked','removing'));
      perform public.system_recovery_advance_v1(r,u,src,'removing','removed');
      if public.system_recovery_delivery_v1(r,u,src,'review/two-channels',delivery_expiry,'reserve')<>'true'::jsonb
        then raise exception 'delivery reservation denied'; end if;
      if public.system_recovery_delivery_v1(r,u,src,'review/two-channels',delivery_expiry,'reserve')<>'false'::jsonb
        then raise exception 'delivery reservation replay'; end if;
      perform public.expect_denied(format('select public.system_recovery_delivery_v1(%L,%L,%L,%L,%L,%L)',r,u,repeat('c',40),'review/two-channels',delivery_expiry,'read'));
      perform public.expect_denied(format('select public.system_recovery_delivery_v1(%L,%L,%L,%L,%L,%L)',r,u,src,'review/two-channels',delivery_expiry+interval '1 second','read'));
      perform public.system_recovery_delivery_v1(r,u,src,'review/two-channels',delivery_expiry,'save',
        jsonb_build_object('version',1,'expiresAt',extract(epoch from delivery_expiry)*1000,'grantDigest',g,'sealed',repeat('a',100)));
      perform public.expect_denied(format('select public.system_recovery_delivery_v1(%L,%L,%L,%L,%L,%L,%L::jsonb)',r,u,src,'review/two-channels',delivery_expiry,'save',
        jsonb_build_object('version',1,'expiresAt',extract(epoch from delivery_expiry)*1000,'grantDigest',g,'sealed',repeat('b',100))));
      if public.system_recovery_delivery_v1(r,u,src,'review/two-channels',delivery_expiry,'ack',jsonb_build_object('grantDigest',g))<>'false'::jsonb
        then raise exception 'delivery acknowledged before ready'; end if;
      perform public.system_recovery_advance_v1(r,u,src,'removed','ready',g,delivery_expiry);
      perform public.system_recovery_delivery_v1(r,u,src,'review/two-channels',delivery_expiry,'ack',jsonb_build_object('grantDigest',g));
      perform public.system_recovery_delivery_v1(r,u,src,'review/two-channels',delivery_expiry,'ack',jsonb_build_object('grantDigest',g));
      if (public.system_recovery_delivery_v1(r,u,src,'review/two-channels',delivery_expiry,'read')->>'delivered') is distinct from 'true'
        then raise exception 'delivery acknowledgement missing'; end if;
      insert into auth.sessions(id,user_id) values(s,u),(other_session,u);
      perform public.system_recovery_claim_v1(u,s,g);
      perform public.system_recovery_claim_v1(u,s,g);
      perform public.expect_denied(format('select public.system_recovery_claim_v1(%L,%L,%L)',u,other_session,g));
      if public.system_recovery_access_v1(u,s) then raise exception 'grant leaked ordinary access'; end if;
      if not public.system_recovery_access_v1(u,s,g) then raise exception 'bound grant denied'; end if;
      delete from auth.sessions where id=s;
      if public.system_recovery_access_v1(u,s,g) then raise exception 'revoked bearer accepted'; end if;
      insert into auth.sessions(id,user_id) values(s,u);
      insert into auth.mfa_factors(id,user_id,factor_type,status) values(f,u,'totp','unverified');
      perform public.expect_denied(format('select public.system_recovery_record_factor_v1(%L,%L,%L,%L,%L)',u,s,g,f,'primary'));
      perform public.system_recovery_reserve_factor_v1(u,s,g,'primary');
      perform public.expect_denied(format('select public.system_recovery_reserve_factor_v1(%L,%L,%L,%L)',u,s,g,'primary'));
      perform public.system_recovery_record_factor_v1(u,s,g,f,'primary');
      update auth.mfa_factors set status='verified' where id=f;
      insert into auth.mfa_factors(id,user_id,factor_type,status) values(b,u,'totp','unverified');
      perform public.system_recovery_reserve_factor_v1(u,s,g,'backup');
      perform public.system_recovery_record_factor_v1(u,s,g,b,'backup');
      perform public.expect_denied(format('select public.system_recovery_prepare_completion_v1(%L,%L,%L)',u,s,g));
      update auth.mfa_factors set status='verified' where id=b;
      insert into auth.mfa_factors(id,user_id,factor_type,status) values(rogue,u,'totp','verified');
      perform public.expect_denied(format('select public.system_recovery_prepare_completion_v1(%L,%L,%L)',u,s,g));
      if public.system_recovery_access_v1(u,s) then raise exception 'provider changes lifted restriction'; end if;
      delete from auth.mfa_factors where id=rogue;
      perform public.system_recovery_prepare_completion_v1(u,s,g);
      perform public.expect_denied(format('select public.system_recovery_prepare_completion_v1(%L,%L,%L)',u,s,g));
      update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=s;
      perform public.expect_denied(format('select public.system_recovery_prepare_completion_v1(%L,%L,%L)',u,s,g));
      update auth.sessions set not_after=null where id=s;
      perform public.expect_denied(format('select public.system_recovery_complete_v1(%L,%L,%L)',r,u,src));
      delete from auth.sessions;
      perform public.expect_denied(format('select public.system_recovery_complete_v1(%L,%L,%L)',r,u,src));
      perform public.system_recovery_password_transition_v1(r,u,src);
      perform public.system_recovery_password_transition_v1(r,u,src);
      update auth.users set raw_app_meta_data='{"security_version":2}';
      perform public.system_recovery_complete_v1(r,u,src);
      perform public.system_recovery_notice_v1(r,u,src,'completed',true);
      perform public.system_recovery_complete_v1(r,u,src);
      if exists(select 1 from recovery_private.attempts where restricted or grant_digest is not null)
      then raise exception 'completion state invalid'; end if;
      if (select count(*) from recovery_private.outbox)<>2 then raise exception 'duplicate notifications'; end if;
    end $$;
    select 'recovery-contract-passed';
  `);
  assert.match(result,/recovery-contract-passed/);
  const restart=sql(`
    do $$ declare
      u uuid:='00000000-0000-4000-8000-000000000008';
      old_id uuid:='00000000-0000-4000-8000-000000000009';
      new_id uuid:='00000000-0000-4000-8000-000000000010';
      sid uuid:='00000000-0000-4000-8000-000000000011';
      src text:=repeat('a',40); grant_hash text:=repeat('d',64);
      expired timestamptz:=clock_timestamp()-interval '1 minute';
      fresh timestamptz:=clock_timestamp()+interval '10 minutes';
      q text; unsafe_phase text;
    begin
      insert into auth.users(id) values(u);
      insert into public.staff_users values(u,'active',true,1);
      insert into auth.sessions(id,user_id) values(sid,u);
      perform public.system_recovery_begin_v1(old_id,u,'eecvbssdvarfcykcfrny',src,'operator:old','review/old-attempt',fresh);
      update recovery_private.attempts set expires_at=expired,grant_digest=grant_hash where id=old_id;
      q:=format('select public.system_recovery_restart_v1(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)',
        old_id,src,'review/old-attempt',expired,new_id,u,src,'operator:new','review/new-attempt',fresh);
      foreach unsafe_phase in array array['restricted','revoking','revoked','removing','removed','completing','cancelled'] loop
        update recovery_private.attempts set phase=unsafe_phase where id=old_id;
        perform public.expect_denied(q);
      end loop;
      update recovery_private.attempts set phase='enrolling',primary_reserved=true where id=old_id;
      perform public.expect_denied(q);
      update recovery_private.attempts set primary_reserved=false,backup_reserved=true where id=old_id;
      perform public.expect_denied(q);
      update recovery_private.attempts set backup_reserved=false,prepared_security_version=1 where id=old_id;
      perform public.expect_denied(q);
      update recovery_private.attempts set prepared_security_version=null,phase='ready',expires_at=fresh where id=old_id;
      perform public.expect_denied(q);
      update recovery_private.attempts set expires_at=expired where id=old_id;
      perform public.expect_denied(format('select public.system_recovery_restart_v1(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)',
        old_id,src,'review/old-attempt',expired,new_id,u,'invalid-source','operator:new','review/new-attempt',fresh));
      if not exists(select 1 from recovery_private.attempts where id=old_id and restricted and phase='ready')
        then raise exception 'failed restart removed restriction'; end if;
      execute q;
      execute q;
      if (select count(*) from recovery_private.attempts where auth_user_id=u and restricted)<>1
        or not exists(select 1 from recovery_private.attempts where id=new_id and restart_of=old_id and restricted and phase='restricted')
        or not exists(select 1 from recovery_private.attempts where id=old_id and not restricted and phase='superseded' and grant_digest is null)
      then raise exception 'restart did not atomically preserve restriction'; end if;
      if public.system_recovery_access_v1(u,sid) or public.system_recovery_access_v1(u,sid,grant_hash)
        then raise exception 'superseded grant or session gained access'; end if;
      perform public.expect_denied(format('select public.system_recovery_claim_v1(%L,%L,%L)',u,sid,grant_hash));
      perform public.expect_denied(format('select public.system_recovery_advance_v1(%L,%L,%L,%L,%L)',old_id,u,src,'restricted','revoking'));
      if not exists(select 1 from recovery_private.audit where attempt_id=old_id and phase='superseded')
        or (select count(*) from recovery_private.outbox where attempt_id=new_id and kind='started')<>1
        then raise exception 'restart evidence missing or duplicated'; end if;
      update recovery_private.attempts set phase='removed' where id=new_id;
      perform public.expect_denied(format('select public.system_recovery_delivery_v1(%L,%L,%L,%L,%L,%L)',
        new_id,u,src,'review/new-attempt',fresh+interval '1 second','reserve'));
      if exists(select 1 from recovery_private.delivery where attempt_id=new_id)
        then raise exception 'changed expiry acquired token issuance'; end if;
      perform public.expect_denied(format('select public.system_recovery_advance_v1(%L,%L,%L,%L,%L,%L,%L)',
        new_id,u,src,'removed','ready',repeat('e',64),fresh+interval '1 second'));
      if public.system_recovery_delivery_v1(new_id,u,src,'review/new-attempt',fresh,'reserve')<>'true'::jsonb
        then raise exception 'approved restart delivery denied'; end if;

    end $$;
    select 'restart-contract-passed';
  `);
  assert.match(restart,/restart-contract-passed/);

  const forward=readFileSync(new URL('../backend/supabase/migrations/20261007221252_system_account_recovery_targets_v2.sql',import.meta.url),'utf8');
  assert.throws(()=>sql(forward),/reconcile restricted legacy/);
  // Discard only disposable fixtures, never interpret or unblock legacy attempts.
  sql('truncate recovery_private.attempts cascade;');
  sql(forward);
  const literal=value=>`'${String(value).replaceAll("'","''")}'`;
  const receipt=r=>({operator:'sole-external-admin',authenticatedAt:Date.now(),confirmedOperationDigest:individualRecoveryDigest(r),productionConfirmed:true,supportRequestVerified:true});
  const invoke=(r,action,payload={})=>`select public.system_recovery_operator_v2(${literal(JSON.stringify(r))}::jsonb,${literal(individualRecoveryDigest(r))},${literal(action)},${literal(JSON.stringify(payload))}::jsonb)`;
  const denied=query=>sql(`select public.expect_denied(${literal(query)});`);
  for (const [environment,projectRef] of Object.entries({staging:'eecvbssdvarfcykcfrny',production:'cgiukdjwicykrmtkhudh'})) {
    sql(`truncate recovery_private.attempts cascade; truncate recovery_private.target;
      truncate auth.sessions,auth.mfa_factors;
      insert into auth.users values('00000000-0000-4000-8000-000000000099','{}') on conflict do nothing;
      insert into public.staff_users values('00000000-0000-4000-8000-000000000099','active',true,1) on conflict do nothing;
      insert into auth.sessions(id,user_id) values
        ('00000000-0000-4000-8000-000000000090','00000000-0000-4000-8000-000000000001'),
        ('00000000-0000-4000-8000-000000000091','00000000-0000-4000-8000-000000000099');
      insert into auth.mfa_factors(id,user_id,status) values
        ('00000000-0000-4000-8000-000000000080','00000000-0000-4000-8000-000000000001','verified'),
        ('00000000-0000-4000-8000-000000000081','00000000-0000-4000-8000-000000000099','verified');`);
    const now=Date.now(),r=validateIndividualRecovery({version:'2',environment,projectRef,
      authUserId:'00000000-0000-4000-8000-000000000001',requestId:'00000000-0000-4000-8000-000000000070',
      operation:'reset-individual-mfa',factorIds:['00000000-0000-4000-8000-000000000080'],sourceCommit:'a'.repeat(40),
      supportRequestRef:'support/individual-01',identityEvidenceRef:'identity/verified-01',expiresAt:new Date(now+600_000).toISOString()},now);
    denied(invoke(r,'begin',receipt(r)));
    sql(`insert into recovery_private.target(environment,project_ref,operator_subject) values(${literal(environment)},${literal(projectRef)},'sole-external-admin');`);
    denied(invoke(r,'begin',{...receipt(r),operator:'game_admin'}));
    const opposite={...r,environment:environment==='staging'?'production':'staging',projectRef:environment==='staging'?'cgiukdjwicykrmtkhudh':'eecvbssdvarfcykcfrny'};
    denied(invoke(opposite,'begin',receipt(opposite)));
    const wrongFactor={...r,factorIds:['00000000-0000-4000-8000-000000000081']};
    denied(invoke(wrongFactor,'begin',receipt(wrongFactor)));
    for(const change of [{productionConfirmed:false},{supportRequestVerified:false},{authenticatedAt:Date.now()-300_001},{confirmedOperationDigest:'d'.repeat(64)}]) {
      if(environment==='staging' && Object.hasOwn(change,'productionConfirmed'))continue;
      denied(invoke(r,'begin',{...receipt(r),...change}));
    }
    sql(`set role service_role; ${invoke(r,'begin',{...receipt(r),unexpected:'must-not-persist'})}; reset role;`);
    sql(invoke(r,'begin',receipt(r)));
    assert.match(sql(`select count(*) from recovery_private.operations;`),/^1\s*$/);
    for(const change of [{supportRequestRef:'support/altered-01'},{factorIds:[]},{operation:'disable-all-mfa'},
      {authUserId:'00000000-0000-4000-8000-000000000099'},{sourceCommit:'b'.repeat(40)},{projectRef:opposite.projectRef}]) {
      denied(invoke({...r,...change},'read'));
    }
    assert.match(sql(`select public.system_recovery_access_v1('${r.authUserId}','00000000-0000-4000-8000-000000000090');`),/^f\s*$/);
    assert.match(sql(`select public.system_recovery_access_v1('00000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000091');`),/^t\s*$/);
    for(const name of ['begin','operator_state','advance','restart','delivery','notice']) {
      assert.match(sql(`select bool_and(not has_function_privilege('service_role',oid,'execute')) from pg_proc where proname='system_recovery_${name}_v1';`),/^t\s*$/);
    }
    assert.match(sql(`select not has_function_privilege('authenticated','public.system_recovery_operator_v2(jsonb,text,text,jsonb)','execute')
      and not has_table_privilege('service_role','recovery_private.target','select')
      and not has_table_privilege('service_role','recovery_private.operations','update');`),/^t\s*$/);
    sql(invoke(r,'advance',{expected:'restricted',next:'revoking'}));
    denied(invoke(r,'advance',{expected:'restricted',next:'revoking'}));
    denied(invoke(r,'advance',{expected:'revoking',next:'revoked'})); // Old session must be revoked first.
    sql(`delete from auth.sessions where user_id='${r.authUserId}';`);
    sql(invoke(r,'advance',{expected:'revoking',next:'revoked'}));
    sql(invoke(r,'advance',{expected:'revoked',next:'removing'}));
    denied(invoke(r,'advance',{expected:'removing',next:'removed'})); // Factors must be gone.
    sql(`delete from auth.mfa_factors where user_id='${r.authUserId}';`);
    sql(invoke(r,'advance',{expected:'removing',next:'removed'}));
    sql(invoke(r,'advance',{expected:'removed',next:'ready',grantDigest:'c'.repeat(64),expiresAt:Date.parse(r.expiresAt)}));
    assert.match(sql(`select restricted from recovery_private.attempts where id='${r.requestId}';`),/^t\s*$/);
    assert.match(sql(`select count(*) from auth.sessions where user_id='00000000-0000-4000-8000-000000000099';`),/^1\s*$/);
    assert.match(sql(`select count(*) from auth.mfa_factors where user_id='00000000-0000-4000-8000-000000000099';`),/^1\s*$/);
    assert.match(sql(`select count(*) from recovery_private.outbox where attempt_id='${r.requestId}' and kind='started';`),/^1\s*$/);
    const stored=JSON.parse(sql(`select approval_receipt from recovery_private.operations where attempt_id='${r.requestId}';`).trim());
    assert.equal(stored.operator,'sole-external-admin');assert.equal(stored.confirmedOperationDigest,individualRecoveryDigest(r));
    assert.equal(stored.productionConfirmed,true);assert.equal(Object.hasOwn(stored,'unexpected'),false);
    // Advance the disposable fixture's clock coordinates to exercise an expired attempt.
    const expired={...r,expiresAt:new Date(Date.now()-60_000).toISOString()};
    sql(`update recovery_private.attempts set expires_at=${literal(expired.expiresAt)},request_expires_at=${literal(expired.expiresAt)} where id='${r.requestId}';
      update recovery_private.operations set request=${literal(JSON.stringify(expired))}::jsonb,digest=${literal(individualRecoveryDigest(expired))} where attempt_id='${r.requestId}';`);
    const fresh={...r,requestId:'00000000-0000-4000-8000-000000000071',expiresAt:new Date(Date.now()+600_000).toISOString()};
    denied(invoke({...fresh,supportRequestRef:'support/different-request'},'restart',{...receipt({...fresh,supportRequestRef:'support/different-request'}),previous:expired}));
    sql(invoke(fresh,'restart',{...receipt(fresh),previous:expired}));
    sql(invoke(fresh,'restart',{...receipt(fresh),previous:expired}));
    assert.match(sql(`select count(*) from recovery_private.attempts where auth_user_id='${r.authUserId}' and restricted;`),/^1\s*$/);
    assert.match(sql(`select phase from recovery_private.attempts where id='${r.requestId}';`),/^superseded\s*$/);
    assert.match(sql(`select count(*) from recovery_private.operations;`),/^2\s*$/);

  }

  } finally { execFileSync('docker',['rm','-f',container],{stdio:'pipe'}); }
});
