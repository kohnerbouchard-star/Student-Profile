-- Stock country-cash currency V1.
-- Retires ECO from stock order execution by using the player's assigned country currency.

ALTER TABLE public.stock_orders
ALTER COLUMN cash_currency_code DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.execute_stock_order(
  p_game_session_id uuid,
  p_player_session_id uuid,
  p_stock_asset_id uuid,
  p_side text,
  p_quantity numeric,
  p_idempotency_key text
)
RETURNS TABLE (
  order_id uuid,
  trade_id uuid,
  stock_asset_id uuid,
  ticker text,
  side text,
  quantity numeric,
  execution_price numeric,
  gross_value numeric,
  status text,
  rejection_reason text,
  cash_balance_after numeric,
  cash_currency_code text,
  holding_quantity_after numeric,
  average_cost_after numeric,
  realized_pnl numeric,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_side text := lower(btrim(coalesce(p_side, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_player_session public.player_sessions%rowtype;
  v_asset record;
  v_assignment record;
  v_cash_currency_code text;
  v_cash_balance public.account_balances%rowtype;
  v_existing_cash_balance numeric(20, 4) := 0;
  v_holding public.stock_holdings%rowtype;
  v_existing_holding_quantity numeric(20, 4) := 0;
  v_existing_average_cost numeric(18, 4) := 0;
  v_new_holding_quantity numeric(20, 4) := 0;
  v_new_average_cost numeric(18, 4) := 0;
  v_realized_pnl numeric(20, 4) := 0;
  v_gross_value numeric(20, 4) := 0;
  v_order public.stock_orders%rowtype;
  v_trade public.stock_trades%rowtype;
  v_ledger record;
BEGIN
  IF p_game_session_id IS NULL THEN
    RAISE EXCEPTION 'STOCK_TRADING_GAME_SESSION_REQUIRED';
  END IF;

  IF p_player_session_id IS NULL THEN
    RAISE EXCEPTION 'STOCK_TRADING_PLAYER_SESSION_REQUIRED';
  END IF;

  IF p_stock_asset_id IS NULL THEN
    RAISE EXCEPTION 'STOCK_TRADING_STOCK_ASSET_REQUIRED';
  END IF;

  IF v_side NOT IN ('buy', 'sell') THEN
    RAISE EXCEPTION 'STOCK_TRADING_INVALID_SIDE';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'STOCK_TRADING_INVALID_QUANTITY';
  END IF;

  IF length(v_idempotency_key) = 0 THEN
    RAISE EXCEPTION 'STOCK_TRADING_IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  SELECT existing_order.*
  INTO v_order
  FROM public.stock_orders existing_order
  WHERE existing_order.game_session_id = p_game_session_id
    AND existing_order.player_session_id = p_player_session_id
    AND existing_order.idempotency_key = v_idempotency_key;

  IF FOUND THEN
    SELECT existing_trade.*
    INTO v_trade
    FROM public.stock_trades existing_trade
    WHERE existing_trade.order_id = v_order.id;

    RETURN QUERY
    SELECT
      v_order.id,
      v_trade.id,
      v_order.stock_asset_id,
      v_order.ticker,
      v_order.side,
      v_order.quantity,
      v_order.execution_price,
      v_order.gross_value,
      v_order.status,
      v_order.rejection_reason,
      v_order.cash_balance_after,
      v_order.cash_currency_code,
      v_order.holding_quantity_after,
      v_order.average_cost_after,
      coalesce((SELECT holding.realized_pnl FROM public.stock_holdings holding WHERE holding.game_session_id = v_order.game_session_id AND holding.player_id = v_order.player_id AND holding.stock_asset_id = v_order.stock_asset_id), 0),
      v_order.created_at;
    RETURN;
  END IF;

  SELECT player_session.*
  INTO v_player_session
  FROM public.player_sessions player_session
  WHERE player_session.id = p_player_session_id
    AND player_session.game_session_id = p_game_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STOCK_TRADING_PLAYER_SESSION_NOT_FOUND';
  END IF;

  SELECT asset.id, asset.ticker, asset.current_price
  INTO v_asset
  FROM public.game_session_stock_assets asset
  WHERE asset.game_session_id = p_game_session_id
    AND asset.id = p_stock_asset_id
    AND asset.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STOCK_TRADING_STOCK_ASSET_NOT_FOUND';
  END IF;

  SELECT country.currency_code
  INTO v_assignment
  FROM public.player_country_assignments assignment
  JOIN public.country_profiles country
    ON country.id = assignment.country_profile_id
   AND country.game_session_id = assignment.game_session_id
  WHERE assignment.game_session_id = p_game_session_id
    AND assignment.player_id = v_player_session.player_id
    AND assignment.status = 'active'
  ORDER BY assignment.assigned_at DESC
  LIMIT 1;

  IF NOT FOUND OR v_assignment.currency_code IS NULL OR length(btrim(v_assignment.currency_code)) = 0 THEN
    RAISE EXCEPTION 'STOCK_TRADING_PLAYER_CURRENCY_NOT_FOUND';
  END IF;

  v_cash_currency_code := upper(btrim(v_assignment.currency_code));

  SELECT balance.*
  INTO v_cash_balance
  FROM public.account_balances balance
  WHERE balance.game_session_id = p_game_session_id
    AND balance.player_id = v_player_session.player_id
    AND balance.account_type = 'cash'
    AND balance.currency_code = v_cash_currency_code
  FOR UPDATE;

  IF FOUND THEN
    v_existing_cash_balance := v_cash_balance.balance;
  END IF;

  v_gross_value := v_asset.current_price * p_quantity;

  SELECT holding.*
  INTO v_holding
  FROM public.stock_holdings holding
  WHERE holding.game_session_id = p_game_session_id
    AND holding.player_id = v_player_session.player_id
    AND holding.stock_asset_id = p_stock_asset_id
  FOR UPDATE;

  IF FOUND THEN
    v_existing_holding_quantity := v_holding.quantity;
    v_existing_average_cost := v_holding.average_cost;
  END IF;

  IF v_side = 'buy' THEN
    IF v_existing_cash_balance < v_gross_value THEN
      INSERT INTO public.stock_orders (
        game_session_id,
        player_session_id,
        player_id,
        stock_asset_id,
        ticker,
        side,
        order_type,
        quantity,
        requested_price,
        execution_price,
        gross_value,
        status,
        rejection_reason,
        idempotency_key,
        cash_balance_after,
        cash_currency_code,
        holding_quantity_after,
        average_cost_after
      )
      VALUES (
        p_game_session_id,
        p_player_session_id,
        v_player_session.player_id,
        p_stock_asset_id,
        v_asset.ticker,
        v_side,
        'market',
        p_quantity,
        NULL,
        v_asset.current_price,
        v_gross_value,
        'rejected',
        'insufficient_cash',
        v_idempotency_key,
        v_existing_cash_balance,
        v_cash_currency_code,
        v_existing_holding_quantity,
        v_existing_average_cost
      )
      RETURNING * INTO v_order;
    ELSE
      INSERT INTO public.stock_holdings (
        game_session_id,
        player_session_id,
        player_id,
        stock_asset_id,
        ticker,
        quantity,
        reserved_quantity,
        average_cost,
        realized_pnl
      )
      VALUES (
        p_game_session_id,
        p_player_session_id,
        v_player_session.player_id,
        p_stock_asset_id,
        v_asset.ticker,
        0,
        0,
        0,
        0
      )
      ON CONFLICT ON CONSTRAINT stock_holdings_scope_unique DO NOTHING;

      SELECT holding.*
      INTO v_holding
      FROM public.stock_holdings holding
      WHERE holding.game_session_id = p_game_session_id
        AND holding.player_id = v_player_session.player_id
        AND holding.stock_asset_id = p_stock_asset_id
      FOR UPDATE;

      v_new_holding_quantity := v_holding.quantity + p_quantity;
      v_new_average_cost := (
        (v_holding.quantity * v_holding.average_cost) + v_gross_value
      ) / v_new_holding_quantity;

      INSERT INTO public.stock_orders (
        game_session_id,
        player_session_id,
        player_id,
        stock_asset_id,
        ticker,
        side,
        order_type,
        quantity,
        requested_price,
        execution_price,
        gross_value,
        status,
        rejection_reason,
        idempotency_key,
        cash_balance_after,
        cash_currency_code,
        holding_quantity_after,
        average_cost_after,
        filled_at
      )
      VALUES (
        p_game_session_id,
        p_player_session_id,
        v_player_session.player_id,
        p_stock_asset_id,
        v_asset.ticker,
        v_side,
        'market',
        p_quantity,
        NULL,
        v_asset.current_price,
        v_gross_value,
        'filled',
        NULL,
        v_idempotency_key,
        v_existing_cash_balance - v_gross_value,
        v_cash_currency_code,
        v_new_holding_quantity,
        v_new_average_cost,
        now()
      )
      RETURNING * INTO v_order;

      SELECT *
      INTO v_ledger
      FROM public.record_player_ledger_entry(
        p_game_session_id,
        v_player_session.player_id,
        'cash',
        -v_gross_value,
        v_cash_currency_code,
        'debit',
        'stocks',
        'stock_buy',
        v_order.id,
        'player',
        v_player_session.player_id,
        jsonb_build_object(
          'stock_asset_id', p_stock_asset_id,
          'ticker', v_asset.ticker,
          'quantity', p_quantity,
          'execution_price', v_asset.current_price,
          'gross_value', v_gross_value,
          'player_session_id', p_player_session_id
        )
      );

      IF v_ledger.balance < 0 THEN
        RAISE EXCEPTION 'STOCK_TRADING_NEGATIVE_CASH_BALANCE';
      END IF;

      UPDATE public.stock_holdings holding
      SET
        player_session_id = p_player_session_id,
        ticker = v_asset.ticker,
        quantity = v_new_holding_quantity,
        average_cost = v_new_average_cost
      WHERE holding.id = v_holding.id
      RETURNING * INTO v_holding;

      UPDATE public.stock_orders stock_order
      SET
        cash_balance_after = v_ledger.balance,
        cash_currency_code = v_ledger.currency_code,
        holding_quantity_after = v_holding.quantity,
        average_cost_after = v_holding.average_cost
      WHERE stock_order.id = v_order.id
      RETURNING * INTO v_order;

      INSERT INTO public.stock_trades (
        order_id,
        game_session_id,
        player_session_id,
        player_id,
        stock_asset_id,
        ticker,
        side,
        quantity,
        execution_price,
        gross_value
      )
      VALUES (
        v_order.id,
        p_game_session_id,
        p_player_session_id,
        v_player_session.player_id,
        p_stock_asset_id,
        v_asset.ticker,
        v_side,
        p_quantity,
        v_asset.current_price,
        v_gross_value
      )
      RETURNING * INTO v_trade;
    END IF;
  ELSE
    IF v_existing_holding_quantity < p_quantity THEN
      INSERT INTO public.stock_orders (
        game_session_id,
        player_session_id,
        player_id,
        stock_asset_id,
        ticker,
        side,
        order_type,
        quantity,
        requested_price,
        execution_price,
        gross_value,
        status,
        rejection_reason,
        idempotency_key,
        cash_balance_after,
        cash_currency_code,
        holding_quantity_after,
        average_cost_after
      )
      VALUES (
        p_game_session_id,
        p_player_session_id,
        v_player_session.player_id,
        p_stock_asset_id,
        v_asset.ticker,
        v_side,
        'market',
        p_quantity,
        NULL,
        v_asset.current_price,
        v_gross_value,
        'rejected',
        'insufficient_shares',
        v_idempotency_key,
        v_existing_cash_balance,
        v_cash_currency_code,
        v_existing_holding_quantity,
        v_existing_average_cost
      )
      RETURNING * INTO v_order;
    ELSE
      v_new_holding_quantity := v_holding.quantity - p_quantity;
      v_new_average_cost := CASE
        WHEN v_new_holding_quantity = 0 THEN 0
        ELSE v_holding.average_cost
      END;
      v_realized_pnl := (v_asset.current_price - v_holding.average_cost) * p_quantity;

      INSERT INTO public.stock_orders (
        game_session_id,
        player_session_id,
        player_id,
        stock_asset_id,
        ticker,
        side,
        order_type,
        quantity,
        requested_price,
        execution_price,
        gross_value,
        status,
        rejection_reason,
        idempotency_key,
        cash_balance_after,
        cash_currency_code,
        holding_quantity_after,
        average_cost_after,
        filled_at
      )
      VALUES (
        p_game_session_id,
        p_player_session_id,
        v_player_session.player_id,
        p_stock_asset_id,
        v_asset.ticker,
        v_side,
        'market',
        p_quantity,
        NULL,
        v_asset.current_price,
        v_gross_value,
        'filled',
        NULL,
        v_idempotency_key,
        v_existing_cash_balance + v_gross_value,
        v_cash_currency_code,
        v_new_holding_quantity,
        v_new_average_cost,
        now()
      )
      RETURNING * INTO v_order;

      SELECT *
      INTO v_ledger
      FROM public.record_player_ledger_entry(
        p_game_session_id,
        v_player_session.player_id,
        'cash',
        v_gross_value,
        v_cash_currency_code,
        'credit',
        'stocks',
        'stock_sell',
        v_order.id,
        'player',
        v_player_session.player_id,
        jsonb_build_object(
          'stock_asset_id', p_stock_asset_id,
          'ticker', v_asset.ticker,
          'quantity', p_quantity,
          'execution_price', v_asset.current_price,
          'gross_value', v_gross_value,
          'realized_pnl', v_realized_pnl,
          'player_session_id', p_player_session_id
        )
      );

      UPDATE public.stock_holdings holding
      SET
        player_session_id = p_player_session_id,
        ticker = v_asset.ticker,
        quantity = v_new_holding_quantity,
        average_cost = v_new_average_cost,
        realized_pnl = holding.realized_pnl + v_realized_pnl
      WHERE holding.id = v_holding.id
      RETURNING * INTO v_holding;

      UPDATE public.stock_orders stock_order
      SET
        cash_balance_after = v_ledger.balance,
        cash_currency_code = v_ledger.currency_code,
        holding_quantity_after = v_holding.quantity,
        average_cost_after = v_holding.average_cost
      WHERE stock_order.id = v_order.id
      RETURNING * INTO v_order;

      INSERT INTO public.stock_trades (
        order_id,
        game_session_id,
        player_session_id,
        player_id,
        stock_asset_id,
        ticker,
        side,
        quantity,
        execution_price,
        gross_value
      )
      VALUES (
        v_order.id,
        p_game_session_id,
        p_player_session_id,
        v_player_session.player_id,
        p_stock_asset_id,
        v_asset.ticker,
        v_side,
        p_quantity,
        v_asset.current_price,
        v_gross_value
      )
      RETURNING * INTO v_trade;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    v_order.id,
    v_trade.id,
    v_order.stock_asset_id,
    v_order.ticker,
    v_order.side,
    v_order.quantity,
    v_order.execution_price,
    v_order.gross_value,
    v_order.status,
    v_order.rejection_reason,
    v_order.cash_balance_after,
    v_order.cash_currency_code,
    v_order.holding_quantity_after,
    v_order.average_cost_after,
    coalesce(v_holding.realized_pnl, 0),
    v_order.created_at;
END;
$$;
