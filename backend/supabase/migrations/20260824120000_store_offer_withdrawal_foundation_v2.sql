-- Business V2 Phase 9A: Store-owned withdrawal request authority and lifecycle.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table public.store_offer_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique
    default ('swr_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  offer_id uuid not null
    references public.store_seller_offers(id) on delete restrict,
  business_id uuid not null
    references public.business_entities(id) on delete restrict,
  seller_party_id uuid not null
    references public.economic_parties(id) on delete restrict,
  game_item_id uuid not null
    references public.game_items(id) on delete restrict,
  inventory_account_id uuid not null
    references public.inventory_accounts(id) on delete restrict,
  mode text not null,
  requested_quantity integer null,
  resume_status text not null,
  status text not null default 'pending',
  offer_version_at_request bigint not null,
  completion_offer_status text null,
  completion_offer_version bigint null,
  request_idempotency_key text not null,
  request_hash text not null,
  requested_at timestamptz not null default statement_timestamp(),
  effective_at timestamptz not null,
  next_attempt_at timestamptz null,
  last_attempt_at timestamptz null,
  last_block_reason text null,
  attempt_count integer not null default 0,
  completed_at timestamptz null,
  returned_quantity integer null,
  inventory_transaction_id uuid null
    references public.inventory_transactions(id) on delete restrict,
  version bigint not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint store_offer_withdrawals_public_key_check
    check (public_key ~ '^swr_[0-9a-f]{32}$'),
  constraint store_offer_withdrawals_mode_check
    check (mode in ('full','reduce')),
  constraint store_offer_withdrawals_quantity_check
    check (
      (mode = 'full' and requested_quantity is null)
      or (mode = 'reduce' and requested_quantity > 0)
    ),
  constraint store_offer_withdrawals_resume_status_check
    check (resume_status in ('draft','active','paused')),
  constraint store_offer_withdrawals_status_check
    check (status in ('pending','completed')),
  constraint store_offer_withdrawals_receipt_check
    check (
      offer_version_at_request > 0
      and (
        (
          status = 'pending'
          and completion_offer_status is null
          and completion_offer_version is null
        )
        or (
          status = 'completed'
          and completion_offer_status in ('draft','active','paused')
          and completion_offer_version > offer_version_at_request
        )
      )
    ),
  constraint store_offer_withdrawals_idempotency_check
    check (length(btrim(request_idempotency_key)) between 8 and 160),
  constraint store_offer_withdrawals_request_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint store_offer_withdrawals_effective_time_check
    check (effective_at >= requested_at + interval '5 minutes'),
  constraint store_offer_withdrawals_next_attempt_check
    check (next_attempt_at is null or next_attempt_at >= effective_at),
  constraint store_offer_withdrawals_last_attempt_check
    check (last_attempt_at is null or last_attempt_at >= effective_at),
  constraint store_offer_withdrawals_block_reason_check
    check (last_block_reason is null or last_block_reason = 'inventory_reserved'),
  constraint store_offer_withdrawals_attempt_count_check
    check (attempt_count >= 0),
  constraint store_offer_withdrawals_completion_check
    check (
      (
        status = 'pending'
        and completed_at is null
        and returned_quantity is null
        and inventory_transaction_id is null
      )
      or (
        status = 'completed'
        and completed_at is not null
        and returned_quantity is not null
        and returned_quantity >= 0
        and (
          (returned_quantity = 0 and inventory_transaction_id is null)
          or (returned_quantity > 0 and inventory_transaction_id is not null)
        )
      )
    ),
  constraint store_offer_withdrawals_version_check
    check (version > 0),
  constraint store_offer_withdrawals_metadata_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint store_offer_withdrawals_scope_id_unique
    unique (game_session_id, id),
  constraint store_offer_withdrawals_idempotency_unique
    unique (game_session_id, seller_party_id, request_idempotency_key)
);

create unique index store_offer_withdrawals_pending_offer_unique
  on public.store_offer_withdrawal_requests(game_session_id, offer_id)
  where status = 'pending';

create index store_offer_withdrawals_due_idx
  on public.store_offer_withdrawal_requests(
    status, next_attempt_at, effective_at, public_key
  )
  where status = 'pending';

alter table public.store_seller_offers
  add column withdrawal_request_id uuid null,
  add column withdrawal_requested_at timestamptz null,
  add column withdrawal_effective_at timestamptz null,
  add column withdrawal_resume_status text null,
  add column withdrawal_mode text null,
  add column withdrawal_requested_quantity integer null;

alter table public.store_seller_offers
  add constraint store_seller_offers_withdrawal_request_fk
    foreign key (game_session_id, withdrawal_request_id)
    references public.store_offer_withdrawal_requests(game_session_id, id)
    on delete restrict;

alter table public.store_seller_offers
  drop constraint store_seller_offers_status_check;

alter table public.store_seller_offers
  add constraint store_seller_offers_status_check
    check (status in ('draft','active','paused','withdrawal_pending','retired')),
  add constraint store_seller_offers_withdrawal_resume_status_check
    check (
      withdrawal_resume_status is null
      or withdrawal_resume_status in ('draft','active','paused')
    ),
  add constraint store_seller_offers_withdrawal_mode_check
    check (withdrawal_mode is null or withdrawal_mode in ('full','reduce')),
  add constraint store_seller_offers_withdrawal_quantity_check
    check (
      withdrawal_requested_quantity is null
      or withdrawal_requested_quantity > 0
    ),
  add constraint store_seller_offers_withdrawal_timing_check
    check (
      withdrawal_requested_at is null
      or withdrawal_effective_at >= withdrawal_requested_at + interval '5 minutes'
    ),
  add constraint store_seller_offers_current_withdrawal_check
    check (
      (
        status = 'withdrawal_pending'
        and seller_kind = 'business'
        and inventory_account_id is not null
        and withdrawal_request_id is not null
        and withdrawal_requested_at is not null
        and withdrawal_effective_at is not null
        and withdrawal_resume_status is not null
        and withdrawal_mode is not null
        and (
          (withdrawal_mode = 'full' and withdrawal_requested_quantity is null)
          or (
            withdrawal_mode = 'reduce'
            and withdrawal_requested_quantity > 0
          )
        )
      )
      or (
        status <> 'withdrawal_pending'
        and withdrawal_request_id is null
        and withdrawal_requested_at is null
        and withdrawal_effective_at is null
        and withdrawal_resume_status is null
        and withdrawal_mode is null
        and withdrawal_requested_quantity is null
      )
    );

create unique index store_seller_offers_current_withdrawal_unique
  on public.store_seller_offers(game_session_id, withdrawal_request_id)
  where withdrawal_request_id is not null;

drop index if exists public.store_seller_offers_active_account_unique;
create unique index store_seller_offers_active_account_unique
  on public.store_seller_offers(game_session_id, inventory_account_id)
  where status in ('active','withdrawal_pending')
    and inventory_account_id is not null;

create or replace function economy_private.guard_store_offer_withdrawal_request_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
declare
  v_offer public.store_seller_offers%rowtype;
  v_business public.business_entities%rowtype;
  v_party public.economic_parties%rowtype;
  v_account public.inventory_accounts%rowtype;
  v_transition text;
begin
  select offer_row.*
  into v_offer
  from public.store_seller_offers as offer_row
  where offer_row.id = new.offer_id
    and offer_row.game_session_id = new.game_session_id;
  if not found
    or v_offer.seller_kind <> 'business'
    or v_offer.seller_party_id is distinct from new.seller_party_id
    or v_offer.game_item_id is distinct from new.game_item_id
    or v_offer.inventory_account_id is distinct from new.inventory_account_id
  then
    raise exception 'STORE_WITHDRAWAL_REQUEST_OFFER_SCOPE_INVALID'
      using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.id = new.business_id
    and business_row.game_session_id = new.game_session_id
    and business_row.status = 'active';
  if not found then
    raise exception 'STORE_WITHDRAWAL_REQUEST_BUSINESS_INVALID'
      using errcode = 'P0001';
  end if;

  select party_row.*
  into v_party
  from public.economic_parties as party_row
  where party_row.id = new.seller_party_id
    and party_row.game_session_id = new.game_session_id
    and party_row.party_kind = 'business'
    and party_row.business_id = v_business.id
    and party_row.status = 'active';
  if not found then
    raise exception 'STORE_WITHDRAWAL_REQUEST_SELLER_INVALID'
      using errcode = 'P0001';
  end if;

  select account_row.*
  into v_account
  from public.inventory_accounts as account_row
  where account_row.id = new.inventory_account_id
    and account_row.game_session_id = new.game_session_id
    and account_row.party_id = new.seller_party_id
    and account_row.account_kind = 'store_stock'
    and account_row.location_key = 'store_offer:' || v_offer.public_key
    and account_row.status = 'active';
  if not found then
    raise exception 'STORE_WITHDRAWAL_REQUEST_ACCOUNT_INVALID'
      using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    if v_offer.status not in ('draft','active','paused') then
      raise exception 'STORE_WITHDRAWAL_REQUEST_OFFER_STATUS_INVALID'
        using errcode = 'P0001';
    end if;

    new.resume_status := v_offer.status;
    new.status := 'pending';
    new.offer_version_at_request := v_offer.version + 1;
    new.completion_offer_status := null;
    new.completion_offer_version := null;
    new.requested_at := statement_timestamp();
    new.effective_at := new.requested_at + interval '5 minutes';
    new.next_attempt_at := new.effective_at;
    new.last_attempt_at := null;
    new.last_block_reason := null;
    new.attempt_count := 0;
    new.completed_at := null;
    new.returned_quantity := null;
    new.inventory_transaction_id := null;
    new.version := 1;
    new.created_at := statement_timestamp();
    new.updated_at := new.created_at;
  else
    if old.status = 'completed' then
      raise exception 'STORE_WITHDRAWAL_REQUEST_COMPLETED_TERMINAL'
        using errcode = 'P0001';
    end if;

    if new.id is distinct from old.id
      or new.public_key is distinct from old.public_key
      or new.game_session_id is distinct from old.game_session_id
      or new.offer_id is distinct from old.offer_id
      or new.business_id is distinct from old.business_id
      or new.seller_party_id is distinct from old.seller_party_id
      or new.game_item_id is distinct from old.game_item_id
      or new.inventory_account_id is distinct from old.inventory_account_id
      or new.mode is distinct from old.mode
      or new.requested_quantity is distinct from old.requested_quantity
      or new.resume_status is distinct from old.resume_status
      or new.offer_version_at_request is distinct from old.offer_version_at_request
      or new.request_idempotency_key is distinct from old.request_idempotency_key
      or new.request_hash is distinct from old.request_hash
      or new.requested_at is distinct from old.requested_at
      or new.effective_at is distinct from old.effective_at
      or new.metadata is distinct from old.metadata
      or new.created_at is distinct from old.created_at
    then
      raise exception 'STORE_WITHDRAWAL_REQUEST_IDENTITY_IMMUTABLE'
        using errcode = '42501';
    end if;

    if new.version <> old.version + 1 then
      raise exception 'STORE_WITHDRAWAL_REQUEST_VERSION_INVALID'
        using errcode = 'P0001';
    end if;

    v_transition := old.status || '->' || new.status;
    if v_transition not in ('pending->pending','pending->completed') then
      raise exception 'STORE_WITHDRAWAL_REQUEST_TRANSITION_INVALID:%', v_transition
        using errcode = 'P0001';
    end if;

    if old.offer_version_at_request is distinct from v_offer.version then
      raise exception 'STORE_WITHDRAWAL_REQUEST_OFFER_VERSION_DRIFT'
        using errcode = 'P0001';
    end if;

    if v_transition = 'pending->pending' then
      if new.completion_offer_status is not null
        or new.completion_offer_version is not null
        or new.attempt_count <> old.attempt_count + 1
        or new.last_attempt_at is null
        or new.last_block_reason is distinct from 'inventory_reserved'
        or new.next_attempt_at is null
        or new.next_attempt_at < new.last_attempt_at + interval '1 minute'
        or new.completed_at is not null
        or new.returned_quantity is not null
        or new.inventory_transaction_id is not null
      then
        raise exception 'STORE_WITHDRAWAL_REQUEST_RETRY_STATE_INVALID'
          using errcode = 'P0001';
      end if;
    else
      if new.completion_offer_status is null
        or new.completion_offer_version is distinct from v_offer.version + 1
        or new.attempt_count <> old.attempt_count + 1
        or new.last_attempt_at is null
        or new.completed_at is distinct from new.last_attempt_at
        or new.next_attempt_at is not null
        or new.last_block_reason is not null
        or (
          new.mode = 'full'
          and new.completion_offer_status <> 'paused'
        )
        or (
          new.mode = 'reduce'
          and not (
            new.completion_offer_status = new.resume_status
            or (
              new.resume_status = 'active'
              and new.completion_offer_status = 'paused'
            )
          )
        )
      then
        raise exception 'STORE_WITHDRAWAL_REQUEST_COMPLETION_STATE_INVALID'
          using errcode = 'P0001';
      end if;
    end if;

    new.updated_at := statement_timestamp();
  end if;

  return new;
end
$function$;

create trigger guard_store_offer_withdrawal_request_v2
before insert or update on public.store_offer_withdrawal_requests
for each row execute function economy_private.guard_store_offer_withdrawal_request_v2();

create or replace function economy_private.guard_store_seller_offer_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
declare
  v_store_item public.store_items%rowtype;
  v_game_item public.game_items%rowtype;
  v_party public.economic_parties%rowtype;
  v_business public.business_entities%rowtype;
  v_account public.inventory_accounts%rowtype;
  v_withdrawal public.store_offer_withdrawal_requests%rowtype;
  v_transition text;
begin
  select store_row.*
  into v_store_item
  from public.store_items as store_row
  where store_row.game_session_id = new.game_session_id
    and store_row.id = new.store_item_id;
  if not found then
    raise exception 'STORE_SELLER_OFFER_STORE_ITEM_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if v_store_item.game_item_id is distinct from new.game_item_id then
    raise exception 'STORE_SELLER_OFFER_CATALOG_IDENTITY_MISMATCH'
      using errcode = 'P0001';
  end if;

  if v_store_item.currency_code is distinct from new.currency_code then
    raise exception 'STORE_SELLER_OFFER_CURRENCY_MISMATCH'
      using errcode = 'P0001';
  end if;

  select item_row.*
  into v_game_item
  from public.game_items as item_row
  where item_row.game_session_id = new.game_session_id
    and item_row.id = new.game_item_id;
  if not found then
    raise exception 'STORE_SELLER_OFFER_GAME_ITEM_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select party_row.*
  into v_party
  from public.economic_parties as party_row
  where party_row.game_session_id = new.game_session_id
    and party_row.id = new.seller_party_id
    and party_row.status = 'active';
  if not found then
    raise exception 'STORE_SELLER_OFFER_SELLER_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if new.seller_kind = 'seeded'
    and not (v_party.party_kind = 'store' and v_party.system_key = 'store')
  then
    raise exception 'STORE_SELLER_OFFER_SEEDED_PARTY_INVALID'
      using errcode = 'P0001';
  elsif new.seller_kind = 'npc'
    and v_party.party_kind not in ('country','system')
  then
    raise exception 'STORE_SELLER_OFFER_NPC_PARTY_INVALID'
      using errcode = 'P0001';
  elsif new.seller_kind = 'business' then
    if v_party.party_kind <> 'business' or v_party.business_id is null then
      raise exception 'STORE_SELLER_OFFER_BUSINESS_PARTY_INVALID'
        using errcode = 'P0001';
    end if;

    select business_row.*
    into v_business
    from public.business_entities as business_row
    where business_row.game_session_id = new.game_session_id
      and business_row.id = v_party.business_id
      and business_row.status = 'active';
    if not found then
      raise exception 'STORE_SELLER_OFFER_BUSINESS_UNAVAILABLE'
        using errcode = 'P0001';
    end if;

    if v_business.currency_code is distinct from new.currency_code then
      raise exception 'STORE_SELLER_OFFER_BUSINESS_CURRENCY_MISMATCH'
        using errcode = 'P0001';
    end if;
  end if;

  if new.inventory_account_id is not null then
    select account_row.*
    into v_account
    from public.inventory_accounts as account_row
    where account_row.game_session_id = new.game_session_id
      and account_row.id = new.inventory_account_id;
    if not found
      or v_account.party_id is distinct from new.seller_party_id
      or v_account.account_kind <> 'store_stock'
      or v_account.status <> 'active'
    then
      raise exception 'STORE_SELLER_OFFER_CUSTODY_ACCOUNT_INVALID'
        using errcode = 'P0001';
    end if;
  end if;

  if new.status = 'active' then
    if v_store_item.status <> 'active'
      or v_store_item.visibility <> 'visible'
      or v_game_item.status <> 'active'
    then
      raise exception 'STORE_SELLER_OFFER_CATALOG_UNAVAILABLE'
        using errcode = 'P0001';
    end if;
  end if;

  if new.status = 'withdrawal_pending' then
    select request_row.*
    into v_withdrawal
    from public.store_offer_withdrawal_requests as request_row
    where request_row.game_session_id = new.game_session_id
      and request_row.id = new.withdrawal_request_id
      and request_row.offer_id = new.id
      and request_row.seller_party_id = new.seller_party_id
      and request_row.game_item_id = new.game_item_id
      and request_row.inventory_account_id = new.inventory_account_id
      and request_row.status = 'pending';
    if not found
      or v_withdrawal.requested_at is distinct from new.withdrawal_requested_at
      or v_withdrawal.effective_at is distinct from new.withdrawal_effective_at
      or v_withdrawal.resume_status is distinct from new.withdrawal_resume_status
      or v_withdrawal.mode is distinct from new.withdrawal_mode
      or v_withdrawal.requested_quantity is distinct from new.withdrawal_requested_quantity
    then
      raise exception 'STORE_SELLER_OFFER_WITHDRAWAL_SCOPE_INVALID'
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'retired' then
      raise exception 'STORE_SELLER_OFFER_RETIRED_TERMINAL'
        using errcode = 'P0001';
    end if;

    if new.id is distinct from old.id
      or new.public_key is distinct from old.public_key
      or new.game_session_id is distinct from old.game_session_id
      or new.store_item_id is distinct from old.store_item_id
      or new.game_item_id is distinct from old.game_item_id
      or new.seller_party_id is distinct from old.seller_party_id
      or new.seller_kind is distinct from old.seller_kind
      or new.creation_idempotency_key is distinct from old.creation_idempotency_key
      or new.creation_request_hash is distinct from old.creation_request_hash
      or new.created_at is distinct from old.created_at
    then
      raise exception 'STORE_SELLER_OFFER_IDENTITY_IMMUTABLE'
        using errcode = '42501';
    end if;

    if old.inventory_account_id is not null
      and new.inventory_account_id is distinct from old.inventory_account_id
    then
      raise exception 'STORE_SELLER_OFFER_CUSTODY_BINDING_IMMUTABLE'
        using errcode = '42501';
    end if;

    if new.version <> old.version + 1 then
      raise exception 'STORE_SELLER_OFFER_VERSION_INVALID'
        using errcode = 'P0001';
    end if;

    v_transition := old.status || '->' || new.status;
    if v_transition not in (
      'draft->draft','draft->active','draft->retired','draft->withdrawal_pending',
      'active->active','active->paused','active->retired','active->withdrawal_pending',
      'paused->paused','paused->active','paused->retired','paused->withdrawal_pending',
      'withdrawal_pending->draft','withdrawal_pending->active',
      'withdrawal_pending->paused'
    ) then
      raise exception 'STORE_SELLER_OFFER_TRANSITION_INVALID:%', v_transition
        using errcode = 'P0001';
    end if;

    if old.status <> 'withdrawal_pending'
      and new.status = 'withdrawal_pending'
    then
      if old.seller_kind <> 'business'
        or old.inventory_account_id is null
        or new.unit_price is distinct from old.unit_price
        or new.currency_code is distinct from old.currency_code
        or new.inventory_account_id is distinct from old.inventory_account_id
        or new.withdrawal_resume_status is distinct from old.status
      then
        raise exception 'STORE_SELLER_OFFER_WITHDRAWAL_ENTRY_INVALID'
          using errcode = 'P0001';
      end if;
    elsif old.status = 'withdrawal_pending' then
      if new.status = 'withdrawal_pending' then
        raise exception 'STORE_SELLER_OFFER_WITHDRAWAL_PENDING_MUTATION_FORBIDDEN'
          using errcode = 'P0001';
      end if;

      if new.unit_price is distinct from old.unit_price
        or new.currency_code is distinct from old.currency_code
        or new.inventory_account_id is distinct from old.inventory_account_id
      then
        raise exception 'STORE_SELLER_OFFER_WITHDRAWAL_COMPLETION_MUTATION_INVALID'
          using errcode = 'P0001';
      end if;

      select request_row.*
      into v_withdrawal
      from public.store_offer_withdrawal_requests as request_row
      where request_row.game_session_id = old.game_session_id
        and request_row.id = old.withdrawal_request_id
        and request_row.offer_id = old.id
        and request_row.status = 'completed';
      if not found then
        raise exception 'STORE_SELLER_OFFER_WITHDRAWAL_NOT_COMPLETED'
          using errcode = 'P0001';
      end if;

      if old.withdrawal_mode = 'full' and new.status <> 'paused' then
        raise exception 'STORE_SELLER_OFFER_WITHDRAWAL_COMPLETION_STATUS_INVALID'
          using errcode = 'P0001';
      elsif old.withdrawal_mode = 'reduce'
        and not (
          new.status = old.withdrawal_resume_status
          or (
            old.withdrawal_resume_status = 'active'
            and new.status = 'paused'
          )
        )
      then
        raise exception 'STORE_SELLER_OFFER_WITHDRAWAL_COMPLETION_STATUS_INVALID'
          using errcode = 'P0001';
      end if;
    end if;

    new.updated_at := statement_timestamp();
  end if;

  return new;
end
$function$;

alter table public.store_offer_withdrawal_requests enable row level security;
alter table public.store_offer_withdrawal_requests force row level security;
revoke all on table public.store_offer_withdrawal_requests
  from public, anon, authenticated;
grant select, insert, update on table public.store_offer_withdrawal_requests
  to service_role;

commit;
