-- Business V2 Phase 9A: service-only withdrawal request command.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.request_business_store_offer_withdrawal_v2(
  p_game_session_id uuid,
  p_business_key text,
  p_offer_key text,
  p_mode text,
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
  v_holding public.inventory_holdings%rowtype;
  v_request public.store_offer_withdrawal_requests%rowtype;
  v_transaction_key text;
  v_mode text;
  v_available integer;
  v_hash text;
  v_lock_key bigint;
begin
  v_mode := lower(btrim(coalesce(p_mode, '')));
  if p_game_session_id is null
    or coalesce(btrim(p_business_key), '') !~ '^biz_[0-9a-f]{32}$'
    or coalesce(btrim(p_offer_key), '') !~ '^sof_[0-9a-f]{32}$'
    or v_mode not in ('full','reduce')
    or (v_mode = 'full' and p_quantity is not null)
    or (v_mode = 'reduce' and (p_quantity is null or p_quantity <= 0))
    or p_expected_offer_version is null
    or p_expected_offer_version < 1
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160
  then
    raise exception 'STORE_WITHDRAWAL_REQUEST_INVALID'
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
    raise exception 'STORE_WITHDRAWAL_BUSINESS_NOT_FOUND'
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
    raise exception 'STORE_WITHDRAWAL_BUSINESS_PARTY_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select offer_row.*
  into v_offer
  from public.store_seller_offers as offer_row
  where offer_row.game_session_id = p_game_session_id
    and offer_row.public_key = lower(btrim(p_offer_key))
    and offer_row.seller_kind = 'business'
    and offer_row.seller_party_id = v_party.id
  for update;
  if not found then
    raise exception 'STORE_WITHDRAWAL_OFFER_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to(
        concat_ws('|',
          p_game_session_id::text,
          v_business.id::text,
          v_offer.id::text,
          v_mode,
          coalesce(p_quantity::text, ''),
          p_expected_offer_version::text
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
      btrim(p_idempotency_key)
    ),
    0
  );
  perform pg_advisory_xact_lock(v_lock_key);

  -- The offer row is already locked. Do not lock the request row here:
  -- due processors intentionally lock request -> offer, and an idempotent
  -- replay-side request lock would invert that order and permit a deadlock.
  select request_row.*
  into v_request
  from public.store_offer_withdrawal_requests as request_row
  where request_row.game_session_id = p_game_session_id
    and request_row.seller_party_id = v_party.id
    and request_row.request_idempotency_key = btrim(p_idempotency_key);
  if found then
    if v_request.offer_id is distinct from v_offer.id
      or v_request.request_hash is distinct from v_hash
    then
      raise exception 'STORE_WITHDRAWAL_IDEMPOTENCY_CONFLICT'
        using errcode = 'P0001';
    end if;

    v_transaction_key := null;
    if v_request.inventory_transaction_id is not null then
      select transaction_row.public_key
      into v_transaction_key
      from public.inventory_transactions as transaction_row
      where transaction_row.id = v_request.inventory_transaction_id
        and transaction_row.game_session_id = p_game_session_id;
    end if;

    return jsonb_build_object(
      'requestKey', v_request.public_key,
      'requestStatus', v_request.status,
      'offerKey', v_offer.public_key,
      'offerStatus', v_offer.status,
      'offerVersion', v_offer.version,
      'mode', v_request.mode,
      'requestedQuantity', v_request.requested_quantity,
      'requestedAt', v_request.requested_at,
      'effectiveAt', v_request.effective_at,
      'nextAttemptAt', v_request.next_attempt_at,
      'returnedQuantity', v_request.returned_quantity,
      'transactionKey', v_transaction_key,
      'replayed', true
    );
  end if;

  if v_offer.version <> p_expected_offer_version then
    raise exception 'STORE_WITHDRAWAL_OFFER_VERSION_CONFLICT'
      using errcode = 'P0001';
  end if;

  if v_offer.status not in ('draft','active','paused')
    or v_offer.withdrawal_request_id is not null
  then
    raise exception 'STORE_WITHDRAWAL_OFFER_STATUS_INVALID'
      using errcode = 'P0001';
  end if;

  if v_offer.inventory_account_id is null then
    raise exception 'STORE_WITHDRAWAL_OFFER_CUSTODY_MISSING'
      using errcode = 'P0001';
  end if;

  select account_row.*
  into v_account
  from public.inventory_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.id = v_offer.inventory_account_id
    and account_row.party_id = v_party.id
    and account_row.account_kind = 'store_stock'
    and account_row.location_key = 'store_offer:' || v_offer.public_key
    and account_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_WITHDRAWAL_ACCOUNT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select holding_row.*
  into v_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_account.id
    and holding_row.game_item_id = v_offer.game_item_id
  for update;
  if not found then
    raise exception 'STORE_WITHDRAWAL_LISTING_HOLDING_MISSING'
      using errcode = 'P0001';
  end if;

  v_available := greatest(
    floor(v_holding.quantity_owned - v_holding.quantity_reserved),
    0
  )::integer;
  if v_mode = 'reduce' and p_quantity > v_available then
    raise exception 'STORE_WITHDRAWAL_REDUCTION_EXCEEDS_AVAILABLE'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.store_offer_withdrawal_requests as request_row
    where request_row.game_session_id = p_game_session_id
      and request_row.offer_id = v_offer.id
      and request_row.status = 'pending'
  ) then
    raise exception 'STORE_WITHDRAWAL_PENDING_EXISTS'
      using errcode = 'P0001';
  end if;

  insert into public.store_offer_withdrawal_requests(
    game_session_id,
    offer_id,
    business_id,
    seller_party_id,
    game_item_id,
    inventory_account_id,
    mode,
    requested_quantity,
    resume_status,
    status,
    offer_version_at_request,
    request_idempotency_key,
    request_hash,
    effective_at,
    metadata
  ) values (
    p_game_session_id,
    v_offer.id,
    v_business.id,
    v_party.id,
    v_offer.game_item_id,
    v_account.id,
    v_mode,
    case when v_mode = 'reduce' then p_quantity else null end,
    v_offer.status,
    'pending',
    v_offer.version + 1,
    btrim(p_idempotency_key),
    v_hash,
    statement_timestamp() + interval '5 minutes',
    jsonb_build_object(
      'authority', 'store_withdrawal_v2',
      'businessKey', v_business.public_key,
      'offerKey', v_offer.public_key
    )
  )
  returning * into v_request;

  update public.store_seller_offers as offer_row
  set
    status = 'withdrawal_pending',
    withdrawal_request_id = v_request.id,
    withdrawal_requested_at = v_request.requested_at,
    withdrawal_effective_at = v_request.effective_at,
    withdrawal_resume_status = v_request.resume_status,
    withdrawal_mode = v_request.mode,
    withdrawal_requested_quantity = v_request.requested_quantity,
    version = offer_row.version + 1
  where offer_row.id = v_offer.id
  returning * into v_offer;

  return jsonb_build_object(
    'requestKey', v_request.public_key,
    'requestStatus', v_request.status,
    'offerKey', v_offer.public_key,
    'offerStatus', case
      when v_request.status = 'pending' then 'withdrawal_pending'
      else v_request.completion_offer_status
    end,
    'offerVersion', case
      when v_request.status = 'pending' then v_request.offer_version_at_request
      else v_request.completion_offer_version
    end,
    'mode', v_request.mode,
    'requestedQuantity', v_request.requested_quantity,
    'requestedAt', v_request.requested_at,
    'effectiveAt', v_request.effective_at,
    'nextAttemptAt', v_request.next_attempt_at,
    'returnedQuantity', null,
    'transactionKey', null,
    'replayed', false
  );
end
$function$;

revoke all on function public.request_business_store_offer_withdrawal_v2(
  uuid, text, text, text, integer, bigint, text
) from public, anon, authenticated;
grant execute on function public.request_business_store_offer_withdrawal_v2(
  uuid, text, text, text, integer, bigint, text
) to service_role;

commit;
