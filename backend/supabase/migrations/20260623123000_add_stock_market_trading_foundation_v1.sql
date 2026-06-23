-- Stock market trading foundation V1.
-- Adds backend-only stock portfolios, holdings, orders, immediate fills, and
-- trusted RPCs. This migration intentionally does not add frontend routes,
-- classroom-api changes, store purchase writes, ledger writes, schedulers,
-- real-world market APIs, or function deployment behavior.

alter table public.player_sessions
  add constraint player_sessions_game_session_id_id_unique unique (game_session_id, id);

create table public.stock_portfolios (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  player_session_id uuid not null,
  cash_balance numeric(20, 4) not null default 0,
  reserved_cash numeric(20, 4) not null default 0,
  realized_pnl numeric(20, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint stock_portfolios_scope_unique unique (game_session_id, player_session_id),
  constraint stock_portfolios_player_session_scope_fk
    foreign key (game_session_id, player_session_id)
    references public.player_sessions (game_session_id, id)
    on delete cascade,
  constraint stock_portfolios_cash_non_negative check (cash_balance >= 0),
  constraint stock_portfolios_reserved_cash_non_negative check (reserved_cash >= 0)
);

create trigger set_stock_portfolios_updated_at
before update on public.stock_portfolios
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.stock_portfolios is
  'Isolated stock-market cash portfolio for one player session inside one game session. V5 does not touch store, inventory, or ledger balances.';

create index stock_portfolios_player_session_idx
on public.stock_portfolios (player_session_id);

create table public.stock_holdings (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null,
  player_session_id uuid not null,
  stock_asset_id uuid not null,
  ticker text not null,
  quantity numeric(20, 4) not null default 0,
  reserved_quantity numeric(20, 4) not null default 0,
  average_cost numeric(18, 4) not null default 0,
  realized_pnl numeric(20, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint stock_holdings_scope_unique unique (game_session_id, player_session_id, stock_asset_id),
  constraint stock_holdings_portfolio_scope_fk
    foreign key (game_session_id, player_session_id)
    references public.stock_portfolios (game_session_id, player_session_id)
    on delete cascade,
  constraint stock_holdings_asset_scope_fk
    foreign key (game_session_id, stock_asset_id)
    references public.game_session_stock_assets (game_session_id, id)
    on delete cascade,
  constraint stock_holdings_ticker_not_blank check (length(btrim(ticker)) > 0),
  constraint stock_holdings_quantity_non_negative check (quantity >= 0),
  constraint stock_holdings_reserved_quantity_non_negative check (reserved_quantity >= 0),
  constraint stock_holdings_reserved_quantity_available check (reserved_quantity <= quantity),
  constraint stock_holdings_average_cost_non_negative check (average_cost >= 0)
);

create trigger set_stock_holdings_updated_at
before update on public.stock_holdings
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.stock_holdings is
  'Per-player-session stock holdings scoped by game_session_id and runtime stock asset.';

create index stock_holdings_player_session_idx
on public.stock_holdings (game_session_id, player_session_id);

create index stock_holdings_asset_idx
on public.stock_holdings (game_session_id, stock_asset_id);

create table public.stock_orders (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null,
  player_session_id uuid not null,
  stock_asset_id uuid not null,
  ticker text not null,
  side text not null,
  order_type text not null default 'market',
  quantity numeric(20, 4) not null,
  requested_price numeric(18, 4) null,
  execution_price numeric(18, 4) null,
  gross_value numeric(20, 4) not null default 0,
  status text not null,
  rejection_reason text null,
  idempotency_key text not null,
  cash_balance_after numeric(20, 4) not null default 0,
  reserved_cash_after numeric(20, 4) not null default 0,
  holding_quantity_after numeric(20, 4) not null default 0,
  average_cost_after numeric(18, 4) not null default 0,
  created_at timestamptz not null default now(),
  filled_at timestamptz null,

  constraint stock_orders_scope_unique unique (game_session_id, player_session_id, idempotency_key),
  constraint stock_orders_player_order_unique unique (game_session_id, player_session_id, id),
  constraint stock_orders_portfolio_scope_fk
    foreign key (game_session_id, player_session_id)
    references public.stock_portfolios (game_session_id, player_session_id)
    on delete cascade,
  constraint stock_orders_asset_scope_fk
    foreign key (game_session_id, stock_asset_id)
    references public.game_session_stock_assets (game_session_id, id)
    on delete cascade,
  constraint stock_orders_ticker_not_blank check (length(btrim(ticker)) > 0),
  constraint stock_orders_side_check check (side in ('buy', 'sell')),
  constraint stock_orders_type_check check (order_type in ('market')),
  constraint stock_orders_quantity_positive check (quantity > 0),
  constraint stock_orders_requested_price_positive check (
    requested_price is null
    or requested_price > 0
  ),
  constraint stock_orders_execution_price_positive check (
    execution_price is null
    or execution_price > 0
  ),
  constraint stock_orders_gross_value_non_negative check (gross_value >= 0),
  constraint stock_orders_status_check check (status in ('filled', 'rejected')),
  constraint stock_orders_rejection_reason_not_blank check (
    rejection_reason is null
    or length(btrim(rejection_reason)) > 0
  ),
  constraint stock_orders_idempotency_key_not_blank check (length(btrim(idempotency_key)) > 0),
  constraint stock_orders_cash_balance_after_non_negative check (cash_balance_after >= 0),
  constraint stock_orders_reserved_cash_after_non_negative check (reserved_cash_after >= 0),
  constraint stock_orders_holding_quantity_after_non_negative check (holding_quantity_after >= 0),
  constraint stock_orders_average_cost_after_non_negative check (average_cost_after >= 0)
);

comment on table public.stock_orders is
  'Immediate market stock order records scoped to one game session and one player session. Unique idempotency keys prevent duplicate execution on retries.';

create index stock_orders_player_created_idx
on public.stock_orders (game_session_id, player_session_id, created_at desc);

create index stock_orders_asset_created_idx
on public.stock_orders (game_session_id, stock_asset_id, created_at desc);

create table public.stock_trades (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.stock_orders (id) on delete cascade,
  game_session_id uuid not null,
  player_session_id uuid not null,
  stock_asset_id uuid not null,
  ticker text not null,
  side text not null,
  quantity numeric(20, 4) not null,
  execution_price numeric(18, 4) not null,
  gross_value numeric(20, 4) not null,
  created_at timestamptz not null default now(),

  constraint stock_trades_order_unique unique (order_id),
  constraint stock_trades_order_scope_fk
    foreign key (game_session_id, player_session_id, order_id)
    references public.stock_orders (game_session_id, player_session_id, id)
    on delete cascade,
  constraint stock_trades_asset_scope_fk
    foreign key (game_session_id, stock_asset_id)
    references public.game_session_stock_assets (game_session_id, id)
    on delete cascade,
  constraint stock_trades_ticker_not_blank check (length(btrim(ticker)) > 0),
  constraint stock_trades_side_check check (side in ('buy', 'sell')),
  constraint stock_trades_quantity_positive check (quantity > 0),
  constraint stock_trades_execution_price_positive check (execution_price > 0),
  constraint stock_trades_gross_value_positive check (gross_value > 0)
);

comment on table public.stock_trades is
  'One immediate fill per filled market stock order. The order_id unique constraint prevents duplicate fills from idempotent retries.';

create index stock_trades_player_created_idx
on public.stock_trades (game_session_id, player_session_id, created_at desc);

create index stock_trades_asset_created_idx
on public.stock_trades (game_session_id, stock_asset_id, created_at desc);

create or replace function public.initialize_stock_portfolio_for_player(
  p_game_session_id uuid,
  p_player_session_id uuid,
  p_starting_cash numeric default 10000
)
returns table (
  portfolio_id uuid,
  game_session_id uuid,
  player_session_id uuid,
  cash_balance numeric,
  reserved_cash numeric,
  realized_pnl numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_starting_cash numeric := coalesce(p_starting_cash, 10000);
  v_portfolio public.stock_portfolios%rowtype;
begin
  if p_game_session_id is null then
    raise exception 'STOCK_TRADING_GAME_SESSION_REQUIRED';
  end if;

  if p_player_session_id is null then
    raise exception 'STOCK_TRADING_PLAYER_SESSION_REQUIRED';
  end if;

  if v_starting_cash is null or v_starting_cash < 0 then
    raise exception 'STOCK_TRADING_INVALID_STARTING_CASH';
  end if;

  if not exists (
    select 1
    from public.game_sessions session
    where session.id = p_game_session_id
  ) then
    raise exception 'STOCK_TRADING_GAME_SESSION_NOT_FOUND';
  end if;

  if not exists (
    select 1
    from public.player_sessions player_session
    where player_session.id = p_player_session_id
      and player_session.game_session_id = p_game_session_id
  ) then
    raise exception 'STOCK_TRADING_PLAYER_SESSION_NOT_FOUND';
  end if;

  insert into public.stock_portfolios (
    game_session_id,
    player_session_id,
    cash_balance,
    reserved_cash,
    realized_pnl
  )
  values (
    p_game_session_id,
    p_player_session_id,
    v_starting_cash,
    0,
    0
  )
  on conflict (game_session_id, player_session_id) do nothing;

  select portfolio.*
  into v_portfolio
  from public.stock_portfolios portfolio
  where portfolio.game_session_id = p_game_session_id
    and portfolio.player_session_id = p_player_session_id;

  portfolio_id := v_portfolio.id;
  game_session_id := v_portfolio.game_session_id;
  player_session_id := v_portfolio.player_session_id;
  cash_balance := v_portfolio.cash_balance;
  reserved_cash := v_portfolio.reserved_cash;
  realized_pnl := v_portfolio.realized_pnl;

  return next;
end;
$$;

comment on function public.initialize_stock_portfolio_for_player(uuid, uuid, numeric) is
  'Initializes isolated stock-market cash for one player session in one game session. Existing portfolios are returned without overwriting cash.';

create or replace function public.execute_stock_market_order(
  p_game_session_id uuid,
  p_player_session_id uuid,
  p_stock_asset_id uuid,
  p_side text,
  p_quantity numeric,
  p_idempotency_key text
)
returns table (
  order_id uuid,
  game_session_id uuid,
  player_session_id uuid,
  stock_asset_id uuid,
  ticker text,
  side text,
  quantity numeric,
  execution_price numeric,
  gross_value numeric,
  status text,
  rejection_reason text,
  cash_balance numeric,
  reserved_cash numeric,
  holding_quantity numeric,
  average_cost numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_side text := lower(btrim(coalesce(p_side, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_asset record;
  v_portfolio public.stock_portfolios%rowtype;
  v_holding public.stock_holdings%rowtype;
  v_order public.stock_orders%rowtype;
  v_existing_holding_quantity numeric := 0;
  v_existing_average_cost numeric := 0;
  v_gross_value numeric;
  v_new_holding_quantity numeric;
  v_new_average_cost numeric;
  v_realized_pnl numeric := 0;
begin
  if p_game_session_id is null then
    raise exception 'STOCK_TRADING_GAME_SESSION_REQUIRED';
  end if;

  if p_player_session_id is null then
    raise exception 'STOCK_TRADING_PLAYER_SESSION_REQUIRED';
  end if;

  if p_stock_asset_id is null then
    raise exception 'STOCK_TRADING_STOCK_ASSET_REQUIRED';
  end if;

  if v_side not in ('buy', 'sell') then
    raise exception 'STOCK_TRADING_INVALID_SIDE';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'STOCK_TRADING_INVALID_QUANTITY';
  end if;

  if length(v_idempotency_key) = 0 then
    raise exception 'STOCK_TRADING_IDEMPOTENCY_KEY_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_game_session_id::text || ':' || p_player_session_id::text || ':' || v_idempotency_key,
      0
    )
  );

  select existing_order.*
  into v_order
  from public.stock_orders existing_order
  where existing_order.game_session_id = p_game_session_id
    and existing_order.player_session_id = p_player_session_id
    and existing_order.idempotency_key = v_idempotency_key;

  if found then
    order_id := v_order.id;
    game_session_id := v_order.game_session_id;
    player_session_id := v_order.player_session_id;
    stock_asset_id := v_order.stock_asset_id;
    ticker := v_order.ticker;
    side := v_order.side;
    quantity := v_order.quantity;
    execution_price := v_order.execution_price;
    gross_value := v_order.gross_value;
    status := v_order.status;
    rejection_reason := v_order.rejection_reason;
    cash_balance := v_order.cash_balance_after;
    reserved_cash := v_order.reserved_cash_after;
    holding_quantity := v_order.holding_quantity_after;
    average_cost := v_order.average_cost_after;
    return next;
    return;
  end if;

  if not exists (
    select 1
    from public.game_sessions session
    where session.id = p_game_session_id
  ) then
    raise exception 'STOCK_TRADING_GAME_SESSION_NOT_FOUND';
  end if;

  if not exists (
    select 1
    from public.player_sessions player_session
    where player_session.id = p_player_session_id
      and player_session.game_session_id = p_game_session_id
  ) then
    raise exception 'STOCK_TRADING_PLAYER_SESSION_NOT_FOUND';
  end if;

  select asset.id, asset.ticker, asset.current_price
  into v_asset
  from public.game_session_stock_assets asset
  where asset.game_session_id = p_game_session_id
    and asset.id = p_stock_asset_id
    and asset.is_active = true;

  if not found then
    raise exception 'STOCK_TRADING_STOCK_ASSET_NOT_FOUND';
  end if;

  select portfolio.*
  into v_portfolio
  from public.stock_portfolios portfolio
  where portfolio.game_session_id = p_game_session_id
    and portfolio.player_session_id = p_player_session_id
  for update;

  if not found then
    raise exception 'STOCK_TRADING_PORTFOLIO_NOT_INITIALIZED';
  end if;

  v_gross_value := v_asset.current_price * p_quantity;

  select holding.*
  into v_holding
  from public.stock_holdings holding
  where holding.game_session_id = p_game_session_id
    and holding.player_session_id = p_player_session_id
    and holding.stock_asset_id = p_stock_asset_id
  for update;

  if found then
    v_existing_holding_quantity := v_holding.quantity;
    v_existing_average_cost := v_holding.average_cost;
  end if;

  if v_side = 'buy' then
    if v_portfolio.cash_balance < v_gross_value then
      insert into public.stock_orders (
        game_session_id,
        player_session_id,
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
        reserved_cash_after,
        holding_quantity_after,
        average_cost_after
      )
      values (
        p_game_session_id,
        p_player_session_id,
        p_stock_asset_id,
        v_asset.ticker,
        v_side,
        'market',
        p_quantity,
        null,
        v_asset.current_price,
        v_gross_value,
        'rejected',
        'insufficient_cash',
        v_idempotency_key,
        v_portfolio.cash_balance,
        v_portfolio.reserved_cash,
        v_existing_holding_quantity,
        v_existing_average_cost
      )
      returning * into v_order;
    else
      insert into public.stock_holdings (
        game_session_id,
        player_session_id,
        stock_asset_id,
        ticker,
        quantity,
        reserved_quantity,
        average_cost,
        realized_pnl
      )
      values (
        p_game_session_id,
        p_player_session_id,
        p_stock_asset_id,
        v_asset.ticker,
        0,
        0,
        0,
        0
      )
      on conflict (game_session_id, player_session_id, stock_asset_id) do nothing;

      select holding.*
      into v_holding
      from public.stock_holdings holding
      where holding.game_session_id = p_game_session_id
        and holding.player_session_id = p_player_session_id
        and holding.stock_asset_id = p_stock_asset_id
      for update;

      v_new_holding_quantity := v_holding.quantity + p_quantity;
      v_new_average_cost := (
        (v_holding.quantity * v_holding.average_cost) + v_gross_value
      ) / v_new_holding_quantity;

      update public.stock_portfolios portfolio
      set cash_balance = portfolio.cash_balance - v_gross_value
      where portfolio.id = v_portfolio.id
      returning * into v_portfolio;

      update public.stock_holdings holding
      set
        ticker = v_asset.ticker,
        quantity = v_new_holding_quantity,
        average_cost = v_new_average_cost
      where holding.id = v_holding.id
      returning * into v_holding;

      insert into public.stock_orders (
        game_session_id,
        player_session_id,
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
        reserved_cash_after,
        holding_quantity_after,
        average_cost_after,
        filled_at
      )
      values (
        p_game_session_id,
        p_player_session_id,
        p_stock_asset_id,
        v_asset.ticker,
        v_side,
        'market',
        p_quantity,
        null,
        v_asset.current_price,
        v_gross_value,
        'filled',
        null,
        v_idempotency_key,
        v_portfolio.cash_balance,
        v_portfolio.reserved_cash,
        v_holding.quantity,
        v_holding.average_cost,
        now()
      )
      returning * into v_order;

      insert into public.stock_trades (
        order_id,
        game_session_id,
        player_session_id,
        stock_asset_id,
        ticker,
        side,
        quantity,
        execution_price,
        gross_value
      )
      values (
        v_order.id,
        p_game_session_id,
        p_player_session_id,
        p_stock_asset_id,
        v_asset.ticker,
        v_side,
        p_quantity,
        v_asset.current_price,
        v_gross_value
      );
    end if;
  else
    if v_existing_holding_quantity < p_quantity then
      insert into public.stock_orders (
        game_session_id,
        player_session_id,
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
        reserved_cash_after,
        holding_quantity_after,
        average_cost_after
      )
      values (
        p_game_session_id,
        p_player_session_id,
        p_stock_asset_id,
        v_asset.ticker,
        v_side,
        'market',
        p_quantity,
        null,
        v_asset.current_price,
        v_gross_value,
        'rejected',
        'insufficient_shares',
        v_idempotency_key,
        v_portfolio.cash_balance,
        v_portfolio.reserved_cash,
        v_existing_holding_quantity,
        v_existing_average_cost
      )
      returning * into v_order;
    else
      v_new_holding_quantity := v_holding.quantity - p_quantity;
      v_new_average_cost := case
        when v_new_holding_quantity = 0 then 0
        else v_holding.average_cost
      end;
      v_realized_pnl := (v_asset.current_price - v_holding.average_cost) * p_quantity;

      update public.stock_portfolios portfolio
      set
        cash_balance = portfolio.cash_balance + v_gross_value,
        realized_pnl = portfolio.realized_pnl + v_realized_pnl
      where portfolio.id = v_portfolio.id
      returning * into v_portfolio;

      update public.stock_holdings holding
      set
        ticker = v_asset.ticker,
        quantity = v_new_holding_quantity,
        average_cost = v_new_average_cost,
        realized_pnl = holding.realized_pnl + v_realized_pnl
      where holding.id = v_holding.id
      returning * into v_holding;

      insert into public.stock_orders (
        game_session_id,
        player_session_id,
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
        reserved_cash_after,
        holding_quantity_after,
        average_cost_after,
        filled_at
      )
      values (
        p_game_session_id,
        p_player_session_id,
        p_stock_asset_id,
        v_asset.ticker,
        v_side,
        'market',
        p_quantity,
        null,
        v_asset.current_price,
        v_gross_value,
        'filled',
        null,
        v_idempotency_key,
        v_portfolio.cash_balance,
        v_portfolio.reserved_cash,
        v_holding.quantity,
        v_holding.average_cost,
        now()
      )
      returning * into v_order;

      insert into public.stock_trades (
        order_id,
        game_session_id,
        player_session_id,
        stock_asset_id,
        ticker,
        side,
        quantity,
        execution_price,
        gross_value
      )
      values (
        v_order.id,
        p_game_session_id,
        p_player_session_id,
        p_stock_asset_id,
        v_asset.ticker,
        v_side,
        p_quantity,
        v_asset.current_price,
        v_gross_value
      );
    end if;
  end if;

  order_id := v_order.id;
  game_session_id := v_order.game_session_id;
  player_session_id := v_order.player_session_id;
  stock_asset_id := v_order.stock_asset_id;
  ticker := v_order.ticker;
  side := v_order.side;
  quantity := v_order.quantity;
  execution_price := v_order.execution_price;
  gross_value := v_order.gross_value;
  status := v_order.status;
  rejection_reason := v_order.rejection_reason;
  cash_balance := v_order.cash_balance_after;
  reserved_cash := v_order.reserved_cash_after;
  holding_quantity := v_order.holding_quantity_after;
  average_cost := v_order.average_cost_after;

  return next;
end;
$$;

comment on function public.execute_stock_market_order(uuid, uuid, uuid, text, numeric, text) is
  'Executes one immediate market stock order for one player session inside one game session. Idempotency returns the existing order result without executing again.';

alter table public.stock_portfolios enable row level security;
alter table public.stock_holdings enable row level security;
alter table public.stock_orders enable row level security;
alter table public.stock_trades enable row level security;

-- No direct authenticated policies are added. V5 trading writes are intended
-- only for trusted service-role Edge Function RPC calls.

revoke all on function public.initialize_stock_portfolio_for_player(uuid, uuid, numeric) from public;
grant execute on function public.initialize_stock_portfolio_for_player(uuid, uuid, numeric) to service_role;

revoke all on function public.execute_stock_market_order(uuid, uuid, uuid, text, numeric, text) from public;
grant execute on function public.execute_stock_market_order(uuid, uuid, uuid, text, numeric, text) to service_role;
