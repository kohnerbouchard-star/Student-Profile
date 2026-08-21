-- Business V2 Phase 3C: coherent canonical Stockroom snapshot.
--
-- The browser receives location totals and item holdings from one PostgreSQL
-- statement snapshot. Separate read RPCs could observe different committed
-- inventory states during concurrent procurement or production settlement.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.read_owned_business_stockroom_snapshot_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business record;
  v_locations jsonb;
  v_items jsonb;
begin
  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  select coalesce(
    jsonb_agg(
      to_jsonb(location_row)
      order by case location_row.location_key
        when 'warehouse' then 1
        when 'work_in_progress' then 2
        when 'finished_goods' then 3
        when 'in_transit' then 4
        else 5
      end
    ),
    '[]'::jsonb
  )
  into v_locations
  from public.read_owned_business_stockroom_locations_v2(
    p_game_session_id,
    p_player_id
  ) as location_row;

  if jsonb_array_length(v_locations) <> 4 then
    raise exception 'BUSINESS_STOCKROOM_LOCATIONS_INCOMPLETE'
      using errcode = 'P0001';
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(item_row)
      order by
        case item_row.location_key
          when 'warehouse' then 1
          when 'work_in_progress' then 2
          when 'finished_goods' then 3
          when 'in_transit' then 4
          else 5
        end,
        item_row.item_class,
        item_row.item_name,
        item_row.canonical_key
    ),
    '[]'::jsonb
  )
  into v_items
  from public.read_owned_business_stockroom_v2(
    p_game_session_id,
    p_player_id
  ) as item_row;

  return jsonb_build_object(
    'business_key', v_business.business_key,
    'locations', v_locations,
    'items', v_items
  );
end
$function$;

comment on function public.read_owned_business_stockroom_snapshot_v2(uuid, uuid) is
  'Returns one transactionally coherent, public-key-only Business Stockroom snapshot across Warehouse, WIP, Finished Goods, and In Transit.';

revoke all on function public.read_owned_business_stockroom_snapshot_v2(
  uuid,
  uuid
) from public, anon, authenticated;
grant execute on function public.read_owned_business_stockroom_snapshot_v2(
  uuid,
  uuid
) to service_role;

commit;
