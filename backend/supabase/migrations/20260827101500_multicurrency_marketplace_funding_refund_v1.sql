-- Econovaria Business V2 Phase 10A.4C2: exact funded-order reversal.
--
-- A funded buyer refund reverses the original Marketplace distribution and the
-- exact original C0 Banking transaction. It never applies a current fixing or
-- creates a new reusable listing-currency windfall.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

create or replace function private.reverse_purchase_funding_receipt_v1(
  p_game_session_id uuid,
  p_funding_receipt_id uuid,
  p_source_domain text,
  p_source_action text,
  p_source_id uuid,
  p_idempotency_key text,
  p_created_by_type text,
  p_created_by_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  bank_transaction_id uuid,
  bank_transaction_public_key text,
  replayed boolean,
  posted_at timestamptz,
  line_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_receipt public.purchase_funding_receipts%rowtype;
  v_original_transaction public.bank_transactions%rowtype;
  v_lines jsonb;
  v_request_hash text;
  v_result record;
begin
  if p_game_session_id is null
     or p_funding_receipt_id is null
     or length(btrim(coalesce(p_source_domain, ''))) not between 1 and 120
     or length(btrim(coalesce(p_source_action, ''))) not between 1 and 160
     or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 240
     or lower(btrim(coalesce(p_created_by_type, '')))
       not in ('staff_user', 'player', 'system')
     or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
  then
    raise exception 'PURCHASE_FUNDING_REVERSAL_REQUEST_INVALID'
      using errcode = '22023';
  end if;

  select receipt_row.*
  into v_receipt
  from public.purchase_funding_receipts as receipt_row
  where receipt_row.game_session_id = p_game_session_id
    and receipt_row.id = p_funding_receipt_id;
  if not found then
    raise exception 'PURCHASE_FUNDING_RECEIPT_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select transaction_row.*
  into v_original_transaction
  from public.bank_transactions as transaction_row
  where transaction_row.game_session_id = p_game_session_id
    and transaction_row.id = v_receipt.bank_transaction_id
    and transaction_row.posting_version = 'balanced_v2'
    and transaction_row.status = 'posted';
  if not found then
    raise exception 'PURCHASE_FUNDING_TRANSACTION_INVALID'
      using errcode = 'P0001';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'bankAccountId', ledger_row.bank_account_id,
      'amount', (-ledger_row.amount)::text,
      'entryType', case
        when ledger_row.amount > 0 then 'debit'
        else 'credit'
      end,
      'metadata', jsonb_build_object(
        'lineRole', 'purchase_funding_exact_reversal',
        'originalFundingReceiptKey', v_receipt.public_key,
        'originalBankTransactionKey', v_original_transaction.public_key,
        'originalLineNumber', ledger_row.line_number,
        'originalLineRole', coalesce(
          ledger_row.line_metadata ->> 'lineRole',
          'unspecified'
        )
      )
    )
    order by ledger_row.line_number
  )
  into v_lines
  from public.ledger_entries as ledger_row
  where ledger_row.game_session_id = p_game_session_id
    and ledger_row.bank_transaction_id = v_original_transaction.id;

  if jsonb_typeof(v_lines) <> 'array'
     or jsonb_array_length(v_lines) not between 2 and 64
  then
    raise exception 'PURCHASE_FUNDING_REVERSAL_LINES_INVALID'
      using errcode = 'P0001';
  end if;

  v_request_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'purchase-funding-exact-reversal-v1',
    'gameSessionId', p_game_session_id,
    'fundingReceiptKey', v_receipt.public_key,
    'originalBankTransactionKey', v_original_transaction.public_key,
    'sourceDomain', btrim(p_source_domain),
    'sourceAction', btrim(p_source_action),
    'sourceId', p_source_id,
    'lines', v_lines
  ));

  select *
  into strict v_result
  from private.post_bank_transaction_v1(
    p_game_session_id,
    'purchase_funding_reversal',
    btrim(p_source_domain),
    btrim(p_source_action),
    p_source_id,
    btrim(p_idempotency_key),
    v_request_hash,
    v_lines,
    lower(btrim(p_created_by_type)),
    p_created_by_id,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'fundingReceiptKey', v_receipt.public_key,
      'originalBankTransactionKey', v_original_transaction.public_key,
      'reversalAuthority', 'exact_opposite_journal_v1'
    ),
    '{}'::uuid[]
  );

  return query select
    v_result.bank_transaction_id::uuid,
    v_result.bank_transaction_public_key::text,
    v_result.replayed::boolean,
    v_result.posted_at::timestamptz,
    v_result.line_count::integer;
end;
$function$;

revoke all on function private.reverse_purchase_funding_receipt_v1(
  uuid, uuid, text, text, uuid, text, text, uuid, jsonb
) from public, anon, authenticated, service_role;

create or replace function private.read_marketplace_funding_refund_result_v1(
  p_refund_id uuid,
  p_replayed boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'refundKey', refund_row.public_key,
    'orderKey', order_row.public_id,
    'disputeKey', dispute_row.public_id,
    'status', order_row.status,
    'currencyCode', order_row.currency_code,
    'buyerTotal', order_row.buyer_total::text,
    'sellerProceeds', order_row.seller_proceeds::text,
    'feeAmount', order_row.fee_amount::text,
    'taxAmount', order_row.tax_amount::text,
    'distributionReversalBankTransactionKey', distribution_row.public_key,
    'fundingReversalBankTransactionKey', funding_row.public_key,
    'refundedAt', order_row.refunded_at,
    'replayed', p_replayed
  )
  from public.marketplace_funding_refunds as refund_row
  join public.marketplace_orders as order_row
    on order_row.id = refund_row.order_id
   and order_row.game_session_id = refund_row.game_session_id
  join public.marketplace_disputes as dispute_row
    on dispute_row.id = refund_row.dispute_id
   and dispute_row.game_session_id = refund_row.game_session_id
  join public.bank_transactions as distribution_row
    on distribution_row.id = refund_row.distribution_reversal_transaction_id
   and distribution_row.game_session_id = refund_row.game_session_id
  join public.bank_transactions as funding_row
    on funding_row.id = refund_row.funding_reversal_transaction_id
   and funding_row.game_session_id = refund_row.game_session_id
  where refund_row.id = p_refund_id;
$function$;

revoke all on function private.read_marketplace_funding_refund_result_v1(uuid, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.refund_marketplace_funding_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_dispute_key text,
  p_reason text,
  p_expected_version bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_dispute_key text := lower(btrim(coalesce(p_dispute_key, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_request_hash text;
  v_existing public.marketplace_funding_refunds%rowtype;
  v_dispute public.marketplace_disputes%rowtype;
  v_order public.marketplace_orders%rowtype;
  v_buyer_holding public.inventory_holdings%rowtype;
  v_seller_holding public.inventory_holdings%rowtype;
  v_distribution_lines jsonb;
  v_distribution_hash text;
  v_distribution record;
  v_funding_reversal record;
  v_clearing_before numeric(38, 18);
  v_clearing_after numeric(38, 18);
  v_refund public.marketplace_funding_refunds%rowtype;
  v_evidence_hash text;
begin
  if p_game_session_id is null
     or p_staff_user_id is null
     or v_dispute_key !~ '^dsp_[0-9a-f]{32}$'
     or length(v_reason) not between 1 and 1000
     or p_expected_version is null
     or p_expected_version < 1
     or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'
  then
    raise exception 'MARKETPLACE_FUNDED_REFUND_REQUEST_INVALID'
      using errcode = '22023';
  end if;

  perform 1
  from public.staff_users as staff_row
  where staff_row.id = p_staff_user_id;
  if not found then
    raise exception 'MARKETPLACE_STAFF_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_request_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'marketplace-funded-refund-v1',
    'gameSessionId', p_game_session_id,
    'staffUserId', p_staff_user_id,
    'disputeKey', v_dispute_key,
    'reason', v_reason,
    'expectedVersion', p_expected_version
  ));

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    ':',
    'marketplace_funded_refund_v1',
    p_game_session_id::text,
    v_dispute_key,
    v_idempotency_key
  ), 0));

  select refund_row.*
  into v_existing
  from public.marketplace_funding_refunds as refund_row
  where refund_row.game_session_id = p_game_session_id
    and refund_row.idempotency_key = v_idempotency_key;
  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception 'MARKETPLACE_FUNDED_REFUND_IDEMPOTENCY_CONFLICT'
        using errcode = 'P0001';
    end if;
    return private.read_marketplace_funding_refund_result_v1(
      v_existing.id,
      true
    );
  end if;

  select dispute_row.*
  into v_dispute
  from public.marketplace_disputes as dispute_row
  where dispute_row.game_session_id = p_game_session_id
    and dispute_row.public_id = v_dispute_key
  for update;
  if not found then
    raise exception 'MARKETPLACE_DISPUTE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_dispute.version <> p_expected_version then
    raise exception 'MARKETPLACE_STALE_VERSION' using errcode = 'P0001';
  end if;
  if v_dispute.status <> 'open' then
    raise exception 'MARKETPLACE_DISPUTE_NOT_OPEN' using errcode = 'P0001';
  end if;

  select order_row.*
  into v_order
  from public.marketplace_orders as order_row
  where order_row.game_session_id = p_game_session_id
    and order_row.id = v_dispute.order_id
  for update;
  if not found then
    raise exception 'MARKETPLACE_ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_order.status <> 'disputed'
     or v_order.funding_receipt_id is null
     or v_order.distribution_bank_transaction_id is null
  then
    raise exception 'MARKETPLACE_FUNDED_REFUND_ORDER_INVALID'
      using errcode = 'P0001';
  end if;

  select holding_row.*
  into v_buyer_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.player_id = v_order.buyer_player_id
    and holding_row.store_item_id = v_order.store_item_id
  for update;
  if not found then
    raise exception 'MARKETPLACE_REFUND_ITEM_UNAVAILABLE' using errcode = 'P0001';
  end if;
  perform public.marketplace_assert_refund_inventory_available_v1(
    p_game_session_id,
    v_order.buyer_player_id,
    v_buyer_holding.id,
    v_order.quantity
  );

  select holding_row.*
  into v_seller_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.player_id = v_order.seller_player_id
    and holding_row.store_item_id = v_order.store_item_id
  for update;

  select balance_row.balance
  into strict v_clearing_before
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.bank_account_id = v_order.settlement_clearing_account_id;

  v_distribution_lines := jsonb_build_array(
    jsonb_build_object(
      'bankAccountId', v_order.seller_bank_account_id,
      'amount', (-v_order.seller_proceeds)::text,
      'entryType', 'debit',
      'metadata', jsonb_build_object(
        'lineRole', 'marketplace_refund_seller_debit',
        'orderKey', v_order.public_id,
        'disputeKey', v_dispute.public_id
      )
    ),
    jsonb_build_object(
      'bankAccountId', v_order.settlement_clearing_account_id,
      'amount', v_order.buyer_total::text,
      'entryType', 'credit',
      'metadata', jsonb_build_object(
        'lineRole', 'marketplace_refund_clearing_credit',
        'orderKey', v_order.public_id,
        'disputeKey', v_dispute.public_id
      )
    )
  );
  if v_order.fee_amount > 0 then
    v_distribution_lines := v_distribution_lines || jsonb_build_array(
      jsonb_build_object(
        'bankAccountId', v_order.fee_bank_account_id,
        'amount', (-v_order.fee_amount)::text,
        'entryType', 'debit',
        'metadata', jsonb_build_object(
          'lineRole', 'marketplace_refund_fee_debit',
          'orderKey', v_order.public_id
        )
      )
    );
  end if;
  if v_order.tax_amount > 0 then
    v_distribution_lines := v_distribution_lines || jsonb_build_array(
      jsonb_build_object(
        'bankAccountId', v_order.tax_bank_account_id,
        'amount', (-v_order.tax_amount)::text,
        'entryType', 'debit',
        'metadata', jsonb_build_object(
          'lineRole', 'marketplace_refund_tax_debit',
          'orderKey', v_order.public_id
        )
      )
    );
  end if;

  v_distribution_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'marketplace-distribution-reversal-v1',
    'gameSessionId', p_game_session_id,
    'orderKey', v_order.public_id,
    'disputeKey', v_dispute.public_id,
    'buyerTotal', v_order.buyer_total::text,
    'sellerProceeds', v_order.seller_proceeds::text,
    'feeAmount', v_order.fee_amount::text,
    'taxAmount', v_order.tax_amount::text,
    'currencyCode', v_order.currency_code
  ));

  select *
  into strict v_distribution
  from private.post_bank_transaction_v1(
    p_game_session_id,
    'marketplace_distribution_reversal',
    'marketplace',
    'marketplace_refund_distribution',
    v_order.id,
    'marketplace-refund-distribution:' || substr(v_request_hash, 1, 64),
    v_distribution_hash,
    v_distribution_lines,
    'staff_user',
    p_staff_user_id,
    jsonb_build_object(
      'orderKey', v_order.public_id,
      'disputeKey', v_dispute.public_id,
      'reversalAuthority', 'original_commercial_distribution_v1'
    ),
    '{}'::uuid[]
  );

  select *
  into strict v_funding_reversal
  from private.reverse_purchase_funding_receipt_v1(
    p_game_session_id,
    v_order.funding_receipt_id,
    'marketplace',
    'marketplace_refund_funding_reversal',
    v_order.id,
    'marketplace-refund-funding:' || substr(v_request_hash, 1, 64),
    'staff_user',
    p_staff_user_id,
    jsonb_build_object(
      'orderKey', v_order.public_id,
      'disputeKey', v_dispute.public_id
    )
  );

  update public.inventory_holdings
  set quantity_owned = quantity_owned - v_order.quantity,
      updated_at = statement_timestamp()
  where id = v_buyer_holding.id
    and quantity_owned - quantity_reserved >= v_order.quantity;
  if not found then
    raise exception 'MARKETPLACE_REFUND_ITEM_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if v_seller_holding.id is null then
    insert into public.inventory_holdings(
      game_session_id,
      player_id,
      store_item_id,
      quantity_owned,
      quantity_reserved
    ) values (
      p_game_session_id,
      v_order.seller_player_id,
      v_order.store_item_id,
      v_order.quantity,
      0
    )
    returning * into v_seller_holding;
  else
    update public.inventory_holdings
    set quantity_owned = quantity_owned + v_order.quantity,
        updated_at = statement_timestamp()
    where id = v_seller_holding.id
    returning * into v_seller_holding;
  end if;

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
      v_order.buyer_player_id,
      v_order.store_item_id,
      -v_order.quantity,
      'MARKETPLACE_REFUNDED',
      'marketplace',
      'marketplace_funded_refund',
      v_order.id,
      jsonb_build_object(
        'orderKey', v_order.public_id,
        'disputeKey', v_dispute.public_id
      )
    ),
    (
      p_game_session_id,
      v_order.seller_player_id,
      v_order.store_item_id,
      v_order.quantity,
      'MARKETPLACE_RETURNED',
      'marketplace',
      'marketplace_funded_refund',
      v_order.id,
      jsonb_build_object(
        'orderKey', v_order.public_id,
        'disputeKey', v_dispute.public_id
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
      'funded_refund',
      'buyer_commercial_credit',
      v_order.buyer_player_id,
      v_order.buyer_total,
      v_order.currency_code
    ),
    (
      p_game_session_id,
      v_order.id,
      'funded_refund',
      'seller_debit',
      v_order.seller_player_id,
      -v_order.seller_proceeds,
      v_order.currency_code
    ),
    (
      p_game_session_id,
      v_order.id,
      'funded_refund',
      'fee_debit',
      null,
      -v_order.fee_amount,
      v_order.currency_code
    ),
    (
      p_game_session_id,
      v_order.id,
      'funded_refund',
      'tax_debit',
      null,
      -v_order.tax_amount,
      v_order.currency_code
    );

  if (
    select round(sum(posting_row.amount), 4)
    from public.marketplace_financial_postings as posting_row
    where posting_row.order_id = v_order.id
      and posting_row.posting_group = 'funded_refund'
  ) <> 0 then
    raise exception 'MARKETPLACE_POSTING_IMBALANCE' using errcode = 'P0001';
  end if;

  update public.marketplace_orders
  set status = 'refunded',
      version = version + 1,
      refunded_at = clock_timestamp(),
      updated_at = statement_timestamp()
  where id = v_order.id
  returning * into v_order;

  update public.marketplace_disputes
  set status = 'resolved_buyer',
      version = version + 1,
      resolution_note = v_reason,
      resolved_by_staff_user_id = p_staff_user_id,
      resolved_at = clock_timestamp(),
      updated_at = statement_timestamp()
  where id = v_dispute.id
  returning * into v_dispute;

  v_evidence_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'marketplace-funded-refund-evidence-v1',
    'orderKey', v_order.public_id,
    'disputeKey', v_dispute.public_id,
    'fundingReceiptId', v_order.funding_receipt_id,
    'distributionReversalTransactionKey',
      v_distribution.bank_transaction_public_key,
    'fundingReversalTransactionKey',
      v_funding_reversal.bank_transaction_public_key,
    'buyerTotal', v_order.buyer_total::text,
    'currencyCode', v_order.currency_code
  ));

  insert into public.marketplace_funding_refunds(
    game_session_id,
    order_id,
    dispute_id,
    funding_receipt_id,
    distribution_reversal_transaction_id,
    funding_reversal_transaction_id,
    idempotency_key,
    request_hash,
    evidence_hash
  ) values (
    p_game_session_id,
    v_order.id,
    v_dispute.id,
    v_order.funding_receipt_id,
    v_distribution.bank_transaction_id,
    v_funding_reversal.bank_transaction_id,
    v_idempotency_key,
    v_request_hash,
    v_evidence_hash
  )
  returning * into v_refund;

  insert into public.marketplace_action_receipts(
    game_session_id,
    actor_type,
    actor_id,
    action,
    idempotency_key,
    request_fingerprint,
    target_public_id,
    result
  ) values (
    p_game_session_id,
    'staff_user',
    p_staff_user_id,
    'admin_refund_buyer',
    v_idempotency_key,
    v_request_hash,
    v_dispute.public_id,
    jsonb_build_object(
      'targetType', 'dispute',
      'status', v_dispute.status,
      'version', v_dispute.version,
      'updatedAt', v_dispute.updated_at,
      'refundKey', v_refund.public_key
    )
  );

  insert into public.marketplace_audit_events(
    game_session_id,
    order_id,
    dispute_id,
    actor_type,
    actor_id,
    action,
    metadata
  ) values (
    p_game_session_id,
    v_order.id,
    v_dispute.id,
    'staff_user',
    p_staff_user_id,
    'funded_dispute_refund_buyer',
    jsonb_build_object(
      'refundKey', v_refund.public_key,
      'distributionReversalBankTransactionKey',
        v_distribution.bank_transaction_public_key,
      'fundingReversalBankTransactionKey',
        v_funding_reversal.bank_transaction_public_key
    )
  );

  select balance_row.balance
  into strict v_clearing_after
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.bank_account_id = v_order.settlement_clearing_account_id;
  if v_clearing_after is distinct from v_clearing_before then
    raise exception 'MARKETPLACE_REFUND_CLEARING_RESIDUE'
      using errcode = 'P0001';
  end if;

  return private.read_marketplace_funding_refund_result_v1(
    v_refund.id,
    false
  );
end;
$function$;

revoke all on function public.refund_marketplace_funding_v1(
  uuid, uuid, text, text, bigint, text
) from public, anon, authenticated;
grant execute on function public.refund_marketplace_funding_v1(
  uuid, uuid, text, text, bigint, text
) to service_role;

-- Preserve the existing Admin surface while routing funded buyer refunds through
-- the exact C2 reversal authority. All legacy orders and non-refund actions keep
-- their retained behavior.
alter function public.review_marketplace_admin_v2(
  uuid, uuid, text, text, text, bigint, text
) rename to review_marketplace_admin_pre_c2_v2;

create or replace function public.review_marketplace_admin_v2(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_target_key text,
  p_action text,
  p_reason text,
  p_expected_version bigint,
  p_idempotency_key text
)
returns table (
  outcome text,
  target_key text,
  target_type text,
  status text,
  version bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_target_key text := lower(btrim(coalesce(p_target_key, '')));
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_order_funded boolean := false;
  v_refund jsonb;
begin
  if v_target_key ~ '^dsp_[0-9a-f]{32}$'
     and v_action = 'refund_buyer'
  then
    select order_row.funding_receipt_id is not null
    into v_order_funded
    from public.marketplace_disputes as dispute_row
    join public.marketplace_orders as order_row
      on order_row.id = dispute_row.order_id
     and order_row.game_session_id = dispute_row.game_session_id
    where dispute_row.game_session_id = p_game_session_id
      and dispute_row.public_id = v_target_key;

    if coalesce(v_order_funded, false) then
      v_refund := public.refund_marketplace_funding_v1(
        p_game_session_id,
        p_staff_user_id,
        v_target_key,
        p_reason,
        p_expected_version,
        p_idempotency_key
      );
      return query select
        case when coalesce((v_refund ->> 'replayed')::boolean, false)
          then 'replayed' else 'applied' end,
        v_target_key,
        'dispute',
        'resolved_buyer',
        p_expected_version + 1,
        (v_refund ->> 'refundedAt')::timestamptz;
      return;
    end if;
  end if;

  return query
  select *
  from public.review_marketplace_admin_pre_c2_v2(
    p_game_session_id,
    p_staff_user_id,
    p_target_key,
    p_action,
    p_reason,
    p_expected_version,
    p_idempotency_key
  );
end;
$function$;

revoke all on function public.review_marketplace_admin_v2(
  uuid, uuid, text, text, text, bigint, text
) from public, anon, authenticated;
grant execute on function public.review_marketplace_admin_v2(
  uuid, uuid, text, text, text, bigint, text
) to service_role;

commit;
