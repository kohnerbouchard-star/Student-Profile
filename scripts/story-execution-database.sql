\set ON_ERROR_STOP on
begin;
insert into public.staff_users(id,supabase_auth_user_id,email,display_name) values
('72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000002','story-execution@example.test','Story execution fixture');
insert into public.game_sessions(id,owner_staff_user_id,name,status,lifecycle_state,game_join_code_status) values
('72000000-0000-4000-8000-000000000010','72000000-0000-4000-8000-000000000001','Story A','disabled','draft','pending'),
('72000000-0000-4000-8000-000000000011','72000000-0000-4000-8000-000000000001','Story B','disabled','draft','pending');
insert into public.storylines(id,key,title,description,is_active) values
('72000000-0000-4000-8000-000000000030','story_execution_fixture_v1','Story fixture','Rollback only',true);
insert into public.storyline_events(id,storyline_id,event_key,title,description,act,sequence,trigger_type,scheduled_offset_seconds,priority,is_active) values
('72000000-0000-4000-8000-000000000031','72000000-0000-4000-8000-000000000030','story_execution_fixture_event','Story fixture','Rollback only',1,1,'elapsed_time',0,'normal',true);

do $test$
declare
 g uuid := '72000000-0000-4000-8000-000000000010';
 other_game uuid := '72000000-0000-4000-8000-000000000011';
 e uuid := '72000000-0000-4000-8000-000000000031';
 at_time timestamptz := '2026-08-12T03:00:00Z';
 plan jsonb := '{"fixture":"retained-plan"}';
 first_claim record; busy_claim record; retry_claim record; final_result record; replay_result record; other_claim record;
 old_token uuid; denied boolean; original_resolution uuid;
begin
 -- The canonical lifecycle trigger projects draft to disabled regardless of a
 -- caller-supplied legacy status. Prove that guard before activating only these
 -- non-joinable, rollback-only fixtures through matching lifecycle/status.
 denied := false;
 begin
  perform public.claim_story_event_execution_v1(g,e,at_time,4,null,120);
 exception when raise_exception then
  if sqlerrm <> 'STORY_EXECUTION_GAME_NOT_MUTABLE' then raise; end if;
  denied := true;
 end;
 if not denied then raise exception 'Draft game accepted Story execution'; end if;
 update public.game_sessions set lifecycle_state='active', status='active'
 where id in (g,other_game);
 if (select count(*) from public.game_sessions where id in (g,other_game)
     and lifecycle_state='active' and status='active' and game_join_code_status='pending') is distinct from 2 then
  raise exception 'Story fixture lifecycle did not activate';
 end if;
 select * into first_claim from public.claim_story_event_execution_v1(g,e,at_time,4,null,120);
 if first_claim.claim_outcome  is distinct from  'absent' then raise exception 'Expected absent'; end if;
 select * into first_claim from public.claim_story_event_execution_v1(g,e,at_time,4,plan,120);
 if first_claim.claim_outcome  is distinct from  'acquired' or first_claim.attempt_count  is distinct from  1 or first_claim.lease_token is null or first_claim.claim_id is null then raise exception 'Expected initial acquisition'; end if;
 old_token := first_claim.lease_token;
 if exists(select 1 from public.story_event_resolutions where game_session_id=g and storyline_event_id=e) then raise exception 'Resolution exists before effects'; end if;
 select * into busy_claim from public.claim_story_event_execution_v1(g,e,at_time,4,plan,120);
 if busy_claim.claim_outcome  is distinct from  'busy' or busy_claim.lease_token is not null then raise exception 'Expected busy without token'; end if;
 select * into other_claim from public.claim_story_event_execution_v1(other_game,e,at_time,4,plan,120);
 if other_claim.claim_outcome  is distinct from  'acquired' or other_claim.claim_id is null or other_claim.claim_id=first_claim.claim_id then raise exception 'Game isolation failed'; end if;
 denied := false;
 begin
  perform public.finalize_story_event_execution_v1(other_game,e,old_token,'{}');
 exception when serialization_failure then denied := true;
 end;
 if not denied then raise exception 'Cross-game lease token accepted'; end if;
 perform public.fail_story_event_execution_v1(g,e,old_token,'simulated effect/finalize interruption');
 if exists(select 1 from public.story_event_resolutions where game_session_id=g and storyline_event_id=e) then raise exception 'Failure finalized event'; end if;
 select * into retry_claim from public.claim_story_event_execution_v1(g,e,at_time+interval '1 hour',9,'{"changed":true}',120);
 if retry_claim.claim_outcome  is distinct from  'acquired' or retry_claim.attempt_count  is distinct from  2 or retry_claim.lease_token=old_token
    or retry_claim.effective_at is distinct from at_time or retry_claim.effective_market_tick is distinct from 4 or retry_claim.execution_plan is distinct from plan then
  raise exception 'Retry changed frozen identity or plan';
 end if;
 denied := false;
 begin
  perform public.finalize_story_event_execution_v1(g,e,old_token,'{}');
 exception when serialization_failure then denied := true;
 end;
 if not denied then raise exception 'Stale lease token accepted'; end if;
 select * into final_result from public.finalize_story_event_execution_v1(g,e,retry_claim.lease_token,'{"applied":true}');
 if final_result.finalize_outcome  is distinct from  'finalized' then raise exception 'Finalization failed'; end if;
 original_resolution := final_result.resolution_id;
 select * into replay_result from public.finalize_story_event_execution_v1(g,e,retry_claim.lease_token,'{"replay":true}');
 if replay_result.finalize_outcome  is distinct from  'already_resolved' or replay_result.resolution_id is distinct from original_resolution then raise exception 'Finalize replay identity changed'; end if;
 select * into replay_result from public.claim_story_event_execution_v1(g,e,at_time,4,plan,120);
 if replay_result.claim_outcome  is distinct from  'already_resolved' or replay_result.resolution_id is distinct from original_resolution then raise exception 'Completed claim replay failed'; end if;
 if (select count(*) from public.story_event_resolutions where game_session_id=g and storyline_event_id=e) is distinct from 1 then raise exception 'Duplicate resolution'; end if;
 if (select result_payload from public.story_event_resolutions where id=original_resolution)  is distinct from  '{"applied":true}'::jsonb then raise exception 'Replay overwrote result'; end if;
 if exists(select 1 from public.story_event_resolutions where game_session_id=other_game and storyline_event_id=e) then raise exception 'Other game finalized'; end if;
end $test$;

do $permissions$
declare signature text;
begin
 foreach signature in array array[
 'public.claim_story_event_execution_v1(uuid,uuid,timestamp with time zone,integer,jsonb,integer)',
 'public.fail_story_event_execution_v1(uuid,uuid,uuid,text)',
 'public.finalize_story_event_execution_v1(uuid,uuid,uuid,jsonb)'] loop
  if has_function_privilege('anon',signature,'execute') or has_function_privilege('authenticated',signature,'execute')
     or not has_function_privilege('service_role',signature,'execute') then raise exception 'Unexpected RPC privilege: %',signature; end if;
 end loop;
end $permissions$;
rollback;
select 'STORY_EXECUTION_DATABASE_ACCEPTANCE_PASSED';
