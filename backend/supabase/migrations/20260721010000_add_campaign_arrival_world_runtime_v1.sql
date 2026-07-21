begin;

create table public.campaign_instances (
  id uuid primary key default gen_random_uuid(),
  public_id text not null default ('cmp_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  pack_id text not null,
  pack_version text not null,
  definition_id text not null,
  definition_digest text not null,
  status text not null default 'active',
  current_phase text not null default 'arrival',
  revision bigint not null default 0,
  event_sequence bigint not null default 0,
  outcome text null,
  scheduled_at timestamptz null,
  paused_at timestamptz null,
  disabled_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_instances_game_id_unique unique (game_session_id, id),
  constraint campaign_instances_public_id_unique unique (public_id),
  constraint campaign_instances_definition_unique unique (game_session_id, definition_id),
  constraint campaign_instances_public_id_valid check (public_id ~ '^cmp_[0-9a-f]{32}$'),
  constraint campaign_instances_pack_id_valid check (pack_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  constraint campaign_instances_pack_version_valid check (length(btrim(pack_version)) between 1 and 64),
  constraint campaign_instances_definition_id_valid check (definition_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  constraint campaign_instances_definition_digest_valid check (length(btrim(definition_digest)) between 16 and 160),
  constraint campaign_instances_status_valid check (status in ('active', 'paused', 'emergency_disabled', 'completed')),
  constraint campaign_instances_phase_valid check (current_phase in (
    'arrival', 'opportunity', 'rivalry', 'shortage', 'meridian_disruption',
    'open_conflict', 'adaptation', 'reconstruction', 'continued_conflict'
  )),
  constraint campaign_instances_revision_valid check (revision >= 0 and event_sequence >= 0),
  constraint campaign_instances_outcome_valid check (outcome is null or outcome in ('reconstruction', 'continued_conflict')),
  constraint campaign_instances_completion_valid check (
    (status = 'completed' and completed_at is not null and outcome is not null)
    or (status <> 'completed' and completed_at is null and outcome is null)
  )
);

create trigger set_campaign_instances_updated_at
before update on public.campaign_instances
for each row execute function public.set_current_timestamp_updated_at();

create index campaign_instances_game_status_schedule_idx
  on public.campaign_instances (game_session_id, status, scheduled_at, public_id);

create table public.campaign_event_executions (
  id uuid primary key default gen_random_uuid(),
  public_id text not null default ('cev_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null,
  campaign_instance_id uuid not null,
  event_key text not null,
  trigger_key text not null,
  execution_key text not null,
  from_phase text not null,
  to_phase text not null,
  sequence bigint not null,
  actor_type text not null,
  actor_staff_user_id uuid null references public.staff_users (id) on delete restrict,
  reason text null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint campaign_event_executions_campaign_fk
    foreign key (game_session_id, campaign_instance_id)
    references public.campaign_instances (game_session_id, id) on delete cascade,
  constraint campaign_event_executions_game_id_unique unique (game_session_id, id),
  constraint campaign_event_executions_public_id_unique unique (public_id),
  constraint campaign_event_executions_replay_unique unique (campaign_instance_id, execution_key),
  constraint campaign_event_executions_sequence_unique unique (campaign_instance_id, sequence),
  constraint campaign_event_executions_public_id_valid check (public_id ~ '^cev_[0-9a-f]{32}$'),
  constraint campaign_event_executions_event_key_valid check (event_key ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'),
  constraint campaign_event_executions_trigger_key_valid check (length(btrim(trigger_key)) between 1 and 160),
  constraint campaign_event_executions_execution_key_valid check (length(btrim(execution_key)) between 3 and 320),
  constraint campaign_event_executions_phase_valid check (
    from_phase in ('arrival', 'opportunity', 'rivalry', 'shortage', 'meridian_disruption', 'open_conflict', 'adaptation', 'reconstruction', 'continued_conflict')
    and to_phase in ('arrival', 'opportunity', 'rivalry', 'shortage', 'meridian_disruption', 'open_conflict', 'adaptation', 'reconstruction', 'continued_conflict')
  ),
  constraint campaign_event_executions_actor_valid check (
    (actor_type = 'system' and actor_staff_user_id is null)
    or (actor_type = 'staff_user' and actor_staff_user_id is not null)
  ),
  constraint campaign_event_executions_reason_valid check (
    reason is null or (length(reason) between 12 and 1000 and reason = btrim(reason))
  ),
  constraint campaign_event_executions_sequence_valid check (sequence > 0)
);

create index campaign_event_executions_game_time_idx
  on public.campaign_event_executions (game_session_id, occurred_at desc, public_id desc);

create table public.campaign_effect_commands (
  id uuid primary key default gen_random_uuid(),
  public_id text not null default ('cec_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null,
  campaign_instance_id uuid not null,
  event_execution_id uuid not null,
  idempotency_key text not null,
  effect_kind text not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  last_error_code text null,
  claimed_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_effect_commands_campaign_fk
    foreign key (game_session_id, campaign_instance_id)
    references public.campaign_instances (game_session_id, id) on delete cascade,
  constraint campaign_effect_commands_execution_fk
    foreign key (game_session_id, event_execution_id)
    references public.campaign_event_executions (game_session_id, id) on delete cascade,
  constraint campaign_effect_commands_public_id_unique unique (public_id),
  constraint campaign_effect_commands_idempotency_unique unique (game_session_id, idempotency_key),
  constraint campaign_effect_commands_public_id_valid check (public_id ~ '^cec_[0-9a-f]{32}$'),
  constraint campaign_effect_commands_idempotency_valid check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  constraint campaign_effect_commands_kind_valid check (effect_kind in (
    'publish_news', 'create_contract', 'notify_players', 'apply_market_shock',
    'set_store_scarcity', 'set_route_state'
  )),
  constraint campaign_effect_commands_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint campaign_effect_commands_status_valid check (status in ('pending', 'processing', 'completed', 'failed')),
  constraint campaign_effect_commands_attempt_valid check (attempt_count between 0 and 25),
  constraint campaign_effect_commands_completion_valid check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

create trigger set_campaign_effect_commands_updated_at
before update on public.campaign_effect_commands
for each row execute function public.set_current_timestamp_updated_at();

create index campaign_effect_commands_pending_idx
  on public.campaign_effect_commands (game_session_id, status, created_at, public_id)
  where status in ('pending', 'failed');

create table public.campaign_admin_audit (
  id uuid primary key default gen_random_uuid(),
  public_id text not null default ('caa_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null,
  campaign_instance_id uuid not null,
  actor_type text not null,
  actor_staff_user_id uuid null references public.staff_users (id) on delete restrict,
  action text not null,
  from_status text not null,
  to_status text not null,
  from_phase text not null,
  to_phase text not null,
  reason text null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint campaign_admin_audit_campaign_fk
    foreign key (game_session_id, campaign_instance_id)
    references public.campaign_instances (game_session_id, id) on delete cascade,
  constraint campaign_admin_audit_public_id_unique unique (public_id),
  constraint campaign_admin_audit_public_id_valid check (public_id ~ '^caa_[0-9a-f]{32}$'),
  constraint campaign_admin_audit_actor_valid check (
    (actor_type = 'system' and actor_staff_user_id is null)
    or (actor_type = 'staff_user' and actor_staff_user_id is not null)
  ),
  constraint campaign_admin_audit_action_valid check (action in (
    'create', 'execute_event', 'pause', 'resume', 'emergency_disable', 'correct_phase'
  )),
  constraint campaign_admin_audit_reason_valid check (
    reason is null or (length(reason) between 12 and 1000 and reason = btrim(reason))
  )
);

create index campaign_admin_audit_game_time_idx
  on public.campaign_admin_audit (game_session_id, occurred_at desc, public_id desc);

create table public.arrival_class_assignments (
  id uuid primary key default gen_random_uuid(),
  public_id text not null default ('acl_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  player_id uuid not null,
  country_id text not null,
  class_id text not null,
  source text not null,
  questionnaire_id text not null,
  questionnaire_version text not null,
  score_result jsonb null,
  override_reason text null,
  idempotency_key text not null,
  revision bigint not null default 0,
  assigned_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint arrival_class_assignments_game_id_unique unique (game_session_id, id),
  constraint arrival_class_assignments_player_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id) on delete cascade,
  constraint arrival_class_assignments_public_id_unique unique (public_id),
  constraint arrival_class_assignments_player_unique unique (game_session_id, player_id),
  constraint arrival_class_assignments_idempotency_unique unique (game_session_id, player_id, idempotency_key),
  constraint arrival_class_assignments_public_id_valid check (public_id ~ '^acl_[0-9a-f]{32}$'),
  constraint arrival_class_assignments_country_valid check (country_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  constraint arrival_class_assignments_class_valid check (class_id in (
    'analyst', 'builder', 'maker', 'mediator', 'navigator', 'operator', 'steward', 'trader'
  )),
  constraint arrival_class_assignments_source_valid check (source in ('questionnaire', 'admin_override')),
  constraint arrival_class_assignments_questionnaire_valid check (
    questionnaire_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    and length(btrim(questionnaire_version)) between 1 and 64
  ),
  constraint arrival_class_assignments_score_object check (score_result is null or jsonb_typeof(score_result) = 'object'),
  constraint arrival_class_assignments_override_valid check (
    (source = 'questionnaire' and override_reason is null and score_result is not null)
    or (source = 'admin_override' and length(override_reason) between 12 and 1000)
  ),
  constraint arrival_class_assignments_idempotency_valid check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  constraint arrival_class_assignments_revision_valid check (revision >= 0)
);

create trigger set_arrival_class_assignments_updated_at
before update on public.arrival_class_assignments
for each row execute function public.set_current_timestamp_updated_at();

create table public.arrival_grant_commands (
  id uuid primary key default gen_random_uuid(),
  public_id text not null default ('agc_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null,
  player_id uuid not null,
  assignment_id uuid not null,
  idempotency_key text not null,
  arrival_package_definition_id text not null,
  grant_definition_id text not null,
  status text not null default 'pending',
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint arrival_grant_commands_assignment_fk
    foreign key (game_session_id, assignment_id)
    references public.arrival_class_assignments (game_session_id, id) on delete cascade,
  constraint arrival_grant_commands_player_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id) on delete cascade,
  constraint arrival_grant_commands_public_id_unique unique (public_id),
  constraint arrival_grant_commands_idempotency_unique unique (game_session_id, player_id, idempotency_key),
  constraint arrival_grant_commands_public_id_valid check (public_id ~ '^agc_[0-9a-f]{32}$'),
  constraint arrival_grant_commands_definition_valid check (
    arrival_package_definition_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    and grant_definition_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'
  ),
  constraint arrival_grant_commands_status_valid check (status in ('pending', 'processing', 'completed', 'failed')),
  constraint arrival_grant_commands_completion_valid check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

create trigger set_arrival_grant_commands_updated_at
before update on public.arrival_grant_commands
for each row execute function public.set_current_timestamp_updated_at();

create index arrival_grant_commands_pending_idx
  on public.arrival_grant_commands (game_session_id, status, created_at, public_id)
  where status in ('pending', 'failed');

create table public.world_location_states (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  public_location_id text not null,
  country_id text not null,
  availability text not null default 'normal',
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint world_location_states_unique unique (game_session_id, public_location_id),
  constraint world_location_states_public_id_valid check (public_location_id ~ '^loc_[a-z0-9_]+$'),
  constraint world_location_states_country_valid check (country_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  constraint world_location_states_availability_valid check (availability in ('normal', 'shortage', 'conflict', 'closed')),
  constraint world_location_states_revision_valid check (revision >= 0)
);

create table public.world_route_states (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  public_route_id text not null,
  from_location_id text not null,
  to_location_id text not null,
  mode text not null,
  bidirectional boolean not null,
  base_cost_minor bigint not null,
  base_duration_minutes integer not null,
  status text not null default 'open',
  reason text not null default 'normal',
  cost_multiplier_basis_points integer not null default 10000,
  duration_multiplier_basis_points integer not null default 10000,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint world_route_states_unique unique (game_session_id, public_route_id),
  constraint world_route_states_public_id_valid check (public_route_id ~ '^rte_[a-z0-9_]+$'),
  constraint world_route_states_endpoints_valid check (
    from_location_id ~ '^loc_[a-z0-9_]+$'
    and to_location_id ~ '^loc_[a-z0-9_]+$'
    and from_location_id <> to_location_id
  ),
  constraint world_route_states_mode_valid check (mode in ('land', 'sea', 'air', 'meridian')),
  constraint world_route_states_base_valid check (base_cost_minor >= 0 and base_duration_minutes > 0),
  constraint world_route_states_status_valid check (status in ('open', 'restricted', 'closed')),
  constraint world_route_states_reason_valid check (reason in ('normal', 'shortage', 'meridian_disruption', 'war', 'recovery')),
  constraint world_route_states_multiplier_valid check (
    cost_multiplier_basis_points between 1000 and 50000
    and duration_multiplier_basis_points between 1000 and 50000
  ),
  constraint world_route_states_revision_valid check (revision >= 0),
  constraint world_route_states_from_fk
    foreign key (game_session_id, from_location_id)
    references public.world_location_states (game_session_id, public_location_id) on delete cascade,
  constraint world_route_states_to_fk
    foreign key (game_session_id, to_location_id)
    references public.world_location_states (game_session_id, public_location_id) on delete cascade
);

create index world_route_states_from_idx
  on public.world_route_states (game_session_id, from_location_id, status, mode);
create index world_route_states_to_idx
  on public.world_route_states (game_session_id, to_location_id, status, mode);

create table public.player_residency_states (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null,
  player_id uuid not null,
  current_country_id text not null,
  eligible_country_ids jsonb not null default '[]'::jsonb,
  pending_country_id text null,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint player_residency_states_player_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id) on delete cascade,
  constraint player_residency_states_unique unique (game_session_id, player_id),
  constraint player_residency_states_country_valid check (
    current_country_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    and (pending_country_id is null or pending_country_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$')
  ),
  constraint player_residency_states_eligible_array check (jsonb_typeof(eligible_country_ids) = 'array'),
  constraint player_residency_states_revision_valid check (revision >= 0)
);

alter table public.campaign_instances enable row level security;
alter table public.campaign_event_executions enable row level security;
alter table public.campaign_effect_commands enable row level security;
alter table public.campaign_admin_audit enable row level security;
alter table public.arrival_class_assignments enable row level security;
alter table public.arrival_grant_commands enable row level security;
alter table public.world_location_states enable row level security;
alter table public.world_route_states enable row level security;
alter table public.player_residency_states enable row level security;

revoke all on table public.campaign_instances from public, anon, authenticated, service_role;
revoke all on table public.campaign_event_executions from public, anon, authenticated, service_role;
revoke all on table public.campaign_effect_commands from public, anon, authenticated, service_role;
revoke all on table public.campaign_admin_audit from public, anon, authenticated, service_role;
revoke all on table public.arrival_class_assignments from public, anon, authenticated, service_role;
revoke all on table public.arrival_grant_commands from public, anon, authenticated, service_role;
revoke all on table public.world_location_states from public, anon, authenticated, service_role;
revoke all on table public.world_route_states from public, anon, authenticated, service_role;
revoke all on table public.player_residency_states from public, anon, authenticated, service_role;

grant select, insert, update on table public.campaign_instances to service_role;
grant select, insert on table public.campaign_event_executions to service_role;
grant select, insert, update on table public.campaign_effect_commands to service_role;
grant select, insert on table public.campaign_admin_audit to service_role;
grant select, insert, update on table public.arrival_class_assignments to service_role;
grant select, insert, update on table public.arrival_grant_commands to service_role;
grant select, insert, update, delete on table public.world_location_states to service_role;
grant select, insert, update, delete on table public.world_route_states to service_role;
grant select, insert, update on table public.player_residency_states to service_role;

create or replace function public.execute_campaign_event_atomic_v1(
  p_game_session_id uuid,
  p_campaign_public_id text,
  p_expected_revision bigint,
  p_event_key text,
  p_trigger_key text,
  p_expected_phase text,
  p_next_phase text,
  p_complete_campaign boolean,
  p_actor_staff_user_id uuid,
  p_reason text,
  p_occurred_at timestamptz,
  p_commands jsonb
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
  v_execution_key text := btrim(coalesce(p_event_key, '')) || ':' || btrim(coalesce(p_trigger_key, ''));
  v_actor_type text := case when p_actor_staff_user_id is null then 'system' else 'staff_user' end;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_command jsonb;
  v_command_count integer;
  v_transition_allowed boolean;
begin
  if p_game_session_id is null
    or p_campaign_public_id !~ '^cmp_[0-9a-f]{32}$'
    or p_expected_revision is null or p_expected_revision < 0
    or p_event_key !~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
    or length(btrim(coalesce(p_trigger_key, ''))) not between 1 and 160
    or p_expected_phase not in ('arrival', 'opportunity', 'rivalry', 'shortage', 'meridian_disruption', 'open_conflict', 'adaptation', 'reconstruction', 'continued_conflict')
    or p_next_phase not in ('arrival', 'opportunity', 'rivalry', 'shortage', 'meridian_disruption', 'open_conflict', 'adaptation', 'reconstruction', 'continued_conflict')
    or p_complete_campaign is null
    or p_occurred_at is null
    or jsonb_typeof(p_commands) <> 'array'
    or (v_actor_type = 'staff_user' and length(coalesce(v_reason, '')) not between 12 and 1000)
  then
    raise exception 'CAMPAIGN_EVENT_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  v_command_count := jsonb_array_length(p_commands);
  if v_command_count not between 1 and 32 then
    raise exception 'CAMPAIGN_EVENT_COMMAND_COUNT_INVALID' using errcode = 'P0001';
  end if;

  select campaign_row.* into v_campaign
  from public.campaign_instances as campaign_row
  where campaign_row.game_session_id = p_game_session_id
    and campaign_row.public_id = p_campaign_public_id
  for update;

  if not found then
    raise exception 'CAMPAIGN_NOT_FOUND' using errcode = 'P0001';
  end if;

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
    raise exception 'CAMPAIGN_PHASE_CONFLICT' using errcode = 'P0001';
  end if;

  v_transition_allowed :=
    (p_expected_phase = 'arrival' and p_next_phase in ('arrival', 'opportunity'))
    or (p_expected_phase = 'opportunity' and p_next_phase in ('opportunity', 'rivalry'))
    or (p_expected_phase = 'rivalry' and p_next_phase in ('rivalry', 'shortage'))
    or (p_expected_phase = 'shortage' and p_next_phase in ('shortage', 'meridian_disruption'))
    or (p_expected_phase = 'meridian_disruption' and p_next_phase in ('meridian_disruption', 'open_conflict'))
    or (p_expected_phase = 'open_conflict' and p_next_phase in ('open_conflict', 'adaptation'))
    or (p_expected_phase = 'adaptation' and p_next_phase in ('adaptation', 'reconstruction', 'continued_conflict'))
    or (p_expected_phase = 'reconstruction' and p_next_phase = 'reconstruction')
    or (p_expected_phase = 'continued_conflict' and p_next_phase = 'continued_conflict');

  if not v_transition_allowed then
    raise exception 'CAMPAIGN_TRANSITION_INVALID' using errcode = 'P0001';
  end if;
  if p_complete_campaign <> (p_next_phase in ('reconstruction', 'continued_conflict')) then
    raise exception 'CAMPAIGN_TERMINAL_PHASE_INVALID' using errcode = 'P0001';
  end if;

  insert into public.campaign_event_executions (
    game_session_id, campaign_instance_id, event_key, trigger_key, execution_key,
    from_phase, to_phase, sequence, actor_type, actor_staff_user_id, reason, occurred_at
  ) values (
    p_game_session_id, v_campaign.id, p_event_key, p_trigger_key, v_execution_key,
    v_campaign.current_phase, p_next_phase, v_campaign.event_sequence + 1,
    v_actor_type, p_actor_staff_user_id, v_reason, p_occurred_at
  ) returning * into v_execution;

  for v_command in select value from jsonb_array_elements(p_commands)
  loop
    if jsonb_typeof(v_command) <> 'object'
      or coalesce(v_command->>'idempotencyKey', '') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
      or coalesce(v_command->>'kind', '') not in (
        'publish_news', 'create_contract', 'notify_players', 'apply_market_shock',
        'set_store_scarcity', 'set_route_state'
      )
      or jsonb_typeof(coalesce(v_command->'payload', '{}'::jsonb)) <> 'object'
    then
      raise exception 'CAMPAIGN_EFFECT_COMMAND_INVALID' using errcode = 'P0001';
    end if;

    insert into public.campaign_effect_commands (
      game_session_id, campaign_instance_id, event_execution_id,
      idempotency_key, effect_kind, payload
    ) values (
      p_game_session_id, v_campaign.id, v_execution.id,
      v_command->>'idempotencyKey', v_command->>'kind', v_command->'payload'
    );
  end loop;

  update public.campaign_instances
  set current_phase = p_next_phase,
      status = case when p_complete_campaign then 'completed' else 'active' end,
      revision = revision + 1,
      event_sequence = event_sequence + 1,
      outcome = case when p_complete_campaign then p_next_phase else null end,
      completed_at = case when p_complete_campaign then p_occurred_at else null end,
      scheduled_at = null
  where id = v_campaign.id
  returning * into v_campaign;

  insert into public.campaign_admin_audit (
    game_session_id, campaign_instance_id, actor_type, actor_staff_user_id,
    action, from_status, to_status, from_phase, to_phase, reason, occurred_at
  ) values (
    p_game_session_id, v_campaign.id, v_actor_type, p_actor_staff_user_id,
    'execute_event', 'active', v_campaign.status, p_expected_phase, p_next_phase,
    v_reason, p_occurred_at
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

create or replace function public.assign_arrival_class_atomic_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_country_id text,
  p_class_id text,
  p_questionnaire_id text,
  p_questionnaire_version text,
  p_score_result jsonb,
  p_assignment_idempotency_key text,
  p_arrival_package_definition_id text,
  p_grant_definition_id text,
  p_grant_idempotency_key text,
  p_assigned_at timestamptz
)
returns table (
  assignment_outcome text,
  assignment_id text,
  class_id text,
  country_id text,
  grant_command_id text,
  grant_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_assignment public.arrival_class_assignments%rowtype;
  v_grant public.arrival_grant_commands%rowtype;
  v_assignment_created boolean := false;
begin
  if p_game_session_id is null or p_player_id is null
    or p_country_id !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    or p_class_id not in ('analyst', 'builder', 'maker', 'mediator', 'navigator', 'operator', 'steward', 'trader')
    or p_questionnaire_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    or length(btrim(coalesce(p_questionnaire_version, ''))) not between 1 and 64
    or jsonb_typeof(p_score_result) <> 'object'
    or p_assignment_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_arrival_package_definition_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    or p_grant_definition_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    or p_grant_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_assigned_at is null
  then
    raise exception 'ARRIVAL_CLASS_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  perform 1
  from public.players as player_row
  join public.game_sessions as game_row on game_row.id = player_row.game_session_id
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active'
    and game_row.status = 'active'
  for update of player_row;

  if not found then
    raise exception 'ARRIVAL_PLAYER_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  select assignment_row.* into v_assignment
  from public.arrival_class_assignments as assignment_row
  where assignment_row.game_session_id = p_game_session_id
    and assignment_row.player_id = p_player_id
  for update;

  if found then
    if v_assignment.idempotency_key <> p_assignment_idempotency_key
      or v_assignment.class_id <> p_class_id
      or v_assignment.country_id <> p_country_id
    then
      raise exception 'ARRIVAL_CLASS_ALREADY_ASSIGNED' using errcode = 'P0001';
    end if;
  else
    insert into public.arrival_class_assignments (
      game_session_id, player_id, country_id, class_id, source,
      questionnaire_id, questionnaire_version, score_result,
      idempotency_key, assigned_at
    ) values (
      p_game_session_id, p_player_id, p_country_id, p_class_id, 'questionnaire',
      p_questionnaire_id, p_questionnaire_version, p_score_result,
      p_assignment_idempotency_key, p_assigned_at
    ) returning * into v_assignment;
    v_assignment_created := true;
  end if;

  insert into public.arrival_grant_commands (
    game_session_id, player_id, assignment_id, idempotency_key,
    arrival_package_definition_id, grant_definition_id
  ) values (
    p_game_session_id, p_player_id, v_assignment.id, p_grant_idempotency_key,
    p_arrival_package_definition_id, p_grant_definition_id
  )
  on conflict (game_session_id, player_id, idempotency_key)
  do nothing;

  select grant_row.* into v_grant
  from public.arrival_grant_commands as grant_row
  where grant_row.game_session_id = p_game_session_id
    and grant_row.player_id = p_player_id
    and grant_row.idempotency_key = p_grant_idempotency_key;

  return query select
    case when v_assignment_created then 'assigned' else 'replayed' end,
    v_assignment.public_id,
    v_assignment.class_id,
    v_assignment.country_id,
    v_grant.public_id,
    v_grant.status;
end;
$function$;

revoke all on function public.execute_campaign_event_atomic_v1(
  uuid, text, bigint, text, text, text, text, boolean, uuid, text, timestamptz, jsonb
) from public, anon, authenticated;
revoke all on function public.assign_arrival_class_atomic_v1(
  uuid, uuid, text, text, text, text, jsonb, text, text, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.execute_campaign_event_atomic_v1(
  uuid, text, bigint, text, text, text, text, boolean, uuid, text, timestamptz, jsonb
) to service_role;
grant execute on function public.assign_arrival_class_atomic_v1(
  uuid, uuid, text, text, text, text, jsonb, text, text, text, text, timestamptz
) to service_role;

commit;
