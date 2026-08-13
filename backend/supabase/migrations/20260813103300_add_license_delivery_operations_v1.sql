begin;

create or replace function public.read_license_issuance_queue_health_v1()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  with issuance as (
    select
      count(*) filter (where status in ('pending', 'retry')) as pending,
      count(*) filter (where status = 'processing') as processing,
      count(*) filter (where status = 'issued') as issued,
      count(*) filter (where status = 'delivered') as delivered,
      count(*) filter (where status = 'dead_letter') as dead_letter,
      count(*) filter (where status = 'cancelled') as cancelled,
      min(next_attempt_at) filter (
        where status in ('pending', 'retry')
      ) as oldest_due_at,
      min(created_at) filter (
        where status in ('pending', 'processing', 'retry')
      ) as oldest_unissued_created_at
    from private.license_issuance_jobs
  ),
  email as (
    select
      count(*) filter (where status in ('pending', 'retry')) as pending,
      count(*) filter (where status = 'processing') as processing,
      count(*) filter (where status = 'delivered') as delivered,
      count(*) filter (where status = 'dead_letter') as dead_letter,
      count(*) filter (where status = 'cancelled') as cancelled,
      min(next_attempt_at) filter (
        where status in ('pending', 'retry')
      ) as oldest_due_at,
      min(created_at) filter (
        where status in ('pending', 'processing', 'retry')
      ) as oldest_undelivered_created_at
    from private.license_email_outbox
  )
  select jsonb_build_object(
    'pending', issuance.pending + email.pending,
    'processing', issuance.processing + email.processing,
    'issuedAwaitingEmail', issuance.issued,
    'delivered', issuance.delivered,
    'deadLetter', issuance.dead_letter + email.dead_letter,
    'cancelled', issuance.cancelled + email.cancelled,
    'oldestDueAt', least(issuance.oldest_due_at, email.oldest_due_at),
    'oldestUndeliveredCreatedAt', least(
      issuance.oldest_unissued_created_at,
      email.oldest_undelivered_created_at
    ),
    'issuance', jsonb_build_object(
      'pending', issuance.pending,
      'processing', issuance.processing,
      'issued', issuance.issued,
      'delivered', issuance.delivered,
      'deadLetter', issuance.dead_letter,
      'cancelled', issuance.cancelled,
      'oldestDueAt', issuance.oldest_due_at,
      'oldestUnissuedCreatedAt', issuance.oldest_unissued_created_at
    ),
    'email', jsonb_build_object(
      'pending', email.pending,
      'processing', email.processing,
      'delivered', email.delivered,
      'deadLetter', email.dead_letter,
      'cancelled', email.cancelled,
      'oldestDueAt', email.oldest_due_at,
      'oldestUndeliveredCreatedAt', email.oldest_undelivered_created_at
    )
  )
  from issuance, email;
$function$;

create or replace function public.read_license_fulfillment_reconciliation_v1()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  with metrics as (
    select
      (
        select count(*)
        from private.license_payment_events as payment
        where payment.status = 'accepted'
          and not exists (
            select 1
            from private.license_issuance_jobs as issuance
            where issuance.payment_event_id = payment.id
          )
      ) as accepted_payments_missing_issuance_jobs,
      (
        select count(*)
        from private.license_issuance_jobs as issuance
        where issuance.purchase_code_id is not null
          and issuance.status in ('issued', 'delivered')
          and not exists (
            select 1
            from private.license_email_outbox as email
            where email.issuance_job_id = issuance.id
          )
      ) as materialized_issuance_missing_email_outbox,
      (
        select count(*)
        from private.license_email_outbox as email
        where not exists (
          select 1
          from public.purchase_codes as purchase_code
          where purchase_code.id = email.purchase_code_id
        )
      ) as email_outbox_missing_purchase_code,
      (
        select count(*)
        from private.license_issuance_jobs as issuance
        where issuance.status = 'delivered'
          and not exists (
            select 1
            from private.license_email_outbox as email
            where email.issuance_job_id = issuance.id
              and email.status = 'delivered'
          )
      ) as delivered_issuance_missing_delivered_email,
      (
        select count(*)
        from private.license_email_outbox as email
        where email.status = 'delivered'
          and not exists (
            select 1
            from private.license_issuance_jobs as issuance
            where issuance.id = email.issuance_job_id
              and issuance.status = 'delivered'
          )
      ) as delivered_email_missing_delivered_issuance,
      (
        select count(*)
        from private.license_email_outbox as email
        join private.license_payment_events as payment
          on payment.id = email.payment_event_id
        where payment.status <> 'accepted'
          and email.status in ('pending', 'processing', 'retry')
      ) as active_email_for_nonaccepted_payment
  )
  select jsonb_build_object(
    'healthy',
      accepted_payments_missing_issuance_jobs = 0
      and materialized_issuance_missing_email_outbox = 0
      and email_outbox_missing_purchase_code = 0
      and delivered_issuance_missing_delivered_email = 0
      and delivered_email_missing_delivered_issuance = 0
      and active_email_for_nonaccepted_payment = 0,
    'acceptedPaymentsMissingIssuanceJobs',
      accepted_payments_missing_issuance_jobs,
    'materializedIssuanceMissingEmailOutbox',
      materialized_issuance_missing_email_outbox,
    'emailOutboxMissingPurchaseCode',
      email_outbox_missing_purchase_code,
    'deliveredIssuanceMissingDeliveredEmail',
      delivered_issuance_missing_delivered_email,
    'deliveredEmailMissingDeliveredIssuance',
      delivered_email_missing_delivered_issuance,
    'activeEmailForNonacceptedPayment',
      active_email_for_nonaccepted_payment
  )
  from metrics;
$function$;

create or replace function public.read_license_issuance_secret_rotation_guard_v1()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  with blocked as (
    select issuance.created_at
    from private.license_issuance_jobs as issuance
    left join private.license_email_outbox as email
      on email.issuance_job_id = issuance.id
    where issuance.purchase_code_id is not null
      and (
        email.id is null
        or email.status in (
          'pending',
          'processing',
          'retry',
          'dead_letter'
        )
      )
  )
  select jsonb_build_object(
    'safeToRotateDerivationSecret', count(*) = 0,
    'blockedJobCount', count(*),
    'secretRotationBlockedJobCount', count(*),
    'oldestBlockedJobCreatedAt', min(created_at),
    'requiredAction', case
      when count(*) = 0 then 'none'
      else 'drain_or_reconcile_materialized_undelivered_jobs'
    end
  )
  from blocked;
$function$;

create or replace function public.configure_license_email_scheduler_v1(
  p_function_url text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, vault, cron, net, extensions
as $function$
declare
  v_scheduler_name constant text :=
    'econovaria-license-email-scheduler-v1';
  v_function_url text := lower(btrim(coalesce(p_function_url, '')));
  v_token text;
  v_job_id bigint;
  v_command text;
begin
  if v_function_url !~
    '^https://[a-z0-9]{20}[.]supabase[.]co/functions/v1/license-email-worker$'
  then
    raise exception 'INVALID_LICENSE_EMAIL_WORKER_URL'
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
      'Internal token for the Econovaria durable license email worker.'
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
            where name = 'econovaria-license-email-scheduler-v1'
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

create or replace function public.disable_license_email_scheduler_v1()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, cron
as $function$
declare
  v_scheduler_name constant text :=
    'econovaria-license-email-scheduler-v1';
  v_job_id bigint;
  v_disabled integer := 0;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = v_scheduler_name
  loop
    perform cron.unschedule(v_job_id);
    v_disabled := v_disabled + 1;
  end loop;

  return v_disabled;
end;
$function$;

revoke all on function public.read_license_fulfillment_reconciliation_v1()
  from public, anon, authenticated;
revoke all on function public.read_license_issuance_secret_rotation_guard_v1()
  from public, anon, authenticated;
revoke all on function public.configure_license_email_scheduler_v1(text)
  from public, anon, authenticated;
revoke all on function public.disable_license_email_scheduler_v1()
  from public, anon, authenticated;

grant execute on function public.read_license_fulfillment_reconciliation_v1()
  to service_role;
grant execute on function public.read_license_issuance_secret_rotation_guard_v1()
  to service_role;
grant execute on function public.configure_license_email_scheduler_v1(text)
  to service_role;
grant execute on function public.disable_license_email_scheduler_v1()
  to service_role;

comment on function public.read_license_fulfillment_reconciliation_v1() is
  'Reports payment, issuance, purchase-code, and email-outbox invariant gaps without mutating records.';
comment on function public.read_license_issuance_secret_rotation_guard_v1() is
  'Blocks derivation-secret rotation while any materialized code still needs deterministic regeneration for email delivery or reconciliation.';
comment on function public.configure_license_email_scheduler_v1(text) is
  'Configures the Vault-authenticated one-minute scheduler for the durable license email worker.';

commit;
