-- Canonical Banking account identity and legacy monetary backfill V1.
--
-- B2 foundation only: this migration gives every monetary journal/projection
-- row a game-scoped economic-party account identity. It does not add FX
-- clearing, reserve policy, customer orders, quotes, routes, or UI behavior.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

alter table public.currencies
  drop constraint if exists currencies_decimal_places_check;

alter table public.currencies
  add constraint currencies_decimal_places_check
  check (decimal_places between 0 and 18) not valid;

alter table public.currencies
  validate constraint currencies_decimal_places_check;

create or replace function private.bank_digest_text_v1(p_value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, extensions
as $function$
  select pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_value, 'UTF8'), 'sha256'),
    'hex'
  );
$function$;

revoke all on function private.bank_digest_text_v1(text)
  from public, anon, authenticated, service_role;

create table public.bank_accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'bac_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  party_id uuid not null,
  account_kind text not null,
  currency_code text not null references public.currencies(code),
  status text not null default 'active',
  legacy_account_type text null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint bank_accounts_scope_id_unique unique (id, game_session_id),
  constraint bank_accounts_public_key_format
    check (public_key ~ '^bac_[0-9a-f]{32}$'),
  constraint bank_accounts_party_scope_fk
    foreign key (game_session_id, party_id)
    references public.economic_parties(game_session_id, id) on delete restrict,
  constraint bank_accounts_kind_check
    check (
      account_kind in (
        'checking',
        'savings',
        'legacy',
        'compatibility_offset',
        'fx_clearing',
        'fx_reserve',
        'fx_fee_revenue'
      )
    ),
  constraint bank_accounts_status_check
    check (status in ('active', 'restricted', 'closed')),
  constraint bank_accounts_legacy_identity_check
    check (
      (account_kind = 'legacy'
        and length(btrim(coalesce(legacy_account_type, ''))) between 1 and 240)
      or (account_kind <> 'legacy' and legacy_account_type is null)
    )
);

create unique index bank_accounts_identity_unique
  on public.bank_accounts (
    game_session_id,
    party_id,
    account_kind,
    currency_code,
    (coalesce(legacy_account_type, ''))
  );

create index bank_accounts_game_party_status_idx
  on public.bank_accounts(game_session_id, party_id, status, account_kind);

create index bank_accounts_game_currency_kind_status_idx
  on public.bank_accounts(game_session_id, currency_code, account_kind, status);

create trigger set_bank_accounts_updated_at
before update on public.bank_accounts
for each row execute function public.set_current_timestamp_updated_at();

alter table public.bank_accounts enable row level security;
alter table public.bank_accounts force row level security;
revoke all on table public.bank_accounts
  from public, anon, authenticated, service_role;
grant select on table public.bank_accounts to service_role;

comment on table public.bank_accounts is
  'Canonical game-scoped monetary account identity. Balances remain solely in account_balances and movements solely in ledger_entries.';
comment on column public.bank_accounts.public_key is
  'Opaque browser-safe account key. Internal UUIDs must not enter browser contracts.';
comment on column public.bank_accounts.legacy_account_type is
  'Historical account classification retained only for a legacy identity; it is not a second account authority.';

create or replace function private.guard_bank_account_identity_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if tg_op = 'DELETE' then
    if not exists (
      select 1
      from public.game_sessions as game_row
      where game_row.id = old.game_session_id
    ) then
      return old;
    end if;
    raise exception 'BANK_ACCOUNT_IDENTITY_IMMUTABLE' using errcode = 'P0001';
  end if;

  if new.id is distinct from old.id
    or new.public_key is distinct from old.public_key
    or new.game_session_id is distinct from old.game_session_id
    or new.party_id is distinct from old.party_id
    or new.account_kind is distinct from old.account_kind
    or new.currency_code is distinct from old.currency_code
    or new.legacy_account_type is distinct from old.legacy_account_type
    or new.created_at is distinct from old.created_at
  then
    raise exception 'BANK_ACCOUNT_IDENTITY_IMMUTABLE' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_bank_account_identity_v1()
  from public, anon, authenticated, service_role;

create trigger bank_accounts_identity_guard
before update or delete on public.bank_accounts
for each row execute function private.guard_bank_account_identity_v1();

create or replace function private.ensure_bank_account_identity_v1(
  p_game_session_id uuid,
  p_party_id uuid,
  p_account_kind text,
  p_currency_code text,
  p_legacy_account_type text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_kind text := lower(btrim(coalesce(p_account_kind, '')));
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_legacy text := nullif(btrim(coalesce(p_legacy_account_type, '')), '');
  v_public_key text;
  v_account_id uuid;
  v_party_status text;
  v_account_status text;
begin
  if p_game_session_id is null or p_party_id is null then
    raise exception 'BANK_ACCOUNT_SCOPE_REQUIRED' using errcode = 'P0001';
  end if;

  if v_kind not in (
    'checking', 'savings', 'legacy', 'compatibility_offset',
    'fx_clearing', 'fx_reserve', 'fx_fee_revenue'
  ) then
    raise exception 'BANK_ACCOUNT_KIND_INVALID' using errcode = 'P0001';
  end if;

  if (v_kind = 'legacy' and v_legacy is null)
    or (v_kind <> 'legacy' and v_legacy is not null)
  then
    raise exception 'BANK_ACCOUNT_LEGACY_IDENTITY_INVALID' using errcode = 'P0001';
  end if;

  if v_legacy is not null and length(v_legacy) > 240 then
    raise exception 'BANK_ACCOUNT_LEGACY_IDENTITY_INVALID' using errcode = 'P0001';
  end if;

  perform 1
  from public.currencies as currency_row
  where currency_row.code = v_currency
    and currency_row.status = 'active';
  if not found then
    raise exception 'BANK_ACCOUNT_CURRENCY_INVALID' using errcode = 'P0001';
  end if;

  select party_row.status
  into v_party_status
  from public.economic_parties as party_row
  where party_row.id = p_party_id
    and party_row.game_session_id = p_game_session_id
  for share;
  if not found then
    raise exception 'BANK_ACCOUNT_PARTY_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_account_status := case v_party_status
    when 'closed' then 'closed'
    when 'disabled' then 'restricted'
    else 'active'
  end;

  v_public_key := 'bac_' || substr(private.bank_digest_text_v1(
    concat_ws(
      '|',
      'bank-account-v1',
      p_game_session_id::text,
      p_party_id::text,
      v_kind,
      v_currency,
      coalesce(v_legacy, '')
    )
  ), 1, 32);

  insert into public.bank_accounts (
    public_key,
    game_session_id,
    party_id,
    account_kind,
    currency_code,
    status,
    legacy_account_type
  ) values (
    v_public_key,
    p_game_session_id,
    p_party_id,
    v_kind,
    v_currency,
    v_account_status,
    v_legacy
  )
  on conflict (
    game_session_id,
    party_id,
    account_kind,
    currency_code,
    (coalesce(legacy_account_type, ''))
  ) do update
  set status = case
    when public.bank_accounts.status = 'closed' then 'closed'
    else excluded.status
  end
  returning id into v_account_id;

  return v_account_id;
end;
$function$;

revoke all on function private.ensure_bank_account_identity_v1(uuid, uuid, text, text, text)
  from public, anon, authenticated, service_role;

create or replace function private.ensure_player_bank_account_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_account_kind text,
  p_currency_code text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_party_id uuid;
  v_player_status text;
begin
  if lower(btrim(coalesce(p_account_kind, ''))) not in ('checking', 'savings') then
    raise exception 'PLAYER_BANK_ACCOUNT_KIND_INVALID' using errcode = 'P0001';
  end if;

  select player_row.status
  into v_player_status
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
  for share;
  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.economic_parties (
    game_session_id, party_kind, player_id, status
  ) values (
    p_game_session_id,
    'player',
    p_player_id,
    case when v_player_status = 'active' then 'active' else 'disabled' end
  )
  on conflict (game_session_id, player_id) where player_id is not null
  do update set status = case
    when public.economic_parties.status = 'closed' then 'closed'
    when excluded.status = 'disabled' then 'disabled'
    else 'active'
  end
  returning id into v_party_id;

  return private.ensure_bank_account_identity_v1(
    p_game_session_id,
    v_party_id,
    lower(btrim(p_account_kind)),
    p_currency_code,
    null
  );
end;
$function$;

revoke all on function private.ensure_player_bank_account_v1(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function private.ensure_business_bank_account_identity_v1(
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
  v_party_id uuid;
  v_business public.business_entities%rowtype;
begin
  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = p_business_id
  for share;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.economic_parties (
    game_session_id, party_kind, business_id, status
  ) values (
    p_game_session_id,
    'business',
    p_business_id,
    case when v_business.status = 'closed' then 'closed' else 'active' end
  )
  on conflict (game_session_id, business_id) where business_id is not null
  do update set status = case
    when public.economic_parties.status = 'closed' then 'closed'
    else excluded.status
  end
  returning id into v_party_id;

  return private.ensure_bank_account_identity_v1(
    p_game_session_id,
    v_party_id,
    'checking',
    p_currency_code,
    null
  );
end;
$function$;

revoke all on function private.ensure_business_bank_account_identity_v1(uuid, uuid, text)
  from public, anon, authenticated, service_role;

create or replace function private.ensure_system_bank_account_v1(
  p_game_session_id uuid,
  p_system_key text,
  p_account_kind text,
  p_currency_code text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_system_key text := lower(btrim(coalesce(p_system_key, '')));
  v_party_id uuid;
begin
  if v_system_key !~ '^[a-z0-9][a-z0-9._:-]{0,127}$' then
    raise exception 'BANK_SYSTEM_PARTY_KEY_INVALID' using errcode = 'P0001';
  end if;

  insert into public.economic_parties (
    game_session_id, party_kind, system_key, status
  ) values (
    p_game_session_id, 'system', v_system_key, 'active'
  )
  on conflict (game_session_id, party_kind, system_key) where system_key is not null
  do update set status = case
    when public.economic_parties.status = 'closed' then 'closed'
    else 'active'
  end
  returning id into v_party_id;

  return private.ensure_bank_account_identity_v1(
    p_game_session_id,
    v_party_id,
    p_account_kind,
    p_currency_code,
    null
  );
end;
$function$;

revoke all on function private.ensure_system_bank_account_v1(uuid, text, text, text)
  from public, anon, authenticated, service_role;

create or replace function private.resolve_legacy_bank_account_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_id uuid,
  p_account_type text,
  p_currency_code text,
  p_is_projection boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_account_type text := btrim(coalesce(p_account_type, ''));
  v_business_id uuid := p_business_id;
  v_business_owner_id uuid;
  v_party_id uuid;
  v_party_status text;
  v_system_key text;
  v_legacy_identity text;
begin
  if length(v_account_type) = 0 then
    raise exception 'BANK_LEGACY_ACCOUNT_TYPE_INVALID' using errcode = 'P0001';
  end if;

  if v_business_id is null and v_account_type ~ '^business:biz_[0-9a-f]{32}$' then
    select business_row.id, business_row.owner_player_id
    into v_business_id, v_business_owner_id
    from public.business_entities as business_row
    where business_row.game_session_id = p_game_session_id
      and business_row.public_key = substring(
        v_account_type from '^business:(biz_[0-9a-f]{32})$'
      );
  elsif v_business_id is not null then
    select business_row.owner_player_id
    into v_business_owner_id
    from public.business_entities as business_row
    where business_row.game_session_id = p_game_session_id
      and business_row.id = v_business_id;
  end if;

  if v_business_id is not null
    and (not coalesce(p_is_projection, false)
      or p_business_id is not null
      or p_player_id = v_business_owner_id)
  then
    return private.ensure_business_bank_account_identity_v1(
      p_game_session_id,
      v_business_id,
      p_currency_code
    );
  end if;

  -- A Business-shaped row that could not be bound above is zero-value legacy
  -- debris admitted by the preflight immediately below. Keep it on a distinct
  -- closed system party; never reinterpret it as the referenced Player's cash.
  if p_business_id is not null
     or v_account_type ~ '^business:biz_[0-9a-f]{32}$'
  then
    v_legacy_identity := left(concat_ws(
      '|',
      v_account_type,
      'closed-business-legacy',
      coalesce(p_business_id::text, 'no-business-id'),
      coalesce(p_player_id::text, 'no-player-id')
    ), 240);
    v_system_key := 'banking.legacy-unassigned';
    insert into public.economic_parties (
      game_session_id, party_kind, system_key, status
    ) values (
      p_game_session_id, 'system', v_system_key, 'closed'
    )
    on conflict (game_session_id, party_kind, system_key)
      where system_key is not null
    do update set status = 'closed'
    returning id into v_party_id;

    return private.ensure_bank_account_identity_v1(
      p_game_session_id,
      v_party_id,
      'legacy',
      p_currency_code,
      v_legacy_identity
    );
  end if;

  if p_player_id is not null and lower(v_account_type) in ('checking', 'cash', 'savings') then
    return private.ensure_player_bank_account_v1(
      p_game_session_id,
      p_player_id,
      case when lower(v_account_type) = 'savings' then 'savings' else 'checking' end,
      p_currency_code
    );
  end if;

  if p_player_id is not null then
    select party_row.id, party_row.status
    into v_party_id, v_party_status
    from public.economic_parties as party_row
    where party_row.game_session_id = p_game_session_id
      and party_row.player_id = p_player_id;
    if not found then
      perform private.ensure_player_bank_account_v1(
        p_game_session_id, p_player_id, 'checking', p_currency_code
      );
      select party_row.id, party_row.status
      into v_party_id, v_party_status
      from public.economic_parties as party_row
      where party_row.game_session_id = p_game_session_id
        and party_row.player_id = p_player_id;
    end if;

    v_legacy_identity := left(
      v_account_type
        || case
          when coalesce(p_is_projection, false)
            then '|projection-player:' || p_player_id::text
          else ''
        end,
      240
    );
  else
    v_system_key := 'banking.legacy-unassigned';
    insert into public.economic_parties (
      game_session_id, party_kind, system_key, status
    ) values (
      p_game_session_id, 'system', v_system_key, 'closed'
    )
    on conflict (game_session_id, party_kind, system_key) where system_key is not null
    do update set status = 'closed'
    returning id, status into v_party_id, v_party_status;
    v_legacy_identity := left(v_account_type, 240);
  end if;

  return private.ensure_bank_account_identity_v1(
    p_game_session_id,
    v_party_id,
    'legacy',
    p_currency_code,
    v_legacy_identity
  );
end;
$function$;

revoke all on function private.resolve_legacy_bank_account_v1(uuid, uuid, uuid, text, text, boolean)
  from public, anon, authenticated, service_role;

-- Preserve every historical amount exactly while widening the storage envelope
-- to the registry's supported minor-unit precision.
alter table public.ledger_entries
  alter column amount type numeric(38, 18) using amount::numeric(38, 18);

alter table public.account_balances
  alter column balance type numeric(38, 18) using balance::numeric(38, 18),
  alter column player_id drop not null,
  add column bank_account_id uuid;

alter table public.ledger_entries
  add column bank_account_id uuid;

lock table public.account_balances in share row exclusive mode;
lock table public.ledger_entries in share row exclusive mode;

-- Fail closed before attaching identities when nonzero Business-shaped legacy
-- money cannot be bound deterministically. Explicit business_id is authority
-- when it resolves; an account-type-only projection additionally requires the
-- recorded Player to be the current Business owner. Historical journal lines
-- may retain an earlier controller once the Business public key resolves.
do $function$
begin
  if exists (
    select 1
    from public.account_balances as balance_row
    left join public.business_entities as id_business
      on id_business.game_session_id = balance_row.game_session_id
     and id_business.id = balance_row.business_id
    left join public.business_entities as key_business
      on key_business.game_session_id = balance_row.game_session_id
     and key_business.public_key = substring(
       balance_row.account_type from '^business:(biz_[0-9a-f]{32})$'
     )
    where balance_row.balance <> 0
      and (
        (balance_row.business_id is not null and id_business.id is null)
        or (
          balance_row.business_id is null
          and balance_row.account_type ~ '^business:biz_[0-9a-f]{32}$'
          and (
            key_business.id is null
            or balance_row.player_id is distinct from key_business.owner_player_id
          )
        )
      )
  ) or exists (
    select 1
    from public.ledger_entries as ledger_row
    left join public.business_entities as id_business
      on id_business.game_session_id = ledger_row.game_session_id
     and id_business.id = ledger_row.business_id
    left join public.business_entities as key_business
      on key_business.game_session_id = ledger_row.game_session_id
     and key_business.public_key = substring(
       ledger_row.account_type from '^business:(biz_[0-9a-f]{32})$'
     )
    where ledger_row.amount <> 0
      and (
        (ledger_row.business_id is not null and id_business.id is null)
        or (
          ledger_row.business_id is null
          and ledger_row.account_type ~ '^business:biz_[0-9a-f]{32}$'
          and key_business.id is null
        )
      )
  ) then
    raise exception 'BANK_ACCOUNT_BACKFILL_AMBIGUOUS_BUSINESS'
      using errcode = 'P0001';
  end if;
end;
$function$;

-- Existing projections define the exact historical amount; this update only
-- attaches identity and does not add, merge, round, or otherwise rewrite it.
update public.account_balances as balance_row
set bank_account_id = private.resolve_legacy_bank_account_v1(
  balance_row.game_session_id,
  balance_row.player_id,
  balance_row.business_id,
  balance_row.account_type,
  balance_row.currency_code,
  true
)
where balance_row.bank_account_id is null;

-- Historical journal rows use the stable Business identity when one exists,
-- otherwise the exact legacy Player/system owner classification is retained.
update public.ledger_entries as ledger_row
set bank_account_id = private.resolve_legacy_bank_account_v1(
  ledger_row.game_session_id,
  ledger_row.player_id,
  ledger_row.business_id,
  ledger_row.account_type,
  ledger_row.currency_code,
  false
)
where ledger_row.bank_account_id is null;

-- Provision canonical identities for every known Player currency even when the
-- projection is still zero and therefore absent from the legacy table.
with player_currencies as (
  select balance_row.game_session_id, balance_row.player_id, balance_row.currency_code
  from public.account_balances as balance_row
  where balance_row.player_id is not null
    and balance_row.business_id is null
  union
  select residency_row.game_session_id, residency_row.player_id, residency_row.currency_code
  from public.player_residency_states as residency_row
  where residency_row.currency_code is not null
)
select private.ensure_player_bank_account_v1(
  currency_row.game_session_id,
  currency_row.player_id,
  account_kind.kind,
  currency_row.currency_code
)
from player_currencies as currency_row
cross join (values ('checking'::text), ('savings'::text)) as account_kind(kind);

select private.ensure_business_bank_account_identity_v1(
  business_row.game_session_id,
  business_row.id,
  business_row.currency_code
)
from public.business_entities as business_row;

-- One explicit signed, non-spendable bridge account per game/currency is
-- available to the compatibility gateways introduced by the next migration.
select private.ensure_system_bank_account_v1(
  game_row.id,
  'banking.compatibility-offset',
  'compatibility_offset',
  currency_row.code
)
from public.game_sessions as game_row
cross join public.currencies as currency_row
where currency_row.status = 'active';

alter table public.account_balances
  alter column bank_account_id set not null,
  add constraint account_balances_bank_account_scope_fk
    foreign key (bank_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id) on delete restrict;

alter table public.ledger_entries
  alter column bank_account_id set not null,
  add constraint ledger_entries_bank_account_scope_fk
    foreign key (bank_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id) on delete restrict;

create unique index account_balances_bank_account_unique
  on public.account_balances(bank_account_id);

create index ledger_entries_bank_account_created_at_idx
  on public.ledger_entries(game_session_id, bank_account_id, created_at desc, id desc);

comment on column public.account_balances.bank_account_id is
  'Authoritative account identity for this sole balance projection. Legacy Player/Business columns remain compatibility metadata.';
comment on column public.ledger_entries.bank_account_id is
  'Canonical account identity for this journal line. Historical owner columns remain immutable evidence.';

create or replace function private.ensure_bank_account_projection_v1(
  p_game_session_id uuid,
  p_bank_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_account public.bank_accounts%rowtype;
  v_party public.economic_parties%rowtype;
  v_business public.business_entities%rowtype;
  v_balance_id uuid;
  v_player_id uuid;
  v_business_id uuid;
  v_account_type text;
  v_prior_projection_context text := coalesce(
    current_setting('app.bank_projection_write_v1', true), ''
  );
begin
  select account_row.*
  into v_account
  from public.bank_accounts as account_row
  where account_row.id = p_bank_account_id
    and account_row.game_session_id = p_game_session_id
  for share;
  if not found then
    raise exception 'BANK_ACCOUNT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select party_row.*
  into v_party
  from public.economic_parties as party_row
  where party_row.id = v_account.party_id
    and party_row.game_session_id = p_game_session_id;

  if v_party.party_kind = 'player' then
    v_player_id := v_party.player_id;
    v_account_type := case v_account.account_kind
      when 'checking' then 'checking'
      when 'savings' then 'savings'
      when 'legacy' then v_account.legacy_account_type
      else 'bank:' || v_account.account_kind
    end;
  elsif v_party.party_kind = 'business' then
    select business_row.*
    into v_business
    from public.business_entities as business_row
    where business_row.game_session_id = p_game_session_id
      and business_row.id = v_party.business_id;
    if not found then
      raise exception 'BANK_ACCOUNT_BUSINESS_NOT_FOUND' using errcode = 'P0001';
    end if;
    v_player_id := v_business.owner_player_id;
    v_business_id := v_business.id;
    v_account_type := public.business_account_type_v1(v_business.public_key);
  else
    v_account_type := case v_account.account_kind
      when 'legacy' then v_account.legacy_account_type
      else 'bank:' || v_account.account_kind
    end;
  end if;

  select balance_row.id
  into v_balance_id
  from public.account_balances as balance_row
  where balance_row.bank_account_id = v_account.id
  for update;
  if found then
    return v_balance_id;
  end if;

  perform pg_catalog.set_config('app.bank_projection_write_v1', 'on', true);

  insert into public.account_balances (
    game_session_id,
    player_id,
    business_id,
    account_type,
    balance,
    currency_code,
    last_ledger_entry_id,
    bank_account_id
  ) values (
    p_game_session_id,
    v_player_id,
    v_business_id,
    v_account_type,
    0,
    v_account.currency_code,
    null,
    v_account.id
  )
  on conflict (bank_account_id) do nothing
  returning id into v_balance_id;

  if v_balance_id is null then
    select balance_row.id
    into v_balance_id
    from public.account_balances as balance_row
    where balance_row.bank_account_id = v_account.id;
  end if;

  perform pg_catalog.set_config(
    'app.bank_projection_write_v1', v_prior_projection_context, true
  );

  return v_balance_id;
end;
$function$;

revoke all on function private.ensure_bank_account_projection_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

-- The identity backfill above intentionally creates canonical Checking and
-- Savings identities even when no legacy balance row existed. Materialize the
-- sole zero-balance projection for every such identity only after the guarded
-- projection helper exists; historical projections are returned unchanged.
select private.ensure_bank_account_projection_v1(
  account_row.game_session_id,
  account_row.id
)
from public.bank_accounts as account_row
order by account_row.game_session_id, account_row.id;

-- These two legacy provisioning helpers are redefined again after the posting
-- guard exists. Their signatures stay stable for all existing callers.
create or replace function public.ensure_business_bank_account_v2(
  p_game_session_id uuid,
  p_business_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_bank_account_id uuid;
begin
  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = p_business_id
  for share;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_bank_account_id := private.ensure_business_bank_account_identity_v1(
    p_game_session_id,
    p_business_id,
    v_business.currency_code
  );
  return private.ensure_bank_account_projection_v1(
    p_game_session_id,
    v_bank_account_id
  );
end;
$function$;

revoke all on function public.ensure_business_bank_account_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.ensure_business_bank_account_v2(uuid, uuid)
  to service_role;

create or replace function public.ensure_player_banking_accounts_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_currency_code text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_kind text;
  v_bank_account_id uuid;
  v_existed boolean;
  v_inserted integer := 0;
begin
  if p_game_session_id is null
    or p_player_id is null
    or v_currency !~ '^[A-Z]{3,16}$'
  then
    raise exception 'PLAYER_BANKING_PROVISION_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  perform 1
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active';
  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  foreach v_kind in array array['checking'::text, 'savings'::text]
  loop
    v_bank_account_id := private.ensure_player_bank_account_v1(
      p_game_session_id, p_player_id, v_kind, v_currency
    );
    select exists (
      select 1
      from public.account_balances as balance_row
      where balance_row.bank_account_id = v_bank_account_id
    ) into v_existed;
    perform private.ensure_bank_account_projection_v1(
      p_game_session_id, v_bank_account_id
    );
    if not v_existed then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  perform public.ensure_game_loan_products_for_currency_v1(
    p_game_session_id,
    v_currency
  );

  if v_inserted > 0 then
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
      'system',
      null,
      'banking.accounts.provision',
      'player',
      p_player_id,
      jsonb_build_object(
        'currency_code', v_currency,
        'account_types', jsonb_build_array('checking', 'savings'),
        'balance_effect', 0,
        'accountAuthority', 'bank_accounts_v1'
      )
    );
  end if;

  return v_inserted;
end;
$function$;

revoke all on function public.ensure_player_banking_accounts_v1(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.ensure_player_banking_accounts_v1(uuid, uuid, text)
  to service_role;

commit;
