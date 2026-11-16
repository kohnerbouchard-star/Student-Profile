-- Econovaria Business V2 Phase 10A.4C1: atomic Store/C0 settlement.
--
-- Store remains owner of commercial identity, stock, inventory delivery, cost
-- basis, and receipts. C0 remains owner of source-account funding, retail FX,
-- balanced Banking composition, target credit, and funding receipts.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

create or replace function private.read_seeded_store_funding_receipt_result_v1(
  p_purchase_id uuid,
  p_replayed boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'receiptKey', purchase_row.public_receipt_key,
    'quoteKey', quote_row.public_quote_key,
    'itemKey', item_row.item_key,
    'itemName', item_row.name,
    'quantity', purchase_row.quantity,
    'finalUnitPrice', purchase_row.final_unit_price,
    'finalTotalPrice', purchase_row.final_total_price,
    'currencyCode', purchase_row.currency_code,
    'inventoryQuantityOwned', coalesce(holding_row.quantity_owned, 0),
    'inventoryTransactionKey', inventory_transaction.public_key,
    'completedAt', purchase_row.created_at,
    'alreadyCompleted', p_replayed,
    'fundingReceipt', private.purchase_funding_receipt_public_json_v1(
      purchase_row.funding_receipt_id
    )
  )
  from public.store_purchases as purchase_row
  join public.store_purchase_quotes as quote_row
    on quote_row.id = purchase_row.quote_id
   and quote_row.game_session_id = purchase_row.game_session_id
  join public.store_items as item_row
    on item_row.id = purchase_row.store_item_id
   and item_row.game_session_id = purchase_row.game_session_id
  join public.inventory_transactions as inventory_transaction
    on inventory_transaction.id = purchase_row.inventory_transaction_id
   and inventory_transaction.game_session_id = purchase_row.game_session_id
  left join public.inventory_accounts as buyer_account
    on buyer_account.game_session_id = purchase_row.game_session_id
   and buyer_account.party_id = (
     select party_row.id
     from public.economic_parties as party_row
     where party_row.game_session_id = purchase_row.game_session_id
       and party_row.party_kind = 'player'
       and party_row.player_id = purchase_row.player_id
     limit 1
   )
   and buyer_account.account_kind = 'personal'
   and buyer_account.location_key is null
  left join public.inventory_holdings as holding_row
    on holding_row.game_session_id = purchase_row.game_session_id
   and holding_row.inventory_account_id = buyer_account.id
   and holding_row.game_item_id = item_row.game_item_id
  where purchase_row.id = p_purchase_id
    and purchase_row.status = 'COMPLETED'
    and purchase_row.funding_receipt_id is not null;
$function$;

revoke all on function private.read_seeded_store_funding_receipt_result_v1(uuid, boolean)
  from public, anon, authenticated, service_role;

create or replace function economy_private.read_store_offer_funding_receipt_result_v1(
  p_receipt_id uuid,
  p_replayed boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, economy_private, pg_temp
as $function$
  select economy_private.read_store_offer_purchase_receipt_result_v2(
    receipt_row.id,
    p_replayed
  ) || jsonb_build_object(
    'fundingReceipt', private.purchase_funding_receipt_public_json_v1(
      receipt_row.funding_receipt_id
    )
  )
  from public.store_offer_purchase_receipts as receipt_row
  where receipt_row.id = p_receipt_id
    and receipt_row.funding_receipt_id is not null;
$function$;

revoke all on function economy_private.read_store_offer_funding_receipt_result_v1(uuid, boolean)
  from public, anon, authenticated, service_role;

-- Validate both retained same-currency receipts and new C1 funded receipts.
create or replace function economy_private.validate_store_offer_purchase_receipt_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, economy_private, pg_temp
as $function$
begin
  if new.funding_receipt_id is not null then
    if not exists (
      select 1
      from public.purchase_funding_receipts as funding_row
      join public.store_offer_purchase_quotes as quote_row
        on quote_row.game_session_id = funding_row.game_session_id
       and quote_row.id = new.quote_id
       and quote_row.funding_quote_id = funding_row.quote_id
       and quote_row.funding_context_hash = funding_row.funding_context_hash
       and quote_row.target_bank_account_id = funding_row.target_account_id
      where funding_row.game_session_id = new.game_session_id
        and funding_row.id = new.funding_receipt_id
        and funding_row.player_id = new.buyer_player_id
        and funding_row.bank_transaction_id = new.bank_transaction_id
        and funding_row.target_account_id = new.target_bank_account_id
        and funding_row.funding_context_kind = 'store.business-offer'
        and funding_row.funding_context_key = new.quote_key
        and funding_row.target_currency_code = new.currency_code
        and funding_row.target_amount = new.total_price
        and funding_row.source_domain = 'store'
        and funding_row.source_action = 'business_offer_purchase_funding'
        and funding_row.source_id = new.id
    ) then
      raise exception 'STORE_OFFER_PURCHASE_RECEIPT_FUNDING_INVALID' using errcode = 'P0001';
    end if;

    if not exists (
      select 1
      from public.bank_accounts as account_row
      join public.economic_parties as party_row
        on party_row.id = account_row.party_id
       and party_row.game_session_id = account_row.game_session_id
      where account_row.game_session_id = new.game_session_id
        and account_row.id = new.target_bank_account_id
        and account_row.account_kind = 'checking'
        and account_row.currency_code = new.currency_code
        and account_row.status = 'active'
        and party_row.party_kind = 'business'
        and party_row.business_id = new.business_id
        and party_row.status = 'active'
    ) then
      raise exception 'STORE_OFFER_PURCHASE_RECEIPT_TARGET_INVALID' using errcode = 'P0001';
    end if;

    if not exists (
      select 1
      from public.ledger_entries as entry_row
      where entry_row.game_session_id = new.game_session_id
        and entry_row.bank_transaction_id = new.bank_transaction_id
        and entry_row.bank_account_id = new.target_bank_account_id
        and entry_row.amount = new.total_price
        and entry_row.currency_code = new.currency_code
        and entry_row.entry_type = 'credit'
        and entry_row.line_metadata ->> 'lineRole' = 'purchase_funding_recipient_credit'
    ) then
      raise exception 'STORE_OFFER_PURCHASE_RECEIPT_TARGET_CREDIT_INVALID' using errcode = 'P0001';
    end if;
  else
    if not exists (
      select 1
      from public.ledger_entries as entry_row
      where entry_row.game_session_id = new.game_session_id
        and entry_row.id = new.buyer_debit_ledger_entry_id
        and entry_row.player_id = new.buyer_player_id
        and entry_row.business_id is null
        and entry_row.account_type = 'checking'
        and entry_row.amount = -new.buyer_debit
        and entry_row.currency_code = new.currency_code
        and entry_row.entry_type = 'debit'
        and entry_row.source_domain = 'store'
        and entry_row.source_action = 'business_offer_purchase_debit'
        and entry_row.source_id = new.id
    ) then
      raise exception 'STORE_OFFER_PURCHASE_RECEIPT_BUYER_DEBIT_INVALID' using errcode = 'P0001';
    end if;

    if not exists (
      select 1
      from public.ledger_entries as entry_row
      where entry_row.game_session_id = new.game_session_id
        and entry_row.id = new.business_credit_ledger_entry_id
        and entry_row.business_id = new.business_id
        and entry_row.account_type = 'business:' || new.business_key
        and entry_row.amount = new.business_credit
        and entry_row.currency_code = new.currency_code
        and entry_row.entry_type = 'credit'
        and entry_row.source_domain = 'store'
        and entry_row.source_action = 'business_offer_purchase_credit'
        and entry_row.source_id = new.id
    ) then
      raise exception 'STORE_OFFER_PURCHASE_RECEIPT_BUSINESS_CREDIT_INVALID' using errcode = 'P0001';
    end if;
  end if;

  if not exists (
    select 1
    from public.inventory_transactions as transaction_row
    where transaction_row.game_session_id = new.game_session_id
      and transaction_row.id = new.inventory_transaction_id
      and transaction_row.public_key = new.inventory_transaction_key
      and transaction_row.status = 'committed'
      and transaction_row.transaction_type = 'purchase'
      and transaction_row.source_domain = 'store'
      and transaction_row.source_action = 'business_offer_purchase'
      and transaction_row.source_id = new.id
  ) then
    raise exception 'STORE_OFFER_PURCHASE_RECEIPT_INVENTORY_TRANSACTION_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.inventory_transaction_lines as line_row
    where line_row.game_session_id = new.game_session_id
      and line_row.transaction_id = new.inventory_transaction_id
    group by line_row.game_session_id, line_row.transaction_id
    having count(*) = 2
      and count(*) filter (where
        line_row.inventory_account_id = new.listing_inventory_account_id
        and line_row.game_item_id = new.game_item_id
        and line_row.quantity_delta = -new.quantity
        and line_row.reservation_delta = 0
        and line_row.unit_cost = new.source_unit_cost
        and line_row.currency_code = new.cost_currency_code
        and line_row.metadata ->> 'receiptKey' = new.public_key
      ) = 1
      and count(*) filter (where
        line_row.inventory_account_id = new.buyer_inventory_account_id
        and line_row.game_item_id = new.game_item_id
        and line_row.quantity_delta = new.quantity
        and line_row.reservation_delta = 0
        and line_row.unit_cost = case
          when new.funding_receipt_id is null then new.source_unit_cost
          else new.unit_price
        end
        and line_row.currency_code = new.currency_code
        and line_row.metadata ->> 'receiptKey' = new.public_key
      ) = 1
  ) then
    raise exception 'STORE_OFFER_PURCHASE_RECEIPT_INVENTORY_LINES_INVALID' using errcode = 'P0001';
  end if;

  return new;
end
$function$;

create or replace function public.settle_seeded_store_funding_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_quote_key text,
  p_idempotency_key text,
  p_client_submitted_at timestamptz default null,
  p_request_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, economy_private, extensions, pg_temp
as $function$
declare
  v_quote_key text := lower(btrim(coalesce(p_quote_key, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_request_hash text;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_purchase public.store_purchases%rowtype;
  v_quote_preview public.store_purchase_quotes%rowtype;
  v_quote public.store_purchase_quotes%rowtype;
  v_item public.store_items%rowtype;
  v_game_item public.game_items%rowtype;
  v_stock_account public.inventory_accounts%rowtype;
  v_stock_holding public.inventory_holdings%rowtype;
  v_funding_quote public.purchase_funding_quotes%rowtype;
  v_target_account public.bank_accounts%rowtype;
  v_target_party public.economic_parties%rowtype;
  v_purchase_id uuid := extensions.gen_random_uuid();
  v_purchase_public_key text;
  v_funding_settlement_key text;
  v_funding_result jsonb;
  v_funding_receipt_key text;
  v_funding_receipt public.purchase_funding_receipts%rowtype;
  v_buyer_inventory_account_id uuid;
  v_buyer_holding public.inventory_holdings%rowtype;
  v_buyer_quantity_before numeric := 0;
  v_buyer_average_cost_before numeric(18, 4) := 0;
  v_buyer_average_cost_after numeric(18, 4);
  v_inventory_post jsonb;
  v_inventory_transaction_id uuid;
  v_now timestamptz := clock_timestamp();
  v_game_status text;
  v_fail_stage text := lower(coalesce(
    current_setting('app.seeded_store_funding_fail_stage', true),
    ''
  ));
begin
  if p_game_session_id is null
     or p_player_id is null
     or v_quote_key !~ '^quote_[0-9a-f]{32}$'
     or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
     or jsonb_typeof(coalesce(p_request_metadata, '{}'::jsonb)) <> 'object'
  then
    raise exception 'STORE_FUNDED_SETTLEMENT_REQUEST_INVALID' using errcode = '22023';
  end if;

  v_request_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'seeded-store-funding-settlement-v1',
    'gameSessionId', p_game_session_id,
    'playerId', p_player_id,
    'quoteKey', v_quote_key,
    'clientSubmittedAt', p_client_submitted_at
  ));

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    ':',
    'seeded_store_funding_settlement_v1',
    p_game_session_id::text,
    p_player_id::text,
    v_idempotency_key
  ), 0));

  -- Idempotency evidence is the only row lock allowed before the Store root.
  select key_row.*
  into v_idempotency
  from public.mutation_idempotency_keys as key_row
  where key_row.game_session_id = p_game_session_id
    and key_row.player_id = p_player_id
    and key_row.route_key = 'players.me.store.funded-purchases'
    and key_row.idempotency_key = v_idempotency_key
  for update;

  if found then
    if v_idempotency.request_hash <> v_request_hash then
      raise exception 'STORE_FUNDED_SETTLEMENT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    if v_idempotency.status = 'COMPLETED' then
      select purchase_row.*
      into v_purchase
      from public.store_purchases as purchase_row
      where purchase_row.game_session_id = p_game_session_id
        and purchase_row.player_id = p_player_id
        and purchase_row.id = v_idempotency.result_id
        and purchase_row.status = 'COMPLETED';
      if not found or v_purchase.funding_receipt_id is null then
        raise exception 'STORE_FUNDED_SETTLEMENT_REPLAY_MISSING' using errcode = 'P0001';
      end if;
      return private.read_seeded_store_funding_receipt_result_v1(
        v_purchase.id,
        true
      );
    end if;
    if v_idempotency.status <> 'STARTED' then
      raise exception 'STORE_FUNDED_SETTLEMENT_IN_PROGRESS' using errcode = 'P0001';
    end if;
  else
    insert into public.mutation_idempotency_keys(
      game_session_id,
      player_id,
      route_key,
      idempotency_key,
      request_hash,
      status,
      expires_at
    ) values (
      p_game_session_id,
      p_player_id,
      'players.me.store.funded-purchases',
      v_idempotency_key,
      v_request_hash,
      'STARTED',
      v_now + interval '7 days'
    )
    returning * into v_idempotency;
  end if;

  select game_row.status
  into v_game_status
  from public.game_sessions as game_row
  where game_row.id = p_game_session_id
  for share;
  if not found or v_game_status <> 'active' then
    raise exception 'STORE_FUNDED_SETTLEMENT_GAME_UNAVAILABLE' using errcode = 'P0001';
  end if;

  perform 1
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_FUNDED_SETTLEMENT_PLAYER_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- Preview only to identify the Store item root; the quote is locked after the item.
  select quote_row.*
  into v_quote_preview
  from public.store_purchase_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.player_id = p_player_id
    and quote_row.public_quote_key = v_quote_key;
  if not found or v_quote_preview.funding_quote_id is null then
    raise exception 'STORE_FUNDED_SETTLEMENT_QUOTE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select item_row.*
  into v_item
  from public.store_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.id = v_quote_preview.store_item_id
  for update;
  if not found
     or v_item.status <> 'active'
     or v_item.visibility <> 'visible'
     or v_item.game_item_id is null
     or v_item.inventory_account_id is null
  then
    raise exception 'STORE_FUNDED_SETTLEMENT_ITEM_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select quote_row.*
  into v_quote
  from public.store_purchase_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.player_id = p_player_id
    and quote_row.public_quote_key = v_quote_key
  for update;
  if not found
     or v_quote.id <> v_quote_preview.id
     or v_quote.store_item_id <> v_item.id
     or v_quote.status <> 'CREATED'
     or v_quote.funding_quote_id is null
     or v_quote.funding_context_hash is null
     or v_quote.target_bank_account_id is null
  then
    raise exception 'STORE_FUNDED_SETTLEMENT_QUOTE_UNUSABLE' using errcode = 'P0001';
  end if;
  if v_quote.expires_at <= v_now then
    raise exception 'STORE_FUNDED_SETTLEMENT_QUOTE_EXPIRED' using errcode = 'P0001';
  end if;
  if v_item.stock_quantity < v_quote.quantity then
    raise exception 'STORE_FUNDED_SETTLEMENT_INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;

  select item_row.*
  into v_game_item
  from public.game_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.id = v_item.game_item_id
    and item_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_FUNDED_SETTLEMENT_ITEM_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select account_row.*
  into v_stock_account
  from public.inventory_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.id = v_item.inventory_account_id
    and account_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_FUNDED_SETTLEMENT_STOCK_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select holding_row.*
  into v_stock_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_stock_account.id
    and holding_row.game_item_id = v_game_item.id
  for update;
  if not found
     or v_stock_holding.quantity_reserved <> 0
     or v_stock_holding.quantity_owned < v_quote.quantity
  then
    raise exception 'STORE_FUNDED_SETTLEMENT_INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;

  select funding_row.*
  into v_funding_quote
  from public.purchase_funding_quotes as funding_row
  where funding_row.game_session_id = p_game_session_id
    and funding_row.id = v_quote.funding_quote_id
    and funding_row.player_id = p_player_id;
  if not found
     or v_funding_quote.funding_context_kind <> 'store.seeded'
     or v_funding_quote.funding_context_key <> v_quote.public_quote_key
     or v_funding_quote.funding_context_hash <> v_quote.funding_context_hash
     or v_funding_quote.target_currency_code <> v_quote.currency_code
     or v_funding_quote.target_amount <> v_quote.final_total_price
  then
    raise exception 'STORE_FUNDED_SETTLEMENT_FUNDING_MISMATCH' using errcode = 'P0001';
  end if;

  select account_row.*
  into v_target_account
  from public.bank_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.id = v_quote.target_bank_account_id
    and account_row.account_kind = 'checking'
    and account_row.currency_code = v_quote.currency_code
    and account_row.status = 'active';
  if not found then
    raise exception 'STORE_FUNDED_SETTLEMENT_TARGET_INVALID' using errcode = 'P0001';
  end if;

  select party_row.*
  into v_target_party
  from public.economic_parties as party_row
  where party_row.game_session_id = p_game_session_id
    and party_row.id = v_target_account.party_id
    and party_row.party_kind = 'system'
    and party_row.system_key = 'store.seeded-revenue'
    and party_row.status = 'active';
  if not found then
    raise exception 'STORE_FUNDED_SETTLEMENT_TARGET_INVALID' using errcode = 'P0001';
  end if;

  v_purchase_public_key := 'receipt_' || substr(private.bank_digest_text_v1(concat_ws(
    '|',
    'seeded-store-funding-receipt-v1',
    p_game_session_id::text,
    p_player_id::text,
    v_idempotency_key
  )), 1, 32);

  insert into public.store_purchases(
    id,
    public_receipt_key,
    game_session_id,
    player_id,
    store_item_id,
    quote_id,
    quantity,
    currency_code,
    item_currency_code,
    player_currency_code,
    exchange_rate,
    item_local_final_unit_price,
    item_local_final_total_price,
    final_unit_price,
    final_total_price,
    ledger_entry_id,
    idempotency_key,
    status,
    client_submitted_at
  ) values (
    v_purchase_id,
    v_purchase_public_key,
    p_game_session_id,
    p_player_id,
    v_item.id,
    v_quote.id,
    v_quote.quantity,
    v_quote.currency_code,
    v_quote.item_currency_code,
    v_quote.player_currency_code,
    v_quote.exchange_rate,
    v_quote.item_local_final_unit_price,
    v_quote.item_local_final_total_price,
    v_quote.final_unit_price,
    v_quote.final_total_price,
    null,
    v_idempotency_key,
    'FAILED',
    p_client_submitted_at
  ) returning * into v_purchase;

  v_funding_settlement_key := 'seeded-store-purchase:' || substr(v_request_hash, 1, 64);
  v_funding_result := private.compose_purchase_funding_v1(
    p_game_session_id,
    p_player_id,
    v_funding_quote.public_key,
    'store.seeded',
    v_quote.public_quote_key,
    v_quote.funding_context_hash,
    v_target_account.id,
    'store',
    'seeded_store_purchase_funding',
    v_purchase.id,
    v_funding_settlement_key,
    'player',
    p_player_id,
    v_now
  );
  v_funding_receipt_key := v_funding_result -> 'receipt' ->> 'receipt_key';

  select receipt_row.*
  into v_funding_receipt
  from public.purchase_funding_receipts as receipt_row
  where receipt_row.game_session_id = p_game_session_id
    and receipt_row.public_key = v_funding_receipt_key
    and receipt_row.player_id = p_player_id
    and receipt_row.quote_id = v_funding_quote.id
    and receipt_row.target_account_id = v_target_account.id
    and receipt_row.target_amount = v_quote.final_total_price
    and receipt_row.source_domain = 'store'
    and receipt_row.source_action = 'seeded_store_purchase_funding'
    and receipt_row.source_id = v_purchase.id;
  if not found then
    raise exception 'STORE_FUNDED_SETTLEMENT_RECEIPT_INVALID' using errcode = 'P0001';
  end if;
  if v_fail_stage = 'after_funding' then
    raise exception 'STORE_FUNDED_SETTLEMENT_INJECTED_FAILURE:after_funding' using errcode = 'P0001';
  end if;

  -- Buyer Inventory is intentionally acquired after Store roots and C0/B2 locks.
  v_buyer_inventory_account_id := economy_private.ensure_player_inventory_account_v2(
    p_game_session_id,
    p_player_id
  );
  select holding_row.*
  into v_buyer_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_buyer_inventory_account_id
    and holding_row.game_item_id = v_game_item.id
  for update;
  if found then
    if v_buyer_holding.quantity_owned > 0
       and v_buyer_holding.cost_currency_code is distinct from v_quote.currency_code
    then
      raise exception 'STORE_FUNDED_SETTLEMENT_BUYER_INVENTORY_CURRENCY_INVALID' using errcode = 'P0001';
    end if;
    v_buyer_quantity_before := v_buyer_holding.quantity_owned;
    v_buyer_average_cost_before := v_buyer_holding.average_unit_cost;
  end if;
  v_buyer_average_cost_after := round((
    (v_buyer_quantity_before * v_buyer_average_cost_before)
      + (v_quote.quantity * v_quote.final_unit_price)
  ) / (v_buyer_quantity_before + v_quote.quantity), 4);

  v_inventory_post := economy_private.post_inventory_transaction_v2(
    p_game_session_id,
    'purchase',
    'store',
    'seeded_store_funded_purchase',
    v_purchase.id,
    'seeded-store-funded:' || substr(v_request_hash, 1, 64),
    jsonb_build_object(
      'authority', 'multicurrency_store_funding_v1',
      'storeQuoteKey', v_quote.public_quote_key,
      'storeReceiptKey', v_purchase.public_receipt_key,
      'fundingQuoteKey', v_funding_quote.public_key,
      'fundingReceiptKey', v_funding_receipt.public_key
    ) || coalesce(p_request_metadata, '{}'::jsonb),
    jsonb_build_array(
      jsonb_build_object(
        'inventoryAccountId', v_stock_account.id,
        'gameItemId', v_game_item.id,
        'storeItemId', v_item.id,
        'quantityDelta', -v_quote.quantity,
        'reservationDelta', 0,
        'unitCost', v_item.price,
        'currencyCode', v_item.currency_code,
        'metadata', jsonb_build_object(
          'side', 'seeded_store_stock',
          'receiptKey', v_purchase.public_receipt_key
        )
      ),
      jsonb_build_object(
        'inventoryAccountId', v_buyer_inventory_account_id,
        'gameItemId', v_game_item.id,
        'playerId', p_player_id,
        'storeItemId', v_item.id,
        'quantityDelta', v_quote.quantity,
        'reservationDelta', 0,
        'unitCost', v_quote.final_unit_price,
        'currencyCode', v_quote.currency_code,
        'eventType', 'PURCHASED',
        'legacyEventQuantityDelta', v_quote.quantity,
        'metadata', jsonb_build_object(
          'side', 'buyer_inventory',
          'receiptKey', v_purchase.public_receipt_key
        ),
        'eventMetadata', jsonb_build_object(
          'storeQuoteKey', v_quote.public_quote_key,
          'storeReceiptKey', v_purchase.public_receipt_key,
          'fundingQuoteKey', v_funding_quote.public_key,
          'fundingReceiptKey', v_funding_receipt.public_key,
          'currencyCode', v_quote.currency_code,
          'finalTotalPrice', v_quote.final_total_price
        )
      )
    )
  );
  v_inventory_transaction_id := (v_inventory_post ->> 'transactionId')::uuid;

  select holding_row.*
  into strict v_stock_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_stock_account.id
    and holding_row.game_item_id = v_game_item.id;
  select holding_row.*
  into strict v_buyer_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_buyer_inventory_account_id
    and holding_row.game_item_id = v_game_item.id;

  if v_buyer_holding.quantity_owned is distinct from v_buyer_quantity_before + v_quote.quantity
     or v_buyer_holding.average_unit_cost is distinct from v_buyer_average_cost_after
     or v_buyer_holding.cost_currency_code is distinct from v_quote.currency_code
  then
    raise exception 'STORE_FUNDED_SETTLEMENT_INVENTORY_POSTCONDITION_FAILED' using errcode = 'P0001';
  end if;
  if v_fail_stage = 'after_inventory' then
    raise exception 'STORE_FUNDED_SETTLEMENT_INJECTED_FAILURE:after_inventory' using errcode = 'P0001';
  end if;

  update public.store_items
  set stock_quantity = stock_quantity - v_quote.quantity
  where game_session_id = p_game_session_id
    and id = v_item.id
    and stock_quantity >= v_quote.quantity;
  if not found then
    raise exception 'STORE_FUNDED_SETTLEMENT_STOCK_UPDATE_FAILED' using errcode = 'P0001';
  end if;

  update public.store_purchase_quotes
  set status = 'USED', used_at = v_now
  where game_session_id = p_game_session_id
    and id = v_quote.id
    and status = 'CREATED';
  if not found then
    raise exception 'STORE_FUNDED_SETTLEMENT_QUOTE_COMPLETION_FAILED' using errcode = 'P0001';
  end if;

  update public.store_purchases
  set
    funding_receipt_id = v_funding_receipt.id,
    bank_transaction_id = v_funding_receipt.bank_transaction_id,
    target_bank_account_id = v_target_account.id,
    inventory_transaction_id = v_inventory_transaction_id,
    status = 'COMPLETED'
  where game_session_id = p_game_session_id
    and id = v_purchase.id
    and status = 'FAILED'
  returning * into v_purchase;
  if not found then
    raise exception 'STORE_FUNDED_SETTLEMENT_PURCHASE_COMPLETION_FAILED' using errcode = 'P0001';
  end if;

  update public.mutation_idempotency_keys
  set
    status = 'COMPLETED',
    result_type = 'store_purchase',
    result_id = v_purchase.id,
    response_body = jsonb_build_object(
      'receiptKey', v_purchase.public_receipt_key,
      'quoteKey', v_quote.public_quote_key,
      'fundingReceiptKey', v_funding_receipt.public_key,
      'refreshRequired', true
    ),
    completed_at = v_now
  where id = v_idempotency.id
    and status = 'STARTED';
  if not found then
    raise exception 'STORE_FUNDED_SETTLEMENT_IDEMPOTENCY_COMPLETION_FAILED' using errcode = 'P0001';
  end if;

  if v_fail_stage = 'after_completion' then
    raise exception 'STORE_FUNDED_SETTLEMENT_INJECTED_FAILURE:after_completion' using errcode = 'P0001';
  end if;

  return private.read_seeded_store_funding_receipt_result_v1(
    v_purchase.id,
    false
  );
end
$function$;

revoke all on function public.settle_seeded_store_funding_v1(
  uuid, uuid, text, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.settle_seeded_store_funding_v1(
  uuid, uuid, text, text, timestamptz, jsonb
) to service_role;

create or replace function public.settle_business_store_offer_funding_v1(
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
set search_path = pg_catalog, public, private, economy_private, extensions, pg_temp
as $function$
declare
  v_offer_key text := lower(btrim(coalesce(p_offer_key, '')));
  v_quote_key text := lower(btrim(coalesce(p_quote_key, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_request_hash text;
  v_existing public.store_offer_purchase_receipts%rowtype;
  v_offer public.store_seller_offers%rowtype;
  v_quote public.store_offer_purchase_quotes%rowtype;
  v_party public.economic_parties%rowtype;
  v_business public.business_entities%rowtype;
  v_store_item public.store_items%rowtype;
  v_game_item public.game_items%rowtype;
  v_listing_account public.inventory_accounts%rowtype;
  v_listing_holding public.inventory_holdings%rowtype;
  v_funding_quote public.purchase_funding_quotes%rowtype;
  v_target_account public.bank_accounts%rowtype;
  v_target_party public.economic_parties%rowtype;
  v_receipt_id uuid := extensions.gen_random_uuid();
  v_receipt_public_key text;
  v_funding_settlement_key text;
  v_funding_result jsonb;
  v_funding_receipt_key text;
  v_funding_receipt public.purchase_funding_receipts%rowtype;
  v_buyer_party public.economic_parties%rowtype;
  v_buyer_account public.inventory_accounts%rowtype;
  v_buyer_holding public.inventory_holdings%rowtype;
  v_buyer_quantity_before numeric := 0;
  v_buyer_average_cost_before numeric(18, 4) := 0;
  v_buyer_average_cost_after numeric(18, 4);
  v_source_unit_cost numeric(18, 4);
  v_total numeric(18, 4);
  v_cogs numeric(18, 4);
  v_margin numeric(18, 4);
  v_remaining bigint;
  v_inventory_post jsonb;
  v_inventory_transaction_id uuid;
  v_settlement_time timestamptz := clock_timestamp();
  v_quote_status_after text;
  v_quote_version_after bigint;
  v_quote_used_at_after timestamptz;
  v_offer_version_after bigint;
  v_fail_stage text := lower(coalesce(
    current_setting('app.business_store_funding_fail_stage', true),
    ''
  ));
begin
  if p_game_session_id is null
     or p_buyer_player_id is null
     or v_offer_key !~ '^sof_[0-9a-f]{32}$'
     or v_quote_key !~ '^quote_[0-9a-f]{32}$'
     or p_quantity is null
     or p_quantity not between 1 and 1000000
     or p_expected_offer_version is null
     or p_expected_offer_version < 1
     or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_REQUEST_INVALID' using errcode = '22023';
  end if;

  v_request_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'business-store-offer-funding-settlement-v1',
    'gameSessionId', p_game_session_id,
    'buyerPlayerId', p_buyer_player_id,
    'offerKey', v_offer_key,
    'quoteKey', v_quote_key,
    'quantity', p_quantity,
    'expectedOfferVersion', p_expected_offer_version
  ));

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    ':',
    'business_store_offer_funding_settlement_v1',
    p_game_session_id::text,
    p_buyer_player_id::text,
    v_idempotency_key
  ), 0));

  -- Immutable Store receipt replay precedes mutable offer, stock, balance, rate,
  -- account, and lifecycle interpretation.
  select receipt_row.*
  into v_existing
  from public.store_offer_purchase_receipts as receipt_row
  where receipt_row.game_session_id = p_game_session_id
    and receipt_row.buyer_player_id = p_buyer_player_id
    and receipt_row.request_idempotency_key = v_idempotency_key;
  if found then
    if v_existing.request_hash is distinct from v_request_hash then
      raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    if v_existing.funding_receipt_id is null then
      raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_LEGACY_CONFLICT' using errcode = 'P0001';
    end if;
    return economy_private.read_store_offer_funding_receipt_result_v1(
      v_existing.id,
      true
    );
  end if;

  perform 1
  from public.players as buyer_row
  where buyer_row.game_session_id = p_game_session_id
    and buyer_row.id = p_buyer_player_id
    and buyer_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_BUYER_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- Fixed commercial lock order: offer, Store quote, listing stock, C0/B2,
  -- then Buyer Inventory.
  select offer_row.*
  into v_offer
  from public.store_seller_offers as offer_row
  where offer_row.game_session_id = p_game_session_id
    and offer_row.public_key = v_offer_key
    and offer_row.seller_kind = 'business'
  for update;
  if not found then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_OFFER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_offer.status <> 'active' then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_OFFER_STATUS_INVALID' using errcode = 'P0001';
  end if;
  if v_offer.version <> p_expected_offer_version then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_OFFER_VERSION_CONFLICT' using errcode = 'P0001';
  end if;
  if v_offer.inventory_account_id is null then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_CUSTODY_MISSING' using errcode = 'P0001';
  end if;

  select quote_row.*
  into v_quote
  from public.store_offer_purchase_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.buyer_player_id = p_buyer_player_id
    and quote_row.public_key = v_quote_key
  for update;
  if not found
     or v_quote.status <> 'created'
     or v_quote.funding_quote_id is null
     or v_quote.funding_context_hash is null
     or v_quote.target_bank_account_id is null
  then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_QUOTE_UNUSABLE' using errcode = 'P0001';
  end if;
  if v_quote.expires_at <= v_settlement_time then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_QUOTE_EXPIRED' using errcode = 'P0001';
  end if;
  if v_quote.offer_id <> v_offer.id
     or v_quote.offer_version <> v_offer.version
     or v_quote.quantity <> p_quantity
     or v_quote.seller_party_id <> v_offer.seller_party_id
     or v_quote.store_item_id <> v_offer.store_item_id
     or v_quote.game_item_id <> v_offer.game_item_id
     or v_quote.inventory_account_id <> v_offer.inventory_account_id
     or v_quote.final_unit_price <> v_offer.unit_price
     or v_quote.final_total_price <> round(v_offer.unit_price * p_quantity, 4)
     or v_quote.seller_currency_code <> v_offer.currency_code
     or v_quote.buyer_currency_code <> v_offer.currency_code
     or v_quote.exchange_rate <> 1
  then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_QUOTE_MISMATCH' using errcode = 'P0001';
  end if;

  select party_row.*
  into v_party
  from public.economic_parties as party_row
  where party_row.game_session_id = p_game_session_id
    and party_row.id = v_offer.seller_party_id
    and party_row.party_kind = 'business'
    and party_row.status = 'active'
  for share;
  if not found or v_party.business_id is null or v_party.business_id <> v_quote.business_id then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_SELLER_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_party.business_id
    and business_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_BUSINESS_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_business.owner_player_id = p_buyer_player_id
     or exists (
       select 1
       from public.business_ownership_positions as position_row
       where position_row.game_session_id = p_game_session_id
         and position_row.business_id = v_business.id
         and position_row.player_id = p_buyer_player_id
         and position_row.status = 'active'
     )
  then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_SELF_PURCHASE_FORBIDDEN' using errcode = 'P0001';
  end if;
  if v_business.currency_code <> v_offer.currency_code then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_BUSINESS_CURRENCY_INVALID' using errcode = 'P0001';
  end if;

  select store_row.*
  into v_store_item
  from public.store_items as store_row
  where store_row.game_session_id = p_game_session_id
    and store_row.id = v_offer.store_item_id
    and store_row.status = 'active'
    and store_row.visibility = 'visible'
  for share;
  if not found
     or v_store_item.game_item_id <> v_offer.game_item_id
     or v_store_item.currency_code <> v_offer.currency_code
  then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_CATALOG_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select item_row.*
  into v_game_item
  from public.game_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.id = v_offer.game_item_id
    and item_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_ITEM_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select account_row.*
  into v_listing_account
  from public.inventory_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.id = v_offer.inventory_account_id
    and account_row.party_id = v_party.id
    and account_row.account_kind = 'store_stock'
    and account_row.location_key = 'store_offer:' || v_offer.public_key
    and account_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_CUSTODY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select holding_row.*
  into v_listing_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_listing_account.id
    and holding_row.game_item_id = v_game_item.id
  for update;
  if not found
     or v_listing_holding.quantity_owned <> trunc(v_listing_holding.quantity_owned)
     or v_listing_holding.quantity_reserved <> 0
     or v_listing_holding.quantity_owned < p_quantity
  then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;
  if v_listing_holding.cost_currency_code <> v_offer.currency_code then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_COST_CURRENCY_DRIFT' using errcode = 'P0001';
  end if;

  v_total := v_quote.final_total_price;
  if v_total <= 0 or v_total <> round(v_total, 2) then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_MONEY_INVALID' using errcode = 'P0001';
  end if;
  v_source_unit_cost := round(v_listing_holding.average_unit_cost, 4);
  v_cogs := round(v_source_unit_cost * p_quantity, 4);
  v_margin := round(v_total - v_cogs, 4);
  v_remaining := v_listing_holding.quantity_owned::bigint - p_quantity;

  select funding_row.*
  into v_funding_quote
  from public.purchase_funding_quotes as funding_row
  where funding_row.game_session_id = p_game_session_id
    and funding_row.id = v_quote.funding_quote_id
    and funding_row.player_id = p_buyer_player_id;
  if not found
     or v_funding_quote.funding_context_kind <> 'store.business-offer'
     or v_funding_quote.funding_context_key <> v_quote.public_key
     or v_funding_quote.funding_context_hash <> v_quote.funding_context_hash
     or v_funding_quote.target_currency_code <> v_offer.currency_code
     or v_funding_quote.target_amount <> v_total
  then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_FUNDING_MISMATCH' using errcode = 'P0001';
  end if;

  select account_row.*
  into v_target_account
  from public.bank_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.id = v_quote.target_bank_account_id
    and account_row.account_kind = 'checking'
    and account_row.currency_code = v_offer.currency_code
    and account_row.status = 'active';
  if not found then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_TARGET_INVALID' using errcode = 'P0001';
  end if;

  select party_row.*
  into v_target_party
  from public.economic_parties as party_row
  where party_row.game_session_id = p_game_session_id
    and party_row.id = v_target_account.party_id
    and party_row.party_kind = 'business'
    and party_row.business_id = v_business.id
    and party_row.status = 'active';
  if not found then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_TARGET_INVALID' using errcode = 'P0001';
  end if;

  v_receipt_public_key := 'spr_' || substr(private.bank_digest_text_v1(concat_ws(
    '|',
    'business-store-offer-funding-receipt-v1',
    p_game_session_id::text,
    p_buyer_player_id::text,
    v_idempotency_key
  )), 1, 32);
  v_funding_settlement_key := 'business-store-purchase:' || substr(v_request_hash, 1, 64);

  v_funding_result := private.compose_purchase_funding_v1(
    p_game_session_id,
    p_buyer_player_id,
    v_funding_quote.public_key,
    'store.business-offer',
    v_quote.public_key,
    v_quote.funding_context_hash,
    v_target_account.id,
    'store',
    'business_offer_purchase_funding',
    v_receipt_id,
    v_funding_settlement_key,
    'player',
    p_buyer_player_id,
    v_settlement_time
  );
  v_funding_receipt_key := v_funding_result -> 'receipt' ->> 'receipt_key';

  select receipt_row.*
  into v_funding_receipt
  from public.purchase_funding_receipts as receipt_row
  where receipt_row.game_session_id = p_game_session_id
    and receipt_row.public_key = v_funding_receipt_key
    and receipt_row.player_id = p_buyer_player_id
    and receipt_row.quote_id = v_funding_quote.id
    and receipt_row.target_account_id = v_target_account.id
    and receipt_row.target_amount = v_total
    and receipt_row.source_domain = 'store'
    and receipt_row.source_action = 'business_offer_purchase_funding'
    and receipt_row.source_id = v_receipt_id;
  if not found then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_RECEIPT_INVALID' using errcode = 'P0001';
  end if;
  if v_fail_stage = 'after_funding' then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_INJECTED_FAILURE:after_funding' using errcode = 'P0001';
  end if;

  select party_row.*
  into v_buyer_party
  from public.economic_parties as party_row
  where party_row.game_session_id = p_game_session_id
    and party_row.party_kind = 'player'
    and party_row.player_id = p_buyer_player_id
    and party_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_BUYER_INVENTORY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select account_row.*
  into v_buyer_account
  from public.inventory_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.party_id = v_buyer_party.id
    and account_row.account_kind = 'personal'
    and account_row.location_key is null
    and account_row.status = 'active'
  for update;
  if not found then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_BUYER_INVENTORY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select holding_row.*
  into v_buyer_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_buyer_account.id
    and holding_row.game_item_id = v_game_item.id
  for update;
  if found then
    if v_buyer_holding.quantity_owned > 0
       and v_buyer_holding.cost_currency_code <> v_offer.currency_code
    then
      raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_BUYER_INVENTORY_CURRENCY_INVALID' using errcode = 'P0001';
    end if;
    v_buyer_quantity_before := v_buyer_holding.quantity_owned;
    v_buyer_average_cost_before := v_buyer_holding.average_unit_cost;
  end if;
  v_buyer_average_cost_after := round((
    (v_buyer_quantity_before * v_buyer_average_cost_before)
      + (p_quantity * v_quote.final_unit_price)
  ) / (v_buyer_quantity_before + p_quantity), 4);

  v_inventory_post := economy_private.post_inventory_transaction_v2(
    p_game_session_id,
    'purchase',
    'store',
    'business_offer_purchase',
    v_receipt_id,
    'business-offer-funded:' || substr(v_request_hash, 1, 64),
    jsonb_build_object(
      'authority', 'multicurrency_store_funding_v1',
      'offerKey', v_offer.public_key,
      'quoteKey', v_quote.public_key,
      'receiptKey', v_receipt_public_key,
      'fundingQuoteKey', v_funding_quote.public_key,
      'fundingReceiptKey', v_funding_receipt.public_key
    ),
    jsonb_build_array(
      jsonb_build_object(
        'inventoryAccountId', v_listing_account.id,
        'gameItemId', v_game_item.id,
        'quantityDelta', -p_quantity,
        'reservationDelta', 0,
        'unitCost', v_source_unit_cost,
        'currencyCode', v_offer.currency_code,
        'metadata', jsonb_build_object(
          'offerKey', v_offer.public_key,
          'quoteKey', v_quote.public_key,
          'receiptKey', v_receipt_public_key
        )
      ),
      jsonb_build_object(
        'inventoryAccountId', v_buyer_account.id,
        'gameItemId', v_game_item.id,
        'playerId', p_buyer_player_id,
        'storeItemId', v_store_item.id,
        'quantityDelta', p_quantity,
        'reservationDelta', 0,
        'unitCost', v_quote.final_unit_price,
        'currencyCode', v_offer.currency_code,
        'eventType', 'PURCHASED',
        'legacyEventQuantityDelta', p_quantity,
        'metadata', jsonb_build_object(
          'offerKey', v_offer.public_key,
          'quoteKey', v_quote.public_key,
          'receiptKey', v_receipt_public_key
        ),
        'eventMetadata', jsonb_build_object(
          'offerKey', v_offer.public_key,
          'quoteKey', v_quote.public_key,
          'receiptKey', v_receipt_public_key,
          'fundingQuoteKey', v_funding_quote.public_key,
          'fundingReceiptKey', v_funding_receipt.public_key
        )
      )
    )
  );
  v_inventory_transaction_id := (v_inventory_post ->> 'transactionId')::uuid;

  select holding_row.*
  into strict v_listing_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_listing_account.id
    and holding_row.game_item_id = v_game_item.id;
  select holding_row.*
  into strict v_buyer_holding
  from public.inventory_holdings as holding_row
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
     or v_buyer_holding.cost_currency_code is distinct from v_offer.currency_code
  then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_INVENTORY_POSTCONDITION_FAILED' using errcode = 'P0001';
  end if;
  if v_fail_stage = 'after_inventory' then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_INJECTED_FAILURE:after_inventory' using errcode = 'P0001';
  end if;

  insert into public.business_activity_events(
    game_session_id,
    business_id,
    actor_type,
    actor_player_id,
    event_type,
    source_id,
    reason_code,
    metadata,
    occurred_at
  ) values (
    p_game_session_id,
    v_business.id,
    'player',
    p_buyer_player_id,
    'business.store.sale.completed',
    v_receipt_id,
    'business_store_offer_purchase',
    jsonb_build_object(
      'offerKey', v_offer.public_key,
      'quoteKey', v_quote.public_key,
      'quantity', p_quantity,
      'grossRevenue', v_total,
      'costOfGoodsSold', v_cogs,
      'grossMargin', v_margin,
      'currencyCode', v_offer.currency_code,
      'receiptKey', v_receipt_public_key,
      'fundingReceiptKey', v_funding_receipt.public_key
    ),
    v_settlement_time
  );

  insert into public.store_offer_purchase_receipts(
    id,
    public_key,
    game_session_id,
    buyer_player_id,
    quote_id,
    offer_id,
    business_id,
    seller_party_id,
    store_item_id,
    game_item_id,
    listing_inventory_account_id,
    buyer_inventory_account_id,
    buyer_debit_ledger_entry_id,
    business_credit_ledger_entry_id,
    inventory_transaction_id,
    quote_key,
    offer_key,
    business_key,
    seller_party_key,
    catalog_item_key,
    canonical_item_key,
    store_item_key,
    buyer_inventory_account_key,
    inventory_transaction_key,
    quantity,
    unit_price,
    total_price,
    currency_code,
    buyer_debit,
    business_credit,
    gross_revenue,
    source_unit_cost,
    cost_currency_code,
    cost_of_goods_sold,
    gross_margin,
    offer_version_before,
    offer_version_after,
    remaining_listed_quantity,
    request_idempotency_key,
    request_hash,
    completed_at,
    metadata,
    funding_receipt_id,
    bank_transaction_id,
    target_bank_account_id
  ) values (
    v_receipt_id,
    v_receipt_public_key,
    p_game_session_id,
    p_buyer_player_id,
    v_quote.id,
    v_offer.id,
    v_business.id,
    v_party.id,
    v_store_item.id,
    v_game_item.id,
    v_listing_account.id,
    v_buyer_account.id,
    null,
    null,
    v_inventory_transaction_id,
    v_quote.public_key,
    v_offer.public_key,
    v_business.public_key,
    v_party.public_key,
    v_game_item.public_key,
    v_game_item.canonical_key,
    v_store_item.item_key,
    v_buyer_account.public_key,
    v_inventory_post ->> 'transactionKey',
    p_quantity,
    v_quote.final_unit_price,
    v_total,
    v_offer.currency_code,
    v_total,
    v_total,
    v_total,
    v_source_unit_cost,
    v_offer.currency_code,
    v_cogs,
    v_margin,
    v_offer.version,
    v_offer.version + 1,
    v_remaining,
    v_idempotency_key,
    v_request_hash,
    v_settlement_time,
    jsonb_build_object(
      'authority', 'multicurrency_store_funding_v1',
      'fundingQuoteKey', v_funding_quote.public_key,
      'fundingReceiptKey', v_funding_receipt.public_key,
      'bankTransactionKey', v_funding_result -> 'receipt' ->> 'bank_transaction_key',
      'targetAccountKey', v_target_account.public_key
    ),
    v_funding_receipt.id,
    v_funding_receipt.bank_transaction_id,
    v_target_account.id
  ) returning * into v_existing;

  if v_fail_stage = 'after_receipt' then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_INJECTED_FAILURE:after_receipt' using errcode = 'P0001';
  end if;

  update public.store_offer_purchase_quotes
  set
    status = 'used',
    used_at = v_settlement_time,
    version = version + 1
  where game_session_id = p_game_session_id
    and id = v_quote.id
    and status = 'created'
    and version = v_quote.version
  returning status, version, used_at
  into v_quote_status_after, v_quote_version_after, v_quote_used_at_after;
  if not found
     or v_quote_status_after <> 'used'
     or v_quote_version_after <> v_quote.version + 1
     or v_quote_used_at_after <> v_settlement_time
  then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_QUOTE_COMPLETION_FAILED' using errcode = 'P0001';
  end if;

  update public.store_seller_offers
  set version = version + 1
  where game_session_id = p_game_session_id
    and id = v_offer.id
    and status = 'active'
    and version = v_offer.version
  returning version into v_offer_version_after;
  if not found or v_offer_version_after <> v_offer.version + 1 then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_OFFER_COMPLETION_FAILED' using errcode = 'P0001';
  end if;

  if v_fail_stage = 'after_completion' then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_INJECTED_FAILURE:after_completion' using errcode = 'P0001';
  end if;

  return economy_private.read_store_offer_funding_receipt_result_v1(
    v_existing.id,
    false
  );
end
$function$;

revoke all on function public.settle_business_store_offer_funding_v1(
  uuid, uuid, text, text, integer, bigint, text
) from public, anon, authenticated;
grant execute on function public.settle_business_store_offer_funding_v1(
  uuid, uuid, text, text, integer, bigint, text
) to service_role;

comment on function public.settle_seeded_store_funding_v1(
  uuid, uuid, text, text, timestamptz, jsonb
) is
  'Atomically settles one seeded/NPC Store quote through C0 funding, exact target credit, canonical stock transfer, Buyer acquisition basis, Store receipt, and replay evidence.';
comment on function public.settle_business_store_offer_funding_v1(
  uuid, uuid, text, text, integer, bigint, text
) is
  'Atomically settles one locked Business Store offer through C0 funding, exact Business target credit, Store Listing transfer, Buyer purchase-price basis, COGS/margin evidence, and replay.';

commit;
