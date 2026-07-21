begin;

create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  public_thread_id text not null default ('thr_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  thread_type text not null,
  title text not null,
  contract_key text null,
  allow_player_replies boolean not null default false,
  status text not null default 'active',
  moderation_reason text null,
  retention_until timestamptz not null default (now() + interval '365 days'),
  created_by_type text not null,
  created_by_staff_user_id uuid null references public.staff_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_threads_public_id_format check (public_thread_id ~ '^thr_[0-9a-f]{32}$'),
  constraint message_threads_type_valid check (thread_type in ('announcement', 'system', 'player', 'contract')),
  constraint message_threads_title_valid check (length(btrim(title)) between 1 and 160),
  constraint message_threads_contract_key_valid check (
    (thread_type = 'contract' and contract_key is not null and length(btrim(contract_key)) between 1 and 160)
    or (thread_type <> 'contract' and contract_key is null)
  ),
  constraint message_threads_reply_policy_valid check (
    (thread_type in ('announcement', 'system') and allow_player_replies = false)
    or thread_type in ('player', 'contract')
  ),
  constraint message_threads_status_valid check (status in ('active', 'disabled', 'closed')),
  constraint message_threads_moderation_reason_valid check (
    moderation_reason is null or length(btrim(moderation_reason)) between 1 and 1000
  ),
  constraint message_threads_retention_valid check (retention_until > created_at),
  constraint message_threads_creator_valid check (
    (created_by_type = 'staff_user' and created_by_staff_user_id is not null)
    or (created_by_type = 'system' and created_by_staff_user_id is null)
  ),
  constraint message_threads_scope_unique unique (game_session_id, id),
  constraint message_threads_public_unique unique (public_thread_id)
);

create index message_threads_game_updated_idx
  on public.message_threads (game_session_id, updated_at desc, public_thread_id desc);
create index message_threads_game_status_idx
  on public.message_threads (game_session_id, status, retention_until);
create index message_threads_contract_idx
  on public.message_threads (game_session_id, contract_key)
  where contract_key is not null;

create table public.message_thread_participants (
  thread_id uuid not null,
  game_session_id uuid not null,
  player_id uuid not null,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz null,
  created_at timestamptz not null default now(),
  primary key (thread_id, player_id),
  constraint message_thread_participants_thread_scope_fk
    foreign key (game_session_id, thread_id)
    references public.message_threads(game_session_id, id)
    on delete cascade,
  constraint message_thread_participants_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id)
    on delete cascade,
  constraint message_thread_participants_read_valid check (
    last_read_at is null or last_read_at >= joined_at
  )
);

create index message_thread_participants_player_idx
  on public.message_thread_participants (game_session_id, player_id, thread_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  public_message_id text not null default ('msg_' || replace(gen_random_uuid()::text, '-', '')),
  thread_id uuid not null,
  game_session_id uuid not null,
  sender_type text not null,
  sender_player_id uuid null,
  sender_staff_user_id uuid null references public.staff_users(id) on delete restrict,
  body text not null,
  idempotency_key text null,
  hidden_at timestamptz null,
  hidden_by_staff_user_id uuid null references public.staff_users(id) on delete restrict,
  hidden_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_public_id_format check (public_message_id ~ '^msg_[0-9a-f]{32}$'),
  constraint messages_thread_scope_fk
    foreign key (game_session_id, thread_id)
    references public.message_threads(game_session_id, id)
    on delete cascade,
  constraint messages_sender_type_valid check (sender_type in ('player', 'staff_user', 'system')),
  constraint messages_sender_identity_valid check (
    (sender_type = 'player' and sender_player_id is not null and sender_staff_user_id is null)
    or (sender_type = 'staff_user' and sender_player_id is null and sender_staff_user_id is not null)
    or (sender_type = 'system' and sender_player_id is null and sender_staff_user_id is null)
  ),
  constraint messages_player_scope_fk
    foreign key (game_session_id, sender_player_id)
    references public.players(game_session_id, id)
    on delete cascade,
  constraint messages_body_valid check (
    length(btrim(body)) between 1 and 1000
    and body !~ E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
  ),
  constraint messages_idempotency_valid check (
    idempotency_key is null
    or (
      length(idempotency_key) between 1 and 128
      and idempotency_key = btrim(idempotency_key)
      and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    )
  ),
  constraint messages_hidden_valid check (
    (hidden_at is null and hidden_by_staff_user_id is null and hidden_reason is null)
    or (
      hidden_at is not null
      and hidden_by_staff_user_id is not null
      and hidden_reason is not null
      and length(btrim(hidden_reason)) between 1 and 1000
    )
  ),
  constraint messages_public_unique unique (public_message_id),
  constraint messages_scope_unique unique (game_session_id, id)
);

create unique index messages_player_idempotency_unique
  on public.messages (game_session_id, sender_player_id, idempotency_key)
  where sender_type = 'player' and idempotency_key is not null;
create unique index messages_staff_idempotency_unique
  on public.messages (game_session_id, sender_staff_user_id, idempotency_key)
  where sender_type = 'staff_user' and idempotency_key is not null;
create index messages_thread_created_idx
  on public.messages (game_session_id, thread_id, created_at desc, public_message_id desc);

create table public.message_moderation_audit (
  id uuid primary key default gen_random_uuid(),
  public_action_id text not null default ('mda_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  thread_id uuid not null,
  message_id uuid null,
  staff_user_id uuid not null references public.staff_users(id) on delete restrict,
  action text not null,
  reason text null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint message_moderation_audit_public_id_format check (public_action_id ~ '^mda_[0-9a-f]{32}$'),
  constraint message_moderation_audit_thread_scope_fk
    foreign key (game_session_id, thread_id)
    references public.message_threads(game_session_id, id)
    on delete cascade,
  constraint message_moderation_audit_message_scope_fk
    foreign key (game_session_id, message_id)
    references public.messages(game_session_id, id)
    on delete cascade,
  constraint message_moderation_audit_action_valid check (
    action in ('create_thread', 'disable_thread', 'enable_thread', 'close_thread', 'hide_message', 'unhide_message')
  ),
  constraint message_moderation_audit_reason_valid check (
    reason is null or length(btrim(reason)) between 1 and 1000
  ),
  constraint message_moderation_audit_idempotency_valid check (
    length(idempotency_key) between 1 and 128
    and idempotency_key = btrim(idempotency_key)
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  ),
  constraint message_moderation_audit_public_unique unique (public_action_id),
  constraint message_moderation_audit_staff_idempotency_unique
    unique (game_session_id, staff_user_id, idempotency_key)
);

create index message_moderation_audit_game_created_idx
  on public.message_moderation_audit (game_session_id, created_at desc);

alter table public.message_threads enable row level security;
alter table public.message_thread_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_moderation_audit enable row level security;
alter table public.message_threads force row level security;
alter table public.message_thread_participants force row level security;
alter table public.messages force row level security;
alter table public.message_moderation_audit force row level security;

revoke all privileges on table public.message_threads from public, anon, authenticated;
revoke all privileges on table public.message_thread_participants from public, anon, authenticated;
revoke all privileges on table public.messages from public, anon, authenticated;
revoke all privileges on table public.message_moderation_audit from public, anon, authenticated;
grant select, insert, update, delete on table public.message_threads to service_role;
grant select, insert, update, delete on table public.message_thread_participants to service_role;
grant select, insert, update, delete on table public.messages to service_role;
grant select, insert on table public.message_moderation_audit to service_role;

create or replace function public.read_player_messages_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_thread_limit integer default 25,
  p_message_limit integer default 50
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if p_game_session_id is null
    or p_player_id is null
    or p_thread_limit is null or p_thread_limit not between 1 and 50
    or p_message_limit is null or p_message_limit not between 1 and 100
  then
    raise exception 'PLAYER_MESSAGES_READ_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.players as player_row
    where player_row.id = p_player_id
      and player_row.game_session_id = p_game_session_id
      and player_row.archived_at is null
  ) then
    raise exception 'PLAYER_MESSAGES_SCOPE_FORBIDDEN' using errcode = 'P0001';
  end if;

  with visible_threads as (
    select
      thread_row.id,
      thread_row.public_thread_id,
      thread_row.thread_type,
      thread_row.title,
      thread_row.contract_key,
      thread_row.allow_player_replies,
      thread_row.status,
      thread_row.retention_until,
      thread_row.updated_at,
      participant_row.joined_at,
      participant_row.last_read_at
    from public.message_thread_participants as participant_row
    join public.message_threads as thread_row
      on thread_row.game_session_id = participant_row.game_session_id
      and thread_row.id = participant_row.thread_id
    where participant_row.game_session_id = p_game_session_id
      and participant_row.player_id = p_player_id
      and thread_row.retention_until > now()
    order by thread_row.updated_at desc, thread_row.public_thread_id desc
    limit p_thread_limit
  ),
  rendered_threads as (
    select
      thread_row.updated_at,
      thread_row.public_thread_id,
      unread_values.unread_count,
      jsonb_build_object(
        'id', thread_row.public_thread_id,
        'type', thread_row.thread_type,
        'title', thread_row.title,
        'contractKey', thread_row.contract_key,
        'status', thread_row.status,
        'allowPlayerReplies', thread_row.allow_player_replies,
        'participantCount', participant_values.participant_count,
        'unreadCount', unread_values.unread_count,
        'updatedAt', thread_row.updated_at,
        'retentionUntil', thread_row.retention_until,
        'messages', message_values.messages
      ) as payload
    from visible_threads as thread_row
    cross join lateral (
      select count(*)::integer as participant_count
      from public.message_thread_participants as participant_count_row
      where participant_count_row.game_session_id = p_game_session_id
        and participant_count_row.thread_id = thread_row.id
    ) as participant_values
    cross join lateral (
      select count(*)::integer as unread_count
      from public.messages as unread_message
      where unread_message.game_session_id = p_game_session_id
        and unread_message.thread_id = thread_row.id
        and unread_message.hidden_at is null
        and unread_message.sender_player_id is distinct from p_player_id
        and unread_message.created_at > coalesce(thread_row.last_read_at, thread_row.joined_at)
    ) as unread_values
    cross join lateral (
      select coalesce(
        jsonb_agg(message_payload.payload order by message_payload.created_at asc, message_payload.public_message_id asc),
        '[]'::jsonb
      ) as messages
      from (
        select
          message_row.created_at,
          message_row.public_message_id,
          jsonb_build_object(
            'id', message_row.public_message_id,
            'senderType', message_row.sender_type,
            'senderName', case
              when message_row.sender_type = 'player' then coalesce(player_sender.display_name, 'Player')
              when message_row.sender_type = 'staff_user' then coalesce(staff_sender.display_name, 'Administrator')
              else 'System'
            end,
            'senderReference', case
              when message_row.sender_type = 'player'
                and player_sender.player_identifier is not null
                and player_sender.player_identifier !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then player_sender.player_identifier
              else null
            end,
            'body', case
              when message_row.hidden_at is null then message_row.body
              else 'Message removed by an administrator.'
            end,
            'moderated', message_row.hidden_at is not null,
            'self', message_row.sender_type = 'player'
              and message_row.sender_player_id = p_player_id,
            'createdAt', message_row.created_at
          ) as payload
        from public.messages as message_row
        left join public.players as player_sender
          on player_sender.game_session_id = message_row.game_session_id
          and player_sender.id = message_row.sender_player_id
        left join public.staff_users as staff_sender
          on staff_sender.id = message_row.sender_staff_user_id
        where message_row.game_session_id = p_game_session_id
          and message_row.thread_id = thread_row.id
        order by message_row.created_at desc, message_row.public_message_id desc
        limit p_message_limit
      ) as message_payload
    ) as message_values
  )
  select jsonb_build_object(
    'unreadCount', coalesce(sum(rendered_threads.unread_count), 0),
    'threads', coalesce(
      jsonb_agg(
        rendered_threads.payload
        order by rendered_threads.updated_at desc, rendered_threads.public_thread_id desc
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from rendered_threads;

  return coalesce(
    v_result,
    jsonb_build_object('unreadCount', 0, 'threads', '[]'::jsonb)
  );
end;
$function$;

create or replace function public.send_player_message_atomic_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_thread_public_id text,
  p_body text,
  p_idempotency_key text
)
returns table (
  send_outcome text,
  thread_id text,
  message_id text,
  sender_name text,
  message_body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_thread_public_id text := btrim(coalesce(p_thread_public_id, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_thread public.message_threads%rowtype;
  v_player public.players%rowtype;
  v_existing public.messages%rowtype;
  v_message public.messages%rowtype;
  v_notification_id uuid;
begin
  if p_game_session_id is null
    or p_player_id is null
    or v_thread_public_id !~ '^thr_[0-9a-f]{32}$'
    or length(v_body) not between 1 and 1000
    or v_body ~ E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
    or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  then
    raise exception 'PLAYER_MESSAGE_SEND_INVALID' using errcode = 'P0001';
  end if;

  select player_row.*
  into v_player
  from public.players as player_row
  where player_row.id = p_player_id
    and player_row.game_session_id = p_game_session_id
    and player_row.archived_at is null
  for update;
  if not found then
    raise exception 'PLAYER_MESSAGES_SCOPE_FORBIDDEN' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
      and game_row.status = 'active'
  ) then
    raise exception 'PLAYER_MESSAGE_GAME_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  select thread_row.*
  into v_thread
  from public.message_threads as thread_row
  join public.message_thread_participants as participant_row
    on participant_row.game_session_id = thread_row.game_session_id
    and participant_row.thread_id = thread_row.id
  where thread_row.game_session_id = p_game_session_id
    and thread_row.public_thread_id = v_thread_public_id
    and participant_row.player_id = p_player_id
  for update of thread_row;
  if not found then
    raise exception 'PLAYER_MESSAGE_THREAD_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_thread.status <> 'active' or v_thread.retention_until <= now() then
    raise exception 'PLAYER_MESSAGE_THREAD_DISABLED' using errcode = 'P0001';
  end if;
  if not v_thread.allow_player_replies then
    raise exception 'PLAYER_MESSAGE_REPLIES_DISABLED' using errcode = 'P0001';
  end if;

  select message_row.*
  into v_existing
  from public.messages as message_row
  where message_row.game_session_id = p_game_session_id
    and message_row.sender_type = 'player'
    and message_row.sender_player_id = p_player_id
    and message_row.idempotency_key = v_idempotency_key
  for update;
  if found then
    if v_existing.thread_id <> v_thread.id or v_existing.body <> v_body then
      raise exception 'PLAYER_MESSAGE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return query
    select
      'replayed'::text,
      v_thread.public_thread_id,
      v_existing.public_message_id,
      v_player.display_name,
      v_existing.body,
      v_existing.created_at;
    return;
  end if;

  insert into public.messages (
    thread_id,
    game_session_id,
    sender_type,
    sender_player_id,
    body,
    idempotency_key
  )
  values (
    v_thread.id,
    p_game_session_id,
    'player',
    p_player_id,
    v_body,
    v_idempotency_key
  )
  returning *
  into v_message;

  update public.message_threads
  set updated_at = v_message.created_at
  where id = v_thread.id
    and game_session_id = p_game_session_id;

  insert into public.notifications (
    game_session_id,
    source_type,
    source_id,
    notification_type,
    title,
    summary,
    priority,
    display_mode,
    payload,
    published_at
  )
  values (
    p_game_session_id,
    'message',
    v_message.public_message_id,
    'message_received',
    v_thread.title,
    'New message from ' || coalesce(v_player.display_name, 'Player') || '.',
    'normal',
    'inbox',
    jsonb_build_object(
      'threadId', v_thread.public_thread_id,
      'messageId', v_message.public_message_id
    ),
    v_message.created_at
  )
  returning id
  into v_notification_id;

  insert into public.notification_deliveries (
    notification_id,
    game_session_id,
    player_id,
    delivered_at
  )
  select
    v_notification_id,
    p_game_session_id,
    participant_row.player_id,
    v_message.created_at
  from public.message_thread_participants as participant_row
  where participant_row.game_session_id = p_game_session_id
    and participant_row.thread_id = v_thread.id
    and participant_row.player_id <> p_player_id
  on conflict (notification_id, player_id) do nothing;

  return query
  select
    'applied'::text,
    v_thread.public_thread_id,
    v_message.public_message_id,
    v_player.display_name,
    v_message.body,
    v_message.created_at;
end;
$function$;

create or replace function public.mark_player_message_thread_read_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_thread_public_id text,
  p_read_at timestamptz default now()
)
returns table (
  thread_id text,
  read_at timestamptz,
  unread_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_thread_id uuid;
  v_public_thread_id text := btrim(coalesce(p_thread_public_id, ''));
  v_read_at timestamptz := coalesce(p_read_at, now());
begin
  if p_game_session_id is null
    or p_player_id is null
    or v_public_thread_id !~ '^thr_[0-9a-f]{32}$'
  then
    raise exception 'PLAYER_MESSAGE_READ_INVALID' using errcode = 'P0001';
  end if;

  select thread_row.id
  into v_thread_id
  from public.message_threads as thread_row
  join public.message_thread_participants as participant_row
    on participant_row.game_session_id = thread_row.game_session_id
    and participant_row.thread_id = thread_row.id
  where thread_row.game_session_id = p_game_session_id
    and thread_row.public_thread_id = v_public_thread_id
    and participant_row.player_id = p_player_id;

  if v_thread_id is null then
    raise exception 'PLAYER_MESSAGE_THREAD_NOT_FOUND' using errcode = 'P0001';
  end if;

  update public.message_thread_participants
  set last_read_at = greatest(coalesce(last_read_at, joined_at), v_read_at)
  where game_session_id = p_game_session_id
    and thread_id = v_thread_id
    and player_id = p_player_id;

  return query
  select v_public_thread_id, v_read_at, 0;
end;
$function$;

create or replace function public.create_admin_message_thread_atomic_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_thread_type text,
  p_title text,
  p_contract_key text,
  p_allow_player_replies boolean,
  p_player_identifiers text[],
  p_target_all_players boolean,
  p_initial_body text,
  p_retention_until timestamptz,
  p_idempotency_key text
)
returns table (
  create_outcome text,
  thread_id text,
  created_thread_type text,
  thread_title text,
  thread_status text,
  participant_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_type text := lower(btrim(coalesce(p_thread_type, '')));
  v_title text := btrim(coalesce(p_title, ''));
  v_contract_key text := nullif(btrim(coalesce(p_contract_key, '')), '');
  v_body text := nullif(btrim(coalesce(p_initial_body, '')), '');
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_thread public.message_threads%rowtype;
  v_existing_audit public.message_moderation_audit%rowtype;
  v_initial_message public.messages%rowtype;
  v_notification_id uuid;
  v_count integer;
begin
  if p_game_session_id is null
    or p_staff_user_id is null
    or v_type not in ('announcement', 'system', 'player', 'contract')
    or length(v_title) not between 1 and 160
    or (
      v_type = 'contract'
      and (v_contract_key is null or length(v_contract_key) > 160)
    )
    or (v_type <> 'contract' and v_contract_key is not null)
    or (v_type in ('announcement', 'system') and coalesce(p_allow_player_replies, false))
    or (
      v_body is not null
      and (
        length(v_body) > 1000
        or v_body ~ E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
      )
    )
    or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or coalesce(p_retention_until, now() + interval '365 days') <= now()
    or coalesce(p_retention_until, now() + interval '365 days') > now() + interval '730 days'
  then
    raise exception 'ADMIN_MESSAGE_THREAD_CREATE_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
      and game_row.owner_staff_user_id = p_staff_user_id
  ) then
    raise exception 'ADMIN_MESSAGES_SCOPE_FORBIDDEN' using errcode = 'P0001';
  end if;

  select audit_row.*
  into v_existing_audit
  from public.message_moderation_audit as audit_row
  where audit_row.game_session_id = p_game_session_id
    and audit_row.staff_user_id = p_staff_user_id
    and audit_row.idempotency_key = v_key
  for update;

  if found then
    if v_existing_audit.action <> 'create_thread' then
      raise exception 'ADMIN_MESSAGE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    select thread_row.*
    into v_thread
    from public.message_threads as thread_row
    where thread_row.id = v_existing_audit.thread_id;

    if not found
      or v_thread.thread_type <> v_type
      or v_thread.title <> v_title
      or v_thread.contract_key is distinct from v_contract_key
    then
      raise exception 'ADMIN_MESSAGE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    select count(*)::integer
    into v_count
    from public.message_thread_participants as participant_row
    where participant_row.thread_id = v_thread.id;

    return query
    select
      'replayed'::text,
      v_thread.public_thread_id,
      v_thread.thread_type,
      v_thread.title,
      v_thread.status,
      v_count,
      v_thread.created_at;
    return;
  end if;

  insert into public.message_threads (
    game_session_id,
    thread_type,
    title,
    contract_key,
    allow_player_replies,
    retention_until,
    created_by_type,
    created_by_staff_user_id
  )
  values (
    p_game_session_id,
    v_type,
    v_title,
    v_contract_key,
    case
      when v_type in ('announcement', 'system') then false
      else coalesce(p_allow_player_replies, true)
    end,
    coalesce(p_retention_until, now() + interval '365 days'),
    case when v_type = 'system' then 'system' else 'staff_user' end,
    case when v_type = 'system' then null else p_staff_user_id end
  )
  returning *
  into v_thread;

  if coalesce(p_target_all_players, false) then
    insert into public.message_thread_participants (
      thread_id,
      game_session_id,
      player_id
    )
    select
      v_thread.id,
      p_game_session_id,
      player_row.id
    from public.players as player_row
    where player_row.game_session_id = p_game_session_id
      and player_row.archived_at is null;
  else
    insert into public.message_thread_participants (
      thread_id,
      game_session_id,
      player_id
    )
    select
      v_thread.id,
      p_game_session_id,
      player_row.id
    from public.players as player_row
    where player_row.game_session_id = p_game_session_id
      and player_row.archived_at is null
      and player_row.player_identifier = any(
        coalesce(p_player_identifiers, array[]::text[])
      );
  end if;

  select count(*)::integer
  into v_count
  from public.message_thread_participants as participant_row
  where participant_row.thread_id = v_thread.id;

  if v_count < 1 then
    raise exception 'ADMIN_MESSAGE_PARTICIPANTS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_body is not null then
    insert into public.messages (
      thread_id,
      game_session_id,
      sender_type,
      sender_staff_user_id,
      body,
      idempotency_key
    )
    values (
      v_thread.id,
      p_game_session_id,
      case when v_type = 'system' then 'system' else 'staff_user' end,
      case when v_type = 'system' then null else p_staff_user_id end,
      v_body,
      v_key || ':initial'
    )
    returning *
    into v_initial_message;

    insert into public.notifications (
      game_session_id,
      source_type,
      source_id,
      notification_type,
      title,
      summary,
      priority,
      display_mode,
      payload,
      published_at
    )
    values (
      p_game_session_id,
      'message',
      v_initial_message.public_message_id,
      'message_received',
      v_thread.title,
      case
        when v_type = 'announcement' then 'New administrator announcement.'
        when v_type = 'system' then 'New system message.'
        else 'New message from an administrator.'
      end,
      case when v_type in ('announcement', 'system') then 'high' else 'normal' end,
      'inbox',
      jsonb_build_object(
        'threadId', v_thread.public_thread_id,
        'messageId', v_initial_message.public_message_id
      ),
      v_initial_message.created_at
    )
    returning id
    into v_notification_id;

    insert into public.notification_deliveries (
      notification_id,
      game_session_id,
      player_id,
      delivered_at
    )
    select
      v_notification_id,
      p_game_session_id,
      participant_row.player_id,
      v_initial_message.created_at
    from public.message_thread_participants as participant_row
    where participant_row.thread_id = v_thread.id;
  end if;

  insert into public.message_moderation_audit (
    game_session_id,
    thread_id,
    staff_user_id,
    action,
    reason,
    idempotency_key
  )
  values (
    p_game_session_id,
    v_thread.id,
    p_staff_user_id,
    'create_thread',
    null,
    v_key
  );

  return query
  select
    'applied'::text,
    v_thread.public_thread_id,
    v_thread.thread_type,
    v_thread.title,
    v_thread.status,
    v_count,
    v_thread.created_at;
end;
$function$;

create or replace function public.read_admin_message_threads_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_status text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $function$
declare
  v_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  v_result jsonb;
begin
  if p_game_session_id is null
    or p_staff_user_id is null
    or (
      v_status is not null
      and v_status not in ('active', 'disabled', 'closed')
    )
    or p_limit is null or p_limit not between 1 and 51
    or p_offset is null or p_offset not between 0 and 10000
  then
    raise exception 'ADMIN_MESSAGES_READ_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
      and game_row.owner_staff_user_id = p_staff_user_id
  ) then
    raise exception 'ADMIN_MESSAGES_SCOPE_FORBIDDEN' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'threads', coalesce(
      jsonb_agg(
        thread_payload.payload
        order by thread_payload.updated_at desc, thread_payload.public_thread_id desc
      ),
      '[]'::jsonb
    ),
    'returned', count(*)::integer
  )
  into v_result
  from (
    select
      thread_row.updated_at,
      thread_row.public_thread_id,
      jsonb_build_object(
        'id', thread_row.public_thread_id,
        'type', thread_row.thread_type,
        'title', thread_row.title,
        'contractKey', thread_row.contract_key,
        'allowPlayerReplies', thread_row.allow_player_replies,
        'status', thread_row.status,
        'moderationReason', thread_row.moderation_reason,
        'retentionUntil', thread_row.retention_until,
        'createdAt', thread_row.created_at,
        'updatedAt', thread_row.updated_at,
        'participants', participant_values.participants,
        'messages', message_values.messages
      ) as payload
    from public.message_threads as thread_row
    cross join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'reference', case
              when player_row.player_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then null
              else player_row.player_identifier
            end,
            'displayName', player_row.display_name,
            'rosterLabel', player_row.roster_label,
            'lastReadAt', participant_row.last_read_at
          )
          order by player_row.display_name, player_row.player_identifier
        ),
        '[]'::jsonb
      ) as participants
      from public.message_thread_participants as participant_row
      join public.players as player_row
        on player_row.game_session_id = participant_row.game_session_id
        and player_row.id = participant_row.player_id
      where participant_row.game_session_id = p_game_session_id
        and participant_row.thread_id = thread_row.id
    ) as participant_values
    cross join lateral (
      select coalesce(
        jsonb_agg(
          message_payload.payload
          order by message_payload.created_at asc, message_payload.public_message_id asc
        ),
        '[]'::jsonb
      ) as messages
      from (
        select
          message_row.created_at,
          message_row.public_message_id,
          jsonb_build_object(
            'id', message_row.public_message_id,
            'senderType', message_row.sender_type,
            'senderName', case
              when message_row.sender_type = 'player' then coalesce(player_sender.display_name, 'Player')
              when message_row.sender_type = 'staff_user' then coalesce(staff_sender.display_name, 'Administrator')
              else 'System'
            end,
            'body', message_row.body,
            'hidden', message_row.hidden_at is not null,
            'hiddenReason', message_row.hidden_reason,
            'createdAt', message_row.created_at
          ) as payload
        from public.messages as message_row
        left join public.players as player_sender
          on player_sender.id = message_row.sender_player_id
          and player_sender.game_session_id = message_row.game_session_id
        left join public.staff_users as staff_sender
          on staff_sender.id = message_row.sender_staff_user_id
        where message_row.game_session_id = p_game_session_id
          and message_row.thread_id = thread_row.id
        order by message_row.created_at desc, message_row.public_message_id desc
        limit 100
      ) as message_payload
    ) as message_values
    where thread_row.game_session_id = p_game_session_id
      and (v_status is null or thread_row.status = v_status)
    order by thread_row.updated_at desc, thread_row.public_thread_id desc
    limit p_limit
    offset p_offset
  ) as thread_payload;

  return coalesce(
    v_result,
    jsonb_build_object('threads', '[]'::jsonb, 'returned', 0)
  );
end;
$function$;

create or replace function public.moderate_admin_message_atomic_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_thread_public_id text,
  p_message_public_id text,
  p_action text,
  p_reason text,
  p_idempotency_key text
)
returns table (
  moderation_outcome text,
  action_id text,
  thread_id text,
  message_id text,
  moderation_action text,
  thread_status text,
  message_hidden boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_thread_public_id text := btrim(coalesce(p_thread_public_id, ''));
  v_message_public_id text := nullif(btrim(coalesce(p_message_public_id, '')), '');
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_thread public.message_threads%rowtype;
  v_message public.messages%rowtype;
  v_audit public.message_moderation_audit%rowtype;
begin
  if p_game_session_id is null
    or p_staff_user_id is null
    or v_thread_public_id !~ '^thr_[0-9a-f]{32}$'
    or v_action not in (
      'disable_thread',
      'enable_thread',
      'close_thread',
      'hide_message',
      'unhide_message'
    )
    or (
      v_action in ('hide_message', 'unhide_message')
      and (
        v_message_public_id is null
        or v_message_public_id !~ '^msg_[0-9a-f]{32}$'
      )
    )
    or (
      v_action not in ('hide_message', 'unhide_message')
      and v_message_public_id is not null
    )
    or (
      v_action in ('disable_thread', 'close_thread', 'hide_message')
      and v_reason is null
    )
    or length(coalesce(v_reason, '')) > 1000
    or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  then
    raise exception 'ADMIN_MESSAGE_MODERATION_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
      and game_row.owner_staff_user_id = p_staff_user_id
  ) then
    raise exception 'ADMIN_MESSAGES_SCOPE_FORBIDDEN' using errcode = 'P0001';
  end if;

  select audit_row.*
  into v_audit
  from public.message_moderation_audit as audit_row
  where audit_row.game_session_id = p_game_session_id
    and audit_row.staff_user_id = p_staff_user_id
    and audit_row.idempotency_key = v_key
  for update;

  if found then
    select thread_row.*
    into v_thread
    from public.message_threads as thread_row
    where thread_row.id = v_audit.thread_id;

    if v_audit.action <> v_action
      or v_thread.public_thread_id <> v_thread_public_id
    then
      raise exception 'ADMIN_MESSAGE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    if v_audit.message_id is not null then
      select message_row.*
      into v_message
      from public.messages as message_row
      where message_row.id = v_audit.message_id;
    end if;

    return query
    select
      'replayed'::text,
      v_audit.public_action_id,
      v_thread.public_thread_id,
      case
        when v_message.id is null then null
        else v_message.public_message_id
      end,
      v_audit.action,
      v_thread.status,
      coalesce(v_message.hidden_at is not null, false),
      v_audit.created_at;
    return;
  end if;

  select thread_row.*
  into v_thread
  from public.message_threads as thread_row
  where thread_row.game_session_id = p_game_session_id
    and thread_row.public_thread_id = v_thread_public_id
  for update;

  if not found then
    raise exception 'ADMIN_MESSAGE_THREAD_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_action in ('hide_message', 'unhide_message') then
    select message_row.*
    into v_message
    from public.messages as message_row
    where message_row.game_session_id = p_game_session_id
      and message_row.thread_id = v_thread.id
      and message_row.public_message_id = v_message_public_id
    for update;

    if not found then
      raise exception 'ADMIN_MESSAGE_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  if v_action = 'disable_thread' then
    update public.message_threads
    set
      status = 'disabled',
      moderation_reason = v_reason,
      updated_at = now()
    where id = v_thread.id
    returning *
    into v_thread;
  elsif v_action = 'enable_thread' then
    update public.message_threads
    set
      status = 'active',
      moderation_reason = null,
      updated_at = now()
    where id = v_thread.id
    returning *
    into v_thread;
  elsif v_action = 'close_thread' then
    update public.message_threads
    set
      status = 'closed',
      moderation_reason = v_reason,
      updated_at = now()
    where id = v_thread.id
    returning *
    into v_thread;
  elsif v_action = 'hide_message' then
    update public.messages
    set
      hidden_at = now(),
      hidden_by_staff_user_id = p_staff_user_id,
      hidden_reason = v_reason,
      updated_at = now()
    where id = v_message.id
    returning *
    into v_message;
  elsif v_action = 'unhide_message' then
    update public.messages
    set
      hidden_at = null,
      hidden_by_staff_user_id = null,
      hidden_reason = null,
      updated_at = now()
    where id = v_message.id
    returning *
    into v_message;
  end if;

  insert into public.message_moderation_audit (
    game_session_id,
    thread_id,
    message_id,
    staff_user_id,
    action,
    reason,
    idempotency_key
  )
  values (
    p_game_session_id,
    v_thread.id,
    case when v_message.id is null then null else v_message.id end,
    p_staff_user_id,
    v_action,
    v_reason,
    v_key
  )
  returning *
  into v_audit;

  return query
  select
    'applied'::text,
    v_audit.public_action_id,
    v_thread.public_thread_id,
    case
      when v_message.id is null then null
      else v_message.public_message_id
    end,
    v_action,
    v_thread.status,
    coalesce(v_message.hidden_at is not null, false),
    v_audit.created_at;
end;
$function$;

revoke all on function public.read_player_messages_v1(uuid, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.send_player_message_atomic_v1(uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.mark_player_message_thread_read_v1(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.create_admin_message_thread_atomic_v1(
  uuid, uuid, text, text, text, boolean, text[], boolean, text, timestamptz, text
) from public, anon, authenticated;
revoke all on function public.read_admin_message_threads_v1(uuid, uuid, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.moderate_admin_message_atomic_v1(
  uuid, uuid, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.read_player_messages_v1(uuid, uuid, integer, integer)
  to service_role;
grant execute on function public.send_player_message_atomic_v1(uuid, uuid, text, text, text)
  to service_role;
grant execute on function public.mark_player_message_thread_read_v1(uuid, uuid, text, timestamptz)
  to service_role;
grant execute on function public.create_admin_message_thread_atomic_v1(
  uuid, uuid, text, text, text, boolean, text[], boolean, text, timestamptz, text
) to service_role;
grant execute on function public.read_admin_message_threads_v1(uuid, uuid, text, integer, integer)
  to service_role;
grant execute on function public.moderate_admin_message_atomic_v1(
  uuid, uuid, text, text, text, text, text
) to service_role;

comment on table public.message_threads is
  'Server-managed game communication threads. Browser access is mediated by authenticated Player and Admin APIs.';
comment on table public.message_thread_participants is
  'Game-scoped player membership and read state for communication threads.';
comment on table public.messages is
  'Append-only communication messages with reversible moderation visibility and idempotent sender commands.';
comment on table public.message_moderation_audit is
  'Immutable staff moderation and thread-creation command audit for game communications.';

commit;
