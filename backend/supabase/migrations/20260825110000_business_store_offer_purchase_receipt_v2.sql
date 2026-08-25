-- Business V2 Phase 10A.3: immutable completed Business seller-offer receipts.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create unique index if not exists ledger_entries_scope_id_unique
  on public.ledger_entries(game_session_id, id);

create table public.store_offer_purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('spr_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  buyer_player_id uuid not null,
  quote_id uuid not null,
  offer_id uuid not null,
  business_id uuid not null,
  seller_party_id uuid not null,
  store_item_id uuid not null,
  game_item_id uuid not null,
  listing_inventory_account_id uuid not null,
  buyer_inventory_account_id uuid not null,
  buyer_debit_ledger_entry_id uuid not null,
  business_credit_ledger_entry_id uuid not null,
  inventory_transaction_id uuid not null,
  quote_key text not null,
  offer_key text not null,
  business_key text not null,
  seller_party_key text not null,
  catalog_item_key text not null,
  canonical_item_key text not null,
  store_item_key text not null,
  buyer_inventory_account_key text not null,
  inventory_transaction_key text not null,
  quantity integer not null,
  unit_price numeric(18,4) not null,
  total_price numeric(18,4) not null,
  currency_code text not null,
  buyer_debit numeric(18,4) not null,
  business_credit numeric(18,4) not null,
  gross_revenue numeric(18,4) not null,
  source_unit_cost numeric(18,4) not null,
  cost_currency_code text not null,
  cost_of_goods_sold numeric(18,4) not null,
  gross_margin numeric(18,4) not null,
  offer_version_before bigint not null,
  offer_version_after bigint not null,
  remaining_listed_quantity bigint not null,
  request_idempotency_key text not null,
  request_hash text not null,
  completed_at timestamptz not null default statement_timestamp(),
  metadata jsonb not null default '{}'::jsonb,
  constraint store_offer_purchase_receipts_public_key_check check (public_key ~ '^spr_[0-9a-f]{32}$'),
  constraint store_offer_purchase_receipts_buyer_scope_fk foreign key (game_session_id, buyer_player_id) references public.players(game_session_id, id) on delete restrict,
  constraint store_offer_purchase_receipts_quote_scope_fk foreign key (game_session_id, quote_id) references public.store_offer_purchase_quotes(game_session_id, id) on delete restrict,
  constraint store_offer_purchase_receipts_offer_scope_fk foreign key (game_session_id, offer_id) references public.store_seller_offers(game_session_id, id) on delete restrict,
  constraint store_offer_purchase_receipts_business_scope_fk foreign key (game_session_id, business_id) references public.business_entities(game_session_id, id) on delete restrict,
  constraint store_offer_purchase_receipts_seller_scope_fk foreign key (game_session_id, seller_party_id) references public.economic_parties(game_session_id, id) on delete restrict,
  constraint store_offer_purchase_receipts_store_item_scope_fk foreign key (game_session_id, store_item_id) references public.store_items(game_session_id, id) on delete restrict,
  constraint store_offer_purchase_receipts_game_item_scope_fk foreign key (game_session_id, game_item_id) references public.game_items(game_session_id, id) on delete restrict,
  constraint store_offer_purchase_receipts_listing_account_scope_fk foreign key (game_session_id, listing_inventory_account_id) references public.inventory_accounts(game_session_id, id) on delete restrict,
  constraint store_offer_purchase_receipts_buyer_account_scope_fk foreign key (game_session_id, buyer_inventory_account_id) references public.inventory_accounts(game_session_id, id) on delete restrict,
  constraint store_offer_purchase_receipts_buyer_debit_scope_fk foreign key (game_session_id, buyer_debit_ledger_entry_id) references public.ledger_entries(game_session_id, id) on delete restrict,
  constraint store_offer_purchase_receipts_business_credit_scope_fk foreign key (game_session_id, business_credit_ledger_entry_id) references public.ledger_entries(game_session_id, id) on delete restrict,
  constraint store_offer_purchase_receipts_inventory_transaction_scope_fk foreign key (game_session_id, inventory_transaction_id) references public.inventory_transactions(game_session_id, id) on delete restrict,
  constraint store_offer_purchase_receipts_public_snapshot_check check (
    quote_key ~ '^quote_[0-9a-f]{32}$' and offer_key ~ '^sof_[0-9a-f]{32}$'
    and business_key ~ '^biz_[0-9a-f]{32}$' and seller_party_key ~ '^pty_[0-9a-f]{32}$'
    and catalog_item_key ~ '^itm_[0-9a-f]{32}$'
    and canonical_item_key ~ '^[a-z0-9][a-z0-9._-]{0,159}$'
    and store_item_key ~ '^[a-z0-9_-]{1,64}$'
    and buyer_inventory_account_key ~ '^iac_[0-9a-f]{32}$'
    and inventory_transaction_key ~ '^itx_[0-9a-f]{32}$'
  ),
  constraint store_offer_purchase_receipts_quantity_check check (quantity between 1 and 1000000 and remaining_listed_quantity >= 0),
  constraint store_offer_purchase_receipts_money_check check (
    unit_price > 0 and total_price > 0
    and total_price = round(unit_price * quantity, 4)
    and total_price = round(total_price, 2)
    and buyer_debit = total_price and business_credit = total_price and gross_revenue = total_price
    and source_unit_cost >= 0 and cost_of_goods_sold = round(source_unit_cost * quantity, 4)
    and gross_margin = round(gross_revenue - cost_of_goods_sold, 4)
  ),
  constraint store_offer_purchase_receipts_currency_check check (
    currency_code = upper(currency_code) and length(currency_code) between 3 and 16
    and cost_currency_code = currency_code
  ),
  constraint store_offer_purchase_receipts_version_check check (
    offer_version_before > 0 and offer_version_after = offer_version_before + 1
  ),
  constraint store_offer_purchase_receipts_idempotency_check check (length(btrim(request_idempotency_key)) between 8 and 160),
  constraint store_offer_purchase_receipts_hash_check check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint store_offer_purchase_receipts_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint store_offer_purchase_receipts_scope_id_unique unique (game_session_id, id),
  constraint store_offer_purchase_receipts_idempotency_unique unique (game_session_id, buyer_player_id, request_idempotency_key),
  constraint store_offer_purchase_receipts_quote_unique unique (game_session_id, quote_id)
);

create index store_offer_purchase_receipts_buyer_completed_idx on public.store_offer_purchase_receipts(game_session_id, buyer_player_id, completed_at desc);
create index store_offer_purchase_receipts_business_completed_idx on public.store_offer_purchase_receipts(game_session_id, business_id, completed_at desc);
create index store_offer_purchase_receipts_offer_completed_idx on public.store_offer_purchase_receipts(game_session_id, offer_id, completed_at desc);

create or replace function economy_private.validate_store_offer_purchase_receipt_v2()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
begin
  if not exists (
    select 1 from public.ledger_entries as entry_row
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
    select 1 from public.ledger_entries as entry_row
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
  if not exists (
    select 1 from public.inventory_transactions as transaction_row
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
        and line_row.metadata->>'receiptKey' = new.public_key
      ) = 1
      and count(*) filter (where
        line_row.inventory_account_id = new.buyer_inventory_account_id
        and line_row.game_item_id = new.game_item_id
        and line_row.quantity_delta = new.quantity
        and line_row.reservation_delta = 0
        and line_row.unit_cost = new.source_unit_cost
        and line_row.currency_code = new.cost_currency_code
        and line_row.metadata->>'receiptKey' = new.public_key
      ) = 1
  ) then
    raise exception 'STORE_OFFER_PURCHASE_RECEIPT_INVENTORY_LINES_INVALID' using errcode = 'P0001';
  end if;
  return new;
end
$function$;

create trigger validate_store_offer_purchase_receipt_v2 before insert on public.store_offer_purchase_receipts
for each row execute function economy_private.validate_store_offer_purchase_receipt_v2();

create or replace function economy_private.guard_store_offer_purchase_receipt_v2()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
begin
  raise exception 'STORE_OFFER_PURCHASE_RECEIPT_IMMUTABLE' using errcode = '42501';
end
$function$;

create trigger guard_store_offer_purchase_receipt_v2 before update or delete on public.store_offer_purchase_receipts
for each row execute function economy_private.guard_store_offer_purchase_receipt_v2();

revoke all on function economy_private.guard_store_offer_purchase_receipt_v2()
  from public, anon, authenticated, service_role;
revoke all on function economy_private.validate_store_offer_purchase_receipt_v2()
  from public, anon, authenticated, service_role;

alter table public.store_offer_purchase_receipts enable row level security;
alter table public.store_offer_purchase_receipts force row level security;
revoke all on table public.store_offer_purchase_receipts
  from public, anon, authenticated, service_role;
grant select on table public.store_offer_purchase_receipts to service_role;

comment on table public.store_offer_purchase_receipts is
  'Immutable completed receipts for atomic same-currency Business seller-offer settlement; service-role only.';

commit;
