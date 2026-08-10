begin;

create table public.story_message_interactions (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  message_id uuid not null references public.story_messages(message_id) on delete cascade,
  player_id uuid not null,
  source_storyline_event_id uuid not null references public.storyline_events(id) on delete cascade,
  character_key text not null,
  interaction_key text not null,
  prompt text not null,
  options jsonb not null,
  opens_at timestamptz not null,
  closes_at timestamptz null,
  default_choice_key text null,
  content_fingerprint text not null,
  created_at timestamptz not null default now(),
  constraint story_message_interactions_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id)
    on delete cascade,
  constraint story_message_interactions_message_unique unique (message_id),
  constraint story_message_interactions_public_key_unique
    unique (game_session_id, player_id, interaction_key),
  constraint story_message_interactions_character_key_valid check (
    length(character_key) between 1 and 160
    and character_key = btrim(character_key)
    and character_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    and character_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  constraint story_message_interactions_interaction_key_valid check (
    length(interaction_key) between 1 and 160
    and interaction_key = btrim(interaction_key)
    and interaction_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    and interaction_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  constraint story_message_interactions_prompt_valid check (
    length(prompt) between 1 and 1000
    and prompt = btrim(prompt)
    and prompt !~ E'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'
  ),
  constraint story_message_interactions_options_valid check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) between 2 and 5
  ),
  constraint story_message_interactions_window_valid check (
    closes_at is null or closes_at > opens_at
  ),
  constraint story_message_interactions_default_choice_valid check (
    default_choice_key is null
    or (
      length(default_choice_key) between 1 and 96
      and default_choice_key = btrim(default_choice_key)
      and default_choice_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'
    )
  ),
  constraint story_message_interactions_fingerprint_valid check (
    content_fingerprint ~ '^[0-9a-f]{32}$'
  )
);

create index story_message_interactions_player_open_idx
  on public.story_message_interactions (game_session_id, player_id, opens_at desc);

create table public.story_message_interaction_selections (
  interaction_id uuid primary key
    references public.story_message_interactions(id) on delete cascade,
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null,
  source_storyline_event_id uuid not null references public.storyline_events(id) on delete cascade,
  character_key text not null,
  interaction_key text not null,
  choice_key text not null,
  idempotency_key text not null,
  selection_fingerprint text not null,
  selected_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint story_message_interaction_selections_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id)
    on delete cascade,
  constraint story_message_interaction_selections_idempotency_unique
    unique (game_session_id, player_id, idempotency_key),
  constraint story_message_interaction_selections_choice_valid check (
    length(choice_key) between 1 and 96
    and choice_key = btrim(choice_key)
    and choice_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'
  ),
  constraint story_message_interaction_selections_idempotency_valid check (
    length(idempotency_key) between 1 and 128
    and idempotency_key = btrim(idempotency_key)
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  ),
  constraint story_message_interaction_selections_fingerprint_valid check (
    selection_fingerprint ~ '^[0-9a-f]{32}$'
  )
);

alter table public.story_message_interactions enable row level security;
alter table public.story_message_interactions force row level security;
alter table public.story_message_interaction_selections enable row level security;
alter table public.story_message_interaction_selections force row level security;

revoke all privileges on table public.story_message_interactions
  from public, anon, authenticated;
revoke all privileges on table public.story_message_interaction_selections
  from public, anon, authenticated;
grant select, insert on table public.story_message_interactions to service_role;
grant select, insert on table public.story_message_interaction_selections to service_role;

create or replace function public.protect_story_message_interaction_content_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  raise exception 'STORY_MESSAGE_INTERACTION_IMMUTABLE' using errcode = 'P0001';
end;
$function$;

create trigger protect_story_message_interaction_content_v1
before update on public.story_message_interactions
for each row execute function public.protect_story_message_interaction_content_v1();

create trigger protect_story_message_interaction_selection_v1
before update on public.story_message_interaction_selections
for each row execute function public.protect_story_message_interaction_content_v1();

create or replace function public.deliver_story_character_message_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_source_storyline_event_id uuid,
  p_source_effect_index integer,
  p_character_key text,
  p_character_name text,
  p_interaction_key text,
  p_message_purpose text,
  p_body text,
  p_response_window jsonb default null
)
returns table (
  delivery_outcome text,
  thread_id text,
  message_id text,
  character_key text,
  character_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_delivery record;
  v_story_message public.story_messages%rowtype;
  v_message public.messages%rowtype;
  v_existing public.story_message_interactions%rowtype;
  v_interaction_key text := nullif(btrim(coalesce(p_interaction_key, '')), '');
  v_prompt text;
  v_options jsonb;
  v_default_choice_key text;
  v_duration_seconds integer;
  v_closes_at timestamptz;
  v_fingerprint text;
  v_option_count integer;
  v_unique_choice_count integer;
begin
  if p_response_window is not null then
    if jsonb_typeof(p_response_window) <> 'object' or v_interaction_key is null then
      raise exception 'STORY_MESSAGE_RESPONSE_WINDOW_INVALID' using errcode = 'P0001';
    end if;

    v_prompt := btrim(coalesce(p_response_window ->> 'prompt', ''));
    v_options := p_response_window -> 'options';
    v_default_choice_key := nullif(btrim(coalesce(p_response_window ->> 'defaultChoiceKey', '')), '');

    if p_response_window ? 'durationSeconds' then
      if jsonb_typeof(p_response_window -> 'durationSeconds') <> 'number'
        or (p_response_window ->> 'durationSeconds') !~ '^[0-9]+$'
      then
        raise exception 'STORY_MESSAGE_RESPONSE_WINDOW_INVALID' using errcode = 'P0001';
      end if;
      v_duration_seconds := (p_response_window ->> 'durationSeconds')::integer;
    else
      v_duration_seconds := null;
    end if;

    if length(v_prompt) not between 1 and 1000
      or v_prompt ~ E'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'
      or jsonb_typeof(v_options) <> 'array'
      or jsonb_array_length(v_options) not between 2 and 5
      or (v_duration_seconds is not null and v_duration_seconds not between 1 and 31536000)
      or (v_default_choice_key is not null and v_default_choice_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$')
    then
      raise exception 'STORY_MESSAGE_RESPONSE_WINDOW_INVALID' using errcode = 'P0001';
    end if;

    select count(*)::integer, count(distinct btrim(option_row ->> 'choiceKey'))::integer
    into v_option_count, v_unique_choice_count
    from jsonb_array_elements(v_options) as option_row
    where jsonb_typeof(option_row) = 'object'
      and btrim(coalesce(option_row ->> 'choiceKey', '')) ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'
      and length(btrim(coalesce(option_row ->> 'label', ''))) between 1 and 240
      and btrim(coalesce(option_row ->> 'label', '')) !~ E'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'
      and (
        not (option_row ? 'description')
        or option_row -> 'description' = 'null'::jsonb
        or (
          jsonb_typeof(option_row -> 'description') = 'string'
          and length(btrim(option_row ->> 'description')) between 1 and 500
          and btrim(option_row ->> 'description') !~ E'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'
        )
      );

    if v_option_count <> jsonb_array_length(v_options)
      or v_unique_choice_count <> jsonb_array_length(v_options)
      or (
        v_default_choice_key is not null
        and not exists (
          select 1
          from jsonb_array_elements(v_options) as default_option
          where btrim(default_option ->> 'choiceKey') = v_default_choice_key
        )
      )
    then
      raise exception 'STORY_MESSAGE_RESPONSE_WINDOW_INVALID' using errcode = 'P0001';
    end if;

    v_fingerprint := md5(
      jsonb_build_object(
        'interactionKey', v_interaction_key,
        'prompt', v_prompt,
        'options', v_options,
        'durationSeconds', v_duration_seconds,
        'defaultChoiceKey', v_default_choice_key
      )::text
    );
  end if;

  select *
  into v_delivery
  from public.deliver_story_character_message_v1(
    p_game_session_id,
    p_player_id,
    p_source_storyline_event_id,
    p_source_effect_index,
    p_character_key,
    p_character_name,
    p_interaction_key,
    p_message_purpose,
    p_body
  );

  if p_response_window is null or v_delivery.delivery_outcome = 'suppressed' then
    return query select
      v_delivery.delivery_outcome::text,
      v_delivery.thread_id::text,
      v_delivery.message_id::text,
      v_delivery.character_key::text,
      v_delivery.character_name::text,
      v_delivery.created_at::timestamptz;
    return;
  end if;

  select story_row.*
  into v_story_message
  from public.story_messages as story_row
  where story_row.game_session_id = p_game_session_id
    and story_row.player_id = p_player_id
    and story_row.source_storyline_event_id = p_source_storyline_event_id
    and story_row.source_effect_index = p_source_effect_index;

  if not found then
    raise exception 'STORY_MESSAGE_INTERACTION_SOURCE_MISSING' using errcode = 'P0001';
  end if;

  select message_row.*
  into v_message
  from public.messages as message_row
  where message_row.id = v_story_message.message_id
    and message_row.game_session_id = p_game_session_id;

  if not found then
    raise exception 'STORY_MESSAGE_INTERACTION_SOURCE_MISSING' using errcode = 'P0001';
  end if;

  v_closes_at := case
    when v_duration_seconds is null then null
    else v_message.created_at + make_interval(secs => v_duration_seconds)
  end;

  select interaction_row.*
  into v_existing
  from public.story_message_interactions as interaction_row
  where interaction_row.message_id = v_story_message.message_id
  for update;

  if found then
    if v_existing.interaction_key <> v_interaction_key
      or v_existing.content_fingerprint <> v_fingerprint
    then
      raise exception 'STORY_MESSAGE_INTERACTION_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
  else
    insert into public.story_message_interactions (
      game_session_id,
      thread_id,
      message_id,
      player_id,
      source_storyline_event_id,
      character_key,
      interaction_key,
      prompt,
      options,
      opens_at,
      closes_at,
      default_choice_key,
      content_fingerprint,
      created_at
    ) values (
      p_game_session_id,
      v_story_message.thread_id,
      v_story_message.message_id,
      p_player_id,
      p_source_storyline_event_id,
      v_story_message.character_key,
      v_interaction_key,
      v_prompt,
      v_options,
      v_message.created_at,
      v_closes_at,
      v_default_choice_key,
      v_fingerprint,
      v_message.created_at
    );
  end if;

  return query select
    v_delivery.delivery_outcome::text,
    v_delivery.thread_id::text,
    v_delivery.message_id::text,
    v_delivery.character_key::text,
    v_delivery.character_name::text,
    v_delivery.created_at::timestamptz;
end;
$function$;

create or replace function public.select_player_story_message_interaction_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_thread_public_id text,
  p_interaction_key text,
  p_choice_key text,
  p_idempotency_key text,
  p_selected_at timestamptz default now()
)
returns table (
  selection_outcome text,
  thread_id text,
  interaction_key text,
  choice_key text,
  interaction_status text,
  selected_at timestamptz,
  effective_choice_key text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_thread_key text := btrim(coalesce(p_thread_public_id, ''));
  v_interaction_key text := btrim(coalesce(p_interaction_key, ''));
  v_choice_key text := btrim(coalesce(p_choice_key, ''));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_selected_at timestamptz := coalesce(p_selected_at, now());
  v_interaction public.story_message_interactions%rowtype;
  v_existing public.story_message_interaction_selections%rowtype;
  v_reused public.story_message_interaction_selections%rowtype;
  v_fingerprint text;
begin
  if p_game_session_id is null
    or p_player_id is null
    or v_thread_key !~ '^thr_[0-9a-f]{32}$'
    or v_interaction_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    or v_interaction_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v_choice_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'
    or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  then
    raise exception 'PLAYER_STORY_CHOICE_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
      and game_row.status = 'active'
  ) then
    raise exception 'PLAYER_STORY_CHOICE_GAME_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.players as player_row
    where player_row.id = p_player_id
      and player_row.game_session_id = p_game_session_id
      and player_row.status = 'active'
  ) then
    raise exception 'PLAYER_STORY_CHOICE_SCOPE_FORBIDDEN' using errcode = 'P0001';
  end if;

  select interaction_row.*
  into v_interaction
  from public.story_message_interactions as interaction_row
  join public.message_threads as thread_row
    on thread_row.id = interaction_row.thread_id
    and thread_row.game_session_id = interaction_row.game_session_id
  join public.message_thread_participants as participant_row
    on participant_row.thread_id = thread_row.id
    and participant_row.game_session_id = thread_row.game_session_id
    and participant_row.player_id = p_player_id
  join public.messages as message_row
    on message_row.id = interaction_row.message_id
    and message_row.game_session_id = interaction_row.game_session_id
  where interaction_row.game_session_id = p_game_session_id
    and interaction_row.player_id = p_player_id
    and interaction_row.interaction_key = v_interaction_key
    and thread_row.public_thread_id = v_thread_key
    and thread_row.thread_type = 'story'
    and thread_row.status = 'active'
    and thread_row.retention_until > v_selected_at
    and message_row.hidden_at is null
  for update of interaction_row;

  if not found then
    raise exception 'PLAYER_STORY_CHOICE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select selection_row.*
  into v_existing
  from public.story_message_interaction_selections as selection_row
  where selection_row.interaction_id = v_interaction.id
  for update;

  v_fingerprint := md5(
    v_thread_key || chr(31) || v_interaction_key || chr(31) || v_choice_key
  );

  if found then
    if v_existing.idempotency_key <> v_idempotency_key
      or v_existing.choice_key <> v_choice_key
      or v_existing.selection_fingerprint <> v_fingerprint
    then
      raise exception 'PLAYER_STORY_CHOICE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    return query select
      'replayed'::text,
      v_thread_key,
      v_interaction.interaction_key,
      v_existing.choice_key,
      'selected'::text,
      v_existing.selected_at,
      v_existing.choice_key;
    return;
  end if;

  select selection_row.*
  into v_reused
  from public.story_message_interaction_selections as selection_row
  where selection_row.game_session_id = p_game_session_id
    and selection_row.player_id = p_player_id
    and selection_row.idempotency_key = v_idempotency_key
  for update;

  if found then
    raise exception 'PLAYER_STORY_CHOICE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;

  if v_interaction.opens_at > v_selected_at then
    raise exception 'PLAYER_STORY_CHOICE_NOT_OPEN' using errcode = 'P0001';
  end if;
  if v_interaction.closes_at is not null and v_interaction.closes_at <= v_selected_at then
    raise exception 'PLAYER_STORY_CHOICE_EXPIRED' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(v_interaction.options) as option_row
    where btrim(option_row ->> 'choiceKey') = v_choice_key
  ) then
    raise exception 'PLAYER_STORY_CHOICE_INVALID_OPTION' using errcode = 'P0001';
  end if;

  insert into public.story_message_interaction_selections (
    interaction_id,
    game_session_id,
    player_id,
    source_storyline_event_id,
    character_key,
    interaction_key,
    choice_key,
    idempotency_key,
    selection_fingerprint,
    selected_at,
    created_at
  ) values (
    v_interaction.id,
    p_game_session_id,
    p_player_id,
    v_interaction.source_storyline_event_id,
    v_interaction.character_key,
    v_interaction.interaction_key,
    v_choice_key,
    v_idempotency_key,
    v_fingerprint,
    v_selected_at,
    v_selected_at
  );

  return query select
    'applied'::text,
    v_thread_key,
    v_interaction.interaction_key,
    v_choice_key,
    'selected'::text,
    v_selected_at,
    v_choice_key;
end;
$function$;

create or replace function public.read_player_story_message_interactions_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_thread_public_ids text[],
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $function$
declare
  v_at timestamptz := coalesce(p_at, now());
  v_result jsonb;
begin
  if p_game_session_id is null
    or p_player_id is null
    or p_thread_public_ids is null
    or cardinality(p_thread_public_ids) not between 1 and 50
    or exists (
      select 1 from unnest(p_thread_public_ids) as thread_key
      where thread_key !~ '^thr_[0-9a-f]{32}$'
    )
  then
    raise exception 'PLAYER_STORY_INTERACTION_READ_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.players as player_row
    where player_row.id = p_player_id
      and player_row.game_session_id = p_game_session_id
      and player_row.status = 'active'
  ) then
    raise exception 'PLAYER_STORY_CHOICE_SCOPE_FORBIDDEN' using errcode = 'P0001';
  end if;

  select coalesce(
    jsonb_object_agg(
      message_row.public_message_id,
      jsonb_build_object(
        'interactionKey', interaction_row.interaction_key,
        'prompt', interaction_row.prompt,
        'status', case
          when selection_row.interaction_id is not null then 'selected'
          when interaction_row.closes_at is not null and interaction_row.closes_at <= v_at then 'expired'
          else 'open'
        end,
        'opensAt', interaction_row.opens_at,
        'closesAt', interaction_row.closes_at,
        'selectedChoiceKey', selection_row.choice_key,
        'effectiveChoiceKey', case
          when selection_row.interaction_id is not null then selection_row.choice_key
          when interaction_row.closes_at is not null
            and interaction_row.closes_at <= v_at
            then interaction_row.default_choice_key
          else null
        end,
        'selectedAt', selection_row.selected_at,
        'options', interaction_row.options
      )
    ),
    '{}'::jsonb
  )
  into v_result
  from public.story_message_interactions as interaction_row
  join public.message_threads as thread_row
    on thread_row.id = interaction_row.thread_id
    and thread_row.game_session_id = interaction_row.game_session_id
  join public.message_thread_participants as participant_row
    on participant_row.thread_id = thread_row.id
    and participant_row.game_session_id = thread_row.game_session_id
    and participant_row.player_id = p_player_id
  join public.messages as message_row
    on message_row.id = interaction_row.message_id
    and message_row.game_session_id = interaction_row.game_session_id
    and message_row.hidden_at is null
  left join public.story_message_interaction_selections as selection_row
    on selection_row.interaction_id = interaction_row.id
  where interaction_row.game_session_id = p_game_session_id
    and interaction_row.player_id = p_player_id
    and thread_row.thread_type = 'story'
    and thread_row.public_thread_id = any(p_thread_public_ids)
    and thread_row.retention_until > v_at;

  return v_result;
end;
$function$;

create or replace function public.read_admin_story_message_interactions_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_thread_public_ids text[],
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $function$
declare
  v_at timestamptz := coalesce(p_at, now());
  v_result jsonb;
begin
  if p_game_session_id is null
    or p_staff_user_id is null
    or p_thread_public_ids is null
    or cardinality(p_thread_public_ids) not between 1 and 51
    or exists (
      select 1 from unnest(p_thread_public_ids) as thread_key
      where thread_key !~ '^thr_[0-9a-f]{32}$'
    )
  then
    raise exception 'ADMIN_STORY_INTERACTION_READ_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
      and game_row.owner_staff_user_id = p_staff_user_id
  ) then
    raise exception 'ADMIN_MESSAGES_SCOPE_FORBIDDEN' using errcode = 'P0001';
  end if;

  select coalesce(
    jsonb_object_agg(
      message_row.public_message_id,
      jsonb_build_object(
        'interactionKey', interaction_row.interaction_key,
        'prompt', interaction_row.prompt,
        'status', case
          when selection_row.interaction_id is not null then 'selected'
          when interaction_row.closes_at is not null and interaction_row.closes_at <= v_at then 'expired'
          else 'open'
        end,
        'opensAt', interaction_row.opens_at,
        'closesAt', interaction_row.closes_at,
        'selectedChoiceKey', selection_row.choice_key,
        'effectiveChoiceKey', case
          when selection_row.interaction_id is not null then selection_row.choice_key
          when interaction_row.closes_at is not null
            and interaction_row.closes_at <= v_at
            then interaction_row.default_choice_key
          else null
        end,
        'selectedAt', selection_row.selected_at,
        'options', interaction_row.options
      )
    ),
    '{}'::jsonb
  )
  into v_result
  from public.story_message_interactions as interaction_row
  join public.message_threads as thread_row
    on thread_row.id = interaction_row.thread_id
    and thread_row.game_session_id = interaction_row.game_session_id
  join public.messages as message_row
    on message_row.id = interaction_row.message_id
    and message_row.game_session_id = interaction_row.game_session_id
  left join public.story_message_interaction_selections as selection_row
    on selection_row.interaction_id = interaction_row.id
  where interaction_row.game_session_id = p_game_session_id
    and thread_row.public_thread_id = any(p_thread_public_ids);

  return v_result;
end;
$function$;

create or replace function public.read_story_message_interaction_effective_choice_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_interaction_key text,
  p_at timestamptz
)
returns text
language sql
security definer
stable
set search_path = public, pg_temp
as $function$
  select case
    when selection_row.interaction_id is not null then selection_row.choice_key
    when interaction_row.closes_at is not null
      and interaction_row.closes_at <= p_at
      then interaction_row.default_choice_key
    else null
  end
  from public.story_message_interactions as interaction_row
  left join public.story_message_interaction_selections as selection_row
    on selection_row.interaction_id = interaction_row.id
  where interaction_row.game_session_id = p_game_session_id
    and interaction_row.player_id = p_player_id
    and interaction_row.interaction_key = p_interaction_key
  limit 1;
$function$;

revoke all on function public.protect_story_message_interaction_content_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.deliver_story_character_message_v2(
  uuid, uuid, uuid, integer, text, text, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.select_player_story_message_interaction_v1(
  uuid, uuid, text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.read_player_story_message_interactions_v1(
  uuid, uuid, text[], timestamptz
) from public, anon, authenticated;
revoke all on function public.read_admin_story_message_interactions_v1(
  uuid, uuid, text[], timestamptz
) from public, anon, authenticated;
revoke all on function public.read_story_message_interaction_effective_choice_v1(
  uuid, uuid, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.deliver_story_character_message_v2(
  uuid, uuid, uuid, integer, text, text, text, text, text, jsonb
) to service_role;
grant execute on function public.select_player_story_message_interaction_v1(
  uuid, uuid, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.read_player_story_message_interactions_v1(
  uuid, uuid, text[], timestamptz
) to service_role;
grant execute on function public.read_admin_story_message_interactions_v1(
  uuid, uuid, text[], timestamptz
) to service_role;
grant execute on function public.read_story_message_interaction_effective_choice_v1(
  uuid, uuid, text, timestamptz
) to service_role;

comment on table public.story_message_interactions is
  'Private server-owned structured response windows anchored to immutable Story character messages.';
comment on table public.story_message_interaction_selections is
  'Immutable server-owned Player selections for Story character response windows.';
comment on function public.select_player_story_message_interaction_v1(
  uuid, uuid, text, text, text, text, timestamptz
) is
  'Session-derived Player Story choice selection with exact replay, expiry enforcement, and public-key-only browser identity.';
comment on function public.read_story_message_interaction_effective_choice_v1(
  uuid, uuid, text, timestamptz
) is
  'Internal Story helper returning the selected choice, or the authored default after expiry, for later consequence evaluation.';

commit;
