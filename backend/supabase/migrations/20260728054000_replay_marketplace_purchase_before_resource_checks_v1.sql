begin;

-- Exact purchase replays must resolve before listing inventory or buyer balance
-- checks. The private projection functions already own request-fingerprint and
-- completed-order replay semantics; these public wrappers must not preempt those
-- semantics with resource checks against state consumed by the first request.
do $migration$
declare
  v_oid oid;
  v_definition text;
  v_patched text;
  v_reserve_before constant text := $before$
begin
  select *
  into v_listing
  from public.marketplace_listings
$before$;
  v_reserve_after constant text := $after$
begin
  perform 1
  from public.marketplace_purchase_reservations
  where game_session_id = p_game_session_id
    and buyer_player_id = p_buyer_player_id
    and buyer_idempotency_key = btrim(coalesce(p_idempotency_key, ''))
  for update;

  if found then
    return query
    select *
    from public.reserve_marketplace_purchase_projection_legacy_v1(
      p_game_session_id,
      p_buyer_player_id,
      p_listing_key,
      p_quantity,
      p_expected_version,
      p_idempotency_key
    );
    return;
  end if;

  select *
  into v_listing
  from public.marketplace_listings
$after$;
  v_settle_before constant text := $before$
  if found then
    select *
    into v_listing
    from public.marketplace_listings
$before$;
  v_settle_after constant text := $after$
  if found then
    perform 1
    from public.marketplace_orders
    where game_session_id = p_game_session_id
      and reservation_id = v_reservation.id
      and status in ('completed', 'disputed', 'refunded')
    for update;

    if found then
      return query
      select *
      from public.settle_marketplace_purchase_projection_legacy_v1(
        p_game_session_id,
        p_buyer_player_id,
        p_reservation_key
      );
      return;
    end if;

    select *
    into v_listing
    from public.marketplace_listings
$after$;
begin
  select p.oid
  into strict v_oid
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'reserve_marketplace_purchase_public_v1';

  v_definition := pg_get_functiondef(v_oid);
  if position(v_reserve_before in v_definition) = 0 then
    raise exception 'MARKETPLACE_RESERVATION_REPLAY_BLOCK_UNRECOGNIZED';
  end if;

  v_patched := replace(v_definition, v_reserve_before, v_reserve_after);
  if v_patched = v_definition then
    raise exception 'MARKETPLACE_RESERVATION_REPLAY_PATCH_NOT_APPLIED';
  end if;
  execute v_patched;

  select p.oid
  into strict v_oid
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'settle_marketplace_purchase_public_v1';

  v_definition := pg_get_functiondef(v_oid);
  if position(v_settle_before in v_definition) = 0 then
    raise exception 'MARKETPLACE_SETTLEMENT_REPLAY_BLOCK_UNRECOGNIZED';
  end if;

  v_patched := replace(v_definition, v_settle_before, v_settle_after);
  if v_patched = v_definition then
    raise exception 'MARKETPLACE_SETTLEMENT_REPLAY_PATCH_NOT_APPLIED';
  end if;
  execute v_patched;

  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'reserve_marketplace_purchase_public_v1';

  if position('buyer_idempotency_key = btrim(coalesce(p_idempotency_key, ''''))' in v_definition) = 0
    or position('reserve_marketplace_purchase_projection_legacy_v1' in v_definition)
       > position('marketplace_reconcile_inventory_projection_v1' in v_definition)
  then
    raise exception 'MARKETPLACE_RESERVATION_REPLAY_PATCH_INVALID';
  end if;

  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'settle_marketplace_purchase_public_v1';

  if position('status in (''completed'', ''disputed'', ''refunded'')' in v_definition) = 0
    or position('settle_marketplace_purchase_projection_legacy_v1' in v_definition)
       > position('marketplace_reconcile_inventory_projection_v1' in v_definition)
  then
    raise exception 'MARKETPLACE_SETTLEMENT_REPLAY_PATCH_INVALID';
  end if;
end
$migration$;

commit;
