-- Phase 4A hardening: bind workforce/payroll evidence to one Business scope.
begin;

create unique index if not exists business_employees_scope_business_role_id_unique
  on public.business_employees (
    game_session_id,
    business_id,
    id,
    workforce_role_definition_id
  );

create unique index if not exists business_production_runs_scope_business_id_unique
  on public.business_production_runs (
    game_session_id,
    business_id,
    id
  );

create unique index if not exists business_payroll_runs_scope_business_currency_id_unique
  on public.business_payroll_runs (
    game_session_id,
    business_id,
    id,
    currency_code
  );

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'business_labor_reservations_employee_role_scope_fk'
      and conrelid = 'public.business_labor_reservations'::regclass
  ) then
    alter table public.business_labor_reservations
      add constraint business_labor_reservations_employee_role_scope_fk
      foreign key (
        game_session_id,
        business_id,
        employee_id,
        role_definition_id
      )
      references public.business_employees (
        game_session_id,
        business_id,
        id,
        workforce_role_definition_id
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'business_labor_reservations_run_business_scope_fk'
      and conrelid = 'public.business_labor_reservations'::regclass
  ) then
    alter table public.business_labor_reservations
      add constraint business_labor_reservations_run_business_scope_fk
      foreign key (
        game_session_id,
        business_id,
        production_run_id
      )
      references public.business_production_runs (
        game_session_id,
        business_id,
        id
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'business_payroll_entries_run_business_currency_scope_fk'
      and conrelid = 'public.business_payroll_entries'::regclass
  ) then
    alter table public.business_payroll_entries
      add constraint business_payroll_entries_run_business_currency_scope_fk
      foreign key (
        game_session_id,
        business_id,
        payroll_run_id,
        currency_code
      )
      references public.business_payroll_runs (
        game_session_id,
        business_id,
        id,
        currency_code
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'business_payroll_entries_employee_role_scope_fk'
      and conrelid = 'public.business_payroll_entries'::regclass
  ) then
    alter table public.business_payroll_entries
      add constraint business_payroll_entries_employee_role_scope_fk
      foreign key (
        game_session_id,
        business_id,
        employee_id,
        role_definition_id
      )
      references public.business_employees (
        game_session_id,
        business_id,
        id,
        workforce_role_definition_id
      );
  end if;
end
$block$;

create or replace function public.enforce_business_workforce_candidate_role_floor_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_minimum_skill_basis_points integer;
begin
  select role_row.minimum_skill_basis_points
  into v_minimum_skill_basis_points
  from public.business_workforce_role_definitions as role_row
  where role_row.id = new.role_definition_id;

  if not found then
    raise exception 'BUSINESS_WORKFORCE_ROLE_NOT_FOUND'
      using errcode = 'P0001';
  end if;
  if new.skill_basis_points < v_minimum_skill_basis_points then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_SKILL_BELOW_ROLE_MINIMUM'
      using errcode = 'P0001';
  end if;
  return new;
end
$function$;

create or replace function public.enforce_business_recipe_labor_role_floor_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_minimum_skill_basis_points integer;
begin
  select role_row.minimum_skill_basis_points
  into v_minimum_skill_basis_points
  from public.business_workforce_role_definitions as role_row
  where role_row.id = new.role_definition_id;

  if not found then
    raise exception 'BUSINESS_WORKFORCE_ROLE_NOT_FOUND'
      using errcode = 'P0001';
  end if;
  if new.minimum_skill_basis_points < v_minimum_skill_basis_points then
    raise exception 'BUSINESS_RECIPE_LABOR_SKILL_BELOW_ROLE_MINIMUM'
      using errcode = 'P0001';
  end if;
  return new;
end
$function$;

create or replace function public.enforce_business_workforce_role_floor_update_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.minimum_skill_basis_points <= old.minimum_skill_basis_points then
    return new;
  end if;

  if exists (
    select 1
    from public.business_workforce_candidates as candidate_row
    where candidate_row.role_definition_id = new.id
      and candidate_row.skill_basis_points < new.minimum_skill_basis_points
  ) then
    raise exception 'BUSINESS_WORKFORCE_ROLE_MINIMUM_EXCEEDS_CANDIDATE_SKILL'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.business_recipe_labor_requirements as requirement_row
    where requirement_row.role_definition_id = new.id
      and requirement_row.minimum_skill_basis_points
        < new.minimum_skill_basis_points
  ) then
    raise exception 'BUSINESS_WORKFORCE_ROLE_MINIMUM_EXCEEDS_RECIPE_REQUIREMENT'
      using errcode = 'P0001';
  end if;

  return new;
end
$function$;

drop trigger if exists enforce_business_workforce_candidate_role_floor
  on public.business_workforce_candidates;
create trigger enforce_business_workforce_candidate_role_floor
before insert or update of role_definition_id, skill_basis_points
on public.business_workforce_candidates
for each row
execute function public.enforce_business_workforce_candidate_role_floor_v2();

drop trigger if exists enforce_business_recipe_labor_role_floor
  on public.business_recipe_labor_requirements;
create trigger enforce_business_recipe_labor_role_floor
before insert or update of role_definition_id, minimum_skill_basis_points
on public.business_recipe_labor_requirements
for each row
execute function public.enforce_business_recipe_labor_role_floor_v2();

drop trigger if exists enforce_business_workforce_role_floor_update
  on public.business_workforce_role_definitions;
create trigger enforce_business_workforce_role_floor_update
before update of minimum_skill_basis_points
on public.business_workforce_role_definitions
for each row
execute function public.enforce_business_workforce_role_floor_update_v2();

revoke all on function public.enforce_business_workforce_candidate_role_floor_v2()
  from public, anon, authenticated;
revoke all on function public.enforce_business_recipe_labor_role_floor_v2()
  from public, anon, authenticated;
revoke all on function public.enforce_business_workforce_role_floor_update_v2()
  from public, anon, authenticated;

revoke delete on table public.business_workforce_role_definitions
  from service_role;
revoke delete on table public.business_workforce_candidates
  from service_role;
revoke delete on table public.business_recipe_labor_requirements
  from service_role;
revoke delete on table public.business_labor_reservations
  from service_role;
revoke delete on table public.business_payroll_runs
  from service_role;
revoke delete on table public.business_payroll_entries
  from service_role;

comment on constraint business_labor_reservations_employee_role_scope_fk
  on public.business_labor_reservations is
  'Labor reservations must reference an employee and canonical role owned by the same Business.';
comment on constraint business_labor_reservations_run_business_scope_fk
  on public.business_labor_reservations is
  'Production-linked labor reservations cannot reference a run owned by another Business.';
comment on constraint business_payroll_entries_run_business_currency_scope_fk
  on public.business_payroll_entries is
  'Payroll entries must match their payroll run Business and currency.';
comment on constraint business_payroll_entries_employee_role_scope_fk
  on public.business_payroll_entries is
  'Payroll entries must reference an employee and canonical role owned by the same Business.';

commit;
