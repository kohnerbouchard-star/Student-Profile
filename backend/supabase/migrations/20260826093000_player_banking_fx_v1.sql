-- Player Banking customer FX V1.
-- Quotes are immutable and reserve nothing. Standard orders reserve payer and
-- target capacity and settle at the next strictly later 08:00 fixing boundary.
-- Instant orders settle principal and their separate source-currency fee in one
-- balanced payment-versus-payment transaction.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table public.fx_quotes (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'fxq_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null,
  product text not null,
  source_account_id uuid not null,
  target_account_id uuid not null,
  source_currency_code text not null references public.currencies(code),
  target_currency_code text not null references public.currencies(code),
  source_minor_unit integer not null,
  target_minor_unit integer not null,
  source_amount_mode text not null,
  source_amount numeric(38, 18) not null,
  reference_rate numeric(38, 18) not null,
  customer_rate numeric(38, 18) not null,
  spread_rate numeric(18, 8) not null,
  fee_rate numeric(18, 8) not null,
  fee_amount numeric(38, 18) not null,
  target_amount numeric(38, 18) not null,
  fixing_id uuid not null,
  policy_version_id uuid not null references public.fx_policy_versions(id),
  target_cap_snapshot_id uuid null,
  requires_fx boolean not null,
  rounding_disclosure text not null,
  expires_at timestamptz not null,
  settles_at timestamptz not null,
  idempotency_key text not null,
  request_hash text not null,
  evidence_hash text not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint fx_quotes_public_key_format check (public_key ~ '^fxq_[0-9a-f]{32}$'),
  constraint fx_quotes_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id),
  constraint fx_quotes_source_account_scope_fk
    foreign key (source_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id),
  constraint fx_quotes_target_account_scope_fk
    foreign key (target_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id),
  constraint fx_quotes_fixing_scope_fk
    foreign key (fixing_id, game_session_id)
    references public.fx_fixings(id, game_session_id),
  constraint fx_quotes_cap_scope_fk
    foreign key (target_cap_snapshot_id, game_session_id)
    references public.fx_liquidity_cap_snapshots(id, game_session_id),
  constraint fx_quotes_product_check check (product in ('standard', 'instant')),
  constraint fx_quotes_precision_check check (
    source_minor_unit between 0 and 18
    and target_minor_unit between 0 and 18
  ),
  constraint fx_quotes_amount_mode_check
    check (source_amount_mode = 'source_debit'),
  constraint fx_quotes_amounts_positive
    check (source_amount > 0 and target_amount > 0),
  constraint fx_quotes_rates_check
    check (
      reference_rate > 0
      and customer_rate > 0
      and spread_rate in (0, 0.005)
      and fee_rate in (0, 0.02)
      and fee_amount >= 0
    ),
  constraint fx_quotes_same_currency_check
    check (
      (
        requires_fx
        and source_currency_code <> target_currency_code
        and spread_rate = 0.005
        and target_cap_snapshot_id is not null
      )
      or (
        not requires_fx
        and source_currency_code = target_currency_code
        and reference_rate = 1
        and customer_rate = 1
        and spread_rate = 0
        and fee_rate = 0
        and fee_amount = 0
        and target_cap_snapshot_id is null
      )
    ),
  constraint fx_quotes_instant_fee_check
    check (
      (product = 'instant' and (not requires_fx or fee_rate = 0.02))
      or (product = 'standard' and fee_rate = 0 and fee_amount = 0)
    ),
  constraint fx_quotes_rounding_not_blank
    check (length(btrim(rounding_disclosure)) between 1 and 400),
  constraint fx_quotes_timing_check
    check (
      created_at < expires_at
      and (
        (product = 'standard' and created_at < settles_at and expires_at <= settles_at)
        or (product = 'instant' and settles_at = created_at)
      )
    ),
  constraint fx_quotes_idempotency_not_blank
    check (length(btrim(idempotency_key)) between 8 and 160),
  constraint fx_quotes_request_hash_format check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint fx_quotes_evidence_hash_format check (evidence_hash ~ '^[0-9a-f]{64}$'),
  constraint fx_quotes_scope_idempotency_unique
    unique (game_session_id, player_id, idempotency_key),
  constraint fx_quotes_scope_id_unique unique (id, game_session_id)
);

create index fx_quotes_player_created_idx
  on public.fx_quotes(game_session_id, player_id, created_at desc, public_key desc);

create table public.fx_orders (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'fxo_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null,
  quote_id uuid not null,
  product text not null,
  payer_hold_id uuid null,
  clearing_hold_id uuid null,
  reserve_hold_id uuid null,
  source_amount numeric(38, 18) not null,
  fee_amount numeric(38, 18) not null,
  target_amount numeric(38, 18) not null,
  clearing_reserved_amount numeric(38, 18) not null default 0,
  reserve_reserved_amount numeric(38, 18) not null default 0,
  settles_at timestamptz not null,
  idempotency_key text not null,
  request_hash text not null,
  submitted_at timestamptz not null default clock_timestamp(),

  constraint fx_orders_public_key_format check (public_key ~ '^fxo_[0-9a-f]{32}$'),
  constraint fx_orders_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id),
  constraint fx_orders_quote_scope_fk
    foreign key (quote_id, game_session_id)
    references public.fx_quotes(id, game_session_id),
  constraint fx_orders_quote_unique unique (quote_id),
  constraint fx_orders_product_check check (product in ('standard', 'instant')),
  constraint fx_orders_amounts_check
    check (
      source_amount > 0
      and fee_amount >= 0
      and target_amount > 0
      and clearing_reserved_amount >= 0
      and reserve_reserved_amount >= 0
    ),
  constraint fx_orders_standard_holds_check
    check (
      (
        product = 'standard'
        and payer_hold_id is not null
        and clearing_reserved_amount + reserve_reserved_amount = target_amount
        and (clearing_reserved_amount = 0 or clearing_hold_id is not null)
        and (reserve_reserved_amount = 0 or reserve_hold_id is not null)
      )
      or (
        product = 'instant'
        and payer_hold_id is null
        and clearing_hold_id is null
        and reserve_hold_id is null
        and clearing_reserved_amount = 0
        and reserve_reserved_amount = 0
      )
    ),
  constraint fx_orders_payer_hold_scope_fk
    foreign key (payer_hold_id, game_session_id)
    references public.bank_account_holds(id, game_session_id),
  constraint fx_orders_clearing_hold_scope_fk
    foreign key (clearing_hold_id, game_session_id)
    references public.bank_account_holds(id, game_session_id),
  constraint fx_orders_reserve_hold_scope_fk
    foreign key (reserve_hold_id, game_session_id)
    references public.bank_account_holds(id, game_session_id),
  constraint fx_orders_idempotency_not_blank
    check (length(btrim(idempotency_key)) between 8 and 160),
  constraint fx_orders_request_hash_format check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint fx_orders_scope_idempotency_unique
    unique (game_session_id, player_id, idempotency_key),
  constraint fx_orders_scope_id_unique unique (id, game_session_id)
);

create index fx_orders_player_submitted_idx
  on public.fx_orders(game_session_id, player_id, submitted_at desc, public_key desc);

create table public.fx_order_events (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'fxe_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  order_id uuid not null,
  event_type text not null,
  idempotency_key text not null,
  request_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),

  constraint fx_order_events_public_key_format check (public_key ~ '^fxe_[0-9a-f]{32}$'),
  constraint fx_order_events_order_scope_fk
    foreign key (order_id, game_session_id)
    references public.fx_orders(id, game_session_id) on delete cascade,
  constraint fx_order_events_type_check
    check (event_type in ('submitted', 'claimed', 'settled', 'cancelled', 'failed')),
  constraint fx_order_events_idempotency_not_blank
    check (length(btrim(idempotency_key)) between 8 and 200),
  constraint fx_order_events_request_hash_format check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint fx_order_events_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint fx_order_events_scope_idempotency_unique
    unique (game_session_id, order_id, idempotency_key)
);

create table public.fx_settlement_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'fxr_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  order_id uuid not null,
  bank_transaction_id uuid not null,
  source_currency_code text not null references public.currencies(code),
  target_currency_code text not null references public.currencies(code),
  source_amount numeric(38, 18) not null,
  fee_amount numeric(38, 18) not null,
  target_amount numeric(38, 18) not null,
  reserve_draw_amount numeric(38, 18) not null,
  reserve_repayment_amount numeric(38, 18) not null,
  fixing_id uuid not null,
  settled_at timestamptz not null,
  evidence_hash text not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint fx_settlement_receipts_public_key_format
    check (public_key ~ '^fxr_[0-9a-f]{32}$'),
  constraint fx_settlement_receipts_order_scope_fk
    foreign key (order_id, game_session_id)
    references public.fx_orders(id, game_session_id),
  constraint fx_settlement_receipts_order_unique unique (order_id),
  constraint fx_settlement_receipts_transaction_scope_fk
    foreign key (bank_transaction_id, game_session_id)
    references public.bank_transactions(id, game_session_id),
  constraint fx_settlement_receipts_fixing_scope_fk
    foreign key (fixing_id, game_session_id)
    references public.fx_fixings(id, game_session_id),
  constraint fx_settlement_receipts_amounts_check
    check (
      source_amount > 0
      and fee_amount >= 0
      and target_amount > 0
      and reserve_draw_amount >= 0
      and reserve_repayment_amount >= 0
    ),
  constraint fx_settlement_receipts_hash_format check (evidence_hash ~ '^[0-9a-f]{64}$'),
  constraint fx_settlement_receipts_scope_id_unique unique (id, game_session_id)
);

create table private.fx_order_runtime_state (
  order_id uuid primary key,
  game_session_id uuid not null,
  status text not null,
  lease_token uuid null,
  lease_owner text null,
  lease_expires_at timestamptz null,
  claimed_at timestamptz null,
  terminal_at timestamptz null,
  last_error_code text null,
  updated_at timestamptz not null default clock_timestamp(),

  constraint fx_order_runtime_order_scope_fk
    foreign key (order_id, game_session_id)
    references public.fx_orders(id, game_session_id) on delete cascade,
  constraint fx_order_runtime_status_check
    check (status in ('pending', 'claimed', 'settled', 'cancelled', 'failed')),
  constraint fx_order_runtime_lease_check
    check (
      (
        status = 'claimed'
        and lease_token is not null
        and length(btrim(lease_owner)) between 1 and 120
        and lease_expires_at is not null
        and claimed_at is not null
        and terminal_at is null
      )
      or (
        status <> 'claimed'
        and lease_token is null
        and lease_owner is null
        and lease_expires_at is null
      )
    ),
  constraint fx_order_runtime_terminal_check
    check (
      (status in ('settled', 'cancelled', 'failed') and terminal_at is not null)
      or (status in ('pending', 'claimed') and terminal_at is null)
    ),
  constraint fx_order_runtime_error_check
    check (last_error_code is null or last_error_code ~ '^[A-Z][A-Z0-9_]{2,95}$')
);

create index fx_order_runtime_due_idx
  on private.fx_order_runtime_state(status, game_session_id, order_id);

alter table public.fx_quotes enable row level security;
alter table public.fx_quotes force row level security;
alter table public.fx_orders enable row level security;
alter table public.fx_orders force row level security;
alter table public.fx_order_events enable row level security;
alter table public.fx_order_events force row level security;
alter table public.fx_settlement_receipts enable row level security;
alter table public.fx_settlement_receipts force row level security;
alter table private.fx_order_runtime_state enable row level security;
alter table private.fx_order_runtime_state force row level security;

revoke all on table public.fx_quotes from public, anon, authenticated, service_role;
revoke all on table public.fx_orders from public, anon, authenticated, service_role;
revoke all on table public.fx_order_events from public, anon, authenticated, service_role;
revoke all on table public.fx_settlement_receipts from public, anon, authenticated, service_role;
revoke all on table private.fx_order_runtime_state from public, anon, authenticated, service_role;
grant select on table public.fx_quotes to service_role;
grant select on table public.fx_orders to service_role;
grant select on table public.fx_order_events to service_role;
grant select on table public.fx_settlement_receipts to service_role;

create or replace function private.reject_player_fx_evidence_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if not exists (
    select 1 from public.game_sessions as game_row where game_row.id = old.game_session_id
  ) then
    return old;
  end if;
  raise exception 'PLAYER_FX_EVIDENCE_IMMUTABLE' using errcode = '42501';
end;
$function$;

create trigger guard_fx_quotes_immutable
before update or delete on public.fx_quotes
for each row execute function private.reject_player_fx_evidence_mutation_v1();
create trigger guard_fx_orders_immutable
before update or delete on public.fx_orders
for each row execute function private.reject_player_fx_evidence_mutation_v1();
create trigger guard_fx_order_events_immutable
before update or delete on public.fx_order_events
for each row execute function private.reject_player_fx_evidence_mutation_v1();
create trigger guard_fx_settlement_receipts_immutable
before update or delete on public.fx_settlement_receipts
for each row execute function private.reject_player_fx_evidence_mutation_v1();

revoke all on function private.reject_player_fx_evidence_mutation_v1()
  from public, anon, authenticated, service_role;

create or replace function private.ensure_player_fx_checking_account_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_currency_code text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_account_id uuid;
begin
  if p_game_session_id is null
     or p_player_id is null
     or v_currency !~ '^[A-Z]{3,16}$'
  then
    raise exception 'BANK_ACCOUNT_REQUEST_INVALID' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.currencies as currency_row
    where currency_row.code = v_currency
      and currency_row.status = 'active'
  ) then
    raise exception 'BANK_ACCOUNT_CURRENCY_INVALID' using errcode = '22023';
  end if;

  v_account_id := private.ensure_player_bank_account_v1(
    p_game_session_id,
    p_player_id,
    'checking',
    v_currency
  );

  if (
    select status from public.bank_accounts where id = v_account_id
  ) <> 'active' then
    raise exception 'BANK_ACCOUNT_CLOSED' using errcode = 'P0001';
  end if;

  perform private.ensure_bank_account_projection_v1(
    p_game_session_id,
    v_account_id
  );

  return v_account_id;
end;
$function$;

revoke all on function private.ensure_player_fx_checking_account_v1(uuid, uuid, text)
  from public, anon, authenticated, service_role;

create or replace function private.fx_quote_public_json_v1(
  p_quote_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
  select jsonb_build_object(
    'quote_key', quote_row.public_key,
    'product', quote_row.product,
    'source_account_key', source_account.public_key,
    'target_account_key', target_account.public_key,
    'source_currency_code', quote_row.source_currency_code,
    'target_currency_code', quote_row.target_currency_code,
    'source_minor_unit', quote_row.source_minor_unit,
    'target_minor_unit', quote_row.target_minor_unit,
    'source_amount_mode', quote_row.source_amount_mode,
    'source_amount', quote_row.source_amount::text,
    'reference_rate', quote_row.reference_rate::text,
    'customer_rate', quote_row.customer_rate::text,
    'spread_rate', quote_row.spread_rate::text,
    'fee_amount', quote_row.fee_amount::text,
    'target_amount', quote_row.target_amount::text,
    'fixing_key', fixing_row.public_key,
    'policy_version', policy_row.policy_version,
    'expires_at', quote_row.expires_at,
    'settles_at', quote_row.settles_at,
    'requires_fx', quote_row.requires_fx,
    'rounding_disclosure', quote_row.rounding_disclosure
  )
  from public.fx_quotes as quote_row
  join public.bank_accounts as source_account on source_account.id = quote_row.source_account_id
  join public.bank_accounts as target_account on target_account.id = quote_row.target_account_id
  join public.fx_fixings as fixing_row on fixing_row.id = quote_row.fixing_id
  join public.fx_policy_versions as policy_row on policy_row.id = quote_row.policy_version_id
  where quote_row.id = p_quote_id;
$function$;

create or replace function private.fx_order_public_json_v1(
  p_order_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'order_key', order_row.public_key,
    'quote_key', quote_row.public_key,
    'product', order_row.product,
    'status', runtime.status,
    'source_currency_code', quote_row.source_currency_code,
    'target_currency_code', quote_row.target_currency_code,
    'source_amount', order_row.source_amount::text,
    'fee_amount', order_row.fee_amount::text,
    'target_amount', order_row.target_amount::text,
    'submitted_at', order_row.submitted_at,
    'settles_at', order_row.settles_at,
    'completed_at', runtime.terminal_at,
    'receipt_key', receipt_row.public_key
  )
  from public.fx_orders as order_row
  join public.fx_quotes as quote_row on quote_row.id = order_row.quote_id
  join private.fx_order_runtime_state as runtime on runtime.order_id = order_row.id
  left join public.fx_settlement_receipts as receipt_row on receipt_row.order_id = order_row.id
  where order_row.id = p_order_id;
$function$;

revoke all on function private.fx_quote_public_json_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.fx_order_public_json_v1(uuid)
  from public, anon, authenticated, service_role;

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
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
  select
    account_row.public_key,
    account_row.account_kind,
    account_row.currency_code,
    balance_row.balance,
    coalesce(hold_totals.held_amount, 0),
    balance_row.balance - coalesce(hold_totals.held_amount, 0)
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  join public.account_balances as balance_row
    on balance_row.bank_account_id = account_row.id
   and balance_row.game_session_id = account_row.game_session_id
  left join lateral (
    select sum(hold_row.amount) as held_amount
    from public.bank_account_holds as hold_row
    where hold_row.game_session_id = account_row.game_session_id
      and hold_row.bank_account_id = account_row.id
      and hold_row.status in ('active', 'claimed')
      and (hold_row.expires_at is null or hold_row.expires_at > clock_timestamp())
  ) as hold_totals on true
  where account_row.game_session_id = p_game_session_id
    and account_row.status = 'active'
    and account_row.account_kind in ('checking', 'savings')
    and party_row.party_kind = 'player'
    and party_row.player_id = p_player_id
    and party_row.status = 'active'
  order by account_row.currency_code, account_row.account_kind, account_row.public_key;
$function$;

revoke all on function public.list_player_bank_accounts_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.list_player_bank_accounts_v1(uuid, uuid)
  to service_role;

create or replace function public.create_player_fx_quote_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_source_account_key text,
  p_target_currency_code text,
  p_source_amount numeric,
  p_product text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_source_account public.bank_accounts%rowtype;
  v_target_account_id uuid;
  v_target_currency text := upper(btrim(coalesce(p_target_currency_code, '')));
  v_product text := lower(btrim(coalesce(p_product, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_source_decimals integer;
  v_target_decimals integer;
  v_runtime private.fx_runtime_state%rowtype;
  v_fixing public.fx_fixings%rowtype;
  v_source_units numeric(38, 18);
  v_target_units numeric(38, 18);
  v_reference_rate numeric(38, 18);
  v_customer_rate numeric(38, 18);
  v_spread_rate numeric(18, 8);
  v_fee_rate numeric(18, 8);
  v_fee_amount numeric(38, 18);
  v_target_amount numeric(38, 18);
  v_requires_fx boolean;
  v_cap_snapshot_id uuid;
  v_now timestamptz := clock_timestamp();
  v_expires_at timestamptz;
  v_settles_at timestamptz;
  v_request jsonb;
  v_request_hash text;
  v_evidence_hash text;
  v_existing public.fx_quotes%rowtype;
  v_quote_id uuid;
begin
  if p_game_session_id is null
     or p_player_id is null
     or coalesce(p_source_account_key, '') !~ '^bac_[0-9a-f]{32}$'
     or v_target_currency !~ '^[A-Z]{3,16}$'
     or p_source_amount is null
     or p_source_amount <= 0
     or p_source_amount >= 1000000000000000::numeric
     or v_product not in ('standard', 'instant')
     or length(v_idempotency_key) not between 8 and 160
  then
    raise exception 'FX_QUOTE_REQUEST_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'player-fx-quote-v1:' || p_game_session_id::text || ':' ||
      p_player_id::text || ':' || v_idempotency_key,
    0
  ));

  -- Idempotency is bound only to immutable browser intent. Replay is resolved
  -- before consulting mutable account/fixing/runtime state so a retry after a
  -- fixing advance returns the exact accepted quote instead of becoming stale.
  v_request := jsonb_build_object(
    'version', 'player-fx-quote-v1',
    'gameSessionId', p_game_session_id,
    'playerId', p_player_id,
    'sourceAccountKey', p_source_account_key,
    'targetCurrencyCode', v_target_currency,
    'sourceAmount', p_source_amount::text,
    'sourceAmountMode', 'source_debit',
    'product', v_product
  );
  v_request_hash := private.fx_digest_jsonb_v1(v_request);

  select quote_row.*
  into v_existing
  from public.fx_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.player_id = p_player_id
    and quote_row.idempotency_key = v_idempotency_key;

  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception 'FX_QUOTE_CONFLICT' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'outcome', 'replayed',
      'quote', private.fx_quote_public_json_v1(v_existing.id)
    );
  end if;

  select account_row.*
  into v_source_account
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where account_row.public_key = p_source_account_key
    and account_row.game_session_id = p_game_session_id
    and account_row.account_kind = 'checking'
    and account_row.status = 'active'
    and party_row.party_kind = 'player'
    and party_row.player_id = p_player_id
    and party_row.status = 'active';

  if not found then
    raise exception 'BANK_ACCOUNT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select currency_row.decimal_places
  into v_source_decimals
  from public.currencies as currency_row
  where currency_row.code = v_source_account.currency_code
    and currency_row.status = 'active';

  select currency_row.decimal_places
  into v_target_decimals
  from public.currencies as currency_row
  where currency_row.code = v_target_currency
    and currency_row.status = 'active';

  if v_source_decimals is null or v_target_decimals is null then
    raise exception 'FX_RATE_CURRENCY_INVALID' using errcode = '22023';
  end if;

  if p_source_amount <> round(p_source_amount, v_source_decimals) then
    raise exception 'FX_QUOTE_SOURCE_PRECISION_INVALID' using errcode = '22023';
  end if;

  select runtime.*
  into v_runtime
  from private.fx_runtime_state as runtime
  where runtime.game_session_id = p_game_session_id
    and runtime.cutover_status = 'ready'
  for share;

  if not found or v_runtime.current_fixing_id is null then
    raise exception 'FX_FIXING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_runtime.next_due_at is null or v_runtime.next_due_at <= v_now then
    raise exception 'FX_RATE_VERSION_STALE' using errcode = 'P0001';
  end if;

  select fixing_row.*
  into strict v_fixing
  from public.fx_fixings as fixing_row
  where fixing_row.id = v_runtime.current_fixing_id
    and fixing_row.game_session_id = p_game_session_id;

  select value_row.units_per_eco
  into v_source_units
  from public.fx_fixing_currency_values as value_row
  where value_row.fixing_id = v_fixing.id
    and value_row.game_session_id = p_game_session_id
    and value_row.currency_code = v_source_account.currency_code;

  select value_row.units_per_eco
  into v_target_units
  from public.fx_fixing_currency_values as value_row
  where value_row.fixing_id = v_fixing.id
    and value_row.game_session_id = p_game_session_id
    and value_row.currency_code = v_target_currency;

  if v_source_units is null or v_target_units is null then
    raise exception 'FX_FIXING_VALUE_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_requires_fx := v_source_account.currency_code <> v_target_currency;
  if v_requires_fx then
    v_target_account_id := private.ensure_player_fx_checking_account_v1(
      p_game_session_id,
      p_player_id,
      v_target_currency
    );
    v_reference_rate := (v_target_units / v_source_units)::numeric(38, 18);
    v_customer_rate := (v_reference_rate * 0.995)::numeric(38, 18);
    v_spread_rate := 0.005;
    v_fee_rate := case when v_product = 'instant' then 0.02 else 0 end;
    v_fee_amount := round(p_source_amount * v_fee_rate, v_source_decimals);
    -- Reference/customer rates are bounded display evidence. Monetary output
    -- uses the exact fixing values and one final target-minor-unit rounding.
    v_target_amount := round(
      p_source_amount * v_target_units / v_source_units * 0.995,
      v_target_decimals
    );

    select cap_row.id
    into v_cap_snapshot_id
    from public.fx_liquidity_cap_snapshots as cap_row
    where cap_row.fixing_id = v_fixing.id
      and cap_row.game_session_id = p_game_session_id
      and cap_row.currency_code = v_target_currency;

    if not found then
      raise exception 'FX_LIQUIDITY_UNAVAILABLE' using errcode = 'P0001';
    end if;
  else
    v_target_account_id := v_source_account.id;
    v_reference_rate := 1;
    v_customer_rate := 1;
    v_spread_rate := 0;
    v_fee_rate := 0;
    v_fee_amount := 0;
    v_target_amount := p_source_amount;
    v_cap_snapshot_id := null;
  end if;

  if v_target_amount <= 0 then
    raise exception 'FX_QUOTE_TARGET_ROUNDS_TO_ZERO' using errcode = '22023';
  end if;

  v_expires_at := least(v_now + interval '120 seconds', v_runtime.next_due_at);
  if v_expires_at <= v_now then
    raise exception 'FX_RATE_VERSION_STALE' using errcode = 'P0001';
  end if;

  v_settles_at := case
    when v_product = 'standard' then v_runtime.next_due_at
    else v_now
  end;
  v_evidence_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'player-fx-quote-evidence-v1',
    'requestHash', v_request_hash,
    'fixingPublicKey', v_fixing.public_key,
    'policyVersionId', v_fixing.policy_version_id,
    'sourceCurrencyCode', v_source_account.currency_code,
    'targetCurrencyCode', v_target_currency,
    'sourceMinorUnit', v_source_decimals,
    'targetMinorUnit', v_target_decimals,
    'sourceAmountMode', 'source_debit',
    'sourceUnitsPerEco', v_source_units::text,
    'targetUnitsPerEco', v_target_units::text,
    'sourceAmount', p_source_amount::text,
    'referenceRate', v_reference_rate::text,
    'customerRate', v_customer_rate::text,
    'spreadRate', v_spread_rate::text,
    'feeRate', v_fee_rate::text,
    'feeAmount', v_fee_amount::text,
    'targetAmount', v_target_amount::text,
    'expiresAt', v_expires_at,
    'settlesAt', v_settles_at
  ));

  insert into public.fx_quotes(
    game_session_id,
    player_id,
    product,
    source_account_id,
    target_account_id,
    source_currency_code,
    target_currency_code,
    source_minor_unit,
    target_minor_unit,
    source_amount_mode,
    source_amount,
    reference_rate,
    customer_rate,
    spread_rate,
    fee_rate,
    fee_amount,
    target_amount,
    fixing_id,
    policy_version_id,
    target_cap_snapshot_id,
    requires_fx,
    rounding_disclosure,
    expires_at,
    settles_at,
    idempotency_key,
    request_hash,
    evidence_hash,
    created_at
  )
  values (
    p_game_session_id,
    p_player_id,
    v_product,
    v_source_account.id,
    v_target_account_id,
    v_source_account.currency_code,
    v_target_currency,
    v_source_decimals,
    v_target_decimals,
    'source_debit',
    p_source_amount,
    v_reference_rate,
    v_customer_rate,
    v_spread_rate,
    v_fee_rate,
    v_fee_amount,
    v_target_amount,
    v_fixing.id,
    v_fixing.policy_version_id,
    v_cap_snapshot_id,
    v_requires_fx,
    'Exact numeric reference and customer rates; one final target-currency minor-unit rounding.',
    v_expires_at,
    v_settles_at,
    v_idempotency_key,
    v_request_hash,
    v_evidence_hash,
    v_now
  )
  returning id into v_quote_id;

  return jsonb_build_object(
    'outcome', 'applied',
    'quote', private.fx_quote_public_json_v1(v_quote_id)
  );
end;
$function$;

revoke all on function public.create_player_fx_quote_v1(
  uuid, uuid, text, text, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.create_player_fx_quote_v1(
  uuid, uuid, text, text, numeric, text, text
) to service_role;

commit;
