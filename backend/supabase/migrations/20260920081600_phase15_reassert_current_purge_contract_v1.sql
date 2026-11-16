-- Phase 15 reasserts the final Phase 14D purge contract after importing the
-- environment-neutral lifecycle reconciliation. This retains the reviewed
-- 20260831232719 preflight response and the 20260918095220 execution/finalizer
-- bodies at a new forward-only identity.

-- Phase 14D fingerprints observed on fresh replay of 55d26fefddf44510d693205886c77b12d1b48c59.
-- Run 35331471197, job 105556554568: 207 registry / 456 FK / 206 order / 207 final cursor.
-- Only schema fingerprints and cursor bounds change; request, entitlement,
-- environment, child-first deletion tokens and physical zero-row proof persist.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';

-- Preserve the current pre-import digest, environment, dispatch, R2-progress,
-- and failure-recovery contracts exactly as reviewed by Phase 11.
create or replace function public.get_game_data_purge_registry_digest_v1()
returns table(registry_sha256 text, table_count bigint)
language sql
stable
security definer
set search_path = pg_catalog, private, extensions
as $function$
  select
    encode(
      extensions.digest(
        string_agg(
          registry_row.table_schema || '.' || registry_row.table_name,
          E'\n' order by registry_row.table_schema, registry_row.table_name
        ),
        'sha256'
      ),
      'hex'
    ),
    count(*)
  from private.game_data_purge_table_registry as registry_row;
$function$;

create or replace function public.get_game_data_purge_delete_order_digest_v1()
returns table(order_sha256 text, table_count bigint)
language sql
stable
security definer
set search_path = pg_catalog, private, extensions
as $function$
  select
    encode(
      extensions.digest(
        string_agg(
          order_row.position || '|' || order_row.table_schema || '.'
            || order_row.table_name || '|' || order_row.dependency_depth,
          E'\n' order by order_row.position
        ),
        'sha256'
      ),
      'hex'
    ),
    count(*)
  from private.game_data_purge_delete_order_v1 as order_row;
$function$;

create or replace function public.get_game_data_purge_fk_graph_digest_v1()
returns table(fk_graph_sha256 text, edge_count bigint)
language sql
stable
security definer
set search_path = pg_catalog, private, extensions
as $function$
with registry as (
  select table_schema, table_name
  from private.game_data_purge_table_registry
), edges as (
  select
    child_namespace.nspname as child_schema,
    child.relname as child_table,
    constraint_row.conname,
    parent_namespace.nspname as parent_schema,
    parent.relname as parent_table,
    constraint_row.confdeltype::text as delete_rule,
    string_agg(
      child_attribute.attname || '->' || parent_attribute.attname,
      ',' order by subscript.i
    ) as column_map
  from pg_catalog.pg_constraint as constraint_row
  join pg_catalog.pg_class as child
    on child.oid = constraint_row.conrelid
  join pg_catalog.pg_namespace as child_namespace
    on child_namespace.oid = child.relnamespace
  join pg_catalog.pg_class as parent
    on parent.oid = constraint_row.confrelid
  join pg_catalog.pg_namespace as parent_namespace
    on parent_namespace.oid = parent.relnamespace
  join lateral generate_subscripts(constraint_row.conkey, 1) as subscript(i)
    on true
  join pg_catalog.pg_attribute as child_attribute
    on child_attribute.attrelid = constraint_row.conrelid
   and child_attribute.attnum = constraint_row.conkey[subscript.i]
  join pg_catalog.pg_attribute as parent_attribute
    on parent_attribute.attrelid = constraint_row.confrelid
   and parent_attribute.attnum = constraint_row.confkey[subscript.i]
  where constraint_row.contype = 'f'
    and child_namespace.nspname in ('public', 'private')
    and exists (
      select 1
      from registry as registry_row
      where registry_row.table_schema = parent_namespace.nspname
        and registry_row.table_name = parent.relname
    )
  group by
    child_namespace.nspname,
    child.relname,
    constraint_row.conname,
    parent_namespace.nspname,
    parent.relname,
    constraint_row.confdeltype
)
select
  encode(
    extensions.digest(
      string_agg(
        child_schema || '.' || child_table || '|' || conname || '|'
          || parent_schema || '.' || parent_table || '|' || delete_rule
          || '|' || column_map,
        E'\n' order by child_schema, child_table, conname
      ),
      'sha256'
    ),
    'hex'
  ),
  count(*)
from edges;
$function$;

create or replace function public.configure_game_data_purge_environment_v1(
  p_environment_name text,
  p_r2_bucket_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_environment text := lower(btrim(coalesce(p_environment_name, '')));
  v_bucket text := btrim(coalesce(p_r2_bucket_name, ''));
begin
  if v_environment not in ('production', 'staging') then
    raise exception 'INVALID_GAME_PURGE_ENVIRONMENT' using errcode = '22023';
  end if;
  if length(v_bucket) = 0 then
    raise exception 'GAME_PURGE_R2_BUCKET_REQUIRED' using errcode = '22023';
  end if;

  perform 1
  from private.game_data_purge_control as control_row
  where control_row.singleton
  for update;
  if not found then
    raise exception 'GAME_PURGE_CONTROL_NOT_FOUND' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from private.game_data_purge_requests as request_row
    where request_row.status in ('r2_deleting', 'r2_deleted', 'db_deleting')
  ) then
    raise exception 'GAME_PURGE_EXECUTION_IN_PROGRESS'
      using errcode = 'P0001';
  end if;

  update private.game_data_purge_control
  set environment_name = v_environment,
      r2_bucket_name = v_bucket,
      arm_id = null,
      armed_until = null,
      armed_by_staff_user_id = null,
      disarmed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where singleton;

  return jsonb_build_object(
    'environment', v_environment,
    'r2Bucket', v_bucket,
    'leverArmed', false
  );
end;
$function$;

-- The dispatcher may claim work only after the destructive R2 namespace has
-- been configured. The Edge worker separately compares these exact values to
-- its runtime environment and bucket before constructing an S3 client.
create or replace function public.claim_confirmed_game_data_purge_v1()
returns table (
  request_id uuid,
  game_session_id uuid,
  stage text
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_request private.game_data_purge_requests%rowtype;
  v_control private.game_data_purge_control%rowtype;
  v_now timestamptz := clock_timestamp();
  v_cross_refs bigint;
begin
  select * into v_control
  from private.game_data_purge_control as control_row
  where control_row.singleton
  for update;
  if not found
     or v_control.environment_name is null
     or v_control.r2_bucket_name is null
     or v_control.arm_id is null
     or v_control.armed_until is null
     or v_control.armed_until <= v_now
  then
    return;
  end if;

  select * into v_request
  from private.game_data_purge_requests as request_row
  where request_row.status in ('confirmed', 'r2_deleted')
    and request_row.confirmed_arm_id = v_control.arm_id
    and request_row.purge_not_before is not null
    and request_row.purge_not_before <= v_now
  order by request_row.confirmed_at nulls last, request_row.created_at
  for update skip locked
  limit 1;
  if not found then
    return;
  end if;
  if not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = v_request.game_session_id
      and not game_row.data_purge_protected
  ) then
    return;
  end if;
  if v_request.status = 'confirmed' or v_request.db_delete_cursor = 0 then
    if not exists (
      select 1
      from public.entitlements as entitlement_row
      where entitlement_row.id = v_request.entitlement_id
        and entitlement_row.game_session_id = v_request.game_session_id
        and entitlement_row.status = 'expired'
        and entitlement_row.license_expires_at <= v_now
    ) then
      return;
    end if;
  end if;

  select count(*) into v_cross_refs
  from public.game_feature_activation_evidence as evidence_row
  where evidence_row.source_game_session_id = v_request.game_session_id
    and evidence_row.game_session_id <> v_request.game_session_id;
  if v_cross_refs > 0 then
    update private.game_data_purge_requests
    set last_error = 'cross_game_reference_blocked',
        updated_at = v_now
    where id = v_request.id;
    return;
  end if;

  request_id := v_request.id;
  game_session_id := v_request.game_session_id;
  if v_request.status = 'confirmed' then
    update private.game_data_purge_requests
    set status = 'r2_deleting',
        attempt_count = attempt_count + 1,
        last_attempt_at = v_now,
        updated_at = v_now
    where id = v_request.id;
    stage := 'r2';
  else
    if v_request.r2_prefix is distinct from
         v_control.environment_name || '/game_session='
           || v_request.game_session_id::text || '/'
    then
      raise exception 'GAME_PURGE_R2_BINDING_MISMATCH'
        using errcode = 'P0001';
    end if;
    update private.game_data_purge_requests
    set status = 'db_deleting',
        db_started_at = coalesce(db_started_at, v_now),
        attempt_count = attempt_count + 1,
        last_attempt_at = v_now,
        updated_at = v_now
    where id = v_request.id;
    stage := 'db';
  end if;
  return next;
end;
$function$;

create or replace function public.record_game_data_purge_r2_progress_v1(
  p_request_id uuid,
  p_r2_prefix text,
  p_deleted_objects bigint,
  p_deleted_bytes bigint,
  p_complete boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_control private.game_data_purge_control%rowtype;
  v_request private.game_data_purge_requests%rowtype;
  v_status text;
  v_now timestamptz := clock_timestamp();
  v_expected_prefix text;
begin
  if p_deleted_objects is null
     or p_deleted_objects < 0
     or p_deleted_bytes is null
     or p_deleted_bytes < 0
     or p_complete is null
  then
    raise exception 'INVALID_PURGE_PROGRESS' using errcode = '22023';
  end if;

  select * into v_control
  from private.game_data_purge_control as control_row
  where control_row.singleton
  for update;
  select * into v_request
  from private.game_data_purge_requests as request_row
  where request_row.id = p_request_id
  for update;
  if not found or v_request.status <> 'r2_deleting' then
    raise exception 'PURGE_REQUEST_STAGE_CONFLICT' using errcode = 'P0001';
  end if;
  if v_control.environment_name is null
     or v_control.r2_bucket_name is null
     or v_control.arm_id is null
     or v_control.armed_until is null
     or v_control.armed_until <= v_now
     or v_control.arm_id <> v_request.confirmed_arm_id
  then
    raise exception 'GAME_PURGE_R2_BINDING_MISMATCH'
      using errcode = 'P0001';
  end if;
  v_expected_prefix := v_control.environment_name || '/game_session='
    || v_request.game_session_id::text || '/';
  if p_r2_prefix is distinct from v_expected_prefix then
    raise exception 'GAME_PURGE_R2_BINDING_MISMATCH'
      using errcode = 'P0001';
  end if;

  v_status := case when p_complete then 'r2_deleted' else 'confirmed' end;
  update private.game_data_purge_requests
  set status = v_status,
      r2_prefix = v_expected_prefix,
      r2_deleted_objects = r2_deleted_objects + p_deleted_objects,
      r2_deleted_bytes = r2_deleted_bytes + p_deleted_bytes,
      r2_deleted_at = case when p_complete then v_now else r2_deleted_at end,
      last_error = null,
      updated_at = v_now
  where id = p_request_id;
  return jsonb_build_object(
    'requestId', p_request_id,
    'status', v_status,
    'r2Prefix', v_expected_prefix
  );
end;
$function$;

create or replace function public.record_game_data_purge_failure_v1(
  p_request_id uuid,
  p_stage text,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  if p_stage = 'db' then
    update private.game_data_purge_requests
    set status = 'r2_deleted',
        db_delete_token_hash = null,
        db_delete_target_schema = null,
        db_delete_target_table = null,
        db_delete_target_position = null,
        last_error = left(
          coalesce(p_error, 'unknown database purge failure'),
          1000
        ),
        updated_at = clock_timestamp()
    where id = p_request_id
      and status in ('db_deleting', 'r2_deleted');
  elsif p_stage = 'r2' then
    update private.game_data_purge_requests
    set status = 'confirmed',
        last_error = left(
          coalesce(p_error, 'unknown object purge failure'),
          1000
        ),
        updated_at = clock_timestamp()
    where id = p_request_id
      and status = 'r2_deleting';
  else
    raise exception 'GAME_PURGE_FAILURE_STAGE_INVALID' using errcode = '22023';
  end if;
  return found;
end;
$function$;

create or replace function public.get_game_data_purge_preflight_v1(
  p_request_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_request private.game_data_purge_requests%rowtype;
  v_game public.game_sessions%rowtype;
  v_entitlement public.entitlements%rowtype;
  v_control private.game_data_purge_control%rowtype;
  v_registry_sha text;
  v_registry_count bigint;
  v_fk_sha text;
  v_fk_count bigint;
  v_order_sha text;
  v_order_count bigint;
  v_cross_refs bigint;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_request
  from private.game_data_purge_requests as request_row
  where request_row.id = p_request_id;
  if not found then
    raise exception 'PURGE_REQUEST_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_game
  from public.game_sessions as game_row
  where game_row.id = v_request.game_session_id;

  select * into v_entitlement
  from public.entitlements as entitlement_row
  where entitlement_row.id = v_request.entitlement_id
    and entitlement_row.game_session_id = v_request.game_session_id;

  select * into v_control
  from private.game_data_purge_control as control_row
  where control_row.singleton;

  select digest_row.registry_sha256, digest_row.table_count
  into v_registry_sha, v_registry_count
  from public.get_game_data_purge_registry_digest_v1() as digest_row;

  select digest_row.fk_graph_sha256, digest_row.edge_count
  into v_fk_sha, v_fk_count
  from public.get_game_data_purge_fk_graph_digest_v1() as digest_row;

  select digest_row.order_sha256, digest_row.table_count
  into v_order_sha, v_order_count
  from public.get_game_data_purge_delete_order_digest_v1() as digest_row;

  select count(*) into v_cross_refs
  from public.game_feature_activation_evidence as evidence_row
  where evidence_row.source_game_session_id = v_request.game_session_id
    and evidence_row.game_session_id <> v_request.game_session_id;

  return jsonb_build_object(
    'requestId', v_request.id,
    'gameSessionId', v_request.game_session_id,
    'gameName', v_request.game_name_snapshot,
    'requestStatus', v_request.status,
    'purgeNotBefore', v_request.purge_not_before,
    'licenseExpiresAt', v_request.license_expires_at,
    'gameExists', v_game.id is not null,
    'purgeProtected', coalesce(v_game.data_purge_protected, false),
    'entitlementExpired', coalesce(
      v_entitlement.status = 'expired'
      and v_entitlement.license_expires_at is not null
      and v_entitlement.license_expires_at <= v_now,
      false
    ),
    'leverArmed', coalesce(
      v_control.arm_id is not null
      and v_control.armed_until > v_now,
      false
    ),
    'armMatches', coalesce(
      v_request.confirmed_arm_id = v_control.arm_id,
      false
    ),
    'environmentConfigured', coalesce(
      v_control.environment_name is not null
      and v_control.r2_bucket_name is not null,
      false
    ),
    'environmentName', v_control.environment_name,
    'r2BucketName', v_control.r2_bucket_name,
    'registrySha256', v_registry_sha,
    'registryTableCount', v_registry_count,
    'fkGraphSha256', v_fk_sha,
    'fkGraphEdgeCount', v_fk_count,
    'deleteOrderSha256', v_order_sha,
    'deleteOrderTableCount', v_order_count,
    'crossGameBlockingReferences', v_cross_refs,
    'r2DeletedAt', v_request.r2_deleted_at,
    'dbDeleteCursor', v_request.db_delete_cursor,
    'dbStartedAt', v_request.db_started_at,
    'deletedRows', v_request.db_deleted_rows
  );
end;
$function$;

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
       '7bcda40cfba058b0a712782671ba91cb3c50b29adb1bbe105dfbf84998907ac3'
     or v_registry_count <> 207
  then
    raise exception 'GAME_PURGE_SCHEMA_DRIFT' using errcode = 'P0001';
  end if;

  select digest_row.fk_graph_sha256, digest_row.edge_count
  into v_fk_sha, v_fk_count
  from public.get_game_data_purge_fk_graph_digest_v1() as digest_row;
  if v_fk_sha <>
       'fe88cafd56ca4c21ab3c1d34385e21f4c3d8be201eae44ee7f5539a34a98f329'
     or v_fk_count <> 456
  then
    raise exception 'GAME_PURGE_FK_GRAPH_DRIFT' using errcode = 'P0001';
  end if;

  select digest_row.order_sha256, digest_row.table_count
  into v_order_sha, v_order_count
  from public.get_game_data_purge_delete_order_digest_v1() as digest_row;
  if v_order_sha <>
       '19c4c6bf8e005c53c6dddfadcf63d5c5e955307a63d93b0343f48d73c4504897'
     or v_order_count <> 206
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
  if v_cursor < 0 or v_cursor > 207 then
    raise exception 'GAME_PURGE_DB_CURSOR_INVALID' using errcode = 'P0001';
  end if;

  v_total := coalesce(v_request.db_deleted_rows, '{}'::jsonb);
  if v_cursor < 206 then
    v_end := least(v_cursor + p_batch_size, 206);
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
    v_next := case when v_end = 206 then 207 else v_end end;
  else
    v_next := 207;
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
    'readyToFinalize', v_next = 207,
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
  if v_request.db_delete_cursor <> 207 then
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
       '7bcda40cfba058b0a712782671ba91cb3c50b29adb1bbe105dfbf84998907ac3'
     or v_registry_count <> 207
  then
    raise exception 'GAME_PURGE_SCHEMA_DRIFT' using errcode = 'P0001';
  end if;

  select digest_row.fk_graph_sha256, digest_row.edge_count
  into v_fk_sha, v_fk_count
  from public.get_game_data_purge_fk_graph_digest_v1() as digest_row;
  if v_fk_sha <>
       'fe88cafd56ca4c21ab3c1d34385e21f4c3d8be201eae44ee7f5539a34a98f329'
     or v_fk_count <> 456
  then
    raise exception 'GAME_PURGE_FK_GRAPH_DRIFT' using errcode = 'P0001';
  end if;

  select digest_row.order_sha256, digest_row.table_count
  into v_order_sha, v_order_count
  from public.get_game_data_purge_delete_order_digest_v1() as digest_row;
  if v_order_sha <>
       '19c4c6bf8e005c53c6dddfadcf63d5c5e955307a63d93b0343f48d73c4504897'
     or v_order_count <> 206
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
