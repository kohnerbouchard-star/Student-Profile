-- Business V2 Phase 4C-A: server-owned payroll period identity and
-- retirement of synthetic per-production wage cash charges.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table public.business_payroll_clocks (
  id uuid primary key default gen_random_uuid(),
  public_key text not null default ('pyc_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  current_period_number bigint not null default 1,
  period_started_at timestamptz not null default statement_timestamp(),
  last_settled_at timestamptz null,
  version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint business_payroll_clocks_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id),
  constraint business_payroll_clocks_public_key_format
    check (public_key ~ '^pyc_[0-9a-f]{32}$'),
  constraint business_payroll_clocks_public_key_unique unique (public_key),
  constraint business_payroll_clocks_scope_unique
    unique (game_session_id, business_id),
  constraint business_payroll_clocks_period_valid
    check (current_period_number between 1 and 9223372036854775806),
  constraint business_payroll_clocks_version_valid check (version > 0)
);

create trigger set_business_payroll_clocks_updated_at
before update on public.business_payroll_clocks
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_payroll_clocks enable row level security;
alter table public.business_payroll_clocks force row level security;
revoke all on table public.business_payroll_clocks from public, anon, authenticated;
grant select, insert, update on table public.business_payroll_clocks to service_role;

create or replace function public.ensure_business_payroll_clock_v2(
  p_game_session_id uuid,
  p_business_id uuid
)
returns public.business_payroll_clocks
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_clock public.business_payroll_clocks%rowtype;
begin
  if p_game_session_id is null or p_business_id is null then
    raise exception 'BUSINESS_PAYROLL_CLOCK_SCOPE_REQUIRED' using errcode = 'P0001';
  end if;

  perform 1
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = p_business_id
  for share;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.business_payroll_clocks(
    game_session_id,
    business_id
  ) values (
    p_game_session_id,
    p_business_id
  )
  on conflict (game_session_id, business_id) do nothing;

  select clock_row.*
  into v_clock
  from public.business_payroll_clocks as clock_row
  where clock_row.game_session_id = p_game_session_id
    and clock_row.business_id = p_business_id
  for update;

  return v_clock;
end
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
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_clock public.business_payroll_clocks%rowtype;
begin
  v_clock := public.ensure_business_payroll_clock_v2(
    p_game_session_id,
    p_business_id
  );
  return 'payroll:' || v_clock.current_period_number::text;
end
$function$;

revoke all on function public.current_business_payroll_period_key_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.current_business_payroll_period_key_v2(uuid, uuid)
  to service_role;

-- Historical production rows retain their original cost evidence. New production
-- may allocate payroll into product cost basis, but may not debit a second wage.
update public.business_products
set unit_labor_cost = 0,
    version = version + 1,
    updated_at = statement_timestamp()
where unit_labor_cost <> 0;

alter table public.business_products
  drop constraint if exists business_products_amounts_check;

alter table public.business_products
  add constraint business_products_amounts_check check (
    unit_price > 0
    and reference_price > 0
    and unit_input_cost >= 0
    and unit_labor_cost = 0
  );

comment on column public.business_products.unit_labor_cost is
  'Compatibility-only and fixed at zero. Recurring payroll is the only wage cash authority; production may only allocate labor into cost basis.';

-- Every retained historical employee receives bounded payroll evidence without
-- pretending that a Player authored a canonical role or productivity outcome.
insert into public.business_workforce_role_definitions(
  role_key,
  display_name,
  description,
  labor_class,
  default_labor_minutes_per_cycle,
  minimum_skill_basis_points,
  status,
  metadata
) values (
  'workforce.legacy.general',
  'Legacy General Workforce',
  'Compatibility role for pre-V2 employees pending explicit workforce migration.',
  'administration',
  2400,
  0,
  'active',
  jsonb_build_object('compatibilityOnly', true, 'phase', '4C-A')
)
on conflict (role_key) do update set
  status = 'active',
  metadata = public.business_workforce_role_definitions.metadata
    || jsonb_build_object('compatibilityOnly', true, 'phase', '4C-A'),
  version = public.business_workforce_role_definitions.version + 1,
  updated_at = statement_timestamp();

update public.business_employees as employee
set workforce_role_definition_id = role.id,
    labor_minutes_per_cycle = coalesce(
      employee.labor_minutes_per_cycle,
      role.default_labor_minutes_per_cycle
    ),
    skill_basis_points = coalesce(employee.skill_basis_points, 0),
    workforce_version = employee.workforce_version + 1,
    updated_at = statement_timestamp()
from public.business_workforce_role_definitions as role
where role.role_key = 'workforce.legacy.general'
  and employee.workforce_source_type = 'historical_v1'
  and (
    employee.workforce_role_definition_id is null
    or employee.labor_minutes_per_cycle is null
    or employee.skill_basis_points is null
  );

commit;
