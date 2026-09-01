-- Business V2 Phase 11 install-time convergence and security assertions.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Reconcile the stale-stack purge foundation to the Edge contract already
-- retained by this branch. This authors schema only: environment identity,
-- arming, R2 access, scheduling and execution remain externally controlled.
alter table private.game_data_purge_control
  add column if not exists environment_name text,
  add column if not exists r2_bucket_name text;

alter table private.game_data_purge_requests
  add column if not exists db_delete_token_hash text,
  add column if not exists db_delete_target_schema text,
  add column if not exists db_delete_target_table text,
  add column if not exists db_delete_target_position integer;

-- A cursor from an older registry cannot be reinterpreted against this exact
-- head's deterministic 201-table order. Fail closed instead of skipping data.
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

do $purge_control_constraints$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid =
          'private.game_data_purge_control'::regclass
      and constraint_row.conname =
          'game_data_purge_control_environment_name_check'
  ) then
    alter table private.game_data_purge_control
      add constraint game_data_purge_control_environment_name_check
      check (
        environment_name is null
        or environment_name in ('production', 'staging')
      );
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid =
          'private.game_data_purge_control'::regclass
      and constraint_row.conname =
          'game_data_purge_control_r2_bucket_name_check'
  ) then
    alter table private.game_data_purge_control
      add constraint game_data_purge_control_r2_bucket_name_check
      check (
        r2_bucket_name is null
        or length(btrim(r2_bucket_name)) > 0
      );
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid =
          'private.game_data_purge_requests'::regclass
      and constraint_row.conname =
          'game_data_purge_requests_delete_token_shape_check'
  ) then
    alter table private.game_data_purge_requests
      add constraint game_data_purge_requests_delete_token_shape_check
      check (
        (
          db_delete_token_hash is null
          and db_delete_target_schema is null
          and db_delete_target_table is null
          and db_delete_target_position is null
        )
        or (
          db_delete_token_hash ~ '^[0-9a-f]{64}$'
          and db_delete_target_schema in ('public', 'private')
          and length(btrim(db_delete_target_table)) > 0
          and db_delete_target_position > 0
        )
      );
  end if;
end;
$purge_control_constraints$;

-- Withdrawal evidence owns its seller offer, while the offer keeps a nullable
-- pointer to the active withdrawal request. Keeping both links RESTRICT makes
-- an otherwise authorized whole-game deletion impossible. Cascading the
-- evidence row from its owning offer breaks only that deletion cycle; normal
-- offer DELETE remains denied by the request-bound immutable guard installed
-- below.
alter table public.store_offer_withdrawal_requests
  drop constraint if exists store_offer_withdrawal_requests_offer_id_fkey;
alter table public.store_offer_withdrawal_requests
  add constraint store_offer_withdrawal_requests_offer_id_fkey
  foreign key (offer_id)
  references public.store_seller_offers(id)
  on delete cascade;

create table if not exists private.game_data_purge_delete_order_v1 (
  position integer primary key,
  table_schema text not null,
  table_name text not null,
  dependency_depth integer not null,
  unique (table_schema, table_name)
);

alter table private.game_data_purge_delete_order_v1 enable row level security;
alter table private.game_data_purge_delete_order_v1 force row level security;
revoke all on table private.game_data_purge_delete_order_v1
  from public, anon, authenticated, service_role;

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

create or replace function private.is_game_data_purge_delete_authorized_v1(
  p_game_session_id uuid,
  p_table_schema text,
  p_table_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, private, extensions
as $function$
declare
  v_request_setting text := nullif(
    current_setting('app.game_data_purge_request_id', true),
    ''
  );
  v_delete_token text := nullif(
    current_setting('app.game_data_purge_delete_token', true),
    ''
  );
  v_request_id uuid;
begin
  if p_game_session_id is null
     or p_table_schema is null
     or p_table_name is null
     or v_request_setting is null
     or v_delete_token is null
     or v_delete_token !~ '^[0-9a-f]{64}$'
  then
    return false;
  end if;
  begin
    v_request_id := v_request_setting::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (
    select 1
    from private.game_data_purge_requests as request_row
    join private.game_data_purge_control as control_row
      on control_row.singleton
     and control_row.arm_id = request_row.confirmed_arm_id
     and control_row.armed_until > clock_timestamp()
    where request_row.id = v_request_id
      and request_row.game_session_id = p_game_session_id
      and request_row.status = 'db_deleting'
      and request_row.confirmed_at is not null
      and request_row.confirmed_by_staff_user_id is not null
      and request_row.confirmation_hash ~ '^[0-9a-f]{64}$'
      and request_row.r2_deleted_at is not null
      and request_row.purge_not_before is not null
      and request_row.purge_not_before <= clock_timestamp()
      and control_row.environment_name is not null
      and control_row.r2_bucket_name is not null
      and request_row.db_delete_token_hash = encode(
        extensions.digest(v_delete_token, 'sha256'),
        'hex'
      )
      and request_row.db_delete_target_schema = p_table_schema
      and request_row.db_delete_target_table = p_table_name
      and request_row.db_delete_target_position =
          request_row.db_delete_cursor + 1
      and exists (
        select 1
        from private.game_data_purge_delete_order_v1 as order_row
        where order_row.position = request_row.db_delete_target_position
          and order_row.table_schema = p_table_schema
          and order_row.table_name = p_table_name
      )
      and exists (
        select 1
        from public.game_sessions as game_row
        where game_row.id = request_row.game_session_id
          and not game_row.data_purge_protected
      )
      and exists (
        select 1
        from public.entitlements as entitlement_row
        where entitlement_row.id = request_row.entitlement_id
          and entitlement_row.game_session_id = request_row.game_session_id
          and entitlement_row.status = 'expired'
          and entitlement_row.license_expires_at is not null
          and entitlement_row.license_expires_at <= clock_timestamp()
      )
      and not exists (
        select 1
        from public.game_feature_activation_evidence as evidence_row
        where evidence_row.source_game_session_id = request_row.game_session_id
          and evidence_row.game_session_id <> request_row.game_session_id
      )
  );
end;
$function$;

revoke all on function private.is_game_data_purge_delete_authorized_v1(
  uuid, text, text
)
  from public, anon, authenticated, service_role;

-- Seller offers retire through commands and withdrawal state; they are never
-- physically deleted by ordinary runtime authority. This explicit DELETE
-- guard makes the cycle-breaking cascade above safe even for table owners and
-- future SECURITY DEFINER code. Only the exact request/table/position token
-- minted inside the purge batch can remove an offer.
create or replace function private.guard_store_seller_offer_purge_delete_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  if private.is_game_data_purge_delete_authorized_v1(
       old.game_session_id,
       tg_table_schema,
       tg_table_name
     )
  then
    return old;
  end if;
  raise exception 'STORE_SELLER_OFFER_DELETE_RETIRED'
    using errcode = '42501';
end;
$function$;

revoke all on function private.guard_store_seller_offer_purge_delete_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_store_seller_offer_purge_delete_v1
  on public.store_seller_offers;
create trigger guard_store_seller_offer_purge_delete_v1
before delete on public.store_seller_offers
for each row
execute function private.guard_store_seller_offer_purge_delete_v1();
alter table public.store_seller_offers
  enable always trigger guard_store_seller_offer_purge_delete_v1;

-- Some immutable trigger functions are reused by both game-scoped evidence
-- and unscoped canonical tables. Clone only each registered trigger binding
-- before patching so an unscoped table can never inherit a game-purge escape.
do $isolate_shared_purge_guards$
declare
  v_binding record;
  v_clone_name text;
  v_function_definition text;
  v_clone_definition text;
  v_trigger_definition text;
  v_clone_trigger_definition text;
begin
  for v_binding in
    select
      trigger_row.oid as trigger_oid,
      trigger_row.tgname as trigger_name,
      proc_row.oid as function_oid,
      class_row.oid as table_oid,
      namespace_row.nspname as table_schema,
      class_row.relname as table_name
    from pg_catalog.pg_proc as proc_row
    join pg_catalog.pg_trigger as trigger_row
      on trigger_row.tgfoid = proc_row.oid
     and not trigger_row.tgisinternal
    join pg_catalog.pg_class as class_row
      on class_row.oid = trigger_row.tgrelid
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = class_row.relnamespace
    where namespace_row.nspname in ('public', 'private')
      and (trigger_row.tgtype & 8) = 8
      and pg_catalog.pg_get_functiondef(proc_row.oid)
        ilike '%raise exception%'
      and exists (
        select 1
        from private.game_data_purge_table_registry as registry_row
        where registry_row.table_schema = namespace_row.nspname
          and registry_row.table_name = class_row.relname
      )
      and exists (
        select 1
        from pg_catalog.pg_trigger as sibling_trigger
        join pg_catalog.pg_class as sibling_table
          on sibling_table.oid = sibling_trigger.tgrelid
        where sibling_trigger.tgfoid = proc_row.oid
          and not sibling_trigger.tgisinternal
          and not exists (
            select 1
            from pg_catalog.pg_attribute as attribute_row
            where attribute_row.attrelid = sibling_table.oid
              and attribute_row.attname = 'game_session_id'
              and not attribute_row.attisdropped
          )
      )
    order by trigger_row.oid
  loop
    v_clone_name := format(
      'game_purge_guard_%s_%s_v1',
      v_binding.function_oid,
      v_binding.table_oid
    );
    select pg_catalog.pg_get_functiondef(v_binding.function_oid)
    into v_function_definition;
    v_clone_definition := pg_catalog.regexp_replace(
      v_function_definition,
      '^CREATE OR REPLACE FUNCTION [^(]+\(',
      format('CREATE OR REPLACE FUNCTION private.%I(', v_clone_name),
      'i'
    );
    if v_clone_definition = v_function_definition then
      raise exception 'GAME_PURGE_GUARD_CLONE_FAILED:%.%',
        v_binding.table_schema,
        v_binding.table_name;
    end if;
    execute v_clone_definition;
    execute format(
      'revoke all on function private.%I() from public, anon, authenticated, service_role',
      v_clone_name
    );

    select pg_catalog.pg_get_triggerdef(v_binding.trigger_oid, true)
    into v_trigger_definition;
    v_clone_trigger_definition := pg_catalog.regexp_replace(
      v_trigger_definition,
      'EXECUTE FUNCTION [^(]+',
      format('EXECUTE FUNCTION private.%I', v_clone_name),
      'i'
    );
    if v_clone_trigger_definition = v_trigger_definition then
      raise exception 'GAME_PURGE_TRIGGER_REBIND_FAILED:%.%',
        v_binding.table_schema,
        v_binding.table_name;
    end if;

    execute format(
      'drop trigger %I on %I.%I',
      v_binding.trigger_name,
      v_binding.table_schema,
      v_binding.table_name
    );
    execute v_clone_trigger_definition;
  end loop;
end;
$isolate_shared_purge_guards$;

-- Append the request-bound escape only to blocking BEFORE DELETE guards on
-- registered game-scoped tables. CREATE OR REPLACE preserves trigger OIDs and
-- each original guard's search path/volatility while normal writes stay
-- immutable. Fail installation if a shared guard also serves an unscoped table.
do $patch_purge_guards$
declare
  v_guard record;
  v_definition text;
  v_patched text;
begin
  for v_guard in
    select distinct proc_row.oid
    from pg_catalog.pg_proc as proc_row
    join pg_catalog.pg_trigger as trigger_row
      on trigger_row.tgfoid = proc_row.oid
     and not trigger_row.tgisinternal
    join pg_catalog.pg_class as class_row
      on class_row.oid = trigger_row.tgrelid
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = class_row.relnamespace
    where namespace_row.nspname in ('public', 'private')
      and (trigger_row.tgtype & 8) = 8
      and pg_catalog.pg_get_functiondef(proc_row.oid)
        ilike '%raise exception%'
      and exists (
        select 1
        from private.game_data_purge_table_registry as registry_row
        where registry_row.table_schema = namespace_row.nspname
          and registry_row.table_name = class_row.relname
      )
    order by proc_row.oid
  loop
    if exists (
      select 1
      from pg_catalog.pg_trigger as trigger_row
      join pg_catalog.pg_class as class_row
        on class_row.oid = trigger_row.tgrelid
      join pg_catalog.pg_namespace as namespace_row
        on namespace_row.oid = class_row.relnamespace
      where trigger_row.tgfoid = v_guard.oid
        and not trigger_row.tgisinternal
        and not exists (
          select 1
          from pg_catalog.pg_attribute as attribute_row
          where attribute_row.attrelid = class_row.oid
            and attribute_row.attname = 'game_session_id'
            and not attribute_row.attisdropped
        )
    ) then
      raise exception 'GAME_PURGE_SHARED_GUARD_SCOPE_UNSAFE:%', v_guard.oid;
    end if;

    select pg_catalog.pg_get_functiondef(v_guard.oid)
    into v_definition;
    if v_definition like '%is_game_data_purge_delete_authorized_v1%' then
      continue;
    end if;

    v_patched := pg_catalog.regexp_replace(
      v_definition,
      E'\\nbegin\\n',
      E'\nbegin\n  if tg_op = ''DELETE''\n     and private.is_game_data_purge_delete_authorized_v1(\n       old.game_session_id,\n       tg_table_schema,\n       tg_table_name\n     )\n  then\n    return old;\n  end if;\n',
      'i'
    );
    if v_patched = v_definition then
      raise exception 'GAME_PURGE_GUARD_PATCH_FAILED:%', v_guard.oid;
    end if;
    execute v_patched;
  end loop;
end;
$patch_purge_guards$;

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
       '68695d3995661af72de99b01fffe0ed301071f1131e6a8e6b92f03febfedb960'
     or v_registry_count <> 202
  then
    raise exception 'GAME_PURGE_SCHEMA_DRIFT' using errcode = 'P0001';
  end if;

  select digest_row.fk_graph_sha256, digest_row.edge_count
  into v_fk_sha, v_fk_count
  from public.get_game_data_purge_fk_graph_digest_v1() as digest_row;
  if v_fk_sha <>
       '779750e69db0f918d3c54dc47765ac12a04d635bcc32760d529d571fd4041ec0'
     or v_fk_count <> 448
  then
    raise exception 'GAME_PURGE_FK_GRAPH_DRIFT' using errcode = 'P0001';
  end if;

  select digest_row.order_sha256, digest_row.table_count
  into v_order_sha, v_order_count
  from public.get_game_data_purge_delete_order_digest_v1() as digest_row;
  if v_order_sha <>
       'ef50615cdc9e9191b149f45746d639d196aa0cd1eb1d308dfd2fd80ea43a7fa4'
     or v_order_count <> 201
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
  if v_cursor < 0 or v_cursor > 202 then
    raise exception 'GAME_PURGE_DB_CURSOR_INVALID' using errcode = 'P0001';
  end if;

  v_total := coalesce(v_request.db_deleted_rows, '{}'::jsonb);
  if v_cursor < 201 then
    v_end := least(v_cursor + p_batch_size, 201);
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
    v_next := case when v_end = 201 then 202 else v_end end;
  else
    v_next := 202;
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
    'readyToFinalize', v_next = 202,
    'deletedRows', v_batch
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

create or replace function public.record_game_data_purge_db_progress_v1(
  p_request_id uuid,
  p_next_cursor integer,
  p_batch_deleted_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  raise exception 'GAME_PURGE_LEGACY_PROGRESS_AUTHORITY_RETIRED'
    using errcode = 'P0001';
end;
$function$;

create or replace function public.record_game_data_purge_database_complete_v1(
  p_request_id uuid,
  p_deleted_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  raise exception 'GAME_PURGE_LEGACY_PROGRESS_AUTHORITY_RETIRED'
    using errcode = 'P0001';
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
  if v_request.db_delete_cursor <> 202 then
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
       '68695d3995661af72de99b01fffe0ed301071f1131e6a8e6b92f03febfedb960'
     or v_registry_count <> 202
  then
    raise exception 'GAME_PURGE_SCHEMA_DRIFT' using errcode = 'P0001';
  end if;

  select digest_row.fk_graph_sha256, digest_row.edge_count
  into v_fk_sha, v_fk_count
  from public.get_game_data_purge_fk_graph_digest_v1() as digest_row;
  if v_fk_sha <>
       '779750e69db0f918d3c54dc47765ac12a04d635bcc32760d529d571fd4041ec0'
     or v_fk_count <> 448
  then
    raise exception 'GAME_PURGE_FK_GRAPH_DRIFT' using errcode = 'P0001';
  end if;

  select digest_row.order_sha256, digest_row.table_count
  into v_order_sha, v_order_count
  from public.get_game_data_purge_delete_order_digest_v1() as digest_row;
  if v_order_sha <>
       'ef50615cdc9e9191b149f45746d639d196aa0cd1eb1d308dfd2fd80ea43a7fa4'
     or v_order_count <> 201
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

revoke all on function public.configure_game_data_purge_environment_v1(
  text, text
) from public, anon, authenticated, service_role;
revoke all on function public.get_game_data_purge_registry_digest_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.get_game_data_purge_delete_order_digest_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.get_game_data_purge_fk_graph_digest_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.get_game_data_purge_preflight_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_confirmed_game_data_purge_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.execute_game_data_purge_db_batch_v2(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.record_game_data_purge_failure_v1(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_game_data_purge_r2_progress_v1(
  uuid, text, bigint, bigint, boolean
) from public, anon, authenticated, service_role;
revoke all on function public.finalize_game_data_purge_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.record_game_data_purge_db_progress_v1(
  uuid, integer, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.record_game_data_purge_database_complete_v1(
  uuid, jsonb
) from public, anon, authenticated, service_role;

grant execute on function
  public.configure_game_data_purge_environment_v1(text, text),
  public.get_game_data_purge_registry_digest_v1(),
  public.get_game_data_purge_delete_order_digest_v1(),
  public.get_game_data_purge_fk_graph_digest_v1(),
  public.get_game_data_purge_preflight_v1(uuid),
  public.claim_confirmed_game_data_purge_v1(),
  public.execute_game_data_purge_db_batch_v2(uuid, integer),
  public.record_game_data_purge_failure_v1(uuid, text, text),
  public.record_game_data_purge_r2_progress_v1(
    uuid, text, bigint, bigint, boolean
  ),
  public.finalize_game_data_purge_v1(uuid)
to service_role;

do $assertions$
declare
  v_table text;
  v_oid oid;
  v_definition text;
  v_configuration text;
  v_column_default text;
  v_sha text;
  v_count bigint;
begin
  foreach v_table in array array[
    'business_operating_period_policies',
    'business_operating_period_claims',
    'business_gross_receipts_tax_assessments',
    'business_operating_period_store_receipts',
    'business_gross_receipts_tax_payments',
    'business_operating_period_close_receipts'
  ] loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'BUSINESS_STORE_CONVERGENCE_TABLE_MISSING:%', v_table;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_class as class_row
      join pg_catalog.pg_namespace as namespace_row
        on namespace_row.oid = class_row.relnamespace
      where namespace_row.nspname = 'public'
        and class_row.relname = v_table
        and class_row.relkind = 'r'
        and class_row.relrowsecurity
        and class_row.relforcerowsecurity
    ) then
      raise exception 'BUSINESS_STORE_CONVERGENCE_RLS_NOT_FORCED:%', v_table;
    end if;

    if has_table_privilege('anon', 'public.' || v_table, 'SELECT')
       or has_table_privilege('authenticated', 'public.' || v_table, 'SELECT')
       or has_table_privilege(
         'anon', 'public.' || v_table, 'INSERT,UPDATE,DELETE'
       )
       or has_table_privilege(
         'authenticated', 'public.' || v_table, 'INSERT,UPDATE,DELETE'
       )
       or has_table_privilege(
         'service_role', 'public.' || v_table, 'INSERT,UPDATE,DELETE'
       )
       or not has_table_privilege(
         'service_role', 'public.' || v_table, 'SELECT'
       )
    then
      raise exception 'BUSINESS_STORE_CONVERGENCE_PRIVILEGE_INVALID:%',
        v_table;
    end if;

    if not exists (
      select 1
      from private.game_data_purge_table_registry as registry_row
      where registry_row.table_schema = 'public'
        and registry_row.table_name = v_table
    ) then
      raise exception 'BUSINESS_STORE_CONVERGENCE_PURGE_REGISTRY_MISSING:%',
        v_table;
    end if;
  end loop;

  if to_regclass('private.game_data_purge_delete_order_v1') is null
     or not exists (
       select 1
       from pg_catalog.pg_class as class_row
       join pg_catalog.pg_namespace as namespace_row
         on namespace_row.oid = class_row.relnamespace
       where namespace_row.nspname = 'private'
         and class_row.relname = 'game_data_purge_delete_order_v1'
         and class_row.relrowsecurity
         and class_row.relforcerowsecurity
     )
     or has_table_privilege(
       'service_role',
       'private.game_data_purge_delete_order_v1',
       'SELECT,INSERT,UPDATE,DELETE'
     )
  then
    raise exception 'GAME_PURGE_DELETE_ORDER_SECURITY_INVALID';
  end if;

  if not exists (
       select 1
       from information_schema.columns as column_row
       where column_row.table_schema = 'private'
         and column_row.table_name = 'game_data_purge_control'
         and column_row.column_name = 'environment_name'
     )
     or not exists (
       select 1
       from information_schema.columns as column_row
       where column_row.table_schema = 'private'
         and column_row.table_name = 'game_data_purge_control'
         and column_row.column_name = 'r2_bucket_name'
     )
     or (
       select count(*)
       from information_schema.columns as column_row
       where column_row.table_schema = 'private'
         and column_row.table_name = 'game_data_purge_requests'
         and column_row.column_name in (
           'db_delete_token_hash',
           'db_delete_target_schema',
           'db_delete_target_table',
           'db_delete_target_position'
         )
     ) <> 4
  then
    raise exception 'GAME_PURGE_REQUEST_BOUND_SCHEMA_MISSING';
  end if;

  select digest_row.registry_sha256, digest_row.table_count
  into v_sha, v_count
  from public.get_game_data_purge_registry_digest_v1() as digest_row;
  if v_sha <>
       '68695d3995661af72de99b01fffe0ed301071f1131e6a8e6b92f03febfedb960'
     or v_count <> 202
  then
    raise exception 'GAME_PURGE_REGISTRY_FINGERPRINT_INVALID:%:%',
      v_sha, v_count;
  end if;

  select digest_row.fk_graph_sha256, digest_row.edge_count
  into v_sha, v_count
  from public.get_game_data_purge_fk_graph_digest_v1() as digest_row;
  if v_sha <>
       '779750e69db0f918d3c54dc47765ac12a04d635bcc32760d529d571fd4041ec0'
     or v_count <> 448
  then
    raise exception 'GAME_PURGE_FK_FINGERPRINT_INVALID:%:%', v_sha, v_count;
  end if;

  select digest_row.order_sha256, digest_row.table_count
  into v_sha, v_count
  from public.get_game_data_purge_delete_order_digest_v1() as digest_row;
  if v_sha <>
       'ef50615cdc9e9191b149f45746d639d196aa0cd1eb1d308dfd2fd80ea43a7fa4'
     or v_count <> 201
     or (select min(position) from private.game_data_purge_delete_order_v1) <> 1
     or (select max(position) from private.game_data_purge_delete_order_v1) <> 201
  then
    raise exception 'GAME_PURGE_ORDER_FINGERPRINT_INVALID:%:%', v_sha, v_count;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid =
          'public.store_offer_withdrawal_requests'::regclass
      and constraint_row.conname =
          'store_offer_withdrawal_requests_offer_id_fkey'
      and constraint_row.confrelid =
          'public.store_seller_offers'::regclass
      and constraint_row.contype = 'f'
      and constraint_row.confdeltype = 'c'
  ) then
    raise exception 'GAME_PURGE_WITHDRAWAL_DELETE_CYCLE_UNRESOLVED';
  end if;

  if exists (
       select registry_row.table_schema, registry_row.table_name
       from private.game_data_purge_table_registry as registry_row
       where not (
         registry_row.table_schema = 'public'
         and registry_row.table_name = 'entitlements'
       )
       except
       select order_row.table_schema, order_row.table_name
       from private.game_data_purge_delete_order_v1 as order_row
     )
     or exists (
       select order_row.table_schema, order_row.table_name
       from private.game_data_purge_delete_order_v1 as order_row
       except
       select registry_row.table_schema, registry_row.table_name
       from private.game_data_purge_table_registry as registry_row
       where not (
         registry_row.table_schema = 'public'
         and registry_row.table_name = 'entitlements'
       )
     )
  then
    raise exception 'GAME_PURGE_DELETE_ORDER_REGISTRY_SET_INVALID';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as child
      on child.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace as child_namespace
      on child_namespace.oid = child.relnamespace
    join pg_catalog.pg_class as parent
      on parent.oid = constraint_row.confrelid
    join pg_catalog.pg_namespace as parent_namespace
      on parent_namespace.oid = parent.relnamespace
    join private.game_data_purge_delete_order_v1 as child_order
      on child_order.table_schema = child_namespace.nspname
     and child_order.table_name = child.relname
    join private.game_data_purge_delete_order_v1 as parent_order
      on parent_order.table_schema = parent_namespace.nspname
     and parent_order.table_name = parent.relname
    where constraint_row.contype = 'f'
      and not (
        child_namespace.nspname = 'public'
        and child.relname = 'store_offer_withdrawal_requests'
        and constraint_row.conname =
            'store_offer_withdrawal_requests_offer_id_fkey'
      )
      and not (
        constraint_row.conrelid = constraint_row.confrelid
      )
      and child_order.position >= parent_order.position
  ) then
    raise exception 'GAME_PURGE_FK_ORDER_INVALID';
  end if;

  foreach v_oid in array array[
    to_regprocedure(
      'public.configure_game_data_purge_environment_v1(text,text)'
    )::oid,
    to_regprocedure('public.get_game_data_purge_registry_digest_v1()')::oid,
    to_regprocedure(
      'public.get_game_data_purge_delete_order_digest_v1()'
    )::oid,
    to_regprocedure('public.get_game_data_purge_fk_graph_digest_v1()')::oid,
    to_regprocedure('public.get_game_data_purge_preflight_v1(uuid)')::oid,
    to_regprocedure(
      'public.execute_game_data_purge_db_batch_v2(uuid,integer)'
    )::oid,
    to_regprocedure(
      'public.record_game_data_purge_failure_v1(uuid,text,text)'
    )::oid,
    to_regprocedure('public.finalize_game_data_purge_v1(uuid)')::oid
  ] loop
    if v_oid is null
       or has_function_privilege('anon', v_oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_oid, 'EXECUTE')
       or not has_function_privilege('service_role', v_oid, 'EXECUTE')
    then
      raise exception 'GAME_PURGE_EXECUTION_RPC_EXPOSURE_INVALID:%', v_oid;
    end if;
  end loop;

  select
    pg_catalog.pg_get_functiondef(proc_row.oid),
    coalesce(array_to_string(proc_row.proconfig, ','), '')
  into v_definition, v_configuration
  from pg_catalog.pg_proc as proc_row
  where proc_row.oid =
    'public.execute_game_data_purge_db_batch_v2(uuid,integer)'::regprocedure;
  if v_configuration not like
       '%search_path=pg_catalog, public, private, extensions%'
     or v_definition not like '%extensions.gen_random_bytes(32)%'
     or v_definition not like '%db_delete_token_hash%'
     or v_definition not like '%v_request.status <> ''db_deleting''%'
     or v_definition not like '%set status = ''r2_deleted''%'
     or v_definition not like '%v_next = 202%'
     or v_definition not like
       '%ef50615cdc9e9191b149f45746d639d196aa0cd1eb1d308dfd2fd80ea43a7fa4%'
  then
    raise exception 'GAME_PURGE_BATCH_AUTHORITY_INVALID';
  end if;

  select
    pg_catalog.pg_get_functiondef(proc_row.oid),
    coalesce(array_to_string(proc_row.proconfig, ','), '')
  into v_definition, v_configuration
  from pg_catalog.pg_proc as proc_row
  where proc_row.oid =
    'public.finalize_game_data_purge_v1(uuid)'::regprocedure;
  if v_configuration not like
       '%search_path=pg_catalog, public, private, extensions%'
     or v_definition not like '%db_delete_cursor <> 202%'
     or v_definition not like '%GAME_PURGE_DATABASE_ROWS_REMAIN%'
     or v_definition not like '%delete from public.entitlements%'
     or v_definition not like '%delete from public.game_sessions%'
  then
    raise exception 'GAME_PURGE_FINALIZER_AUTHORITY_INVALID';
  end if;

  select pg_catalog.pg_get_functiondef(
    'private.is_game_data_purge_delete_authorized_v1(uuid,text,text)'
      ::regprocedure
  ) into v_definition;
  if v_definition not like '%app.game_data_purge_delete_token%'
     or v_definition not like '%extensions.digest(v_delete_token%'
     or v_definition not like '%db_delete_target_position =%'
     or v_definition not like '%request_row.db_delete_cursor + 1%'
  then
    raise exception 'GAME_PURGE_REQUEST_BOUND_HELPER_INVALID';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as proc_row
    join pg_catalog.pg_trigger as trigger_row
      on trigger_row.tgfoid = proc_row.oid
     and not trigger_row.tgisinternal
    join pg_catalog.pg_class as class_row
      on class_row.oid = trigger_row.tgrelid
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = class_row.relnamespace
    where namespace_row.nspname in ('public', 'private')
      and (trigger_row.tgtype & 8) = 8
      and pg_catalog.pg_get_functiondef(proc_row.oid) ilike '%raise exception%'
      and exists (
        select 1
        from private.game_data_purge_table_registry as registry_row
        where registry_row.table_schema = namespace_row.nspname
          and registry_row.table_name = class_row.relname
      )
      and pg_catalog.pg_get_functiondef(proc_row.oid)
        not like '%is_game_data_purge_delete_authorized_v1%'
  ) then
    raise exception 'GAME_PURGE_BLOCKING_DELETE_GUARD_UNPATCHED';
  end if;

  foreach v_oid in array array[
    'public.record_game_data_purge_db_progress_v1(uuid,integer,jsonb)'
      ::regprocedure::oid,
    'public.record_game_data_purge_database_complete_v1(uuid,jsonb)'
      ::regprocedure::oid
  ] loop
    select pg_catalog.pg_get_functiondef(proc_row.oid)
    into v_definition
    from pg_catalog.pg_proc as proc_row
    where proc_row.oid = v_oid;
    if has_function_privilege('service_role', v_oid, 'EXECUTE')
       or v_definition not like
         '%GAME_PURGE_LEGACY_PROGRESS_AUTHORITY_RETIRED%'
    then
      raise exception 'GAME_PURGE_LEGACY_PROGRESS_AUTHORITY_REMAINS:%', v_oid;
    end if;
  end loop;

  select column_row.column_default
  into v_column_default
  from information_schema.columns as column_row
  where column_row.table_schema = 'public'
    and column_row.table_name = 'store_offer_purchase_receipts'
    and column_row.column_name = 'business_sales_authority_version'
    and column_row.is_nullable = 'NO';
  if not found or v_column_default !~ '(^|[^0-9])1([^0-9]|$)' then
    raise exception 'BUSINESS_STORE_RECEIPT_CUTOVER_DEFAULT_INVALID';
  end if;

  select column_row.column_default
  into v_column_default
  from information_schema.columns as column_row
  where column_row.table_schema = 'public'
    and column_row.table_name = 'store_offer_purchase_receipts'
    and column_row.column_name = 'business_sales_authority_committed_at';
  if not found
     or v_column_default not like '%clock_timestamp()%'
     or not exists (
       select 1
       from pg_catalog.pg_constraint as constraint_row
       where constraint_row.conrelid
         = 'public.store_offer_purchase_receipts'::regclass
         and constraint_row.conname
           = 'store_offer_purchase_receipts_sales_authority_check'
         and pg_catalog.pg_get_constraintdef(constraint_row.oid)
           like '%business_sales_authority_committed_at%'
     )
  then
    raise exception 'BUSINESS_STORE_RECEIPT_COMMIT_BOUNDARY_INVALID';
  end if;

  if not exists (
    select 1
    from information_schema.columns as column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'business_operating_period_claims'
      and column_row.column_name = 'period_started_at'
      and column_row.is_nullable = 'NO'
  ) or not exists (
    select 1
    from information_schema.columns as column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'business_operating_period_claims'
      and column_row.column_name = 'due_at'
      and column_row.is_nullable = 'NO'
  ) or not exists (
    select 1
    from information_schema.columns as column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'business_operating_period_claims'
      and column_row.column_name = 'payroll_clock_version'
      and column_row.is_nullable = 'NO'
  ) then
    raise exception 'BUSINESS_OPERATING_PERIOD_CLAIM_WINDOW_NOT_IMMUTABLE';
  end if;

  foreach v_oid in array array[
    to_regprocedure(
      'public.recover_due_business_payroll_liabilities_v1(integer)'
    )::oid,
    to_regprocedure(
      'public.recover_due_business_tax_liabilities_v1(integer)'
    )::oid,
    to_regprocedure(
      'public.claim_due_business_operating_periods_v1(integer)'
    )::oid,
    to_regprocedure(
      'public.release_business_operating_period_lease_v1(text,uuid,text,text)'
    )::oid,
    to_regprocedure(
      'public.close_claimed_business_operating_period_v1(text,uuid,text)'
    )::oid
  ] loop
    if v_oid is null then
      raise exception 'BUSINESS_OPERATING_PERIOD_WORKER_RPC_MISSING';
    end if;

    select
      pg_catalog.pg_get_functiondef(proc_row.oid),
      coalesce(array_to_string(proc_row.proconfig, ','), '')
    into v_definition, v_configuration
    from pg_catalog.pg_proc as proc_row
    where proc_row.oid = v_oid;

    if has_function_privilege('anon', v_oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_oid, 'EXECUTE')
       or not has_function_privilege('service_role', v_oid, 'EXECUTE')
    then
      raise exception 'BUSINESS_OPERATING_PERIOD_WORKER_RPC_EXPOSURE:%', v_oid;
    end if;
    if v_configuration not like
         '%search_path=pg_catalog, public, private, extensions, pg_temp%'
    then
      raise exception 'BUSINESS_OPERATING_PERIOD_WORKER_SEARCH_PATH:%', v_oid;
    end if;
  end loop;

  select pg_catalog.pg_get_functiondef(
    'private.recover_business_payroll_liability_worker_v1(uuid,timestamptz)'
      ::regprocedure
  ) into v_definition;
  if v_definition not like '%private.ensure_active_business_checking_account_v1%'
     or v_definition not like '%private.active_bank_account_hold_amount_v1%'
     or v_definition not like '%private.post_bank_transaction_v1%'
     or v_definition not like '%business_payroll_recovery_requests%'
     or v_definition not like '%business_payroll_entries%'
     or v_definition not like '%business.payroll.liability-recovered%'
     or v_definition like '%record_business_ledger_entry_v2%'
     or v_definition like '%record_player_ledger_entry%'
  then
    raise exception 'BUSINESS_PAYROLL_RECOVERY_AUTHORITY_INVALID';
  end if;

  if has_table_privilege(
       'service_role',
       'public.business_payroll_recovery_requests',
       'INSERT,UPDATE,DELETE'
     )
     or not exists (
       select 1
       from pg_catalog.pg_trigger as trigger_row
       where trigger_row.tgrelid =
         'public.business_payroll_recovery_requests'::regclass
         and trigger_row.tgname =
           'guard_business_payroll_recovery_evidence_v1'
         and trigger_row.tgenabled = 'A'
         and not trigger_row.tgisinternal
     )
  then
    raise exception 'BUSINESS_PAYROLL_RECOVERY_EVIDENCE_EXPOSED';
  end if;

  select
    proc_row.oid,
    pg_catalog.pg_get_functiondef(proc_row.oid),
    coalesce(array_to_string(proc_row.proconfig, ','), '')
  into v_oid, v_definition, v_configuration
  from pg_catalog.pg_proc as proc_row
  where proc_row.oid = to_regprocedure(
    'private.recover_business_tax_liability_worker_v1(uuid)'
  );
  if not found
     or has_function_privilege('anon', v_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_oid, 'EXECUTE')
     or has_function_privilege('service_role', v_oid, 'EXECUTE')
     or v_configuration not like
       '%search_path=pg_catalog, public, private, extensions, pg_temp%'
     or v_definition not like
       '%private.ensure_active_business_checking_account_v1%'
     or v_definition not like '%private.active_bank_account_hold_amount_v1%'
     or v_definition not like '%private.post_bank_transaction_v1%'
     or v_definition not like '%business_gross_receipts_tax_payments%'
     or v_definition not like '%payment_sequence%'
     or v_definition not like '%business.tax.liability-recovered%'
     or v_definition like '%record_business_ledger_entry_v2%'
     or v_definition like '%record_player_ledger_entry%'
  then
    raise exception 'BUSINESS_TAX_RECOVERY_AUTHORITY_INVALID';
  end if;

  if has_table_privilege(
       'service_role',
       'public.business_gross_receipts_tax_payments',
       'INSERT,UPDATE,DELETE'
     )
     or not exists (
       select 1
       from information_schema.columns as column_row
       where column_row.table_schema = 'public'
         and column_row.table_name = 'business_gross_receipts_tax_payments'
         and column_row.column_name = 'payment_sequence'
         and column_row.is_nullable = 'NO'
     )
     or not exists (
       select 1
       from pg_catalog.pg_constraint as constraint_row
       where constraint_row.conrelid =
         'public.business_gross_receipts_tax_payments'::regclass
         and constraint_row.conname =
           'business_gross_receipts_tax_payments_assessment_sequence_unique'
         and constraint_row.contype = 'u'
     )
     or not exists (
       select 1
       from pg_catalog.pg_trigger as trigger_row
       where trigger_row.tgrelid =
         'public.business_gross_receipts_tax_payments'::regclass
         and trigger_row.tgname =
           'guard_business_gross_receipts_tax_payment_v1'
         and trigger_row.tgenabled = 'A'
         and not trigger_row.tgisinternal
     )
  then
    raise exception 'BUSINESS_TAX_RECOVERY_EVIDENCE_EXPOSED';
  end if;

  select
    proc_row.oid,
    pg_catalog.pg_get_functiondef(proc_row.oid),
    coalesce(array_to_string(proc_row.proconfig, ','), '')
  into v_oid, v_definition, v_configuration
  from pg_catalog.pg_proc as proc_row
  where proc_row.oid = to_regprocedure(
    'public.append_business_operating_period_policy_v1(uuid,integer,numeric,integer,text,text)'
  );
  if not found
     or has_function_privilege('anon', v_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_oid, 'EXECUTE')
     or not has_function_privilege('service_role', v_oid, 'EXECUTE')
     or v_configuration not like
       '%search_path=pg_catalog, public, private, extensions, pg_temp%'
     or v_definition not like '%from public.game_sessions as game_row%'
     or v_definition not like '%for update%'
     or v_definition not like
       '%private.ensure_business_operating_period_policy_v1%'
     or v_definition not like '%v_previous.policy_version + 1%'
     or v_definition not like '%phase11_policy_append%'
     or v_definition not like '%effective_for_periods_opened_at%'
     or v_definition like '%update public.business_payroll_clocks%'
     or v_definition like '%update public.business_operating_period_claims%'
  then
    raise exception 'BUSINESS_OPERATING_PERIOD_POLICY_APPEND_INVALID';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_indexes as index_row
    where index_row.schemaname = 'public'
      and index_row.tablename = 'business_operating_period_policies'
      and index_row.indexname =
        'business_operating_period_policy_append_idempotency_idx'
      and index_row.indexdef like '%UNIQUE INDEX%'
      and index_row.indexdef like '%idempotencyKey%'
  ) then
    raise exception 'BUSINESS_OPERATING_PERIOD_POLICY_APPEND_IDEMPOTENCY_MISSING';
  end if;

  select
    proc_row.oid,
    pg_catalog.pg_get_functiondef(proc_row.oid),
    coalesce(array_to_string(proc_row.proconfig, ','), '')
  into v_oid, v_definition, v_configuration
  from pg_catalog.pg_proc as proc_row
  join pg_catalog.pg_namespace as namespace_row
    on namespace_row.oid = proc_row.pronamespace
  where namespace_row.nspname = 'public'
    and proc_row.proname = 'close_claimed_business_operating_period_v1';

  if v_definition not like '%private.post_bank_transaction_v1%'
     or v_definition not like '%store_offer_purchase_receipts%'
     or v_definition not like '%business_sales_authority_version = 1%'
     or v_definition not like '%array_agg(%'
     or v_definition not like '%v_store_receipt_ids%'
     or v_definition not like '%private.active_bank_account_hold_amount_v1%'
     or v_definition not like '%tax_unpaid%'
     or v_definition not like '%app.business_operating_period_claim_write_v1%'
     or v_definition like '%settle_business_cycle_v1%'
     or v_definition like '%business_inventory%'
  then
    raise exception 'BUSINESS_OPERATING_PERIOD_CLOSE_AUTHORITY_INVALID';
  end if;

  select pg_catalog.pg_get_functiondef(proc_row.oid)
  into v_definition
  from pg_catalog.pg_proc as proc_row
  join pg_catalog.pg_namespace as namespace_row
    on namespace_row.oid = proc_row.pronamespace
  where namespace_row.nspname = 'private'
    and proc_row.proname = 'ensure_business_operating_period_policy_v1';
  if not found
     or v_definition not like '%phase11_lazy_game_default%'
     or v_definition not like '%on conflict (game_session_id, policy_version)%'
     or v_definition not like '%game_row.created_at%'
     or v_definition not like '%v_effective_at%'
  then
    raise exception 'BUSINESS_OPERATING_PERIOD_LAZY_POLICY_INVALID';
  end if;

  select
    proc_row.oid,
    pg_catalog.pg_get_functiondef(proc_row.oid),
    coalesce(array_to_string(proc_row.proconfig, ','), '')
  into v_oid, v_definition, v_configuration
  from pg_catalog.pg_proc as proc_row
  where proc_row.oid =
    'public.transition_business_status_v1(uuid,uuid,text,text,text,text)'
      ::regprocedure;
  if not found
     or has_function_privilege('anon', v_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_oid, 'EXECUTE')
     or not has_function_privilege('service_role', v_oid, 'EXECUTE')
     or v_configuration not like
       '%search_path=pg_catalog, public, private, extensions, pg_temp%'
     or v_definition not like '%ensure_business_payroll_clock_v2%'
     or v_definition not like '%v_now := clock_timestamp();%'
     or v_definition not like '%request_fingerprint%'
     or v_definition not like '%result_failure_count%'
     or v_definition not like '%IDEMPOTENCY_KEY_CONFLICT%'
     or v_definition not like '%BUSINESS_OPERATING_PERIOD_CLOSE_REQUIRED%'
     or v_definition not like '%BUSINESS_OPERATING_PERIOD_CLOSE_PENDING%'
     or v_definition not like '%BUSINESS_OUTSTANDING_PAYROLL_LIABILITY%'
     or v_definition not like '%BUSINESS_OUTSTANDING_TAX_LIABILITY%'
     or v_definition not like '%business_gross_receipts_tax_payments%'
     or v_definition not like '%sum(payment_row.amount_paid)%'
     or v_definition like '%assessment_row.tax_unpaid > 0%'
     or v_definition not like '%business_employees%'
     or v_definition not like '%store_offer_purchase_receipts%'
     or v_definition not like '%business_operating_period_store_receipts%'
  then
    raise exception 'BUSINESS_STATUS_PERIOD_CLOSURE_GUARD_INVALID';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.settle_business_cycle_v1(uuid,text,text,numeric,numeric,numeric,numeric)'
      ::regprocedure
  ) into v_definition;
  if v_definition not like '%BUSINESS_CYCLE_SETTLEMENT_RETIRED%'
     or v_definition like '%insert into public.business_sales%'
  then
    raise exception 'BUSINESS_LEGACY_CYCLE_NOT_RETIRED';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.settle_business_payroll_current_period_v2(uuid,text,text)'
      ::regprocedure
  ) into v_definition;
  if v_definition not like '%BUSINESS_PAYROLL_SETTLEMENT_WORKER_REQUIRED%'
  then
    raise exception 'BUSINESS_LEGACY_PAYROLL_NOT_RETIRED';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.recover_business_payroll_run_v2(uuid,text,text,text)'
      ::regprocedure
  ) into v_definition;
  if v_definition not like '%BUSINESS_PAYROLL_RECOVERY_WORKER_REQUIRED%'
     or v_definition like '%private.post_bank_transaction_v1%'
  then
    raise exception 'BUSINESS_LEGACY_PAYROLL_RECOVERY_NOT_RETIRED';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.business_position_fair_value_v2(uuid,uuid,bigint)'::regprocedure
  ) into v_definition;
  if v_definition not like
       '%BUSINESS_OWNERSHIP_TRANSFER_VALUATION_AUTHORITY_UNAVAILABLE%'
     or v_definition like '%business_entities%'
     or v_definition like '%.valuation%'
  then
    raise exception 'BUSINESS_CACHED_VALUATION_AUTHORITY_REMAINS';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.create_business_ownership_transfer_offer_v2(uuid,uuid,text,text,bigint,numeric,text)'
      ::regprocedure
  ) into v_definition;
  if v_definition not like
       '%BUSINESS_OWNERSHIP_TRANSFER_VALUATION_AUTHORITY_UNAVAILABLE%'
  then
    raise exception 'BUSINESS_TRANSFER_OFFER_CACHED_VALUATION_AUTHORITY_REMAINS';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.create_or_acquire_player_business_v1(uuid,uuid,text,text,text,text,text,numeric,text,text)'
      ::regprocedure
  ) into v_definition;
  if v_definition not like '%BUSINESS_DIRECT_ACQUISITION_RETIRED%'
     or v_definition not like '%0::numeric%'
     or v_definition not like '%request_fingerprint%'
     or v_definition not like '%result_business_key%'
     or v_definition not like '%BUSINESS_ALREADY_OWNED%'
     or v_definition not like '%for update%'
     or v_definition not like '%IDEMPOTENCY_KEY_CONFLICT%'
     or v_definition like '%.valuation%'
  then
    raise exception 'BUSINESS_DIRECT_ACQUISITION_OR_VALUATION_AUTHORITY_REMAINS';
  end if;

  if not exists (
       select 1
       from pg_catalog.pg_trigger as trigger_row
       where trigger_row.tgrelid = 'public.business_entities'::regclass
         and trigger_row.tgname =
           'aa_neutralize_new_business_cached_financials_v1'
         and trigger_row.tgenabled <> 'D'
         and not trigger_row.tgisinternal
     )
     or not exists (
       select 1
       from pg_catalog.pg_trigger as trigger_row
       where trigger_row.tgrelid = 'public.business_entities'::regclass
         and trigger_row.tgname =
           'aa_guard_business_cached_financial_update_v1'
         and trigger_row.tgenabled <> 'D'
         and not trigger_row.tgisinternal
     )
  then
    raise exception 'BUSINESS_CACHED_FINANCIAL_COLUMN_GUARD_MISSING';
  end if;

  if has_table_privilege(
       'service_role', 'public.business_sales', 'INSERT,UPDATE,DELETE'
     )
     or has_table_privilege(
       'service_role',
       'public.business_cycle_settlement_receipts',
       'INSERT,UPDATE,DELETE'
     )
     or not exists (
       select 1
       from pg_catalog.pg_trigger as trigger_row
       where trigger_row.tgrelid = 'public.business_sales'::regclass
         and trigger_row.tgname = 'aa_retire_business_sales_v1'
         and trigger_row.tgenabled <> 'D'
         and not trigger_row.tgisinternal
     )
  then
    raise exception 'BUSINESS_LEGACY_SALES_WRITE_PATH_REMAINS';
  end if;

  -- Preserve the canonical fail-closed invariant for every game-scoped table,
  -- not merely the six tables owned by this tranche.
  if exists (
    select 1
    from information_schema.columns as column_row
    join information_schema.tables as table_row
      on table_row.table_schema = column_row.table_schema
     and table_row.table_name = column_row.table_name
    left join private.game_data_purge_table_registry as registry_row
      on registry_row.table_schema = column_row.table_schema
     and registry_row.table_name = column_row.table_name
    where column_row.column_name = 'game_session_id'
      and column_row.table_schema in ('public', 'private')
      and table_row.table_type = 'BASE TABLE'
      and column_row.table_name <> 'game_sessions'
      and column_row.table_name not in (
        'game_data_purge_requests',
        'game_data_purge_table_registry'
      )
      and registry_row.table_name is null
  ) then
    raise exception 'BUSINESS_STORE_CONVERGENCE_PURGE_REGISTRY_INCOMPLETE';
  end if;
end;
$assertions$;

commit;
