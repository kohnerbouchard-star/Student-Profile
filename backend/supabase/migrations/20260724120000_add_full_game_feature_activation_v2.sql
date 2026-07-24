begin;

alter table public.arrival_grant_commands
  drop constraint if exists arrival_grant_commands_definition_valid,
  add constraint arrival_grant_commands_definition_valid check (
    arrival_package_definition_id ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
    and grant_definition_id ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
  );

-- Full-game feature activation V2.
-- This migration keeps production fail-closed. Arrival grants are executable
-- only for games bound to an active local/test/staging Seed release.

create table if not exists public.arrival_package_runtime_definitions (
  arrival_package_definition_id text primary key,
  country_id text not null unique,
  currency_code text not null,
  starting_location_id text not null,
  approved_starting_balance numeric(14,2) not null,
  first_contract_stable_id text not null,
  first_message_stable_id text not null,
  first_tutorial_stable_id text not null,
  title text not null,
  public_summary text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint arrival_package_runtime_id_valid check (
    arrival_package_definition_id ~ '^arrival-package\.[a-z0-9-]+\.[a-z0-9-]+\.v[0-9]+$'
  ),
  constraint arrival_package_runtime_country_valid check (
    country_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  ),
  constraint arrival_package_runtime_currency_valid check (
    currency_code ~ '^[A-Z]{3}$'
  ),
  constraint arrival_package_runtime_location_valid check (
    starting_location_id ~ '^loc_[a-z0-9_]+$'
  ),
  constraint arrival_package_runtime_balance_valid check (
    approved_starting_balance > 0 and approved_starting_balance <= 5000
  ),
  constraint arrival_package_runtime_contract_valid check (
    first_contract_stable_id ~ '^contract\.[a-z0-9._-]+\.v[0-9]+$'
  ),
  constraint arrival_package_runtime_message_valid check (
    first_message_stable_id ~ '^message\.[a-z0-9._-]+\.v[0-9]+$'
  ),
  constraint arrival_package_runtime_tutorial_valid check (
    first_tutorial_stable_id ~ '^tutorial\.[a-z0-9._-]+\.v[0-9]+$'
  ),
  constraint arrival_package_runtime_status_valid check (
    status in ('active', 'disabled', 'retired')
  )
);

drop trigger if exists set_arrival_package_runtime_updated_at
  on public.arrival_package_runtime_definitions;
create trigger set_arrival_package_runtime_updated_at
before update on public.arrival_package_runtime_definitions
for each row execute function public.set_current_timestamp_updated_at();

create table if not exists public.arrival_class_grant_definitions (
  grant_definition_id text primary key,
  class_id text not null unique,
  public_title text not null,
  public_summary text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint arrival_class_grant_definition_id_valid check (
    grant_definition_id ~ '^class-grant-v1:(analyst|builder|maker|mediator|navigator|operator|steward|trader)$'
  ),
  constraint arrival_class_grant_class_valid check (
    class_id in (
      'analyst', 'builder', 'maker', 'mediator',
      'navigator', 'operator', 'steward', 'trader'
    )
  ),
  constraint arrival_class_grant_status_valid check (
    status in ('active', 'disabled', 'retired')
  )
);

drop trigger if exists set_arrival_class_grant_definition_updated_at
  on public.arrival_class_grant_definitions;
create trigger set_arrival_class_grant_definition_updated_at
before update on public.arrival_class_grant_definitions
for each row execute function public.set_current_timestamp_updated_at();

create table if not exists public.player_arrival_grant_receipts (
  id uuid primary key default gen_random_uuid(),
  public_receipt_id text not null unique
    default ('agr_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null,
  player_id uuid not null,
  grant_command_id uuid not null unique references public.arrival_grant_commands(id) on delete cascade,
  arrival_package_definition_id text not null
    references public.arrival_package_runtime_definitions(arrival_package_definition_id),
  grant_definition_id text not null
    references public.arrival_class_grant_definitions(grant_definition_id),
  ledger_entry_id uuid not null references public.ledger_entries(id) on delete restrict,
  granted_balance numeric(14,2) not null,
  currency_code text not null,
  processed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint player_arrival_grant_receipt_player_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id) on delete cascade,
  constraint player_arrival_grant_receipt_public_id_valid check (
    public_receipt_id ~ '^agr_[0-9a-f]{32}$'
  ),
  constraint player_arrival_grant_receipt_balance_valid check (
    granted_balance > 0 and granted_balance <= 5000
  ),
  constraint player_arrival_grant_receipt_currency_valid check (
    currency_code ~ '^[A-Z]{3}$'
  )
);

create index if not exists player_arrival_grant_receipts_player_idx
  on public.player_arrival_grant_receipts(game_session_id, player_id, processed_at desc);

create table if not exists public.game_feature_activation_evidence (
  game_session_id uuid primary key references public.game_sessions(id) on delete cascade,
  source_game_session_id uuid not null references public.game_sessions(id) on delete restrict,
  activation_version text not null,
  story_status text not null,
  crafting_status text not null,
  arrival_grant_status text not null,
  progression_status text not null,
  evidence jsonb not null default '{}'::jsonb,
  activated_by_staff_user_id uuid not null references public.staff_users(id) on delete restrict,
  activated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_feature_activation_version_valid check (
    activation_version ~ '^full-game-feature-activation-v[0-9]+$'
  ),
  constraint game_feature_activation_story_valid check (
    story_status in ('active', 'blocked')
  ),
  constraint game_feature_activation_crafting_valid check (
    crafting_status in ('active', 'blocked')
  ),
  constraint game_feature_activation_arrival_valid check (
    arrival_grant_status in ('active', 'blocked')
  ),
  constraint game_feature_activation_progression_valid check (
    progression_status in ('active', 'blocked')
  ),
  constraint game_feature_activation_evidence_object check (
    jsonb_typeof(evidence) = 'object'
  )
);

drop trigger if exists set_game_feature_activation_evidence_updated_at
  on public.game_feature_activation_evidence;
create trigger set_game_feature_activation_evidence_updated_at
before update on public.game_feature_activation_evidence
for each row execute function public.set_current_timestamp_updated_at();

alter table public.arrival_package_runtime_definitions enable row level security;
alter table public.arrival_package_runtime_definitions force row level security;
alter table public.arrival_class_grant_definitions enable row level security;
alter table public.arrival_class_grant_definitions force row level security;
alter table public.player_arrival_grant_receipts enable row level security;
alter table public.player_arrival_grant_receipts force row level security;
alter table public.game_feature_activation_evidence enable row level security;
alter table public.game_feature_activation_evidence force row level security;

revoke all on table public.arrival_package_runtime_definitions
  from public, anon, authenticated;
revoke all on table public.arrival_class_grant_definitions
  from public, anon, authenticated;
revoke all on table public.player_arrival_grant_receipts
  from public, anon, authenticated;
revoke all on table public.game_feature_activation_evidence
  from public, anon, authenticated;

grant select on table public.arrival_package_runtime_definitions to service_role;
grant select on table public.arrival_class_grant_definitions to service_role;
grant select, insert on table public.player_arrival_grant_receipts to service_role;
grant select, insert, update on table public.game_feature_activation_evidence to service_role;

insert into public.arrival_package_runtime_definitions (
  arrival_package_definition_id, country_id, currency_code, starting_location_id,
  approved_starting_balance, first_contract_stable_id, first_message_stable_id,
  first_tutorial_stable_id, title, public_summary, status
) values
  (
    'arrival-package.northreach.frostgate-immigrant.v1', 'northreach', 'NRC',
    'loc_northreach_frostgate_v1', 495,
    'contract.arrival.northreach.stabilization.v1',
    'message.arrival.northreach.welcome.v1',
    'tutorial.arrival.northreach.first-steps.v1',
    'Frostgate Arrival Brief',
    'Protect the emergency reserve, verify housing deadlines, and establish a lawful technical-work path.',
    'active'
  ),
  (
    'arrival-package.yrethia.sableport-immigrant.v1', 'yrethia', 'YRC',
    'loc_yrethia_sableport_v1', 477,
    'contract.arrival.yrethia.stabilization.v1',
    'message.arrival.yrethia.welcome.v1',
    'tutorial.arrival.yrethia.first-steps.v1',
    'Sableport Arrival Brief',
    'Correct the address mismatch, preserve transport funds, and use verified port-service work.',
    'active'
  ),
  (
    'arrival-package.thaloris.dusk-harbor-immigrant.v1', 'thaloris', 'THD',
    'loc_thaloris_dusk_harbor_v1', 407,
    'contract.arrival.thaloris.stabilization.v1',
    'message.arrival.thaloris.welcome.v1',
    'tutorial.arrival.thaloris.first-steps.v1',
    'Dusk Harbor Arrival Brief',
    'Use licensed repair channels, verify salvage ownership, and establish traceable housing.',
    'active'
  ),
  (
    'arrival-package.solvend.aurora-spire-immigrant.v1', 'solvend', 'SLV',
    'loc_solvend_aurora_spire_v1', 522,
    'contract.arrival.solvend.stabilization.v1',
    'message.arrival.solvend.welcome.v1',
    'tutorial.arrival.solvend.first-steps.v1',
    'Aurora Spire Arrival Brief',
    'Complete credential review or a provisional assessment before committing high-cost funds.',
    'active'
  ),
  (
    'arrival-package.eldoran.crescent-bay-immigrant.v1', 'eldoran', 'ELD',
    'loc_eldoran_crescent_bay_v1', 371,
    'contract.arrival.eldoran.stabilization.v1',
    'message.arrival.eldoran.welcome.v1',
    'tutorial.arrival.eldoran.first-steps.v1',
    'Crescent Bay Arrival Brief',
    'Stabilize food access, compare total housing cost, and avoid premature wholesale exposure.',
    'active'
  ),
  (
    'arrival-package.valerion.glassfall-immigrant.v1', 'valerion', 'VAL',
    'loc_valerion_glassfall_v1', 557,
    'contract.arrival.valerion.stabilization.v1',
    'message.arrival.valerion.welcome.v1',
    'tutorial.arrival.valerion.first-steps.v1',
    'Glassfall Arrival Brief',
    'Verify housing and water access before paying a deposit or buying field equipment.',
    'active'
  ),
  (
    'arrival-package.lumenor.starfall-immigrant.v1', 'lumenor', 'LUM',
    'loc_lumenor_starfall_v1', 469,
    'contract.arrival.lumenor.stabilization.v1',
    'message.arrival.lumenor.welcome.v1',
    'tutorial.arrival.lumenor.first-steps.v1',
    'Starfall Arrival Brief',
    'Align translated records and address data before paying repeated correction fees.',
    'active'
  ),
  (
    'arrival-package.xalvoria.emberhall-immigrant.v1', 'xalvoria', 'XAL',
    'loc_xalvoria_emberhall_v1', 513,
    'contract.arrival.xalvoria.stabilization.v1',
    'message.arrival.xalvoria.welcome.v1',
    'tutorial.arrival.xalvoria.first-steps.v1',
    'Emberhall Arrival Brief',
    'Establish bankable identity and separate viable work from high-cost financing.',
    'active'
  ),
  (
    'arrival-package.dravenlok.ironhold-immigrant.v1', 'dravenlok', 'DRV',
    'loc_dravenlok_ironhold_v1', 420,
    'contract.arrival.dravenlok.stabilization.v1',
    'message.arrival.dravenlok.welcome.v1',
    'tutorial.arrival.dravenlok.first-steps.v1',
    'Ironhold Arrival Brief',
    'Complete safety review and preserve cash against failed placement and housing loss.',
    'active'
  ),
  (
    'arrival-package.syndalis.blacklight-immigrant.v1', 'syndalis', 'SYN',
    'loc_syndalis_blacklight_v1', 530,
    'contract.arrival.syndalis.stabilization.v1',
    'message.arrival.syndalis.welcome.v1',
    'tutorial.arrival.syndalis.first-steps.v1',
    'Blacklight Arrival Brief',
    'Resolve identity disputes through secure channels while maintaining physical housing funds.',
    'active'
  )
on conflict (arrival_package_definition_id) do update
set
  country_id = excluded.country_id,
  currency_code = excluded.currency_code,
  starting_location_id = excluded.starting_location_id,
  approved_starting_balance = excluded.approved_starting_balance,
  first_contract_stable_id = excluded.first_contract_stable_id,
  first_message_stable_id = excluded.first_message_stable_id,
  first_tutorial_stable_id = excluded.first_tutorial_stable_id,
  title = excluded.title,
  public_summary = excluded.public_summary,
  status = excluded.status;

insert into public.arrival_class_grant_definitions (
  grant_definition_id, class_id, public_title, public_summary, status
) values
  ('class-grant-v1:analyst', 'analyst', 'Analyst New Arrival', 'Begin with evidence, market context, and disciplined comparison.', 'active'),
  ('class-grant-v1:builder', 'builder', 'Builder New Arrival', 'Begin by organizing reliable systems and practical infrastructure.', 'active'),
  ('class-grant-v1:maker', 'maker', 'Maker New Arrival', 'Begin with materials, workshop discipline, and traceable production.', 'active'),
  ('class-grant-v1:mediator', 'mediator', 'Mediator New Arrival', 'Begin with institutional trust, negotiation, and verified communication.', 'active'),
  ('class-grant-v1:navigator', 'navigator', 'Navigator New Arrival', 'Begin with routes, alternatives, and resilient access planning.', 'active'),
  ('class-grant-v1:operator', 'operator', 'Operator New Arrival', 'Begin with process control, staffing, and dependable execution.', 'active'),
  ('class-grant-v1:steward', 'steward', 'Steward New Arrival', 'Begin with fair allocation, essential services, and recovery planning.', 'active'),
  ('class-grant-v1:trader', 'trader', 'Trader New Arrival', 'Begin with price discovery, liquidity, and bounded risk.', 'active')
on conflict (grant_definition_id) do update
set
  class_id = excluded.class_id,
  public_title = excluded.public_title,
  public_summary = excluded.public_summary,
  status = excluded.status;

create or replace function public.ensure_player_progression_after_activation_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.status = 'active' then
    perform public.ensure_player_progression_profile_v1(
      new.game_session_id,
      new.id
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists ensure_player_progression_after_activation
  on public.players;
create trigger ensure_player_progression_after_activation
after insert or update of status on public.players
for each row
when (new.status = 'active')
execute function public.ensure_player_progression_after_activation_v1();

do $backfill$
declare
  v_player record;
begin
  for v_player in
    select player_row.game_session_id, player_row.id
    from public.players as player_row
    where player_row.status = 'active'
  loop
    perform public.ensure_player_progression_profile_v1(
      v_player.game_session_id,
      v_player.id
    );
  end loop;
end;
$backfill$;

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
      on package_row.arrival_package_definition_id = v_receipt.arrival_package_definition_id
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

  update public.arrival_grant_commands
  set status = 'processing',
      updated_at = p_processed_at
  where id = v_command.id
    and status in ('pending', 'failed', 'processing');

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

  update public.player_progression_profiles
  set
    public_title = v_class_grant.public_title,
    public_summary = v_class_grant.public_summary,
    updated_at = p_processed_at
  where game_session_id = p_game_session_id
    and player_id = v_command.player_id;

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

  update public.arrival_grant_commands
  set
    status = 'completed',
    completed_at = p_processed_at,
    updated_at = p_processed_at
  where id = v_command.id;

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

create or replace function public.process_arrival_grant_command_after_insert_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  perform 1
  from public.apply_arrival_grant_command_v1(
    new.game_session_id,
    new.public_id,
    now()
  );
  return new;
end;
$function$;

drop trigger if exists process_arrival_grant_command_after_insert
  on public.arrival_grant_commands;
create trigger process_arrival_grant_command_after_insert
after insert on public.arrival_grant_commands
for each row execute function public.process_arrival_grant_command_after_insert_v1();

create or replace function public.process_arrival_grant_commands_v1(
  p_game_session_id uuid,
  p_limit integer default 50,
  p_processed_at timestamptz default now()
)
returns table (
  processed_count integer,
  applied_count integer,
  replayed_count integer,
  failed_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_command record;
  v_outcome record;
begin
  if p_game_session_id is null
    or p_limit is null or p_limit not between 1 and 100
    or p_processed_at is null
  then
    raise exception 'ARRIVAL_GRANT_BATCH_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  processed_count := 0;
  applied_count := 0;
  replayed_count := 0;
  failed_count := 0;

  for v_command in
    select command_row.public_id
    from public.arrival_grant_commands as command_row
    where command_row.game_session_id = p_game_session_id
      and command_row.status in ('pending', 'failed')
    order by command_row.created_at, command_row.public_id
    limit p_limit
  loop
    processed_count := processed_count + 1;
    begin
      select * into v_outcome
      from public.apply_arrival_grant_command_v1(
        p_game_session_id,
        v_command.public_id,
        p_processed_at
      );
      if v_outcome.grant_outcome = 'applied' then
        applied_count := applied_count + 1;
      else
        replayed_count := replayed_count + 1;
      end if;
    exception when others then
      failed_count := failed_count + 1;
      update public.arrival_grant_commands
      set
        status = 'failed',
        updated_at = p_processed_at
      where game_session_id = p_game_session_id
        and public_id = v_command.public_id
        and status <> 'completed';
    end;
  end loop;

  return next;
end;
$function$;

create or replace function public.complete_game_feature_activation_v2(
  p_game_session_id uuid,
  p_source_game_session_id uuid,
  p_staff_user_id uuid,
  p_activated_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_source_pack public.game_session_physical_economy_packs%rowtype;
  v_story_result record;
  v_crafting_items integer := 0;
  v_crafting_recipes integer := 0;
  v_storylines integer := 0;
  v_story_events integer := 0;
  v_arrival_packages integer := 0;
  v_class_grants integer := 0;
  v_crafting_status text := 'blocked';
begin
  if p_game_session_id is null
    or p_source_game_session_id is null
    or p_staff_user_id is null
    or p_game_session_id = p_source_game_session_id
    or p_activated_at is null
  then
    raise exception 'FULL_GAME_ACTIVATION_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  perform 1
  from public.game_sessions as game_row
  where game_row.id = p_game_session_id
    and game_row.owner_staff_user_id = p_staff_user_id
    and game_row.status = 'active'
    and game_row.provisioning_status = 'ready'
  for update;

  if not found then
    raise exception 'FULL_GAME_ACTIVATION_TARGET_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.seed_content_releases as release_row
    where release_row.game_session_id = p_game_session_id
      and release_row.status = 'applied_active'
      and release_row.target_environment in ('local', 'test', 'staging')
  ) then
    raise exception 'FULL_GAME_ACTIVATION_NON_PRODUCTION_RELEASE_REQUIRED'
      using errcode = '42501';
  end if;

  select source_pack.* into v_source_pack
  from public.game_session_physical_economy_packs as source_pack
  join public.physical_economy_content_packs as pack_row
    on pack_row.id = source_pack.pack_id
  where source_pack.game_session_id = p_source_game_session_id
    and source_pack.status = 'active'
    and pack_row.status = 'active'
  order by source_pack.activated_at desc nulls last
  limit 1;

  if found then
    insert into public.game_session_physical_economy_packs (
      game_session_id, pack_id, status, imported_by_staff_user_id,
      activated_by_staff_user_id, imported_at, activated_at, settings
    ) values (
      p_game_session_id, v_source_pack.pack_id, 'active', p_staff_user_id,
      p_staff_user_id, p_activated_at, p_activated_at,
      coalesce(v_source_pack.settings, '{}'::jsonb)
    )
    on conflict (game_session_id, pack_id) do update
    set
      status = 'active',
      activated_by_staff_user_id = excluded.activated_by_staff_user_id,
      activated_at = excluded.activated_at,
      settings = excluded.settings;

    insert into public.game_session_item_supply (
      game_session_id, item_key, country_code, scarcity_band,
      available_quantity, reserved_quantity, event_multiplier,
      route_multiplier, source_event_key, effective_at, expires_at, version
    )
    select
      p_game_session_id, supply_row.item_key, supply_row.country_code,
      supply_row.scarcity_band, supply_row.available_quantity, 0,
      supply_row.event_multiplier, supply_row.route_multiplier,
      null, p_activated_at, null, 1
    from public.game_session_item_supply as supply_row
    where supply_row.game_session_id = p_source_game_session_id
    on conflict (game_session_id, item_key, country_code) do update
    set
      scarcity_band = excluded.scarcity_band,
      available_quantity = excluded.available_quantity,
      reserved_quantity = 0,
      event_multiplier = excluded.event_multiplier,
      route_multiplier = excluded.route_multiplier,
      source_event_key = null,
      effective_at = excluded.effective_at,
      expires_at = null,
      version = public.game_session_item_supply.version + 1;

    insert into public.game_session_recipe_availability (
      game_session_id, recipe_id, enabled, unlocked_by_default,
      scarcity_band, country_codes, event_duration_multiplier,
      route_disruption_multiplier, version, updated_at
    )
    select
      p_game_session_id, availability_row.recipe_id,
      availability_row.enabled, availability_row.unlocked_by_default,
      availability_row.scarcity_band, availability_row.country_codes,
      availability_row.event_duration_multiplier,
      availability_row.route_disruption_multiplier, 1, p_activated_at
    from public.game_session_recipe_availability as availability_row
    where availability_row.game_session_id = p_source_game_session_id
    on conflict (game_session_id, recipe_id) do update
    set
      enabled = excluded.enabled,
      unlocked_by_default = excluded.unlocked_by_default,
      scarcity_band = excluded.scarcity_band,
      country_codes = excluded.country_codes,
      event_duration_multiplier = excluded.event_duration_multiplier,
      route_disruption_multiplier = excluded.route_disruption_multiplier,
      version = public.game_session_recipe_availability.version + 1,
      updated_at = excluded.updated_at;

    select count(*)::integer into v_crafting_items
    from public.physical_economy_item_definitions as item_row
    where item_row.pack_id = v_source_pack.pack_id
      and item_row.status = 'active';

    select count(*)::integer into v_crafting_recipes
    from public.game_session_recipe_availability as availability_row
    join public.physical_economy_recipe_definitions as recipe_row
      on recipe_row.id = availability_row.recipe_id
    where availability_row.game_session_id = p_game_session_id
      and availability_row.enabled
      and recipe_row.pack_id = v_source_pack.pack_id
      and recipe_row.status = 'active';

    if v_crafting_items > 0 and v_crafting_recipes > 0 then
      v_crafting_status := 'active';
    end if;
  end if;

  select * into v_story_result
  from public.initialize_demo_storyline_for_game(
    p_game_session_id,
    'missing_only'
  );

  select count(*)::integer into v_storylines
  from public.game_session_storylines as activation_row
  join public.storylines as storyline_row
    on storyline_row.id = activation_row.storyline_id
  where activation_row.game_session_id = p_game_session_id
    and activation_row.status = 'active'
    and storyline_row.is_active;

  select count(*)::integer into v_story_events
  from public.game_session_storylines as activation_row
  join public.storyline_events as event_row
    on event_row.storyline_id = activation_row.storyline_id
  where activation_row.game_session_id = p_game_session_id
    and activation_row.status = 'active'
    and event_row.is_active;

  select count(*)::integer into v_arrival_packages
  from public.world_country_runtime as country_row
  join public.arrival_package_runtime_definitions as package_row
    on package_row.arrival_package_definition_id =
      country_row.arrival_package_definition_id
   and package_row.country_id = country_row.country_id
   and package_row.currency_code = country_row.currency_code
   and package_row.starting_location_id = country_row.arrival_location_id
   and package_row.status = 'active'
  where country_row.game_session_id = p_game_session_id;

  select count(*)::integer into v_class_grants
  from public.arrival_class_grant_runtime as runtime_row
  join public.arrival_class_grant_definitions as grant_row
    on grant_row.grant_definition_id = runtime_row.grant_definition_id
   and grant_row.class_id = runtime_row.class_id
   and grant_row.status = 'active'
  where runtime_row.game_session_id = p_game_session_id;

  if v_storylines < 1 or v_story_events < 1
    or v_arrival_packages <> 10 or v_class_grants <> 8
  then
    raise exception 'FULL_GAME_ACTIVATION_VERIFICATION_FAILED'
      using errcode = 'P0001';
  end if;

  insert into public.game_feature_activation_evidence (
    game_session_id, source_game_session_id, activation_version,
    story_status, crafting_status, arrival_grant_status,
    progression_status, evidence, activated_by_staff_user_id, activated_at
  ) values (
    p_game_session_id, p_source_game_session_id,
    'full-game-feature-activation-v2',
    'active', v_crafting_status, 'active', 'active',
    jsonb_build_object(
      'storylines', v_storylines,
      'storyEvents', v_story_events,
      'arrivalPackages', v_arrival_packages,
      'arrivalClassGrants', v_class_grants,
      'craftingItems', v_crafting_items,
      'craftingRecipes', v_crafting_recipes,
      'craftingAuthorityRequired', v_crafting_status <> 'active'
    ),
    p_staff_user_id, p_activated_at
  )
  on conflict (game_session_id) do update
  set
    source_game_session_id = excluded.source_game_session_id,
    activation_version = excluded.activation_version,
    story_status = excluded.story_status,
    crafting_status = excluded.crafting_status,
    arrival_grant_status = excluded.arrival_grant_status,
    progression_status = excluded.progression_status,
    evidence = excluded.evidence,
    activated_by_staff_user_id = excluded.activated_by_staff_user_id,
    activated_at = excluded.activated_at;

  return jsonb_build_object(
    'story', 'active',
    'crafting', v_crafting_status,
    'arrivalGrantProcessor', 'active',
    'progressionInitialization', 'active',
    'counts', jsonb_build_object(
      'storylines', v_storylines,
      'storyEvents', v_story_events,
      'arrivalPackages', v_arrival_packages,
      'arrivalClassGrants', v_class_grants,
      'craftingItems', v_crafting_items,
      'craftingRecipes', v_crafting_recipes
    )
  );
end;
$function$;

create or replace function public.create_provisioned_game_v2(
  p_staff_user_id uuid,
  p_game_name text,
  p_game_settings jsonb,
  p_idempotency_key text,
  p_pack_id text default 'econovaria.beta-seed-pack.v1'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
  v_game_id uuid;
  v_source_game_id uuid;
  v_activation jsonb;
  v_counts jsonb;
begin
  v_result := public.create_provisioned_game_v1(
    p_staff_user_id,
    p_game_name,
    p_game_settings,
    p_idempotency_key,
    p_pack_id
  );

  if coalesce(v_result->>'outcome', '') in ('failed', 'failed_replay') then
    return v_result;
  end if;

  v_game_id := nullif(v_result->>'gameSessionId', '')::uuid;

  if v_game_id is null then
    raise exception 'FULL_GAME_ACTIVATION_GAME_ID_MISSING' using errcode = 'P0001';
  end if;

  select game_row.provisioning_source_game_session_id
  into v_source_game_id
  from public.game_sessions as game_row
  where game_row.id = v_game_id
    and game_row.owner_staff_user_id = p_staff_user_id;

  if v_source_game_id is null then
    raise exception 'FULL_GAME_ACTIVATION_SOURCE_MISSING' using errcode = 'P0001';
  end if;

  v_activation := public.complete_game_feature_activation_v2(
    v_game_id,
    v_source_game_id,
    p_staff_user_id,
    now()
  );

  v_counts := coalesce(v_result->'counts', '{}'::jsonb)
    || coalesce(v_activation->'counts', '{}'::jsonb);

  v_result := v_result
    || jsonb_build_object(
      'counts', v_counts,
      'contentGates', jsonb_build_object(
        'crafting', v_activation->>'crafting',
        'story', v_activation->>'story',
        'arrivalGrantProcessor', v_activation->>'arrivalGrantProcessor',
        'progressionInitialization', v_activation->>'progressionInitialization'
      ),
      'activationVersion', 'full-game-feature-activation-v2'
    );

  update public.game_creation_provisioning_requests
  set result = v_result
  where staff_user_id = p_staff_user_id
    and idempotency_key = p_idempotency_key
    and game_session_id = v_game_id
    and status = 'completed';

  update public.audit_log
  set metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'activationVersion', 'full-game-feature-activation-v2',
      'featureActivation', v_activation
    )
  where game_session_id = v_game_id
    and action = 'game.provisioned'
    and target_id = v_game_id;

  return v_result;
end;
$function$;

comment on function public.create_provisioned_game_v2(
  uuid, text, jsonb, text, text
) is
  'Creates an isolated multiplayer game through V1 and completes Story, Arrival grant, Progression, and authority-permitted Crafting activation before returning. Production remains fail-closed.';

comment on function public.apply_arrival_grant_command_v1(
  uuid, text, timestamptz
) is
  'Processes one server-created Arrival grant command exactly once, posting the approved starting balance and initializing Player progression, travel, and residency state.';

revoke all on function public.ensure_player_progression_after_activation_v1()
  from public, anon, authenticated;
revoke all on function public.apply_arrival_grant_command_v1(
  uuid, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.process_arrival_grant_command_after_insert_v1()
  from public, anon, authenticated;
revoke all on function public.process_arrival_grant_commands_v1(
  uuid, integer, timestamptz
) from public, anon, authenticated;
revoke all on function public.complete_game_feature_activation_v2(
  uuid, uuid, uuid, timestamptz
) from public, anon, authenticated;
revoke all on function public.create_provisioned_game_v2(
  uuid, text, jsonb, text, text
) from public, anon, authenticated;

grant execute on function public.apply_arrival_grant_command_v1(
  uuid, text, timestamptz
) to service_role;
grant execute on function public.process_arrival_grant_commands_v1(
  uuid, integer, timestamptz
) to service_role;
grant execute on function public.complete_game_feature_activation_v2(
  uuid, uuid, uuid, timestamptz
) to service_role;
grant execute on function public.create_provisioned_game_v2(
  uuid, text, jsonb, text, text
) to service_role;

commit;
