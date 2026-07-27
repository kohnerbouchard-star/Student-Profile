begin;

create or replace function public.complete_staff_password_reset_security_v2(
  p_auth_user_id uuid
)
returns table (
  staff_user_id uuid,
  staff_role text,
  permission_version bigint,
  security_version bigint,
  staff_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_auth_user_id is null then
    raise exception using
      errcode = '22023',
      message = 'auth user id is required';
  end if;

  return query
  update public.staff_users
  set
    security_version = staff_users.security_version + 1,
    updated_at = clock_timestamp()
  where supabase_auth_user_id = p_auth_user_id
    and status = 'active'
  returning
    staff_users.id,
    staff_users.role,
    staff_users.permission_version,
    staff_users.security_version,
    staff_users.status;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'active staff account not found';
  end if;
end;
$$;

revoke all on function public.complete_staff_password_reset_security_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.complete_staff_password_reset_security_v2(uuid)
  to service_role;

comment on function public.complete_staff_password_reset_security_v2(uuid) is
  'Bumps the controlled Staff security version after a verified password reset so every pre-reset application session fails closed.';

commit;
