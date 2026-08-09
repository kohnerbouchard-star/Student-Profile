-- Canonical inventory posting and projection synchronization V2.
-- Part 1 of 6 from the reviewed domain migration; ordered and forward-only.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Store, Inventory, and Crafting canonical ownership cutover V2.
--
-- Public HTTP paths and RPC signatures are preserved. The implementation beneath
-- those contracts now resolves canonical game items and inventory accounts rather
-- than treating Store offers as owned-item identity.



-- ---------------------------------------------------------------------------
-- Atomic canonical inventory posting
-- ---------------------------------------------------------------------------

create or replace function economy_private.post_inventory_transaction_v2(
  p_game_session_id uuid,
  p_transaction_type text,
  p_source_domain text,
  p_source_action text,
  p_source_id uuid,
  p_idempotency_key text,
  p_metadata jsonb,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, economy_private, extensions, pg_temp
as $function$
declare
  v_transaction public.inventory_transactions%rowtype;
  v_existing public.inventory_transactions%rowtype;
  v_line jsonb;
  v_line_number integer;
  v_account public.inventory_accounts%rowtype;
  v_party public.economic_parties%rowtype;
  v_item public.game_items%rowtype;
  v_store_item public.store_items%rowtype;
  v_holding public.inventory_holdings%rowtype;
  v_account_id uuid;
  v_game_item_id uuid;
  v_player_id uuid;
  v_store_item_id uuid;
  v_quantity_delta_raw numeric;
  v_reservation_delta_raw numeric;
  v_event_quantity_raw numeric;
  v_quantity_delta integer;
  v_reservation_delta integer;
  v_new_quantity integer;
  v_new_reserved integer;
  v_unit_cost numeric;
  v_currency_code text;
  v_new_average_cost numeric;
  v_event_type text;
  v_event_quantity integer;
  v_request_hash text;
  v_now timestamptz := statement_timestamp();
  v_results jsonb := '[]'::jsonb;
begin
  if p_game_session_id is null
    or coalesce(p_transaction_type,'') not in (
      'purchase','transfer','reservation','release','consumption','production',
      'grant','adjustment','reversal','sale','redemption','salvage'
    )
    or length(btrim(coalesce(p_source_domain,''))) not between 1 and 80
    or length(btrim(coalesce(p_source_action,''))) not between 1 and 120
    or length(btrim(coalesce(p_idempotency_key,''))) not between 1 and 160
    or jsonb_typeof(coalesce(p_metadata,'{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_lines,'[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_lines,'[]'::jsonb)) = 0
  then
    raise exception 'INVENTORY_TRANSACTION_INVALID' using errcode = 'P0001';
  end if;

  v_request_hash := encode(
    extensions.digest(
      jsonb_build_object(
        'gameSessionId', p_game_session_id,
        'transactionType', p_transaction_type,
        'sourceDomain', btrim(p_source_domain),
        'sourceAction', btrim(p_source_action),
        'sourceId', p_source_id,
        'metadata', coalesce(p_metadata,'{}'::jsonb),
        'lines', p_lines
      )::text,
      'sha256'
    ),
    'hex'
  );

  insert into public.inventory_transactions(
    game_session_id,
    transaction_type,
    source_domain,
    source_action,
    source_id,
    idempotency_key,
    request_hash,
    status,
    metadata,
    committed_at
  ) values (
    p_game_session_id,
    p_transaction_type,
    btrim(p_source_domain),
    btrim(p_source_action),
    p_source_id,
    btrim(p_idempotency_key),
    v_request_hash,
    'pending',
    coalesce(p_metadata,'{}'::jsonb),
    null
  )
  on conflict on constraint inventory_transactions_idempotency_unique do nothing
  returning * into v_transaction;

  if not found then
    select t.* into v_existing
    from public.inventory_transactions t
    where t.game_session_id = p_game_session_id
      and t.source_domain = btrim(p_source_domain)
      and t.source_action = btrim(p_source_action)
      and t.idempotency_key = btrim(p_idempotency_key)
    for update;

    if not found then
      raise exception 'INVENTORY_TRANSACTION_IDEMPOTENCY_LOOKUP_FAILED' using errcode = 'P0001';
    end if;
    if v_existing.request_hash <> v_request_hash then
      raise exception 'INVENTORY_TRANSACTION_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    if v_existing.status = 'committed' then
      return jsonb_build_object(
        'transactionId', v_existing.id,
        'transactionKey', v_existing.public_key,
        'status', v_existing.status,
        'committedAt', v_existing.committed_at,
        'replayed', true
      );
    end if;
    raise exception 'INVENTORY_TRANSACTION_IN_PROGRESS' using errcode = 'P0001';
  end if;

  for v_line, v_line_number in
    select value, ordinality::integer
    from jsonb_array_elements(p_lines) with ordinality
    order by ordinality
  loop
    begin
      v_account_id := (v_line->>'inventoryAccountId')::uuid;
      v_game_item_id := (v_line->>'gameItemId')::uuid;
      v_player_id := nullif(v_line->>'playerId','')::uuid;
      v_store_item_id := nullif(v_line->>'storeItemId','')::uuid;
    exception when invalid_text_representation then
      raise exception 'INVENTORY_TRANSACTION_LINE_ID_INVALID:%', v_line_number using errcode = 'P0001';
    end;
    v_quantity_delta_raw := coalesce((v_line->>'quantityDelta')::numeric, 0);
    v_reservation_delta_raw := coalesce((v_line->>'reservationDelta')::numeric, 0);
    v_unit_cost := nullif(v_line->>'unitCost','')::numeric;
    v_currency_code := nullif(upper(btrim(coalesce(v_line->>'currencyCode',''))), '');
    v_event_type := nullif(upper(btrim(coalesce(v_line->>'eventType',''))), '');
    v_event_quantity_raw := coalesce(
      nullif(v_line->>'legacyEventQuantityDelta','')::numeric,
      case
        when v_quantity_delta_raw <> 0 then v_quantity_delta_raw
        when v_reservation_delta_raw > 0 then -v_reservation_delta_raw
        else -v_reservation_delta_raw
      end
    );

    if v_quantity_delta_raw <> trunc(v_quantity_delta_raw)
      or v_reservation_delta_raw <> trunc(v_reservation_delta_raw)
      or v_event_quantity_raw <> trunc(v_event_quantity_raw)
    then
      raise exception 'INVENTORY_TRANSACTION_FRACTIONAL_QUANTITY:%', v_line_number using errcode = 'P0001';
    end if;

    v_quantity_delta := v_quantity_delta_raw::integer;
    v_reservation_delta := v_reservation_delta_raw::integer;
    v_event_quantity := v_event_quantity_raw::integer;

    if v_quantity_delta = 0 and v_reservation_delta = 0 then
      raise exception 'INVENTORY_TRANSACTION_EMPTY_LINE:%', v_line_number using errcode = 'P0001';
    end if;
    if v_unit_cost is not null and v_unit_cost < 0 then
      raise exception 'INVENTORY_TRANSACTION_UNIT_COST_INVALID:%', v_line_number using errcode = 'P0001';
    end if;
    if v_currency_code is not null
      and (v_currency_code !~ '^[A-Z0-9_]{3,16}$')
    then
      raise exception 'INVENTORY_TRANSACTION_CURRENCY_INVALID:%', v_line_number using errcode = 'P0001';
    end if;

    select a.* into v_account
    from public.inventory_accounts a
    where a.game_session_id = p_game_session_id
      and a.id = v_account_id
      and a.status = 'active'
    for share;
    if not found then
      raise exception 'INVENTORY_TRANSACTION_ACCOUNT_UNAVAILABLE:%', v_line_number using errcode = 'P0001';
    end if;

    select ep.* into v_party
    from public.economic_parties ep
    where ep.game_session_id = p_game_session_id
      and ep.id = v_account.party_id
      and ep.status = 'active'
    for share;
    if not found then
      raise exception 'INVENTORY_TRANSACTION_PARTY_UNAVAILABLE:%', v_line_number using errcode = 'P0001';
    end if;

    if v_account.account_kind = 'personal' then
      if v_party.party_kind <> 'player'
        or v_party.player_id is null
        or v_player_id is distinct from v_party.player_id
      then
        raise exception 'INVENTORY_TRANSACTION_PLAYER_SCOPE_MISMATCH:%', v_line_number using errcode = 'P0001';
      end if;
    elsif v_player_id is not null then
      raise exception 'INVENTORY_TRANSACTION_PLAYER_SCOPE_MISMATCH:%', v_line_number using errcode = 'P0001';
    end if;

    if (v_account.account_kind in ('warehouse','work_in_progress','finished_goods') and v_party.party_kind <> 'business')
      or (v_account.account_kind = 'store_stock' and v_party.party_kind <> 'store')
      or (v_account.account_kind = 'escrow' and v_party.party_kind <> 'escrow')
      or (v_account.account_kind in ('system_source','system_sink') and v_party.party_kind <> 'system')
    then
      raise exception 'INVENTORY_TRANSACTION_ACCOUNT_PARTY_MISMATCH:%', v_line_number using errcode = 'P0001';
    end if;

    select gi.* into v_item
    from public.game_items gi
    where gi.game_session_id = p_game_session_id
      and gi.id = v_game_item_id
      and gi.status = 'active'
    for share;
    if not found then
      raise exception 'INVENTORY_TRANSACTION_ITEM_UNAVAILABLE:%', v_line_number using errcode = 'P0001';
    end if;

    if v_store_item_id is not null then
      select si.* into v_store_item
      from public.store_items si
      where si.game_session_id = p_game_session_id
        and si.id = v_store_item_id
      for share;
      if not found
        or v_store_item.game_item_id is distinct from v_game_item_id
        or (
          v_account.account_kind = 'store_stock'
          and v_store_item.inventory_account_id is distinct from v_account_id
        )
      then
        raise exception 'INVENTORY_TRANSACTION_STORE_SCOPE_MISMATCH:%', v_line_number using errcode = 'P0001';
      end if;
    elsif v_account.account_kind = 'store_stock' then
      raise exception 'INVENTORY_TRANSACTION_STORE_SCOPE_MISMATCH:%', v_line_number using errcode = 'P0001';
    end if;

    insert into public.inventory_holdings(
      game_session_id,
      player_id,
      store_item_id,
      inventory_account_id,
      game_item_id,
      quantity_owned,
      quantity_reserved,
      average_unit_cost,
      cost_currency_code,
      version
    ) values (
      p_game_session_id,
      v_player_id,
      v_store_item_id,
      v_account_id,
      v_game_item_id,
      0,
      0,
      0,
      v_currency_code,
      1
    )
    on conflict on constraint inventory_holdings_account_item_unique do nothing;

    select h.* into v_holding
    from public.inventory_holdings h
    where h.game_session_id = p_game_session_id
      and h.inventory_account_id = v_account_id
      and h.game_item_id = v_game_item_id
    for update;
    if not found then
      raise exception 'INVENTORY_TRANSACTION_HOLDING_LOOKUP_FAILED:%', v_line_number using errcode = 'P0001';
    end if;

    v_new_quantity := v_holding.quantity_owned + v_quantity_delta;
    v_new_reserved := v_holding.quantity_reserved + v_reservation_delta;
    if v_new_quantity < 0 or v_new_reserved < 0 or v_new_reserved > v_new_quantity then
      raise exception 'INVENTORY_TRANSACTION_BALANCE_INVALID:%', v_line_number using errcode = 'P0001';
    end if;

    v_new_average_cost := v_holding.average_unit_cost;
    if v_quantity_delta > 0 and v_unit_cost is not null then
      v_new_average_cost := case
        when v_new_quantity = 0 then 0
        else round(
          (
            (v_holding.quantity_owned * v_holding.average_unit_cost)
            + (v_quantity_delta * v_unit_cost)
          ) / v_new_quantity,
          4
        )
      end;
    elsif v_new_quantity = 0 then
      v_new_average_cost := 0;
    end if;

    update public.inventory_holdings h
    set
      quantity_owned = v_new_quantity,
      quantity_reserved = v_new_reserved,
      average_unit_cost = v_new_average_cost,
      cost_currency_code = coalesce(v_currency_code, h.cost_currency_code),
      player_id = coalesce(h.player_id, v_player_id),
      store_item_id = coalesce(h.store_item_id, v_store_item_id),
      version = h.version + 1,
      updated_at = v_now
    where h.id = v_holding.id
    returning * into v_holding;

    insert into public.inventory_transaction_lines(
      game_session_id,
      transaction_id,
      inventory_account_id,
      game_item_id,
      quantity_delta,
      reservation_delta,
      unit_cost,
      currency_code,
      metadata
    ) values (
      p_game_session_id,
      v_transaction.id,
      v_account_id,
      v_game_item_id,
      v_quantity_delta,
      v_reservation_delta,
      v_unit_cost,
      v_currency_code,
      coalesce(v_line->'metadata','{}'::jsonb)
    );

    if v_event_type is not null then
      if v_event_quantity = 0 then
        raise exception 'INVENTORY_TRANSACTION_EVENT_QUANTITY_INVALID:%', v_line_number using errcode = 'P0001';
      end if;
      insert into public.inventory_events(
        game_session_id,
        player_id,
        store_item_id,
        inventory_account_id,
        game_item_id,
        inventory_transaction_id,
        quantity_delta,
        event_type,
        source_domain,
        source_action,
        source_id,
        metadata
      ) values (
        p_game_session_id,
        v_player_id,
        v_store_item_id,
        v_account_id,
        v_game_item_id,
        v_transaction.id,
        v_event_quantity,
        v_event_type,
        btrim(p_source_domain),
        btrim(p_source_action),
        p_source_id,
        coalesce(v_line->'eventMetadata','{}'::jsonb)
      );
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'line', v_line_number,
      'holdingId', v_holding.id,
      'inventoryAccountId', v_holding.inventory_account_id,
      'gameItemId', v_holding.game_item_id,
      'quantityOwned', v_holding.quantity_owned,
      'quantityReserved', v_holding.quantity_reserved,
      'averageUnitCost', v_holding.average_unit_cost,
      'currencyCode', v_holding.cost_currency_code
    ));
  end loop;

  update public.inventory_transactions t
  set status = 'committed', committed_at = v_now
  where t.id = v_transaction.id
  returning * into v_transaction;

  return jsonb_build_object(
    'transactionId', v_transaction.id,
    'transactionKey', v_transaction.public_key,
    'status', v_transaction.status,
    'committedAt', v_transaction.committed_at,
    'replayed', false,
    'lines', v_results
  );
end
$function$;

revoke all on function economy_private.post_inventory_transaction_v2(
  uuid, text, text, text, uuid, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function economy_private.post_inventory_transaction_v2(
  uuid, text, text, text, uuid, text, jsonb, jsonb
) to service_role;

-- Store stock remains visible through store_items.stock_quantity while the
-- canonical account holding is the ownership projection used by transactions.
create or replace function economy_private.sync_store_stock_projection_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
begin
  if new.inventory_account_id is null or new.game_item_id is null then
    raise exception 'ECONOMIC_CORE_STORE_CONTEXT_REQUIRED' using errcode = 'P0001';
  end if;

  insert into public.inventory_holdings(
    game_session_id,
    player_id,
    store_item_id,
    inventory_account_id,
    game_item_id,
    quantity_owned,
    quantity_reserved,
    average_unit_cost,
    cost_currency_code
  ) values (
    new.game_session_id,
    null,
    new.id,
    new.inventory_account_id,
    new.game_item_id,
    new.stock_quantity,
    0,
    new.price,
    new.currency_code
  )
  on conflict on constraint inventory_holdings_account_item_unique
  do update set
    quantity_owned = excluded.quantity_owned,
    quantity_reserved = least(public.inventory_holdings.quantity_reserved, excluded.quantity_owned),
    average_unit_cost = excluded.average_unit_cost,
    cost_currency_code = excluded.cost_currency_code,
    store_item_id = excluded.store_item_id,
    updated_at = now(),
    version = public.inventory_holdings.version + 1;
  return new;
end
$function$;

drop trigger if exists sync_store_stock_projection_v2 on public.store_items;
create trigger sync_store_stock_projection_v2
after insert or update of stock_quantity, price, currency_code, game_item_id, inventory_account_id
on public.store_items
for each row execute function economy_private.sync_store_stock_projection_v2();

-- Activating a physical-economy pack automatically creates every canonical game
-- item before Crafting can read or mutate it.
create or replace function economy_private.sync_active_physical_pack_game_items_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.sync_game_item_catalog_v2(new.game_session_id, null);
  end if;
  return new;
end
$function$;

drop trigger if exists sync_active_physical_pack_game_items_v2
  on public.game_session_physical_economy_packs;
create trigger sync_active_physical_pack_game_items_v2
after insert or update of status
on public.game_session_physical_economy_packs
for each row execute function economy_private.sync_active_physical_pack_game_items_v2();


commit;
