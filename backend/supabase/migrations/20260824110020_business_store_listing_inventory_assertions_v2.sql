-- Business V2 Phase 8A: fail-closed schema and privilege assertions.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $assertions$
declare
  v_poster oid := to_regprocedure(
    'economy_private.post_inventory_transaction_v2(uuid,text,text,text,uuid,text,jsonb,jsonb)'
  );
  v_ensure oid := to_regprocedure(
    'economy_private.ensure_business_store_listing_account_v2(uuid,uuid,uuid)'
  );
  v_stock oid := to_regprocedure(
    'public.stock_business_store_offer_v2(uuid,text,text,integer,bigint,text)'
  );
  v_definition text;
begin
  if v_poster is null then
    raise exception 'STORE_LISTING_CANONICAL_POSTER_MISSING';
  end if;
  v_definition := pg_get_functiondef(v_poster);
  if position('v_party.party_kind not in (''store'',''business'')' in v_definition) = 0
    or position('INVENTORY_TRANSACTION_BUSINESS_STORE_PROVENANCE_INVALID' in v_definition) = 0
    or position('INVENTORY_TRANSACTION_BUSINESS_STORE_SCOPE_MISMATCH' in v_definition) = 0
    or position('offer_row.inventory_account_id = v_account_id' in v_definition) = 0
  then
    raise exception 'STORE_LISTING_CANONICAL_POSTER_INCOMPLETE';
  end if;

  if v_ensure is null then
    raise exception 'STORE_LISTING_ACCOUNT_ENSURE_FUNCTION_MISSING';
  end if;
  if v_stock is null then
    raise exception 'STORE_LISTING_STOCK_FUNCTION_MISSING';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.inventory_accounts'::regclass
      and tgname = 'guard_business_store_listing_account_v2'
      and not tgisinternal
  ) then
    raise exception 'STORE_LISTING_ACCOUNT_GUARD_MISSING';
  end if;

  if not exists (
    select 1
    from pg_proc
    where oid = v_ensure
      and prosecdef
  ) or not exists (
    select 1
    from pg_proc
    where oid = v_stock
      and prosecdef
  ) then
    raise exception 'STORE_LISTING_SECURITY_DEFINER_REQUIRED';
  end if;

  if has_function_privilege(
      'anon',
      'public.stock_business_store_offer_v2(uuid,text,text,integer,bigint,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.stock_business_store_offer_v2(uuid,text,text,integer,bigint,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.stock_business_store_offer_v2(uuid,text,text,integer,bigint,text)',
      'EXECUTE'
    )
  then
    raise exception 'STORE_LISTING_STOCK_PRIVILEGE_BOUNDARY_INVALID';
  end if;

  if has_function_privilege(
      'anon',
      'economy_private.ensure_business_store_listing_account_v2(uuid,uuid,uuid)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'economy_private.ensure_business_store_listing_account_v2(uuid,uuid,uuid)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'economy_private.ensure_business_store_listing_account_v2(uuid,uuid,uuid)',
      'EXECUTE'
    )
  then
    raise exception 'STORE_LISTING_ACCOUNT_PRIVILEGE_BOUNDARY_INVALID';
  end if;

  v_definition := pg_get_functiondef(v_stock);
  if position('source_domain = ''business_store''' in v_definition) = 0
    or position('source_action = ''stock_offer''' in v_definition) = 0
    or position('STORE_LISTING_STOCK_IDEMPOTENCY_CONFLICT' in v_definition) = 0
    or position('STORE_LISTING_STOCK_OFFER_VERSION_CONFLICT' in v_definition) = 0
    or position('quantity_owned - v_source_holding.quantity_reserved' in v_definition) = 0
    or position('economy_private.post_inventory_transaction_v2' in v_definition) = 0
    or position('''finished_goods_source''' in v_definition) = 0
    or position('''store_listing_destination''' in v_definition) = 0
  then
    raise exception 'STORE_LISTING_STOCK_FUNCTION_INCOMPLETE';
  end if;

  if position('from public.business_inventory as inventory_row' in v_definition) = 0
    or position('inventory_row.inventory_kind = ''finished_good''' in v_definition) = 0
    or position('STORE_LISTING_STOCK_FINISHED_PROJECTION_MISMATCH' in v_definition) = 0
    or position('STORE_LISTING_STOCK_REPLAY_FINISHED_PROJECTION_MISMATCH' in v_definition) = 0
    or position('quantity = v_source_holding_after.quantity_owned' in v_definition) = 0
    or position('unit_cost = v_source_holding_after.average_unit_cost' in v_definition) = 0
    or position('STORE_LISTING_STOCK_FINISHED_PROJECTION_UPDATE_INVALID' in v_definition) = 0
  then
    raise exception 'STORE_LISTING_STOCK_PROJECTION_SYNC_MISSING';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'store_seller_offers'
      and column_name in (
        'listed_quantity', 'available_quantity', 'stock_quantity',
        'quantity_owned', 'quantity_available'
      )
  ) then
    raise exception 'STORE_LISTING_PARALLEL_QUANTITY_FORBIDDEN';
  end if;

  if exists (
    select 1
    from public.inventory_accounts as account_row
    join public.economic_parties as party_row
      on party_row.game_session_id = account_row.game_session_id
     and party_row.id = account_row.party_id
    where account_row.account_kind = 'store_stock'
      and party_row.party_kind = 'business'
      and (
        account_row.location_key !~ '^store_offer:sof_[0-9a-f]{32}$'
        or account_row.metadata->>'authority' <> 'business_store_listing_v2'
        or account_row.metadata->>'offerKey'
          <> substring(account_row.location_key from length('store_offer:') + 1)
        or not exists (
          select 1
          from public.store_seller_offers as offer_row
          where offer_row.game_session_id = account_row.game_session_id
            and offer_row.public_key = account_row.metadata->>'offerKey'
            and offer_row.seller_party_id = account_row.party_id
            and offer_row.seller_kind = 'business'
            and offer_row.status <> 'retired'
        )
      )
  ) then
    raise exception 'STORE_LISTING_ACCOUNT_BACKFILL_INVALID';
  end if;
end
$assertions$;

commit;
