-- Atomic shared multi-currency purchase-funding composer V1.
--
-- The composer is private and is intended to run inside a trusted owning-domain
-- settlement transaction. It consumes one immutable funding quote, debits one
-- to three Player Checking accounts, uses real B2 clearing/reserve liquidity
-- for foreign legs, and credits one exact target-currency recipient once.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table public.purchase_funding_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'pfr_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null,
  quote_id uuid not null,
  bank_transaction_id uuid not null,
  target_account_id uuid not null,
  funding_context_kind text not null,
  funding_context_key text not null,
  funding_context_hash text not null,
  target_currency_code text not null references public.currencies(code),
  target_amount numeric(38, 18) not null,
  target_reserve_draw_amount numeric(38, 18) not null default 0,
  source_domain text not null,
  source_action text not null,
  source_id uuid null,
  idempotency_key text not null,
  request_hash text not null,
  evidence_hash text not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint purchase_funding_receipts_public_key_format
    check (public_key ~ '^pfr_[0-9a-f]{32}$'),
  constraint purchase_funding_receipts_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id),
  constraint purchase_funding_receipts_quote_scope_fk
    foreign key (quote_id, game_session_id)
    references public.purchase_funding_quotes(id, game_session_id),
  constraint purchase_funding_receipts_quote_unique unique (quote_id),
  constraint purchase_funding_receipts_transaction_scope_fk
    foreign key (bank_transaction_id, game_session_id)
    references public.bank_transactions(id, game_session_id),
  constraint purchase_funding_receipts_target_account_scope_fk
    foreign key (target_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id),
  constraint purchase_funding_receipts_context_kind_check
    check (funding_context_kind ~ '^[a-z][a-z0-9._:-]{0,95}$'),
  constraint purchase_funding_receipts_context_key_check
    check (length(btrim(funding_context_key)) between 3 and 240),
  constraint purchase_funding_receipts_context_hash_format
    check (funding_context_hash ~ '^[0-9a-f]{64}$'),
  constraint purchase_funding_receipts_amount_check
    check (
      target_amount > 0
      and target_amount < 1000000000000000::numeric
      and target_reserve_draw_amount >= 0
    ),
  constraint purchase_funding_receipts_source_check
    check (
      source_domain ~ '^[a-z][a-z0-9._:-]{0,119}$'
      and source_action ~ '^[a-z][a-z0-9._:-]{0,159}$'
    ),
  constraint purchase_funding_receipts_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 200),
  constraint purchase_funding_receipts_request_hash_format
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint purchase_funding_receipts_evidence_hash_format
    check (evidence_hash ~ '^[0-9a-f]{64}$'),
  constraint purchase_funding_receipts_source_idempotency_unique
    unique (game_session_id, source_domain, source_action, idempotency_key),
  constraint purchase_funding_receipts_scope_id_unique
    unique (id, game_session_id)
);

create index purchase_funding_receipts_player_created_idx
  on public.purchase_funding_receipts(
    game_session_id, player_id, created_at desc, public_key desc
  );

alter table public.purchase_funding_receipts enable row level security;
alter table public.purchase_funding_receipts force row level security;
revoke all on table public.purchase_funding_receipts
  from public, anon, authenticated, service_role;
grant select on table public.purchase_funding_receipts to service_role;

comment on table public.purchase_funding_receipts is
  'Immutable evidence that one exact purchase-funding quote settled through one balanced Banking transaction to one target account.';

create trigger guard_purchase_funding_receipts_immutable
before update or delete on public.purchase_funding_receipts
for each row execute function private.reject_purchase_funding_quote_mutation_v1();

create or replace function private.purchase_funding_receipt_public_json_v1(
  p_receipt_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'receipt_key', receipt_row.public_key,
    'quote_key', quote_row.public_key,
    'bank_transaction_key', transaction_row.public_key,
    'target_account_key', target_account.public_key,
    'funding_context_kind', receipt_row.funding_context_kind,
    'funding_context_key', receipt_row.funding_context_key,
    'target_currency_code', receipt_row.target_currency_code,
    'target_amount', receipt_row.target_amount::text,
    'target_reserve_draw_amount', receipt_row.target_reserve_draw_amount::text,
    'source_domain', receipt_row.source_domain,
    'source_action', receipt_row.source_action,
    'created_at', receipt_row.created_at,
    'lines', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'line_number', line_row.line_number,
          'source_account_key', source_account.public_key,
          'source_currency_code', line_row.source_currency_code,
          'target_contribution', line_row.target_contribution::text,
          'source_debit', line_row.source_debit::text,
          'reference_rate', line_row.reference_rate::text,
          'customer_rate', line_row.customer_rate::text,
          'effective_rate', line_row.effective_rate::text,
          'spread_rate', line_row.spread_rate::text,
          'requires_fx', line_row.requires_fx
        )
        order by line_row.line_number
      )
      from public.purchase_funding_quote_lines as line_row
      join public.bank_accounts as source_account
        on source_account.id = line_row.source_account_id
       and source_account.game_session_id = line_row.game_session_id
      where line_row.quote_id = quote_row.id
        and line_row.game_session_id = quote_row.game_session_id
    ), '[]'::jsonb)
  )
  from public.purchase_funding_receipts as receipt_row
  join public.purchase_funding_quotes as quote_row
    on quote_row.id = receipt_row.quote_id
   and quote_row.game_session_id = receipt_row.game_session_id
  join public.bank_transactions as transaction_row
    on transaction_row.id = receipt_row.bank_transaction_id
   and transaction_row.game_session_id = receipt_row.game_session_id
  join public.bank_accounts as target_account
    on target_account.id = receipt_row.target_account_id
   and target_account.game_session_id = receipt_row.game_session_id
  where receipt_row.id = p_receipt_id;
$function$;

revoke all on function private.purchase_funding_receipt_public_json_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.compose_purchase_funding_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_quote_key text,
  p_funding_context_kind text,
  p_funding_context_key text,
  p_funding_context_hash text,
  p_target_account_id uuid,
  p_source_domain text,
  p_source_action text,
  p_source_id uuid,
  p_idempotency_key text,
  p_created_by_type text,
  p_created_by_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_context_kind text := lower(btrim(coalesce(p_funding_context_kind, '')));
  v_context_key text := btrim(coalesce(p_funding_context_key, ''));
  v_context_hash text := lower(btrim(coalesce(p_funding_context_hash, '')));
  v_source_domain text := lower(btrim(coalesce(p_source_domain, '')));
  v_source_action text := lower(btrim(coalesce(p_source_action, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_actor_type text := lower(btrim(coalesce(p_created_by_type, '')));
  v_quote public.purchase_funding_quotes%rowtype;
  v_existing public.purchase_funding_receipts%rowtype;
  v_target_account public.bank_accounts%rowtype;
  v_target_party public.economic_parties%rowtype;
  v_runtime private.fx_runtime_state%rowtype;
  v_current_cap public.fx_liquidity_cap_snapshots%rowtype;
  v_target_clearing_id uuid;
  v_target_reserve_id uuid;
  v_target_clearing_balance numeric(38, 18);
  v_target_clearing_holds numeric(38, 18);
  v_target_available numeric(38, 18);
  v_target_draw numeric(38, 18) := 0;
  v_fx_target_total numeric(38, 18) := 0;
  v_request jsonb;
  v_request_hash text;
  v_manifest jsonb;
  v_transaction_hash text;
  v_lines jsonb := '[]'::jsonb;
  v_line record;
  v_source_account public.bank_accounts%rowtype;
  v_source_balance numeric(38, 18);
  v_source_holds numeric(38, 18);
  v_currency record;
  v_source_clearing_id uuid;
  v_source_reserve_id uuid;
  v_source_cap public.fx_liquidity_cap_snapshots%rowtype;
  v_source_clearing_balance numeric(38, 18);
  v_source_reserve_balance numeric(38, 18);
  v_source_clearing_holds numeric(38, 18);
  v_source_inflow numeric(38, 18);
  v_repayment_available numeric(38, 18);
  v_source_repayment numeric(38, 18);
  v_post record;
  v_receipt_id uuid := extensions.gen_random_uuid();
  v_receipt_public_key text;
  v_evidence_hash text;
  v_event_hash text;
begin
  if p_game_session_id is null
     or p_player_id is null
     or coalesce(p_quote_key, '') !~ '^pfq_[0-9a-f]{32}$'
     or v_context_kind !~ '^[a-z][a-z0-9._:-]{0,95}$'
     or length(v_context_key) not between 3 and 240
     or v_context_hash !~ '^[0-9a-f]{64}$'
     or p_target_account_id is null
     or v_source_domain !~ '^[a-z][a-z0-9._:-]{0,119}$'
     or v_source_action !~ '^[a-z][a-z0-9._:-]{0,159}$'
     or length(v_idempotency_key) not between 8 and 200
     or v_actor_type not in ('staff_user', 'player', 'system')
     or p_now is null
  then
    raise exception 'PURCHASE_FUNDING_SETTLEMENT_REQUEST_INVALID'
      using errcode = '22023';
  end if;

  v_request := jsonb_build_object(
    'version', 'purchase-funding-settlement-v1',
    'gameSessionId', p_game_session_id,
    'playerId', p_player_id,
    'quoteKey', p_quote_key,
    'fundingContextKind', v_context_kind,
    'fundingContextKey', v_context_key,
    'fundingContextHash', v_context_hash,
    'targetAccountId', p_target_account_id,
    'sourceDomain', v_source_domain,
    'sourceAction', v_source_action,
    'sourceId', p_source_id,
    'createdByType', v_actor_type,
    'createdById', p_created_by_id
  );
  v_request_hash := private.fx_digest_jsonb_v1(v_request);

  -- Resolve owning-domain idempotency before current balances, account status,
  -- fixing state, or quote expiry are reinterpreted.
  select receipt_row.*
  into v_existing
  from public.purchase_funding_receipts as receipt_row
  where receipt_row.game_session_id = p_game_session_id
    and receipt_row.source_domain = v_source_domain
    and receipt_row.source_action = v_source_action
    and receipt_row.idempotency_key = v_idempotency_key;
  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception 'PURCHASE_FUNDING_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'outcome', 'replayed',
      'receipt', private.purchase_funding_receipt_public_json_v1(v_existing.id)
    );
  end if;

  select quote_row.*
  into v_quote
  from public.purchase_funding_quotes as quote_row
  where quote_row.public_key = p_quote_key
    and quote_row.game_session_id = p_game_session_id
    and quote_row.player_id = p_player_id
  for update;
  if not found then
    raise exception 'PURCHASE_FUNDING_QUOTE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select receipt_row.*
  into v_existing
  from public.purchase_funding_receipts as receipt_row
  where receipt_row.quote_id = v_quote.id
    and receipt_row.game_session_id = p_game_session_id;
  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception 'PURCHASE_FUNDING_QUOTE_CONSUMED' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'outcome', 'replayed',
      'receipt', private.purchase_funding_receipt_public_json_v1(v_existing.id)
    );
  end if;

  if v_quote.funding_context_kind <> v_context_kind
     or v_quote.funding_context_key <> v_context_key
     or v_quote.funding_context_hash <> v_context_hash
  then
    raise exception 'PURCHASE_FUNDING_CONTEXT_CONFLICT' using errcode = 'P0001';
  end if;
  if v_quote.expires_at <= p_now then
    raise exception 'PURCHASE_FUNDING_QUOTE_EXPIRED' using errcode = 'P0001';
  end if;

  select runtime.*
  into v_runtime
  from private.fx_runtime_state as runtime
  where runtime.game_session_id = p_game_session_id
    and runtime.cutover_status = 'ready'
  for share;
  if not found
     or v_runtime.current_fixing_id is distinct from v_quote.fixing_id
     or v_runtime.policy_version_id is distinct from v_quote.policy_version_id
     or v_runtime.next_due_at is null
     or v_runtime.next_due_at <= p_now
  then
    raise exception 'FX_RATE_VERSION_STALE' using errcode = 'P0001';
  end if;

  select account_row.*, party_row.*
  into v_target_account, v_target_party
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where account_row.id = p_target_account_id
    and account_row.game_session_id = p_game_session_id
    and account_row.account_kind = 'checking'
    and account_row.status = 'active'
    and account_row.currency_code = v_quote.target_currency_code
    and party_row.status = 'active';
  if not found then
    raise exception 'PURCHASE_FUNDING_TARGET_ACCOUNT_INVALID' using errcode = 'P0001';
  end if;
  if v_target_party.party_kind = 'player'
     and v_target_party.player_id = p_player_id
  then
    raise exception 'PURCHASE_FUNDING_SELF_TARGET_FORBIDDEN' using errcode = 'P0001';
  end if;

  if (
    select count(*)
    from public.purchase_funding_quote_lines as line_row
    where line_row.quote_id = v_quote.id
      and line_row.game_session_id = p_game_session_id
  ) not between 1 and 3
  then
    raise exception 'PURCHASE_FUNDING_QUOTE_LINES_INVALID' using errcode = 'P0001';
  end if;
  if (
    select sum(line_row.target_contribution)
    from public.purchase_funding_quote_lines as line_row
    where line_row.quote_id = v_quote.id
      and line_row.game_session_id = p_game_session_id
  ) is distinct from v_quote.target_amount then
    raise exception 'PURCHASE_FUNDING_TOTAL_MISMATCH' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.purchase_funding_quote_lines as line_row
    where line_row.quote_id = v_quote.id
      and line_row.game_session_id = p_game_session_id
      and line_row.source_account_id = p_target_account_id
  ) then
    raise exception 'PURCHASE_FUNDING_SELF_TARGET_FORBIDDEN' using errcode = 'P0001';
  end if;

  select coalesce(sum(line_row.target_contribution), 0)
  into v_fx_target_total
  from public.purchase_funding_quote_lines as line_row
  where line_row.quote_id = v_quote.id
    and line_row.game_session_id = p_game_session_id
    and line_row.requires_fx;

  if (v_fx_target_total > 0) is distinct from v_quote.requires_fx then
    raise exception 'PURCHASE_FUNDING_QUOTE_LINES_INVALID' using errcode = 'P0001';
  end if;

  if v_quote.requires_fx then
    v_current_cap := private.player_fx_current_cap_v1(
      p_game_session_id,
      v_quote.target_currency_code
    );
    if v_current_cap.id is distinct from v_quote.target_cap_snapshot_id
       or v_current_cap.fixing_id is distinct from v_quote.fixing_id
    then
      raise exception 'FX_RATE_VERSION_STALE' using errcode = 'P0001';
    end if;

    v_target_clearing_id := private.player_fx_system_account_v1(
      p_game_session_id,
      'fx.clearing-house',
      'fx_clearing',
      v_quote.target_currency_code
    );
    v_target_reserve_id := private.player_fx_system_account_v1(
      p_game_session_id,
      'fx.central-reserve',
      'fx_reserve',
      v_quote.target_currency_code
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'banking-monetary-v1:' || p_game_session_id::text,
    0
  ));

  -- Lock every source, recipient, and participating clearing/reserve projection
  -- in canonical bank-account UUID order before any balance interpretation.
  perform balance_row.id
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.bank_account_id in (
      select line_row.source_account_id
      from public.purchase_funding_quote_lines as line_row
      where line_row.quote_id = v_quote.id
        and line_row.game_session_id = p_game_session_id
      union
      select p_target_account_id
      union
      select account_row.id
      from public.bank_accounts as account_row
      join public.economic_parties as party_row
        on party_row.id = account_row.party_id
       and party_row.game_session_id = account_row.game_session_id
      where account_row.game_session_id = p_game_session_id
        and account_row.status = 'active'
        and party_row.party_kind = 'system'
        and party_row.system_key in ('fx.clearing-house', 'fx.central-reserve')
        and account_row.currency_code in (
          select line_row.source_currency_code
          from public.purchase_funding_quote_lines as line_row
          where line_row.quote_id = v_quote.id
            and line_row.game_session_id = p_game_session_id
            and line_row.requires_fx
          union
          select v_quote.target_currency_code where v_quote.requires_fx
        )
    )
  order by balance_row.bank_account_id
  for update;

  -- Revalidate source ownership, account state, quote identity, and current
  -- available balance while constructing source-side journal lines.
  for v_line in
    select line_row.*
    from public.purchase_funding_quote_lines as line_row
    where line_row.quote_id = v_quote.id
      and line_row.game_session_id = p_game_session_id
    order by line_row.line_number
  loop
    select account_row.*
    into v_source_account
    from public.bank_accounts as account_row
    join public.economic_parties as party_row
      on party_row.id = account_row.party_id
     and party_row.game_session_id = account_row.game_session_id
    where account_row.id = v_line.source_account_id
      and account_row.game_session_id = p_game_session_id
      and account_row.account_kind = 'checking'
      and account_row.status = 'active'
      and account_row.currency_code = v_line.source_currency_code
      and party_row.party_kind = 'player'
      and party_row.player_id = p_player_id
      and party_row.status = 'active';
    if not found then
      raise exception 'BANK_ACCOUNT_NOT_FOUND' using errcode = 'P0001';
    end if;

    select balance_row.balance
    into strict v_source_balance
    from public.account_balances as balance_row
    where balance_row.game_session_id = p_game_session_id
      and balance_row.bank_account_id = v_source_account.id;
    v_source_holds := private.active_bank_account_hold_amount_v1(
      p_game_session_id,
      v_source_account.id,
      '{}'::uuid[]
    );
    if v_source_balance - v_source_holds < v_line.source_debit then
      raise exception 'FUNDING_INSUFFICIENT' using errcode = 'P0001';
    end if;

    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'bankAccountId', v_source_account.id,
        'amount', (-v_line.source_debit)::text,
        'entryType', 'debit',
        'metadata', jsonb_build_object(
          'lineRole', 'purchase_funding_source_debit',
          'fundingLineNumber', v_line.line_number,
          'fundingQuoteKey', v_quote.public_key
        )
      )
    );

    if v_line.requires_fx then
      v_source_clearing_id := private.player_fx_system_account_v1(
        p_game_session_id,
        'fx.clearing-house',
        'fx_clearing',
        v_line.source_currency_code
      );
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object(
          'bankAccountId', v_source_clearing_id,
          'amount', v_line.source_debit::text,
          'entryType', 'credit',
          'metadata', jsonb_build_object(
            'lineRole', 'purchase_funding_source_clearing_inflow',
            'fundingLineNumber', v_line.line_number,
            'fundingQuoteKey', v_quote.public_key
          )
        )
      );
    end if;
  end loop;

  if v_quote.requires_fx then
    select balance_row.balance
    into strict v_target_clearing_balance
    from public.account_balances as balance_row
    where balance_row.game_session_id = p_game_session_id
      and balance_row.bank_account_id = v_target_clearing_id;
    v_target_clearing_holds := private.active_bank_account_hold_amount_v1(
      p_game_session_id,
      v_target_clearing_id,
      '{}'::uuid[]
    );
    v_target_available := greatest(
      v_target_clearing_balance - v_target_clearing_holds,
      0
    );
    v_target_draw := greatest(v_fx_target_total - v_target_available, 0);

    if v_target_draw > 0 and private.fx_liquidity_headroom_v1(
      p_game_session_id,
      v_current_cap.id,
      v_target_reserve_id,
      '{}'::uuid[]
    ) < v_target_draw then
      raise exception 'FX_LIQUIDITY_UNAVAILABLE' using errcode = 'P0001';
    end if;

    if v_target_draw > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object(
          'bankAccountId', v_target_reserve_id,
          'amount', (-v_target_draw)::text,
          'entryType', 'debit',
          'metadata', jsonb_build_object(
            'lineRole', 'purchase_funding_target_reserve_draw',
            'fundingQuoteKey', v_quote.public_key
          )
        ),
        jsonb_build_object(
          'bankAccountId', v_target_clearing_id,
          'amount', v_target_draw::text,
          'entryType', 'credit',
          'metadata', jsonb_build_object(
            'lineRole', 'purchase_funding_target_facility_inflow',
            'fundingQuoteKey', v_quote.public_key
          )
        )
      );
    end if;

    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'bankAccountId', v_target_clearing_id,
        'amount', (-v_fx_target_total)::text,
        'entryType', 'debit',
        'metadata', jsonb_build_object(
          'lineRole', 'purchase_funding_target_clearing_delivery',
          'fundingQuoteKey', v_quote.public_key
        )
      )
    );
  end if;

  -- One target credit covers both same-currency contributions and all retail-FX
  -- target delivery. The quote requires those contributions to equal the bill.
  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object(
      'bankAccountId', p_target_account_id,
      'amount', v_quote.target_amount::text,
      'entryType', 'credit',
      'metadata', jsonb_build_object(
        'lineRole', 'purchase_funding_recipient_credit',
        'fundingQuoteKey', v_quote.public_key,
        'fundingContextKind', v_context_kind,
        'fundingContextKey', v_context_key
      )
    )
  );

  -- B2 requires eligible source-currency clearing excess to repay outstanding
  -- reserve utilization. Aggregate each foreign source currency before deriving
  -- one repayment pair for that currency.
  for v_currency in
    select
      line_row.source_currency_code as currency_code,
      sum(line_row.source_debit)::numeric(38, 18) as source_inflow
    from public.purchase_funding_quote_lines as line_row
    where line_row.quote_id = v_quote.id
      and line_row.game_session_id = p_game_session_id
      and line_row.requires_fx
    group by line_row.source_currency_code
    order by line_row.source_currency_code
  loop
    v_source_inflow := v_currency.source_inflow;
    v_source_clearing_id := private.player_fx_system_account_v1(
      p_game_session_id,
      'fx.clearing-house',
      'fx_clearing',
      v_currency.currency_code
    );
    v_source_reserve_id := private.player_fx_system_account_v1(
      p_game_session_id,
      'fx.central-reserve',
      'fx_reserve',
      v_currency.currency_code
    );
    v_source_cap := private.player_fx_current_cap_v1(
      p_game_session_id,
      v_currency.currency_code
    );
    if v_source_cap.fixing_id is distinct from v_quote.fixing_id then
      raise exception 'FX_RATE_VERSION_STALE' using errcode = 'P0001';
    end if;

    select balance_row.balance
    into strict v_source_clearing_balance
    from public.account_balances as balance_row
    where balance_row.game_session_id = p_game_session_id
      and balance_row.bank_account_id = v_source_clearing_id;
    select balance_row.balance
    into strict v_source_reserve_balance
    from public.account_balances as balance_row
    where balance_row.game_session_id = p_game_session_id
      and balance_row.bank_account_id = v_source_reserve_id;
    v_source_clearing_holds := private.active_bank_account_hold_amount_v1(
      p_game_session_id,
      v_source_clearing_id,
      '{}'::uuid[]
    );
    v_repayment_available := greatest(
      v_source_clearing_balance
        + v_source_inflow
        - v_source_clearing_holds
        - v_source_cap.operating_buffer_target,
      0
    );
    v_source_repayment := least(
      greatest(-v_source_reserve_balance, 0),
      v_repayment_available
    );

    if v_source_repayment > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object(
          'bankAccountId', v_source_clearing_id,
          'amount', (-v_source_repayment)::text,
          'entryType', 'debit',
          'metadata', jsonb_build_object(
            'lineRole', 'purchase_funding_source_reserve_repayment',
            'currencyCode', v_currency.currency_code,
            'fundingQuoteKey', v_quote.public_key
          )
        ),
        jsonb_build_object(
          'bankAccountId', v_source_reserve_id,
          'amount', v_source_repayment::text,
          'entryType', 'credit',
          'metadata', jsonb_build_object(
            'lineRole', 'purchase_funding_reserve_repayment',
            'currencyCode', v_currency.currency_code,
            'fundingQuoteKey', v_quote.public_key
          )
        )
      );
    end if;
  end loop;

  v_receipt_public_key := 'pfr_' || substr(private.bank_digest_text_v1(concat_ws(
    '|',
    'purchase-funding-receipt-v1',
    p_game_session_id::text,
    v_source_domain,
    v_source_action,
    v_idempotency_key
  )), 1, 32);

  v_manifest := jsonb_build_object(
    'version', 'purchase-funding-settlement-evidence-v1',
    'requestHash', v_request_hash,
    'receiptPublicKey', v_receipt_public_key,
    'fundingQuotePublicKey', v_quote.public_key,
    'fundingContextKind', v_context_kind,
    'fundingContextKey', v_context_key,
    'targetAccountId', p_target_account_id,
    'targetCurrencyCode', v_quote.target_currency_code,
    'targetAmount', v_quote.target_amount::text,
    'fxTargetAmount', v_fx_target_total::text,
    'targetReserveDrawAmount', v_target_draw::text,
    'fixingPublicKey', (
      select fixing_row.public_key
      from public.fx_fixings as fixing_row
      where fixing_row.id = v_quote.fixing_id
        and fixing_row.game_session_id = p_game_session_id
    ),
    'lineCount', jsonb_array_length(v_lines)
  );
  v_transaction_hash := private.fx_digest_jsonb_v1(v_manifest);

  select *
  into strict v_post
  from private.post_bank_transaction_v1(
    p_game_session_id,
    case when v_quote.requires_fx then 'fx_conversion' else 'purchase_funding' end,
    v_source_domain,
    v_source_action,
    p_source_id,
    'funding:' || v_idempotency_key,
    v_transaction_hash,
    v_lines,
    v_actor_type,
    p_created_by_id,
    jsonb_build_object(
      'purchaseFundingAuthority', 'multicurrency_funding_v1',
      'fundingQuotePublicKey', v_quote.public_key,
      'fundingContextKind', v_context_kind,
      'fundingContextKey', v_context_key,
      'reserveAuthority', case
        when v_quote.requires_fx then 'fx_liquidity_v1'
        else null
      end,
      'liquidityCapSnapshotId', case
        when v_quote.requires_fx then v_quote.target_cap_snapshot_id
        else null
      end
    ),
    '{}'::uuid[]
  );

  if v_target_draw > 0 then
    v_event_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
      'version', 'purchase-funding-reserve-draw-v1',
      'fundingQuotePublicKey', v_quote.public_key,
      'bankTransactionPublicKey', v_post.bank_transaction_public_key,
      'currencyCode', v_quote.target_currency_code,
      'amount', v_target_draw::text
    ));
    insert into public.fx_liquidity_events(
      game_session_id,
      cap_snapshot_id,
      bank_transaction_id,
      currency_code,
      event_kind,
      amount,
      idempotency_key,
      request_hash,
      metadata,
      created_at
    ) values (
      p_game_session_id,
      v_quote.target_cap_snapshot_id,
      v_post.bank_transaction_id,
      v_quote.target_currency_code,
      'reserve_draw',
      v_target_draw,
      'funding-draw:' || v_receipt_public_key,
      v_event_hash,
      jsonb_build_object(
        'fundingQuotePublicKey', v_quote.public_key,
        'fundingReceiptPublicKey', v_receipt_public_key
      ),
      p_now
    );
  end if;

  -- Persist one immutable repayment event per foreign source currency when the
  -- just-posted source inflow actually repaid reserve utilization.
  for v_currency in
    select
      line_row.source_currency_code as currency_code,
      sum(line_row.source_debit)::numeric(38, 18) as source_inflow
    from public.purchase_funding_quote_lines as line_row
    where line_row.quote_id = v_quote.id
      and line_row.game_session_id = p_game_session_id
      and line_row.requires_fx
    group by line_row.source_currency_code
    order by line_row.source_currency_code
  loop
    v_source_clearing_id := private.player_fx_system_account_v1(
      p_game_session_id,
      'fx.clearing-house',
      'fx_clearing',
      v_currency.currency_code
    );
    v_source_reserve_id := private.player_fx_system_account_v1(
      p_game_session_id,
      'fx.central-reserve',
      'fx_reserve',
      v_currency.currency_code
    );
    v_source_cap := private.player_fx_current_cap_v1(
      p_game_session_id,
      v_currency.currency_code
    );

    select coalesce(sum(ledger_row.amount), 0)
    into v_source_repayment
    from public.ledger_entries as ledger_row
    where ledger_row.bank_transaction_id = v_post.bank_transaction_id
      and ledger_row.game_session_id = p_game_session_id
      and ledger_row.bank_account_id = v_source_reserve_id
      and ledger_row.amount > 0
      and ledger_row.line_metadata ->> 'lineRole' = 'purchase_funding_reserve_repayment';

    if v_source_repayment > 0 then
      v_event_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
        'version', 'purchase-funding-reserve-repayment-v1',
        'fundingQuotePublicKey', v_quote.public_key,
        'bankTransactionPublicKey', v_post.bank_transaction_public_key,
        'currencyCode', v_currency.currency_code,
        'amount', v_source_repayment::text
      ));
      insert into public.fx_liquidity_events(
        game_session_id,
        cap_snapshot_id,
        bank_transaction_id,
        currency_code,
        event_kind,
        amount,
        idempotency_key,
        request_hash,
        metadata,
        created_at
      ) values (
        p_game_session_id,
        v_source_cap.id,
        v_post.bank_transaction_id,
        v_currency.currency_code,
        'reserve_repayment',
        v_source_repayment,
        'funding-repayment:' || v_receipt_public_key || ':' || v_currency.currency_code,
        v_event_hash,
        jsonb_build_object(
          'fundingQuotePublicKey', v_quote.public_key,
          'fundingReceiptPublicKey', v_receipt_public_key
        ),
        p_now
      );
    end if;
  end loop;

  v_evidence_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'purchase-funding-receipt-evidence-v1',
    'requestHash', v_request_hash,
    'transactionHash', v_transaction_hash,
    'fundingQuotePublicKey', v_quote.public_key,
    'fundingReceiptPublicKey', v_receipt_public_key,
    'bankTransactionPublicKey', v_post.bank_transaction_public_key,
    'targetCurrencyCode', v_quote.target_currency_code,
    'targetAmount', v_quote.target_amount::text,
    'targetReserveDrawAmount', v_target_draw::text
  ));

  insert into public.purchase_funding_receipts(
    id,
    public_key,
    game_session_id,
    player_id,
    quote_id,
    bank_transaction_id,
    target_account_id,
    funding_context_kind,
    funding_context_key,
    funding_context_hash,
    target_currency_code,
    target_amount,
    target_reserve_draw_amount,
    source_domain,
    source_action,
    source_id,
    idempotency_key,
    request_hash,
    evidence_hash,
    created_at
  ) values (
    v_receipt_id,
    v_receipt_public_key,
    p_game_session_id,
    p_player_id,
    v_quote.id,
    v_post.bank_transaction_id,
    p_target_account_id,
    v_context_kind,
    v_context_key,
    v_context_hash,
    v_quote.target_currency_code,
    v_quote.target_amount,
    v_target_draw,
    v_source_domain,
    v_source_action,
    p_source_id,
    v_idempotency_key,
    v_request_hash,
    v_evidence_hash,
    p_now
  );

  return jsonb_build_object(
    'outcome', 'applied',
    'receipt', private.purchase_funding_receipt_public_json_v1(v_receipt_id)
  );
end;
$function$;

revoke all on function private.compose_purchase_funding_v1(
  uuid, uuid, text, text, text, text, uuid,
  text, text, uuid, text, text, uuid, timestamptz
) from public, anon, authenticated, service_role;

commit;
