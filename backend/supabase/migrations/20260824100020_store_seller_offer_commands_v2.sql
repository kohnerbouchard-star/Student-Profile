-- Business V2 Phase 7A: service-only Business draft and optimistic mutation commands.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.create_business_store_offer_draft_v2(
  p_game_session_id uuid,
  p_business_key text,
  p_store_item_key text,
  p_unit_price numeric,
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
  v_store_item public.store_items%rowtype;
  v_offer public.store_seller_offers%rowtype;
  v_hash text;
  v_lock_key bigint;
begin
  if p_game_session_id is null
    or coalesce(btrim(p_business_key), '') !~ '^biz_[0-9a-f]{32}$'
    or coalesce(btrim(p_store_item_key), '') !~ '^[a-z0-9_-]{1,64}$'
    or p_unit_price is null
    or p_unit_price <= 0
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160
  then
    raise exception 'STORE_SELLER_OFFER_CREATE_REQUEST_INVALID'
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
    raise exception 'STORE_SELLER_OFFER_BUSINESS_NOT_FOUND'
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
    raise exception 'STORE_SELLER_OFFER_BUSINESS_PARTY_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select item_row.*
  into v_store_item
  from public.store_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.item_key = lower(btrim(p_store_item_key))
    and item_row.status = 'active'
    and item_row.visibility = 'visible'
  for share;
  if not found then
    raise exception 'STORE_SELLER_OFFER_STORE_ITEM_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if v_store_item.currency_code is distinct from v_business.currency_code then
    raise exception 'STORE_SELLER_OFFER_BUSINESS_CURRENCY_MISMATCH'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.business_products as product_row
    where product_row.game_session_id = p_game_session_id
      and product_row.business_id = v_business.id
      and product_row.product_kind = 'physical_good'
      and product_row.output_game_item_id = v_store_item.game_item_id
      and product_row.status = 'active'
  ) then
    raise exception 'STORE_SELLER_OFFER_BUSINESS_PRODUCT_NOT_OWNED'
      using errcode = 'P0001';
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to(
        concat_ws('|',
          p_game_session_id::text,
          v_business.id::text,
          v_store_item.id::text,
          p_unit_price::numeric(18,4)::text
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  v_lock_key := hashtextextended(
    concat_ws(':',
      p_game_session_id::text,
      v_party.id::text,
      v_store_item.game_item_id::text
    ),
    0
  );
  perform pg_advisory_xact_lock(v_lock_key);

  select offer_row.*
  into v_offer
  from public.store_seller_offers as offer_row
  where offer_row.game_session_id = p_game_session_id
    and offer_row.seller_party_id = v_party.id
    and offer_row.creation_idempotency_key = btrim(p_idempotency_key)
  for update;
  if found then
    if v_offer.creation_request_hash <> v_hash then
      raise exception 'STORE_SELLER_OFFER_IDEMPOTENCY_CONFLICT'
        using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'offerKey', v_offer.public_key,
      'status', v_offer.status,
      'unitPrice', v_offer.unit_price,
      'currencyCode', v_offer.currency_code,
      'version', v_offer.version,
      'alreadyCreated', true
    );
  end if;

  if exists (
    select 1
    from public.store_seller_offers as offer_row
    where offer_row.game_session_id = p_game_session_id
      and offer_row.seller_party_id = v_party.id
      and offer_row.game_item_id = v_store_item.game_item_id
      and offer_row.seller_kind = 'business'
      and offer_row.status <> 'retired'
  ) then
    raise exception 'STORE_SELLER_OFFER_BUSINESS_CURRENT_EXISTS'
      using errcode = 'P0001';
  end if;

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
    p_game_session_id,
    v_store_item.id,
    v_store_item.game_item_id,
    v_party.id,
    null,
    'business',
    p_unit_price::numeric(18,4),
    v_store_item.currency_code,
    'draft',
    'none',
    btrim(p_idempotency_key),
    v_hash,
    jsonb_build_object(
      'creationAuthority', 'store_v2',
      'businessKey', v_business.public_key
    )
  )
  returning * into v_offer;

  return jsonb_build_object(
    'offerKey', v_offer.public_key,
    'status', v_offer.status,
    'unitPrice', v_offer.unit_price,
    'currencyCode', v_offer.currency_code,
    'version', v_offer.version,
    'alreadyCreated', false
  );
end
$function$;

revoke all on function public.create_business_store_offer_draft_v2(
  uuid, text, text, numeric, text
) from public, anon, authenticated;
grant execute on function public.create_business_store_offer_draft_v2(
  uuid, text, text, numeric, text
) to service_role;

create or replace function public.mutate_store_seller_offer_v2(
  p_game_session_id uuid,
  p_offer_key text,
  p_expected_version bigint,
  p_unit_price numeric default null,
  p_status text default null,
  p_inventory_account_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
declare
  v_offer public.store_seller_offers%rowtype;
  v_account_id uuid;
begin
  if p_game_session_id is null
    or coalesce(btrim(p_offer_key), '') !~ '^sof_[0-9a-f]{32}$'
    or p_expected_version is null
    or p_expected_version < 1
    or (p_unit_price is null and p_status is null and p_inventory_account_key is null)
  then
    raise exception 'STORE_SELLER_OFFER_MUTATION_REQUEST_INVALID'
      using errcode = 'P0001';
  end if;

  select offer_row.*
  into v_offer
  from public.store_seller_offers as offer_row
  where offer_row.game_session_id = p_game_session_id
    and offer_row.public_key = lower(btrim(p_offer_key))
  for update;
  if not found then
    raise exception 'STORE_SELLER_OFFER_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if v_offer.version <> p_expected_version then
    raise exception 'STORE_SELLER_OFFER_VERSION_CONFLICT'
      using errcode = 'P0001';
  end if;

  v_account_id := v_offer.inventory_account_id;
  if p_inventory_account_key is not null then
    select account_row.id
    into v_account_id
    from public.inventory_accounts as account_row
    where account_row.game_session_id = p_game_session_id
      and account_row.public_key = lower(btrim(p_inventory_account_key))
      and account_row.status = 'active'
    for share;
    if not found then
      raise exception 'STORE_SELLER_OFFER_CUSTODY_ACCOUNT_NOT_FOUND'
        using errcode = 'P0001';
    end if;
  end if;

  update public.store_seller_offers as offer_row
  set
    unit_price = coalesce(p_unit_price, offer_row.unit_price),
    status = coalesce(lower(btrim(p_status)), offer_row.status),
    inventory_account_id = v_account_id,
    version = offer_row.version + 1
  where offer_row.id = v_offer.id
  returning * into v_offer;

  return jsonb_build_object(
    'offerKey', v_offer.public_key,
    'status', v_offer.status,
    'unitPrice', v_offer.unit_price,
    'currencyCode', v_offer.currency_code,
    'version', v_offer.version,
    'inventoryBound', v_offer.inventory_account_id is not null
  );
end
$function$;

revoke all on function public.mutate_store_seller_offer_v2(
  uuid, text, bigint, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.mutate_store_seller_offer_v2(
  uuid, text, bigint, numeric, text, text
) to service_role;

commit;
