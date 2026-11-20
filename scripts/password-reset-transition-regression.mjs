const uid = "00000000-0000-4000-8000-000000000001";
const attempt = "00000000-0000-4000-8000-000000000002";
const source = "a".repeat(40);
export const passwordResetFixture = `
insert into auth.users(id) values('${uid}');
insert into public.staff_users(id,supabase_auth_user_id,email,display_name,permission_version,security_version)
values('${uid}','${uid}','synthetic@example.test','Synthetic transition',17,41);
-- Capture state after all real Staff permission-seeding triggers have run.
create temp table expected_staff as select permission_version from public.staff_users where id='${uid}';
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'assertion failed: %',label; end if; end $$;
create function pg_temp.denied(command text, expected text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when others then
    if sqlstate=expected then return; end if;
    raise exception 'expected SQLSTATE %, got %: %',expected,sqlstate,sqlerrm;
  end;
  raise exception 'expected SQLSTATE %, command succeeded',expected;
end $$;
`;
const call = `select * from public.complete_staff_password_reset_security_v2('${uid}')`;
const recoveryFixture = `insert into recovery_private.attempts(id,project_ref,auth_user_id,source_commit,operator_subject,evidence_ref,phase,initial_security_version,prepared_security_version,expires_at)
values('${attempt}','eecvbssdvarfcykcfrny','${uid}','${source}','synthetic operator','synthetic evidence','completing',40,41,clock_timestamp()+interval '5 minutes');`;
const recoveryCall = `select public.system_recovery_password_transition_v1('${attempt}','${uid}','${source}')`;

export async function runPasswordResetCandidateChecks(t, sql) {
    const candidate = async (name, body) => t.test(name, () => sql(`begin; ${passwordResetFixture} ${body} rollback;`));
    await candidate("service role gets exact fields, one increment per ordinary call and unchanged security state", `
      create temp table before_state as select to_jsonb(s)-array['security_version','updated_at'] value from public.staff_users s where s.id='${uid}';
      create temp table result as ${call} with no data;
      grant insert on result to service_role;
      set local role service_role;
      insert into result ${call}; reset role;
      select pg_temp.check((select staff_user_id='${uid}'::uuid and staff_role='game_admin' and permission_version=(select permission_version from expected_staff) and security_version=42 and staff_status='active' from result),'exact RPC result');
      select pg_temp.check((select pg_typeof(permission_version)='bigint'::regtype from result),'result bigint');
      select pg_temp.check((select to_jsonb(s)-array['security_version','updated_at']=(select value from before_state) from public.staff_users s where s.id='${uid}'),'other Staff state unchanged');
      ${call}; select pg_temp.check((select security_version=43 from public.staff_users where id='${uid}'),'second intentional call increments once');`);
    await candidate("null, missing and all inactive states fail without mutations", `
      select pg_temp.denied('select * from public.complete_staff_password_reset_security_v2(null)','22023');
      select pg_temp.denied('select * from public.complete_staff_password_reset_security_v2(gen_random_uuid())','P0001');
      do $$ declare state text; begin foreach state in array array['onboarding','suspended','disabled','compromised'] loop
        update public.staff_users set status=state,suspended_at=case when state='suspended' then now() end,compromised_at=case when state='compromised' then now() end where id='${uid}';
        perform pg_temp.denied($q$${call}$q$,'P0001');
        perform pg_temp.check((select security_version=41 and permission_version=(select permission_version from expected_staff) from public.staff_users where id='${uid}'),'inactive unchanged');
      end loop; end $$;`);
    await candidate("anon and authenticated cannot execute", `
      set local role anon; select pg_temp.denied($q$${call}$q$,'42501'); reset role;
      set local role authenticated; select pg_temp.denied($q$${call}$q$,'42501'); reset role;
      select pg_temp.check((select security_version=41 from public.staff_users where id='${uid}'),'denied calls did not increment');`);
    await candidate("later transaction failure rolls back successful transition", `
      do $$ begin begin perform public.complete_staff_password_reset_security_v2('${uid}'); raise exception using errcode='Z9001',message='synthetic later failure'; exception when sqlstate 'Z9001' then null; end;
        perform pg_temp.check((select security_version=41 from public.staff_users where id='${uid}'),'transaction rollback'); end $$;`);
    await candidate("update failure rolls back and propagates", `
      create function pg_temp.fail_update() returns trigger language plpgsql as $$ begin raise exception using errcode='Z9002',message='synthetic update failure'; end $$;
      create trigger synthetic_failure after update on public.staff_users for each row execute function pg_temp.fail_update();
      select pg_temp.denied($q$${call}$q$,'Z9002');
      select pg_temp.check((select security_version=41 from public.staff_users where id='${uid}'),'update failure rollback');`);
    await candidate("actual recovery wrapper stores and replays one transition", `
      ${recoveryFixture} create temp table first as ${recoveryCall};
      create temp table replay as ${recoveryCall};
      select pg_temp.check((select * from first)=(select * from replay),'stored result replay');
      select pg_temp.check((select security_version=42 and permission_version=(select permission_version from expected_staff) from public.staff_users where id='${uid}'),'wrapper increments once');
      select pg_temp.check((select count(*)=1 from recovery_private.audit where attempt_id='${attempt}' and phase='password_transition'),'one audit receipt');
      select pg_temp.check((select password_transition=(select * from first) from recovery_private.attempts where id='${attempt}'),'stored full RPC result');`);
    await candidate("recovery persistence failure rolls back Staff increment and receipt", `
      ${recoveryFixture}
      create function pg_temp.fail_receipt() returns trigger language plpgsql as $$ begin raise exception using errcode='Z9003',message='synthetic receipt failure'; end $$;
      create trigger synthetic_failure before insert on recovery_private.audit for each row execute function pg_temp.fail_receipt();
      select pg_temp.denied($q$${recoveryCall}$q$,'Z9003');
      select pg_temp.check((select security_version=41 from public.staff_users where id='${uid}'),'wrapper rollback');
      select pg_temp.check((select password_transition is null from recovery_private.attempts where id='${attempt}'),'no partial receipt');`);
    await candidate("recovery wrapper retains identity, session and generation guards", `
      ${recoveryFixture}
      select pg_temp.denied($q$select public.system_recovery_password_transition_v1('${attempt}','${uid}','${"b".repeat(40)}')$q$,'P0001');
      insert into auth.sessions(id,user_id,created_at,not_after) values(gen_random_uuid(),'${uid}',now(),null);
      select pg_temp.denied($q$${recoveryCall}$q$,'P0001'); delete from auth.sessions where user_id='${uid}';
      update public.staff_users set security_version=42 where id='${uid}';
      select pg_temp.denied($q$${recoveryCall}$q$,'P0001');
      select pg_temp.check((select security_version=42 from public.staff_users where id='${uid}'),'no guarded increment');`);
}
