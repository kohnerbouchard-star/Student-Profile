-- Repair missing store purchase execution RPC if migration history drift marked it as applied.
-- This is idempotent and does not drop existing data.

CREATE OR REPLACE FUNCTION public.purchase_quoted_store_item(
  p_game_session_id uuid,
  p_player_id uuid,
  p_quote_id uuid,
  p_idempotency_key text,
  p_client_submitted_at timestamptz DEFAULT NULL,
  p_request_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
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
BEGIN
  IF p_game_session_id IS NULL THEN
    RAISE EXCEPTION 'GAME_SESSION_REQUIRED' USING errcode = 'P0001';
  END IF;

  IF p_player_id IS NULL THEN
    RAISE EXCEPTION 'PLAYER_REQUIRED' USING errcode = 'P0001';
  END IF;

  IF p_quote_id IS NULL THEN
    RAISE EXCEPTION 'QUOTE_REQUIRED' USING errcode = 'P0001';
  END IF;

  IF length(v_idempotency_key) = 0 THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING errcode = 'P0001';
  END IF;

  IF jsonb_typeof(coalesce(p_request_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_REQUEST_METADATA' USING errcode = 'P0001';
  END IF;

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

  INSERT INTO public.mutation_idempotency_keys (
    game_session_id,
    player_id,
    route_key,
    idempotency_key,
    request_hash,
    status,
    expires_at
  )
  VALUES (
    p_game_session_id,
    p_player_id,
    'players.me.store.purchases',
    v_idempotency_key,
    v_request_hash,
    'STARTED',
    v_now + interval '7 days'
  )
  ON CONFLICT ON CONSTRAINT mutation_idempotency_keys_scope_unique
  DO NOTHING;

  SELECT *
  INTO v_idempotency
  FROM public.mutation_idempotency_keys
  WHERE game_session_id = p_game_session_id
    AND player_id = p_player_id
    AND route_key = 'players.me.store.purchases'
    AND idempotency_key = v_idempotency_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IDEMPOTENCY_LOOKUP_FAILED' USING errcode = 'P0001';
  END IF;

  IF v_idempotency.request_hash <> v_request_hash THEN
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING errcode = 'P0001';
  END IF;

  IF v_idempotency.status = 'COMPLETED' THEN
    IF v_idempotency.result_id IS NULL THEN
      RAISE EXCEPTION 'IDEMPOTENCY_RESULT_MISSING' USING errcode = 'P0001';
    END IF;

    SELECT *
    INTO v_purchase
    FROM public.store_purchases
    WHERE id = v_idempotency.result_id
      AND game_session_id = p_game_session_id
      AND player_id = p_player_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'IDEMPOTENCY_RESULT_NOT_FOUND' USING errcode = 'P0001';
    END IF;

    SELECT *
    INTO v_inventory
    FROM public.inventory_holdings
    WHERE game_session_id = p_game_session_id
      AND player_id = p_player_id
      AND store_item_id = v_purchase.store_item_id;

    RETURN QUERY
    SELECT
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
    RETURN;
  END IF;

  IF v_idempotency.status <> 'STARTED' THEN
    RAISE EXCEPTION 'IDEMPOTENCY_IN_PROGRESS' USING errcode = 'P0001';
  END IF;

  SELECT *
  INTO v_quote
  FROM public.store_purchase_quotes
  WHERE id = p_quote_id
    AND game_session_id = p_game_session_id
    AND player_id = p_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QUOTE_NOT_FOUND' USING errcode = 'P0001';
  END IF;

  IF v_quote.status <> 'CREATED' THEN
    RAISE EXCEPTION 'QUOTE_NOT_USABLE' USING errcode = 'P0001';
  END IF;

  IF v_quote.expires_at <= v_now THEN
    UPDATE public.store_purchase_quotes
    SET status = 'EXPIRED'
    WHERE id = v_quote.id;

    RAISE EXCEPTION 'QUOTE_EXPIRED' USING errcode = 'P0001';
  END IF;

  SELECT *
  INTO v_item
  FROM public.store_items
  WHERE id = v_quote.store_item_id
    AND game_session_id = p_game_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING errcode = 'P0001';
  END IF;

  IF v_item.status <> 'active' OR v_item.visibility <> 'visible' THEN
    RAISE EXCEPTION 'ITEM_UNAVAILABLE' USING errcode = 'P0001';
  END IF;

  IF v_item.stock_quantity < v_quote.quantity THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING errcode = 'P0001';
  END IF;

  SELECT *
  INTO v_balance
  FROM public.account_balances
  WHERE game_session_id = p_game_session_id
    AND player_id = p_player_id
    AND account_type = 'cash'
    AND currency_code = v_quote.currency_code
  FOR UPDATE;

  IF NOT FOUND OR v_balance.balance < v_quote.final_total_price THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE' USING errcode = 'P0001';
  END IF;

  INSERT INTO public.store_purchases (
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
  VALUES (
    p_game_session_id,
    p_player_id,
    v_quote.store_item_id,
    v_quote.id,
    v_quote.quantity,
    v_quote.currency_code,
    v_quote.final_unit_price,
    v_quote.final_total_price,
    NULL,
    v_idempotency_key,
    'FAILED',
    p_client_submitted_at
  )
  RETURNING *
  INTO v_purchase;

  SELECT *
  INTO v_ledger
  FROM public.record_player_ledger_entry(
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

  UPDATE public.store_items
  SET stock_quantity = stock_quantity - v_quote.quantity
  WHERE id = v_item.id
    AND game_session_id = p_game_session_id;

  INSERT INTO public.inventory_holdings (
    game_session_id,
    player_id,
    store_item_id,
    quantity_owned,
    quantity_reserved
  )
  VALUES (
    p_game_session_id,
    p_player_id,
    v_quote.store_item_id,
    v_quote.quantity,
    0
  )
  ON CONFLICT ON CONSTRAINT inventory_holdings_scope_unique
  DO UPDATE
  SET quantity_owned = public.inventory_holdings.quantity_owned + excluded.quantity_owned
  RETURNING *
  INTO v_inventory;

  INSERT INTO public.inventory_events (
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
  VALUES (
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

  UPDATE public.store_purchase_quotes
  SET
    status = 'USED',
    used_at = v_now
  WHERE id = v_quote.id;

  UPDATE public.store_purchases
  SET
    ledger_entry_id = v_ledger.ledger_entry_id,
    status = 'COMPLETED'
  WHERE id = v_purchase.id
  RETURNING *
  INTO v_purchase;

  v_response_body := jsonb_build_object(
    'ok', true,
    'message', 'Purchase complete.',
    'purchaseId', v_purchase.id,
    'quoteId', v_quote.id,
    'finalTotalPrice', v_purchase.final_total_price,
    'currencyCode', v_purchase.currency_code,
    'refreshRequired', true
  );

  UPDATE public.mutation_idempotency_keys
  SET
    status = 'COMPLETED',
    result_type = 'store_purchase',
    result_id = v_purchase.id,
    response_body = v_response_body,
    completed_at = v_now
  WHERE id = v_idempotency.id;

  RETURN QUERY
  SELECT
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
END;
$$;

COMMENT ON FUNCTION public.purchase_quoted_store_item(
  uuid,
  uuid,
  uuid,
  text,
  timestamptz,
  jsonb
) IS
  'Atomically executes a quoted store purchase: validates quote, debits cash, decrements stock, updates inventory, records purchase/audit/idempotency state, and returns purchase details.';

REVOKE ALL ON FUNCTION public.purchase_quoted_store_item(
  uuid,
  uuid,
  uuid,
  text,
  timestamptz,
  jsonb
) FROM public;

GRANT EXECUTE ON FUNCTION public.purchase_quoted_store_item(
  uuid,
  uuid,
  uuid,
  text,
  timestamptz,
  jsonb
) TO service_role;
