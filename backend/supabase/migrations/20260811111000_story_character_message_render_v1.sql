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
    'storyCharacterKey', thread_row.story_character_key,
    'storyCharacterName', thread_row.story_character_name,
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
            when thread_row.story_character_name is not null then thread_row.story_character_name
            else 'System'
          end,
          'senderReference', case
            when message_row.sender_type = 'player'
              and player_sender.player_identifier is not null
              and player_sender.player_identifier !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then player_sender.player_identifier
            when message_row.sender_type = 'system' and thread_row.story_character_key is not null
              then thread_row.story_character_key
            else null
          end,
          'body', case when message_row.hidden_at is null then message_row.body else 'Message removed by an administrator.' end,
          'moderated', message_row.hidden_at is not null,
          'self', message_row.sender_type = 'player' and message_row.sender_player_id = p_player_id,
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

revoke all on function public.private_player_message_thread_payload_v1(uuid, uuid, uuid, timestamptz, timestamptz, integer)
  from public, anon, authenticated, service_role;

commit;
