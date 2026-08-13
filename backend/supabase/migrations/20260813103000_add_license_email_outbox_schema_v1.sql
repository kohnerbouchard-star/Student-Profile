begin;


-- This is a rolling internal-worker migration. Stop new claims and refuse to
-- proceed while a previous worker still owns a live lease.
select public.disable_license_issuance_scheduler_v1();

do $migration_guard$
begin
  if exists (
    select 1
    from private.license_issuance_jobs
    where status = 'processing'
      and lease_expires_at > clock_timestamp()
  ) then
    raise exception 'LICENSE_OUTBOX_MIGRATION_ACTIVE_LEASES'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from private.license_issuance_jobs
    where status = 'delivered'
      and (
        email_provider_message_id is null
        or length(email_provider_message_id) not between 1 and 255
        or email_provider_message_id ~ '[[:cntrl:]]'
      )
  ) then
    raise exception 'LICENSE_OUTBOX_MIGRATION_INVALID_DELIVERY_EVIDENCE'
      using errcode = 'P0001';
  end if;
end;
$migration_guard$;

alter table private.license_issuance_jobs
  add column issued_at timestamptz null;

update private.license_issuance_jobs
set issued_at = coalesce(delivered_at, updated_at, created_at)
where purchase_code_id is not null
  and issued_at is null;

alter table private.license_issuance_jobs
  drop constraint license_issuance_jobs_status_check,
  drop constraint license_issuance_jobs_delivered_state_check;

alter table private.license_issuance_jobs
  add constraint license_issuance_jobs_status_check check (
    status in (
      'pending',
      'processing',
      'retry',
      'issued',
      'delivered',
      'dead_letter',
      'cancelled'
    )
  ),
  add constraint license_issuance_jobs_materialized_state_check check (
    status not in ('issued', 'delivered')
    or (
      purchase_code_id is not null
      and issued_at is not null
    )
  ),
  add constraint license_issuance_jobs_delivered_state_check check (
    status <> 'delivered'
    or (
      purchase_code_id is not null
      and delivered_at is not null
      and email_provider_message_id is not null
    )
  );

create table private.license_email_outbox (
  id uuid primary key default extensions.gen_random_uuid(),
  issuance_job_id uuid not null unique
    references private.license_issuance_jobs (id),
  payment_event_id uuid not null
    references private.license_payment_events (id),
  purchase_code_id uuid not null unique
    references public.purchase_codes (id),
  recipient_email text not null,
  template_version text not null default 'license-issued-v1',
  idempotency_key text not null unique,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 12,
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_token uuid null,
  lease_expires_at timestamptz null,
  first_delivery_attempt_at timestamptz null,
  email_provider_message_id text null,
  last_error_code text null,
  last_error_detail text null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  delivered_at timestamptz null,

  constraint license_email_outbox_email_check check (
    length(recipient_email) between 3 and 320
    and recipient_email = lower(btrim(recipient_email))
    and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint license_email_outbox_template_version_check check (
    template_version ~ '^[a-z0-9][a-z0-9._-]{2,63}$'
  ),
  constraint license_email_outbox_idempotency_key_check check (
    idempotency_key =
      'license-issuance/' || issuance_job_id::text || '/delivery-v1'
  ),
  constraint license_email_outbox_status_check check (
    status in (
      'pending',
      'processing',
      'retry',
      'delivered',
      'dead_letter',
      'cancelled'
    )
  ),
  constraint license_email_outbox_attempt_count_check check (
    attempt_count >= 0
    and max_attempts between 1 and 50
    and attempt_count <= max_attempts
  ),
  constraint license_email_outbox_lease_pair_check check (
    (lease_token is null and lease_expires_at is null)
    or
    (lease_token is not null and lease_expires_at is not null)
  ),
  constraint license_email_outbox_status_lease_state_check check (
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
  ),
  constraint license_email_outbox_first_attempt_check check (
    first_delivery_attempt_at is null
    or first_delivery_attempt_at >= created_at - interval '5 minutes'
  ),
  constraint license_email_outbox_message_id_check check (
    email_provider_message_id is null
    or (
      length(email_provider_message_id) between 1 and 255
      and email_provider_message_id !~ '[[:cntrl:]]'
    )
  ),
  constraint license_email_outbox_error_code_check check (
    last_error_code is null
    or last_error_code ~ '^[a-z0-9][a-z0-9._:-]{0,95}$'
  ),
  constraint license_email_outbox_error_detail_check check (
    last_error_detail is null
    or length(last_error_detail) between 1 and 500
  ),
  constraint license_email_outbox_delivered_state_check check (
    status <> 'delivered'
    or (
      delivered_at is not null
      and email_provider_message_id is not null
    )
  )
);

create index license_email_outbox_due_idx
on private.license_email_outbox (
  status,
  next_attempt_at,
  created_at
);

create index license_email_outbox_stale_lease_idx
on private.license_email_outbox (lease_expires_at)
where status = 'processing';

create index license_email_outbox_first_attempt_idx
on private.license_email_outbox (first_delivery_attempt_at)
where status in ('pending', 'processing', 'retry');

alter table private.license_email_outbox enable row level security;
alter table private.license_email_outbox force row level security;
revoke all on table private.license_email_outbox
  from public, anon, authenticated, service_role;

-- Preserve historical delivery evidence and move any materialized-but-not-
-- delivered job into the new email phase. The active-lease guard above makes
-- this deterministic during a rolling release.
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
  last_error_code,
  last_error_detail,
  created_at,
  updated_at,
  delivered_at
)
select
  issuance.id,
  issuance.payment_event_id,
  issuance.purchase_code_id,
  payment.recipient_email,
  'license-issued-v1',
  'license-issuance/' || issuance.id::text || '/delivery-v1',
  case
    when issuance.status = 'delivered' then 'delivered'
    when issuance.status = 'dead_letter' then 'dead_letter'
    when issuance.status = 'cancelled' then 'cancelled'
    else 'pending'
  end,
  least(issuance.attempt_count, issuance.max_attempts),
  issuance.max_attempts,
  case
    when issuance.status in ('pending', 'processing', 'retry')
      then clock_timestamp()
    else issuance.next_attempt_at
  end,
  issuance.first_delivery_attempt_at,
  issuance.email_provider_message_id,
  case
    when issuance.last_error_code ~ '^[a-z0-9][a-z0-9._:-]{0,95}$'
      then issuance.last_error_code
    else null
  end,
  nullif(left(btrim(issuance.last_error_detail), 500), ''),
  issuance.created_at,
  clock_timestamp(),
  issuance.delivered_at
from private.license_issuance_jobs as issuance
join private.license_payment_events as payment
  on payment.id = issuance.payment_event_id
where issuance.purchase_code_id is not null
on conflict (issuance_job_id) do nothing;

update private.license_issuance_jobs
set status = case
      when status = 'delivered' then 'delivered'
      when status = 'cancelled' then 'cancelled'
      else 'issued'
    end,
    issued_at = coalesce(issued_at, delivered_at, updated_at, created_at),
    lease_token = null,
    lease_expires_at = null,
    first_delivery_attempt_at = null,
    last_error_code = null,
    last_error_detail = null,
    updated_at = clock_timestamp()
where purchase_code_id is not null;

update private.license_issuance_jobs
set first_delivery_attempt_at = null,
    email_provider_message_id = null,
    delivered_at = null,
    updated_at = clock_timestamp()
where purchase_code_id is null;

commit;
