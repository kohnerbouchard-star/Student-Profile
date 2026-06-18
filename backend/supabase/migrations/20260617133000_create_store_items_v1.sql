-- Store catalog foundation V1.
-- Creates teacher-managed store items and an idempotent default seed function.
-- Purchase transactions will be added in a later migration/route.

create table public.store_items (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  item_key text not null,
  name text not null,
  description text null,
  category text not null default 'general',
  price numeric(14, 2) not null default 0,
  currency_code text not null default 'ECO',
  stock_quantity integer not null default 0,
  status text not null default 'active',
  visibility text not null default 'visible',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint store_items_game_item_key_unique unique (game_session_id, item_key),
  constraint store_items_item_key_not_blank check (length(btrim(item_key)) > 0),
  constraint store_items_item_key_format_check check (item_key ~ '^[a-z0-9_-]{1,64}$'),
  constraint store_items_name_not_blank check (length(btrim(name)) > 0),
  constraint store_items_description_not_blank check (
    description is null
    or length(btrim(description)) > 0
  ),
  constraint store_items_category_not_blank check (length(btrim(category)) > 0),
  constraint store_items_price_non_negative check (price >= 0),
  constraint store_items_stock_quantity_non_negative check (stock_quantity >= 0),
  constraint store_items_currency_code_check check (
    currency_code = upper(currency_code)
    and length(currency_code) between 3 and 16
  ),
  constraint store_items_status_check check (status in ('active', 'disabled', 'archived')),
  constraint store_items_visibility_check check (visibility in ('visible', 'hidden'))
);

create trigger set_store_items_updated_at
before update on public.store_items
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.store_items is
  'Teacher-managed store catalog items for one game session. Purchases are handled by later transaction routes.';
comment on column public.store_items.game_session_id is
  'Game isolation boundary for the store item.';
comment on column public.store_items.item_key is
  'Stable per-game item key used for idempotent default seeding and admin references.';
comment on column public.store_items.price is
  'Item price in the configured classroom currency.';
comment on column public.store_items.stock_quantity is
  'Available quantity for V1 store purchases. Purchase routes will decrement this later.';
comment on column public.store_items.status is
  'active items may be used; disabled items are temporarily unavailable; archived items are retained for history.';
comment on column public.store_items.visibility is
  'visible items appear to players; hidden items are admin-only.';

create index store_items_game_status_visibility_idx
on public.store_items (game_session_id, status, visibility, sort_order, name);

create index store_items_game_category_idx
on public.store_items (game_session_id, category);

create index store_items_game_updated_at_idx
on public.store_items (game_session_id, updated_at desc);

create or replace function public.seed_default_store_items(
  p_game_session_id uuid
)
returns table (
  seeded_count integer,
  existing_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing_count integer := 0;
  v_seeded_count integer := 0;
begin
  if p_game_session_id is null then
    raise exception 'GAME_SESSION_REQUIRED'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.game_sessions
    where id = p_game_session_id
  ) then
    raise exception 'GAME_SESSION_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select count(*)
  into v_existing_count
  from public.store_items
  where game_session_id = p_game_session_id;

  with seed_items (
    item_key,
    name,
    description,
    category,
    price,
    currency_code,
    stock_quantity,
    status,
    visibility,
    sort_order
  ) as (
    values
      (
        'homework_pass',
        'Homework Pass',
        'Use once to skip a small homework assignment with teacher approval.',
        'privilege',
        100.00,
        'ECO',
        10,
        'active',
        'visible',
        10
      ),
      (
        'late_pass',
        'Late Pass',
        'Use once for a small extension on an eligible assignment.',
        'privilege',
        75.00,
        'ECO',
        10,
        'active',
        'visible',
        20
      ),
      (
        'seat_swap',
        'Seat Swap',
        'Request a one-class seat change with teacher approval.',
        'privilege',
        50.00,
        'ECO',
        10,
        'active',
        'visible',
        30
      ),
      (
        'music_request',
        'Class Music Request',
        'Request one appropriate background song during approved work time.',
        'privilege',
        40.00,
        'ECO',
        20,
        'active',
        'visible',
        40
      ),
      (
        'bonus_hint',
        'Bonus Hint',
        'Receive one extra teacher hint during an eligible activity.',
        'academic',
        60.00,
        'ECO',
        20,
        'active',
        'visible',
        50
      ),
      (
        'quiz_reroll',
        'Quiz Reroll',
        'Reroll one low-stakes quiz question if the activity allows it.',
        'academic',
        150.00,
        'ECO',
        5,
        'active',
        'visible',
        60
      ),
      (
        'supply_pack',
        'Supply Pack',
        'Basic classroom supplies for activities that require materials.',
        'supply',
        25.00,
        'ECO',
        50,
        'active',
        'visible',
        70
      ),
      (
        'team_bonus',
        'Team Bonus Token',
        'Give your group a small approved advantage during a team activity.',
        'team',
        125.00,
        'ECO',
        5,
        'active',
        'visible',
        80
      ),
      (
        'market_tip',
        'Market Tip',
        'Receive one general market clue for the classroom economy.',
        'market',
        90.00,
        'ECO',
        10,
        'active',
        'visible',
        90
      ),
      (
        'mystery_box',
        'Mystery Box',
        'Buy a surprise reward or challenge chosen by the teacher.',
        'special',
        80.00,
        'ECO',
        10,
        'active',
        'visible',
        100
      )
  ),
  inserted as (
    insert into public.store_items (
      game_session_id,
      item_key,
      name,
      description,
      category,
      price,
      currency_code,
      stock_quantity,
      status,
      visibility,
      sort_order
    )
    select
      p_game_session_id,
      item_key,
      name,
      description,
      category,
      price,
      currency_code,
      stock_quantity,
      status,
      visibility,
      sort_order
    from seed_items
    on conflict on constraint store_items_game_item_key_unique
    do nothing
    returning id
  )
  select count(*)
  into v_seeded_count
  from inserted;

  return query
  select v_seeded_count, v_existing_count;
end;
$$;

comment on function public.seed_default_store_items(uuid) is
  'Idempotently seeds the default Eco Novaria store catalog for a game session.';

revoke all on function public.seed_default_store_items(uuid) from public;
grant execute on function public.seed_default_store_items(uuid) to service_role;
