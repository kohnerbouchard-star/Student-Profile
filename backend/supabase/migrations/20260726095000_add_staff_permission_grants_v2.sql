begin;

create table if not exists public.staff_permission_grants (
  staff_user_id uuid not null
    references public.staff_users(id) on delete cascade,
  permission text not null,
  granted_at timestamptz not null default clock_timestamp(),
  granted_by_staff_user_id uuid null
    references public.staff_users(id) on delete set null,
  reason text null,
  constraint staff_permission_grants_pkey primary key (
    staff_user_id,
    permission
  ),
  constraint staff_permission_grants_permission_check check (
    permission in (
      'account.read',
      'audit.read',
      'attendance.manage',
      'business.manage',
      'contracts.manage',
      'economy.adjust',
      'game.create',
      'game.read',
      'game.switch',
      'game.update',
      'inventory.redeem',
      'market.manage',
      'marketplace.moderate',
      'messaging.moderate',
      'players.manage',
      'progression.review',
      'settings.manage',
      'store.manage',
      'world.manage'
    )
  ),
  constraint staff_permission_grants_reason_check check (
    reason is null or length(btrim(reason)) between 1 and 500
  )
);

create index if not exists staff_permission_grants_permission_idx
  on public.staff_permission_grants (permission, staff_user_id);

alter table public.staff_permission_grants enable row level security;
alter table public.staff_permission_grants force row level security;
revoke all on table public.staff_permission_grants
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.staff_permission_grants
  to service_role;

create or replace function public.default_game_admin_permissions_v2()
returns text[]
language sql
immutable
set search_path = pg_catalog, public
as $$
  select array[
    'account.read',
    'audit.read',
    'attendance.manage',
    'business.manage',
    'contracts.manage',
    'economy.adjust',
    'game.create',
    'game.read',
    'game.switch',
    'game.update',
    'inventory.redeem',
    'market.manage',
    'marketplace.moderate',
    'messaging.moderate',
    'players.manage',
    'progression.review',
    'settings.manage',
    'store.manage',
    'world.manage'
  ]::text[];
$$;

revoke all on function public.default_game_admin_permissions_v2()
  from public, anon, authenticated;
grant execute on function public.default_game_admin_permissions_v2()
  to service_role;

create or replace function public.seed_staff_permission_grants_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.role = 'game_admin' then
    insert into public.staff_permission_grants (
      staff_user_id,
      permission,
      reason
    )
    select
      new.id,
      permission,
      'default_game_admin_v2'
    from unnest(public.default_game_admin_permissions_v2()) as permissions(permission)
    on conflict (staff_user_id, permission) do nothing;
  elsif new.role = 'security_operator' then
    insert into public.staff_permission_grants (
      staff_user_id,
      permission,
      reason
    ) values (
      new.id,
      'audit.read',
      'default_security_operator_v2'
    )
    on conflict (staff_user_id, permission) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.seed_staff_permission_grants_v2()
  from public, anon, authenticated;
grant execute on function public.seed_staff_permission_grants_v2()
  to service_role;

drop trigger if exists staff_users_seed_permissions_v2 on public.staff_users;
create trigger staff_users_seed_permissions_v2
after insert on public.staff_users
for each row execute function public.seed_staff_permission_grants_v2();

insert into public.staff_permission_grants (
  staff_user_id,
  permission,
  reason
)
select
  staff.id,
  permission,
  'security_convergence_backfill_v2'
from public.staff_users as staff
cross join lateral unnest(
  case
    when staff.role = 'game_admin'
      then public.default_game_admin_permissions_v2()
    when staff.role = 'security_operator'
      then array['audit.read']::text[]
    else array[]::text[]
  end
) as permissions(permission)
on conflict (staff_user_id, permission) do nothing;

create or replace function public.bump_staff_permission_version_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_staff_user_id uuid;
begin
  v_staff_user_id := coalesce(new.staff_user_id, old.staff_user_id);
  update public.staff_users
  set
    permission_version = permission_version + 1,
    updated_at = clock_timestamp()
  where id = v_staff_user_id;
  return coalesce(new, old);
end;
$$;

revoke all on function public.bump_staff_permission_version_v2()
  from public, anon, authenticated;
grant execute on function public.bump_staff_permission_version_v2()
  to service_role;

drop trigger if exists staff_permission_grants_version_v2
  on public.staff_permission_grants;
create trigger staff_permission_grants_version_v2
after insert or update or delete on public.staff_permission_grants
for each row execute function public.bump_staff_permission_version_v2();

comment on table public.staff_permission_grants is
  'Server-controlled least-privilege Staff grants. The browser cannot read or mutate this table directly.';
comment on column public.staff_permission_grants.permission is
  'Reviewed Admin capability required by the route authorization map.';
comment on function public.bump_staff_permission_version_v2() is
  'Invalidates existing Staff authorization assumptions whenever a grant changes.';

commit;
