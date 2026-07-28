begin;

-- Player Contract progress remains server-owned. Browser roles must never read or
-- mutate progress rows directly; the authenticated Player Edge route derives the
-- game and Player scope from the HttpOnly Player session and uses the service client.
revoke all on table public.player_contract_progress
  from public, anon, authenticated, service_role;

-- Contract acceptance is handled by a scoped SECURITY DEFINER RPC. Submission,
-- staff review, and reward marking use the reviewed service-owned repository and
-- require only scoped reads plus insert/update access. Delete remains denied.
grant select, insert, update on table public.player_contract_progress
  to service_role;

do $$
begin
  if not has_table_privilege(
    'service_role',
    'public.player_contract_progress',
    'select,insert,update'
  ) then
    raise exception 'service_role privilege contract failed for player_contract_progress';
  end if;

  if has_table_privilege(
    'service_role',
    'public.player_contract_progress',
    'delete'
  ) then
    raise exception 'service_role must not delete player_contract_progress directly';
  end if;

  if has_table_privilege('anon', 'public.player_contract_progress', 'select')
     or has_table_privilege('anon', 'public.player_contract_progress', 'insert')
     or has_table_privilege('anon', 'public.player_contract_progress', 'update')
     or has_table_privilege('anon', 'public.player_contract_progress', 'delete') then
    raise exception 'anon must not access player_contract_progress directly';
  end if;

  if has_table_privilege('authenticated', 'public.player_contract_progress', 'select')
     or has_table_privilege('authenticated', 'public.player_contract_progress', 'insert')
     or has_table_privilege('authenticated', 'public.player_contract_progress', 'update')
     or has_table_privilege('authenticated', 'public.player_contract_progress', 'delete') then
    raise exception 'authenticated must not access player_contract_progress directly';
  end if;
end;
$$;

comment on table public.player_contract_progress is
  'Per-player Contract state. Browser roles have no direct privileges; scoped Player and Admin routes use the service-owned client, while Contract acceptance remains inside its dedicated SECURITY DEFINER RPC.';

notify pgrst, 'reload schema';

commit;
