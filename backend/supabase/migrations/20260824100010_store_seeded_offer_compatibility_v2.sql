-- Business V2 Phase 7A: seeded Store compatibility-offer backfill and synchronization.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Ensure the canonical Store economic party exists before compatibility offers
-- are backfilled. This is the same party authority used by Store inventory.
insert into public.economic_parties(
  game_session_id,
  party_kind,
  system_key,
  status
)
select distinct
  item.game_session_id,
  'store',
  'store',
  'active'
from public.store_items as item
on conflict (game_session_id, party_kind, system_key)
  where system_key is not null
do update set
  status = 'active',
  updated_at = statement_timestamp();

insert into public.store_seller_offers(
  game_session_id,
  store_item_id,
  game_item_id,
  seller_party_id,
  inventory_account_id,
  seller_kind,
  unit_price,
  currency_code,
  status,
  replenishment_policy,
  creation_idempotency_key,
  creation_request_hash,
  metadata
)
select
  item.game_session_id,
  item.id,
  item.game_item_id,
  party.id,
  item.inventory_account_id,
  'seeded',
  item.price,
  item.currency_code,
  case
    when item.status = 'active' and item.visibility = 'visible' then 'active'
    else 'paused'
  end,
  'canonical_supply',
  'seeded:' || item.id::text,
  encode(
    extensions.digest(
      convert_to(
        concat_ws('|',
          item.game_session_id::text,
          item.id::text,
          item.game_item_id::text,
          item.inventory_account_id::text,
          item.price::text,
          item.currency_code,
          item.status,
          item.visibility
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  jsonb_build_object(
    'compatibilitySource', 'store_items',
    'compatibilityItemKey', item.item_key
  )
from public.store_items as item
join public.economic_parties as party
  on party.game_session_id = item.game_session_id
 and party.party_kind = 'store'
 and party.system_key = 'store'
on conflict (game_session_id, store_item_id, seller_party_id)
  where seller_kind = 'seeded'
do nothing;

-- A Store presentation row is a stable compatibility identity. Price, status,
-- visibility and (when no non-seeded current offer exists) currency may change,
-- but the canonical item and Store custody account may not be silently re-pointed.
create or replace function economy_private.guard_store_item_offer_identity_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
begin
  if new.id is distinct from old.id
    or new.game_session_id is distinct from old.game_session_id
    or new.item_key is distinct from old.item_key
    or new.game_item_id is distinct from old.game_item_id
    or new.inventory_account_id is distinct from old.inventory_account_id
  then
    raise exception 'STORE_SELLER_OFFER_STORE_ITEM_IDENTITY_IMMUTABLE'
      using errcode = '42501';
  end if;

  if new.currency_code is distinct from old.currency_code
    and exists (
      select 1
      from public.store_seller_offers as offer_row
      where offer_row.game_session_id = old.game_session_id
        and offer_row.store_item_id = old.id
        and offer_row.seller_kind <> 'seeded'
        and offer_row.status <> 'retired'
    )
  then
    raise exception 'STORE_SELLER_OFFER_CURRENCY_CHANGE_BLOCKED'
      using errcode = 'P0001';
  end if;

  return new;
end
$function$;

create trigger guard_store_item_offer_identity_v2
before update of
  game_session_id,
  item_key,
  game_item_id,
  inventory_account_id,
  currency_code
on public.store_items
for each row execute function economy_private.guard_store_item_offer_identity_v2();

create or replace function economy_private.sync_seeded_store_seller_offer_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, extensions, pg_temp
as $function$
declare
  v_party public.economic_parties%rowtype;
  v_status text;
  v_hash text;
begin
  insert into public.economic_parties(
    game_session_id,
    party_kind,
    system_key,
    status
  ) values (
    new.game_session_id,
    'store',
    'store',
    'active'
  )
  on conflict (game_session_id, party_kind, system_key)
    where system_key is not null
  do update set
    status = 'active',
    updated_at = statement_timestamp();

  select party_row.*
  into v_party
  from public.economic_parties as party_row
  where party_row.game_session_id = new.game_session_id
    and party_row.party_kind = 'store'
    and party_row.system_key = 'store'
    and party_row.status = 'active';
  if not found then
    raise exception 'STORE_SELLER_OFFER_STORE_PARTY_MISSING'
      using errcode = 'P0001';
  end if;

  v_status := case
    when new.status = 'active' and new.visibility = 'visible' then 'active'
    else 'paused'
  end;
  v_hash := encode(
    extensions.digest(
      convert_to(
        concat_ws('|',
          new.game_session_id::text,
          new.id::text,
          new.game_item_id::text,
          new.inventory_account_id::text,
          new.price::text,
          new.currency_code,
          new.status,
          new.visibility
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.store_seller_offers(
    game_session_id,
    store_item_id,
    game_item_id,
    seller_party_id,
    inventory_account_id,
    seller_kind,
    unit_price,
    currency_code,
    status,
    replenishment_policy,
    creation_idempotency_key,
    creation_request_hash,
    metadata
  ) values (
    new.game_session_id,
    new.id,
    new.game_item_id,
    v_party.id,
    new.inventory_account_id,
    'seeded',
    new.price,
    new.currency_code,
    v_status,
    'canonical_supply',
    'seeded:' || new.id::text,
    v_hash,
    jsonb_build_object(
      'compatibilitySource', 'store_items',
      'compatibilityItemKey', new.item_key
    )
  )
  on conflict (game_session_id, store_item_id, seller_party_id)
    where seller_kind = 'seeded'
  do update set
    unit_price = excluded.unit_price,
    currency_code = excluded.currency_code,
    status = excluded.status,
    replenishment_policy = excluded.replenishment_policy,
    version = public.store_seller_offers.version + 1,
    metadata = excluded.metadata
  where public.store_seller_offers.game_item_id = excluded.game_item_id
    and public.store_seller_offers.inventory_account_id = excluded.inventory_account_id
    and public.store_seller_offers.seller_kind = 'seeded'
    and (
      public.store_seller_offers.unit_price is distinct from excluded.unit_price
      or public.store_seller_offers.currency_code is distinct from excluded.currency_code
      or public.store_seller_offers.status is distinct from excluded.status
      or public.store_seller_offers.replenishment_policy is distinct from excluded.replenishment_policy
      or public.store_seller_offers.metadata is distinct from excluded.metadata
    );

  return new;
end
$function$;

create trigger sync_seeded_store_seller_offer_v2
after insert or update of
  price,
  currency_code,
  status,
  visibility
on public.store_items
for each row execute function economy_private.sync_seeded_store_seller_offer_v2();

commit;
