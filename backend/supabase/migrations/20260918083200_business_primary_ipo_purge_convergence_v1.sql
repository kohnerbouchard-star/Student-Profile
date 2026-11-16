-- Phase 14C fingerprints observed on fresh replay of 8ba46d6e94fc77d5787a0f7a8639463630a7cd88.
-- Only schema fingerprints and cursor bounds change; request, entitlement,
-- environment, child-first deletion tokens and physical zero-row proof persist.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
create or replace function public.execute_game_data_purge_db_batch_v2(
  p_request_id uuid,
  p_batch_size integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_control private.game_data_purge_control%rowtype;
  v_request private.game_data_purge_requests%rowtype;
  v_game public.game_sessions%rowtype;
  v_entitlement public.entitlements%rowtype;
  v_registry_sha text;
  v_registry_count bigint;
  v_fk_sha text;
  v_fk_count bigint;
  v_order_sha text;
  v_order_count bigint;
  v_cross_refs bigint;
  v_cursor integer;
  v_end integer;
  v_next integer;
  v_processed integer := 0;
  v_target record;
  v_delete_token text;
  v_deleted bigint;
  v_key text;
  v_existing bigint;
  v_batch jsonb := '{}'::jsonb;
  v_total jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if p_request_id is null
     or p_batch_size is null
     or p_batch_size < 1
     or p_batch_size > 20
  then
    raise exception 'GAME_PURGE_DB_BATCH_INVALID' using errcode = '22023';
  end if;

  -- Match claim/finalizer lock order: singleton control, request, game, then
  -- entitlement. The target evidence rows are locked by each DELETE.
  select * into v_control
  from private.game_data_purge_control as control_row
  where control_row.singleton
  for update;

  select * into v_request
  from private.game_data_purge_requests as request_row
  where request_row.id = p_request_id
  for update;
  if not found or v_request.status <> 'db_deleting' then
    raise exception 'PURGE_REQUEST_NOT_READY_FOR_DATABASE'
      using errcode = 'P0001';
  end if;
  if v_request.confirmed_at is null
     or v_request.confirmed_by_staff_user_id is null
     or v_request.confirmed_arm_id is null
     or v_request.confirmation_hash is null
     or v_request.confirmation_hash !~ '^[0-9a-f]{64}$'
     or v_request.r2_deleted_at is null
     or v_request.purge_not_before is null
     or v_request.purge_not_before > v_now
  then
    raise exception 'GAME_PURGE_DATABASE_GATES_NOT_MET'
      using errcode = 'P0001';
  end if;
  if v_request.db_delete_token_hash is not null
     or v_request.db_delete_target_schema is not null
     or v_request.db_delete_target_table is not null
     or v_request.db_delete_target_position is not null
  then
    raise exception 'GAME_PURGE_DELETE_AUTHORIZATION_STALE'
      using errcode = 'P0001';
  end if;

  if v_control.environment_name is null
     or v_control.r2_bucket_name is null
  then
    raise exception 'GAME_PURGE_ENVIRONMENT_NOT_CONFIGURED'
      using errcode = 'P0001';
  end if;
  if v_request.r2_prefix is distinct from
       v_control.environment_name || '/game_session='
         || v_request.game_session_id::text || '/'
  then
    raise exception 'GAME_PURGE_R2_BINDING_MISMATCH'
      using errcode = 'P0001';
  end if;
  if v_control.arm_id is null
     or v_control.armed_until is null
     or v_control.armed_until <= v_now
     or v_control.arm_id <> v_request.confirmed_arm_id
  then
    raise exception 'GAME_DATA_PURGE_LEVER_NOT_ARMED_FOR_REQUEST'
      using errcode = 'P0001';
  end if;

  select * into v_game
  from public.game_sessions as game_row
  where game_row.id = v_request.game_session_id
  for update;
  if not found then
    raise exception 'GAME_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_game.data_purge_protected then
    raise exception 'GAME_PURGE_PROTECTED' using errcode = 'P0001';
  end if;

  select * into v_entitlement
  from public.entitlements as entitlement_row
  where entitlement_row.id = v_request.entitlement_id
    and entitlement_row.game_session_id = v_request.game_session_id
  for update;
  if not found
     or v_entitlement.status <> 'expired'
     or v_entitlement.license_expires_at is null
     or v_entitlement.license_expires_at > v_now
  then
    raise exception 'GAME_LICENSE_NOT_EXPIRED' using errcode = 'P0001';
  end if;

  select digest_row.registry_sha256, digest_row.table_count
  into v_registry_sha, v_registry_count
  from public.get_game_data_purge_registry_digest_v1() as digest_row;
  if v_registry_sha <>
       'ab44a67a1247fd706636c3aeb627f352344ca08bde6b6c7159f686a873612a48'
     or v_registry_count <> 206
  then
    raise exception 'GAME_PURGE_SCHEMA_DRIFT' using errcode = 'P0001';
  end if;

  select digest_row.fk_graph_sha256, digest_row.edge_count
  into v_fk_sha, v_fk_count
  from public.get_game_data_purge_fk_graph_digest_v1() as digest_row;
  if v_fk_sha <>
       '343f1966b3750e7a639fb82059bab1049edd44591e27d59cd08017c19be46198'
     or v_fk_count <> 455
  then
    raise exception 'GAME_PURGE_FK_GRAPH_DRIFT' using errcode = 'P0001';
  end if;

  select digest_row.order_sha256, digest_row.table_count
  into v_order_sha, v_order_count
  from public.get_game_data_purge_delete_order_digest_v1() as digest_row;
  if v_order_sha <>
       'f2fe1c6ad5d11bf7c73e1bd761153e6e6cfa726d9b26f780b62e42eb603667b6'
     or v_order_count <> 205
  then
    raise exception 'GAME_PURGE_DELETE_ORDER_DRIFT' using errcode = 'P0001';
  end if;

  select count(*) into v_cross_refs
  from public.game_feature_activation_evidence as evidence_row
  where evidence_row.source_game_session_id = v_request.game_session_id
    and evidence_row.game_session_id <> v_request.game_session_id;
  if v_cross_refs > 0 then
    raise exception 'GAME_PURGE_CROSS_GAME_REFERENCE_BLOCKED'
      using errcode = 'P0001';
  end if;

  v_cursor := coalesce(v_request.db_delete_cursor, 0);
  if v_cursor < 0 or v_cursor > 206 then
    raise exception 'GAME_PURGE_DB_CURSOR_INVALID' using errcode = 'P0001';
  end if;

  v_total := coalesce(v_request.db_deleted_rows, '{}'::jsonb);
  if v_cursor < 205 then
    v_end := least(v_cursor + p_batch_size, 205);
    for v_target in
      select order_row.position, order_row.table_schema, order_row.table_name
      from private.game_data_purge_delete_order_v1 as order_row
      where order_row.position > v_cursor
        and order_row.position <= v_end
      order by order_row.position
    loop
      v_delete_token := encode(extensions.gen_random_bytes(32), 'hex');
      update private.game_data_purge_requests
      set db_delete_token_hash = encode(
            extensions.digest(v_delete_token, 'sha256'),
            'hex'
          ),
          db_delete_target_schema = v_target.table_schema,
          db_delete_target_table = v_target.table_name,
          db_delete_target_position = v_target.position,
          updated_at = clock_timestamp()
      where id = p_request_id
        and status = 'db_deleting'
        and db_delete_cursor = v_target.position - 1;
      if not found then
        raise exception 'GAME_PURGE_DB_CURSOR_CONFLICT'
          using errcode = 'P0001';
      end if;

      perform pg_catalog.set_config(
        'app.game_data_purge_request_id',
        p_request_id::text,
        true
      );
      perform pg_catalog.set_config(
        'app.game_data_purge_delete_token',
        v_delete_token,
        true
      );

      execute format(
        'delete from %I.%I where game_session_id = $1',
        v_target.table_schema,
        v_target.table_name
      ) using v_request.game_session_id;
      get diagnostics v_deleted = row_count;

      v_key := v_target.table_schema || '.' || v_target.table_name;
      v_existing := coalesce((v_total ->> v_key)::bigint, 0);
      v_total := jsonb_set(
        v_total,
        array[v_key],
        to_jsonb(v_existing + v_deleted),
        true
      );
      v_batch := jsonb_set(
        v_batch,
        array[v_key],
        to_jsonb(v_deleted),
        true
      );

      update private.game_data_purge_requests
      set db_delete_cursor = v_target.position,
          db_deleted_rows = v_total,
          db_delete_token_hash = null,
          db_delete_target_schema = null,
          db_delete_target_table = null,
          db_delete_target_position = null,
          db_started_at = coalesce(db_started_at, v_now),
          updated_at = clock_timestamp()
      where id = p_request_id
        and status = 'db_deleting'
        and db_delete_target_position = v_target.position;
      if not found then
        raise exception 'GAME_PURGE_DELETE_AUTHORIZATION_LOST'
          using errcode = 'P0001';
      end if;

      perform pg_catalog.set_config(
        'app.game_data_purge_delete_token',
        '',
        true
      );
      perform pg_catalog.set_config(
        'app.game_data_purge_request_id',
        '',
        true
      );
      v_processed := v_processed + 1;
    end loop;

    if v_processed <> v_end - v_cursor then
      raise exception 'GAME_PURGE_DELETE_ORDER_INCOMPLETE'
        using errcode = 'P0001';
    end if;
    v_next := case when v_end = 205 then 206 else v_end end;
  else
    v_next := 206;
  end if;

  update private.game_data_purge_requests
  set status = 'r2_deleted',
      db_delete_cursor = v_next,
      db_deleted_rows = v_total,
      db_delete_token_hash = null,
      db_delete_target_schema = null,
      db_delete_target_table = null,
      db_delete_target_position = null,
      db_started_at = coalesce(db_started_at, v_now),
      last_error = null,
      updated_at = clock_timestamp()
  where id = p_request_id
    and status = 'db_deleting';
  if not found then
    raise exception 'PURGE_REQUEST_STAGE_CONFLICT' using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config('app.game_data_purge_delete_token', '', true);
  perform pg_catalog.set_config('app.game_data_purge_request_id', '', true);

  return jsonb_build_object(
    'requestId', p_request_id,
    'gameSessionId', v_request.game_session_id,
    'cursor', v_next,
    'readyToFinalize', v_next = 206,
    'deletedRows', v_batch
  );
end;
$function$;

create or replace function public.finalize_game_data_purge_v1(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_control private.game_data_purge_control%rowtype;
  v_request private.game_data_purge_requests%rowtype;
  v_game public.game_sessions%rowtype;
  v_entitlement public.entitlements%rowtype;
  v_registry_sha text;
  v_registry_count bigint;
  v_fk_sha text;
  v_fk_count bigint;
  v_order_sha text;
  v_order_count bigint;
  v_cross_refs bigint;
  v_target record;
  v_remaining bigint;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_control
  from private.game_data_purge_control as control_row
  where control_row.singleton
  for update;

  select * into v_request
  from private.game_data_purge_requests as request_row
  where request_row.id = p_request_id
  for update;
  if not found
     or v_request.status not in ('r2_deleted', 'db_deleting')
  then
    raise exception 'PURGE_REQUEST_NOT_READY_TO_FINALIZE'
      using errcode = 'P0001';
  end if;
  if v_request.db_delete_cursor <> 206 then
    raise exception 'GAME_PURGE_DATABASE_NOT_COMPLETE'
      using errcode = 'P0001';
  end if;
  if v_request.db_delete_token_hash is not null
     or v_request.db_delete_target_schema is not null
     or v_request.db_delete_target_table is not null
     or v_request.db_delete_target_position is not null
  then
    raise exception 'GAME_PURGE_DELETE_AUTHORIZATION_STALE'
      using errcode = 'P0001';
  end if;
  if v_request.confirmed_at is null
     or v_request.confirmed_by_staff_user_id is null
     or v_request.confirmed_arm_id is null
     or v_request.confirmation_hash is null
     or v_request.confirmation_hash !~ '^[0-9a-f]{64}$'
     or v_request.r2_deleted_at is null
  then
    raise exception 'R2_DELETE_NOT_VERIFIED' using errcode = 'P0001';
  end if;
  if v_request.purge_not_before is null
     or v_request.purge_not_before > v_now
  then
    raise exception 'GAME_PURGE_GRACE_PERIOD_ACTIVE'
      using errcode = 'P0001';
  end if;

  if v_control.environment_name is null
     or v_control.r2_bucket_name is null
  then
    raise exception 'GAME_PURGE_ENVIRONMENT_NOT_CONFIGURED'
      using errcode = 'P0001';
  end if;
  if v_request.r2_prefix is distinct from
       v_control.environment_name || '/game_session='
         || v_request.game_session_id::text || '/'
  then
    raise exception 'GAME_PURGE_R2_BINDING_MISMATCH'
      using errcode = 'P0001';
  end if;
  if v_control.arm_id is null
     or v_control.armed_until is null
     or v_control.armed_until <= v_now
     or v_control.arm_id <> v_request.confirmed_arm_id
  then
    raise exception 'GAME_DATA_PURGE_LEVER_NOT_ARMED_FOR_REQUEST'
      using errcode = 'P0001';
  end if;

  select * into v_game
  from public.game_sessions as game_row
  where game_row.id = v_request.game_session_id
  for update;
  if not found then
    raise exception 'GAME_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_game.data_purge_protected then
    raise exception 'GAME_PURGE_PROTECTED' using errcode = 'P0001';
  end if;

  select * into v_entitlement
  from public.entitlements as entitlement_row
  where entitlement_row.id = v_request.entitlement_id
    and entitlement_row.game_session_id = v_request.game_session_id
  for update;
  if not found
     or v_entitlement.status <> 'expired'
     or v_entitlement.license_expires_at is null
     or v_entitlement.license_expires_at > v_now
  then
    raise exception 'GAME_LICENSE_NOT_EXPIRED' using errcode = 'P0001';
  end if;

  select digest_row.registry_sha256, digest_row.table_count
  into v_registry_sha, v_registry_count
  from public.get_game_data_purge_registry_digest_v1() as digest_row;
  if v_registry_sha <>
       'ab44a67a1247fd706636c3aeb627f352344ca08bde6b6c7159f686a873612a48'
     or v_registry_count <> 206
  then
    raise exception 'GAME_PURGE_SCHEMA_DRIFT' using errcode = 'P0001';
  end if;

  select digest_row.fk_graph_sha256, digest_row.edge_count
  into v_fk_sha, v_fk_count
  from public.get_game_data_purge_fk_graph_digest_v1() as digest_row;
  if v_fk_sha <>
       '343f1966b3750e7a639fb82059bab1049edd44591e27d59cd08017c19be46198'
     or v_fk_count <> 455
  then
    raise exception 'GAME_PURGE_FK_GRAPH_DRIFT' using errcode = 'P0001';
  end if;

  select digest_row.order_sha256, digest_row.table_count
  into v_order_sha, v_order_count
  from public.get_game_data_purge_delete_order_digest_v1() as digest_row;
  if v_order_sha <>
       'f2fe1c6ad5d11bf7c73e1bd761153e6e6cfa726d9b26f780b62e42eb603667b6'
     or v_order_count <> 205
  then
    raise exception 'GAME_PURGE_DELETE_ORDER_DRIFT' using errcode = 'P0001';
  end if;

  select count(*) into v_cross_refs
  from public.game_feature_activation_evidence as evidence_row
  where evidence_row.source_game_session_id = v_request.game_session_id
    and evidence_row.game_session_id <> v_request.game_session_id;
  if v_cross_refs > 0 then
    raise exception 'GAME_PURGE_CROSS_GAME_REFERENCE_BLOCKED'
      using errcode = 'P0001';
  end if;

  -- Cursor possession is not completion evidence. Recount every registered
  -- target family before deleting the entitlement and game roots.
  for v_target in
    select registry_row.table_schema, registry_row.table_name
    from private.game_data_purge_table_registry as registry_row
    where not (
      registry_row.table_schema = 'public'
      and registry_row.table_name = 'entitlements'
    )
    order by registry_row.table_schema, registry_row.table_name
  loop
    execute format(
      'select count(*) from %I.%I where game_session_id = $1',
      v_target.table_schema,
      v_target.table_name
    ) into v_remaining using v_request.game_session_id;
    if v_remaining <> 0 then
      raise exception 'GAME_PURGE_DATABASE_ROWS_REMAIN:%.%:%',
        v_target.table_schema,
        v_target.table_name,
        v_remaining
        using errcode = 'P0001';
    end if;
  end loop;

  delete from public.entitlements
  where id = v_request.entitlement_id
    and game_session_id = v_request.game_session_id;
  if not found then
    raise exception 'ENTITLEMENT_DELETE_FAILED' using errcode = 'P0001';
  end if;

  delete from public.game_sessions
  where id = v_request.game_session_id;
  if not found then
    raise exception 'GAME_DELETE_FAILED' using errcode = 'P0001';
  end if;

  update private.game_data_purge_requests
  set status = 'completed',
      db_deleted_at = v_now,
      completed_at = v_now,
      db_delete_token_hash = null,
      db_delete_target_schema = null,
      db_delete_target_table = null,
      db_delete_target_position = null,
      last_error = null,
      updated_at = v_now
  where id = p_request_id;

  update private.game_data_purge_control
  set arm_id = null,
      armed_until = null,
      armed_by_staff_user_id = null,
      disarmed_at = v_now,
      updated_at = v_now
  where singleton
    and arm_id = v_request.confirmed_arm_id;

  return jsonb_build_object(
    'requestId', p_request_id,
    'gameSessionId', v_request.game_session_id,
    'status', 'completed',
    'leverDisarmed', true
  );
end;
$function$;

commit;
