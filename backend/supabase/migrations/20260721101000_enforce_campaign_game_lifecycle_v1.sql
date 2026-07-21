begin;

create or replace function public.require_active_campaign_game_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_status text;
begin
  select game_row.status
  into v_status
  from public.game_sessions as game_row
  where game_row.id = new.game_session_id
  for share;

  if v_status is null then
    raise exception 'CAMPAIGN_GAME_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_status <> 'active' then
    raise exception 'CAMPAIGN_GAME_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

revoke all on function public.require_active_campaign_game_v1()
  from public, anon, authenticated;
grant execute on function public.require_active_campaign_game_v1()
  to service_role;

drop trigger if exists require_active_campaign_game_on_execution
  on public.campaign_event_executions;
create trigger require_active_campaign_game_on_execution
before insert on public.campaign_event_executions
for each row execute function public.require_active_campaign_game_v1();

commit;
