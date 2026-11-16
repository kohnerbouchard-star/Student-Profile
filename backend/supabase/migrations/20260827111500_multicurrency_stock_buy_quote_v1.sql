-- Multi-currency Stock Market immediate-buy quote authority V1.
--
-- C3B only: creates one immutable Stock quote for the exact current runtime
-- price/latest tick and binds it transactionally to one C0 purchase-funding
-- quote. It does not move money or shares, consume either quote, create an
-- order/trade, alter holdings, or change the Player API/UI.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table public.stock_buy_quotes (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'sbq_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null,
  stock_asset_id uuid not null,
  ticker text not null,
  listing_currency_code text not null references public.currencies(code),
  quantity numeric(20, 4) not null,
  quoted_price numeric(18, 4) not null,
  price_tick_index bigint not null,
  gross_value numeric(38, 18) not null,
  funding_quote_id uuid not null,
  idempotency_key text not null,
  request_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint stock_buy_quotes_public_key_format
    check (public_key ~ '^sbq_[0-9a-f]{32}$'),
  constraint stock_buy_quotes_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id),
  constraint stock_buy_quotes_asset_scope_fk
    foreign key (game_session_id, stock_asset_id)
    references public.game_session_stock_assets(game_session_id, id),
  constraint stock_buy_quotes_funding_scope_fk
    foreign key (funding_quote_id, game_session_id)
    references public.purchase_funding_quotes(id, game_session_id),
  constraint stock_buy_quotes_ticker_not_blank
    check (length(btrim(ticker)) between 1 and 32),
  constraint stock_buy_quotes_currency_format
    check (listing_currency_code ~ '^[A-Z][A-Z0-9_]{1,15}$'),
  constraint stock_buy_quotes_quantity_positive
    check (quantity > 0),
  constraint stock_buy_quotes_price_positive
    check (quoted_price > 0),
  constraint stock_buy_quotes_tick_non_negative
    check (price_tick_index >= 0),
  constraint stock_buy_quotes_gross_positive
    check (gross_value > 0 and gross_value < 1000000000000000::numeric),
  constraint stock_buy_quotes_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 160),
  constraint stock_buy_quotes_request_hash_format
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint stock_buy_quotes_timing_check
    check (created_at < expires_at),
  constraint stock_buy_quotes_scope_idempotency_unique
    unique (game_session_id, player_id, idempotency_key),
  constraint stock_buy_quotes_scope_id_unique
    unique (id, game_session_id),
  constraint stock_buy_quotes_funding_unique
    unique (funding_quote_id)
);

create index stock_buy_quotes_player_created_idx
  on public.stock_buy_quotes(game_session_id, player_id, created_at desc, public_key desc);
create index stock_buy_quotes_asset_created_idx
  on public.stock_buy_quotes(game_session_id, stock_asset_id, created_at desc);

alter table public.stock_buy_quotes enable row level security;
alter table public.stock_buy_quotes force row level security;
revoke all on table public.stock_buy_quotes
  from public, anon, authenticated, service_role;
grant select on table public.stock_buy_quotes to service_role;

comment on table public.stock_buy_quotes is
  'Immutable non-reserving C3B immediate-buy quote bound to exact Stock price/tick and one C0 purchase-funding quote.';

create or replace function private.reject_stock_buy_quote_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if not exists (
    select 1 from public.game_sessions as game_row
    where game_row.id = old.game_session_id
  ) then
    return old;
  end if;

  raise exception 'STOCK_BUY_QUOTE_IMMUTABLE' using errcode = '42501';
end;
$function$;

revoke all on function private.reject_stock_buy_quote_mutation_v1()
  from public, anon, authenticated, service_role;

create trigger guard_stock_buy_quotes_immutable
before update or delete on public.stock_buy_quotes
for each row execute function private.reject_stock_buy_quote_mutation_v1();

create or replace function private.stock_buy_quote_public_json_v1(
  p_quote_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'quote_key', quote_row.public_key,
    'ticker', quote_row.ticker,
    'listing_currency_code', quote_row.listing_currency_code,
    'quantity', quote_row.quantity::text,
    'quoted_price', quote_row.quoted_price::text,
    'price_tick_index', quote_row.price_tick_index,
    'gross_value', quote_row.gross_value::text,
    'expires_at', quote_row.expires_at,
    'funding', private.purchase_funding_quote_public_json_v1(quote_row.funding_quote_id)
  )
  from public.stock_buy_quotes as quote_row
  where quote_row.id = p_quote_id;
$function$;

revoke all on function private.stock_buy_quote_public_json_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.create_stock_buy_quote_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_ticker text,
  p_quantity numeric,
  p_expected_price numeric,
  p_expected_tick_index bigint,
  p_allocations jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_ticker text := upper(btrim(coalesce(p_ticker, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_asset public.game_session_stock_assets%rowtype;
  v_latest_tick public.stock_price_ticks%rowtype;
  v_currency_decimals integer;
  v_gross numeric(38, 18);
  v_normalized_quantity numeric(20, 4);
  v_request jsonb;
  v_request_hash text;
  v_existing public.stock_buy_quotes%rowtype;
  v_quote_id uuid := extensions.gen_random_uuid();
  v_quote_public_key text := 'sbq_' || replace(extensions.gen_random_uuid()::text, '-', '');
  v_funding_result jsonb;
  v_funding_public_key text;
  v_funding_quote public.purchase_funding_quotes%rowtype;
  v_funding_idempotency text;
begin
  if p_game_session_id is null
     or p_player_id is null
     or v_ticker !~ '^[A-Z0-9][A-Z0-9._-]{0,31}$'
     or p_quantity is null
     or p_quantity <= 0
     or p_quantity <> round(p_quantity, 4)
     or p_expected_price is null
     or p_expected_price <= 0
     or p_expected_tick_index is null
     or p_expected_tick_index < 0
     or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) not between 1 and 3
     or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then
    raise exception 'STOCK_BUY_QUOTE_REQUEST_INVALID' using errcode = '22023';
  end if;

  v_normalized_quantity := p_quantity::numeric(20, 4);

  v_request := jsonb_build_object(
    'ticker', v_ticker,
    'quantity', v_normalized_quantity::text,
    'expected_price', p_expected_price::text,
    'expected_tick_index', p_expected_tick_index,
    'allocations', p_allocations
  );
  v_request_hash := encode(digest(convert_to(v_request::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_game_session_id::text || ':' || p_player_id::text || ':stock-buy-quote:' || v_idempotency_key,
      0
    )
  );

  select quote_row.*
  into v_existing
  from public.stock_buy_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.player_id = p_player_id
    and quote_row.idempotency_key = v_idempotency_key;

  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception 'STOCK_BUY_QUOTE_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    return private.stock_buy_quote_public_json_v1(v_existing.id);
  end if;

  if not exists (
    select 1
    from public.players as player_row
    where player_row.game_session_id = p_game_session_id
      and player_row.id = p_player_id
  ) then
    raise exception 'STOCK_BUY_QUOTE_PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.is_stock_market_open_at(p_game_session_id, clock_timestamp()) then
    raise exception 'STOCK_BUY_QUOTE_MARKET_CLOSED' using errcode = 'P0001';
  end if;

  select asset_row.*
  into v_asset
  from public.game_session_stock_assets as asset_row
  where asset_row.game_session_id = p_game_session_id
    and upper(asset_row.ticker) = v_ticker
    and asset_row.is_active = true;

  if not found then
    raise exception 'STOCK_BUY_QUOTE_ASSET_NOT_FOUND' using errcode = 'P0001';
  end if;

  select tick_row.*
  into v_latest_tick
  from public.stock_price_ticks as tick_row
  where tick_row.game_session_id = p_game_session_id
    and tick_row.stock_asset_id = v_asset.id
  order by tick_row.tick_index desc
  limit 1;

  if not found then
    raise exception 'STOCK_BUY_QUOTE_TICK_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if p_expected_price <> v_asset.current_price
     or v_latest_tick.price <> v_asset.current_price
  then
    raise exception 'STOCK_BUY_QUOTE_PRICE_CHANGED' using errcode = 'P0001';
  end if;

  if p_expected_tick_index <> v_latest_tick.tick_index then
    raise exception 'STOCK_BUY_QUOTE_TICK_CHANGED' using errcode = 'P0001';
  end if;

  select currency_row.decimal_places
  into v_currency_decimals
  from public.currencies as currency_row
  where currency_row.code = v_asset.listing_currency_code
    and currency_row.status = 'active';

  if v_currency_decimals is null then
    raise exception 'STOCK_BUY_QUOTE_CURRENCY_INVALID' using errcode = 'P0001';
  end if;

  v_gross := round(v_asset.current_price * v_normalized_quantity, v_currency_decimals);
  if v_gross <= 0 then
    raise exception 'STOCK_BUY_QUOTE_GROSS_INVALID' using errcode = '22023';
  end if;

  v_funding_idempotency := 'stocks.buy:' || encode(
    digest(convert_to(v_idempotency_key, 'UTF8'), 'sha256'),
    'hex'
  );

  v_funding_result := public.create_purchase_funding_quote_v1(
    p_game_session_id,
    p_player_id,
    v_asset.listing_currency_code,
    v_gross,
    'stocks.immediate-buy',
    v_quote_public_key,
    v_request_hash,
    p_allocations,
    v_funding_idempotency
  );

  v_funding_public_key := nullif(btrim(v_funding_result ->> 'quote_key'), '');
  if v_funding_public_key is null then
    raise exception 'STOCK_BUY_QUOTE_FUNDING_INVALID' using errcode = 'P0001';
  end if;

  select funding_row.*
  into v_funding_quote
  from public.purchase_funding_quotes as funding_row
  where funding_row.game_session_id = p_game_session_id
    and funding_row.player_id = p_player_id
    and funding_row.public_key = v_funding_public_key;

  if not found
     or v_funding_quote.funding_context_kind <> 'stocks.immediate-buy'
     or v_funding_quote.funding_context_key <> v_quote_public_key
     or v_funding_quote.funding_context_hash <> v_request_hash
     or v_funding_quote.target_currency_code <> v_asset.listing_currency_code
     or v_funding_quote.target_amount <> v_gross
  then
    raise exception 'STOCK_BUY_QUOTE_FUNDING_BINDING_INVALID' using errcode = 'P0001';
  end if;

  insert into public.stock_buy_quotes (
    id,
    public_key,
    game_session_id,
    player_id,
    stock_asset_id,
    ticker,
    listing_currency_code,
    quantity,
    quoted_price,
    price_tick_index,
    gross_value,
    funding_quote_id,
    idempotency_key,
    request_hash,
    expires_at
  ) values (
    v_quote_id,
    v_quote_public_key,
    p_game_session_id,
    p_player_id,
    v_asset.id,
    v_asset.ticker,
    v_asset.listing_currency_code,
    v_normalized_quantity,
    v_asset.current_price,
    v_latest_tick.tick_index,
    v_gross,
    v_funding_quote.id,
    v_idempotency_key,
    v_request_hash,
    v_funding_quote.expires_at
  );

  return private.stock_buy_quote_public_json_v1(v_quote_id);
end;
$function$;

comment on function public.create_stock_buy_quote_v1(
  uuid, uuid, text, numeric, numeric, bigint, jsonb, text
) is
  'Service-only C3B immediate-buy quote. Binds exact current Stock price/latest tick to one non-reserving C0 purchase-funding quote; moves no money or shares.';

revoke all on function public.create_stock_buy_quote_v1(
  uuid, uuid, text, numeric, numeric, bigint, jsonb, text
) from public, anon, authenticated;
grant execute on function public.create_stock_buy_quote_v1(
  uuid, uuid, text, numeric, numeric, bigint, jsonb, text
) to service_role;

commit;
