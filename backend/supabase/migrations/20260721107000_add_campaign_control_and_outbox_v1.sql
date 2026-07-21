begin;

create or replace function public.initialize_campaign_instance_v1(
  p_game_session_id uuid,
  p_pack_id text,
  p_pack_version text,
  p_definition_id text,
  p_definition_digest text,
  p_scheduled_at timestamptz,
  p_initialized_at timestamptz
)
returns table (
  initialization_outcome text,
  campaign_id text,
  status text,
  current_phase text,
  revision bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_campaign public.campaign_instances%rowtype;
begin
  if p_game_session_id is null
    or p_pack_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    or length(btrim(coalesce(p_pack_version, ''))) not between 1 and 64
    or p_definition_id !~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
    or length(btrim(coalesce(p_definition_digest, ''))) not between 16 and 160
    or p_initialized_at is null
  then
    raise exception 'CAMPAIGN_INITIALIZATION_INVALID' using errcode = 'P0001';
  end if;

  perform 1
  from public.game_sessions as game_row
  where game_row.id = p_game_session_id
    and game_row.status in ('draft', 'active')
  for update;
  if not found then
    raise exception 'CAMPAIGN_GAME_NOT_INITIALIZABLE' using errcode = 'P0001';
  end if;

  select campaign_row.* into v_campaign
  from public.campaign_instances as campaign_row
  where campaign_row.game_session_id = p_game_session_id
    and campaign_row.definition_id = p_definition_id
  for update;

  if found then
    if v_campaign.pack_id <> p_pack_id
      or v_campaign.pack_version <> p_pack_version
      or v_campaign.definition_digest <> p_definition_digest
    then
      raise exception 'CAMPAIGN_DEFINITION_CONFLICT' using errcode = 'P0001';
    end if;
    return query select
      'replayed'::text,
      v_campaign.public_id,
      v_campaign.status,
      v_campaign.current_phase,
      v_campaign.revision;
    return;
  end if;

  insert into public.campaign_instances (
    game_session_id,
    pack_id,
    pack_version,
    definition_id,
    definition_digest,
    status,
    current_phase,
    revision,
    event_sequence,
    scheduled_at,
    created_at,
    updated_at
  ) values (
    p_game_session_id,
    p_pack_id,
    p_pack_version,
    p_definition_id,
    p_definition_digest,
    'active',
    'arrival',
    0,
    0,
    p_scheduled_at,
    p_initialized_at,
    p_initialized_at
  ) returning * into v_campaign;

  insert into public.campaign_admin_audit (
    game_session_id,
    campaign_instance_id,
    actor_type,
    actor_staff_user_id,
    action,
    from_status,
    to_status,
    from_phase,
    to_phase,
    reason,
    occurred_at
  ) values (
    p_game_session_id,
    v_campaign.id,
    'system',
    null,
    'create',
    'active',
    'active',
    'arrival',
    'arrival',
    null,
    p_initialized_at
  );

  return query select
    'initialized'::text,
    v_campaign.public_id,
    v_campaign.status,
    v_campaign.current_phase,
    v_campaign.revision;
end;
$function$;

create or replace function public.control_campaign_instance_atomic_v1(
  p_game_session_id uuid,
  p_campaign_public_id text,
  p_expected_revision bigint,
  p_action text,
  p_corrected_phase text,
  p_actor_staff_user_id uuid,
  p_reason text,
  p_occurred_at timestamptz
)
returns table (
  campaign_id text,
  status text,
  current_phase text,
  revision bigint,
  paused_at timestamptz,
  disabled_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_campaign public.campaign_instances%rowtype;
  v_game_status text;
  v_from_status text;
  v_from_phase text;
  v_target_phase text;
  v_current_index integer;
  v_target_index integer;
begin
  if p_game_session_id is null
    or p_campaign_public_id !~ '^cmp_[0-9a-f]{32}$'
    or p_expected_revision is null or p_expected_revision < 0
    or p_action not in ('pause', 'resume', 'emergency_disable', 'correct_phase')
    or p_actor_staff_user_id is null
    or length(btrim(coalesce(p_reason, ''))) not between 12 and 1000
    or p_occurred_at is null
  then
    raise exception 'CAMPAIGN_CONTROL_INVALID' using errcode = 'P0001';
  end if;

  select game_row.status into v_game_status
  from public.game_sessions as game_row
  where game_row.id = p_game_session_id
  for share;
  if v_game_status is null then
    raise exception 'CAMPAIGN_GAME_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_game_status in ('ended', 'archived') then
    raise exception 'CAMPAIGN_GAME_NOT_MUTABLE' using errcode = 'P0001';
  end if;

  perform 1
  from public.staff_users as staff_row
  where staff_row.id = p_actor_staff_user_id;
  if not found then
    raise exception 'CAMPAIGN_ACTOR_NOT_FOUND' using errcode = 'P0001';
  end if;

  select campaign_row.* into v_campaign
  from public.campaign_instances as campaign_row
  where campaign_row.game_session_id = p_game_session_id
    and campaign_row.public_id = p_campaign_public_id
  for update;
  if not found then
    raise exception 'CAMPAIGN_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_campaign.revision <> p_expected_revision then
    raise exception 'CAMPAIGN_REVISION_CONFLICT' using errcode = '40001';
  end if;

  v_from_status := v_campaign.status;
  v_from_phase := v_campaign.current_phase;
  v_target_phase := v_campaign.current_phase;

  if p_action = 'pause' then
    if v_campaign.status <> 'active' then
      raise exception 'CAMPAIGN_CONTROL_STATE_INVALID' using errcode = 'P0001';
    end if;
    update public.campaign_instances
    set status = 'paused',
        paused_at = p_occurred_at,
        scheduled_at = null,
        revision = revision + 1
    where id = v_campaign.id
    returning * into v_campaign;
  elsif p_action = 'resume' then
    if v_campaign.status <> 'paused' or v_game_status <> 'active' then
      raise exception 'CAMPAIGN_CONTROL_STATE_INVALID' using errcode = 'P0001';
    end if;
    update public.campaign_instances
    set status = 'active',
        paused_at = null,
        revision = revision + 1
    where id = v_campaign.id
    returning * into v_campaign;
  elsif p_action = 'emergency_disable' then
    if v_campaign.status = 'completed' then
      raise exception 'CAMPAIGN_CONTROL_STATE_INVALID' using errcode = 'P0001';
    end if;
    update public.campaign_instances
    set status = 'emergency_disabled',
        disabled_at = p_occurred_at,
        scheduled_at = null,
        revision = revision + 1
    where id = v_campaign.id
    returning * into v_campaign;
  else
    if p_corrected_phase not in (
      'arrival', 'opportunity', 'rivalry', 'shortage',
      'meridian_disruption', 'open_conflict', 'adaptation'
    ) or v_campaign.current_phase in ('reconstruction', 'continued_conflict') then
      raise exception 'CAMPAIGN_CORRECTION_INVALID' using errcode = 'P0001';
    end if;

    v_current_index := array_position(
      array[
        'arrival', 'opportunity', 'rivalry', 'shortage',
        'meridian_disruption', 'open_conflict', 'adaptation'
      ],
      v_campaign.current_phase
    );
    v_target_index := array_position(
      array[
        'arrival', 'opportunity', 'rivalry', 'shortage',
        'meridian_disruption', 'open_conflict', 'adaptation'
      ],
      p_corrected_phase
    );
    if abs(v_current_index - v_target_index) > 1 then
      raise exception 'CAMPAIGN_CORRECTION_OUT_OF_BOUNDS' using errcode = 'P0001';
    end if;

    v_target_phase := p_corrected_phase;
    update public.campaign_instances
    set current_phase = p_corrected_phase,
        revision = revision + 1
    where id = v_campaign.id
    returning * into v_campaign;
  end if;

  insert into public.campaign_admin_audit (
    game_session_id,
    campaign_instance_id,
    actor_type,
    actor_staff_user_id,
    action,
    from_status,
    to_status,
    from_phase,
    to_phase,
    reason,
    occurred_at
  ) values (
    p_game_session_id,
    v_campaign.id,
    'staff_user',
    p_actor_staff_user_id,
    p_action,
    v_from_status,
    v_campaign.status,
    v_from_phase,
    v_target_phase,
    btrim(p_reason),
    p_occurred_at
  );

  return query select
    v_campaign.public_id,
    v_campaign.status,
    v_campaign.current_phase,
    v_campaign.revision,
    v_campaign.paused_at,
    v_campaign.disabled_at;
end;
$function$;

create or replace function public.claim_campaign_effect_commands_v1(
  p_limit integer,
  p_claimed_at timestamptz
)
returns table (
  command_id text,
  game_session_id uuid,
  campaign_id text,
  idempotency_key text,
  effect_kind text,
  payload jsonb,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_claimed_at is null then
    raise exception 'CAMPAIGN_CLAIM_INVALID' using errcode = 'P0001';
  end if;

  return query
  with selected as (
    select command_row.id
    from public.campaign_effect_commands as command_row
    where (
      command_row.status = 'pending'
      or (
        command_row.status = 'failed'
        and command_row.attempt_count < 25
      )
      or (
        command_row.status = 'processing'
        and command_row.claimed_at < p_claimed_at - interval '5 minutes'
        and command_row.attempt_count < 25
      )
    )
    order by command_row.created_at, command_row.public_id
    limit p_limit
    for update skip locked
  ), updated as (
    update public.campaign_effect_commands as command_row
    set status = 'processing',
        attempt_count = command_row.attempt_count + 1,
        claimed_at = p_claimed_at,
        last_error_code = null
    from selected
    where command_row.id = selected.id
    returning command_row.*
  )
  select
    updated.public_id,
    updated.game_session_id,
    campaign_row.public_id,
    updated.idempotency_key,
    updated.effect_kind,
    updated.payload,
    updated.attempt_count
  from updated
  join public.campaign_instances as campaign_row
    on campaign_row.id = updated.campaign_instance_id
  order by updated.created_at, updated.public_id;
end;
$function$;

create or replace function public.complete_campaign_effect_command_v1(
  p_command_public_id text,
  p_completed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_updated integer;
begin
  if p_command_public_id !~ '^cec_[0-9a-f]{32}$' or p_completed_at is null then
    raise exception 'CAMPAIGN_COMMAND_COMPLETION_INVALID' using errcode = 'P0001';
  end if;

  update public.campaign_effect_commands
  set status = 'completed',
      completed_at = p_completed_at,
      last_error_code = null
  where public_id = p_command_public_id
    and status in ('processing', 'completed');
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$function$;

create or replace function public.fail_campaign_effect_command_v1(
  p_command_public_id text,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_updated integer;
begin
  if p_command_public_id !~ '^cec_[0-9a-f]{32}$'
    or p_error_code !~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
  then
    raise exception 'CAMPAIGN_COMMAND_FAILURE_INVALID' using errcode = 'P0001';
  end if;

  update public.campaign_effect_commands
  set status = 'failed',
      last_error_code = p_error_code,
      claimed_at = null
  where public_id = p_command_public_id
    and status = 'processing';
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$function$;

revoke all on function public.initialize_campaign_instance_v1(
  uuid, text, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function public.control_campaign_instance_atomic_v1(
  uuid, text, bigint, text, text, uuid, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.claim_campaign_effect_commands_v1(integer, timestamptz)
  from public, anon, authenticated;
revoke all on function public.complete_campaign_effect_command_v1(text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.fail_campaign_effect_command_v1(text, text)
  from public, anon, authenticated;

grant execute on function public.initialize_campaign_instance_v1(
  uuid, text, text, text, text, timestamptz, timestamptz
) to service_role;
grant execute on function public.control_campaign_instance_atomic_v1(
  uuid, text, bigint, text, text, uuid, text, timestamptz
) to service_role;
grant execute on function public.claim_campaign_effect_commands_v1(integer, timestamptz)
  to service_role;
grant execute on function public.complete_campaign_effect_command_v1(text, timestamptz)
  to service_role;
grant execute on function public.fail_campaign_effect_command_v1(text, text)
  to service_role;

commit;
