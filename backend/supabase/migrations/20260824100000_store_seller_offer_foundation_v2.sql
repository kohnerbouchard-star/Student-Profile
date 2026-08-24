-- Business V2 Phase 7A: Store-owned seller-offer schema and invariants.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create unique index if not exists store_items_scope_id_unique
  on public.store_items(game_session_id, id);

create table public.store_seller_offers (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique
    default ('sof_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  store_item_id uuid not null,
  game_item_id uuid not null,
  seller_party_id uuid not null,
  inventory_account_id uuid null,
  seller_kind text not null,
  unit_price numeric(18,4) not null,
  currency_code text not null,
  status text not null default 'draft',
  replenishment_policy text not null default 'none',
  creation_idempotency_key text not null,
  creation_request_hash text not null,
  version bigint not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint store_seller_offers_public_key_check
    check (public_key ~ '^sof_[0-9a-f]{32}$'),
  constraint store_seller_offers_store_item_scope_fk
    foreign key (game_session_id, store_item_id)
    references public.store_items(game_session_id, id) on delete restrict,
  constraint store_seller_offers_game_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id) on delete restrict,
  constraint store_seller_offers_seller_party_scope_fk
    foreign key (game_session_id, seller_party_id)
    references public.economic_parties(game_session_id, id) on delete restrict,
  constraint store_seller_offers_inventory_account_scope_fk
    foreign key (game_session_id, inventory_account_id)
    references public.inventory_accounts(game_session_id, id) on delete restrict,
  constraint store_seller_offers_seller_kind_check
    check (seller_kind in ('seeded','npc','business')),
  constraint store_seller_offers_price_check
    check (unit_price >= 0),
  constraint store_seller_offers_currency_check
    check (
      currency_code = upper(currency_code)
      and length(currency_code) between 3 and 16
    ),
  constraint store_seller_offers_status_check
    check (status in ('draft','active','paused','retired')),
  constraint store_seller_offers_replenishment_check
    check (replenishment_policy in ('none','canonical_supply')),
  constraint store_seller_offers_idempotency_check
    check (length(btrim(creation_idempotency_key)) between 8 and 160),
  constraint store_seller_offers_request_hash_check
    check (creation_request_hash ~ '^[0-9a-f]{64}$'),
  constraint store_seller_offers_version_check
    check (version > 0),
  constraint store_seller_offers_metadata_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint store_seller_offers_active_custody_check
    check (status <> 'active' or inventory_account_id is not null),
  constraint store_seller_offers_business_active_price_check
    check (seller_kind <> 'business' or status <> 'active' or unit_price > 0),
  constraint store_seller_offers_seeded_replenishment_check
    check (
      seller_kind <> 'seeded'
      or replenishment_policy = 'canonical_supply'
    ),
  constraint store_seller_offers_business_replenishment_check
    check (
      seller_kind <> 'business'
      or replenishment_policy = 'none'
    ),
  constraint store_seller_offers_idempotency_unique
    unique (game_session_id, seller_party_id, creation_idempotency_key),
  constraint store_seller_offers_scope_id_unique
    unique (game_session_id, id)
);

create unique index store_seller_offers_seeded_compatibility_unique
  on public.store_seller_offers(game_session_id, store_item_id, seller_party_id)
  where seller_kind = 'seeded';

create unique index store_seller_offers_business_current_unique
  on public.store_seller_offers(game_session_id, seller_party_id, game_item_id)
  where seller_kind = 'business' and status <> 'retired';

create unique index store_seller_offers_active_account_unique
  on public.store_seller_offers(game_session_id, inventory_account_id)
  where status = 'active' and inventory_account_id is not null;

create index store_seller_offers_catalog_active_idx
  on public.store_seller_offers(
    game_session_id, game_item_id, status, unit_price, public_key
  );

create index store_seller_offers_seller_status_idx
  on public.store_seller_offers(
    game_session_id, seller_party_id, status, updated_at desc
  );

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
      'draft->draft','draft->active','draft->retired',
      'active->active','active->paused','active->retired',
      'paused->paused','paused->active','paused->retired'
    ) then
      raise exception 'STORE_SELLER_OFFER_TRANSITION_INVALID:%', v_transition
        using errcode = 'P0001';
    end if;

    new.updated_at := statement_timestamp();
  end if;

  return new;
end
$function$;

create trigger guard_store_seller_offer_v2
before insert or update on public.store_seller_offers
for each row execute function economy_private.guard_store_seller_offer_v2();

alter table public.store_seller_offers enable row level security;
alter table public.store_seller_offers force row level security;
revoke all on table public.store_seller_offers
  from public, anon, authenticated;
grant select, insert, update on table public.store_seller_offers
  to service_role;

commit;
