-- Store purchase execution RPC V1.
-- Completes the basic store purchase transaction path:
-- quote validation, stock decrement, ledger debit, purchase record,
-- inventory holding update, inventory event, audit trail, and idempotency.
-- No business-production logic, resource market, finished goods market, events, or frontend changes.

create or replace function public.purchase_quoted_store_item(
  p_game_session_id uuid,
  p_player_id uuid,
  p_quote_id uuid,
  p_idempotency_key text,
  p_client_submitted_at timestamptz default null,
  p_request_metadata jsonb default '{}'::jsonb
)
returns table (
  purchase_id uuid,
  quote_id uuid,
  store_item_id uuid,
  quantity integer,
  final_unit_price numeric,
  final_total_price numeric,
  currency_code text,
  ledger_entry_id uuid,
  inventory_holding_id uuid,
  inventory_quantity_owned integer,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_request_hash text;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_quote public.store_purchase_quotes%rowtype;
  v_item public.store_items%rowtype;
  v_balance public.account_balances%rowtype;
  v_purchase public.store_purchases%rowtype;
  v_ledger record;
  v_inventory public.inventory_holdings%rowtype;
  v_response_body jsonb;
begin
  if p_game_session_id is null then
    raise exception 'GAME_SESSION_REQUIRED'
      using errcode = 'P0001';
  end if;

  if p_player_id is null then
    raise exception 'PLAYER_REQUIRED'
      using errcode = 'P0001';
  end if;

  if p_quote_id is null then
    raise exception 'QUOTE_REQUIRED'
      using errcode = 'P0001';
  end if;

  if length(v_idempotency_key) = 0 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED'
      using errcode = 'P0001';
  end if;

  if jsonb_typeof(coalesce(p_request_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'INVALID_REQUEST_METADATA'
      using errcode = 'P0001';
  end if;

  v_request_hash := encode(
    digest(
      jsonb_build_object(
        'gameSessionId', p_game_session_id,
        'playerId', p_player_id,
        'quoteId', p_quote_id,
        'routeKey', 'players.me.store.purchases'
      )::text,
      'sha256'
    ),
    'hex'
  );

  insert into public.mutation_idempotency_keys (
    game_session_id,
    player_id,
    route_key,
    idempotency_key,
    request_hash,
    status,
    expires_at
  )
  values (
    p_game_session_id,
    p_player_id,
    'players.me.store.purchases',
    v_idempotency_key,
    v_request_hash,
    'STARTED',
    v_now + interval '7 days'
  )
  on conflict on constraint mutation_idempotency_keys_scope_unique
  do nothing;

  select *
  into v_idempotency
  from public.mutation_idempotency_keys
  where game_session_id = p_game_session_id
    and player_id = p_player_id
    and route_key = 'players.me.store.purchases'
    and idempotency_key = v_idempotency_key
  for update;

  if not found then
    raise exception 'IDEMPOTENCY_LOOKUP_FAILED'
      using errcode = 'P0001';
  end if;

  if v_idempotency.request_hash <> v_request_hash then
    raise exception 'IDEMPOTENCY_CONFLICT'
      using errcode = 'P0001';
  end if;

  if v_idempotency.status = 'COMPLETED' then
    if v_idempotency.result_id is null then
      raise exception 'IDEMPOTENCY_RESULT_MISSING'
        using errcode = 'P0001';
    end if;

    select *
    into v_purchase
    from public.store_purchases
    where id = v_idempotency.result_id
      and game_session_id = p_game_session_id
      and player_id = p_player_id;

    if not found then
      raise exception 'IDEMPOTENCY_RESULT_NOT_FOUND'
        using errcode = 'P0001';
    end if;

    select *
    into v_inventory
    from public.inventory_holdings
    where game_session_id = p_game_session_id
      and player_id = p_player_id
      and store_item_id = v_purchase.store_item_id;

    return query
    select
      v_purchase.id,
      v_purchase.quote_id,
      v_purchase.store_item_id,
      v_purchase.quantity,
      v_purchase.final_unit_price,
      v_purchase.final_total_price,
      v_purchase.currency_code,
      v_purchase.ledger_entry_id,
      v_inventory.id,
      coalesce(v_inventory.quantity_owned, 0),
      v_purchase.created_at;
    return;
  end if;

  if v_idempotency.status <> 'STARTED' then
    raise exception 'IDEMPOTENCY_IN_PROGRESS'
      using errcode = 'P0001';
  end if;

  select *
  into v_quote
  from public.store_purchase_quotes
  where id = p_quote_id
    and game_session_id = p_game_session_id
    and player_id = p_player_id
  for update;

  if not found then
    raise exception 'QUOTE_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if v_quote.status <> 'CREATED' then
    raise exception 'QUOTE_NOT_USABLE'
      using errcode = 'P0001';
  end if;

  if v_quote.expires_at <= v_now then
    update public.store_purchase_quotes
    set status = 'EXPIRED'
    where id = v_quote.id;

    raise exception 'QUOTE_EXPIRED'
      using errcode = 'P0001';
  end if;

  select *
  into v_item
  from public.store_items
  where id = v_quote.store_item_id
    and game_session_id = p_game_session_id
  for update;

  if not found then
    raise exception 'ITEM_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if v_item.status <> 'active' or v_item.visibility <> 'visible' then
    raise exception 'ITEM_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if v_item.stock_quantity < v_quote.quantity then
    raise exception 'INSUFFICIENT_STOCK'
      using errcode = 'P0001';
  end if;

  select *
  into v_balance
  from public.account_balances
  where game_session_id = p_game_session_id
    and player_id = p_player_id
    and account_type = 'cash'
    and currency_code = v_quote.currency_code
  for update;

  if not found or v_balance.balance < v_quote.final_total_price then
    raise exception 'INSUFFICIENT_BALANCE'
      using errcode = 'P0001';
  end if;

  insert into public.store_purchases (
    game_session_id,
    player_id,
    store_item_id,
    quote_id,
    quantity,
    currency_code,
    final_unit_price,
    final_total_price,
    ledger_entry_id,
    idempotency_key,
    status,
    client_submitted_at
  )
  values (
    p_game_session_id,
    p_player_id,
    v_quote.store_item_id,
    v_quote.id,
    v_quote.quantity,
    v_quote.currency_code,
    v_quote.final_unit_price,
    v_quote.final_total_price,
    null,
    v_idempotency_key,
    'FAILED',
    p_client_submitted_at
  )
  returning *
  into v_purchase;

  select *
  into v_ledger
  from public.record_player_ledger_entry(
    p_game_session_id,
    p_player_id,
    'cash',
    -v_quote.final_total_price,
    v_quote.currency_code,
    'debit',
    'store',
    'store_purchase',
    v_purchase.id,
    'player',
    p_player_id,
    jsonb_build_object(
      'quote_id', v_quote.id,
      'store_item_id', v_quote.store_item_id,
      'quantity', v_quote.quantity,
      'final_unit_price', v_quote.final_unit_price,
      'final_total_price', v_quote.final_total_price
    ) || coalesce(p_request_metadata, '{}'::jsonb)
  );

  update public.store_items
  set stock_quantity = stock_quantity - v_quote.quantity
  where id = v_item.id
    and game_session_id = p_game_session_id;

  insert into public.inventory_holdings (
    game_session_id,
    player_id,
    store_item_id,
    quantity_owned,
    quantity_reserved
  )
  values (
    p_game_session_id,
    p_player_id,
    v_quote.store_item_id,
    v_quote.quantity,
    0
  )
  on conflict on constraint inventory_holdings_scope_unique
  do update
  set quantity_owned = public.inventory_holdings.quantity_owned + excluded.quantity_owned
  returning *
  into v_inventory;

  insert into public.inventory_events (
    game_session_id,
    player_id,
    store_item_id,
    quantity_delta,
    event_type,
    source_domain,
    source_action,
    source_id,
    metadata
  )
  values (
    p_game_session_id,
    p_player_id,
    v_quote.store_item_id,
    v_quote.quantity,
    'PURCHASED',
    'store',
    'store_purchase',
    v_purchase.id,
    jsonb_build_object(
      'quote_id', v_quote.id,
      'ledger_entry_id', v_ledger.ledger_entry_id,
      'final_total_price', v_quote.final_total_price,
      'currency_code', v_quote.currency_code
    )
  );

  update public.store_purchase_quotes
  set
    status = 'USED',
    used_at = v_now
  where id = v_quote.id;

  update public.store_purchases
  set
    ledger_entry_id = v_ledger.ledger_entry_id,
    status = 'COMPLETED'
  where id = v_purchase.id
  returning *
  into v_purchase;

  v_response_body := jsonb_build_object(
    'ok', true,
    'message', 'Purchase complete.',
    'purchaseId', v_purchase.id,
    'quoteId', v_quote.id,
    'finalTotalPrice', v_purchase.final_total_price,
    'currencyCode', v_purchase.currency_code,
    'refreshRequired', true
  );

  update public.mutation_idempotency_keys
  set
    status = 'COMPLETED',
    result_type = 'store_purchase',
    result_id = v_purchase.id,
    response_body = v_response_body,
    completed_at = v_now
  where id = v_idempotency.id;

  return query
  select
    v_purchase.id,
    v_quote.id,
    v_quote.store_item_id,
    v_quote.quantity,
    v_quote.final_unit_price,
    v_quote.final_total_price,
    v_quote.currency_code,
    v_ledger.ledger_entry_id,
    v_inventory.id,
    v_inventory.quantity_owned,
    v_now;
end;
$$;

comment on function public.purchase_quoted_store_item(
  uuid,
  uuid,
  uuid,
  text,
  timestamptz,
  jsonb
) is
  'Atomically executes a quoted store purchase: validates quote, debits cash, decrements stock, updates inventory, records purchase/audit/idempotency state, and returns purchase details.';

revoke all on function public.purchase_quoted_store_item(
  uuid,
  uuid,
  uuid,
  text,
  timestamptz,
  jsonb
) from public;

grant execute on function public.purchase_quoted_store_item(
  uuid,
  uuid,
  uuid,
  text,
  timestamptz,
  jsonb
) to service_role;
