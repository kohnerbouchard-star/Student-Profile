-- Business V2 Phase 10A.3: atomic same-currency Business seller-offer settlement.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.settle_business_store_offer_v2(
  p_game_session_id uuid,
  p_buyer_player_id uuid,
  p_offer_key text,
  p_quote_key text,
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
  v_offer public.store_seller_offers%rowtype;
  v_quote public.store_offer_purchase_quotes%rowtype;
  v_party public.economic_parties%rowtype;
  v_business public.business_entities%rowtype;
  v_store_item public.store_items%rowtype;
  v_game_item public.game_items%rowtype;
  v_listing_account public.inventory_accounts%rowtype;
  v_listing_holding public.inventory_holdings%rowtype;
  v_buyer_checking public.account_balances%rowtype;
  v_business_cash public.account_balances%rowtype;
  v_buyer_party public.economic_parties%rowtype;
  v_buyer_account public.inventory_accounts%rowtype;
  v_buyer_holding public.inventory_holdings%rowtype;
  v_receipt public.store_offer_purchase_receipts%rowtype;
  v_buyer_debit record;
  v_business_credit record;
  v_inventory_post jsonb;
  v_receipt_id uuid := gen_random_uuid();
  v_receipt_public_key text := 'spr_' || encode(gen_random_bytes(16), 'hex');
  v_offer_key text := lower(btrim(coalesce(p_offer_key, '')));
  v_quote_key text := lower(btrim(coalesce(p_quote_key, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_request_hash text;
  v_expected_quote_hash text;
  v_total numeric(18,4);
  v_source_unit_cost numeric(18,4);
  v_cogs numeric;
  v_margin numeric;
  v_remaining bigint;
  v_buyer_quantity_before numeric;
  v_buyer_average_cost_before numeric(18,4);
  v_buyer_average_cost_after numeric(18,4);
  v_settlement_time timestamptz;
  v_completed_at timestamptz;
  v_quote_status_after text;
  v_quote_version_after bigint;
  v_quote_used_at_after timestamptz;
  v_offer_version_after bigint;
  v_fail_stage text := lower(coalesce(current_setting('app.business_store_settlement_fail_stage', true), ''));
begin
  if p_game_session_id is null or p_buyer_player_id is null
    or v_offer_key !~ '^sof_[0-9a-f]{32}$'
    or v_quote_key !~ '^quote_[0-9a-f]{32}$'
    or p_quantity is null or p_quantity not between 1 and 1000000
    or p_expected_offer_version is null or p_expected_offer_version < 1
    or length(v_idempotency_key) not between 8 and 160
  then
    raise exception 'STORE_OFFER_SETTLEMENT_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  v_request_hash := encode(extensions.digest(convert_to(concat_ws('|',
    'business-store-offer-settlement-v2', p_game_session_id::text,
    p_buyer_player_id::text, v_offer_key, v_quote_key, p_quantity::text,
    p_expected_offer_version::text
  ), 'UTF8'), 'sha256'), 'hex');

  -- Optional idempotency serialization is the only lock acquired before the offer.
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':',
    'business_store_offer_settlement_v2', p_game_session_id::text,
    p_buyer_player_id::text, v_idempotency_key
  ), 0));

  -- A committed immutable receipt is authoritative before mutable-state interpretation.
  select receipt_row.* into v_receipt
  from public.store_offer_purchase_receipts as receipt_row
  where receipt_row.game_session_id = p_game_session_id
    and receipt_row.buyer_player_id = p_buyer_player_id
    and receipt_row.request_idempotency_key = v_idempotency_key;
  if found then
    if v_receipt.request_hash is distinct from v_request_hash then
      raise exception 'STORE_OFFER_SETTLEMENT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return economy_private.read_store_offer_purchase_receipt_result_v2(v_receipt.id, true);
  end if;

  perform 1
  from public.players as buyer_row
  where buyer_row.game_session_id = p_game_session_id
    and buyer_row.id = p_buyer_player_id
    and buyer_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_SETTLEMENT_BUYER_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- Fixed economic lock order begins here: offer, quote, listing,
  -- Buyer Checking, Business cash, then Buyer Inventory.
  select offer_row.* into v_offer
  from public.store_seller_offers as offer_row
  where offer_row.game_session_id = p_game_session_id
    and offer_row.public_key = v_offer_key
    and offer_row.seller_kind = 'business'
  for update;
  if not found then
    raise exception 'STORE_OFFER_SETTLEMENT_OFFER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_offer.status <> 'active' then
    raise exception 'STORE_OFFER_SETTLEMENT_OFFER_STATUS_INVALID' using errcode = 'P0001';
  end if;
  if v_offer.version <> p_expected_offer_version then
    raise exception 'STORE_OFFER_SETTLEMENT_OFFER_VERSION_CONFLICT' using errcode = 'P0001';
  end if;
  if v_offer.inventory_account_id is null then
    raise exception 'STORE_OFFER_SETTLEMENT_CUSTODY_MISSING' using errcode = 'P0001';
  end if;

  select quote_row.* into v_quote
  from public.store_offer_purchase_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.buyer_player_id = p_buyer_player_id
    and quote_row.public_key = v_quote_key
  for update;
  if not found then
    raise exception 'STORE_OFFER_SETTLEMENT_QUOTE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_quote.status <> 'created' then
    raise exception 'STORE_OFFER_SETTLEMENT_QUOTE_STATUS_INVALID' using errcode = 'P0001';
  end if;
  v_settlement_time := clock_timestamp();
  if v_quote.expires_at <= v_settlement_time then
    raise exception 'STORE_OFFER_SETTLEMENT_QUOTE_EXPIRED' using errcode = 'P0001';
  end if;
  v_expected_quote_hash := encode(extensions.digest(convert_to(concat_ws('|',
    'business-offer-quote-v2', p_game_session_id::text,
    p_buyer_player_id::text, v_offer_key, p_quantity::text,
    p_expected_offer_version::text
  ), 'UTF8'), 'sha256'), 'hex');
  if v_quote.offer_id is distinct from v_offer.id
    or v_quote.offer_version is distinct from v_offer.version
    or v_quote.quantity is distinct from p_quantity
    or v_quote.business_id is null
    or v_quote.seller_party_id is distinct from v_offer.seller_party_id
    or v_quote.store_item_id is distinct from v_offer.store_item_id
    or v_quote.game_item_id is distinct from v_offer.game_item_id
    or v_quote.inventory_account_id is distinct from v_offer.inventory_account_id
    or v_quote.seller_unit_price is distinct from v_offer.unit_price
    or v_quote.final_unit_price is distinct from v_offer.unit_price
    or v_quote.seller_total_price is distinct from v_quote.final_total_price
    or v_quote.final_total_price is distinct from round(v_offer.unit_price * p_quantity, 4)
    or v_quote.seller_currency_code is distinct from v_offer.currency_code
    or v_quote.buyer_currency_code is distinct from v_offer.currency_code
    or v_quote.exchange_rate is distinct from 1
    or v_quote.pricing_version is distinct from 'business-offer-fixed-price-v2'
    or v_quote.request_hash is distinct from v_expected_quote_hash
  then
    raise exception 'STORE_OFFER_SETTLEMENT_QUOTE_MISMATCH' using errcode = 'P0001';
  end if;

  select party_row.* into v_party from public.economic_parties as party_row
  where party_row.game_session_id = p_game_session_id
    and party_row.id = v_offer.seller_party_id
    and party_row.party_kind = 'business' and party_row.status = 'active'
  for share;
  if not found or v_party.business_id is null or v_party.business_id is distinct from v_quote.business_id then
    raise exception 'STORE_OFFER_SETTLEMENT_SELLER_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select business_row.* into v_business from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_party.business_id and business_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_SETTLEMENT_BUSINESS_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_business.owner_player_id = p_buyer_player_id then
    raise exception 'STORE_OFFER_SETTLEMENT_SELF_PURCHASE_FORBIDDEN' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.business_ownership_positions as position_row
    where position_row.game_session_id = p_game_session_id
      and position_row.business_id = v_business.id
      and position_row.player_id = p_buyer_player_id
      and position_row.status = 'active'
  ) then
    raise exception 'STORE_OFFER_SETTLEMENT_SELF_PURCHASE_FORBIDDEN' using errcode = 'P0001';
  end if;
  if v_business.currency_code is distinct from v_offer.currency_code then
    raise exception 'STORE_OFFER_SETTLEMENT_BUSINESS_CURRENCY_INVALID' using errcode = 'P0001';
  end if;

  select store_row.* into v_store_item from public.store_items as store_row
  where store_row.game_session_id = p_game_session_id and store_row.id = v_offer.store_item_id
    and store_row.status = 'active' and store_row.visibility = 'visible'
  for share;
  if not found or v_store_item.game_item_id is distinct from v_offer.game_item_id
    or v_store_item.currency_code is distinct from v_offer.currency_code then
    raise exception 'STORE_OFFER_SETTLEMENT_CATALOG_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select item_row.* into v_game_item from public.game_items as item_row
  where item_row.game_session_id = p_game_session_id and item_row.id = v_offer.game_item_id
    and item_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_SETTLEMENT_ITEM_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select account_row.* into v_listing_account from public.inventory_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.id = v_offer.inventory_account_id
    and account_row.party_id = v_party.id and account_row.account_kind = 'store_stock'
    and account_row.location_key = 'store_offer:' || v_offer.public_key
    and account_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_SETTLEMENT_CUSTODY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select holding_row.* into v_listing_holding from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_listing_account.id
    and holding_row.game_item_id = v_offer.game_item_id
  for update;
  if not found then
    raise exception 'STORE_OFFER_SETTLEMENT_LISTING_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_listing_holding.quantity_owned <> trunc(v_listing_holding.quantity_owned)
    or v_listing_holding.quantity_reserved <> trunc(v_listing_holding.quantity_reserved) then
    raise exception 'STORE_OFFER_SETTLEMENT_LISTING_QUANTITY_INVALID' using errcode = 'P0001';
  end if;
  if v_listing_holding.quantity_reserved <> 0 then
    raise exception 'STORE_OFFER_SETTLEMENT_INVENTORY_RESERVED' using errcode = 'P0001';
  end if;
  if v_listing_holding.quantity_owned < p_quantity then
    raise exception 'STORE_OFFER_SETTLEMENT_INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;
  if v_listing_holding.cost_currency_code is distinct from v_offer.currency_code then
    raise exception 'STORE_OFFER_SETTLEMENT_COST_CURRENCY_DRIFT' using errcode = 'P0001';
  end if;

  v_total := v_quote.final_total_price;
  if v_total is null or v_total <= 0 or v_total <> round(v_total, 2)
    or v_total > 999999999999.99 then
    raise exception 'STORE_OFFER_SETTLEMENT_MONEY_PRECISION_UNREPRESENTABLE' using errcode = 'P0001';
  end if;
  v_source_unit_cost := round(v_listing_holding.average_unit_cost, 4);
  v_cogs := round(v_source_unit_cost * p_quantity, 4);
  v_margin := round(v_total - v_cogs, 4);
  if v_cogs > 99999999999999.9999
    or abs(v_margin) > 99999999999999.9999 then
    raise exception 'STORE_OFFER_SETTLEMENT_COST_PRECISION_UNREPRESENTABLE' using errcode = 'P0001';
  end if;
  v_remaining := v_listing_holding.quantity_owned::bigint - p_quantity;

  select balance_row.* into v_buyer_checking from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.player_id = p_buyer_player_id
    and balance_row.business_id is null
    and balance_row.account_type = 'checking'
    and balance_row.currency_code = v_offer.currency_code
  for update;
  if not found or v_buyer_checking.balance < v_total then
    raise exception 'STORE_OFFER_SETTLEMENT_INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  select balance_row.* into v_business_cash from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.business_id = v_business.id
    and balance_row.currency_code = v_offer.currency_code
  for update;
  if not found or v_business_cash.account_type is distinct from public.business_account_type_v1(v_business.public_key)
    or v_business_cash.player_id is distinct from v_business.owner_player_id
    or v_business_cash.balance > 999999999999.99 - v_total then
    raise exception 'STORE_OFFER_SETTLEMENT_BUSINESS_CASH_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select party_row.* into v_buyer_party from public.economic_parties as party_row
  where party_row.game_session_id = p_game_session_id
    and party_row.player_id = p_buyer_player_id
    and party_row.party_kind = 'player' and party_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_SETTLEMENT_BUYER_INVENTORY_UNAVAILABLE' using errcode = 'P0001';
  end if;
  select account_row.* into v_buyer_account from public.inventory_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.party_id = v_buyer_party.id
    and account_row.account_kind = 'personal' and account_row.location_key is null
    and account_row.status = 'active'
  for update;
  if not found then
    raise exception 'STORE_OFFER_SETTLEMENT_BUYER_INVENTORY_UNAVAILABLE' using errcode = 'P0001';
  end if;
  select holding_row.* into v_buyer_holding from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_buyer_account.id
    and holding_row.game_item_id = v_game_item.id
  for update;
  if found and v_buyer_holding.quantity_owned > 0
    and v_buyer_holding.cost_currency_code is distinct from v_offer.currency_code then
    raise exception 'STORE_OFFER_SETTLEMENT_BUYER_INVENTORY_CURRENCY_INVALID' using errcode = 'P0001';
  end if;
  v_buyer_quantity_before := case when found then v_buyer_holding.quantity_owned else 0 end;
  v_buyer_average_cost_before := case when found then v_buyer_holding.average_unit_cost else 0 end;
  v_buyer_average_cost_after := round((
    (v_buyer_quantity_before * v_buyer_average_cost_before)
    + (p_quantity * v_source_unit_cost)
  ) / (v_buyer_quantity_before + p_quantity), 4);

  select * into v_buyer_debit from public.record_player_ledger_entry(
    p_game_session_id, p_buyer_player_id, 'checking', -v_total, v_offer.currency_code,
    'debit', 'store', 'business_offer_purchase_debit', v_receipt_id, 'player',
    p_buyer_player_id, jsonb_build_object('offer_key', v_offer.public_key,
      'quote_key', v_quote.public_key, 'receiptKey', v_receipt_public_key,
      'settlement_request_hash', v_request_hash)
  );
  if v_buyer_debit.account_balance_id is distinct from v_buyer_checking.id
    or v_buyer_debit.account_type is distinct from 'checking'
    or v_buyer_debit.currency_code is distinct from v_offer.currency_code
    or v_buyer_debit.balance is distinct from v_buyer_checking.balance - v_total then
    raise exception 'STORE_OFFER_SETTLEMENT_BUYER_DEBIT_POSTCONDITION_FAILED' using errcode = 'P0001';
  end if;
  if v_fail_stage = 'after_buyer_debit' then raise exception 'STORE_OFFER_SETTLEMENT_INJECTED_FAILURE:after_buyer_debit' using errcode = 'P0001'; end if;

  select * into v_business_credit from public.record_business_ledger_entry_v2(
    p_game_session_id, v_business.id, v_total, v_offer.currency_code, 'credit',
    'store', 'business_offer_purchase_credit', v_receipt_id, 'player',
    p_buyer_player_id, jsonb_build_object('offer_key', v_offer.public_key,
      'quote_key', v_quote.public_key, 'receiptKey', v_receipt_public_key,
      'settlement_request_hash', v_request_hash)
  );
  if v_business_credit.account_balance_id is distinct from v_business_cash.id
    or v_business_credit.account_type is distinct from v_business_cash.account_type
    or v_business_credit.currency_code is distinct from v_offer.currency_code
    or v_business_credit.balance is distinct from v_business_cash.balance + v_total then
    raise exception 'STORE_OFFER_SETTLEMENT_BUSINESS_CREDIT_POSTCONDITION_FAILED' using errcode = 'P0001';
  end if;
  if v_fail_stage = 'after_business_credit' then raise exception 'STORE_OFFER_SETTLEMENT_INJECTED_FAILURE:after_business_credit' using errcode = 'P0001'; end if;

  v_inventory_post := economy_private.post_inventory_transaction_v2(
    p_game_session_id, 'purchase', 'store', 'business_offer_purchase', v_receipt_id,
    'business-offer-purchase:' || substr(v_request_hash, 1, 64),
    jsonb_build_object('authority', 'business_store_offer_settlement_v2',
      'offerKey', v_offer.public_key, 'quoteKey', v_quote.public_key,
      'receiptKey', v_receipt_public_key),
    jsonb_build_array(
      jsonb_build_object('inventoryAccountId', v_listing_account.id,
        'gameItemId', v_game_item.id, 'quantityDelta', -p_quantity,
        'unitCost', v_source_unit_cost, 'currencyCode', v_offer.currency_code,
        'metadata', jsonb_build_object('offerKey', v_offer.public_key,
          'quoteKey', v_quote.public_key, 'receiptKey', v_receipt_public_key)),
      jsonb_build_object('inventoryAccountId', v_buyer_account.id,
        'gameItemId', v_game_item.id, 'playerId', p_buyer_player_id,
        'storeItemId', v_store_item.id, 'quantityDelta', p_quantity,
        'unitCost', v_source_unit_cost, 'currencyCode', v_offer.currency_code,
        'eventType', 'PURCHASED', 'legacyEventQuantityDelta', p_quantity,
        'metadata', jsonb_build_object('offerKey', v_offer.public_key,
          'quoteKey', v_quote.public_key, 'receiptKey', v_receipt_public_key),
        'eventMetadata', jsonb_build_object('offerKey', v_offer.public_key,
          'quoteKey', v_quote.public_key, 'receiptKey', v_receipt_public_key))
    )
  );
  select holding_row.* into v_listing_holding from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_listing_account.id
    and holding_row.game_item_id = v_game_item.id;
  select holding_row.* into v_buyer_holding from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_buyer_account.id
    and holding_row.game_item_id = v_game_item.id;
  if v_listing_holding.quantity_owned is distinct from v_remaining
    or v_listing_holding.quantity_reserved <> 0
    or v_listing_holding.average_unit_cost is distinct from (
      case when v_remaining = 0 then 0 else v_source_unit_cost end
    )
    or v_listing_holding.cost_currency_code is distinct from v_offer.currency_code
    or v_buyer_holding.quantity_owned is distinct from v_buyer_quantity_before + p_quantity
    or v_buyer_holding.average_unit_cost is distinct from v_buyer_average_cost_after
    or v_buyer_holding.cost_currency_code is distinct from v_offer.currency_code then
    raise exception 'STORE_OFFER_SETTLEMENT_INVENTORY_POSTCONDITION_FAILED' using errcode = 'P0001';
  end if;
  if v_fail_stage = 'after_inventory_post' then raise exception 'STORE_OFFER_SETTLEMENT_INJECTED_FAILURE:after_inventory_post' using errcode = 'P0001'; end if;

  v_completed_at := clock_timestamp();
  insert into public.business_activity_events(game_session_id, business_id, actor_type,
    actor_player_id, event_type, source_id, reason_code, metadata, occurred_at)
  values (p_game_session_id, v_business.id, 'player', p_buyer_player_id,
    'business.store.sale.completed', v_receipt_id, 'business_store_offer_purchase',
    jsonb_build_object('offerKey', v_offer.public_key, 'quoteKey', v_quote.public_key,
      'quantity', p_quantity, 'grossRevenue', v_total, 'costOfGoodsSold', v_cogs,
      'grossMargin', v_margin, 'currencyCode', v_offer.currency_code,
      'receiptKey', v_receipt_public_key), v_completed_at);
  if v_fail_stage = 'after_activity' then raise exception 'STORE_OFFER_SETTLEMENT_INJECTED_FAILURE:after_activity' using errcode = 'P0001'; end if;

  insert into public.store_offer_purchase_receipts(
    id, public_key, game_session_id, buyer_player_id, quote_id, offer_id, business_id,
    seller_party_id, store_item_id, game_item_id, listing_inventory_account_id,
    buyer_inventory_account_id, buyer_debit_ledger_entry_id,
    business_credit_ledger_entry_id, inventory_transaction_id, quote_key,
    offer_key, business_key, seller_party_key, catalog_item_key,
    canonical_item_key, store_item_key, buyer_inventory_account_key,
    inventory_transaction_key, quantity, unit_price, total_price, currency_code,
    buyer_debit, business_credit, gross_revenue, source_unit_cost,
    cost_currency_code, cost_of_goods_sold, gross_margin, offer_version_before,
    offer_version_after, remaining_listed_quantity, request_idempotency_key,
    request_hash, completed_at, metadata
  ) values (
    v_receipt_id, v_receipt_public_key, p_game_session_id, p_buyer_player_id,
    v_quote.id, v_offer.id,
    v_business.id, v_party.id, v_store_item.id, v_game_item.id,
    v_listing_account.id, v_buyer_account.id, v_buyer_debit.ledger_entry_id,
    v_business_credit.ledger_entry_id, (v_inventory_post->>'transactionId')::uuid,
    v_quote.public_key, v_offer.public_key, v_business.public_key,
    v_party.public_key, v_game_item.public_key, v_game_item.canonical_key,
    v_store_item.item_key, v_buyer_account.public_key,
    v_inventory_post->>'transactionKey', p_quantity, v_quote.final_unit_price,
    v_total, v_offer.currency_code, v_total, v_total, v_total,
    v_source_unit_cost, v_offer.currency_code, v_cogs, v_margin, v_offer.version,
    v_offer.version + 1, v_remaining, v_idempotency_key, v_request_hash,
    v_completed_at,
    jsonb_build_object('authority', 'business_store_offer_settlement_v2',
      'sameCurrency', true, 'exchangeRate', 1)
  ) returning * into v_receipt;
  if v_fail_stage = 'after_receipt' then raise exception 'STORE_OFFER_SETTLEMENT_INJECTED_FAILURE:after_receipt' using errcode = 'P0001'; end if;

  update public.store_offer_purchase_quotes set status = 'used',
    used_at = v_settlement_time, version = version + 1
  where game_session_id = p_game_session_id
    and id = v_quote.id
    and status = 'created'
    and version = v_quote.version
  returning status, version, used_at
  into v_quote_status_after, v_quote_version_after, v_quote_used_at_after;
  if not found
    or v_quote_status_after is distinct from 'used'
    or v_quote_version_after is distinct from v_quote.version + 1
    or v_quote_used_at_after is distinct from v_settlement_time then
    raise exception 'STORE_OFFER_SETTLEMENT_QUOTE_COMPLETION_FAILED' using errcode = 'P0001';
  end if;
  if v_fail_stage = 'after_quote_consumption' then raise exception 'STORE_OFFER_SETTLEMENT_INJECTED_FAILURE:after_quote_consumption' using errcode = 'P0001'; end if;

  update public.store_seller_offers set version = version + 1
  where game_session_id = p_game_session_id
    and id = v_offer.id
    and status = 'active'
    and version = v_offer.version
  returning version into v_offer_version_after;
  if not found or v_offer_version_after is distinct from v_offer.version + 1 then
    raise exception 'STORE_OFFER_SETTLEMENT_OFFER_COMPLETION_FAILED' using errcode = 'P0001';
  end if;
  if v_fail_stage = 'after_offer_version' then raise exception 'STORE_OFFER_SETTLEMENT_INJECTED_FAILURE:after_offer_version' using errcode = 'P0001'; end if;

  return economy_private.read_store_offer_purchase_receipt_result_v2(v_receipt.id, false);
end
$function$;

comment on function public.settle_business_store_offer_v2(uuid, uuid, text, text, integer, bigint, text) is
  'Atomically settles one locked Business seller offer: Buyer Checking debit, Business cash credit, Store Listing transfer, accounting evidence, immutable receipt, quote use, and offer version.';

revoke all on function public.settle_business_store_offer_v2(uuid, uuid, text, text, integer, bigint, text)
  from public, anon, authenticated, service_role;
grant execute on function public.settle_business_store_offer_v2(uuid, uuid, text, text, integer, bigint, text)
  to service_role;

commit;
