begin;

create or replace function public.claim_license_materialization_jobs_v2(
  p_batch_size integer default 10,
  p_lease_seconds integer default 90
)
returns table (
  job_id uuid,
  payment_event_id uuid,
  provider text,
  provider_payment_id text,
  recipient_email text,
  product_sku text,
  license_duration_days integer,
  purchase_code_expires_after_days integer,
  purchase_code_id uuid,
  code_generation_nonce integer,
  attempt_count integer,
  lease_token uuid
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
    raise exception 'INVALID_LICENSE_QUEUE_CLAIM'
      using errcode = '22023';
  end if;

  update private.license_issuance_jobs as exhausted
  set status = 'dead_letter',
      lease_token = null,
      lease_expires_at = null,
      last_error_code = coalesce(
        exhausted.last_error_code,
        'attempt_limit_exhausted'
      ),
      last_error_detail = coalesce(
        exhausted.last_error_detail,
        'License materialization exhausted its retry allowance.'
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
    from private.license_issuance_jobs as candidate_job
    join private.license_payment_events as candidate_payment
      on candidate_payment.id = candidate_job.payment_event_id
    where candidate_payment.status = 'accepted'
      and candidate_job.status in ('pending', 'processing', 'retry')
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
    update private.license_issuance_jobs as claimed_job
    set status = 'processing',
        attempt_count = claimed_job.attempt_count + 1,
        lease_token = extensions.gen_random_uuid(),
        lease_expires_at =
          v_now + make_interval(secs => p_lease_seconds),
        updated_at = v_now
    from candidate
    where claimed_job.id = candidate.id
    returning claimed_job.*
  )
  select
    claimed.id,
    claimed.payment_event_id,
    payment.provider,
    payment.provider_payment_id,
    payment.recipient_email,
    payment.product_sku_snapshot,
    payment.license_duration_days_snapshot,
    payment.purchase_code_expires_after_days_snapshot,
    claimed.purchase_code_id,
    claimed.code_generation_nonce,
    claimed.attempt_count,
    claimed.lease_token
  from claimed
  join private.license_payment_events as payment
    on payment.id = claimed.payment_event_id
  order by claimed.created_at, claimed.id;
end;
$function$;

create or replace function public.materialize_license_and_enqueue_email_v2(
  p_job_id uuid,
  p_lease_token uuid,
  p_code_hash text,
  p_code_hash_version text,
  p_code_generation_nonce integer,
  p_template_version text default 'license-issued-v1'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_code_hash text := lower(btrim(coalesce(p_code_hash, '')));
  v_code_hash_version text :=
    lower(btrim(coalesce(p_code_hash_version, '')));
  v_template_version text :=
    lower(btrim(coalesce(p_template_version, '')));
  v_job private.license_issuance_jobs%rowtype;
  v_payment private.license_payment_events%rowtype;
  v_purchase_code public.purchase_codes%rowtype;
  v_email private.license_email_outbox%rowtype;
  v_outcome text;
  v_expires_at timestamptz;
begin
  if p_job_id is null
    or p_lease_token is null
    or v_code_hash !~ '^[0-9a-f]{64}$'
    or v_code_hash_version <> 'hmac-sha256-v2'
    or p_code_generation_nonce is null
    or p_code_generation_nonce not between 0 and 100
    or v_template_version !~ '^[a-z0-9][a-z0-9._-]{2,63}$'
  then
    raise exception 'INVALID_LICENSE_MATERIALIZATION_REQUEST'
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

  if v_job.status <> 'processing'
    or v_job.lease_token <> p_lease_token
    or v_job.lease_expires_at is null
    or v_job.lease_expires_at <= v_now
  then
    raise exception 'LICENSE_ISSUANCE_LEASE_INVALID'
      using errcode = 'P0001';
  end if;

  if v_job.code_generation_nonce <> p_code_generation_nonce then
    raise exception 'LICENSE_CODE_NONCE_MISMATCH'
      using errcode = 'P0001';
  end if;

  select payment_row.*
  into v_payment
  from private.license_payment_events as payment_row
  where payment_row.id = v_job.payment_event_id
    and payment_row.status = 'accepted'
  for update;

  if not found then
    raise exception 'LICENSE_PAYMENT_NOT_ACCEPTED'
      using errcode = 'P0001';
  end if;

  if v_job.purchase_code_id is not null then
    select purchase_code_row.*
    into strict v_purchase_code
    from public.purchase_codes as purchase_code_row
    where purchase_code_row.id = v_job.purchase_code_id;

    if v_purchase_code.code_hash <> v_code_hash
      or v_purchase_code.code_hash_version <> v_code_hash_version
    then
      raise exception 'LICENSE_CODE_REPLAY_MISMATCH'
        using errcode = 'P0001';
    end if;

    v_outcome := 'replayed';
  else
    if exists (
      select 1
      from public.purchase_codes as existing_code
      where existing_code.code_hash = v_code_hash
    ) then
      if v_job.code_generation_nonce >= 100 then
        raise exception 'LICENSE_CODE_COLLISION_LIMIT'
          using errcode = 'P0001';
      end if;

      update private.license_issuance_jobs
      set code_generation_nonce = code_generation_nonce + 1,
          updated_at = v_now
      where id = v_job.id;

      return jsonb_build_object(
        'outcome', 'collision',
        'nextCodeGenerationNonce', v_job.code_generation_nonce + 1
      );
    end if;

    v_expires_at := case
      when v_payment.purchase_code_expires_after_days_snapshot is null
        then null
      else v_now + make_interval(
        days => v_payment.purchase_code_expires_after_days_snapshot
      )
    end;

    begin
      insert into public.purchase_codes (
        code_hash,
        code_hash_version,
        status,
        max_redemptions,
        redeemed_count,
        expires_at,
        license_duration_days
      ) values (
        v_code_hash,
        v_code_hash_version,
        'active',
        v_payment.max_redemptions_snapshot,
        0,
        v_expires_at,
        v_payment.license_duration_days_snapshot
      )
      returning * into v_purchase_code;
    exception
      when unique_violation then
        if v_job.code_generation_nonce >= 100 then
          raise exception 'LICENSE_CODE_COLLISION_LIMIT'
            using errcode = 'P0001';
        end if;

        update private.license_issuance_jobs
        set code_generation_nonce = code_generation_nonce + 1,
            updated_at = v_now
        where id = v_job.id;

        return jsonb_build_object(
          'outcome', 'collision',
          'nextCodeGenerationNonce', v_job.code_generation_nonce + 1
        );
    end;

    v_outcome := 'created';
  end if;

  insert into private.license_email_outbox (
    issuance_job_id,
    payment_event_id,
    purchase_code_id,
    recipient_email,
    template_version,
    idempotency_key,
    status,
    next_attempt_at
  ) values (
    v_job.id,
    v_payment.id,
    v_purchase_code.id,
    v_payment.recipient_email,
    v_template_version,
    'license-issuance/' || v_job.id::text || '/delivery-v1',
    'pending',
    v_now
  )
  on conflict (issuance_job_id) do nothing;

  select email_row.*
  into strict v_email
  from private.license_email_outbox as email_row
  where email_row.issuance_job_id = v_job.id;

  if v_email.payment_event_id <> v_payment.id
    or v_email.purchase_code_id <> v_purchase_code.id
    or v_email.recipient_email <> v_payment.recipient_email
    or v_email.template_version <> v_template_version
    or v_email.idempotency_key <>
      'license-issuance/' || v_job.id::text || '/delivery-v1'
  then
    raise exception 'LICENSE_EMAIL_OUTBOX_REPLAY_MISMATCH'
      using errcode = 'P0001';
  end if;

  update private.license_issuance_jobs
  set purchase_code_id = v_purchase_code.id,
      status = case
        when v_email.status = 'delivered' then 'delivered'
        else 'issued'
      end,
      issued_at = coalesce(issued_at, v_now),
      email_provider_message_id = case
        when v_email.status = 'delivered'
          then v_email.email_provider_message_id
        else null
      end,
      delivered_at = case
        when v_email.status = 'delivered' then v_email.delivered_at
        else null
      end,
      lease_token = null,
      lease_expires_at = null,
      first_delivery_attempt_at = null,
      last_error_code = null,
      last_error_detail = null,
      updated_at = v_now
  where id = v_job.id
  returning * into v_job;

  return jsonb_build_object(
    'outcome', v_outcome,
    'purchaseCodeId', v_purchase_code.id,
    'purchaseCodeExpiresAt', v_purchase_code.expires_at,
    'licenseDurationDays', v_purchase_code.license_duration_days,
    'codeGenerationNonce', v_job.code_generation_nonce,
    'emailJobId', v_email.id,
    'emailStatus', v_email.status
  );
end;
$function$;

revoke all on function public.claim_license_materialization_jobs_v2(
  integer, integer
) from public, anon, authenticated;
revoke all on function public.materialize_license_and_enqueue_email_v2(
  uuid, uuid, text, text, integer, text
) from public, anon, authenticated;

grant execute on function public.claim_license_materialization_jobs_v2(
  integer, integer
) to service_role;
grant execute on function public.materialize_license_and_enqueue_email_v2(
  uuid, uuid, text, text, integer, text
) to service_role;

comment on function public.claim_license_materialization_jobs_v2(
  integer, integer
) is
  'Claims only the code-materialization phase with SKIP LOCKED leases. Materialized but unfinished jobs remain recoverable.';
comment on function public.materialize_license_and_enqueue_email_v2(
  uuid, uuid, text, text, integer, text
) is
  'Atomically creates or replays the HMAC-only purchase code, marks it issued, and creates exactly one durable email-outbox job.';

commit;
