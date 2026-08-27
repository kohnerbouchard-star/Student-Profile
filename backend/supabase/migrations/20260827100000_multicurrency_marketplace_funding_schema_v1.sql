-- Econovaria Business V2 Phase 10A.4C2: Marketplace funding evidence.
--
-- Existing Marketplace listings, reservations, orders, disputes, and historical
-- one-sided ledger evidence remain readable. New funded reservations and orders
-- bind immutably to C0 funding and canonical B2 Banking evidence instead of
-- fabricating representative buyer/seller ledger-entry identifiers.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

create or replace function private.marketplace_funding_normalize_allocations_v1(
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
    raise exception 'MARKETPLACE_FUNDING_ALLOCATIONS_INVALID'
      using errcode = '22023';
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
    raise exception 'MARKETPLACE_FUNDING_ALLOCATIONS_INVALID'
      using errcode = '22023';
  end if;

  return v_result;
end;
$function$;

revoke all on function private.marketplace_funding_normalize_allocations_v1(jsonb)
  from public, anon, authenticated, service_role;

alter table public.marketplace_purchase_reservations
  add column if not exists funding_quote_id uuid null,
  add column if not exists funding_context_hash text null,
  add column if not exists settlement_clearing_account_id uuid null,
  add column if not exists seller_bank_account_id uuid null,
  add column if not exists fee_bank_account_id uuid null,
  add column if not exists tax_bank_account_id uuid null,
  add column if not exists funding_idempotency_key text null,
  add column if not exists policy_evidence_hash text null;

alter table public.marketplace_purchase_reservations
  add constraint marketplace_reservations_funding_quote_scope_fk
    foreign key (funding_quote_id, game_session_id)
    references public.purchase_funding_quotes(id, game_session_id)
    on delete restrict,
  add constraint marketplace_reservations_settlement_account_scope_fk
    foreign key (settlement_clearing_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id)
    on delete restrict,
  add constraint marketplace_reservations_seller_account_scope_fk
    foreign key (seller_bank_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id)
    on delete restrict,
  add constraint marketplace_reservations_fee_account_scope_fk
    foreign key (fee_bank_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id)
    on delete restrict,
  add constraint marketplace_reservations_tax_account_scope_fk
    foreign key (tax_bank_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id)
    on delete restrict,
  add constraint marketplace_reservations_funding_binding_check
    check (
      (
        funding_quote_id is null
        and funding_context_hash is null
        and settlement_clearing_account_id is null
        and seller_bank_account_id is null
        and fee_bank_account_id is null
        and tax_bank_account_id is null
        and funding_idempotency_key is null
        and policy_evidence_hash is null
      )
      or (
        funding_quote_id is not null
        and funding_context_hash ~ '^[0-9a-f]{64}$'
        and settlement_clearing_account_id is not null
        and seller_bank_account_id is not null
        and fee_bank_account_id is not null
        and tax_bank_account_id is not null
        and length(btrim(funding_idempotency_key)) between 8 and 160
        and policy_evidence_hash ~ '^[0-9a-f]{64}$'
      )
    );

create unique index if not exists marketplace_reservations_funding_quote_unique
  on public.marketplace_purchase_reservations(funding_quote_id)
  where funding_quote_id is not null;

alter table public.marketplace_orders
  add column if not exists funding_receipt_id uuid null,
  add column if not exists funding_bank_transaction_id uuid null,
  add column if not exists distribution_bank_transaction_id uuid null,
  add column if not exists settlement_clearing_account_id uuid null,
  add column if not exists seller_bank_account_id uuid null,
  add column if not exists fee_bank_account_id uuid null,
  add column if not exists tax_bank_account_id uuid null,
  add column if not exists settlement_idempotency_key text null,
  add column if not exists settlement_request_hash text null;

alter table public.marketplace_orders
  drop constraint if exists marketplace_orders_ledger_state_valid;

alter table public.marketplace_orders
  add constraint marketplace_orders_funding_receipt_scope_fk
    foreign key (funding_receipt_id, game_session_id)
    references public.purchase_funding_receipts(id, game_session_id)
    on delete restrict,
  add constraint marketplace_orders_funding_transaction_scope_fk
    foreign key (funding_bank_transaction_id, game_session_id)
    references public.bank_transactions(id, game_session_id)
    on delete restrict,
  add constraint marketplace_orders_distribution_transaction_scope_fk
    foreign key (distribution_bank_transaction_id, game_session_id)
    references public.bank_transactions(id, game_session_id)
    on delete restrict,
  add constraint marketplace_orders_settlement_account_scope_fk
    foreign key (settlement_clearing_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id)
    on delete restrict,
  add constraint marketplace_orders_seller_account_scope_fk
    foreign key (seller_bank_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id)
    on delete restrict,
  add constraint marketplace_orders_fee_account_scope_fk
    foreign key (fee_bank_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id)
    on delete restrict,
  add constraint marketplace_orders_tax_account_scope_fk
    foreign key (tax_bank_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id)
    on delete restrict,
  add constraint marketplace_orders_payment_evidence_check
    check (
      status = 'settling'
      or (
        buyer_ledger_entry_id is not null
        and seller_ledger_entry_id is not null
        and funding_receipt_id is null
        and funding_bank_transaction_id is null
        and distribution_bank_transaction_id is null
        and settlement_clearing_account_id is null
        and seller_bank_account_id is null
        and fee_bank_account_id is null
        and tax_bank_account_id is null
        and settlement_idempotency_key is null
        and settlement_request_hash is null
      )
      or (
        buyer_ledger_entry_id is null
        and seller_ledger_entry_id is null
        and funding_receipt_id is not null
        and funding_bank_transaction_id is not null
        and distribution_bank_transaction_id is not null
        and settlement_clearing_account_id is not null
        and seller_bank_account_id is not null
        and fee_bank_account_id is not null
        and tax_bank_account_id is not null
        and length(btrim(settlement_idempotency_key)) between 8 and 200
        and settlement_request_hash ~ '^[0-9a-f]{64}$'
      )
    );

create unique index if not exists marketplace_orders_funding_receipt_unique
  on public.marketplace_orders(funding_receipt_id)
  where funding_receipt_id is not null;

create unique index if not exists marketplace_orders_distribution_transaction_unique
  on public.marketplace_orders(distribution_bank_transaction_id)
  where distribution_bank_transaction_id is not null;

create unique index if not exists marketplace_orders_funded_settlement_idempotency_unique
  on public.marketplace_orders(
    game_session_id, buyer_player_id, settlement_idempotency_key
  )
  where settlement_idempotency_key is not null;

create table public.marketplace_funding_refunds (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'mfr_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  order_id uuid not null,
  dispute_id uuid not null,
  funding_receipt_id uuid not null,
  distribution_reversal_transaction_id uuid not null,
  funding_reversal_transaction_id uuid not null,
  idempotency_key text not null,
  request_hash text not null,
  evidence_hash text not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint marketplace_funding_refunds_scope_id_unique
    unique (id, game_session_id),
  constraint marketplace_funding_refunds_public_key_format
    check (public_key ~ '^mfr_[0-9a-f]{32}$'),
  constraint marketplace_funding_refunds_order_scope_fk
    foreign key (order_id, game_session_id)
    references public.marketplace_orders(id, game_session_id)
    on delete restrict,
  constraint marketplace_funding_refunds_order_unique unique (order_id),
  constraint marketplace_funding_refunds_dispute_scope_fk
    foreign key (dispute_id, game_session_id)
    references public.marketplace_disputes(id, game_session_id)
    on delete restrict,
  constraint marketplace_funding_refunds_dispute_unique unique (dispute_id),
  constraint marketplace_funding_refunds_receipt_scope_fk
    foreign key (funding_receipt_id, game_session_id)
    references public.purchase_funding_receipts(id, game_session_id)
    on delete restrict,
  constraint marketplace_funding_refunds_receipt_unique unique (funding_receipt_id),
  constraint marketplace_funding_refunds_distribution_transaction_scope_fk
    foreign key (distribution_reversal_transaction_id, game_session_id)
    references public.bank_transactions(id, game_session_id)
    on delete restrict,
  constraint marketplace_funding_refunds_distribution_transaction_unique
    unique (distribution_reversal_transaction_id),
  constraint marketplace_funding_refunds_funding_transaction_scope_fk
    foreign key (funding_reversal_transaction_id, game_session_id)
    references public.bank_transactions(id, game_session_id)
    on delete restrict,
  constraint marketplace_funding_refunds_funding_transaction_unique
    unique (funding_reversal_transaction_id),
  constraint marketplace_funding_refunds_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 200),
  constraint marketplace_funding_refunds_idempotency_unique
    unique (game_session_id, idempotency_key),
  constraint marketplace_funding_refunds_request_hash_format
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint marketplace_funding_refunds_evidence_hash_format
    check (evidence_hash ~ '^[0-9a-f]{64}$')
);

create index marketplace_funding_refunds_created_idx
  on public.marketplace_funding_refunds(
    game_session_id, created_at desc, public_key desc
  );

alter table public.marketplace_funding_refunds enable row level security;
alter table public.marketplace_funding_refunds force row level security;
revoke all on table public.marketplace_funding_refunds
  from public, anon, authenticated, service_role;
grant select on table public.marketplace_funding_refunds to service_role;

comment on table public.marketplace_funding_refunds is
  'Immutable evidence that one funded Marketplace order reversed its original distribution and original C0 funding transaction without current-rate repricing.';

create or replace function private.reject_marketplace_funding_evidence_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if tg_op = 'DELETE'
     and not exists (
       select 1
       from public.game_sessions as game_row
       where game_row.id = old.game_session_id
     )
  then
    return old;
  end if;

  raise exception 'MARKETPLACE_FUNDING_EVIDENCE_IMMUTABLE'
    using errcode = '42501';
end;
$function$;

revoke all on function private.reject_marketplace_funding_evidence_mutation_v1()
  from public, anon, authenticated, service_role;

create trigger guard_marketplace_funding_refunds_immutable
before update or delete on public.marketplace_funding_refunds
for each row execute function private.reject_marketplace_funding_evidence_mutation_v1();

create or replace function private.guard_marketplace_funding_binding_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_write_authorized boolean :=
    coalesce(current_setting('app.marketplace_funding_write_v1', true), '') = 'on';
begin
  if tg_table_name = 'marketplace_purchase_reservations' then
    if tg_op = 'INSERT' then
      if new.funding_quote_id is not null and not v_write_authorized then
        raise exception 'MARKETPLACE_FUNDING_DIRECT_WRITE_FORBIDDEN'
          using errcode = '42501';
      end if;
      return new;
    end if;

    if old.funding_quote_id is not null and (
      new.funding_quote_id is distinct from old.funding_quote_id
      or new.funding_context_hash is distinct from old.funding_context_hash
      or new.settlement_clearing_account_id is distinct from old.settlement_clearing_account_id
      or new.seller_bank_account_id is distinct from old.seller_bank_account_id
      or new.fee_bank_account_id is distinct from old.fee_bank_account_id
      or new.tax_bank_account_id is distinct from old.tax_bank_account_id
      or new.funding_idempotency_key is distinct from old.funding_idempotency_key
      or new.policy_evidence_hash is distinct from old.policy_evidence_hash
    ) then
      raise exception 'MARKETPLACE_FUNDING_BINDING_IMMUTABLE'
        using errcode = '42501';
    end if;

    if old.funding_quote_id is null
       and new.funding_quote_id is not null
       and not v_write_authorized
    then
      raise exception 'MARKETPLACE_FUNDING_DIRECT_WRITE_FORBIDDEN'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_name = 'marketplace_orders' then
    if tg_op = 'INSERT' then
      if new.funding_receipt_id is not null and not v_write_authorized then
        raise exception 'MARKETPLACE_FUNDING_DIRECT_WRITE_FORBIDDEN'
          using errcode = '42501';
      end if;
      return new;
    end if;

    if old.funding_receipt_id is not null and (
      new.funding_receipt_id is distinct from old.funding_receipt_id
      or new.funding_bank_transaction_id is distinct from old.funding_bank_transaction_id
      or new.distribution_bank_transaction_id is distinct from old.distribution_bank_transaction_id
      or new.settlement_clearing_account_id is distinct from old.settlement_clearing_account_id
      or new.seller_bank_account_id is distinct from old.seller_bank_account_id
      or new.fee_bank_account_id is distinct from old.fee_bank_account_id
      or new.tax_bank_account_id is distinct from old.tax_bank_account_id
      or new.settlement_idempotency_key is distinct from old.settlement_idempotency_key
      or new.settlement_request_hash is distinct from old.settlement_request_hash
    ) then
      raise exception 'MARKETPLACE_FUNDING_BINDING_IMMUTABLE'
        using errcode = '42501';
    end if;

    if old.funding_receipt_id is null
       and new.funding_receipt_id is not null
       and not v_write_authorized
    then
      raise exception 'MARKETPLACE_FUNDING_DIRECT_WRITE_FORBIDDEN'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'MARKETPLACE_FUNDING_GUARD_SCOPE_INVALID'
    using errcode = '42501';
end;
$function$;

revoke all on function private.guard_marketplace_funding_binding_v1()
  from public, anon, authenticated, service_role;

create trigger marketplace_reservations_funding_binding_guard
before insert or update on public.marketplace_purchase_reservations
for each row execute function private.guard_marketplace_funding_binding_v1();

create trigger marketplace_orders_funding_binding_guard
before insert or update on public.marketplace_orders
for each row execute function private.guard_marketplace_funding_binding_v1();

comment on column public.marketplace_purchase_reservations.funding_quote_id is
  'Immutable C0 funding quote for the exact Marketplace buyer total.';
comment on column public.marketplace_orders.funding_receipt_id is
  'C0 receipt proving the buyer-funded exact Marketplace total.';
comment on column public.marketplace_orders.distribution_bank_transaction_id is
  'Balanced B2 transaction distributing exact seller proceeds, Marketplace fee, and tax from settlement clearing.';

commit;
