begin;

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
      and player_row.archived_at is null
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
      and player_row.archived_at is null
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
