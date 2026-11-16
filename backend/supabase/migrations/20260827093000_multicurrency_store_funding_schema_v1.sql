-- Econovaria Business V2 Phase 10A.4C1: Store-owned funding bindings.
--
-- This forward migration links existing seeded/NPC and Business Store quote and
-- receipt identities to the certified C0 purchase-funding authority. Existing
-- pre-C1 rows remain readable through nullable compatibility columns.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

create or replace function private.store_funding_normalize_allocations_v1(
  p_allocations jsonb
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = pg_catalog, private, pg_temp
as $function$
declare
  v_result jsonb;
  v_count integer;
  v_distinct_count integer;
begin
  if jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'STORE_FUNDING_ALLOCATIONS_INVALID' using errcode = '22023';
  end if;

  select
    count(*),
    count(distinct lower(btrim(allocation.value ->> 'sourceAccountKey'))),
    jsonb_agg(
      jsonb_build_object(
        'sourceAccountKey', lower(btrim(allocation.value ->> 'sourceAccountKey')),
        'targetAmount', ((allocation.value ->> 'targetAmount')::numeric)::text
      )
      order by lower(btrim(allocation.value ->> 'sourceAccountKey'))
    )
  into v_count, v_distinct_count, v_result
  from jsonb_array_elements(p_allocations) as allocation(value)
  where jsonb_typeof(allocation.value) = 'object'
    and lower(btrim(coalesce(allocation.value ->> 'sourceAccountKey', '')))
      ~ '^bac_[0-9a-f]{32}$'
    and coalesce(allocation.value ->> 'targetAmount', '')
      ~ '^[0-9]+(?:\.[0-9]+)?$'
    and (allocation.value ->> 'targetAmount')::numeric > 0;

  if v_count not between 1 and 3
     or v_count <> jsonb_array_length(p_allocations)
     or v_distinct_count <> v_count
     or v_result is null
  then
    raise exception 'STORE_FUNDING_ALLOCATIONS_INVALID' using errcode = '22023';
  end if;

  return v_result;
end;
$function$;

revoke all on function private.store_funding_normalize_allocations_v1(jsonb)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Seeded/NPC Store quote and purchase bindings.
-- ---------------------------------------------------------------------------

alter table public.store_purchase_quotes
  add column if not exists request_idempotency_key text null,
  add column if not exists request_hash text null,
  add column if not exists funding_quote_id uuid null,
  add column if not exists funding_context_hash text null,
  add column if not exists target_bank_account_id uuid null,
  add column if not exists funding_idempotency_key text null;

alter table public.store_purchase_quotes
  add constraint store_purchase_quotes_funding_quote_scope_fk
    foreign key (funding_quote_id, game_session_id)
    references public.purchase_funding_quotes(id, game_session_id)
    on delete restrict,
  add constraint store_purchase_quotes_target_bank_account_scope_fk
    foreign key (target_bank_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id)
    on delete restrict,
  add constraint store_purchase_quotes_funding_binding_check
    check (
      (
        funding_quote_id is null
        and funding_context_hash is null
        and target_bank_account_id is null
        and funding_idempotency_key is null
        and request_idempotency_key is null
        and request_hash is null
      )
      or (
        funding_quote_id is not null
        and funding_context_hash ~ '^[0-9a-f]{64}$'
        and target_bank_account_id is not null
        and length(btrim(funding_idempotency_key)) between 8 and 160
        and length(btrim(request_idempotency_key)) between 8 and 160
        and request_hash ~ '^[0-9a-f]{64}$'
        and currency_code = item_currency_code
        and player_currency_code = currency_code
        and exchange_rate = 1
        and final_unit_price = item_local_final_unit_price
        and final_total_price = item_local_final_total_price
      )
    );

create unique index if not exists store_purchase_quotes_funding_quote_unique
  on public.store_purchase_quotes(funding_quote_id)
  where funding_quote_id is not null;

create unique index if not exists store_purchase_quotes_funding_idempotency_unique
  on public.store_purchase_quotes(
    game_session_id, player_id, request_idempotency_key
  )
  where request_idempotency_key is not null;

alter table public.store_purchases
  add column if not exists funding_receipt_id uuid null,
  add column if not exists bank_transaction_id uuid null,
  add column if not exists target_bank_account_id uuid null,
  add column if not exists inventory_transaction_id uuid null;

alter table public.store_purchases
  drop constraint if exists store_purchases_completed_requires_ledger;

alter table public.store_purchases
  add constraint store_purchases_funding_receipt_scope_fk
    foreign key (funding_receipt_id, game_session_id)
    references public.purchase_funding_receipts(id, game_session_id)
    on delete restrict,
  add constraint store_purchases_bank_transaction_scope_fk
    foreign key (bank_transaction_id, game_session_id)
    references public.bank_transactions(id, game_session_id)
    on delete restrict,
  add constraint store_purchases_target_bank_account_scope_fk
    foreign key (target_bank_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id)
    on delete restrict,
  add constraint store_purchases_inventory_transaction_scope_fk
    foreign key (game_session_id, inventory_transaction_id)
    references public.inventory_transactions(game_session_id, id)
    on delete restrict,
  add constraint store_purchases_payment_evidence_check
    check (
      status <> 'COMPLETED'
      or (
        ledger_entry_id is not null
        and funding_receipt_id is null
        and bank_transaction_id is null
        and target_bank_account_id is null
      )
      or (
        ledger_entry_id is null
        and funding_receipt_id is not null
        and bank_transaction_id is not null
        and target_bank_account_id is not null
      )
    );

create unique index if not exists store_purchases_funding_receipt_unique
  on public.store_purchases(funding_receipt_id)
  where funding_receipt_id is not null;

-- ---------------------------------------------------------------------------
-- Business seller-offer Store quote and receipt bindings.
-- ---------------------------------------------------------------------------

alter table public.store_offer_purchase_quotes
  add column if not exists funding_quote_id uuid null,
  add column if not exists funding_context_hash text null,
  add column if not exists target_bank_account_id uuid null,
  add column if not exists funding_idempotency_key text null;

alter table public.store_offer_purchase_quotes
  drop constraint if exists store_offer_purchase_quotes_expiry_check;

alter table public.store_offer_purchase_quotes
  add constraint store_offer_purchase_quotes_funding_quote_scope_fk
    foreign key (funding_quote_id, game_session_id)
    references public.purchase_funding_quotes(id, game_session_id)
    on delete restrict,
  add constraint store_offer_purchase_quotes_target_bank_account_scope_fk
    foreign key (target_bank_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id)
    on delete restrict,
  add constraint store_offer_purchase_quotes_expiry_check
    check (
      expires_at > created_at
      and expires_at <= created_at + interval '2 minutes'
    ),
  add constraint store_offer_purchase_quotes_funding_binding_check
    check (
      (
        funding_quote_id is null
        and funding_context_hash is null
        and target_bank_account_id is null
        and funding_idempotency_key is null
      )
      or (
        funding_quote_id is not null
        and funding_context_hash ~ '^[0-9a-f]{64}$'
        and target_bank_account_id is not null
        and length(btrim(funding_idempotency_key)) between 8 and 160
        and seller_currency_code = buyer_currency_code
        and exchange_rate = 1
      )
    );

create unique index if not exists store_offer_purchase_quotes_funding_quote_unique
  on public.store_offer_purchase_quotes(funding_quote_id)
  where funding_quote_id is not null;

create or replace function economy_private.guard_store_offer_purchase_quote_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
declare
  v_transition text;
begin
  if tg_op = 'DELETE' then
    raise exception 'STORE_OFFER_QUOTE_DELETE_FORBIDDEN' using errcode = '42501';
  end if;
  if old.status <> 'created' then
    raise exception 'STORE_OFFER_QUOTE_TERMINAL_IMMUTABLE' using errcode = '42501';
  end if;
  if new.id is distinct from old.id
    or new.public_key is distinct from old.public_key
    or new.game_session_id is distinct from old.game_session_id
    or new.buyer_player_id is distinct from old.buyer_player_id
    or new.buyer_country_profile_id is distinct from old.buyer_country_profile_id
    or new.buyer_country_code is distinct from old.buyer_country_code
    or new.offer_id is distinct from old.offer_id
    or new.business_id is distinct from old.business_id
    or new.seller_party_id is distinct from old.seller_party_id
    or new.store_item_id is distinct from old.store_item_id
    or new.game_item_id is distinct from old.game_item_id
    or new.inventory_account_id is distinct from old.inventory_account_id
    or new.quantity is distinct from old.quantity
    or new.offer_version is distinct from old.offer_version
    or new.available_quantity_at_quote is distinct from old.available_quantity_at_quote
    or new.seller_unit_price is distinct from old.seller_unit_price
    or new.final_unit_price is distinct from old.final_unit_price
    or new.seller_total_price is distinct from old.seller_total_price
    or new.final_total_price is distinct from old.final_total_price
    or new.seller_currency_code is distinct from old.seller_currency_code
    or new.buyer_currency_code is distinct from old.buyer_currency_code
    or new.exchange_rate is distinct from old.exchange_rate
    or new.pricing_version is distinct from old.pricing_version
    or new.request_idempotency_key is distinct from old.request_idempotency_key
    or new.request_hash is distinct from old.request_hash
    or new.created_at is distinct from old.created_at
    or new.expires_at is distinct from old.expires_at
    or new.metadata is distinct from old.metadata
    or new.funding_quote_id is distinct from old.funding_quote_id
    or new.funding_context_hash is distinct from old.funding_context_hash
    or new.target_bank_account_id is distinct from old.target_bank_account_id
    or new.funding_idempotency_key is distinct from old.funding_idempotency_key
  then
    raise exception 'STORE_OFFER_QUOTE_IDENTITY_IMMUTABLE' using errcode = '42501';
  end if;
  if new.version <> old.version + 1 then
    raise exception 'STORE_OFFER_QUOTE_VERSION_INVALID' using errcode = 'P0001';
  end if;
  v_transition := old.status || '->' || new.status;
  if v_transition = 'created->used'
    and new.used_at >= old.created_at
    and new.used_at < old.expires_at
    and new.expired_at is null
    and new.cancelled_at is null
  then
    null;
  elsif v_transition = 'created->expired'
    and new.used_at is null
    and new.expired_at >= old.expires_at
    and new.cancelled_at is null
  then
    null;
  elsif v_transition = 'created->cancelled'
    and new.used_at is null
    and new.expired_at is null
    and new.cancelled_at >= old.created_at
  then
    null;
  else
    raise exception 'STORE_OFFER_QUOTE_TRANSITION_INVALID:%', v_transition
      using errcode = 'P0001';
  end if;
  new.updated_at := statement_timestamp();
  return new;
end
$function$;

alter table public.store_offer_purchase_receipts
  alter column buyer_debit_ledger_entry_id drop not null,
  alter column business_credit_ledger_entry_id drop not null,
  add column if not exists funding_receipt_id uuid null,
  add column if not exists bank_transaction_id uuid null,
  add column if not exists target_bank_account_id uuid null;

alter table public.store_offer_purchase_receipts
  add constraint store_offer_purchase_receipts_funding_receipt_scope_fk
    foreign key (funding_receipt_id, game_session_id)
    references public.purchase_funding_receipts(id, game_session_id)
    on delete restrict,
  add constraint store_offer_purchase_receipts_bank_transaction_scope_fk
    foreign key (bank_transaction_id, game_session_id)
    references public.bank_transactions(id, game_session_id)
    on delete restrict,
  add constraint store_offer_purchase_receipts_target_bank_account_scope_fk
    foreign key (target_bank_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id)
    on delete restrict,
  add constraint store_offer_purchase_receipts_payment_evidence_check
    check (
      (
        funding_receipt_id is null
        and bank_transaction_id is null
        and target_bank_account_id is null
        and buyer_debit_ledger_entry_id is not null
        and business_credit_ledger_entry_id is not null
      )
      or (
        funding_receipt_id is not null
        and bank_transaction_id is not null
        and target_bank_account_id is not null
        and buyer_debit_ledger_entry_id is null
        and business_credit_ledger_entry_id is null
      )
    );

create unique index if not exists store_offer_purchase_receipts_funding_receipt_unique
  on public.store_offer_purchase_receipts(funding_receipt_id)
  where funding_receipt_id is not null;

comment on column public.store_purchase_quotes.funding_quote_id is
  'C0 purchase-funding quote bound immutably to this seeded/NPC Store quote.';
comment on column public.store_offer_purchase_quotes.funding_quote_id is
  'C0 purchase-funding quote bound immutably to this Business seller-offer Store quote.';
comment on column public.store_purchases.funding_receipt_id is
  'C0 funding receipt used instead of a fabricated single-ledger-entry payment for funded Store purchases.';
comment on column public.store_offer_purchase_receipts.funding_receipt_id is
  'C0 funding receipt proving exact Buyer funding and exact Business target-account credit.';

commit;
