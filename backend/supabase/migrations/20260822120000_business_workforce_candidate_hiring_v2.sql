-- Business V2 Phase 4B: public candidate pools and server-owned hiring.
--
-- The browser chooses one candidate public key. Role, wage, skill, labor
-- capacity, country, currency, contract terms, and productivity are copied from
-- trusted candidate authority inside one transaction. Payroll settlement and
-- production-labor integration remain outside this checkpoint.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.business_workforce_candidates
  add column if not exists contract_type text not null default 'cycle';

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'business_workforce_candidates_contract_type_valid'
      and conrelid = 'public.business_workforce_candidates'::regclass
  ) then
    alter table public.business_workforce_candidates
      add constraint business_workforce_candidates_contract_type_valid
      check (contract_type in ('cycle', 'permanent'));
  end if;
end
$block$;

create unique index if not exists
  business_employees_candidate_player_active_unique
on public.business_employees (
  game_session_id,
  business_id,
  employee_player_id
)
where employee_player_id is not null
  and status = 'active'
  and workforce_source_type = 'candidate_v2';

create or replace function public.read_owned_business_workforce_candidates_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_business public.business_entities%rowtype;
  v_candidates jsonb;
  v_now timestamptz := statement_timestamp();
begin
  if p_game_session_id is null or p_player_id is null then
    raise exception 'PLAYER_SCOPE_REQUIRED' using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.owner_player_id = p_player_id
    and business_row.status <> 'closed'
  order by business_row.created_at asc
  limit 1;

  if not found then
    return jsonb_build_object(
      'businessKey', '',
      'generatedAt', v_now,
      'candidates', '[]'::jsonb
    );
  end if;

  if exists (
    select 1
    from public.business_entities as other_business
    where other_business.game_session_id = p_game_session_id
      and other_business.owner_player_id = p_player_id
      and other_business.status <> 'closed'
      and other_business.id <> v_business.id
  ) then
    raise exception 'BUSINESS_OWNERSHIP_AMBIGUOUS' using errcode = 'P0001';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'candidateKey', candidate_row.public_key,
        'roleKey', role_row.role_key,
        'roleName', role_row.display_name,
        'laborClass', role_row.labor_class,
        'displayLabel', candidate_row.display_label,
        'countryCode', candidate_row.country_code,
        'currencyCode', candidate_row.currency_code,
        'wagePerCycle', candidate_row.wage_per_cycle,
        'laborMinutesPerCycle', candidate_row.labor_minutes_per_cycle,
        'skillBasisPoints', candidate_row.skill_basis_points,
        'productivityIndex', 1,
        'contractType', candidate_row.contract_type,
        'availabilityEndsAt', candidate_row.availability_ends_at,
        'version', candidate_row.version
      )
      order by
        role_row.display_name asc,
        candidate_row.wage_per_cycle asc,
        candidate_row.display_label asc,
        candidate_row.public_key asc
    ),
    '[]'::jsonb
  )
  into v_candidates
  from public.business_workforce_candidates as candidate_row
  join public.business_workforce_role_definitions as role_row
    on role_row.id = candidate_row.role_definition_id
  where candidate_row.game_session_id = p_game_session_id
    and candidate_row.status = 'available'
    and candidate_row.availability_starts_at <= v_now
    and (
      candidate_row.availability_ends_at is null
      or candidate_row.availability_ends_at > v_now
    )
    and candidate_row.country_code = v_business.country_code
    and candidate_row.currency_code = v_business.currency_code
    and role_row.status = 'active';

  return jsonb_build_object(
    'businessKey', v_business.public_key,
    'generatedAt', v_now,
    'candidates', v_candidates
  );
end
$function$;

create or replace function public.hire_business_workforce_candidate_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_candidate_key text,
  p_idempotency_key text
)
returns table (
  business_key text,
  employee_key text,
  candidate_key text,
  workforce_role_key text,
  role_name text,
  contract_type text,
  wage_per_cycle numeric,
  currency_code text,
  labor_minutes_per_cycle integer,
  skill_basis_points integer,
  productivity_index numeric,
  employee_status text,
  hired_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_business public.business_entities%rowtype;
  v_candidate public.business_workforce_candidates%rowtype;
  v_role public.business_workforce_role_definitions%rowtype;
  v_employee public.business_employees%rowtype;
  v_request_hash text;
  v_replay_metadata jsonb;
  v_now timestamptz := statement_timestamp();
begin
  if p_game_session_id is null or p_player_id is null then
    raise exception 'PLAYER_SCOPE_REQUIRED' using errcode = 'P0001';
  end if;
  if p_business_key is null
    or lower(btrim(p_business_key)) !~ '^biz_[0-9a-f]{32}$'
  then
    raise exception 'BUSINESS_KEY_INVALID' using errcode = 'P0001';
  end if;
  if p_candidate_key is null
    or lower(btrim(p_candidate_key)) !~ '^wfc_[0-9a-f]{32}$'
  then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_KEY_INVALID'
      using errcode = 'P0001';
  end if;
  if p_idempotency_key is null
    or length(btrim(p_idempotency_key)) not between 8 and 160
  then
    raise exception 'IDEMPOTENCY_KEY_INVALID' using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = lower(btrim(p_business_key))
    and business_row.owner_player_id = p_player_id
    and business_row.status in ('active', 'restructuring')
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  v_request_hash := encode(
    digest(
      concat_ws(
        '|',
        p_game_session_id::text,
        p_player_id::text,
        v_business.public_key,
        lower(btrim(p_candidate_key))
      ),
      'sha256'
    ),
    'hex'
  );

  select audit_row.metadata
  into v_replay_metadata
  from public.audit_log as audit_row
  where audit_row.game_session_id = p_game_session_id
    and audit_row.actor_id = p_player_id
    and audit_row.action = 'business.workforce.candidate.hire'
    and audit_row.target_id = v_business.id
    and audit_row.metadata->>'idempotencyKey' = btrim(p_idempotency_key)
  order by audit_row.created_at desc
  limit 1;

  if found then
    if v_replay_metadata->>'requestHash' <> v_request_hash
      or v_replay_metadata->>'candidateKey'
        <> lower(btrim(p_candidate_key))
    then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;

    select employee_row.*
    into v_employee
    from public.business_employees as employee_row
    where employee_row.game_session_id = p_game_session_id
      and employee_row.business_id = v_business.id
      and employee_row.public_key = v_replay_metadata->>'employeeKey';
    if not found then
      raise exception 'BUSINESS_WORKFORCE_HIRE_REPLAY_MISSING'
        using errcode = 'P0001';
    end if;

    select candidate_row.*
    into v_candidate
    from public.business_workforce_candidates as candidate_row
    where candidate_row.id = v_employee.workforce_candidate_id;
    select role_row.*
    into v_role
    from public.business_workforce_role_definitions as role_row
    where role_row.id = v_employee.workforce_role_definition_id;

    return query select
      v_business.public_key,
      v_employee.public_key,
      v_candidate.public_key,
      v_role.role_key,
      v_employee.role_name,
      v_employee.contract_type,
      v_employee.wage_per_cycle,
      v_candidate.currency_code,
      v_employee.labor_minutes_per_cycle,
      v_employee.skill_basis_points,
      v_employee.productivity_index,
      v_employee.status,
      v_employee.hired_at,
      true;
    return;
  end if;

  select candidate_row.*
  into v_candidate
  from public.business_workforce_candidates as candidate_row
  where candidate_row.game_session_id = p_game_session_id
    and candidate_row.public_key = lower(btrim(p_candidate_key))
  for update;
  if not found then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if v_candidate.status <> 'available' then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_NOT_AVAILABLE'
      using errcode = 'P0001';
  end if;
  if v_candidate.availability_starts_at > v_now
    or (
      v_candidate.availability_ends_at is not null
      and v_candidate.availability_ends_at <= v_now
    )
  then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_EXPIRED'
      using errcode = 'P0001';
  end if;
  if v_candidate.country_code <> v_business.country_code then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_COUNTRY_MISMATCH'
      using errcode = 'P0001';
  end if;
  if v_candidate.currency_code <> v_business.currency_code then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_CURRENCY_MISMATCH'
      using errcode = 'P0001';
  end if;
  if v_candidate.candidate_player_id = p_player_id then
    raise exception 'BUSINESS_OWNER_CANNOT_HIRE_SELF'
      using errcode = 'P0001';
  end if;

  select role_row.*
  into v_role
  from public.business_workforce_role_definitions as role_row
  where role_row.id = v_candidate.role_definition_id
    and role_row.status = 'active';
  if not found then
    raise exception 'BUSINESS_WORKFORCE_ROLE_NOT_ACTIVE'
      using errcode = 'P0001';
  end if;

  if v_candidate.candidate_player_id is not null
    and exists (
      select 1
      from public.business_employees as employee_row
      where employee_row.game_session_id = p_game_session_id
        and employee_row.business_id = v_business.id
        and employee_row.employee_player_id = v_candidate.candidate_player_id
        and employee_row.status = 'active'
        and employee_row.workforce_source_type = 'candidate_v2'
    )
  then
    raise exception 'BUSINESS_WORKFORCE_PLAYER_ALREADY_EMPLOYED'
      using errcode = 'P0001';
  end if;

  update public.business_workforce_candidates
  set
    status = 'reserved',
    version = version + 1,
    updated_at = v_now
  where id = v_candidate.id
    and status = 'available';
  if not found then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_NOT_AVAILABLE'
      using errcode = 'P0001';
  end if;

  insert into public.business_employees (
    game_session_id,
    business_id,
    employee_player_id,
    role_name,
    contract_type,
    wage_per_cycle,
    productivity_index,
    status,
    workforce_candidate_id,
    workforce_role_definition_id,
    labor_minutes_per_cycle,
    skill_basis_points,
    workforce_source_type,
    workforce_version
  ) values (
    p_game_session_id,
    v_business.id,
    v_candidate.candidate_player_id,
    v_role.display_name,
    v_candidate.contract_type,
    v_candidate.wage_per_cycle,
    1,
    'active',
    v_candidate.id,
    v_role.id,
    v_candidate.labor_minutes_per_cycle,
    v_candidate.skill_basis_points,
    'candidate_v2',
    1
  )
  returning * into v_employee;

  update public.business_workforce_candidates
  set
    status = 'hired',
    metadata = metadata || jsonb_build_object(
      'hiredBusinessKey', v_business.public_key,
      'hiredEmployeeKey', v_employee.public_key,
      'hiredAt', v_now
    ),
    version = version + 1,
    updated_at = v_now
  where id = v_candidate.id
  returning * into v_candidate;

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
    'business.workforce.candidate.hire',
    'business',
    v_business.id,
    jsonb_build_object(
      'idempotencyKey', btrim(p_idempotency_key),
      'requestHash', v_request_hash,
      'businessKey', v_business.public_key,
      'candidateKey', v_candidate.public_key,
      'employeeKey', v_employee.public_key,
      'roleKey', v_role.role_key,
      'roleName', v_role.display_name,
      'contractType', v_candidate.contract_type,
      'wagePerCycle', v_candidate.wage_per_cycle,
      'currencyCode', v_candidate.currency_code,
      'laborMinutesPerCycle', v_candidate.labor_minutes_per_cycle,
      'skillBasisPoints', v_candidate.skill_basis_points,
      'productivityIndex', 1
    )
  );

  return query select
    v_business.public_key,
    v_employee.public_key,
    v_candidate.public_key,
    v_role.role_key,
    v_employee.role_name,
    v_employee.contract_type,
    v_employee.wage_per_cycle,
    v_candidate.currency_code,
    v_employee.labor_minutes_per_cycle,
    v_employee.skill_basis_points,
    v_employee.productivity_index,
    v_employee.status,
    v_employee.hired_at,
    false;
exception
  when unique_violation then
    raise exception 'BUSINESS_WORKFORCE_HIRE_CONFLICT'
      using errcode = 'P0001';
end
$function$;

revoke all on function public.read_owned_business_workforce_candidates_v2(
  uuid, uuid
) from public, anon, authenticated;
grant execute on function public.read_owned_business_workforce_candidates_v2(
  uuid, uuid
) to service_role;

revoke all on function public.hire_business_workforce_candidate_v2(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.hire_business_workforce_candidate_v2(
  uuid, uuid, text, text, text
) to service_role;

comment on function public.read_owned_business_workforce_candidates_v2(
  uuid, uuid
) is
  'Returns a public-key-only candidate pool for the Player-owned Business, filtered by Business country and currency.';
comment on function public.hire_business_workforce_candidate_v2(
  uuid, uuid, text, text, text
) is
  'Atomically locks and hires one trusted workforce candidate without accepting browser-authored labor economics.';

commit;
