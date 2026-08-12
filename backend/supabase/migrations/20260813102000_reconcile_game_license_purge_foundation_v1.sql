-- Environment-neutral foundation for license expiration and hard-confirmed game purge.
-- The destructive lever is always disarmed by this migration. Environment/bucket
-- identity is configured separately with configure_game_data_purge_environment_v1.

alter table public.purchase_codes
  add column if not exists license_duration_days integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.purchase_codes'::regclass
      and conname = 'purchase_codes_license_duration_days_check'
  ) then
    alter table public.purchase_codes
      add constraint purchase_codes_license_duration_days_check
      check (license_duration_days is null or license_duration_days between 1 and 3650);
  end if;
end;
$$;

alter table public.entitlements add column if not exists license_expires_at timestamptz;
alter table public.entitlements add column if not exists expired_at timestamptz;
alter table public.game_sessions add column if not exists license_expired_at timestamptz;
alter table public.game_sessions
  add column if not exists data_purge_protected boolean not null default false;

alter table public.staff_permission_grants
  drop constraint if exists staff_permission_grants_permission_check;
alter table public.staff_permission_grants
  add constraint staff_permission_grants_permission_check
  check (permission = any (array[
    'account.read'::text,
    'audit.read'::text,
    'attendance.manage'::text,
    'business.manage'::text,
    'contracts.manage'::text,
    'economy.adjust'::text,
    'game.create'::text,
    'game.read'::text,
    'game.switch'::text,
    'game.update'::text,
    'game.purge'::text,
    'inventory.redeem'::text,
    'market.manage'::text,
    'marketplace.moderate'::text,
    'messaging.moderate'::text,
    'players.manage'::text,
    'progression.review'::text,
    'settings.manage'::text,
    'store.manage'::text,
    'world.manage'::text
  ]));

create table if not exists private.game_data_purge_control (
  singleton boolean primary key default true check (singleton),
  armed_until timestamptz,
  armed_by_staff_user_id uuid,
  armed_at timestamptz,
  disarmed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  arm_id uuid,
  environment_name text check (
    environment_name is null or environment_name in ('production', 'staging')
  ),
  r2_bucket_name text check (
    r2_bucket_name is null or length(btrim(r2_bucket_name)) > 0
  )
);

create table if not exists private.game_data_purge_requests (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null,
  game_name_snapshot text not null,
  entitlement_id uuid not null,
  license_expires_at timestamptz not null,
  status text not null default 'eligible'
    check (status = any (array[
      'eligible',
      'awaiting_confirmation',
      'confirmed',
      'r2_deleting',
      'r2_deleted',
      'db_deleting',
      'completed',
      'cancelled',
      'failed'
    ]::text[])),
  confirmation_hash text
    check (confirmation_hash is null or confirmation_hash ~ '^[0-9a-f]{64}$'),
  confirmation_issued_at timestamptz,
  confirmation_not_before timestamptz,
  confirmation_expires_at timestamptz,
  confirmed_by_staff_user_id uuid,
  confirmed_at timestamptz,
  cancelled_by_staff_user_id uuid,
  cancelled_at timestamptz,
  r2_prefix text,
  r2_deleted_objects bigint not null default 0 check (r2_deleted_objects >= 0),
  r2_deleted_bytes bigint not null default 0 check (r2_deleted_bytes >= 0),
  r2_deleted_at timestamptz,
  db_deleted_rows jsonb not null default '{}'::jsonb
    check (jsonb_typeof(db_deleted_rows) = 'object'),
  db_deleted_at timestamptz,
  completed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  purge_not_before timestamptz,
  confirmed_arm_id uuid,
  db_delete_cursor integer not null default 0 check (db_delete_cursor >= 0),
  db_started_at timestamptz,
  review_manifest jsonb,
  review_sha256 text,
  review_generated_at timestamptz
);

create unique index if not exists game_data_purge_requests_one_open_per_game_idx
  on private.game_data_purge_requests(game_session_id)
  where status <> all (array['completed', 'cancelled', 'failed']::text[]);
create index if not exists game_data_purge_requests_status_created_idx
  on private.game_data_purge_requests(status, created_at);

create table if not exists private.game_data_purge_table_registry (
  table_schema text not null
    check (table_schema = any (array['public', 'private']::text[])),
  table_name text not null check (table_name <> 'game_sessions'),
  registered_at timestamptz not null default clock_timestamp(),
  primary key (table_schema, table_name)
);

create table if not exists private.game_data_purge_delete_order_v1 (
  position integer primary key,
  table_schema text not null,
  table_name text not null,
  dependency_depth integer not null,
  unique (table_schema, table_name)
);

alter table private.game_data_purge_control enable row level security;
alter table private.game_data_purge_control force row level security;
alter table private.game_data_purge_requests enable row level security;
alter table private.game_data_purge_requests force row level security;
alter table private.game_data_purge_table_registry enable row level security;
alter table private.game_data_purge_table_registry force row level security;

revoke all on private.game_data_purge_control
  from public, anon, authenticated, service_role;
revoke all on private.game_data_purge_requests
  from public, anon, authenticated, service_role;
revoke all on private.game_data_purge_table_registry
  from public, anon, authenticated, service_role;
revoke all on private.game_data_purge_delete_order_v1
  from public, anon, authenticated, service_role;
grant select on private.game_data_purge_control to service_role;
grant select on private.game_data_purge_requests to service_role;
grant select on private.game_data_purge_table_registry to service_role;

insert into private.game_data_purge_control (
  singleton,
  environment_name,
  r2_bucket_name,
  arm_id,
  armed_until,
  armed_by_staff_user_id,
  disarmed_at
) values (
  true,
  null,
  null,
  null,
  null,
  null,
  clock_timestamp()
)
on conflict (singleton) do update set
  arm_id = null,
  armed_until = null,
  armed_by_staff_user_id = null,
  disarmed_at = clock_timestamp(),
  updated_at = clock_timestamp();

truncate table private.game_data_purge_table_registry;
insert into private.game_data_purge_table_registry(table_schema, table_name)
select table_schema, table_name
from information_schema.columns
where column_name = 'game_session_id'
  and table_schema in ('public', 'private')
  and table_name <> 'game_sessions'
  and not (
    table_schema = 'private'
    and table_name = 'game_data_purge_requests'
  )
group by table_schema, table_name
order by table_schema, table_name;

truncate table private.game_data_purge_delete_order_v1;
insert into private.game_data_purge_delete_order_v1 (
  position,
  table_schema,
  table_name,
  dependency_depth
)
with recursive registry as (
  select table_name::text collate "C" as table_name
  from private.game_data_purge_table_registry
  where table_schema = 'public'
    and table_name <> 'entitlements'
), edges as (
  select
    child.relname::text collate "C" as child_table,
    parent.relname::text collate "C" as parent_table
  from pg_constraint constraint_row
  join pg_class child on child.oid = constraint_row.conrelid
  join pg_namespace child_namespace on child_namespace.oid = child.relnamespace
  join pg_class parent on parent.oid = constraint_row.confrelid
  join pg_namespace parent_namespace on parent_namespace.oid = parent.relnamespace
  where constraint_row.contype = 'f'
    and child_namespace.nspname = 'public'
    and parent_namespace.nspname = 'public'
    and exists (
      select 1 from registry item where item.table_name = child.relname::text collate "C"
    )
    and exists (
      select 1 from registry item where item.table_name = parent.relname::text collate "C"
    )
), walk(root, node, depth, path) as (
  select table_name, table_name, 0, array[table_name]
  from registry
  union all
  select
    walk.root,
    edge.parent_table,
    walk.depth + 1,
    walk.path || edge.parent_table
  from walk
  join edges edge on edge.child_table = walk.node
  where not edge.parent_table = any (walk.path)
    and walk.depth < 50
), ranked as (
  select root as table_name, max(depth)::integer as dependency_depth
  from walk
  group by root
), generated as (
  select
    row_number() over (
      order by dependency_depth desc, table_name
    )::integer as position,
    'public'::text as table_schema,
    table_name,
    dependency_depth
  from ranked
)
select position, table_schema, table_name, dependency_depth
from generated
order by position;

update public.game_sessions game_row
set data_purge_protected = true,
    updated_at = clock_timestamp()
where game_row.name = '[SYSTEM] Econovaria Canonical Source'
  and exists (
    select 1
    from public.staff_users staff_row
    where staff_row.id = game_row.owner_staff_user_id
      and lower(staff_row.email) = 'canonical-source@econovaria.internal'
  );

create or replace function public.configure_game_data_purge_environment_v1(
  p_environment_name text,
  p_r2_bucket_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
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
$$;

revoke all on function public.configure_game_data_purge_environment_v1(text, text)
  from public, anon, authenticated;
grant execute on function public.configure_game_data_purge_environment_v1(text, text)
  to service_role;
