begin;

create or replace function public.bump_staff_permission_version_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_staff_user_id uuid;
  v_reason text;
begin
  v_reason := case
    when tg_op = 'DELETE' then old.reason
    else new.reason
  end;

  if tg_op = 'INSERT'
    and v_reason in (
      'default_game_admin_v2',
      'default_security_operator_v2',
      'security_convergence_backfill_v2'
    ) then
    return new;
  end if;

  v_staff_user_id := case
    when tg_op = 'DELETE' then old.staff_user_id
    else new.staff_user_id
  end;

  update public.staff_users
  set
    permission_version = permission_version + 1,
    updated_at = clock_timestamp()
  where id = v_staff_user_id;

  return case
    when tg_op = 'DELETE' then old
    else new
  end;
end;
$$;

revoke all on function public.bump_staff_permission_version_v2()
  from public, anon, authenticated;
grant execute on function public.bump_staff_permission_version_v2()
  to service_role;

comment on function public.bump_staff_permission_version_v2() is
  'Invalidates Staff authorization after non-default grant changes while preserving the initial permission version established during audited default seeding.';

commit;
