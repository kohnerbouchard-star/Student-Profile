begin;

update private.story_character_reply_runtime
set max_batch_size = 200,
    updated_at = clock_timestamp()
where singleton = true;

do $block$
declare
  v_job_id bigint;
begin
  if to_regnamespace('cron') is not null then
    for v_job_id in
      select jobid
      from cron.job
      where jobname in (
        'econovaria-story-character-replies-v1',
        'econovaria-story-character-replies-log-prune-v1'
      )
    loop
      perform cron.unschedule(v_job_id);
    end loop;

    perform cron.schedule(
      'econovaria-story-character-replies-v1',
      '10 seconds',
      $cron$select public.process_due_story_character_reply_jobs_v1(200, clock_timestamp());$cron$
    );

    perform cron.schedule(
      'econovaria-story-character-replies-log-prune-v1',
      '17 3 * * *',
      $cron$
        delete from cron.job_run_details
        where end_time < now() - interval '7 days'
          and jobid in (
            select jobid
            from cron.job
            where jobname = 'econovaria-story-character-replies-v1'
          );
      $cron$
    );
  end if;
end;
$block$;

comment on table private.story_character_reply_runtime is
  'Runtime controls for the character reply worker. V1 processes up to 200 due jobs every 10 seconds through one serialized pg_cron job; SKIP LOCKED keeps the processor safe for future parallel workers.';

commit;
