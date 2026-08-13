begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table private.license_products (
  id uuid primary key default extensions.gen_random_uuid(),
  provider text not null,
  provider_price_ref text not null,
  product_sku text not null,
  currency text not null,
  amount_minor bigint not null,
  license_duration_days integer not null,
  purchase_code_expires_after_days integer null,
  max_redemptions integer not null default 1,
  status text not null default 'active',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint license_products_provider_check check (
    provider ~ '^[a-z0-9][a-z0-9._-]{1,63}$'
  ),
  constraint license_products_provider_price_ref_check check (
    provider_price_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{1,191}$'
  ),
  constraint license_products_product_sku_check check (
    product_sku ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
  ),
  constraint license_products_currency_check check (
    currency ~ '^[A-Z]{3}$'
  ),
  constraint license_products_amount_minor_check check (
    amount_minor > 0
  ),
  constraint license_products_license_duration_days_check check (
    license_duration_days between 1 and 3650
  ),
  constraint license_products_purchase_code_expiration_check check (
    purchase_code_expires_after_days is null
    or purchase_code_expires_after_days between 1 and 3650
  ),
  constraint license_products_single_redemption_v1_check check (
    max_redemptions = 1
  ),
  constraint license_products_status_check check (
    status in ('active', 'disabled')
  ),
  constraint license_products_provider_price_unique unique (
    provider,
    provider_price_ref
  )
);

create index license_products_provider_sku_idx
on private.license_products (provider, product_sku);

create table private.license_payment_events (
  id uuid primary key default extensions.gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  provider_payment_id text not null,
  product_id uuid not null references private.license_products (id),
  provider_price_ref text not null,
  recipient_email text not null,
  amount_minor bigint not null,
  currency text not null,
  occurred_at timestamptz not null,
  payload_sha256 text not null,
  status text not null default 'accepted',
  created_at timestamptz not null default clock_timestamp(),

  constraint license_payment_events_provider_check check (
    provider ~ '^[a-z0-9][a-z0-9._-]{1,63}$'
  ),
  constraint license_payment_events_event_id_check check (
    provider_event_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{1,191}$'
  ),
  constraint license_payment_events_payment_id_check check (
    provider_payment_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{1,191}$'
  ),
  constraint license_payment_events_price_ref_check check (
    provider_price_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{1,191}$'
  ),
  constraint license_payment_events_email_check check (
    length(recipient_email) between 3 and 320
    and recipient_email = lower(btrim(recipient_email))
    and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint license_payment_events_amount_minor_check check (
    amount_minor > 0
  ),
  constraint license_payment_events_currency_check check (
    currency ~ '^[A-Z]{3}$'
  ),
  constraint license_payment_events_payload_sha256_check check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint license_payment_events_status_check check (
    status in ('accepted', 'cancelled')
  ),
  constraint license_payment_events_provider_event_unique unique (
    provider,
    provider_event_id
  ),
  constraint license_payment_events_provider_payment_unique unique (
    provider,
    provider_payment_id
  )
);

create table private.license_issuance_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  payment_event_id uuid not null unique
    references private.license_payment_events (id),
  purchase_code_id uuid null unique
    references public.purchase_codes (id),
  status text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 12,
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_token uuid null,
  lease_expires_at timestamptz null,
  code_generation_nonce integer not null default 0,
  email_provider_message_id text null,
  last_error_code text null,
  last_error_detail text null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  delivered_at timestamptz null,

  constraint license_issuance_jobs_status_check check (
    status in (
      'pending',
      'processing',
      'retry',
      'delivered',
      'dead_letter',
      'cancelled'
    )
  ),
  constraint license_issuance_jobs_attempt_count_check check (
    attempt_count >= 0
    and max_attempts between 1 and 50
    and attempt_count <= max_attempts
  ),
  constraint license_issuance_jobs_nonce_check check (
    code_generation_nonce between 0 and 100
  ),
  constraint license_issuance_jobs_lease_pair_check check (
    (lease_token is null and lease_expires_at is null)
    or
    (lease_token is not null and lease_expires_at is not null)
  ),
  constraint license_issuance_jobs_delivered_state_check check (
    status <> 'delivered'
    or (
      purchase_code_id is not null
      and delivered_at is not null
      and email_provider_message_id is not null
    )
  )
);

create index license_issuance_jobs_due_idx
on private.license_issuance_jobs (
  status,
  next_attempt_at,
  created_at
);

create index license_issuance_jobs_stale_lease_idx
on private.license_issuance_jobs (lease_expires_at)
where status = 'processing';

alter table private.license_products enable row level security;
alter table private.license_products force row level security;
alter table private.license_payment_events enable row level security;
alter table private.license_payment_events force row level security;
alter table private.license_issuance_jobs enable row level security;
alter table private.license_issuance_jobs force row level security;

revoke all on table private.license_products
  from public, anon, authenticated, service_role;
revoke all on table private.license_payment_events
  from public, anon, authenticated, service_role;
revoke all on table private.license_issuance_jobs
  from public, anon, authenticated, service_role;

create or replace function public.configure_license_product_v1(
  p_provider text,
  p_provider_price_ref text,
  p_product_sku text,
  p_currency text,
  p_amount_minor bigint,
  p_license_duration_days integer,
  p_purchase_code_expires_after_days integer default null,
  p_status text default 'active'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, private, extensions
as $function$
declare
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_provider_price_ref text := btrim(coalesce(p_provider_price_ref, ''));
  v_product_sku text := btrim(coalesce(p_product_sku, ''));
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_product_id uuid;
begin
  if v_provider !~ '^[a-z0-9][a-z0-9._-]{1,63}$'
    or v_provider_price_ref !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{1,191}$'
    or v_product_sku !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
    or v_currency !~ '^[A-Z]{3}$'
    or p_amount_minor is null
    or p_amount_minor <= 0
    or p_license_duration_days is null
    or p_license_duration_days not between 1 and 3650
    or (
      p_purchase_code_expires_after_days is not null
      and p_purchase_code_expires_after_days not between 1 and 3650
    )
    or v_status not in ('active', 'disabled')
  then
    raise exception 'INVALID_LICENSE_PRODUCT_CONFIGURATION'
      using errcode = '22023';
  end if;

  insert into private.license_products (
    provider,
    provider_price_ref,
    product_sku,
    currency,
    amount_minor,
    license_duration_days,
    purchase_code_expires_after_days,
    max_redemptions,
    status
  ) values (
    v_provider,
    v_provider_price_ref,
    v_product_sku,
    v_currency,
    p_amount_minor,
    p_license_duration_days,
    p_purchase_code_expires_after_days,
    1,
    v_status
  )
  on conflict (provider, provider_price_ref)
  do update set
    product_sku = excluded.product_sku,
    currency = excluded.currency,
    amount_minor = excluded.amount_minor,
    license_duration_days = excluded.license_duration_days,
    purchase_code_expires_after_days =
      excluded.purchase_code_expires_after_days,
    max_redemptions = 1,
    status = excluded.status,
    updated_at = clock_timestamp()
  returning id into v_product_id;

  return v_product_id;
end;
$function$;

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
    or p_occurred_at > clock_timestamp() + interval '5 minutes'
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
    status
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
    'accepted'
  )
  returning * into v_event;

  insert into private.license_issuance_jobs (
    payment_event_id,
    status,
    next_attempt_at
  ) values (
    v_event.id,
    'pending',
    clock_timestamp()
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
    where candidate_job.attempt_count < candidate_job.max_attempts
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
    order by candidate_job.next_attempt_at, candidate_job.created_at, candidate_job.id
    for update skip locked
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
    product.product_sku,
    product.license_duration_days,
    product.purchase_code_expires_after_days,
    claimed.purchase_code_id,
    claimed.code_generation_nonce,
    claimed.attempt_count,
    claimed.lease_token
  from claimed
  join private.license_payment_events as payment
    on payment.id = claimed.payment_event_id
  join private.license_products as product
    on product.id = payment.product_id
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
  v_product private.license_products%rowtype;
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
  where payment_row.id = v_job.payment_event_id;

  select product_row.*
  into strict v_product
  from private.license_products as product_row
  where product_row.id = v_payment.product_id;

  v_expires_at := case
    when v_product.purchase_code_expires_after_days is null then null
    else v_now + make_interval(
      days => v_product.purchase_code_expires_after_days
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
      1,
      0,
      v_expires_at,
      v_product.license_duration_days
    )
    returning * into v_purchase_code;
  exception
    when unique_violation then
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

create or replace function public.retry_license_issuance_job_v1(
  p_job_id uuid,
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
    lower(btrim(coalesce(p_error_code, 'license_delivery_failed'))),
    96
  );
  v_error_detail text := left(
    btrim(coalesce(p_error_detail, 'License delivery failed.')),
    500
  );
  v_job private.license_issuance_jobs%rowtype;
  v_next_status text;
begin
  if p_job_id is null
    or p_lease_token is null
    or p_retry_after_seconds not between 1 and 86400
    or v_error_code !~ '^[a-z0-9][a-z0-9._:-]{0,95}$'
  then
    raise exception 'INVALID_LICENSE_DELIVERY_RETRY'
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
  then
    raise exception 'LICENSE_ISSUANCE_LEASE_INVALID'
      using errcode = 'P0001';
  end if;

  v_next_status := case
    when coalesce(p_terminal, false)
      or v_job.attempt_count >= v_job.max_attempts
    then 'dead_letter'
    else 'retry'
  end;

  update private.license_issuance_jobs
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
  where id = v_job.id
  returning * into v_job;

  return jsonb_build_object(
    'jobId', v_job.id,
    'jobStatus', v_job.status,
    'attemptCount', v_job.attempt_count,
    'nextAttemptAt', case
      when v_job.status = 'retry' then v_job.next_attempt_at
      else null
    end
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
    )
  )
  from private.license_issuance_jobs;
$function$;

create table if not exists private.runtime_scheduler_tokens (
  scheduler_name text primary key,
  token_sha256 text not null check (token_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  rotated_at timestamptz null
);

alter table private.runtime_scheduler_tokens enable row level security;
alter table private.runtime_scheduler_tokens force row level security;
revoke all on table private.runtime_scheduler_tokens
  from public, anon, authenticated, service_role;
grant select on table private.runtime_scheduler_tokens to service_role;

create or replace function public.verify_runtime_scheduler_token_v1(
  p_scheduler_name text,
  p_token_sha256 text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select exists (
    select 1
    from private.runtime_scheduler_tokens as token
    where token.scheduler_name = p_scheduler_name
      and token.token_sha256 = lower(btrim(p_token_sha256))
  );
$function$;

create or replace function public.configure_license_issuance_scheduler_v1(
  p_function_url text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, vault, cron, net, extensions
as $function$
declare
  v_scheduler_name constant text :=
    'econovaria-license-issuance-scheduler-v1';
  v_function_url text := lower(btrim(coalesce(p_function_url, '')));
  v_token text;
  v_job_id bigint;
  v_command text;
begin
  if v_function_url !~
    '^https://[a-z0-9]{20}[.]supabase[.]co/functions/v1/license-issuance-worker$'
  then
    raise exception 'INVALID_LICENSE_ISSUANCE_WORKER_URL'
      using errcode = '22023';
  end if;

  select decrypted_secret
  into v_token
  from vault.decrypted_secrets
  where name = v_scheduler_name
  order by created_at desc
  limit 1;

  if v_token is null then
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(
      v_token,
      v_scheduler_name,
      'Internal token for the Econovaria durable license issuance worker.'
    );
  end if;

  insert into private.runtime_scheduler_tokens (
    scheduler_name,
    token_sha256
  ) values (
    v_scheduler_name,
    encode(extensions.digest(v_token, 'sha256'), 'hex')
  )
  on conflict (scheduler_name)
  do update set
    token_sha256 = excluded.token_sha256,
    rotated_at = case
      when private.runtime_scheduler_tokens.token_sha256
        <> excluded.token_sha256
      then clock_timestamp()
      else private.runtime_scheduler_tokens.rotated_at
    end;

  for v_job_id in
    select jobid
    from cron.job
    where jobname = v_scheduler_name
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  v_command := format(
    $command$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-econovaria-scheduler-token', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'econovaria-license-issuance-scheduler-v1'
            order by created_at desc
            limit 1
          )
        ),
        body := '{"source":"pg_cron"}'::jsonb,
        timeout_milliseconds := 50000
      );
    $command$,
    v_function_url
  );

  return cron.schedule(
    v_scheduler_name,
    '* * * * *',
    v_command
  );
end;
$function$;

revoke all on function public.configure_license_product_v1(
  text, text, text, text, bigint, integer, integer, text
) from public, anon, authenticated;
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
revoke all on function public.retry_license_issuance_job_v1(
  uuid, uuid, text, text, integer, boolean
) from public, anon, authenticated;
revoke all on function public.read_license_issuance_queue_health_v1()
  from public, anon, authenticated;
revoke all on function public.verify_runtime_scheduler_token_v1(
  text, text
) from public, anon, authenticated;
revoke all on function public.configure_license_issuance_scheduler_v1(
  text
) from public, anon, authenticated;

grant execute on function public.configure_license_product_v1(
  text, text, text, text, bigint, integer, integer, text
) to service_role;
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
grant execute on function public.retry_license_issuance_job_v1(
  uuid, uuid, text, text, integer, boolean
) to service_role;
grant execute on function public.read_license_issuance_queue_health_v1()
  to service_role;
grant execute on function public.verify_runtime_scheduler_token_v1(
  text, text
) to service_role;
grant execute on function public.configure_license_issuance_scheduler_v1(
  text
) to service_role;

comment on table private.license_products is
  'Server-owned mapping from a payment-provider price reference to an Econovaria license entitlement. Webhook payloads cannot choose license duration.';
comment on table private.license_payment_events is
  'Durable, idempotent receipts for successful payment events. Raw webhook payloads are not retained.';
comment on table private.license_issuance_jobs is
  'Postgres-backed at-least-once queue for deterministic license-code materialization and idempotent email delivery.';
comment on function public.enqueue_paid_license_v1(
  text, text, text, text, text, bigint, text, timestamptz, text
) is
  'Atomically records a verified successful payment and its one durable license issuance job. Event and payment identifiers are both idempotency boundaries.';
comment on function public.claim_license_issuance_jobs_v1(
  integer, integer
) is
  'Claims due license jobs with FOR UPDATE SKIP LOCKED and expiring leases so parallel workers cannot lose or double-own work.';
comment on function public.materialize_issued_purchase_code_v1(
  uuid, uuid, text, text, integer
) is
  'Creates the HMAC-only purchase-code record exactly once for a leased job. The plaintext license code is never stored.';
comment on function public.configure_license_issuance_scheduler_v1(
  text
) is
  'Configures the Vault-authenticated one-minute database clock for the durable license issuance worker.';

commit;
