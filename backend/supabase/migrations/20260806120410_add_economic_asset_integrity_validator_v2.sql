-- Economic Asset and Ownership Core V2 integrity validator.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.validate_economic_asset_core_v2(
  p_game_session_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_store_context_missing integer;
  v_physical_items_missing integer;
  v_recipe_inputs_missing integer;
  v_recipe_outputs_missing integer;
  v_holdings_invalid integer;
  v_holding_scope_invalid integer;
  v_reservations_invalid integer;
  v_crafting_outputs_missing integer;
  v_business_products_invalid integer;
  v_business_inventory_invalid integer;
  v_marketplace_context_missing integer;
  v_redemption_context_missing integer;
  v_transactions_invalid integer;
  v_errors integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin')
  then
    raise exception 'ECONOMIC_CORE_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.game_sessions g where g.id = p_game_session_id
  ) then
    raise exception 'ECONOMIC_CORE_GAME_NOT_FOUND' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_store_context_missing
  from public.store_items si
  left join public.game_items gi
    on gi.game_session_id = si.game_session_id
   and gi.id = si.game_item_id
  left join public.inventory_accounts ia
    on ia.game_session_id = si.game_session_id
   and ia.id = si.inventory_account_id
  where si.game_session_id = p_game_session_id
    and (gi.id is null or ia.id is null or ia.account_kind <> 'store_stock');

  select count(*)::integer into v_physical_items_missing
  from public.game_session_physical_economy_packs gp
  join public.physical_economy_item_definitions d
    on d.pack_id = gp.pack_id
  left join public.game_items gi
    on gi.game_session_id = gp.game_session_id
   and gi.physical_item_definition_id = d.id
   and gi.canonical_key = d.item_key
  where gp.game_session_id = p_game_session_id
    and gp.status = 'active'
    and d.status = 'active'
    and gi.id is null;

  select count(*)::integer into v_recipe_inputs_missing
  from public.game_session_physical_economy_packs gp
  join public.physical_economy_recipe_definitions r
    on r.pack_id = gp.pack_id
  join public.physical_economy_recipe_inputs i
    on i.recipe_id = r.id
  left join public.game_items gi
    on gi.game_session_id = gp.game_session_id
   and gi.canonical_key = i.item_key
  where gp.game_session_id = p_game_session_id
    and gp.status = 'active'
    and r.status = 'active'
    and gi.id is null;

  select count(*)::integer into v_recipe_outputs_missing
  from public.game_session_physical_economy_packs gp
  join public.physical_economy_recipe_definitions r
    on r.pack_id = gp.pack_id
  join public.physical_economy_recipe_outputs o
    on o.recipe_id = r.id
  left join public.game_items gi
    on gi.game_session_id = gp.game_session_id
   and gi.canonical_key = o.item_key
  where gp.game_session_id = p_game_session_id
    and gp.status = 'active'
    and r.status = 'active'
    and gi.id is null;

  select count(*)::integer into v_holdings_invalid
  from public.inventory_holdings h
  left join public.inventory_accounts ia
    on ia.game_session_id = h.game_session_id
   and ia.id = h.inventory_account_id
  left join public.game_items gi
    on gi.game_session_id = h.game_session_id
   and gi.id = h.game_item_id
  where h.game_session_id = p_game_session_id
    and (
      ia.id is null
      or gi.id is null
      or h.quantity_owned < 0
      or h.quantity_reserved < 0
      or h.quantity_reserved > h.quantity_owned
      or h.average_unit_cost < 0
    );

  select count(*)::integer into v_holding_scope_invalid
  from public.inventory_holdings h
  join public.inventory_accounts ia
    on ia.game_session_id = h.game_session_id
   and ia.id = h.inventory_account_id
  join public.economic_parties ep
    on ep.game_session_id = ia.game_session_id
   and ep.id = ia.party_id
  where h.game_session_id = p_game_session_id
    and (
      (ia.account_kind = 'personal' and (ep.party_kind <> 'player' or h.player_id is distinct from ep.player_id))
      or (ia.account_kind <> 'personal' and h.player_id is not null)
      or (ia.account_kind = 'store_stock' and (ep.party_kind <> 'store' or h.store_item_id is null))
      or (ia.account_kind in ('warehouse', 'work_in_progress', 'finished_goods') and ep.party_kind <> 'business')
      or (ia.account_kind in ('system_source', 'system_sink') and ep.party_kind <> 'system')
    );

  select count(*)::integer into v_reservations_invalid
  from public.inventory_reservations r
  left join public.inventory_holdings h
    on h.game_session_id = r.game_session_id
   and h.id = r.inventory_holding_id
  left join public.game_items gi
    on gi.game_session_id = r.game_session_id
   and gi.id = r.game_item_id
  where r.game_session_id = p_game_session_id
    and (
      h.id is null
      or gi.id is null
      or r.inventory_account_id is distinct from h.inventory_account_id
      or r.game_item_id is distinct from h.game_item_id
      or r.canonical_item_key is distinct from gi.canonical_key
      or (r.status = 'active' and r.quantity > h.quantity_reserved)
    );

  select count(*)::integer into v_crafting_outputs_missing
  from public.crafting_job_outputs o
  join public.crafting_jobs j on j.id = o.job_id
  left join public.game_items gi
    on gi.game_session_id = j.game_session_id
   and gi.id = o.game_item_id
  where j.game_session_id = p_game_session_id
    and gi.id is null;

  select count(*)::integer into v_business_products_invalid
  from public.business_products bp
  left join public.game_items output_item
    on output_item.game_session_id = bp.game_session_id
   and output_item.id = bp.output_game_item_id
  where bp.game_session_id = p_game_session_id
    and (
      (bp.product_kind = 'physical_good' and (
        output_item.id is null
        or not exists (
          select 1
          from public.business_product_inputs bpi
          where bpi.game_session_id = bp.game_session_id
            and bpi.business_product_id = bp.id
        )
        or not exists (
          select 1
          from public.business_product_outputs bpo
          where bpo.game_session_id = bp.game_session_id
            and bpo.business_product_id = bp.id
            and bpo.output_game_item_id = bp.output_game_item_id
        )
      ))
      or (bp.product_kind <> 'physical_good' and bp.output_game_item_id is not null)
    );

  select count(*)::integer into v_business_inventory_invalid
  from public.business_inventory bi
  left join public.inventory_holdings h
    on h.game_session_id = bi.game_session_id
   and h.inventory_account_id = bi.inventory_account_id
   and h.game_item_id = bi.game_item_id
  where bi.game_session_id = p_game_session_id
    and (
      bi.inventory_account_id is null
      or bi.game_item_id is null
      or h.id is null
      or bi.quantity <> h.quantity_owned
      or abs(bi.unit_cost - h.average_unit_cost) > 0.0001
      or abs(bi.total_cost_basis - round(bi.quantity * bi.unit_cost, 4)) > 0.0001
    );

  select (
    (select count(*) from public.marketplace_listings ml
      where ml.game_session_id = p_game_session_id
        and (ml.inventory_account_id is null or ml.game_item_id is null))
    + (select count(*) from public.marketplace_purchase_reservations mpr
      where mpr.game_session_id = p_game_session_id and mpr.game_item_id is null)
    + (select count(*) from public.marketplace_orders mo
      where mo.game_session_id = p_game_session_id and mo.game_item_id is null)
  )::integer into v_marketplace_context_missing;

  select count(*)::integer into v_redemption_context_missing
  from public.inventory_redemption_requests rr
  left join public.inventory_reservations r
    on r.id = rr.inventory_reservation_id
  where rr.game_session_id = p_game_session_id
    and (
      rr.inventory_account_id is null
      or rr.game_item_id is null
      or rr.canonical_item_key is null
      or r.id is null
      or r.game_item_id is distinct from rr.game_item_id
      or r.inventory_account_id is distinct from rr.inventory_account_id
    );

  select count(*)::integer into v_transactions_invalid
  from public.inventory_transactions t
  where t.game_session_id = p_game_session_id
    and (
      (t.status = 'committed' and not exists (
        select 1 from public.inventory_transaction_lines l
        where l.game_session_id = t.game_session_id
          and l.transaction_id = t.id
      ))
      or (t.status = 'pending' and t.created_at < now() - interval '15 minutes')
    );

  v_errors := v_store_context_missing
    + v_physical_items_missing
    + v_recipe_inputs_missing
    + v_recipe_outputs_missing
    + v_holdings_invalid
    + v_holding_scope_invalid
    + v_reservations_invalid
    + v_crafting_outputs_missing
    + v_business_products_invalid
    + v_business_inventory_invalid
    + v_marketplace_context_missing
    + v_redemption_context_missing
    + v_transactions_invalid;

  return jsonb_build_object(
    'gameSessionId', p_game_session_id,
    'valid', v_errors = 0,
    'errorCount', v_errors,
    'checks', jsonb_build_object(
      'storeContextMissing', v_store_context_missing,
      'physicalItemsMissing', v_physical_items_missing,
      'recipeInputsMissing', v_recipe_inputs_missing,
      'recipeOutputsMissing', v_recipe_outputs_missing,
      'holdingsInvalid', v_holdings_invalid,
      'holdingScopeInvalid', v_holding_scope_invalid,
      'reservationsInvalid', v_reservations_invalid,
      'craftingOutputsMissing', v_crafting_outputs_missing,
      'businessProductsInvalid', v_business_products_invalid,
      'businessInventoryInvalid', v_business_inventory_invalid,
      'marketplaceContextMissing', v_marketplace_context_missing,
      'redemptionContextMissing', v_redemption_context_missing,
      'transactionsInvalid', v_transactions_invalid
    )
  );
end
$function$;

revoke all on function public.validate_economic_asset_core_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.validate_economic_asset_core_v2(uuid)
  to service_role;

comment on function public.validate_economic_asset_core_v2(uuid) is
  'Fails release gates when canonical item, ownership, reservation, Crafting, Business, Marketplace, redemption, or inventory-journal projections diverge for one game.';

commit;
