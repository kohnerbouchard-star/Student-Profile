-- Business V2 Phase 8A: immutable offer-scoped custody and service-only stocking.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function economy_private.guard_business_store_listing_account_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
declare
  v_party public.economic_parties%rowtype;
  v_business public.business_entities%rowtype;
  v_offer public.store_seller_offers%rowtype;
  v_offer_key text;
begin
  select party_row.*
  into v_party
  from public.economic_parties as party_row
  where party_row.game_session_id = new.game_session_id
    and party_row.id = new.party_id;
  if not found then
    raise exception 'STORE_LISTING_ACCOUNT_PARTY_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if new.account_kind <> 'store_stock' or v_party.party_kind <> 'business' then
    return new;
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = new.game_session_id
    and business_row.id = v_party.business_id
    and business_row.status = 'active';
  if not found then
    raise exception 'STORE_LISTING_ACCOUNT_BUSINESS_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if coalesce(new.location_key, '') !~ '^store_offer:sof_[0-9a-f]{32}$' then
    raise exception 'STORE_LISTING_ACCOUNT_LOCATION_INVALID'
      using errcode = 'P0001';
  end if;
  v_offer_key := substring(new.location_key from length('store_offer:') + 1);

  select offer_row.*
  into v_offer
  from public.store_seller_offers as offer_row
  where offer_row.game_session_id = new.game_session_id
    and offer_row.public_key = v_offer_key
    and offer_row.seller_party_id = new.party_id
    and offer_row.seller_kind = 'business'
    and offer_row.status <> 'retired';
  if not found then
    raise exception 'STORE_LISTING_ACCOUNT_OFFER_SCOPE_INVALID'
      using errcode = 'P0001';
  end if;

  if new.metadata->>'authority' <> 'business_store_listing_v2'
    or new.metadata->>'offerKey' <> v_offer.public_key
    or new.metadata->>'businessKey' <> v_business.public_key
  then
    raise exception 'STORE_LISTING_ACCOUNT_METADATA_INVALID'
      using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.public_key is distinct from old.public_key
    or new.game_session_id is distinct from old.game_session_id
    or new.party_id is distinct from old.party_id
    or new.account_kind is distinct from old.account_kind
    or new.location_key is distinct from old.location_key
    or new.metadata is distinct from old.metadata
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'STORE_LISTING_ACCOUNT_IDENTITY_IMMUTABLE'
      using errcode = '42501';
  end if;

  return new;
end
$function$;

drop trigger if exists guard_business_store_listing_account_v2
  on public.inventory_accounts;
create trigger guard_business_store_listing_account_v2
before insert or update on public.inventory_accounts
for each row execute function economy_private.guard_business_store_listing_account_v2();

create or replace function economy_private.ensure_business_store_listing_account_v2(
  p_game_session_id uuid,
  p_business_id uuid,
  p_offer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_party public.economic_parties%rowtype;
  v_offer public.store_seller_offers%rowtype;
  v_account public.inventory_accounts%rowtype;
  v_location_key text;
  v_metadata jsonb;
begin
  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = p_business_id
    and business_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_LISTING_ACCOUNT_BUSINESS_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select party_row.*
  into v_party
  from public.economic_parties as party_row
  where party_row.game_session_id = p_game_session_id
    and party_row.party_kind = 'business'
    and party_row.business_id = v_business.id
    and party_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_LISTING_ACCOUNT_BUSINESS_PARTY_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select offer_row.*
  into v_offer
  from public.store_seller_offers as offer_row
  where offer_row.game_session_id = p_game_session_id
    and offer_row.id = p_offer_id
    and offer_row.seller_party_id = v_party.id
    and offer_row.seller_kind = 'business'
    and offer_row.status <> 'retired'
  for share;
  if not found then
    raise exception 'STORE_LISTING_ACCOUNT_OFFER_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  v_location_key := 'store_offer:' || v_offer.public_key;
  v_metadata := jsonb_build_object(
    'authority', 'business_store_listing_v2',
    'offerKey', v_offer.public_key,
    'businessKey', v_business.public_key
  );

  insert into public.inventory_accounts(
    game_session_id,
    party_id,
    account_kind,
    location_key,
    status,
    metadata
  ) values (
    p_game_session_id,
    v_party.id,
    'store_stock',
    v_location_key,
    'active',
    v_metadata
  )
  on conflict (
    game_session_id,
    party_id,
    account_kind,
    (coalesce(location_key, ''))
  ) do update set
    status = case
      when public.inventory_accounts.status = 'closed' then 'closed'
      else 'active'
    end
  returning * into v_account;

  if v_account.status <> 'active'
    or v_account.party_id is distinct from v_party.id
    or v_account.account_kind <> 'store_stock'
    or v_account.location_key is distinct from v_location_key
    or v_account.metadata is distinct from v_metadata
  then
    raise exception 'STORE_LISTING_ACCOUNT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  return v_account.id;
end
$function$;

revoke all on function economy_private.ensure_business_store_listing_account_v2(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function economy_private.ensure_business_store_listing_account_v2(
  uuid, uuid, uuid
) to service_role;

create or replace function public.stock_business_store_offer_v2(
  p_game_session_id uuid,
  p_business_key text,
  p_offer_key text,
  p_quantity integer,
  p_expected_offer_version bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, extensions, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_party public.economic_parties%rowtype;
  v_offer public.store_seller_offers%rowtype;
  v_account public.inventory_accounts%rowtype;
  v_finished_account public.inventory_accounts%rowtype;
  v_source_holding public.inventory_holdings%rowtype;
  v_listing_holding public.inventory_holdings%rowtype;
  v_existing_transaction public.inventory_transactions%rowtype;
  v_posting jsonb;
  v_account_id uuid;
  v_finished_account_id uuid;
  v_command_hash text;
  v_cost_currency text;
  v_metadata jsonb;
  v_lines jsonb;
  v_offer_was_unbound boolean;
  v_available integer;
begin
  if p_game_session_id is null
    or coalesce(btrim(p_business_key), '') !~ '^biz_[0-9a-f]{32}$'
    or coalesce(btrim(p_offer_key), '') !~ '^sof_[0-9a-f]{32}$'
    or p_quantity is null
    or p_quantity <= 0
    or p_expected_offer_version is null
    or p_expected_offer_version < 1
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160
  then
    raise exception 'STORE_LISTING_STOCK_REQUEST_INVALID'
      using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = lower(btrim(p_business_key))
    and business_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_LISTING_STOCK_BUSINESS_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select party_row.*
  into v_party
  from public.economic_parties as party_row
  where party_row.game_session_id = p_game_session_id
    and party_row.party_kind = 'business'
    and party_row.business_id = v_business.id
    and party_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_LISTING_STOCK_BUSINESS_PARTY_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select offer_row.*
  into v_offer
  from public.store_seller_offers as offer_row
  where offer_row.game_session_id = p_game_session_id
    and offer_row.public_key = lower(btrim(p_offer_key))
    and offer_row.seller_party_id = v_party.id
    and offer_row.seller_kind = 'business'
  for update;
  if not found then
    raise exception 'STORE_LISTING_STOCK_OFFER_NOT_FOUND'
      using errcode = 'P0001';
  end if;
  if v_offer.status = 'retired' then
    raise exception 'STORE_LISTING_STOCK_OFFER_RETIRED'
      using errcode = 'P0001';
  end if;

  v_command_hash := encode(
    extensions.digest(
      convert_to(
        concat_ws('|',
          p_game_session_id::text,
          v_business.id::text,
          v_offer.id::text,
          p_quantity::text,
          p_expected_offer_version::text
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  select transaction_row.*
  into v_existing_transaction
  from public.inventory_transactions as transaction_row
  where transaction_row.game_session_id = p_game_session_id
    and transaction_row.source_domain = 'business_store'
    and transaction_row.source_action = 'stock_offer'
    and transaction_row.idempotency_key = btrim(p_idempotency_key)
  for update;
  if found then
    if v_existing_transaction.source_id is distinct from v_offer.id
      or v_existing_transaction.metadata->>'commandRequestHash' is distinct from v_command_hash
    then
      raise exception 'STORE_LISTING_STOCK_IDEMPOTENCY_CONFLICT'
        using errcode = 'P0001';
    end if;
    if v_existing_transaction.status <> 'committed' then
      raise exception 'STORE_LISTING_STOCK_IN_PROGRESS'
        using errcode = 'P0001';
    end if;
    if v_offer.inventory_account_id is null then
      raise exception 'STORE_LISTING_STOCK_REPLAY_CUSTODY_MISSING'
        using errcode = 'P0001';
    end if;

    select account_row.*
    into v_account
    from public.inventory_accounts as account_row
    where account_row.game_session_id = p_game_session_id
      and account_row.id = v_offer.inventory_account_id
      and account_row.party_id = v_party.id
      and account_row.account_kind = 'store_stock'
      and account_row.status = 'active'
    for share;
    if not found then
      raise exception 'STORE_LISTING_STOCK_REPLAY_ACCOUNT_UNAVAILABLE'
        using errcode = 'P0001';
    end if;

    select holding_row.*
    into v_listing_holding
    from public.inventory_holdings as holding_row
    where holding_row.game_session_id = p_game_session_id
      and holding_row.inventory_account_id = v_account.id
      and holding_row.game_item_id = v_offer.game_item_id;
    if not found then
      raise exception 'STORE_LISTING_STOCK_REPLAY_HOLDING_MISSING'
        using errcode = 'P0001';
    end if;

    return jsonb_build_object(
      'offerKey', v_offer.public_key,
      'offerStatus', v_offer.status,
      'offerVersion', v_offer.version,
      'inventoryAccountKey', v_account.public_key,
      'transactionKey', v_existing_transaction.public_key,
      'quantityAdded', p_quantity,
      'listedQuantity', v_listing_holding.quantity_owned,
      'availableQuantity', v_listing_holding.quantity_owned - v_listing_holding.quantity_reserved,
      'averageUnitCost', v_listing_holding.average_unit_cost,
      'costCurrencyCode', v_listing_holding.cost_currency_code,
      'replayed', true
    );
  end if;

  if v_offer.version <> p_expected_offer_version then
    raise exception 'STORE_LISTING_STOCK_OFFER_VERSION_CONFLICT'
      using errcode = 'P0001';
  end if;

  v_offer_was_unbound := v_offer.inventory_account_id is null;
  if v_offer_was_unbound then
    v_account_id := economy_private.ensure_business_store_listing_account_v2(
      p_game_session_id,
      v_business.id,
      v_offer.id
    );

    update public.store_seller_offers as offer_row
    set
      inventory_account_id = v_account_id,
      version = offer_row.version + 1
    where offer_row.id = v_offer.id
    returning * into v_offer;
  else
    v_account_id := v_offer.inventory_account_id;
  end if;

  select account_row.*
  into v_account
  from public.inventory_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.id = v_account_id
    and account_row.party_id = v_party.id
    and account_row.account_kind = 'store_stock'
    and account_row.location_key = 'store_offer:' || v_offer.public_key
    and account_row.status = 'active'
  for update;
  if not found then
    raise exception 'STORE_LISTING_STOCK_ACCOUNT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  v_finished_account_id := economy_private.ensure_business_inventory_account_v2(
    p_game_session_id,
    v_business.id,
    'finished_goods'
  );
  select account_row.*
  into v_finished_account
  from public.inventory_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.id = v_finished_account_id
    and account_row.party_id = v_party.id
    and account_row.account_kind = 'finished_goods'
    and account_row.status = 'active'
  for update;
  if not found then
    raise exception 'STORE_LISTING_STOCK_FINISHED_ACCOUNT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select holding_row.*
  into v_source_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_finished_account.id
    and holding_row.game_item_id = v_offer.game_item_id
  for update;
  if not found then
    raise exception 'STORE_LISTING_STOCK_FINISHED_GOODS_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  v_available := v_source_holding.quantity_owned - v_source_holding.quantity_reserved;
  if v_available < p_quantity then
    raise exception 'STORE_LISTING_STOCK_INSUFFICIENT_FINISHED_GOODS'
      using errcode = 'P0001';
  end if;

  v_cost_currency := coalesce(v_source_holding.cost_currency_code, v_business.currency_code);
  if v_cost_currency is distinct from v_business.currency_code then
    raise exception 'STORE_LISTING_STOCK_COST_CURRENCY_MISMATCH'
      using errcode = 'P0001';
  end if;

  v_metadata := jsonb_build_object(
    'authority', 'business_store_listing_v2',
    'commandRequestHash', v_command_hash,
    'businessKey', v_business.public_key,
    'offerKey', v_offer.public_key,
    'quantity', p_quantity,
    'expectedOfferVersion', p_expected_offer_version
  );
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'inventoryAccountId', v_finished_account.id,
      'gameItemId', v_offer.game_item_id,
      'quantityDelta', -p_quantity,
      'reservationDelta', 0,
      'currencyCode', v_cost_currency,
      'metadata', jsonb_build_object(
        'role', 'finished_goods_source',
        'businessKey', v_business.public_key,
        'offerKey', v_offer.public_key
      )
    ),
    jsonb_build_object(
      'inventoryAccountId', v_account.id,
      'gameItemId', v_offer.game_item_id,
      'quantityDelta', p_quantity,
      'reservationDelta', 0,
      'unitCost', v_source_holding.average_unit_cost,
      'currencyCode', v_cost_currency,
      'metadata', jsonb_build_object(
        'role', 'store_listing_destination',
        'businessKey', v_business.public_key,
        'offerKey', v_offer.public_key
      )
    )
  );

  v_posting := economy_private.post_inventory_transaction_v2(
    p_game_session_id,
    'transfer',
    'business_store',
    'stock_offer',
    v_offer.id,
    btrim(p_idempotency_key),
    v_metadata,
    v_lines
  );

  if not v_offer_was_unbound then
    update public.store_seller_offers as offer_row
    set version = offer_row.version + 1
    where offer_row.id = v_offer.id
    returning * into v_offer;
  end if;

  select holding_row.*
  into v_listing_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_account.id
    and holding_row.game_item_id = v_offer.game_item_id;
  if not found then
    raise exception 'STORE_LISTING_STOCK_HOLDING_MISSING'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'offerKey', v_offer.public_key,
    'offerStatus', v_offer.status,
    'offerVersion', v_offer.version,
    'inventoryAccountKey', v_account.public_key,
    'transactionKey', v_posting->>'transactionKey',
    'quantityAdded', p_quantity,
    'listedQuantity', v_listing_holding.quantity_owned,
    'availableQuantity', v_listing_holding.quantity_owned - v_listing_holding.quantity_reserved,
    'averageUnitCost', v_listing_holding.average_unit_cost,
    'costCurrencyCode', v_listing_holding.cost_currency_code,
    'replayed', false
  );
end
$function$;

revoke all on function public.stock_business_store_offer_v2(
  uuid, text, text, integer, bigint, text
) from public, anon, authenticated;
grant execute on function public.stock_business_store_offer_v2(
  uuid, text, text, integer, bigint, text
) to service_role;

commit;
