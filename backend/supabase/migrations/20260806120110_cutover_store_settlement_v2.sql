-- Store settlement canonical inventory cutover V2.
-- Part 2 of 6 from the reviewed domain migration; ordered and forward-only.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Store settlement: commercial offer remains the receipt/provenance authority;
-- canonical account + game item is the ownership authority.
-- ---------------------------------------------------------------------------

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
set search_path = public, economy_private, extensions, pg_temp
as $function$
declare
  v_now timestamptz := statement_timestamp();
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_request_hash text;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_quote public.store_purchase_quotes%rowtype;
  v_item public.store_items%rowtype;
  v_balance public.account_balances%rowtype;
  v_purchase public.store_purchases%rowtype;
  v_ledger record;
  v_inventory public.inventory_holdings%rowtype;
  v_player_account_id uuid;
  v_inventory_transaction jsonb;
  v_response_body jsonb;
begin
  if p_game_session_id is null then
    raise exception 'GAME_SESSION_REQUIRED' using errcode = 'P0001';
  end if;
  if p_player_id is null then
    raise exception 'PLAYER_REQUIRED' using errcode = 'P0001';
  end if;
  if p_quote_id is null then
    raise exception 'QUOTE_REQUIRED' using errcode = 'P0001';
  end if;
  if length(v_idempotency_key) = 0 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_request_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'INVALID_REQUEST_METADATA' using errcode = 'P0001';
  end if;

  v_request_hash := encode(
    extensions.digest(
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

  insert into public.mutation_idempotency_keys(
    game_session_id, player_id, route_key, idempotency_key,
    request_hash, status, expires_at
  ) values (
    p_game_session_id, p_player_id, 'players.me.store.purchases',
    v_idempotency_key, v_request_hash, 'STARTED', v_now + interval '7 days'
  )
  on conflict on constraint mutation_idempotency_keys_scope_unique do nothing;

  select mik.* into v_idempotency
  from public.mutation_idempotency_keys mik
  where mik.game_session_id = p_game_session_id
    and mik.player_id = p_player_id
    and mik.route_key = 'players.me.store.purchases'
    and mik.idempotency_key = v_idempotency_key
  for update;

  if not found then
    raise exception 'IDEMPOTENCY_LOOKUP_FAILED' using errcode = 'P0001';
  end if;
  if v_idempotency.request_hash <> v_request_hash then
    raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;

  v_player_account_id := economy_private.ensure_player_inventory_account_v2(
    p_game_session_id,
    p_player_id
  );

  if v_idempotency.status = 'COMPLETED' then
    if v_idempotency.result_id is null then
      raise exception 'IDEMPOTENCY_RESULT_MISSING' using errcode = 'P0001';
    end if;

    select sp.* into v_purchase
    from public.store_purchases sp
    where sp.id = v_idempotency.result_id
      and sp.game_session_id = p_game_session_id
      and sp.player_id = p_player_id;
    if not found then
      raise exception 'IDEMPOTENCY_RESULT_NOT_FOUND' using errcode = 'P0001';
    end if;

    select si.* into v_item
    from public.store_items si
    where si.id = v_purchase.store_item_id
      and si.game_session_id = p_game_session_id;
    if not found then
      raise exception 'IDEMPOTENCY_ITEM_NOT_FOUND' using errcode = 'P0001';
    end if;

    select h.* into v_inventory
    from public.inventory_holdings h
    where h.game_session_id = p_game_session_id
      and h.inventory_account_id = v_player_account_id
      and h.game_item_id = v_item.game_item_id;

    return query select
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
    raise exception 'IDEMPOTENCY_IN_PROGRESS' using errcode = 'P0001';
  end if;

  select q.* into v_quote
  from public.store_purchase_quotes q
  where q.id = p_quote_id
    and q.game_session_id = p_game_session_id
    and q.player_id = p_player_id
  for update;
  if not found then
    raise exception 'QUOTE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_quote.status <> 'CREATED' then
    raise exception 'QUOTE_NOT_USABLE' using errcode = 'P0001';
  end if;
  if v_quote.expires_at <= v_now then
    update public.store_purchase_quotes set status = 'EXPIRED' where id = v_quote.id;
    raise exception 'QUOTE_EXPIRED' using errcode = 'P0001';
  end if;

  select si.* into v_item
  from public.store_items si
  where si.id = v_quote.store_item_id
    and si.game_session_id = p_game_session_id
  for update;
  if not found then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_item.status <> 'active' or v_item.visibility <> 'visible' then
    raise exception 'ITEM_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_item.game_item_id is null or v_item.inventory_account_id is null then
    raise exception 'ITEM_CANONICAL_CONTEXT_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_item.stock_quantity < v_quote.quantity then
    raise exception 'INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;

  select ab.* into v_balance
  from public.account_balances ab
  where ab.game_session_id = p_game_session_id
    and ab.player_id = p_player_id
    and ab.account_type = 'cash'
    and ab.currency_code = v_quote.currency_code
  for update;
  if not found or v_balance.balance < v_quote.final_total_price then
    raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
  end if;

  insert into public.store_purchases(
    game_session_id, player_id, store_item_id, quote_id, quantity,
    currency_code, item_currency_code, player_currency_code, exchange_rate,
    item_local_final_unit_price, item_local_final_total_price,
    final_unit_price, final_total_price, ledger_entry_id,
    idempotency_key, status, client_submitted_at
  ) values (
    p_game_session_id, p_player_id, v_quote.store_item_id, v_quote.id, v_quote.quantity,
    v_quote.currency_code,
    coalesce(v_quote.item_currency_code, v_quote.currency_code),
    coalesce(v_quote.player_currency_code, v_quote.currency_code),
    coalesce(v_quote.exchange_rate, 1),
    coalesce(v_quote.item_local_final_unit_price, v_quote.final_unit_price),
    coalesce(v_quote.item_local_final_total_price, v_quote.final_total_price),
    v_quote.final_unit_price, v_quote.final_total_price, null,
    v_idempotency_key, 'FAILED', p_client_submitted_at
  ) returning * into v_purchase;

  select * into v_ledger
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
      'game_item_id', v_item.game_item_id,
      'quantity', v_quote.quantity,
      'item_currency_code', coalesce(v_quote.item_currency_code, v_quote.currency_code),
      'player_currency_code', coalesce(v_quote.player_currency_code, v_quote.currency_code),
      'exchange_rate', coalesce(v_quote.exchange_rate, 1),
      'item_local_final_unit_price', coalesce(v_quote.item_local_final_unit_price, v_quote.final_unit_price),
      'item_local_final_total_price', coalesce(v_quote.item_local_final_total_price, v_quote.final_total_price),
      'final_unit_price', v_quote.final_unit_price,
      'final_total_price', v_quote.final_total_price
    ) || coalesce(p_request_metadata, '{}'::jsonb)
  );

  -- Post both sides before updating the legacy Store stock projection. The Store
  -- stock trigger then ratchets the exact value rather than applying a second delta.
  v_inventory_transaction := economy_private.post_inventory_transaction_v2(
    p_game_session_id,
    'purchase',
    'store',
    'store_purchase',
    v_purchase.id,
    v_idempotency_key,
    jsonb_build_object(
      'quoteId', v_quote.id,
      'storeItemId', v_item.id,
      'gameItemId', v_item.game_item_id,
      'ledgerEntryId', v_ledger.ledger_entry_id
    ),
    jsonb_build_array(
      jsonb_build_object(
        'inventoryAccountId', v_item.inventory_account_id,
        'gameItemId', v_item.game_item_id,
        'storeItemId', v_item.id,
        'quantityDelta', -v_quote.quantity,
        'reservationDelta', 0,
        'unitCost', v_item.price,
        'currencyCode', v_item.currency_code,
        'metadata', jsonb_build_object('side','store_stock')
      ),
      jsonb_build_object(
        'inventoryAccountId', v_player_account_id,
        'gameItemId', v_item.game_item_id,
        'playerId', p_player_id,
        'storeItemId', v_item.id,
        'quantityDelta', v_quote.quantity,
        'reservationDelta', 0,
        'unitCost', v_quote.final_unit_price,
        'currencyCode', v_quote.currency_code,
        'eventType', 'PURCHASED',
        'legacyEventQuantityDelta', v_quote.quantity,
        'eventMetadata', jsonb_build_object(
          'quote_id', v_quote.id,
          'ledger_entry_id', v_ledger.ledger_entry_id,
          'game_item_id', v_item.game_item_id,
          'item_currency_code', coalesce(v_quote.item_currency_code, v_quote.currency_code),
          'player_currency_code', coalesce(v_quote.player_currency_code, v_quote.currency_code),
          'exchange_rate', coalesce(v_quote.exchange_rate, 1),
          'item_local_final_total_price', coalesce(v_quote.item_local_final_total_price, v_quote.final_total_price),
          'final_total_price', v_quote.final_total_price,
          'currency_code', v_quote.currency_code
        )
      )
    )
  );

  update public.store_items
  set stock_quantity = stock_quantity - v_quote.quantity
  where id = v_item.id and game_session_id = p_game_session_id;

  select h.* into v_inventory
  from public.inventory_holdings h
  where h.game_session_id = p_game_session_id
    and h.inventory_account_id = v_player_account_id
    and h.game_item_id = v_item.game_item_id;
  if not found then
    raise exception 'INVENTORY_POSTING_RESULT_MISSING' using errcode = 'P0001';
  end if;

  update public.store_purchase_quotes
  set status = 'USED', used_at = v_now
  where id = v_quote.id;

  update public.store_purchases
  set ledger_entry_id = v_ledger.ledger_entry_id, status = 'COMPLETED'
  where id = v_purchase.id
  returning * into v_purchase;

  v_response_body := jsonb_build_object(
    'ok', true,
    'message', 'Purchase complete.',
    'purchaseId', v_purchase.id,
    'quoteId', v_quote.id,
    'gameItemId', v_item.game_item_id,
    'inventoryTransactionKey', v_inventory_transaction->>'transactionKey',
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

  return query select
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
end
$function$;

comment on function public.purchase_quoted_store_item(
  uuid, uuid, uuid, text, timestamptz, jsonb
) is
  'Atomically settles a Store offer and posts canonical Store-stock and player-inventory movements without using the Store offer as owned-item identity.';

revoke all on function public.purchase_quoted_store_item(
  uuid, uuid, uuid, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.purchase_quoted_store_item(
  uuid, uuid, uuid, text, timestamptz, jsonb
) to service_role;

create or replace function public.purchase_quoted_store_item_public_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_quote_key text,
  p_idempotency_key text,
  p_client_submitted_at timestamptz default null,
  p_request_metadata jsonb default '{}'::jsonb
)
returns table (
  receipt_key text,
  quote_key text,
  item_key text,
  item_name text,
  quantity integer,
  final_unit_price numeric,
  final_total_price numeric,
  currency_code text,
  inventory_quantity_owned integer,
  completed_at timestamptz,
  already_completed boolean
)
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_quote_id uuid;
  v_result record;
  v_replay boolean;
  v_game_status text;
  v_player_account_id uuid;
begin
  select q.id into v_quote_id
  from public.store_purchase_quotes q
  where q.public_quote_key = lower(btrim(p_quote_key))
    and q.game_session_id = p_game_session_id
    and q.player_id = p_player_id;
  if not found then
    raise exception 'QUOTE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select exists (
    select 1
    from public.store_purchases p
    where p.game_session_id = p_game_session_id
      and p.player_id = p_player_id
      and p.idempotency_key = btrim(p_idempotency_key)
      and p.status = 'COMPLETED'
  ) into v_replay;

  if not v_replay then
    select game.status into v_game_status
    from public.game_sessions game
    where game.id = p_game_session_id
    for share;
    if not found then
      raise exception 'GAME_SESSION_NOT_FOUND' using errcode = 'P0001';
    end if;
    if v_game_status = 'disabled' then
      raise exception 'GAME_SESSION_DISABLED' using errcode = 'P0001';
    end if;
    if v_game_status = 'archived' then
      raise exception 'GAME_SESSION_ARCHIVED' using errcode = 'P0001';
    end if;
    if v_game_status <> 'active' then
      raise exception 'GAME_SESSION_NOT_ACTIVE' using errcode = 'P0001';
    end if;
  end if;

  select * into v_result
  from public.purchase_quoted_store_item(
    p_game_session_id,
    p_player_id,
    v_quote_id,
    p_idempotency_key,
    p_client_submitted_at,
    coalesce(p_request_metadata, '{}'::jsonb)
  );

  v_player_account_id := economy_private.ensure_player_inventory_account_v2(
    p_game_session_id,
    p_player_id
  );

  return query
  select
    p.public_receipt_key,
    q.public_quote_key,
    i.item_key,
    i.name,
    p.quantity,
    p.final_unit_price,
    p.final_total_price,
    p.currency_code,
    coalesce(h.quantity_owned, 0),
    p.created_at,
    v_replay
  from public.store_purchases p
  join public.store_purchase_quotes q on q.id = p.quote_id
  join public.store_items i on i.id = p.store_item_id
  left join public.inventory_holdings h
    on h.game_session_id = p.game_session_id
   and h.inventory_account_id = v_player_account_id
   and h.game_item_id = i.game_item_id
  where p.id = v_result.purchase_id
    and p.game_session_id = p_game_session_id
    and p.player_id = p_player_id;
end
$function$;

revoke all on function public.purchase_quoted_store_item_public_v1(
  uuid, uuid, text, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.purchase_quoted_store_item_public_v1(
  uuid, uuid, text, text, timestamptz, jsonb
) to service_role;


commit;
