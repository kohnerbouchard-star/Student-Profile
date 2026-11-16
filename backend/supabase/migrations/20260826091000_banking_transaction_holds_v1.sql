-- Canonical balanced Banking journal, holds, and compatibility gateways V1.
--
-- Every post-cutover movement is grouped by an immutable bank_transactions
-- header and balances independently in each currency. Historical one-sided
-- journal rows are retained byte-for-byte as explicit legacy_v1 transactions.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

create table public.bank_transactions (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'btx_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  transaction_kind text not null,
  source_domain text not null,
  source_action text not null,
  source_id uuid null,
  idempotency_key text not null,
  request_hash text not null,
  posting_version text not null,
  status text not null default 'posted',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  posted_at timestamptz not null default clock_timestamp(),

  constraint bank_transactions_scope_id_unique
    unique (game_session_id, id),
  constraint bank_transactions_public_key_format
    check (public_key ~ '^btx_[0-9a-f]{32}$'),
  constraint bank_transactions_kind_format
    check (transaction_kind ~ '^[a-z][a-z0-9._:-]{0,95}$'),
  constraint bank_transactions_source_domain_check
    check (length(btrim(source_domain)) between 1 and 120),
  constraint bank_transactions_source_action_check
    check (length(btrim(source_action)) between 1 and 160),
  constraint bank_transactions_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 240),
  constraint bank_transactions_request_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint bank_transactions_posting_version_check
    check (posting_version in ('legacy_v1', 'balanced_v2')),
  constraint bank_transactions_status_check
    check (status = 'posted'),
  constraint bank_transactions_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint bank_transactions_posted_time_check
    check (posted_at >= created_at),
  constraint bank_transactions_idempotency_unique
    unique (game_session_id, source_domain, source_action, idempotency_key)
);

create index bank_transactions_game_posted_idx
  on public.bank_transactions(game_session_id, posted_at desc, public_key desc);

create index bank_transactions_source_idx
  on public.bank_transactions(
    game_session_id, source_domain, source_action, source_id, posted_at desc
  );

alter table public.bank_transactions enable row level security;
alter table public.bank_transactions force row level security;
revoke all on table public.bank_transactions
  from public, anon, authenticated, service_role;
grant select on table public.bank_transactions to service_role;

comment on table public.bank_transactions is
  'Immutable grouping header for the sole Banking journal. balanced_v2 rows must have per-currency zero-sum ledger lines; legacy_v1 identifies retained pre-cutover one-sided history.';

alter table public.ledger_entries
  add column bank_transaction_id uuid,
  add column line_number integer,
  add column line_metadata jsonb not null default '{}'::jsonb;

lock table public.ledger_entries in share row exclusive mode;

insert into public.bank_transactions (
  public_key,
  game_session_id,
  transaction_kind,
  source_domain,
  source_action,
  source_id,
  idempotency_key,
  request_hash,
  posting_version,
  status,
  metadata,
  created_at,
  posted_at
)
select
  'btx_' || substr(private.bank_digest_text_v1(
    'legacy-ledger-v1|' || ledger_row.id::text
  ), 1, 32),
  ledger_row.game_session_id,
  'legacy_import',
  ledger_row.source_domain,
  ledger_row.source_action,
  ledger_row.source_id,
  'legacy-ledger:' || ledger_row.id::text,
  private.bank_digest_text_v1(concat_ws(
    '|',
    'legacy-ledger-v1',
    ledger_row.id::text,
    ledger_row.game_session_id::text,
    ledger_row.bank_account_id::text,
    ledger_row.amount::text,
    ledger_row.currency_code,
    ledger_row.created_at::text
  )),
  'legacy_v1',
  'posted',
  jsonb_build_object(
    'legacyLedgerEntryId', ledger_row.id,
    'legacyPostingAuthority', 'one_sided_v1'
  ),
  ledger_row.created_at,
  ledger_row.created_at
from public.ledger_entries as ledger_row
where ledger_row.bank_transaction_id is null;

update public.ledger_entries as ledger_row
set
  bank_transaction_id = transaction_row.id,
  line_number = 1,
  line_metadata = jsonb_build_object(
    'postingVersion', 'legacy_v1',
    'legacyEntryType', ledger_row.entry_type
  )
from public.bank_transactions as transaction_row
where transaction_row.game_session_id = ledger_row.game_session_id
  and transaction_row.idempotency_key = 'legacy-ledger:' || ledger_row.id::text
  and transaction_row.posting_version = 'legacy_v1'
  and ledger_row.bank_transaction_id is null;

alter table public.ledger_entries
  alter column bank_transaction_id set not null,
  alter column line_number set not null,
  add constraint ledger_entries_bank_transaction_scope_fk
    foreign key (game_session_id, bank_transaction_id)
    references public.bank_transactions(game_session_id, id) on delete restrict,
  add constraint ledger_entries_line_number_positive
    check (line_number > 0),
  add constraint ledger_entries_line_metadata_object
    check (jsonb_typeof(line_metadata) = 'object'),
  add constraint ledger_entries_transaction_line_unique
    unique (bank_transaction_id, line_number);

create index ledger_entries_transaction_idx
  on public.ledger_entries(game_session_id, bank_transaction_id, line_number);

comment on column public.ledger_entries.bank_transaction_id is
  'Immutable Banking grouping header. Historical one-sided rows point to an explicit legacy_v1 header.';
comment on column public.ledger_entries.line_number is
  'Stable line ordinal inside one Banking transaction.';

create table public.bank_account_holds (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'bah_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  bank_account_id uuid not null,
  amount numeric(38, 18) not null,
  currency_code text not null references public.currencies(code),
  source_domain text not null,
  source_action text not null,
  source_id uuid null,
  idempotency_key text not null,
  request_hash text not null,
  status text not null default 'active',
  expires_at timestamptz null,
  terminal_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint bank_account_holds_scope_id_unique unique (id, game_session_id),
  constraint bank_account_holds_public_key_format
    check (public_key ~ '^bah_[0-9a-f]{32}$'),
  constraint bank_account_holds_account_scope_fk
    foreign key (bank_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id) on delete restrict,
  constraint bank_account_holds_amount_positive check (amount > 0),
  constraint bank_account_holds_source_domain_check
    check (length(btrim(source_domain)) between 1 and 120),
  constraint bank_account_holds_source_action_check
    check (length(btrim(source_action)) between 1 and 160),
  constraint bank_account_holds_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 240),
  constraint bank_account_holds_request_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint bank_account_holds_status_check
    check (
      status in (
        'active', 'claimed', 'consumed', 'released', 'expired', 'terminal_failed'
      )
    ),
  constraint bank_account_holds_terminal_check
    check (
      (status in ('active', 'claimed') and terminal_at is null)
      or (
        status in ('consumed', 'released', 'expired', 'terminal_failed')
        and terminal_at is not null
      )
    ),
  constraint bank_account_holds_expiry_check
    check (expires_at is null or expires_at > created_at),
  constraint bank_account_holds_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint bank_account_holds_idempotency_unique
    unique (game_session_id, source_domain, source_action, idempotency_key)
);

create index bank_account_holds_active_account_idx
  on public.bank_account_holds(game_session_id, bank_account_id, expires_at, id)
  where status in ('active', 'claimed');

create index bank_account_holds_source_idx
  on public.bank_account_holds(
    game_session_id, source_domain, source_action, source_id, created_at desc
  );

create table public.bank_account_hold_events (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'bhe_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  hold_id uuid not null,
  event_type text not null,
  idempotency_key text not null,
  request_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),

  constraint bank_account_hold_events_public_key_format
    check (public_key ~ '^bhe_[0-9a-f]{32}$'),
  constraint bank_account_hold_events_hold_scope_fk
    foreign key (hold_id, game_session_id)
    references public.bank_account_holds(id, game_session_id) on delete restrict,
  constraint bank_account_hold_events_type_check
    check (
      event_type in (
        'created', 'claimed', 'consumed', 'released', 'expired', 'terminal_failed'
      )
    ),
  constraint bank_account_hold_events_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 240),
  constraint bank_account_hold_events_request_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint bank_account_hold_events_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint bank_account_hold_events_idempotency_unique
    unique (game_session_id, hold_id, idempotency_key)
);

create index bank_account_hold_events_hold_created_idx
  on public.bank_account_hold_events(game_session_id, hold_id, created_at, id);

alter table public.bank_account_holds enable row level security;
alter table public.bank_account_holds force row level security;
alter table public.bank_account_hold_events enable row level security;
alter table public.bank_account_hold_events force row level security;

revoke all on table public.bank_account_holds
  from public, anon, authenticated, service_role;
revoke all on table public.bank_account_hold_events
  from public, anon, authenticated, service_role;
grant select on table public.bank_account_holds to service_role;
grant select on table public.bank_account_hold_events to service_role;

comment on table public.bank_account_holds is
  'Canonical account reservation authority. Available balance is computed as posted balance minus active unexpired holds; no reserved-balance projection exists.';
comment on table public.bank_account_hold_events is
  'Append-only lifecycle evidence for canonical Banking holds.';

create or replace function private.active_bank_account_hold_amount_v1(
  p_game_session_id uuid,
  p_bank_account_id uuid,
  p_excluded_hold_ids uuid[] default '{}'::uuid[]
)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select coalesce(sum(hold_row.amount), 0)::numeric(38, 18)
  from public.bank_account_holds as hold_row
  where hold_row.game_session_id = p_game_session_id
    and hold_row.bank_account_id = p_bank_account_id
    and hold_row.status in ('active', 'claimed')
    and (hold_row.expires_at is null or hold_row.expires_at > statement_timestamp())
    and not (
      hold_row.id = any(coalesce(p_excluded_hold_ids, '{}'::uuid[]))
    );
$function$;

revoke all on function private.active_bank_account_hold_amount_v1(uuid, uuid, uuid[])
  from public, anon, authenticated, service_role;

create or replace function private.authorize_bank_account_negative_balance_v1(
  p_game_session_id uuid,
  p_bank_account_id uuid,
  p_proposed_balance numeric,
  p_transaction_kind text,
  p_metadata jsonb,
  p_consumed_hold_ids uuid[]
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_kind text;
begin
  select account_row.account_kind
  into v_kind
  from public.bank_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.id = p_bank_account_id;
  if not found then
    return false;
  end if;

  if v_kind = 'compatibility_offset' then
    return p_transaction_kind = 'compatibility_bridge'
      and coalesce(p_metadata ->> 'compatibilityAuthority', '')
        = 'allowlisted_legacy_gateway_v1'
      and cardinality(coalesce(p_consumed_hold_ids, '{}'::uuid[])) = 0;
  end if;

  -- fx_reserve is deliberately denied until the bounded clearing migration
  -- replaces this helper with persisted facility-cap authorization.
  return false;
end;
$function$;

revoke all on function private.authorize_bank_account_negative_balance_v1(
  uuid, uuid, numeric, text, jsonb, uuid[]
) from public, anon, authenticated, service_role;

create or replace function private.guard_bank_transaction_journal_v1()
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

  if tg_op = 'INSERT' then
    if coalesce(current_setting('app.bank_posting_v1', true), '') <> 'on'
      or new.posting_version <> 'balanced_v2'
    then
      raise exception 'BANK_TRANSACTION_DIRECT_WRITE_FORBIDDEN'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  raise exception 'BANK_TRANSACTION_IMMUTABLE' using errcode = 'P0001';
end;
$function$;

revoke all on function private.guard_bank_transaction_journal_v1()
  from public, anon, authenticated, service_role;

create trigger bank_transactions_journal_guard
before insert or update or delete on public.bank_transactions
for each row execute function private.guard_bank_transaction_journal_v1();

create or replace function private.guard_ledger_entry_journal_v1()
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

  if tg_op = 'INSERT' then
    if coalesce(current_setting('app.bank_posting_v1', true), '') <> 'on' then
      raise exception 'LEDGER_ENTRY_DIRECT_WRITE_FORBIDDEN' using errcode = 'P0001';
    end if;

    perform 1
    from public.bank_transactions as transaction_row
    where transaction_row.id = new.bank_transaction_id
      and transaction_row.game_session_id = new.game_session_id
      and transaction_row.posting_version = 'balanced_v2'
      and transaction_row.status = 'posted';
    if not found then
      raise exception 'LEDGER_ENTRY_TRANSACTION_INVALID' using errcode = 'P0001';
    end if;

    perform 1
    from public.bank_accounts as account_row
    where account_row.id = new.bank_account_id
      and account_row.game_session_id = new.game_session_id;
    if not found then
      raise exception 'LEDGER_ENTRY_ACCOUNT_INVALID' using errcode = 'P0001';
    end if;

    return new;
  end if;

  raise exception 'LEDGER_ENTRY_IMMUTABLE' using errcode = 'P0001';
end;
$function$;

revoke all on function private.guard_ledger_entry_journal_v1()
  from public, anon, authenticated, service_role;

create trigger ledger_entries_journal_guard
before insert or update or delete on public.ledger_entries
for each row execute function private.guard_ledger_entry_journal_v1();

create or replace function private.guard_account_balance_projection_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_amount numeric;
  v_transaction_id uuid;
  v_expected_last_ledger_entry_id uuid;
begin
  if tg_op = 'DELETE' then
    if not exists (
      select 1
      from public.game_sessions as game_row
      where game_row.id = old.game_session_id
    ) then
      return old;
    end if;
    raise exception 'ACCOUNT_BALANCE_PROJECTION_DELETE_FORBIDDEN'
      using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    if coalesce(current_setting('app.bank_projection_write_v1', true), '') <> 'on'
      or new.balance <> 0
      or new.last_ledger_entry_id is not null
      or new.bank_account_id is null
    then
      raise exception 'ACCOUNT_BALANCE_DIRECT_WRITE_FORBIDDEN'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  if old.id is distinct from new.id
    or old.game_session_id is distinct from new.game_session_id
    or old.player_id is distinct from new.player_id
    or old.business_id is distinct from new.business_id
    or old.account_type is distinct from new.account_type
    or old.currency_code is distinct from new.currency_code
    or old.bank_account_id is distinct from new.bank_account_id
    or old.created_at is distinct from new.created_at
  then
    raise exception 'ACCOUNT_BALANCE_IDENTITY_IMMUTABLE' using errcode = 'P0001';
  end if;

  if coalesce(current_setting('app.bank_posting_v1', true), '') <> 'on'
    or new.last_ledger_entry_id is null
  then
    raise exception 'ACCOUNT_BALANCE_DIRECT_WRITE_FORBIDDEN'
      using errcode = 'P0001';
  end if;

  select ledger_row.bank_transaction_id
  into v_transaction_id
  from public.ledger_entries as ledger_row
  where ledger_row.id = new.last_ledger_entry_id
    and ledger_row.game_session_id = new.game_session_id
    and ledger_row.bank_account_id = new.bank_account_id;
  if not found then
    raise exception 'ACCOUNT_BALANCE_LEDGER_MISMATCH' using errcode = 'P0001';
  end if;

  select
    sum(ledger_row.amount),
    (array_agg(ledger_row.id order by ledger_row.line_number desc))[1]
  into v_amount, v_expected_last_ledger_entry_id
  from public.ledger_entries as ledger_row
  where ledger_row.bank_transaction_id = v_transaction_id
    and ledger_row.game_session_id = new.game_session_id
    and ledger_row.bank_account_id = new.bank_account_id;
  if v_amount is null
    or v_expected_last_ledger_entry_id <> new.last_ledger_entry_id
    or new.balance <> old.balance + v_amount
  then
    raise exception 'ACCOUNT_BALANCE_LEDGER_MISMATCH' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_account_balance_projection_v1()
  from public, anon, authenticated, service_role;

create trigger account_balances_projection_guard
before insert or update or delete on public.account_balances
for each row execute function private.guard_account_balance_projection_v1();

create or replace function private.guard_bank_account_hold_v1()
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
    raise exception 'BANK_ACCOUNT_HOLD_DELETE_FORBIDDEN' using errcode = 'P0001';
  end if;

  if coalesce(current_setting('app.bank_hold_write_v1', true), '') <> 'on'
    and coalesce(current_setting('app.bank_posting_v1', true), '') <> 'on'
  then
    raise exception 'BANK_ACCOUNT_HOLD_DIRECT_WRITE_FORBIDDEN'
      using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' then
    if old.id is distinct from new.id
      or old.public_key is distinct from new.public_key
      or old.game_session_id is distinct from new.game_session_id
      or old.bank_account_id is distinct from new.bank_account_id
      or old.amount is distinct from new.amount
      or old.currency_code is distinct from new.currency_code
      or old.source_domain is distinct from new.source_domain
      or old.source_action is distinct from new.source_action
      or old.source_id is distinct from new.source_id
      or old.idempotency_key is distinct from new.idempotency_key
      or old.request_hash is distinct from new.request_hash
      or old.expires_at is distinct from new.expires_at
      or old.metadata is distinct from new.metadata
      or old.created_at is distinct from new.created_at
      or old.status not in ('active', 'claimed')
      or (
        old.status = 'active'
        and new.status not in (
          'claimed', 'consumed', 'released', 'expired', 'terminal_failed'
        )
      )
      or (
        old.status = 'claimed'
        and new.status not in ('consumed', 'released', 'expired', 'terminal_failed')
      )
      or (
        (new.status = 'claimed' and new.terminal_at is not null)
        or (new.status <> 'claimed' and new.terminal_at is null)
      )
    then
      raise exception 'BANK_ACCOUNT_HOLD_IMMUTABLE' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_bank_account_hold_v1()
  from public, anon, authenticated, service_role;

create trigger bank_account_holds_guard
before insert or update or delete on public.bank_account_holds
for each row execute function private.guard_bank_account_hold_v1();

create or replace function private.guard_bank_account_hold_event_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, pg_temp
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

  if tg_op = 'INSERT'
    and (
      coalesce(current_setting('app.bank_hold_write_v1', true), '') = 'on'
      or coalesce(current_setting('app.bank_posting_v1', true), '') = 'on'
    )
  then
    return new;
  end if;

  raise exception 'BANK_ACCOUNT_HOLD_EVENT_IMMUTABLE' using errcode = 'P0001';
end;
$function$;

revoke all on function private.guard_bank_account_hold_event_v1()
  from public, anon, authenticated, service_role;

create trigger bank_account_hold_events_guard
before insert or update or delete on public.bank_account_hold_events
for each row execute function private.guard_bank_account_hold_event_v1();

create or replace function private.create_bank_account_hold_v1(
  p_game_session_id uuid,
  p_bank_account_id uuid,
  p_amount numeric,
  p_source_domain text,
  p_source_action text,
  p_source_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_expires_at timestamptz,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  hold_id uuid,
  hold_public_key text,
  status text,
  amount numeric,
  currency_code text,
  replayed boolean,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_account public.bank_accounts%rowtype;
  v_existing public.bank_account_holds%rowtype;
  v_hold public.bank_account_holds%rowtype;
  v_balance numeric;
  v_active_holds numeric;
  v_precision integer;
  v_public_key text;
  v_event_key text;
  v_now timestamptz := clock_timestamp();
  v_prior_hold_context text := coalesce(
    current_setting('app.bank_hold_write_v1', true), ''
  );
begin
  if p_game_session_id is null or p_bank_account_id is null then
    raise exception 'BANK_HOLD_SCOPE_REQUIRED' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'BANK_HOLD_AMOUNT_INVALID' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_source_domain, ''))) not between 1 and 120
    or length(btrim(coalesce(p_source_action, ''))) not between 1 and 160
  then
    raise exception 'BANK_HOLD_SOURCE_INVALID' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 240 then
    raise exception 'BANK_HOLD_IDEMPOTENCY_KEY_INVALID' using errcode = 'P0001';
  end if;
  if coalesce(p_request_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'BANK_HOLD_REQUEST_HASH_INVALID' using errcode = 'P0001';
  end if;
  if p_expires_at is not null and p_expires_at <= v_now then
    raise exception 'BANK_HOLD_EXPIRY_INVALID' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'BANK_HOLD_METADATA_INVALID' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'banking-monetary-v1:' || p_game_session_id::text,
    0
  ));

  select hold_row.*
  into v_existing
  from public.bank_account_holds as hold_row
  where hold_row.game_session_id = p_game_session_id
    and hold_row.source_domain = btrim(p_source_domain)
    and hold_row.source_action = btrim(p_source_action)
    and hold_row.idempotency_key = btrim(p_idempotency_key);
  if found then
    if v_existing.request_hash <> p_request_hash then
      raise exception 'BANK_HOLD_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return query select
      v_existing.id,
      v_existing.public_key,
      v_existing.status,
      v_existing.amount,
      v_existing.currency_code,
      true,
      v_existing.expires_at;
    return;
  end if;

  select account_row.*
  into v_account
  from public.bank_accounts as account_row
  join public.currencies as currency_row
    on currency_row.code = account_row.currency_code
  where account_row.game_session_id = p_game_session_id
    and account_row.id = p_bank_account_id
    and account_row.status = 'active'
  for update of account_row;
  if not found then
    raise exception 'BANK_ACCOUNT_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  select currency_row.decimal_places
  into v_precision
  from public.currencies as currency_row
  where currency_row.code = v_account.currency_code;
  if v_account.account_kind in ('compatibility_offset', 'fx_fee_revenue') then
    raise exception 'BANK_ACCOUNT_HOLD_KIND_FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_amount <> round(p_amount, v_precision) then
    raise exception 'BANK_AMOUNT_MINOR_UNIT_INVALID' using errcode = 'P0001';
  end if;

  perform private.ensure_bank_account_projection_v1(
    p_game_session_id,
    p_bank_account_id
  );

  select balance_row.balance
  into v_balance
  from public.account_balances as balance_row
  where balance_row.bank_account_id = p_bank_account_id
  for update;
  if not found then
    raise exception 'BANK_ACCOUNT_PROJECTION_MISSING' using errcode = 'P0001';
  end if;

  v_active_holds := private.active_bank_account_hold_amount_v1(
    p_game_session_id,
    p_bank_account_id,
    '{}'::uuid[]
  );
  if v_balance - v_active_holds - p_amount < 0
    and not private.authorize_bank_account_negative_balance_v1(
      p_game_session_id,
      p_bank_account_id,
      v_balance,
      'hold_reservation',
      coalesce(p_metadata, '{}'::jsonb)
        || jsonb_build_object('requestedHoldAmount', p_amount),
      '{}'::uuid[]
    )
  then
    raise exception 'BANK_ACCOUNT_AVAILABLE_BALANCE_INSUFFICIENT'
      using errcode = 'P0001';
  end if;

  v_public_key := 'bah_' || substr(private.bank_digest_text_v1(concat_ws(
    '|',
    'bank-hold-v1',
    p_game_session_id::text,
    btrim(p_source_domain),
    btrim(p_source_action),
    btrim(p_idempotency_key)
  )), 1, 32);
  v_event_key := 'event:' || substr(private.bank_digest_text_v1(
    'created|' || btrim(p_idempotency_key)
  ), 1, 64);

  perform pg_catalog.set_config('app.bank_hold_write_v1', 'on', true);

  insert into public.bank_account_holds (
    public_key,
    game_session_id,
    bank_account_id,
    amount,
    currency_code,
    source_domain,
    source_action,
    source_id,
    idempotency_key,
    request_hash,
    status,
    expires_at,
    metadata
  ) values (
    v_public_key,
    p_game_session_id,
    p_bank_account_id,
    p_amount,
    v_account.currency_code,
    btrim(p_source_domain),
    btrim(p_source_action),
    p_source_id,
    btrim(p_idempotency_key),
    p_request_hash,
    'active',
    p_expires_at,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_hold;

  insert into public.bank_account_hold_events (
    public_key,
    game_session_id,
    hold_id,
    event_type,
    idempotency_key,
    request_hash,
    metadata
  ) values (
    'bhe_' || substr(private.bank_digest_text_v1(
      v_hold.id::text || '|created|' || btrim(p_idempotency_key)
    ), 1, 32),
    p_game_session_id,
    v_hold.id,
    'created',
    v_event_key,
    p_request_hash,
    jsonb_build_object(
      'commandIdempotencyKey', btrim(p_idempotency_key),
      'holdAmount', p_amount,
      'currencyCode', v_account.currency_code
    )
  );

  perform pg_catalog.set_config(
    'app.bank_hold_write_v1', v_prior_hold_context, true
  );

  return query select
    v_hold.id,
    v_hold.public_key,
    v_hold.status,
    v_hold.amount,
    v_hold.currency_code,
    false,
    v_hold.expires_at;
end;
$function$;

revoke all on function private.create_bank_account_hold_v1(
  uuid, uuid, numeric, text, text, uuid, text, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;

create or replace function private.claim_bank_account_hold_v1(
  p_game_session_id uuid,
  p_hold_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  hold_id uuid,
  hold_public_key text,
  status text,
  replayed boolean,
  claimed_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_hold public.bank_account_holds%rowtype;
  v_event public.bank_account_hold_events%rowtype;
  v_event_at timestamptz;
  v_now timestamptz := clock_timestamp();
  v_prior_hold_context text := coalesce(
    current_setting('app.bank_hold_write_v1', true), ''
  );
begin
  if p_game_session_id is null or p_hold_id is null then
    raise exception 'BANK_HOLD_SCOPE_REQUIRED' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 240 then
    raise exception 'BANK_HOLD_IDEMPOTENCY_KEY_INVALID' using errcode = 'P0001';
  end if;
  if coalesce(p_request_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'BANK_HOLD_REQUEST_HASH_INVALID' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'BANK_HOLD_METADATA_INVALID' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'banking-monetary-v1:' || p_game_session_id::text,
    0
  ));

  select event_row.*
  into v_event
  from public.bank_account_hold_events as event_row
  where event_row.game_session_id = p_game_session_id
    and event_row.hold_id = p_hold_id
    and event_row.event_type = 'claimed'
    and event_row.metadata ->> 'commandIdempotencyKey'
      = btrim(p_idempotency_key)
  order by event_row.created_at desc, event_row.id desc
  limit 1;
  if found then
    if v_event.request_hash <> p_request_hash then
      raise exception 'BANK_HOLD_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    select hold_row.*
    into v_hold
    from public.bank_account_holds as hold_row
    where hold_row.game_session_id = p_game_session_id
      and hold_row.id = p_hold_id;
    return query select
      v_hold.id,
      v_hold.public_key,
      v_hold.status,
      true,
      v_event.created_at;
    return;
  end if;

  select hold_row.*
  into v_hold
  from public.bank_account_holds as hold_row
  where hold_row.game_session_id = p_game_session_id
    and hold_row.id = p_hold_id
  for update;
  if not found then
    raise exception 'BANK_HOLD_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_hold.status <> 'active'
    or (v_hold.expires_at is not null and v_hold.expires_at <= v_now)
  then
    raise exception 'BANK_HOLD_NOT_CLAIMABLE' using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config('app.bank_hold_write_v1', 'on', true);

  update public.bank_account_holds
  set status = 'claimed'
  where id = v_hold.id
  returning * into v_hold;

  insert into public.bank_account_hold_events (
    public_key,
    game_session_id,
    hold_id,
    event_type,
    idempotency_key,
    request_hash,
    metadata,
    created_at
  ) values (
    'bhe_' || substr(private.bank_digest_text_v1(
      v_hold.id::text || '|claimed|' || btrim(p_idempotency_key)
    ), 1, 32),
    p_game_session_id,
    v_hold.id,
    'claimed',
    'event:' || substr(private.bank_digest_text_v1(
      'claimed|' || btrim(p_idempotency_key)
    ), 1, 64),
    p_request_hash,
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'commandIdempotencyKey', btrim(p_idempotency_key)
      ),
    v_now
  )
  returning created_at into v_event_at;

  perform pg_catalog.set_config(
    'app.bank_hold_write_v1', v_prior_hold_context, true
  );

  return query select
    v_hold.id,
    v_hold.public_key,
    v_hold.status,
    false,
    v_event_at;
end;
$function$;

revoke all on function private.claim_bank_account_hold_v1(
  uuid, uuid, text, text, jsonb
) from public, anon, authenticated, service_role;

create or replace function private.release_bank_account_hold_v1(
  p_game_session_id uuid,
  p_hold_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  hold_id uuid,
  hold_public_key text,
  status text,
  replayed boolean,
  terminal_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_hold public.bank_account_holds%rowtype;
  v_event public.bank_account_hold_events%rowtype;
  v_status text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_event_key text;
  v_now timestamptz := clock_timestamp();
  v_prior_hold_context text := coalesce(
    current_setting('app.bank_hold_write_v1', true), ''
  );
begin
  if p_game_session_id is null or p_hold_id is null then
    raise exception 'BANK_HOLD_SCOPE_REQUIRED' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 240 then
    raise exception 'BANK_HOLD_IDEMPOTENCY_KEY_INVALID' using errcode = 'P0001';
  end if;
  if coalesce(p_request_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'BANK_HOLD_REQUEST_HASH_INVALID' using errcode = 'P0001';
  end if;
  if length(v_reason) not between 1 and 240 then
    raise exception 'BANK_HOLD_RELEASE_REASON_INVALID' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'BANK_HOLD_METADATA_INVALID' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'banking-monetary-v1:' || p_game_session_id::text,
    0
  ));

  select event_row.*
  into v_event
  from public.bank_account_hold_events as event_row
  where event_row.game_session_id = p_game_session_id
    and event_row.hold_id = p_hold_id
    and event_row.event_type in ('released', 'expired', 'terminal_failed')
    and event_row.metadata ->> 'commandIdempotencyKey'
      = btrim(p_idempotency_key)
  order by event_row.created_at desc, event_row.id desc
  limit 1;
  if found then
    if v_event.request_hash <> p_request_hash then
      raise exception 'BANK_HOLD_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    select hold_row.*
    into v_hold
    from public.bank_account_holds as hold_row
    where hold_row.game_session_id = p_game_session_id
      and hold_row.id = p_hold_id;
    return query select
      v_hold.id,
      v_hold.public_key,
      v_hold.status,
      true,
      v_hold.terminal_at;
    return;
  end if;

  select hold_row.*
  into v_hold
  from public.bank_account_holds as hold_row
  where hold_row.game_session_id = p_game_session_id
    and hold_row.id = p_hold_id
  for update;
  if not found then
    raise exception 'BANK_HOLD_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_hold.status not in ('active', 'claimed') then
    raise exception 'BANK_HOLD_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  v_status := case
    when lower(v_reason) = 'expired' then 'expired'
    when lower(v_reason) = 'terminal_failed' then 'terminal_failed'
    else 'released'
  end;
  if v_status = 'expired'
    and (v_hold.expires_at is null or v_hold.expires_at > v_now)
  then
    raise exception 'BANK_HOLD_NOT_EXPIRED' using errcode = 'P0001';
  end if;
  v_event_key := 'event:' || substr(private.bank_digest_text_v1(
    v_status || '|' || btrim(p_idempotency_key)
  ), 1, 64);

  perform pg_catalog.set_config('app.bank_hold_write_v1', 'on', true);

  update public.bank_account_holds
  set status = v_status,
      terminal_at = v_now
  where id = v_hold.id
  returning * into v_hold;

  insert into public.bank_account_hold_events (
    public_key,
    game_session_id,
    hold_id,
    event_type,
    idempotency_key,
    request_hash,
    metadata
  ) values (
    'bhe_' || substr(private.bank_digest_text_v1(
      v_hold.id::text || '|' || v_status || '|' || btrim(p_idempotency_key)
    ), 1, 32),
    p_game_session_id,
    v_hold.id,
    v_status,
    v_event_key,
    p_request_hash,
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'commandIdempotencyKey', btrim(p_idempotency_key),
        'reason', v_reason
      )
  );

  perform pg_catalog.set_config(
    'app.bank_hold_write_v1', v_prior_hold_context, true
  );

  return query select
    v_hold.id,
    v_hold.public_key,
    v_hold.status,
    false,
    v_hold.terminal_at;
end;
$function$;

revoke all on function private.release_bank_account_hold_v1(
  uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated, service_role;

create or replace function private.bank_compatibility_gateway_allowed_v1(
  p_gateway text,
  p_source_domain text,
  p_source_action text
)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $function$
  select (p_gateway, p_source_domain, p_source_action) in (
    values
      ('record_player_ledger_entry', 'admin', 'business_banking_correction'),
      ('record_player_ledger_entry', 'arrival', 'arrival_package_grant'),
      ('record_player_ledger_entry', 'attendance', 'player_clock_in_reward'),
      ('record_player_ledger_entry', 'attendance', 'staff_scan_reward'),
      ('record_player_ledger_entry', 'banking', 'account_transfer_in'),
      ('record_player_ledger_entry', 'banking', 'account_transfer_out'),
      ('record_player_ledger_entry', 'banking', 'player_transfer_received'),
      ('record_player_ledger_entry', 'banking', 'player_transfer_sent'),
      ('record_player_ledger_entry', 'banking', 'savings_interest'),
      ('record_player_ledger_entry', 'business', 'business_acquisition_payment'),
      ('record_player_ledger_entry', 'business', 'business_sale_proceeds'),
      ('record_player_ledger_entry', 'business', 'capital_contribution_out'),
      ('record_player_ledger_entry', 'business', 'capitalization_in'),
      ('record_player_ledger_entry', 'business', 'capitalization_out'),
      ('record_player_ledger_entry', 'business', 'formation_fee'),
      ('record_player_ledger_entry', 'business', 'input_purchase'),
      ('record_player_ledger_entry', 'business', 'ownership_cash_transfer_in'),
      ('record_player_ledger_entry', 'business', 'ownership_cash_transfer_out'),
      ('record_player_ledger_entry', 'business', 'ownership_purchase'),
      ('record_player_ledger_entry', 'business', 'ownership_sale'),
      ('record_player_ledger_entry', 'business', 'payroll_employee_credit'),
      ('record_player_ledger_entry', 'business', 'payroll_recovery_credit'),
      ('record_player_ledger_entry', 'business', 'production_labor'),
      ('record_player_ledger_entry', 'business', 'sales_revenue'),
      ('record_player_ledger_entry', 'business', 'tax_expense'),
      ('record_player_ledger_entry', 'contracts', 'contract_reward_cash'),
      ('record_player_ledger_entry', 'ledger', 'staff_player_balance_adjustment'),
      ('record_player_ledger_entry', 'loans', 'loan_disbursement'),
      ('record_player_ledger_entry', 'loans', 'loan_payment'),
      ('record_player_ledger_entry', 'marketplace', 'marketplace_purchase'),
      ('record_player_ledger_entry', 'marketplace', 'marketplace_refund_credit'),
      ('record_player_ledger_entry', 'marketplace', 'marketplace_refund_debit'),
      ('record_player_ledger_entry', 'marketplace', 'marketplace_sale'),
      ('record_player_ledger_entry', 'setup', 'initial_balance_seed'),
      ('record_player_ledger_entry', 'stocks', 'stock_buy'),
      ('record_player_ledger_entry', 'stocks', 'stock_sell'),
      ('record_player_ledger_entry', 'store', 'business_offer_purchase_debit'),
      ('record_player_ledger_entry', 'store', 'store_purchase'),
      ('record_player_ledger_entry', 'storylines', 'cash_credit'),
      ('record_player_ledger_entry', 'storylines', 'cash_debit'),
      ('record_player_ledger_entry', 'travel', 'route_travel'),
      ('record_business_ledger_entry_v2', 'business', 'capital_contribution_in'),
      ('record_business_ledger_entry_v2', 'business', 'payroll_period_settlement'),
      ('record_business_ledger_entry_v2', 'business', 'payroll_recovery_settlement'),
      ('record_business_ledger_entry_v2', 'business', 'store_procurement_purchase'),
      ('record_business_ledger_entry_v2', 'store', 'business_offer_purchase_credit')
  );
$function$;

revoke all on function private.bank_compatibility_gateway_allowed_v1(
  text, text, text
) from public, anon, authenticated, service_role;

create or replace function private.post_bank_transaction_v1(
  p_game_session_id uuid,
  p_transaction_kind text,
  p_source_domain text,
  p_source_action text,
  p_source_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_lines jsonb,
  p_created_by_type text,
  p_created_by_id uuid,
  p_metadata jsonb default '{}'::jsonb,
  p_consumed_hold_ids uuid[] default '{}'::uuid[]
)
returns table (
  bank_transaction_id uuid,
  bank_transaction_public_key text,
  replayed boolean,
  posted_at timestamptz,
  line_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_kind text := lower(btrim(coalesce(p_transaction_kind, '')));
  v_source_domain text := btrim(coalesce(p_source_domain, ''));
  v_source_action text := btrim(coalesce(p_source_action, ''));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_actor_type text := lower(btrim(coalesce(p_created_by_type, '')));
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_consumed_hold_ids uuid[] := coalesce(p_consumed_hold_ids, '{}'::uuid[]);
  v_transaction public.bank_transactions%rowtype;
  v_line record;
  v_hold public.bank_account_holds%rowtype;
  v_account_id uuid;
  v_ledger_id uuid;
  v_balance_id uuid;
  v_amount numeric;
  v_proposed_balance numeric;
  v_remaining_holds numeric;
  v_account_type text;
  v_player_id uuid;
  v_business_id uuid;
  v_entry_type text;
  v_valid_count integer;
  v_consumed_count integer;
  v_distinct_consumed_count integer;
  v_line_count integer;
  v_now timestamptz := clock_timestamp();
  v_prior_post_context text := coalesce(
    current_setting('app.bank_posting_v1', true), ''
  );
begin
  if p_game_session_id is null then
    raise exception 'BANK_TRANSACTION_GAME_REQUIRED' using errcode = 'P0001';
  end if;
  if v_kind !~ '^[a-z][a-z0-9._:-]{0,95}$' then
    raise exception 'BANK_TRANSACTION_KIND_INVALID' using errcode = 'P0001';
  end if;
  if length(v_source_domain) not between 1 and 120
    or length(v_source_action) not between 1 and 160
  then
    raise exception 'BANK_TRANSACTION_SOURCE_INVALID' using errcode = 'P0001';
  end if;
  if length(v_idempotency_key) not between 8 and 240 then
    raise exception 'BANK_TRANSACTION_IDEMPOTENCY_KEY_INVALID' using errcode = 'P0001';
  end if;
  if coalesce(p_request_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'BANK_TRANSACTION_REQUEST_HASH_INVALID' using errcode = 'P0001';
  end if;
  if v_actor_type not in ('staff_user', 'player', 'system') then
    raise exception 'BANK_TRANSACTION_ACTOR_INVALID' using errcode = 'P0001';
  end if;
  if jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'BANK_TRANSACTION_METADATA_INVALID' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) not between 2 and 64
  then
    raise exception 'BANK_TRANSACTION_LINES_INVALID' using errcode = 'P0001';
  end if;

  v_line_count := jsonb_array_length(p_lines);

  -- Every monetary post and capacity snapshot uses this identical game-scoped
  -- advisory key. It is acquired before replay/header/account work.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'banking-monetary-v1:' || p_game_session_id::text,
    0
  ));

  select transaction_row.*
  into v_transaction
  from public.bank_transactions as transaction_row
  where transaction_row.game_session_id = p_game_session_id
    and transaction_row.source_domain = v_source_domain
    and transaction_row.source_action = v_source_action
    and transaction_row.idempotency_key = v_idempotency_key;
  if found then
    if v_transaction.request_hash <> p_request_hash
      or v_transaction.posting_version <> 'balanced_v2'
    then
      raise exception 'BANK_TRANSACTION_IDEMPOTENCY_CONFLICT'
        using errcode = 'P0001';
    end if;
    select count(*)::integer
    into v_valid_count
    from public.ledger_entries as ledger_row
    where ledger_row.bank_transaction_id = v_transaction.id;
    return query select
      v_transaction.id,
      v_transaction.public_key,
      true,
      v_transaction.posted_at,
      v_valid_count;
    return;
  end if;

  select count(*)::integer
  into v_valid_count
  from jsonb_array_elements(p_lines) with ordinality as line_row(value, ordinal)
  where jsonb_typeof(line_row.value) = 'object'
    and coalesce(line_row.value ->> 'bankAccountId', '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and coalesce(line_row.value ->> 'amount', '')
      ~ '^-?[0-9]+([.][0-9]+)?$'
    and (line_row.value ->> 'amount')::numeric <> 0
    and (
      not (line_row.value ? 'entryType')
      or line_row.value ->> 'entryType' in ('credit', 'debit', 'adjustment')
    )
    and (
      not (line_row.value ? 'metadata')
      or jsonb_typeof(line_row.value -> 'metadata') = 'object'
    );
  if v_valid_count <> v_line_count then
    raise exception 'BANK_TRANSACTION_LINE_INVALID' using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_valid_count
  from jsonb_array_elements(p_lines) as line_row(value)
  join public.bank_accounts as account_row
    on account_row.id = (line_row.value ->> 'bankAccountId')::uuid
   and account_row.game_session_id = p_game_session_id
   and account_row.status = 'active'
  join public.currencies as currency_row
    on currency_row.code = account_row.currency_code
   and currency_row.status = 'active'
  where (line_row.value ->> 'amount')::numeric
    = round((line_row.value ->> 'amount')::numeric, currency_row.decimal_places);
  if v_valid_count <> v_line_count then
    raise exception 'BANK_ACCOUNT_OR_MINOR_UNIT_INVALID' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_lines) as line_row(value)
    where (line_row.value ->> 'entryType') = 'credit'
      and (line_row.value ->> 'amount')::numeric < 0
    union all
    select 1
    from jsonb_array_elements(p_lines) as line_row(value)
    where (line_row.value ->> 'entryType') = 'debit'
      and (line_row.value ->> 'amount')::numeric > 0
  ) then
    raise exception 'BANK_TRANSACTION_ENTRY_TYPE_SIGN_INVALID'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_lines) as line_row(value)
    join public.bank_accounts as account_row
      on account_row.id = (line_row.value ->> 'bankAccountId')::uuid
    group by account_row.currency_code
    having sum((line_row.value ->> 'amount')::numeric) <> 0
  ) then
    raise exception 'BANK_TRANSACTION_CURRENCY_NOT_BALANCED'
      using errcode = 'P0001';
  end if;

  if v_kind = 'compatibility_bridge' then
    if coalesce(v_metadata ->> 'compatibilityAuthority', '')
        <> 'allowlisted_legacy_gateway_v1'
      or not private.bank_compatibility_gateway_allowed_v1(
        v_metadata ->> 'compatibilityGateway',
        v_source_domain,
        v_source_action
      )
      or v_line_count <> 2
      or (
        select count(*)
        from jsonb_array_elements(p_lines) as line_row(value)
        join public.bank_accounts as account_row
          on account_row.id = (line_row.value ->> 'bankAccountId')::uuid
        where account_row.account_kind = 'compatibility_offset'
      ) <> 1
    then
      raise exception 'BANK_COMPATIBILITY_BRIDGE_NOT_ALLOWLISTED'
        using errcode = 'P0001';
    end if;
  elsif exists (
    select 1
    from jsonb_array_elements(p_lines) as line_row(value)
    join public.bank_accounts as account_row
      on account_row.id = (line_row.value ->> 'bankAccountId')::uuid
    where account_row.account_kind = 'compatibility_offset'
  ) then
    raise exception 'BANK_COMPATIBILITY_OFFSET_FORBIDDEN'
      using errcode = 'P0001';
  end if;

  select count(*)::integer, count(distinct hold_id)::integer
  into v_consumed_count, v_distinct_consumed_count
  from unnest(v_consumed_hold_ids) as consumed(hold_id);
  if v_consumed_count <> v_distinct_consumed_count then
    raise exception 'BANK_TRANSACTION_DUPLICATE_HOLD'
      using errcode = 'P0001';
  end if;

  -- Account identity and projection locks use one deterministic UUID order.
  perform account_row.id
  from public.bank_accounts as account_row
  join (
    select distinct (line_row.value ->> 'bankAccountId')::uuid as bank_account_id
    from jsonb_array_elements(p_lines) as line_row(value)
  ) as parsed on parsed.bank_account_id = account_row.id
  where account_row.game_session_id = p_game_session_id
  order by account_row.id
  for update of account_row;

  for v_account_id in
    select distinct (line_row.value ->> 'bankAccountId')::uuid
    from jsonb_array_elements(p_lines) as line_row(value)
    order by (line_row.value ->> 'bankAccountId')::uuid
  loop
    perform private.ensure_bank_account_projection_v1(
      p_game_session_id,
      v_account_id
    );
  end loop;

  perform balance_row.id
  from public.account_balances as balance_row
  join (
    select distinct (line_row.value ->> 'bankAccountId')::uuid as bank_account_id
    from jsonb_array_elements(p_lines) as line_row(value)
  ) as parsed on parsed.bank_account_id = balance_row.bank_account_id
  order by balance_row.bank_account_id
  for update of balance_row;

  if v_consumed_count > 0 then
    perform hold_row.id
    from public.bank_account_holds as hold_row
    where hold_row.id = any(v_consumed_hold_ids)
    order by hold_row.id
    for update;

    select count(*)::integer
    into v_valid_count
    from public.bank_account_holds as hold_row
    where hold_row.id = any(v_consumed_hold_ids)
      and hold_row.game_session_id = p_game_session_id
      and hold_row.status in ('active', 'claimed')
      and (hold_row.expires_at is null or hold_row.expires_at > v_now);
    if v_valid_count <> v_consumed_count then
      raise exception 'BANK_TRANSACTION_HOLD_NOT_ACTIVE'
        using errcode = 'P0001';
    end if;

    if exists (
      with debit_totals as (
        select
          (line_row.value ->> 'bankAccountId')::uuid as bank_account_id,
          sum((line_row.value ->> 'amount')::numeric) as net_delta
        from jsonb_array_elements(p_lines) as line_row(value)
        group by (line_row.value ->> 'bankAccountId')::uuid
      ), hold_totals as (
        select hold_row.bank_account_id, sum(hold_row.amount) as held_amount
        from public.bank_account_holds as hold_row
        where hold_row.id = any(v_consumed_hold_ids)
        group by hold_row.bank_account_id
      )
      select 1
      from hold_totals
      left join debit_totals
        on debit_totals.bank_account_id = hold_totals.bank_account_id
      where debit_totals.bank_account_id is null
        or debit_totals.net_delta >= 0
        or hold_totals.held_amount > -debit_totals.net_delta
    ) then
      raise exception 'BANK_TRANSACTION_HOLD_ACCOUNT_OR_AMOUNT_MISMATCH'
        using errcode = 'P0001';
    end if;
  end if;

  for v_line in
    select
      account_row.id as bank_account_id,
      account_row.account_kind,
      balance_row.balance,
      sum((line_row.value ->> 'amount')::numeric) as amount
    from jsonb_array_elements(p_lines) as line_row(value)
    join public.bank_accounts as account_row
      on account_row.id = (line_row.value ->> 'bankAccountId')::uuid
    join public.account_balances as balance_row
      on balance_row.bank_account_id = account_row.id
    group by account_row.id, account_row.account_kind, balance_row.balance
    order by account_row.id
  loop
    v_proposed_balance := v_line.balance + v_line.amount;
    v_remaining_holds := private.active_bank_account_hold_amount_v1(
      p_game_session_id,
      v_line.bank_account_id,
      v_consumed_hold_ids
    );
    if v_proposed_balance - v_remaining_holds < 0
      -- A positive reserve posting that leaves the account negative only
      -- repays an already-authorized facility draw. It cannot expand either
      -- the deficit or reserved capacity, so it must not require the target
      -- side cap snapshot carried by a cross-currency settlement.
      and not (
        v_line.account_kind = 'fx_reserve'
        and v_line.balance < 0
        and v_line.amount > 0
        and v_proposed_balance > v_line.balance
      )
      and not private.authorize_bank_account_negative_balance_v1(
        p_game_session_id,
        v_line.bank_account_id,
        v_proposed_balance,
        v_kind,
        v_metadata,
        v_consumed_hold_ids
      )
    then
      raise exception 'BANK_ACCOUNT_AVAILABLE_BALANCE_INSUFFICIENT'
        using errcode = 'P0001';
    end if;
  end loop;

  perform pg_catalog.set_config('app.bank_posting_v1', 'on', true);

  insert into public.bank_transactions (
    public_key,
    game_session_id,
    transaction_kind,
    source_domain,
    source_action,
    source_id,
    idempotency_key,
    request_hash,
    posting_version,
    status,
    metadata,
    created_at,
    posted_at
  ) values (
    'btx_' || substr(private.bank_digest_text_v1(concat_ws(
      '|',
      'bank-transaction-v1',
      p_game_session_id::text,
      v_source_domain,
      v_source_action,
      v_idempotency_key
    )), 1, 32),
    p_game_session_id,
    v_kind,
    v_source_domain,
    v_source_action,
    p_source_id,
    v_idempotency_key,
    p_request_hash,
    'balanced_v2',
    'posted',
    v_metadata || jsonb_build_object('lineCount', v_line_count),
    v_now,
    v_now
  )
  returning * into v_transaction;

  for v_line in
    select
      line_row.ordinal::integer as line_number,
      line_row.value,
      account_row.*,
      party_row.party_kind,
      party_row.player_id as party_player_id,
      party_row.business_id as party_business_id,
      business_row.owner_player_id as business_owner_player_id,
      business_row.public_key as business_public_key
    from jsonb_array_elements(p_lines) with ordinality as line_row(value, ordinal)
    join public.bank_accounts as account_row
      on account_row.id = (line_row.value ->> 'bankAccountId')::uuid
    join public.economic_parties as party_row
      on party_row.id = account_row.party_id
     and party_row.game_session_id = account_row.game_session_id
    left join public.business_entities as business_row
      on business_row.id = party_row.business_id
     and business_row.game_session_id = party_row.game_session_id
    order by line_row.ordinal
  loop
    v_amount := (v_line.value ->> 'amount')::numeric;
    v_entry_type := coalesce(
      nullif(v_line.value ->> 'entryType', ''),
      case when v_amount > 0 then 'credit' else 'debit' end
    );
    v_player_id := null;
    v_business_id := null;

    if v_line.party_kind = 'player' then
      v_player_id := v_line.party_player_id;
      v_account_type := case v_line.account_kind
        when 'checking' then 'checking'
        when 'savings' then 'savings'
        when 'legacy' then v_line.legacy_account_type
        else 'bank:' || v_line.account_kind
      end;
    elsif v_line.party_kind = 'business' then
      if v_line.business_public_key is null then
        raise exception 'BANK_TRANSACTION_BUSINESS_ACCOUNT_INVALID'
          using errcode = 'P0001';
      end if;
      v_player_id := v_line.business_owner_player_id;
      v_business_id := v_line.party_business_id;
      v_account_type := public.business_account_type_v1(
        v_line.business_public_key
      );
    else
      v_account_type := case v_line.account_kind
        when 'legacy' then v_line.legacy_account_type
        else 'bank:' || v_line.account_kind
      end;
    end if;

    insert into public.ledger_entries (
      game_session_id,
      player_id,
      business_id,
      account_type,
      amount,
      currency_code,
      entry_type,
      source_domain,
      source_action,
      source_id,
      created_by_type,
      created_by_id,
      bank_account_id,
      bank_transaction_id,
      line_number,
      line_metadata,
      created_at
    ) values (
      p_game_session_id,
      v_player_id,
      v_business_id,
      v_account_type,
      v_amount,
      v_line.currency_code,
      v_entry_type,
      v_source_domain,
      v_source_action,
      p_source_id,
      v_actor_type,
      p_created_by_id,
      v_line.id,
      v_transaction.id,
      v_line.line_number,
      coalesce(v_line.value -> 'metadata', '{}'::jsonb),
      v_now
    )
    returning id into v_ledger_id;
  end loop;

  -- Preserve logical line evidence while mutating each balance projection once
  -- with that account's aggregate signed delta.
  for v_line in
    select
      (line_row.value ->> 'bankAccountId')::uuid as bank_account_id,
      sum((line_row.value ->> 'amount')::numeric) as net_delta
    from jsonb_array_elements(p_lines) as line_row(value)
    group by (line_row.value ->> 'bankAccountId')::uuid
    order by (line_row.value ->> 'bankAccountId')::uuid
  loop
    select ledger_row.id
    into v_ledger_id
    from public.ledger_entries as ledger_row
    where ledger_row.bank_transaction_id = v_transaction.id
      and ledger_row.bank_account_id = v_line.bank_account_id
    order by ledger_row.line_number desc
    limit 1;

    update public.account_balances
    set balance = balance + v_line.net_delta,
        last_ledger_entry_id = v_ledger_id
    where bank_account_id = v_line.bank_account_id
    returning id into v_balance_id;
    if v_balance_id is null then
      raise exception 'BANK_ACCOUNT_PROJECTION_MISSING' using errcode = 'P0001';
    end if;
  end loop;

  if v_consumed_count > 0 then
    for v_hold in
      select hold_row.*
      from public.bank_account_holds as hold_row
      where hold_row.id = any(v_consumed_hold_ids)
      order by hold_row.id
      for update
    loop
      update public.bank_account_holds
      set status = 'consumed',
          terminal_at = v_now
      where id = v_hold.id;

      insert into public.bank_account_hold_events (
        public_key,
        game_session_id,
        hold_id,
        event_type,
        idempotency_key,
        request_hash,
        metadata
      ) values (
        'bhe_' || substr(private.bank_digest_text_v1(
          v_hold.id::text || '|consumed|' || v_transaction.id::text
        ), 1, 32),
        p_game_session_id,
        v_hold.id,
        'consumed',
        'event:' || substr(private.bank_digest_text_v1(
          'consumed|' || v_transaction.id::text || '|' || v_hold.id::text
        ), 1, 64),
        p_request_hash,
        jsonb_build_object(
          'commandIdempotencyKey', v_idempotency_key,
          'bankTransactionKey', v_transaction.public_key,
          'bankTransactionId', v_transaction.id
        )
      );
    end loop;
  end if;

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
    v_actor_type,
    p_created_by_id,
    v_source_domain || '.' || v_source_action,
    'bank_transaction',
    v_transaction.id,
    v_metadata || jsonb_build_object(
      'bankTransactionKey', v_transaction.public_key,
      'postingVersion', 'balanced_v2',
      'lineCount', v_line_count,
      'consumedHoldCount', v_consumed_count
    )
  );

  perform pg_catalog.set_config(
    'app.bank_posting_v1', v_prior_post_context, true
  );

  return query select
    v_transaction.id,
    v_transaction.public_key,
    false,
    v_transaction.posted_at,
    v_line_count;
end;
$function$;

revoke all on function private.post_bank_transaction_v1(
  uuid, text, text, text, uuid, text, text, jsonb, text, uuid, jsonb, uuid[]
) from public, anon, authenticated, service_role;

create or replace function public.record_player_ledger_entry(
  p_game_session_id uuid,
  p_player_id uuid,
  p_account_type text,
  p_amount numeric,
  p_currency_code text default 'ECO',
  p_entry_type text default 'adjustment',
  p_source_domain text default 'ledger',
  p_source_action text default 'staff_player_balance_adjustment',
  p_source_id uuid default null,
  p_created_by_type text default 'staff_user',
  p_created_by_id uuid default null,
  p_audit_metadata jsonb default '{}'::jsonb
)
returns table (
  ledger_entry_id uuid,
  account_balance_id uuid,
  account_type text,
  balance numeric,
  currency_code text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_player public.players%rowtype;
  v_business public.business_entities%rowtype;
  v_ledger public.ledger_entries%rowtype;
  v_balance public.account_balances%rowtype;
  v_post record;
  v_requested_account_type text := btrim(coalesce(p_account_type, 'checking'));
  v_account_type text := case lower(v_requested_account_type)
    when 'checking' then 'checking'
    when 'cash' then 'checking'
    when 'savings' then 'savings'
    else v_requested_account_type
  end;
  v_currency text := upper(btrim(coalesce(p_currency_code, 'ECO')));
  v_entry_type text := btrim(coalesce(p_entry_type, 'adjustment'));
  v_source_domain text := btrim(coalesce(p_source_domain, 'ledger'));
  v_source_action text := btrim(coalesce(
    p_source_action, 'staff_player_balance_adjustment'
  ));
  v_actor_type text := btrim(coalesce(p_created_by_type, 'staff_user'));
  v_audit_metadata jsonb := coalesce(p_audit_metadata, '{}'::jsonb);
  v_bridge_metadata jsonb;
  v_lines jsonb;
  v_target_account_id uuid;
  v_offset_account_id uuid;
  v_explicit_idempotency text;
  v_idempotency_key text;
  v_request_hash text;
begin
  if p_game_session_id is null then
    raise exception 'GAME_SESSION_REQUIRED' using errcode = 'P0001';
  end if;
  if p_player_id is null then
    raise exception 'PLAYER_REQUIRED' using errcode = 'P0001';
  end if;
  if length(v_account_type) = 0 then
    raise exception 'ACCOUNT_TYPE_REQUIRED' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'LEDGER_AMOUNT_REQUIRED' using errcode = 'P0001';
  end if;
  if length(v_currency) < 3 or length(v_currency) > 16 then
    raise exception 'INVALID_CURRENCY_CODE' using errcode = 'P0001';
  end if;
  if v_entry_type not in ('credit', 'debit', 'adjustment') then
    raise exception 'INVALID_LEDGER_ENTRY_TYPE' using errcode = 'P0001';
  end if;
  if length(v_source_domain) = 0 then
    raise exception 'SOURCE_DOMAIN_REQUIRED' using errcode = 'P0001';
  end if;
  if length(v_source_action) = 0 then
    raise exception 'SOURCE_ACTION_REQUIRED' using errcode = 'P0001';
  end if;
  if not private.bank_compatibility_gateway_allowed_v1(
    'record_player_ledger_entry', v_source_domain, v_source_action
  ) then
    raise exception 'BANK_COMPATIBILITY_GATEWAY_NOT_ALLOWLISTED'
      using errcode = 'P0001';
  end if;
  if v_actor_type not in ('staff_user', 'player', 'system') then
    raise exception 'INVALID_CREATED_BY_TYPE' using errcode = 'P0001';
  end if;
  if jsonb_typeof(v_audit_metadata) <> 'object' then
    raise exception 'AUDIT_METADATA_INVALID' using errcode = 'P0001';
  end if;

  select player_row.*
  into v_player
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active'
  for share;
  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_account_type ~ '^business:biz_[0-9a-f]{32}$' then
    select business_row.*
    into v_business
    from public.business_entities as business_row
    where business_row.game_session_id = p_game_session_id
      and business_row.public_key = substring(
        v_account_type from '^business:(biz_[0-9a-f]{32})$'
      )
      and business_row.status <> 'closed'
    for share;
    if not found then
      raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
    end if;
    v_target_account_id := private.ensure_business_bank_account_identity_v1(
      p_game_session_id,
      v_business.id,
      v_currency
    );
  elsif v_account_type in ('checking', 'savings') then
    v_target_account_id := private.ensure_player_bank_account_v1(
      p_game_session_id,
      p_player_id,
      v_account_type,
      v_currency
    );
  else
    v_target_account_id := private.resolve_legacy_bank_account_v1(
      p_game_session_id,
      p_player_id,
      null,
      v_account_type,
      v_currency,
      false
    );
  end if;

  v_offset_account_id := private.ensure_system_bank_account_v1(
    p_game_session_id,
    'banking.compatibility-offset',
    'compatibility_offset',
    v_currency
  );

  v_bridge_metadata := v_audit_metadata || jsonb_build_object(
    'compatibilityAuthority', 'allowlisted_legacy_gateway_v1',
    'compatibilityGateway', 'record_player_ledger_entry',
    'requestedAccountType', v_requested_account_type
  );
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'bankAccountId', v_target_account_id,
      'amount', p_amount,
      'entryType', v_entry_type,
      'metadata', jsonb_build_object(
        'compatibilityRole', 'requested_entry',
        'requestedAccountType', v_requested_account_type
      )
    ),
    jsonb_build_object(
      'bankAccountId', v_offset_account_id,
      'amount', -p_amount,
      'entryType', case when p_amount > 0 then 'debit' else 'credit' end,
      'metadata', jsonb_build_object(
        'compatibilityRole', 'signed_offset',
        'nonSpendable', true
      )
    )
  );

  v_explicit_idempotency := nullif(btrim(coalesce(
    v_audit_metadata ->> 'bankTransactionIdempotencyKey',
    v_audit_metadata ->> 'idempotency_key',
    ''
  )), '');
  v_idempotency_key := case
    when v_explicit_idempotency is not null then
      'compat:' || substr(private.bank_digest_text_v1(concat_ws(
        '|',
        'record_player_ledger_entry',
        v_explicit_idempotency
      )), 1, 64)
    else 'compat:' || replace(extensions.gen_random_uuid()::text, '-', '')
  end;
  v_request_hash := private.bank_digest_text_v1(jsonb_build_object(
    'gameSessionId', p_game_session_id,
    'playerId', p_player_id,
    'transactionKind', 'compatibility_bridge',
    'sourceDomain', v_source_domain,
    'sourceAction', v_source_action,
    'sourceId', p_source_id,
    'lines', v_lines,
    'createdByType', v_actor_type,
    'createdById', p_created_by_id,
    'metadata', v_bridge_metadata
  )::text);

  select *
  into v_post
  from private.post_bank_transaction_v1(
    p_game_session_id,
    'compatibility_bridge',
    v_source_domain,
    v_source_action,
    p_source_id,
    v_idempotency_key,
    v_request_hash,
    v_lines,
    v_actor_type,
    p_created_by_id,
    v_bridge_metadata,
    '{}'::uuid[]
  );

  select ledger_row.*
  into v_ledger
  from public.ledger_entries as ledger_row
  where ledger_row.bank_transaction_id = v_post.bank_transaction_id
    and ledger_row.bank_account_id = v_target_account_id;
  if not found then
    raise exception 'BANK_COMPATIBILITY_LEDGER_RESULT_MISSING'
      using errcode = 'P0001';
  end if;

  select balance_row.*
  into v_balance
  from public.account_balances as balance_row
  where balance_row.bank_account_id = v_target_account_id;
  if not found then
    raise exception 'BANK_COMPATIBILITY_BALANCE_RESULT_MISSING'
      using errcode = 'P0001';
  end if;

  if not v_post.replayed then
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
      v_actor_type,
      p_created_by_id,
      v_source_domain || '.' || v_source_action,
      'player',
      p_player_id,
      jsonb_build_object(
        'ledger_entry_id', v_ledger.id,
        'account_balance_id', v_balance.id,
        'account_type', v_balance.account_type,
        'amount', v_ledger.amount,
        'balance', v_balance.balance,
        'currency_code', v_balance.currency_code,
        'source_id', p_source_id,
        'bank_transaction_key', v_post.bank_transaction_public_key,
        'posting_version', 'balanced_v2'
      ) || v_audit_metadata
    );
  end if;

  return query select
    v_ledger.id,
    v_balance.id,
    v_balance.account_type,
    v_balance.balance,
    v_balance.currency_code,
    v_ledger.created_at;
end;
$function$;

comment on function public.record_player_ledger_entry(
  uuid, uuid, text, numeric, text, text, text, text, uuid, text, uuid, jsonb
) is
  'Compatibility gateway: posts one requested Player/legacy line and one signed non-spendable compatibility offset through the canonical balanced_v2 Banking transaction primitive.';

revoke all on function public.record_player_ledger_entry(
  uuid, uuid, text, numeric, text, text, text, text, uuid, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.record_player_ledger_entry(
  uuid, uuid, text, numeric, text, text, text, text, uuid, text, uuid, jsonb
) to service_role;

create or replace function public.record_business_ledger_entry_v2(
  p_game_session_id uuid,
  p_business_id uuid,
  p_amount numeric,
  p_currency_code text,
  p_entry_type text,
  p_source_domain text,
  p_source_action text,
  p_source_id uuid,
  p_created_by_type text,
  p_created_by_id uuid,
  p_audit_metadata jsonb default '{}'::jsonb
)
returns table (
  ledger_entry_id uuid,
  account_balance_id uuid,
  account_type text,
  balance numeric,
  currency_code text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_ledger public.ledger_entries%rowtype;
  v_balance public.account_balances%rowtype;
  v_post record;
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_entry_type text := btrim(coalesce(p_entry_type, ''));
  v_source_domain text := btrim(coalesce(p_source_domain, ''));
  v_source_action text := btrim(coalesce(p_source_action, ''));
  v_actor_type text := btrim(coalesce(p_created_by_type, ''));
  v_audit_metadata jsonb := coalesce(p_audit_metadata, '{}'::jsonb);
  v_bridge_metadata jsonb;
  v_lines jsonb;
  v_target_account_id uuid;
  v_offset_account_id uuid;
  v_explicit_idempotency text;
  v_idempotency_key text;
  v_request_hash text;
begin
  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = p_business_id
    and business_row.status <> 'closed'
  for share;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_currency <> v_business.currency_code then
    raise exception 'BUSINESS_CURRENCY_MISMATCH' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'LEDGER_AMOUNT_REQUIRED' using errcode = 'P0001';
  end if;
  if v_entry_type not in ('credit', 'debit', 'adjustment') then
    raise exception 'INVALID_LEDGER_ENTRY_TYPE' using errcode = 'P0001';
  end if;
  if length(v_source_domain) = 0 or length(v_source_action) = 0 then
    raise exception 'SOURCE_REQUIRED' using errcode = 'P0001';
  end if;
  if not private.bank_compatibility_gateway_allowed_v1(
    'record_business_ledger_entry_v2', v_source_domain, v_source_action
  ) then
    raise exception 'BANK_COMPATIBILITY_GATEWAY_NOT_ALLOWLISTED'
      using errcode = 'P0001';
  end if;
  if v_actor_type not in ('staff_user', 'player', 'system') then
    raise exception 'INVALID_CREATED_BY_TYPE' using errcode = 'P0001';
  end if;
  if jsonb_typeof(v_audit_metadata) <> 'object' then
    raise exception 'AUDIT_METADATA_INVALID' using errcode = 'P0001';
  end if;

  v_target_account_id := private.ensure_business_bank_account_identity_v1(
    p_game_session_id,
    p_business_id,
    v_currency
  );
  v_offset_account_id := private.ensure_system_bank_account_v1(
    p_game_session_id,
    'banking.compatibility-offset',
    'compatibility_offset',
    v_currency
  );
  v_bridge_metadata := v_audit_metadata || jsonb_build_object(
    'compatibilityAuthority', 'allowlisted_legacy_gateway_v1',
    'compatibilityGateway', 'record_business_ledger_entry_v2',
    'businessId', v_business.id,
    'businessKey', v_business.public_key
  );
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'bankAccountId', v_target_account_id,
      'amount', p_amount,
      'entryType', v_entry_type,
      'metadata', jsonb_build_object(
        'compatibilityRole', 'requested_entry',
        'businessKey', v_business.public_key
      )
    ),
    jsonb_build_object(
      'bankAccountId', v_offset_account_id,
      'amount', -p_amount,
      'entryType', case when p_amount > 0 then 'debit' else 'credit' end,
      'metadata', jsonb_build_object(
        'compatibilityRole', 'signed_offset',
        'nonSpendable', true
      )
    )
  );
  v_explicit_idempotency := nullif(btrim(coalesce(
    v_audit_metadata ->> 'bankTransactionIdempotencyKey',
    v_audit_metadata ->> 'idempotency_key',
    ''
  )), '');
  v_idempotency_key := case
    when v_explicit_idempotency is not null then
      'compat:' || substr(private.bank_digest_text_v1(concat_ws(
        '|',
        'record_business_ledger_entry_v2',
        v_explicit_idempotency
      )), 1, 64)
    else 'compat:' || replace(extensions.gen_random_uuid()::text, '-', '')
  end;
  v_request_hash := private.bank_digest_text_v1(jsonb_build_object(
    'gameSessionId', p_game_session_id,
    'businessId', p_business_id,
    'transactionKind', 'compatibility_bridge',
    'sourceDomain', v_source_domain,
    'sourceAction', v_source_action,
    'sourceId', p_source_id,
    'lines', v_lines,
    'createdByType', v_actor_type,
    'createdById', p_created_by_id,
    'metadata', v_bridge_metadata
  )::text);

  select *
  into v_post
  from private.post_bank_transaction_v1(
    p_game_session_id,
    'compatibility_bridge',
    v_source_domain,
    v_source_action,
    p_source_id,
    v_idempotency_key,
    v_request_hash,
    v_lines,
    v_actor_type,
    p_created_by_id,
    v_bridge_metadata,
    '{}'::uuid[]
  );

  select ledger_row.*
  into v_ledger
  from public.ledger_entries as ledger_row
  where ledger_row.bank_transaction_id = v_post.bank_transaction_id
    and ledger_row.bank_account_id = v_target_account_id;
  select balance_row.*
  into v_balance
  from public.account_balances as balance_row
  where balance_row.bank_account_id = v_target_account_id;
  if v_ledger.id is null or v_balance.id is null then
    raise exception 'BANK_COMPATIBILITY_RESULT_MISSING' using errcode = 'P0001';
  end if;

  if not v_post.replayed then
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
      v_actor_type,
      p_created_by_id,
      v_source_domain || '.' || v_source_action,
      'player',
      v_business.owner_player_id,
      jsonb_build_object(
        'ledger_entry_id', v_ledger.id,
        'account_balance_id', v_balance.id,
        'account_type', v_balance.account_type,
        'amount', v_ledger.amount,
        'balance', v_balance.balance,
        'currency_code', v_balance.currency_code,
        'source_id', p_source_id,
        'business_id', v_business.id,
        'business_key', v_business.public_key,
        'bank_transaction_key', v_post.bank_transaction_public_key,
        'posting_version', 'balanced_v2'
      ) || v_audit_metadata
    );
  end if;

  return query select
    v_ledger.id,
    v_balance.id,
    v_balance.account_type,
    v_balance.balance,
    v_balance.currency_code,
    v_ledger.created_at;
end;
$function$;

comment on function public.record_business_ledger_entry_v2(
  uuid, uuid, numeric, text, text, text, text, uuid, text, uuid, jsonb
) is
  'Compatibility gateway: posts one requested Business line and one signed non-spendable compatibility offset through the canonical balanced_v2 Banking transaction primitive.';

revoke all on function public.record_business_ledger_entry_v2(
  uuid, uuid, numeric, text, text, text, text, uuid, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.record_business_ledger_entry_v2(
  uuid, uuid, numeric, text, text, text, text, uuid, text, uuid, jsonb
) to service_role;

create or replace function public.list_player_bank_accounts_v1(
  p_game_session_id uuid,
  p_player_id uuid
)
returns table (
  account_key text,
  account_kind text,
  currency_code text,
  posted_amount numeric,
  held_amount numeric,
  available_amount numeric
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  perform 1
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active';
  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  return query
  select
    account_row.public_key,
    account_row.account_kind,
    account_row.currency_code,
    balance_row.balance,
    private.active_bank_account_hold_amount_v1(
      p_game_session_id,
      account_row.id,
      '{}'::uuid[]
    ) as held_amount,
    balance_row.balance - private.active_bank_account_hold_amount_v1(
      p_game_session_id,
      account_row.id,
      '{}'::uuid[]
    ) as available_amount
  from public.economic_parties as party_row
  join public.bank_accounts as account_row
    on account_row.game_session_id = party_row.game_session_id
   and account_row.party_id = party_row.id
  join public.account_balances as balance_row
    on balance_row.bank_account_id = account_row.id
  where party_row.game_session_id = p_game_session_id
    and party_row.party_kind = 'player'
    and party_row.player_id = p_player_id
    and account_row.account_kind in ('checking', 'savings')
    and account_row.status in ('active', 'restricted')
  order by
    case account_row.account_kind when 'checking' then 0 else 1 end,
    account_row.currency_code,
    account_row.public_key;
end;
$function$;

revoke all on function public.list_player_bank_accounts_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.list_player_bank_accounts_v1(uuid, uuid)
  to service_role;

alter table public.ledger_entries force row level security;
alter table public.account_balances force row level security;
revoke all on table public.ledger_entries
  from public, anon, authenticated, service_role;
revoke all on table public.account_balances
  from public, anon, authenticated, service_role;
grant select on table public.ledger_entries to service_role;
grant select on table public.account_balances to service_role;

commit;
