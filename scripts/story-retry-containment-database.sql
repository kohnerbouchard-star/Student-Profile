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
 update public.game_sessions set lifecycle_state='paused' where id in(g,fx_game);
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
 update public.story_event_execution_claims set attempt_count=8618,retry_epoch_start_attempt=0,
   lease_expires_at=clock_timestamp()-interval '1 second' where game_session_id=g and storyline_event_id=e;
 select * into r from public.claim_story_event_execution_v1(g,e,clock_timestamp(),99,'{}',120);
 if r.claim_outcome is distinct from 'busy' or r.attempt_count is distinct from 8618 then raise exception 'Expired 8618 claim retried'; end if;
 select * into saved from public.story_event_execution_claims where game_session_id=g and storyline_event_id=e;
 if saved.status is distinct from 'retryable_failed' or saved.lease_token is not null then raise exception 'Expired high attempt lease not fenced'; end if;
 -- Likewise an already failed legacy claim, with no existing hold metadata.
 update public.story_event_execution_claims set retry_hold_reason=null where id=saved.id;
 select * into r from public.claim_story_event_execution_v1(g,e,clock_timestamp(),99,'{}',120);
 if r.claim_outcome is distinct from 'busy' or r.attempt_count is distinct from 8618 then raise exception 'Failed 8618 claim retried'; end if;
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
end $permissions$;
rollback;
select 'STORY_RETRY_CONTAINMENT_DATABASE_ACCEPTANCE_PASSED';
