begin;

alter table private.license_issuance_jobs
  add column first_delivery_attempt_at timestamptz null;

alter table private.license_issuance_jobs
  add constraint license_issuance_jobs_first_delivery_attempt_check
  check (
    first_delivery_attempt_at is null
    or first_delivery_attempt_at >= created_at - interval '5 minutes'
  );

create index license_issuance_jobs_first_delivery_attempt_idx
on private.license_issuance_jobs (first_delivery_attempt_at)
where status in ('pending', 'processing', 'retry');

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
    order by
      candidate_job.next_attempt_at,
      candidate_job.created_at,
      candidate_job.id
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

revoke all on function public.claim_license_issuance_jobs_v1(
  integer, integer
) from public, anon, authenticated;

grant execute on function public.claim_license_issuance_jobs_v1(
  integer, integer
) to service_role;

comment on column private.license_issuance_jobs.first_delivery_attempt_at is
  'Start of the email-provider idempotency safety window. Automatic retries stop before the provider key can expire.';
comment on function public.claim_license_issuance_jobs_v1(
  integer, integer
) is
  'Claims due jobs with SKIP LOCKED leases, records the first delivery attempt, and dead-letters unresolved deliveries before the 24-hour email idempotency key can expire.';

commit;
