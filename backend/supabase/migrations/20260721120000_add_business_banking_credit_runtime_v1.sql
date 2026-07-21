-- Business, Banking Expansion, Savings, Transfers, Loans, and Credit V1.
--
-- Monetary authority remains public.ledger_entries. public.account_balances is
-- only the exact projection of those append-only entries. No second balance
-- authority is introduced by this migration.

begin;

create table public.business_entities (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('biz_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions (id),
  owner_player_id uuid not null,
  legal_name text not null,
  entity_type text not null default 'sole_proprietorship',
  industry_code text not null default 'general',
  country_code text not null,
  currency_code text not null,
  status text not null default 'active',
  capitalization numeric(14,2) not null default 0,
  revenue_total numeric(14,2) not null default 0,
  expense_total numeric(14,2) not null default 0,
  profit_total numeric(14,2) not null default 0,
  valuation numeric(14,2) not null default 0,
  reputation_score integer not null default 50,
  capacity_units integer not null default 100,
  demand_index numeric(8,4) not null default 1,
  failure_count integer not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz null,
  constraint business_entities_owner_scope_fk foreign key (game_session_id, owner_player_id)
    references public.players (game_session_id, id),
  constraint business_entities_name_check check (length(btrim(legal_name)) between 2 and 120),
  constraint business_entities_public_key_check check (public_key ~ '^biz_[0-9a-f]{32}$'),
  constraint business_entities_entity_type_check check (entity_type in ('sole_proprietorship','partnership','corporation','cooperative')),
  constraint business_entities_status_check check (status in ('active','restructuring','distressed','closed')),
  constraint business_entities_currency_check check (currency_code = upper(currency_code) and length(currency_code) between 3 and 16),
  constraint business_entities_country_check check (country_code = upper(country_code) and length(country_code) between 2 and 16),
  constraint business_entities_nonnegative_check check (
    capitalization >= 0 and revenue_total >= 0 and expense_total >= 0 and valuation >= 0
    and capacity_units >= 0 and failure_count >= 0
  ),
  constraint business_entities_reputation_check check (reputation_score between 0 and 100),
  constraint business_entities_demand_check check (demand_index between 0.05 and 5)
);

create trigger set_business_entities_updated_at before update on public.business_entities
for each row execute function public.set_current_timestamp_updated_at();

create index business_entities_game_owner_status_idx
on public.business_entities (game_session_id, owner_player_id, status);
create index business_entities_game_country_status_idx
on public.business_entities (game_session_id, country_code, status);

create table public.business_products (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('bpr_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions (id),
  business_id uuid not null references public.business_entities (id),
  name text not null,
  category text not null default 'general',
  status text not null default 'active',
  unit_price numeric(14,2) not null,
  reference_price numeric(14,2) not null,
  unit_input_cost numeric(14,2) not null default 0,
  unit_labor_cost numeric(14,2) not null default 0,
  capacity_units integer not null default 100,
  base_demand_units integer not null default 20,
  quality_score integer not null default 50,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_products_public_key_check check (public_key ~ '^bpr_[0-9a-f]{32}$'),
  constraint business_products_name_check check (length(btrim(name)) between 1 and 120),
  constraint business_products_status_check check (status in ('active','paused','retired')),
  constraint business_products_amounts_check check (
    unit_price > 0 and reference_price > 0 and unit_input_cost >= 0 and unit_labor_cost >= 0
  ),
  constraint business_products_capacity_check check (capacity_units >= 0 and base_demand_units >= 0),
  constraint business_products_quality_check check (quality_score between 0 and 100),
  constraint business_products_game_scope_unique unique (game_session_id, business_id, public_key)
);
create trigger set_business_products_updated_at before update on public.business_products
for each row execute function public.set_current_timestamp_updated_at();
create index business_products_business_status_idx on public.business_products (game_session_id, business_id, status);

create table public.business_inventory (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  business_id uuid not null references public.business_entities (id),
  item_key text not null,
  inventory_kind text not null,
  quantity numeric(14,3) not null default 0,
  unit_cost numeric(14,2) not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_inventory_item_check check (length(btrim(item_key)) between 1 and 160),
  constraint business_inventory_kind_check check (inventory_kind in ('input','work_in_progress','finished_good')),
  constraint business_inventory_amounts_check check (quantity >= 0 and unit_cost >= 0),
  constraint business_inventory_scope_unique unique (game_session_id, business_id, item_key)
);
create trigger set_business_inventory_updated_at before update on public.business_inventory
for each row execute function public.set_current_timestamp_updated_at();
create index business_inventory_business_kind_idx on public.business_inventory (game_session_id, business_id, inventory_kind);

create table public.business_employees (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('emp_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions (id),
  business_id uuid not null references public.business_entities (id),
  employee_player_id uuid null,
  role_name text not null,
  contract_type text not null default 'cycle',
  wage_per_cycle numeric(14,2) not null,
  productivity_index numeric(8,4) not null default 1,
  status text not null default 'active',
  hired_at timestamptz not null default now(),
  terminated_at timestamptz null,
  termination_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_employees_public_key_check check (public_key ~ '^emp_[0-9a-f]{32}$'),
  constraint business_employees_player_scope_fk foreign key (game_session_id, employee_player_id)
    references public.players (game_session_id, id),
  constraint business_employees_role_check check (length(btrim(role_name)) between 1 and 120),
  constraint business_employees_contract_check check (contract_type in ('cycle','permanent')),
  constraint business_employees_wage_check check (wage_per_cycle > 0),
  constraint business_employees_productivity_check check (productivity_index between 0.25 and 3),
  constraint business_employees_status_check check (status in ('active','terminated'))
);
create trigger set_business_employees_updated_at before update on public.business_employees
for each row execute function public.set_current_timestamp_updated_at();
create index business_employees_business_status_idx on public.business_employees (game_session_id, business_id, status);

create table public.business_production_runs (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('run_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions (id),
  business_id uuid not null references public.business_entities (id),
  product_id uuid not null references public.business_products (id),
  requested_by_player_id uuid not null,
  idempotency_key text not null,
  request_hash text not null,
  quantity integer not null,
  priority text not null default 'standard',
  status text not null default 'completed',
  input_cost numeric(14,2) not null,
  labor_cost numeric(14,2) not null,
  total_cost numeric(14,2) not null,
  output_quantity integer not null,
  ledger_entry_id uuid null references public.ledger_entries (id),
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint business_production_runs_public_key_check check (public_key ~ '^run_[0-9a-f]{32}$'),
  constraint business_production_runs_player_scope_fk foreign key (game_session_id, requested_by_player_id)
    references public.players (game_session_id, id),
  constraint business_production_runs_idempotency_check check (length(btrim(idempotency_key)) between 8 and 160),
  constraint business_production_runs_hash_check check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint business_production_runs_quantity_check check (quantity > 0 and output_quantity >= 0),
  constraint business_production_runs_priority_check check (priority in ('standard','expedite')),
  constraint business_production_runs_status_check check (status in ('completed','failed','cancelled')),
  constraint business_production_runs_cost_check check (input_cost >= 0 and labor_cost >= 0 and total_cost >= 0),
  constraint business_production_runs_idempotency_unique unique (game_session_id, requested_by_player_id, idempotency_key)
);
create index business_production_runs_business_created_idx on public.business_production_runs (game_session_id, business_id, created_at desc);

create table public.business_sales (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('sal_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions (id),
  business_id uuid not null references public.business_entities (id),
  product_id uuid not null references public.business_products (id),
  settlement_key text not null,
  quantity integer not null,
  unit_price numeric(14,2) not null,
  gross_revenue numeric(14,2) not null,
  wage_expense numeric(14,2) not null default 0,
  tax_expense numeric(14,2) not null default 0,
  net_income numeric(14,2) not null,
  demand_index numeric(8,4) not null,
  revenue_ledger_entry_id uuid null references public.ledger_entries (id),
  wage_ledger_entry_id uuid null references public.ledger_entries (id),
  tax_ledger_entry_id uuid null references public.ledger_entries (id),
  created_at timestamptz not null default now(),
  constraint business_sales_public_key_check check (public_key ~ '^sal_[0-9a-f]{32}$'),
  constraint business_sales_quantity_check check (quantity >= 0),
  constraint business_sales_amounts_check check (unit_price > 0 and gross_revenue >= 0 and wage_expense >= 0 and tax_expense >= 0),
  constraint business_sales_demand_check check (demand_index between 0.01 and 10),
  constraint business_sales_settlement_unique unique (game_session_id, business_id, product_id, settlement_key)
);
create index business_sales_business_created_idx on public.business_sales (game_session_id, business_id, created_at desc);

create table public.banking_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('trf_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions (id),
  sender_player_id uuid not null,
  recipient_player_id uuid not null,
  transfer_kind text not null,
  from_account_type text not null,
  to_account_type text not null,
  amount numeric(14,2) not null,
  currency_code text not null,
  memo text null,
  idempotency_key text not null,
  request_hash text not null,
  status text not null default 'pending',
  sender_ledger_entry_id uuid null references public.ledger_entries (id),
  recipient_ledger_entry_id uuid null references public.ledger_entries (id),
  created_at timestamptz not null default now(),
  posted_at timestamptz null,
  constraint banking_transfer_requests_public_key_check check (public_key ~ '^trf_[0-9a-f]{32}$'),
  constraint banking_transfer_requests_sender_scope_fk foreign key (game_session_id, sender_player_id)
    references public.players (game_session_id, id),
  constraint banking_transfer_requests_recipient_scope_fk foreign key (game_session_id, recipient_player_id)
    references public.players (game_session_id, id),
  constraint banking_transfer_requests_distinct_players_check check (
    transfer_kind = 'internal_account' or sender_player_id <> recipient_player_id
  ),
  constraint banking_transfer_requests_kind_check check (transfer_kind in ('player_to_player','internal_account')),
  constraint banking_transfer_requests_amount_check check (amount > 0),
  constraint banking_transfer_requests_currency_check check (currency_code = upper(currency_code) and length(currency_code) between 3 and 16),
  constraint banking_transfer_requests_idempotency_check check (length(btrim(idempotency_key)) between 8 and 160),
  constraint banking_transfer_requests_hash_check check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint banking_transfer_requests_status_check check (status in ('pending','posted','rejected','reversed')),
  constraint banking_transfer_requests_idempotency_unique unique (game_session_id, sender_player_id, idempotency_key)
);
create index banking_transfer_requests_recipient_created_idx on public.banking_transfer_requests (game_session_id, recipient_player_id, created_at desc);
create index banking_transfer_requests_sender_created_idx on public.banking_transfer_requests (game_session_id, sender_player_id, created_at desc);

create table public.savings_interest_runs (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  player_id uuid not null,
  currency_code text not null,
  accrual_date date not null,
  annual_rate numeric(8,6) not null,
  opening_balance numeric(14,2) not null,
  interest_amount numeric(14,2) not null,
  ledger_entry_id uuid null references public.ledger_entries (id),
  created_at timestamptz not null default now(),
  constraint savings_interest_runs_player_scope_fk foreign key (game_session_id, player_id)
    references public.players (game_session_id, id),
  constraint savings_interest_runs_currency_check check (currency_code = upper(currency_code) and length(currency_code) between 3 and 16),
  constraint savings_interest_runs_rate_check check (annual_rate between 0 and 1),
  constraint savings_interest_runs_amount_check check (opening_balance >= 0 and interest_amount >= 0),
  constraint savings_interest_runs_unique unique (game_session_id, player_id, currency_code, accrual_date)
);

create table public.loan_products (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('lop_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions (id),
  name text not null,
  borrower_type text not null default 'player',
  status text not null default 'active',
  currency_code text not null,
  minimum_amount numeric(14,2) not null,
  maximum_amount numeric(14,2) not null,
  annual_rate numeric(8,6) not null,
  origination_fee_rate numeric(8,6) not null default 0,
  term_cycles integer not null,
  payment_frequency_cycles integer not null default 1,
  minimum_credit_score integer not null default 550,
  maximum_payment_to_income numeric(8,6) not null default 0.35,
  delinquency_grace_days integer not null default 7,
  default_after_days integer not null default 30,
  disclosure_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loan_products_public_key_check check (public_key ~ '^lop_[0-9a-f]{32}$'),
  constraint loan_products_name_check check (length(btrim(name)) between 2 and 120),
  constraint loan_products_borrower_check check (borrower_type in ('player','business')),
  constraint loan_products_status_check check (status in ('active','paused','retired')),
  constraint loan_products_currency_check check (currency_code = upper(currency_code) and length(currency_code) between 3 and 16),
  constraint loan_products_amounts_check check (minimum_amount > 0 and maximum_amount >= minimum_amount),
  constraint loan_products_rates_check check (annual_rate between 0 and 1 and origination_fee_rate between 0 and 0.25),
  constraint loan_products_term_check check (term_cycles between 1 and 240 and payment_frequency_cycles between 1 and term_cycles),
  constraint loan_products_credit_check check (minimum_credit_score between 300 and 850),
  constraint loan_products_affordability_check check (maximum_payment_to_income between 0.05 and 0.75),
  constraint loan_products_default_check check (delinquency_grace_days between 0 and 90 and default_after_days >= delinquency_grace_days),
  constraint loan_products_disclosure_check check (length(btrim(disclosure_text)) between 20 and 4000)
);
create trigger set_loan_products_updated_at before update on public.loan_products
for each row execute function public.set_current_timestamp_updated_at();
create index loan_products_game_status_type_idx on public.loan_products (game_session_id, status, borrower_type);

create table public.credit_profiles (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  player_id uuid not null,
  score integer not null default 600,
  on_time_payment_rate numeric(8,6) not null default 1,
  savings_ratio numeric(8,6) not null default 0,
  income_stability numeric(8,6) not null default 0,
  transfer_anomaly_count integer not null default 0,
  delinquency_count integer not null default 0,
  default_count integer not null default 0,
  model_version text not null default 'economic-behavior-v1',
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_profiles_player_scope_fk foreign key (game_session_id, player_id)
    references public.players (game_session_id, id),
  constraint credit_profiles_scope_unique unique (game_session_id, player_id),
  constraint credit_profiles_score_check check (score between 300 and 850),
  constraint credit_profiles_rates_check check (
    on_time_payment_rate between 0 and 1 and savings_ratio between 0 and 1 and income_stability between 0 and 1
  ),
  constraint credit_profiles_counts_check check (
    transfer_anomaly_count >= 0 and delinquency_count >= 0 and default_count >= 0
  ),
  constraint credit_profiles_model_check check (model_version = 'economic-behavior-v1')
);
create trigger set_credit_profiles_updated_at before update on public.credit_profiles
for each row execute function public.set_current_timestamp_updated_at();

create table public.loan_applications (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('lna_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions (id),
  player_id uuid not null,
  business_id uuid null references public.business_entities (id),
  loan_product_id uuid not null references public.loan_products (id),
  amount numeric(14,2) not null,
  purpose text not null,
  repayment_source text not null,
  credit_score integer not null,
  projected_payment numeric(14,2) not null,
  affordability_ratio numeric(8,6) not null,
  status text not null default 'pending_review',
  idempotency_key text not null,
  request_hash text not null,
  reviewed_by_staff_user_id uuid null references public.staff_users (id),
  reviewed_at timestamptz null,
  review_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loan_applications_public_key_check check (public_key ~ '^lna_[0-9a-f]{32}$'),
  constraint loan_applications_player_scope_fk foreign key (game_session_id, player_id)
    references public.players (game_session_id, id),
  constraint loan_applications_amount_check check (amount > 0 and projected_payment > 0),
  constraint loan_applications_text_check check (length(btrim(purpose)) between 2 and 240 and length(btrim(repayment_source)) between 5 and 1000),
  constraint loan_applications_score_check check (credit_score between 300 and 850),
  constraint loan_applications_affordability_check check (affordability_ratio between 0 and 100),
  constraint loan_applications_status_check check (status in ('pending_review','approved','declined','cancelled')),
  constraint loan_applications_idempotency_check check (length(btrim(idempotency_key)) between 8 and 160),
  constraint loan_applications_hash_check check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint loan_applications_idempotency_unique unique (game_session_id, player_id, idempotency_key)
);
create trigger set_loan_applications_updated_at before update on public.loan_applications
for each row execute function public.set_current_timestamp_updated_at();
create index loan_applications_game_status_created_idx on public.loan_applications (game_session_id, status, created_at desc);
create index loan_applications_player_created_idx on public.loan_applications (game_session_id, player_id, created_at desc);

create table public.player_loans (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('lon_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions (id),
  player_id uuid not null,
  business_id uuid null references public.business_entities (id),
  loan_product_id uuid not null references public.loan_products (id),
  application_id uuid not null unique references public.loan_applications (id),
  currency_code text not null,
  original_principal numeric(14,2) not null,
  principal_balance numeric(14,2) not null,
  accrued_interest numeric(14,2) not null default 0,
  annual_rate numeric(8,6) not null,
  origination_fee numeric(14,2) not null default 0,
  scheduled_payment numeric(14,2) not null,
  status text not null default 'active',
  disbursement_ledger_entry_id uuid null references public.ledger_entries (id),
  next_due_at timestamptz not null,
  last_accrued_at timestamptz not null default now(),
  delinquent_at timestamptz null,
  defaulted_at timestamptz null,
  closed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_loans_public_key_check check (public_key ~ '^lon_[0-9a-f]{32}$'),
  constraint player_loans_player_scope_fk foreign key (game_session_id, player_id)
    references public.players (game_session_id, id),
  constraint player_loans_currency_check check (currency_code = upper(currency_code) and length(currency_code) between 3 and 16),
  constraint player_loans_amounts_check check (
    original_principal > 0 and principal_balance >= 0 and accrued_interest >= 0
    and origination_fee >= 0 and scheduled_payment > 0
  ),
  constraint player_loans_rate_check check (annual_rate between 0 and 1),
  constraint player_loans_status_check check (status in ('active','delinquent','defaulted','restructured','paid'))
);
create trigger set_player_loans_updated_at before update on public.player_loans
for each row execute function public.set_current_timestamp_updated_at();
create index player_loans_player_status_idx on public.player_loans (game_session_id, player_id, status);
create index player_loans_due_status_idx on public.player_loans (game_session_id, next_due_at, status);

create table public.loan_payments (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('pay_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions (id),
  player_id uuid not null,
  loan_id uuid not null references public.player_loans (id),
  amount numeric(14,2) not null,
  principal_amount numeric(14,2) not null,
  interest_amount numeric(14,2) not null,
  idempotency_key text not null,
  request_hash text not null,
  ledger_entry_id uuid null references public.ledger_entries (id),
  status text not null default 'posted',
  created_at timestamptz not null default now(),
  constraint loan_payments_public_key_check check (public_key ~ '^pay_[0-9a-f]{32}$'),
  constraint loan_payments_player_scope_fk foreign key (game_session_id, player_id)
    references public.players (game_session_id, id),
  constraint loan_payments_amounts_check check (
    amount > 0 and principal_amount >= 0 and interest_amount >= 0
    and amount = principal_amount + interest_amount
  ),
  constraint loan_payments_idempotency_check check (length(btrim(idempotency_key)) between 8 and 160),
  constraint loan_payments_hash_check check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint loan_payments_status_check check (status in ('posted','reversed')),
  constraint loan_payments_idempotency_unique unique (game_session_id, player_id, loan_id, idempotency_key)
);
create index loan_payments_loan_created_idx on public.loan_payments (game_session_id, loan_id, created_at desc);

create or replace function public.business_account_type_v1(p_business_public_key text)
returns text language sql immutable strict as $$
  select 'business:' || lower(btrim(p_business_public_key));
$$;

create or replace function public.execute_player_transfer_v1(
  p_game_session_id uuid,
  p_sender_player_id uuid,
  p_recipient_player_identifier text,
  p_amount numeric,
  p_currency_code text,
  p_memo text,
  p_idempotency_key text
) returns table (
  transfer_key text,
  status text,
  amount numeric,
  currency_code text,
  sender_balance numeric,
  recipient_player_identifier text,
  posted_at timestamptz,
  replayed boolean
) language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_identifier text := upper(regexp_replace(btrim(coalesce(p_recipient_player_identifier,'')), '\s+', '', 'g'));
  v_currency text := upper(btrim(coalesce(p_currency_code,'ECO')));
  v_memo text := nullif(left(btrim(coalesce(p_memo,'')),120),'');
  v_hash text;
  v_existing public.banking_transfer_requests%rowtype;
  v_recipient public.players%rowtype;
  v_transfer public.banking_transfer_requests%rowtype;
  v_sender_balance numeric := 0;
  v_sender_post numeric;
  v_recipient_entry uuid;
  v_sender_entry uuid;
begin
  if p_game_session_id is null or p_sender_player_id is null then raise exception 'PLAYER_SCOPE_REQUIRED' using errcode='P0001'; end if;
  if v_identifier = '' then raise exception 'RECIPIENT_PLAYER_IDENTIFIER_REQUIRED' using errcode='P0001'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception 'TRANSFER_AMOUNT_INVALID' using errcode='P0001'; end if;
  if length(v_currency) < 3 or length(v_currency) > 16 then raise exception 'TRANSFER_CURRENCY_INVALID' using errcode='P0001'; end if;
  if length(btrim(coalesce(p_idempotency_key,''))) < 8 then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='P0001'; end if;

  select * into v_recipient from public.players
  where game_session_id = p_game_session_id and player_identifier_normalized = v_identifier and status = 'active';
  if not found then raise exception 'RECIPIENT_NOT_FOUND' using errcode='P0001'; end if;
  if v_recipient.id = p_sender_player_id then raise exception 'SELF_TRANSFER_NOT_ALLOWED' using errcode='P0001'; end if;

  v_hash := encode(digest(concat_ws('|',p_game_session_id,p_sender_player_id,v_recipient.id,p_amount,v_currency,coalesce(v_memo,'')),'sha256'),'hex');
  select * into v_existing from public.banking_transfer_requests
  where game_session_id=p_game_session_id and sender_player_id=p_sender_player_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.request_hash <> v_hash then raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode='P0001'; end if;
    select balance into v_sender_post from public.account_balances
    where game_session_id=p_game_session_id and player_id=p_sender_player_id and account_type='cash' and currency_code=v_currency;
    return query select v_existing.public_key,v_existing.status,v_existing.amount,v_existing.currency_code,coalesce(v_sender_post,0),v_recipient.player_identifier,v_existing.posted_at,true;
    return;
  end if;

  perform 1 from public.players where game_session_id=p_game_session_id and id in (p_sender_player_id,v_recipient.id) and status='active' order by id for update;
  select balance into v_sender_balance from public.account_balances
  where game_session_id=p_game_session_id and player_id=p_sender_player_id and account_type='cash' and currency_code=v_currency for update;
  if coalesce(v_sender_balance,0) < p_amount then raise exception 'INSUFFICIENT_FUNDS' using errcode='P0001'; end if;

  insert into public.banking_transfer_requests (
    game_session_id,sender_player_id,recipient_player_id,transfer_kind,from_account_type,to_account_type,
    amount,currency_code,memo,idempotency_key,request_hash,status
  ) values (
    p_game_session_id,p_sender_player_id,v_recipient.id,'player_to_player','cash','cash',
    round(p_amount,2),v_currency,v_memo,p_idempotency_key,v_hash,'pending'
  ) returning * into v_transfer;

  select ledger_entry_id into v_sender_entry from public.record_player_ledger_entry(
    p_game_session_id,p_sender_player_id,'cash',-round(p_amount,2),v_currency,'debit','banking','player_transfer_sent',v_transfer.id,'player',p_sender_player_id,
    jsonb_build_object('transfer_key',v_transfer.public_key,'counterparty','recipient')
  );
  select ledger_entry_id into v_recipient_entry from public.record_player_ledger_entry(
    p_game_session_id,v_recipient.id,'cash',round(p_amount,2),v_currency,'credit','banking','player_transfer_received',v_transfer.id,'player',p_sender_player_id,
    jsonb_build_object('transfer_key',v_transfer.public_key,'counterparty','sender')
  );

  update public.banking_transfer_requests set status='posted',sender_ledger_entry_id=v_sender_entry,
    recipient_ledger_entry_id=v_recipient_entry,posted_at=now() where id=v_transfer.id returning * into v_transfer;
  select balance into v_sender_post from public.account_balances
  where game_session_id=p_game_session_id and player_id=p_sender_player_id and account_type='cash' and currency_code=v_currency;
  return query select v_transfer.public_key,v_transfer.status,v_transfer.amount,v_transfer.currency_code,coalesce(v_sender_post,0),v_recipient.player_identifier,v_transfer.posted_at,false;
end;
$$;

create or replace function public.execute_player_account_transfer_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_from_account_type text,
  p_to_account_type text,
  p_amount numeric,
  p_currency_code text,
  p_note text,
  p_idempotency_key text
) returns table (
  transfer_key text,status text,from_account_type text,to_account_type text,amount numeric,currency_code text,
  from_balance numeric,to_balance numeric,posted_at timestamptz,replayed boolean
) language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_from text := lower(btrim(coalesce(p_from_account_type,'')));
  v_to text := lower(btrim(coalesce(p_to_account_type,'')));
  v_currency text := upper(btrim(coalesce(p_currency_code,'ECO')));
  v_hash text;
  v_existing public.banking_transfer_requests%rowtype;
  v_transfer public.banking_transfer_requests%rowtype;
  v_from_balance numeric := 0;
  v_to_balance numeric := 0;
  v_debit uuid;
  v_credit uuid;
begin
  if v_from not in ('cash','savings') or v_to not in ('cash','savings') or v_from=v_to then raise exception 'ACCOUNT_TRANSFER_INVALID' using errcode='P0001'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception 'TRANSFER_AMOUNT_INVALID' using errcode='P0001'; end if;
  if length(btrim(coalesce(p_idempotency_key,''))) < 8 then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='P0001'; end if;
  v_hash := encode(digest(concat_ws('|',p_game_session_id,p_player_id,v_from,v_to,p_amount,v_currency,coalesce(p_note,'')),'sha256'),'hex');
  select * into v_existing from public.banking_transfer_requests
  where game_session_id=p_game_session_id and sender_player_id=p_player_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.request_hash<>v_hash then raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode='P0001'; end if;
    select balance into v_from_balance from public.account_balances where game_session_id=p_game_session_id and player_id=p_player_id and account_type=v_from and currency_code=v_currency;
    select balance into v_to_balance from public.account_balances where game_session_id=p_game_session_id and player_id=p_player_id and account_type=v_to and currency_code=v_currency;
    return query select v_existing.public_key,v_existing.status,v_from,v_to,v_existing.amount,v_currency,coalesce(v_from_balance,0),coalesce(v_to_balance,0),v_existing.posted_at,true;
    return;
  end if;
  perform 1 from public.players where game_session_id=p_game_session_id and id=p_player_id and status='active' for update;
  if not found then raise exception 'PLAYER_NOT_FOUND' using errcode='P0001'; end if;
  select balance into v_from_balance from public.account_balances
  where game_session_id=p_game_session_id and player_id=p_player_id and account_type=v_from and currency_code=v_currency for update;
  if coalesce(v_from_balance,0) < p_amount then raise exception 'INSUFFICIENT_FUNDS' using errcode='P0001'; end if;
  insert into public.banking_transfer_requests (
    game_session_id,sender_player_id,recipient_player_id,transfer_kind,from_account_type,to_account_type,
    amount,currency_code,memo,idempotency_key,request_hash,status
  ) values (
    p_game_session_id,p_player_id,p_player_id,'internal_account',v_from,v_to,round(p_amount,2),v_currency,
    nullif(left(btrim(coalesce(p_note,'')),120),''),p_idempotency_key,v_hash,'pending'
  ) returning * into v_transfer;
  select ledger_entry_id into v_debit from public.record_player_ledger_entry(
    p_game_session_id,p_player_id,v_from,-round(p_amount,2),v_currency,'debit','banking','account_transfer_out',v_transfer.id,'player',p_player_id,jsonb_build_object('transfer_key',v_transfer.public_key)
  );
  select ledger_entry_id into v_credit from public.record_player_ledger_entry(
    p_game_session_id,p_player_id,v_to,round(p_amount,2),v_currency,'credit','banking','account_transfer_in',v_transfer.id,'player',p_player_id,jsonb_build_object('transfer_key',v_transfer.public_key)
  );
  update public.banking_transfer_requests set status='posted',sender_ledger_entry_id=v_debit,recipient_ledger_entry_id=v_credit,posted_at=now()
  where id=v_transfer.id returning * into v_transfer;
  select balance into v_from_balance from public.account_balances where game_session_id=p_game_session_id and player_id=p_player_id and account_type=v_from and currency_code=v_currency;
  select balance into v_to_balance from public.account_balances where game_session_id=p_game_session_id and player_id=p_player_id and account_type=v_to and currency_code=v_currency;
  return query select v_transfer.public_key,v_transfer.status,v_from,v_to,v_transfer.amount,v_currency,coalesce(v_from_balance,0),coalesce(v_to_balance,0),v_transfer.posted_at,false;
end;
$$;

create or replace function public.accrue_player_savings_interest_v1(
  p_game_session_id uuid,
  p_accrual_date date,
  p_annual_rate numeric,
  p_max_interest_per_player numeric default 10000
) returns table (players_credited integer,total_interest numeric) language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_balance record;
  v_interest numeric;
  v_entry uuid;
  v_count integer := 0;
  v_total numeric := 0;
begin
  if p_accrual_date is null or p_accrual_date > current_date then raise exception 'ACCRUAL_DATE_INVALID' using errcode='P0001'; end if;
  if p_annual_rate is null or p_annual_rate < 0 or p_annual_rate > 0.25 then raise exception 'SAVINGS_RATE_INVALID' using errcode='P0001'; end if;
  for v_balance in
    select ab.* from public.account_balances ab join public.players p on p.id=ab.player_id and p.game_session_id=ab.game_session_id
    where ab.game_session_id=p_game_session_id and ab.account_type='savings' and ab.balance>0 and p.status='active'
    order by ab.player_id,ab.currency_code for update of ab
  loop
    if exists (select 1 from public.savings_interest_runs r where r.game_session_id=p_game_session_id and r.player_id=v_balance.player_id and r.currency_code=v_balance.currency_code and r.accrual_date=p_accrual_date) then continue; end if;
    v_interest := least(round(v_balance.balance * p_annual_rate / 365,2),p_max_interest_per_player);
    if v_interest <= 0 then continue; end if;
    select ledger_entry_id into v_entry from public.record_player_ledger_entry(
      p_game_session_id,v_balance.player_id,'savings',v_interest,v_balance.currency_code,'credit','banking','savings_interest',null,'system',null,
      jsonb_build_object('accrual_date',p_accrual_date,'annual_rate',p_annual_rate)
    );
    insert into public.savings_interest_runs(game_session_id,player_id,currency_code,accrual_date,annual_rate,opening_balance,interest_amount,ledger_entry_id)
    values(p_game_session_id,v_balance.player_id,v_balance.currency_code,p_accrual_date,p_annual_rate,v_balance.balance,v_interest,v_entry);
    v_count:=v_count+1; v_total:=v_total+v_interest;
  end loop;
  return query select v_count,round(v_total,2);
end;
$$;

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
) returns table (business_key text,status text,owner_player_id uuid,capitalization numeric,valuation numeric,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_currency text:=upper(btrim(p_currency_code));
  v_existing public.business_entities%rowtype;
  v_business public.business_entities%rowtype;
  v_seller uuid;
  v_account text;
  v_cash numeric:=0;
  v_audit_key text:=left('business:'||btrim(p_idempotency_key),160);
begin
  if length(btrim(coalesce(p_idempotency_key,'')))<8 then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='P0001'; end if;
  select be.* into v_existing from public.business_entities be
  join public.audit_log al on al.game_session_id=be.game_session_id and al.target_id=be.id and al.action='business.create_or_acquire'
  where be.game_session_id=p_game_session_id and be.owner_player_id=p_player_id and al.metadata->>'idempotency_key'=p_idempotency_key limit 1;
  if found then return query select v_existing.public_key,v_existing.status,v_existing.owner_player_id,v_existing.capitalization,v_existing.valuation,true; return; end if;
  if p_capitalization is null or p_capitalization<0 or p_capitalization>10000000 then raise exception 'CAPITALIZATION_INVALID' using errcode='P0001'; end if;
  perform 1 from public.players where game_session_id=p_game_session_id and id=p_player_id and status='active' for update;
  if not found then raise exception 'PLAYER_NOT_FOUND' using errcode='P0001'; end if;
  select balance into v_cash from public.account_balances where game_session_id=p_game_session_id and player_id=p_player_id and account_type='cash' and currency_code=v_currency for update;
  if coalesce(v_cash,0)<p_capitalization then raise exception 'INSUFFICIENT_FUNDS' using errcode='P0001'; end if;
  if nullif(btrim(coalesce(p_acquire_business_key,'')),'') is null then
    insert into public.business_entities(game_session_id,owner_player_id,legal_name,entity_type,industry_code,country_code,currency_code,status,capitalization,valuation)
    values(p_game_session_id,p_player_id,btrim(p_legal_name),p_entity_type,btrim(p_industry_code),upper(btrim(p_country_code)),v_currency,'active',round(p_capitalization,2),round(p_capitalization,2))
    returning * into v_business;
  else
    select * into v_business from public.business_entities where game_session_id=p_game_session_id and public_key=lower(btrim(p_acquire_business_key)) and status in ('active','distressed') for update;
    if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode='P0001'; end if;
    if v_business.owner_player_id=p_player_id then raise exception 'BUSINESS_ALREADY_OWNED' using errcode='P0001'; end if;
    v_seller:=v_business.owner_player_id;
    update public.business_entities set owner_player_id=p_player_id,status='active',capitalization=capitalization+round(p_capitalization,2),version=version+1 where id=v_business.id returning * into v_business;
    if p_capitalization>0 then
      perform public.record_player_ledger_entry(p_game_session_id,v_seller,'cash',round(p_capitalization,2),v_currency,'credit','business','business_sale_proceeds',v_business.id,'player',p_player_id,jsonb_build_object('business_key',v_business.public_key));
    end if;
  end if;
  v_account:=public.business_account_type_v1(v_business.public_key);
  if p_capitalization>0 then
    perform public.record_player_ledger_entry(p_game_session_id,p_player_id,'cash',-round(p_capitalization,2),v_currency,'debit','business','capitalization_out',v_business.id,'player',p_player_id,jsonb_build_object('business_key',v_business.public_key));
    perform public.record_player_ledger_entry(p_game_session_id,p_player_id,v_account,round(p_capitalization,2),v_currency,'credit','business','capitalization_in',v_business.id,'player',p_player_id,jsonb_build_object('business_key',v_business.public_key));
  end if;
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata)
  values(p_game_session_id,'player',p_player_id,'business.create_or_acquire','business',v_business.id,jsonb_build_object('idempotency_key',p_idempotency_key,'business_key',v_business.public_key,'acquisition',p_acquire_business_key is not null));
  return query select v_business.public_key,v_business.status,v_business.owner_player_id,v_business.capitalization,v_business.valuation,false;
end;
$$;

create or replace function public.set_business_product_price_v1(
  p_game_session_id uuid,p_player_id uuid,p_business_key text,p_product_key text,p_price numeric,p_expected_version integer,p_idempotency_key text
) returns table(product_key text,unit_price numeric,version integer,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_business public.business_entities%rowtype; v_product public.business_products%rowtype;
begin
  select * into v_business from public.business_entities where game_session_id=p_game_session_id and public_key=lower(btrim(p_business_key)) and owner_player_id=p_player_id and status in ('active','restructuring') for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode='P0001'; end if;
  select * into v_product from public.business_products where game_session_id=p_game_session_id and business_id=v_business.id and public_key=lower(btrim(p_product_key)) for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='P0001'; end if;
  if p_price is null or p_price<=0 or p_price>1000000 then raise exception 'PRICE_INVALID' using errcode='P0001'; end if;
  if exists(select 1 from public.audit_log where game_session_id=p_game_session_id and action='business.product.price' and metadata->>'idempotency_key'=p_idempotency_key and target_id=v_product.id) then
    return query select v_product.public_key,v_product.unit_price,v_product.version,true; return;
  end if;
  if p_expected_version is not null and v_product.version<>p_expected_version then raise exception 'STALE_PRODUCT_VERSION' using errcode='P0001'; end if;
  update public.business_products set unit_price=round(p_price,2),version=version+1 where id=v_product.id returning * into v_product;
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata)
  values(p_game_session_id,'player',p_player_id,'business.product.price','business_product',v_product.id,jsonb_build_object('idempotency_key',p_idempotency_key,'product_key',v_product.public_key,'price',v_product.unit_price));
  return query select v_product.public_key,v_product.unit_price,v_product.version,false;
end;
$$;

create or replace function public.hire_business_employee_v1(
  p_game_session_id uuid,p_player_id uuid,p_business_key text,p_employee_player_identifier text,p_role_name text,p_contract_type text,
  p_wage_per_cycle numeric,p_productivity_index numeric,p_idempotency_key text
) returns table(employee_key text,status text,wage_per_cycle numeric,productivity_index numeric,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_business public.business_entities%rowtype; v_employee public.business_employees%rowtype; v_employee_player uuid; v_balance numeric:=0; v_identifier text;
begin
  select * into v_business from public.business_entities where game_session_id=p_game_session_id and public_key=lower(btrim(p_business_key)) and owner_player_id=p_player_id and status='active' for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode='P0001'; end if;
  if p_wage_per_cycle is null or p_wage_per_cycle<=0 then raise exception 'WAGE_INVALID' using errcode='P0001'; end if;
  if p_productivity_index is null or p_productivity_index<0.25 or p_productivity_index>3 then raise exception 'PRODUCTIVITY_INVALID' using errcode='P0001'; end if;
  select balance into v_balance from public.account_balances where game_session_id=p_game_session_id and player_id=p_player_id and account_type=public.business_account_type_v1(v_business.public_key) and currency_code=v_business.currency_code for update;
  if coalesce(v_balance,0)<p_wage_per_cycle then raise exception 'WAGE_UNAFFORDABLE' using errcode='P0001'; end if;
  if exists(select 1 from public.audit_log where game_session_id=p_game_session_id and action='business.employee.hire' and target_id=v_business.id and metadata->>'idempotency_key'=p_idempotency_key) then
    select * into v_employee from public.business_employees where business_id=v_business.id and public_key=(select metadata->>'employee_key' from public.audit_log where game_session_id=p_game_session_id and action='business.employee.hire' and target_id=v_business.id and metadata->>'idempotency_key'=p_idempotency_key limit 1);
    return query select v_employee.public_key,v_employee.status,v_employee.wage_per_cycle,v_employee.productivity_index,true; return;
  end if;
  v_identifier:=upper(regexp_replace(btrim(coalesce(p_employee_player_identifier,'')),'\s+','','g'));
  if v_identifier<>'' then
    select id into v_employee_player from public.players where game_session_id=p_game_session_id and player_identifier_normalized=v_identifier and status='active';
    if v_employee_player is null then raise exception 'EMPLOYEE_PLAYER_NOT_FOUND' using errcode='P0001'; end if;
    if v_employee_player=p_player_id then raise exception 'OWNER_CANNOT_BE_EMPLOYEE' using errcode='P0001'; end if;
  end if;
  insert into public.business_employees(game_session_id,business_id,employee_player_id,role_name,contract_type,wage_per_cycle,productivity_index,status)
  values(p_game_session_id,v_business.id,v_employee_player,btrim(p_role_name),p_contract_type,round(p_wage_per_cycle,2),p_productivity_index,'active') returning * into v_employee;
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata)
  values(p_game_session_id,'player',p_player_id,'business.employee.hire','business',v_business.id,jsonb_build_object('idempotency_key',p_idempotency_key,'employee_key',v_employee.public_key,'role',v_employee.role_name,'wage',v_employee.wage_per_cycle));
  return query select v_employee.public_key,v_employee.status,v_employee.wage_per_cycle,v_employee.productivity_index,false;
end;
$$;

create or replace function public.terminate_business_employee_v1(
  p_game_session_id uuid,p_player_id uuid,p_business_key text,p_employee_key text,p_reason text,p_idempotency_key text
) returns table(employee_key text,status text,terminated_at timestamptz,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_business public.business_entities%rowtype; v_employee public.business_employees%rowtype;
begin
  select * into v_business from public.business_entities where game_session_id=p_game_session_id and public_key=lower(btrim(p_business_key)) and owner_player_id=p_player_id for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode='P0001'; end if;
  select * into v_employee from public.business_employees where game_session_id=p_game_session_id and business_id=v_business.id and public_key=lower(btrim(p_employee_key)) for update;
  if not found then raise exception 'EMPLOYEE_NOT_FOUND' using errcode='P0001'; end if;
  if v_employee.status='terminated' then return query select v_employee.public_key,v_employee.status,v_employee.terminated_at,true; return; end if;
  update public.business_employees set status='terminated',terminated_at=now(),termination_reason=left(btrim(coalesce(p_reason,'Not specified')),500)
  where id=v_employee.id returning * into v_employee;
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata)
  values(p_game_session_id,'player',p_player_id,'business.employee.terminate','business_employee',v_employee.id,jsonb_build_object('idempotency_key',p_idempotency_key,'employee_key',v_employee.public_key,'reason',v_employee.termination_reason));
  return query select v_employee.public_key,v_employee.status,v_employee.terminated_at,false;
end;
$$;

create or replace function public.run_business_production_v1(
  p_game_session_id uuid,p_player_id uuid,p_business_key text,p_product_key text,p_quantity integer,p_priority text,p_idempotency_key text
) returns table(run_key text,status text,output_quantity integer,total_cost numeric,business_balance numeric,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_business public.business_entities%rowtype; v_product public.business_products%rowtype; v_run public.business_production_runs%rowtype;
  v_hash text; v_input numeric; v_labor numeric; v_total numeric; v_balance numeric:=0; v_entry uuid; v_capacity numeric;
begin
  if p_quantity is null or p_quantity<=0 or p_quantity>10000 then raise exception 'PRODUCTION_QUANTITY_INVALID' using errcode='P0001'; end if;
  if p_priority not in ('standard','expedite') then raise exception 'PRODUCTION_PRIORITY_INVALID' using errcode='P0001'; end if;
  select * into v_business from public.business_entities where game_session_id=p_game_session_id and public_key=lower(btrim(p_business_key)) and owner_player_id=p_player_id and status='active' for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode='P0001'; end if;
  select * into v_product from public.business_products where game_session_id=p_game_session_id and business_id=v_business.id and public_key=lower(btrim(p_product_key)) and status='active' for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='P0001'; end if;
  v_capacity:=least(v_business.capacity_units,v_product.capacity_units) * coalesce((select sum(productivity_index) from public.business_employees where business_id=v_business.id and status='active'),1);
  if p_quantity>floor(v_capacity) then raise exception 'CAPACITY_EXCEEDED' using errcode='P0001'; end if;
  v_hash:=encode(digest(concat_ws('|',p_game_session_id,p_player_id,v_business.id,v_product.id,p_quantity,p_priority),'sha256'),'hex');
  select * into v_run from public.business_production_runs where game_session_id=p_game_session_id and requested_by_player_id=p_player_id and idempotency_key=p_idempotency_key;
  if found then
    if v_run.request_hash<>v_hash then raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode='P0001'; end if;
    select balance into v_balance from public.account_balances where game_session_id=p_game_session_id and player_id=p_player_id and account_type=public.business_account_type_v1(v_business.public_key) and currency_code=v_business.currency_code;
    return query select v_run.public_key,v_run.status,v_run.output_quantity,v_run.total_cost,coalesce(v_balance,0),true; return;
  end if;
  v_input:=round(v_product.unit_input_cost*p_quantity,2);
  v_labor:=round(v_product.unit_labor_cost*p_quantity*(case when p_priority='expedite' then 1.25 else 1 end),2);
  v_total:=v_input+v_labor;
  select balance into v_balance from public.account_balances where game_session_id=p_game_session_id and player_id=p_player_id and account_type=public.business_account_type_v1(v_business.public_key) and currency_code=v_business.currency_code for update;
  if coalesce(v_balance,0)<v_total then raise exception 'PRODUCTION_UNAFFORDABLE' using errcode='P0001'; end if;
  if v_product.unit_input_cost>0 then
    update public.business_inventory set quantity=quantity-p_quantity,version=version+1
    where game_session_id=p_game_session_id and business_id=v_business.id and item_key='input:'||v_product.public_key and quantity>=p_quantity;
    if not found then raise exception 'INSUFFICIENT_INPUT_INVENTORY' using errcode='P0001'; end if;
  end if;
  insert into public.business_production_runs(game_session_id,business_id,product_id,requested_by_player_id,idempotency_key,request_hash,quantity,priority,status,input_cost,labor_cost,total_cost,output_quantity,completed_at)
  values(p_game_session_id,v_business.id,v_product.id,p_player_id,p_idempotency_key,v_hash,p_quantity,p_priority,'completed',v_input,v_labor,v_total,p_quantity,now()) returning * into v_run;
  if v_total>0 then select ledger_entry_id into v_entry from public.record_player_ledger_entry(p_game_session_id,p_player_id,public.business_account_type_v1(v_business.public_key),-v_total,v_business.currency_code,'debit','business','production_cost',v_run.id,'player',p_player_id,jsonb_build_object('business_key',v_business.public_key,'run_key',v_run.public_key)); end if;
  update public.business_production_runs set ledger_entry_id=v_entry where id=v_run.id returning * into v_run;
  insert into public.business_inventory(game_session_id,business_id,item_key,inventory_kind,quantity,unit_cost)
  values(p_game_session_id,v_business.id,'finished:'||v_product.public_key,'finished_good',p_quantity,case when p_quantity>0 then v_total/p_quantity else 0 end)
  on conflict on constraint business_inventory_scope_unique do update set quantity=public.business_inventory.quantity+excluded.quantity,unit_cost=excluded.unit_cost,version=public.business_inventory.version+1;
  update public.business_entities set expense_total=expense_total+v_total,profit_total=profit_total-v_total,version=version+1 where id=v_business.id;
  select balance into v_balance from public.account_balances where game_session_id=p_game_session_id and player_id=p_player_id and account_type=public.business_account_type_v1(v_business.public_key) and currency_code=v_business.currency_code;
  return query select v_run.public_key,v_run.status,v_run.output_quantity,v_run.total_cost,coalesce(v_balance,0),false;
end;
$$;

create or replace function public.settle_business_cycle_v1(
  p_game_session_id uuid,p_business_key text,p_settlement_key text,p_inflation_index numeric,p_exchange_index numeric,p_interest_index numeric,p_difficulty_multiplier numeric
) returns table(business_key text,units_sold integer,gross_revenue numeric,total_expense numeric,net_income numeric,ending_balance numeric,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_business public.business_entities%rowtype; v_product public.business_products%rowtype; v_inventory public.business_inventory%rowtype;
  v_units integer:=0; v_total_units integer:=0; v_gross numeric:=0; v_wages numeric:=0; v_tax numeric:=0; v_net numeric:=0; v_balance numeric:=0;
  v_revenue_entry uuid; v_wage_entry uuid; v_tax_entry uuid; v_tax_rate numeric:=0.08; v_price_factor numeric; v_demand numeric;
begin
  select * into v_business from public.business_entities where game_session_id=p_game_session_id and public_key=lower(btrim(p_business_key)) and status in ('active','distressed','restructuring') for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode='P0001'; end if;
  if exists(select 1 from public.business_sales where game_session_id=p_game_session_id and business_id=v_business.id and settlement_key=p_settlement_key) then
    select coalesce(sum(quantity),0),coalesce(sum(gross_revenue),0),coalesce(sum(wage_expense+tax_expense),0),coalesce(sum(net_income),0)
      into v_total_units,v_gross,v_wages,v_net from public.business_sales where game_session_id=p_game_session_id and business_id=v_business.id and settlement_key=p_settlement_key;
    select balance into v_balance from public.account_balances where game_session_id=p_game_session_id and player_id=v_business.owner_player_id and account_type=public.business_account_type_v1(v_business.public_key) and currency_code=v_business.currency_code;
    return query select v_business.public_key,v_total_units,v_gross,v_wages,v_net,coalesce(v_balance,0),true; return;
  end if;
  v_tax_rate:=coalesce((select nullif(business_market_window->>'businessTaxRate','')::numeric from public.game_settings where game_session_id=p_game_session_id),0.08);
  for v_product in select * from public.business_products where game_session_id=p_game_session_id and business_id=v_business.id and status='active' order by id
  loop
    select * into v_inventory from public.business_inventory where game_session_id=p_game_session_id and business_id=v_business.id and item_key='finished:'||v_product.public_key for update;
    if not found or v_inventory.quantity<=0 then continue; end if;
    v_price_factor:=greatest(0.1,2-(v_product.unit_price/greatest(v_product.reference_price*greatest(coalesce(p_inflation_index,1),0.1),0.01)));
    v_demand:=v_product.base_demand_units*v_business.demand_index*v_price_factor*greatest(coalesce(p_exchange_index,1),0.1)/greatest(coalesce(p_difficulty_multiplier,1),0.1);
    v_units:=least(floor(v_inventory.quantity)::integer,greatest(0,floor(v_demand)::integer));
    if v_units<=0 then continue; end if;
    update public.business_inventory set quantity=quantity-v_units,version=version+1 where id=v_inventory.id;
    insert into public.business_sales(game_session_id,business_id,product_id,settlement_key,quantity,unit_price,gross_revenue,wage_expense,tax_expense,net_income,demand_index)
    values(p_game_session_id,v_business.id,v_product.id,p_settlement_key,v_units,v_product.unit_price,round(v_units*v_product.unit_price,2),0,0,round(v_units*v_product.unit_price,2),v_demand);
    v_total_units:=v_total_units+v_units; v_gross:=v_gross+round(v_units*v_product.unit_price,2);
  end loop;
  v_wages:=coalesce((select sum(wage_per_cycle) from public.business_employees where game_session_id=p_game_session_id and business_id=v_business.id and status='active'),0);
  v_tax:=round(greatest(v_gross,0)*greatest(v_tax_rate,0),2);
  v_net:=v_gross-v_wages-v_tax;
  if v_gross>0 then select ledger_entry_id into v_revenue_entry from public.record_player_ledger_entry(p_game_session_id,v_business.owner_player_id,public.business_account_type_v1(v_business.public_key),v_gross,v_business.currency_code,'credit','business','sales_revenue',v_business.id,'system',null,jsonb_build_object('business_key',v_business.public_key,'settlement_key',p_settlement_key)); end if;
  select balance into v_balance from public.account_balances where game_session_id=p_game_session_id and player_id=v_business.owner_player_id and account_type=public.business_account_type_v1(v_business.public_key) and currency_code=v_business.currency_code for update;
  if v_wages+v_tax>coalesce(v_balance,0)+v_gross then
    update public.business_entities set status='distressed',failure_count=failure_count+1,version=version+1 where id=v_business.id;
    raise exception 'BUSINESS_CYCLE_UNAFFORDABLE' using errcode='P0001';
  end if;
  if v_wages>0 then select ledger_entry_id into v_wage_entry from public.record_player_ledger_entry(p_game_session_id,v_business.owner_player_id,public.business_account_type_v1(v_business.public_key),-v_wages,v_business.currency_code,'debit','business','wage_expense',v_business.id,'system',null,jsonb_build_object('business_key',v_business.public_key,'settlement_key',p_settlement_key)); end if;
  if v_tax>0 then select ledger_entry_id into v_tax_entry from public.record_player_ledger_entry(p_game_session_id,v_business.owner_player_id,public.business_account_type_v1(v_business.public_key),-v_tax,v_business.currency_code,'debit','business','tax_expense',v_business.id,'system',null,jsonb_build_object('business_key',v_business.public_key,'settlement_key',p_settlement_key)); end if;
  update public.business_sales set wage_expense=case when v_total_units>0 then round(v_wages*quantity/v_total_units,2) else 0 end,
    tax_expense=case when v_total_units>0 then round(v_tax*quantity/v_total_units,2) else 0 end,
    net_income=gross_revenue-case when v_total_units>0 then round((v_wages+v_tax)*quantity/v_total_units,2) else 0 end,
    revenue_ledger_entry_id=v_revenue_entry,wage_ledger_entry_id=v_wage_entry,tax_ledger_entry_id=v_tax_entry
    where game_session_id=p_game_session_id and business_id=v_business.id and settlement_key=p_settlement_key;
  update public.business_entities set revenue_total=revenue_total+v_gross,expense_total=expense_total+v_wages+v_tax,profit_total=profit_total+v_net,
    valuation=greatest(0,round((revenue_total+v_gross)*0.35+greatest(profit_total+v_net,0)*3,2)),
    reputation_score=greatest(0,least(100,reputation_score+case when v_net>=0 then 1 else -2 end)),
    status=case when v_net<0 and failure_count>=2 then 'distressed' else status end,version=version+1 where id=v_business.id returning * into v_business;
  select balance into v_balance from public.account_balances where game_session_id=p_game_session_id and player_id=v_business.owner_player_id and account_type=public.business_account_type_v1(v_business.public_key) and currency_code=v_business.currency_code;
  return query select v_business.public_key,v_total_units,v_gross,v_wages+v_tax,v_net,coalesce(v_balance,0),false;
end;
$$;

create or replace function public.transition_business_status_v1(
  p_game_session_id uuid,p_player_id uuid,p_business_key text,p_transition text,p_reason text,p_idempotency_key text
) returns table(business_key text,status text,failure_count integer,closed_at timestamptz,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_business public.business_entities%rowtype; v_target text;
begin
  select * into v_business from public.business_entities where game_session_id=p_game_session_id and public_key=lower(btrim(p_business_key)) and owner_player_id=p_player_id for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode='P0001'; end if;
  if exists(select 1 from public.audit_log where game_session_id=p_game_session_id and action='business.status.transition' and target_id=v_business.id and metadata->>'idempotency_key'=p_idempotency_key) then return query select v_business.public_key,v_business.status,v_business.failure_count,v_business.closed_at,true; return; end if;
  v_target:=case lower(btrim(p_transition)) when 'restructure' then 'restructuring' when 'recover' then 'active' when 'close' then 'closed' else null end;
  if v_target is null then raise exception 'BUSINESS_TRANSITION_INVALID' using errcode='P0001'; end if;
  if v_business.status='closed' and v_target<>'closed' then raise exception 'CLOSED_BUSINESS_IMMUTABLE' using errcode='P0001'; end if;
  update public.business_entities set status=v_target,closed_at=case when v_target='closed' then now() else null end,
    failure_count=case when v_target='active' then greatest(failure_count-1,0) else failure_count end,version=version+1 where id=v_business.id returning * into v_business;
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata)
  values(p_game_session_id,'player',p_player_id,'business.status.transition','business',v_business.id,jsonb_build_object('idempotency_key',p_idempotency_key,'transition',p_transition,'reason',left(btrim(coalesce(p_reason,'')),500),'status',v_business.status));
  return query select v_business.public_key,v_business.status,v_business.failure_count,v_business.closed_at,false;
end;
$$;

create or replace function public.recalculate_player_credit_v1(p_game_session_id uuid,p_player_id uuid)
returns table(score integer,on_time_payment_rate numeric,savings_ratio numeric,income_stability numeric,transfer_anomaly_count integer,delinquency_count integer,default_count integer,model_version text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_cash numeric:=0; v_savings numeric:=0; v_credits numeric:=0; v_credit_count integer:=0; v_mean numeric:=0; v_variance numeric:=0;
  v_paid integer:=0; v_on_time integer:=0; v_delinquent integer:=0; v_defaults integer:=0; v_anomalies integer:=0;
  v_on_time_rate numeric:=1; v_savings_ratio numeric:=0; v_stability numeric:=0; v_score integer:=600; v_profile public.credit_profiles%rowtype;
begin
  select coalesce(sum(balance) filter(where account_type='cash'),0),coalesce(sum(balance) filter(where account_type='savings'),0)
    into v_cash,v_savings from public.account_balances where game_session_id=p_game_session_id and player_id=p_player_id;
  select count(*),count(*) filter(where lp.created_at<=pl.next_due_at),count(*) filter(where pl.status='delinquent')
    into v_paid,v_on_time,v_delinquent from public.loan_payments lp join public.player_loans pl on pl.id=lp.loan_id
    where lp.game_session_id=p_game_session_id and lp.player_id=p_player_id and lp.status='posted';
  select count(*) into v_defaults from public.player_loans where game_session_id=p_game_session_id and player_id=p_player_id and status='defaulted';
  select count(*) into v_anomalies from public.banking_transfer_requests where game_session_id=p_game_session_id and sender_player_id=p_player_id and status in ('rejected','reversed');
  select coalesce(sum(amount),0),count(*) into v_credits,v_credit_count from public.ledger_entries where game_session_id=p_game_session_id and player_id=p_player_id and amount>0 and created_at>=now()-interval '90 days';
  if v_credit_count>0 then v_mean:=v_credits/v_credit_count; end if;
  select coalesce(avg(power(amount-v_mean,2)),0) into v_variance from public.ledger_entries where game_session_id=p_game_session_id and player_id=p_player_id and amount>0 and created_at>=now()-interval '90 days';
  v_on_time_rate:=case when v_paid=0 then 1 else least(1,greatest(0,v_on_time::numeric/v_paid)) end;
  v_savings_ratio:=case when v_cash+v_savings<=0 then 0 else least(1,greatest(0,v_savings/(v_cash+v_savings))) end;
  v_stability:=case when v_mean<=0 then 0 else least(1,greatest(0,1-sqrt(v_variance)/greatest(v_mean,1))) end;
  v_score:=greatest(300,least(850,round(520+v_on_time_rate*140+v_savings_ratio*80+v_stability*70-v_anomalies*10-v_delinquent*35-v_defaults*120)::integer));
  insert into public.credit_profiles(game_session_id,player_id,score,on_time_payment_rate,savings_ratio,income_stability,transfer_anomaly_count,delinquency_count,default_count,model_version,calculated_at)
  values(p_game_session_id,p_player_id,v_score,v_on_time_rate,v_savings_ratio,v_stability,v_anomalies,v_delinquent,v_defaults,'economic-behavior-v1',now())
  on conflict on constraint credit_profiles_scope_unique do update set score=excluded.score,on_time_payment_rate=excluded.on_time_payment_rate,savings_ratio=excluded.savings_ratio,
    income_stability=excluded.income_stability,transfer_anomaly_count=excluded.transfer_anomaly_count,delinquency_count=excluded.delinquency_count,default_count=excluded.default_count,calculated_at=excluded.calculated_at
  returning * into v_profile;
  return query select v_profile.score,v_profile.on_time_payment_rate,v_profile.savings_ratio,v_profile.income_stability,v_profile.transfer_anomaly_count,v_profile.delinquency_count,v_profile.default_count,v_profile.model_version;
end;
$$;

create or replace function public.apply_player_loan_v1(
  p_game_session_id uuid,p_player_id uuid,p_offer_key text,p_business_key text,p_amount numeric,p_purpose text,p_repayment_source text,p_idempotency_key text
) returns table(application_key text,status text,credit_score integer,projected_payment numeric,affordability_ratio numeric,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_product public.loan_products%rowtype; v_business public.business_entities%rowtype; v_profile record; v_application public.loan_applications%rowtype;
  v_hash text; v_income numeric:=0; v_payment numeric; v_ratio numeric;
begin
  select * into v_product from public.loan_products where game_session_id=p_game_session_id and public_key=lower(btrim(p_offer_key)) and status='active';
  if not found then raise exception 'LOAN_PRODUCT_NOT_FOUND' using errcode='P0001'; end if;
  if p_amount<v_product.minimum_amount or p_amount>v_product.maximum_amount then raise exception 'LOAN_AMOUNT_OUT_OF_RANGE' using errcode='P0001'; end if;
  if v_product.borrower_type='business' then
    select * into v_business from public.business_entities where game_session_id=p_game_session_id and public_key=lower(btrim(coalesce(p_business_key,''))) and owner_player_id=p_player_id and status in ('active','restructuring');
    if not found then raise exception 'AUTHORITATIVE_BUSINESS_BORROWER_REQUIRED' using errcode='P0001'; end if;
  elsif nullif(btrim(coalesce(p_business_key,'')),'') is not null then raise exception 'BUSINESS_NOT_ALLOWED_FOR_PRODUCT' using errcode='P0001';
  end if;
  v_hash:=encode(digest(concat_ws('|',p_game_session_id,p_player_id,v_product.id,coalesce(v_business.id::text,''),p_amount,p_purpose,p_repayment_source),'sha256'),'hex');
  select * into v_application from public.loan_applications where game_session_id=p_game_session_id and player_id=p_player_id and idempotency_key=p_idempotency_key;
  if found then
    if v_application.request_hash<>v_hash then raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode='P0001'; end if;
    return query select v_application.public_key,v_application.status,v_application.credit_score,v_application.projected_payment,v_application.affordability_ratio,true; return;
  end if;
  select * into v_profile from public.recalculate_player_credit_v1(p_game_session_id,p_player_id);
  if v_profile.score<v_product.minimum_credit_score then raise exception 'CREDIT_SCORE_INELIGIBLE' using errcode='P0001'; end if;
  v_payment:=round((p_amount*(1+v_product.annual_rate*(v_product.term_cycles/12.0))+p_amount*v_product.origination_fee_rate)/v_product.term_cycles,2);
  select coalesce(sum(amount),0)/3 into v_income from public.ledger_entries where game_session_id=p_game_session_id and player_id=p_player_id and amount>0 and created_at>=now()-interval '90 days';
  v_ratio:=case when v_income<=0 then 100 else v_payment/v_income end;
  if v_ratio>v_product.maximum_payment_to_income then raise exception 'LOAN_UNAFFORDABLE' using errcode='P0001'; end if;
  insert into public.loan_applications(game_session_id,player_id,business_id,loan_product_id,amount,purpose,repayment_source,credit_score,projected_payment,affordability_ratio,status,idempotency_key,request_hash)
  values(p_game_session_id,p_player_id,v_business.id,v_product.id,round(p_amount,2),left(btrim(p_purpose),240),left(btrim(p_repayment_source),1000),v_profile.score,v_payment,v_ratio,'pending_review',p_idempotency_key,v_hash)
  returning * into v_application;
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata)
  values(p_game_session_id,'player',p_player_id,'loan.application.submit','loan_application',v_application.id,jsonb_build_object('application_key',v_application.public_key,'offer_key',v_product.public_key,'amount',v_application.amount,'credit_model','economic-behavior-v1'));
  return query select v_application.public_key,v_application.status,v_application.credit_score,v_application.projected_payment,v_application.affordability_ratio,false;
end;
$$;

create or replace function public.review_player_loan_application_v1(
  p_game_session_id uuid,p_staff_user_id uuid,p_application_key text,p_decision text,p_reason text,p_idempotency_key text
) returns table(application_key text,status text,loan_key text,principal numeric,scheduled_payment numeric,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_application public.loan_applications%rowtype; v_product public.loan_products%rowtype; v_loan public.player_loans%rowtype; v_fee numeric; v_disbursement numeric; v_entry uuid; v_account text:='cash';
begin
  if not exists(select 1 from public.game_sessions where id=p_game_session_id and owner_staff_user_id=p_staff_user_id) then raise exception 'STAFF_GAME_ACCESS_DENIED' using errcode='P0001'; end if;
  select * into v_application from public.loan_applications where game_session_id=p_game_session_id and public_key=lower(btrim(p_application_key)) for update;
  if not found then raise exception 'LOAN_APPLICATION_NOT_FOUND' using errcode='P0001'; end if;
  select * into v_product from public.loan_products where id=v_application.loan_product_id;
  if v_application.status in ('approved','declined') then
    select * into v_loan from public.player_loans where application_id=v_application.id;
    return query select v_application.public_key,v_application.status,v_loan.public_key,v_loan.original_principal,v_loan.scheduled_payment,true; return;
  end if;
  if lower(btrim(p_decision))='decline' then
    update public.loan_applications set status='declined',reviewed_by_staff_user_id=p_staff_user_id,reviewed_at=now(),review_reason=left(btrim(coalesce(p_reason,'')),1000) where id=v_application.id returning * into v_application;
    insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata) values(p_game_session_id,'staff_user',p_staff_user_id,'loan.application.decline','loan_application',v_application.id,jsonb_build_object('idempotency_key',p_idempotency_key,'reason',v_application.review_reason));
    return query select v_application.public_key,v_application.status,null::text,null::numeric,null::numeric,false; return;
  elsif lower(btrim(p_decision))<>'approve' then raise exception 'LOAN_REVIEW_DECISION_INVALID' using errcode='P0001'; end if;
  if v_product.borrower_type='business' then
    if not exists(select 1 from public.business_entities where id=v_application.business_id and game_session_id=p_game_session_id and owner_player_id=v_application.player_id and status in ('active','restructuring')) then raise exception 'AUTHORITATIVE_BUSINESS_BORROWER_REQUIRED' using errcode='P0001'; end if;
    select public.business_account_type_v1(public_key) into v_account from public.business_entities where id=v_application.business_id;
  end if;
  v_fee:=round(v_application.amount*v_product.origination_fee_rate,2); v_disbursement:=v_application.amount-v_fee;
  insert into public.player_loans(game_session_id,player_id,business_id,loan_product_id,application_id,currency_code,original_principal,principal_balance,annual_rate,origination_fee,scheduled_payment,status,next_due_at)
  values(p_game_session_id,v_application.player_id,v_application.business_id,v_product.id,v_application.id,v_product.currency_code,v_application.amount,v_application.amount,v_product.annual_rate,v_fee,v_application.projected_payment,'active',now()+make_interval(days=>greatest(v_product.payment_frequency_cycles,1)*7))
  returning * into v_loan;
  select ledger_entry_id into v_entry from public.record_player_ledger_entry(p_game_session_id,v_application.player_id,v_account,v_disbursement,v_product.currency_code,'credit','loans','loan_disbursement',v_loan.id,'staff_user',p_staff_user_id,jsonb_build_object('loan_key',v_loan.public_key,'application_key',v_application.public_key,'origination_fee',v_fee));
  update public.player_loans set disbursement_ledger_entry_id=v_entry where id=v_loan.id returning * into v_loan;
  update public.loan_applications set status='approved',reviewed_by_staff_user_id=p_staff_user_id,reviewed_at=now(),review_reason=left(btrim(coalesce(p_reason,'Approved')),1000) where id=v_application.id returning * into v_application;
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata) values(p_game_session_id,'staff_user',p_staff_user_id,'loan.application.approve','loan',v_loan.id,jsonb_build_object('idempotency_key',p_idempotency_key,'loan_key',v_loan.public_key,'application_key',v_application.public_key,'principal',v_loan.original_principal));
  return query select v_application.public_key,v_application.status,v_loan.public_key,v_loan.original_principal,v_loan.scheduled_payment,false;
end;
$$;

create or replace function public.repay_player_loan_v1(
  p_game_session_id uuid,p_player_id uuid,p_loan_key text,p_amount numeric,p_idempotency_key text
) returns table(payment_key text,loan_key text,status text,principal_balance numeric,accrued_interest numeric,next_due_at timestamptz,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_loan public.player_loans%rowtype; v_product public.loan_products%rowtype; v_payment public.loan_payments%rowtype;
  v_hash text; v_days numeric; v_interest_accrual numeric; v_total_due numeric; v_pay numeric; v_interest_paid numeric; v_principal_paid numeric; v_balance numeric:=0; v_entry uuid; v_account text:='cash';
begin
  select * into v_loan from public.player_loans where game_session_id=p_game_session_id and player_id=p_player_id and public_key=lower(btrim(p_loan_key)) for update;
  if not found then raise exception 'LOAN_NOT_FOUND' using errcode='P0001'; end if;
  if v_loan.status not in ('active','delinquent','restructured') then raise exception 'LOAN_NOT_PAYABLE' using errcode='P0001'; end if;
  select * into v_product from public.loan_products where id=v_loan.loan_product_id;
  v_hash:=encode(digest(concat_ws('|',p_game_session_id,p_player_id,v_loan.id,p_amount),'sha256'),'hex');
  select * into v_payment from public.loan_payments where game_session_id=p_game_session_id and player_id=p_player_id and loan_id=v_loan.id and idempotency_key=p_idempotency_key;
  if found then
    if v_payment.request_hash<>v_hash then raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode='P0001'; end if;
    return query select v_payment.public_key,v_loan.public_key,v_loan.status,v_loan.principal_balance,v_loan.accrued_interest,v_loan.next_due_at,true; return;
  end if;
  v_days:=greatest(0,extract(epoch from (now()-v_loan.last_accrued_at))/86400);
  v_interest_accrual:=round(v_loan.principal_balance*v_loan.annual_rate*v_days/365,2);
  v_loan.accrued_interest:=v_loan.accrued_interest+v_interest_accrual;
  v_total_due:=v_loan.principal_balance+v_loan.accrued_interest;
  if p_amount is null or p_amount<=0 then raise exception 'PAYMENT_AMOUNT_INVALID' using errcode='P0001'; end if;
  v_pay:=least(round(p_amount,2),v_total_due);
  if v_loan.business_id is not null then select public.business_account_type_v1(public_key) into v_account from public.business_entities where id=v_loan.business_id; end if;
  select balance into v_balance from public.account_balances where game_session_id=p_game_session_id and player_id=p_player_id and account_type=v_account and currency_code=v_loan.currency_code for update;
  if coalesce(v_balance,0)<v_pay then raise exception 'INSUFFICIENT_FUNDS' using errcode='P0001'; end if;
  v_interest_paid:=least(v_pay,v_loan.accrued_interest); v_principal_paid:=v_pay-v_interest_paid;
  select ledger_entry_id into v_entry from public.record_player_ledger_entry(p_game_session_id,p_player_id,v_account,-v_pay,v_loan.currency_code,'debit','loans','loan_payment',v_loan.id,'player',p_player_id,jsonb_build_object('loan_key',v_loan.public_key,'interest_paid',v_interest_paid,'principal_paid',v_principal_paid));
  insert into public.loan_payments(game_session_id,player_id,loan_id,amount,principal_amount,interest_amount,idempotency_key,request_hash,ledger_entry_id,status)
  values(p_game_session_id,p_player_id,v_loan.id,v_pay,v_principal_paid,v_interest_paid,p_idempotency_key,v_hash,v_entry,'posted') returning * into v_payment;
  update public.player_loans set principal_balance=greatest(0,principal_balance-v_principal_paid),accrued_interest=greatest(0,v_loan.accrued_interest-v_interest_paid),last_accrued_at=now(),
    status=case when principal_balance-v_principal_paid<=0.005 and v_loan.accrued_interest-v_interest_paid<=0.005 then 'paid' else 'active' end,
    next_due_at=case when principal_balance-v_principal_paid<=0.005 then next_due_at else now()+make_interval(days=>greatest(v_product.payment_frequency_cycles,1)*7) end,
    closed_at=case when principal_balance-v_principal_paid<=0.005 and v_loan.accrued_interest-v_interest_paid<=0.005 then now() else null end,
    delinquent_at=null where id=v_loan.id returning * into v_loan;
  perform public.recalculate_player_credit_v1(p_game_session_id,p_player_id);
  return query select v_payment.public_key,v_loan.public_key,v_loan.status,v_loan.principal_balance,v_loan.accrued_interest,v_loan.next_due_at,false;
end;
$$;

create or replace function public.service_player_loan_status_v1(p_game_session_id uuid,p_as_of timestamptz default now())
returns table(loans_accrued integer,loans_delinquent integer,loans_defaulted integer) language plpgsql security definer set search_path=public,pg_temp as $$
declare v_loan public.player_loans%rowtype; v_product public.loan_products%rowtype; v_days numeric; v_interest numeric; v_accrued integer:=0; v_delinquent integer:=0; v_defaulted integer:=0;
begin
  for v_loan in select * from public.player_loans where game_session_id=p_game_session_id and status in ('active','delinquent','restructured') order by id for update
  loop
    select * into v_product from public.loan_products where id=v_loan.loan_product_id;
    v_days:=greatest(0,extract(epoch from (p_as_of-v_loan.last_accrued_at))/86400);
    v_interest:=round(v_loan.principal_balance*v_loan.annual_rate*v_days/365,2);
    if v_interest>0 then update public.player_loans set accrued_interest=accrued_interest+v_interest,last_accrued_at=p_as_of where id=v_loan.id; v_accrued:=v_accrued+1; end if;
    if p_as_of>v_loan.next_due_at+make_interval(days=>v_product.default_after_days) then
      update public.player_loans set status='defaulted',defaulted_at=coalesce(defaulted_at,p_as_of) where id=v_loan.id; v_defaulted:=v_defaulted+1;
    elsif p_as_of>v_loan.next_due_at+make_interval(days=>v_product.delinquency_grace_days) and v_loan.status<>'delinquent' then
      update public.player_loans set status='delinquent',delinquent_at=coalesce(delinquent_at,p_as_of) where id=v_loan.id; v_delinquent:=v_delinquent+1;
    end if;
  end loop;
  for v_loan in select * from public.player_loans where game_session_id=p_game_session_id and status in ('delinquent','defaulted') loop perform public.recalculate_player_credit_v1(p_game_session_id,v_loan.player_id); end loop;
  return query select v_accrued,v_delinquent,v_defaulted;
end;
$$;

create or replace function public.admin_business_banking_correction_v1(
  p_game_session_id uuid,p_staff_user_id uuid,p_player_id uuid,p_account_type text,p_currency_code text,p_amount numeric,
  p_target_type text,p_target_public_key text,p_reason text,p_idempotency_key text
) returns table(ledger_entry_id uuid,balance numeric,currency_code text,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_existing public.audit_log%rowtype; v_entry record;
begin
  if not exists(select 1 from public.game_sessions where id=p_game_session_id and owner_staff_user_id=p_staff_user_id) then raise exception 'STAFF_GAME_ACCESS_DENIED' using errcode='P0001'; end if;
  if p_amount is null or p_amount=0 or abs(p_amount)>10000000 then raise exception 'CORRECTION_AMOUNT_INVALID' using errcode='P0001'; end if;
  if length(btrim(coalesce(p_reason,'')))<8 then raise exception 'CORRECTION_REASON_REQUIRED' using errcode='P0001'; end if;
  select * into v_existing from public.audit_log where game_session_id=p_game_session_id and actor_id=p_staff_user_id and action='admin.business_banking.correction' and metadata->>'idempotency_key'=p_idempotency_key;
  if found then
    select le.id,ab.balance,ab.currency_code into v_entry from public.ledger_entries le join public.account_balances ab on ab.last_ledger_entry_id=le.id where le.id=(v_existing.metadata->>'ledger_entry_id')::uuid;
    return query select v_entry.id,v_entry.balance,v_entry.currency_code,true; return;
  end if;
  select * into v_entry from public.record_player_ledger_entry(p_game_session_id,p_player_id,btrim(p_account_type),round(p_amount,2),upper(btrim(p_currency_code)),'adjustment','admin','business_banking_correction',null,'staff_user',p_staff_user_id,jsonb_build_object('target_type',p_target_type,'target_public_key',p_target_public_key,'reason',left(btrim(p_reason),1000),'idempotency_key',p_idempotency_key));
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata)
  values(p_game_session_id,'staff_user',p_staff_user_id,'admin.business_banking.correction',p_target_type,p_player_id,jsonb_build_object('ledger_entry_id',v_entry.ledger_entry_id,'target_public_key',p_target_public_key,'reason',left(btrim(p_reason),1000),'idempotency_key',p_idempotency_key));
  return query select v_entry.ledger_entry_id,v_entry.balance,v_entry.currency_code,false;
end;
$$;

-- Public schemas are reachable by the Data API in some project configurations.
-- These tables are server-only and forced through trusted Edge/RPC boundaries.
do $$
declare v_table text; begin
  foreach v_table in array array[
    'business_entities','business_products','business_inventory','business_employees','business_production_runs','business_sales',
    'banking_transfer_requests','savings_interest_runs','loan_products','credit_profiles','loan_applications','player_loans','loan_payments'
  ] loop
    execute format('alter table public.%I enable row level security',v_table);
    execute format('alter table public.%I force row level security',v_table);
    execute format('revoke all on table public.%I from public, anon, authenticated',v_table);
    execute format('grant select, insert, update, delete on table public.%I to service_role',v_table);
  end loop;
end $$;

revoke all on function public.business_account_type_v1(text) from public,anon,authenticated;
grant execute on function public.business_account_type_v1(text) to service_role;

revoke all on function public.execute_player_transfer_v1(uuid,uuid,text,numeric,text,text,text) from public,anon,authenticated;
grant execute on function public.execute_player_transfer_v1(uuid,uuid,text,numeric,text,text,text) to service_role;
revoke all on function public.execute_player_account_transfer_v1(uuid,uuid,text,text,numeric,text,text,text) from public,anon,authenticated;
grant execute on function public.execute_player_account_transfer_v1(uuid,uuid,text,text,numeric,text,text,text) to service_role;
revoke all on function public.accrue_player_savings_interest_v1(uuid,date,numeric,numeric) from public,anon,authenticated;
grant execute on function public.accrue_player_savings_interest_v1(uuid,date,numeric,numeric) to service_role;
revoke all on function public.create_or_acquire_player_business_v1(uuid,uuid,text,text,text,text,text,numeric,text,text) from public,anon,authenticated;
grant execute on function public.create_or_acquire_player_business_v1(uuid,uuid,text,text,text,text,text,numeric,text,text) to service_role;
revoke all on function public.set_business_product_price_v1(uuid,uuid,text,text,numeric,integer,text) from public,anon,authenticated;
grant execute on function public.set_business_product_price_v1(uuid,uuid,text,text,numeric,integer,text) to service_role;
revoke all on function public.hire_business_employee_v1(uuid,uuid,text,text,text,text,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.hire_business_employee_v1(uuid,uuid,text,text,text,text,numeric,numeric,text) to service_role;
revoke all on function public.terminate_business_employee_v1(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.terminate_business_employee_v1(uuid,uuid,text,text,text,text) to service_role;
revoke all on function public.run_business_production_v1(uuid,uuid,text,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.run_business_production_v1(uuid,uuid,text,text,integer,text,text) to service_role;
revoke all on function public.settle_business_cycle_v1(uuid,text,text,numeric,numeric,numeric,numeric) from public,anon,authenticated;
grant execute on function public.settle_business_cycle_v1(uuid,text,text,numeric,numeric,numeric,numeric) to service_role;
revoke all on function public.transition_business_status_v1(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.transition_business_status_v1(uuid,uuid,text,text,text,text) to service_role;
revoke all on function public.recalculate_player_credit_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.recalculate_player_credit_v1(uuid,uuid) to service_role;
revoke all on function public.apply_player_loan_v1(uuid,uuid,text,text,numeric,text,text,text) from public,anon,authenticated;
grant execute on function public.apply_player_loan_v1(uuid,uuid,text,text,numeric,text,text,text) to service_role;
revoke all on function public.review_player_loan_application_v1(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.review_player_loan_application_v1(uuid,uuid,text,text,text,text) to service_role;
revoke all on function public.repay_player_loan_v1(uuid,uuid,text,numeric,text) from public,anon,authenticated;
grant execute on function public.repay_player_loan_v1(uuid,uuid,text,numeric,text) to service_role;
revoke all on function public.service_player_loan_status_v1(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.service_player_loan_status_v1(uuid,timestamptz) to service_role;
revoke all on function public.admin_business_banking_correction_v1(uuid,uuid,uuid,text,text,numeric,text,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_business_banking_correction_v1(uuid,uuid,uuid,text,text,numeric,text,text,text,text) to service_role;

comment on table public.business_entities is 'Authoritative game-scoped business lifecycle. Monetary state is projected through ledger-backed account types.';
comment on table public.banking_transfer_requests is 'Idempotent transfer command and audit state; actual money movement is authoritative only in ledger_entries.';
comment on table public.credit_profiles is 'Creditworthiness derived only from economic behavior. Sensitive demographic attributes are prohibited.';
comment on table public.player_loans is 'Authoritative loan lifecycle linked to append-only disbursement and repayment ledger entries.';

commit;
