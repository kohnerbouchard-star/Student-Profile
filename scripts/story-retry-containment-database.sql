\set ON_ERROR_STOP on
begin;
insert into public.staff_users(id,supabase_auth_user_id,email,display_name) values
('73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002','story-retry@example.test','Story execution fixture');
insert into public.game_sessions(id,owner_staff_user_id,name,status,lifecycle_state,game_join_code_status) values
('73000000-0000-4000-8000-000000000010','73000000-0000-4000-8000-000000000001','Story A','disabled','draft','pending'),
('73000000-0000-4000-8000-000000000011','73000000-0000-4000-8000-000000000001','Story B','disabled','draft','pending');
insert into public.storylines(id,key,title,description,is_active) values
('73000000-0000-4000-8000-000000000030','story_retry_fixture_v1','Story fixture','Rollback only',true);
insert into public.storyline_events(id,storyline_id,event_key,title,description,act,sequence,trigger_type,scheduled_offset_seconds,priority,is_active) values
('73000000-0000-4000-8000-000000000031','73000000-0000-4000-8000-000000000030','story_retry_fixture_event','Story fixture','Rollback only',1,1,'elapsed_time',0,'normal',true);

do $fixture_lifecycle$
declare denied boolean:=false;
begin
 begin
  perform public.claim_story_event_execution_v1('73000000-0000-4000-8000-000000000010','73000000-0000-4000-8000-000000000031',clock_timestamp(),4,'{}',120);
 exception when raise_exception then
  if sqlerrm <> 'STORY_EXECUTION_GAME_NOT_MUTABLE' then raise; end if;
  denied:=true;
 end;
 if not denied then raise exception 'Draft fixture unexpectedly mutable'; end if;
 update public.game_sessions set lifecycle_state='active',status='active'
  where id in('73000000-0000-4000-8000-000000000010','73000000-0000-4000-8000-000000000011');
 if (select count(*) from public.game_sessions
   where id in('73000000-0000-4000-8000-000000000010','73000000-0000-4000-8000-000000000011')
   and lifecycle_state='active' and status='active' and game_join_code_status='pending')<>2
 then raise exception 'Fixture lifecycle not active/nonjoinable'; end if;
end $fixture_lifecycle$;

do $test$
declare
 g uuid := '73000000-0000-4000-8000-000000000010';
 other_game uuid := '73000000-0000-4000-8000-000000000011';
 e uuid := '73000000-0000-4000-8000-000000000031';
 at_time timestamptz := '2026-08-12T03:00:00Z';
 plan jsonb := '{"version":1,"effects":[],"marker":"frozen"}';
 fx_plan jsonb := '{"version":1,"effects":[{"effect":{"type":"currency_volatility"}}]}';
 acquired record; result record; other_claim record; saved public.story_event_execution_claims%rowtype;
 denied boolean;
begin
 select * into acquired from public.claim_story_event_execution_v1(g,e,at_time,4,plan,120);
 if acquired.claim_outcome is distinct from 'acquired' then raise exception 'initial claim failed'; end if;
 perform public.fail_story_event_execution_v1(g,e,acquired.lease_token,'temporary failure');
 select * into saved from public.story_event_execution_claims where id=acquired.claim_id;
 if saved.retry_after_at is null or saved.retry_after_at < clock_timestamp()+interval '55 seconds'
    or saved.retry_after_at > clock_timestamp()+interval '61 seconds'
    or saved.retry_hold_reason is not null then raise exception 'first retry not delayed60 seconds'; end if;
 select * into result from public.claim_story_event_execution_v1(g,e,at_time,4,plan,120);
 if result.claim_outcome is distinct from 'busy' or result.execution_plan is distinct from '{}'::jsonb
    or result.attempt_count is distinct from 1 or result.lease_token is not null then raise exception 'deferred retry executed or leaked plan'; end if;
 -- Fixture time advancement only; never an operational recovery instruction.
 update public.story_event_execution_claims set retry_after_at=clock_timestamp()-interval '1 second' where id=acquired.claim_id;
 select * into result from public.claim_story_event_execution_v1(g,e,at_time+interval '1 day',99,'{"replacement":true}',120);
 if result.claim_outcome is distinct from 'acquired' or result.attempt_count is distinct from 2
    or result.execution_plan is distinct from plan or result.effective_at is distinct from at_time
    or result.effective_market_tick is distinct from 4 then raise exception 'retry lost frozen identity'; end if;
 -- The live lease remains authoritative even when attempt_count reaches the cap.
 update public.story_event_execution_claims set attempt_count=8 where id=acquired.claim_id;
 select * into acquired from public.claim_story_event_execution_v1(g,e,at_time,4,plan,120);
 if acquired.claim_outcome is distinct from 'busy' then raise exception 'active lease stolen'; end if;
 perform public.fail_story_event_execution_v1(g,e,result.lease_token,'temporary failure');
 select * into result from public.claim_story_event_execution_v1(g,e,at_time,4,plan,120);
 if result.claim_outcome is distinct from 'busy' or result.attempt_count is distinct from 8 then raise exception 'exhausted budget retried'; end if;
 if (select retry_hold_reason from public.story_event_execution_claims where game_session_id=g and storyline_event_id=e)
    is distinct from 'STORY_EXECUTION_RETRY_BUDGET_EXHAUSTED' then raise exception 'missing budget hold'; end if;
 -- Separate rollback-only fixture game: reproduce the live blocked dependency.
 insert into private.fx_runtime_state(game_session_id,cutover_status,blocked_reason,policy_version_id)
 select other_game,'blocked','FX_MACRO_SNAPSHOT_SET_INCOMPLETE',id from public.fx_policy_versions
 order by activated_at desc limit 1
 on conflict(game_session_id) do update set cutover_status='blocked',blocked_reason='FX_MACRO_SNAPSHOT_SET_INCOMPLETE';
 if not exists(select 1 from private.fx_runtime_state where game_session_id=other_game and cutover_status='blocked') then
  raise exception 'Missing FX policy fixture';
 end if;
 select * into other_claim from public.claim_story_event_execution_v1(other_game,e,at_time,4,fx_plan,120);
 if other_claim.claim_outcome is distinct from 'acquired' then raise exception 'game isolation failed'; end if;
 update public.story_event_execution_claims set lease_expires_at=clock_timestamp()-interval '1 second' where id=other_claim.claim_id;
 select * into result from public.claim_story_event_execution_v1(other_game,e,at_time,4,'{}',120);
 if result.claim_outcome is distinct from 'busy' or result.execution_plan is distinct from '{}'::jsonb then raise exception 'missing FX not contained'; end if;
 select * into saved from public.story_event_execution_claims where id=other_claim.claim_id;
 if saved.retry_hold_reason is distinct from 'STORY_CURRENCY_VOLATILITY_FX_NOT_READY'
    or saved.execution_plan is distinct from fx_plan or saved.attempt_count is distinct from 1
    or saved.lease_token is not null then raise exception 'dependency hold corrupted identity or kept stale lease'; end if;
 denied:=false;
 begin perform public.finalize_story_event_execution_v1(other_game,e,other_claim.lease_token,'{}');
 exception when serialization_failure then denied:=true; end;
 if not denied then raise exception 'held claim accepted stale finalize'; end if;
 denied:=false;
 begin perform public.fail_story_event_execution_v1(other_game,e,other_claim.lease_token,'stale failure');
 exception when serialization_failure then denied:=true; end;
 if not denied then raise exception 'held claim accepted stale failure'; end if;
 if not exists(select 1 from private.fx_runtime_state where game_session_id=other_game
    and cutover_status='blocked' and blocked_reason='FX_MACRO_SNAPSHOT_SET_INCOMPLETE') then
  raise exception 'Containment mutated FX readiness';
 end if;
 if exists(select 1 from public.story_event_resolutions where game_session_id in(g,other_game)) then raise exception 'containment finalized event'; end if;
end $test$;

-- All state setup below affects only rollback-only fixture IDs, never existing games.
do $boundaries$
declare
 g uuid := '73000000-0000-4000-8000-000000000010';
 fx_game uuid := '73000000-0000-4000-8000-000000000011';
 owner_id uuid := '73000000-0000-4000-8000-000000000001';
 e uuid := '73000000-0000-4000-8000-000000000031';
 r record; replay record; c record; saved public.story_event_execution_claims%rowtype;
 n integer; delay_seconds integer; denied boolean; release_id uuid;
begin
 update public.game_sessions set lifecycle_state='paused',status='disabled' where id in(g,fx_game);
 -- A canonical paused game is disabled: recovery must not resume execution.
 denied:=false;
 begin perform public.claim_story_event_execution_v1(g,e,clock_timestamp(),4,'{}',120);
 exception when raise_exception then
  if sqlerrm <> 'STORY_EXECUTION_GAME_NOT_MUTABLE' then raise; end if;
  denied:=true;
 end;
 if not denied then raise exception 'Paused fixture unexpectedly mutable'; end if;
 denied:=false;
 begin perform public.release_story_execution_retry_hold_v1(g,e,'STORY_EXECUTION_RETRY_BUDGET_EXHAUSTED',8,1,owner_id,'Reviewed paused fixture denial','retry-fixture-paused');
 exception when insufficient_privilege then
  if sqlerrm <> 'STORY_RETRY_RELEASE_OWNER_OR_GAME_INVALID' then raise; end if;
  denied:=true;
 end;
 if not denied then raise exception 'Paused fixture unexpectedly released hold'; end if;
 if exists(select 1 from public.story_execution_retry_release_audit where game_session_id in(g,fx_game)) then raise exception 'Paused denial wrote release audit'; end if;
 -- Resume synthetic fixtures only; all success cases use canonical active state.
 update public.game_sessions set lifecycle_state='active',status='active' where id in(g,fx_game);
 -- Wrong owner and stale expected attempts cannot open a hold.
 denied:=false;
 begin perform public.release_story_execution_retry_hold_v1(g,e,'STORY_EXECUTION_RETRY_BUDGET_EXHAUSTED',8,1,gen_random_uuid(),'Reviewed transient outage recovery','retry-fixture-owner');
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Wrong owner released hold'; end if;
 denied:=false;
 begin perform public.release_story_execution_retry_hold_v1(g,e,'STORY_EXECUTION_RETRY_BUDGET_EXHAUSTED',7,1,owner_id,'Reviewed transient outage recovery','retry-fixture-stale');
 exception when serialization_failure then denied:=true; end;
 if not denied then raise exception 'Stale attempt fence accepted'; end if;
 select * into r from public.release_story_execution_retry_hold_v1(g,e,'STORY_EXECUTION_RETRY_BUDGET_EXHAUSTED',8,1,owner_id,'Reviewed transient outage recovery','retry-fixture-release');
 release_id:=r.audit_id;
 if r.release_outcome is distinct from 'released' or r.preserved_attempt_count is distinct from 8 then raise exception 'Release reset historical attempts'; end if;
 select * into replay from public.release_story_execution_retry_hold_v1(g,e,'STORY_EXECUTION_RETRY_BUDGET_EXHAUSTED',8,1,owner_id,'Reviewed transient outage recovery','retry-fixture-release');
 if replay.release_outcome is distinct from 'replayed' or replay.audit_id is distinct from release_id then raise exception 'Release not idempotent'; end if;
 denied:=false;
 begin perform public.release_story_execution_retry_hold_v1(g,e,'STORY_EXECUTION_RETRY_BUDGET_EXHAUSTED',8,1,owner_id,'Changed recovery description','retry-fixture-release');
 exception when invalid_parameter_value then denied:=true; end;
 if not denied then raise exception 'Changed release intent accepted'; end if;
 -- Every delay boundary in a new epoch; total attempts must remain monotonic.
 for n in 1..8 loop
   select * into c from public.claim_story_event_execution_v1(g,e,clock_timestamp(),99,'{}',120);
   if c.claim_outcome is distinct from 'acquired' or c.attempt_count is distinct from 8+n then raise exception 'Fresh epoch acquisition wrong'; end if;
   perform public.fail_story_event_execution_v1(g,e,c.lease_token,'simulated temporary failure');
   select * into saved from public.story_event_execution_claims where game_session_id=g and storyline_event_id=e;
   if n<8 then
     delay_seconds:=least(3600,60*power(2,n-1))::integer;
     if saved.retry_after_at is null or saved.retry_after_at<clock_timestamp()+make_interval(secs=>delay_seconds-5)
       or saved.retry_after_at>clock_timestamp()+make_interval(secs=>delay_seconds+1)
       or saved.retry_hold_reason is not null then raise exception 'Backoff boundary wrong at attempt %',n; end if;
     update public.story_event_execution_claims set retry_after_at=clock_timestamp()-interval '1 second' where id=saved.id;
   else
     if saved.retry_hold_reason is distinct from 'STORY_EXECUTION_RETRY_BUDGET_EXHAUSTED' or saved.retry_after_at is not null then raise exception 'Eight attempt boundary missing'; end if;
   end if;
 end loop;
 -- An unrelated non-FX plan stays executable even with blocked FX authority.
 insert into private.fx_runtime_state(game_session_id,cutover_status,blocked_reason,policy_version_id)
 select g,'blocked','FX_MACRO_SNAPSHOT_SET_INCOMPLETE',id from public.fx_policy_versions order by activated_at desc limit 1
 on conflict(game_session_id) do update set cutover_status='blocked',blocked_reason='FX_MACRO_SNAPSHOT_SET_INCOMPLETE';
 select * into r from public.release_story_execution_retry_hold_v1(g,e,'STORY_EXECUTION_RETRY_BUDGET_EXHAUSTED',16,2,owner_id,'Reviewed non-FX retry recovery','retry-fixture-unrelated');
 select * into c from public.claim_story_event_execution_v1(g,e,clock_timestamp(),99,'{}',120);
 if c.claim_outcome is distinct from 'acquired' then raise exception 'Unrelated blocked FX stopped non-FX plan'; end if;
 -- Preexisting high-attempt expired execution is fenced, not allowed to run once more.
 update public.story_event_execution_claims set attempt_count=8981,retry_epoch_start_attempt=0,
   lease_expires_at=clock_timestamp()-interval '1 second' where game_session_id=g and storyline_event_id=e;
 select * into r from public.claim_story_event_execution_v1(g,e,clock_timestamp(),99,'{}',120);
 if r.claim_outcome is distinct from 'busy' or r.attempt_count is distinct from 8981 then raise exception 'Expired 8981 claim retried'; end if;
 select * into saved from public.story_event_execution_claims where game_session_id=g and storyline_event_id=e;
 if saved.status is distinct from 'retryable_failed' or saved.lease_token is not null then raise exception 'Expired high attempt lease not fenced'; end if;
 -- Likewise an already failed legacy claim, with no existing hold metadata.
 update public.story_event_execution_claims set retry_hold_reason=null where id=saved.id;
 select * into r from public.claim_story_event_execution_v1(g,e,clock_timestamp(),99,'{}',120);
 if r.claim_outcome is distinct from 'busy' or r.attempt_count is distinct from 8981 then raise exception 'Failed 8981 claim retried'; end if;
 -- Dependency release fails until readiness; changing readiness never auto-releases.
 denied:=false;
 begin perform public.release_story_execution_retry_hold_v1(fx_game,e,'STORY_CURRENCY_VOLATILITY_FX_NOT_READY',1,1,owner_id,'Reviewed FX cutover recovery','retry-fixture-fx-release');
 exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'Blocked dependency released'; end if;
 -- Synthetic fixture only. This is NOT an operational FX repair instruction.
 update private.fx_runtime_state set cutover_status='ready',blocked_reason=null where game_session_id=fx_game;
 select * into r from public.claim_story_event_execution_v1(fx_game,e,clock_timestamp(),99,'{}',120);
 if r.claim_outcome is distinct from 'busy' then raise exception 'Readiness automatically released hold'; end if;
 select * into r from public.release_story_execution_retry_hold_v1(fx_game,e,'STORY_CURRENCY_VOLATILITY_FX_NOT_READY',1,1,owner_id,'Reviewed FX cutover recovery','retry-fixture-fx-release');
 update private.fx_runtime_state set cutover_status='blocked',blocked_reason='FX_MACRO_SNAPSHOT_SET_INCOMPLETE' where game_session_id=fx_game;
 select * into r from public.claim_story_event_execution_v1(fx_game,e,clock_timestamp(),99,'{}',120);
 update private.fx_runtime_state set cutover_status='ready',blocked_reason=null where game_session_id=fx_game;
 denied:=false;
 begin perform public.release_story_execution_retry_hold_v1(fx_game,e,'STORY_CURRENCY_VOLATILITY_FX_NOT_READY',1,1,owner_id,'Reviewed FX cutover recovery','retry-fixture-stale-generation');
 exception when serialization_failure then denied:=true; end;
 if not denied then raise exception 'Stale hold generation released reheld claim'; end if;
 select * into r from public.release_story_execution_retry_hold_v1(fx_game,e,'STORY_CURRENCY_VOLATILITY_FX_NOT_READY',1,2,owner_id,'Reviewed new FX hold recovery','retry-fixture-fresh-generation');
 select * into c from public.claim_story_event_execution_v1(fx_game,e,clock_timestamp(),99,'{}',120);
 if c.claim_outcome is distinct from 'acquired' or c.attempt_count is distinct from 2 then raise exception 'Ready FX release not executable'; end if;
 select * into r from public.finalize_story_event_execution_v1(fx_game,e,c.lease_token,'{"fixture":true}');
 select * into replay from public.claim_story_event_execution_v1(fx_game,e,clock_timestamp(),99,'{}',120);
 if replay.claim_outcome is distinct from 'already_resolved' or replay.resolution_id is distinct from r.resolution_id then raise exception 'Completed branch lost idempotency'; end if;
 if (select count(*) from public.story_execution_retry_release_audit where game_session_id in(g,fx_game))<>4 then raise exception 'Release audit count wrong'; end if;
end $boundaries$;

do $permissions$
declare signature text;
begin
 foreach signature in array array[
 'public.claim_story_event_execution_v1(uuid,uuid,timestamp with time zone,integer,jsonb,integer)',
 'public.fail_story_event_execution_v1(uuid,uuid,uuid,text)',
 'public.finalize_story_event_execution_v1(uuid,uuid,uuid,jsonb)',
 'public.release_story_execution_retry_hold_v1(uuid,uuid,text,integer,bigint,uuid,text,text)'] loop
  if has_function_privilege('anon',signature,'execute') or has_function_privilege('authenticated',signature,'execute')
     or not has_function_privilege('service_role',signature,'execute') then raise exception 'Unexpected RPC privilege: %',signature; end if;
 end loop;
 if not has_table_privilege('service_role','public.story_execution_retry_release_audit','select')
     or has_table_privilege('service_role','public.story_execution_retry_release_audit','insert,update,delete')
     or has_table_privilege('anon','public.story_execution_retry_release_audit','select,insert,update,delete')
     or has_table_privilege('authenticated','public.story_execution_retry_release_audit','select,insert,update,delete')
 then raise exception 'Unexpected Story release audit privileges'; end if;
end $permissions$;

-- Disposable transaction only. Use the actual child-first batch RPC with two
-- games' audit rows and a synthetic, explicitly armed DB-stage request.
do $purge_audit$
declare
  target_game uuid := '73000000-0000-4000-8000-000000000010';
  other_game uuid := '73000000-0000-4000-8000-000000000011';
  staff_id uuid := '73000000-0000-4000-8000-000000000001';
  code_id uuid := '73000000-0000-4000-8000-000000000080';
  entitlement_id uuid := '73000000-0000-4000-8000-000000000081';
  request_id uuid := '73000000-0000-4000-8000-000000000082';
  fixture_arm_id uuid := '73000000-0000-4000-8000-000000000083';
  audit_position integer;
  result jsonb;
  other_audit jsonb;
begin
  if exists (
    select 1 from information_schema.columns as c
    join information_schema.tables as t using (table_schema, table_name)
    left join private.game_data_purge_table_registry as r using (table_schema, table_name)
    where c.column_name = 'game_session_id'
      and c.table_schema in ('public', 'private') and t.table_type = 'BASE TABLE'
      and c.table_name not in ('game_sessions', 'game_data_purge_requests', 'game_data_purge_table_registry')
      and r.table_name is null
  ) then raise exception 'Story purge registry incomplete'; end if;

  select position into strict audit_position
  from private.game_data_purge_delete_order_v1
  where table_schema = 'public' and table_name = 'story_execution_retry_release_audit';
  if (select count(*) from private.game_data_purge_delete_order_v1
      where table_schema = 'public' and table_name in ('story_event_execution_claims', 'story_event_resolutions')
        and position > audit_position) <> 2 then
    raise exception 'Story audit is not ordered before its ancestors';
  end if;
  select jsonb_agg(to_jsonb(a) order by a.id) into other_audit
  from public.story_execution_retry_release_audit as a where a.game_session_id = other_game;
  if jsonb_array_length(other_audit) is distinct from 2 then
    raise exception 'Story purge comparison fixture missing';
  end if;

  insert into public.purchase_codes(id,code_hash,status,max_redemptions,redeemed_count,license_duration_days)
  values(code_id,repeat('e',64),'exhausted',1,1,null);
  insert into public.entitlements(id,purchase_code_id,staff_user_id,game_session_id,status,license_expires_at,expired_at)
  values(entitlement_id,code_id,staff_id,target_game,'expired','2000-01-01','2000-01-02');
  update private.game_data_purge_control
  set environment_name = 'staging', r2_bucket_name = 'story-disposable',
      arm_id = fixture_arm_id, armed_until = clock_timestamp() + interval '2 hours',
      armed_by_staff_user_id = staff_id, armed_at = clock_timestamp(), disarmed_at = null
  where singleton;
  insert into private.game_data_purge_requests
    (id, game_session_id, game_name_snapshot, entitlement_id, license_expires_at, status,
     confirmation_hash, confirmation_issued_at, confirmation_not_before, confirmation_expires_at,
     confirmed_by_staff_user_id, confirmed_at, purge_not_before, confirmed_arm_id,
     r2_prefix, r2_deleted_at, db_delete_cursor)
  values(request_id, target_game, 'Story A', entitlement_id, '2000-01-01', 'db_deleting',
    repeat('c',64), clock_timestamp()-interval '2 minutes', clock_timestamp()-interval '1 minute',
    clock_timestamp()+interval '30 minutes', staff_id, clock_timestamp()-interval '1 minute',
    clock_timestamp()-interval '1 day', fixture_arm_id, 'staging/game_session=' || target_game || '/',
    clock_timestamp()-interval '1 minute', audit_position-1);

  set local role service_role;
  select public.execute_game_data_purge_db_batch_v2(request_id, 1) into result;
  reset role;
  if (result->>'cursor')::integer is distinct from audit_position
     or exists (select 1 from public.story_execution_retry_release_audit where game_session_id = target_game)
     or not exists (select 1 from public.story_event_execution_claims where game_session_id = target_game)
     or (select jsonb_agg(to_jsonb(a) order by a.id)
         from public.story_execution_retry_release_audit as a where a.game_session_id = other_game)
         is distinct from other_audit
  then raise exception 'Story audit purge lost exact game scope or child-first ordering'; end if;
end $purge_audit$;
rollback;
select 'STORY_RETRY_CONTAINMENT_DATABASE_ACCEPTANCE_PASSED';
