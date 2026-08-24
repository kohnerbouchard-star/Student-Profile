-- Business V2 Phase 9A: bounded reservation-safe due withdrawal processor.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.process_due_store_offer_withdrawals_v2(
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_request public.store_offer_withdrawal_requests%rowtype;
  v_offer public.store_seller_offers%rowtype;
  v_business public.business_entities%rowtype;
  v_party public.economic_parties%rowtype;
  v_listing_account public.inventory_accounts%rowtype;
  v_finished_account public.inventory_accounts%rowtype;
  v_listing_holding public.inventory_holdings%rowtype;
  v_listing_holding_after public.inventory_holdings%rowtype;
  v_finished_holding public.inventory_holdings%rowtype;
  v_finished_holding_after public.inventory_holdings%rowtype;
  v_projection public.business_inventory%rowtype;
  v_finished_account_id uuid;
  v_transaction_id uuid;
  v_transaction_key text;
  v_return_quantity integer;
  v_cost_currency text;
  v_next_status text;
  v_posting jsonb;
  v_metadata jsonb;
  v_lines jsonb;
  v_results jsonb := '[]'::jsonb;
  v_selected_count integer := 0;
  v_completed_count integer := 0;
  v_blocked_count integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'STORE_WITHDRAWAL_PROCESS_LIMIT_INVALID'
      using errcode = 'P0001';
  end if;

  for v_request in
    select request_row.*
    from public.store_offer_withdrawal_requests as request_row
    where request_row.status = 'pending'
      and request_row.effective_at <= v_now
      and coalesce(request_row.next_attempt_at, request_row.effective_at) <= v_now
    order by request_row.effective_at, request_row.public_key
    limit p_limit
    for update skip locked
  loop
    v_selected_count := v_selected_count + 1;

    select offer_row.*
    into v_offer
    from public.store_seller_offers as offer_row
    where offer_row.game_session_id = v_request.game_session_id
      and offer_row.id = v_request.offer_id
    for update;
    if not found
      or v_offer.status <> 'withdrawal_pending'
      or v_offer.withdrawal_request_id is distinct from v_request.id
      or v_offer.seller_kind <> 'business'
      or v_offer.seller_party_id is distinct from v_request.seller_party_id
      or v_offer.game_item_id is distinct from v_request.game_item_id
      or v_offer.inventory_account_id is distinct from v_request.inventory_account_id
    then
      raise exception 'STORE_WITHDRAWAL_PROCESS_OFFER_SCOPE_INVALID'
        using errcode = 'P0001';
    end if;

    if v_request.effective_at > v_now
      or v_offer.withdrawal_effective_at > v_now
      or v_offer.withdrawal_effective_at is distinct from v_request.effective_at
    then
      raise exception 'STORE_WITHDRAWAL_PROCESS_TOO_EARLY'
        using errcode = 'P0001';
    end if;

    select business_row.*
    into v_business
    from public.business_entities as business_row
    where business_row.game_session_id = v_request.game_session_id
      and business_row.id = v_request.business_id
      and business_row.status = 'active'
    for share;
    if not found then
      raise exception 'STORE_WITHDRAWAL_PROCESS_BUSINESS_INVALID'
        using errcode = 'P0001';
    end if;

    select party_row.*
    into v_party
    from public.economic_parties as party_row
    where party_row.game_session_id = v_request.game_session_id
      and party_row.id = v_request.seller_party_id
      and party_row.party_kind = 'business'
      and party_row.business_id = v_business.id
      and party_row.status = 'active'
    for share;
    if not found then
      raise exception 'STORE_WITHDRAWAL_PROCESS_SELLER_INVALID'
        using errcode = 'P0001';
    end if;

    select account_row.*
    into v_listing_account
    from public.inventory_accounts as account_row
    where account_row.game_session_id = v_request.game_session_id
      and account_row.id = v_request.inventory_account_id
      and account_row.party_id = v_party.id
      and account_row.account_kind = 'store_stock'
      and account_row.location_key = 'store_offer:' || v_offer.public_key
      and account_row.status = 'active'
    for update;
    if not found then
      raise exception 'STORE_WITHDRAWAL_PROCESS_LISTING_ACCOUNT_INVALID'
        using errcode = 'P0001';
    end if;

    select holding_row.*
    into v_listing_holding
    from public.inventory_holdings as holding_row
    where holding_row.game_session_id = v_request.game_session_id
      and holding_row.inventory_account_id = v_listing_account.id
      and holding_row.game_item_id = v_request.game_item_id
    for update;
    if not found then
      raise exception 'STORE_WITHDRAWAL_PROCESS_LISTING_HOLDING_MISSING'
        using errcode = 'P0001';
    end if;

    if v_listing_holding.quantity_reserved > 0 then
      update public.store_offer_withdrawal_requests as request_row
      set
        next_attempt_at = greatest(
          v_now + interval '1 minute',
          request_row.effective_at
        ),
        last_attempt_at = v_now,
        last_block_reason = 'inventory_reserved',
        attempt_count = request_row.attempt_count + 1,
        version = request_row.version + 1
      where request_row.id = v_request.id
      returning * into v_request;

      v_blocked_count := v_blocked_count + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'requestKey', v_request.public_key,
        'offerKey', v_offer.public_key,
        'outcome', 'blocked',
        'blockReason', 'inventory_reserved',
        'reservedQuantity', v_listing_holding.quantity_reserved,
        'nextAttemptAt', v_request.next_attempt_at,
        'offerVersion', v_offer.version
      ));
      continue;
    end if;

    v_finished_account_id := economy_private.ensure_business_inventory_account_v2(
      v_request.game_session_id,
      v_business.id,
      'finished_goods'
    );

    select account_row.*
    into v_finished_account
    from public.inventory_accounts as account_row
    where account_row.game_session_id = v_request.game_session_id
      and account_row.id = v_finished_account_id
      and account_row.party_id = v_party.id
      and account_row.account_kind = 'finished_goods'
      and account_row.status = 'active'
    for update;
    if not found then
      raise exception 'STORE_WITHDRAWAL_PROCESS_FINISHED_ACCOUNT_INVALID'
        using errcode = 'P0001';
    end if;

    select inventory_row.*
    into v_projection
    from public.business_inventory as inventory_row
    where inventory_row.game_session_id = v_request.game_session_id
      and inventory_row.business_id = v_business.id
      and inventory_row.inventory_account_id = v_finished_account.id
      and inventory_row.game_item_id = v_request.game_item_id
      and inventory_row.inventory_kind = 'finished_good'
    for update;
    if not found then
      raise exception 'STORE_WITHDRAWAL_PROCESS_FINISHED_PROJECTION_MISSING'
        using errcode = 'P0001';
    end if;

    select holding_row.*
    into v_finished_holding
    from public.inventory_holdings as holding_row
    where holding_row.game_session_id = v_request.game_session_id
      and holding_row.inventory_account_id = v_finished_account.id
      and holding_row.game_item_id = v_request.game_item_id
    for update;
    if not found then
      raise exception 'STORE_WITHDRAWAL_PROCESS_FINISHED_HOLDING_MISSING'
        using errcode = 'P0001';
    end if;

    if v_projection.quantity is distinct from v_finished_holding.quantity_owned
      or v_projection.unit_cost is distinct from v_finished_holding.average_unit_cost
      or v_projection.total_cost_basis is distinct from round(
        v_finished_holding.quantity_owned * v_finished_holding.average_unit_cost,
        4
      )
    then
      raise exception 'STORE_WITHDRAWAL_PROCESS_FINISHED_PROJECTION_MISMATCH'
        using errcode = 'P0001';
    end if;

    v_return_quantity := case
      when v_request.mode = 'full' then
        greatest(floor(v_listing_holding.quantity_owned), 0)::integer
      else
        least(
          v_request.requested_quantity,
          greatest(floor(v_listing_holding.quantity_owned), 0)::integer
        )
    end;

    v_cost_currency := coalesce(
      v_listing_holding.cost_currency_code,
      v_business.currency_code
    );
    if v_cost_currency is distinct from v_business.currency_code then
      raise exception 'STORE_WITHDRAWAL_PROCESS_COST_CURRENCY_MISMATCH'
        using errcode = 'P0001';
    end if;

    v_transaction_id := null;
    v_transaction_key := null;
    if v_return_quantity > 0 then
      v_metadata := jsonb_build_object(
        'authority', 'store_withdrawal_v2',
        'businessKey', v_business.public_key,
        'offerKey', v_offer.public_key,
        'withdrawalRequestKey', v_request.public_key,
        'mode', v_request.mode,
        'requestedQuantity', v_request.requested_quantity,
        'returnedQuantity', v_return_quantity
      );
      v_lines := jsonb_build_array(
        jsonb_build_object(
          'inventoryAccountId', v_listing_account.id,
          'gameItemId', v_request.game_item_id,
          'quantityDelta', -v_return_quantity,
          'reservationDelta', 0,
          'currencyCode', v_cost_currency,
          'metadata', jsonb_build_object(
            'role', 'store_listing_source',
            'businessKey', v_business.public_key,
            'offerKey', v_offer.public_key,
            'withdrawalRequestKey', v_request.public_key
          )
        ),
        jsonb_build_object(
          'inventoryAccountId', v_finished_account.id,
          'gameItemId', v_request.game_item_id,
          'quantityDelta', v_return_quantity,
          'reservationDelta', 0,
          'unitCost', v_listing_holding.average_unit_cost,
          'currencyCode', v_cost_currency,
          'metadata', jsonb_build_object(
            'role', 'finished_goods_destination',
            'businessKey', v_business.public_key,
            'offerKey', v_offer.public_key,
            'withdrawalRequestKey', v_request.public_key
          )
        )
      );

      v_posting := economy_private.post_inventory_transaction_v2(
        v_request.game_session_id,
        'transfer',
        'business_store',
        'withdraw_offer',
        v_request.id,
        'withdraw:' || v_request.public_key,
        v_metadata,
        v_lines
      );

      select transaction_row.id, transaction_row.public_key
      into v_transaction_id, v_transaction_key
      from public.inventory_transactions as transaction_row
      where transaction_row.game_session_id = v_request.game_session_id
        and transaction_row.public_key = v_posting->>'transactionKey'
        and transaction_row.source_domain = 'business_store'
        and transaction_row.source_action = 'withdraw_offer'
        and transaction_row.source_id = v_request.id
      for update;
      if not found then
        raise exception 'STORE_WITHDRAWAL_PROCESS_TRANSACTION_MISSING'
          using errcode = 'P0001';
      end if;
    end if;

    select holding_row.*
    into v_finished_holding_after
    from public.inventory_holdings as holding_row
    where holding_row.game_session_id = v_request.game_session_id
      and holding_row.inventory_account_id = v_finished_account.id
      and holding_row.game_item_id = v_request.game_item_id;
    if not found then
      raise exception 'STORE_WITHDRAWAL_PROCESS_FINISHED_HOLDING_MISSING_AFTER_POST'
        using errcode = 'P0001';
    end if;

    select holding_row.*
    into v_listing_holding_after
    from public.inventory_holdings as holding_row
    where holding_row.game_session_id = v_request.game_session_id
      and holding_row.inventory_account_id = v_listing_account.id
      and holding_row.game_item_id = v_request.game_item_id;
    if not found then
      raise exception 'STORE_WITHDRAWAL_PROCESS_LISTING_HOLDING_MISSING_AFTER_POST'
        using errcode = 'P0001';
    end if;

    if v_return_quantity > 0 then
      update public.business_inventory as inventory_row
      set
        quantity = v_finished_holding_after.quantity_owned,
        unit_cost = v_finished_holding_after.average_unit_cost,
        total_cost_basis = round(
          v_finished_holding_after.quantity_owned
            * v_finished_holding_after.average_unit_cost,
          4
        ),
        version = inventory_row.version + 1,
        updated_at = statement_timestamp()
      where inventory_row.id = v_projection.id
      returning * into v_projection;
      if not found then
        raise exception 'STORE_WITHDRAWAL_PROCESS_FINISHED_PROJECTION_UPDATE_FAILED'
          using errcode = 'P0001';
      end if;
    end if;

    if v_projection.quantity is distinct from v_finished_holding_after.quantity_owned
      or v_projection.unit_cost is distinct from v_finished_holding_after.average_unit_cost
      or v_projection.total_cost_basis is distinct from round(
        v_finished_holding_after.quantity_owned
          * v_finished_holding_after.average_unit_cost,
        4
      )
    then
      raise exception 'STORE_WITHDRAWAL_PROCESS_FINISHED_PROJECTION_UPDATE_INVALID'
        using errcode = 'P0001';
    end if;

    update public.store_offer_withdrawal_requests as request_row
    set
      status = 'completed',
      next_attempt_at = null,
      last_attempt_at = v_now,
      last_block_reason = null,
      attempt_count = request_row.attempt_count + 1,
      completed_at = v_now,
      returned_quantity = v_return_quantity,
      inventory_transaction_id = v_transaction_id,
      version = request_row.version + 1
    where request_row.id = v_request.id
    returning * into v_request;

    v_next_status := case
      when v_request.mode = 'full' then 'paused'
      else v_request.resume_status
    end;
    if v_next_status = 'active'
      and (
        v_listing_holding_after.quantity_owned
          - v_listing_holding_after.quantity_reserved
      ) <= 0
    then
      v_next_status := 'paused';
    end if;

    update public.store_seller_offers as offer_row
    set
      status = v_next_status,
      withdrawal_request_id = null,
      withdrawal_requested_at = null,
      withdrawal_effective_at = null,
      withdrawal_resume_status = null,
      withdrawal_mode = null,
      withdrawal_requested_quantity = null,
      version = offer_row.version + 1
    where offer_row.id = v_offer.id
    returning * into v_offer;

    v_completed_count := v_completed_count + 1;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'requestKey', v_request.public_key,
      'offerKey', v_offer.public_key,
      'outcome', 'completed',
      'mode', v_request.mode,
      'returnedQuantity', v_request.returned_quantity,
      'remainingListedQuantity', v_listing_holding_after.quantity_owned,
      'offerStatus', v_offer.status,
      'offerVersion', v_offer.version,
      'inventoryAccountKey', v_listing_account.public_key,
      'transactionKey', v_transaction_key,
      'completedAt', v_request.completed_at
    ));
  end loop;

  return jsonb_build_object(
    'asOf', v_now,
    'selectedCount', v_selected_count,
    'completedCount', v_completed_count,
    'blockedCount', v_blocked_count,
    'results', v_results
  );
end
$function$;

revoke all on function public.process_due_store_offer_withdrawals_v2(integer)
  from public, anon, authenticated;
grant execute on function public.process_due_store_offer_withdrawals_v2(integer)
  to service_role;

commit;
