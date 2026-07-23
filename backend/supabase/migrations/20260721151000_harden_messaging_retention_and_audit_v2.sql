begin;

alter table public.message_moderation_audit
  add column thread_public_id text,
  add column message_public_id text,
  add column deleted_message_count integer not null default 0;

update public.message_moderation_audit as audit_row
set
  thread_public_id = (
    select thread_row.public_thread_id
    from public.message_threads as thread_row
    where thread_row.game_session_id = audit_row.game_session_id
      and thread_row.id = audit_row.thread_id
  ),
  message_public_id = case
    when audit_row.message_id is null then null
    else (
      select message_row.public_message_id
      from public.messages as message_row
      where message_row.game_session_id = audit_row.game_session_id
        and message_row.id = audit_row.message_id
    )
  end;

alter table public.message_moderation_audit
  alter column thread_public_id set not null,
  add constraint message_moderation_audit_thread_public_id_format
    check (thread_public_id ~ '^thr_[0-9a-f]{32}$'),
  add constraint message_moderation_audit_message_public_id_format
    check (message_public_id is null or message_public_id ~ '^msg_[0-9a-f]{32}$'),
  add constraint message_moderation_audit_deleted_message_count_valid
    check (deleted_message_count >= 0),
  drop constraint message_moderation_audit_thread_scope_fk,
  drop constraint message_moderation_audit_message_scope_fk,
  drop constraint message_moderation_audit_action_valid,
  add constraint message_moderation_audit_action_valid check (
    action in (
      'create_thread',
      'disable_thread',
      'enable_thread',
      'close_thread',
      'hide_message',
      'unhide_message',
      'delete_thread'
    )
  );

create index message_moderation_audit_public_thread_created_idx
  on public.message_moderation_audit (
    game_session_id,
    thread_public_id,
    created_at desc,
    public_action_id desc
  );

create or replace function public.capture_message_moderation_audit_identity_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_thread_public_id text;
  v_message_public_id text;
begin
  select thread_row.public_thread_id
  into v_thread_public_id
  from public.message_threads as thread_row
  where thread_row.game_session_id = new.game_session_id
    and thread_row.id = new.thread_id;

  if v_thread_public_id is null then
    raise exception 'MESSAGE_AUDIT_THREAD_NOT_FOUND' using errcode = 'P0001';
  end if;

  if new.message_id is not null then
    select message_row.public_message_id
    into v_message_public_id
    from public.messages as message_row
    where message_row.game_session_id = new.game_session_id
      and message_row.thread_id = new.thread_id
      and message_row.id = new.message_id;

    if v_message_public_id is null then
      raise exception 'MESSAGE_AUDIT_MESSAGE_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  new.thread_public_id := v_thread_public_id;
  new.message_public_id := v_message_public_id;
  return new;
end;
$function$;

create or replace function public.refuse_message_moderation_audit_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  raise exception 'MESSAGE_MODERATION_AUDIT_IMMUTABLE' using errcode = 'P0001';
end;
$function$;

create trigger capture_message_moderation_audit_identity_v1
before insert on public.message_moderation_audit
for each row execute function public.capture_message_moderation_audit_identity_v1();

create trigger refuse_message_moderation_audit_mutation_v1
before update or delete on public.message_moderation_audit
for each row execute function public.refuse_message_moderation_audit_mutation_v1();

create or replace function public.delete_expired_admin_message_thread_atomic_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_thread_public_id text,
  p_reason text,
  p_idempotency_key text
)
returns table (
  deletion_outcome text,
  action_id text,
  thread_id text,
  deleted_message_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_thread public.message_threads%rowtype;
  v_existing public.message_moderation_audit%rowtype;
  v_audit public.message_moderation_audit%rowtype;
  v_deleted_message_count integer;
begin
  if p_game_session_id is null
    or p_staff_user_id is null
    or p_thread_public_id is null
    or p_thread_public_id !~ '^thr_[0-9a-f]{32}$'
    or p_reason is null
    or length(btrim(p_reason)) not between 1 and 1000
    or p_reason ~ '[[:cntrl:]]'
    or p_idempotency_key is null
    or length(p_idempotency_key) not between 1 and 128
    or p_idempotency_key <> btrim(p_idempotency_key)
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  then
    raise exception 'ADMIN_MESSAGE_RETENTION_DELETE_INVALID' using errcode = 'P0001';
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
  into v_existing
  from public.message_moderation_audit as audit_row
  where audit_row.game_session_id = p_game_session_id
    and audit_row.staff_user_id = p_staff_user_id
    and audit_row.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.action <> 'delete_thread'
      or v_existing.thread_public_id <> p_thread_public_id
      or coalesce(v_existing.reason, '') <> btrim(p_reason)
    then
      raise exception 'ADMIN_MESSAGE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    return query
    select
      'replayed'::text,
      v_existing.public_action_id,
      v_existing.thread_public_id,
      v_existing.deleted_message_count,
      v_existing.created_at;
    return;
  end if;

  select thread_row.*
  into v_thread
  from public.message_threads as thread_row
  where thread_row.game_session_id = p_game_session_id
    and thread_row.public_thread_id = p_thread_public_id
  for update;

  if not found then
    raise exception 'ADMIN_MESSAGE_THREAD_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_thread.retention_until > now() then
    raise exception 'ADMIN_MESSAGE_RETENTION_NOT_EXPIRED' using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_deleted_message_count
  from public.messages as message_row
  where message_row.game_session_id = p_game_session_id
    and message_row.thread_id = v_thread.id;

  insert into public.message_moderation_audit (
    game_session_id,
    thread_id,
    staff_user_id,
    action,
    reason,
    idempotency_key,
    deleted_message_count
  ) values (
    p_game_session_id,
    v_thread.id,
    p_staff_user_id,
    'delete_thread',
    btrim(p_reason),
    p_idempotency_key,
    v_deleted_message_count
  )
  returning * into v_audit;

  delete from public.message_threads as thread_row
  where thread_row.game_session_id = p_game_session_id
    and thread_row.id = v_thread.id;

  return query
  select
    'applied'::text,
    v_audit.public_action_id,
    v_audit.thread_public_id,
    v_audit.deleted_message_count,
    v_audit.created_at;
end;
$function$;

revoke all on function public.capture_message_moderation_audit_identity_v1() from public, anon, authenticated;
revoke all on function public.refuse_message_moderation_audit_mutation_v1() from public, anon, authenticated;
revoke all on function public.delete_expired_admin_message_thread_atomic_v1(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.delete_expired_admin_message_thread_atomic_v1(uuid, uuid, text, text, text) to service_role;

comment on column public.message_moderation_audit.thread_public_id is
  'Immutable public thread identity retained after message content deletion.';
comment on column public.message_moderation_audit.message_public_id is
  'Immutable public message identity retained after message content deletion.';
comment on function public.delete_expired_admin_message_thread_atomic_v1(uuid, uuid, text, text, text) is
  'Owner-scoped, idempotent deletion of expired message content while preserving immutable typed audit evidence.';

commit;
