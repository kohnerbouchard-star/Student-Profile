begin;

create or replace function public.finalize_game_data_purge_v1(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,extensions
as $$
declare
  v_req private.game_data_purge_requests%rowtype;
  v_game public.game_sessions%rowtype;
  v_control private.game_data_purge_control%rowtype;
  v_sha text; v_count bigint; v_cross_refs bigint; v_now timestamptz:=clock_timestamp();
begin
  select * into v_req from private.game_data_purge_requests where id=p_request_id for update;
  if not found or v_req.status not in ('r2_deleted','db_deleting') then raise exception 'PURGE_REQUEST_NOT_READY_TO_FINALIZE' using errcode='P0001'; end if;
  if v_req.db_delete_cursor<130 then raise exception 'GAME_PURGE_DATABASE_NOT_COMPLETE' using errcode='P0001'; end if;
  if v_req.r2_deleted_at is null then raise exception 'R2_DELETE_NOT_VERIFIED' using errcode='P0001'; end if;
  select * into v_control from private.game_data_purge_control where singleton for update;
  if v_control.arm_id is null or v_control.armed_until is null or v_control.armed_until<=v_now or v_control.arm_id<>v_req.confirmed_arm_id then raise exception 'GAME_DATA_PURGE_LEVER_NOT_ARMED_FOR_REQUEST' using errcode='P0001'; end if;
  select registry_sha256,table_count into v_sha,v_count from public.get_game_data_purge_registry_digest_v1();
  if v_sha<>'0967d19098bfcc7b013c5f1bed9fcb2918126fe432e779ad4c8465be6f87eaeb' or v_count<>133 then raise exception 'GAME_PURGE_SCHEMA_DRIFT' using errcode='P0001'; end if;
  select * into v_game from public.game_sessions where id=v_req.game_session_id for update;
  if not found then raise exception 'GAME_NOT_FOUND' using errcode='P0001'; end if;
  if v_game.data_purge_protected then raise exception 'GAME_PURGE_PROTECTED' using errcode='P0001'; end if;
  select count(*) into v_cross_refs from public.game_feature_activation_evidence e where e.source_game_session_id=v_req.game_session_id and e.game_session_id<>v_req.game_session_id;
  if v_cross_refs>0 then raise exception 'GAME_PURGE_CROSS_GAME_REFERENCE_BLOCKED' using errcode='P0001'; end if;

  delete from public.game_sessions where id=v_req.game_session_id;
  if not found then raise exception 'GAME_DELETE_FAILED' using errcode='P0001'; end if;

  update private.game_data_purge_requests set status='completed',db_deleted_at=v_now,completed_at=v_now,last_error=null,updated_at=v_now where id=p_request_id;
  update private.game_data_purge_control set arm_id=null,armed_until=null,armed_by_staff_user_id=null,disarmed_at=v_now,updated_at=v_now where singleton and arm_id=v_req.confirmed_arm_id;
  return jsonb_build_object('requestId',p_request_id,'gameSessionId',v_req.game_session_id,'status','completed','leverDisarmed',true);
end;
$$;

revoke all on function public.finalize_game_data_purge_v1(uuid) from public,anon,authenticated;
grant execute on function public.finalize_game_data_purge_v1(uuid) to service_role;

commit;
