begin;

create or replace function economy_private.enforce_teacher_approval_redemption_mode_v1()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_redemption_mode text;
  v_effect_enabled boolean := false;
begin
  select
    gi.metadata ->> 'redemptionMode',
    coalesce(gi.metadata -> 'effectEnabled', 'false'::jsonb) = 'true'::jsonb
  into v_redemption_mode, v_effect_enabled
  from public.inventory_holdings h
  join public.game_items gi
    on gi.game_session_id = h.game_session_id
   and gi.id = h.game_item_id
  where h.game_session_id = new.game_session_id
    and h.id = new.inventory_holding_id
    and h.player_id = new.player_id;

  if not found
    or v_redemption_mode is distinct from 'teacher_approval'
    or v_effect_enabled
  then
    raise exception 'INVENTORY_REDEMPTION_ITEM_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  return new;
end
$function$;

create trigger enforce_teacher_approval_redemption_mode_v1
before insert on public.inventory_redemption_requests
for each row execute function economy_private.enforce_teacher_approval_redemption_mode_v1();

revoke all on function economy_private.enforce_teacher_approval_redemption_mode_v1()
  from public, anon, authenticated;
grant execute on function economy_private.enforce_teacher_approval_redemption_mode_v1()
  to service_role;

commit;
