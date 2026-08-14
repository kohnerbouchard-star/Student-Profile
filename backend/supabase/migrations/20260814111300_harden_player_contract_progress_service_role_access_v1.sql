begin;

-- Contract progress is owned by reviewed server-side routes. Keep the service
-- client limited to the operations required by submission, review, and reward
-- lifecycle handling; destructive and DDL-adjacent table privileges are denied.
revoke all privileges on table public.player_contract_progress
  from service_role;

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

  if has_table_privilege('service_role', 'public.player_contract_progress', 'delete')
     or has_table_privilege('service_role', 'public.player_contract_progress', 'truncate')
     or has_table_privilege('service_role', 'public.player_contract_progress', 'references')
     or has_table_privilege('service_role', 'public.player_contract_progress', 'trigger') then
    raise exception 'service_role has excessive privileges on player_contract_progress';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
