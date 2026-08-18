-- Server-authoritative Business wholesale procurement V2.
--
-- Wholesale is a Business-only procurement market for existing canonical
-- game_items. Players choose item and quantity; Econovaria owns supplier stock,
-- price, lead time, replenishment, and delivery timing.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table if not exists public.business_wholesale_suppliers (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('sup_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  supplier_key text not null,
  display_name text not null,
  country_code text not null,
  status text not null default 'active',
  reliability_index numeric(10,4) not null default 1,
  lead_time_multiplier numeric(10,4) not null default 1,
  pricing_multiplier numeric(10,4) not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_wholesale_suppliers_public_key_check
    check (public_key ~ '^sup_[0-9a-f]{32}$'),
  constraint business_wholesale_suppliers_key_check
    check (supplier_key ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  constraint business_wholesale_suppliers_name_check
    check (length(btrim(display_name)) between 2 and 120),
  constraint business_wholesale_suppliers_country_check
    check (country_code = upper(country_code) and length(country_code) between 2 and 16),
  constraint business_wholesale_suppliers_status_check
    check (status in ('active', 'constrained', 'offline')),
  constraint business_wholesale_suppliers_reliability_check
    check (reliability_index between 0.25 and 1.25),
  constraint business_wholesale_suppliers_lead_check
    check (lead_time_multiplier between 0.25 and 4),
  constraint business_wholesale_suppliers_pricing_check
    check (pricing_multiplier between 0.25 and 4),
  constraint business_wholesale_suppliers_metadata_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint business_wholesale_suppliers_scope_unique
    unique (game_session_id, supplier_key),
  constraint business_wholesale_suppliers_scope_id_unique
    unique (game_session_id, id)
);

create trigger set_business_wholesale_suppliers_updated_at
before update on public.business_wholesale_suppliers
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_wholesale_suppliers enable row level security;
revoke all on table public.business_wholesale_suppliers from public, anon, authenticated;
grant select, insert, update on table public.business_wholesale_suppliers to service_role;

create table if not exists public.business_wholesale_supplier_items (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('wsi_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  supplier_id uuid not null,
  game_item_id uuid not null,
  normal_unit_price numeric(14,2) not null,
  base_quantity integer not null,
  current_quantity integer not null,
  max_quantity integer not null,
  replenishment_quantity integer not null,
  replenishment_period_hours integer not null default 24,
  base_lead_time_hours integer not null default 12,
  minimum_order_quantity integer not null default 1,
  maximum_order_quantity integer not null default 10000,
  price_volatility_basis_points integer not null default 600,
  scarcity_price_basis_points integer not null default 2000,
  status text not null default 'active',
  last_replenished_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_wholesale_supplier_items_public_key_check
    check (public_key ~ '^wsi_[0-9a-f]{32}$'),
  constraint business_wholesale_supplier_items_supplier_scope_fk
    foreign key (game_session_id, supplier_id)
    references public.business_wholesale_suppliers(game_session_id, id) on delete cascade,
  constraint business_wholesale_supplier_items_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id) on delete restrict,
  constraint business_wholesale_supplier_items_price_check
    check (normal_unit_price > 0 and normal_unit_price <= 10000000),
  constraint business_wholesale_supplier_items_quantity_check check (
    base_quantity >= 0
    and current_quantity >= 0
    and max_quantity > 0
    and base_quantity <= max_quantity
    and current_quantity <= max_quantity
    and replenishment_quantity >= 0
  ),
  constraint business_wholesale_supplier_items_replenishment_period_check
    check (replenishment_period_hours between 1 and 720),
  constraint business_wholesale_supplier_items_lead_time_check
    check (base_lead_time_hours between 0 and 720),
  constraint business_wholesale_supplier_items_order_bounds_check check (
    minimum_order_quantity between 1 and 1000000
    and maximum_order_quantity >= minimum_order_quantity
    and maximum_order_quantity <= 1000000
  ),
  constraint business_wholesale_supplier_items_volatility_check
    check (price_volatility_basis_points between 0 and 5000),
  constraint business_wholesale_supplier_items_scarcity_check
    check (scarcity_price_basis_points between 0 and 10000),
  constraint business_wholesale_supplier_items_status_check
    check (status in ('active', 'constrained', 'discontinued')),
  constraint business_wholesale_supplier_items_metadata_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint business_wholesale_supplier_items_unique
    unique (game_session_id, supplier_id, game_item_id),
  constraint business_wholesale_supplier_items_scope_id_unique
    unique (game_session_id, id)
);

create index if not exists business_wholesale_supplier_items_item_idx
  on public.business_wholesale_supplier_items(game_session_id, game_item_id, status, supplier_id);
create index if not exists business_wholesale_supplier_items_replenishment_idx
  on public.business_wholesale_supplier_items(game_session_id, last_replenished_at, status)
  where status in ('active', 'constrained');

create trigger set_business_wholesale_supplier_items_updated_at
before update on public.business_wholesale_supplier_items
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_wholesale_supplier_items enable row level security;
revoke all on table public.business_wholesale_supplier_items from public, anon, authenticated;
grant select, insert, update on table public.business_wholesale_supplier_items to service_role;

-- Catalog configuration is a server/staff domain command. It cannot be called by
-- Player browser roles and never creates an item definition.
create or replace function public.configure_business_wholesale_supplier_item_v2(
  p_game_session_id uuid,
  p_supplier_key text,
  p_item_key text,
  p_normal_unit_price numeric,
  p_base_quantity integer,
  p_max_quantity integer,
  p_replenishment_quantity integer,
  p_base_lead_time_hours integer,
  p_price_volatility_basis_points integer default 600
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_supplier public.business_wholesale_suppliers%rowtype;
  v_item public.game_items%rowtype;
  v_row public.business_wholesale_supplier_items%rowtype;
begin
  if p_normal_unit_price is null or p_normal_unit_price <= 0 then
    raise exception 'BUSINESS_WHOLESALE_PRICE_INVALID' using errcode = 'P0001';
  end if;
  if p_base_quantity < 0 or p_max_quantity <= 0 or p_base_quantity > p_max_quantity then
    raise exception 'BUSINESS_WHOLESALE_QUANTITY_INVALID' using errcode = 'P0001';
  end if;
  if p_replenishment_quantity < 0 then
    raise exception 'BUSINESS_WHOLESALE_REPLENISHMENT_INVALID' using errcode = 'P0001';
  end if;

  select supplier_row.* into v_supplier
  from public.business_wholesale_suppliers as supplier_row
  where supplier_row.game_session_id = p_game_session_id
    and supplier_row.supplier_key = lower(btrim(p_supplier_key));
  if not found then
    raise exception 'BUSINESS_WHOLESALE_SUPPLIER_NOT_FOUND' using errcode = 'P0001';
  end if;

  select item_row.* into v_item
  from public.game_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.public_key = lower(btrim(p_item_key))
    and item_row.status = 'active';
  if not found then
    raise exception 'BUSINESS_WHOLESALE_ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_item.source_kind = 'business_product' then
    raise exception 'BUSINESS_WHOLESALE_PLAYER_AUTHORED_ITEM_PROHIBITED' using errcode = 'P0001';
  end if;

  insert into public.business_wholesale_supplier_items(
    game_session_id,
    supplier_id,
    game_item_id,
    normal_unit_price,
    base_quantity,
    current_quantity,
    max_quantity,
    replenishment_quantity,
    base_lead_time_hours,
    price_volatility_basis_points
  ) values (
    p_game_session_id,
    v_supplier.id,
    v_item.id,
    round(p_normal_unit_price, 2),
    p_base_quantity,
    p_base_quantity,
    p_max_quantity,
    p_replenishment_quantity,
    p_base_lead_time_hours,
    p_price_volatility_basis_points
  )
  on conflict (game_session_id, supplier_id, game_item_id) do update set
    normal_unit_price = excluded.normal_unit_price,
    base_quantity = excluded.base_quantity,
    current_quantity = least(
      public.business_wholesale_supplier_items.current_quantity,
      excluded.max_quantity
    ),
    max_quantity = excluded.max_quantity,
    replenishment_quantity = excluded.replenishment_quantity,
    base_lead_time_hours = excluded.base_lead_time_hours,
    price_volatility_basis_points = excluded.price_volatility_basis_points,
    status = 'active'
  returning * into v_row;

  return v_row.public_key;
end
$function$;

-- A deterministic game/date factor prevents browser refreshes from rerolling
-- wholesale prices. World/Campaign systems can modify supplier multipliers or
-- configuration through their own server-owned policy seams.
create or replace function public.business_wholesale_quote_v2(
  p_game_session_id uuid,
  p_supplier_item_id uuid,
  p_effective_date date default current_date
)
returns table (
  normal_unit_price numeric,
  quoted_unit_price numeric,
  discount_premium_basis_points integer,
  available_quantity integer,
  lead_time_hours integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_row record;
  v_hash bytea;
  v_roll integer;
  v_daily_bps integer;
  v_stock_ratio numeric;
  v_scarcity_bps integer;
  v_macro numeric := 1;
  v_config jsonb := '{}'::jsonb;
  v_price numeric;
  v_lead integer;
begin
  select item_row.*, supplier_row.pricing_multiplier, supplier_row.lead_time_multiplier,
         supplier_row.status as supplier_status
  into v_row
  from public.business_wholesale_supplier_items as item_row
  join public.business_wholesale_suppliers as supplier_row
    on supplier_row.game_session_id = item_row.game_session_id
   and supplier_row.id = item_row.supplier_id
  where item_row.game_session_id = p_game_session_id
    and item_row.id = p_supplier_item_id
    and item_row.status in ('active', 'constrained')
    and supplier_row.status in ('active', 'constrained');
  if not found then
    raise exception 'BUSINESS_WHOLESALE_ITEM_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select coalesce(settings_row.business_market_window -> 'wholesale', '{}'::jsonb)
  into v_config
  from public.game_settings as settings_row
  where settings_row.game_session_id = p_game_session_id;
  if coalesce(v_config ->> 'macroPriceMultiplier', '') ~ '^\d+(\.\d+)?$' then
    v_macro := least(3, greatest(0.25, (v_config ->> 'macroPriceMultiplier')::numeric));
  end if;

  v_hash := extensions.digest(
    concat_ws('|', p_game_session_id::text, v_row.id::text, p_effective_date::text),
    'sha256'
  );
  v_roll := get_byte(v_hash, 0) * 256 + get_byte(v_hash, 1);
  v_daily_bps := round(
    ((v_roll / 65535.0) * 2 - 1) * v_row.price_volatility_basis_points
  )::integer;

  v_stock_ratio := case
    when v_row.max_quantity <= 0 then 0
    else v_row.current_quantity::numeric / v_row.max_quantity
  end;
  v_scarcity_bps := round(
    greatest(0, 1 - v_stock_ratio) * v_row.scarcity_price_basis_points
  )::integer;

  v_price := round(
    v_row.normal_unit_price
    * v_row.pricing_multiplier
    * v_macro
    * (1 + (v_daily_bps + v_scarcity_bps) / 10000.0),
    2
  );
  v_price := greatest(0.01, v_price);
  v_lead := greatest(
    0,
    ceil(
      v_row.base_lead_time_hours
      * v_row.lead_time_multiplier
      * case when v_stock_ratio < 0.20 then 1.50 else 1 end
    )::integer
  );

  return query select
    v_row.normal_unit_price,
    v_price,
    round((v_price / v_row.normal_unit_price - 1) * 10000)::integer,
    v_row.current_quantity,
    v_lead;
end
$function$;

create table if not exists public.business_wholesale_orders (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('who_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  supplier_item_id uuid not null,
  game_item_id uuid not null,
  ordered_by_player_id uuid not null,
  quantity integer not null,
  normal_unit_price numeric(14,2) not null,
  quoted_unit_price numeric(14,2) not null,
  total_cost numeric(14,2) not null,
  price_basis_points integer not null,
  status text not null default 'in_transit',
  ordered_at timestamptz not null default now(),
  deliver_at timestamptz not null,
  delivered_at timestamptz null,
  inventory_transaction_id uuid null,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),

  constraint business_wholesale_orders_public_key_check
    check (public_key ~ '^who_[0-9a-f]{32}$'),
  constraint business_wholesale_orders_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete restrict,
  constraint business_wholesale_orders_supplier_item_scope_fk
    foreign key (game_session_id, supplier_item_id)
    references public.business_wholesale_supplier_items(game_session_id, id) on delete restrict,
  constraint business_wholesale_orders_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id) on delete restrict,
  constraint business_wholesale_orders_player_scope_fk
    foreign key (game_session_id, ordered_by_player_id)
    references public.players(game_session_id, id),
  constraint business_wholesale_orders_quantity_check check (quantity > 0),
  constraint business_wholesale_orders_price_check check (
    normal_unit_price > 0 and quoted_unit_price > 0 and total_cost > 0
  ),
  constraint business_wholesale_orders_total_check
    check (total_cost = round(quoted_unit_price * quantity, 2)),
  constraint business_wholesale_orders_status_check
    check (status in ('in_transit', 'delivered', 'cancelled', 'failed')),
  constraint business_wholesale_orders_delivery_time_check check (deliver_at >= ordered_at),
  constraint business_wholesale_orders_delivered_state_check check (
    (status = 'delivered' and delivered_at is not null and inventory_transaction_id is not null)
    or (status <> 'delivered' and delivered_at is null and inventory_transaction_id is null)
  ),
  constraint business_wholesale_orders_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 160),
  constraint business_wholesale_orders_metadata_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint business_wholesale_orders_idempotency_unique
    unique (game_session_id, business_id, ordered_by_player_id, idempotency_key),
  constraint business_wholesale_orders_scope_id_unique unique (game_session_id, id)
);

create index if not exists business_wholesale_orders_due_idx
  on public.business_wholesale_orders(status, deliver_at, game_session_id, business_id)
  where status = 'in_transit';
create index if not exists business_wholesale_orders_business_idx
  on public.business_wholesale_orders(game_session_id, business_id, ordered_at desc);

create trigger set_business_wholesale_orders_updated_at
before update on public.business_wholesale_orders
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_wholesale_orders enable row level security;
revoke all on table public.business_wholesale_orders from public, anon, authenticated;
grant select, insert, update on table public.business_wholesale_orders to service_role;

create or replace function public.replenish_business_wholesale_supply_v2(
  p_game_session_id uuid,
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_limit integer := least(2000, greatest(1, coalesce(p_limit, 500)));
  v_row public.business_wholesale_supplier_items%rowtype;
  v_periods integer;
  v_processed integer := 0;
begin
  for v_row in
    select item_row.*
    from public.business_wholesale_supplier_items as item_row
    where item_row.game_session_id = p_game_session_id
      and item_row.status in ('active', 'constrained')
      and item_row.last_replenished_at
        + make_interval(hours => item_row.replenishment_period_hours) <= now()
    order by item_row.last_replenished_at, item_row.id
    limit v_limit
    for update skip locked
  loop
    v_periods := greatest(
      1,
      floor(
        extract(epoch from (now() - v_row.last_replenished_at))
        / (v_row.replenishment_period_hours * 3600.0)
      )::integer
    );
    update public.business_wholesale_supplier_items
    set current_quantity = least(
          max_quantity,
          current_quantity + replenishment_quantity * v_periods
        ),
        last_replenished_at = last_replenished_at
          + make_interval(hours => replenishment_period_hours * v_periods)
    where id = v_row.id;
    v_processed := v_processed + 1;
  end loop;
  return v_processed;
end
$function$;

create or replace function public.place_business_wholesale_order_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_supplier_item_key text,
  p_quantity integer,
  p_idempotency_key text
)
returns table (
  order_key text,
  status text,
  item_key text,
  quantity integer,
  normal_unit_price numeric,
  quoted_unit_price numeric,
  total_cost numeric,
  price_basis_points integer,
  supplier_remaining integer,
  deliver_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_supplier_item public.business_wholesale_supplier_items%rowtype;
  v_supplier public.business_wholesale_suppliers%rowtype;
  v_item public.game_items%rowtype;
  v_order public.business_wholesale_orders%rowtype;
  v_quote record;
  v_cash numeric;
  v_total numeric;
  v_delivery timestamptz;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'BUSINESS_WHOLESALE_ORDER_QUANTITY_INVALID' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  select business_row.* into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = lower(btrim(p_business_key))
    and business_row.status <> 'closed'
    and business_row.formation_state = 'operational'
  for share;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND_OR_NOT_OPERATIONAL' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.business_ownership_positions as position_row
    where position_row.game_session_id = p_game_session_id
      and position_row.business_id = v_business.id
      and position_row.player_id = p_player_id
      and position_row.status = 'active'
  ) then
    raise exception 'BUSINESS_OWNERSHIP_REQUIRED' using errcode = 'P0001';
  end if;

  select order_row.* into v_order
  from public.business_wholesale_orders as order_row
  where order_row.game_session_id = p_game_session_id
    and order_row.business_id = v_business.id
    and order_row.ordered_by_player_id = p_player_id
    and order_row.idempotency_key = p_idempotency_key;
  if found then
    if v_order.quantity <> p_quantity then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    select item_row.* into v_item from public.game_items as item_row where item_row.id = v_order.game_item_id;
    return query select
      v_order.public_key, v_order.status, v_item.public_key, v_order.quantity,
      v_order.normal_unit_price, v_order.quoted_unit_price, v_order.total_cost,
      v_order.price_basis_points,
      (select current_quantity from public.business_wholesale_supplier_items where id = v_order.supplier_item_id),
      v_order.deliver_at, true;
    return;
  end if;

  select supplier_item_row.* into v_supplier_item
  from public.business_wholesale_supplier_items as supplier_item_row
  where supplier_item_row.game_session_id = p_game_session_id
    and supplier_item_row.public_key = lower(btrim(p_supplier_item_key))
    and supplier_item_row.status in ('active', 'constrained')
  for update;
  if not found then
    raise exception 'BUSINESS_WHOLESALE_ITEM_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select supplier_row.* into v_supplier
  from public.business_wholesale_suppliers as supplier_row
  where supplier_row.game_session_id = p_game_session_id
    and supplier_row.id = v_supplier_item.supplier_id
    and supplier_row.status in ('active', 'constrained')
  for share;
  if not found then
    raise exception 'BUSINESS_WHOLESALE_SUPPLIER_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_supplier.country_code <> v_business.country_code then
    raise exception 'BUSINESS_WHOLESALE_SUPPLIER_COUNTRY_MISMATCH' using errcode = 'P0001';
  end if;

  if p_quantity < v_supplier_item.minimum_order_quantity
    or p_quantity > v_supplier_item.maximum_order_quantity
  then
    raise exception 'BUSINESS_WHOLESALE_ORDER_OUT_OF_BOUNDS' using errcode = 'P0001';
  end if;
  if p_quantity > v_supplier_item.current_quantity then
    raise exception 'BUSINESS_WHOLESALE_STOCKOUT' using errcode = 'P0001';
  end if;

  select item_row.* into v_item
  from public.game_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.id = v_supplier_item.game_item_id
    and item_row.status = 'active';
  if not found or v_item.source_kind = 'business_product' then
    raise exception 'BUSINESS_WHOLESALE_CANONICAL_ITEM_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_quote
  from public.business_wholesale_quote_v2(
    p_game_session_id,
    v_supplier_item.id,
    current_date
  );
  v_total := round(v_quote.quoted_unit_price * p_quantity, 2);
  v_cash := public.read_business_balance_v2(p_game_session_id, v_business.id, v_business.currency_code);
  if v_cash < v_total then
    raise exception 'BUSINESS_WHOLESALE_INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  v_delivery := now() + make_interval(hours => v_quote.lead_time_hours);
  perform public.record_business_ledger_entry_v2(
    p_game_session_id,
    v_business.id,
    -v_total,
    v_business.currency_code,
    'debit',
    'business',
    'wholesale_procurement',
    v_supplier_item.id,
    'player',
    p_player_id,
    jsonb_build_object(
      'supplier_key', v_supplier.public_key,
      'supplier_item_key', v_supplier_item.public_key,
      'item_key', v_item.public_key,
      'quantity', p_quantity,
      'quoted_unit_price', v_quote.quoted_unit_price
    )
  );

  update public.business_wholesale_supplier_items
  set current_quantity = current_quantity - p_quantity
  where id = v_supplier_item.id
  returning * into v_supplier_item;

  insert into public.business_wholesale_orders(
    game_session_id,
    business_id,
    supplier_item_id,
    game_item_id,
    ordered_by_player_id,
    quantity,
    normal_unit_price,
    quoted_unit_price,
    total_cost,
    price_basis_points,
    status,
    deliver_at,
    idempotency_key,
    metadata
  ) values (
    p_game_session_id,
    v_business.id,
    v_supplier_item.id,
    v_item.id,
    p_player_id,
    p_quantity,
    v_quote.normal_unit_price,
    v_quote.quoted_unit_price,
    v_total,
    v_quote.discount_premium_basis_points,
    'in_transit',
    v_delivery,
    p_idempotency_key,
    jsonb_build_object(
      'supplierKey', v_supplier.public_key,
      'supplierItemKey', v_supplier_item.public_key,
      'itemKey', v_item.public_key,
      'leadTimeHours', v_quote.lead_time_hours
    )
  ) returning * into v_order;

  insert into public.business_activity_events(
    game_session_id,
    business_id,
    actor_type,
    actor_player_id,
    event_type,
    source_id,
    reason_code,
    metadata
  ) values (
    p_game_session_id,
    v_business.id,
    'player',
    p_player_id,
    'business.wholesale.order_placed',
    v_order.id,
    'wholesale_order_placed',
    jsonb_build_object(
      'orderKey', v_order.public_key,
      'itemKey', v_item.public_key,
      'quantity', p_quantity,
      'normalUnitPrice', v_quote.normal_unit_price,
      'quotedUnitPrice', v_quote.quoted_unit_price,
      'priceBasisPoints', v_quote.discount_premium_basis_points,
      'deliverAt', v_delivery
    )
  );

  return query select
    v_order.public_key,
    v_order.status,
    v_item.public_key,
    v_order.quantity,
    v_order.normal_unit_price,
    v_order.quoted_unit_price,
    v_order.total_cost,
    v_order.price_basis_points,
    v_supplier_item.current_quantity,
    v_order.deliver_at,
    false;
end
$function$;

-- Delivers due orders through the canonical Inventory v2 posting function.
-- Supplier stock was reserved at order placement; this step is retry-safe and
-- never creates game_items.
create or replace function public.complete_due_business_wholesale_orders_v2(
  p_limit integer default 100
)
returns table (
  processed integer,
  delivered integer,
  skipped integer
)
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_limit integer := least(1000, greatest(1, coalesce(p_limit, 100)));
  v_order public.business_wholesale_orders%rowtype;
  v_account_id uuid;
  v_transaction_id uuid;
  v_processed integer := 0;
  v_delivered integer := 0;
  v_skipped integer := 0;
begin
  for v_order in
    select order_row.*
    from public.business_wholesale_orders as order_row
    join public.business_entities as business_row
      on business_row.game_session_id = order_row.game_session_id
     and business_row.id = order_row.business_id
    where order_row.status = 'in_transit'
      and order_row.deliver_at <= now()
      and business_row.status <> 'closed'
      and business_row.formation_state = 'operational'
    order by order_row.deliver_at, order_row.id
    limit v_limit
    for update of order_row skip locked
  loop
    v_processed := v_processed + 1;
    v_account_id := economy_private.ensure_business_inventory_account_v2(
      v_order.game_session_id,
      v_order.business_id,
      'warehouse'
    );

    select transaction_id into v_transaction_id
    from economy_private.post_inventory_transaction_v2(
      p_game_session_id => v_order.game_session_id,
      p_game_item_id => v_order.game_item_id,
      p_from_account_id => null,
      p_to_account_id => v_account_id,
      p_quantity => v_order.quantity,
      p_unit_cost => v_order.quoted_unit_price,
      p_transaction_kind => 'purchase',
      p_source_domain => 'business',
      p_source_action => 'wholesale_delivery',
      p_source_id => v_order.id,
      p_idempotency_key => 'wholesale-delivery:' || v_order.public_key,
      p_metadata => jsonb_build_object(
        'order_key', v_order.public_key,
        'business_id', v_order.business_id,
        'supplier_item_id', v_order.supplier_item_id
      )
    );

    update public.business_wholesale_orders
    set status = 'delivered',
        delivered_at = now(),
        inventory_transaction_id = v_transaction_id
    where id = v_order.id and status = 'in_transit';

    if found then
      v_delivered := v_delivered + 1;
      insert into public.business_activity_events(
        game_session_id,
        business_id,
        actor_type,
        event_type,
        source_id,
        reason_code,
        metadata
      ) values (
        v_order.game_session_id,
        v_order.business_id,
        'system',
        'business.wholesale.order_delivered',
        v_order.id,
        'wholesale_order_delivered',
        jsonb_build_object(
          'orderKey', v_order.public_key,
          'quantity', v_order.quantity,
          'inventoryTransactionId', v_transaction_id
        )
      );
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return query select v_processed, v_delivered, v_skipped;
end
$function$;

revoke all on function public.configure_business_wholesale_supplier_item_v2(
  uuid, text, text, numeric, integer, integer, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.configure_business_wholesale_supplier_item_v2(
  uuid, text, text, numeric, integer, integer, integer, integer, integer
) to service_role;
revoke all on function public.business_wholesale_quote_v2(uuid, uuid, date)
  from public, anon, authenticated;
grant execute on function public.business_wholesale_quote_v2(uuid, uuid, date) to service_role;
revoke all on function public.replenish_business_wholesale_supply_v2(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.replenish_business_wholesale_supply_v2(uuid, integer) to service_role;
revoke all on function public.place_business_wholesale_order_v2(uuid, uuid, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.place_business_wholesale_order_v2(uuid, uuid, text, text, integer, text) to service_role;
revoke all on function public.complete_due_business_wholesale_orders_v2(integer)
  from public, anon, authenticated;
grant execute on function public.complete_due_business_wholesale_orders_v2(integer) to service_role;

commit;
