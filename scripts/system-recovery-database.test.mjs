import test from 'node:test';
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
      perform public.system_recovery_begin_v1(r,u,'eecvbssdvarfcykcfrny',src,'external-operator','review/two-channels');
      perform public.expect_denied(format('select public.system_recovery_notice_v1(%L,%L,%L,%L)',r,u,src,'completed'));
      perform public.system_recovery_notice_v1(r,u,src,'started',true);
      perform public.system_recovery_begin_v1(r,u,'eecvbssdvarfcykcfrny',src,'external-operator','review/two-channels');
      perform public.expect_denied(format('select public.system_recovery_begin_v1(%L,%L,%L,%L,%L,%L)',r,u,'cgiukdjwicykrmtkhudh',src,'external-operator','review/two-channels'));
      if public.system_recovery_access_v1(u,s) then raise exception 'restriction bypass'; end if;
      perform public.expect_denied(format('select public.system_recovery_advance_v1(%L,%L,%L,%L,%L)',r,u,src,'restricted','revoked'));
      delete from auth.sessions;
      perform public.expect_denied(format('select public.system_recovery_advance_v1(%L,%L,%L,NULL,%L)',r,u,src,'removed'));
      perform public.system_recovery_advance_v1(r,u,src,'restricted','revoked');
      perform public.system_recovery_advance_v1(r,u,src,'revoked','removed');
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
  } finally { execFileSync('docker',['rm','-f',container],{stdio:'pipe'}); }
});
