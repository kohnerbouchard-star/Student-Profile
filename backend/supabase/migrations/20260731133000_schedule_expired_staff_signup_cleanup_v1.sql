begin;

create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select job.jobid
    from cron.job as job
    where job.jobname = 'econovaria-expired-staff-signup-cleanup-v1'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'econovaria-expired-staff-signup-cleanup-v1',
    '*/15 * * * *',
    $cron$select * from public.claim_expired_staff_signup_cleanup_v1(100);$cron$
  );
end;
$$;

comment on function public.claim_expired_staff_signup_cleanup_v1(integer) is
  'Deletes expired unconfirmed Auth identities in bounded batches. Supabase Cron invokes it every 15 minutes; confirmed identities are preserved on security hold.';

commit;
