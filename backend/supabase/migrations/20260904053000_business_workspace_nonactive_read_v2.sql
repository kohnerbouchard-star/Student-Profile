-- Business V2 Phase 12: preserve owned Business workspace reads outside active operations.
--
-- A non-closed owned Business remains visible after lifecycle transitions such as
-- restructuring. Production readiness is intentionally empty while the Business
-- is not active; governance, Store offers, activity, manufacturing history, and
-- the canonical Business snapshot remain readable. This migration adds no
-- mutation, settlement, inventory, money, payroll, tax, or scheduling authority.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.read_owned_business_workspace_projection_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_business record;
  v_business_status text;
  v_production_readiness jsonb := '[]'::jsonb;
begin
  select *
  into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  select business.status
  into v_business_status
  from public.business_entities as business
  where business.game_session_id = p_game_session_id
    and business.id = v_business.business_id;

  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_business_status = 'active' then
    v_production_readiness := public.read_owned_business_production_readiness_v2(
      p_game_session_id,
      p_player_id
    );
  end if;

  return jsonb_build_object(
    'governance', public.read_owned_business_governance_v2(
      p_game_session_id,
      p_player_id
    ),
    'productionReadiness', v_production_readiness,
    'salesOffers', public.read_owned_business_sales_offers_v2(
      p_game_session_id,
      p_player_id
    ),
    'activity', public.read_owned_business_activity_v2(
      p_game_session_id,
      p_player_id
    )
  );
end
$function$;

revoke all on function public.read_owned_business_workspace_projection_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.read_owned_business_workspace_projection_v2(uuid, uuid)
  to service_role;

comment on function public.read_owned_business_workspace_projection_v2(uuid, uuid) is
  'Player-safe Phase 12 workspace read. Non-closed owned Businesses remain visible; production readiness is exposed only while active.';

commit;
