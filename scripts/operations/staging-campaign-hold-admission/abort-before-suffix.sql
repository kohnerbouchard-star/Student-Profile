-- Owner-controlled inverse of install before any suffix change or serving epoch.
-- psql variable fence_epoch is the exact held epoch from the committed install.
begin;
set local lock_timeout = '5s';
set local search_path = pg_catalog, pg_temp;
select set_config('econovaria.staging_campaign_abort_epoch', :'fence_epoch', true);

do $$
declare current_fence staging_campaign.fence%rowtype;
begin
  select * into strict current_fence from staging_campaign.fence for update;
  if not current_fence.held or current_fence.opened_once
     or current_fence.drained_at is null
     or current_fence.epoch is distinct from current_setting('econovaria.staging_campaign_abort_epoch')::uuid
     or exists(select 1 from supabase_migrations.schema_migrations where version > '20260921044500')
     or not exists(
       select 1 from supabase_migrations.schema_migrations
       where version = '20260921044500' and cardinality(statements) = 1
         and encode(sha256(convert_to(statements[1],'UTF8')),'hex') = '5c561f2bd09a2c010cb36650242c29a04d3b2ad8920043c1055db6f350d38d54'
     )
     or to_regprocedure('public.complete_campaign_effect_command_v2(text,timestamptz,integer)') is not null
     or to_regprocedure('public.fail_campaign_effect_command_v2(text,text,integer)') is not null
  then raise exception 'CAMPAIGN_FENCE_ABORT_NOT_SAFE'; end if;
end;
$$;

drop function public.write_staging_campaign_v1(uuid,text,jsonb,text,integer);
drop function public.authorize_staging_campaign_worker_v1(text);
drop function public.verify_runtime_scheduler_token_v1(text,text);
drop function public.apply_world_route_state_v1(uuid,bigint,text,jsonb,text,text,integer,integer,timestamptz);
drop function public.execute_campaign_event_atomic_v2(uuid,text,bigint,text,text,text,text,boolean,jsonb,jsonb,timestamptz,uuid,text,timestamptz);
alter function staging_campaign.verify_runtime_scheduler_token_v1(text,text) set schema public;
alter function staging_campaign.apply_world_route_state_v1(uuid,bigint,text,jsonb,text,text,integer,integer,timestamptz) set schema public;
alter function staging_campaign.execute_campaign_event_atomic_v2(uuid,text,bigint,text,text,text,text,boolean,jsonb,jsonb,timestamptz,uuid,text,timestamptz)
  set schema public;

do $$
declare
  rpc record;
  entry record;
  recipient text;
begin
  for rpc in
    select saved.*,p.prosrc,p.proowner,p.pronamespace,p.proname
    from staging_campaign.original_rpcs saved left join pg_proc p on p.oid = saved.original_oid
  loop
    if rpc.proname is distinct from rpc.original_name
       or rpc.pronamespace is distinct from 'public'::regnamespace::oid
       or rpc.proowner is distinct from rpc.owner_oid
       or md5(rpc.prosrc) is distinct from rpc.body_digest
    then raise exception 'CAMPAIGN_FENCE_ORIGINAL_ROUTINE_DRIFT'; end if;
    for entry in select * from aclexplode(rpc.original_acl) where grantee <> rpc.owner_oid
    loop
      recipient := case when entry.grantee = 0 then 'PUBLIC' else quote_ident(pg_get_userbyid(entry.grantee)) end;
      execute format('grant execute on function %s to %s%s', rpc.original_oid::regprocedure, recipient,
                     case when entry.is_grantable then ' with grant option' else '' end);
    end loop;
    if exists(
      (select * from aclexplode((select proacl from pg_proc where oid = rpc.original_oid))
       except select * from aclexplode(rpc.original_acl))
      union all
      (select * from aclexplode(rpc.original_acl)
       except select * from aclexplode((select proacl from pg_proc where oid = rpc.original_oid)))
    ) then raise exception 'CAMPAIGN_FENCE_ORIGINAL_GRANTS_DRIFT'; end if;
  end loop;
end;
$$;

drop trigger staging_campaign_smoke_scope on public.campaign_effect_commands;
drop trigger staging_campaign_route_keys on public.campaign_effect_commands;
drop trigger staging_campaign_hold on public.campaign_effect_commands;
drop trigger staging_campaign_hold on public.campaign_instances;
drop trigger staging_campaign_hold on public.campaign_event_executions;
drop trigger staging_campaign_hold on public.campaign_admin_audit;
drop trigger staging_campaign_hold on public.campaign_effect_recovery_audit;
drop trigger staging_campaign_hold on public.campaign_outcome_evidence_snapshots;
drop trigger staging_campaign_hold on public.campaign_effect_application_receipts;
drop function staging_campaign.open_after_cutover(uuid);
drop function staging_campaign.seal_v2(uuid);
drop function staging_campaign.start_smoke(uuid,uuid,text,text);
drop function staging_campaign.finish_smoke(uuid);
drop function staging_campaign.dispatch(uuid,text,jsonb,text,integer);
drop function staging_campaign.guard_smoke_row();
drop function staging_campaign.attest_drain(uuid);
drop function staging_campaign.hold(uuid);
drop function staging_campaign.reserve_route_key();
drop function staging_campaign.pause_campaign_mutations();
drop function staging_campaign.require_open(uuid);
drop table staging_campaign.smoke_window, staging_campaign.smoke_transactions, staging_campaign.original_rpcs, staging_campaign.leases, staging_campaign.route_keys, staging_campaign.fence;
drop schema staging_campaign;
notify pgrst, 'reload schema';
commit;
