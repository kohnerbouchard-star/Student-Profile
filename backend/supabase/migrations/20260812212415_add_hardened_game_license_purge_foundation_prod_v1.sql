alter table public.purchase_codes add column if not exists license_duration_days integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.purchase_codes'::regclass and conname='purchase_codes_license_duration_days_check') then
    alter table public.purchase_codes add constraint purchase_codes_license_duration_days_check check (license_duration_days is null or license_duration_days between 1 and 3650);
  end if;
end $$;

alter table public.entitlements add column if not exists license_expires_at timestamptz;
alter table public.entitlements add column if not exists expired_at timestamptz;
alter table public.game_sessions add column if not exists license_expired_at timestamptz;
alter table public.game_sessions add column if not exists data_purge_protected boolean not null default false;

alter table public.staff_permission_grants drop constraint if exists staff_permission_grants_permission_check;
alter table public.staff_permission_grants add constraint staff_permission_grants_permission_check check (permission = any (array[
  'account.read'::text,'audit.read'::text,'attendance.manage'::text,'business.manage'::text,'contracts.manage'::text,'economy.adjust'::text,
  'game.create'::text,'game.read'::text,'game.switch'::text,'game.update'::text,'game.purge'::text,'inventory.redeem'::text,'market.manage'::text,
  'marketplace.moderate'::text,'messaging.moderate'::text,'players.manage'::text,'progression.review'::text,'settings.manage'::text,'store.manage'::text,'world.manage'::text
]));

create table if not exists private.game_data_purge_control (
  singleton boolean primary key default true check (singleton),
  armed_until timestamptz,
  armed_by_staff_user_id uuid,
  armed_at timestamptz,
  disarmed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  arm_id uuid,
  environment_name text,
  r2_bucket_name text
);

create table if not exists private.game_data_purge_requests (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null,
  game_name_snapshot text not null,
  entitlement_id uuid not null,
  license_expires_at timestamptz not null,
  status text not null default 'eligible' check (status = any(array['eligible','awaiting_confirmation','confirmed','r2_deleting','r2_deleted','db_deleting','completed','cancelled','failed']::text[])),
  confirmation_hash text check (confirmation_hash is null or confirmation_hash ~ '^[0-9a-f]{64}$'),
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
  db_deleted_rows jsonb not null default '{}'::jsonb check (jsonb_typeof(db_deleted_rows)='object'),
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
create unique index if not exists game_data_purge_requests_one_open_per_game_idx on private.game_data_purge_requests(game_session_id) where status <> all(array['completed','cancelled','failed']::text[]);
create index if not exists game_data_purge_requests_status_created_idx on private.game_data_purge_requests(status,created_at);

create table if not exists private.game_data_purge_table_registry (
  table_schema text not null check (table_schema = any(array['public','private']::text[])),
  table_name text not null check (table_name <> 'game_sessions'),
  registered_at timestamptz not null default clock_timestamp(),
  primary key (table_schema,table_name)
);

create table if not exists private.game_data_purge_delete_order_v1 (
  position integer primary key,
  table_schema text not null,
  table_name text not null,
  dependency_depth integer not null,
  unique(table_schema,table_name)
);

alter table private.game_data_purge_control enable row level security;
alter table private.game_data_purge_control force row level security;
alter table private.game_data_purge_requests enable row level security;
alter table private.game_data_purge_requests force row level security;
alter table private.game_data_purge_table_registry enable row level security;
alter table private.game_data_purge_table_registry force row level security;
revoke all on private.game_data_purge_control from public,anon,authenticated,service_role;
revoke all on private.game_data_purge_requests from public,anon,authenticated,service_role;
revoke all on private.game_data_purge_table_registry from public,anon,authenticated,service_role;
revoke all on private.game_data_purge_delete_order_v1 from public,anon,authenticated,service_role;
grant select on private.game_data_purge_control to service_role;
grant select on private.game_data_purge_requests to service_role;
grant select on private.game_data_purge_table_registry to service_role;

insert into private.game_data_purge_control(singleton,environment_name,r2_bucket_name,arm_id,armed_until,armed_by_staff_user_id,disarmed_at)
values(true,'production','econovaria-stock-history',null,null,null,clock_timestamp())
on conflict(singleton) do update set environment_name=excluded.environment_name,r2_bucket_name=excluded.r2_bucket_name,arm_id=null,armed_until=null,armed_by_staff_user_id=null,disarmed_at=clock_timestamp(),updated_at=clock_timestamp();

truncate table private.game_data_purge_table_registry;
insert into private.game_data_purge_table_registry(table_schema,table_name)
select table_schema,table_name
from information_schema.columns
where column_name='game_session_id'
  and table_schema in ('public','private')
  and table_name<>'game_sessions'
  and not (table_schema='private' and table_name='game_data_purge_requests')
group by table_schema,table_name
order by table_schema,table_name;

truncate table private.game_data_purge_delete_order_v1;
insert into private.game_data_purge_delete_order_v1(position,table_schema,table_name,dependency_depth)
with recursive reg as (
  select table_schema,table_name collate "C" as table_name from private.game_data_purge_table_registry where table_schema='public' and table_name<>'entitlements'
), edges as (
  select child.relname::text collate "C" child_table,parent.relname::text collate "C" parent_table
  from pg_constraint c
  join pg_class child on child.oid=c.conrelid join pg_namespace nc on nc.oid=child.relnamespace
  join pg_class parent on parent.oid=c.confrelid join pg_namespace np on np.oid=parent.relnamespace
  where c.contype='f' and nc.nspname='public' and np.nspname='public'
    and exists(select 1 from reg r where r.table_name=child.relname::text collate "C")
    and exists(select 1 from reg r where r.table_name=parent.relname::text collate "C")
), walk(root,node,depth,path) as (
  select r.table_name,r.table_name,0,array[r.table_name] from reg r
  union all
  select w.root,e.parent_table,w.depth+1,w.path||e.parent_table
  from walk w join edges e on e.child_table=w.node
  where not e.parent_table=any(w.path) and w.depth<50
), ranked as (
  select root table_name,max(depth)::int dependency_depth from walk group by root
), generated as (
  select row_number() over(order by dependency_depth desc,table_name)::int position,'public'::text table_schema,table_name,dependency_depth from ranked
)
select position,table_schema,table_name,dependency_depth from generated order by position;

update public.game_sessions g set data_purge_protected=true,updated_at=clock_timestamp()
where g.name='[SYSTEM] Econovaria Canonical Source'
  and exists(select 1 from public.staff_users s where s.id=g.owner_staff_user_id and lower(s.email)='canonical-source@econovaria.internal');

insert into public.staff_permission_grants(staff_user_id,permission,granted_at,granted_by_staff_user_id,reason)
select s.id,'game.purge',clock_timestamp(),s.id,'Dedicated platform-level authority for hard-confirmed game data purge'
from public.staff_users s where lower(s.email)='kohnerbouchard@gmail.com' and s.status='active' and s.role='game_admin'
on conflict(staff_user_id,permission) do nothing;