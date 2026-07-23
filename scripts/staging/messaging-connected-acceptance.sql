\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

begin;

set local statement_timeout = '90s';
set local lock_timeout = '10s';

create temporary table messaging_acceptance_baseline on commit drop as
select
  (select count(*) from public.message_threads) as message_threads,
  (select count(*) from public.message_thread_participants) as participants,
  (select count(*) from public.messages) as messages,
  (select count(*) from public.message_moderation_audit) as moderation_audit,
  (select count(*) from public.notifications where source_type = 'message') as notifications;

do $acceptance$
declare
  v_game_id uuid;
  v_staff_id uuid;
  v_player_a uuid;
  v_player_b uuid;
  v_player_b_reference text;
  v_created record;
  v_replayed record;
  v_sent record;
  v_send_replayed record;
  v_receipt record;
  v_moderation record;
  v_exact jsonb;
  v_inbox jsonb;
  v_policy jsonb;
begin
  select
    game_row.id,
    game_row.owner_staff_user_id,
    player_a.id,
    player_b.id,
    player_b.player_identifier
  into
    v_game_id,
    v_staff_id,
    v_player_a,
    v_player_b,
    v_player_b_reference
  from public.game_sessions as game_row
  join lateral (
    select player_row.id, player_row.player_identifier
    from public.players as player_row
    where player_row.game_session_id = game_row.id
      and player_row.status = 'active'
      and player_row.player_identifier is not null
      and player_row.player_identifier !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    order by player_row.id
    limit 1
  ) as player_a on true
  join lateral (
    select player_row.id, player_row.player_identifier
    from public.players as player_row
    where player_row.game_session_id = game_row.id
      and player_row.status = 'active'
      and player_row.id <> player_a.id
      and player_row.player_identifier is not null
      and player_row.player_identifier !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    order by player_row.id
    limit 1
  ) as player_b on true
  where game_row.status = 'active'
    and game_row.owner_staff_user_id is not null
  order by game_row.created_at desc nulls last, game_row.id
  limit 1;

  if v_game_id is null then
    raise exception 'MESSAGING_ACCEPTANCE_FIXTURE_UNAVAILABLE';
  end if;

  select public.read_player_message_policy_v1(v_game_id, v_player_a)
  into v_policy;
  if coalesce((v_policy ->> 'attachmentsEnabled')::boolean, true) then
    raise exception 'MESSAGING_ACCEPTANCE_ATTACHMENTS_ENABLED';
  end if;

  insert into public.message_game_policies (
    game_session_id,
    player_threads_enabled,
    attachments_enabled,
    default_retention_days,
    updated_by_staff_user_id
  ) values (
    v_game_id,
    true,
    false,
    365,
    v_staff_id
  )
  on conflict (game_session_id) do update
  set player_threads_enabled = true,
      attachments_enabled = false,
      default_retention_days = 365,
      updated_by_staff_user_id = excluded.updated_by_staff_user_id,
      updated_at = now();

  select * into v_created
  from public.create_player_message_thread_atomic_v1(
    v_game_id,
    v_player_a,
    v_player_b_reference,
    'Messaging exact-head transactional acceptance',
    'Initial transactional acceptance message.',
    'messaging-acceptance:create'
  );
  if v_created.create_outcome <> 'applied'
    or v_created.thread_id !~ '^thr_[0-9a-f]{32}$'
    or v_created.message_id !~ '^msg_[0-9a-f]{32}$'
  then
    raise exception 'MESSAGING_ACCEPTANCE_CREATE_FAILED';
  end if;

  select * into v_replayed
  from public.create_player_message_thread_atomic_v1(
    v_game_id,
    v_player_a,
    v_player_b_reference,
    'Messaging exact-head transactional acceptance',
    'Initial transactional acceptance message.',
    'messaging-acceptance:create'
  );
  if v_replayed.create_outcome <> 'replayed'
    or v_replayed.thread_id <> v_created.thread_id
    or v_replayed.message_id <> v_created.message_id
  then
    raise exception 'MESSAGING_ACCEPTANCE_CREATE_REPLAY_FAILED';
  end if;

  begin
    perform public.create_player_message_thread_atomic_v1(
      v_game_id,
      v_player_a,
      v_player_b_reference,
      'Conflicting title',
      'Initial transactional acceptance message.',
      'messaging-acceptance:create'
    );
    raise exception 'MESSAGING_ACCEPTANCE_EXPECTED_IDEMPOTENCY_CONFLICT';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%PLAYER_MESSAGE_IDEMPOTENCY_CONFLICT%' then
        raise;
      end if;
  end;

  v_exact := public.read_player_message_thread_v1(
    v_game_id,
    v_player_b,
    v_created.thread_id,
    100
  );
  if v_exact ->> 'id' <> v_created.thread_id then
    raise exception 'MESSAGING_ACCEPTANCE_EXACT_READ_FAILED';
  end if;

  v_inbox := public.read_player_messages_v2(
    v_game_id,
    v_player_b,
    1,
    100,
    'transactional acceptance',
    null,
    null
  );
  if coalesce((v_inbox ->> 'unreadCount')::integer, 0) < 1
    or coalesce((v_inbox ->> 'pageUnreadCount')::integer, 0) < 1
    or not coalesce(v_inbox -> 'threads', '[]'::jsonb) @>
      jsonb_build_array(jsonb_build_object('id', v_created.thread_id))
  then
    raise exception 'MESSAGING_ACCEPTANCE_DATABASE_SEARCH_FAILED';
  end if;

  select * into v_sent
  from public.send_player_message_atomic_v1(
    v_game_id,
    v_player_a,
    v_created.thread_id,
    'Transactional replay-safe follow-up.',
    'messaging-acceptance:send'
  );
  if v_sent.send_outcome <> 'applied' or v_sent.message_id !~ '^msg_[0-9a-f]{32}$' then
    raise exception 'MESSAGING_ACCEPTANCE_SEND_FAILED';
  end if;

  select * into v_send_replayed
  from public.send_player_message_atomic_v1(
    v_game_id,
    v_player_a,
    v_created.thread_id,
    'Transactional replay-safe follow-up.',
    'messaging-acceptance:send'
  );
  if v_send_replayed.send_outcome <> 'replayed'
    or v_send_replayed.message_id <> v_sent.message_id
  then
    raise exception 'MESSAGING_ACCEPTANCE_SEND_REPLAY_FAILED';
  end if;

  select * into v_receipt
  from public.mark_player_message_thread_read_v1(
    v_game_id,
    v_player_b,
    v_created.thread_id,
    now()
  );
  if v_receipt.unread_count <> 0 then
    raise exception 'MESSAGING_ACCEPTANCE_READ_RECEIPT_FAILED';
  end if;

  select * into v_moderation
  from public.moderate_admin_message_atomic_v2(
    v_game_id,
    v_staff_id,
    v_created.thread_id,
    v_sent.message_id,
    'hide_message',
    'Transactional moderation acceptance.',
    'messaging-acceptance:hide'
  );
  if not v_moderation.message_hidden then
    raise exception 'MESSAGING_ACCEPTANCE_HIDE_FAILED';
  end if;

  select * into v_moderation
  from public.moderate_admin_message_atomic_v2(
    v_game_id,
    v_staff_id,
    v_created.thread_id,
    v_sent.message_id,
    'unhide_message',
    null,
    'messaging-acceptance:unhide'
  );
  if v_moderation.message_hidden then
    raise exception 'MESSAGING_ACCEPTANCE_UNHIDE_FAILED';
  end if;

  select * into v_moderation
  from public.moderate_admin_message_atomic_v2(
    v_game_id,
    v_staff_id,
    v_created.thread_id,
    null,
    'disable_thread',
    'Transactional disable acceptance.',
    'messaging-acceptance:disable'
  );
  if v_moderation.thread_status <> 'disabled' then
    raise exception 'MESSAGING_ACCEPTANCE_DISABLE_FAILED';
  end if;

  begin
    perform public.send_player_message_atomic_v1(
      v_game_id,
      v_player_a,
      v_created.thread_id,
      'This send must fail while disabled.',
      'messaging-acceptance:disabled-send'
    );
    raise exception 'MESSAGING_ACCEPTANCE_EXPECTED_DISABLED_DENIAL';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%PLAYER_MESSAGE_THREAD_DISABLED%' then
        raise;
      end if;
  end;

  select * into v_moderation
  from public.moderate_admin_message_atomic_v2(
    v_game_id,
    v_staff_id,
    v_created.thread_id,
    null,
    'enable_thread',
    null,
    'messaging-acceptance:enable'
  );
  if v_moderation.thread_status <> 'active' then
    raise exception 'MESSAGING_ACCEPTANCE_ENABLE_FAILED';
  end if;

  select * into v_moderation
  from public.moderate_admin_message_atomic_v2(
    v_game_id,
    v_staff_id,
    v_created.thread_id,
    null,
    'close_thread',
    'Transactional close acceptance.',
    'messaging-acceptance:close'
  );
  if v_moderation.thread_status <> 'closed' then
    raise exception 'MESSAGING_ACCEPTANCE_CLOSE_FAILED';
  end if;
end;
$acceptance$;

rollback;

select jsonb_build_object(
  'schemaVersion', 1,
  'connectedMessagingAcceptance', 'passed',
  'transactionRolledBack', true,
  'rawInternalIdentifiersRecorded', false,
  'credentialsRecorded', false,
  'productionTouched', false,
  'checks', 14
)::text;
