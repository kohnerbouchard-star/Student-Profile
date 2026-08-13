begin;

create or replace function public.disable_license_issuance_scheduler_v1()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, cron
as $function$
declare
  v_scheduler_name constant text :=
    'econovaria-license-issuance-scheduler-v1';
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

revoke all on function public.disable_license_issuance_scheduler_v1()
  from public, anon, authenticated;

grant execute on function public.disable_license_issuance_scheduler_v1()
  to service_role;

comment on function public.disable_license_issuance_scheduler_v1() is
  'Service-role kill switch that removes every durable license issuance cron job. Use before secret rotation, provider changes, incident response, or pre-production staging holds.';

commit;
