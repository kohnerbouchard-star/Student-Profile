begin;

create or replace function public.claim_license_email_jobs_v1(
  p_batch_size integer default 10,
  p_lease_seconds integer default 90
)
returns table (
  email_job_id uuid,
  issuance_job_id uuid,
  payment_event_id uuid,
  purchase_code_id uuid,
  recipient_email text,
  product_sku text,
  license_duration_days integer,
  purchase_code_expires_after_days integer,
  code_generation_nonce integer,
  attempt_count integer,
  lease_token uuid,
  template_version text,
  idempotency_key text,
  expected_code_hash text,
  expected_code_hash_version text
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_batch_size not between 1 and 50
    or p_lease_seconds not between 30 and 600
  then
    raise exception 'INVALID_LICENSE_EMAIL_QUEUE_CLAIM'
      using errcode = '22023';
  end if;

  update private.license_email_outbox as stale_delivery
  set status = 'dead_letter',
      lease_token = null,
      lease_expires_at = null,
      last_error_code = 'email_idempotency_window_expired',
      last_error_detail =
        'Automatic delivery stopped before the email provider idempotency window expired; operator reconciliation is required.',
      updated_at = v_now
  where stale_delivery.first_delivery_attempt_at is not null
    and stale_delivery.first_delivery_attempt_at
      <= v_now - interval '23 hours'
    and (
      (
        stale_delivery.status in ('pending', 'retry')
        and stale_delivery.next_attempt_at <= v_now
      )
      or
      (
        stale_delivery.status = 'processing'
        and stale_delivery.lease_expires_at <= v_now
      )
    );

  update private.license_email_outbox as exhausted
  set status = 'dead_letter',
      lease_token = null,
      lease_expires_at = null,
      last_error_code = coalesce(
        exhausted.last_error_code,
        'attempt_limit_exhausted'
      ),
      last_error_detail = coalesce(
        exhausted.last_error_detail,
        'License email delivery exhausted its retry allowance.'
      ),
      updated_at = v_now
  where exhausted.attempt_count >= exhausted.max_attempts
    and (
      (
        exhausted.status in ('pending', 'retry')
        and exhausted.next_attempt_at <= v_now
      )
      or
      (
        exhausted.status = 'processing'
        and exhausted.lease_expires_at <= v_now
      )
    );

  return query
  with candidate as (
    select candidate_job.id
    from private.license_email_outbox as candidate_job
    join private.license_issuance_jobs as candidate_issuance
      on candidate_issuance.id = candidate_job.issuance_job_id
    join private.license_payment_events as candidate_payment
      on candidate_payment.id = candidate_job.payment_event_id
    where candidate_issuance.status = 'issued'
      and candidate_payment.status = 'accepted'
      and candidate_job.attempt_count < candidate_job.max_attempts
      and (
        (
          candidate_job.status in ('pending', 'retry')
          and candidate_job.next_attempt_at <= v_now
        )
        or
        (
          candidate_job.status = 'processing'
          and candidate_job.lease_expires_at <= v_now
        )
      )
    order by
      candidate_job.next_attempt_at,
      candidate_job.created_at,
      candidate_job.id
    for update of candidate_job skip locked
    limit p_batch_size
  ),
  claimed as (
    update private.license_email_outbox as claimed_job
    set status = 'processing',
        attempt_count = claimed_job.attempt_count + 1,
        lease_token = extensions.gen_random_uuid(),
        lease_expires_at =
          v_now + make_interval(secs => p_lease_seconds),
        first_delivery_attempt_at = coalesce(
          claimed_job.first_delivery_attempt_at,
          v_now
        ),
        updated_at = v_now
    from candidate
    where claimed_job.id = candidate.id
    returning claimed_job.*
  )
  select
    claimed.id,
    issuance.id,
    claimed.payment_event_id,
    claimed.purchase_code_id,
    claimed.recipient_email,
    payment.product_sku_snapshot,
    payment.license_duration_days_snapshot,
    payment.purchase_code_expires_after_days_snapshot,
    issuance.code_generation_nonce,
    claimed.attempt_count,
    claimed.lease_token,
    claimed.template_version,
    claimed.idempotency_key,
    purchase_code.code_hash,
    purchase_code.code_hash_version
  from claimed
  join private.license_issuance_jobs as issuance
    on issuance.id = claimed.issuance_job_id
  join private.license_payment_events as payment
    on payment.id = claimed.payment_event_id
  join public.purchase_codes as purchase_code
    on purchase_code.id = claimed.purchase_code_id
  order by claimed.created_at, claimed.id;
end;
$function$;

create or replace function public.complete_license_email_delivery_v1(
  p_email_job_id uuid,
  p_lease_token uuid,
  p_email_provider_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_message_id text := btrim(coalesce(p_email_provider_message_id, ''));
  v_email private.license_email_outbox%rowtype;
  v_issuance private.license_issuance_jobs%rowtype;
begin
  if p_email_job_id is null
    or p_lease_token is null
    or length(v_message_id) not between 1 and 255
    or v_message_id ~ '[[:cntrl:]]'
  then
    raise exception 'INVALID_LICENSE_EMAIL_COMPLETION'
      using errcode = '22023';
  end if;

  select email_row.*
  into v_email
  from private.license_email_outbox as email_row
  where email_row.id = p_email_job_id
  for update;

  if not found then
    raise exception 'LICENSE_EMAIL_JOB_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if v_email.status = 'delivered' then
    if v_email.email_provider_message_id <> v_message_id then
      raise exception 'LICENSE_EMAIL_MESSAGE_ID_REPLAY_MISMATCH'
        using errcode = 'P0001';
    end if;

    return jsonb_build_object(
      'completed', true,
      'duplicate', true,
      'emailJobId', v_email.id,
      'issuanceJobId', v_email.issuance_job_id,
      'purchaseCodeId', v_email.purchase_code_id,
      'deliveredAt', v_email.delivered_at
    );
  end if;

  if v_email.status <> 'processing'
    or v_email.lease_token <> p_lease_token
    or v_email.lease_expires_at is null
    or v_email.lease_expires_at <= v_now
  then
    raise exception 'LICENSE_EMAIL_LEASE_INVALID'
      using errcode = 'P0001';
  end if;

  select issuance_row.*
  into v_issuance
  from private.license_issuance_jobs as issuance_row
  where issuance_row.id = v_email.issuance_job_id
  for update;

  if not found
    or v_issuance.status <> 'issued'
    or v_issuance.purchase_code_id <> v_email.purchase_code_id
  then
    raise exception 'LICENSE_EMAIL_ISSUANCE_STATE_INVALID'
      using errcode = 'P0001';
  end if;

  update private.license_email_outbox
  set status = 'delivered',
      email_provider_message_id = v_message_id,
      delivered_at = v_now,
      lease_token = null,
      lease_expires_at = null,
      last_error_code = null,
      last_error_detail = null,
      updated_at = v_now
  where id = v_email.id
  returning * into v_email;

  update private.license_issuance_jobs
  set status = 'delivered',
      email_provider_message_id = v_message_id,
      delivered_at = v_now,
      updated_at = v_now
  where id = v_issuance.id
  returning * into v_issuance;

  return jsonb_build_object(
    'completed', true,
    'duplicate', false,
    'emailJobId', v_email.id,
    'issuanceJobId', v_issuance.id,
    'purchaseCodeId', v_email.purchase_code_id,
    'deliveredAt', v_email.delivered_at
  );
end;
$function$;

create or replace function public.retry_license_email_job_v1(
  p_email_job_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_error_detail text,
  p_retry_after_seconds integer,
  p_terminal boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_error_code text := left(
    lower(btrim(coalesce(p_error_code, 'license_email_delivery_failed'))),
    96
  );
  v_error_detail text := left(
    btrim(coalesce(p_error_detail, 'License email delivery failed.')),
    500
  );
  v_email private.license_email_outbox%rowtype;
  v_next_status text;
begin
  if p_email_job_id is null
    or p_lease_token is null
    or p_retry_after_seconds not between 1 and 86400
    or v_error_code !~ '^[a-z0-9][a-z0-9._:-]{0,95}$'
  then
    raise exception 'INVALID_LICENSE_EMAIL_RETRY'
      using errcode = '22023';
  end if;

  select email_row.*
  into v_email
  from private.license_email_outbox as email_row
  where email_row.id = p_email_job_id
  for update;

  if not found then
    raise exception 'LICENSE_EMAIL_JOB_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if v_email.status <> 'processing'
    or v_email.lease_token <> p_lease_token
  then
    raise exception 'LICENSE_EMAIL_LEASE_INVALID'
      using errcode = 'P0001';
  end if;

  v_next_status := case
    when coalesce(p_terminal, false)
      or v_email.attempt_count >= v_email.max_attempts
    then 'dead_letter'
    else 'retry'
  end;

  update private.license_email_outbox
  set status = v_next_status,
      next_attempt_at = case
        when v_next_status = 'retry'
        then v_now + make_interval(secs => p_retry_after_seconds)
        else next_attempt_at
      end,
      lease_token = null,
      lease_expires_at = null,
      last_error_code = v_error_code,
      last_error_detail = v_error_detail,
      updated_at = v_now
  where id = v_email.id
  returning * into v_email;

  return jsonb_build_object(
    'emailJobId', v_email.id,
    'emailStatus', v_email.status,
    'attemptCount', v_email.attempt_count,
    'nextAttemptAt', case
      when v_email.status = 'retry' then v_email.next_attempt_at
      else null
    end
  );
end;
$function$;

-- Compatibility completion for the previous combined worker. It records the
-- already-sent message in the outbox so a rolling deployment cannot lose
-- delivery evidence.
create or replace function public.complete_license_issuance_job_v1(
  p_job_id uuid,
  p_lease_token uuid,
  p_email_provider_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_message_id text := btrim(coalesce(p_email_provider_message_id, ''));
  v_job private.license_issuance_jobs%rowtype;
  v_payment private.license_payment_events%rowtype;
  v_email private.license_email_outbox%rowtype;
begin
  if p_job_id is null
    or p_lease_token is null
    or length(v_message_id) not between 1 and 255
    or v_message_id ~ '[[:cntrl:]]'
  then
    raise exception 'INVALID_LICENSE_DELIVERY_COMPLETION'
      using errcode = '22023';
  end if;

  select job_row.*
  into v_job
  from private.license_issuance_jobs as job_row
  where job_row.id = p_job_id
  for update;

  if not found then
    raise exception 'LICENSE_ISSUANCE_JOB_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if v_job.status = 'delivered' then
    if v_job.email_provider_message_id <> v_message_id then
      raise exception 'LICENSE_DELIVERY_MESSAGE_ID_REPLAY_MISMATCH'
        using errcode = 'P0001';
    end if;

    return jsonb_build_object(
      'completed', true,
      'duplicate', true,
      'jobId', v_job.id,
      'purchaseCodeId', v_job.purchase_code_id,
      'deliveredAt', v_job.delivered_at
    );
  end if;

  if v_job.status <> 'processing'
    or v_job.lease_token <> p_lease_token
    or v_job.lease_expires_at is null
    or v_job.lease_expires_at <= v_now
    or v_job.purchase_code_id is null
  then
    raise exception 'LICENSE_ISSUANCE_LEASE_INVALID'
      using errcode = 'P0001';
  end if;

  select payment_row.*
  into strict v_payment
  from private.license_payment_events as payment_row
  where payment_row.id = v_job.payment_event_id;

  insert into private.license_email_outbox (
    issuance_job_id,
    payment_event_id,
    purchase_code_id,
    recipient_email,
    template_version,
    idempotency_key,
    status,
    attempt_count,
    max_attempts,
    next_attempt_at,
    first_delivery_attempt_at,
    email_provider_message_id,
    created_at,
    updated_at,
    delivered_at
  ) values (
    v_job.id,
    v_payment.id,
    v_job.purchase_code_id,
    v_payment.recipient_email,
    'license-issued-v1',
    'license-issuance/' || v_job.id::text || '/delivery-v1',
    'delivered',
    greatest(1, least(v_job.attempt_count, v_job.max_attempts)),
    v_job.max_attempts,
    v_now,
    coalesce(v_job.first_delivery_attempt_at, v_now),
    v_message_id,
    v_job.created_at,
    v_now,
    v_now
  )
  on conflict (issuance_job_id)
  do update set
    status = 'delivered',
    email_provider_message_id = excluded.email_provider_message_id,
    delivered_at = coalesce(
      private.license_email_outbox.delivered_at,
      excluded.delivered_at
    ),
    lease_token = null,
    lease_expires_at = null,
    last_error_code = null,
    last_error_detail = null,
    updated_at = v_now
  where private.license_email_outbox.purchase_code_id = excluded.purchase_code_id
    and private.license_email_outbox.payment_event_id = excluded.payment_event_id
    and private.license_email_outbox.recipient_email = excluded.recipient_email
    and (
      private.license_email_outbox.email_provider_message_id is null
      or private.license_email_outbox.email_provider_message_id =
        excluded.email_provider_message_id
    );

  select email_row.*
  into strict v_email
  from private.license_email_outbox as email_row
  where email_row.issuance_job_id = v_job.id;

  if v_email.email_provider_message_id <> v_message_id
    or v_email.status <> 'delivered'
  then
    raise exception 'LICENSE_EMAIL_OUTBOX_REPLAY_MISMATCH'
      using errcode = 'P0001';
  end if;

  update private.license_issuance_jobs
  set status = 'delivered',
      issued_at = coalesce(issued_at, v_now),
      email_provider_message_id = v_message_id,
      delivered_at = v_now,
      lease_token = null,
      lease_expires_at = null,
      last_error_code = null,
      last_error_detail = null,
      updated_at = v_now
  where id = v_job.id
  returning * into v_job;

  return jsonb_build_object(
    'completed', true,
    'duplicate', false,
    'jobId', v_job.id,
    'purchaseCodeId', v_job.purchase_code_id,
    'emailJobId', v_email.id,
    'deliveredAt', v_job.delivered_at
  );
end;
$function$;

revoke all on function public.claim_license_email_jobs_v1(
  integer, integer
) from public, anon, authenticated;
revoke all on function public.complete_license_email_delivery_v1(
  uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.retry_license_email_job_v1(
  uuid, uuid, text, text, integer, boolean
) from public, anon, authenticated;

grant execute on function public.claim_license_email_jobs_v1(
  integer, integer
) to service_role;
grant execute on function public.complete_license_email_delivery_v1(
  uuid, uuid, text
) to service_role;
grant execute on function public.retry_license_email_job_v1(
  uuid, uuid, text, text, integer, boolean
) to service_role;

comment on function public.claim_license_email_jobs_v1(
  integer, integer
) is
  'Claims durable license-email work with SKIP LOCKED leases, returns the HMAC verifier for pre-send validation, and stops retries before the provider idempotency window expires.';
comment on function public.complete_license_email_delivery_v1(
  uuid, uuid, text
) is
  'Atomically records provider delivery evidence in both the durable email outbox and the compatibility issuance projection.';

commit;
