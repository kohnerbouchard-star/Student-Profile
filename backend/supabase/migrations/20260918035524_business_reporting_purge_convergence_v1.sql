-- Phase 14A accounting tables join the deterministic, child-first game purge.
-- Cursor reconciliation preserves the existing request-bound deletion contract.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
do $purge_cursor_reconciliation$
begin
  if exists (
    select 1
    from private.game_data_purge_requests as request_row
    where request_row.status not in ('completed', 'cancelled', 'failed')
      and request_row.db_delete_cursor <> 0
  ) then
    raise exception 'GAME_PURGE_CURSOR_RECONCILIATION_REQUIRED'
      using errcode = 'P0001';
  end if;
end;
$purge_cursor_reconciliation$;

truncate table private.game_data_purge_table_registry;
insert into private.game_data_purge_table_registry (
  table_schema,
  table_name
)
select
  column_row.table_schema,
  column_row.table_name
from information_schema.columns as column_row
where column_row.column_name = 'game_session_id'
  and column_row.table_schema in ('public', 'private')
  and column_row.table_name <> 'game_sessions'
  and not (
    column_row.table_schema = 'private'
    and column_row.table_name = 'game_data_purge_requests'
  )
group by column_row.table_schema, column_row.table_name
order by column_row.table_schema, column_row.table_name;

truncate table private.game_data_purge_delete_order_v1;
insert into private.game_data_purge_delete_order_v1 (
  position,
  table_schema,
  table_name,
  dependency_depth
)
with recursive registry as (
  select
    registry_row.table_schema::text collate "C" as table_schema,
    registry_row.table_name::text collate "C" as table_name
  from private.game_data_purge_table_registry as registry_row
  where not (
    registry_row.table_schema = 'public'
    and registry_row.table_name = 'entitlements'
  )
), edges as (
  select
    child_namespace.nspname::text collate "C" as child_schema,
    child.relname::text collate "C" as child_table,
    parent_namespace.nspname::text collate "C" as parent_schema,
    parent.relname::text collate "C" as parent_table
  from pg_catalog.pg_constraint as constraint_row
  join pg_catalog.pg_class as child
    on child.oid = constraint_row.conrelid
  join pg_catalog.pg_namespace as child_namespace
    on child_namespace.oid = child.relnamespace
  join pg_catalog.pg_class as parent
    on parent.oid = constraint_row.confrelid
  join pg_catalog.pg_namespace as parent_namespace
    on parent_namespace.oid = parent.relnamespace
  where constraint_row.contype = 'f'
    -- This one cascade is the deliberate cycle break documented above. The
    -- request table has no DELETE guard; every other registered FK remains
    -- child-first so a parent cascade cannot run under the wrong table token.
    and not (
      child_namespace.nspname = 'public'
      and child.relname = 'store_offer_withdrawal_requests'
      and constraint_row.conname =
          'store_offer_withdrawal_requests_offer_id_fkey'
    )
    and exists (
      select 1
      from registry as item
      where item.table_schema = child_namespace.nspname::text collate "C"
        and item.table_name = child.relname::text collate "C"
    )
    and exists (
      select 1
      from registry as item
      where item.table_schema = parent_namespace.nspname::text collate "C"
        and item.table_name = parent.relname::text collate "C"
    )
    and not (
      child_namespace.nspname = parent_namespace.nspname
      and child.relname = parent.relname
    )
), walk(
  root_schema,
  root_table,
  node_schema,
  node_table,
  depth,
  path
) as (
  select
    table_schema,
    table_name,
    table_schema,
    table_name,
    0,
    array[table_schema || '.' || table_name]
  from registry
  union all
  select
    walk.root_schema,
    walk.root_table,
    edge.child_schema,
    edge.child_table,
    walk.depth + 1,
    walk.path || (edge.child_schema || '.' || edge.child_table)
  from walk
  join edges as edge
    on edge.parent_schema = walk.node_schema
   and edge.parent_table = walk.node_table
  where not (edge.child_schema || '.' || edge.child_table) = any (walk.path)
    and walk.depth < 250
), ranked as (
  select
    root_schema as table_schema,
    root_table as table_name,
    max(depth)::integer as dependency_depth
  from walk
  group by root_schema, root_table
), generated as (
  select
    row_number() over (
      order by dependency_depth asc, table_schema, table_name
    )::integer as position,
    table_schema,
    table_name,
    dependency_depth
  from ranked
)
select position, table_schema, table_name, dependency_depth
from generated
order by position;


-- Purge removes evidence child-first. Observers must not recreate it while
-- deleting the source rows under the canonical purge table authorization.
create or replace function economy_private.capture_business_inventory_position_v1()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $function$
declare v_at timestamptz := clock_timestamp();
begin
  if tg_op='DELETE' then
    -- Only the canonical request-bound table token permits purge suppression.
    if private.is_game_data_purge_delete_authorized_v1(
      old.game_session_id, tg_table_schema, tg_table_name
    ) then return old; end if;
    if exists(select 1 from public.game_sessions where id=old.game_session_id) then
      perform economy_private.record_business_inventory_position_v1(to_jsonb(old),true,v_at);
    end if;
    return old;
  end if;
  if tg_op='UPDATE' then
    if (old.quantity_owned,old.average_unit_cost,old.cost_currency_code,old.inventory_account_id,old.game_item_id)
      is not distinct from
      (new.quantity_owned,new.average_unit_cost,new.cost_currency_code,new.inventory_account_id,new.game_item_id)
    then return new; end if;
    if (old.cost_currency_code,old.inventory_account_id,old.game_item_id)
      is distinct from (new.cost_currency_code,new.inventory_account_id,new.game_item_id)
    then perform economy_private.record_business_inventory_position_v1(to_jsonb(old),true,v_at); end if;
  end if;
  perform economy_private.record_business_inventory_position_v1(to_jsonb(new),false,v_at);
  return new;
end;
$function$;

create or replace function economy_private.capture_business_loan_position_v1()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $function$
declare v_at timestamptz := clock_timestamp();
begin
  if tg_op='DELETE' then
    -- Only the canonical request-bound table token permits purge suppression.
    if private.is_game_data_purge_delete_authorized_v1(
      old.game_session_id, tg_table_schema, tg_table_name
    ) then return old; end if;
    if exists(select 1 from public.game_sessions where id=old.game_session_id) then
      perform economy_private.record_business_loan_position_v1(to_jsonb(old),true,v_at);
    end if;
    return old;
  end if;
  if tg_op='UPDATE' then
    if (old.business_id,old.currency_code,old.principal_balance,old.accrued_interest)
      is not distinct from (new.business_id,new.currency_code,new.principal_balance,new.accrued_interest)
    then return new; end if;
    if (old.business_id,old.currency_code) is distinct from (new.business_id,new.currency_code) then
      perform economy_private.record_business_loan_position_v1(to_jsonb(old),true,v_at);
    end if;
  end if;
  perform economy_private.record_business_loan_position_v1(to_jsonb(new),false,v_at);
  return new;
end;
$function$;

-- Preserve the complete request, entitlement, environment and table-token
-- contracts. Only the reviewed schema fingerprints and cursor bounds advance.
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
       'd3a0e132271485f7c5edf434021a56a1c1ec3768cb003041d227b4775ceecafe'
     or v_registry_count <> 205
  then
    raise exception 'GAME_PURGE_SCHEMA_DRIFT' using errcode = 'P0001';
  end if;

  select digest_row.fk_graph_sha256, digest_row.edge_count
  into v_fk_sha, v_fk_count
  from public.get_game_data_purge_fk_graph_digest_v1() as digest_row;
  if v_fk_sha <>
       'cb08e151c693cd018fec0fb7fe2a1d700cc34b0f5704c1b4a7bf1c560f2aa6af'
     or v_fk_count <> 452
  then
    raise exception 'GAME_PURGE_FK_GRAPH_DRIFT' using errcode = 'P0001';
  end if;

  select digest_row.order_sha256, digest_row.table_count
  into v_order_sha, v_order_count
  from public.get_game_data_purge_delete_order_digest_v1() as digest_row;
  if v_order_sha <>
       'b04f1ca4956a17a89e9afe29255c467bcb1b071978da35aaef76e85e19c2dbf5'
     or v_order_count <> 204
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
  if v_cursor < 0 or v_cursor > 205 then
    raise exception 'GAME_PURGE_DB_CURSOR_INVALID' using errcode = 'P0001';
  end if;

  v_total := coalesce(v_request.db_deleted_rows, '{}'::jsonb);
  if v_cursor < 204 then
    v_end := least(v_cursor + p_batch_size, 204);
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
    v_next := case when v_end = 204 then 205 else v_end end;
  else
    v_next := 205;
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
    'readyToFinalize', v_next = 205,
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
  if v_request.db_delete_cursor <> 205 then
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
       'd3a0e132271485f7c5edf434021a56a1c1ec3768cb003041d227b4775ceecafe'
     or v_registry_count <> 205
  then
    raise exception 'GAME_PURGE_SCHEMA_DRIFT' using errcode = 'P0001';
  end if;

  select digest_row.fk_graph_sha256, digest_row.edge_count
  into v_fk_sha, v_fk_count
  from public.get_game_data_purge_fk_graph_digest_v1() as digest_row;
  if v_fk_sha <>
       'cb08e151c693cd018fec0fb7fe2a1d700cc34b0f5704c1b4a7bf1c560f2aa6af'
     or v_fk_count <> 452
  then
    raise exception 'GAME_PURGE_FK_GRAPH_DRIFT' using errcode = 'P0001';
  end if;

  select digest_row.order_sha256, digest_row.table_count
  into v_order_sha, v_order_count
  from public.get_game_data_purge_delete_order_digest_v1() as digest_row;
  if v_order_sha <>
       'b04f1ca4956a17a89e9afe29255c467bcb1b071978da35aaef76e85e19c2dbf5'
     or v_order_count <> 204
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
