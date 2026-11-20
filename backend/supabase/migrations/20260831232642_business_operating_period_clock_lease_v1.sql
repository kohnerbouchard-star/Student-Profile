-- Business V2 Phase 11: guarded seven-day operating/payroll periods and leases.
--
-- The logical period is anchored to the existing Business payroll clock.  This
-- migration adds an append-only policy snapshot and a due-work lease; it does
-- not install a scheduler or expose a browser mutation surface.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

-- Close the inter-migration deployment window before changing payroll storage.
-- M3 replaces and re-grants these signatures as stable retirement wrappers.
revoke execute on function public.settle_business_cycle_v1(
  uuid, text, text, numeric, numeric, numeric, numeric
) from service_role;
revoke execute on function public.settle_business_payroll_current_period_v2(
  uuid, text, text
) from service_role;
revoke execute on function public.recover_business_payroll_run_v2(
  uuid, text, text, text
) from service_role;

create table public.business_operating_period_policies (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'bopp_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  policy_version bigint not null,
  period_duration_seconds integer not null,
  gross_receipts_tax_rate numeric(20,18) not null,
  claim_lease_seconds integer not null,
  effective_for_periods_opened_at timestamptz not null,
  supersedes_policy_id uuid null,
  source_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),

  constraint business_operating_period_policies_scope_id_unique
    unique (game_session_id, id),
  constraint business_operating_period_policies_scope_version_unique
    unique (game_session_id, policy_version),
  constraint business_operating_period_policies_public_key_check
    check (public_key ~ '^bopp_[0-9a-f]{32}$'),
  constraint business_operating_period_policies_version_check
    check (policy_version between 1 and 9223372036854775806),
  constraint business_operating_period_policies_duration_check
    check (period_duration_seconds between 3600 and 31536000),
  constraint business_operating_period_policies_tax_rate_check
    check (gross_receipts_tax_rate between 0 and 1),
  constraint business_operating_period_policies_lease_check
    check (claim_lease_seconds between 30 and 900),
  constraint business_operating_period_policies_source_check
    check (source_type ~ '^[a-z][a-z0-9._:-]{1,95}$'),
  constraint business_operating_period_policies_metadata_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint business_operating_period_policies_supersedes_scope_fk
    foreign key (game_session_id, supersedes_policy_id)
    references public.business_operating_period_policies(game_session_id, id)
    on delete restrict
);

create index business_operating_period_policies_effective_idx
  on public.business_operating_period_policies(
    game_session_id,
    effective_for_periods_opened_at desc,
    policy_version desc
  );

create index business_operating_period_policies_supersedes_idx
  on public.business_operating_period_policies(
    game_session_id, supersedes_policy_id
  ) where supersedes_policy_id is not null;

alter table public.business_operating_period_policies enable row level security;
alter table public.business_operating_period_policies force row level security;
revoke all on table public.business_operating_period_policies
  from public, anon, authenticated, service_role;
grant select on table public.business_operating_period_policies to service_role;

create or replace function private.guard_business_operating_period_policy_v1()
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

  raise exception 'BUSINESS_OPERATING_PERIOD_POLICY_IMMUTABLE'
    using errcode = '42501';
end;
$function$;

revoke all on function private.guard_business_operating_period_policy_v1()
  from public, anon, authenticated, service_role;

create trigger guard_business_operating_period_policy_v1
before update or delete on public.business_operating_period_policies
for each row execute function private.guard_business_operating_period_policy_v1();

-- The legacy game setting is server-owned configuration.  A malformed or
-- missing legacy value does not get to author a rate: it converges to 8%.
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
)
select
  game_row.id,
  1,
  604800,
  case
    when jsonb_typeof(
      coalesce(settings_row.business_market_window, '{}'::jsonb)
        -> 'businessTaxRate'
    ) = 'number'
     and coalesce(
       settings_row.business_market_window ->> 'businessTaxRate', ''
     ) ~ '^-?[0-9]+([.][0-9]+)?$'
    then least(
      0.25::numeric,
      greatest(
        0::numeric,
        (settings_row.business_market_window ->> 'businessTaxRate')::numeric
      )
    )
    else 0.08::numeric
  end,
  300,
  clock_timestamp(),
  null,
  'phase11_cutover',
  jsonb_build_object(
    'authority', 'business-operating-period-policy-v1',
    'cadence', 'seven-days',
    'legacyRateFallback', '0.08'
  )
from public.game_sessions as game_row
left join public.game_settings as settings_row
  on settings_row.game_session_id = game_row.id
on conflict (game_session_id, policy_version) do nothing;

create or replace function private.resolve_business_operating_period_policy_v1(
  p_game_session_id uuid,
  p_opened_at timestamptz
)
returns public.business_operating_period_policies
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_policy public.business_operating_period_policies%rowtype;
begin
  if p_game_session_id is null or p_opened_at is null then
    raise exception 'BUSINESS_OPERATING_PERIOD_POLICY_SCOPE_REQUIRED'
      using errcode = '22023';
  end if;

  select policy_row.*
  into v_policy
  from public.business_operating_period_policies as policy_row
  where policy_row.game_session_id = p_game_session_id
    and policy_row.effective_for_periods_opened_at <= p_opened_at
  order by
    policy_row.effective_for_periods_opened_at desc,
    policy_row.policy_version desc,
    policy_row.id
  limit 1;

  if not found then
    raise exception 'BUSINESS_OPERATING_PERIOD_POLICY_MISSING'
      using errcode = 'P0001';
  end if;

  return v_policy;
end;
$function$;

revoke all on function private.resolve_business_operating_period_policy_v1(
  uuid, timestamptz
) from public, anon, authenticated, service_role;

-- Games may be created after this migration.  The first server-owned clock
-- operation lazily installs the same bounded v1 default used at cutover; the
-- unique game/version constraint makes concurrent initialization idempotent.
create or replace function private.ensure_business_operating_period_policy_v1(
  p_game_session_id uuid,
  p_opened_at timestamptz
)
returns public.business_operating_period_policies
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_policy public.business_operating_period_policies%rowtype;
  v_effective_at timestamptz;
begin
  if p_game_session_id is null or p_opened_at is null then
    raise exception 'BUSINESS_OPERATING_PERIOD_POLICY_SCOPE_REQUIRED'
      using errcode = '22023';
  end if;

  select game_row.created_at
  into v_effective_at
  from public.game_sessions as game_row
  where game_row.id = p_game_session_id;
  if not found then
    raise exception 'GAME_SESSION_NOT_FOUND' using errcode = 'P0001';
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
  )
  select
    p_game_session_id,
    1,
    604800,
    case
      when jsonb_typeof(
        coalesce(settings_row.business_market_window, '{}'::jsonb)
          -> 'businessTaxRate'
      ) = 'number'
       and coalesce(
         settings_row.business_market_window ->> 'businessTaxRate', ''
       ) ~ '^-?[0-9]+([.][0-9]+)?$'
      then least(
        0.25::numeric,
        greatest(
          0::numeric,
          (settings_row.business_market_window ->> 'businessTaxRate')::numeric
        )
      )
      else 0.08::numeric
    end,
    300,
    v_effective_at,
    null,
    'phase11_lazy_game_default',
    jsonb_build_object(
      'authority', 'business-operating-period-policy-v1',
      'cadence', 'seven-days',
      'legacyRateFallback', '0.08'
    )
  from (select 1) as singleton
  left join public.game_settings as settings_row
    on settings_row.game_session_id = p_game_session_id
  where not exists (
    select 1
    from public.business_operating_period_policies as existing_policy
    where existing_policy.game_session_id = p_game_session_id
  )
  on conflict (game_session_id, policy_version) do nothing;

  v_policy := private.resolve_business_operating_period_policy_v1(
    p_game_session_id, p_opened_at
  );
  return v_policy;
end;
$function$;

revoke all on function private.ensure_business_operating_period_policy_v1(
  uuid, timestamptz
) from public, anon, authenticated, service_role;

alter table public.business_payroll_clocks
  add column period_policy_id uuid null,
  add column period_opened_at timestamptz null,
  add column period_duration_seconds integer null,
  add column gross_receipts_tax_rate numeric(20,18) null,
  add column next_due_at timestamptz null;

-- Preserve existing logical period identity exactly.  The policy is pinned at
-- cutover and the first due time is derived from the retained start, never from
-- migration wall-clock time.
update public.business_payroll_clocks as clock_row
set period_policy_id = policy_row.id,
    period_opened_at = clock_timestamp(),
    period_duration_seconds = policy_row.period_duration_seconds,
    gross_receipts_tax_rate = policy_row.gross_receipts_tax_rate,
    next_due_at = clock_row.period_started_at
      + make_interval(secs => policy_row.period_duration_seconds)
from public.business_operating_period_policies as policy_row
where policy_row.game_session_id = clock_row.game_session_id
  and policy_row.policy_version = 1;

-- A legacy non-closed Business without a clock starts at its authoritative
-- formation timestamp.  Overdue periods are deliberately not skipped.
insert into public.business_payroll_clocks (
  game_session_id,
  business_id,
  current_period_number,
  period_started_at,
  last_settled_at,
  version,
  period_policy_id,
  period_opened_at,
  period_duration_seconds,
  gross_receipts_tax_rate,
  next_due_at
)
select
  business_row.game_session_id,
  business_row.id,
  1,
  business_row.created_at,
  null,
  1,
  policy_row.id,
  clock_timestamp(),
  policy_row.period_duration_seconds,
  policy_row.gross_receipts_tax_rate,
  business_row.created_at
    + make_interval(secs => policy_row.period_duration_seconds)
from public.business_entities as business_row
join public.business_operating_period_policies as policy_row
  on policy_row.game_session_id = business_row.game_session_id
 and policy_row.policy_version = 1
where business_row.status <> 'closed'
on conflict (game_session_id, business_id) do nothing;

alter table public.business_payroll_clocks
  alter column period_policy_id set not null,
  alter column period_opened_at set not null,
  alter column period_duration_seconds set not null,
  alter column gross_receipts_tax_rate set not null,
  alter column next_due_at set not null,
  add constraint business_payroll_clocks_policy_scope_fk
    foreign key (game_session_id, period_policy_id)
    references public.business_operating_period_policies(game_session_id, id)
    on delete restrict,
  add constraint business_payroll_clocks_duration_check
    check (period_duration_seconds between 3600 and 31536000),
  add constraint business_payroll_clocks_tax_rate_check
    check (gross_receipts_tax_rate between 0 and 1),
  add constraint business_payroll_clocks_due_check
    check (
      next_due_at = period_started_at
        + make_interval(secs => period_duration_seconds)
      and next_due_at > period_started_at
    );

create index business_payroll_clocks_due_idx
  on public.business_payroll_clocks(next_due_at, business_id);

create index business_payroll_clocks_policy_idx
  on public.business_payroll_clocks(game_session_id, period_policy_id);

revoke all on table public.business_payroll_clocks
  from public, anon, authenticated, service_role;
grant select on table public.business_payroll_clocks to service_role;

create table public.business_operating_period_claims (
  id uuid primary key default extensions.gen_random_uuid(),
  public_key text not null unique default (
    'bocl_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  policy_id uuid not null,
  period_number bigint not null,
  payroll_period_key text not null,
  period_started_at timestamptz not null,
  due_at timestamptz not null,
  period_duration_seconds integer not null,
  payroll_clock_version bigint not null,
  claim_attempt integer not null,
  lease_token uuid not null unique default extensions.gen_random_uuid(),
  status text not null default 'claimed',
  claimed_at timestamptz not null,
  lease_expires_at timestamptz not null,
  terminal_at timestamptz null,
  release_idempotency_key text null,
  release_request_hash text null,
  release_reason_code text null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint business_operating_period_claims_scope_id_unique
    unique (game_session_id, id),
  constraint business_operating_period_claims_attempt_unique
    unique (game_session_id, business_id, period_number, claim_attempt),
  constraint business_operating_period_claims_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete cascade,
  constraint business_operating_period_claims_policy_scope_fk
    foreign key (game_session_id, policy_id)
    references public.business_operating_period_policies(game_session_id, id)
    on delete restrict,
  constraint business_operating_period_claims_public_key_check
    check (public_key ~ '^bocl_[0-9a-f]{32}$'),
  constraint business_operating_period_claims_period_check
    check (
      period_number between 1 and 9223372036854775806
      and payroll_period_key = 'payroll:' || period_number::text
      and period_duration_seconds between 3600 and 31536000
      and due_at = period_started_at
        + make_interval(secs => period_duration_seconds)
      and payroll_clock_version > 0
    ),
  constraint business_operating_period_claims_attempt_check
    check (claim_attempt between 1 and 2147483646),
  constraint business_operating_period_claims_lease_check
    check (lease_expires_at > claimed_at),
  constraint business_operating_period_claims_status_check
    check (status in ('claimed', 'completed', 'released', 'expired')),
  constraint business_operating_period_claims_terminal_check
    check (
      (status = 'claimed' and terminal_at is null)
      or (status <> 'claimed' and terminal_at is not null)
    ),
  constraint business_operating_period_claims_release_check
    check (
      (
        status = 'released'
        and length(btrim(coalesce(release_idempotency_key, '')))
          between 8 and 240
        and release_request_hash ~ '^[0-9a-f]{64}$'
        and release_reason_code ~ '^[A-Z][A-Z0-9_]{1,119}$'
      )
      or (
        status <> 'released'
        and release_idempotency_key is null
        and release_request_hash is null
        and release_reason_code is null
      )
    )
);

create unique index business_operating_period_claims_active_unique
  on public.business_operating_period_claims(
    game_session_id, business_id, period_number
  ) where status = 'claimed';

create index business_operating_period_claims_lease_idx
  on public.business_operating_period_claims(
    status, lease_expires_at, game_session_id, business_id
  );

create index business_operating_period_claims_policy_idx
  on public.business_operating_period_claims(game_session_id, policy_id);

create trigger set_business_operating_period_claims_updated_at
before update on public.business_operating_period_claims
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_operating_period_claims enable row level security;
alter table public.business_operating_period_claims force row level security;
revoke all on table public.business_operating_period_claims
  from public, anon, authenticated, service_role;
grant select on table public.business_operating_period_claims to service_role;

create or replace function private.guard_business_operating_period_claim_v1()
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
    raise exception 'BUSINESS_OPERATING_PERIOD_CLAIM_DELETE_FORBIDDEN'
      using errcode = '42501';
  end if;

  if coalesce(
    current_setting('app.business_operating_period_claim_write_v1', true), ''
  ) <> 'on' then
    raise exception 'BUSINESS_OPERATING_PERIOD_CLAIM_DIRECT_WRITE_FORBIDDEN'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.public_key is distinct from old.public_key
       or new.game_session_id is distinct from old.game_session_id
       or new.business_id is distinct from old.business_id
       or new.policy_id is distinct from old.policy_id
       or new.period_number is distinct from old.period_number
       or new.payroll_period_key is distinct from old.payroll_period_key
       or new.period_started_at is distinct from old.period_started_at
       or new.due_at is distinct from old.due_at
       or new.period_duration_seconds is distinct from old.period_duration_seconds
       or new.payroll_clock_version is distinct from old.payroll_clock_version
       or new.claim_attempt is distinct from old.claim_attempt
       or new.lease_token is distinct from old.lease_token
       or new.claimed_at is distinct from old.claimed_at
       or new.lease_expires_at is distinct from old.lease_expires_at
       or new.created_at is distinct from old.created_at
       or old.status <> 'claimed'
       or new.status not in ('completed', 'released', 'expired')
    then
      raise exception 'BUSINESS_OPERATING_PERIOD_CLAIM_TRANSITION_INVALID'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_business_operating_period_claim_v1()
  from public, anon, authenticated, service_role;

create trigger guard_business_operating_period_claim_v1
before insert or update or delete on public.business_operating_period_claims
for each row execute function private.guard_business_operating_period_claim_v1();

-- Existing payroll evidence is retained, but new Phase 11 evidence uses the
-- canonical Banking precision rather than hard-coded two-decimal storage.
alter table public.business_payroll_runs
  alter column gross_wages_due type numeric(38,18)
    using gross_wages_due::numeric(38,18),
  alter column gross_wages_paid type numeric(38,18)
    using gross_wages_paid::numeric(38,18),
  alter column gross_wages_unpaid type numeric(38,18)
    using gross_wages_unpaid::numeric(38,18),
  add column currency_minor_unit integer null,
  add column operating_period_claim_id uuid null;

update public.business_payroll_runs as payroll_row
set currency_minor_unit = currency_row.decimal_places
from public.currencies as currency_row
where currency_row.code = payroll_row.currency_code;

do $payroll_currency_precondition$
begin
  if exists (
    select 1
    from public.business_payroll_runs as payroll_row
    where payroll_row.currency_minor_unit is null
  ) then
    raise exception 'BUSINESS_PAYROLL_CANONICAL_CURRENCY_PRECISION_MISSING'
      using errcode = 'P0001',
        detail = 'Reconcile historical payroll currency codes before Phase 11.';
  end if;
end;
$payroll_currency_precondition$;

alter table public.business_payroll_runs
  alter column currency_minor_unit set not null,
  add constraint business_payroll_runs_currency_minor_unit_check
    check (currency_minor_unit between 0 and 18),
  add constraint business_payroll_runs_minor_unit_amounts_check
    check (
      gross_wages_due = round(gross_wages_due, currency_minor_unit)
      and gross_wages_paid = round(gross_wages_paid, currency_minor_unit)
      and gross_wages_unpaid = round(gross_wages_unpaid, currency_minor_unit)
    ),
  add constraint business_payroll_runs_operating_claim_scope_fk
    foreign key (game_session_id, operating_period_claim_id)
    references public.business_operating_period_claims(game_session_id, id)
    on delete restrict;

create unique index business_payroll_runs_operating_claim_unique
  on public.business_payroll_runs(operating_period_claim_id)
  where operating_period_claim_id is not null;

alter table public.business_payroll_entries
  alter column wage_due type numeric(38,18)
    using wage_due::numeric(38,18),
  alter column wage_paid type numeric(38,18)
    using wage_paid::numeric(38,18),
  alter column wage_unpaid type numeric(38,18)
    using wage_unpaid::numeric(38,18),
  add column currency_minor_unit integer null,
  add column bank_transaction_id uuid null;

update public.business_payroll_entries as entry_row
set currency_minor_unit = currency_row.decimal_places
from public.currencies as currency_row
where currency_row.code = entry_row.currency_code;

do $payroll_entry_currency_precondition$
begin
  if exists (
    select 1
    from public.business_payroll_entries as entry_row
    where entry_row.currency_minor_unit is null
  ) then
    raise exception 'BUSINESS_PAYROLL_ENTRY_CANONICAL_PRECISION_MISSING'
      using errcode = 'P0001',
        detail = 'Reconcile historical payroll entry currency codes before Phase 11.';
  end if;
end;
$payroll_entry_currency_precondition$;

alter table public.business_payroll_entries
  alter column currency_minor_unit set not null,
  add constraint business_payroll_entries_currency_minor_unit_check
    check (currency_minor_unit between 0 and 18),
  add constraint business_payroll_entries_minor_unit_amounts_check
    check (
      wage_due = round(wage_due, currency_minor_unit)
      and wage_paid = round(wage_paid, currency_minor_unit)
      and wage_unpaid = round(wage_unpaid, currency_minor_unit)
    ),
  add constraint business_payroll_entries_bank_transaction_scope_fk
    foreign key (game_session_id, bank_transaction_id)
    references public.bank_transactions(game_session_id, id)
    on delete restrict;

create index business_payroll_entries_bank_transaction_idx
  on public.business_payroll_entries(game_session_id, bank_transaction_id)
  where bank_transaction_id is not null;

alter table public.business_payroll_recovery_requests
  alter column amount_paid type numeric(38,18)
    using amount_paid::numeric(38,18);

revoke all on table public.business_payroll_runs
  from public, anon, authenticated, service_role;
grant select on table public.business_payroll_runs to service_role;
revoke all on table public.business_payroll_entries
  from public, anon, authenticated, service_role;
grant select on table public.business_payroll_entries to service_role;
revoke all on table public.business_payroll_recovery_requests
  from public, anon, authenticated, service_role;
grant select on table public.business_payroll_recovery_requests to service_role;

create or replace function public.ensure_business_payroll_clock_v2(
  p_game_session_id uuid,
  p_business_id uuid
)
returns public.business_payroll_clocks
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_clock public.business_payroll_clocks%rowtype;
  v_policy public.business_operating_period_policies%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_game_session_id is null or p_business_id is null then
    raise exception 'BUSINESS_PAYROLL_CLOCK_SCOPE_REQUIRED'
      using errcode = 'P0001';
  end if;

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

  select clock_row.*
  into v_clock
  from public.business_payroll_clocks as clock_row
  where clock_row.game_session_id = p_game_session_id
    and clock_row.business_id = p_business_id
  for update;
  if found then
    return v_clock;
  end if;

  v_policy := private.ensure_business_operating_period_policy_v1(
    p_game_session_id, v_now
  );

  insert into public.business_payroll_clocks (
    game_session_id,
    business_id,
    current_period_number,
    period_started_at,
    last_settled_at,
    version,
    period_policy_id,
    period_opened_at,
    period_duration_seconds,
    gross_receipts_tax_rate,
    next_due_at
  ) values (
    p_game_session_id,
    p_business_id,
    1,
    v_business.created_at,
    null,
    1,
    v_policy.id,
    v_now,
    v_policy.period_duration_seconds,
    v_policy.gross_receipts_tax_rate,
    v_business.created_at
      + make_interval(secs => v_policy.period_duration_seconds)
  )
  on conflict (game_session_id, business_id) do nothing;

  select clock_row.*
  into v_clock
  from public.business_payroll_clocks as clock_row
  where clock_row.game_session_id = p_game_session_id
    and clock_row.business_id = p_business_id
  for update;
  if not found then
    raise exception 'BUSINESS_PAYROLL_CLOCK_MISSING' using errcode = 'P0001';
  end if;

  return v_clock;
end;
$function$;

revoke all on function public.ensure_business_payroll_clock_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.ensure_business_payroll_clock_v2(uuid, uuid)
  to service_role;

create or replace function public.current_business_payroll_period_key_v2(
  p_game_session_id uuid,
  p_business_id uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_clock public.business_payroll_clocks%rowtype;
begin
  v_clock := public.ensure_business_payroll_clock_v2(
    p_game_session_id, p_business_id
  );
  return 'payroll:' || v_clock.current_period_number::text;
end;
$function$;

revoke all on function public.current_business_payroll_period_key_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.current_business_payroll_period_key_v2(uuid, uuid)
  to service_role;

create or replace function public.claim_due_business_operating_periods_v1(
  p_batch_limit integer
)
returns table (
  claim_key text,
  business_key text,
  payroll_period_key text,
  period_number bigint,
  due_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_candidate record;
  v_business public.business_entities%rowtype;
  v_clock public.business_payroll_clocks%rowtype;
  v_policy public.business_operating_period_policies%rowtype;
  v_claim public.business_operating_period_claims%rowtype;
  v_attempt integer;
  v_now timestamptz := clock_timestamp();
  v_prior_claim_context text := coalesce(
    current_setting('app.business_operating_period_claim_write_v1', true), ''
  );
begin
  if p_batch_limit is null or p_batch_limit not between 1 and 100 then
    raise exception 'BUSINESS_OPERATING_PERIOD_CLAIM_LIMIT_INVALID'
      using errcode = '22023';
  end if;

  perform pg_catalog.set_config(
    'app.business_operating_period_claim_write_v1', 'on', true
  );

  -- A Business formed after migration might not have traversed a payroll read
  -- yet. Provision at most this invocation's batch limit, oldest formation
  -- first, before the due scan so lazy initialization cannot make bounded
  -- worker calls perform an unbounded write sweep.
  for v_candidate in
    select
      business_row.game_session_id,
      business_row.id as business_id
    from public.business_entities as business_row
    join public.game_sessions as game_row
      on game_row.id = business_row.game_session_id
    left join public.business_payroll_clocks as clock_row
      on clock_row.game_session_id = business_row.game_session_id
     and clock_row.business_id = business_row.id
    where business_row.status in ('active', 'restructuring', 'distressed')
      and game_row.status = 'active'
      and game_row.lifecycle_state = 'active'
      and clock_row.id is null
    order by
      business_row.created_at,
      business_row.game_session_id,
      business_row.id
    limit p_batch_limit
  loop
    -- Recheck and retain the game row lock through any lazy clock write.  A
    -- lifecycle transition that won the race is observed here; one that starts
    -- later waits until this bounded worker transaction has committed.
    perform 1
    from public.game_sessions as game_row
    where game_row.id = v_candidate.game_session_id
      and game_row.status = 'active'
      and game_row.lifecycle_state = 'active'
    for share;
    if not found then
      continue;
    end if;

    perform public.ensure_business_payroll_clock_v2(
      v_candidate.game_session_id, v_candidate.business_id
    );
  end loop;

  v_now := clock_timestamp();

  for v_candidate in
    select
      business_row.id as business_id,
      business_row.game_session_id,
      clock_row.next_due_at,
      clock_row.id as clock_id
    from public.business_entities as business_row
    join public.business_payroll_clocks as clock_row
      on clock_row.game_session_id = business_row.game_session_id
     and clock_row.business_id = business_row.id
    join public.game_sessions as game_row
      on game_row.id = business_row.game_session_id
    where business_row.status in ('active', 'restructuring', 'distressed')
      and game_row.status = 'active'
      and game_row.lifecycle_state = 'active'
      and clock_row.next_due_at <= v_now
      and not exists (
        select 1
        from public.business_operating_period_claims as active_claim
        where active_claim.game_session_id = clock_row.game_session_id
          and active_claim.business_id = clock_row.business_id
          and active_claim.period_number = clock_row.current_period_number
          and active_claim.status = 'claimed'
          and active_claim.lease_expires_at > v_now
      )
    order by clock_row.next_due_at, business_row.id
    for update of business_row skip locked
    limit p_batch_limit
  loop
    select business_row.*
    into v_business
    from public.business_entities as business_row
    where business_row.game_session_id = v_candidate.game_session_id
      and business_row.id = v_candidate.business_id
      and business_row.status in ('active', 'restructuring', 'distressed')
    for update;
    if not found then
      continue;
    end if;

    -- The candidate scan is intentionally repeated under a transaction-held
    -- game lock so a concurrently paused/ended game cannot receive a claim.
    perform 1
    from public.game_sessions as game_row
    where game_row.id = v_candidate.game_session_id
      and game_row.status = 'active'
      and game_row.lifecycle_state = 'active'
    for share;
    if not found then
      continue;
    end if;

    select clock_row.*
    into v_clock
    from public.business_payroll_clocks as clock_row
    where clock_row.game_session_id = v_business.game_session_id
      and clock_row.business_id = v_business.id
    for update;
    if not found or v_clock.next_due_at > v_now then
      continue;
    end if;

    update public.business_operating_period_claims as expired_claim
    set status = 'expired',
        terminal_at = v_now,
        updated_at = v_now
    where expired_claim.game_session_id = v_clock.game_session_id
      and expired_claim.business_id = v_clock.business_id
      and expired_claim.period_number = v_clock.current_period_number
      and expired_claim.status = 'claimed'
      and expired_claim.lease_expires_at <= v_now;

    if exists (
      select 1
      from public.business_operating_period_claims as active_claim
      where active_claim.game_session_id = v_clock.game_session_id
        and active_claim.business_id = v_clock.business_id
        and active_claim.period_number = v_clock.current_period_number
        and active_claim.status = 'claimed'
    ) then
      continue;
    end if;

    select policy_row.*
    into v_policy
    from public.business_operating_period_policies as policy_row
    where policy_row.game_session_id = v_clock.game_session_id
      and policy_row.id = v_clock.period_policy_id;
    if not found
       or v_policy.period_duration_seconds <> v_clock.period_duration_seconds
       or v_policy.gross_receipts_tax_rate <> v_clock.gross_receipts_tax_rate
    then
      raise exception 'BUSINESS_OPERATING_PERIOD_POLICY_CONFLICT'
        using errcode = 'P0001';
    end if;

    select coalesce(max(claim_row.claim_attempt), 0) + 1
    into v_attempt
    from public.business_operating_period_claims as claim_row
    where claim_row.game_session_id = v_clock.game_session_id
      and claim_row.business_id = v_clock.business_id
      and claim_row.period_number = v_clock.current_period_number;

    insert into public.business_operating_period_claims (
      game_session_id,
      business_id,
      policy_id,
      period_number,
      payroll_period_key,
      period_started_at,
      due_at,
      period_duration_seconds,
      payroll_clock_version,
      claim_attempt,
      status,
      claimed_at,
      lease_expires_at
    ) values (
      v_clock.game_session_id,
      v_clock.business_id,
      v_clock.period_policy_id,
      v_clock.current_period_number,
      'payroll:' || v_clock.current_period_number::text,
      v_clock.period_started_at,
      v_clock.next_due_at,
      v_clock.period_duration_seconds,
      v_clock.version,
      v_attempt,
      'claimed',
      v_now,
      v_now + make_interval(secs => v_policy.claim_lease_seconds)
    )
    returning * into v_claim;

    claim_key := v_claim.public_key;
    business_key := v_business.public_key;
    payroll_period_key := v_claim.payroll_period_key;
    period_number := v_claim.period_number;
    due_at := v_claim.due_at;
    lease_token := v_claim.lease_token;
    lease_expires_at := v_claim.lease_expires_at;
    return next;
  end loop;

  perform pg_catalog.set_config(
    'app.business_operating_period_claim_write_v1',
    v_prior_claim_context,
    true
  );
end;
$function$;

revoke all on function public.claim_due_business_operating_periods_v1(integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_business_operating_periods_v1(integer)
  to service_role;

create or replace function public.release_business_operating_period_lease_v1(
  p_claim_key text,
  p_lease_token uuid,
  p_reason_code text,
  p_idempotency_key text
)
returns table (
  claim_key text,
  claim_status text,
  released_at timestamptz,
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
  v_reason text := upper(btrim(coalesce(p_reason_code, '')));
  v_idempotency text := btrim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_now timestamptz := clock_timestamp();
  v_prior_claim_context text := coalesce(
    current_setting('app.business_operating_period_claim_write_v1', true), ''
  );
begin
  if coalesce(btrim(p_claim_key), '') !~ '^bocl_[0-9a-f]{32}$'
     or p_lease_token is null
     or v_reason !~ '^[A-Z][A-Z0-9_]{1,119}$'
     or length(v_idempotency) not between 8 and 240
  then
    raise exception 'BUSINESS_OPERATING_PERIOD_RELEASE_REQUEST_INVALID'
      using errcode = '22023';
  end if;

  select
    claim_row.game_session_id,
    claim_row.business_id
  into v_scope
  from public.business_operating_period_claims as claim_row
  where claim_row.public_key = lower(btrim(p_claim_key));
  if not found then
    raise exception 'BUSINESS_OPERATING_PERIOD_CLAIM_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  -- Match the repository-wide Business -> payroll-clock ordering.
  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = v_scope.game_session_id
    and business_row.id = v_scope.business_id
  for update;

  select clock_row.*
  into v_clock
  from public.business_payroll_clocks as clock_row
  where clock_row.game_session_id = v_business.game_session_id
    and clock_row.business_id = v_business.id
  for update;

  select claim_row.*
  into v_claim
  from public.business_operating_period_claims as claim_row
  where claim_row.public_key = lower(btrim(p_claim_key))
  for update;

  v_now := clock_timestamp();

  if v_claim.lease_token <> p_lease_token then
    raise exception 'BUSINESS_OPERATING_PERIOD_LEASE_TOKEN_INVALID'
      using errcode = '42501';
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|',
          'business-operating-period-release-v1',
          v_claim.id,
          v_claim.lease_token,
          v_reason
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  if v_claim.status = 'released' then
    if v_claim.release_idempotency_key <> v_idempotency
       or v_claim.release_request_hash <> v_hash
    then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    return query select
      v_claim.public_key,
      v_claim.status,
      v_claim.terminal_at,
      true;
    return;
  end if;

  if v_claim.status = 'completed' then
    raise exception 'BUSINESS_OPERATING_PERIOD_ALREADY_COMPLETED'
      using errcode = 'P0001';
  end if;
  if v_claim.status <> 'claimed' or v_claim.lease_expires_at <= v_now then
    raise exception 'BUSINESS_OPERATING_PERIOD_LEASE_EXPIRED'
      using errcode = 'P0001';
  end if;
  if v_clock.current_period_number <> v_claim.period_number
     or v_clock.period_policy_id <> v_claim.policy_id
     or v_clock.period_started_at <> v_claim.period_started_at
     or v_clock.next_due_at <> v_claim.due_at
     or v_clock.period_duration_seconds <> v_claim.period_duration_seconds
     or v_clock.version <> v_claim.payroll_clock_version
  then
    raise exception 'BUSINESS_OPERATING_PERIOD_CLAIM_STALE'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config(
    'app.business_operating_period_claim_write_v1', 'on', true
  );

  update public.business_operating_period_claims
  set status = 'released',
      terminal_at = v_now,
      release_idempotency_key = v_idempotency,
      release_request_hash = v_hash,
      release_reason_code = v_reason,
      updated_at = v_now
  where id = v_claim.id
  returning * into v_claim;

  perform pg_catalog.set_config(
    'app.business_operating_period_claim_write_v1',
    v_prior_claim_context,
    true
  );

  return query select
    v_claim.public_key,
    v_claim.status,
    v_claim.terminal_at,
    false;
end;
$function$;

revoke all on function public.release_business_operating_period_lease_v1(
  text, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.release_business_operating_period_lease_v1(
  text, uuid, text, text
) to service_role;

comment on table public.business_operating_period_policies is
  'Append-only server-owned cadence, tax, and lease policy. Open periods retain their exact policy snapshot.';
comment on table public.business_operating_period_claims is
  'Due-only worker lease evidence for exactly one Business operating/payroll period attempt.';
comment on column public.business_payroll_clocks.next_due_at is
  'Server-owned due boundary anchored to period_started_at plus the pinned policy duration.';

commit;
