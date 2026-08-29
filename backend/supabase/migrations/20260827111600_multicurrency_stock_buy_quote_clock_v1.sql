-- C3B deterministic-clock seam.
--
-- Production continues to call the public service-only function, which always
-- supplies clock_timestamp(). The explicit timestamp entrypoint is private and
-- unavailable to public/browser/service roles; it exists only so disposable
-- database acceptance can exercise open/closed market boundaries exactly.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function private.create_stock_buy_quote_at_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_ticker text,
  p_quantity numeric,
  p_expected_price numeric,
  p_expected_tick_index bigint,
  p_allocations jsonb,
  p_idempotency_key text,
  p_at timestamptz
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
     or p_at is null
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

  if not public.is_stock_market_open_at(p_game_session_id, p_at) then
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
    id, public_key, game_session_id, player_id, stock_asset_id, ticker,
    listing_currency_code, quantity, quoted_price, price_tick_index,
    gross_value, funding_quote_id, idempotency_key, request_hash, expires_at
  ) values (
    v_quote_id, v_quote_public_key, p_game_session_id, p_player_id, v_asset.id,
    v_asset.ticker, v_asset.listing_currency_code, v_normalized_quantity,
    v_asset.current_price, v_latest_tick.tick_index, v_gross,
    v_funding_quote.id, v_idempotency_key, v_request_hash,
    v_funding_quote.expires_at
  );

  return private.stock_buy_quote_public_json_v1(v_quote_id);
end;
$function$;

revoke all on function private.create_stock_buy_quote_at_v1(
  uuid, uuid, text, numeric, numeric, bigint, jsonb, text, timestamptz
) from public, anon, authenticated, service_role;

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
language sql
volatile
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
  select private.create_stock_buy_quote_at_v1(
    p_game_session_id,
    p_player_id,
    p_ticker,
    p_quantity,
    p_expected_price,
    p_expected_tick_index,
    p_allocations,
    p_idempotency_key,
    clock_timestamp()
  );
$function$;

revoke all on function public.create_stock_buy_quote_v1(
  uuid, uuid, text, numeric, numeric, bigint, jsonb, text
) from public, anon, authenticated;
grant execute on function public.create_stock_buy_quote_v1(
  uuid, uuid, text, numeric, numeric, bigint, jsonb, text
) to service_role;

commit;
