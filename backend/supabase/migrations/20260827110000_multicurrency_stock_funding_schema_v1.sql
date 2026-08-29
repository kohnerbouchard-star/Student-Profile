-- Multi-currency Stock Market funding schema foundation V1.
--
-- C3A only: establishes immutable Stock listing currency, legacy/current
-- monetary-evidence families, and canonical B2 market-liquidity account
-- bindings. It deliberately does not change the active buy/sell functions,
-- Player request contracts, order type, fill model, price engine, or calendar.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

create or replace function private.resolve_stock_listing_currency_v1(
  p_country_code text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_country_code text := upper(btrim(coalesce(p_country_code, '')));
  v_currency_code text;
  v_match_count integer;
begin
  if v_country_code !~ '^[A-Z][A-Z0-9_]{1,31}$' then
    raise exception 'STOCK_LISTING_COUNTRY_INVALID' using errcode = '22023';
  end if;

  select count(*), min(profile_row.currency_code)
  into v_match_count, v_currency_code
  from public.country_profiles as profile_row
  join public.currencies as currency_row
    on currency_row.code = profile_row.currency_code
   and currency_row.status = 'active'
  where profile_row.country_code = v_country_code
    and profile_row.status = 'active';

  if v_match_count <> 1 or v_currency_code is null then
    raise exception 'STOCK_LISTING_CURRENCY_UNRESOLVED'
      using errcode = 'P0001',
            detail = format('country_code=%s matches=%s', v_country_code, v_match_count);
  end if;

  return upper(v_currency_code);
end;
$function$;

revoke all on function private.resolve_stock_listing_currency_v1(text)
  from public, anon, authenticated, service_role;

alter table public.stock_templates
  add column listing_currency_code text null;

alter table public.game_session_stock_assets
  add column listing_currency_code text null;

update public.stock_templates as template_row
set listing_currency_code = private.resolve_stock_listing_currency_v1(
  template_row.country_code
);

update public.game_session_stock_assets as asset_row
set listing_currency_code = private.resolve_stock_listing_currency_v1(
  asset_row.country_code
);

alter table public.stock_templates
  alter column listing_currency_code set not null;

alter table public.game_session_stock_assets
  alter column listing_currency_code set not null;

alter table public.stock_templates
  add constraint stock_templates_listing_currency_fk
  foreign key (listing_currency_code)
  references public.currencies(code) not valid;

alter table public.stock_templates
  validate constraint stock_templates_listing_currency_fk;

alter table public.stock_templates
  add constraint stock_templates_listing_currency_format
  check (listing_currency_code ~ '^[A-Z][A-Z0-9_]{1,15}$') not valid;

alter table public.stock_templates
  validate constraint stock_templates_listing_currency_format;

alter table public.game_session_stock_assets
  add constraint game_session_stock_assets_listing_currency_fk
  foreign key (listing_currency_code)
  references public.currencies(code) not valid;

alter table public.game_session_stock_assets
  validate constraint game_session_stock_assets_listing_currency_fk;

alter table public.game_session_stock_assets
  add constraint game_session_stock_assets_listing_currency_format
  check (listing_currency_code ~ '^[A-Z][A-Z0-9_]{1,15}$') not valid;

alter table public.game_session_stock_assets
  validate constraint game_session_stock_assets_listing_currency_format;

create index game_session_stock_assets_listing_currency_idx
  on public.game_session_stock_assets(
    game_session_id,
    listing_currency_code,
    is_active,
    ticker
  );

comment on column public.stock_templates.listing_currency_code is
  'Authoritative issuer-country listing currency copied into each runtime Stock asset.';
comment on column public.game_session_stock_assets.listing_currency_code is
  'Immutable currency for prices, immediate orders, fills, holdings basis, and proceeds for this runtime Stock asset.';

create or replace function private.guard_stock_template_listing_currency_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_expected_currency text;
begin
  v_expected_currency := private.resolve_stock_listing_currency_v1(new.country_code);

  if nullif(btrim(coalesce(new.listing_currency_code, '')), '') is null then
    new.listing_currency_code := v_expected_currency;
  else
    new.listing_currency_code := upper(btrim(new.listing_currency_code));
  end if;

  if new.listing_currency_code <> v_expected_currency then
    raise exception 'STOCK_TEMPLATE_LISTING_CURRENCY_MISMATCH'
      using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE'
     and new.listing_currency_code is distinct from old.listing_currency_code
  then
    raise exception 'STOCK_TEMPLATE_LISTING_CURRENCY_IMMUTABLE'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_stock_template_listing_currency_v1()
  from public, anon, authenticated, service_role;

create trigger guard_stock_template_listing_currency_v1
before insert or update on public.stock_templates
for each row execute function private.guard_stock_template_listing_currency_v1();

create or replace function private.guard_runtime_stock_listing_currency_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_expected_currency text;
  v_template_country text;
  v_template_currency text;
begin
  v_expected_currency := private.resolve_stock_listing_currency_v1(new.country_code);

  if new.template_id is not null then
    select template_row.country_code, template_row.listing_currency_code
    into v_template_country, v_template_currency
    from public.stock_templates as template_row
    where template_row.id = new.template_id;

    if not found then
      raise exception 'STOCK_RUNTIME_TEMPLATE_NOT_FOUND' using errcode = '23503';
    end if;

    if v_template_country <> new.country_code
       or v_template_currency <> v_expected_currency
    then
      raise exception 'STOCK_RUNTIME_TEMPLATE_CURRENCY_MISMATCH'
        using errcode = 'P0001';
    end if;
  end if;

  if nullif(btrim(coalesce(new.listing_currency_code, '')), '') is null then
    new.listing_currency_code := v_expected_currency;
  else
    new.listing_currency_code := upper(btrim(new.listing_currency_code));
  end if;

  if new.listing_currency_code <> v_expected_currency then
    raise exception 'STOCK_RUNTIME_LISTING_CURRENCY_MISMATCH'
      using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE'
     and new.listing_currency_code is distinct from old.listing_currency_code
  then
    raise exception 'STOCK_RUNTIME_LISTING_CURRENCY_IMMUTABLE'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_runtime_stock_listing_currency_v1()
  from public, anon, authenticated, service_role;

create trigger guard_runtime_stock_listing_currency_v1
before insert or update on public.game_session_stock_assets
for each row execute function private.guard_runtime_stock_listing_currency_v1();

alter table public.stock_holdings
  add column cost_currency_code text null;

update public.stock_holdings as holding_row
set cost_currency_code = asset_row.listing_currency_code
from public.game_session_stock_assets as asset_row
where asset_row.id = holding_row.stock_asset_id
  and asset_row.game_session_id = holding_row.game_session_id;

alter table public.stock_holdings
  alter column cost_currency_code set not null;

alter table public.stock_holdings
  add constraint stock_holdings_cost_currency_fk
  foreign key (cost_currency_code)
  references public.currencies(code) not valid;

alter table public.stock_holdings
  validate constraint stock_holdings_cost_currency_fk;

comment on column public.stock_holdings.cost_currency_code is
  'Currency of average_cost and realized_pnl; always equals the runtime Stock asset listing currency.';

create or replace function private.guard_stock_holding_cost_currency_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_expected_currency text;
begin
  select asset_row.listing_currency_code
  into v_expected_currency
  from public.game_session_stock_assets as asset_row
  where asset_row.id = new.stock_asset_id
    and asset_row.game_session_id = new.game_session_id;

  if not found then
    raise exception 'STOCK_HOLDING_ASSET_NOT_FOUND' using errcode = '23503';
  end if;

  if nullif(btrim(coalesce(new.cost_currency_code, '')), '') is null then
    new.cost_currency_code := v_expected_currency;
  else
    new.cost_currency_code := upper(btrim(new.cost_currency_code));
  end if;

  if new.cost_currency_code <> v_expected_currency then
    raise exception 'STOCK_HOLDING_COST_CURRENCY_MISMATCH'
      using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE'
     and new.cost_currency_code is distinct from old.cost_currency_code
  then
    raise exception 'STOCK_HOLDING_COST_CURRENCY_IMMUTABLE'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_stock_holding_cost_currency_v1()
  from public, anon, authenticated, service_role;

create trigger guard_stock_holding_cost_currency_v1
before insert or update on public.stock_holdings
for each row execute function private.guard_stock_holding_cost_currency_v1();

alter table public.stock_orders
  add column listing_currency_code text null,
  add column settlement_evidence_family text not null default 'legacy',
  add column price_tick_index bigint null,
  add column funding_quote_id uuid null,
  add column funding_receipt_id uuid null,
  add column funding_bank_transaction_id uuid null,
  add column market_liquidity_account_id uuid null,
  add column destination_bank_account_id uuid null,
  add column settlement_bank_transaction_id uuid null;

update public.stock_orders as order_row
set listing_currency_code = asset_row.listing_currency_code
from public.game_session_stock_assets as asset_row
where asset_row.id = order_row.stock_asset_id
  and asset_row.game_session_id = order_row.game_session_id;

alter table public.stock_orders
  alter column listing_currency_code set not null,
  alter column cash_balance_after drop not null;

alter table public.stock_orders
  add constraint stock_orders_listing_currency_fk
  foreign key (listing_currency_code)
  references public.currencies(code) not valid;

alter table public.stock_orders
  validate constraint stock_orders_listing_currency_fk;

alter table public.stock_orders
  add constraint stock_orders_funding_quote_scope_fk
  foreign key (funding_quote_id, game_session_id)
  references public.purchase_funding_quotes(id, game_session_id) not valid;

alter table public.stock_orders
  validate constraint stock_orders_funding_quote_scope_fk;

alter table public.stock_orders
  add constraint stock_orders_funding_receipt_scope_fk
  foreign key (funding_receipt_id, game_session_id)
  references public.purchase_funding_receipts(id, game_session_id) not valid;

alter table public.stock_orders
  validate constraint stock_orders_funding_receipt_scope_fk;

alter table public.stock_orders
  add constraint stock_orders_funding_transaction_scope_fk
  foreign key (funding_bank_transaction_id, game_session_id)
  references public.bank_transactions(id, game_session_id) not valid;

alter table public.stock_orders
  validate constraint stock_orders_funding_transaction_scope_fk;

alter table public.stock_orders
  add constraint stock_orders_market_liquidity_account_scope_fk
  foreign key (market_liquidity_account_id, game_session_id)
  references public.bank_accounts(id, game_session_id) not valid;

alter table public.stock_orders
  validate constraint stock_orders_market_liquidity_account_scope_fk;

alter table public.stock_orders
  add constraint stock_orders_destination_account_scope_fk
  foreign key (destination_bank_account_id, game_session_id)
  references public.bank_accounts(id, game_session_id) not valid;

alter table public.stock_orders
  validate constraint stock_orders_destination_account_scope_fk;

alter table public.stock_orders
  add constraint stock_orders_settlement_transaction_scope_fk
  foreign key (settlement_bank_transaction_id, game_session_id)
  references public.bank_transactions(id, game_session_id) not valid;

alter table public.stock_orders
  validate constraint stock_orders_settlement_transaction_scope_fk;

alter table public.stock_orders
  add constraint stock_orders_settlement_evidence_family_check
  check (settlement_evidence_family in ('legacy', 'c3')) not valid;

alter table public.stock_orders
  validate constraint stock_orders_settlement_evidence_family_check;

alter table public.stock_orders
  add constraint stock_orders_settlement_evidence_shape_check
  check (
    (
      settlement_evidence_family = 'legacy'
      and price_tick_index is null
      and funding_quote_id is null
      and funding_receipt_id is null
      and funding_bank_transaction_id is null
      and market_liquidity_account_id is null
      and destination_bank_account_id is null
      and settlement_bank_transaction_id is null
      and cash_balance_after is not null
    )
    or (
      settlement_evidence_family = 'c3'
      and status = 'filled'
      and cash_currency_code = listing_currency_code
      and cash_balance_after is null
      and price_tick_index is not null
      and price_tick_index >= 0
      and market_liquidity_account_id is not null
      and (
        (
          side = 'buy'
          and funding_quote_id is not null
          and funding_receipt_id is not null
          and funding_bank_transaction_id is not null
          and destination_bank_account_id is null
          and settlement_bank_transaction_id is null
        )
        or (
          side = 'sell'
          and funding_quote_id is null
          and funding_receipt_id is null
          and funding_bank_transaction_id is null
          and destination_bank_account_id is not null
          and settlement_bank_transaction_id is not null
        )
      )
    )
  ) not valid;

alter table public.stock_orders
  validate constraint stock_orders_settlement_evidence_shape_check;

create index stock_orders_listing_currency_created_idx
  on public.stock_orders(
    game_session_id,
    listing_currency_code,
    created_at desc,
    id desc
  );

create index stock_orders_funding_receipt_idx
  on public.stock_orders(funding_receipt_id)
  where funding_receipt_id is not null;

comment on column public.stock_orders.listing_currency_code is
  'Authoritative Stock asset listing currency for this order.';
comment on column public.stock_orders.settlement_evidence_family is
  'legacy preserves historical direct-ledger orders; c3 requires complete C0/B2 evidence.';
comment on column public.stock_orders.cash_balance_after is
  'Legacy single-account compatibility evidence. C3 orders leave it null rather than fabricating one representative balance.';

create or replace function private.guard_stock_order_currency_evidence_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_expected_currency text;
begin
  select asset_row.listing_currency_code
  into v_expected_currency
  from public.game_session_stock_assets as asset_row
  where asset_row.id = new.stock_asset_id
    and asset_row.game_session_id = new.game_session_id;

  if not found then
    raise exception 'STOCK_ORDER_ASSET_NOT_FOUND' using errcode = '23503';
  end if;

  if nullif(btrim(coalesce(new.listing_currency_code, '')), '') is null then
    new.listing_currency_code := v_expected_currency;
  else
    new.listing_currency_code := upper(btrim(new.listing_currency_code));
  end if;

  if new.listing_currency_code <> v_expected_currency then
    raise exception 'STOCK_ORDER_LISTING_CURRENCY_MISMATCH'
      using errcode = 'P0001';
  end if;

  new.settlement_evidence_family := lower(
    btrim(coalesce(new.settlement_evidence_family, 'legacy'))
  );

  if tg_op = 'UPDATE' and (
    new.listing_currency_code is distinct from old.listing_currency_code
    or new.settlement_evidence_family is distinct from old.settlement_evidence_family
    or new.price_tick_index is distinct from old.price_tick_index
    or new.funding_quote_id is distinct from old.funding_quote_id
    or new.funding_receipt_id is distinct from old.funding_receipt_id
    or new.funding_bank_transaction_id is distinct from old.funding_bank_transaction_id
    or new.market_liquidity_account_id is distinct from old.market_liquidity_account_id
    or new.destination_bank_account_id is distinct from old.destination_bank_account_id
    or new.settlement_bank_transaction_id is distinct from old.settlement_bank_transaction_id
  ) then
    raise exception 'STOCK_ORDER_SETTLEMENT_EVIDENCE_IMMUTABLE'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_stock_order_currency_evidence_v1()
  from public, anon, authenticated, service_role;

create trigger guard_stock_order_currency_evidence_v1
before insert or update on public.stock_orders
for each row execute function private.guard_stock_order_currency_evidence_v1();

alter table public.stock_trades
  add column listing_currency_code text null,
  add column settlement_evidence_family text not null default 'legacy',
  add column price_tick_index bigint null;

update public.stock_trades as trade_row
set listing_currency_code = order_row.listing_currency_code,
    settlement_evidence_family = order_row.settlement_evidence_family,
    price_tick_index = order_row.price_tick_index
from public.stock_orders as order_row
where order_row.id = trade_row.order_id
  and order_row.game_session_id = trade_row.game_session_id;

alter table public.stock_trades
  alter column listing_currency_code set not null;

alter table public.stock_trades
  add constraint stock_trades_listing_currency_fk
  foreign key (listing_currency_code)
  references public.currencies(code) not valid;

alter table public.stock_trades
  validate constraint stock_trades_listing_currency_fk;

alter table public.stock_trades
  add constraint stock_trades_settlement_evidence_family_check
  check (settlement_evidence_family in ('legacy', 'c3')) not valid;

alter table public.stock_trades
  validate constraint stock_trades_settlement_evidence_family_check;

alter table public.stock_trades
  add constraint stock_trades_settlement_evidence_shape_check
  check (
    (settlement_evidence_family = 'legacy' and price_tick_index is null)
    or (
      settlement_evidence_family = 'c3'
      and price_tick_index is not null
      and price_tick_index >= 0
    )
  ) not valid;

alter table public.stock_trades
  validate constraint stock_trades_settlement_evidence_shape_check;

comment on column public.stock_trades.listing_currency_code is
  'Authoritative Stock asset listing currency for the fill.';
comment on column public.stock_trades.settlement_evidence_family is
  'Must match the owning Stock order legacy or C3 evidence family.';

create or replace function private.guard_stock_trade_currency_evidence_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_order public.stock_orders%rowtype;
begin
  select order_row.*
  into v_order
  from public.stock_orders as order_row
  where order_row.id = new.order_id
    and order_row.game_session_id = new.game_session_id;

  if not found then
    raise exception 'STOCK_TRADE_ORDER_NOT_FOUND' using errcode = '23503';
  end if;

  if v_order.stock_asset_id <> new.stock_asset_id
     or v_order.player_session_id <> new.player_session_id
     or v_order.player_id <> new.player_id
     or v_order.side <> new.side
  then
    raise exception 'STOCK_TRADE_ORDER_SCOPE_MISMATCH' using errcode = 'P0001';
  end if;

  if nullif(btrim(coalesce(new.listing_currency_code, '')), '') is null then
    new.listing_currency_code := v_order.listing_currency_code;
  else
    new.listing_currency_code := upper(btrim(new.listing_currency_code));
  end if;

  if new.listing_currency_code <> v_order.listing_currency_code then
    raise exception 'STOCK_TRADE_LISTING_CURRENCY_MISMATCH'
      using errcode = 'P0001';
  end if;

  new.settlement_evidence_family := lower(
    btrim(coalesce(new.settlement_evidence_family, v_order.settlement_evidence_family))
  );

  if new.settlement_evidence_family <> v_order.settlement_evidence_family then
    raise exception 'STOCK_TRADE_EVIDENCE_FAMILY_MISMATCH'
      using errcode = 'P0001';
  end if;

  if new.settlement_evidence_family = 'c3' then
    if new.price_tick_index is null then
      new.price_tick_index := v_order.price_tick_index;
    end if;
    if new.price_tick_index is distinct from v_order.price_tick_index then
      raise exception 'STOCK_TRADE_PRICE_TICK_MISMATCH' using errcode = 'P0001';
    end if;
  elsif new.price_tick_index is not null then
    raise exception 'STOCK_TRADE_LEGACY_TICK_FORBIDDEN' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and (
    new.listing_currency_code is distinct from old.listing_currency_code
    or new.settlement_evidence_family is distinct from old.settlement_evidence_family
    or new.price_tick_index is distinct from old.price_tick_index
  ) then
    raise exception 'STOCK_TRADE_SETTLEMENT_EVIDENCE_IMMUTABLE'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_stock_trade_currency_evidence_v1()
  from public, anon, authenticated, service_role;

create trigger guard_stock_trade_currency_evidence_v1
before insert or update on public.stock_trades
for each row execute function private.guard_stock_trade_currency_evidence_v1();

create table public.stock_market_liquidity_accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique,
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  currency_code text not null references public.currencies(code),
  bank_account_id uuid not null,
  system_key text not null default 'stocks.market-liquidity',
  initialization_policy text not null default 'zero-balance-identity-v1',
  created_at timestamptz not null default clock_timestamp(),

  constraint stock_market_liquidity_accounts_scope_id_unique
    unique (id, game_session_id),
  constraint stock_market_liquidity_accounts_public_key_format
    check (public_key ~ '^sml_[0-9a-f]{32}$'),
  constraint stock_market_liquidity_accounts_account_scope_fk
    foreign key (bank_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id),
  constraint stock_market_liquidity_accounts_system_key_check
    check (system_key = 'stocks.market-liquidity'),
  constraint stock_market_liquidity_accounts_policy_check
    check (initialization_policy = 'zero-balance-identity-v1'),
  constraint stock_market_liquidity_accounts_game_currency_unique
    unique (game_session_id, currency_code),
  constraint stock_market_liquidity_accounts_bank_account_unique
    unique (bank_account_id)
);

create index stock_market_liquidity_accounts_game_idx
  on public.stock_market_liquidity_accounts(game_session_id, currency_code);

alter table public.stock_market_liquidity_accounts enable row level security;
alter table public.stock_market_liquidity_accounts force row level security;
revoke all on table public.stock_market_liquidity_accounts
  from public, anon, authenticated, service_role;
grant select on table public.stock_market_liquidity_accounts to service_role;

comment on table public.stock_market_liquidity_accounts is
  'Immutable Stock-domain binding to canonical zero-balance B2 system Checking accounts. It is identity evidence, not a balance authority or capitalization command.';

create or replace function private.reject_stock_market_liquidity_binding_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if tg_op = 'DELETE' and not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = old.game_session_id
  ) then
    return old;
  end if;

  raise exception 'STOCK_MARKET_LIQUIDITY_BINDING_IMMUTABLE'
    using errcode = '42501';
end;
$function$;

revoke all on function private.reject_stock_market_liquidity_binding_mutation_v1()
  from public, anon, authenticated, service_role;

create trigger guard_stock_market_liquidity_binding_immutable
before update or delete on public.stock_market_liquidity_accounts
for each row execute function private.reject_stock_market_liquidity_binding_mutation_v1();

create or replace function private.ensure_stock_market_liquidity_account_v1(
  p_game_session_id uuid,
  p_currency_code text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_currency_code text := upper(btrim(coalesce(p_currency_code, '')));
  v_account_id uuid;
  v_binding public.stock_market_liquidity_accounts%rowtype;
  v_public_key text;
  v_balance numeric(38, 18);
begin
  if p_game_session_id is null then
    raise exception 'STOCK_MARKET_LIQUIDITY_GAME_REQUIRED' using errcode = '22023';
  end if;

  perform 1
  from public.game_sessions as game_row
  where game_row.id = p_game_session_id;
  if not found then
    raise exception 'STOCK_MARKET_LIQUIDITY_GAME_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform 1
  from public.country_profiles as profile_row
  join public.currencies as currency_row
    on currency_row.code = profile_row.currency_code
   and currency_row.status = 'active'
  where profile_row.currency_code = v_currency_code
    and profile_row.status = 'active';
  if not found then
    raise exception 'STOCK_MARKET_LIQUIDITY_CURRENCY_INVALID' using errcode = 'P0001';
  end if;

  v_account_id := private.ensure_system_bank_account_v1(
    p_game_session_id,
    'stocks.market-liquidity',
    'checking',
    v_currency_code
  );

  select coalesce(balance_row.balance, 0)
  into v_balance
  from public.bank_accounts as account_row
  left join public.account_balances as balance_row
    on balance_row.bank_account_id = account_row.id
   and balance_row.game_session_id = account_row.game_session_id
  where account_row.id = v_account_id
    and account_row.game_session_id = p_game_session_id
    and account_row.account_kind = 'checking'
    and account_row.currency_code = v_currency_code
    and account_row.status = 'active';

  if not found then
    raise exception 'STOCK_MARKET_LIQUIDITY_ACCOUNT_INVALID' using errcode = 'P0001';
  end if;

  v_public_key := 'sml_' || substr(private.bank_digest_text_v1(
    concat_ws(
      '|',
      'stock-market-liquidity-binding-v1',
      p_game_session_id::text,
      v_currency_code
    )
  ), 1, 32);

  insert into public.stock_market_liquidity_accounts (
    public_key,
    game_session_id,
    currency_code,
    bank_account_id,
    system_key,
    initialization_policy
  ) values (
    v_public_key,
    p_game_session_id,
    v_currency_code,
    v_account_id,
    'stocks.market-liquidity',
    'zero-balance-identity-v1'
  )
  on conflict (game_session_id, currency_code) do nothing;

  select binding_row.*
  into v_binding
  from public.stock_market_liquidity_accounts as binding_row
  where binding_row.game_session_id = p_game_session_id
    and binding_row.currency_code = v_currency_code;

  if not found
     or v_binding.bank_account_id <> v_account_id
     or v_binding.public_key <> v_public_key
     or v_binding.system_key <> 'stocks.market-liquidity'
     or v_binding.initialization_policy <> 'zero-balance-identity-v1'
  then
    raise exception 'STOCK_MARKET_LIQUIDITY_BINDING_CONFLICT'
      using errcode = 'P0001';
  end if;

  -- Identity initialization never writes money. Existing balance, including a
  -- balance created later by certified buy/sell settlement, is left untouched.
  perform v_balance;

  return v_account_id;
end;
$function$;

revoke all on function private.ensure_stock_market_liquidity_account_v1(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.initialize_stock_market_liquidity_accounts_v1(
  p_game_session_id uuid
)
returns table (
  currency_code text,
  binding_key text,
  account_key text,
  initialization_policy text
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_currency_code text;
  v_account_id uuid;
begin
  if p_game_session_id is null then
    raise exception 'STOCK_MARKET_LIQUIDITY_GAME_REQUIRED' using errcode = '22023';
  end if;

  for v_currency_code in
    select distinct asset_row.listing_currency_code
    from public.game_session_stock_assets as asset_row
    where asset_row.game_session_id = p_game_session_id
      and asset_row.is_active = true
    order by asset_row.listing_currency_code
  loop
    v_account_id := private.ensure_stock_market_liquidity_account_v1(
      p_game_session_id,
      v_currency_code
    );

    return query
    select binding_row.currency_code,
           binding_row.public_key,
           account_row.public_key,
           binding_row.initialization_policy
    from public.stock_market_liquidity_accounts as binding_row
    join public.bank_accounts as account_row
      on account_row.id = binding_row.bank_account_id
     and account_row.game_session_id = binding_row.game_session_id
    where binding_row.game_session_id = p_game_session_id
      and binding_row.currency_code = v_currency_code
      and binding_row.bank_account_id = v_account_id;
  end loop;
end;
$function$;

revoke all on function public.initialize_stock_market_liquidity_accounts_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.initialize_stock_market_liquidity_accounts_v1(uuid)
  to service_role;

comment on function public.initialize_stock_market_liquidity_accounts_v1(uuid) is
  'Trusted idempotent identity provisioning for zero-balance Stock market-liquidity Checking accounts. Does not post ledger entries or create balances.';

commit;
