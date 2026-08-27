-- Econovaria Business V2 Phase 10A.4C2: atomic funded Marketplace settlement.
--
-- One transaction composes C0 buyer funding, distributes the exact listing-
-- currency commercial proceeds through B2, transfers the reserved item, and
-- completes the Marketplace order and evidence.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

create or replace function private.read_marketplace_funding_order_result_v1(
  p_order_id uuid,
  p_replayed boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'orderKey', order_row.public_id,
    'reservationKey', reservation_row.public_id,
    'listingKey', listing_row.public_id,
    'itemKey', order_row.item_key,
    'quantity', order_row.quantity,
    'unitPrice', order_row.unit_price::text,
    'subtotal', order_row.subtotal::text,
    'feeAmount', order_row.fee_amount::text,
    'taxAmount', order_row.tax_amount::text,
    'buyerTotal', order_row.buyer_total::text,
    'sellerProceeds', order_row.seller_proceeds::text,
    'currencyCode', order_row.currency_code,
    'status', order_row.status,
    'version', order_row.version,
    'completedAt', order_row.completed_at,
    'refundedAt', order_row.refunded_at,
    'replayed', p_replayed,
    'fundingReceipt', private.purchase_funding_receipt_public_json_v1(
      order_row.funding_receipt_id
    ),
    'distributionBankTransactionKey', distribution_row.public_key
  )
  from public.marketplace_orders as order_row
  join public.marketplace_purchase_reservations as reservation_row
    on reservation_row.id = order_row.reservation_id
   and reservation_row.game_session_id = order_row.game_session_id
  join public.marketplace_listings as listing_row
    on listing_row.id = order_row.listing_id
   and listing_row.game_session_id = order_row.game_session_id
  join public.bank_transactions as distribution_row
    on distribution_row.id = order_row.distribution_bank_transaction_id
   and distribution_row.game_session_id = order_row.game_session_id
  where order_row.id = p_order_id
    and order_row.funding_receipt_id is not null;
$function$;

revoke all on function private.read_marketplace_funding_order_result_v1(uuid, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.settle_marketplace_funding_v1(
  p_game_session_id uuid,
  p_buyer_player_id uuid,
  p_reservation_key text,
  p_idempotency_key text,
  p_client_submitted_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_reservation_key text := lower(btrim(coalesce(p_reservation_key, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_now timestamptz := clock_timestamp();
  v_request_hash text;
  v_reservation_preview public.marketplace_purchase_reservations%rowtype;
  v_reservation public.marketplace_purchase_reservations%rowtype;
  v_listing public.marketplace_listings%rowtype;
  v_order public.marketplace_orders%rowtype;
  v_existing_order public.marketplace_orders%rowtype;
  v_seller_holding public.inventory_holdings%rowtype;
  v_buyer_holding public.inventory_holdings%rowtype;
  v_funding_quote public.purchase_funding_quotes%rowtype;
  v_funding_result jsonb;
  v_funding_receipt_key text;
  v_funding_receipt public.purchase_funding_receipts%rowtype;
  v_distribution_lines jsonb;
  v_distribution_request_hash text;
  v_distribution record;
  v_clearing_balance_before numeric(38, 18);
  v_clearing_balance_after numeric(38, 18);
  v_order_id uuid := extensions.gen_random_uuid();
  v_order_key text;
  v_prior_write_context text := coalesce(
    current_setting('app.marketplace_funding_write_v1', true), ''
  );
begin
  if p_game_session_id is null
     or p_buyer_player_id is null
     or v_reservation_key !~ '^mpr_[0-9a-f]{32}$'
     or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'
  then
    raise exception 'MARKETPLACE_FUNDED_SETTLEMENT_REQUEST_INVALID'
      using errcode = '22023';
  end if;

  v_request_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'marketplace-funded-settlement-v1',
    'gameSessionId', p_game_session_id,
    'buyerPlayerId', p_buyer_player_id,
    'reservationKey', v_reservation_key,
    'clientSubmittedAt', p_client_submitted_at
  ));

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    ':',
    'marketplace_funded_settlement_v1',
    p_game_session_id::text,
    p_buyer_player_id::text,
    v_reservation_key
  ), 0));

  -- Resolve order replay before current listing, Inventory, balance, hold, rate,
  -- account, or facility state is reinterpreted.
  select reservation_row.*
  into v_reservation_preview
  from public.marketplace_purchase_reservations as reservation_row
  where reservation_row.game_session_id = p_game_session_id
    and reservation_row.buyer_player_id = p_buyer_player_id
    and reservation_row.public_id = v_reservation_key;
  if not found then
    raise exception 'MARKETPLACE_RESERVATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  select order_row.*
  into v_existing_order
  from public.marketplace_orders as order_row
  where order_row.game_session_id = p_game_session_id
    and order_row.reservation_id = v_reservation_preview.id;
  if found then
    if v_existing_order.funding_receipt_id is null
       or v_existing_order.settlement_idempotency_key <> v_idempotency_key
       or v_existing_order.settlement_request_hash <> v_request_hash
    then
      raise exception 'MARKETPLACE_FUNDED_SETTLEMENT_CONFLICT'
        using errcode = 'P0001';
    end if;
    return private.read_marketplace_funding_order_result_v1(
      v_existing_order.id,
      true
    );
  end if;

  perform 1
  from public.players as player_row
  join public.game_sessions as game_row
    on game_row.id = player_row.game_session_id
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_buyer_player_id
    and player_row.status = 'active'
    and game_row.status = 'active'
  for share of player_row, game_row;
  if not found then
    raise exception 'MARKETPLACE_PLAYER_SCOPE_INACTIVE'
      using errcode = 'P0001';
  end if;

  -- Listing is the first mutable economic root.
  select listing_row.*
  into v_listing
  from public.marketplace_listings as listing_row
  where listing_row.game_session_id = p_game_session_id
    and listing_row.id = v_reservation_preview.listing_id
  for update;
  if not found then
    raise exception 'MARKETPLACE_LISTING_NOT_FOUND' using errcode = 'P0001';
  end if;

  select reservation_row.*
  into v_reservation
  from public.marketplace_purchase_reservations as reservation_row
  where reservation_row.game_session_id = p_game_session_id
    and reservation_row.id = v_reservation_preview.id
    and reservation_row.buyer_player_id = p_buyer_player_id
  for update;
  if not found then
    raise exception 'MARKETPLACE_RESERVATION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_reservation.funding_quote_id is null
     or v_reservation.funding_context_hash is null
  then
    raise exception 'MARKETPLACE_FUNDING_REQUIRED' using errcode = 'P0001';
  end if;
  if v_reservation.status <> 'reserved' then
    raise exception 'MARKETPLACE_RESERVATION_NOT_SETTLEABLE'
      using errcode = 'P0001';
  end if;
  if v_reservation.expires_at <= v_now then
    raise exception 'MARKETPLACE_FUNDED_QUOTE_EXPIRED'
      using errcode = 'P0001';
  end if;
  if v_listing.seller_player_id <> v_reservation.seller_player_id
     or v_listing.store_item_id <> (
       select reservation_listing.store_item_id
       from public.marketplace_listings as reservation_listing
       where reservation_listing.id = v_reservation.listing_id
     )
     or v_listing.status not in ('active', 'sold_out')
  then
    raise exception 'MARKETPLACE_LISTING_STATE_CONFLICT'
      using errcode = 'P0001';
  end if;

  select holding_row.*
  into v_seller_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.player_id = v_reservation.seller_player_id
    and holding_row.id = v_listing.inventory_holding_id
    and holding_row.store_item_id = v_listing.store_item_id
  for update;
  if not found
     or v_seller_holding.quantity_owned < v_reservation.quantity
  then
    raise exception 'MARKETPLACE_RESERVATION_QUANTITY_UNAVAILABLE'
      using errcode = 'P0001';
  end if;
  perform public.marketplace_assert_listing_reservation_v1(
    p_game_session_id,
    v_reservation.seller_player_id,
    v_listing.id,
    v_listing.inventory_holding_id,
    v_reservation.quantity
  );

  select quote_row.*
  into v_funding_quote
  from public.purchase_funding_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.id = v_reservation.funding_quote_id
    and quote_row.player_id = p_buyer_player_id
  for update;
  if not found
     or v_funding_quote.funding_context_kind <> 'marketplace.purchase'
     or v_funding_quote.funding_context_key <> v_reservation.public_id
     or v_funding_quote.funding_context_hash <> v_reservation.funding_context_hash
     or v_funding_quote.target_currency_code <> v_reservation.currency_code
     or v_funding_quote.target_amount <> v_reservation.buyer_total
  then
    raise exception 'MARKETPLACE_FUNDED_QUOTE_BINDING_FAILED'
      using errcode = 'P0001';
  end if;

  select balance_row.balance
  into strict v_clearing_balance_before
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.bank_account_id = v_reservation.settlement_clearing_account_id;

  update public.marketplace_purchase_reservations
  set status = 'settling',
      version = version + 1,
      settling_at = v_now,
      updated_at = statement_timestamp()
  where id = v_reservation.id
  returning * into v_reservation;

  v_order_key := 'ord_' || replace(v_order_id::text, '-', '');
  insert into public.marketplace_orders(
    id,
    public_id,
    game_session_id,
    reservation_id,
    listing_id,
    buyer_player_id,
    seller_player_id,
    store_item_id,
    item_key,
    quantity,
    unit_price,
    subtotal,
    fee_amount,
    tax_amount,
    buyer_total,
    seller_proceeds,
    currency_code,
    status,
    version
  ) values (
    v_order_id,
    v_order_key,
    p_game_session_id,
    v_reservation.id,
    v_listing.id,
    p_buyer_player_id,
    v_reservation.seller_player_id,
    v_listing.store_item_id,
    v_listing.item_key,
    v_reservation.quantity,
    v_reservation.unit_price,
    v_reservation.subtotal,
    v_reservation.fee_amount,
    v_reservation.tax_amount,
    v_reservation.buyer_total,
    v_reservation.seller_proceeds,
    v_reservation.currency_code,
    'settling',
    1
  )
  returning * into v_order;

  v_funding_result := private.compose_purchase_funding_v1(
    p_game_session_id,
    p_buyer_player_id,
    v_funding_quote.public_key,
    'marketplace.purchase',
    v_reservation.public_id,
    v_reservation.funding_context_hash,
    v_reservation.settlement_clearing_account_id,
    'marketplace',
    'marketplace_purchase_funding',
    v_order.id,
    'marketplace-funding-settle:' || substr(v_request_hash, 1, 64),
    'player',
    p_buyer_player_id,
    v_now
  );
  v_funding_receipt_key := v_funding_result -> 'receipt' ->> 'receipt_key';

  select receipt_row.*
  into v_funding_receipt
  from public.purchase_funding_receipts as receipt_row
  where receipt_row.game_session_id = p_game_session_id
    and receipt_row.public_key = v_funding_receipt_key
    and receipt_row.quote_id = v_funding_quote.id
    and receipt_row.target_account_id = v_reservation.settlement_clearing_account_id
    and receipt_row.source_domain = 'marketplace'
    and receipt_row.source_action = 'marketplace_purchase_funding'
    and receipt_row.source_id = v_order.id;
  if not found then
    raise exception 'MARKETPLACE_FUNDING_RECEIPT_INVALID'
      using errcode = 'P0001';
  end if;

  v_distribution_lines := jsonb_build_array(
    jsonb_build_object(
      'bankAccountId', v_reservation.settlement_clearing_account_id,
      'amount', (-v_reservation.buyer_total)::text,
      'entryType', 'debit',
      'metadata', jsonb_build_object(
        'lineRole', 'marketplace_settlement_clearing_debit',
        'orderKey', v_order.public_id,
        'reservationKey', v_reservation.public_id
      )
    ),
    jsonb_build_object(
      'bankAccountId', v_reservation.seller_bank_account_id,
      'amount', v_reservation.seller_proceeds::text,
      'entryType', 'credit',
      'metadata', jsonb_build_object(
        'lineRole', 'marketplace_seller_proceeds_credit',
        'orderKey', v_order.public_id
      )
    )
  );
  if v_reservation.fee_amount > 0 then
    v_distribution_lines := v_distribution_lines || jsonb_build_array(
      jsonb_build_object(
        'bankAccountId', v_reservation.fee_bank_account_id,
        'amount', v_reservation.fee_amount::text,
        'entryType', 'credit',
        'metadata', jsonb_build_object(
          'lineRole', 'marketplace_fee_revenue_credit',
          'orderKey', v_order.public_id
        )
      )
    );
  end if;
  if v_reservation.tax_amount > 0 then
    v_distribution_lines := v_distribution_lines || jsonb_build_array(
      jsonb_build_object(
        'bankAccountId', v_reservation.tax_bank_account_id,
        'amount', v_reservation.tax_amount::text,
        'entryType', 'credit',
        'metadata', jsonb_build_object(
          'lineRole', 'marketplace_tax_payable_credit',
          'orderKey', v_order.public_id
        )
      )
    );
  end if;

  v_distribution_request_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'marketplace-distribution-v1',
    'gameSessionId', p_game_session_id,
    'orderKey', v_order.public_id,
    'reservationKey', v_reservation.public_id,
    'fundingReceiptKey', v_funding_receipt.public_key,
    'currencyCode', v_reservation.currency_code,
    'buyerTotal', v_reservation.buyer_total::text,
    'sellerProceeds', v_reservation.seller_proceeds::text,
    'feeAmount', v_reservation.fee_amount::text,
    'taxAmount', v_reservation.tax_amount::text
  ));

  select *
  into strict v_distribution
  from private.post_bank_transaction_v1(
    p_game_session_id,
    'marketplace_distribution',
    'marketplace',
    'marketplace_purchase_distribution',
    v_order.id,
    'marketplace-distribution:' || substr(v_request_hash, 1, 64),
    v_distribution_request_hash,
    v_distribution_lines,
    'player',
    p_buyer_player_id,
    jsonb_build_object(
      'orderKey', v_order.public_id,
      'reservationKey', v_reservation.public_id,
      'fundingReceiptKey', v_funding_receipt.public_key
    ),
    '{}'::uuid[]
  );

  perform public.marketplace_transition_listing_reservation_v1(
    p_game_session_id,
    v_reservation.seller_player_id,
    v_listing.id,
    v_listing.inventory_holding_id,
    v_reservation.quantity,
    'consume',
    false
  );

  update public.inventory_holdings
  set quantity_owned = quantity_owned - v_reservation.quantity,
      updated_at = statement_timestamp()
  where id = v_seller_holding.id
    and quantity_owned >= v_reservation.quantity;
  if not found then
    raise exception 'MARKETPLACE_RESERVATION_QUANTITY_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  insert into public.inventory_holdings(
    game_session_id,
    player_id,
    store_item_id,
    quantity_owned,
    quantity_reserved
  ) values (
    p_game_session_id,
    p_buyer_player_id,
    v_listing.store_item_id,
    v_reservation.quantity,
    0
  )
  on conflict on constraint inventory_holdings_scope_unique do update
    set quantity_owned = public.inventory_holdings.quantity_owned
      + excluded.quantity_owned,
        updated_at = statement_timestamp()
  returning * into v_buyer_holding;

  insert into public.inventory_events(
    game_session_id,
    player_id,
    store_item_id,
    quantity_delta,
    event_type,
    source_domain,
    source_action,
    source_id,
    metadata
  ) values
    (
      p_game_session_id,
      v_reservation.seller_player_id,
      v_listing.store_item_id,
      -v_reservation.quantity,
      'MARKETPLACE_SOLD',
      'marketplace',
      'marketplace_funded_sale',
      v_order.id,
      jsonb_build_object(
        'listingKey', v_listing.public_id,
        'orderKey', v_order.public_id,
        'reservationKey', v_reservation.public_id
      )
    ),
    (
      p_game_session_id,
      p_buyer_player_id,
      v_listing.store_item_id,
      v_reservation.quantity,
      'MARKETPLACE_PURCHASED',
      'marketplace',
      'marketplace_funded_purchase',
      v_order.id,
      jsonb_build_object(
        'listingKey', v_listing.public_id,
        'orderKey', v_order.public_id,
        'reservationKey', v_reservation.public_id
      )
    );

  insert into public.marketplace_financial_postings(
    game_session_id,
    order_id,
    posting_group,
    posting_type,
    player_id,
    amount,
    currency_code
  ) values
    (
      p_game_session_id,
      v_order.id,
      'funded_settlement',
      'buyer_commercial_debit',
      p_buyer_player_id,
      -v_reservation.buyer_total,
      v_reservation.currency_code
    ),
    (
      p_game_session_id,
      v_order.id,
      'funded_settlement',
      'seller_credit',
      v_reservation.seller_player_id,
      v_reservation.seller_proceeds,
      v_reservation.currency_code
    ),
    (
      p_game_session_id,
      v_order.id,
      'funded_settlement',
      'fee_credit',
      null,
      v_reservation.fee_amount,
      v_reservation.currency_code
    ),
    (
      p_game_session_id,
      v_order.id,
      'funded_settlement',
      'tax_credit',
      null,
      v_reservation.tax_amount,
      v_reservation.currency_code
    );

  if (
    select round(sum(posting_row.amount), 4)
    from public.marketplace_financial_postings as posting_row
    where posting_row.order_id = v_order.id
      and posting_row.posting_group = 'funded_settlement'
  ) <> 0 then
    raise exception 'MARKETPLACE_POSTING_IMBALANCE' using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config('app.marketplace_funding_write_v1', 'on', true);

  update public.marketplace_orders
  set status = 'completed',
      version = version + 1,
      funding_receipt_id = v_funding_receipt.id,
      funding_bank_transaction_id = v_funding_receipt.bank_transaction_id,
      distribution_bank_transaction_id = v_distribution.bank_transaction_id,
      settlement_clearing_account_id = v_reservation.settlement_clearing_account_id,
      seller_bank_account_id = v_reservation.seller_bank_account_id,
      fee_bank_account_id = v_reservation.fee_bank_account_id,
      tax_bank_account_id = v_reservation.tax_bank_account_id,
      settlement_idempotency_key = v_idempotency_key,
      settlement_request_hash = v_request_hash,
      completed_at = v_now,
      updated_at = statement_timestamp()
  where id = v_order.id
  returning * into v_order;

  update public.marketplace_purchase_reservations
  set status = 'settled',
      version = version + 1,
      settled_at = v_now,
      updated_at = statement_timestamp()
  where id = v_reservation.id
  returning * into v_reservation;

  insert into public.marketplace_audit_events(
    game_session_id,
    listing_id,
    reservation_id,
    order_id,
    actor_type,
    actor_id,
    action,
    metadata
  ) values (
    p_game_session_id,
    v_listing.id,
    v_reservation.id,
    v_order.id,
    'player',
    p_buyer_player_id,
    'funded_order_settled',
    jsonb_build_object(
      'orderKey', v_order.public_id,
      'quantity', v_order.quantity,
      'buyerTotal', v_order.buyer_total,
      'sellerProceeds', v_order.seller_proceeds,
      'feeAmount', v_order.fee_amount,
      'taxAmount', v_order.tax_amount,
      'fundingReceiptKey', v_funding_receipt.public_key,
      'distributionBankTransactionKey', v_distribution.bank_transaction_public_key
    )
  );

  select balance_row.balance
  into strict v_clearing_balance_after
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.bank_account_id = v_reservation.settlement_clearing_account_id;
  if v_clearing_balance_after is distinct from v_clearing_balance_before then
    raise exception 'MARKETPLACE_SETTLEMENT_CLEARING_RESIDUE'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config(
    'app.marketplace_funding_write_v1',
    v_prior_write_context,
    true
  );

  return private.read_marketplace_funding_order_result_v1(v_order.id, false);
end;
$function$;

revoke all on function public.settle_marketplace_funding_v1(
  uuid, uuid, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.settle_marketplace_funding_v1(
  uuid, uuid, text, text, timestamptz
) to service_role;

commit;
