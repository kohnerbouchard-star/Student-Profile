begin;

create table public.message_game_policies (
  game_session_id uuid primary key references public.game_sessions(id) on delete cascade,
  player_threads_enabled boolean not null default true,
  max_player_thread_participants integer not null default 2,
  default_retention_days integer not null default 365,
  attachments_enabled boolean not null default false,
  updated_by_staff_user_id uuid null references public.staff_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_game_policies_participants_valid check (max_player_thread_participants between 2 and 20),
  constraint message_game_policies_retention_valid check (default_retention_days between 1 and 730),
  constraint message_game_policies_attachments_disabled check (attachments_enabled = false)
);

alter table public.message_game_policies enable row level security;
alter table public.message_game_policies force row level security;
revoke all privileges on table public.message_game_policies from public, anon, authenticated;
grant select, insert, update on table public.message_game_policies to service_role;

alter table public.message_threads
  add column created_by_player_id uuid null,
  add column creation_idempotency_key text null,
  add column creation_fingerprint text null;

alter table public.message_threads
  drop constraint message_threads_creator_valid,
  add constraint message_threads_creator_valid check (
    (created_by_type = 'staff_user' and created_by_staff_user_id is not null and created_by_player_id is null)
    or (created_by_type = 'system' and created_by_staff_user_id is null and created_by_player_id is null)
    or (created_by_type = 'player' and created_by_staff_user_id is null and created_by_player_id is not null)
  ),
  add constraint message_threads_player_creator_scope_fk
    foreign key (game_session_id, created_by_player_id)
    references public.players(game_session_id, id)
    on delete cascade,
  add constraint message_threads_creation_idempotency_valid check (
    creation_idempotency_key is null
    or (
      length(creation_idempotency_key) between 1 and 128
      and creation_idempotency_key = btrim(creation_idempotency_key)
      and creation_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    )
  ),
  add constraint message_threads_creation_fingerprint_valid check (
    creation_fingerprint is null or creation_fingerprint ~ '^[0-9a-f]{32}$'
  );

create unique index message_threads_player_creation_idempotency_unique
  on public.message_threads (game_session_id, created_by_player_id, creation_idempotency_key)
  where created_by_type = 'player' and creation_idempotency_key is not null;

create or replace function public.validate_message_contract_thread_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.thread_type = 'contract' and not exists (
    select 1
    from public.game_session_contracts as contract_row
    where contract_row.game_session_id = new.game_session_id
      and contract_row.contract_key = new.contract_key
  ) then
    raise exception 'MESSAGE_CONTRACT_NOT_FOUND' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

create trigger validate_message_contract_thread_v1
before insert or update of thread_type, contract_key, game_session_id
on public.message_threads
for each row execute function public.validate_message_contract_thread_v1();

create or replace function public.protect_message_content_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.public_message_id is distinct from old.public_message_id
    or new.thread_id is distinct from old.thread_id
    or new.game_session_id is distinct from old.game_session_id
    or new.sender_type is distinct from old.sender_type
    or new.sender_player_id is distinct from old.sender_player_id
    or new.sender_staff_user_id is distinct from old.sender_staff_user_id
    or new.body is distinct from old.body
    or new.idempotency_key is distinct from old.idempotency_key
    or new.created_at is distinct from old.created_at
  then
    raise exception 'MESSAGE_CONTENT_IMMUTABLE' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

create trigger protect_message_content_v1
before update on public.messages
for each row execute function public.protect_message_content_v1();

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
      and player_row.archived_at is null
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
begin
  if p_game_session_id is null
    or p_player_id is null
    or v_recipient_identifier !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    or v_recipient_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or length(v_title) not between 1 and 160
    or length(v_body) not between 1 and 1000
    or v_title ~ '[[:cntrl:]]'
    or v_body ~ E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
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
    and player_row.archived_at is null
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
    and player_row.archived_at is null
  for share;
  if not found or v_recipient.id = p_player_id then
    raise exception 'PLAYER_MESSAGE_RECIPIENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_fingerprint := md5(v_recipient.id::text || E'\\000' || v_title || E'\\000' || v_body);

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

  insert into public.messages (
    thread_id, game_session_id, sender_type, sender_player_id, body, idempotency_key
  ) values (
    v_thread.id, p_game_session_id, 'player', p_player_id, v_body, v_key || ':initial'
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

create or replace function public.read_admin_message_policy_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid
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
  if not exists (
    select 1 from public.game_sessions as game_row
    where game_row.id = p_game_session_id
      and game_row.owner_staff_user_id = p_staff_user_id
  ) then
    raise exception 'ADMIN_MESSAGES_SCOPE_FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into v_policy from public.message_game_policies
  where game_session_id = p_game_session_id;
  return jsonb_build_object(
    'playerThreadsEnabled', coalesce(v_policy.player_threads_enabled, true),
    'maxParticipants', coalesce(v_policy.max_player_thread_participants, 2),
    'defaultRetentionDays', coalesce(v_policy.default_retention_days, 365),
    'attachmentsEnabled', false,
    'updatedAt', v_policy.updated_at
  );
end;
$function$;

create or replace function public.set_admin_message_policy_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_player_threads_enabled boolean,
  p_default_retention_days integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_policy public.message_game_policies%rowtype;
begin
  if p_player_threads_enabled is null
    or p_default_retention_days is null
    or p_default_retention_days not between 1 and 730
    or not exists (
      select 1 from public.game_sessions as game_row
      where game_row.id = p_game_session_id
        and game_row.owner_staff_user_id = p_staff_user_id
    )
  then
    raise exception 'ADMIN_MESSAGE_POLICY_INVALID' using errcode = 'P0001';
  end if;

  insert into public.message_game_policies (
    game_session_id, player_threads_enabled, default_retention_days,
    attachments_enabled, updated_by_staff_user_id, updated_at
  ) values (
    p_game_session_id, p_player_threads_enabled, p_default_retention_days,
    false, p_staff_user_id, now()
  )
  on conflict (game_session_id) do update set
    player_threads_enabled = excluded.player_threads_enabled,
    default_retention_days = excluded.default_retention_days,
    attachments_enabled = false,
    updated_by_staff_user_id = excluded.updated_by_staff_user_id,
    updated_at = excluded.updated_at
  returning * into v_policy;

  return jsonb_build_object(
    'playerThreadsEnabled', v_policy.player_threads_enabled,
    'maxParticipants', v_policy.max_player_thread_participants,
    'defaultRetentionDays', v_policy.default_retention_days,
    'attachmentsEnabled', false,
    'updatedAt', v_policy.updated_at
  );
end;
$function$;

create or replace function public.moderate_admin_message_atomic_v2(
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
  v_existing public.message_moderation_audit%rowtype;
  v_thread public.message_threads%rowtype;
  v_message public.messages%rowtype;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_thread_key text := btrim(coalesce(p_thread_public_id, ''));
  v_message_key text := nullif(btrim(coalesce(p_message_public_id, '')), '');
begin
  select * into v_existing
  from public.message_moderation_audit as audit_row
  where audit_row.game_session_id = p_game_session_id
    and audit_row.staff_user_id = p_staff_user_id
    and audit_row.idempotency_key = btrim(coalesce(p_idempotency_key, ''));

  if found then
    if v_existing.action <> v_action
      or v_existing.thread_public_id <> v_thread_key
      or coalesce(v_existing.message_public_id, '') <> coalesce(v_message_key, '')
      or coalesce(v_existing.reason, '') <> coalesce(v_reason, '')
    then
      raise exception 'ADMIN_MESSAGE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    select * into v_thread from public.message_threads
    where game_session_id = p_game_session_id and public_thread_id = v_thread_key;
    if v_message_key is not null then
      select * into v_message from public.messages
      where game_session_id = p_game_session_id
        and thread_id = v_thread.id
        and public_message_id = v_message_key;
    end if;

    return query select 'replayed'::text, v_existing.public_action_id,
      v_existing.thread_public_id, v_existing.message_public_id,
      v_existing.action, coalesce(v_thread.status, 'deleted'),
      coalesce(v_message.hidden_at is not null, false), v_existing.created_at;
    return;
  end if;

  return query select * from public.moderate_admin_message_atomic_v1(
    p_game_session_id, p_staff_user_id, p_thread_public_id,
    p_message_public_id, p_action, p_reason, p_idempotency_key
  );
end;
$function$;

revoke all on function public.validate_message_contract_thread_v1() from public, anon, authenticated;
revoke all on function public.protect_message_content_v1() from public, anon, authenticated;
revoke all on function public.read_player_message_policy_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_player_message_thread_atomic_v1(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.read_admin_message_policy_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_admin_message_policy_v1(uuid, uuid, boolean, integer) from public, anon, authenticated;
revoke all on function public.moderate_admin_message_atomic_v2(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;

grant execute on function public.read_player_message_policy_v1(uuid, uuid) to service_role;
grant execute on function public.create_player_message_thread_atomic_v1(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.read_admin_message_policy_v1(uuid, uuid) to service_role;
grant execute on function public.set_admin_message_policy_v1(uuid, uuid, boolean, integer) to service_role;
grant execute on function public.moderate_admin_message_atomic_v2(uuid, uuid, text, text, text, text, text) to service_role;

comment on table public.message_game_policies is
  'Game-scoped Messaging policy. Attachments are intentionally disabled until a separately approved safe storage lifecycle exists.';
comment on function public.create_player_message_thread_atomic_v1(uuid, uuid, text, text, text, text) is
  'Creates an idempotent same-game two-player thread from session-derived ownership and a public recipient Player identifier.';
comment on function public.moderate_admin_message_atomic_v2(uuid, uuid, text, text, text, text, text) is
  'Strict moderation command wrapper that permits only exact idempotent replay and rejects conflicting terminal payloads.';

commit;
