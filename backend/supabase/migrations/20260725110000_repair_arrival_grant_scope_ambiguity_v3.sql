begin;

-- Forward-only qualification repair for the V2 Arrival grant executor.
-- RETURNS TABLE exposes player_id and other output names as PL/pgSQL variables;
-- all table predicates therefore remain explicitly qualified.

create or replace function public.apply_arrival_grant_command_v1(
  p_game_session_id uuid,
  p_grant_command_public_id text,
  p_processed_at timestamptz default now()
)
returns table (
  grant_outcome text,
  grant_command_id text,
  receipt_id text,
  player_id uuid,
  class_id text,
  arrival_package_definition_id text,
  grant_definition_id text,
  granted_balance numeric,
  currency_code text,
  starting_location_id text,
  progression_title text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_command public.arrival_grant_commands%rowtype;
  v_assignment public.arrival_class_assignments%rowtype;
  v_package public.arrival_package_runtime_definitions%rowtype;
  v_class_grant public.arrival_class_grant_definitions%rowtype;
  v_country public.world_country_runtime%rowtype;
  v_receipt public.player_arrival_grant_receipts%rowtype;
  v_ledger record;
begin
  if p_game_session_id is null
    or p_grant_command_public_id is null
    or p_grant_command_public_id !~ '^agc_[0-9a-f]{32}$'
    or p_processed_at is null
  then
    raise exception 'ARRIVAL_GRANT_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  select command_row.* into v_command
  from public.arrival_grant_commands as command_row
  where command_row.game_session_id = p_game_session_id
    and command_row.public_id = p_grant_command_public_id
  for update;

  if not found then
    raise exception 'ARRIVAL_GRANT_COMMAND_NOT_FOUND' using errcode = 'P0001';
  end if;

  select receipt_row.* into v_receipt
  from public.player_arrival_grant_receipts as receipt_row
  where receipt_row.game_session_id = p_game_session_id
    and receipt_row.grant_command_id = v_command.id;

  if found then
    return query select
      'replayed'::text,
      v_command.public_id,
      v_receipt.public_receipt_id,
      v_command.player_id,
      assignment_row.class_id,
      v_receipt.arrival_package_definition_id,
      v_receipt.grant_definition_id,
      v_receipt.granted_balance,
      v_receipt.currency_code,
      package_row.starting_location_id,
      grant_row.public_title
    from public.arrival_class_assignments as assignment_row
    join public.arrival_package_runtime_definitions as package_row
      on package_row.arrival_package_definition_id =
        v_receipt.arrival_package_definition_id
    join public.arrival_class_grant_definitions as grant_row
      on grant_row.grant_definition_id = v_receipt.grant_definition_id
    where assignment_row.id = v_command.assignment_id;
    return;
  end if;

  if not exists (
    select 1
    from public.seed_content_releases as release_row
    where release_row.game_session_id = p_game_session_id
      and release_row.status = 'applied_active'
      and release_row.target_environment in ('local', 'test', 'staging')
  ) then
    raise exception 'ARRIVAL_GRANT_NON_PRODUCTION_RELEASE_REQUIRED'
      using errcode = '42501';
  end if;

  select assignment_row.* into v_assignment
  from public.arrival_class_assignments as assignment_row
  where assignment_row.game_session_id = p_game_session_id
    and assignment_row.id = v_command.assignment_id
    and assignment_row.player_id = v_command.player_id;

  if not found then
    raise exception 'ARRIVAL_GRANT_ASSIGNMENT_INVALID' using errcode = 'P0001';
  end if;

  select package_row.* into v_package
  from public.arrival_package_runtime_definitions as package_row
  where package_row.arrival_package_definition_id =
      v_command.arrival_package_definition_id
    and package_row.country_id = v_assignment.country_id
    and package_row.status = 'active';

  if not found then
    raise exception 'ARRIVAL_PACKAGE_DEFINITION_INACTIVE' using errcode = 'P0001';
  end if;

  select grant_row.* into v_class_grant
  from public.arrival_class_grant_definitions as grant_row
  where grant_row.grant_definition_id = v_command.grant_definition_id
    and grant_row.class_id = v_assignment.class_id
    and grant_row.status = 'active';

  if not found then
    raise exception 'ARRIVAL_CLASS_GRANT_DEFINITION_INACTIVE'
      using errcode = 'P0001';
  end if;

  select country_row.* into v_country
  from public.world_country_runtime as country_row
  where country_row.game_session_id = p_game_session_id
    and country_row.country_id = v_assignment.country_id
    and country_row.arrival_package_definition_id =
      v_package.arrival_package_definition_id
    and country_row.currency_code = v_package.currency_code
    and country_row.arrival_location_id = v_package.starting_location_id;

  if not found then
    raise exception 'ARRIVAL_GRANT_WORLD_BINDING_INVALID' using errcode = 'P0001';
  end if;

  update public.arrival_grant_commands as command_row
  set status = 'processing',
      updated_at = p_processed_at
  where command_row.id = v_command.id
    and command_row.status in ('pending', 'failed', 'processing');

  perform public.ensure_player_progression_profile_v1(
    p_game_session_id,
    v_command.player_id
  );

  perform 1
  from public.initialize_player_travel_state_v1(
    p_game_session_id,
    v_command.player_id,
    v_package.starting_location_id,
    p_processed_at
  );

  insert into public.player_residency_states (
    game_session_id, player_id, current_country_id, currency_code,
    eligible_country_ids, pending_country_id, revision, updated_at
  ) values (
    p_game_session_id, v_command.player_id, v_assignment.country_id,
    v_package.currency_code, jsonb_build_array(v_assignment.country_id),
    null, 0, p_processed_at
  )
  on conflict on constraint player_residency_states_unique do update
  set
    current_country_id = excluded.current_country_id,
    currency_code = excluded.currency_code,
    eligible_country_ids = case
      when public.player_residency_states.eligible_country_ids
        @> jsonb_build_array(excluded.current_country_id)
      then public.player_residency_states.eligible_country_ids
      else public.player_residency_states.eligible_country_ids
        || jsonb_build_array(excluded.current_country_id)
    end,
    pending_country_id = null,
    updated_at = excluded.updated_at;

  select * into v_ledger
  from public.record_player_ledger_entry(
    p_game_session_id,
    v_command.player_id,
    'cash',
    v_package.approved_starting_balance,
    v_package.currency_code,
    'credit',
    'arrival',
    'arrival_package_grant',
    v_command.id,
    'system',
    null,
    jsonb_build_object(
      'grantCommandId', v_command.public_id,
      'arrivalPackageDefinitionId', v_package.arrival_package_definition_id,
      'grantDefinitionId', v_class_grant.grant_definition_id,
      'classId', v_class_grant.class_id
    )
  );

  update public.player_progression_profiles as profile_row
  set
    public_title = v_class_grant.public_title,
    public_summary = v_class_grant.public_summary,
    updated_at = p_processed_at
  where profile_row.game_session_id = p_game_session_id
    and profile_row.player_id = v_command.player_id;

  insert into public.player_arrival_grant_receipts (
    game_session_id, player_id, grant_command_id,
    arrival_package_definition_id, grant_definition_id, ledger_entry_id,
    granted_balance, currency_code, processed_at
  ) values (
    p_game_session_id, v_command.player_id, v_command.id,
    v_package.arrival_package_definition_id,
    v_class_grant.grant_definition_id,
    v_ledger.ledger_entry_id,
    v_package.approved_starting_balance,
    v_package.currency_code,
    p_processed_at
  )
  returning * into v_receipt;

  update public.arrival_grant_commands as command_row
  set
    status = 'completed',
    completed_at = p_processed_at,
    updated_at = p_processed_at
  where command_row.id = v_command.id;

  return query select
    'applied'::text,
    v_command.public_id,
    v_receipt.public_receipt_id,
    v_command.player_id,
    v_class_grant.class_id,
    v_package.arrival_package_definition_id,
    v_class_grant.grant_definition_id,
    v_package.approved_starting_balance,
    v_package.currency_code,
    v_package.starting_location_id,
    v_class_grant.public_title;
end;
$function$;

comment on function public.apply_arrival_grant_command_v1(
  uuid, text, timestamptz
) is
  'Processes one server-created Arrival grant command exactly once. V2.1 qualifies all table predicates against RETURNS TABLE variables.';

revoke all on function public.apply_arrival_grant_command_v1(
  uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_arrival_grant_command_v1(
  uuid, text, timestamptz
) to service_role;

commit;
