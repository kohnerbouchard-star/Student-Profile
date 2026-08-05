begin;

create schema if not exists private;

create table private.admin_mutation_requests (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references public.staff_users(id) on delete restrict,
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  operation text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  status text not null default 'started',
  response_status integer null,
  response_body jsonb null,
  target_type text null,
  target_id uuid null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,

  constraint admin_mutation_requests_staff_key_unique
    unique (staff_user_id, idempotency_key),
  constraint admin_mutation_requests_operation_valid
    check (operation ~ '^[a-z][a-z0-9_.-]{2,79}$'),
  constraint admin_mutation_requests_idempotency_key_valid
    check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'),
  constraint admin_mutation_requests_fingerprint_valid
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint admin_mutation_requests_status_valid
    check (status in ('started', 'completed')),
  constraint admin_mutation_requests_response_object
    check (response_body is null or jsonb_typeof(response_body) = 'object'),
  constraint admin_mutation_requests_completion_valid
    check (
      (status = 'started' and response_status is null and response_body is null and completed_at is null)
      or
      (status = 'completed' and response_status between 200 and 299 and response_body is not null and completed_at is not null)
    ),
  constraint admin_mutation_requests_target_valid
    check (target_id is null or nullif(btrim(target_type), '') is not null)
);

create index admin_mutation_requests_game_created_idx
  on private.admin_mutation_requests (game_session_id, created_at desc);

alter table private.admin_mutation_requests enable row level security;
alter table private.admin_mutation_requests force row level security;

revoke all on table private.admin_mutation_requests
  from public, anon, authenticated, service_role;

comment on table private.admin_mutation_requests is
  'Private Staff Admin command ledger. Binds one stable key to one normalized request and caches only completed transactional results.';
comment on column private.admin_mutation_requests.request_fingerprint is
  'SHA-256 of the server-selected operation, game scope, and normalized meaningful request payload; transient request IDs and the key itself are excluded.';

create or replace function private.assert_admin_game_owned_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
begin
  if p_game_session_id is null or p_staff_user_id is null or not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
      and game_row.owner_staff_user_id = p_staff_user_id
  ) then
    raise exception 'ADMIN_MUTATION_GAME_NOT_OWNED' using errcode = 'P0001';
  end if;
end;
$function$;

create or replace function private.admin_mutation_fingerprint_v1(
  p_game_session_id uuid,
  p_operation text,
  p_request_payload jsonb
)
returns text
language sql
immutable
strict
set search_path = public, private, extensions, pg_temp
as $function$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'gameSessionId', p_game_session_id,
          'operation', p_operation,
          'payload', p_request_payload
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$function$;

create or replace function private.begin_admin_mutation_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_request_payload jsonb
)
returns table (
  response_status integer,
  response_body jsonb,
  was_replayed boolean
)
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $function$
declare
  v_operation text := btrim(coalesce(p_operation, ''));
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_payload jsonb := coalesce(p_request_payload, '{}'::jsonb);
  v_fingerprint text;
  v_existing private.admin_mutation_requests%rowtype;
begin
  perform private.assert_admin_game_owned_v1(
    p_game_session_id,
    p_staff_user_id
  );

  if v_operation !~ '^[a-z][a-z0-9_.-]{2,79}$'
     or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
     or jsonb_typeof(v_payload) <> 'object' then
    raise exception 'ADMIN_MUTATION_IDEMPOTENCY_INVALID' using errcode = 'P0001';
  end if;

  v_fingerprint := private.admin_mutation_fingerprint_v1(
    p_game_session_id,
    v_operation,
    v_payload
  );

  perform pg_advisory_xact_lock(
    hashtextextended(p_staff_user_id::text || ':' || v_key, 260805)
  );

  select *
  into v_existing
  from private.admin_mutation_requests as request_row
  where request_row.staff_user_id = p_staff_user_id
    and request_row.idempotency_key = v_key
  for update;

  if found then
    if v_existing.game_session_id <> p_game_session_id
       or v_existing.operation <> v_operation
       or v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'ADMIN_MUTATION_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    if v_existing.status <> 'completed'
       or v_existing.response_status is null
       or v_existing.response_body is null then
      raise exception 'ADMIN_MUTATION_IDEMPOTENCY_IN_PROGRESS' using errcode = 'P0001';
    end if;

    return query
    select
      v_existing.response_status,
      v_existing.response_body,
      true;
    return;
  end if;

  insert into private.admin_mutation_requests (
    staff_user_id,
    game_session_id,
    operation,
    idempotency_key,
    request_fingerprint
  ) values (
    p_staff_user_id,
    p_game_session_id,
    v_operation,
    v_key,
    v_fingerprint
  );

  return query select null::integer, null::jsonb, false;
end;
$function$;

create or replace function private.complete_admin_mutation_v1(
  p_staff_user_id uuid,
  p_idempotency_key text,
  p_response_status integer,
  p_response_body jsonb,
  p_audit_action text,
  p_target_type text,
  p_target_id uuid,
  p_audit_metadata jsonb default '{}'::jsonb
)
returns table (
  response_status integer,
  response_body jsonb,
  was_replayed boolean
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_request private.admin_mutation_requests%rowtype;
  v_action text := btrim(coalesce(p_audit_action, ''));
  v_target_type text := btrim(coalesce(p_target_type, ''));
  v_metadata jsonb := coalesce(p_audit_metadata, '{}'::jsonb);
begin
  if p_response_status not between 200 and 299
     or jsonb_typeof(p_response_body) <> 'object'
     or v_action = ''
     or v_target_type = ''
     or jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'ADMIN_MUTATION_COMPLETION_INVALID' using errcode = 'P0001';
  end if;

  select *
  into v_request
  from private.admin_mutation_requests as request_row
  where request_row.staff_user_id = p_staff_user_id
    and request_row.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
    and request_row.status = 'started'
  for update;

  if not found then
    raise exception 'ADMIN_MUTATION_COMPLETION_MISSING' using errcode = 'P0001';
  end if;

  insert into public.audit_log (
    game_session_id,
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    v_request.game_session_id,
    'staff_user',
    p_staff_user_id,
    v_action,
    v_target_type,
    p_target_id,
    v_metadata || jsonb_build_object('operation', v_request.operation)
  );

  update private.admin_mutation_requests as request_row
  set status = 'completed',
      response_status = p_response_status,
      response_body = p_response_body,
      target_type = v_target_type,
      target_id = p_target_id,
      completed_at = now()
  where request_row.id = v_request.id;

  return query select p_response_status, p_response_body, false;
end;
$function$;

create or replace function private.lock_attendance_day_mutation_v1(
  p_game_session_id uuid,
  p_attendance_date date
)
returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $function$
begin
  if p_game_session_id is null or p_attendance_date is null then
    raise exception 'ADMIN_ATTENDANCE_DAY_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'admin-attendance-day:' || p_game_session_id::text || ':' || p_attendance_date::text,
      260805
    )
  );
end;
$function$;

create or replace function private.lock_attendance_day_mutation_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, pg_temp
as $function$
declare
  v_old_scope text;
  v_new_scope text;
begin
  if tg_op = 'DELETE' then
    perform private.lock_attendance_day_mutation_v1(
      old.game_session_id,
      old.attendance_date
    );
    return old;
  end if;

  if tg_op = 'INSERT' then
    perform private.lock_attendance_day_mutation_v1(
      new.game_session_id,
      new.attendance_date
    );
    return new;
  end if;

  if old.game_session_id = new.game_session_id
     and old.attendance_date = new.attendance_date then
    perform private.lock_attendance_day_mutation_v1(
      new.game_session_id,
      new.attendance_date
    );
    return new;
  end if;

  v_old_scope := old.game_session_id::text || ':' || old.attendance_date::text;
  v_new_scope := new.game_session_id::text || ':' || new.attendance_date::text;
  if v_old_scope < v_new_scope then
    perform private.lock_attendance_day_mutation_v1(
      old.game_session_id,
      old.attendance_date
    );
    perform private.lock_attendance_day_mutation_v1(
      new.game_session_id,
      new.attendance_date
    );
  else
    perform private.lock_attendance_day_mutation_v1(
      new.game_session_id,
      new.attendance_date
    );
    perform private.lock_attendance_day_mutation_v1(
      old.game_session_id,
      old.attendance_date
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists serialize_attendance_day_mutations_v1
  on public.attendance_day_locks;
create trigger serialize_attendance_day_mutations_v1
before insert or update or delete on public.attendance_day_locks
for each row
execute function private.lock_attendance_day_mutation_trigger_v1();

revoke all on function private.assert_admin_game_owned_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.admin_mutation_fingerprint_v1(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.begin_admin_mutation_v1(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.complete_admin_mutation_v1(uuid, text, integer, jsonb, text, text, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.lock_attendance_day_mutation_v1(uuid, date)
  from public, anon, authenticated, service_role;
revoke all on function private.lock_attendance_day_mutation_trigger_v1()
  from public, anon, authenticated, service_role;

comment on function private.lock_attendance_day_mutation_v1(uuid, date) is
  'Serializes attendance records and attendance-day lock changes for one Game and calendar date until the surrounding transaction completes.';
comment on function private.lock_attendance_day_mutation_trigger_v1() is
  'Private attendance_day_locks trigger boundary that acquires the shared attendance-day transaction lock.';

-- The existing Player clock-in RPC bundled the attendance mutation with a
-- Player-authored audit event. Admin scanner calls need the same transactional
-- attendance/reward behavior, but every resulting audit event must retain the
-- authenticated Staff identity. Keep one private core and expose distinct,
-- tightly-scoped entrypoints instead of copying the mutation into Admin API.
create or replace function private.record_attendance_clock_in_core_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_attendance_date date,
  p_status text,
  p_reward_amount numeric,
  p_currency_code text,
  p_request_id text,
  p_actor_type text,
  p_actor_id uuid,
  p_request_source text,
  p_write_attendance_audit boolean
)
returns table (
  attendance_id uuid,
  attendance_status text,
  attendance_date date,
  clocked_in_at timestamptz,
  was_created boolean,
  ledger_entry_id uuid,
  reward_amount numeric,
  currency_code text
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_player public.players%rowtype;
  v_attendance public.player_attendance_records%rowtype;
  v_existing public.player_attendance_records%rowtype;
  v_ledger_entry_id uuid := null;
  v_status text := btrim(coalesce(p_status, 'present'));
  v_currency_code text := upper(btrim(coalesce(p_currency_code, 'ECO')));
  v_actor_type text := btrim(coalesce(p_actor_type, ''));
  v_request_source text := btrim(coalesce(p_request_source, ''));
begin
  if p_game_session_id is null then
    raise exception 'GAME_SESSION_REQUIRED' using errcode = 'P0001';
  end if;
  if p_player_id is null then
    raise exception 'PLAYER_REQUIRED' using errcode = 'P0001';
  end if;
  if p_attendance_date is null then
    raise exception 'ATTENDANCE_DATE_REQUIRED' using errcode = 'P0001';
  end if;
  if v_status not in ('present', 'late') then
    raise exception 'INVALID_ATTENDANCE_STATUS' using errcode = 'P0001';
  end if;
  if p_reward_amount is null or p_reward_amount < 0 then
    raise exception 'INVALID_REWARD_AMOUNT' using errcode = 'P0001';
  end if;
  if length(v_currency_code) < 3 or length(v_currency_code) > 16 then
    raise exception 'INVALID_CURRENCY_CODE' using errcode = 'P0001';
  end if;
  if v_actor_type not in ('staff_user', 'player') or p_actor_id is null then
    raise exception 'ATTENDANCE_ACTOR_INVALID' using errcode = 'P0001';
  end if;
  if v_actor_type = 'player' and p_actor_id <> p_player_id then
    raise exception 'ATTENDANCE_PLAYER_ACTOR_INVALID' using errcode = 'P0001';
  end if;
  if v_request_source = '' or length(v_request_source) > 128 then
    raise exception 'ATTENDANCE_REQUEST_SOURCE_INVALID' using errcode = 'P0001';
  end if;

  select player_row.*
  into v_player
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active';

  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.player_attendance_records (
    game_session_id,
    player_id,
    attendance_date,
    status,
    clocked_in_at,
    source
  ) values (
    p_game_session_id,
    p_player_id,
    p_attendance_date,
    v_status,
    now(),
    'player_clock_in'
  )
  on conflict on constraint player_attendance_records_scope_unique
  do nothing
  returning * into v_attendance;

  if v_attendance.id is null then
    select attendance_row.*
    into v_existing
    from public.player_attendance_records as attendance_row
    where attendance_row.game_session_id = p_game_session_id
      and attendance_row.player_id = p_player_id
      and attendance_row.attendance_date = p_attendance_date;

    return query
    select
      v_existing.id,
      v_existing.status,
      v_existing.attendance_date,
      v_existing.clocked_in_at,
      false,
      null::uuid,
      0::numeric,
      v_currency_code;
    return;
  end if;

  if p_reward_amount > 0 then
    select result.ledger_entry_id
    into v_ledger_entry_id
    from public.record_player_ledger_entry(
      p_game_session_id,
      p_player_id,
      'cash',
      p_reward_amount,
      v_currency_code,
      'credit',
      'attendance',
      case when v_actor_type = 'staff_user'
        then 'staff_scan_reward'
        else 'player_clock_in_reward'
      end,
      v_attendance.id,
      v_actor_type,
      p_actor_id,
      jsonb_build_object(
        'requestId', p_request_id,
        'attendance_id', v_attendance.id,
        'attendance_date', v_attendance.attendance_date,
        'source', v_request_source
      )
    ) as result;
  end if;

  if p_write_attendance_audit then
    insert into public.audit_log (
      game_session_id,
      actor_type,
      actor_id,
      action,
      target_type,
      target_id,
      metadata
    ) values (
      p_game_session_id,
      v_actor_type,
      p_actor_id,
      'attendance.player_clock_in',
      'player_attendance_record',
      v_attendance.id,
      jsonb_build_object(
        'requestId', p_request_id,
        'attendance_date', v_attendance.attendance_date,
        'status', v_attendance.status,
        'reward_amount', p_reward_amount,
        'currency_code', v_currency_code,
        'ledger_entry_id', v_ledger_entry_id,
        'source', v_request_source
      )
    );
  end if;

  return query
  select
    v_attendance.id,
    v_attendance.status,
    v_attendance.attendance_date,
    v_attendance.clocked_in_at,
    true,
    v_ledger_entry_id,
    p_reward_amount,
    v_currency_code;
end;
$function$;

revoke all on function private.record_attendance_clock_in_core_v1(
  uuid, uuid, date, text, numeric, text, text, text, uuid, text, boolean
) from public, anon, authenticated, service_role;

create or replace function public.record_player_attendance_clock_in(
  p_game_session_id uuid,
  p_player_id uuid,
  p_attendance_date date,
  p_status text default 'present',
  p_reward_amount numeric default 0,
  p_currency_code text default 'ECO',
  p_request_id text default null
)
returns table (
  attendance_id uuid,
  attendance_status text,
  attendance_date date,
  clocked_in_at timestamptz,
  was_created boolean,
  ledger_entry_id uuid,
  reward_amount numeric,
  currency_code text
)
language sql
security definer
set search_path = public, private, pg_temp
as $function$
  select *
  from private.record_attendance_clock_in_core_v1(
    p_game_session_id,
    p_player_id,
    p_attendance_date,
    p_status,
    p_reward_amount,
    p_currency_code,
    p_request_id,
    'player',
    p_player_id,
    'classroom_api_edge_player_attendance_clock_in',
    true
  )
$function$;

revoke all on function public.record_player_attendance_clock_in(
  uuid, uuid, date, text, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.record_player_attendance_clock_in(
  uuid, uuid, date, text, numeric, text, text
) to service_role;

comment on function private.record_attendance_clock_in_core_v1(
  uuid, uuid, date, text, numeric, text, text, text, uuid, text, boolean
) is
  'Private transactional attendance/reward core shared by Player and Staff entrypoints while retaining the authenticated audit actor.';
comment on function public.record_player_attendance_clock_in(
  uuid, uuid, date, text, numeric, text, text
) is
  'Records an idempotent Player-authored attendance clock-in and optional reward through the shared private core.';

create or replace function public.admin_read_mutation_replay_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_request_payload jsonb
)
returns table (
  has_replay boolean,
  response_status integer,
  response_body jsonb
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_operation text := btrim(coalesce(p_operation, ''));
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_payload jsonb := coalesce(p_request_payload, '{}'::jsonb);
  v_fingerprint text;
  v_existing private.admin_mutation_requests%rowtype;
begin
  perform private.assert_admin_game_owned_v1(
    p_game_session_id,
    p_staff_user_id
  );
  if v_operation !~ '^[a-z][a-z0-9_.-]{2,79}$'
     or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
     or jsonb_typeof(v_payload) <> 'object' then
    raise exception 'ADMIN_MUTATION_IDEMPOTENCY_INVALID' using errcode = 'P0001';
  end if;

  v_fingerprint := private.admin_mutation_fingerprint_v1(
    p_game_session_id,
    v_operation,
    v_payload
  );
  select *
  into v_existing
  from private.admin_mutation_requests as request_row
  where request_row.staff_user_id = p_staff_user_id
    and request_row.idempotency_key = v_key;

  if not found then
    return query select false, null::integer, null::jsonb;
    return;
  end if;
  if v_existing.game_session_id <> p_game_session_id
     or v_existing.operation <> v_operation
     or v_existing.request_fingerprint <> v_fingerprint then
    raise exception 'ADMIN_MUTATION_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;
  if v_existing.status <> 'completed'
     or v_existing.response_status is null
     or v_existing.response_body is null then
    raise exception 'ADMIN_MUTATION_IDEMPOTENCY_IN_PROGRESS' using errcode = 'P0001';
  end if;

  return query select true, v_existing.response_status, v_existing.response_body;
end;
$function$;

create or replace function public.admin_create_player_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_display_name text,
  p_roster_label text,
  p_player_identifier text,
  p_player_identifier_normalized text,
  p_lookup_digest text,
  p_credential_version text,
  p_credential_salt text,
  p_credential_verifier text,
  p_credential_iterations integer,
  p_request_payload jsonb,
  p_idempotency_key text,
  p_request_id text
)
returns table (
  response_status integer,
  response_body jsonb,
  was_replayed boolean
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_claim record;
  v_created record;
  v_identity record;
  v_player public.players%rowtype;
  v_body jsonb;
begin
  select * into v_claim
  from private.begin_admin_mutation_v1(
    p_game_session_id,
    p_staff_user_id,
    'players.create',
    p_idempotency_key,
    p_request_payload
  );
  if v_claim.was_replayed then
    return query select v_claim.response_status, v_claim.response_body, true;
    return;
  end if;

  select *
  into v_created
  from public.create_player_with_balanced_country_assignment(
    p_game_session_id,
    p_display_name,
    p_roster_label,
    jsonb_build_object(
      'route', 'staff.players.create',
      'requestedByStaffUserId', p_staff_user_id,
      'identityMode', 'rfid_player_id_plus_access_code_v2'
    )
  );

  if v_created.player_id is null then
    raise exception 'ADMIN_PLAYER_CREATE_FAILED' using errcode = 'P0001';
  end if;

  select *
  into v_identity
  from public.set_player_identity_and_access_credential_v2(
    p_game_session_id,
    v_created.player_id,
    p_player_identifier,
    p_player_identifier_normalized,
    p_lookup_digest,
    p_credential_version,
    p_credential_salt,
    p_credential_verifier,
    p_credential_iterations
  );

  select player_row.*
  into v_player
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = v_created.player_id;

  if v_identity.player_id is null or v_player.id is null
     or v_identity.credential_created_at is null then
    raise exception 'ADMIN_PLAYER_CREATE_FAILED' using errcode = 'P0001';
  end if;

  v_body := jsonb_build_object('player', jsonb_build_object(
    'player_id', v_player.id,
    'display_name', v_player.display_name,
    'roster_label', v_player.roster_label,
    'player_identifier', v_player.player_identifier,
    'player_status', v_player.status,
    'player_created_at', v_player.created_at,
    'player_updated_at', v_player.updated_at,
    'credential_created_at', v_identity.credential_created_at
  ));
  return query
  select * from private.complete_admin_mutation_v1(
    p_staff_user_id,
    p_idempotency_key,
    201,
    v_body,
    'players.created',
    'player',
    v_player.id,
    jsonb_build_object(
      'requestId', nullif(btrim(coalesce(p_request_id, '')), ''),
      'rosterLabel', p_roster_label
    )
  );
end;
$function$;

create or replace function public.admin_archive_player_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_player_id uuid,
  p_request_payload jsonb,
  p_idempotency_key text,
  p_request_id text
)
returns table (
  response_status integer,
  response_body jsonb,
  was_replayed boolean
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_claim record;
  v_player public.players%rowtype;
  v_previous_status text;
  v_archived_at timestamptz := now();
begin
  select * into v_claim
  from private.begin_admin_mutation_v1(
    p_game_session_id,
    p_staff_user_id,
    'players.archive',
    p_idempotency_key,
    p_request_payload
  );
  if v_claim.was_replayed then
    return query select v_claim.response_status, v_claim.response_body, true;
    return;
  end if;

  select player_row.*
  into v_player
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
  for update;

  if not found then
    raise exception 'ADMIN_PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;
  v_previous_status := v_player.status;

  update public.players as player_row
  set status = 'archived',
      updated_at = v_archived_at
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
  returning player_row.* into v_player;

  update public.player_access_credentials as credential_row
  set status = 'revoked',
      revoked_at = coalesce(credential_row.revoked_at, v_archived_at),
      updated_at = v_archived_at
  where credential_row.game_session_id = p_game_session_id
    and credential_row.player_id = p_player_id
    and credential_row.status = 'active';

  update public.player_sessions as session_row
  set status = 'revoked',
      revoked_at = coalesce(session_row.revoked_at, v_archived_at),
      updated_at = v_archived_at
  where session_row.game_session_id = p_game_session_id
    and session_row.player_id = p_player_id
    and session_row.status = 'active';

  return query
  select * from private.complete_admin_mutation_v1(
    p_staff_user_id,
    p_idempotency_key,
    200,
    jsonb_build_object(
      'archived', true,
      'destructiveDelete', false,
      'alreadyArchived', v_previous_status = 'archived',
      'player', to_jsonb(v_player)
    ),
    'players.player_archived',
    'player',
    p_player_id,
    jsonb_build_object(
      'requestId', nullif(btrim(coalesce(p_request_id, '')), ''),
      'previousStatus', v_previous_status
    )
  );
end;
$function$;

create or replace function public.admin_mutate_store_item_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_operation text,
  p_item_id uuid,
  p_item_payload jsonb,
  p_request_payload jsonb,
  p_idempotency_key text,
  p_request_id text
)
returns table (
  response_status integer,
  response_body jsonb,
  was_replayed boolean
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_operation text := lower(btrim(coalesce(p_operation, '')));
  v_payload jsonb := coalesce(p_item_payload, '{}'::jsonb);
  v_claim record;
  v_item jsonb;
  v_item_uuid uuid;
  v_status integer;
  v_action text;
begin
  if v_operation not in ('create', 'update', 'archive', 'restock', 'rebalance')
     or jsonb_typeof(v_payload) <> 'object' then
    raise exception 'ADMIN_STORE_OPERATION_INVALID' using errcode = 'P0001';
  end if;

  select * into v_claim
  from private.begin_admin_mutation_v1(
    p_game_session_id,
    p_staff_user_id,
    'store.' || v_operation,
    p_idempotency_key,
    p_request_payload
  );
  if v_claim.was_replayed then
    return query select v_claim.response_status, v_claim.response_body, true;
    return;
  end if;

  if v_operation = 'create' then
    begin
      insert into public.store_items (
        game_session_id,
        item_key,
        name,
        description,
        category,
        price,
        currency_code,
        stock_quantity,
        status,
        visibility,
        sort_order
      ) values (
        p_game_session_id,
        v_payload->>'itemKey',
        v_payload->>'name',
        nullif(btrim(coalesce(v_payload->>'description', '')), ''),
        v_payload->>'category',
        (v_payload->>'price')::numeric,
        v_payload->>'currencyCode',
        (v_payload->>'stockQuantity')::integer,
        v_payload->>'status',
        v_payload->>'visibility',
        (v_payload->>'sortOrder')::integer
      )
      returning id into v_item_uuid;
    exception when unique_violation then
      raise exception 'ADMIN_STORE_ITEM_CONFLICT' using errcode = 'P0001';
    end;
    v_status := 201;
    v_action := 'store.item_created';
  elsif v_operation = 'archive' then
    update public.store_items as item_row
    set status = 'archived',
        visibility = 'hidden',
        updated_at = now()
    where item_row.game_session_id = p_game_session_id
      and item_row.id = p_item_id
    returning item_row.id into v_item_uuid;
    v_status := 200;
    v_action := 'store.item_archived';
  elsif v_operation = 'restock' then
    if not (v_payload ? 'quantity')
       or jsonb_typeof(v_payload->'quantity') <> 'number'
       or (v_payload->>'quantity')::numeric <= 0
       or trunc((v_payload->>'quantity')::numeric) <> (v_payload->>'quantity')::numeric then
      raise exception 'ADMIN_STORE_RESTOCK_QUANTITY_INVALID' using errcode = 'P0001';
    end if;
    update public.store_items as item_row
    set stock_quantity = item_row.stock_quantity + (v_payload->>'quantity')::integer,
        updated_at = now()
    where item_row.game_session_id = p_game_session_id
      and item_row.id = p_item_id
    returning item_row.id into v_item_uuid;
    v_status := 200;
    v_action := 'store.item_restocked';
  elsif v_operation = 'rebalance' then
    if not (v_payload ? 'price')
       or jsonb_typeof(v_payload->'price') <> 'number'
       or (v_payload->>'price')::numeric < 0 then
      raise exception 'ADMIN_STORE_REBALANCE_PRICE_INVALID' using errcode = 'P0001';
    end if;
    update public.store_items as item_row
    set price = (v_payload->>'price')::numeric,
        updated_at = now()
    where item_row.game_session_id = p_game_session_id
      and item_row.id = p_item_id
    returning item_row.id into v_item_uuid;
    v_status := 200;
    v_action := 'store.item_price_rebalanced';
  else
    update public.store_items as item_row
    set name = case when v_payload ? 'name' then v_payload->>'name' else item_row.name end,
        description = case when v_payload ? 'description'
          then nullif(btrim(coalesce(v_payload->>'description', '')), '')
          else item_row.description end,
        category = case when v_payload ? 'category' then v_payload->>'category' else item_row.category end,
        price = case when v_payload ? 'price' then (v_payload->>'price')::numeric else item_row.price end,
        currency_code = case when v_payload ? 'currencyCode' then v_payload->>'currencyCode' else item_row.currency_code end,
        stock_quantity = case when v_payload ? 'stockQuantity' then (v_payload->>'stockQuantity')::integer else item_row.stock_quantity end,
        status = case when v_payload ? 'status' then v_payload->>'status' else item_row.status end,
        visibility = case when v_payload ? 'visibility' then v_payload->>'visibility' else item_row.visibility end,
        sort_order = case when v_payload ? 'sortOrder' then (v_payload->>'sortOrder')::integer else item_row.sort_order end,
        updated_at = now()
    where item_row.game_session_id = p_game_session_id
      and item_row.id = p_item_id
    returning item_row.id into v_item_uuid;
    v_status := 200;
    v_action := 'store.item_updated';
  end if;

  if v_item_uuid is null then
    raise exception 'ADMIN_STORE_ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  select to_jsonb(item_row)
  into v_item
  from public.store_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.id = v_item_uuid;

  return query
  select * from private.complete_admin_mutation_v1(
    p_staff_user_id,
    p_idempotency_key,
    v_status,
    case when v_operation = 'restock'
      then jsonb_build_object(
        'item', v_item,
        'quantityAdded', (v_payload->>'quantity')::integer
      )
      else jsonb_build_object('item', v_item)
    end,
    v_action,
    'store_item',
    v_item_uuid,
    jsonb_build_object(
      'requestId', nullif(btrim(coalesce(p_request_id, '')), ''),
      'changedFields', coalesce(
        (select jsonb_agg(field_name order by field_name)
         from jsonb_object_keys(v_payload) as fields(field_name)),
        '[]'::jsonb
      )
    )
  );
end;
$function$;

create or replace function public.admin_mutate_contract_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_operation text,
  p_contract_id uuid,
  p_contract_payload jsonb,
  p_request_payload jsonb,
  p_idempotency_key text,
  p_request_id text
)
returns table (
  response_status integer,
  response_body jsonb,
  was_replayed boolean
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_operation text := lower(btrim(coalesce(p_operation, '')));
  v_payload jsonb := coalesce(p_contract_payload, '{}'::jsonb);
  v_claim record;
  v_contract_id uuid;
  v_contract jsonb;
  v_existing_contract public.game_session_contracts%rowtype;
  v_status integer;
  v_action text;
  v_body jsonb;
  v_already_archived boolean := false;
begin
  if v_operation not in ('create', 'publish', 'archive', 'duplicate')
     or jsonb_typeof(v_payload) <> 'object' then
    raise exception 'ADMIN_CONTRACT_OPERATION_INVALID' using errcode = 'P0001';
  end if;

  select * into v_claim
  from private.begin_admin_mutation_v1(
    p_game_session_id,
    p_staff_user_id,
    'contracts.' || v_operation,
    p_idempotency_key,
    p_request_payload
  );
  if v_claim.was_replayed then
    return query select v_claim.response_status, v_claim.response_body, true;
    return;
  end if;

  if v_operation = 'create' then
    begin
      insert into public.game_session_contracts (
        game_session_id,
        contract_template_id,
        contract_key,
        source_type,
        source_id,
        created_by_staff_id,
        title,
        description,
        instructions,
        category,
        status,
        visibility,
        targeting_payload,
        requirements_payload,
        reward_payload,
        completion_mode,
        published_at,
        deadline_at,
        expires_at,
        metadata
      ) values (
        p_game_session_id,
        nullif(v_payload->>'contractTemplateId', '')::uuid,
        v_payload->>'contractKey',
        'teacher',
        null,
        p_staff_user_id,
        v_payload->>'title',
        v_payload->>'description',
        v_payload->>'instructions',
        v_payload->>'category',
        v_payload->>'status',
        v_payload->>'visibility',
        coalesce(v_payload->'targetingPayload', '{}'::jsonb),
        coalesce(v_payload->'requirementsPayload', '{}'::jsonb),
        coalesce(v_payload->'rewardPayload', '{}'::jsonb),
        v_payload->>'completionMode',
        case when v_payload->>'status' = 'active'
          then coalesce(
            nullif(v_payload->>'publishedAt', '')::timestamptz,
            now()
          )
          else nullif(v_payload->>'publishedAt', '')::timestamptz
        end,
        nullif(v_payload->>'deadlineAt', '')::timestamptz,
        nullif(v_payload->>'expiresAt', '')::timestamptz,
        coalesce(v_payload->'metadata', '{}'::jsonb)
      )
      returning id into v_contract_id;
    exception when unique_violation then
      raise exception 'ADMIN_CONTRACT_CONFLICT' using errcode = 'P0001';
    end;
    v_status := 201;
    v_action := 'contracts.created';
  elsif v_operation = 'publish' then
    select contract_row.*
    into v_existing_contract
    from public.game_session_contracts as contract_row
    where contract_row.game_session_id = p_game_session_id
      and contract_row.id = p_contract_id
    for update;

    if not found then
      raise exception 'ADMIN_CONTRACT_NOT_FOUND' using errcode = 'P0001';
    end if;
    if v_existing_contract.status not in ('draft', 'scheduled') then
      raise exception 'ADMIN_CONTRACT_NOT_PUBLISHABLE' using errcode = 'P0001';
    end if;

    update public.game_session_contracts as contract_row
    set status = 'active',
        published_at = coalesce(
          nullif(v_payload->>'publishedAt', '')::timestamptz,
          now()
        ),
        updated_at = now()
    where contract_row.game_session_id = p_game_session_id
      and contract_row.id = p_contract_id
    returning contract_row.id into v_contract_id;
    v_status := 200;
    v_action := 'contracts.published';
  elsif v_operation = 'archive' then
    select contract_row.*
    into v_existing_contract
    from public.game_session_contracts as contract_row
    where contract_row.game_session_id = p_game_session_id
      and contract_row.id = p_contract_id
    for update;

    if not found then
      raise exception 'ADMIN_CONTRACT_NOT_FOUND' using errcode = 'P0001';
    end if;

    v_contract_id := v_existing_contract.id;
    v_already_archived := v_existing_contract.status = 'archived';
    if not v_already_archived then
      update public.game_session_contracts as contract_row
      set status = 'archived',
          updated_at = now()
      where contract_row.game_session_id = p_game_session_id
        and contract_row.id = p_contract_id;
    end if;
    v_status := 200;
    v_action := 'contracts.contract_archived';
  else
    select contract_row.*
    into v_existing_contract
    from public.game_session_contracts as contract_row
    where contract_row.game_session_id = p_game_session_id
      and contract_row.id = p_contract_id
    for share;

    if not found then
      raise exception 'ADMIN_CONTRACT_NOT_FOUND' using errcode = 'P0001';
    end if;

    begin
      insert into public.game_session_contracts (
        game_session_id,
        contract_template_id,
        contract_key,
        source_type,
        source_id,
        created_by_staff_id,
        title,
        description,
        instructions,
        category,
        status,
        visibility,
        targeting_payload,
        requirements_payload,
        reward_payload,
        completion_mode,
        published_at,
        deadline_at,
        expires_at,
        metadata
      ) values (
        p_game_session_id,
        v_existing_contract.contract_template_id,
        left(coalesce(nullif(v_existing_contract.contract_key, ''), 'contract'), 42)
          || '-copy-'
          || left(encode(extensions.digest(convert_to(p_idempotency_key, 'UTF8'), 'sha256'), 'hex'), 16),
        'teacher',
        null,
        p_staff_user_id,
        v_existing_contract.title || ' (Copy)',
        v_existing_contract.description,
        v_existing_contract.instructions,
        v_existing_contract.category,
        'draft',
        v_existing_contract.visibility,
        coalesce(v_existing_contract.targeting_payload, '{}'::jsonb),
        coalesce(v_existing_contract.requirements_payload, '{}'::jsonb),
        coalesce(v_existing_contract.reward_payload, '{}'::jsonb),
        v_existing_contract.completion_mode,
        null,
        v_existing_contract.deadline_at,
        v_existing_contract.expires_at,
        coalesce(v_existing_contract.metadata, '{}'::jsonb) || jsonb_build_object(
          'duplicatedFromContractId', p_contract_id,
          'duplicatedAt', now()
        )
      )
      returning id into v_contract_id;
    exception when unique_violation then
      raise exception 'ADMIN_CONTRACT_CONFLICT' using errcode = 'P0001';
    end;
    v_status := 201;
    v_action := 'contracts.contract_duplicated';
  end if;

  select to_jsonb(contract_row)
  into v_contract
  from public.game_session_contracts as contract_row
  where contract_row.game_session_id = p_game_session_id
    and contract_row.id = v_contract_id;

  v_body := jsonb_build_object('contract', v_contract);
  if v_operation = 'archive' then
    v_body := v_body || jsonb_build_object(
      'archived', true,
      'alreadyArchived', v_already_archived
    );
  elsif v_operation = 'duplicate' then
    v_body := v_body || jsonb_build_object(
      'duplicated', true,
      'sourceContractId', p_contract_id
    );
  end if;

  return query
  select * from private.complete_admin_mutation_v1(
    p_staff_user_id,
    p_idempotency_key,
    v_status,
    v_body,
    v_action,
    'game_session_contract',
    v_contract_id,
    jsonb_build_object(
      'requestId', nullif(btrim(coalesce(p_request_id, '')), ''),
      'status', v_contract->>'status',
      'sourceContractId', case when v_operation = 'duplicate' then p_contract_id else null end,
      'previousStatus', case when v_operation = 'archive' then v_existing_contract.status else null end
    )
  );
end;
$function$;

create or replace function public.admin_record_attendance_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_operation text,
  p_player_id uuid,
  p_attendance_date date,
  p_status text,
  p_clocked_in_at timestamptz,
  p_note text,
  p_reward_amount numeric,
  p_currency_code text,
  p_response_context jsonb,
  p_request_payload jsonb,
  p_idempotency_key text,
  p_request_id text
)
returns table (
  response_status integer,
  response_body jsonb,
  was_replayed boolean
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_operation text := lower(btrim(coalesce(p_operation, '')));
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_context jsonb := coalesce(p_response_context, '{}'::jsonb);
  v_claim record;
  v_attendance jsonb;
  v_attendance_id uuid;
begin
  if v_operation not in ('manual', 'scan')
     or p_player_id is null
     or p_attendance_date is null
     or jsonb_typeof(v_context) <> 'object' then
    raise exception 'ADMIN_ATTENDANCE_OPERATION_INVALID' using errcode = 'P0001';
  end if;

  select * into v_claim
  from private.begin_admin_mutation_v1(
    p_game_session_id,
    p_staff_user_id,
    'attendance.' || v_operation,
    p_idempotency_key,
    p_request_payload
  );
  if v_claim.was_replayed then
    return query select v_claim.response_status, v_claim.response_body, true;
    return;
  end if;

  perform private.lock_attendance_day_mutation_v1(
    p_game_session_id,
    p_attendance_date
  );

  if not exists (
    select 1 from public.players as player_row
    where player_row.game_session_id = p_game_session_id
      and player_row.id = p_player_id
      and (v_operation = 'manual' or player_row.status = 'active')
  ) then
    raise exception 'ADMIN_ATTENDANCE_PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.attendance_day_locks as lock_row
    where lock_row.game_session_id = p_game_session_id
      and lock_row.attendance_date = p_attendance_date
      and lock_row.status = 'locked'
  ) then
    raise exception 'ADMIN_ATTENDANCE_PERIOD_LOCKED' using errcode = 'P0001';
  end if;

  if v_operation = 'manual' then
    if v_status not in ('present', 'late', 'absent', 'excused') then
      raise exception 'ADMIN_ATTENDANCE_STATUS_INVALID' using errcode = 'P0001';
    end if;

    insert into public.player_attendance_records (
      game_session_id,
      player_id,
      attendance_date,
      status,
      clocked_in_at,
      source,
      note,
      corrected_by_staff_user_id,
      corrected_at
    ) values (
      p_game_session_id,
      p_player_id,
      p_attendance_date,
      v_status,
      p_clocked_in_at,
      'staff_correction',
      nullif(btrim(coalesce(p_note, '')), ''),
      p_staff_user_id,
      now()
    )
    on conflict on constraint player_attendance_records_scope_unique
    do update set
      status = excluded.status,
      clocked_in_at = excluded.clocked_in_at,
      source = excluded.source,
      note = excluded.note,
      corrected_by_staff_user_id = excluded.corrected_by_staff_user_id,
      corrected_at = excluded.corrected_at
    returning id into v_attendance_id;

    select to_jsonb(attendance_row)
    into v_attendance
    from public.player_attendance_records as attendance_row
    where attendance_row.id = v_attendance_id;
  else
    if v_status not in ('present', 'late') then
      raise exception 'ADMIN_ATTENDANCE_STATUS_INVALID' using errcode = 'P0001';
    end if;

    select to_jsonb(attendance_result)
    into v_attendance
    from private.record_attendance_clock_in_core_v1(
      p_game_session_id,
      p_player_id,
      p_attendance_date,
      v_status,
      coalesce(p_reward_amount, 0),
      upper(btrim(coalesce(p_currency_code, 'ECO'))),
      nullif(btrim(coalesce(p_request_id, '')), ''),
      'staff_user',
      p_staff_user_id,
      'admin_api_local_staff_attendance_scan',
      false
    ) as attendance_result;
    v_attendance_id := (v_attendance->>'attendance_id')::uuid;
  end if;

  if v_attendance_id is null or v_attendance is null then
    raise exception 'ADMIN_ATTENDANCE_RECORD_FAILED' using errcode = 'P0001';
  end if;

  return query
  select * from private.complete_admin_mutation_v1(
    p_staff_user_id,
    p_idempotency_key,
    200,
    jsonb_build_object('attendance', v_attendance, 'context', v_context),
    case when v_operation = 'manual'
      then 'attendance.manual_correction'
      else 'attendance.staff_scan'
    end,
    'player_attendance_record',
    v_attendance_id,
    jsonb_build_object(
      'requestId', nullif(btrim(coalesce(p_request_id, '')), ''),
      'playerId', p_player_id,
      'attendanceDate', p_attendance_date,
      'status', v_status
    )
  );
end;
$function$;

create or replace function public.admin_update_game_settings_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_game_settings_patch jsonb,
  p_difficulty_policy_patch jsonb,
  p_request_payload jsonb,
  p_idempotency_key text,
  p_request_id text
)
returns table (
  response_status integer,
  response_body jsonb,
  was_replayed boolean
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_settings_patch jsonb := coalesce(p_game_settings_patch, '{}'::jsonb);
  v_policy_patch jsonb := coalesce(p_difficulty_policy_patch, '{}'::jsonb);
  v_claim record;
  v_settings jsonb;
  v_policy jsonb := null;
  v_existing_policy public.game_difficulty_policy_settings%rowtype;
  v_policy_profile public.difficulty_policy_profiles%rowtype;
  v_baseline_preset text;
begin
  if jsonb_typeof(v_settings_patch) <> 'object'
     or jsonb_typeof(v_policy_patch) <> 'object'
     or (v_settings_patch = '{}'::jsonb and v_policy_patch = '{}'::jsonb) then
    raise exception 'ADMIN_GAME_SETTINGS_PATCH_INVALID' using errcode = 'P0001';
  end if;

  select * into v_claim
  from private.begin_admin_mutation_v1(
    p_game_session_id,
    p_staff_user_id,
    'settings.update',
    p_idempotency_key,
    p_request_payload
  );
  if v_claim.was_replayed then
    return query select v_claim.response_status, v_claim.response_body, true;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('admin-settings:' || p_game_session_id::text, 260805)
  );

  if v_settings_patch <> '{}'::jsonb then
    update public.game_settings as settings_row
    set difficulty_preset = case when v_settings_patch ? 'difficulty_preset'
          then v_settings_patch->>'difficulty_preset' else settings_row.difficulty_preset end,
        attendance_window = case when v_settings_patch ? 'attendance_window'
          then v_settings_patch->'attendance_window' else settings_row.attendance_window end,
        business_market_window = case when v_settings_patch ? 'business_market_window'
          then v_settings_patch->'business_market_window' else settings_row.business_market_window end,
        stock_market_window = case when v_settings_patch ? 'stock_market_window'
          then v_settings_patch->'stock_market_window' else settings_row.stock_market_window end,
        news_schedule = case when v_settings_patch ? 'news_schedule'
          then v_settings_patch->'news_schedule' else settings_row.news_schedule end
    where settings_row.game_session_id = p_game_session_id;
  end if;

  select to_jsonb(settings_row)
  into v_settings
  from public.game_settings as settings_row
  where settings_row.game_session_id = p_game_session_id;

  if v_settings is null then
    raise exception 'ADMIN_GAME_SETTINGS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_policy_patch <> '{}'::jsonb then
    select *
    into v_existing_policy
    from public.game_difficulty_policy_settings as existing_policy
    where existing_policy.game_session_id = p_game_session_id
    for update;

    if v_policy_patch->>'source' = 'preset' then
      select *
      into v_policy_profile
      from public.difficulty_policy_profiles as profile_row
      where profile_row.preset_key = lower(btrim(coalesce(v_policy_patch->>'difficulty_preset', '')))
        and profile_row.status = 'active';

      if v_policy_profile.id is null then
        raise exception 'ADMIN_DIFFICULTY_POLICY_PROFILE_NOT_FOUND' using errcode = 'P0001';
      end if;

      insert into public.game_difficulty_policy_settings (
        game_session_id,
        difficulty_policy_profile_id,
        difficulty_preset,
        custom_label,
        source,
        price_modifier,
        event_volatility_modifier,
        scarcity_modifier,
        income_modifier,
        trade_modifier,
        credit_modifier,
        status,
        metadata
      ) values (
        p_game_session_id,
        v_policy_profile.id,
        v_policy_profile.preset_key,
        null,
        'preset',
        v_policy_profile.price_modifier,
        v_policy_profile.event_volatility_modifier,
        v_policy_profile.scarcity_modifier,
        v_policy_profile.income_modifier,
        v_policy_profile.trade_modifier,
        v_policy_profile.credit_modifier,
        'active',
        coalesce(v_existing_policy.metadata, '{}'::jsonb)
      )
      on conflict (game_session_id) do update set
        difficulty_policy_profile_id = excluded.difficulty_policy_profile_id,
        difficulty_preset = excluded.difficulty_preset,
        custom_label = excluded.custom_label,
        source = excluded.source,
        price_modifier = excluded.price_modifier,
        event_volatility_modifier = excluded.event_volatility_modifier,
        scarcity_modifier = excluded.scarcity_modifier,
        income_modifier = excluded.income_modifier,
        trade_modifier = excluded.trade_modifier,
        credit_modifier = excluded.credit_modifier,
        status = excluded.status,
        metadata = excluded.metadata;
    elsif v_policy_patch->>'source' = 'custom' then
      if v_existing_policy.id is null then
        v_baseline_preset := lower(btrim(coalesce(v_settings->>'difficulty_preset', 'standard')));
        if v_baseline_preset = '' or v_baseline_preset = 'custom' then
          v_baseline_preset := 'standard';
        end if;

        select *
        into v_policy_profile
        from public.difficulty_policy_profiles as profile_row
        where profile_row.preset_key = v_baseline_preset
          and profile_row.status = 'active';

        if v_policy_profile.id is null then
          raise exception 'ADMIN_DIFFICULTY_POLICY_PROFILE_NOT_FOUND' using errcode = 'P0001';
        end if;
      end if;

      insert into public.game_difficulty_policy_settings (
        game_session_id,
        difficulty_policy_profile_id,
        difficulty_preset,
        custom_label,
        source,
        price_modifier,
        event_volatility_modifier,
        scarcity_modifier,
        income_modifier,
        trade_modifier,
        credit_modifier,
        status,
        metadata
      ) values (
        p_game_session_id,
        null,
        'custom',
        coalesce(nullif(btrim(v_policy_patch->>'custom_label'), ''), 'Custom'),
        'custom',
        coalesce((nullif(v_policy_patch->>'price_modifier', ''))::numeric, v_existing_policy.price_modifier, v_policy_profile.price_modifier),
        coalesce((nullif(v_policy_patch->>'event_volatility_modifier', ''))::numeric, v_existing_policy.event_volatility_modifier, v_policy_profile.event_volatility_modifier),
        coalesce((nullif(v_policy_patch->>'scarcity_modifier', ''))::numeric, v_existing_policy.scarcity_modifier, v_policy_profile.scarcity_modifier),
        coalesce((nullif(v_policy_patch->>'income_modifier', ''))::numeric, v_existing_policy.income_modifier, v_policy_profile.income_modifier),
        coalesce((nullif(v_policy_patch->>'trade_modifier', ''))::numeric, v_existing_policy.trade_modifier, v_policy_profile.trade_modifier),
        coalesce((nullif(v_policy_patch->>'credit_modifier', ''))::numeric, v_existing_policy.credit_modifier, v_policy_profile.credit_modifier),
        'active',
        coalesce(v_existing_policy.metadata, '{}'::jsonb)
      )
      on conflict (game_session_id) do update set
        difficulty_policy_profile_id = excluded.difficulty_policy_profile_id,
        difficulty_preset = excluded.difficulty_preset,
        custom_label = excluded.custom_label,
        source = excluded.source,
        price_modifier = excluded.price_modifier,
        event_volatility_modifier = excluded.event_volatility_modifier,
        scarcity_modifier = excluded.scarcity_modifier,
        income_modifier = excluded.income_modifier,
        trade_modifier = excluded.trade_modifier,
        credit_modifier = excluded.credit_modifier,
        status = excluded.status,
        metadata = excluded.metadata;
    else
      raise exception 'ADMIN_DIFFICULTY_POLICY_SOURCE_INVALID' using errcode = 'P0001';
    end if;
  end if;

  select to_jsonb(policy_row)
  into v_policy
  from public.game_difficulty_policy_settings as policy_row
  where policy_row.game_session_id = p_game_session_id;

  return query
  select * from private.complete_admin_mutation_v1(
    p_staff_user_id,
    p_idempotency_key,
    200,
    jsonb_build_object(
      'settings', v_settings,
      'difficultyPolicy', v_policy
    ),
    'settings.updated',
    'game_settings',
    (v_settings->>'id')::uuid,
    jsonb_build_object(
      'requestId', nullif(btrim(coalesce(p_request_id, '')), ''),
      'gameSettingsFields', coalesce(
        (select jsonb_agg(field_name order by field_name)
         from jsonb_object_keys(v_settings_patch) as fields(field_name)),
        '[]'::jsonb
      ),
      'difficultyPolicyChanged', v_policy_patch <> '{}'::jsonb
    )
  );
end;
$function$;

create or replace function public.admin_rotate_game_join_code_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_request_payload jsonb,
  p_idempotency_key text,
  p_request_id text
)
returns table (
  response_status integer,
  response_body jsonb,
  was_replayed boolean
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_claim record;
  v_join_code record;
begin
  select * into v_claim
  from private.begin_admin_mutation_v1(
    p_game_session_id,
    p_staff_user_id,
    'games.join-code.rotate',
    p_idempotency_key,
    p_request_payload
  );
  if v_claim.was_replayed then
    return query select v_claim.response_status, v_claim.response_body, true;
    return;
  end if;

  select *
  into v_join_code
  from public.issue_game_join_code_v1(
    p_game_session_id,
    p_staff_user_id
  );

  if v_join_code.game_join_code is null
     or v_join_code.game_join_code_status <> 'active'
     or v_join_code.updated_at is null then
    raise exception 'ADMIN_GAME_JOIN_CODE_ROTATION_FAILED' using errcode = 'P0001';
  end if;

  return query
  select * from private.complete_admin_mutation_v1(
    p_staff_user_id,
    p_idempotency_key,
    200,
    jsonb_build_object('joinCode', to_jsonb(v_join_code)),
    'game.join_code_rotated',
    'game_session',
    p_game_session_id,
    jsonb_build_object(
      'requestId', nullif(btrim(coalesce(p_request_id, '')), '')
    )
  );
end;
$function$;

revoke all on function public.admin_create_player_v1(uuid, uuid, text, text, text, text, text, text, text, text, integer, jsonb, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_read_mutation_replay_v1(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.admin_archive_player_v1(uuid, uuid, uuid, jsonb, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_mutate_store_item_v1(uuid, uuid, text, uuid, jsonb, jsonb, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_mutate_contract_v1(uuid, uuid, text, uuid, jsonb, jsonb, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_record_attendance_v1(uuid, uuid, text, uuid, date, text, timestamptz, text, numeric, text, jsonb, jsonb, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_update_game_settings_v1(uuid, uuid, jsonb, jsonb, jsonb, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_rotate_game_join_code_v1(uuid, uuid, jsonb, text, text)
  from public, anon, authenticated;

grant execute on function public.admin_create_player_v1(uuid, uuid, text, text, text, text, text, text, text, text, integer, jsonb, text, text)
  to service_role;
grant execute on function public.admin_read_mutation_replay_v1(uuid, uuid, text, text, jsonb)
  to service_role;
grant execute on function public.admin_archive_player_v1(uuid, uuid, uuid, jsonb, text, text)
  to service_role;
grant execute on function public.admin_mutate_store_item_v1(uuid, uuid, text, uuid, jsonb, jsonb, text, text)
  to service_role;
grant execute on function public.admin_mutate_contract_v1(uuid, uuid, text, uuid, jsonb, jsonb, text, text)
  to service_role;
grant execute on function public.admin_record_attendance_v1(uuid, uuid, text, uuid, date, text, timestamptz, text, numeric, text, jsonb, jsonb, text, text)
  to service_role;
grant execute on function public.admin_update_game_settings_v1(uuid, uuid, jsonb, jsonb, jsonb, text, text)
  to service_role;
grant execute on function public.admin_rotate_game_join_code_v1(uuid, uuid, jsonb, text, text)
  to service_role;

comment on function public.admin_create_player_v1(uuid, uuid, text, text, text, text, text, text, text, text, integer, jsonb, text, text) is
  'Owner-scoped, payload-bound, transactional Staff player creation with current peppered PBKDF2 credential material, audit, and replay.';
comment on function public.admin_read_mutation_replay_v1(uuid, uuid, text, text, jsonb) is
  'Owner-scoped, read-only completed-command probe used before mutable precondition reads; divergent keys fail closed.';
comment on function public.admin_archive_player_v1(uuid, uuid, uuid, jsonb, text, text) is
  'Owner-scoped, payload-bound Player archive that atomically revokes credentials and sessions, writes Staff audit, and completes replay state.';
comment on function public.admin_mutate_store_item_v1(uuid, uuid, text, uuid, jsonb, jsonb, text, text) is
  'Owner-scoped, payload-bound Store create/update/soft-archive command with audit and replay.';
comment on function public.admin_mutate_contract_v1(uuid, uuid, text, uuid, jsonb, jsonb, text, text) is
  'Owner-scoped, payload-bound Contract create/publish command with audit and replay.';
comment on function public.admin_record_attendance_v1(uuid, uuid, text, uuid, date, text, timestamptz, text, numeric, text, jsonb, jsonb, text, text) is
  'Owner-scoped, payload-bound manual/scanner attendance command with atomic audit and replay.';
comment on function public.admin_update_game_settings_v1(uuid, uuid, jsonb, jsonb, jsonb, text, text) is
  'Owner-scoped, payload-bound atomic Game Settings and difficulty-policy update with audit and replay.';
comment on function public.admin_rotate_game_join_code_v1(uuid, uuid, jsonb, text, text) is
  'Owner-scoped, payload-bound Game Code rotation with audit and exact replay.';

commit;
