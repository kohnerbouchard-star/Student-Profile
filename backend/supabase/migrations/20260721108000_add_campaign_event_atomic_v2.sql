begin;

alter table public.campaign_effect_commands
  drop constraint campaign_effect_commands_kind_valid;
alter table public.campaign_effect_commands
  add constraint campaign_effect_commands_kind_valid check (effect_kind in (
    'publish_news', 'publish_cutscene', 'create_contract', 'notify_players',
    'apply_market_shock', 'set_store_scarcity', 'set_route_state',
    'apply_player_impact'
  ));

create or replace function public.execute_campaign_event_atomic_v2(
  p_game_session_id uuid,
  p_campaign_public_id text,
  p_expected_revision bigint,
  p_event_key text,
  p_trigger_key text,
  p_expected_phase text,
  p_next_phase text,
  p_complete_campaign boolean,
  p_prerequisite_event_keys jsonb,
  p_effect_commands jsonb,
  p_next_scheduled_at timestamptz,
  p_actor_staff_user_id uuid,
  p_reason text,
  p_occurred_at timestamptz
)
returns table (
  execution_outcome text,
  campaign_id text,
  event_id text,
  status text,
  current_phase text,
  revision bigint,
  event_sequence bigint,
  outcome text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_campaign public.campaign_instances%rowtype;
  v_execution public.campaign_event_executions%rowtype;
  v_execution_key text;
  v_sequence bigint;
  v_effect jsonb;
  v_effect_index integer := 0;
  v_effect_kind text;
  v_idempotency_key text;
  v_next_status text;
  v_outcome text;
  v_missing_prerequisite text;
  v_actor_type text;
begin
  if p_game_session_id is null
    or p_campaign_public_id !~ '^cmp_[0-9a-f]{32}$'
    or p_expected_revision is null or p_expected_revision < 0
    or p_event_key !~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
    or p_trigger_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$'
    or p_expected_phase not in (
      'arrival', 'opportunity', 'rivalry', 'shortage',
      'meridian_disruption', 'open_conflict', 'adaptation',
      'reconstruction', 'continued_conflict'
    )
    or (p_next_phase is not null and p_next_phase not in (
      'arrival', 'opportunity', 'rivalry', 'shortage',
      'meridian_disruption', 'open_conflict', 'adaptation',
      'reconstruction', 'continued_conflict'
    ))
    or p_complete_campaign is null
    or jsonb_typeof(p_prerequisite_event_keys) <> 'array'
    or jsonb_array_length(p_prerequisite_event_keys) > 64
    or jsonb_typeof(p_effect_commands) <> 'array'
    or jsonb_array_length(p_effect_commands) not between 1 and 32
    or length(coalesce(p_reason, '')) > 1000
    or p_occurred_at is null
  then
    raise exception 'CAMPAIGN_EVENT_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  perform 1
  from public.game_sessions as game_row
  where game_row.id = p_game_session_id
    and game_row.status = 'active'
  for update;
  if not found then
    raise exception 'CAMPAIGN_GAME_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  select campaign_row.* into v_campaign
  from public.campaign_instances as campaign_row
  where campaign_row.game_session_id = p_game_session_id
    and campaign_row.public_id = p_campaign_public_id
  for update;
  if not found then
    raise exception 'CAMPAIGN_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_execution_key := p_event_key || ':' || p_trigger_key;
  select execution_row.* into v_execution
  from public.campaign_event_executions as execution_row
  where execution_row.campaign_instance_id = v_campaign.id
    and execution_row.execution_key = v_execution_key;

  if found then
    return query select
      'replayed'::text,
      v_campaign.public_id,
      v_execution.public_id,
      v_campaign.status,
      v_campaign.current_phase,
      v_campaign.revision,
      v_campaign.event_sequence,
      v_campaign.outcome;
    return;
  end if;

  if v_campaign.status <> 'active' then
    raise exception 'CAMPAIGN_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  if v_campaign.revision <> p_expected_revision then
    raise exception 'CAMPAIGN_REVISION_CONFLICT' using errcode = '40001';
  end if;
  if v_campaign.current_phase <> p_expected_phase then
    raise exception 'CAMPAIGN_PHASE_CONFLICT' using errcode = '40001';
  end if;

  select prerequisite.value into v_missing_prerequisite
  from jsonb_array_elements_text(p_prerequisite_event_keys) as prerequisite(value)
  where not exists (
    select 1
    from public.campaign_event_executions as execution_row
    where execution_row.campaign_instance_id = v_campaign.id
      and execution_row.event_key = prerequisite.value
  )
  limit 1;
  if v_missing_prerequisite is not null then
    raise exception 'CAMPAIGN_PREREQUISITE_MISSING' using errcode = 'P0001';
  end if;

  if p_complete_campaign then
    if p_expected_phase <> 'adaptation'
      or p_next_phase not in ('reconstruction', 'continued_conflict')
      or p_next_scheduled_at is not null
    then
      raise exception 'CAMPAIGN_TRANSITION_INVALID' using errcode = 'P0001';
    end if;
  elsif (p_expected_phase, p_next_phase) not in (
    ('arrival', 'opportunity'),
    ('opportunity', 'rivalry'),
    ('rivalry', 'shortage'),
    ('shortage', 'meridian_disruption'),
    ('meridian_disruption', 'open_conflict'),
    ('open_conflict', 'adaptation')
  ) then
    raise exception 'CAMPAIGN_TRANSITION_INVALID' using errcode = 'P0001';
  end if;

  if not p_complete_campaign and (
    p_next_scheduled_at is null or p_next_scheduled_at <= p_occurred_at
  ) then
    raise exception 'CAMPAIGN_NEXT_SCHEDULE_INVALID' using errcode = 'P0001';
  end if;

  v_sequence := v_campaign.event_sequence + 1;
  v_next_status := case when p_complete_campaign then 'completed' else 'active' end;
  v_outcome := case when p_complete_campaign then p_next_phase else null end;

  insert into public.campaign_event_executions (
    game_session_id,
    campaign_instance_id,
    event_key,
    execution_key,
    from_phase,
    to_phase,
    sequence,
    actor_type,
    actor_staff_user_id,
    reason,
    occurred_at
  ) values (
    p_game_session_id,
    v_campaign.id,
    p_event_key,
    v_execution_key,
    p_expected_phase,
    p_next_phase,
    v_sequence,
    case when p_actor_staff_user_id is null then 'system' else 'staff_user' end,
    p_actor_staff_user_id,
    nullif(btrim(coalesce(p_reason, '')), ''),
    p_occurred_at
  ) returning * into v_execution;

  for v_effect in select value from jsonb_array_elements(p_effect_commands)
  loop
    v_effect_index := v_effect_index + 1;
    if jsonb_typeof(v_effect) <> 'object'
      or coalesce(v_effect->>'effectKind', '') not in (
        'publish_news', 'publish_cutscene', 'create_contract', 'notify_players',
        'apply_market_shock', 'set_store_scarcity', 'set_route_state',
        'apply_player_impact'
      )
      or coalesce(v_effect->>'idempotencyKey', '') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
      or jsonb_typeof(v_effect->'payload') <> 'object'
    then
      raise exception 'CAMPAIGN_EFFECT_COMMAND_INVALID' using errcode = 'P0001';
    end if;

    v_effect_kind := v_effect->>'effectKind';
    v_idempotency_key := v_effect->>'idempotencyKey';
    insert into public.campaign_effect_commands (
      game_session_id,
      campaign_instance_id,
      event_execution_id,
      idempotency_key,
      effect_kind,
      payload,
      status,
      attempt_count,
      created_at
    ) values (
      p_game_session_id,
      v_campaign.id,
      v_execution.id,
      v_idempotency_key,
      v_effect_kind,
      v_effect->'payload',
      'pending',
      0,
      p_occurred_at
    );
  end loop;

  update public.campaign_instances
  set status = v_next_status,
      current_phase = p_next_phase,
      revision = revision + 1,
      event_sequence = v_sequence,
      outcome = v_outcome,
      scheduled_at = p_next_scheduled_at,
      completed_at = case when p_complete_campaign then p_occurred_at else null end,
      updated_at = p_occurred_at
  where id = v_campaign.id
  returning * into v_campaign;

  v_actor_type := case when p_actor_staff_user_id is null then 'system' else 'staff_user' end;
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
    v_actor_type,
    p_actor_staff_user_id,
    'execute_event',
    'active',
    v_campaign.status,
    p_expected_phase,
    p_next_phase,
    nullif(btrim(coalesce(p_reason, '')), ''),
    p_occurred_at
  );

  return query select
    'executed'::text,
    v_campaign.public_id,
    v_execution.public_id,
    v_campaign.status,
    v_campaign.current_phase,
    v_campaign.revision,
    v_campaign.event_sequence,
    v_campaign.outcome;
end;
$function$;

revoke all on function public.execute_campaign_event_atomic_v2(
  uuid, text, bigint, text, text, text, text, boolean,
  jsonb, jsonb, timestamptz, uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.execute_campaign_event_atomic_v2(
  uuid, text, bigint, text, text, text, text, boolean,
  jsonb, jsonb, timestamptz, uuid, text, timestamptz
) to service_role;

commit;
