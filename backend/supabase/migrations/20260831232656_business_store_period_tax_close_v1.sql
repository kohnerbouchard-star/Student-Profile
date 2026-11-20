-- Business V2 Phase 11: Store-derived revenue/COGS, guarded payroll, and tax.
--
-- A close owns one due operating-period claim.  It takes the repository-wide
-- Business -> payroll clock -> claim -> game lock order, then the Banking game
-- advisory lock.  Store purchases that post before that advisory boundary are
-- visible to the close; later purchases remain unassigned for a later period.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

-- Fast-default 0 preserves all immutable pre-cutover receipts without firing
-- their update guard.  Changing the default immediately afterward makes every
-- newly inserted receipt Phase-11 authoritative.
alter table public.store_offer_purchase_receipts
  add column business_sales_authority_version smallint not null default 0,
  add column business_sales_authority_committed_at timestamptz null default null;

alter table public.store_offer_purchase_receipts
  alter column business_sales_authority_version set default 1,
  alter column business_sales_authority_committed_at
    set default clock_timestamp(),
  add constraint store_offer_purchase_receipts_sales_authority_check
    check (
      (
        business_sales_authority_version = 0
        and business_sales_authority_committed_at is null
      )
      or (
        business_sales_authority_version = 1
        and business_sales_authority_committed_at is not null
      )
    );

create index store_offer_purchase_receipts_phase11_unclosed_idx
  on public.store_offer_purchase_receipts(
    game_session_id,
    business_id,
    business_sales_authority_committed_at,
    id
  )
  where business_sales_authority_version = 1;

create table public.business_gross_receipts_tax_assessments (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'bgta_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  operating_period_claim_id uuid not null,
  period_policy_id uuid not null,
  period_number bigint not null,
  payroll_period_key text not null,
  currency_code text not null,
  currency_minor_unit integer not null,
  store_receipt_count integer not null,
  gross_receipts numeric(38,18) not null,
  cost_of_goods_sold numeric(38,18) not null,
  gross_receipts_tax_rate numeric(20,18) not null,
  tax_assessed numeric(38,18) not null,
  tax_paid numeric(38,18) not null,
  tax_unpaid numeric(38,18) not null,
  status text not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint business_gross_receipts_tax_assessments_scope_id_unique
    unique (game_session_id, id),
  constraint business_gross_receipts_tax_assessments_period_currency_unique
    unique (game_session_id, business_id, period_number, currency_code),
  constraint business_gross_receipts_tax_assessments_claim_currency_unique
    unique (operating_period_claim_id, currency_code),
  constraint business_gross_receipts_tax_assessments_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete restrict,
  constraint business_gross_receipts_tax_assessments_claim_scope_fk
    foreign key (game_session_id, operating_period_claim_id)
    references public.business_operating_period_claims(game_session_id, id)
    on delete restrict,
  constraint business_gross_receipts_tax_assessments_policy_scope_fk
    foreign key (game_session_id, period_policy_id)
    references public.business_operating_period_policies(game_session_id, id)
    on delete restrict,
  constraint business_gross_receipts_tax_assessments_public_key_check
    check (public_key ~ '^bgta_[0-9a-f]{32}$'),
  constraint business_gross_receipts_tax_assessments_period_check
    check (
      period_number between 1 and 9223372036854775806
      and payroll_period_key = 'payroll:' || period_number::text
    ),
  constraint business_gross_receipts_tax_assessments_currency_check
    check (
      currency_code ~ '^[A-Z0-9_]{3,16}$'
      and currency_minor_unit between 0 and 18
    ),
  constraint business_gross_receipts_tax_assessments_receipts_check
    check (store_receipt_count > 0),
  constraint business_gross_receipts_tax_assessments_amounts_check
    check (
      gross_receipts > 0
      and cost_of_goods_sold >= 0
      and gross_receipts_tax_rate between 0 and 1
      and tax_assessed >= 0
      and tax_paid >= 0
      and tax_unpaid >= 0
      and tax_assessed = tax_paid + tax_unpaid
      and gross_receipts = round(gross_receipts, currency_minor_unit)
      and tax_assessed = round(tax_assessed, currency_minor_unit)
      and tax_paid = round(tax_paid, currency_minor_unit)
      and tax_unpaid = round(tax_unpaid, currency_minor_unit)
    ),
  constraint business_gross_receipts_tax_assessments_status_check
    check (
      (status = 'paid' and tax_unpaid = 0)
      or (status = 'partially_paid' and tax_paid > 0 and tax_unpaid > 0)
      or (status = 'unpaid' and tax_paid = 0 and tax_unpaid > 0)
      or (status = 'none_due' and tax_assessed = 0)
    )
);

create index business_gross_receipts_tax_assessments_liability_idx
  on public.business_gross_receipts_tax_assessments(
    game_session_id, business_id, status, period_number
  ) where tax_unpaid > 0;

create index business_gross_receipts_tax_assessments_claim_idx
  on public.business_gross_receipts_tax_assessments(
    game_session_id, operating_period_claim_id
  );

create index business_gross_receipts_tax_assessments_policy_idx
  on public.business_gross_receipts_tax_assessments(
    game_session_id, period_policy_id
  );

create table public.business_operating_period_store_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'bops_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  operating_period_claim_id uuid not null,
  tax_assessment_id uuid not null,
  store_purchase_receipt_id uuid not null,
  period_number bigint not null,
  payroll_period_key text not null,
  currency_code text not null,
  gross_revenue numeric(38,18) not null,
  cost_of_goods_sold numeric(38,18) not null,
  store_receipt_completed_at timestamptz not null,
  authority_committed_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint business_operating_period_store_receipts_scope_id_unique
    unique (game_session_id, id),
  constraint business_operating_period_store_receipts_purchase_unique
    unique (game_session_id, store_purchase_receipt_id),
  constraint business_operating_period_store_receipts_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete restrict,
  constraint business_operating_period_store_receipts_claim_scope_fk
    foreign key (game_session_id, operating_period_claim_id)
    references public.business_operating_period_claims(game_session_id, id)
    on delete restrict,
  constraint business_operating_period_store_receipts_assessment_scope_fk
    foreign key (game_session_id, tax_assessment_id)
    references public.business_gross_receipts_tax_assessments(game_session_id, id)
    on delete restrict,
  constraint business_operating_period_store_receipts_purchase_scope_fk
    foreign key (game_session_id, store_purchase_receipt_id)
    references public.store_offer_purchase_receipts(game_session_id, id)
    on delete restrict,
  constraint business_operating_period_store_receipts_public_key_check
    check (public_key ~ '^bops_[0-9a-f]{32}$'),
  constraint business_operating_period_store_receipts_period_check
    check (
      period_number between 1 and 9223372036854775806
      and payroll_period_key = 'payroll:' || period_number::text
    ),
  constraint business_operating_period_store_receipts_currency_check
    check (currency_code ~ '^[A-Z0-9_]{3,16}$'),
  constraint business_operating_period_store_receipts_amounts_check
    check (gross_revenue > 0 and cost_of_goods_sold >= 0)
);

create index business_operating_period_store_receipts_period_idx
  on public.business_operating_period_store_receipts(
    game_session_id, business_id, period_number, authority_committed_at, id
  );

create index business_operating_period_store_receipts_claim_idx
  on public.business_operating_period_store_receipts(
    game_session_id, operating_period_claim_id
  );

create index business_operating_period_store_receipts_assessment_idx
  on public.business_operating_period_store_receipts(
    game_session_id, tax_assessment_id
  );

create table public.business_gross_receipts_tax_payments (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'bgtp_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  tax_assessment_id uuid not null,
  bank_transaction_id uuid not null,
  business_ledger_entry_id uuid not null,
  tax_authority_ledger_entry_id uuid not null,
  currency_code text not null,
  amount_paid numeric(38,18) not null,
  paid_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint business_gross_receipts_tax_payments_scope_id_unique
    unique (game_session_id, id),
  constraint business_gross_receipts_tax_payments_assessment_unique
    unique (game_session_id, tax_assessment_id),
  constraint business_gross_receipts_tax_payments_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete restrict,
  constraint business_gross_receipts_tax_payments_assessment_scope_fk
    foreign key (game_session_id, tax_assessment_id)
    references public.business_gross_receipts_tax_assessments(game_session_id, id)
    on delete restrict,
  constraint business_gross_receipts_tax_payments_transaction_scope_fk
    foreign key (game_session_id, bank_transaction_id)
    references public.bank_transactions(game_session_id, id) on delete restrict,
  constraint business_gross_receipts_tax_payments_business_ledger_scope_fk
    foreign key (game_session_id, business_ledger_entry_id)
    references public.ledger_entries(game_session_id, id) on delete restrict,
  constraint business_gross_receipts_tax_payments_authority_ledger_scope_fk
    foreign key (game_session_id, tax_authority_ledger_entry_id)
    references public.ledger_entries(game_session_id, id) on delete restrict,
  constraint business_gross_receipts_tax_payments_public_key_check
    check (public_key ~ '^bgtp_[0-9a-f]{32}$'),
  constraint business_gross_receipts_tax_payments_currency_check
    check (currency_code ~ '^[A-Z0-9_]{3,16}$'),
  constraint business_gross_receipts_tax_payments_amount_check
    check (amount_paid > 0)
);

create table public.business_operating_period_close_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'bopr_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  operating_period_claim_id uuid not null,
  period_policy_id uuid not null,
  payroll_run_id uuid not null,
  period_number bigint not null,
  payroll_period_key text not null,
  period_started_at timestamptz not null,
  due_at timestamptz not null,
  next_due_at timestamptz not null,
  idempotency_key text not null,
  request_hash text not null,
  payroll_status text not null,
  store_receipt_count integer not null,
  gross_wages_due numeric(38,18) not null,
  gross_wages_paid numeric(38,18) not null,
  gross_wages_unpaid numeric(38,18) not null,
  reporting_currency_code text not null,
  tax_assessed_reporting_currency numeric(38,18) not null,
  tax_paid_reporting_currency numeric(38,18) not null,
  tax_unpaid_reporting_currency numeric(38,18) not null,
  gross_receipts_by_currency jsonb not null,
  tax_by_currency jsonb not null,
  status text not null default 'completed',
  completed_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),

  constraint business_operating_period_close_receipts_scope_id_unique
    unique (game_session_id, id),
  constraint business_operating_period_close_receipts_claim_unique
    unique (game_session_id, operating_period_claim_id),
  constraint business_operating_period_close_receipts_period_unique
    unique (game_session_id, business_id, period_number),
  constraint business_operating_period_close_receipts_idempotency_unique
    unique (game_session_id, business_id, idempotency_key),
  constraint business_operating_period_close_receipts_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete restrict,
  constraint business_operating_period_close_receipts_claim_scope_fk
    foreign key (game_session_id, operating_period_claim_id)
    references public.business_operating_period_claims(game_session_id, id)
    on delete restrict,
  constraint business_operating_period_close_receipts_policy_scope_fk
    foreign key (game_session_id, period_policy_id)
    references public.business_operating_period_policies(game_session_id, id)
    on delete restrict,
  constraint business_operating_period_close_receipts_payroll_scope_fk
    foreign key (game_session_id, payroll_run_id)
    references public.business_payroll_runs(game_session_id, id) on delete restrict,
  constraint business_operating_period_close_receipts_public_key_check
    check (public_key ~ '^bopr_[0-9a-f]{32}$'),
  constraint business_operating_period_close_receipts_period_check
    check (
      period_number between 1 and 9223372036854775806
      and payroll_period_key = 'payroll:' || period_number::text
      and due_at > period_started_at
      and next_due_at > due_at
    ),
  constraint business_operating_period_close_receipts_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 240),
  constraint business_operating_period_close_receipts_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint business_operating_period_close_receipts_payroll_status_check
    check (payroll_status in ('completed', 'partially_paid', 'unpaid')),
  constraint business_operating_period_close_receipts_count_check
    check (store_receipt_count >= 0),
  constraint business_operating_period_close_receipts_wages_check
    check (
      gross_wages_due >= 0
      and gross_wages_paid >= 0
      and gross_wages_unpaid >= 0
      and gross_wages_due = gross_wages_paid + gross_wages_unpaid
    ),
  constraint business_operating_period_close_receipts_tax_check
    check (
      tax_assessed_reporting_currency >= 0
      and tax_paid_reporting_currency >= 0
      and tax_unpaid_reporting_currency >= 0
      and tax_assessed_reporting_currency
        = tax_paid_reporting_currency + tax_unpaid_reporting_currency
    ),
  constraint business_operating_period_close_receipts_currency_check
    check (reporting_currency_code ~ '^[A-Z0-9_]{3,16}$'),
  constraint business_operating_period_close_receipts_json_check
    check (
      jsonb_typeof(gross_receipts_by_currency) = 'array'
      and jsonb_typeof(tax_by_currency) = 'array'
      and jsonb_typeof(metadata) = 'object'
    ),
  constraint business_operating_period_close_receipts_status_check
    check (status = 'completed')
);

create index business_gross_receipts_tax_payments_business_idx
  on public.business_gross_receipts_tax_payments(game_session_id, business_id);

create index business_gross_receipts_tax_payments_transaction_idx
  on public.business_gross_receipts_tax_payments(
    game_session_id, bank_transaction_id
  );

create index business_gross_receipts_tax_payments_business_ledger_idx
  on public.business_gross_receipts_tax_payments(
    game_session_id, business_ledger_entry_id
  );

create index business_gross_receipts_tax_payments_authority_ledger_idx
  on public.business_gross_receipts_tax_payments(
    game_session_id, tax_authority_ledger_entry_id
  );

create index business_operating_period_close_receipts_business_completed_idx
  on public.business_operating_period_close_receipts(
    game_session_id, business_id, completed_at desc, id desc
  );

create index business_operating_period_close_receipts_policy_idx
  on public.business_operating_period_close_receipts(
    game_session_id, period_policy_id
  );

create index business_operating_period_close_receipts_payroll_idx
  on public.business_operating_period_close_receipts(
    game_session_id, payroll_run_id
  );

create or replace function private.guard_business_period_evidence_v1()
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

  raise exception 'BUSINESS_OPERATING_PERIOD_EVIDENCE_IMMUTABLE'
    using errcode = '42501';
end;
$function$;

revoke all on function private.guard_business_period_evidence_v1()
  from public, anon, authenticated, service_role;

create trigger guard_business_gross_receipts_tax_assessment_v1
before update or delete on public.business_gross_receipts_tax_assessments
for each row execute function private.guard_business_period_evidence_v1();

create trigger guard_business_operating_period_store_receipt_v1
before update or delete on public.business_operating_period_store_receipts
for each row execute function private.guard_business_period_evidence_v1();

create trigger guard_business_gross_receipts_tax_payment_v1
before update or delete on public.business_gross_receipts_tax_payments
for each row execute function private.guard_business_period_evidence_v1();

create trigger guard_business_operating_period_close_receipt_v1
before update or delete on public.business_operating_period_close_receipts
for each row execute function private.guard_business_period_evidence_v1();

alter table public.business_gross_receipts_tax_assessments
  enable row level security;
alter table public.business_gross_receipts_tax_assessments
  force row level security;
alter table public.business_operating_period_store_receipts
  enable row level security;
alter table public.business_operating_period_store_receipts
  force row level security;
alter table public.business_gross_receipts_tax_payments
  enable row level security;
alter table public.business_gross_receipts_tax_payments
  force row level security;
alter table public.business_operating_period_close_receipts
  enable row level security;
alter table public.business_operating_period_close_receipts
  force row level security;

revoke all on table public.business_gross_receipts_tax_assessments
  from public, anon, authenticated, service_role;
revoke all on table public.business_operating_period_store_receipts
  from public, anon, authenticated, service_role;
revoke all on table public.business_gross_receipts_tax_payments
  from public, anon, authenticated, service_role;
revoke all on table public.business_operating_period_close_receipts
  from public, anon, authenticated, service_role;
grant select on table public.business_gross_receipts_tax_assessments
  to service_role;
grant select on table public.business_operating_period_store_receipts
  to service_role;
grant select on table public.business_gross_receipts_tax_payments
  to service_role;
grant select on table public.business_operating_period_close_receipts
  to service_role;

create or replace function private.settle_claimed_business_payroll_v1(
  p_game_session_id uuid,
  p_business_id uuid,
  p_operating_period_claim_id uuid,
  p_payroll_period_key text
)
returns table (
  payroll_run_id uuid,
  payroll_run_key text,
  payroll_status text,
  employee_count integer,
  gross_wages_due numeric,
  gross_wages_paid numeric,
  gross_wages_unpaid numeric,
  currency_code text
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_claim public.business_operating_period_claims%rowtype;
  v_run public.business_payroll_runs%rowtype;
  v_entry record;
  v_post record;
  v_currency_minor integer;
  v_employee_count integer := 0;
  v_due numeric(38,18) := 0;
  v_paid numeric(38,18) := 0;
  v_unpaid numeric(38,18) := 0;
  v_available numeric(38,18) := 0;
  v_remaining_due numeric(38,18) := 0;
  v_pay numeric(38,18) := 0;
  v_business_account_id uuid;
  v_recipient_account_id uuid;
  v_recipient_account_status text;
  v_bank_transaction_id uuid;
  v_business_ledger_id uuid;
  v_employee_ledger_id uuid;
  v_first_business_ledger_id uuid;
  v_employee_snapshot jsonb := '[]'::jsonb;
  v_bank_transaction_keys jsonb := '[]'::jsonb;
  v_run_idempotency text;
  v_run_hash text;
  v_post_hash text;
  v_now timestamptz := clock_timestamp();
  v_entry_finalized_at timestamptz;
  v_entry_recipient_unavailable boolean := false;
  v_entry_funds_shortfall boolean := false;
  v_had_recipient_unavailable boolean := false;
  v_had_funds_shortfall boolean := false;
begin
  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = p_business_id
    and business_row.status in ('active', 'restructuring', 'distressed')
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select claim_row.*
  into v_claim
  from public.business_operating_period_claims as claim_row
  where claim_row.game_session_id = p_game_session_id
    and claim_row.id = p_operating_period_claim_id
    and claim_row.business_id = p_business_id
    and claim_row.payroll_period_key = p_payroll_period_key
  for share;
  if not found then
    raise exception 'BUSINESS_OPERATING_PERIOD_CLAIM_STALE'
      using errcode = 'P0001';
  end if;

  select currency_row.decimal_places
  into v_currency_minor
  from public.currencies as currency_row
  where currency_row.code = v_business.currency_code
    and currency_row.status = 'active';
  if not found then
    raise exception 'BUSINESS_PAYROLL_CURRENCY_INVALID'
      using errcode = 'P0001';
  end if;

  perform employee_row.id
  from public.business_employees as employee_row
  where employee_row.game_session_id = p_game_session_id
    and employee_row.business_id = p_business_id
    and employee_row.status = 'active'
  order by employee_row.public_key
  for update;

  perform player_row.id
  from public.players as player_row
  join public.business_employees as employee_row
    on employee_row.game_session_id = player_row.game_session_id
   and employee_row.employee_player_id = player_row.id
  where employee_row.game_session_id = p_game_session_id
    and employee_row.business_id = p_business_id
    and employee_row.status = 'active'
  order by player_row.id
  for share of player_row;

  if exists (
    select 1
    from public.business_employees as employee_row
    where employee_row.game_session_id = p_game_session_id
      and employee_row.business_id = p_business_id
      and employee_row.status = 'active'
      and (
        employee_row.workforce_role_definition_id is null
        or employee_row.labor_minutes_per_cycle is null
        or employee_row.labor_minutes_per_cycle <= 0
      )
  ) then
    raise exception 'BUSINESS_PAYROLL_WORKFORCE_INCOMPLETE'
      using errcode = 'P0001';
  end if;

  select
    count(*)::integer,
    coalesce(
      sum(round(employee_row.wage_per_cycle, v_currency_minor)), 0
    )::numeric(38,18),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'employeeKey', employee_row.public_key,
          'roleDefinitionId', employee_row.workforce_role_definition_id,
          'wageDue', round(employee_row.wage_per_cycle, v_currency_minor),
          'laborMinutesPerCycle', employee_row.labor_minutes_per_cycle,
          'workforceSource', employee_row.workforce_source_type,
          'workforceVersion', employee_row.workforce_version
        ) order by employee_row.public_key
      ),
      '[]'::jsonb
    )
  into v_employee_count, v_due, v_employee_snapshot
  from public.business_employees as employee_row
  where employee_row.game_session_id = p_game_session_id
    and employee_row.business_id = p_business_id
    and employee_row.status = 'active';

  v_run_idempotency := 'phase11-payroll:' || v_claim.public_key;
  v_run_hash := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|',
          'business-operating-period-payroll-v1',
          p_game_session_id,
          p_business_id,
          v_claim.id,
          p_payroll_period_key,
          v_business.currency_code,
          v_due,
          v_employee_snapshot::text
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  select run_row.*
  into v_run
  from public.business_payroll_runs as run_row
  where run_row.game_session_id = p_game_session_id
    and run_row.business_id = p_business_id
    and run_row.payroll_period_key = p_payroll_period_key
  for update;
  if found then
    if v_run.operating_period_claim_id <> v_claim.id
       or v_run.request_hash <> v_run_hash
    then
      raise exception 'BUSINESS_PAYROLL_PERIOD_CONFLICT'
        using errcode = 'P0001';
    end if;

    return query select
      v_run.id,
      v_run.public_key,
      v_run.status,
      v_run.employee_count,
      v_run.gross_wages_due,
      v_run.gross_wages_paid,
      v_run.gross_wages_unpaid,
      v_run.currency_code;
    return;
  end if;

  insert into public.business_payroll_runs (
    game_session_id,
    business_id,
    payroll_period_key,
    currency_code,
    currency_minor_unit,
    employee_count,
    gross_wages_due,
    gross_wages_paid,
    gross_wages_unpaid,
    status,
    source_type,
    idempotency_key,
    request_hash,
    operating_period_claim_id,
    metadata
  ) values (
    p_game_session_id,
    p_business_id,
    p_payroll_period_key,
    v_business.currency_code,
    v_currency_minor,
    v_employee_count,
    v_due,
    0,
    v_due,
    'posting',
    'scheduled_period',
    v_run_idempotency,
    v_run_hash,
    v_claim.id,
    jsonb_build_object(
      'authority', 'business-operating-period-close-v1',
      'claimKey', v_claim.public_key,
      'businessKey', v_business.public_key,
      'employeeSnapshot', v_employee_snapshot,
      'periodNumber', v_claim.period_number
    )
  )
  returning * into v_run;

  insert into public.business_payroll_entries (
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
    currency_minor_unit,
    status,
    metadata
  )
  select
    p_game_session_id,
    v_run.id,
    p_business_id,
    employee_row.id,
    employee_row.employee_player_id,
    employee_row.workforce_role_definition_id,
    round(employee_row.wage_per_cycle, v_currency_minor),
    0,
    round(employee_row.wage_per_cycle, v_currency_minor),
    v_business.currency_code,
    v_currency_minor,
    'pending',
    jsonb_build_object(
      'employeeKey', employee_row.public_key,
      'claimKey', v_claim.public_key,
      'workforceSource', employee_row.workforce_source_type,
      'workforceVersion', employee_row.workforce_version
    )
  from public.business_employees as employee_row
  where employee_row.game_session_id = p_game_session_id
    and employee_row.business_id = p_business_id
    and employee_row.status = 'active'
  order by employee_row.public_key;

  v_business_account_id := private.ensure_active_business_checking_account_v1(
    p_game_session_id,
    p_business_id,
    v_business.currency_code
  );
  perform private.ensure_bank_account_projection_v1(
    p_game_session_id, v_business_account_id
  );

  select round(
    greatest(
      balance_row.balance
        - private.active_bank_account_hold_amount_v1(
            p_game_session_id, v_business_account_id, '{}'::uuid[]
          ),
      0
    ),
    v_currency_minor
  )
  into v_available
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.bank_account_id = v_business_account_id
  for update;

  v_available := least(coalesce(v_available, 0), v_due);
  v_remaining_due := v_due;

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
    where entry_row.game_session_id = p_game_session_id
      and entry_row.payroll_run_id = v_run.id
    order by employee_row.public_key
    for update of entry_row
  loop
    v_bank_transaction_id := null;
    v_entry_recipient_unavailable := false;
    v_entry_funds_shortfall := false;
    if v_remaining_due <= 0 or v_available <= 0 then
      v_pay := 0;
    elsif v_entry.wage_due = v_remaining_due then
      v_pay := least(v_entry.wage_due, v_available);
    else
      v_pay := least(
        v_entry.wage_due,
        v_available,
        round(
          v_available * v_entry.wage_due / v_remaining_due,
          v_currency_minor
        )
      );
    end if;

    v_pay := round(v_pay, v_currency_minor);
    v_entry_funds_shortfall := v_pay < v_entry.wage_due;

    -- A disabled Player account is not a valid Banking credit target.  Keep
    -- the wage as liability and allow the rest of the period to close.
    if v_entry.employee_player_id is not null
       and coalesce(v_entry.employee_player_status, '') <> 'active'
    then
      v_entry_recipient_unavailable := true;
      v_pay := 0;
    end if;

    if v_pay > 0 then
      if v_entry.employee_player_id is not null then
        v_recipient_account_id := private.ensure_player_bank_account_v1(
          p_game_session_id,
          v_entry.employee_player_id,
          'checking',
          v_business.currency_code
        );
      else
        v_recipient_account_id := private.ensure_system_bank_account_v1(
          p_game_session_id,
          'business.payroll.employee-clearing',
          'checking',
          v_business.currency_code
        );
      end if;

      select account_row.status
      into v_recipient_account_status
      from public.bank_accounts as account_row
      where account_row.game_session_id = p_game_session_id
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
        p_game_session_id, v_recipient_account_id
      );

      v_post_hash := encode(
        extensions.digest(
          convert_to(
            concat_ws(
              '|',
              'business-operating-period-payroll-entry-v1',
              p_game_session_id,
              v_claim.id,
              v_entry.id,
              v_business_account_id,
              v_recipient_account_id,
              v_business.currency_code,
              v_pay
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      );

      select post_row.*
      into v_post
      from private.post_bank_transaction_v1(
        p_game_session_id,
        'business_payroll',
        'business',
        'operating_period_payroll_entry',
        v_entry.id,
        'phase11-payroll-entry:' || v_entry.public_key,
        v_post_hash,
        jsonb_build_array(
          jsonb_build_object(
            'bankAccountId', v_business_account_id,
            'amount', private.currency_amount_text_v1(
              -v_pay, v_currency_minor
            ),
            'entryType', 'debit',
            'metadata', jsonb_build_object(
              'claimKey', v_claim.public_key,
              'payrollRunKey', v_run.public_key,
              'payrollEntryKey', v_entry.public_key
            )
          ),
          jsonb_build_object(
            'bankAccountId', v_recipient_account_id,
            'amount', private.currency_amount_text_v1(
              v_pay, v_currency_minor
            ),
            'entryType', 'credit',
            'metadata', jsonb_build_object(
              'claimKey', v_claim.public_key,
              'payrollRunKey', v_run.public_key,
              'payrollEntryKey', v_entry.public_key,
              'employeeKey', v_entry.employee_key
            )
          )
        ),
        'system',
        null,
        jsonb_build_object(
          'authority', 'business-operating-period-close-v1',
          'claimKey', v_claim.public_key,
          'businessKey', v_business.public_key,
          'payrollPeriodKey', p_payroll_period_key
        ),
        '{}'::uuid[]
      ) as post_row;

      v_bank_transaction_id := v_post.bank_transaction_id;

      select ledger_row.id
      into v_business_ledger_id
      from public.ledger_entries as ledger_row
      where ledger_row.game_session_id = p_game_session_id
        and ledger_row.bank_transaction_id = v_post.bank_transaction_id
        and ledger_row.line_number = 1;

      select ledger_row.id
      into v_employee_ledger_id
      from public.ledger_entries as ledger_row
      where ledger_row.game_session_id = p_game_session_id
        and ledger_row.bank_transaction_id = v_post.bank_transaction_id
        and ledger_row.line_number = 2;

      if v_business_ledger_id is null or v_employee_ledger_id is null then
        raise exception 'BUSINESS_PAYROLL_BANK_EVIDENCE_MISSING'
          using errcode = 'P0001';
      end if;

      v_first_business_ledger_id := coalesce(
        v_first_business_ledger_id, v_business_ledger_id
      );
      v_bank_transaction_keys := v_bank_transaction_keys
        || jsonb_build_array(v_post.bank_transaction_public_key);
      v_entry_finalized_at := v_post.posted_at;
    else
      v_business_ledger_id := null;
      v_employee_ledger_id := null;
      v_entry_finalized_at := clock_timestamp();
    end if;

    update public.business_payroll_entries as entry_row
    set wage_paid = v_pay,
        wage_unpaid = entry_row.wage_due - v_pay,
        status = case
          when v_pay = entry_row.wage_due then 'paid'
          when v_pay > 0 then 'partially_paid'
          else 'unpaid'
        end,
        business_ledger_entry_id = v_business_ledger_id,
        employee_ledger_entry_id = v_employee_ledger_id,
        bank_transaction_id = v_bank_transaction_id,
        posted_at = v_entry_finalized_at,
        metadata = entry_row.metadata || jsonb_strip_nulls(jsonb_build_object(
          'unpaidReason', case
            when v_entry_recipient_unavailable and v_entry_funds_shortfall
              then 'recipient_unavailable_and_insufficient_funds'
            when v_entry_recipient_unavailable then 'recipient_unavailable'
            when v_entry_funds_shortfall then 'insufficient_available_funds'
            else null
          end
        )),
        updated_at = v_entry_finalized_at
    where entry_row.id = v_entry.id;

    v_available := round(v_available - v_pay, v_currency_minor);
    v_remaining_due := round(
      v_remaining_due - v_entry.wage_due,
      v_currency_minor
    );
    v_paid := round(v_paid + v_pay, v_currency_minor);
  end loop;

  v_unpaid := round(v_due - v_paid, v_currency_minor);
  v_now := clock_timestamp();

  update public.business_payroll_runs as run_row
  set gross_wages_paid = v_paid,
      gross_wages_unpaid = v_unpaid,
      status = case
        when v_unpaid = 0 then 'completed'
        when v_paid > 0 then 'partially_paid'
        else 'unpaid'
      end,
      business_ledger_entry_id = v_first_business_ledger_id,
      failure_code = case
        when v_unpaid = 0 then null
        when v_had_recipient_unavailable and v_had_funds_shortfall
          then 'RECIPIENT_UNAVAILABLE_AND_INSUFFICIENT_FUNDS'
        when v_had_recipient_unavailable then 'PAYROLL_RECIPIENT_UNAVAILABLE'
        when v_had_funds_shortfall then 'INSUFFICIENT_AVAILABLE_BUSINESS_FUNDS'
        else 'PAYROLL_UNPAID_UNCLASSIFIED'
      end,
      completed_at = v_now,
      metadata = run_row.metadata || jsonb_build_object(
        'bankTransactionKeys', v_bank_transaction_keys,
        'bankTransactionCount', jsonb_array_length(v_bank_transaction_keys),
        'usesAvailableBalance', true,
        'recipientUnavailable', v_had_recipient_unavailable,
        'insufficientAvailableFunds', v_had_funds_shortfall
      ),
      version = run_row.version + 1,
      updated_at = v_now
  where run_row.id = v_run.id
  returning * into v_run;

  return query select
    v_run.id,
    v_run.public_key,
    v_run.status,
    v_run.employee_count,
    v_run.gross_wages_due,
    v_run.gross_wages_paid,
    v_run.gross_wages_unpaid,
    v_run.currency_code;
end;
$function$;

revoke all on function private.settle_claimed_business_payroll_v1(
  uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;

create or replace function public.close_claimed_business_operating_period_v1(
  p_claim_key text,
  p_lease_token uuid,
  p_idempotency_key text
)
returns table (
  close_receipt_key text,
  business_key text,
  payroll_period_key text,
  payroll_status text,
  store_receipt_count integer,
  gross_wages_due numeric,
  gross_wages_paid numeric,
  gross_wages_unpaid numeric,
  tax_assessed numeric,
  tax_paid numeric,
  tax_unpaid numeric,
  next_due_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_scope record;
  v_business public.business_entities%rowtype;
  v_clock public.business_payroll_clocks%rowtype;
  v_claim public.business_operating_period_claims%rowtype;
  v_policy public.business_operating_period_policies%rowtype;
  v_next_policy public.business_operating_period_policies%rowtype;
  v_close public.business_operating_period_close_receipts%rowtype;
  v_game_active boolean := false;
  v_payroll record;
  v_tax_group record;
  v_post record;
  v_claim_key text := lower(btrim(coalesce(p_claim_key, '')));
  v_idempotency text := btrim(coalesce(p_idempotency_key, ''));
  v_request_hash text;
  v_tax_assessment_id uuid;
  v_tax_assessment_key text;
  v_business_account_id uuid;
  v_tax_authority_account_id uuid;
  v_tax_assessed numeric(38,18);
  v_tax_paid numeric(38,18);
  v_tax_unpaid numeric(38,18);
  v_available numeric(38,18);
  v_business_ledger_id uuid;
  v_tax_authority_ledger_id uuid;
  v_store_receipt_ids uuid[] := '{}'::uuid[];
  v_store_receipt_count integer := 0;
  v_reporting_tax_assessed numeric(38,18) := 0;
  v_reporting_tax_paid numeric(38,18) := 0;
  v_reporting_tax_unpaid numeric(38,18) := 0;
  v_gross_summary jsonb := '[]'::jsonb;
  v_tax_summary jsonb := '[]'::jsonb;
  v_now timestamptz := clock_timestamp();
  v_prior_claim_context text := coalesce(
    current_setting('app.business_operating_period_claim_write_v1', true), ''
  );
begin
  if v_claim_key !~ '^bocl_[0-9a-f]{32}$'
     or p_lease_token is null
     or length(v_idempotency) not between 8 and 240
  then
    raise exception 'BUSINESS_OPERATING_PERIOD_CLOSE_REQUEST_INVALID'
      using errcode = '22023';
  end if;

  select claim_row.game_session_id, claim_row.business_id
  into v_scope
  from public.business_operating_period_claims as claim_row
  where claim_row.public_key = v_claim_key;
  if not found then
    raise exception 'BUSINESS_OPERATING_PERIOD_CLAIM_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  -- Repository-wide order: Business, payroll clock, claim, game, Banking.
  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = v_scope.game_session_id
    and business_row.id = v_scope.business_id
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select clock_row.*
  into v_clock
  from public.business_payroll_clocks as clock_row
  where clock_row.game_session_id = v_business.game_session_id
    and clock_row.business_id = v_business.id
  for update;
  if not found then
    raise exception 'BUSINESS_PAYROLL_CLOCK_MISSING' using errcode = 'P0001';
  end if;

  select claim_row.*
  into v_claim
  from public.business_operating_period_claims as claim_row
  where claim_row.public_key = v_claim_key
  for update;

  -- A lifecycle transition owns this same game row with FOR UPDATE.  Lock and
  -- snapshot it only after the immutable claim scope is locked, then retain the
  -- share lock through every new payroll, tax, receipt, and clock effect.
  select
    game_row.status = 'active'
      and game_row.lifecycle_state = 'active'
  into v_game_active
  from public.game_sessions as game_row
  where game_row.id = v_claim.game_session_id
  for share;
  if not found then
    v_game_active := false;
  end if;

  v_now := clock_timestamp();

  if v_claim.lease_token <> p_lease_token then
    raise exception 'BUSINESS_OPERATING_PERIOD_LEASE_TOKEN_INVALID'
      using errcode = '42501';
  end if;

  v_request_hash := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|',
          'business-operating-period-close-v1',
          v_claim.id,
          v_claim.lease_token,
          v_claim.game_session_id,
          v_claim.business_id,
          v_claim.period_number,
          v_claim.policy_id
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  select close_row.*
  into v_close
  from public.business_operating_period_close_receipts as close_row
  where close_row.game_session_id = v_business.game_session_id
    and close_row.business_id = v_business.id
    and close_row.idempotency_key = v_idempotency;
  if found then
    if v_close.request_hash <> v_request_hash
       or v_close.operating_period_claim_id <> v_claim.id
    then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;

    return query select
      v_close.public_key,
      v_business.public_key,
      v_close.payroll_period_key,
      v_close.payroll_status,
      v_close.store_receipt_count,
      v_close.gross_wages_due,
      v_close.gross_wages_paid,
      v_close.gross_wages_unpaid,
      v_close.tax_assessed_reporting_currency,
      v_close.tax_paid_reporting_currency,
      v_close.tax_unpaid_reporting_currency,
      v_close.next_due_at,
      true;
    return;
  end if;

  select close_row.*
  into v_close
  from public.business_operating_period_close_receipts as close_row
  where close_row.game_session_id = v_business.game_session_id
    and close_row.operating_period_claim_id = v_claim.id;
  if found then
    raise exception 'BUSINESS_OPERATING_PERIOD_ALREADY_CLOSED'
      using errcode = 'P0001';
  end if;

  if not v_game_active then
    raise exception 'BUSINESS_OPERATING_PERIOD_GAME_INACTIVE'
      using errcode = 'P0001',
        detail = 'Payroll, tax, and period work require an active game.';
  end if;

  if v_business.status not in ('active', 'restructuring', 'distressed') then
    raise exception 'BUSINESS_NOT_OPERATIONAL' using errcode = 'P0001';
  end if;

  if v_claim.status <> 'claimed' then
    raise exception 'BUSINESS_OPERATING_PERIOD_CLAIM_STALE'
      using errcode = 'P0001';
  end if;
  if v_claim.lease_expires_at <= v_now then
    raise exception 'BUSINESS_OPERATING_PERIOD_LEASE_EXPIRED'
      using errcode = 'P0001';
  end if;
  if v_clock.current_period_number <> v_claim.period_number
     or v_clock.period_policy_id <> v_claim.policy_id
     or v_clock.period_started_at <> v_claim.period_started_at
     or v_clock.next_due_at <> v_claim.due_at
     or v_clock.period_duration_seconds <> v_claim.period_duration_seconds
     or v_clock.version <> v_claim.payroll_clock_version
     or v_claim.payroll_period_key
       <> 'payroll:' || v_clock.current_period_number::text
  then
    raise exception 'BUSINESS_OPERATING_PERIOD_CLAIM_STALE'
      using errcode = 'P0001';
  end if;
  if v_clock.next_due_at > v_now then
    raise exception 'BUSINESS_OPERATING_PERIOD_NOT_DUE'
      using errcode = 'P0001';
  end if;

  select policy_row.*
  into v_policy
  from public.business_operating_period_policies as policy_row
  where policy_row.game_session_id = v_business.game_session_id
    and policy_row.id = v_claim.policy_id;
  if not found
     or v_policy.period_duration_seconds <> v_clock.period_duration_seconds
     or v_policy.gross_receipts_tax_rate <> v_clock.gross_receipts_tax_rate
  then
    raise exception 'BUSINESS_OPERATING_PERIOD_POLICY_CONFLICT'
      using errcode = 'P0001';
  end if;

  -- This is the same serialization boundary used by every canonical Banking
  -- post.  It closes the purchase-vs-period race without a second Store path.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'banking-monetary-v1:' || v_business.game_session_id::text,
    0
  ));

  v_now := clock_timestamp();
  if v_claim.lease_expires_at <= v_now then
    raise exception 'BUSINESS_OPERATING_PERIOD_LEASE_EXPIRED'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.store_offer_purchase_receipts as receipt_row
    left join public.business_operating_period_store_receipts as source_row
      on source_row.game_session_id = receipt_row.game_session_id
     and source_row.store_purchase_receipt_id = receipt_row.id
    where receipt_row.game_session_id = v_business.game_session_id
      and receipt_row.business_id = v_business.id
      and receipt_row.business_sales_authority_version = 1
      and (
        (
          receipt_row.business_sales_authority_committed_at
            < v_clock.period_started_at
          and source_row.id is null
        )
        or (
          receipt_row.business_sales_authority_committed_at
            >= v_clock.period_started_at
          and receipt_row.business_sales_authority_committed_at
            < v_clock.next_due_at
          and source_row.id is not null
          and (
            source_row.operating_period_claim_id <> v_claim.id
            or source_row.period_number <> v_claim.period_number
          )
        )
      )
  ) then
    raise exception 'BUSINESS_PERIOD_RECEIPT_ASSIGNMENT_CONFLICT'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.store_offer_purchase_receipts as receipt_row
    left join public.currencies as currency_row
      on currency_row.code = receipt_row.currency_code
     and currency_row.status = 'active'
    where receipt_row.game_session_id = v_business.game_session_id
      and receipt_row.business_id = v_business.id
      and receipt_row.business_sales_authority_version = 1
      and receipt_row.business_sales_authority_committed_at
        >= v_clock.period_started_at
      and receipt_row.business_sales_authority_committed_at
        < v_clock.next_due_at
      and currency_row.code is null
      and not exists (
        select 1
        from public.business_operating_period_store_receipts as source_row
        where source_row.game_session_id = receipt_row.game_session_id
          and source_row.store_purchase_receipt_id = receipt_row.id
      )
  ) then
    raise exception 'BUSINESS_PERIOD_STORE_RECEIPT_CURRENCY_INVALID'
      using errcode = 'P0001';
  end if;

  select coalesce(
    array_agg(
      receipt_row.id
      order by receipt_row.business_sales_authority_committed_at, receipt_row.id
    ),
    '{}'::uuid[]
  )
  into v_store_receipt_ids
  from public.store_offer_purchase_receipts as receipt_row
  join public.currencies as currency_row
    on currency_row.code = receipt_row.currency_code
   and currency_row.status = 'active'
  where receipt_row.game_session_id = v_business.game_session_id
    and receipt_row.business_id = v_business.id
    and receipt_row.business_sales_authority_version = 1
    and receipt_row.business_sales_authority_committed_at
      >= v_clock.period_started_at
    and receipt_row.business_sales_authority_committed_at
      < v_clock.next_due_at
    and not exists (
      select 1
      from public.business_operating_period_store_receipts as source_row
      where source_row.game_session_id = receipt_row.game_session_id
        and source_row.store_purchase_receipt_id = receipt_row.id
    );

  v_store_receipt_count := cardinality(v_store_receipt_ids);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'currencyCode', grouped.currency_code,
        'storeReceiptCount', grouped.receipt_count,
        'grossReceipts', grouped.gross_receipts,
        'costOfGoodsSold', grouped.cost_of_goods_sold
      ) order by grouped.currency_code
    ),
    '[]'::jsonb
  )
  into v_gross_summary
  from (
    select
      receipt_row.currency_code,
      count(*)::integer as receipt_count,
      sum(receipt_row.gross_revenue)::numeric(38,18) as gross_receipts,
      sum(receipt_row.cost_of_goods_sold)::numeric(38,18)
        as cost_of_goods_sold
    from public.store_offer_purchase_receipts as receipt_row
    where receipt_row.game_session_id = v_business.game_session_id
      and receipt_row.id = any(v_store_receipt_ids)
    group by receipt_row.currency_code
  ) as grouped;

  select payroll_row.*
  into v_payroll
  from private.settle_claimed_business_payroll_v1(
    v_business.game_session_id,
    v_business.id,
    v_claim.id,
    v_claim.payroll_period_key
  ) as payroll_row;

  -- Tax is assessed from committed Store receipts and paid only after payroll.
  -- A shortfall is durable liability evidence and never rolls back the period.
  for v_tax_group in
    select
      receipt_row.currency_code,
      currency_row.decimal_places as currency_minor_unit,
      count(*)::integer as receipt_count,
      sum(receipt_row.gross_revenue)::numeric(38,18) as gross_receipts,
      sum(receipt_row.cost_of_goods_sold)::numeric(38,18)
        as cost_of_goods_sold
    from public.store_offer_purchase_receipts as receipt_row
    join public.currencies as currency_row
      on currency_row.code = receipt_row.currency_code
     and currency_row.status = 'active'
    where receipt_row.game_session_id = v_business.game_session_id
      and receipt_row.id = any(v_store_receipt_ids)
    group by receipt_row.currency_code, currency_row.decimal_places
    order by receipt_row.currency_code
  loop
    v_tax_assessment_id := extensions.gen_random_uuid();
    v_tax_assessment_key := 'bgta_'
      || replace(extensions.gen_random_uuid()::text, '-', '');
    v_business_ledger_id := null;
    v_tax_authority_ledger_id := null;

    v_tax_assessed := round(
      v_tax_group.gross_receipts * v_clock.gross_receipts_tax_rate,
      v_tax_group.currency_minor_unit
    );

    v_business_account_id := private.ensure_active_business_checking_account_v1(
      v_business.game_session_id,
      v_business.id,
      v_tax_group.currency_code
    );
    perform private.ensure_bank_account_projection_v1(
      v_business.game_session_id, v_business_account_id
    );

    select round(
      greatest(
        balance_row.balance
          - private.active_bank_account_hold_amount_v1(
              v_business.game_session_id,
              v_business_account_id,
              '{}'::uuid[]
            ),
        0
      ),
      v_tax_group.currency_minor_unit
    )
    into v_available
    from public.account_balances as balance_row
    where balance_row.game_session_id = v_business.game_session_id
      and balance_row.bank_account_id = v_business_account_id
    for update;

    v_tax_paid := least(v_tax_assessed, coalesce(v_available, 0));
    v_tax_paid := round(v_tax_paid, v_tax_group.currency_minor_unit);
    v_tax_unpaid := round(
      v_tax_assessed - v_tax_paid,
      v_tax_group.currency_minor_unit
    );

    if v_tax_paid > 0 then
      v_tax_authority_account_id := private.ensure_system_bank_account_v1(
        v_business.game_session_id,
        'business.gross-receipts-tax-authority',
        'checking',
        v_tax_group.currency_code
      );
      perform private.ensure_bank_account_projection_v1(
        v_business.game_session_id, v_tax_authority_account_id
      );

      select post_row.*
      into v_post
      from private.post_bank_transaction_v1(
        v_business.game_session_id,
        'business_tax',
        'business',
        'operating_period_gross_receipts_tax',
        v_tax_assessment_id,
        'phase11-tax:' || v_tax_assessment_key,
        encode(
          extensions.digest(
            convert_to(
              concat_ws(
                '|',
                'business-operating-period-tax-v1',
                v_claim.id,
                v_tax_assessment_id,
                v_business_account_id,
                v_tax_authority_account_id,
                v_tax_group.currency_code,
                v_tax_paid
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
              -v_tax_paid, v_tax_group.currency_minor_unit
            ),
            'entryType', 'debit',
            'metadata', jsonb_build_object(
              'claimKey', v_claim.public_key,
              'taxAssessmentKey', v_tax_assessment_key
            )
          ),
          jsonb_build_object(
            'bankAccountId', v_tax_authority_account_id,
            'amount', private.currency_amount_text_v1(
              v_tax_paid, v_tax_group.currency_minor_unit
            ),
            'entryType', 'credit',
            'metadata', jsonb_build_object(
              'claimKey', v_claim.public_key,
              'taxAssessmentKey', v_tax_assessment_key
            )
          )
        ),
        'system',
        null,
        jsonb_build_object(
          'authority', 'business-operating-period-close-v1',
          'claimKey', v_claim.public_key,
          'businessKey', v_business.public_key,
          'taxAssessed', v_tax_assessed,
          'taxPaid', v_tax_paid,
          'taxUnpaid', v_tax_unpaid,
          'currencyCode', v_tax_group.currency_code
        ),
        '{}'::uuid[]
      ) as post_row;

      select ledger_row.id
      into v_business_ledger_id
      from public.ledger_entries as ledger_row
      where ledger_row.game_session_id = v_business.game_session_id
        and ledger_row.bank_transaction_id = v_post.bank_transaction_id
        and ledger_row.line_number = 1;

      select ledger_row.id
      into v_tax_authority_ledger_id
      from public.ledger_entries as ledger_row
      where ledger_row.game_session_id = v_business.game_session_id
        and ledger_row.bank_transaction_id = v_post.bank_transaction_id
        and ledger_row.line_number = 2;

      if v_business_ledger_id is null or v_tax_authority_ledger_id is null then
        raise exception 'BUSINESS_TAX_BANK_EVIDENCE_MISSING'
          using errcode = 'P0001';
      end if;
    end if;

    insert into public.business_gross_receipts_tax_assessments (
      id,
      public_key,
      game_session_id,
      business_id,
      operating_period_claim_id,
      period_policy_id,
      period_number,
      payroll_period_key,
      currency_code,
      currency_minor_unit,
      store_receipt_count,
      gross_receipts,
      cost_of_goods_sold,
      gross_receipts_tax_rate,
      tax_assessed,
      tax_paid,
      tax_unpaid,
      status,
      created_at
    ) values (
      v_tax_assessment_id,
      v_tax_assessment_key,
      v_business.game_session_id,
      v_business.id,
      v_claim.id,
      v_claim.policy_id,
      v_claim.period_number,
      v_claim.payroll_period_key,
      v_tax_group.currency_code,
      v_tax_group.currency_minor_unit,
      v_tax_group.receipt_count,
      v_tax_group.gross_receipts,
      v_tax_group.cost_of_goods_sold,
      v_clock.gross_receipts_tax_rate,
      v_tax_assessed,
      v_tax_paid,
      v_tax_unpaid,
      case
        when v_tax_assessed = 0 then 'none_due'
        when v_tax_unpaid = 0 then 'paid'
        when v_tax_paid > 0 then 'partially_paid'
        else 'unpaid'
      end,
      clock_timestamp()
    );

    insert into public.business_operating_period_store_receipts (
      game_session_id,
      business_id,
      operating_period_claim_id,
      tax_assessment_id,
      store_purchase_receipt_id,
      period_number,
      payroll_period_key,
      currency_code,
      gross_revenue,
      cost_of_goods_sold,
      store_receipt_completed_at,
      authority_committed_at
    )
    select
      v_business.game_session_id,
      v_business.id,
      v_claim.id,
      v_tax_assessment_id,
      receipt_row.id,
      v_claim.period_number,
      v_claim.payroll_period_key,
      receipt_row.currency_code,
      receipt_row.gross_revenue,
      receipt_row.cost_of_goods_sold,
      receipt_row.completed_at,
      receipt_row.business_sales_authority_committed_at
    from public.store_offer_purchase_receipts as receipt_row
    where receipt_row.game_session_id = v_business.game_session_id
      and receipt_row.id = any(v_store_receipt_ids)
      and receipt_row.currency_code = v_tax_group.currency_code
    order by
      receipt_row.business_sales_authority_committed_at,
      receipt_row.id;

    if v_tax_paid > 0 then
      insert into public.business_gross_receipts_tax_payments (
        game_session_id,
        business_id,
        tax_assessment_id,
        bank_transaction_id,
        business_ledger_entry_id,
        tax_authority_ledger_entry_id,
        currency_code,
        amount_paid,
        paid_at
      ) values (
        v_business.game_session_id,
        v_business.id,
        v_tax_assessment_id,
        v_post.bank_transaction_id,
        v_business_ledger_id,
        v_tax_authority_ledger_id,
        v_tax_group.currency_code,
        v_tax_paid,
        v_post.posted_at
      );
    end if;

    v_tax_summary := v_tax_summary || jsonb_build_array(
      jsonb_build_object(
        'taxAssessmentKey', v_tax_assessment_key,
        'currencyCode', v_tax_group.currency_code,
        'storeReceiptCount', v_tax_group.receipt_count,
        'grossReceipts', v_tax_group.gross_receipts,
        'taxRate', v_clock.gross_receipts_tax_rate,
        'taxAssessed', v_tax_assessed,
        'taxPaid', v_tax_paid,
        'taxUnpaid', v_tax_unpaid,
        'status', case
          when v_tax_assessed = 0 then 'none_due'
          when v_tax_unpaid = 0 then 'paid'
          when v_tax_paid > 0 then 'partially_paid'
          else 'unpaid'
        end
      )
    );

    if v_tax_group.currency_code = v_business.currency_code then
      v_reporting_tax_assessed := v_tax_assessed;
      v_reporting_tax_paid := v_tax_paid;
      v_reporting_tax_unpaid := v_tax_unpaid;
    end if;
  end loop;

  -- Advance exactly one anchored cadence.  A badly overdue Business can be
  -- claimed again; the worker never skips an economic period.
  v_now := clock_timestamp();
  v_next_policy := private.ensure_business_operating_period_policy_v1(
    v_business.game_session_id, v_now
  );

  update public.business_payroll_clocks as clock_row
  set current_period_number = clock_row.current_period_number + 1,
      period_started_at = v_clock.next_due_at,
      last_settled_at = v_now,
      version = clock_row.version + 1,
      period_policy_id = v_next_policy.id,
      period_opened_at = v_now,
      period_duration_seconds = v_next_policy.period_duration_seconds,
      gross_receipts_tax_rate = v_next_policy.gross_receipts_tax_rate,
      next_due_at = v_clock.next_due_at
        + make_interval(secs => v_next_policy.period_duration_seconds),
      updated_at = v_now
  where clock_row.id = v_clock.id
    and clock_row.current_period_number = v_claim.period_number;
  if not found then
    raise exception 'BUSINESS_PAYROLL_CLOCK_CONFLICT' using errcode = 'P0001';
  end if;

  insert into public.business_operating_period_close_receipts (
    game_session_id,
    business_id,
    operating_period_claim_id,
    period_policy_id,
    payroll_run_id,
    period_number,
    payroll_period_key,
    period_started_at,
    due_at,
    next_due_at,
    idempotency_key,
    request_hash,
    payroll_status,
    store_receipt_count,
    gross_wages_due,
    gross_wages_paid,
    gross_wages_unpaid,
    reporting_currency_code,
    tax_assessed_reporting_currency,
    tax_paid_reporting_currency,
    tax_unpaid_reporting_currency,
    gross_receipts_by_currency,
    tax_by_currency,
    completed_at,
    metadata
  ) values (
    v_business.game_session_id,
    v_business.id,
    v_claim.id,
    v_claim.policy_id,
    v_payroll.payroll_run_id,
    v_claim.period_number,
    v_claim.payroll_period_key,
    v_clock.period_started_at,
    v_clock.next_due_at,
    v_clock.next_due_at
      + make_interval(secs => v_next_policy.period_duration_seconds),
    v_idempotency,
    v_request_hash,
    v_payroll.payroll_status,
    v_store_receipt_count,
    v_payroll.gross_wages_due,
    v_payroll.gross_wages_paid,
    v_payroll.gross_wages_unpaid,
    v_business.currency_code,
    v_reporting_tax_assessed,
    v_reporting_tax_paid,
    v_reporting_tax_unpaid,
    v_gross_summary,
    v_tax_summary,
    v_now,
    jsonb_build_object(
      'authority', 'business-operating-period-close-v1',
      'businessKey', v_business.public_key,
      'claimKey', v_claim.public_key,
      'payrollRunKey', v_payroll.payroll_run_key,
      'policyVersion', v_policy.policy_version,
      'nextPolicyVersion', v_next_policy.policy_version,
      'storeSalesAuthority', 'store-offer-purchase-receipts-v1',
      'unpaidTaxRetainedAsLiability', true
    )
  )
  returning * into v_close;

  perform pg_catalog.set_config(
    'app.business_operating_period_claim_write_v1', 'on', true
  );
  update public.business_operating_period_claims as claim_row
  set status = 'completed',
      terminal_at = v_now,
      updated_at = v_now
  where claim_row.id = v_claim.id
    and claim_row.status = 'claimed';
  if not found then
    raise exception 'BUSINESS_OPERATING_PERIOD_CLAIM_STALE'
      using errcode = 'P0001';
  end if;
  perform pg_catalog.set_config(
    'app.business_operating_period_claim_write_v1',
    v_prior_claim_context,
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
    v_business.game_session_id,
    v_business.id,
    'system',
    null,
    'business.operating-period.closed',
    v_close.id,
    'scheduled-period',
    jsonb_build_object(
      'closeReceiptKey', v_close.public_key,
      'claimKey', v_claim.public_key,
      'payrollPeriodKey', v_claim.payroll_period_key,
      'payrollStatus', v_payroll.payroll_status,
      'storeReceiptCount', v_store_receipt_count,
      'grossReceiptsByCurrency', v_gross_summary,
      'taxByCurrency', v_tax_summary
    ),
    v_now
  );

  return query select
    v_close.public_key,
    v_business.public_key,
    v_close.payroll_period_key,
    v_close.payroll_status,
    v_close.store_receipt_count,
    v_close.gross_wages_due,
    v_close.gross_wages_paid,
    v_close.gross_wages_unpaid,
    v_close.tax_assessed_reporting_currency,
    v_close.tax_paid_reporting_currency,
    v_close.tax_unpaid_reporting_currency,
    v_close.next_due_at,
    false;
end;
$function$;

revoke all on function public.close_claimed_business_operating_period_v1(
  text, uuid, text
) from public, anon, authenticated;
grant execute on function public.close_claimed_business_operating_period_v1(
  text, uuid, text
) to service_role;

comment on column public.store_offer_purchase_receipts.business_sales_authority_version is
  '0 preserves pre-Phase-11 history; 1 is authoritative new Business revenue/COGS eligible for guarded period assignment.';
comment on table public.business_operating_period_store_receipts is
  'Immutable exact-once assignment of Phase-11 Store receipts to a guarded Business operating period and tax assessment.';
comment on table public.business_gross_receipts_tax_assessments is
  'Immutable Store-derived gross-receipts tax assessment; tax_unpaid remains an authoritative liability.';
comment on table public.business_operating_period_close_receipts is
  'Immutable exact-once close evidence for payroll-first Store/tax operating-period work.';

commit;
