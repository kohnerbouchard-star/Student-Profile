-- Created with Supabase CLI as 20260831000230, then moved to the reserved C4 timestamp.

-- Business multi-currency owner identity V1.
--
-- Generalizes the certified B2 FX and C0 funding evidence families to exactly
-- one Player or Business owner. Existing rows remain Player-owned byte-for-byte
-- apart from the deterministic controller backfill required by the new owner
-- guard. Business account opening continues to use canonical bank_accounts and
-- the sole account_balances projection; it never creates a wallet or balance.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

alter table public.fx_quotes
  add column business_id uuid null,
  add column created_by_player_id uuid null;

alter table public.fx_quotes disable trigger guard_fx_quotes_immutable;
update public.fx_quotes
set created_by_player_id = player_id
where created_by_player_id is null;
alter table public.fx_quotes enable trigger guard_fx_quotes_immutable;

alter table public.fx_quotes
  alter column player_id drop not null,
  alter column created_by_player_id set not null,
  drop constraint fx_quotes_scope_idempotency_unique,
  add constraint fx_quotes_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id),
  add constraint fx_quotes_controller_scope_fk
    foreign key (game_session_id, created_by_player_id)
    references public.players(game_session_id, id),
  add constraint fx_quotes_exactly_one_owner_check
    check ((player_id is null) <> (business_id is null)) not valid;

alter table public.fx_quotes
  validate constraint fx_quotes_exactly_one_owner_check;

create unique index fx_quotes_player_idempotency_unique
  on public.fx_quotes(game_session_id, player_id, idempotency_key)
  where player_id is not null;

create unique index fx_quotes_business_idempotency_unique
  on public.fx_quotes(game_session_id, business_id, idempotency_key)
  where business_id is not null;

create index fx_quotes_business_created_idx
  on public.fx_quotes(
    game_session_id, business_id, created_at desc, public_key desc
  ) where business_id is not null;

alter table public.fx_orders
  add column business_id uuid null,
  add column created_by_player_id uuid null;

alter table public.fx_orders disable trigger guard_fx_orders_immutable;
update public.fx_orders
set created_by_player_id = player_id
where created_by_player_id is null;
alter table public.fx_orders enable trigger guard_fx_orders_immutable;

alter table public.fx_orders
  alter column player_id drop not null,
  alter column created_by_player_id set not null,
  drop constraint fx_orders_scope_idempotency_unique,
  add constraint fx_orders_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id),
  add constraint fx_orders_controller_scope_fk
    foreign key (game_session_id, created_by_player_id)
    references public.players(game_session_id, id),
  add constraint fx_orders_exactly_one_owner_check
    check ((player_id is null) <> (business_id is null)) not valid;

alter table public.fx_orders
  validate constraint fx_orders_exactly_one_owner_check;

create unique index fx_orders_player_idempotency_unique
  on public.fx_orders(game_session_id, player_id, idempotency_key)
  where player_id is not null;

create unique index fx_orders_business_idempotency_unique
  on public.fx_orders(game_session_id, business_id, idempotency_key)
  where business_id is not null;

create index fx_orders_business_submitted_idx
  on public.fx_orders(
    game_session_id, business_id, submitted_at desc, public_key desc
  ) where business_id is not null;

alter table public.purchase_funding_quotes
  add column business_id uuid null,
  add column created_by_player_id uuid null;

alter table public.purchase_funding_quotes
  disable trigger guard_purchase_funding_quotes_immutable;
update public.purchase_funding_quotes
set created_by_player_id = player_id
where created_by_player_id is null;
alter table public.purchase_funding_quotes
  enable trigger guard_purchase_funding_quotes_immutable;

alter table public.purchase_funding_quotes
  alter column player_id drop not null,
  alter column created_by_player_id set not null,
  drop constraint purchase_funding_quotes_scope_idempotency_unique,
  add constraint purchase_funding_quotes_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id),
  add constraint purchase_funding_quotes_controller_scope_fk
    foreign key (game_session_id, created_by_player_id)
    references public.players(game_session_id, id),
  add constraint purchase_funding_quotes_exactly_one_owner_check
    check ((player_id is null) <> (business_id is null)) not valid;

alter table public.purchase_funding_quotes
  validate constraint purchase_funding_quotes_exactly_one_owner_check;

create unique index purchase_funding_quotes_player_idempotency_unique
  on public.purchase_funding_quotes(game_session_id, player_id, idempotency_key)
  where player_id is not null;

create unique index purchase_funding_quotes_business_idempotency_unique
  on public.purchase_funding_quotes(game_session_id, business_id, idempotency_key)
  where business_id is not null;

create index purchase_funding_quotes_business_created_idx
  on public.purchase_funding_quotes(
    game_session_id, business_id, created_at desc, public_key desc
  ) where business_id is not null;

alter table public.purchase_funding_receipts
  add column business_id uuid null,
  add column created_by_player_id uuid null;

alter table public.purchase_funding_receipts
  disable trigger guard_purchase_funding_receipts_immutable;
update public.purchase_funding_receipts
set created_by_player_id = player_id
where created_by_player_id is null;
alter table public.purchase_funding_receipts
  enable trigger guard_purchase_funding_receipts_immutable;

alter table public.purchase_funding_receipts
  alter column player_id drop not null,
  alter column created_by_player_id set not null,
  drop constraint purchase_funding_receipts_source_idempotency_unique,
  add constraint purchase_funding_receipts_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id),
  add constraint purchase_funding_receipts_controller_scope_fk
    foreign key (game_session_id, created_by_player_id)
    references public.players(game_session_id, id),
  add constraint purchase_funding_receipts_exactly_one_owner_check
    check ((player_id is null) <> (business_id is null)) not valid;

alter table public.purchase_funding_receipts
  validate constraint purchase_funding_receipts_exactly_one_owner_check;

create unique index purchase_funding_receipts_player_idempotency_unique
  on public.purchase_funding_receipts(
    game_session_id, source_domain, source_action, idempotency_key
  ) where player_id is not null;

create unique index purchase_funding_receipts_business_idempotency_unique
  on public.purchase_funding_receipts(
    game_session_id, business_id, source_domain, source_action, idempotency_key
  ) where business_id is not null;

create index purchase_funding_receipts_business_created_idx
  on public.purchase_funding_receipts(
    game_session_id, business_id, created_at desc, public_key desc
  ) where business_id is not null;

comment on column public.fx_quotes.business_id is
  'Canonical Business owner. Exactly one of player_id or business_id is present.';
comment on column public.fx_orders.business_id is
  'Canonical Business owner. Exactly one of player_id or business_id is present.';
comment on column public.purchase_funding_quotes.business_id is
  'Canonical Business funding owner; browser callers never supply this UUID.';
comment on column public.purchase_funding_receipts.business_id is
  'Canonical Business funding owner; browser callers receive only public keys.';

create or replace function private.currency_amount_text_v1(
  p_amount numeric,
  p_minor_unit integer
)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog, pg_temp
as $function$
begin
  if p_minor_unit not between 0 and 18 then
    raise exception 'CURRENCY_MINOR_UNIT_INVALID' using errcode = '22023';
  end if;
  return trim_scale(round(p_amount, p_minor_unit))::text;
end;
$function$;

revoke all on function private.currency_amount_text_v1(numeric, integer)
  from public, anon, authenticated, service_role;

create or replace function private.current_business_owner_context_v1()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_value text := nullif(
    pg_catalog.btrim(pg_catalog.current_setting('app.business_owner_id', true)),
    ''
  );
begin
  if v_value is null then
    return null;
  end if;
  if v_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'BUSINESS_OWNER_CONTEXT_INVALID' using errcode = '42501';
  end if;
  return v_value::uuid;
end;
$function$;

revoke all on function private.current_business_owner_context_v1()
  from public, anon, authenticated, service_role;

create or replace function private.business_controller_matches_request_v1(
  p_game_session_id uuid,
  p_business_id uuid,
  p_controller_player_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
  select exists (
    select 1
    from public.business_entities as business_row
    where business_row.game_session_id = p_game_session_id
      and business_row.id = p_business_id
      and business_row.status <> 'closed'
      and (
        (
          business_row.ownership_model_version = 1
          and business_row.owner_player_id = p_controller_player_id
        )
        or exists (
          select 1
          from public.business_ownership_positions as ownership_row
          where ownership_row.game_session_id = p_game_session_id
            and ownership_row.business_id = p_business_id
            and ownership_row.player_id = p_controller_player_id
            and ownership_row.status = 'active'
            and ownership_row.ended_at is null
        )
      )
  );
$function$;

revoke all on function private.business_controller_matches_request_v1(
  uuid, uuid, uuid
) from public, anon, authenticated, service_role;

create or replace function private.bank_party_matches_request_owner_v1(
  p_game_session_id uuid,
  p_controller_player_id uuid,
  p_party_kind text,
  p_party_player_id uuid,
  p_party_business_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_business_id uuid := private.current_business_owner_context_v1();
begin
  if v_business_id is null then
    return p_party_kind = 'player'
      and p_party_player_id = p_controller_player_id
      and p_party_business_id is null;
  end if;

  return p_party_kind = 'business'
    and p_party_player_id is null
    and p_party_business_id = v_business_id
    and private.business_controller_matches_request_v1(
      p_game_session_id, v_business_id, p_controller_player_id
    );
end;
$function$;

revoke all on function private.bank_party_matches_request_owner_v1(
  uuid, uuid, text, uuid, uuid
) from public, anon, authenticated, service_role;

create or replace function private.evidence_matches_request_owner_v1(
  p_game_session_id uuid,
  p_controller_player_id uuid,
  p_evidence_player_id uuid,
  p_evidence_business_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_business_id uuid := private.current_business_owner_context_v1();
begin
  if v_business_id is null then
    return p_evidence_player_id = p_controller_player_id
      and p_evidence_business_id is null;
  end if;

  return p_evidence_player_id is null
    and p_evidence_business_id = v_business_id
    and private.business_controller_matches_request_v1(
      p_game_session_id, v_business_id, p_controller_player_id
    );
end;
$function$;

revoke all on function private.evidence_matches_request_owner_v1(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;

create or replace function private.ensure_active_business_checking_account_v1(
  p_game_session_id uuid,
  p_business_id uuid,
  p_currency_code text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_party_id uuid;
  v_party_status text;
  v_account_id uuid;
  v_account_status text;
begin
  if p_game_session_id is null
     or p_business_id is null
     or v_currency !~ '^[A-Z0-9_]{3,16}$'
  then
    raise exception 'BANK_ACCOUNT_SCOPE_REQUIRED' using errcode = '22023';
  end if;

  perform 1
  from public.currencies as currency_row
  where currency_row.code = v_currency
    and currency_row.status = 'active';
  if not found then
    raise exception 'BANK_ACCOUNT_CURRENCY_INVALID' using errcode = 'P0001';
  end if;

  perform 1
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = p_business_id
    and business_row.status <> 'closed'
  for share;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.economic_parties(
    game_session_id, party_kind, business_id, status
  ) values (
    p_game_session_id, 'business', p_business_id, 'active'
  )
  on conflict (game_session_id, business_id) where business_id is not null
  do nothing;

  select party_row.id, party_row.status
  into v_party_id, v_party_status
  from public.economic_parties as party_row
  where party_row.game_session_id = p_game_session_id
    and party_row.party_kind = 'business'
    and party_row.business_id = p_business_id
  for update;
  if not found or v_party_status <> 'active' then
    raise exception 'BANK_ACCOUNT_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  select account_row.id, account_row.status
  into v_account_id, v_account_status
  from public.bank_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.party_id = v_party_id
    and account_row.account_kind = 'checking'
    and account_row.currency_code = v_currency
    and account_row.legacy_account_type is null
  for update;
  if found then
    if v_account_status <> 'active' then
      raise exception 'BANK_ACCOUNT_NOT_ACTIVE' using errcode = 'P0001';
    end if;
    perform private.ensure_bank_account_projection_v1(
      p_game_session_id, v_account_id
    );
    return v_account_id;
  end if;

  v_account_id := private.ensure_bank_account_identity_v1(
    p_game_session_id, v_party_id, 'checking', v_currency, null
  );
  perform private.ensure_bank_account_projection_v1(
    p_game_session_id, v_account_id
  );

  select account_row.status
  into v_account_status
  from public.bank_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.id = v_account_id
  for share;
  if not found or v_account_status <> 'active' then
    raise exception 'BANK_ACCOUNT_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  return v_account_id;
end;
$function$;

revoke all on function private.ensure_active_business_checking_account_v1(
  uuid, uuid, text
) from public, anon, authenticated, service_role;

create or replace function private.ensure_request_owner_fx_checking_account_v1(
  p_game_session_id uuid,
  p_controller_player_id uuid,
  p_currency_code text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_business_id uuid := private.current_business_owner_context_v1();
  v_account_id uuid;
begin
  if v_business_id is null then
    return private.ensure_player_fx_checking_account_v1(
      p_game_session_id, p_controller_player_id, p_currency_code
    );
  end if;

  if not private.business_controller_matches_request_v1(
    p_game_session_id, v_business_id, p_controller_player_id
  ) then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_account_id := private.ensure_active_business_checking_account_v1(
    p_game_session_id, v_business_id, p_currency_code
  );
  perform private.ensure_bank_account_projection_v1(
    p_game_session_id, v_account_id
  );
  return v_account_id;
end;
$function$;

revoke all on function private.ensure_request_owner_fx_checking_account_v1(
  uuid, uuid, text
) from public, anon, authenticated, service_role;

create or replace function private.apply_fx_owner_context_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_business_id uuid := private.current_business_owner_context_v1();
  v_quote_id uuid;
begin
  if tg_table_schema <> 'public'
     or tg_table_name not in ('fx_quotes', 'fx_orders')
  then
    raise exception 'FX_OWNER_TRIGGER_TARGET_INVALID' using errcode = 'P0001';
  end if;

  new.created_by_player_id := coalesce(new.created_by_player_id, new.player_id);
  if new.created_by_player_id is null then
    raise exception 'FX_CONTROLLER_REQUIRED' using errcode = '42501';
  end if;

  if v_business_id is null then
    if new.player_id is null or new.business_id is not null then
      raise exception 'FX_OWNER_INVALID' using errcode = '42501';
    end if;
  else
    if new.player_id is null
       or not private.business_controller_matches_request_v1(
         new.game_session_id, v_business_id, new.player_id
       )
    then
      raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
    end if;
    new.business_id := v_business_id;
    new.player_id := null;
  end if;

  if tg_table_name = 'fx_orders' then
    v_quote_id := nullif(to_jsonb(new) ->> 'quote_id', '')::uuid;
    if v_quote_id is null or not exists (
      select 1
      from public.fx_quotes as quote_row
      where quote_row.id = v_quote_id
        and quote_row.game_session_id = new.game_session_id
        and quote_row.player_id is not distinct from new.player_id
        and quote_row.business_id is not distinct from new.business_id
    ) then
      raise exception 'FX_QUOTE_OWNER_CONFLICT' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.apply_fx_owner_context_v1()
  from public, anon, authenticated, service_role;

create trigger apply_fx_quote_owner_context_v1
before insert on public.fx_quotes
for each row execute function private.apply_fx_owner_context_v1();

create trigger apply_fx_order_owner_context_v1
before insert on public.fx_orders
for each row execute function private.apply_fx_owner_context_v1();

create or replace function private.apply_purchase_funding_owner_context_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_business_id uuid := private.current_business_owner_context_v1();
  v_quote_id uuid;
begin
  if tg_table_schema <> 'public'
     or tg_table_name not in ('purchase_funding_quotes', 'purchase_funding_receipts')
  then
    raise exception 'PURCHASE_FUNDING_OWNER_TRIGGER_TARGET_INVALID' using errcode = 'P0001';
  end if;

  new.created_by_player_id := coalesce(new.created_by_player_id, new.player_id);
  if new.created_by_player_id is null then
    raise exception 'PURCHASE_FUNDING_CONTROLLER_REQUIRED' using errcode = '42501';
  end if;

  if v_business_id is null then
    if new.player_id is null or new.business_id is not null then
      raise exception 'PURCHASE_FUNDING_OWNER_INVALID' using errcode = '42501';
    end if;
  else
    if new.player_id is null
       or not private.business_controller_matches_request_v1(
         new.game_session_id, v_business_id, new.player_id
       )
    then
      raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
    end if;
    new.business_id := v_business_id;
    new.player_id := null;
  end if;

  if tg_table_name = 'purchase_funding_receipts' then
    v_quote_id := nullif(to_jsonb(new) ->> 'quote_id', '')::uuid;
    if v_quote_id is null or not exists (
      select 1
      from public.purchase_funding_quotes as quote_row
      where quote_row.id = v_quote_id
        and quote_row.game_session_id = new.game_session_id
        and quote_row.player_id is not distinct from new.player_id
        and quote_row.business_id is not distinct from new.business_id
    ) then
      raise exception 'PURCHASE_FUNDING_QUOTE_OWNER_CONFLICT' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.apply_purchase_funding_owner_context_v1()
  from public, anon, authenticated, service_role;

create trigger apply_purchase_funding_quote_owner_context_v1
before insert on public.purchase_funding_quotes
for each row execute function private.apply_purchase_funding_owner_context_v1();

create trigger apply_purchase_funding_receipt_owner_context_v1
before insert on public.purchase_funding_receipts
for each row execute function private.apply_purchase_funding_owner_context_v1();

create or replace function private.business_bank_account_public_json_v1(
  p_account_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
  select jsonb_build_object(
    'account_key', account_row.public_key,
    'account_kind', account_row.account_kind,
    'currency_code', account_row.currency_code,
    'minor_unit', currency_row.decimal_places,
    'status', account_row.status,
    'posted_amount', private.currency_amount_text_v1(
      balance_row.balance, currency_row.decimal_places
    ),
    'held_amount', private.currency_amount_text_v1(
      coalesce(hold_totals.held_amount, 0), currency_row.decimal_places
    ),
    'available_amount', private.currency_amount_text_v1(
      balance_row.balance - coalesce(hold_totals.held_amount, 0),
      currency_row.decimal_places
    )
  )
  from public.bank_accounts as account_row
  join public.currencies as currency_row
    on currency_row.code = account_row.currency_code
  join public.account_balances as balance_row
    on balance_row.bank_account_id = account_row.id
   and balance_row.game_session_id = account_row.game_session_id
  left join lateral (
    select sum(hold_row.amount) as held_amount
    from public.bank_account_holds as hold_row
    where hold_row.game_session_id = account_row.game_session_id
      and hold_row.bank_account_id = account_row.id
      and hold_row.status in ('active', 'claimed')
      and (
        hold_row.expires_at is null
        or hold_row.expires_at > statement_timestamp()
      )
  ) as hold_totals on true
  where account_row.id = p_account_id;
$function$;

revoke all on function private.business_bank_account_public_json_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.list_player_business_bank_accounts_v1(
  p_game_session_id uuid,
  p_player_id uuid
)
returns table (
  account_key text,
  account_kind text,
  currency_code text,
  minor_unit integer,
  status text,
  posted_amount numeric,
  held_amount numeric,
  available_amount numeric
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_business record;
begin
  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  return query
  select
    account_row.public_key,
    account_row.account_kind,
    account_row.currency_code,
    currency_row.decimal_places,
    account_row.status,
    balance_row.balance,
    coalesce(hold_totals.held_amount, 0),
    balance_row.balance - coalesce(hold_totals.held_amount, 0)
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  join public.currencies as currency_row
    on currency_row.code = account_row.currency_code
  join public.account_balances as balance_row
    on balance_row.bank_account_id = account_row.id
   and balance_row.game_session_id = account_row.game_session_id
  left join lateral (
    select sum(hold_row.amount) as held_amount
    from public.bank_account_holds as hold_row
    where hold_row.game_session_id = account_row.game_session_id
      and hold_row.bank_account_id = account_row.id
      and hold_row.status in ('active', 'claimed')
      and (
        hold_row.expires_at is null
        or hold_row.expires_at > statement_timestamp()
      )
  ) as hold_totals on true
  where account_row.game_session_id = p_game_session_id
    and account_row.account_kind = 'checking'
    and party_row.party_kind = 'business'
    and party_row.business_id = v_business.business_id
    and party_row.status = 'active'
  order by account_row.currency_code, account_row.public_key;
end;
$function$;

revoke all on function public.list_player_business_bank_accounts_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.list_player_business_bank_accounts_v1(uuid, uuid)
  to service_role;

create or replace function public.ensure_business_banking_account_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_currency_code text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_business record;
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_request_hash text;
  v_account_id uuid;
  v_audit record;
begin
  if p_game_session_id is null
     or p_player_id is null
     or v_currency !~ '^[A-Z0-9_]{3,16}$'
     or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then
    raise exception 'BUSINESS_BANK_ACCOUNT_REQUEST_INVALID' using errcode = '22023';
  end if;

  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  v_request_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'business-bank-account-open-v1',
    'gameSessionId', p_game_session_id,
    'businessId', v_business.business_id,
    'controllerPlayerId', p_player_id,
    'currencyCode', v_currency
  ));

  perform pg_advisory_xact_lock(hashtextextended(
    'business-bank-account-open-v1:' || p_game_session_id::text || ':' ||
      v_business.business_id::text || ':' || v_idempotency_key,
    0
  ));

  select audit_row.metadata
  into v_audit
  from public.audit_log as audit_row
  where audit_row.game_session_id = p_game_session_id
    and audit_row.actor_type = 'player'
    and audit_row.actor_id = p_player_id
    and audit_row.action = 'business.treasury.account.open'
    and audit_row.target_type = 'business'
    and audit_row.target_id = v_business.business_id
    and audit_row.metadata ->> 'idempotencyKey' = v_idempotency_key
  order by audit_row.created_at
  limit 1;

  if found then
    if v_audit.metadata ->> 'requestHash' <> v_request_hash then
      raise exception 'BUSINESS_BANK_ACCOUNT_IDEMPOTENCY_CONFLICT'
        using errcode = 'P0001';
    end if;
    select account_row.id
    into v_account_id
    from public.bank_accounts as account_row
    where account_row.game_session_id = p_game_session_id
      and account_row.public_key = v_audit.metadata ->> 'accountKey';
    if not found then
      raise exception 'BANK_ACCOUNT_PROJECTION_MISSING' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'outcome', 'replayed',
      'account', private.business_bank_account_public_json_v1(v_account_id)
    );
  end if;

  v_account_id := private.ensure_active_business_checking_account_v1(
    p_game_session_id, v_business.business_id, v_currency
  );
  perform private.ensure_bank_account_projection_v1(
    p_game_session_id, v_account_id
  );

  insert into public.audit_log (
    game_session_id,
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    p_game_session_id,
    'player',
    p_player_id,
    'business.treasury.account.open',
    'business',
    v_business.business_id,
    jsonb_build_object(
      'businessKey', v_business.business_key,
      'accountKey', (
        select account_row.public_key
        from public.bank_accounts as account_row
        where account_row.id = v_account_id
      ),
      'currencyCode', v_currency,
      'idempotencyKey', v_idempotency_key,
      'requestHash', v_request_hash,
      'balanceEffect', '0',
      'authority', 'bank_accounts_v1'
    )
  );

  return jsonb_build_object(
    'outcome', 'applied',
    'account', private.business_bank_account_public_json_v1(v_account_id)
  );
end;
$function$;

revoke all on function public.ensure_business_banking_account_v1(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.ensure_business_banking_account_v1(
  uuid, uuid, text, text
) to service_role;

commit;
