begin;

create or replace function public.run_due_autonomous_timed_services_v1(
  p_now timestamptz default clock_timestamp()
)
returns table(
  game_session_id uuid,
  marketplace_listings_expired integer,
  loans_accrued integer,
  loans_delinquent integer,
  loans_defaulted integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_game record;
  v_marketplace_expired integer;
  v_loans_accrued integer;
  v_loans_delinquent integer;
  v_loans_defaulted integer;
begin
  if p_now is null then
    raise exception using errcode = '22023', message = 'current time is required';
  end if;

  for v_game in
    select gs.id
    from public.game_sessions gs
    where gs.status = 'active'
      and gs.lifecycle_state = 'active'
      and gs.provisioning_status = 'ready'
    order by gs.id
  loop
    v_marketplace_expired := public.expire_marketplace_listings_v1(
      v_game.id,
      p_now
    );

    select
      serviced.loans_accrued,
      serviced.loans_delinquent,
      serviced.loans_defaulted
    into
      v_loans_accrued,
      v_loans_delinquent,
      v_loans_defaulted
    from public.service_player_loan_status_v1(v_game.id, p_now) serviced;

    game_session_id := v_game.id;
    marketplace_listings_expired := coalesce(v_marketplace_expired, 0);
    loans_accrued := coalesce(v_loans_accrued, 0);
    loans_delinquent := coalesce(v_loans_delinquent, 0);
    loans_defaulted := coalesce(v_loans_defaulted, 0);
    return next;
  end loop;
end;
$$;

revoke all on function public.run_due_autonomous_timed_services_v1(timestamptz)
  from public, anon, authenticated;
grant execute on function public.run_due_autonomous_timed_services_v1(timestamptz)
  to service_role;

comment on function public.run_due_autonomous_timed_services_v1(timestamptz) is
  'Runs deterministic time-driven maintenance for active ready games: Marketplace listing/reservation expiry and Player loan accrual, delinquency, default, and credit recalculation.';

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'econovaria-autonomous-timed-services-v1'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'econovaria-autonomous-timed-services-v1',
    '* * * * *',
    $cron$select * from public.run_due_autonomous_timed_services_v1(clock_timestamp());$cron$
  );
end;
$$;

commit;
