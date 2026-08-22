-- Business V2 Phase 4C-A: deterministic recurring payroll settlement.
-- Payroll is based on authoritative active employment and the server-owned
-- Business payroll clock. Production utilization is intentionally irrelevant.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table public.business_payroll_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  public_key text not null default ('pyrx_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  payroll_run_id uuid not null,
  idempotency_key text not null,
  request_hash text not null,
  amount_paid numeric(14,2) not null default 0,
  status text not null default 'posting',
  business_ledger_entry_id uuid null references public.ledger_entries(id),
  completed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint business_payroll_recovery_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id),
  constraint business_payroll_recovery_run_scope_fk
    foreign key (game_session_id, payroll_run_id)
    references public.business_payroll_runs(game_session_id, id),
  constraint business_payroll_recovery_public_key_format
    check (public_key ~ '^pyrx_[0-9a-f]{32}$'),
  constraint business_payroll_recovery_public_key_unique unique (public_key),
  constraint business_payroll_recovery_idempotency_unique
    unique (game_session_id, business_id, idempotency_key),
  constraint business_payroll_recovery_idempotency_valid
    check (length(btrim(idempotency_key)) between 8 and 160),
  constraint business_payroll_recovery_request_hash_valid
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint business_payroll_recovery_amount_valid check (amount_paid >= 0),
  constraint business_payroll_recovery_status_valid
    check (status in ('posting', 'completed', 'no_funds', 'replayed')),
  constraint business_payroll_recovery_completion_valid
    check (
      (status = 'posting' and completed_at is null)
      or (status <> 'posting' and completed_at is not null)
    ),
  constraint business_payroll_recovery_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create trigger set_business_payroll_recovery_requests_updated_at
before update on public.business_payroll_recovery_requests
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_payroll_recovery_requests enable row level security;
alter table public.business_payroll_recovery_requests force row level security;
revoke all on table public.business_payroll_recovery_requests from public, anon, authenticated;
grant select, insert, update on table public.business_payroll_recovery_requests to service_role;

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
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_clock public.business_payroll_clocks%rowtype;
  v_run public.business_payroll_runs%rowtype;
  v_balance public.account_balances%rowtype;
  v_entry public.business_payroll_entries%rowtype;
  v_business_ledger_id uuid;
  v_employee_ledger_id uuid;
  v_period_key text;
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_request_hash text;
  v_employee_snapshot jsonb;
  v_due numeric(14,2) := 0;
  v_paid numeric(14,2) := 0;
  v_unpaid numeric(14,2) := 0;
  v_available numeric(14,2) := 0;
  v_pay numeric(14,2) := 0;
  v_remaining_due numeric(14,2) := 0;
  v_employee_count integer := 0;
begin
  if p_game_session_id is null
    or coalesce(btrim(p_business_key), '') !~ '^biz_[0-9a-f]{32}$'
    or length(v_idempotency_key) not between 8 and 160
  then
    raise exception 'BUSINESS_PAYROLL_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = lower(btrim(p_business_key))
    and business_row.status in ('active', 'restructuring', 'distressed')
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_clock := public.ensure_business_payroll_clock_v2(
    p_game_session_id,
    v_business.id
  );
  v_period_key := 'payroll:' || v_clock.current_period_number::text;
  v_request_hash := encode(
    extensions.digest(
      concat_ws(
        '|',
        p_game_session_id,
        v_business.id,
        v_business.currency_code,
        'scheduled_period'
      ),
      'sha256'
    ),
    'hex'
  );

  select payroll_row.*
  into v_run
  from public.business_payroll_runs as payroll_row
  where payroll_row.game_session_id = p_game_session_id
    and payroll_row.business_id = v_business.id
    and payroll_row.idempotency_key = v_idempotency_key
  for update;
  if found then
    if v_run.request_hash <> v_request_hash then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    return query select
      v_run.public_key,
      v_run.payroll_period_key,
      v_run.status,
      v_run.employee_count,
      v_run.gross_wages_due,
      v_run.gross_wages_paid,
      v_run.gross_wages_unpaid,
      v_run.currency_code,
      true;
    return;
  end if;

  select payroll_row.*
  into v_run
  from public.business_payroll_runs as payroll_row
  where payroll_row.game_session_id = p_game_session_id
    and payroll_row.business_id = v_business.id
    and payroll_row.payroll_period_key = v_period_key
  for update;
  if found then
    return query select
      v_run.public_key,
      v_run.payroll_period_key,
      v_run.status,
      v_run.employee_count,
      v_run.gross_wages_due,
      v_run.gross_wages_paid,
      v_run.gross_wages_unpaid,
      v_run.currency_code,
      true;
    return;
  end if;

  perform 1
  from public.business_employees as employee
  where employee.game_session_id = p_game_session_id
    and employee.business_id = v_business.id
    and employee.status = 'active'
  order by employee.public_key
  for update;

  if exists (
    select 1
    from public.business_employees as employee
    where employee.game_session_id = p_game_session_id
      and employee.business_id = v_business.id
      and employee.status = 'active'
      and (
        employee.workforce_role_definition_id is null
        or employee.labor_minutes_per_cycle is null
        or employee.labor_minutes_per_cycle <= 0
      )
  ) then
    raise exception 'BUSINESS_PAYROLL_WORKFORCE_INCOMPLETE'
      using errcode = 'P0001';
  end if;

  select
    count(*)::integer,
    coalesce(sum(employee.wage_per_cycle), 0)::numeric(14,2),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'employeeKey', employee.public_key,
          'roleDefinitionId', employee.workforce_role_definition_id,
          'wagePerCycle', employee.wage_per_cycle,
          'laborMinutesPerCycle', employee.labor_minutes_per_cycle,
          'workforceSource', employee.workforce_source_type,
          'workforceVersion', employee.workforce_version
        ) order by employee.public_key
      ),
      '[]'::jsonb
    )
  into v_employee_count, v_due, v_employee_snapshot
  from public.business_employees as employee
  where employee.game_session_id = p_game_session_id
    and employee.business_id = v_business.id
    and employee.status = 'active';

  insert into public.business_payroll_runs(
    game_session_id,
    business_id,
    payroll_period_key,
    currency_code,
    employee_count,
    gross_wages_due,
    gross_wages_paid,
    gross_wages_unpaid,
    status,
    source_type,
    idempotency_key,
    request_hash,
    metadata
  ) values (
    p_game_session_id,
    v_business.id,
    v_period_key,
    v_business.currency_code,
    v_employee_count,
    v_due,
    0,
    v_due,
    'posting',
    'scheduled_period',
    v_idempotency_key,
    v_request_hash,
    jsonb_build_object(
      'businessKey', v_business.public_key,
      'employeeSnapshot', v_employee_snapshot,
      'periodSource', 'business_payroll_clock_v2',
      'periodNumber', v_clock.current_period_number
    )
  )
  returning * into v_run;

  insert into public.business_payroll_entries(
    game_session_id,
    payroll_run_id,
    business_id,
    employee_id,
    employee_player_id,
    role_definition_id,
    wage_due,
    wage_paid,
    wage_unpaid,
    currency_code,
    status,
    metadata
  )
  select
    p_game_session_id,
    v_run.id,
    v_business.id,
    employee.id,
    employee.employee_player_id,
    employee.workforce_role_definition_id,
    employee.wage_per_cycle,
    0,
    employee.wage_per_cycle,
    v_business.currency_code,
    'pending',
    jsonb_build_object(
      'employeeKey', employee.public_key,
      'workforceSource', employee.workforce_source_type,
      'workforceVersion', employee.workforce_version
    )
  from public.business_employees as employee
  where employee.game_session_id = p_game_session_id
    and employee.business_id = v_business.id
    and employee.status = 'active'
  order by employee.public_key;

  perform public.ensure_business_bank_account_v2(
    p_game_session_id,
    v_business.id
  );

  select balance_row.*
  into v_balance
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.business_id = v_business.id
    and balance_row.currency_code = v_business.currency_code
  for update;

  v_available := least(greatest(coalesce(v_balance.balance, 0), 0), v_due);
  v_remaining_due := v_due;

  for v_entry in
    select entry_row.*
    from public.business_payroll_entries as entry_row
    join public.business_employees as employee
      on employee.game_session_id = entry_row.game_session_id
     and employee.id = entry_row.employee_id
    where entry_row.game_session_id = p_game_session_id
      and entry_row.payroll_run_id = v_run.id
    order by employee.public_key
    for update of entry_row
  loop
    if v_remaining_due <= 0 or v_available <= 0 then
      v_pay := 0;
    elsif v_entry.wage_unpaid = v_remaining_due then
      v_pay := least(v_entry.wage_unpaid, v_available);
    else
      v_pay := least(
        v_entry.wage_unpaid,
        v_available,
        round(v_available * v_entry.wage_unpaid / v_remaining_due, 2)
      );
    end if;

    v_available := round(v_available - v_pay, 2);
    v_remaining_due := round(v_remaining_due - v_entry.wage_unpaid, 2);
    v_paid := round(v_paid + v_pay, 2);

    if v_pay > 0 and v_entry.employee_player_id is not null then
      select ledger_entry_id
      into v_employee_ledger_id
      from public.record_player_ledger_entry(
        p_game_session_id,
        v_entry.employee_player_id,
        'checking',
        v_pay,
        v_business.currency_code,
        'credit',
        'business',
        'payroll_employee_credit',
        v_entry.id,
        'system',
        null,
        jsonb_build_object(
          'business_key', v_business.public_key,
          'payroll_run_key', v_run.public_key,
          'payroll_entry_key', v_entry.public_key,
          'payroll_period_key', v_period_key
        )
      );
    else
      v_employee_ledger_id := null;
    end if;

    update public.business_payroll_entries
    set wage_paid = v_pay,
        wage_unpaid = wage_due - v_pay,
        status = case
          when v_pay = wage_due then 'paid'
          when v_pay > 0 then 'partially_paid'
          else 'unpaid'
        end,
        employee_ledger_entry_id = v_employee_ledger_id,
        posted_at = statement_timestamp(),
        updated_at = statement_timestamp()
    where id = v_entry.id;
  end loop;

  v_unpaid := round(v_due - v_paid, 2);

  if v_paid > 0 then
    select ledger_entry_id
    into v_business_ledger_id
    from public.record_business_ledger_entry_v2(
      p_game_session_id,
      v_business.id,
      -v_paid,
      v_business.currency_code,
      'debit',
      'business',
      'payroll_period_settlement',
      v_run.id,
      'system',
      null,
      jsonb_build_object(
        'business_key', v_business.public_key,
        'payroll_run_key', v_run.public_key,
        'payroll_period_key', v_period_key,
        'gross_wages_due', v_due,
        'gross_wages_paid', v_paid,
        'gross_wages_unpaid', v_unpaid,
        'employee_count', v_employee_count
      )
    );

    update public.business_payroll_entries
    set business_ledger_entry_id = v_business_ledger_id,
        updated_at = statement_timestamp()
    where game_session_id = p_game_session_id
      and payroll_run_id = v_run.id;
  end if;

  update public.business_payroll_runs
  set gross_wages_paid = v_paid,
      gross_wages_unpaid = v_unpaid,
      status = case
        when v_unpaid = 0 then 'completed'
        when v_paid > 0 then 'partially_paid'
        else 'unpaid'
      end,
      business_ledger_entry_id = v_business_ledger_id,
      failure_code = case
        when v_unpaid > 0 then 'INSUFFICIENT_BUSINESS_FUNDS'
        else null
      end,
      completed_at = statement_timestamp(),
      version = version + 1,
      updated_at = statement_timestamp()
  where id = v_run.id
  returning * into v_run;

  update public.business_payroll_clocks
  set current_period_number = current_period_number + 1,
      period_started_at = statement_timestamp(),
      last_settled_at = statement_timestamp(),
      version = version + 1,
      updated_at = statement_timestamp()
  where id = v_clock.id
    and current_period_number = v_clock.current_period_number;
  if not found then
    raise exception 'BUSINESS_PAYROLL_CLOCK_CONFLICT' using errcode = 'P0001';
  end if;

  insert into public.business_activity_events(
    game_session_id,
    business_id,
    actor_type,
    actor_player_id,
    event_type,
    source_id,
    reason_code,
    metadata
  ) values (
    p_game_session_id,
    v_business.id,
    'system',
    null,
    'business.payroll.settled',
    v_run.id,
    'scheduled_period',
    jsonb_build_object(
      'businessKey', v_business.public_key,
      'payrollRunKey', v_run.public_key,
      'payrollPeriodKey', v_run.payroll_period_key,
      'status', v_run.status,
      'employeeCount', v_run.employee_count,
      'grossWagesDue', v_run.gross_wages_due,
      'grossWagesPaid', v_run.gross_wages_paid,
      'grossWagesUnpaid', v_run.gross_wages_unpaid,
      'currencyCode', v_run.currency_code
    )
  );

  return query select
    v_run.public_key,
    v_run.payroll_period_key,
    v_run.status,
    v_run.employee_count,
    v_run.gross_wages_due,
    v_run.gross_wages_paid,
    v_run.gross_wages_unpaid,
    v_run.currency_code,
    false;
end
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
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_run public.business_payroll_runs%rowtype;
  v_request public.business_payroll_recovery_requests%rowtype;
  v_balance public.account_balances%rowtype;
  v_entry public.business_payroll_entries%rowtype;
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_request_hash text;
  v_available numeric(14,2) := 0;
  v_remaining_due numeric(14,2) := 0;
  v_pay numeric(14,2) := 0;
  v_paid numeric(14,2) := 0;
  v_employee_ledger_id uuid;
  v_business_ledger_id uuid;
begin
  if p_game_session_id is null
    or coalesce(btrim(p_business_key), '') !~ '^biz_[0-9a-f]{32}$'
    or coalesce(btrim(p_payroll_run_key), '') !~ '^pyr_[0-9a-f]{32}$'
    or length(v_idempotency_key) not between 8 and 160
  then
    raise exception 'BUSINESS_PAYROLL_RECOVERY_REQUEST_INVALID'
      using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = lower(btrim(p_business_key))
    and business_row.status <> 'closed'
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select payroll_row.*
  into v_run
  from public.business_payroll_runs as payroll_row
  where payroll_row.game_session_id = p_game_session_id
    and payroll_row.business_id = v_business.id
    and payroll_row.public_key = lower(btrim(p_payroll_run_key))
  for update;
  if not found then
    raise exception 'BUSINESS_PAYROLL_RUN_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_request_hash := encode(
    extensions.digest(
      concat_ws('|', p_game_session_id, v_business.id, v_run.id, 'recovery'),
      'sha256'
    ),
    'hex'
  );

  select request_row.*
  into v_request
  from public.business_payroll_recovery_requests as request_row
  where request_row.game_session_id = p_game_session_id
    and request_row.business_id = v_business.id
    and request_row.idempotency_key = v_idempotency_key
  for update;
  if found then
    if v_request.request_hash <> v_request_hash then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    return query select
      v_request.public_key,
      v_run.public_key,
      v_run.status,
      v_request.amount_paid,
      v_run.gross_wages_paid,
      v_run.gross_wages_unpaid,
      v_run.currency_code,
      true;
    return;
  end if;

  insert into public.business_payroll_recovery_requests(
    game_session_id,
    business_id,
    payroll_run_id,
    idempotency_key,
    request_hash,
    metadata
  ) values (
    p_game_session_id,
    v_business.id,
    v_run.id,
    v_idempotency_key,
    v_request_hash,
    jsonb_build_object(
      'businessKey', v_business.public_key,
      'payrollRunKey', v_run.public_key,
      'payrollPeriodKey', v_run.payroll_period_key
    )
  ) returning * into v_request;

  if v_run.gross_wages_unpaid <= 0 then
    update public.business_payroll_recovery_requests
    set status = 'completed',
        amount_paid = 0,
        completed_at = statement_timestamp(),
        updated_at = statement_timestamp()
    where id = v_request.id
    returning * into v_request;

    return query select
      v_request.public_key,
      v_run.public_key,
      v_run.status,
      0::numeric,
      v_run.gross_wages_paid,
      v_run.gross_wages_unpaid,
      v_run.currency_code,
      false;
    return;
  end if;

  perform public.ensure_business_bank_account_v2(
    p_game_session_id,
    v_business.id
  );

  select balance_row.*
  into v_balance
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.business_id = v_business.id
    and balance_row.currency_code = v_business.currency_code
  for update;

  v_available := least(
    greatest(coalesce(v_balance.balance, 0), 0),
    v_run.gross_wages_unpaid
  );
  v_remaining_due := v_run.gross_wages_unpaid;

  for v_entry in
    select entry_row.*
    from public.business_payroll_entries as entry_row
    join public.business_employees as employee
      on employee.game_session_id = entry_row.game_session_id
     and employee.id = entry_row.employee_id
    where entry_row.game_session_id = p_game_session_id
      and entry_row.payroll_run_id = v_run.id
      and entry_row.wage_unpaid > 0
    order by employee.public_key
    for update of entry_row
  loop
    if v_remaining_due <= 0 or v_available <= 0 then
      v_pay := 0;
    elsif v_entry.wage_unpaid = v_remaining_due then
      v_pay := least(v_entry.wage_unpaid, v_available);
    else
      v_pay := least(
        v_entry.wage_unpaid,
        v_available,
        round(v_available * v_entry.wage_unpaid / v_remaining_due, 2)
      );
    end if;

    v_available := round(v_available - v_pay, 2);
    v_remaining_due := round(v_remaining_due - v_entry.wage_unpaid, 2);
    v_paid := round(v_paid + v_pay, 2);

    if v_pay > 0 and v_entry.employee_player_id is not null then
      select ledger_entry_id
      into v_employee_ledger_id
      from public.record_player_ledger_entry(
        p_game_session_id,
        v_entry.employee_player_id,
        'checking',
        v_pay,
        v_business.currency_code,
        'credit',
        'business',
        'payroll_recovery_credit',
        v_request.id,
        'system',
        null,
        jsonb_build_object(
          'business_key', v_business.public_key,
          'payroll_run_key', v_run.public_key,
          'payroll_entry_key', v_entry.public_key,
          'payroll_recovery_request_key', v_request.public_key
        )
      );
    else
      v_employee_ledger_id := null;
    end if;

    update public.business_payroll_entries
    set wage_paid = wage_paid + v_pay,
        wage_unpaid = wage_unpaid - v_pay,
        status = case
          when wage_unpaid - v_pay = 0 then 'paid'
          when wage_paid + v_pay > 0 then 'partially_paid'
          else 'unpaid'
        end,
        employee_ledger_entry_id = coalesce(
          employee_ledger_entry_id,
          v_employee_ledger_id
        ),
        metadata = metadata || jsonb_build_object(
          'latestRecoveryRequestKey', v_request.public_key,
          'latestRecoveryAmount', v_pay,
          'latestRecoveryLedgerEntryId', v_employee_ledger_id
        ),
        posted_at = statement_timestamp(),
        updated_at = statement_timestamp()
    where id = v_entry.id;
  end loop;

  if v_paid > 0 then
    select ledger_entry_id
    into v_business_ledger_id
    from public.record_business_ledger_entry_v2(
      p_game_session_id,
      v_business.id,
      -v_paid,
      v_business.currency_code,
      'debit',
      'business',
      'payroll_recovery_settlement',
      v_request.id,
      'system',
      null,
      jsonb_build_object(
        'business_key', v_business.public_key,
        'payroll_run_key', v_run.public_key,
        'payroll_recovery_request_key', v_request.public_key,
        'recovery_amount_paid', v_paid
      )
    );
  end if;

  update public.business_payroll_runs
  set gross_wages_paid = gross_wages_paid + v_paid,
      gross_wages_unpaid = gross_wages_unpaid - v_paid,
      status = case
        when gross_wages_unpaid - v_paid = 0 then 'completed'
        when gross_wages_paid + v_paid > 0 then 'partially_paid'
        else 'unpaid'
      end,
      failure_code = case
        when gross_wages_unpaid - v_paid > 0 then 'INSUFFICIENT_BUSINESS_FUNDS'
        else null
      end,
      metadata = metadata || jsonb_build_object(
        'latestRecoveryRequestKey', v_request.public_key,
        'latestRecoveryAmount', v_paid
      ),
      version = version + 1,
      updated_at = statement_timestamp()
  where id = v_run.id
  returning * into v_run;

  update public.business_payroll_recovery_requests
  set amount_paid = v_paid,
      status = case when v_paid > 0 then 'completed' else 'no_funds' end,
      business_ledger_entry_id = v_business_ledger_id,
      completed_at = statement_timestamp(),
      updated_at = statement_timestamp()
  where id = v_request.id
  returning * into v_request;

  insert into public.business_activity_events(
    game_session_id,
    business_id,
    actor_type,
    actor_player_id,
    event_type,
    source_id,
    reason_code,
    metadata
  ) values (
    p_game_session_id,
    v_business.id,
    'system',
    null,
    'business.payroll.recovered',
    v_request.id,
    'admin_recovery',
    jsonb_build_object(
      'businessKey', v_business.public_key,
      'payrollRunKey', v_run.public_key,
      'payrollRecoveryRequestKey', v_request.public_key,
      'amountPaid', v_request.amount_paid,
      'grossWagesPaid', v_run.gross_wages_paid,
      'grossWagesUnpaid', v_run.gross_wages_unpaid,
      'currencyCode', v_run.currency_code
    )
  );

  return query select
    v_request.public_key,
    v_run.public_key,
    v_run.status,
    v_request.amount_paid,
    v_run.gross_wages_paid,
    v_run.gross_wages_unpaid,
    v_run.currency_code,
    false;
end
$function$;

revoke all on function public.recover_business_payroll_run_v2(
  uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.recover_business_payroll_run_v2(
  uuid, text, text, text
) to service_role;

commit;
