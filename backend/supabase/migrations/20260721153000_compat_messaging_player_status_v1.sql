begin;

create or replace function public.read_player_message_policy_v1(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $function$
declare
  v_policy public.message_game_policies%rowtype;
begin
  if p_game_session_id is null or p_player_id is null or not exists (
    select 1 from public.players as player_row
    where player_row.game_session_id = p_game_session_id
      and player_row.id = p_player_id
      and player_row.status = 'active'
  ) then
    raise exception 'PLAYER_MESSAGES_SCOPE_FORBIDDEN' using errcode = 'P0001';
  end if;

  select * into v_policy
  from public.message_game_policies
  where game_session_id = p_game_session_id;

  return jsonb_build_object(
    'playerThreadsEnabled', coalesce(v_policy.player_threads_enabled, true),
    'maxParticipants', coalesce(v_policy.max_player_thread_participants, 2),
    'defaultRetentionDays', coalesce(v_policy.default_retention_days, 365),
    'attachmentsEnabled', false
  );
end;
$function$;

create or replace function public.create_player_message_thread_atomic_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_recipient_player_identifier text,
  p_title text,
  p_initial_body text,
  p_idempotency_key text
)
returns table (
  create_outcome text,
  thread_id text,
  message_id text,
  thread_title text,
  recipient_reference text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_recipient_identifier text := btrim(coalesce(p_recipient_player_identifier, ''));
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_initial_body, ''));
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_fingerprint text;
  v_sender public.players%rowtype;
  v_recipient public.players%rowtype;
  v_policy public.message_game_policies%rowtype;
  v_existing public.message_threads%rowtype;
  v_thread public.message_threads%rowtype;
  v_message public.messages%rowtype;
  v_notification_id uuid;
  v_initial_created_at timestamptz;
begin
  if p_game_session_id is null
    or p_player_id is null
    or v_recipient_identifier !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    or v_recipient_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or length(v_title) not between 1 and 160
    or length(v_body) not between 1 and 1000
    or v_title ~ '[[:cntrl:]]'
    or v_body ~ E'[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
    or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  then
    raise exception 'PLAYER_MESSAGE_THREAD_CREATE_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.game_sessions as game_row
    where game_row.id = p_game_session_id and game_row.status = 'active'
  ) then
    raise exception 'PLAYER_MESSAGE_GAME_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  select * into v_sender
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active'
  for update;
  if not found then
    raise exception 'PLAYER_MESSAGES_SCOPE_FORBIDDEN' using errcode = 'P0001';
  end if;

  select * into v_policy
  from public.message_game_policies
  where game_session_id = p_game_session_id;
  if found and not v_policy.player_threads_enabled then
    raise exception 'PLAYER_MESSAGE_THREADS_DISABLED' using errcode = 'P0001';
  end if;

  select * into v_recipient
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.player_identifier = v_recipient_identifier
    and player_row.status = 'active'
  for share;
  if not found or v_recipient.id = p_player_id then
    raise exception 'PLAYER_MESSAGE_RECIPIENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_fingerprint := md5(v_recipient.id::text || chr(31) || v_title || chr(31) || v_body);

  select * into v_existing
  from public.message_threads as thread_row
  where thread_row.game_session_id = p_game_session_id
    and thread_row.created_by_type = 'player'
    and thread_row.created_by_player_id = p_player_id
    and thread_row.creation_idempotency_key = v_key
  for update;
  if found then
    if v_existing.creation_fingerprint <> v_fingerprint then
      raise exception 'PLAYER_MESSAGE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    select * into v_message
    from public.messages as message_row
    where message_row.game_session_id = p_game_session_id
      and message_row.thread_id = v_existing.id
      and message_row.sender_player_id = p_player_id
      and message_row.idempotency_key = v_key || ':initial';
    return query select 'replayed'::text, v_existing.public_thread_id,
      v_message.public_message_id, v_existing.title, v_recipient_identifier,
      v_existing.created_at;
    return;
  end if;

  insert into public.message_threads (
    game_session_id, thread_type, title, allow_player_replies, status,
    retention_until, created_by_type, created_by_player_id,
    creation_idempotency_key, creation_fingerprint
  ) values (
    p_game_session_id, 'player', v_title, true, 'active',
    now() + make_interval(days => coalesce(v_policy.default_retention_days, 365)),
    'player', p_player_id, v_key, v_fingerprint
  ) returning * into v_thread;

  insert into public.message_thread_participants (thread_id, game_session_id, player_id)
  values
    (v_thread.id, p_game_session_id, p_player_id),
    (v_thread.id, p_game_session_id, v_recipient.id);

  v_initial_created_at := clock_timestamp();

  insert into public.messages (
    thread_id, game_session_id, sender_type, sender_player_id, body, idempotency_key,
    created_at, updated_at
  ) values (
    v_thread.id, p_game_session_id, 'player', p_player_id, v_body, v_key || ':initial',
    v_initial_created_at, v_initial_created_at
  ) returning * into v_message;

  update public.message_threads set updated_at = v_message.created_at
  where id = v_thread.id and game_session_id = p_game_session_id;

  insert into public.notifications (
    game_session_id, source_type, source_id, notification_type, title, summary,
    priority, display_mode, payload, published_at
  ) values (
    p_game_session_id, 'message', v_message.public_message_id,
    'message_received', v_thread.title,
    'New message from ' || coalesce(v_sender.display_name, 'Player') || '.',
    'normal', 'inbox',
    jsonb_build_object('threadId', v_thread.public_thread_id, 'messageId', v_message.public_message_id),
    v_message.created_at
  ) returning id into v_notification_id;

  insert into public.notification_deliveries (
    notification_id, game_session_id, player_id, delivered_at
  ) values (
    v_notification_id, p_game_session_id, v_recipient.id, v_message.created_at
  ) on conflict (notification_id, player_id) do nothing;

  return query select 'applied'::text, v_thread.public_thread_id,
    v_message.public_message_id, v_thread.title, v_recipient_identifier,
    v_thread.created_at;
end;
$function$;

alter table public.message_moderation_audit
  add column participant_reference text null;

alter table public.message_moderation_audit
  drop constraint message_moderation_audit_action_valid,
  add constraint message_moderation_audit_action_valid check (
    action in (
      'create_thread',
      'disable_thread',
      'enable_thread',
      'close_thread',
      'hide_message',
      'unhide_message',
      'delete_thread',
      'add_participant',
      'remove_participant'
    )
  ),
  add constraint message_moderation_audit_participant_reference_valid check (
    (
      action in ('add_participant', 'remove_participant')
      and participant_reference is not null
      and length(btrim(participant_reference)) between 1 and 160
      and participant_reference = btrim(participant_reference)
      and participant_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
      and participant_reference !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    or (
      action not in ('add_participant', 'remove_participant')
      and participant_reference is null
    )
  );

create or replace function public.change_admin_message_participant_atomic_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_thread_public_id text,
  p_participant_reference text,
  p_action text,
  p_reason text,
  p_idempotency_key text
)
returns table (
  participant_outcome text,
  action_id text,
  thread_id text,
  participant_reference text,
  participant_action text,
  participant_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_thread_key text := btrim(coalesce(p_thread_public_id, ''));
  v_participant_key text := btrim(coalesce(p_participant_reference, ''));
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_thread public.message_threads%rowtype;
  v_player public.players%rowtype;
  v_existing public.message_moderation_audit%rowtype;
  v_audit public.message_moderation_audit%rowtype;
  v_count integer;
  v_is_participant boolean;
begin
  if p_game_session_id is null
    or p_staff_user_id is null
    or v_thread_key !~ '^thr_[0-9a-f]{32}$'
    or v_participant_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    or v_participant_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v_action not in ('add_participant', 'remove_participant')
    or (v_action = 'remove_participant' and v_reason is null)
    or length(coalesce(v_reason, '')) > 1000
    or coalesce(v_reason, '') ~ '[[:cntrl:]]'
    or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  then
    raise exception 'ADMIN_MESSAGE_PARTICIPANT_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.game_sessions as game_row
    where game_row.id = p_game_session_id
      and game_row.owner_staff_user_id = p_staff_user_id
  ) then
    raise exception 'ADMIN_MESSAGES_SCOPE_FORBIDDEN' using errcode = 'P0001';
  end if;

  select audit_row.* into v_existing
  from public.message_moderation_audit as audit_row
  where audit_row.game_session_id = p_game_session_id
    and audit_row.staff_user_id = p_staff_user_id
    and audit_row.idempotency_key = v_key
  for update;

  if found then
    if v_existing.action <> v_action
      or v_existing.thread_public_id <> v_thread_key
      or v_existing.participant_reference <> v_participant_key
      or coalesce(v_existing.reason, '') <> coalesce(v_reason, '')
    then
      raise exception 'ADMIN_MESSAGE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    select count(*)::integer into v_count
    from public.message_thread_participants as participant_row
    where participant_row.game_session_id = p_game_session_id
      and participant_row.thread_id = v_existing.thread_id;

    return query select
      'replayed'::text,
      v_existing.public_action_id,
      v_existing.thread_public_id,
      v_existing.participant_reference,
      v_existing.action,
      v_count,
      v_existing.created_at;
    return;
  end if;

  select thread_row.* into v_thread
  from public.message_threads as thread_row
  where thread_row.game_session_id = p_game_session_id
    and thread_row.public_thread_id = v_thread_key
  for update;

  if not found then
    raise exception 'ADMIN_MESSAGE_THREAD_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_thread.status = 'closed' then
    raise exception 'ADMIN_MESSAGE_THREAD_LOCKED' using errcode = 'P0001';
  end if;
  if v_thread.retention_until <= now() then
    raise exception 'ADMIN_MESSAGE_RETENTION_EXPIRED' using errcode = 'P0001';
  end if;

  select player_row.* into v_player
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.player_identifier = v_participant_key
    and player_row.status = 'active'
  for share;

  if not found then
    raise exception 'ADMIN_MESSAGE_PARTICIPANT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.message_thread_participants as participant_row
    where participant_row.game_session_id = p_game_session_id
      and participant_row.thread_id = v_thread.id
      and participant_row.player_id = v_player.id
  ) into v_is_participant;

  select count(*)::integer into v_count
  from public.message_thread_participants as participant_row
  where participant_row.game_session_id = p_game_session_id
    and participant_row.thread_id = v_thread.id;

  if v_action = 'add_participant' then
    if not v_is_participant and v_count >= 500 then
      raise exception 'ADMIN_MESSAGE_PARTICIPANT_LIMIT' using errcode = 'P0001';
    end if;
    insert into public.message_thread_participants (
      thread_id, game_session_id, player_id, joined_at, last_read_at
    ) values (
      v_thread.id, p_game_session_id, v_player.id, now(), null
    ) on conflict (thread_id, player_id) do nothing;
  else
    if not v_is_participant then
      raise exception 'ADMIN_MESSAGE_PARTICIPANT_NOT_FOUND' using errcode = 'P0001';
    end if;
    if v_count <= 1 then
      raise exception 'ADMIN_MESSAGE_LAST_PARTICIPANT' using errcode = 'P0001';
    end if;
    delete from public.message_thread_participants as participant_row
    where participant_row.game_session_id = p_game_session_id
      and participant_row.thread_id = v_thread.id
      and participant_row.player_id = v_player.id;
  end if;

  update public.message_threads
  set updated_at = now()
  where game_session_id = p_game_session_id and id = v_thread.id;

  select count(*)::integer into v_count
  from public.message_thread_participants as participant_row
  where participant_row.game_session_id = p_game_session_id
    and participant_row.thread_id = v_thread.id;

  insert into public.message_moderation_audit (
    game_session_id,
    thread_id,
    staff_user_id,
    action,
    reason,
    idempotency_key,
    participant_reference
  ) values (
    p_game_session_id,
    v_thread.id,
    p_staff_user_id,
    v_action,
    v_reason,
    v_key,
    v_participant_key
  ) returning * into v_audit;

  return query select
    'applied'::text,
    v_audit.public_action_id,
    v_thread.public_thread_id,
    v_participant_key,
    v_action,
    v_count,
    v_audit.created_at;
end;
$function$;

revoke all on function public.read_player_message_policy_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_player_message_thread_atomic_v1(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.change_admin_message_participant_atomic_v1(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.read_player_message_policy_v1(uuid, uuid) to service_role;
grant execute on function public.create_player_message_thread_atomic_v1(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.change_admin_message_participant_atomic_v1(uuid, uuid, text, text, text, text, text) to service_role;

comment on function public.create_player_message_thread_atomic_v1(uuid, uuid, text, text, text, text) is
  'Creates a same-game two-player thread using the stable active Player status interface and public Player identifiers.';
comment on function public.change_admin_message_participant_atomic_v1(uuid, uuid, text, text, text, text, text) is
  'Owner-scoped, per-thread serialized, idempotent participant addition and removal with public-ID-only immutable audit evidence.';

-- Folded private Player read hardening; retained in assigned Messaging slot four.
create or replace function public.private_player_message_thread_payload_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_thread_id uuid,
  p_joined_at timestamptz,
  p_last_read_at timestamptz,
  p_message_limit integer
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $function$
  select jsonb_build_object(
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
  )
  from public.message_threads as thread_row
  cross join lateral (
    select count(*)::integer as participant_count
    from public.message_thread_participants as participant_count_row
    where participant_count_row.game_session_id = p_game_session_id
      and participant_count_row.thread_id = p_thread_id
  ) as participant_values
  cross join lateral (
    select count(*)::integer as unread_count
    from public.messages as unread_message
    where unread_message.game_session_id = p_game_session_id
      and unread_message.thread_id = p_thread_id
      and unread_message.hidden_at is null
      and unread_message.sender_player_id is distinct from p_player_id
      and unread_message.created_at > coalesce(p_last_read_at, p_joined_at)
  ) as unread_values
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
        and message_row.thread_id = p_thread_id
      order by message_row.created_at desc, message_row.public_message_id desc
      limit p_message_limit
    ) as message_payload
  ) as message_values
  where thread_row.game_session_id = p_game_session_id
    and thread_row.id = p_thread_id;
$function$;

create or replace function public.read_player_messages_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_thread_limit integer default 25,
  p_message_limit integer default 50,
  p_query text default null,
  p_before_updated_at timestamptz default null,
  p_before_thread_public_id text default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $function$
declare
  v_query text := nullif(btrim(p_query), '');
  v_result jsonb;
begin
  if p_game_session_id is null
    or p_player_id is null
    or p_thread_limit is null or p_thread_limit not between 1 and 50
    or p_message_limit is null or p_message_limit not between 1 and 100
    or (v_query is not null and (
      length(v_query) > 100
      or v_query ~ E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
    ))
    or ((p_before_updated_at is null) <> (p_before_thread_public_id is null))
    or (p_before_thread_public_id is not null and p_before_thread_public_id !~ '^thr_[0-9a-f]{32}$')
  then
    raise exception 'PLAYER_MESSAGES_READ_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.players as player_row
    where player_row.id = p_player_id
      and player_row.game_session_id = p_game_session_id
      and player_row.status = 'active'
  ) then
    raise exception 'PLAYER_MESSAGES_SCOPE_FORBIDDEN' using errcode = 'P0001';
  end if;

  with eligible_threads as (
    select
      thread_row.id,
      thread_row.public_thread_id,
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
      and (
        v_query is null
        or position(lower(v_query) in lower(thread_row.title)) > 0
        or position(lower(v_query) in lower(coalesce(thread_row.contract_key, ''))) > 0
        or exists (
          select 1
          from public.messages as search_message
          left join public.players as search_player
            on search_player.game_session_id = search_message.game_session_id
            and search_player.id = search_message.sender_player_id
          left join public.staff_users as search_staff
            on search_staff.id = search_message.sender_staff_user_id
          where search_message.game_session_id = p_game_session_id
            and search_message.thread_id = thread_row.id
            and search_message.hidden_at is null
            and (
              position(lower(v_query) in lower(search_message.body)) > 0
              or position(lower(v_query) in lower(coalesce(search_player.display_name, ''))) > 0
              or position(lower(v_query) in lower(coalesce(search_player.player_identifier, ''))) > 0
              or position(lower(v_query) in lower(coalesce(search_staff.display_name, ''))) > 0
            )
        )
      )
      and (
        p_before_updated_at is null
        or (thread_row.updated_at, thread_row.public_thread_id)
          < (p_before_updated_at, p_before_thread_public_id)
      )
  ),
  paged_threads as (
    select
      eligible_threads.*,
      row_number() over (
        order by eligible_threads.updated_at desc, eligible_threads.public_thread_id desc
      ) as ordinal
    from eligible_threads
    order by eligible_threads.updated_at desc, eligible_threads.public_thread_id desc
    limit p_thread_limit + 1
  ),
  rendered_threads as (
    select
      paged_threads.ordinal,
      paged_threads.updated_at,
      paged_threads.public_thread_id,
      public.private_player_message_thread_payload_v1(
        p_game_session_id,
        p_player_id,
        paged_threads.id,
        paged_threads.joined_at,
        paged_threads.last_read_at,
        p_message_limit
      ) as payload
    from paged_threads
    where paged_threads.ordinal <= p_thread_limit
  ),
  global_unread as (
    select count(*)::integer as unread_count
    from public.message_thread_participants as global_participant
    join public.message_threads as global_thread
      on global_thread.game_session_id = global_participant.game_session_id
      and global_thread.id = global_participant.thread_id
    join public.messages as global_message
      on global_message.game_session_id = global_participant.game_session_id
      and global_message.thread_id = global_participant.thread_id
    where global_participant.game_session_id = p_game_session_id
      and global_participant.player_id = p_player_id
      and global_thread.retention_until > now()
      and global_message.hidden_at is null
      and global_message.sender_player_id is distinct from p_player_id
      and global_message.created_at > coalesce(global_participant.last_read_at, global_participant.joined_at)
  )
  select jsonb_build_object(
    'unreadCount', coalesce((select unread_count from global_unread), 0),
    'pageUnreadCount', coalesce(sum((rendered_threads.payload ->> 'unreadCount')::integer), 0),
    'nextCursor', case
      when exists (select 1 from paged_threads where ordinal = p_thread_limit + 1)
      then (
        select to_char(last_row.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
          || '|' || last_row.public_thread_id
        from rendered_threads as last_row
        order by last_row.ordinal desc
        limit 1
      )
      else null
    end,
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
    jsonb_build_object(
      'unreadCount', 0,
      'pageUnreadCount', 0,
      'nextCursor', null,
      'threads', '[]'::jsonb
    )
  );
end;
$function$;

create or replace function public.read_player_message_thread_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_thread_public_id text,
  p_message_limit integer default 100
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $function$
declare
  v_thread_id uuid;
  v_joined_at timestamptz;
  v_last_read_at timestamptz;
  v_payload jsonb;
begin
  if p_game_session_id is null
    or p_player_id is null
    or p_thread_public_id is null
    or p_thread_public_id !~ '^thr_[0-9a-f]{32}$'
    or p_message_limit is null or p_message_limit not between 1 and 100
  then
    raise exception 'PLAYER_MESSAGE_THREAD_READ_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.players as player_row
    where player_row.id = p_player_id
      and player_row.game_session_id = p_game_session_id
      and player_row.status = 'active'
  ) then
    raise exception 'PLAYER_MESSAGES_SCOPE_FORBIDDEN' using errcode = 'P0001';
  end if;

  select
    thread_row.id,
    participant_row.joined_at,
    participant_row.last_read_at
  into
    v_thread_id,
    v_joined_at,
    v_last_read_at
  from public.message_thread_participants as participant_row
  join public.message_threads as thread_row
    on thread_row.game_session_id = participant_row.game_session_id
    and thread_row.id = participant_row.thread_id
  where participant_row.game_session_id = p_game_session_id
    and participant_row.player_id = p_player_id
    and thread_row.public_thread_id = p_thread_public_id
    and thread_row.retention_until > now();

  if v_thread_id is null then
    raise exception 'PLAYER_MESSAGE_THREAD_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_payload := public.private_player_message_thread_payload_v1(
    p_game_session_id,
    p_player_id,
    v_thread_id,
    v_joined_at,
    v_last_read_at,
    p_message_limit
  );

  if v_payload is null then
    raise exception 'PLAYER_MESSAGE_THREAD_NOT_FOUND' using errcode = 'P0001';
  end if;

  return v_payload;
end;
$function$;

revoke all on function public.private_player_message_thread_payload_v1(uuid, uuid, uuid, timestamptz, timestamptz, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.read_player_messages_v2(uuid, uuid, integer, integer, text, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.read_player_message_thread_v1(uuid, uuid, text, integer)
  from public, anon, authenticated;

grant execute on function public.read_player_messages_v2(uuid, uuid, integer, integer, text, timestamptz, text)
  to service_role;
grant execute on function public.read_player_message_thread_v1(uuid, uuid, text, integer)
  to service_role;

comment on function public.read_player_messages_v2(uuid, uuid, integer, integer, text, timestamptz, text) is
  'Returns participant-scoped Messaging threads with database-side search, deterministic cursor pagination and a full-inbox unread total.';
comment on function public.read_player_message_thread_v1(uuid, uuid, text, integer) is
  'Returns one exact participant-scoped public Messaging thread without bounded-inbox false negatives.';

commit;
