\set ON_ERROR_STOP on

begin;

insert into public.staff_users (
  id,
  supabase_auth_user_id,
  email,
  display_name
) values (
  '91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000002',
  'inventory-redemption-smoke@example.test',
  'Inventory Redemption Smoke'
);

insert into public.game_sessions (
  id,
  owner_staff_user_id,
  name,
  status
) values (
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  'Inventory Redemption Smoke Game',
  'active'
);

insert into public.players (
  id,
  game_session_id,
  display_name,
  roster_label,
  status
) values (
  '93000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  'Smoke Player',
  'SMOKE-1',
  'active'
);

insert into public.store_items (
  id,
  game_session_id,
  item_key,
  name,
  description,
  category,
  price,
  currency_code,
  stock_quantity,
  status,
  visibility
) values (
  '94000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  'redemption_smoke_item',
  'Redemption Smoke Item',
  'Database transaction smoke item.',
  'test',
  1.00,
  'ECO',
  100,
  'active',
  'visible'
);

insert into public.inventory_holdings (
  id,
  game_session_id,
  player_id,
  store_item_id,
  quantity_owned,
  quantity_reserved
) values (
  '95000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',
  10,
  0
);

do $$
declare
  v_created record;
  v_replayed record;
  v_approved record;
  v_approve_replay record;
  v_fulfilled record;
  v_fulfill_replay record;
  v_reject_created record;
  v_rejected record;
  v_reject_replay record;
  v_owned integer;
  v_reserved integer;
  v_count integer;
begin
  select * into strict v_created
  from public.request_inventory_redemption(
    '92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000001',
    2,
    'Fulfillment lifecycle',
    'redemption-smoke-fulfill',
    'hash-fulfill-v1'
  );

  if v_created.request_outcome <> 'created' or v_created.status <> 'pending' then
    raise exception 'inventory redemption create assertion failed';
  end if;

  select quantity_owned, quantity_reserved
  into strict v_owned, v_reserved
  from public.inventory_holdings
  where id = '95000000-0000-4000-8000-000000000001';

  if v_owned <> 10 or v_reserved <> 2 then
    raise exception 'inventory reservation was not applied exactly once';
  end if;

  select * into strict v_replayed
  from public.request_inventory_redemption(
    '92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000001',
    2,
    'Fulfillment lifecycle',
    'redemption-smoke-fulfill',
    'hash-fulfill-v1'
  );

  if v_replayed.request_outcome <> 'replayed' or v_replayed.id <> v_created.id then
    raise exception 'inventory redemption request replay assertion failed';
  end if;

  select quantity_reserved into strict v_reserved
  from public.inventory_holdings
  where id = '95000000-0000-4000-8000-000000000001';

  if v_reserved <> 2 then
    raise exception 'request replay changed the reservation';
  end if;

  select * into strict v_approved
  from public.review_inventory_redemption(
    '92000000-0000-4000-8000-000000000001',
    v_created.id,
    '91000000-0000-4000-8000-000000000001',
    'approve',
    'Approved for smoke fulfillment'
  );

  if v_approved.review_outcome <> 'approved' or v_approved.status <> 'approved' then
    raise exception 'inventory redemption approval assertion failed';
  end if;

  select * into strict v_approve_replay
  from public.review_inventory_redemption(
    '92000000-0000-4000-8000-000000000001',
    v_created.id,
    '91000000-0000-4000-8000-000000000001',
    'approve',
    'Approved for smoke fulfillment'
  );

  if v_approve_replay.review_outcome <> 'replayed' then
    raise exception 'inventory redemption approval replay assertion failed';
  end if;

  select * into strict v_fulfilled
  from public.review_inventory_redemption(
    '92000000-0000-4000-8000-000000000001',
    v_created.id,
    '91000000-0000-4000-8000-000000000001',
    'fulfill',
    'Fulfilled by database smoke'
  );

  if v_fulfilled.review_outcome <> 'fulfilled' or v_fulfilled.status <> 'fulfilled' then
    raise exception 'inventory redemption fulfillment assertion failed';
  end if;

  select quantity_owned, quantity_reserved
  into strict v_owned, v_reserved
  from public.inventory_holdings
  where id = '95000000-0000-4000-8000-000000000001';

  if v_owned <> 8 or v_reserved <> 0 then
    raise exception 'fulfillment did not consume owned and reserved quantities exactly once';
  end if;

  select * into strict v_fulfill_replay
  from public.review_inventory_redemption(
    '92000000-0000-4000-8000-000000000001',
    v_created.id,
    '91000000-0000-4000-8000-000000000001',
    'fulfill',
    'Fulfilled by database smoke'
  );

  if v_fulfill_replay.review_outcome <> 'replayed' then
    raise exception 'inventory redemption fulfillment replay assertion failed';
  end if;

  select quantity_owned, quantity_reserved
  into strict v_owned, v_reserved
  from public.inventory_holdings
  where id = '95000000-0000-4000-8000-000000000001';

  if v_owned <> 8 or v_reserved <> 0 then
    raise exception 'fulfillment replay mutated inventory';
  end if;

  select * into strict v_reject_created
  from public.request_inventory_redemption(
    '92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000001',
    3,
    'Rejection lifecycle',
    'redemption-smoke-reject',
    'hash-reject-v1'
  );

  select quantity_owned, quantity_reserved
  into strict v_owned, v_reserved
  from public.inventory_holdings
  where id = '95000000-0000-4000-8000-000000000001';

  if v_owned <> 8 or v_reserved <> 3 then
    raise exception 'second redemption reservation assertion failed';
  end if;

  select * into strict v_rejected
  from public.review_inventory_redemption(
    '92000000-0000-4000-8000-000000000001',
    v_reject_created.id,
    '91000000-0000-4000-8000-000000000001',
    'reject',
    'Rejected by database smoke'
  );

  if v_rejected.review_outcome <> 'rejected' or v_rejected.status <> 'rejected' then
    raise exception 'inventory redemption rejection assertion failed';
  end if;

  select quantity_owned, quantity_reserved
  into strict v_owned, v_reserved
  from public.inventory_holdings
  where id = '95000000-0000-4000-8000-000000000001';

  if v_owned <> 8 or v_reserved <> 0 then
    raise exception 'rejection did not release reservation exactly once';
  end if;

  select * into strict v_reject_replay
  from public.review_inventory_redemption(
    '92000000-0000-4000-8000-000000000001',
    v_reject_created.id,
    '91000000-0000-4000-8000-000000000001',
    'reject',
    'Rejected by database smoke'
  );

  if v_reject_replay.review_outcome <> 'replayed' then
    raise exception 'inventory redemption rejection replay assertion failed';
  end if;

  select count(*) into v_count
  from public.inventory_redemption_requests
  where game_session_id = '92000000-0000-4000-8000-000000000001';

  if v_count <> 2 then
    raise exception 'expected exactly two redemption request records, received %', v_count;
  end if;

  select count(*) into v_count
  from public.inventory_events
  where game_session_id = '92000000-0000-4000-8000-000000000001'
    and source_domain = 'inventory'
    and source_action = 'redemption_requested';

  if v_count <> 2 then
    raise exception 'expected exactly two reservation events, received %', v_count;
  end if;

  select count(*) into v_count
  from public.inventory_events
  where game_session_id = '92000000-0000-4000-8000-000000000001'
    and source_action = 'redemption_fulfilled';

  if v_count <> 1 then
    raise exception 'expected exactly one fulfillment inventory event, received %', v_count;
  end if;

  select count(*) into v_count
  from public.inventory_events
  where game_session_id = '92000000-0000-4000-8000-000000000001'
    and source_action = 'redemption_rejected';

  if v_count <> 1 then
    raise exception 'expected exactly one rejection release event, received %', v_count;
  end if;

  select count(*) into v_count
  from public.audit_log
  where game_session_id = '92000000-0000-4000-8000-000000000001'
    and action in (
      'inventory.redemption_requested',
      'inventory.redemption_approve',
      'inventory.redemption_fulfill',
      'inventory.redemption_reject'
    );

  if v_count <> 5 then
    raise exception 'expected exactly five redemption audit rows, received %', v_count;
  end if;
end;
$$;

rollback;
