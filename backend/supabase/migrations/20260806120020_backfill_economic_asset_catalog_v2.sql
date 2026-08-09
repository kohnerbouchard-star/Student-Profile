-- Economic asset catalog and ownership backfill V2.
-- Ordered, forward-only domain migration.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Backfill the canonical game catalog from every game-scoped physical pack.
-- ---------------------------------------------------------------------------

do $block$
begin
  if exists (
    select 1
    from public.game_session_physical_economy_packs gp
    join public.physical_economy_item_definitions d on d.pack_id = gp.pack_id
    where gp.status in ('staged','active','disabled')
    group by gp.game_session_id, d.item_key
    having count(distinct d.id) > 1
  ) then
    raise exception 'ECONOMIC_CORE_DUPLICATE_GAME_ITEM_SOURCE'
      using errcode = 'P0001',
      hint = 'A game may not bind multiple physical definitions to one canonical item key.';
  end if;
end
$block$;

insert into public.game_items(
  game_session_id,
  canonical_key,
  source_kind,
  physical_item_definition_id,
  name,
  description,
  item_class,
  subtype,
  stackable,
  serialized,
  transferable,
  status,
  metadata
)
select
  gp.game_session_id,
  d.item_key,
  'physical_pack',
  d.id,
  d.name,
  d.description,
  d.item_class,
  d.subtype,
  d.stackable,
  d.item_class = 'equipment',
  coalesce((d.metadata->>'transferable')::boolean, true),
  case when gp.status = 'active' and d.status = 'active' then 'active' else 'disabled' end,
  jsonb_build_object(
    'packId', d.pack_id,
    'sourceCountryCode', d.source_country_code,
    'currencyCode', d.currency_code,
    'effectEnabled', d.effect_enabled,
    'effectCode', d.effect_code,
    'source', 'physical_economy_item_definitions'
  )
from public.game_session_physical_economy_packs gp
join public.physical_economy_item_definitions d on d.pack_id = gp.pack_id
where gp.status in ('staged','active','disabled')
on conflict (game_session_id, canonical_key) do update set
  physical_item_definition_id = excluded.physical_item_definition_id,
  name = excluded.name,
  description = excluded.description,
  item_class = excluded.item_class,
  subtype = excluded.subtype,
  stackable = excluded.stackable,
  serialized = excluded.serialized,
  transferable = excluded.transferable,
  status = excluded.status,
  metadata = public.game_items.metadata || excluded.metadata,
  version = public.game_items.version + 1,
  updated_at = now();

-- Map existing Store offers to canonical physical items. Prefix removal is used
-- only for this one-time validated backfill; no runtime resolver depends on it.
update public.store_items si
set game_item_id = (
  select gi.id
  from public.game_items gi
  where gi.game_session_id = si.game_session_id
    and gi.canonical_key in (
      lower(si.item_key),
      regexp_replace(lower(si.item_key), '^beta-[a-z0-9]+-', '')
    )
  order by case when gi.canonical_key = lower(si.item_key) then 0 else 1 end, gi.id
  limit 1
)
where si.game_item_id is null;

-- Every unmatched Store row becomes an explicit Store-created game item rather
-- than remaining an orphaned commercial identity.
insert into public.game_items(
  game_session_id,
  canonical_key,
  source_kind,
  name,
  description,
  item_class,
  subtype,
  stackable,
  serialized,
  transferable,
  status,
  metadata
)
select
  si.game_session_id,
  'store.' || lower(si.item_key),
  'store_created',
  si.name,
  si.description,
  'legacy',
  'store_item',
  true,
  false,
  true,
  case when si.status = 'active' then 'active' else 'disabled' end,
  jsonb_build_object('legacyStoreItemId', si.id, 'legacyStoreItemKey', si.item_key)
from public.store_items si
where si.game_item_id is null
on conflict (game_session_id, canonical_key) do nothing;

update public.store_items si
set game_item_id = gi.id
from public.game_items gi
where si.game_item_id is null
  and gi.game_session_id = si.game_session_id
  and gi.canonical_key = 'store.' || lower(si.item_key);

-- Create parties and accounts before existing ownership rows are backfilled.
insert into public.economic_parties(game_session_id, party_kind, player_id, status)
select p.game_session_id, 'player', p.id, case when p.status = 'active' then 'active' else 'disabled' end
from public.players p
on conflict (game_session_id, player_id) where player_id is not null do nothing;

insert into public.economic_parties(game_session_id, party_kind, business_id, status)
select b.game_session_id, 'business', b.id, case when b.status = 'closed' then 'closed' else 'active' end
from public.business_entities b
on conflict (game_session_id, business_id) where business_id is not null do nothing;

insert into public.economic_parties(game_session_id, party_kind, system_key, status)
select g.id, v.party_kind, v.system_key, 'active'
from public.game_sessions g
cross join (
  values
    ('store'::text, 'store'),
    ('escrow'::text, 'marketplace'),
    ('system'::text, 'crafting.source'),
    ('system'::text, 'crafting.sink'),
    ('system'::text, 'business.source'),
    ('system'::text, 'business.sink')
) as v(party_kind, system_key)
on conflict (game_session_id, party_kind, system_key) where system_key is not null do nothing;

insert into public.inventory_accounts(game_session_id, party_id, account_kind, location_key, status)
select ep.game_session_id, ep.id, 'personal', null, 'active'
from public.economic_parties ep
where ep.party_kind = 'player'
on conflict (game_session_id, party_id, account_kind, (coalesce(location_key, ''))) do nothing;

insert into public.inventory_accounts(game_session_id, party_id, account_kind, location_key, status)
select ep.game_session_id, ep.id, kinds.account_kind, null, 'active'
from public.economic_parties ep
cross join (values ('warehouse'::text), ('work_in_progress'::text), ('finished_goods'::text)) kinds(account_kind)
where ep.party_kind = 'business'
on conflict (game_session_id, party_id, account_kind, (coalesce(location_key, ''))) do nothing;

-- One stock account per Store offer keeps offer-level stock separate from canonical
-- item identity and supports multiple offers for the same game item.
insert into public.inventory_accounts(game_session_id, party_id, account_kind, location_key, status, metadata)
select
  si.game_session_id,
  ep.id,
  'store_stock',
  'store_item:' || si.id::text,
  'active',
  jsonb_build_object('storeItemId', si.id, 'storeItemKey', si.item_key)
from public.store_items si
join public.economic_parties ep
  on ep.game_session_id = si.game_session_id
 and ep.party_kind = 'store'
 and ep.system_key = 'store'
on conflict (game_session_id, party_id, account_kind, (coalesce(location_key, ''))) do nothing;

update public.store_items si
set inventory_account_id = ia.id
from public.economic_parties ep
join public.inventory_accounts ia
  on ia.game_session_id = ep.game_session_id
 and ia.party_id = ep.id
 and ia.account_kind = 'store_stock'
where ep.game_session_id = si.game_session_id
  and ep.party_kind = 'store'
  and ep.system_key = 'store'
  and ia.location_key = 'store_item:' || si.id::text
  and si.inventory_account_id is null;

-- Canonical Store stock projection.
insert into public.inventory_holdings(
  game_session_id,
  player_id,
  store_item_id,
  inventory_account_id,
  game_item_id,
  quantity_owned,
  quantity_reserved,
  average_unit_cost,
  cost_currency_code
)
select
  si.game_session_id,
  null,
  si.id,
  si.inventory_account_id,
  si.game_item_id,
  si.stock_quantity,
  0,
  si.price,
  si.currency_code
from public.store_items si
where si.inventory_account_id is not null
  and si.game_item_id is not null
  and not exists (
    select 1
    from public.inventory_holdings h
    where h.game_session_id = si.game_session_id
      and h.inventory_account_id = si.inventory_account_id
      and h.game_item_id = si.game_item_id
  );

-- Existing player holdings inherit canonical identity and the player's personal
-- inventory account. This does not alter quantities or reservations.
update public.inventory_holdings h
set
  game_item_id = si.game_item_id,
  inventory_account_id = ia.id,
  average_unit_cost = case when h.average_unit_cost = 0 then si.price else h.average_unit_cost end,
  cost_currency_code = coalesce(h.cost_currency_code, si.currency_code)
from public.store_items si
join public.economic_parties ep
  on ep.game_session_id = si.game_session_id and ep.party_kind = 'player'
join public.inventory_accounts ia
  on ia.game_session_id = ep.game_session_id and ia.party_id = ep.id and ia.account_kind = 'personal'
where h.game_session_id = si.game_session_id
  and h.store_item_id = si.id
  and ep.player_id = h.player_id
  and (h.game_item_id is null or h.inventory_account_id is null);

-- Fail closed rather than silently merging historical duplicate holdings.
do $block$
begin
  if exists (
    select 1
    from public.inventory_holdings h
    where h.game_item_id is not null and h.inventory_account_id is not null
    group by h.game_session_id, h.inventory_account_id, h.game_item_id
    having count(*) > 1
  ) then
    raise exception 'ECONOMIC_CORE_DUPLICATE_CANONICAL_HOLDING'
      using errcode = 'P0001',
      hint = 'Resolve duplicate legacy Store projections before applying the canonical ownership unique constraint.';
  end if;

  if exists (
    select 1 from public.inventory_holdings h
    where h.game_item_id is null or h.inventory_account_id is null
  ) then
    raise exception 'ECONOMIC_CORE_HOLDING_BACKFILL_INCOMPLETE'
      using errcode = 'P0001';
  end if;
end
$block$;

-- Existing inventory events inherit canonical context.
update public.inventory_events e
set
  game_item_id = si.game_item_id,
  inventory_account_id = ia.id
from public.store_items si
join public.economic_parties ep
  on ep.game_session_id = si.game_session_id and ep.party_kind = 'player'
join public.inventory_accounts ia
  on ia.game_session_id = ep.game_session_id and ia.party_id = ep.id and ia.account_kind = 'personal'
where e.game_session_id = si.game_session_id
  and e.store_item_id = si.id
  and ep.player_id = e.player_id
  and (e.game_item_id is null or e.inventory_account_id is null);

-- Reservations inherit their holding's canonical context.
update public.inventory_reservations r
set
  game_item_id = h.game_item_id,
  inventory_account_id = h.inventory_account_id,
  canonical_item_key = gi.canonical_key
from public.inventory_holdings h
join public.game_items gi
  on gi.game_session_id = h.game_session_id and gi.id = h.game_item_id
where r.inventory_holding_id = h.id
  and r.game_session_id = h.game_session_id;

-- Crafting outputs resolve without requiring a Store offer.
update public.crafting_job_outputs o
set game_item_id = gi.id
from public.crafting_jobs j
join public.game_items gi
  on gi.game_session_id = j.game_session_id
where o.job_id = j.id
  and gi.canonical_key = o.item_key
  and o.game_item_id is null;

-- Equipment and use requests retain Store provenance when present but adopt the
-- canonical item and account identity.
update public.equipment_instances e
set
  game_item_id = si.game_item_id,
  inventory_account_id = ia.id,
  item_key = gi.canonical_key
from public.store_items si
join public.game_items gi
  on gi.game_session_id = si.game_session_id and gi.id = si.game_item_id
join public.economic_parties ep
  on ep.game_session_id = si.game_session_id and ep.party_kind = 'player'
join public.inventory_accounts ia
  on ia.game_session_id = ep.game_session_id and ia.party_id = ep.id and ia.account_kind = 'personal'
where e.game_session_id = si.game_session_id
  and e.store_item_id = si.id
  and ep.player_id = e.player_id;

update public.item_use_requests u
set
  game_item_id = si.game_item_id,
  inventory_account_id = ia.id,
  item_key = gi.canonical_key
from public.store_items si
join public.game_items gi
  on gi.game_session_id = si.game_session_id and gi.id = si.game_item_id
join public.economic_parties ep
  on ep.game_session_id = si.game_session_id and ep.party_kind = 'player'
join public.inventory_accounts ia
  on ia.game_session_id = ep.game_session_id and ia.party_id = ep.id and ia.account_kind = 'personal'
where u.game_session_id = si.game_session_id
  and u.store_item_id = si.id
  and ep.player_id = u.player_id;

update public.game_session_item_supply s
set game_item_id = gi.id
from public.game_items gi
where gi.game_session_id = s.game_session_id
  and gi.canonical_key = s.item_key
  and s.game_item_id is null;

-- Existing Business inventory is accepted only when quantities are whole units.
-- The current UI and production APIs already operate on integer quantities.
do $block$
begin
  if exists (
    select 1 from public.business_inventory bi
    where bi.quantity <> trunc(bi.quantity)
  ) then
    raise exception 'ECONOMIC_CORE_FRACTIONAL_BUSINESS_INVENTORY_UNSUPPORTED'
      using errcode = 'P0001',
      hint = 'Reconcile fractional legacy Business inventory before canonical migration.';
  end if;
end
$block$;

insert into public.game_items(
  game_session_id,
  canonical_key,
  source_kind,
  name,
  item_class,
  subtype,
  stackable,
  serialized,
  transferable,
  status,
  metadata
)
select
  bi.game_session_id,
  'business.' || b.public_key || '.' || md5(bi.item_key),
  'legacy',
  bi.item_key,
  case when bi.inventory_kind = 'finished_good' then 'finished_good' else 'legacy' end,
  'business_inventory',
  true,
  false,
  true,
  'active',
  jsonb_build_object(
    'businessId', bi.business_id,
    'legacyBusinessInventoryId', bi.id,
    'legacyItemKey', bi.item_key,
    'inventoryKind', bi.inventory_kind
  )
from public.business_inventory bi
join public.business_entities b on b.id = bi.business_id
where bi.game_item_id is null
on conflict (game_session_id, canonical_key) do nothing;

update public.business_inventory bi
set
  game_item_id = gi.id,
  inventory_account_id = ia.id,
  total_cost_basis = round(bi.quantity * bi.unit_cost, 4)
from public.business_entities b
join public.game_items gi
  on gi.game_session_id = b.game_session_id
 and gi.canonical_key like 'business.' || b.public_key || '.%'
join public.economic_parties ep
  on ep.game_session_id = b.game_session_id and ep.business_id = b.id
join public.inventory_accounts ia
  on ia.game_session_id = ep.game_session_id
 and ia.party_id = ep.id
where bi.business_id = b.id
  and gi.canonical_key = 'business.' || b.public_key || '.' || md5(bi.item_key)
  and ia.account_kind = case bi.inventory_kind
    when 'input' then 'warehouse'
    when 'work_in_progress' then 'work_in_progress'
    else 'finished_goods'
  end;

insert into public.inventory_holdings(
  game_session_id,
  player_id,
  store_item_id,
  inventory_account_id,
  game_item_id,
  quantity_owned,
  quantity_reserved,
  average_unit_cost,
  cost_currency_code
)
select
  bi.game_session_id,
  null,
  null,
  bi.inventory_account_id,
  bi.game_item_id,
  bi.quantity::integer,
  0,
  bi.unit_cost,
  b.currency_code
from public.business_inventory bi
join public.business_entities b on b.id = bi.business_id
where bi.inventory_account_id is not null
  and bi.game_item_id is not null
  and not exists (
    select 1
    from public.inventory_holdings h
    where h.game_session_id = bi.game_session_id
      and h.inventory_account_id = bi.inventory_account_id
      and h.game_item_id = bi.game_item_id
  );

commit;
