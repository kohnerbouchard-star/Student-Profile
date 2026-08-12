begin;

alter table private.license_payment_events
  add column product_sku_snapshot text null,
  add column license_duration_days_snapshot integer null,
  add column purchase_code_expires_after_days_snapshot integer null,
  add column max_redemptions_snapshot integer null;

update private.license_payment_events as payment
set product_sku_snapshot = product.product_sku,
    license_duration_days_snapshot = product.license_duration_days,
    purchase_code_expires_after_days_snapshot =
      product.purchase_code_expires_after_days,
    max_redemptions_snapshot = product.max_redemptions
from private.license_products as product
where product.id = payment.product_id
  and (
    payment.product_sku_snapshot is null
    or payment.license_duration_days_snapshot is null
    or payment.max_redemptions_snapshot is null
  );

alter table private.license_payment_events
  alter column product_sku_snapshot set not null,
  alter column license_duration_days_snapshot set not null,
  alter column max_redemptions_snapshot set not null;

alter table private.license_payment_events
  add constraint license_payment_events_product_sku_snapshot_check
  check (
    product_sku_snapshot ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
  ),
  add constraint license_payment_events_license_duration_snapshot_check
  check (license_duration_days_snapshot between 1 and 3650),
  add constraint license_payment_events_code_expiration_snapshot_check
  check (
    purchase_code_expires_after_days_snapshot is null
    or purchase_code_expires_after_days_snapshot between 1 and 3650
  ),
  add constraint license_payment_events_single_redemption_snapshot_check
  check (max_redemptions_snapshot = 1);

update private.license_issuance_jobs
set status = case
      when attempt_count >= max_attempts then 'dead_letter'
      else 'retry'
    end,
    next_attempt_at = clock_timestamp(),
    lease_token = null,
    lease_expires_at = null,
    last_error_code = coalesce(
      last_error_code,
      'invalid_processing_lease_recovered'
    ),
    last_error_detail = coalesce(
      last_error_detail,
      'An invalid processing lease was recovered during queue hardening.'
    ),
    updated_at = clock_timestamp()
where status = 'processing'
  and (lease_token is null or lease_expires_at is null);

update private.license_issuance_jobs
set lease_token = null,
    lease_expires_at = null,
    updated_at = clock_timestamp()
where status <> 'processing'
  and (lease_token is not null or lease_expires_at is not null);

alter table private.license_issuance_jobs
  add constraint license_issuance_jobs_status_lease_state_check
  check (
    (
      status = 'processing'
      and lease_token is not null
      and lease_expires_at is not null
    )
    or
    (
      status <> 'processing'
      and lease_token is null
      and lease_expires_at is null
    )
  );

create or replace function public.enqueue_paid_license_v1(
  p_provider text,
  p_provider_event_id text,
  p_provider_payment_id text,
  p_provider_price_ref text,
  p_recipient_email text,
  p_amount_minor bigint,
  p_currency text,
  p_occurred_at timestamptz,
  p_payload_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_provider_event_id text := btrim(coalesce(p_provider_event_id, ''));
  v_provider_payment_id text := btrim(coalesce(p_provider_payment_id, ''));
  v_provider_price_ref text := btrim(coalesce(p_provider_price_ref, ''));
  v_recipient_email text := lower(btrim(coalesce(p_recipient_email, '')));
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_payload_sha256 text := lower(btrim(coalesce(p_payload_sha256, '')));
  v_product private.license_products%rowtype;
  v_event private.license_payment_events%rowtype;
  v_job private.license_issuance_jobs%rowtype;
begin
  if v_provider !~ '^[a-z0-9][a-z0-9._-]{1,63}$'
    or v_provider_event_id !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{1,191}$'
    or v_provider_payment_id !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{1,191}$'
    or v_provider_price_ref !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{1,191}$'
    or length(v_recipient_email) not between 3 and 320
    or v_recipient_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_amount_minor is null
    or p_amount_minor <= 0
    or v_currency !~ '^[A-Z]{3}$'
    or p_occurred_at is null
    or p_occurred_at > v_now + interval '5 minutes'
    or v_payload_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception 'INVALID_PAID_LICENSE_EVENT'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_provider || '|' || v_provider_payment_id, 846721)
  );

  select event_row.*
  into v_event
  from private.license_payment_events as event_row
  where event_row.provider = v_provider
    and event_row.provider_event_id = v_provider_event_id
  for update;

  if found then
    if v_event.payload_sha256 <> v_payload_sha256 then
      raise exception 'PAYMENT_EVENT_REPLAY_MISMATCH'
        using errcode = 'P0001';
    end if;

    select job_row.*
    into strict v_job
    from private.license_issuance_jobs as job_row
    where job_row.payment_event_id = v_event.id;

    return jsonb_build_object(
      'accepted', true,
      'duplicate', true,
      'duplicateSource', 'event',
      'paymentEventId', v_event.id,
      'jobId', v_job.id,
      'jobStatus', v_job.status
    );
  end if;

  select event_row.*
  into v_event
  from private.license_payment_events as event_row
  where event_row.provider = v_provider
    and event_row.provider_payment_id = v_provider_payment_id
  for update;

  if found then
    if v_event.provider_price_ref <> v_provider_price_ref
      or v_event.recipient_email <> v_recipient_email
      or v_event.amount_minor <> p_amount_minor
      or v_event.currency <> v_currency
    then
      raise exception 'PAYMENT_ID_REPLAY_MISMATCH'
        using errcode = 'P0001';
    end if;

    select job_row.*
    into strict v_job
    from private.license_issuance_jobs as job_row
    where job_row.payment_event_id = v_event.id;

    return jsonb_build_object(
      'accepted', true,
      'duplicate', true,
      'duplicateSource', 'payment',
      'paymentEventId', v_event.id,
      'jobId', v_job.id,
      'jobStatus', v_job.status
    );
  end if;

  select product_row.*
  into v_product
  from private.license_products as product_row
  where product_row.provider = v_provider
    and product_row.provider_price_ref = v_provider_price_ref
    and product_row.status = 'active'
  for share;

  if not found then
    raise exception 'LICENSE_PRODUCT_NOT_CONFIGURED'
      using errcode = 'P0001';
  end if;

  if v_product.amount_minor <> p_amount_minor
    or v_product.currency <> v_currency
  then
    raise exception 'LICENSE_PRODUCT_PRICE_MISMATCH'
      using errcode = 'P0001';
  end if;

  insert into private.license_payment_events (
    provider,
    provider_event_id,
    provider_payment_id,
    product_id,
    provider_price_ref,
    recipient_email,
    amount_minor,
    currency,
    occurred_at,
    payload_sha256,
    status,
    product_sku_snapshot,
    license_duration_days_snapshot,
    purchase_code_expires_after_days_snapshot,
    max_redemptions_snapshot
  ) values (
    v_provider,
    v_provider_event_id,
    v_provider_payment_id,
    v_product.id,
    v_provider_price_ref,
    v_recipient_email,
    p_amount_minor,
    v_currency,
    p_occurred_at,
    v_payload_sha256,
    'accepted',
    v_product.product_sku,
    v_product.license_duration_days,
    v_product.purchase_code_expires_after_days,
    v_product.max_redemptions
  )
  returning * into v_event;

  insert into private.license_issuance_jobs (
    payment_event_id,
    status,
    next_attempt_at
  ) values (
    v_event.id,
    'pending',
    v_now
  )
  returning * into v_job;

  return jsonb_build_object(
    'accepted', true,
    'duplicate', false,
    'paymentEventId', v_event.id,
    'jobId', v_job.id,
    'jobStatus', v_job.status
  );
end;
$function$;

create or replace function public.claim_license_issuance_jobs_v1(
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

  update private.license_issuance_jobs as stale_delivery
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
        'License issuance exhausted its retry allowance.'
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

create or replace function public.materialize_issued_purchase_code_v1(
  p_job_id uuid,
  p_lease_token uuid,
  p_code_hash text,
  p_code_hash_version text,
  p_code_generation_nonce integer
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
  v_job private.license_issuance_jobs%rowtype;
  v_payment private.license_payment_events%rowtype;
  v_purchase_code public.purchase_codes%rowtype;
  v_expires_at timestamptz;
begin
  if p_job_id is null
    or p_lease_token is null
    or v_code_hash !~ '^[0-9a-f]{64}$'
    or v_code_hash_version <> 'hmac-sha256-v2'
    or p_code_generation_nonce is null
    or p_code_generation_nonce not between 0 and 100
  then
    raise exception 'INVALID_LICENSE_CODE_MATERIALIZATION'
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

    return jsonb_build_object(
      'outcome', 'replayed',
      'purchaseCodeId', v_purchase_code.id,
      'purchaseCodeExpiresAt', v_purchase_code.expires_at,
      'licenseDurationDays', v_purchase_code.license_duration_days,
      'codeGenerationNonce', v_job.code_generation_nonce
    );
  end if;

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

  select payment_row.*
  into strict v_payment
  from private.license_payment_events as payment_row
  where payment_row.id = v_job.payment_event_id
    and payment_row.status = 'accepted';

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

  update private.license_issuance_jobs
  set purchase_code_id = v_purchase_code.id,
      updated_at = v_now
  where id = v_job.id;

  return jsonb_build_object(
    'outcome', 'created',
    'purchaseCodeId', v_purchase_code.id,
    'purchaseCodeExpiresAt', v_purchase_code.expires_at,
    'licenseDurationDays', v_purchase_code.license_duration_days,
    'codeGenerationNonce', v_job.code_generation_nonce
  );
end;
$function$;

create or replace function public.complete_license_issuance_job_v1(
  p_job_id uuid,
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
  v_job private.license_issuance_jobs%rowtype;
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

  update private.license_issuance_jobs
  set status = 'delivered',
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
    'deliveredAt', v_job.delivered_at
  );
end;
$function$;

create or replace function public.read_license_issuance_queue_health_v1()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select jsonb_build_object(
    'pending', count(*) filter (
      where status in ('pending', 'retry')
    ),
    'processing', count(*) filter (
      where status = 'processing'
    ),
    'delivered', count(*) filter (
      where status = 'delivered'
    ),
    'deadLetter', count(*) filter (
      where status = 'dead_letter'
    ),
    'oldestDueAt', min(next_attempt_at) filter (
      where status in ('pending', 'retry')
    ),
    'oldestUndeliveredCreatedAt', min(created_at) filter (
      where status in ('pending', 'processing', 'retry')
    ),
    'secretRotationBlockedJobCount', count(*) filter (
      where purchase_code_id is not null
        and delivered_at is null
        and status in ('pending', 'processing', 'retry', 'dead_letter')
    ),
    'secretRotationBlocked', count(*) filter (
      where purchase_code_id is not null
        and delivered_at is null
        and status in ('pending', 'processing', 'retry', 'dead_letter')
    ) > 0
  )
  from private.license_issuance_jobs;
$function$;

create or replace function public.read_license_issuance_secret_rotation_guard_v1()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select jsonb_build_object(
    'safeToRotateDerivationSecret', count(*) = 0,
    'blockedJobCount', count(*),
    'oldestBlockedJobCreatedAt', min(created_at),
    'requiredAction', case
      when count(*) = 0 then 'none'
      else 'drain_or_reconcile_materialized_undelivered_jobs'
    end
  )
  from private.license_issuance_jobs
  where purchase_code_id is not null
    and delivered_at is null
    and status in ('pending', 'processing', 'retry', 'dead_letter');
$function$;

revoke all on function public.enqueue_paid_license_v1(
  text, text, text, text, text, bigint, text, timestamptz, text
) from public, anon, authenticated;
revoke all on function public.claim_license_issuance_jobs_v1(
  integer, integer
) from public, anon, authenticated;
revoke all on function public.materialize_issued_purchase_code_v1(
  uuid, uuid, text, text, integer
) from public, anon, authenticated;
revoke all on function public.complete_license_issuance_job_v1(
  uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.read_license_issuance_queue_health_v1()
  from public, anon, authenticated;
revoke all on function public.read_license_issuance_secret_rotation_guard_v1()
  from public, anon, authenticated;

grant execute on function public.enqueue_paid_license_v1(
  text, text, text, text, text, bigint, text, timestamptz, text
) to service_role;
grant execute on function public.claim_license_issuance_jobs_v1(
  integer, integer
) to service_role;
grant execute on function public.materialize_issued_purchase_code_v1(
  uuid, uuid, text, text, integer
) to service_role;
grant execute on function public.complete_license_issuance_job_v1(
  uuid, uuid, text
) to service_role;
grant execute on function public.read_license_issuance_queue_health_v1()
  to service_role;
grant execute on function public.read_license_issuance_secret_rotation_guard_v1()
  to service_role;

comment on column private.license_payment_events.product_sku_snapshot is
  'Immutable product SKU accepted with the verified payment. Queue processing never rereads mutable catalog terms.';
comment on column private.license_payment_events.license_duration_days_snapshot is
  'Immutable activated-license duration accepted with the verified payment.';
comment on column private.license_payment_events.purchase_code_expires_after_days_snapshot is
  'Immutable unredeemed-code validity period accepted with the verified payment.';
comment on column private.license_payment_events.max_redemptions_snapshot is
  'Immutable redemption limit accepted with the verified payment; V1 requires exactly one.';
comment on constraint license_issuance_jobs_status_lease_state_check
  on private.license_issuance_jobs is
  'Processing jobs must own a complete lease; every non-processing state must own no lease.';
comment on function public.read_license_issuance_secret_rotation_guard_v1() is
  'Blocks derivation-secret rotation while a materialized code still needs deterministic regeneration for delivery or reconciliation.';

commit;
