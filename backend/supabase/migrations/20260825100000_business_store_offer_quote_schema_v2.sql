-- Business V2 Phase 10A.2: immutable Business seller-offer quote schema.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table public.store_offer_purchase_quotes (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique
    default ('quote_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  buyer_player_id uuid not null,
  buyer_country_profile_id uuid not null references public.country_profiles(id) on delete restrict,
  buyer_country_code text not null,
  offer_id uuid not null,
  business_id uuid not null,
  seller_party_id uuid not null,
  store_item_id uuid not null,
  game_item_id uuid not null,
  inventory_account_id uuid not null,
  quantity integer not null,
  offer_version bigint not null,
  available_quantity_at_quote bigint not null,
  seller_unit_price numeric(18,4) not null,
  final_unit_price numeric(18,4) not null,
  seller_total_price numeric(18,4) not null,
  final_total_price numeric(18,4) not null,
  seller_currency_code text not null,
  buyer_currency_code text not null,
  exchange_rate numeric(18,8) not null default 1,
  pricing_version text not null default 'business-offer-fixed-price-v2',
  status text not null default 'created',
  request_idempotency_key text not null,
  request_hash text not null,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  used_at timestamptz null,
  expired_at timestamptz null,
  cancelled_at timestamptz null,
  version bigint not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default statement_timestamp(),
  constraint store_offer_purchase_quotes_public_key_check
    check (public_key ~ '^quote_[0-9a-f]{32}$'),
  constraint store_offer_purchase_quotes_buyer_scope_fk
    foreign key (game_session_id, buyer_player_id)
    references public.players(game_session_id, id) on delete restrict,
  constraint store_offer_purchase_quotes_offer_scope_fk
    foreign key (game_session_id, offer_id)
    references public.store_seller_offers(game_session_id, id) on delete restrict,
  constraint store_offer_purchase_quotes_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete restrict,
  constraint store_offer_purchase_quotes_seller_scope_fk
    foreign key (game_session_id, seller_party_id)
    references public.economic_parties(game_session_id, id) on delete restrict,
  constraint store_offer_purchase_quotes_store_item_scope_fk
    foreign key (game_session_id, store_item_id)
    references public.store_items(game_session_id, id) on delete restrict,
  constraint store_offer_purchase_quotes_game_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id) on delete restrict,
  constraint store_offer_purchase_quotes_account_scope_fk
    foreign key (game_session_id, inventory_account_id)
    references public.inventory_accounts(game_session_id, id) on delete restrict,
  constraint store_offer_purchase_quotes_country_code_check
    check (buyer_country_code ~ '^[A-Z][A-Z0-9_]{2,31}$'),
  constraint store_offer_purchase_quotes_quantity_check
    check (quantity between 1 and 1000000),
  constraint store_offer_purchase_quotes_availability_check
    check (offer_version > 0 and available_quantity_at_quote >= quantity),
  constraint store_offer_purchase_quotes_price_check
    check (
      seller_unit_price > 0
      and seller_unit_price = final_unit_price
      and seller_total_price = final_total_price
      and seller_total_price = round(seller_unit_price * quantity, 4)
    ),
  constraint store_offer_purchase_quotes_currency_check
    check (
      seller_currency_code = upper(seller_currency_code)
      and buyer_currency_code = upper(buyer_currency_code)
      and length(seller_currency_code) between 3 and 16
      and length(buyer_currency_code) between 3 and 16
      and seller_currency_code = buyer_currency_code
      and exchange_rate = 1
    ),
  constraint store_offer_purchase_quotes_policy_check
    check (pricing_version = 'business-offer-fixed-price-v2'),
  constraint store_offer_purchase_quotes_status_check
    check (status in ('created','used','expired','cancelled')),
  constraint store_offer_purchase_quotes_lifecycle_check
    check (
      (status = 'created' and used_at is null and expired_at is null and cancelled_at is null)
      or (status = 'used' and used_at is not null and expired_at is null and cancelled_at is null)
      or (status = 'expired' and used_at is null and expired_at is not null and cancelled_at is null)
      or (status = 'cancelled' and used_at is null and expired_at is null and cancelled_at is not null)
    ),
  constraint store_offer_purchase_quotes_expiry_check
    check (expires_at > created_at and expires_at <= created_at + interval '10 minutes'),
  constraint store_offer_purchase_quotes_idempotency_check
    check (length(btrim(request_idempotency_key)) between 8 and 160),
  constraint store_offer_purchase_quotes_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint store_offer_purchase_quotes_version_check check (version > 0),
  constraint store_offer_purchase_quotes_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint store_offer_purchase_quotes_scope_id_unique unique (game_session_id, id),
  constraint store_offer_purchase_quotes_idempotency_unique
    unique (game_session_id, buyer_player_id, request_idempotency_key)
);

create index store_offer_purchase_quotes_buyer_created_idx
  on public.store_offer_purchase_quotes(game_session_id, buyer_player_id, created_at desc);
create index store_offer_purchase_quotes_offer_created_idx
  on public.store_offer_purchase_quotes(game_session_id, offer_id, created_at desc);
create index store_offer_purchase_quotes_open_expiry_idx
  on public.store_offer_purchase_quotes(expires_at)
  where status = 'created';

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
  then
    raise exception 'STORE_OFFER_QUOTE_IDENTITY_IMMUTABLE' using errcode = '42501';
  end if;
  if new.version <> old.version + 1 then
    raise exception 'STORE_OFFER_QUOTE_VERSION_INVALID' using errcode = 'P0001';
  end if;
  v_transition := old.status || '->' || new.status;
  if v_transition = 'created->used' and new.used_at is not null
    and new.expired_at is null and new.cancelled_at is null then
    null;
  elsif v_transition = 'created->expired' and new.used_at is null
    and new.expired_at >= old.expires_at and new.cancelled_at is null then
    null;
  elsif v_transition = 'created->cancelled' and new.used_at is null
    and new.expired_at is null and new.cancelled_at is not null then
    null;
  else
    raise exception 'STORE_OFFER_QUOTE_TRANSITION_INVALID:%', v_transition
      using errcode = 'P0001';
  end if;
  new.updated_at := statement_timestamp();
  return new;
end
$function$;

create trigger guard_store_offer_purchase_quote_v2
before update or delete on public.store_offer_purchase_quotes
for each row execute function economy_private.guard_store_offer_purchase_quote_v2();

alter table public.store_offer_purchase_quotes enable row level security;
alter table public.store_offer_purchase_quotes force row level security;
revoke all on table public.store_offer_purchase_quotes from public, anon, authenticated;
grant select on table public.store_offer_purchase_quotes to service_role;

comment on table public.store_offer_purchase_quotes is
  'Immutable, non-reserving Business seller-offer quote snapshots. Settlement is a later authority.';

commit;
