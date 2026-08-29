begin;

-- BUSINESS-V2-10A4C3 / C3A
-- Compatibility-safe Stock Market listing-currency and purchase-funding bindings.
-- This migration does not activate a new order execution path.

alter table public.game_session_stock_assets
  add column if not exists listing_currency_code text;

update public.game_session_stock_assets
set listing_currency_code = 'ECO'
where listing_currency_code is null;

alter table public.game_session_stock_assets
  alter column listing_currency_code set default 'ECO',
  alter column listing_currency_code set not null;

alter table public.stock_orders
  add column if not exists listing_currency_code text,
  add column if not exists stock_purchase_quote_id uuid,
  add column if not exists purchase_funding_quote_id uuid,
  add column if not exists purchase_funding_receipt_id uuid,
  add column if not exists funding_bank_transaction_id uuid,
  add column if not exists settlement_bank_transaction_id uuid,
  add column if not exists proceeds_bank_account_id uuid,
  add column if not exists trading_fee_amount numeric(20, 6),
  add column if not exists net_settlement_amount numeric(20, 6);

update public.stock_orders as order_row
set listing_currency_code = coalesce(asset.listing_currency_code, 'ECO')
from public.game_session_stock_assets as asset
where order_row.stock_asset_id = asset.id
  and order_row.listing_currency_code is null;

update public.stock_orders
set listing_currency_code = 'ECO'
where listing_currency_code is null;

alter table public.stock_orders
  alter column listing_currency_code set default 'ECO',
  alter column listing_currency_code set not null;

alter table public.stock_trades
  add column if not exists listing_currency_code text,
  add column if not exists stock_purchase_quote_id uuid,
  add column if not exists purchase_funding_receipt_id uuid,
  add column if not exists funding_bank_transaction_id uuid,
  add column if not exists settlement_bank_transaction_id uuid,
  add column if not exists trading_fee_amount numeric(20, 6),
  add column if not exists net_settlement_amount numeric(20, 6);

update public.stock_trades as trade_row
set listing_currency_code = coalesce(asset.listing_currency_code, 'ECO')
from public.game_session_stock_assets as asset
where trade_row.stock_asset_id = asset.id
  and trade_row.listing_currency_code is null;

update public.stock_trades
set listing_currency_code = 'ECO'
where listing_currency_code is null;

alter table public.stock_trades
  alter column listing_currency_code set default 'ECO',
  alter column listing_currency_code set not null;

alter table public.stock_holdings
  add column if not exists cost_currency_code text;

update public.stock_holdings as holding_row
set cost_currency_code = coalesce(asset.listing_currency_code, 'ECO')
from public.game_session_stock_assets as asset
where holding_row.stock_asset_id = asset.id
  and holding_row.cost_currency_code is null;

update public.stock_holdings
set cost_currency_code = 'ECO'
where cost_currency_code is null;

alter table public.stock_holdings
  alter column cost_currency_code set default 'ECO',
  alter column cost_currency_code set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.game_session_stock_assets'::regclass
      and conname = 'game_session_stock_assets_listing_currency_format'
  ) then
    alter table public.game_session_stock_assets
      add constraint game_session_stock_assets_listing_currency_format
      check (listing_currency_code ~ '^[A-Z][A-Z0-9]{2,11}$') not valid;
    alter table public.game_session_stock_assets
      validate constraint game_session_stock_assets_listing_currency_format;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.stock_orders'::regclass
      and conname = 'stock_orders_listing_currency_format'
  ) then
    alter table public.stock_orders
      add constraint stock_orders_listing_currency_format
      check (listing_currency_code ~ '^[A-Z][A-Z0-9]{2,11}$') not valid;
    alter table public.stock_orders
      validate constraint stock_orders_listing_currency_format;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.stock_trades'::regclass
      and conname = 'stock_trades_listing_currency_format'
  ) then
    alter table public.stock_trades
      add constraint stock_trades_listing_currency_format
      check (listing_currency_code ~ '^[A-Z][A-Z0-9]{2,11}$') not valid;
    alter table public.stock_trades
      validate constraint stock_trades_listing_currency_format;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.stock_holdings'::regclass
      and conname = 'stock_holdings_cost_currency_format'
  ) then
    alter table public.stock_holdings
      add constraint stock_holdings_cost_currency_format
      check (cost_currency_code ~ '^[A-Z][A-Z0-9]{2,11}$') not valid;
    alter table public.stock_holdings
      validate constraint stock_holdings_cost_currency_format;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.stock_orders'::regclass
      and conname = 'stock_orders_trading_fee_nonnegative'
  ) then
    alter table public.stock_orders
      add constraint stock_orders_trading_fee_nonnegative
      check (trading_fee_amount is null or trading_fee_amount >= 0) not valid;
    alter table public.stock_orders
      validate constraint stock_orders_trading_fee_nonnegative;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.stock_trades'::regclass
      and conname = 'stock_trades_trading_fee_nonnegative'
  ) then
    alter table public.stock_trades
      add constraint stock_trades_trading_fee_nonnegative
      check (trading_fee_amount is null or trading_fee_amount >= 0) not valid;
    alter table public.stock_trades
      validate constraint stock_trades_trading_fee_nonnegative;
  end if;
end
$$;

create table if not exists public.stock_purchase_funding_quotes_v1 (
  id uuid primary key default gen_random_uuid(),
  public_key text not null default (
    'sfq_' || replace(gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_session_id uuid not null references public.player_sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  stock_asset_id uuid not null references public.game_session_stock_assets(id) on delete restrict,
  side text not null default 'buy',
  order_type text not null default 'market',
  time_in_force text,
  quantity bigint not null,
  expected_price numeric(20, 6) not null,
  limit_price numeric(20, 6),
  price_tick_index bigint,
  listing_currency_code text not null,
  maximum_gross_amount numeric(20, 6) not null,
  trading_fee_amount numeric(20, 6) not null default 0,
  target_amount numeric(20, 6) not null,
  purchase_funding_quote_id uuid not null,
  funding_context_hash text not null,
  request_hash text not null,
  idempotency_key text not null,
  status text not null default 'quoted',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint stock_purchase_funding_quotes_v1_public_key_unique unique (public_key),
  constraint stock_purchase_funding_quotes_v1_public_key_format
    check (public_key ~ '^sfq_[0-9a-f]{32}$'),
  constraint stock_purchase_funding_quotes_v1_side_buy
    check (side = 'buy'),
  constraint stock_purchase_funding_quotes_v1_order_type
    check (order_type in ('market', 'limit')),
  constraint stock_purchase_funding_quotes_v1_time_in_force
    check (
      time_in_force is null
      or time_in_force in ('immediate_or_cancel', 'fill_or_kill', 'day', 'good_til_cancelled')
    ),
  constraint stock_purchase_funding_quotes_v1_quantity_positive
    check (quantity > 0),
  constraint stock_purchase_funding_quotes_v1_expected_price_positive
    check (expected_price > 0),
  constraint stock_purchase_funding_quotes_v1_limit_price_valid
    check (
      (order_type = 'market' and limit_price is null)
      or (order_type = 'limit' and limit_price is not null and limit_price > 0)
    ),
  constraint stock_purchase_funding_quotes_v1_currency_format
    check (listing_currency_code ~ '^[A-Z][A-Z0-9]{2,11}$'),
  constraint stock_purchase_funding_quotes_v1_amounts_valid
    check (
      maximum_gross_amount > 0
      and trading_fee_amount >= 0
      and target_amount > 0
      and target_amount = maximum_gross_amount + trading_fee_amount
    ),
  constraint stock_purchase_funding_quotes_v1_context_hash_format
    check (funding_context_hash ~ '^[0-9a-f]{64}$'),
  constraint stock_purchase_funding_quotes_v1_request_hash_format
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint stock_purchase_funding_quotes_v1_idempotency_key_format
    check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'),
  constraint stock_purchase_funding_quotes_v1_status
    check (status in ('quoted', 'consumed', 'expired', 'cancelled')),
  constraint stock_purchase_funding_quotes_v1_expiry
    check (expires_at > created_at),
  constraint stock_purchase_funding_quotes_v1_lifecycle
    check (
      (status = 'quoted' and consumed_at is null and cancelled_at is null)
      or (status = 'consumed' and consumed_at is not null and cancelled_at is null)
      or (status in ('expired', 'cancelled') and consumed_at is null)
    ),
  constraint stock_purchase_funding_quotes_v1_idempotency_unique
    unique (game_session_id, player_session_id, idempotency_key),
  constraint stock_purchase_funding_quotes_v1_funding_quote_unique
    unique (purchase_funding_quote_id)
);

create index if not exists stock_purchase_funding_quotes_v1_player_created_idx
  on public.stock_purchase_funding_quotes_v1 (
    game_session_id,
    player_session_id,
    created_at desc
  );

create index if not exists stock_purchase_funding_quotes_v1_asset_status_idx
  on public.stock_purchase_funding_quotes_v1 (
    game_session_id,
    stock_asset_id,
    status,
    expires_at
  );

create index if not exists stock_orders_listing_currency_idx
  on public.stock_orders (game_session_id, listing_currency_code, created_at desc);

create index if not exists stock_trades_listing_currency_idx
  on public.stock_trades (game_session_id, listing_currency_code, created_at desc);

create or replace function private.guard_stock_purchase_funding_quotes_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if current_setting('econovaria.stock_funding_command_v1', true) is distinct from 'on' then
    raise exception 'STOCK_FUNDING_DIRECT_DML_FORBIDDEN';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end
$$;

revoke all on function private.guard_stock_purchase_funding_quotes_v1()
  from public, anon, authenticated, service_role;

alter table public.stock_purchase_funding_quotes_v1 enable row level security;
alter table public.stock_purchase_funding_quotes_v1 force row level security;

revoke all on table public.stock_purchase_funding_quotes_v1
  from public, anon, authenticated, service_role;

revoke all on sequence public.stock_purchase_funding_quotes_v1_id_seq
  from public, anon, authenticated, service_role;

-- The table uses UUID keys, so PostgreSQL normally creates no sequence. Keep the
-- revoke idempotent when no sequence exists.
do $$
begin
  if to_regclass('public.stock_purchase_funding_quotes_v1_id_seq') is null then
    null;
  end if;
exception
  when undefined_table then
    null;
end
$$;

drop trigger if exists guard_stock_purchase_funding_quotes_v1
  on public.stock_purchase_funding_quotes_v1;
create trigger guard_stock_purchase_funding_quotes_v1
before insert or update or delete on public.stock_purchase_funding_quotes_v1
for each row execute function private.guard_stock_purchase_funding_quotes_v1();

-- Bind listing-currency columns to the same canonical currency authority used by
-- the certified C0 purchase-funding quote. The exact currency table is resolved
-- from the rebuilt schema instead of hard-coding a parallel registry.
do $$
declare
  currency_schema text;
  currency_table text;
  currency_column text;
  relation_name text;
  column_name text;
  constraint_name text;
begin
  select target_namespace.nspname,
         target_relation.relname,
         target_attribute.attname
  into currency_schema, currency_table, currency_column
  from pg_constraint as constraint_row
  join pg_class as source_relation
    on source_relation.oid = constraint_row.conrelid
  join pg_namespace as source_namespace
    on source_namespace.oid = source_relation.relnamespace
  join unnest(constraint_row.conkey) with ordinality as source_key(attnum, ordinality)
    on true
  join unnest(constraint_row.confkey) with ordinality as target_key(attnum, ordinality)
    on target_key.ordinality = source_key.ordinality
  join pg_attribute as source_attribute
    on source_attribute.attrelid = source_relation.oid
   and source_attribute.attnum = source_key.attnum
  join pg_class as target_relation
    on target_relation.oid = constraint_row.confrelid
  join pg_namespace as target_namespace
    on target_namespace.oid = target_relation.relnamespace
  join pg_attribute as target_attribute
    on target_attribute.attrelid = target_relation.oid
   and target_attribute.attnum = target_key.attnum
  where constraint_row.contype = 'f'
    and source_namespace.nspname = 'public'
    and source_relation.relname ilike '%funding%quote%'
    and source_attribute.attname = 'target_currency_code'
  order by
    case when source_relation.relname = 'purchase_funding_quotes_v1' then 0 else 1 end,
    source_relation.relname
  limit 1;

  if currency_table is null then
    select table_schema, table_name, 'currency_code'
    into currency_schema, currency_table, currency_column
    from information_schema.columns as code_column
    where code_column.column_name = 'currency_code'
      and exists (
        select 1
        from information_schema.columns as minor_column
        where minor_column.table_schema = code_column.table_schema
          and minor_column.table_name = code_column.table_name
          and minor_column.column_name in ('minor_unit', 'decimal_places')
      )
    order by
      case when code_column.table_name ilike '%currency%registr%' then 0 else 1 end,
      code_column.table_schema,
      code_column.table_name
    limit 1;
  end if;

  if currency_table is null then
    raise exception 'STOCK_FUNDING_CANONICAL_CURRENCY_AUTHORITY_MISSING';
  end if;

  for relation_name, column_name, constraint_name in
    values
      ('game_session_stock_assets', 'listing_currency_code', 'game_session_stock_assets_listing_currency_fk'),
      ('stock_orders', 'listing_currency_code', 'stock_orders_listing_currency_fk'),
      ('stock_trades', 'listing_currency_code', 'stock_trades_listing_currency_fk'),
      ('stock_holdings', 'cost_currency_code', 'stock_holdings_cost_currency_fk'),
      ('stock_purchase_funding_quotes_v1', 'listing_currency_code', 'stock_purchase_funding_quotes_v1_currency_fk')
  loop
    if not exists (
      select 1
      from pg_constraint
      where conrelid = format('public.%I', relation_name)::regclass
        and conname = constraint_name
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references %I.%I(%I) on update restrict on delete restrict not valid',
        relation_name,
        constraint_name,
        column_name,
        currency_schema,
        currency_table,
        currency_column
      );
      execute format(
        'alter table public.%I validate constraint %I',
        relation_name,
        constraint_name
      );
    end if;
  end loop;
end
$$;

-- Bind the Stock quote to the exact C0 funding-quote table discovered from the
-- certified schema. C3 stores only an immutable reference; C0 remains owner.
do $$
declare
  funding_schema text;
  funding_table text;
begin
  select table_schema, table_name
  into funding_schema, funding_table
  from information_schema.columns as id_column
  where id_column.column_name = 'id'
    and id_column.data_type = 'uuid'
    and id_column.table_name ilike '%funding%quote%'
    and exists (
      select 1
      from information_schema.columns as public_key_column
      where public_key_column.table_schema = id_column.table_schema
        and public_key_column.table_name = id_column.table_name
        and public_key_column.column_name = 'public_key'
    )
    and exists (
      select 1
      from information_schema.columns as target_column
      where target_column.table_schema = id_column.table_schema
        and target_column.table_name = id_column.table_name
        and target_column.column_name = 'target_currency_code'
    )
  order by
    case when id_column.table_name = 'purchase_funding_quotes_v1' then 0 else 1 end,
    id_column.table_schema,
    id_column.table_name
  limit 1;

  if funding_table is null then
    raise exception 'STOCK_FUNDING_C0_QUOTE_AUTHORITY_MISSING';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.stock_purchase_funding_quotes_v1'::regclass
      and conname = 'stock_purchase_funding_quotes_v1_c0_quote_fk'
  ) then
    execute format(
      'alter table public.stock_purchase_funding_quotes_v1 add constraint stock_purchase_funding_quotes_v1_c0_quote_fk foreign key (purchase_funding_quote_id) references %I.%I(id) on update restrict on delete restrict',
      funding_schema,
      funding_table
    );
  end if;
end
$$;

comment on table public.stock_purchase_funding_quotes_v1 is
  'C3 Financial Markets commercial quote bound immutably to one C0 purchase-funding quote; no execution authority.';
comment on column public.game_session_stock_assets.listing_currency_code is
  'Authoritative Financial Markets listing currency. Existing assets are deterministically backfilled to ECO.';
comment on column public.stock_orders.purchase_funding_quote_id is
  'Compatibility-safe C0 funding quote reference for a future C3-funded buy; null for legacy orders.';
comment on column public.stock_orders.purchase_funding_receipt_id is
  'Compatibility-safe C0 funding receipt reference for a future C3-funded buy; null for legacy orders.';

commit;
