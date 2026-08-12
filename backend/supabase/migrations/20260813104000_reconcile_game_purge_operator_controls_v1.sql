-- Operator-facing controls for hard-confirmed game purge.
-- License expiration creates an eligible review request after a seven-day grace
-- period. It never arms or confirms destructive work automatically.

create or replace function public.arm_game_data_purge_v1(
  p_actor_staff_user_id uuid,
  p_confirmation_phrase text
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_until timestamptz;
  v_arm_id uuid := extensions.gen_random_uuid();
  v_control private.game_data_purge_control%rowtype;
begin
  perform private.assert_game_purge_authority_v1(p_actor_staff_user_id);
  if p_confirmation_phrase is distinct from 'ARM GAME DATA PURGE FOR 2 HOURS' then
    raise exception 'PURGE_ARM_CONFIRMATION_MISMATCH' using errcode = 'P0001';
  end if;

  select * into v_control
  from private.game_data_purge_control
  where singleton;
  if v_control.environment_name is null or v_control.r2_bucket_name is null then
    raise exception 'GAME_PURGE_ENVIRONMENT_NOT_CONFIGURED' using errcode = 'P0001';
  end if;

  v_until := clock_timestamp() + interval '2 hours';
  update private.game_data_purge_control
  set arm_id = v_arm_id,
      armed_until = v_until,
      armed_by_staff_user_id = p_actor_staff_user_id,
      armed_at = clock_timestamp(),
      disarmed_at = null,
      updated_at = clock_timestamp()
  where singleton;
  return v_until;
end;
$$;

create or replace function public.disarm_game_data_purge_v1(
  p_actor_staff_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.assert_game_purge_authority_v1(p_actor_staff_user_id);
  update private.game_data_purge_control
  set arm_id = null,
      armed_until = null,
      armed_by_staff_user_id = null,
      disarmed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where singleton;
  return true;
end;
$$;

create or replace function public.cancel_game_data_purge_v1(
  p_request_id uuid,
  p_actor_staff_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_request private.game_data_purge_requests%rowtype;
begin
  perform private.assert_game_purge_authority_v1(p_actor_staff_user_id);
  select * into v_request
  from private.game_data_purge_requests
  where id = p_request_id
  for update;

  if not found then
    return false;
  end if;
  if v_request.status in ('r2_deleting', 'r2_deleted', 'db_deleting', 'completed') then
    raise exception 'PURGE_REQUEST_CANNOT_BE_CANCELLED' using errcode = 'P0001';
  end if;

  update private.game_data_purge_requests
  set status = 'cancelled',
      cancelled_by_staff_user_id = p_actor_staff_user_id,
      cancelled_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_request_id;
  return true;
end;
$$;

create or replace function public.issue_game_data_purge_confirmation_v2(
  p_game_session_id uuid,
  p_actor_staff_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_game public.game_sessions%rowtype;
  v_entitlement public.entitlements%rowtype;
  v_request private.game_data_purge_requests%rowtype;
  v_manifest jsonb;
  v_review_hash text;
  v_challenge text;
  v_phrase text;
  v_now timestamptz := clock_timestamp();
begin
  perform private.assert_game_purge_authority_v1(p_actor_staff_user_id);

  select * into v_game
  from public.game_sessions
  where id = p_game_session_id
  for update;
  if not found then
    raise exception 'GAME_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_game.data_purge_protected then
    raise exception 'GAME_PURGE_PROTECTED' using errcode = 'P0001';
  end if;

  select * into v_entitlement
  from public.entitlements
  where game_session_id = p_game_session_id
  for update;
  if not found or v_entitlement.status <> 'expired'
     or v_entitlement.license_expires_at is null
     or v_entitlement.license_expires_at > v_now then
    raise exception 'GAME_LICENSE_NOT_EXPIRED' using errcode = 'P0001';
  end if;

  select * into v_request
  from private.game_data_purge_requests
  where game_session_id = p_game_session_id
    and status not in ('completed', 'cancelled', 'failed')
  order by created_at desc
  limit 1
  for update;

  if not found then
    insert into private.game_data_purge_requests (
      game_session_id,
      game_name_snapshot,
      entitlement_id,
      license_expires_at,
      purge_not_before,
      status
    ) values (
      p_game_session_id,
      v_game.name,
      v_entitlement.id,
      v_entitlement.license_expires_at,
      v_entitlement.license_expires_at + interval '7 days',
      'eligible'
    ) returning * into v_request;
  end if;

  if v_request.purge_not_before is null then
    update private.game_data_purge_requests
    set purge_not_before = v_entitlement.license_expires_at + interval '7 days'
    where id = v_request.id
    returning * into v_request;
  end if;

  if v_now < v_request.purge_not_before then
    raise exception 'GAME_PURGE_GRACE_PERIOD_ACTIVE'
      using errcode = 'P0001',
            detail = 'Purge not eligible until ' || v_request.purge_not_before::text;
  end if;
  if v_request.status in ('r2_deleting', 'r2_deleted', 'db_deleting') then
    raise exception 'GAME_PURGE_ALREADY_EXECUTING' using errcode = 'P0001';
  end if;

  v_manifest := private.build_game_data_purge_review_v2(v_request.id);
  if coalesce((v_manifest->'integrityBlockers'->>'total')::bigint, 0) <> 0 then
    raise exception 'GAME_PURGE_INTEGRITY_BLOCKED' using errcode = 'P0001';
  end if;

  v_review_hash := encode(extensions.digest(v_manifest::text, 'sha256'), 'hex');
  v_challenge := encode(extensions.gen_random_bytes(8), 'hex');
  v_phrase := 'DELETE GAME ' || p_game_session_id::text
    || ' REVIEW ' || substr(v_review_hash, 1, 16)
    || ' ' || v_challenge;

  update private.game_data_purge_requests
  set status = 'awaiting_confirmation',
      confirmation_hash = encode(extensions.digest(v_phrase, 'sha256'), 'hex'),
      confirmation_issued_at = v_now,
      confirmation_not_before = v_now + interval '60 seconds',
      confirmation_expires_at = v_now + interval '30 minutes',
      confirmed_by_staff_user_id = null,
      confirmed_at = null,
      confirmed_arm_id = null,
      review_manifest = v_manifest,
      review_sha256 = v_review_hash,
      review_generated_at = v_now,
      last_error = null,
      updated_at = v_now
  where id = v_request.id;

  return jsonb_build_object(
    'requestId', v_request.id,
    'gameSessionId', p_game_session_id,
    'gameName', v_game.name,
    'reviewSha256', v_review_hash,
    'review', v_manifest,
    'confirmationPhrase', v_phrase,
    'confirmationNotBefore', v_now + interval '60 seconds',
    'confirmationExpiresAt', v_now + interval '30 minutes'
  );
end;
$$;

create or replace function public.confirm_game_data_purge_v2(
  p_request_id uuid,
  p_actor_staff_user_id uuid,
  p_confirmation_phrase text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_request private.game_data_purge_requests%rowtype;
  v_game public.game_sessions%rowtype;
  v_entitlement public.entitlements%rowtype;
  v_control private.game_data_purge_control%rowtype;
  v_manifest jsonb;
  v_review_hash text;
  v_now timestamptz := clock_timestamp();
begin
  perform private.assert_game_purge_authority_v1(p_actor_staff_user_id);

  select * into v_request
  from private.game_data_purge_requests
  where id = p_request_id
  for update;
  if not found or v_request.status <> 'awaiting_confirmation' then
    raise exception 'PURGE_REQUEST_NOT_AWAITING_CONFIRMATION' using errcode = 'P0001';
  end if;

  select * into v_control
  from private.game_data_purge_control
  where singleton;
  if v_control.arm_id is null or v_control.armed_until is null
     or v_control.armed_until <= v_now then
    raise exception 'GAME_DATA_PURGE_LEVER_NOT_ARMED' using errcode = 'P0001';
  end if;
  if v_request.purge_not_before is null or v_now < v_request.purge_not_before then
    raise exception 'GAME_PURGE_GRACE_PERIOD_ACTIVE' using errcode = 'P0001';
  end if;
  if v_now < v_request.confirmation_not_before then
    raise exception 'PURGE_CONFIRMATION_TOO_EARLY' using errcode = 'P0001';
  end if;
  if v_now > v_request.confirmation_expires_at then
    raise exception 'PURGE_CONFIRMATION_EXPIRED' using errcode = 'P0001';
  end if;
  if v_request.review_sha256 is null or v_request.review_manifest is null then
    raise exception 'GAME_PURGE_REVIEW_REQUIRED' using errcode = 'P0001';
  end if;
  if encode(
    extensions.digest(coalesce(p_confirmation_phrase, ''), 'sha256'),
    'hex'
  ) <> v_request.confirmation_hash then
    raise exception 'PURGE_CONFIRMATION_MISMATCH' using errcode = 'P0001';
  end if;

  v_manifest := private.build_game_data_purge_review_v2(p_request_id);
  v_review_hash := encode(extensions.digest(v_manifest::text, 'sha256'), 'hex');
  if v_review_hash <> v_request.review_sha256
     or v_manifest <> v_request.review_manifest then
    raise exception 'GAME_PURGE_REVIEW_CHANGED' using errcode = 'P0001';
  end if;
  if coalesce((v_manifest->'integrityBlockers'->>'total')::bigint, 0) <> 0 then
    raise exception 'GAME_PURGE_INTEGRITY_BLOCKED' using errcode = 'P0001';
  end if;

  select * into v_game
  from public.game_sessions
  where id = v_request.game_session_id
  for update;
  if not found then
    raise exception 'GAME_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_game.data_purge_protected then
    raise exception 'GAME_PURGE_PROTECTED' using errcode = 'P0001';
  end if;

  select * into v_entitlement
  from public.entitlements
  where id = v_request.entitlement_id
    and game_session_id = v_request.game_session_id
  for update;
  if not found or v_entitlement.status <> 'expired'
     or v_entitlement.license_expires_at is null
     or v_entitlement.license_expires_at > v_now then
    raise exception 'GAME_LICENSE_NOT_EXPIRED' using errcode = 'P0001';
  end if;

  update private.game_data_purge_requests
  set status = 'confirmed',
      confirmed_by_staff_user_id = p_actor_staff_user_id,
      confirmed_at = v_now,
      confirmed_arm_id = v_control.arm_id,
      updated_at = v_now,
      last_error = null
  where id = p_request_id;

  return jsonb_build_object(
    'requestId', p_request_id,
    'gameSessionId', v_request.game_session_id,
    'status', 'confirmed',
    'reviewSha256', v_review_hash,
    'armId', v_control.arm_id,
    'armedUntil', v_control.armed_until
  );
end;
$$;

create or replace function public.claim_confirmed_game_data_purge_v1()
returns table(request_id uuid, game_session_id uuid, stage text)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_request private.game_data_purge_requests%rowtype;
  v_control private.game_data_purge_control%rowtype;
  v_now timestamptz := clock_timestamp();
  v_cross_refs bigint;
begin
  select * into v_control
  from private.game_data_purge_control
  where singleton
  for update;

  if v_control.environment_name is null or v_control.r2_bucket_name is null then
    return;
  end if;
  if v_control.arm_id is null or v_control.armed_until is null
     or v_control.armed_until <= v_now then
    return;
  end if;

  select * into v_request
  from private.game_data_purge_requests
  where status in ('confirmed', 'r2_deleting', 'r2_deleted', 'db_deleting')
    and confirmed_arm_id = v_control.arm_id
    and purge_not_before is not null
    and purge_not_before <= v_now
  order by confirmed_at nulls last, created_at
  for update skip locked
  limit 1;
  if not found then
    return;
  end if;

  if not exists (
    select 1
    from public.game_sessions game_row
    where game_row.id = v_request.game_session_id
      and not game_row.data_purge_protected
  ) then
    return;
  end if;
  if not exists (
    select 1
    from public.entitlements entitlement_row
    where entitlement_row.id = v_request.entitlement_id
      and entitlement_row.game_session_id = v_request.game_session_id
      and entitlement_row.status = 'expired'
      and entitlement_row.license_expires_at <= v_now
  ) then
    return;
  end if;

  select count(*) into v_cross_refs
  from public.game_feature_activation_evidence evidence_row
  where evidence_row.source_game_session_id = v_request.game_session_id
    and evidence_row.game_session_id <> v_request.game_session_id;
  if v_cross_refs > 0 then
    update private.game_data_purge_requests
    set last_error = 'cross_game_reference_blocked',
        updated_at = v_now
    where id = v_request.id;
    return;
  end if;

  request_id := v_request.id;
  game_session_id := v_request.game_session_id;
  if v_request.status in ('confirmed', 'r2_deleting') then
    update private.game_data_purge_requests
    set status = 'r2_deleting',
        attempt_count = attempt_count + 1,
        last_attempt_at = v_now,
        updated_at = v_now
    where id = v_request.id;
    stage := 'r2';
  else
    update private.game_data_purge_requests
    set status = 'db_deleting',
        db_started_at = coalesce(db_started_at, v_now),
        attempt_count = attempt_count + 1,
        last_attempt_at = v_now,
        updated_at = v_now
    where id = v_request.id;
    stage := 'db';
  end if;
  return next;
end;
$$;

create or replace function public.run_due_game_license_expirations_v1(
  p_now timestamptz default clock_timestamp()
)
returns table(game_session_id uuid, purge_request_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_entitlement record;
  v_request_id uuid;
begin
  if p_now is null then
    raise exception 'CURRENT_TIME_REQUIRED' using errcode = '22023';
  end if;

  for v_entitlement in
    select
      entitlement_row.id as entitlement_id,
      entitlement_row.game_session_id,
      entitlement_row.license_expires_at,
      game_row.name,
      game_row.lifecycle_state,
      game_row.data_purge_protected
    from public.entitlements entitlement_row
    join public.game_sessions game_row
      on game_row.id = entitlement_row.game_session_id
    where entitlement_row.status = 'active'
      and entitlement_row.license_expires_at is not null
      and entitlement_row.license_expires_at <= p_now
    order by entitlement_row.license_expires_at, entitlement_row.game_session_id
    for update of entitlement_row, game_row skip locked
  loop
    update public.entitlements
    set status = 'expired',
        expired_at = coalesce(expired_at, p_now),
        updated_at = p_now
    where id = v_entitlement.entitlement_id;

    update public.game_sessions
    set status = case
          when lifecycle_state in ('ended', 'archived') then 'archived'
          else 'disabled'
        end,
        lifecycle_state = case
          when lifecycle_state in ('ended', 'archived') then lifecycle_state
          else 'paused'
        end,
        paused_at = case
          when lifecycle_state in ('ended', 'archived') then paused_at
          else coalesce(paused_at, p_now)
        end,
        game_join_code_status = 'revoked',
        license_expired_at = coalesce(license_expired_at, p_now),
        lifecycle_version = lifecycle_version + 1,
        updated_at = p_now
    where id = v_entitlement.game_session_id;

    v_request_id := null;
    if not v_entitlement.data_purge_protected then
      select request_row.id into v_request_id
      from private.game_data_purge_requests request_row
      where request_row.game_session_id = v_entitlement.game_session_id
        and request_row.status not in ('completed', 'cancelled', 'failed')
      limit 1;

      if v_request_id is null then
        insert into private.game_data_purge_requests (
          game_session_id,
          game_name_snapshot,
          entitlement_id,
          license_expires_at,
          purge_not_before,
          status
        ) values (
          v_entitlement.game_session_id,
          v_entitlement.name,
          v_entitlement.entitlement_id,
          v_entitlement.license_expires_at,
          v_entitlement.license_expires_at + interval '7 days',
          'eligible'
        ) returning id into v_request_id;
      end if;
    end if;

    game_session_id := v_entitlement.game_session_id;
    purge_request_id := v_request_id;
    return next;
  end loop;
end;
$$;

create or replace function public.set_game_license_expiration_v1(
  p_game_session_id uuid,
  p_actor_staff_user_id uuid,
  p_license_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_entitlement public.entitlements%rowtype;
  v_game public.game_sessions%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  perform private.assert_game_purge_authority_v1(p_actor_staff_user_id);
  if p_game_session_id is null or p_license_expires_at is null then
    raise exception 'LICENSE_EXPIRATION_REQUIRED' using errcode = '22023';
  end if;

  select * into v_game
  from public.game_sessions
  where id = p_game_session_id
  for update;
  if not found then
    raise exception 'GAME_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_game.data_purge_protected then
    raise exception 'GAME_PURGE_PROTECTED' using errcode = 'P0001';
  end if;

  select * into v_entitlement
  from public.entitlements
  where game_session_id = p_game_session_id
  for update;
  if not found then
    raise exception 'GAME_ENTITLEMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from private.game_data_purge_requests request_row
    where request_row.game_session_id = p_game_session_id
      and request_row.status in ('r2_deleting', 'r2_deleted', 'db_deleting')
  ) then
    raise exception 'GAME_PURGE_ALREADY_EXECUTING' using errcode = 'P0001';
  end if;

  update public.entitlements
  set license_expires_at = p_license_expires_at,
      status = case when p_license_expires_at <= v_now then 'expired' else 'active' end,
      expired_at = case
        when p_license_expires_at <= v_now then coalesce(expired_at, v_now)
        else null
      end,
      updated_at = v_now
  where id = v_entitlement.id;

  if p_license_expires_at <= v_now then
    update public.game_sessions
    set status = case
          when lifecycle_state in ('ended', 'archived') then 'archived'
          else 'disabled'
        end,
        lifecycle_state = case
          when lifecycle_state in ('ended', 'archived') then lifecycle_state
          else 'paused'
        end,
        paused_at = case
          when lifecycle_state in ('ended', 'archived') then paused_at
          else coalesce(paused_at, v_now)
        end,
        game_join_code_status = 'revoked',
        license_expired_at = coalesce(license_expired_at, v_now),
        lifecycle_version = lifecycle_version + 1,
        updated_at = v_now
    where id = p_game_session_id;

    insert into private.game_data_purge_requests (
      game_session_id,
      game_name_snapshot,
      entitlement_id,
      license_expires_at,
      purge_not_before,
      status
    ) values (
      p_game_session_id,
      v_game.name,
      v_entitlement.id,
      p_license_expires_at,
      p_license_expires_at + interval '7 days',
      'eligible'
    ) on conflict do nothing;
  else
    update public.game_sessions
    set license_expired_at = null,
        updated_at = v_now
    where id = p_game_session_id;

    update private.game_data_purge_requests
    set status = 'cancelled',
        cancelled_by_staff_user_id = p_actor_staff_user_id,
        cancelled_at = v_now,
        updated_at = v_now,
        last_error = 'license_renewed_before_purge'
    where game_session_id = p_game_session_id
      and status in ('eligible', 'awaiting_confirmation', 'confirmed');
  end if;

  return jsonb_build_object(
    'gameSessionId', p_game_session_id,
    'licenseExpiresAt', p_license_expires_at,
    'expired', p_license_expires_at <= v_now,
    'purgeEligibleAt', p_license_expires_at + interval '7 days'
  );
end;
$$;

create or replace function public.configure_game_license_expiration_scheduler_v1()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, cron
as $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'econovaria-game-license-expiration-v1'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  return cron.schedule(
    'econovaria-game-license-expiration-v1',
    '17 * * * *',
    'select * from public.run_due_game_license_expirations_v1(clock_timestamp());'
  );
end;
$$;

create or replace function public.configure_game_data_purge_scheduler_v1(
  p_function_url text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, vault, cron, net, extensions
as $$
declare
  v_scheduler_name constant text := 'econovaria-game-data-purge-scheduler-v1';
  v_function_url text := lower(btrim(coalesce(p_function_url, '')));
  v_token text;
  v_job_id bigint;
  v_command text;
begin
  if v_function_url !~ '^https://[a-z0-9]{20}[.]supabase[.]co/functions/v1/game-data-purger$' then
    raise exception 'INVALID_GAME_DATA_PURGE_FUNCTION_URL' using errcode = '22023';
  end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = v_scheduler_name
  order by created_at desc
  limit 1;

  if v_token is null then
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(
      v_token,
      v_scheduler_name,
      'Internal token for hard-confirmed Econovaria game data purge dispatcher.'
    );
  end if;

  insert into private.runtime_scheduler_tokens(scheduler_name, token_sha256)
  values (
    v_scheduler_name,
    encode(extensions.digest(v_token, 'sha256'), 'hex')
  )
  on conflict (scheduler_name) do update set
    token_sha256 = excluded.token_sha256,
    rotated_at = case
      when private.runtime_scheduler_tokens.token_sha256 <> excluded.token_sha256
        then clock_timestamp()
      else private.runtime_scheduler_tokens.rotated_at
    end;

  for v_job_id in
    select jobid from cron.job where jobname = v_scheduler_name
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  v_command := format($command$
    select net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-econovaria-purge-scheduler-token', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'econovaria-game-data-purge-scheduler-v1'
          order by created_at desc
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
  $command$, v_function_url);

  return cron.schedule(v_scheduler_name, '*/5 * * * *', v_command);
end;
$$;

revoke all on function public.arm_game_data_purge_v1(uuid, text),
  public.disarm_game_data_purge_v1(uuid),
  public.cancel_game_data_purge_v1(uuid, uuid),
  public.issue_game_data_purge_confirmation_v2(uuid, uuid),
  public.confirm_game_data_purge_v2(uuid, uuid, text),
  public.claim_confirmed_game_data_purge_v1(),
  public.run_due_game_license_expirations_v1(timestamptz),
  public.set_game_license_expiration_v1(uuid, uuid, timestamptz),
  public.configure_game_license_expiration_scheduler_v1(),
  public.configure_game_data_purge_scheduler_v1(text)
from public, anon, authenticated;

grant execute on function public.arm_game_data_purge_v1(uuid, text),
  public.disarm_game_data_purge_v1(uuid),
  public.cancel_game_data_purge_v1(uuid, uuid),
  public.issue_game_data_purge_confirmation_v2(uuid, uuid),
  public.confirm_game_data_purge_v2(uuid, uuid, text),
  public.claim_confirmed_game_data_purge_v1(),
  public.run_due_game_license_expirations_v1(timestamptz),
  public.set_game_license_expiration_v1(uuid, uuid, timestamptz),
  public.configure_game_license_expiration_scheduler_v1(),
  public.configure_game_data_purge_scheduler_v1(text)
to service_role;
