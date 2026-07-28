begin;

-- Arrival Class completion establishes the player's current country and travel
-- state. Once the grant receipt exists, publish every other initialized country
-- as a residency-review destination. The current country is deliberately
-- excluded so the player cannot submit a no-op residency request.
create or replace function public.reconcile_arrival_residency_eligibility_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_current_country_id text;
  v_eligible_country_ids jsonb;
begin
  select residency_row.current_country_id
  into v_current_country_id
  from public.player_residency_states as residency_row
  where residency_row.game_session_id = new.game_session_id
    and residency_row.player_id = new.player_id
  for update;

  if not found then
    raise exception 'ARRIVAL_RESIDENCY_STATE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select coalesce(
    jsonb_agg(country_row.country_id order by country_row.country_id),
    '[]'::jsonb
  )
  into v_eligible_country_ids
  from public.world_country_runtime as country_row
  where country_row.game_session_id = new.game_session_id
    and country_row.country_id <> v_current_country_id;

  if jsonb_array_length(v_eligible_country_ids) <> 9 then
    raise exception 'ARRIVAL_RESIDENCY_DESTINATION_COUNT_INVALID' using errcode = 'P0001';
  end if;

  update public.player_residency_states
  set eligible_country_ids = v_eligible_country_ids,
      pending_country_id = null,
      updated_at = new.processed_at
  where game_session_id = new.game_session_id
    and player_id = new.player_id;

  return new;
end;
$function$;

revoke all on function public.reconcile_arrival_residency_eligibility_v1()
  from public, anon, authenticated;
grant execute on function public.reconcile_arrival_residency_eligibility_v1()
  to service_role;

drop trigger if exists reconcile_arrival_residency_eligibility
  on public.player_arrival_grant_receipts;
create trigger reconcile_arrival_residency_eligibility
after insert on public.player_arrival_grant_receipts
for each row execute function public.reconcile_arrival_residency_eligibility_v1();

comment on function public.reconcile_arrival_residency_eligibility_v1() is
  'Publishes the nine non-current initialized countries as residency-review destinations after an Arrival grant is applied.';

commit;
