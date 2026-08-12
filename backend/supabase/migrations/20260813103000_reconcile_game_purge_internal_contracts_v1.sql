-- Deterministic review, schema fingerprints and resumable database deletion.
-- Fingerprints include Story replay-safety tables present on current main:
--   registry: 135 tables
--   FK graph: 216 edges
--   direct delete order: 131 tables

create or replace function private.assert_game_purge_authority_v1(
  p_staff_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
    from public.staff_users staff_row
    join public.staff_permission_grants grant_row
      on grant_row.staff_user_id = staff_row.id
     and grant_row.permission = 'game.purge'
    where staff_row.id = p_staff_user_id
      and staff_row.status = 'active'
      and staff_row.role = 'game_admin'
  ) then
    raise exception 'GAME_PURGE_AUTHORITY_REQUIRED' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function private.assert_game_purge_authority_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.apply_entitlement_license_expiration_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_days integer;
begin
  if new.license_expires_at is null then
    select purchase_code.license_duration_days
      into v_days
    from public.purchase_codes purchase_code
    where purchase_code.id = new.purchase_code_id;

    if v_days is not null then
      new.license_expires_at := coalesce(new.created_at, clock_timestamp())
        + make_interval(days => v_days);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.apply_entitlement_license_expiration_v1()
  from public, anon, authenticated, service_role;
drop trigger if exists entitlements_apply_license_term_v1 on public.entitlements;
drop trigger if exists entitlements_apply_license_expiration_v1 on public.entitlements;
create trigger entitlements_apply_license_expiration_v1
before insert or update of purchase_code_id, license_expires_at
on public.entitlements
for each row
execute function private.apply_entitlement_license_expiration_v1();

create or replace function public.get_game_data_purge_registry_digest_v1()
returns table(registry_sha256 text, table_count bigint)
language sql
stable
security definer
set search_path = pg_catalog, private, extensions
as $$
  select
    encode(
      extensions.digest(
        string_agg(table_schema || '.' || table_name, E'\n'
          order by table_schema, table_name),
        'sha256'
      ),
      'hex'
    ),
    count(*)
  from private.game_data_purge_table_registry;
$$;

create or replace function public.get_game_data_purge_delete_order_digest_v1()
returns table(order_sha256 text, table_count bigint)
language sql
stable
security definer
set search_path = pg_catalog, private, extensions
as $$
  select
    encode(
      extensions.digest(
        string_agg(
          position || '|' || table_schema || '.' || table_name || '|' || dependency_depth,
          E'\n' order by position
        ),
        'sha256'
      ),
      'hex'
    ),
    count(*)
  from private.game_data_purge_delete_order_v1;
$$;

create or replace function public.get_game_data_purge_fk_graph_digest_v1()
returns table(fk_graph_sha256 text, edge_count bigint)
language sql
stable
security definer
set search_path = pg_catalog, private, extensions
as $$
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
  from pg_constraint constraint_row
  join pg_class child on child.oid = constraint_row.conrelid
  join pg_namespace child_namespace on child_namespace.oid = child.relnamespace
  join pg_class parent on parent.oid = constraint_row.confrelid
  join pg_namespace parent_namespace on parent_namespace.oid = parent.relnamespace
  join lateral generate_subscripts(constraint_row.conkey, 1) subscript(i) on true
  join pg_attribute child_attribute
    on child_attribute.attrelid = constraint_row.conrelid
   and child_attribute.attnum = constraint_row.conkey[subscript.i]
  join pg_attribute parent_attribute
    on parent_attribute.attrelid = constraint_row.confrelid
   and parent_attribute.attnum = constraint_row.confkey[subscript.i]
  where constraint_row.contype = 'f'
    and child_namespace.nspname in ('public', 'private')
    and exists (
      select 1
      from registry registry_row
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
        || parent_schema || '.' || parent_table || '|' || delete_rule || '|'
        || column_map,
        E'\n' order by child_schema, child_table, conname
      ),
      'sha256'
    ),
    'hex'
  ),
  count(*)
from edges;
$$;

create or replace function private.build_game_data_purge_review_v2(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_request private.game_data_purge_requests%rowtype;
  v_game public.game_sessions%rowtype;
  v_entitlement public.entitlements%rowtype;
  v_control private.game_data_purge_control%rowtype;
  v_row record;
  v_count bigint;
  v_direct jsonb := '[]'::jsonb;
  v_private jsonb := '[]'::jsonb;
  v_indirect jsonb := '[]'::jsonb;
  v_blockers jsonb;
  v_block_feature bigint := 0;
  v_block_inputs bigint := 0;
  v_block_outputs bigint := 0;
  v_registry jsonb;
  v_fk jsonb;
  v_order jsonb;
begin
  select * into v_request
  from private.game_data_purge_requests
  where id = p_request_id;
  if not found then
    raise exception 'PURGE_REQUEST_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_game
  from public.game_sessions
  where id = v_request.game_session_id;
  if not found then
    raise exception 'GAME_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_entitlement
  from public.entitlements
  where id = v_request.entitlement_id
    and game_session_id = v_request.game_session_id;
  if not found then
    raise exception 'GAME_ENTITLEMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_control
  from private.game_data_purge_control
  where singleton;

  if v_control.environment_name is null or v_control.r2_bucket_name is null then
    raise exception 'GAME_PURGE_ENVIRONMENT_NOT_CONFIGURED' using errcode = 'P0001';
  end if;

  for v_row in
    select position, table_schema, table_name, dependency_depth
    from private.game_data_purge_delete_order_v1
    order by position
  loop
    execute format(
      'select count(*) from %I.%I where game_session_id=$1',
      v_row.table_schema,
      v_row.table_name
    ) into v_count using v_request.game_session_id;

    v_direct := v_direct || jsonb_build_array(jsonb_build_object(
      'order', v_row.position,
      'table', v_row.table_schema || '.' || v_row.table_name,
      'rows', v_count,
      'mode', 'direct_batch',
      'dependencyDepth', v_row.dependency_depth
    ));
  end loop;

  for v_row in
    select table_schema, table_name
    from private.game_data_purge_table_registry
    where table_schema = 'private'
    order by table_name
  loop
    execute format(
      'select count(*) from %I.%I where game_session_id=$1',
      v_row.table_schema,
      v_row.table_name
    ) into v_count using v_request.game_session_id;

    v_private := v_private || jsonb_build_array(jsonb_build_object(
      'table', v_row.table_schema || '.' || v_row.table_name,
      'rows', v_count,
      'mode', 'root_cascade'
    ));
  end loop;

  select count(*) into v_count
  from public.crafting_job_inputs input_row
  join public.crafting_jobs job_row on job_row.id = input_row.job_id
  where job_row.game_session_id = v_request.game_session_id;
  v_indirect := v_indirect || jsonb_build_array(jsonb_build_object(
    'table', 'public.crafting_job_inputs',
    'rows', v_count,
    'mode', 'parent_cascade',
    'parent', 'public.crafting_jobs'
  ));

  select count(*) into v_count
  from public.crafting_job_outputs output_row
  join public.crafting_jobs job_row on job_row.id = output_row.job_id
  where job_row.game_session_id = v_request.game_session_id;
  v_indirect := v_indirect || jsonb_build_array(jsonb_build_object(
    'table', 'public.crafting_job_outputs',
    'rows', v_count,
    'mode', 'parent_cascade',
    'parent', 'public.crafting_jobs'
  ));

  select count(*) into v_count
  from public.seed_content_release_members member_row
  join public.seed_content_releases release_row on release_row.id = member_row.release_id
  where release_row.game_session_id = v_request.game_session_id;
  v_indirect := v_indirect || jsonb_build_array(jsonb_build_object(
    'table', 'public.seed_content_release_members',
    'rows', v_count,
    'mode', 'parent_cascade',
    'parent', 'public.seed_content_releases'
  ));

  select count(*) into v_block_feature
  from public.game_feature_activation_evidence evidence_row
  where evidence_row.source_game_session_id = v_request.game_session_id
    and evidence_row.game_session_id <> v_request.game_session_id;

  select count(*) into v_block_inputs
  from public.crafting_job_inputs input_row
  join public.crafting_jobs job_row on job_row.id = input_row.job_id
  join public.inventory_reservations reservation_row
    on reservation_row.id = input_row.reservation_id
  where (
    job_row.game_session_id = v_request.game_session_id
    and reservation_row.game_session_id <> v_request.game_session_id
  ) or (
    reservation_row.game_session_id = v_request.game_session_id
    and job_row.game_session_id <> v_request.game_session_id
  );

  select count(*) into v_block_outputs
  from public.crafting_job_outputs output_row
  join public.crafting_jobs job_row on job_row.id = output_row.job_id
  left join public.game_items game_item on game_item.id = output_row.game_item_id
  left join public.store_items store_item on store_item.id = output_row.store_item_id
  where (
    job_row.game_session_id = v_request.game_session_id
    and (
      coalesce(game_item.game_session_id, v_request.game_session_id)
        <> v_request.game_session_id
      or coalesce(store_item.game_session_id, v_request.game_session_id)
        <> v_request.game_session_id
    )
  ) or (
    job_row.game_session_id <> v_request.game_session_id
    and (
      game_item.game_session_id = v_request.game_session_id
      or store_item.game_session_id = v_request.game_session_id
    )
  );

  v_blockers := jsonb_build_object(
    'crossGameFeatureEvidence', v_block_feature,
    'craftingInputs', v_block_inputs,
    'craftingOutputs', v_block_outputs,
    'total', v_block_feature + v_block_inputs + v_block_outputs
  );

  select to_jsonb(result_row) into v_registry
  from public.get_game_data_purge_registry_digest_v1() result_row;
  select to_jsonb(result_row) into v_fk
  from public.get_game_data_purge_fk_graph_digest_v1() result_row;
  select to_jsonb(result_row) into v_order
  from public.get_game_data_purge_delete_order_digest_v1() result_row;

  return jsonb_build_object(
    'version', 'game-data-purge-review-v2',
    'requestId', v_request.id,
    'gameSessionId', v_request.game_session_id,
    'gameName', v_request.game_name_snapshot,
    'licenseExpiresAt', v_request.license_expires_at,
    'purgeNotBefore', v_request.purge_not_before,
    'environment', v_control.environment_name,
    'r2', jsonb_build_object(
      'bucket', v_control.r2_bucket_name,
      'prefix', v_control.environment_name || '/game_session='
        || v_request.game_session_id::text || '/'
    ),
    'schema', jsonb_build_object(
      'registry', v_registry,
      'foreignKeyGraph', v_fk,
      'deleteOrder', v_order
    ),
    'directDeleteOrder', v_direct,
    'finalizer', jsonb_build_array(
      jsonb_build_object(
        'order', 132,
        'table', 'public.entitlements',
        'rows', (
          select count(*)
          from public.entitlements
          where id = v_request.entitlement_id
            and game_session_id = v_request.game_session_id
        ),
        'mode', 'atomic_finalizer'
      ),
      jsonb_build_object(
        'order', 133,
        'table', 'private game-scoped tables',
        'rows', (
          select coalesce(sum((item->>'rows')::bigint), 0)
          from jsonb_array_elements(v_private) item
        ),
        'mode', 'root_cascade',
        'tables', v_private
      ),
      jsonb_build_object(
        'order', 134,
        'table', 'public.game_sessions',
        'rows', (
          select count(*)
          from public.game_sessions
          where id = v_request.game_session_id
        ),
        'mode', 'atomic_finalizer'
      )
    ),
    'indirectCascades', v_indirect,
    'integrityBlockers', v_blockers,
    'preservedSharedCanonical', jsonb_build_array(
      'public.stock_templates',
      'public.contract_templates',
      'public.country_profiles',
      'public.currencies',
      'public.storylines',
      'public.storyline_events',
      'public.physical_economy_content_packs',
      'public.physical_economy_item_definitions',
      'public.physical_economy_recipe_definitions',
      'public.physical_economy_recipe_inputs',
      'public.progression_skill_definitions',
      'public.progression_achievement_definitions',
      'public.difficulty_policy_profiles',
      'public.arrival_class_grant_definitions',
      'public.arrival_package_runtime_definitions'
    )
  );
end;
$$;

revoke all on function private.build_game_data_purge_review_v2(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.get_game_data_purge_review_v2(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_manifest jsonb;
  v_hash text;
begin
  v_manifest := private.build_game_data_purge_review_v2(p_request_id);
  v_hash := encode(extensions.digest(v_manifest::text, 'sha256'), 'hex');
  return v_manifest || jsonb_build_object('reviewSha256', v_hash);
end;
$$;

create or replace function public.get_game_data_purge_preflight_v1(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_request private.game_data_purge_requests%rowtype;
  v_game public.game_sessions%rowtype;
  v_entitlement public.entitlements%rowtype;
  v_control private.game_data_purge_control%rowtype;
  v_registry_sha text;
  v_registry_count bigint;
  v_fk_sha text;
  v_edge_count bigint;
  v_order_sha text;
  v_order_count bigint;
  v_cross_refs bigint;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_request
  from private.game_data_purge_requests
  where id = p_request_id;
  if not found then
    raise exception 'PURGE_REQUEST_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_game
  from public.game_sessions
  where id = v_request.game_session_id;
  select * into v_entitlement
  from public.entitlements
  where id = v_request.entitlement_id
    and game_session_id = v_request.game_session_id;
  select * into v_control
  from private.game_data_purge_control
  where singleton;

  select registry_sha256, table_count
    into v_registry_sha, v_registry_count
  from public.get_game_data_purge_registry_digest_v1();
  select fk_graph_sha256, edge_count
    into v_fk_sha, v_edge_count
  from public.get_game_data_purge_fk_graph_digest_v1();
  select order_sha256, table_count
    into v_order_sha, v_order_count
  from public.get_game_data_purge_delete_order_digest_v1();

  select count(*) into v_cross_refs
  from public.game_feature_activation_evidence evidence_row
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
      and v_entitlement.license_expires_at <= v_now,
      false
    ),
    'leverArmed', coalesce(
      v_control.arm_id is not null
      and v_control.armed_until > v_now,
      false
    ),
    'armMatches', coalesce(v_request.confirmed_arm_id = v_control.arm_id, false),
    'environmentConfigured', coalesce(
      v_control.environment_name is not null
      and v_control.r2_bucket_name is not null,
      false
    ),
    'registrySha256', v_registry_sha,
    'registryTableCount', v_registry_count,
    'fkGraphSha256', v_fk_sha,
    'fkGraphEdgeCount', v_edge_count,
    'deleteOrderSha256', v_order_sha,
    'deleteOrderTableCount', v_order_count,
    'crossGameBlockingReferences', v_cross_refs,
    'r2DeletedAt', v_request.r2_deleted_at,
    'dbDeleteCursor', v_request.db_delete_cursor,
    'dbStartedAt', v_request.db_started_at,
    'deletedRows', v_request.db_deleted_rows
  );
end;
$$;

create or replace function public.execute_game_data_purge_db_batch_v2(
  p_request_id uuid,
  p_batch_size integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_request private.game_data_purge_requests%rowtype;
  v_game public.game_sessions%rowtype;
  v_entitlement public.entitlements%rowtype;
  v_control private.game_data_purge_control%rowtype;
  v_now timestamptz := clock_timestamp();
  v_registry_sha text;
  v_registry_count bigint;
  v_fk_sha text;
  v_edge_count bigint;
  v_order_sha text;
  v_order_count bigint;
  v_cross_refs bigint;
  v_cursor integer;
  v_end integer;
  v_next integer;
  v_row record;
  v_deleted bigint;
  v_batch jsonb := '{}'::jsonb;
  v_total jsonb;
begin
  if p_request_id is null or p_batch_size is null
     or p_batch_size < 1 or p_batch_size > 20 then
    raise exception 'GAME_PURGE_DB_BATCH_INVALID' using errcode = '22023';
  end if;

  select * into v_request
  from private.game_data_purge_requests
  where id = p_request_id
  for update;
  if not found or v_request.status not in ('r2_deleted', 'db_deleting') then
    raise exception 'PURGE_REQUEST_NOT_READY_FOR_DATABASE' using errcode = 'P0001';
  end if;
  if v_request.confirmed_at is null
     or v_request.confirmed_arm_id is null
     or v_request.r2_deleted_at is null
     or v_request.purge_not_before > v_now then
    raise exception 'GAME_PURGE_DATABASE_GATES_NOT_MET' using errcode = 'P0001';
  end if;

  select * into v_control
  from private.game_data_purge_control
  where singleton
  for update;
  if v_control.environment_name is null or v_control.r2_bucket_name is null then
    raise exception 'GAME_PURGE_ENVIRONMENT_NOT_CONFIGURED' using errcode = 'P0001';
  end if;
  if v_control.arm_id is null
     or v_control.armed_until is null
     or v_control.armed_until <= v_now
     or v_control.arm_id <> v_request.confirmed_arm_id then
    raise exception 'GAME_DATA_PURGE_LEVER_NOT_ARMED_FOR_REQUEST' using errcode = 'P0001';
  end if;

  select * into v_game
  from public.game_sessions
  where id = v_request.game_session_id
  for update;
  if not found then
    raise exception 'GAME_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_game.data_purge_protected then
    raise exception 'GAME_PURGE_PROTECTED' using errcode = 'P0001';
  end if;

  select * into v_entitlement
  from public.entitlements
  where id = v_request.entitlement_id
    and game_session_id = v_request.game_session_id
  for update;
  if not found or v_entitlement.status <> 'expired'
     or v_entitlement.license_expires_at is null
     or v_entitlement.license_expires_at > v_now then
    raise exception 'GAME_LICENSE_NOT_EXPIRED' using errcode = 'P0001';
  end if;

  select registry_sha256, table_count
    into v_registry_sha, v_registry_count
  from public.get_game_data_purge_registry_digest_v1();
  if v_registry_sha <> '6eb63825741b7118bc5acdc2ecef45101e7963b502ee3b0daf2b5f05a33d3f31'
     or v_registry_count <> 135 then
    raise exception 'GAME_PURGE_SCHEMA_DRIFT' using errcode = 'P0001';
  end if;

  select fk_graph_sha256, edge_count
    into v_fk_sha, v_edge_count
  from public.get_game_data_purge_fk_graph_digest_v1();
  if v_fk_sha <> '0f48f84c8fd0e71f2cbbfba90f2ded8bba0e6b0a8842e92add335dabb4314840'
     or v_edge_count <> 216 then
    raise exception 'GAME_PURGE_FK_GRAPH_DRIFT' using errcode = 'P0001';
  end if;

  select order_sha256, table_count
    into v_order_sha, v_order_count
  from public.get_game_data_purge_delete_order_digest_v1();
  if v_order_sha <> '8c60cbaf1ad690cfaf1f360148fb36035ec6492e232c8d8fc3d642961ecf4a0a'
     or v_order_count <> 131 then
    raise exception 'GAME_PURGE_DELETE_ORDER_DRIFT' using errcode = 'P0001';
  end if;

  select count(*) into v_cross_refs
  from public.game_feature_activation_evidence evidence_row
  where evidence_row.source_game_session_id = v_request.game_session_id
    and evidence_row.game_session_id <> v_request.game_session_id;
  if v_cross_refs > 0 then
    raise exception 'GAME_PURGE_CROSS_GAME_REFERENCE_BLOCKED' using errcode = 'P0001';
  end if;

  v_cursor := greatest(0, coalesce(v_request.db_delete_cursor, 0));
  if v_cursor > 132 then
    raise exception 'GAME_PURGE_DB_CURSOR_INVALID' using errcode = 'P0001';
  end if;
  if v_cursor >= 132 then
    return jsonb_build_object(
      'requestId', p_request_id,
      'gameSessionId', v_request.game_session_id,
      'cursor', 132,
      'readyToFinalize', true,
      'deletedRows', '{}'::jsonb
    );
  end if;
  if v_cursor = 131 then
    update private.game_data_purge_requests
    set status = 'db_deleting',
        db_delete_cursor = 132,
        db_started_at = coalesce(db_started_at, v_now),
        last_error = null,
        updated_at = v_now
    where id = p_request_id;
    return jsonb_build_object(
      'requestId', p_request_id,
      'gameSessionId', v_request.game_session_id,
      'cursor', 132,
      'readyToFinalize', true,
      'deletedRows', '{}'::jsonb
    );
  end if;

  v_end := least(v_cursor + p_batch_size, 131);
  for v_row in
    select position, table_schema, table_name
    from private.game_data_purge_delete_order_v1
    where position > v_cursor and position <= v_end
    order by position
  loop
    execute format(
      'delete from %I.%I where game_session_id=$1',
      v_row.table_schema,
      v_row.table_name
    ) using v_request.game_session_id;
    get diagnostics v_deleted = row_count;
    v_batch := v_batch || jsonb_build_object(
      v_row.table_schema || '.' || v_row.table_name,
      v_deleted
    );
  end loop;

  v_next := case when v_end >= 131 then 132 else v_end end;
  v_total := coalesce(v_request.db_deleted_rows, '{}'::jsonb) || v_batch;
  update private.game_data_purge_requests
  set status = 'db_deleting',
      db_delete_cursor = v_next,
      db_started_at = coalesce(db_started_at, v_now),
      db_deleted_rows = v_total,
      last_error = null,
      updated_at = v_now
  where id = p_request_id;

  return jsonb_build_object(
    'requestId', p_request_id,
    'gameSessionId', v_request.game_session_id,
    'cursor', v_next,
    'readyToFinalize', v_next >= 132,
    'deletedRows', v_batch
  );
end;
$$;

create or replace function public.record_game_data_purge_failure_v1(
  p_request_id uuid,
  p_stage text,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  update private.game_data_purge_requests
  set status = case when p_stage = 'db' then 'r2_deleted' else 'confirmed' end,
      last_error = left(coalesce(p_error, 'unknown purge failure'), 1000),
      updated_at = clock_timestamp()
  where id = p_request_id
    and status in ('r2_deleting', 'db_deleting');
  return found;
end;
$$;

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
as $$
declare
  v_status text;
begin
  if p_deleted_objects < 0 or p_deleted_bytes < 0
     or p_r2_prefix is null or length(p_r2_prefix) < 10 then
    raise exception 'INVALID_PURGE_PROGRESS' using errcode = '22023';
  end if;

  v_status := case when p_complete then 'r2_deleted' else 'confirmed' end;
  update private.game_data_purge_requests
  set status = v_status,
      r2_prefix = p_r2_prefix,
      r2_deleted_objects = r2_deleted_objects + p_deleted_objects,
      r2_deleted_bytes = r2_deleted_bytes + p_deleted_bytes,
      r2_deleted_at = case when p_complete then clock_timestamp() else r2_deleted_at end,
      last_error = null,
      updated_at = clock_timestamp()
  where id = p_request_id
    and status = 'r2_deleting';
  if not found then
    raise exception 'PURGE_REQUEST_STAGE_CONFLICT' using errcode = 'P0001';
  end if;

  return jsonb_build_object('requestId', p_request_id, 'status', v_status);
end;
$$;

create or replace function public.finalize_game_data_purge_v1(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_request private.game_data_purge_requests%rowtype;
  v_game public.game_sessions%rowtype;
  v_entitlement public.entitlements%rowtype;
  v_control private.game_data_purge_control%rowtype;
  v_registry_sha text;
  v_registry_count bigint;
  v_fk_sha text;
  v_edge_count bigint;
  v_order_sha text;
  v_order_count bigint;
  v_cross_refs bigint;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_request
  from private.game_data_purge_requests
  where id = p_request_id
  for update;
  if not found or v_request.status not in ('r2_deleted', 'db_deleting') then
    raise exception 'PURGE_REQUEST_NOT_READY_TO_FINALIZE' using errcode = 'P0001';
  end if;
  if v_request.db_delete_cursor < 132 then
    raise exception 'GAME_PURGE_DATABASE_NOT_COMPLETE' using errcode = 'P0001';
  end if;
  if v_request.r2_deleted_at is null then
    raise exception 'R2_DELETE_NOT_VERIFIED' using errcode = 'P0001';
  end if;
  if v_request.purge_not_before > v_now then
    raise exception 'GAME_PURGE_GRACE_PERIOD_ACTIVE' using errcode = 'P0001';
  end if;

  select * into v_control
  from private.game_data_purge_control
  where singleton
  for update;
  if v_control.arm_id is null
     or v_control.armed_until is null
     or v_control.armed_until <= v_now
     or v_control.arm_id <> v_request.confirmed_arm_id then
    raise exception 'GAME_DATA_PURGE_LEVER_NOT_ARMED_FOR_REQUEST' using errcode = 'P0001';
  end if;

  select registry_sha256, table_count
    into v_registry_sha, v_registry_count
  from public.get_game_data_purge_registry_digest_v1();
  if v_registry_sha <> '6eb63825741b7118bc5acdc2ecef45101e7963b502ee3b0daf2b5f05a33d3f31'
     or v_registry_count <> 135 then
    raise exception 'GAME_PURGE_SCHEMA_DRIFT' using errcode = 'P0001';
  end if;

  select fk_graph_sha256, edge_count
    into v_fk_sha, v_edge_count
  from public.get_game_data_purge_fk_graph_digest_v1();
  if v_fk_sha <> '0f48f84c8fd0e71f2cbbfba90f2ded8bba0e6b0a8842e92add335dabb4314840'
     or v_edge_count <> 216 then
    raise exception 'GAME_PURGE_FK_GRAPH_DRIFT' using errcode = 'P0001';
  end if;

  select order_sha256, table_count
    into v_order_sha, v_order_count
  from public.get_game_data_purge_delete_order_digest_v1();
  if v_order_sha <> '8c60cbaf1ad690cfaf1f360148fb36035ec6492e232c8d8fc3d642961ecf4a0a'
     or v_order_count <> 131 then
    raise exception 'GAME_PURGE_DELETE_ORDER_DRIFT' using errcode = 'P0001';
  end if;

  select * into v_game
  from public.game_sessions
  where id = v_request.game_session_id
  for update;
  if not found then
    raise exception 'GAME_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_game.data_purge_protected then
    raise exception 'GAME_PURGE_PROTECTED' using errcode = 'P0001';
  end if;

  select * into v_entitlement
  from public.entitlements
  where id = v_request.entitlement_id
    and game_session_id = v_request.game_session_id
  for update;
  if not found or v_entitlement.status <> 'expired'
     or v_entitlement.license_expires_at is null
     or v_entitlement.license_expires_at > v_now then
    raise exception 'GAME_LICENSE_NOT_EXPIRED' using errcode = 'P0001';
  end if;

  select count(*) into v_cross_refs
  from public.game_feature_activation_evidence evidence_row
  where evidence_row.source_game_session_id = v_request.game_session_id
    and evidence_row.game_session_id <> v_request.game_session_id;
  if v_cross_refs > 0 then
    raise exception 'GAME_PURGE_CROSS_GAME_REFERENCE_BLOCKED' using errcode = 'P0001';
  end if;

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
$$;

revoke all on function public.get_game_data_purge_registry_digest_v1()
  from public, anon, authenticated;
revoke all on function public.get_game_data_purge_delete_order_digest_v1()
  from public, anon, authenticated;
revoke all on function public.get_game_data_purge_fk_graph_digest_v1()
  from public, anon, authenticated;
revoke all on function public.get_game_data_purge_review_v2(uuid)
  from public, anon, authenticated;
revoke all on function public.get_game_data_purge_preflight_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.execute_game_data_purge_db_batch_v2(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.record_game_data_purge_failure_v1(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.record_game_data_purge_r2_progress_v1(
  uuid, text, bigint, bigint, boolean
) from public, anon, authenticated;
revoke all on function public.finalize_game_data_purge_v1(uuid)
  from public, anon, authenticated;

grant execute on function public.get_game_data_purge_registry_digest_v1(),
  public.get_game_data_purge_delete_order_digest_v1(),
  public.get_game_data_purge_fk_graph_digest_v1(),
  public.get_game_data_purge_review_v2(uuid),
  public.get_game_data_purge_preflight_v1(uuid),
  public.execute_game_data_purge_db_batch_v2(uuid, integer),
  public.record_game_data_purge_failure_v1(uuid, text, text),
  public.record_game_data_purge_r2_progress_v1(uuid, text, bigint, bigint, boolean),
  public.finalize_game_data_purge_v1(uuid)
to service_role;
