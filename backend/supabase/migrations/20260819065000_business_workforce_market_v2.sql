-- Canonical Business labor market + workforce V2.
--
-- Players do not create employees or type employee statistics. Econovaria
-- generates a weekly, game/country-scoped candidate pool, computes expected
-- wages, and applies role effects to production/R&D. Pay changes are bounded
-- strategies relative to the current market wage.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table if not exists public.business_role_definitions_v2 (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('rol_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  role_key text not null,
  display_name text not null,
  role_family text not null,
  base_wage numeric(14,2) not null,
  primary_stat text not null,
  secondary_stat text null,
  scarcity_multiplier numeric(10,4) not null default 1,
  production_effect numeric(10,4) not null default 0,
  research_effect numeric(10,4) not null default 0,
  sales_effect numeric(10,4) not null default 0,
  logistics_effect numeric(10,4) not null default 0,
  management_effect numeric(10,4) not null default 0,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_role_definitions_v2_public_key_check
    check (public_key ~ '^rol_[0-9a-f]{32}$'),
  constraint business_role_definitions_v2_role_key_check
    check (role_key ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  constraint business_role_definitions_v2_name_check
    check (length(btrim(display_name)) between 2 and 120),
  constraint business_role_definitions_v2_family_check
    check (role_family in ('production','technical','research','sales','management','logistics','finance_operations')),
  constraint business_role_definitions_v2_wage_check check (base_wage > 0 and base_wage <= 10000000),
  constraint business_role_definitions_v2_primary_stat_check check (
    primary_stat in ('technical','productivity','sales','negotiation','management','research','logistics','reliability')
  ),
  constraint business_role_definitions_v2_secondary_stat_check check (
    secondary_stat is null or secondary_stat in ('technical','productivity','sales','negotiation','management','research','logistics','reliability')
  ),
  constraint business_role_definitions_v2_scarcity_check check (scarcity_multiplier between 0.5 and 3),
  constraint business_role_definitions_v2_effects_check check (
    production_effect between 0 and 1
    and research_effect between 0 and 1
    and sales_effect between 0 and 1
    and logistics_effect between 0 and 1
    and management_effect between 0 and 1
  ),
  constraint business_role_definitions_v2_status_check check (status in ('active','disabled','retired')),
  constraint business_role_definitions_v2_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint business_role_definitions_v2_scope_unique unique (game_session_id, role_key),
  constraint business_role_definitions_v2_scope_id_unique unique (game_session_id, id)
);

create trigger set_business_role_definitions_v2_updated_at
before update on public.business_role_definitions_v2
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_role_definitions_v2 enable row level security;
revoke all on table public.business_role_definitions_v2 from public, anon, authenticated;
grant select, insert, update on table public.business_role_definitions_v2 to service_role;

create or replace function public.business_labor_policy_v2(
  p_game_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_policy jsonb := '{}'::jsonb;
begin
  select coalesce(settings_row.business_market_window -> 'labor', '{}'::jsonb)
  into v_policy
  from public.game_settings as settings_row
  where settings_row.game_session_id = p_game_session_id;
  return jsonb_build_object(
    'baseWage', case when coalesce(v_policy ->> 'baseWage', '') ~ '^\d+(\.\d+)?$'
      then least(1000000, greatest(100, (v_policy ->> 'baseWage')::numeric)) else 3000 end,
    'laborMarketMultiplier', case when coalesce(v_policy ->> 'laborMarketMultiplier', '') ~ '^\d+(\.\d+)?$'
      then least(2, greatest(0.6, (v_policy ->> 'laborMarketMultiplier')::numeric)) else 1 end,
    'scarcityMultiplier', case when coalesce(v_policy ->> 'scarcityMultiplier', '') ~ '^\d+(\.\d+)?$'
      then least(2, greatest(0.6, (v_policy ->> 'scarcityMultiplier')::numeric)) else 1 end,
    'payrollIntervalHours', case when coalesce(v_policy ->> 'payrollIntervalHours', '') ~ '^\d+$'
      then least(720, greatest(24, (v_policy ->> 'payrollIntervalHours')::integer)) else 168 end
  );
end
$function$;

create or replace function public.ensure_standard_business_roles_v2(
  p_game_session_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_policy jsonb;
  v_base numeric;
  v_count integer := 0;
begin
  v_policy := public.business_labor_policy_v2(p_game_session_id);
  v_base := (v_policy ->> 'baseWage')::numeric;

  insert into public.business_role_definitions_v2(
    game_session_id, role_key, display_name, role_family, base_wage,
    primary_stat, secondary_stat, scarcity_multiplier,
    production_effect, research_effect, sales_effect, logistics_effect, management_effect
  ) values
    (p_game_session_id,'production_worker','Production Worker','production',round(v_base * 0.90,2),'productivity','reliability',0.90,0.18,0,0,0,0),
    (p_game_session_id,'technician','Technician','technical',round(v_base * 1.10,2),'technical','productivity',1.05,0.20,0.04,0,0,0),
    (p_game_session_id,'engineer','Engineer','technical',round(v_base * 1.35,2),'technical','research',1.20,0.18,0.12,0,0,0),
    (p_game_session_id,'researcher','Researcher','research',round(v_base * 1.45,2),'research','technical',1.30,0,0.22,0,0,0),
    (p_game_session_id,'salesperson','Salesperson','sales',round(v_base * 1.00,2),'sales','negotiation',1.00,0,0,0.20,0,0),
    (p_game_session_id,'manager','Manager','management',round(v_base * 1.30,2),'management','reliability',1.15,0.06,0.04,0.04,0.04,0.18),
    (p_game_session_id,'logistics_worker','Logistics Worker','logistics',round(v_base * 1.00,2),'logistics','reliability',0.95,0.05,0,0,0.20,0),
    (p_game_session_id,'finance_operations','Finance / Operations','finance_operations',round(v_base * 1.20,2),'management','negotiation',1.05,0,0,0,0.05,0.12)
  on conflict (game_session_id, role_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end
$function$;

create table if not exists public.business_talent_candidates_v2 (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('can_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  country_code text not null,
  role_id uuid not null,
  week_start date not null,
  pool_index integer not null,
  display_name text not null,
  technical integer not null,
  productivity integer not null,
  sales integer not null,
  negotiation integer not null,
  management integer not null,
  research integer not null,
  logistics integer not null,
  reliability integer not null,
  experience_years integer not null,
  expected_wage numeric(14,2) not null,
  status text not null default 'available',
  hired_business_id uuid null,
  hired_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_talent_candidates_v2_public_key_check check (public_key ~ '^can_[0-9a-f]{32}$'),
  constraint business_talent_candidates_v2_country_check
    check (country_code = upper(country_code) and length(country_code) between 2 and 16),
  constraint business_talent_candidates_v2_role_scope_fk
    foreign key (game_session_id, role_id)
    references public.business_role_definitions_v2(game_session_id, id) on delete restrict,
  constraint business_talent_candidates_v2_pool_index_check check (pool_index between 1 and 1000),
  constraint business_talent_candidates_v2_name_check check (length(btrim(display_name)) between 2 and 120),
  constraint business_talent_candidates_v2_stats_check check (
    technical between 0 and 100 and productivity between 0 and 100
    and sales between 0 and 100 and negotiation between 0 and 100
    and management between 0 and 100 and research between 0 and 100
    and logistics between 0 and 100 and reliability between 0 and 100
  ),
  constraint business_talent_candidates_v2_experience_check check (experience_years between 0 and 40),
  constraint business_talent_candidates_v2_wage_check check (expected_wage > 0),
  constraint business_talent_candidates_v2_status_check check (status in ('available','hired','expired')),
  constraint business_talent_candidates_v2_hired_state_check check (
    (status = 'hired' and hired_business_id is not null and hired_at is not null)
    or (status <> 'hired' and hired_business_id is null and hired_at is null)
  ),
  constraint business_talent_candidates_v2_hired_business_scope_fk
    foreign key (game_session_id, hired_business_id)
    references public.business_entities(game_session_id, id) on delete restrict,
  constraint business_talent_candidates_v2_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint business_talent_candidates_v2_pool_unique
    unique (game_session_id, country_code, role_id, week_start, pool_index),
  constraint business_talent_candidates_v2_scope_id_unique unique (game_session_id, id)
);

create index if not exists business_talent_candidates_v2_available_idx
  on public.business_talent_candidates_v2(game_session_id, country_code, week_start, role_id, expected_wage)
  where status = 'available';

create trigger set_business_talent_candidates_v2_updated_at
before update on public.business_talent_candidates_v2
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_talent_candidates_v2 enable row level security;
revoke all on table public.business_talent_candidates_v2 from public, anon, authenticated;
grant select, insert, update on table public.business_talent_candidates_v2 to service_role;

create or replace function public.business_candidate_stat_v2(
  p_candidate public.business_talent_candidates_v2,
  p_stat text
)
returns integer
language sql
immutable
strict
set search_path = public, pg_temp
as $function$
  select case p_stat
    when 'technical' then p_candidate.technical
    when 'productivity' then p_candidate.productivity
    when 'sales' then p_candidate.sales
    when 'negotiation' then p_candidate.negotiation
    when 'management' then p_candidate.management
    when 'research' then p_candidate.research
    when 'logistics' then p_candidate.logistics
    when 'reliability' then p_candidate.reliability
    else 0
  end
$function$;

create or replace function public.business_candidate_market_wage_v2(
  p_game_session_id uuid,
  p_candidate public.business_talent_candidates_v2,
  p_role public.business_role_definitions_v2
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_policy jsonb;
  v_primary numeric;
  v_secondary numeric;
  v_skill numeric;
  v_skill_premium numeric;
  v_experience numeric;
  v_market numeric;
  v_scarcity numeric;
begin
  v_policy := public.business_labor_policy_v2(p_game_session_id);
  v_primary := public.business_candidate_stat_v2(p_candidate, p_role.primary_stat);
  v_secondary := case when p_role.secondary_stat is null then v_primary
    else public.business_candidate_stat_v2(p_candidate, p_role.secondary_stat) end;
  v_skill := 0.75 * v_primary + 0.25 * v_secondary;
  v_skill_premium := 0.75 + v_skill / 200.0;
  v_experience := 1 + least(0.40, p_candidate.experience_years * 0.02);
  v_market := (v_policy ->> 'laborMarketMultiplier')::numeric;
  v_scarcity := (v_policy ->> 'scarcityMultiplier')::numeric * p_role.scarcity_multiplier;
  return round(greatest(1, p_role.base_wage * v_skill_premium * v_experience * v_market * v_scarcity), 2);
end
$function$;

create or replace function public.refresh_business_talent_market_v2(
  p_game_session_id uuid,
  p_country_code text,
  p_week_start date default null,
  p_candidates_per_role integer default 8
)
returns table (
  week_start date,
  created integer,
  expired integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_week date := coalesce(p_week_start, date_trunc('week', current_date)::date);
  v_country text := upper(btrim(coalesce(p_country_code, '')));
  v_count integer := least(24, greatest(3, coalesce(p_candidates_per_role, 8)));
  v_role public.business_role_definitions_v2%rowtype;
  v_candidate public.business_talent_candidates_v2%rowtype;
  v_seed bytea;
  v_i integer;
  v_stats integer[];
  v_experience integer;
  v_wage numeric;
  v_created integer := 0;
  v_expired integer := 0;
begin
  if length(v_country) not between 2 and 16 then
    raise exception 'BUSINESS_TALENT_COUNTRY_INVALID' using errcode = 'P0001';
  end if;
  perform public.ensure_standard_business_roles_v2(p_game_session_id);

  update public.business_talent_candidates_v2
  set status = 'expired'
  where game_session_id = p_game_session_id
    and country_code = v_country
    and week_start < v_week
    and status = 'available';
  get diagnostics v_expired = row_count;

  for v_role in
    select role_row.*
    from public.business_role_definitions_v2 as role_row
    where role_row.game_session_id = p_game_session_id
      and role_row.status = 'active'
    order by role_row.role_key
  loop
    for v_i in 1..v_count loop
      if exists (
        select 1 from public.business_talent_candidates_v2 as existing_row
        where existing_row.game_session_id = p_game_session_id
          and existing_row.country_code = v_country
          and existing_row.role_id = v_role.id
          and existing_row.week_start = v_week
          and existing_row.pool_index = v_i
      ) then
        continue;
      end if;

      v_seed := extensions.digest(
        concat_ws('|', p_game_session_id::text, v_country, v_role.role_key, v_week::text, v_i::text),
        'sha256'
      );
      v_stats := array[
        35 + (get_byte(v_seed,0) % 61),
        35 + (get_byte(v_seed,1) % 61),
        35 + (get_byte(v_seed,2) % 61),
        35 + (get_byte(v_seed,3) % 61),
        35 + (get_byte(v_seed,4) % 61),
        35 + (get_byte(v_seed,5) % 61),
        35 + (get_byte(v_seed,6) % 61),
        45 + (get_byte(v_seed,7) % 51)
      ];
      v_experience := get_byte(v_seed,8) % 13;

      v_candidate.game_session_id := p_game_session_id;
      v_candidate.country_code := v_country;
      v_candidate.role_id := v_role.id;
      v_candidate.week_start := v_week;
      v_candidate.pool_index := v_i;
      v_candidate.display_name := format('%s Candidate %s-%s', v_role.display_name, to_char(v_week,'IYYYIW'), v_i);
      v_candidate.technical := v_stats[1];
      v_candidate.productivity := v_stats[2];
      v_candidate.sales := v_stats[3];
      v_candidate.negotiation := v_stats[4];
      v_candidate.management := v_stats[5];
      v_candidate.research := v_stats[6];
      v_candidate.logistics := v_stats[7];
      v_candidate.reliability := v_stats[8];
      v_candidate.experience_years := v_experience;
      v_wage := public.business_candidate_market_wage_v2(p_game_session_id, v_candidate, v_role);

      insert into public.business_talent_candidates_v2(
        game_session_id,country_code,role_id,week_start,pool_index,display_name,
        technical,productivity,sales,negotiation,management,research,logistics,reliability,
        experience_years,expected_wage,status,metadata
      ) values (
        p_game_session_id,v_country,v_role.id,v_week,v_i,v_candidate.display_name,
        v_stats[1],v_stats[2],v_stats[3],v_stats[4],v_stats[5],v_stats[6],v_stats[7],v_stats[8],
        v_experience,v_wage,'available',
        jsonb_build_object('generatedBy','business_talent_market_v2')
      );
      v_created := v_created + 1;
    end loop;
  end loop;

  return query select v_week, v_created, v_expired;
end
$function$;

create table if not exists public.business_employments_v2 (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('emp_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  candidate_id uuid not null,
  role_id uuid not null,
  hired_by_player_id uuid not null,
  status text not null default 'active',
  wage_per_cycle numeric(14,2) not null,
  market_wage_at_hire numeric(14,2) not null,
  next_payroll_at timestamptz not null,
  payroll_interval_hours integer not null,
  retention_risk text not null default 'low',
  retention_warning_since timestamptz null,
  missed_payroll_cycles integer not null default 0,
  hired_at timestamptz not null default now(),
  departed_at timestamptz null,
  departure_reason text null,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_employments_v2_public_key_check check (public_key ~ '^emp_[0-9a-f]{32}$'),
  constraint business_employments_v2_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete restrict,
  constraint business_employments_v2_candidate_scope_fk
    foreign key (game_session_id, candidate_id)
    references public.business_talent_candidates_v2(game_session_id, id) on delete restrict,
  constraint business_employments_v2_role_scope_fk
    foreign key (game_session_id, role_id)
    references public.business_role_definitions_v2(game_session_id, id) on delete restrict,
  constraint business_employments_v2_player_scope_fk
    foreign key (game_session_id, hired_by_player_id)
    references public.players(game_session_id, id),
  constraint business_employments_v2_status_check
    check (status in ('active','unpaid','departed','terminated')),
  constraint business_employments_v2_wage_check check (wage_per_cycle > 0 and market_wage_at_hire > 0),
  constraint business_employments_v2_payroll_interval_check check (payroll_interval_hours between 24 and 720),
  constraint business_employments_v2_retention_check check (retention_risk in ('low','medium','high','critical')),
  constraint business_employments_v2_missed_check check (missed_payroll_cycles >= 0),
  constraint business_employments_v2_departure_state_check check (
    (status in ('departed','terminated') and departed_at is not null and departure_reason is not null)
    or (status not in ('departed','terminated') and departed_at is null and departure_reason is null)
  ),
  constraint business_employments_v2_idempotency_check check (length(btrim(idempotency_key)) between 8 and 160),
  constraint business_employments_v2_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint business_employments_v2_candidate_unique unique (game_session_id, candidate_id),
  constraint business_employments_v2_idempotency_unique
    unique (game_session_id, business_id, hired_by_player_id, idempotency_key),
  constraint business_employments_v2_scope_id_unique unique (game_session_id, id)
);

create index if not exists business_employments_v2_business_idx
  on public.business_employments_v2(game_session_id,business_id,status,role_id);
create index if not exists business_employments_v2_payroll_idx
  on public.business_employments_v2(status,next_payroll_at,game_session_id,business_id)
  where status in ('active','unpaid');

create trigger set_business_employments_v2_updated_at
before update on public.business_employments_v2
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_employments_v2 enable row level security;
revoke all on table public.business_employments_v2 from public, anon, authenticated;
grant select, insert, update on table public.business_employments_v2 to service_role;

create or replace function public.hire_business_candidate_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_candidate_key text,
  p_idempotency_key text
)
returns table (
  employee_key text,
  status text,
  role_key text,
  wage_per_cycle numeric,
  next_payroll_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_candidate public.business_talent_candidates_v2%rowtype;
  v_role public.business_role_definitions_v2%rowtype;
  v_employment public.business_employments_v2%rowtype;
  v_policy jsonb;
  v_interval integer;
  v_cash numeric;
begin
  if length(btrim(coalesce(p_idempotency_key,''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  select business_row.* into v_business
  from public.business_entities as business_row
  where business_row.game_session_id=p_game_session_id
    and business_row.public_key=lower(btrim(p_business_key))
    and business_row.status<>'closed' and business_row.formation_state='operational'
  for share;
  if not found then raise exception 'BUSINESS_NOT_FOUND_OR_NOT_OPERATIONAL' using errcode='P0001'; end if;
  if not exists (
    select 1 from public.business_ownership_positions as position_row
    where position_row.game_session_id=p_game_session_id and position_row.business_id=v_business.id
      and position_row.player_id=p_player_id and position_row.status='active'
  ) then raise exception 'BUSINESS_OWNERSHIP_REQUIRED' using errcode='P0001'; end if;

  select employment_row.* into v_employment
  from public.business_employments_v2 as employment_row
  where employment_row.game_session_id=p_game_session_id and employment_row.business_id=v_business.id
    and employment_row.hired_by_player_id=p_player_id and employment_row.idempotency_key=p_idempotency_key;
  if found then
    select role_row.* into v_role from public.business_role_definitions_v2 as role_row where role_row.id=v_employment.role_id;
    return query select v_employment.public_key,v_employment.status,v_role.role_key,v_employment.wage_per_cycle,v_employment.next_payroll_at,true;
    return;
  end if;

  select candidate_row.* into v_candidate
  from public.business_talent_candidates_v2 as candidate_row
  where candidate_row.game_session_id=p_game_session_id
    and candidate_row.public_key=lower(btrim(p_candidate_key))
  for update;
  if not found or v_candidate.status<>'available' then raise exception 'BUSINESS_TALENT_CANDIDATE_UNAVAILABLE' using errcode='P0001'; end if;
  if v_candidate.country_code<>v_business.country_code then raise exception 'BUSINESS_TALENT_COUNTRY_MISMATCH' using errcode='P0001'; end if;
  if v_candidate.week_start<>date_trunc('week',current_date)::date then raise exception 'BUSINESS_TALENT_CANDIDATE_EXPIRED' using errcode='P0001'; end if;
  select role_row.* into v_role from public.business_role_definitions_v2 as role_row
  where role_row.game_session_id=p_game_session_id and role_row.id=v_candidate.role_id and role_row.status='active';
  if not found then raise exception 'BUSINESS_ROLE_UNAVAILABLE' using errcode='P0001'; end if;

  v_cash:=public.read_business_balance_v2(p_game_session_id,v_business.id,v_business.currency_code);
  if v_cash<v_candidate.expected_wage then raise exception 'BUSINESS_HIRING_PAYROLL_COVERAGE_REQUIRED' using errcode='P0001'; end if;
  v_policy:=public.business_labor_policy_v2(p_game_session_id);
  v_interval:=(v_policy->>'payrollIntervalHours')::integer;

  insert into public.business_employments_v2(
    game_session_id,business_id,candidate_id,role_id,hired_by_player_id,status,
    wage_per_cycle,market_wage_at_hire,next_payroll_at,payroll_interval_hours,idempotency_key,metadata
  ) values (
    p_game_session_id,v_business.id,v_candidate.id,v_role.id,p_player_id,'active',
    v_candidate.expected_wage,v_candidate.expected_wage,now()+make_interval(hours=>v_interval),v_interval,p_idempotency_key,
    jsonb_build_object('candidateKey',v_candidate.public_key)
  ) returning * into v_employment;
  update public.business_talent_candidates_v2
  set status='hired',hired_business_id=v_business.id,hired_at=now()
  where id=v_candidate.id;

  insert into public.business_activity_events(
    game_session_id,business_id,actor_type,actor_player_id,event_type,source_id,reason_code,metadata
  ) values (
    p_game_session_id,v_business.id,'player',p_player_id,'business.employee.hired',v_employment.id,'employee_hired',
    jsonb_build_object('employeeKey',v_employment.public_key,'candidateKey',v_candidate.public_key,'roleKey',v_role.role_key,'wage',v_employment.wage_per_cycle)
  );
  return query select v_employment.public_key,v_employment.status,v_role.role_key,v_employment.wage_per_cycle,v_employment.next_payroll_at,false;
end
$function$;

create or replace function public.business_employee_current_market_wage_v2(
  p_employment_id uuid
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_employment public.business_employments_v2%rowtype;
  v_candidate public.business_talent_candidates_v2%rowtype;
  v_role public.business_role_definitions_v2%rowtype;
begin
  select employment_row.* into v_employment from public.business_employments_v2 as employment_row where employment_row.id=p_employment_id;
  if not found then raise exception 'BUSINESS_EMPLOYEE_NOT_FOUND' using errcode='P0001'; end if;
  select candidate_row.* into v_candidate from public.business_talent_candidates_v2 as candidate_row where candidate_row.id=v_employment.candidate_id;
  select role_row.* into v_role from public.business_role_definitions_v2 as role_row where role_row.id=v_employment.role_id;
  return public.business_candidate_market_wage_v2(v_employment.game_session_id,v_candidate,v_role);
end
$function$;

create or replace function public.business_employee_retention_risk_v2(
  p_employment_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_employment public.business_employments_v2%rowtype;
  v_market numeric;
  v_ratio numeric;
begin
  select employment_row.* into v_employment from public.business_employments_v2 as employment_row where employment_row.id=p_employment_id;
  if not found then raise exception 'BUSINESS_EMPLOYEE_NOT_FOUND' using errcode='P0001'; end if;
  v_market:=public.business_employee_current_market_wage_v2(p_employment_id);
  v_ratio:=v_employment.wage_per_cycle/nullif(v_market,0);
  return case
    when v_employment.missed_payroll_cycles>0 or v_ratio<0.80 then 'critical'
    when v_ratio<0.90 then 'high'
    when v_ratio<1.00 then 'medium'
    else 'low'
  end;
end
$function$;

create or replace function public.adjust_business_employee_wage_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_employee_key text,
  p_strategy text,
  p_idempotency_key text
)
returns table (
  employee_key text,
  strategy text,
  previous_wage numeric,
  market_wage numeric,
  new_wage numeric,
  retention_risk text,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_employee public.business_employments_v2%rowtype;
  v_strategy text:=lower(btrim(coalesce(p_strategy,'')));
  v_market numeric;
  v_new numeric;
  v_previous numeric;
begin
  if v_strategy not in ('hold','match_market','market_plus_10','market_plus_20') then raise exception 'BUSINESS_WAGE_STRATEGY_INVALID' using errcode='P0001'; end if;
  if length(btrim(coalesce(p_idempotency_key,''))) not between 8 and 160 then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='P0001'; end if;
  if exists (
    select 1 from public.audit_log as audit_row where audit_row.game_session_id=p_game_session_id and audit_row.actor_id=p_player_id
      and audit_row.action='business.employee.wage_adjust' and audit_row.metadata->>'idempotency_key'=p_idempotency_key
  ) then
    select employee_row.* into v_employee from public.business_employments_v2 as employee_row where employee_row.public_key=lower(btrim(p_employee_key));
    v_market:=public.business_employee_current_market_wage_v2(v_employee.id);
    return query select v_employee.public_key,v_strategy,v_employee.wage_per_cycle,v_market,v_employee.wage_per_cycle,public.business_employee_retention_risk_v2(v_employee.id),true;
    return;
  end if;
  select business_row.* into v_business from public.business_entities as business_row
  where business_row.game_session_id=p_game_session_id and business_row.public_key=lower(btrim(p_business_key))
    and business_row.status<>'closed' and business_row.formation_state='operational';
  if not found then raise exception 'BUSINESS_NOT_FOUND_OR_NOT_OPERATIONAL' using errcode='P0001'; end if;
  if not exists (select 1 from public.business_ownership_positions where game_session_id=p_game_session_id and business_id=v_business.id and player_id=p_player_id and status='active')
    then raise exception 'BUSINESS_OWNERSHIP_REQUIRED' using errcode='P0001'; end if;
  select employee_row.* into v_employee from public.business_employments_v2 as employee_row
  where employee_row.game_session_id=p_game_session_id and employee_row.business_id=v_business.id
    and employee_row.public_key=lower(btrim(p_employee_key)) and employee_row.status in ('active','unpaid') for update;
  if not found then raise exception 'BUSINESS_EMPLOYEE_NOT_FOUND' using errcode='P0001'; end if;
  v_previous:=v_employee.wage_per_cycle;
  v_market:=public.business_employee_current_market_wage_v2(v_employee.id);
  v_new:=case v_strategy when 'hold' then v_previous when 'match_market' then v_market when 'market_plus_10' then round(v_market*1.10,2) else round(v_market*1.20,2) end;
  update public.business_employments_v2 set wage_per_cycle=v_new where id=v_employee.id returning * into v_employee;
  update public.business_employments_v2 set retention_risk=public.business_employee_retention_risk_v2(v_employee.id),
    retention_warning_since=case when public.business_employee_retention_risk_v2(v_employee.id) in ('high','critical') then coalesce(retention_warning_since,now()) else null end
  where id=v_employee.id returning * into v_employee;
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata)
  values(p_game_session_id,'player',p_player_id,'business.employee.wage_adjust','business_employee',v_employee.id,
    jsonb_build_object('idempotency_key',p_idempotency_key,'strategy',v_strategy,'previous_wage',v_previous,'market_wage',v_market,'new_wage',v_new));
  return query select v_employee.public_key,v_strategy,v_previous,v_market,v_new,v_employee.retention_risk,false;
end
$function$;

create or replace function public.process_due_business_payroll_v2(p_limit integer default 250)
returns table(processed integer,paid integer,missed integer)
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_limit integer:=least(2000,greatest(1,coalesce(p_limit,250)));
  v_employee public.business_employments_v2%rowtype;
  v_business public.business_entities%rowtype;
  v_cash numeric;
  v_processed integer:=0;
  v_paid integer:=0;
  v_missed integer:=0;
begin
  for v_employee in
    select employee_row.* from public.business_employments_v2 as employee_row
    join public.business_entities as business_row on business_row.game_session_id=employee_row.game_session_id and business_row.id=employee_row.business_id
    where employee_row.status in ('active','unpaid') and employee_row.next_payroll_at<=now()
      and business_row.status<>'closed' and business_row.formation_state='operational'
    order by employee_row.next_payroll_at,employee_row.id limit v_limit for update of employee_row skip locked
  loop
    v_processed:=v_processed+1;
    select business_row.* into v_business from public.business_entities as business_row where business_row.id=v_employee.business_id for update;
    v_cash:=public.read_business_balance_v2(v_employee.game_session_id,v_employee.business_id,v_business.currency_code);
    if v_cash>=v_employee.wage_per_cycle then
      perform public.record_business_ledger_entry_v2(v_employee.game_session_id,v_employee.business_id,-v_employee.wage_per_cycle,v_business.currency_code,
        'debit','business','payroll',v_employee.id,'system',null,jsonb_build_object('employee_key',v_employee.public_key));
      update public.business_employments_v2 set status='active',missed_payroll_cycles=0,
        next_payroll_at=next_payroll_at+make_interval(hours=>payroll_interval_hours),retention_risk=public.business_employee_retention_risk_v2(id)
      where id=v_employee.id;
      v_paid:=v_paid+1;
    else
      update public.business_employments_v2 set status='unpaid',missed_payroll_cycles=missed_payroll_cycles+1,
        next_payroll_at=next_payroll_at+make_interval(hours=>payroll_interval_hours),retention_risk='critical',
        retention_warning_since=coalesce(retention_warning_since,now()) where id=v_employee.id;
      insert into public.business_activity_events(game_session_id,business_id,actor_type,event_type,source_id,reason_code,metadata)
      values(v_employee.game_session_id,v_employee.business_id,'system','business.payroll.missed',v_employee.id,'insufficient_business_cash',
        jsonb_build_object('employeeKey',v_employee.public_key,'wage',v_employee.wage_per_cycle));
      v_missed:=v_missed+1;
    end if;
  end loop;
  return query select v_processed,v_paid,v_missed;
end
$function$;

create or replace function public.review_business_employee_retention_v2(p_limit integer default 500)
returns table(reviewed integer,warnings integer,departures integer)
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_limit integer:=least(5000,greatest(1,coalesce(p_limit,500)));
  v_employee public.business_employments_v2%rowtype;
  v_risk text;
  v_reviewed integer:=0;
  v_warnings integer:=0;
  v_departures integer:=0;
begin
  for v_employee in select * from public.business_employments_v2
    where status in ('active','unpaid') order by updated_at,id limit v_limit for update skip locked
  loop
    v_reviewed:=v_reviewed+1;
    v_risk:=public.business_employee_retention_risk_v2(v_employee.id);
    if v_risk in ('high','critical') then
      v_warnings:=v_warnings+1;
      if v_employee.retention_warning_since is null then
        update public.business_employments_v2 set retention_risk=v_risk,retention_warning_since=now() where id=v_employee.id;
      elsif v_risk='critical' and v_employee.retention_warning_since<=now()-interval '7 days' then
        update public.business_employments_v2 set status='departed',retention_risk='critical',departed_at=now(),departure_reason='persistent_under_market_pay_or_missed_payroll' where id=v_employee.id;
        insert into public.business_activity_events(game_session_id,business_id,actor_type,event_type,source_id,reason_code,metadata)
        values(v_employee.game_session_id,v_employee.business_id,'system','business.employee.departed',v_employee.id,'retention_risk_realized',
          jsonb_build_object('employeeKey',v_employee.public_key,'retentionRisk','critical','warningSince',v_employee.retention_warning_since));
        v_departures:=v_departures+1;
      else
        update public.business_employments_v2 set retention_risk=v_risk where id=v_employee.id;
      end if;
    else
      update public.business_employments_v2 set retention_risk=v_risk,retention_warning_since=null where id=v_employee.id;
    end if;
  end loop;
  return query select v_reviewed,v_warnings,v_departures;
end
$function$;

-- Production and R&D now consume the authoritative V2 workforce.
create or replace function public.business_recipe_workforce_ready_v2(p_game_session_id uuid,p_business_id uuid,p_recipe_id uuid)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $function$
declare v_requirement record; v_count integer; v_skill numeric;
begin
  for v_requirement in select * from public.business_recipe_workforce_requirements
    where game_session_id=p_game_session_id and recipe_id=p_recipe_id
  loop
    select count(*)::integer,coalesce(avg(public.business_candidate_stat_v2(candidate_row,role_row.primary_stat)),0)
    into v_count,v_skill
    from public.business_employments_v2 as employment_row
    join public.business_talent_candidates_v2 as candidate_row on candidate_row.id=employment_row.candidate_id
    join public.business_role_definitions_v2 as role_row on role_row.id=employment_row.role_id
    where employment_row.game_session_id=p_game_session_id and employment_row.business_id=p_business_id
      and employment_row.status='active' and role_row.role_key=v_requirement.role_key;
    if v_count<v_requirement.minimum_headcount or v_skill<v_requirement.minimum_skill then return false; end if;
  end loop;
  return true;
end
$function$;

create or replace function public.business_research_duration_multiplier_v2(p_game_session_id uuid,p_business_id uuid,p_recipe_id uuid)
returns numeric language plpgsql stable security definer set search_path=public,pg_temp as $function$
declare v_effect numeric;
begin
  select coalesce(sum(role_row.research_effect*(0.5+candidate_row.research/200.0)),0) into v_effect
  from public.business_employments_v2 as employment_row
  join public.business_talent_candidates_v2 as candidate_row on candidate_row.id=employment_row.candidate_id
  join public.business_role_definitions_v2 as role_row on role_row.id=employment_row.role_id
  where employment_row.game_session_id=p_game_session_id and employment_row.business_id=p_business_id and employment_row.status='active';
  return greatest(0.50,1-least(0.50,v_effect));
end
$function$;

create or replace function public.business_sales_workforce_multiplier_v2(p_game_session_id uuid,p_business_id uuid)
returns numeric language sql stable security definer set search_path=public,pg_temp as $function$
  select least(1.50,1+coalesce(sum(role_row.sales_effect*(0.5+candidate_row.sales/200.0)),0))
  from public.business_employments_v2 as employment_row
  join public.business_talent_candidates_v2 as candidate_row on candidate_row.id=employment_row.candidate_id
  join public.business_role_definitions_v2 as role_row on role_row.id=employment_row.role_id
  where employment_row.game_session_id=p_game_session_id and employment_row.business_id=p_business_id and employment_row.status='active'
$function$;

create or replace function public.business_protected_obligations_v2(p_game_session_id uuid,p_business_id uuid)
returns numeric language plpgsql stable security definer set search_path=public,pg_temp as $function$
declare v_payroll numeric:=0; v_debt numeric:=0;
begin
  select coalesce(sum(wage_per_cycle),0) into v_payroll from public.business_employments_v2
  where game_session_id=p_game_session_id and business_id=p_business_id and status in ('active','unpaid');
  select coalesce(sum(scheduled_payment),0) into v_debt from public.player_loans
  where game_session_id=p_game_session_id and business_id=p_business_id and status in ('active','delinquent','defaulted','restructured');
  return round(greatest(0,v_payroll+v_debt),2);
end
$function$;

revoke all on function public.business_labor_policy_v2(uuid) from public,anon,authenticated;
grant execute on function public.business_labor_policy_v2(uuid) to service_role;
revoke all on function public.ensure_standard_business_roles_v2(uuid) from public,anon,authenticated;
grant execute on function public.ensure_standard_business_roles_v2(uuid) to service_role;
revoke all on function public.refresh_business_talent_market_v2(uuid,text,date,integer) from public,anon,authenticated;
grant execute on function public.refresh_business_talent_market_v2(uuid,text,date,integer) to service_role;
revoke all on function public.hire_business_candidate_v2(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.hire_business_candidate_v2(uuid,uuid,text,text,text) to service_role;
revoke all on function public.adjust_business_employee_wage_v2(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.adjust_business_employee_wage_v2(uuid,uuid,text,text,text,text) to service_role;
revoke all on function public.process_due_business_payroll_v2(integer) from public,anon,authenticated;
grant execute on function public.process_due_business_payroll_v2(integer) to service_role;
revoke all on function public.review_business_employee_retention_v2(integer) from public,anon,authenticated;
grant execute on function public.review_business_employee_retention_v2(integer) to service_role;
revoke all on function public.business_recipe_workforce_ready_v2(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.business_recipe_workforce_ready_v2(uuid,uuid,uuid) to service_role;
revoke all on function public.business_research_duration_multiplier_v2(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.business_research_duration_multiplier_v2(uuid,uuid,uuid) to service_role;
revoke all on function public.business_sales_workforce_multiplier_v2(uuid,uuid) from public,anon,authenticated;
grant execute on function public.business_sales_workforce_multiplier_v2(uuid,uuid) to service_role;
revoke all on function public.business_protected_obligations_v2(uuid,uuid) from public,anon,authenticated;
grant execute on function public.business_protected_obligations_v2(uuid,uuid) to service_role;

commit;
