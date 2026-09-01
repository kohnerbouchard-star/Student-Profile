-- Business V2 Phase 11: permanently retire simulated Business cycle sales.
-- Historical rows remain immutable compatibility evidence.  New physical-good
-- sales, inventory consumption, revenue, and COGS are authored only by Store.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.settle_business_cycle_v1(
  p_game_session_id uuid,
  p_business_key text,
  p_settlement_key text,
  p_inflation_index numeric,
  p_exchange_index numeric,
  p_interest_index numeric,
  p_difficulty_multiplier numeric
)
returns table (
  business_key text,
  units_sold integer,
  gross_revenue numeric,
  total_expense numeric,
  net_income numeric,
  ending_balance numeric,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  raise exception 'BUSINESS_CYCLE_SETTLEMENT_RETIRED'
    using errcode = 'P0001',
      detail = 'New Business sales are committed only by Store purchases.';
end;
$function$;

revoke all on function public.settle_business_cycle_v1(
  uuid, text, text, numeric, numeric, numeric, numeric
) from public, anon, authenticated;
grant execute on function public.settle_business_cycle_v1(
  uuid, text, text, numeric, numeric, numeric, numeric
) to service_role;

create or replace function public.settle_business_payroll_current_period_v2(
  p_game_session_id uuid,
  p_business_key text,
  p_idempotency_key text
)
returns table (
  payroll_run_key text,
  payroll_period_key text,
  payroll_status text,
  employee_count integer,
  gross_wages_due numeric,
  gross_wages_paid numeric,
  gross_wages_unpaid numeric,
  currency_code text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  raise exception 'BUSINESS_PAYROLL_SETTLEMENT_WORKER_REQUIRED'
    using errcode = 'P0001',
      detail = 'Payroll closes only through a due operating-period lease.';
end;
$function$;

revoke all on function public.settle_business_payroll_current_period_v2(
  uuid, text, text
) from public, anon, authenticated;
grant execute on function public.settle_business_payroll_current_period_v2(
  uuid, text, text
) to service_role;

create or replace function public.recover_business_payroll_run_v2(
  p_game_session_id uuid,
  p_business_key text,
  p_payroll_run_key text,
  p_idempotency_key text
)
returns table (
  recovery_request_key text,
  payroll_run_key text,
  payroll_status text,
  amount_paid numeric,
  gross_wages_paid numeric,
  gross_wages_unpaid numeric,
  currency_code text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  raise exception 'BUSINESS_PAYROLL_RECOVERY_WORKER_REQUIRED'
    using errcode = 'P0001',
      detail = 'Payroll liability recovery requires a later guarded worker scope.';
end;
$function$;

revoke all on function public.recover_business_payroll_run_v2(
  uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.recover_business_payroll_run_v2(
  uuid, text, text, text
) to service_role;

-- The close snapshot remains immutable, while later worker payments append new
-- canonical Banking evidence.  Existing close-time payments become sequence 1.
alter table public.business_gross_receipts_tax_payments
  drop constraint business_gross_receipts_tax_payments_assessment_unique,
  add column payment_sequence integer not null default 1,
  add constraint business_gross_receipts_tax_payments_sequence_check
    check (payment_sequence > 0),
  add constraint business_gross_receipts_tax_payments_assessment_sequence_unique
    unique (game_session_id, tax_assessment_id, payment_sequence);

create index business_gross_receipts_tax_payments_assessment_idx
  on public.business_gross_receipts_tax_payments(
    game_session_id, tax_assessment_id, payment_sequence
  );

alter table public.business_gross_receipts_tax_payments
  enable always trigger guard_business_gross_receipts_tax_payment_v1;

comment on column public.business_gross_receipts_tax_assessments.tax_unpaid is
  'Immutable amount unpaid at period close. Current liability is tax_assessed minus all immutable assessment payment rows.';

-- Policy rows are immutable snapshots.  This service-only append command
-- serializes one game, derives the next version, and makes the new snapshot
-- effective only for periods opened after the command commits.  Existing
-- clocks and claims keep their already-copied policy identity and values.
create unique index business_operating_period_policy_append_idempotency_idx
  on public.business_operating_period_policies(
    game_session_id,
    (metadata ->> 'idempotencyKey')
  )
  where source_type = 'phase11_policy_append';

create or replace function public.append_business_operating_period_policy_v1(
  p_game_session_id uuid,
  p_period_duration_seconds integer,
  p_gross_receipts_tax_rate numeric,
  p_claim_lease_seconds integer,
  p_reason text,
  p_idempotency_key text
)
returns table (
  policy_key text,
  policy_version bigint,
  period_duration_seconds integer,
  gross_receipts_tax_rate numeric,
  claim_lease_seconds integer,
  effective_for_periods_opened_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_game_active boolean := false;
  v_previous public.business_operating_period_policies%rowtype;
  v_policy public.business_operating_period_policies%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_tax_rate numeric(20,18);
  v_request_fingerprint text;
  v_now timestamptz;
begin
  if p_game_session_id is null
     or p_period_duration_seconds is distinct from 604800
     or p_gross_receipts_tax_rate is null
     or p_gross_receipts_tax_rate < 0
     or p_gross_receipts_tax_rate > 1
     or p_claim_lease_seconds is null
     or p_claim_lease_seconds not between 30 and 900
     or length(v_reason) not between 1 and 500
     or length(v_idempotency_key) not between 8 and 160
  then
    raise exception 'BUSINESS_OPERATING_PERIOD_POLICY_APPEND_INVALID'
      using errcode = '22023';
  end if;
  v_tax_rate := round(p_gross_receipts_tax_rate, 18);

  v_request_fingerprint := encode(
    extensions.digest(
      jsonb_build_object(
        'periodDurationSeconds', p_period_duration_seconds,
        'grossReceiptsTaxRate', v_tax_rate,
        'claimLeaseSeconds', p_claim_lease_seconds,
        'reason', v_reason
      )::text,
      'sha256'
    ),
    'hex'
  );

  select
    game_row.status = 'active'
      and game_row.lifecycle_state = 'active'
  into v_game_active
  from public.game_sessions as game_row
  where game_row.id = p_game_session_id
  for update;
  if not found then
    raise exception 'GAME_SESSION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if not v_game_active then
    raise exception 'BUSINESS_OPERATING_PERIOD_POLICY_GAME_INACTIVE'
      using errcode = 'P0001';
  end if;
  v_now := clock_timestamp();

  select policy_row.*
  into v_policy
  from public.business_operating_period_policies as policy_row
  where policy_row.game_session_id = p_game_session_id
    and policy_row.source_type = 'phase11_policy_append'
    and policy_row.metadata ->> 'idempotencyKey' = v_idempotency_key
  order by policy_row.policy_version, policy_row.id
  limit 1;
  if found then
    if jsonb_typeof(v_policy.metadata -> 'idempotencyKey')
         is distinct from 'string'
       or jsonb_typeof(v_policy.metadata -> 'requestFingerprint')
         is distinct from 'string'
       or v_policy.metadata ->> 'requestFingerprint'
         is distinct from v_request_fingerprint
       or v_policy.period_duration_seconds <> p_period_duration_seconds
       or v_policy.gross_receipts_tax_rate <> v_tax_rate
       or v_policy.claim_lease_seconds <> p_claim_lease_seconds
    then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;

    return query select
      v_policy.public_key,
      v_policy.policy_version,
      v_policy.period_duration_seconds,
      v_policy.gross_receipts_tax_rate,
      v_policy.claim_lease_seconds,
      v_policy.effective_for_periods_opened_at,
      true;
    return;
  end if;

  perform private.ensure_business_operating_period_policy_v1(
    p_game_session_id, v_now
  );
  select policy_row.*
  into v_previous
  from public.business_operating_period_policies as policy_row
  where policy_row.game_session_id = p_game_session_id
  order by policy_row.policy_version desc, policy_row.id
  limit 1;
  if not found or v_previous.policy_version >= 9223372036854775806 then
    raise exception 'BUSINESS_OPERATING_PERIOD_POLICY_VERSION_EXHAUSTED'
      using errcode = 'P0001';
  end if;

  insert into public.business_operating_period_policies (
    game_session_id,
    policy_version,
    period_duration_seconds,
    gross_receipts_tax_rate,
    claim_lease_seconds,
    effective_for_periods_opened_at,
    supersedes_policy_id,
    source_type,
    metadata
  ) values (
    p_game_session_id,
    v_previous.policy_version + 1,
    p_period_duration_seconds,
    v_tax_rate,
    p_claim_lease_seconds,
    v_now,
    v_previous.id,
    'phase11_policy_append',
    jsonb_build_object(
      'authority', 'business-operating-period-policy-append-v1',
      'idempotencyKey', v_idempotency_key,
      'requestFingerprint', v_request_fingerprint,
      'reason', v_reason,
      'supersedesPolicyKey', v_previous.public_key
    )
  )
  returning * into v_policy;

  return query select
    v_policy.public_key,
    v_policy.policy_version,
    v_policy.period_duration_seconds,
    v_policy.gross_receipts_tax_rate,
    v_policy.claim_lease_seconds,
    v_policy.effective_for_periods_opened_at,
    false;
end;
$function$;

revoke all on function public.append_business_operating_period_policy_v1(
  uuid, integer, numeric, integer, text, text
) from public, anon, authenticated;
grant execute on function public.append_business_operating_period_policy_v1(
  uuid, integer, numeric, integer, text, text
) to service_role;

-- The retained per-run recovery signature above carried caller-selected scope
-- and idempotency, so it remains retired.  The internal operations worker gets
-- a separate bounded command: PostgreSQL selects operational Businesses,
-- derives a five-minute attempt window, observes canonical available balance,
-- and records exactly one durable attempt per payroll run/window.
create or replace function private.guard_business_payroll_recovery_evidence_v1()
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

  if tg_op = 'UPDATE'
     and current_setting(
       'app.business_payroll_recovery_write_v1', true
     ) = 'on'
     and old.status = 'posting'
     and new.status in ('completed', 'no_funds')
     and new.id = old.id
     and new.public_key = old.public_key
     and new.game_session_id = old.game_session_id
     and new.business_id = old.business_id
     and new.payroll_run_id = old.payroll_run_id
     and new.idempotency_key = old.idempotency_key
     and new.request_hash = old.request_hash
     and new.created_at = old.created_at
     and new.completed_at is not null
  then
    return new;
  end if;

  raise exception 'BUSINESS_PAYROLL_RECOVERY_EVIDENCE_IMMUTABLE'
    using errcode = '42501';
end;
$function$;

revoke all on function private.guard_business_payroll_recovery_evidence_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_business_payroll_recovery_evidence_v1
  on public.business_payroll_recovery_requests;
create trigger guard_business_payroll_recovery_evidence_v1
before update or delete on public.business_payroll_recovery_requests
for each row
execute function private.guard_business_payroll_recovery_evidence_v1();
alter table public.business_payroll_recovery_requests
  enable always trigger guard_business_payroll_recovery_evidence_v1;

create index if not exists business_payroll_recovery_run_created_idx
  on public.business_payroll_recovery_requests(
    game_session_id, payroll_run_id, created_at desc, id desc
  );

create or replace function private.recover_business_payroll_liability_worker_v1(
  p_payroll_run_id uuid,
  p_window_started_at timestamptz
)
returns table (
  recovery_request_key text,
  payroll_run_key text,
  business_key text,
  payroll_status text,
  recovered boolean,
  liability_remaining boolean,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_scope record;
  v_business public.business_entities%rowtype;
  v_run public.business_payroll_runs%rowtype;
  v_request public.business_payroll_recovery_requests%rowtype;
  v_entry record;
  v_post record;
  v_game_active boolean := false;
  v_idempotency_key text;
  v_request_hash text;
  v_currency_minor integer;
  v_business_account_id uuid;
  v_recipient_account_id uuid;
  v_recipient_account_status text;
  v_available numeric(38,18) := 0;
  v_remaining_due numeric(38,18) := 0;
  v_pay numeric(38,18) := 0;
  v_paid numeric(38,18) := 0;
  v_business_ledger_id uuid;
  v_employee_ledger_id uuid;
  v_first_business_ledger_id uuid;
  v_bank_transaction_id uuid;
  v_bank_transaction_key text;
  v_entry_finalized_at timestamptz;
  v_entry_recipient_unavailable boolean := false;
  v_entry_funds_shortfall boolean := false;
  v_had_recipient_unavailable boolean := false;
  v_had_funds_shortfall boolean := false;
  v_bank_transaction_keys jsonb := '[]'::jsonb;
  v_entry_outcomes jsonb := '[]'::jsonb;
  v_now timestamptz := clock_timestamp();
  v_prior_recovery_context text := coalesce(
    current_setting('app.business_payroll_recovery_write_v1', true), ''
  );
begin
  if p_payroll_run_id is null
     or p_window_started_at is null
     or date_trunc('minute', p_window_started_at) <> p_window_started_at
     or extract(minute from p_window_started_at)::integer % 5 <> 0
     or p_window_started_at > v_now
     or p_window_started_at <= v_now - interval '10 minutes'
  then
    raise exception 'BUSINESS_PAYROLL_RECOVERY_WINDOW_INVALID'
      using errcode = '22023';
  end if;

  select payroll_row.game_session_id, payroll_row.business_id
  into v_scope
  from public.business_payroll_runs as payroll_row
  where payroll_row.id = p_payroll_run_id;
  if not found then
    return;
  end if;

  -- Recovery follows the same economic lock family as period close: Business,
  -- payroll evidence, game lifecycle, then the game-scoped Banking boundary.
  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = v_scope.game_session_id
    and business_row.id = v_scope.business_id
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select payroll_row.*
  into v_run
  from public.business_payroll_runs as payroll_row
  where payroll_row.game_session_id = v_business.game_session_id
    and payroll_row.business_id = v_business.id
    and payroll_row.id = p_payroll_run_id
  for update;
  if not found then
    return;
  end if;

  v_idempotency_key := 'phase11-payroll-recovery:'
    || v_run.public_key || ':'
    || floor(extract(epoch from p_window_started_at))::bigint::text;
  v_request_hash := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|',
          'business-payroll-liability-recovery-v1',
          v_run.game_session_id,
          v_run.business_id,
          v_run.id,
          p_window_started_at
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  select request_row.*
  into v_request
  from public.business_payroll_recovery_requests as request_row
  where request_row.game_session_id = v_run.game_session_id
    and request_row.business_id = v_run.business_id
    and request_row.idempotency_key = v_idempotency_key
  for update;
  if found then
    if v_request.payroll_run_id <> v_run.id
       or v_request.request_hash <> v_request_hash
       or v_request.status not in ('completed', 'no_funds')
       or jsonb_typeof(v_request.metadata -> 'resultPayrollStatus') <> 'string'
       or jsonb_typeof(v_request.metadata -> 'resultRecovered') <> 'boolean'
       or jsonb_typeof(v_request.metadata -> 'resultLiabilityRemaining')
         <> 'boolean'
       or v_request.metadata ->> 'businessKey' <> v_business.public_key
       or v_request.metadata ->> 'payrollRunKey' <> v_run.public_key
    then
      raise exception 'BUSINESS_PAYROLL_RECOVERY_EVIDENCE_CONFLICT'
        using errcode = 'P0001';
    end if;

    return query select
      v_request.public_key,
      v_run.public_key,
      v_business.public_key,
      v_request.metadata ->> 'resultPayrollStatus',
      false,
      (v_request.metadata ->> 'resultLiabilityRemaining')::boolean,
      true;
    return;
  end if;

  -- Another worker may have completed this run after the bounded candidate
  -- snapshot but before this canonical lock sequence was acquired.
  if v_run.gross_wages_unpaid <= 0 then
    return;
  end if;
  if v_business.status not in ('active', 'restructuring', 'distressed') then
    raise exception 'BUSINESS_NOT_OPERATIONAL' using errcode = 'P0001';
  end if;

  select
    game_row.status = 'active'
      and game_row.lifecycle_state = 'active'
  into v_game_active
  from public.game_sessions as game_row
  where game_row.id = v_business.game_session_id
  for share;
  if not found or not v_game_active then
    raise exception 'BUSINESS_PAYROLL_RECOVERY_GAME_INACTIVE'
      using errcode = 'P0001';
  end if;

  select currency_row.decimal_places
  into v_currency_minor
  from public.currencies as currency_row
  where currency_row.code = v_run.currency_code
    and currency_row.status = 'active';
  if not found or v_currency_minor <> v_run.currency_minor_unit then
    raise exception 'BUSINESS_PAYROLL_RECOVERY_CURRENCY_INVALID'
      using errcode = 'P0001';
  end if;

  perform entry_row.id
  from public.business_payroll_entries as entry_row
  where entry_row.game_session_id = v_run.game_session_id
    and entry_row.payroll_run_id = v_run.id
  order by entry_row.public_key
  for update;

  perform player_row.id
  from public.players as player_row
  join public.business_payroll_entries as entry_row
    on entry_row.game_session_id = player_row.game_session_id
   and entry_row.employee_player_id = player_row.id
  where entry_row.game_session_id = v_run.game_session_id
    and entry_row.payroll_run_id = v_run.id
    and entry_row.wage_unpaid > 0
  order by player_row.id
  for share of player_row;

  if exists (
    select 1
    from public.business_payroll_entries as entry_row
    where entry_row.game_session_id = v_run.game_session_id
      and entry_row.payroll_run_id = v_run.id
      and (
        entry_row.business_id <> v_run.business_id
        or entry_row.currency_code <> v_run.currency_code
        or entry_row.currency_minor_unit <> v_run.currency_minor_unit
        or entry_row.wage_due <> entry_row.wage_paid + entry_row.wage_unpaid
      )
  ) or coalesce((
    select sum(entry_row.wage_unpaid)
    from public.business_payroll_entries as entry_row
    where entry_row.game_session_id = v_run.game_session_id
      and entry_row.payroll_run_id = v_run.id
  ), 0) <> v_run.gross_wages_unpaid
  then
    raise exception 'BUSINESS_PAYROLL_RECOVERY_EVIDENCE_CONFLICT'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'banking-monetary-v1:' || v_run.game_session_id::text,
    0
  ));

  v_business_account_id := private.ensure_active_business_checking_account_v1(
    v_run.game_session_id,
    v_run.business_id,
    v_run.currency_code
  );
  perform private.ensure_bank_account_projection_v1(
    v_run.game_session_id, v_business_account_id
  );

  select round(
    greatest(
      balance_row.balance
        - private.active_bank_account_hold_amount_v1(
            v_run.game_session_id,
            v_business_account_id,
            '{}'::uuid[]
          ),
      0
    ),
    v_currency_minor
  )
  into v_available
  from public.account_balances as balance_row
  where balance_row.game_session_id = v_run.game_session_id
    and balance_row.bank_account_id = v_business_account_id
  for update;

  v_available := least(coalesce(v_available, 0), v_run.gross_wages_unpaid);
  v_remaining_due := v_run.gross_wages_unpaid;

  insert into public.business_payroll_recovery_requests (
    game_session_id,
    business_id,
    payroll_run_id,
    idempotency_key,
    request_hash,
    metadata
  ) values (
    v_run.game_session_id,
    v_run.business_id,
    v_run.id,
    v_idempotency_key,
    v_request_hash,
    jsonb_build_object(
      'authority', 'business-operations-worker-v1',
      'workerWindowStartedAt', p_window_started_at,
      'businessKey', v_business.public_key,
      'payrollRunKey', v_run.public_key,
      'payrollPeriodKey', v_run.payroll_period_key,
      'startingPayrollVersion', v_run.version,
      'startingGrossWagesPaid', v_run.gross_wages_paid,
      'startingGrossWagesUnpaid', v_run.gross_wages_unpaid,
      'startingAvailableBalance', v_available,
      'usesCanonicalAvailableBalance', true
    )
  )
  returning * into v_request;

  for v_entry in
    select
      entry_row.*,
      employee_row.public_key as employee_key,
      player_row.status as employee_player_status
    from public.business_payroll_entries as entry_row
    join public.business_employees as employee_row
      on employee_row.game_session_id = entry_row.game_session_id
     and employee_row.id = entry_row.employee_id
    left join public.players as player_row
      on player_row.game_session_id = entry_row.game_session_id
     and player_row.id = entry_row.employee_player_id
    where entry_row.game_session_id = v_run.game_session_id
      and entry_row.payroll_run_id = v_run.id
      and entry_row.wage_unpaid > 0
    order by entry_row.public_key
  loop
    v_business_ledger_id := null;
    v_employee_ledger_id := null;
    v_bank_transaction_id := null;
    v_bank_transaction_key := null;
    v_entry_recipient_unavailable := false;
    v_entry_funds_shortfall := false;

    if v_remaining_due <= 0 or v_available <= 0 then
      v_pay := 0;
    elsif v_entry.wage_unpaid = v_remaining_due then
      v_pay := least(v_entry.wage_unpaid, v_available);
    else
      v_pay := least(
        v_entry.wage_unpaid,
        v_available,
        round(
          v_available * v_entry.wage_unpaid / v_remaining_due,
          v_currency_minor
        )
      );
    end if;
    v_pay := round(v_pay, v_currency_minor);
    v_entry_funds_shortfall := v_pay < v_entry.wage_unpaid;

    if v_entry.employee_player_id is not null
       and coalesce(v_entry.employee_player_status, '') <> 'active'
    then
      v_entry_recipient_unavailable := true;
      v_pay := 0;
    end if;

    if v_pay > 0 then
      if v_entry.employee_player_id is not null then
        v_recipient_account_id := private.ensure_player_bank_account_v1(
          v_run.game_session_id,
          v_entry.employee_player_id,
          'checking',
          v_run.currency_code
        );
      else
        v_recipient_account_id := private.ensure_system_bank_account_v1(
          v_run.game_session_id,
          'business.payroll.employee-clearing',
          'checking',
          v_run.currency_code
        );
      end if;

      select account_row.status
      into v_recipient_account_status
      from public.bank_accounts as account_row
      where account_row.game_session_id = v_run.game_session_id
        and account_row.id = v_recipient_account_id
      for share;
      if not found or v_recipient_account_status <> 'active' then
        v_entry_recipient_unavailable := true;
        v_pay := 0;
      end if;
    end if;

    v_had_recipient_unavailable := v_had_recipient_unavailable
      or v_entry_recipient_unavailable;
    v_had_funds_shortfall := v_had_funds_shortfall
      or v_entry_funds_shortfall;

    if v_pay > 0 then
      perform private.ensure_bank_account_projection_v1(
        v_run.game_session_id, v_recipient_account_id
      );

      select post_row.*
      into v_post
      from private.post_bank_transaction_v1(
        v_run.game_session_id,
        'business_payroll',
        'business',
        'payroll_liability_recovery',
        v_request.id,
        'phase11-payroll-recovery-entry:'
          || v_request.public_key || ':' || v_entry.public_key,
        encode(
          extensions.digest(
            convert_to(
              concat_ws(
                '|',
                'business-payroll-liability-recovery-entry-v1',
                v_request.id,
                v_entry.id,
                v_business_account_id,
                v_recipient_account_id,
                v_run.currency_code,
                v_pay
              ),
              'UTF8'
            ),
            'sha256'
          ),
          'hex'
        ),
        jsonb_build_array(
          jsonb_build_object(
            'bankAccountId', v_business_account_id,
            'amount', private.currency_amount_text_v1(
              -v_pay, v_currency_minor
            ),
            'entryType', 'debit',
            'metadata', jsonb_build_object(
              'payrollRunKey', v_run.public_key,
              'payrollEntryKey', v_entry.public_key,
              'recoveryRequestKey', v_request.public_key
            )
          ),
          jsonb_build_object(
            'bankAccountId', v_recipient_account_id,
            'amount', private.currency_amount_text_v1(
              v_pay, v_currency_minor
            ),
            'entryType', 'credit',
            'metadata', jsonb_build_object(
              'payrollRunKey', v_run.public_key,
              'payrollEntryKey', v_entry.public_key,
              'recoveryRequestKey', v_request.public_key,
              'employeeKey', v_entry.employee_key
            )
          )
        ),
        'system',
        null,
        jsonb_build_object(
          'authority', 'business-operations-worker-v1',
          'businessKey', v_business.public_key,
          'payrollRunKey', v_run.public_key,
          'recoveryRequestKey', v_request.public_key
        ),
        '{}'::uuid[]
      ) as post_row;

      select ledger_row.id
      into v_business_ledger_id
      from public.ledger_entries as ledger_row
      where ledger_row.game_session_id = v_run.game_session_id
        and ledger_row.bank_transaction_id = v_post.bank_transaction_id
        and ledger_row.line_number = 1;
      select ledger_row.id
      into v_employee_ledger_id
      from public.ledger_entries as ledger_row
      where ledger_row.game_session_id = v_run.game_session_id
        and ledger_row.bank_transaction_id = v_post.bank_transaction_id
        and ledger_row.line_number = 2;
      if v_business_ledger_id is null or v_employee_ledger_id is null then
        raise exception 'BUSINESS_PAYROLL_RECOVERY_BANK_EVIDENCE_MISSING'
          using errcode = 'P0001';
      end if;

      v_bank_transaction_id := v_post.bank_transaction_id;
      v_bank_transaction_key := v_post.bank_transaction_public_key;
      v_first_business_ledger_id := coalesce(
        v_first_business_ledger_id, v_business_ledger_id
      );
      v_bank_transaction_keys := v_bank_transaction_keys
        || jsonb_build_array(v_post.bank_transaction_public_key);
      v_entry_finalized_at := v_post.posted_at;
    else
      v_entry_finalized_at := clock_timestamp();
    end if;

    update public.business_payroll_entries as entry_row
    set wage_paid = entry_row.wage_paid + v_pay,
        wage_unpaid = entry_row.wage_unpaid - v_pay,
        status = case
          when entry_row.wage_unpaid - v_pay = 0 then 'paid'
          when entry_row.wage_paid + v_pay > 0 then 'partially_paid'
          else 'unpaid'
        end,
        business_ledger_entry_id = coalesce(
          entry_row.business_ledger_entry_id, v_business_ledger_id
        ),
        employee_ledger_entry_id = coalesce(
          entry_row.employee_ledger_entry_id, v_employee_ledger_id
        ),
        bank_transaction_id = coalesce(
          entry_row.bank_transaction_id, v_bank_transaction_id
        ),
        posted_at = coalesce(entry_row.posted_at, v_entry_finalized_at),
        metadata = entry_row.metadata || jsonb_build_object(
          'latestRecoveryRequestKey', v_request.public_key,
          'latestRecoveryAmount', v_pay,
          'latestRecoveryUnpaidReason', case
            when v_entry_recipient_unavailable and v_entry_funds_shortfall
              then 'recipient_unavailable_and_insufficient_funds'
            when v_entry_recipient_unavailable then 'recipient_unavailable'
            when v_entry_funds_shortfall then 'insufficient_available_funds'
            else null
          end
        ),
        updated_at = v_entry_finalized_at
    where entry_row.id = v_entry.id;

    v_entry_outcomes := v_entry_outcomes || jsonb_build_array(
      jsonb_build_object(
        'payrollEntryKey', v_entry.public_key,
        'employeeKey', v_entry.employee_key,
        'amountPaid', v_pay,
        'amountUnpaid', v_entry.wage_unpaid - v_pay,
        'recipientUnavailable', v_entry_recipient_unavailable,
        'insufficientAvailableFunds', v_entry_funds_shortfall,
        'bankTransactionKey', case
          when v_pay > 0 then v_bank_transaction_key
          else null
        end
      )
    );
    v_available := round(v_available - v_pay, v_currency_minor);
    v_remaining_due := round(
      v_remaining_due - v_entry.wage_unpaid,
      v_currency_minor
    );
    v_paid := round(v_paid + v_pay, v_currency_minor);
  end loop;

  v_now := clock_timestamp();
  update public.business_payroll_runs as payroll_row
  set gross_wages_paid = payroll_row.gross_wages_paid + v_paid,
      gross_wages_unpaid = payroll_row.gross_wages_unpaid - v_paid,
      status = case
        when payroll_row.gross_wages_unpaid - v_paid = 0 then 'completed'
        when payroll_row.gross_wages_paid + v_paid > 0 then 'partially_paid'
        else 'unpaid'
      end,
      business_ledger_entry_id = coalesce(
        payroll_row.business_ledger_entry_id, v_first_business_ledger_id
      ),
      failure_code = case
        when payroll_row.gross_wages_unpaid - v_paid = 0 then null
        when v_had_recipient_unavailable and v_had_funds_shortfall
          then 'RECIPIENT_UNAVAILABLE_AND_INSUFFICIENT_FUNDS'
        when v_had_recipient_unavailable
          then 'PAYROLL_RECIPIENT_UNAVAILABLE'
        when v_had_funds_shortfall
          then 'INSUFFICIENT_AVAILABLE_BUSINESS_FUNDS'
        else 'PAYROLL_UNPAID_UNCLASSIFIED'
      end,
      metadata = payroll_row.metadata || jsonb_build_object(
        'latestRecoveryRequestKey', v_request.public_key,
        'latestRecoveryAmount', v_paid,
        'latestRecoveryWindowStartedAt', p_window_started_at,
        'latestRecoveryBankTransactionKeys', v_bank_transaction_keys
      ),
      version = payroll_row.version + 1,
      updated_at = v_now
  where payroll_row.id = v_run.id
  returning * into v_run;

  perform pg_catalog.set_config(
    'app.business_payroll_recovery_write_v1', 'on', true
  );
  update public.business_payroll_recovery_requests as request_row
  set amount_paid = v_paid,
      status = case when v_paid > 0 then 'completed' else 'no_funds' end,
      business_ledger_entry_id = v_first_business_ledger_id,
      completed_at = v_now,
      metadata = request_row.metadata || jsonb_build_object(
        'bankTransactionKeys', v_bank_transaction_keys,
        'entryOutcomes', v_entry_outcomes,
        'resultPayrollStatus', v_run.status,
        'resultGrossWagesPaid', v_run.gross_wages_paid,
        'resultGrossWagesUnpaid', v_run.gross_wages_unpaid,
        'resultRecovered', v_paid > 0,
        'resultLiabilityRemaining', v_run.gross_wages_unpaid > 0
      ),
      updated_at = v_now
  where request_row.id = v_request.id
  returning * into v_request;
  perform pg_catalog.set_config(
    'app.business_payroll_recovery_write_v1',
    v_prior_recovery_context,
    true
  );

  insert into public.business_activity_events (
    game_session_id,
    business_id,
    actor_type,
    actor_player_id,
    event_type,
    source_id,
    reason_code,
    metadata,
    occurred_at
  ) values (
    v_run.game_session_id,
    v_run.business_id,
    'system',
    null,
    case when v_paid > 0
      then 'business.payroll.liability-recovered'
      else 'business.payroll.liability-recovery-deferred'
    end,
    v_request.id,
    case when v_paid > 0
      then 'worker-recovery'
      else 'worker-no-available-funds'
    end,
    jsonb_build_object(
      'businessKey', v_business.public_key,
      'payrollRunKey', v_run.public_key,
      'recoveryRequestKey', v_request.public_key,
      'amountPaid', v_paid,
      'grossWagesPaid', v_run.gross_wages_paid,
      'grossWagesUnpaid', v_run.gross_wages_unpaid,
      'currencyCode', v_run.currency_code,
      'workerWindowStartedAt', p_window_started_at
    ),
    v_now
  );

  return query select
    v_request.public_key,
    v_run.public_key,
    v_business.public_key,
    v_run.status,
    v_paid > 0,
    v_run.gross_wages_unpaid > 0,
    false;
end;
$function$;

revoke all on function private.recover_business_payroll_liability_worker_v1(
  uuid, timestamptz
) from public, anon, authenticated, service_role;

create or replace function public.recover_due_business_payroll_liabilities_v1(
  p_batch_limit integer default 25
)
returns table (
  recovery_request_key text,
  payroll_run_key text,
  business_key text,
  payroll_status text,
  recovered boolean,
  liability_remaining boolean,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_candidate record;
  v_window_started_at timestamptz := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / 300) * 300
  );
  v_window_epoch text;
begin
  if p_batch_limit is null or p_batch_limit not between 1 and 100 then
    raise exception 'BUSINESS_PAYROLL_RECOVERY_BATCH_LIMIT_INVALID'
      using errcode = '22023';
  end if;
  v_window_epoch := floor(
    extract(epoch from v_window_started_at)
  )::bigint::text;

  -- Unattempted liabilities are ordered before same-window replay candidates,
  -- so a stuck run cannot starve later Businesses in a bounded batch.
  for v_candidate in
    with eligible as (
      select
        payroll_row.id,
        payroll_row.completed_at,
        payroll_row.public_key,
        exists (
          select 1
          from public.business_payroll_recovery_requests as request_row
          where request_row.game_session_id = payroll_row.game_session_id
            and request_row.business_id = payroll_row.business_id
            and request_row.payroll_run_id = payroll_row.id
            and request_row.idempotency_key =
              'phase11-payroll-recovery:' || payroll_row.public_key
                || ':' || v_window_epoch
        ) as replay_candidate
      from public.business_payroll_runs as payroll_row
      join public.business_entities as business_row
        on business_row.game_session_id = payroll_row.game_session_id
       and business_row.id = payroll_row.business_id
       and business_row.status in ('active', 'restructuring', 'distressed')
      join public.game_sessions as game_row
        on game_row.id = payroll_row.game_session_id
       and game_row.status = 'active'
       and game_row.lifecycle_state = 'active'
      where payroll_row.gross_wages_unpaid > 0
        and payroll_row.status in ('partially_paid', 'unpaid')
      union
      select
        payroll_row.id,
        payroll_row.completed_at,
        payroll_row.public_key,
        true
      from public.business_payroll_recovery_requests as request_row
      join public.business_payroll_runs as payroll_row
        on payroll_row.game_session_id = request_row.game_session_id
       and payroll_row.id = request_row.payroll_run_id
      join public.business_entities as business_row
        on business_row.game_session_id = payroll_row.game_session_id
       and business_row.id = payroll_row.business_id
       and business_row.status in ('active', 'restructuring', 'distressed')
      join public.game_sessions as game_row
        on game_row.id = payroll_row.game_session_id
       and game_row.status = 'active'
       and game_row.lifecycle_state = 'active'
      where request_row.idempotency_key =
        'phase11-payroll-recovery:' || payroll_row.public_key
          || ':' || v_window_epoch
        and request_row.status in ('completed', 'no_funds')
    )
    select eligible_row.id
    from eligible as eligible_row
    group by
      eligible_row.id,
      eligible_row.completed_at,
      eligible_row.public_key
    order by
      bool_and(eligible_row.replay_candidate),
      eligible_row.completed_at,
      eligible_row.public_key
    limit p_batch_limit
  loop
    return query
    select recovery_row.*
    from private.recover_business_payroll_liability_worker_v1(
      v_candidate.id,
      v_window_started_at
    ) as recovery_row;
  end loop;
end;
$function$;

revoke all on function public.recover_due_business_payroll_liabilities_v1(
  integer
) from public, anon, authenticated;
grant execute on function public.recover_due_business_payroll_liabilities_v1(
  integer
) to service_role;

create or replace function private.recover_business_tax_liability_worker_v1(
  p_tax_assessment_id uuid
)
returns table (
  tax_assessment_key text,
  tax_payment_key text,
  business_key text,
  tax_status text,
  recovered boolean,
  liability_remaining boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_scope record;
  v_business public.business_entities%rowtype;
  v_assessment public.business_gross_receipts_tax_assessments%rowtype;
  v_post record;
  v_game_active boolean := false;
  v_paid_total numeric(38,18) := 0;
  v_outstanding numeric(38,18) := 0;
  v_available numeric(38,18) := 0;
  v_pay numeric(38,18) := 0;
  v_payment_sequence integer := 1;
  v_business_account_id uuid;
  v_tax_authority_account_id uuid;
  v_business_ledger_id uuid;
  v_tax_authority_ledger_id uuid;
  v_payment public.business_gross_receipts_tax_payments%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_tax_assessment_id is null then
    raise exception 'BUSINESS_TAX_RECOVERY_REQUEST_INVALID'
      using errcode = '22023';
  end if;

  select assessment_row.game_session_id, assessment_row.business_id
  into v_scope
  from public.business_gross_receipts_tax_assessments as assessment_row
  where assessment_row.id = p_tax_assessment_id;
  if not found then
    return;
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = v_scope.game_session_id
    and business_row.id = v_scope.business_id
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select assessment_row.*
  into v_assessment
  from public.business_gross_receipts_tax_assessments as assessment_row
  where assessment_row.game_session_id = v_business.game_session_id
    and assessment_row.business_id = v_business.id
    and assessment_row.id = p_tax_assessment_id
  for update;
  if not found then
    return;
  end if;

  select
    coalesce(sum(payment_row.amount_paid), 0),
    coalesce(max(payment_row.payment_sequence), 0) + 1
  into v_paid_total, v_payment_sequence
  from public.business_gross_receipts_tax_payments as payment_row
  where payment_row.game_session_id = v_assessment.game_session_id
    and payment_row.tax_assessment_id = v_assessment.id;
  v_paid_total := round(v_paid_total, v_assessment.currency_minor_unit);
  v_outstanding := round(
    v_assessment.tax_assessed - v_paid_total,
    v_assessment.currency_minor_unit
  );

  if v_paid_total < 0 or v_paid_total > v_assessment.tax_assessed then
    raise exception 'BUSINESS_TAX_RECOVERY_EVIDENCE_CONFLICT'
      using errcode = 'P0001';
  end if;
  if v_outstanding <= 0 then
    return;
  end if;
  if v_business.status not in ('active', 'restructuring', 'distressed') then
    raise exception 'BUSINESS_NOT_OPERATIONAL' using errcode = 'P0001';
  end if;

  select
    game_row.status = 'active'
      and game_row.lifecycle_state = 'active'
  into v_game_active
  from public.game_sessions as game_row
  where game_row.id = v_business.game_session_id
  for share;
  if not found or not v_game_active then
    raise exception 'BUSINESS_TAX_RECOVERY_GAME_INACTIVE'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'banking-monetary-v1:' || v_assessment.game_session_id::text,
    0
  ));

  v_business_account_id := private.ensure_active_business_checking_account_v1(
    v_assessment.game_session_id,
    v_assessment.business_id,
    v_assessment.currency_code
  );
  perform private.ensure_bank_account_projection_v1(
    v_assessment.game_session_id, v_business_account_id
  );

  select round(
    greatest(
      balance_row.balance
        - private.active_bank_account_hold_amount_v1(
            v_assessment.game_session_id,
            v_business_account_id,
            '{}'::uuid[]
          ),
      0
    ),
    v_assessment.currency_minor_unit
  )
  into v_available
  from public.account_balances as balance_row
  where balance_row.game_session_id = v_assessment.game_session_id
    and balance_row.bank_account_id = v_business_account_id
  for update;

  v_pay := round(
    least(v_outstanding, coalesce(v_available, 0)),
    v_assessment.currency_minor_unit
  );
  if v_pay <= 0 then
    return query select
      v_assessment.public_key,
      null::text,
      v_business.public_key,
      case when v_paid_total > 0 then 'partially_paid' else 'unpaid' end,
      false,
      true;
    return;
  end if;

  v_tax_authority_account_id := private.ensure_system_bank_account_v1(
    v_assessment.game_session_id,
    'business.gross-receipts-tax-authority',
    'checking',
    v_assessment.currency_code
  );
  perform private.ensure_bank_account_projection_v1(
    v_assessment.game_session_id, v_tax_authority_account_id
  );

  select post_row.*
  into v_post
  from private.post_bank_transaction_v1(
    v_assessment.game_session_id,
    'business_tax',
    'business',
    'gross_receipts_tax_liability_recovery',
    v_assessment.id,
    'phase11-tax-recovery:' || v_assessment.public_key
      || ':' || v_payment_sequence::text,
    encode(
      extensions.digest(
        convert_to(
          concat_ws(
            '|',
            'business-gross-receipts-tax-recovery-v1',
            v_assessment.id,
            v_payment_sequence,
            v_business_account_id,
            v_tax_authority_account_id,
            v_assessment.currency_code,
            v_pay
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ),
    jsonb_build_array(
      jsonb_build_object(
        'bankAccountId', v_business_account_id,
        'amount', private.currency_amount_text_v1(
          -v_pay, v_assessment.currency_minor_unit
        ),
        'entryType', 'debit',
        'metadata', jsonb_build_object(
          'taxAssessmentKey', v_assessment.public_key,
          'paymentSequence', v_payment_sequence
        )
      ),
      jsonb_build_object(
        'bankAccountId', v_tax_authority_account_id,
        'amount', private.currency_amount_text_v1(
          v_pay, v_assessment.currency_minor_unit
        ),
        'entryType', 'credit',
        'metadata', jsonb_build_object(
          'taxAssessmentKey', v_assessment.public_key,
          'paymentSequence', v_payment_sequence
        )
      )
    ),
    'system',
    null,
    jsonb_build_object(
      'authority', 'business-operations-worker-v1',
      'businessKey', v_business.public_key,
      'taxAssessmentKey', v_assessment.public_key,
      'paymentSequence', v_payment_sequence,
      'outstandingBefore', v_outstanding
    ),
    '{}'::uuid[]
  ) as post_row;

  select ledger_row.id
  into v_business_ledger_id
  from public.ledger_entries as ledger_row
  where ledger_row.game_session_id = v_assessment.game_session_id
    and ledger_row.bank_transaction_id = v_post.bank_transaction_id
    and ledger_row.line_number = 1;
  select ledger_row.id
  into v_tax_authority_ledger_id
  from public.ledger_entries as ledger_row
  where ledger_row.game_session_id = v_assessment.game_session_id
    and ledger_row.bank_transaction_id = v_post.bank_transaction_id
    and ledger_row.line_number = 2;
  if v_business_ledger_id is null or v_tax_authority_ledger_id is null then
    raise exception 'BUSINESS_TAX_RECOVERY_BANK_EVIDENCE_MISSING'
      using errcode = 'P0001';
  end if;

  insert into public.business_gross_receipts_tax_payments (
    game_session_id,
    business_id,
    tax_assessment_id,
    bank_transaction_id,
    business_ledger_entry_id,
    tax_authority_ledger_entry_id,
    currency_code,
    amount_paid,
    paid_at,
    payment_sequence
  ) values (
    v_assessment.game_session_id,
    v_assessment.business_id,
    v_assessment.id,
    v_post.bank_transaction_id,
    v_business_ledger_id,
    v_tax_authority_ledger_id,
    v_assessment.currency_code,
    v_pay,
    v_post.posted_at,
    v_payment_sequence
  )
  returning * into v_payment;

  v_paid_total := round(
    v_paid_total + v_pay,
    v_assessment.currency_minor_unit
  );
  v_outstanding := round(
    v_assessment.tax_assessed - v_paid_total,
    v_assessment.currency_minor_unit
  );
  v_now := clock_timestamp();

  insert into public.business_activity_events (
    game_session_id,
    business_id,
    actor_type,
    actor_player_id,
    event_type,
    source_id,
    reason_code,
    metadata,
    occurred_at
  ) values (
    v_assessment.game_session_id,
    v_assessment.business_id,
    'system',
    null,
    'business.tax.liability-recovered',
    v_payment.id,
    'worker-recovery',
    jsonb_build_object(
      'businessKey', v_business.public_key,
      'taxAssessmentKey', v_assessment.public_key,
      'taxPaymentKey', v_payment.public_key,
      'paymentSequence', v_payment_sequence,
      'amountPaid', v_pay,
      'outstandingAfter', v_outstanding,
      'currencyCode', v_assessment.currency_code,
      'bankTransactionKey', v_post.bank_transaction_public_key
    ),
    v_now
  );

  return query select
    v_assessment.public_key,
    v_payment.public_key,
    v_business.public_key,
    case
      when v_outstanding = 0 then 'paid'
      when v_paid_total > 0 then 'partially_paid'
      else 'unpaid'
    end,
    true,
    v_outstanding > 0;
end;
$function$;

revoke all on function private.recover_business_tax_liability_worker_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.recover_due_business_tax_liabilities_v1(
  p_batch_limit integer default 25
)
returns table (
  tax_assessment_key text,
  tax_payment_key text,
  business_key text,
  tax_status text,
  recovered boolean,
  liability_remaining boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_candidate record;
begin
  if p_batch_limit is null or p_batch_limit not between 1 and 100 then
    raise exception 'BUSINESS_TAX_RECOVERY_BATCH_LIMIT_INVALID'
      using errcode = '22023';
  end if;

  for v_candidate in
    select assessment_row.id
    from public.business_gross_receipts_tax_assessments as assessment_row
    join public.business_entities as business_row
      on business_row.game_session_id = assessment_row.game_session_id
     and business_row.id = assessment_row.business_id
     and business_row.status in ('active', 'restructuring', 'distressed')
    join public.game_sessions as game_row
      on game_row.id = assessment_row.game_session_id
     and game_row.status = 'active'
     and game_row.lifecycle_state = 'active'
    where assessment_row.tax_assessed > coalesce((
      select sum(payment_row.amount_paid)
      from public.business_gross_receipts_tax_payments as payment_row
      where payment_row.game_session_id = assessment_row.game_session_id
        and payment_row.tax_assessment_id = assessment_row.id
    ), 0)
    order by
      assessment_row.created_at,
      assessment_row.game_session_id,
      assessment_row.public_key
    limit p_batch_limit
  loop
    return query
    select recovery_row.*
    from private.recover_business_tax_liability_worker_v1(
      v_candidate.id
    ) as recovery_row;
  end loop;
end;
$function$;

revoke all on function public.recover_due_business_tax_liabilities_v1(integer)
  from public, anon, authenticated;
grant execute on function public.recover_due_business_tax_liabilities_v1(integer)
  to service_role;

-- Closing a Business is also an economic transition.  Keep the retained
-- Player command, but serialize it on the same Business row used by Store and
-- the period worker and refuse closure while the open period can still carry
-- payroll or Store-receipt authority.  Otherwise status='closed' would remove
-- the Business from the due scan and strand those obligations permanently.
create or replace function public.transition_business_status_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_transition text,
  p_reason text,
  p_idempotency_key text
)
returns table (
  business_key text,
  status text,
  failure_count integer,
  closed_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_replay public.audit_log%rowtype;
  v_clock public.business_payroll_clocks%rowtype;
  v_replay_failure_count integer;
  v_replay_closed_at timestamptz;
  v_target text;
  v_transition text := lower(btrim(coalesce(p_transition, '')));
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_request_fingerprint text;
  v_now timestamptz := clock_timestamp();
begin
  if length(v_idempotency_key) < 8 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  v_target := case v_transition
    when 'restructure' then 'restructuring'
    when 'recover' then 'active'
    when 'close' then 'closed'
    else null
  end;
  if v_target is null then
    raise exception 'BUSINESS_TRANSITION_INVALID' using errcode = 'P0001';
  end if;
  v_request_fingerprint := encode(
    extensions.digest(
      jsonb_build_object(
        'businessKey', lower(btrim(coalesce(p_business_key, ''))),
        'transition', v_transition,
        'reason', v_reason
      )::text,
      'sha256'
    ),
    'hex'
  );

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = lower(btrim(p_business_key))
    and business_row.owner_player_id = p_player_id
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select audit_row.*
  into v_replay
    from public.audit_log as audit_row
    where audit_row.game_session_id = p_game_session_id
      and audit_row.actor_type = 'player'
      and audit_row.actor_id = p_player_id
      and audit_row.action = 'business.status.transition'
      and audit_row.target_type = 'business'
      and audit_row.metadata ->> 'idempotency_key' = v_idempotency_key
    order by audit_row.created_at, audit_row.id
    limit 1;
  if found then
    if v_replay.actor_type is distinct from 'player'
       or v_replay.actor_id is distinct from p_player_id
       or v_replay.target_type is distinct from 'business'
       or v_replay.target_id is distinct from v_business.id
       or jsonb_typeof(v_replay.metadata) is distinct from 'object'
       or jsonb_typeof(v_replay.metadata -> 'idempotency_key')
         is distinct from 'string'
       or v_replay.metadata ->> 'idempotency_key'
         is distinct from v_idempotency_key
       or jsonb_typeof(v_replay.metadata -> 'request_fingerprint')
         is distinct from 'string'
       or v_replay.metadata ->> 'request_fingerprint'
         is distinct from v_request_fingerprint
       or (v_replay.metadata ->> 'request_fingerprint')
         !~ '^[0-9a-f]{64}$'
       or jsonb_typeof(v_replay.metadata -> 'result_business_key')
         is distinct from 'string'
       or v_replay.metadata ->> 'result_business_key'
         is distinct from v_business.public_key
       or (v_replay.metadata ->> 'result_business_key')
         !~ '^biz_[0-9a-f]{32}$'
       or jsonb_typeof(v_replay.metadata -> 'result_status')
         is distinct from 'string'
       or v_replay.metadata ->> 'result_status'
         not in ('active', 'restructuring', 'closed')
       or jsonb_typeof(v_replay.metadata -> 'status')
         is distinct from 'string'
       or v_replay.metadata ->> 'status'
         is distinct from v_replay.metadata ->> 'result_status'
       or jsonb_typeof(v_replay.metadata -> 'result_failure_count')
         is distinct from 'number'
       or (v_replay.metadata ->> 'result_failure_count')
         !~ '^(0|[1-9][0-9]{0,9})$'
       or jsonb_typeof(v_replay.metadata -> 'result_closed_at') is null
       or jsonb_typeof(v_replay.metadata -> 'result_closed_at')
         not in ('null', 'string')
    then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;

    begin
      if (v_replay.metadata ->> 'result_failure_count')::numeric
           > 2147483647
      then
        raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
      end if;
      v_replay_failure_count := (
        v_replay.metadata ->> 'result_failure_count'
      )::integer;
    exception when others then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end;
    if jsonb_typeof(v_replay.metadata -> 'result_closed_at') = 'null' then
      if v_replay.metadata ->> 'result_status' = 'closed' then
        raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
      end if;
      v_replay_closed_at := null;
    else
      if v_replay.metadata ->> 'result_status' <> 'closed'
         or coalesce(v_replay.metadata ->> 'result_closed_at', '') = ''
      then
        raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
      end if;
      begin
        v_replay_closed_at := (
          v_replay.metadata ->> 'result_closed_at'
        )::timestamptz;
      exception when others then
        raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
      end;
      if v_replay_closed_at is null or not pg_catalog.isfinite(v_replay_closed_at)
      then
        raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
      end if;
    end if;

    return query select
      v_replay.metadata ->> 'result_business_key',
      v_replay.metadata ->> 'result_status',
      v_replay_failure_count,
      v_replay_closed_at,
      true;
    return;
  end if;

  if v_business.status = 'closed' and v_target <> 'closed' then
    raise exception 'CLOSED_BUSINESS_IMMUTABLE' using errcode = 'P0001';
  end if;

  if v_target = 'closed' and v_business.status <> 'closed' then
    -- New Businesses may not have traversed a payroll read yet.  Provision the
    -- canonical clock while this transaction already owns the Business lock.
    perform public.ensure_business_payroll_clock_v2(
      p_game_session_id, v_business.id
    );

    select clock_row.*
    into v_clock
    from public.business_payroll_clocks as clock_row
    where clock_row.game_session_id = p_game_session_id
      and clock_row.business_id = v_business.id
    for update;
    if not found then
      raise exception 'BUSINESS_PAYROLL_CLOCK_MISSING' using errcode = 'P0001';
    end if;

    -- The Business or clock lock may have waited across the period boundary.
    -- Refresh server time only after both canonical locks are held so a close
    -- request cannot strand work that became due while it was blocked.
    v_now := clock_timestamp();

    if v_clock.next_due_at <= v_now
       or exists (
         select 1
         from public.business_operating_period_claims as claim_row
         where claim_row.game_session_id = p_game_session_id
           and claim_row.business_id = v_business.id
           and claim_row.period_number = v_clock.current_period_number
           and claim_row.status = 'claimed'
       )
    then
      raise exception 'BUSINESS_OPERATING_PERIOD_CLOSE_REQUIRED'
        using errcode = 'P0001',
          detail = 'The due operating period must close through the worker first.';
    end if;

    if exists (
         select 1
         from public.business_employees as employee_row
         where employee_row.game_session_id = p_game_session_id
           and employee_row.business_id = v_business.id
           and employee_row.status = 'active'
       )
       or exists (
         select 1
         from public.store_offer_purchase_receipts as receipt_row
         where receipt_row.game_session_id = p_game_session_id
           and receipt_row.business_id = v_business.id
           and receipt_row.business_sales_authority_version = 1
           and not exists (
             select 1
             from public.business_operating_period_store_receipts as source_row
             where source_row.game_session_id = receipt_row.game_session_id
               and source_row.store_purchase_receipt_id = receipt_row.id
           )
       )
    then
      raise exception 'BUSINESS_OPERATING_PERIOD_CLOSE_PENDING'
        using errcode = 'P0001',
          detail = 'Active payroll or unclosed Store receipt authority must be drained first.';
    end if;

    if exists (
      select 1
      from public.business_payroll_runs as payroll_row
      where payroll_row.game_session_id = p_game_session_id
        and payroll_row.business_id = v_business.id
        and payroll_row.gross_wages_unpaid > 0
        and payroll_row.status in ('partially_paid', 'unpaid')
    ) then
      raise exception 'BUSINESS_OUTSTANDING_PAYROLL_LIABILITY'
        using errcode = 'P0001',
          detail = 'Worker-owned unpaid payroll must settle before Business closure.';
    end if;

    if exists (
      select 1
      from public.business_gross_receipts_tax_assessments as assessment_row
      where assessment_row.game_session_id = p_game_session_id
        and assessment_row.business_id = v_business.id
        and assessment_row.tax_assessed > coalesce((
          select sum(payment_row.amount_paid)
          from public.business_gross_receipts_tax_payments as payment_row
          where payment_row.game_session_id = assessment_row.game_session_id
            and payment_row.tax_assessment_id = assessment_row.id
        ), 0)
    ) then
      raise exception 'BUSINESS_OUTSTANDING_TAX_LIABILITY'
        using errcode = 'P0001',
          detail = 'Assessed unpaid tax must settle before Business closure.';
    end if;
  end if;

  update public.business_entities as business_row
  set status = v_target,
      closed_at = case when v_target = 'closed' then v_now else null end,
      failure_count = case
        when v_target = 'active'
        then greatest(business_row.failure_count - 1, 0)
        else business_row.failure_count
      end,
      version = business_row.version + 1
  where business_row.id = v_business.id
  returning business_row.* into v_business;

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
    'business.status.transition',
    'business',
    v_business.id,
    jsonb_build_object(
      'idempotency_key', v_idempotency_key,
      'request_fingerprint', v_request_fingerprint,
      'transition', v_transition,
      'reason', v_reason,
      'status', v_business.status,
      'result_business_key', v_business.public_key,
      'result_status', v_business.status,
      'result_failure_count', v_business.failure_count,
      'result_closed_at', v_business.closed_at,
      'periodClosureGuard', 'business-operating-period-v1'
    )
  );

  return query select
    v_business.public_key,
    v_business.status,
    v_business.failure_count,
    v_business.closed_at,
    false;
end;
$function$;

revoke all on function public.transition_business_status_v1(
  uuid, uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.transition_business_status_v1(
  uuid, uuid, text, text, text, text
) to service_role;

-- Cached V1 aggregates remain readable only as compatibility history. New
-- Businesses start with neutral compatibility values, and no runtime command
-- may advance those columns after the Store-receipt cutover.
create or replace function private.neutralize_new_business_cached_financials_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  new.revenue_total := 0;
  new.expense_total := 0;
  new.profit_total := 0;
  new.valuation := 0;
  new.demand_index := 1;
  return new;
end;
$function$;

create or replace function private.guard_business_cached_financial_update_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if new.revenue_total is distinct from old.revenue_total
     or new.expense_total is distinct from old.expense_total
     or new.profit_total is distinct from old.profit_total
     or new.valuation is distinct from old.valuation
     or new.demand_index is distinct from old.demand_index
  then
    raise exception 'BUSINESS_CACHED_FINANCIAL_AUTHORITY_RETIRED'
      using errcode = '42501',
        detail = 'Store receipts and guarded period evidence own current Business economics.';
  end if;
  return new;
end;
$function$;

revoke all on function private.neutralize_new_business_cached_financials_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.guard_business_cached_financial_update_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists aa_neutralize_new_business_cached_financials_v1
  on public.business_entities;
create trigger aa_neutralize_new_business_cached_financials_v1
before insert on public.business_entities
for each row execute function private.neutralize_new_business_cached_financials_v1();

drop trigger if exists aa_guard_business_cached_financial_update_v1
  on public.business_entities;
create trigger aa_guard_business_cached_financial_update_v1
before update of revenue_total, expense_total, profit_total, valuation,
  demand_index on public.business_entities
for each row execute function private.guard_business_cached_financial_update_v1();

-- Formation and status-transition replay depend on their original result
-- snapshots in audit_log. Keep this guard action-specific so unrelated audit
-- families retain their existing lifecycle. The later whole-game purge
-- migration recognizes this registered BEFORE DELETE guard and adds only its
-- request-bound DELETE escape.
create or replace function private.guard_business_formation_audit_immutable_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if old.action = 'business.create_or_acquire' then
    raise exception 'BUSINESS_FORMATION_AUDIT_IMMUTABLE'
      using errcode = '42501';
  end if;
  if old.action = 'business.status.transition' then
    raise exception 'BUSINESS_STATUS_TRANSITION_AUDIT_IMMUTABLE'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.action = 'business.create_or_acquire' then
      raise exception 'BUSINESS_FORMATION_AUDIT_IMMUTABLE'
        using errcode = '42501';
    end if;
    if new.action = 'business.status.transition' then
      raise exception 'BUSINESS_STATUS_TRANSITION_AUDIT_IMMUTABLE'
        using errcode = '42501';
    end if;
    return new;
  end if;
  return old;
end;
$function$;

revoke all on function private.guard_business_formation_audit_immutable_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_business_formation_audit_immutable_v1
  on public.audit_log;
create trigger guard_business_formation_audit_immutable_v1
before update or delete on public.audit_log
for each row
execute function private.guard_business_formation_audit_immutable_v1();
alter table public.audit_log
  enable always trigger guard_business_formation_audit_immutable_v1;

-- Retain legacy single-owner formation during the Phase 11/12 handoff, but
-- permanently retire its unsafe direct-acquisition branch. Capital funding
-- still posts through the retained ledger compatibility bridge; valuation is
-- neither initialized nor returned as an authority.
create or replace function public.create_or_acquire_player_business_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_legal_name text,
  p_entity_type text,
  p_industry_code text,
  p_country_code text,
  p_currency_code text,
  p_capitalization numeric,
  p_acquire_business_key text,
  p_idempotency_key text
)
returns table (
  business_key text,
  status text,
  owner_player_id uuid,
  capitalization numeric,
  valuation numeric,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_legal_name text := btrim(coalesce(p_legal_name, ''));
  v_entity_type text := lower(btrim(coalesce(p_entity_type, '')));
  v_industry_code text := btrim(coalesce(p_industry_code, ''));
  v_country_code text := upper(btrim(coalesce(p_country_code, '')));
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_request_fingerprint text;
  v_replay public.audit_log%rowtype;
  v_business public.business_entities%rowtype;
  v_buyer_cash numeric := 0;
begin
  if nullif(btrim(coalesce(p_acquire_business_key, '')), '') is not null then
    raise exception 'BUSINESS_DIRECT_ACQUISITION_RETIRED'
      using errcode = 'P0001',
        detail = 'Ownership changes require the registered transfer authority.';
  end if;
  if length(v_idempotency_key) < 8 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  if p_capitalization is null
     or p_capitalization < 0
     or p_capitalization > 10000000
  then
    raise exception 'CAPITALIZATION_INVALID' using errcode = 'P0001';
  end if;
  if length(v_currency) < 3 or length(v_currency) > 16 then
    raise exception 'BUSINESS_CURRENCY_INVALID' using errcode = 'P0001';
  end if;
  v_request_fingerprint := encode(
    extensions.digest(
      jsonb_build_object(
        'legalName', v_legal_name,
        'entityType', v_entity_type,
        'industryCode', v_industry_code,
        'countryCode', v_country_code,
        'currencyCode', v_currency,
        'capitalization', round(p_capitalization, 2),
        'acquisition', false
      )::text,
      'sha256'
    ),
    'hex'
  );

  perform 1
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active'
  for update;
  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- The Player lock serializes both replay resolution and the retained
  -- one-open-Business formation rule. Recheck both only after that lock.
  select audit_row.*
  into v_replay
  from public.audit_log as audit_row
  where audit_row.game_session_id = p_game_session_id
    and audit_row.actor_id = p_player_id
    and audit_row.action = 'business.create_or_acquire'
    and audit_row.metadata ->> 'idempotency_key' = v_idempotency_key
  order by audit_row.created_at, audit_row.id
  limit 1;
  if found then
    -- Validate JSON types and bindings before casting any stored result. A
    -- malformed historical or forged service row must fail with the stable
    -- idempotency conflict instead of returning unrelated scope or leaking a
    -- PostgreSQL cast error.
    if v_replay.actor_type is distinct from 'player'
       or v_replay.target_type is distinct from 'business'
       or v_replay.target_id is null
       or jsonb_typeof(v_replay.metadata -> 'idempotency_key')
            is distinct from 'string'
       or v_replay.metadata -> 'idempotency_key'
            is distinct from to_jsonb(v_idempotency_key)
       or jsonb_typeof(v_replay.metadata -> 'request_fingerprint')
            is distinct from 'string'
       or v_replay.metadata -> 'request_fingerprint'
            is distinct from to_jsonb(v_request_fingerprint)
       or jsonb_typeof(v_replay.metadata -> 'business_key')
            is distinct from 'string'
       or jsonb_typeof(v_replay.metadata -> 'acquisition')
            is distinct from 'boolean'
       or v_replay.metadata -> 'acquisition'
            is distinct from 'false'::jsonb
       or jsonb_typeof(v_replay.metadata -> 'capital_contribution')
            is distinct from 'number'
       or v_replay.metadata -> 'capital_contribution'
            is distinct from to_jsonb(round(p_capitalization, 2))
       or jsonb_typeof(v_replay.metadata -> 'result_business_key')
            is distinct from 'string'
       or v_replay.metadata -> 'result_business_key'
            is distinct from v_replay.metadata -> 'business_key'
       or jsonb_typeof(v_replay.metadata -> 'result_status')
            is distinct from 'string'
       or v_replay.metadata -> 'result_status'
            is distinct from to_jsonb('active'::text)
       or jsonb_typeof(v_replay.metadata -> 'result_owner_player_id')
            is distinct from 'string'
       or v_replay.metadata -> 'result_owner_player_id'
            is distinct from to_jsonb(p_player_id::text)
       or jsonb_typeof(v_replay.metadata -> 'result_capitalization')
            is distinct from 'number'
       or v_replay.metadata -> 'result_capitalization'
            is distinct from v_replay.metadata -> 'capital_contribution'
       or jsonb_typeof(v_replay.metadata -> 'result_valuation')
            is distinct from 'number'
       or v_replay.metadata -> 'result_valuation'
            is distinct from to_jsonb(0::numeric)
       or not exists (
         select 1
         from public.business_entities as result_business
         where result_business.game_session_id = p_game_session_id
           and result_business.id = v_replay.target_id
           and result_business.public_key =
               v_replay.metadata ->> 'result_business_key'
       )
    then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    return query select
      v_replay.metadata ->> 'result_business_key',
      v_replay.metadata ->> 'result_status',
      (v_replay.metadata ->> 'result_owner_player_id')::uuid,
      (v_replay.metadata ->> 'result_capitalization')::numeric,
      (v_replay.metadata ->> 'result_valuation')::numeric,
      true;
    return;
  end if;

  if exists (
    select 1
    from public.business_entities as business_row
    where business_row.game_session_id = p_game_session_id
      and business_row.owner_player_id = p_player_id
      and business_row.status <> 'closed'
  ) then
    raise exception 'BUSINESS_ALREADY_OWNED' using errcode = 'P0001';
  end if;

  select balance_row.balance
  into v_buyer_cash
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.player_id = p_player_id
    and balance_row.account_type = 'cash'
    and balance_row.currency_code = v_currency
  for update;
  if coalesce(v_buyer_cash, 0) < p_capitalization then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  insert into public.business_entities (
    game_session_id,
    owner_player_id,
    legal_name,
    entity_type,
    industry_code,
    country_code,
    currency_code,
    status,
    capitalization
  ) values (
    p_game_session_id,
    p_player_id,
    v_legal_name,
    v_entity_type,
    v_industry_code,
    v_country_code,
    v_currency,
    'active',
    round(p_capitalization, 2)
  )
  returning * into v_business;

  if p_capitalization > 0 then
    perform public.record_player_ledger_entry(
      p_game_session_id,
      p_player_id,
      'cash',
      -round(p_capitalization, 2),
      v_currency,
      'debit',
      'business',
      'capitalization_out',
      v_business.id,
      'player',
      p_player_id,
      jsonb_build_object('business_key', v_business.public_key)
    );
    perform public.record_player_ledger_entry(
      p_game_session_id,
      p_player_id,
      public.business_account_type_v1(v_business.public_key),
      round(p_capitalization, 2),
      v_currency,
      'credit',
      'business',
      'capitalization_in',
      v_business.id,
      'player',
      p_player_id,
      jsonb_build_object('business_key', v_business.public_key)
    );
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
    'player',
    p_player_id,
    'business.create_or_acquire',
    'business',
    v_business.id,
    jsonb_build_object(
      'idempotency_key', v_idempotency_key,
      'request_fingerprint', v_request_fingerprint,
      'business_key', v_business.public_key,
      'acquisition', false,
      'capital_contribution', round(p_capitalization, 2),
      'result_business_key', v_business.public_key,
      'result_status', v_business.status,
      'result_owner_player_id', v_business.owner_player_id,
      'result_capitalization', v_business.capitalization,
      'result_valuation', 0
    )
  );

  return query select
    v_business.public_key,
    v_business.status,
    v_business.owner_player_id,
    v_business.capitalization,
    0::numeric,
    false;
end;
$function$;

revoke all on function public.create_or_acquire_player_business_v1(
  uuid, uuid, text, text, text, text, text, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.create_or_acquire_player_business_v1(
  uuid, uuid, text, text, text, text, text, numeric, text, text
) to service_role;

-- Phase 11 no longer permits the cached business_entities.valuation column to
-- authorize private-transfer economics. Existing open offers retain their
-- accept/cancel lifecycle, but new V2 pricing and offer creation stay retired
-- until a later version binds them to authoritative reporting evidence.
create or replace function public.business_position_fair_value_v2(
  p_game_session_id uuid,
  p_business_id uuid,
  p_units bigint
)
returns numeric
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  raise exception 'BUSINESS_OWNERSHIP_TRANSFER_VALUATION_AUTHORITY_UNAVAILABLE'
    using errcode = 'P0001',
      detail = 'Cached Business valuation is retired as an economic authority.';
end;
$function$;

create or replace function public.create_business_ownership_transfer_offer_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_buyer_player_identifier text,
  p_units bigint,
  p_consideration_amount numeric,
  p_idempotency_key text
)
returns table (
  offer_key text,
  status text,
  ownership_kind text,
  units bigint,
  consideration_amount numeric,
  fair_value numeric,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  raise exception 'BUSINESS_OWNERSHIP_TRANSFER_VALUATION_AUTHORITY_UNAVAILABLE'
    using errcode = 'P0001',
      detail = 'New ownership-transfer pricing requires canonical reporting evidence.';
end;
$function$;

revoke all on function public.business_position_fair_value_v2(
  uuid, uuid, bigint
) from public, anon, authenticated;
grant execute on function public.business_position_fair_value_v2(
  uuid, uuid, bigint
) to service_role;
revoke all on function public.create_business_ownership_transfer_offer_v2(
  uuid, uuid, text, text, bigint, numeric, text
) from public, anon, authenticated;
grant execute on function public.create_business_ownership_transfer_offer_v2(
  uuid, uuid, text, text, bigint, numeric, text
) to service_role;

create or replace function private.guard_retired_business_sale_v1()
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
    raise exception 'BUSINESS_SALES_AUTHORITY_RETIRED'
      using errcode = '42501',
        detail = 'New Business sale evidence is Store purchase receipt evidence.';
  end if;

  raise exception 'BUSINESS_SALES_HISTORY_IMMUTABLE'
    using errcode = '42501';
end;
$function$;

revoke all on function private.guard_retired_business_sale_v1()
  from public, anon, authenticated, service_role;

-- PostgreSQL fires same-event triggers in name order.  The aa_ prefix ensures
-- this stable retirement error precedes the historical compliance validator.
create trigger aa_retire_business_sales_v1
before insert or update or delete on public.business_sales
for each row execute function private.guard_retired_business_sale_v1();

create or replace function private.guard_retired_business_cycle_receipt_v1()
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
    raise exception 'BUSINESS_CYCLE_RECEIPT_AUTHORITY_RETIRED'
      using errcode = '42501';
  end if;

  raise exception 'BUSINESS_CYCLE_RECEIPT_IMMUTABLE'
    using errcode = '42501';
end;
$function$;

revoke all on function private.guard_retired_business_cycle_receipt_v1()
  from public, anon, authenticated, service_role;

create trigger aa_retire_business_cycle_receipts_v1
before insert or update or delete on public.business_cycle_settlement_receipts
for each row execute function private.guard_retired_business_cycle_receipt_v1();

alter table public.business_sales enable row level security;
alter table public.business_sales force row level security;
alter table public.business_cycle_settlement_receipts enable row level security;
alter table public.business_cycle_settlement_receipts force row level security;

revoke all on table public.business_sales
  from public, anon, authenticated, service_role;
grant select on table public.business_sales to service_role;
revoke all on table public.business_cycle_settlement_receipts
  from public, anon, authenticated, service_role;
grant select on table public.business_cycle_settlement_receipts to service_role;

comment on table public.business_sales is
  'Immutable pre-Phase-11 compatibility history. New Business sales are Store purchase receipts only.';
comment on table public.business_cycle_settlement_receipts is
  'Immutable retired cycle-settlement history; no new simulated sale outcomes may be authored.';

commit;
