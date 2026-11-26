-- Staging maintenance packet. Run as the bound operator in one transaction.
-- The operational apply workflow does not consume this local candidate.
begin;
set local lock_timeout = '5s';

create schema staging_campaign;
revoke all on schema staging_campaign from public, anon, authenticated, service_role;
set local search_path = pg_catalog, pg_temp;

create table staging_campaign.fence (
  singleton boolean primary key check(singleton),
  epoch uuid not null,
  held boolean not null,
  changed_xid xid8 not null,
  opened_once boolean not null default false,
  sealed boolean not null default false,
  smoke_passed boolean not null default false,
  drained_at timestamptz
);
insert into staging_campaign.fence(singleton,epoch,held,changed_xid) values(true,gen_random_uuid(),true,pg_current_xact_id());

create table staging_campaign.smoke_window (
  singleton boolean primary key check(singleton), epoch uuid not null unique,
  game_id uuid not null, command_id text not null, token_sha256 text not null, expires_at timestamptz not null
);
create table staging_campaign.smoke_transactions (
  xid xid8 primary key, epoch uuid not null, game_id uuid not null, command_id text not null
);

-- Operators only. Assess on a new connection after the hold commit. Count
-- every still-open transaction that could have passed an old privilege check.
create function staging_campaign.attest_drain(p_epoch uuid) returns boolean
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  state staging_campaign.fence%rowtype;
  boundary timestamptz;
begin
  select * into strict state from staging_campaign.fence for update;
  if not state.held or state.epoch is distinct from p_epoch
     or state.changed_xid = pg_current_xact_id()
     or not pg_has_role(current_user, 'pg_read_all_stats', 'USAGE')
  then raise exception 'CAMPAIGN_FENCE_DRAIN_UNAVAILABLE'; end if;
  boundary := clock_timestamp();
  perform pg_stat_clear_snapshot();
  if exists (
    select 1 from pg_stat_activity as activity
    where activity.datname = current_database() and activity.pid <> pg_backend_pid()
      and (activity.state is null or activity.state = 'disabled' or activity.xact_start <= boundary)
  ) or exists (select 1 from pg_prepared_xacts where database = current_database())
  then
    update staging_campaign.fence set drained_at = null;
    return false;
  end if;
  update staging_campaign.fence set drained_at = boundary;
  return true;
end;
$$;

create function staging_campaign.hold(p_epoch uuid) returns uuid
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare next_epoch uuid := gen_random_uuid();
begin
  update staging_campaign.fence
  set epoch = next_epoch, held = true, changed_xid = pg_current_xact_id(), drained_at = null
  where not held and epoch = p_epoch;
  if not found then raise exception 'CAMPAIGN_FENCE_EPOCH_CHANGED'; end if;
  return next_epoch;
end;
$$;

-- A share lock lives through the caller's transaction, including the effect
-- and its receipt. A close waits for approved mutations before it commits.
create function staging_campaign.require_open(p_epoch uuid) returns void
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare state staging_campaign.fence%rowtype;
begin
  select * into strict state from staging_campaign.fence for share;
  if state.held then
    if p_epoch is not null and exists(
      select 1 from staging_campaign.smoke_transactions where xid=pg_current_xact_id_if_assigned() and epoch=p_epoch
    ) then return; end if;
    raise exception 'CAMPAIGN_STAGING_HELD';
  end if;
  if p_epoch is not null and state.epoch <> p_epoch
  then raise exception 'CAMPAIGN_FENCE_EPOCH_CHANGED'; end if;
end;
$$;

create function staging_campaign.pause_campaign_mutations() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if tg_table_name='campaign_effect_commands' and tg_op='UPDATE' and exists(
    select 1 from staging_campaign.smoke_transactions where xid=pg_current_xact_id_if_assigned()
  ) then return null; end if;
  perform staging_campaign.require_open(null);
  return null;
end;
$$;

create function staging_campaign.guard_smoke_row() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare scope staging_campaign.smoke_transactions%rowtype;
begin
  select * into scope from staging_campaign.smoke_transactions where xid=pg_current_xact_id_if_assigned();
  if found and (old.game_session_id is distinct from scope.game_id or new.game_session_id is distinct from scope.game_id
    or old.public_id is distinct from scope.command_id or new.public_id is distinct from scope.command_id)
  then raise exception 'CAMPAIGN_FENCE_SMOKE_SCOPE'; end if;
  return new;
end;
$$;
create trigger staging_campaign_smoke_scope before update on public.campaign_effect_commands
  for each row execute function staging_campaign.guard_smoke_row();

create trigger staging_campaign_hold before insert or update or delete or truncate on public.campaign_instances
  for each statement execute function staging_campaign.pause_campaign_mutations();
create trigger staging_campaign_hold before insert or update or delete or truncate on public.campaign_effect_commands
  for each statement execute function staging_campaign.pause_campaign_mutations();
create trigger staging_campaign_hold before insert or update or delete or truncate on public.campaign_event_executions
  for each statement execute function staging_campaign.pause_campaign_mutations();
create trigger staging_campaign_hold before insert or update or delete or truncate on public.campaign_admin_audit
  for each statement execute function staging_campaign.pause_campaign_mutations();
create trigger staging_campaign_hold before insert or update or delete or truncate on public.campaign_effect_recovery_audit
  for each statement execute function staging_campaign.pause_campaign_mutations();
create trigger staging_campaign_hold before insert or update or delete or truncate on public.campaign_outcome_evidence_snapshots
  for each statement execute function staging_campaign.pause_campaign_mutations();
create trigger staging_campaign_hold before insert or update or delete or truncate on public.campaign_effect_application_receipts
  for each statement execute function staging_campaign.pause_campaign_mutations();

-- The outbox trigger's conflicting DDL lock is already held. Keep the keys
-- through deletion, so a previously claimed route command stays identifiable.
create table staging_campaign.route_keys (
  game_id uuid not null,
  command_key text not null,
  primary key(game_id, command_key)
);
insert into staging_campaign.route_keys
select game_session_id, idempotency_key from public.campaign_effect_commands where effect_kind = 'set_route_state';

create table staging_campaign.leases (
  command_id text primary key references public.campaign_effect_commands(public_id) on delete cascade,
  epoch uuid not null,
  attempt integer not null check(attempt between 1 and 25)
);

create function staging_campaign.reserve_route_key() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  insert into staging_campaign.route_keys values(new.game_session_id, new.idempotency_key) on conflict do nothing;
  return new;
end;
$$;
create trigger staging_campaign_route_keys after insert or update of effect_kind, idempotency_key, game_session_id
  on public.campaign_effect_commands for each row when (new.effect_kind = 'set_route_state')
  execute function staging_campaign.reserve_route_key();

-- Save only catalog authority, never the token or its hash. Refuse to
-- operate under an unexpected owner or grantor before replacing anything.
create table staging_campaign.original_rpcs (
  original_oid oid primary key, original_name text not null,
  owner_oid oid not null, original_acl aclitem[] not null, body_digest text not null
);
insert into staging_campaign.original_rpcs
select p.oid, p.proname, p.proowner, coalesce(p.proacl, acldefault('f',p.proowner)), md5(p.prosrc)
from pg_proc p join (values
  ('public.verify_runtime_scheduler_token_v1(text,text)','fea796288b660580c69348bc9dd18c7dcd9545803603bffd6918ca61eb4261a6'),
  ('public.claim_campaign_effect_commands_v1(integer,timestamptz)','a8950ff8a1ddf56a36d909bc31ecaa20ea17a54a9bb3ae6f637f889640921f6c'),
  ('public.complete_campaign_effect_command_v1(text,timestamptz)','665861bc4b428b95b29609db9d671e6b7059e94540fa43bb28fe459a0327e46c'),
  ('public.fail_campaign_effect_command_v1(text,text)','728736565de3bc8734bdf8dc24633d2983d0d538e7cc1b3aebb1038a68fc5858'),
  ('public.configure_campaign_runtime_scheduler_v1(text)','7454687ee963fa2b6507cff630c9dd9b31547fa6e22df9903ed540d0ce223f85'),
  ('public.publish_campaign_market_event_v1(uuid,text,text,text,text,text,text,text,integer,integer,timestamptz)','4d7569a56eb014e9c6e057b1e90c067e3da56c0d054118c2c6bb79f0e6eb1241'),
  ('public.publish_campaign_notification_v1(uuid,text,text,text,text,text,text,timestamptz)','76861c6e799e4b063a7d6e8d420b8ee394a61ee668c405bdfc10788c72a5d194'),
  ('public.apply_campaign_store_scarcity_v1(uuid,text,text,text[],text,numeric,timestamptz,timestamptz)','6727f001191824bd09ee4009e138a51f695bc341e8cfcbb0d1432589494be282'),
  ('public.apply_world_route_state_v1(uuid,bigint,text,jsonb,text,text,integer,integer,timestamptz)','820d1cfa64523598abc570bd969ced0bada252ddc331ba9c4be823e0324971e5'),
  ('public.execute_campaign_event_atomic_v2(uuid,text,bigint,text,text,text,text,boolean,jsonb,jsonb,timestamptz,uuid,text,timestamptz)','9608498587b6d1b31a668fba496b67196ce5483bfa481ac57e9148f50391308e')
) expected(signature,body_sha256) on p.oid = to_regprocedure(expected.signature)
where p.prosecdef and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') = expected.body_sha256;

do $$
begin
  if (select count(*) from staging_campaign.original_rpcs) <> 10
  then raise exception 'CAMPAIGN_FENCE_REQUIRED_ROUTINE_MISSING'; end if;
  if exists(select 1 from staging_campaign.original_rpcs where owner_oid <> current_user::regrole)
  then raise exception 'CAMPAIGN_FENCE_OWNER_MISMATCH'; end if;
  if exists(
    select 1 from staging_campaign.original_rpcs rpc, aclexplode(rpc.original_acl) grant_row
    where grant_row.grantor <> rpc.owner_oid
  ) then raise exception 'CAMPAIGN_FENCE_GRANTOR_MISMATCH'; end if;
  perform 1 from private.runtime_scheduler_tokens
  where scheduler_name = 'econovaria-campaign-runtime-scheduler-v1' for update;
  if not found then raise exception 'CAMPAIGN_FENCE_TOKEN_IDENTITY_MISSING'; end if;
end;
$$;

-- Close new old-worker admissions at the source, including direct token POSTs.
-- Other schedulers still use the same selection and token normalization.
alter function public.verify_runtime_scheduler_token_v1(text,text) set schema staging_campaign;
create function public.verify_runtime_scheduler_token_v1(p_scheduler_name text, p_token_sha256 text)
returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case when p_scheduler_name = 'econovaria-campaign-runtime-scheduler-v1' then false
    else staging_campaign.verify_runtime_scheduler_token_v1(p_scheduler_name,p_token_sha256) end;
$$;
revoke all on function public.verify_runtime_scheduler_token_v1(text,text) from public, anon, authenticated;
grant execute on function public.verify_runtime_scheduler_token_v1(text,text) to service_role;

create function public.authorize_staging_campaign_worker_v1(p_token_sha256 text)
returns jsonb language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object('epoch',fence.epoch,'smoke',false) from staging_campaign.fence fence
  where not fence.held and staging_campaign.verify_runtime_scheduler_token_v1(
    'econovaria-campaign-runtime-scheduler-v1',p_token_sha256
  )
  union all
  select jsonb_build_object('epoch',scope.epoch,'smoke',true) from staging_campaign.smoke_window scope
  where scope.token_sha256=p_token_sha256 and scope.expires_at>statement_timestamp()
    and exists(select 1 from staging_campaign.fence where held and sealed);
$$;
revoke all on function public.authorize_staging_campaign_worker_v1(text) from public, anon, authenticated;
grant execute on function public.authorize_staging_campaign_worker_v1(text) to service_role;

-- Keep the exact canonical SQL bodies for the guarded calls. A fresh old RPC
-- cannot reach these privileged entry points after the install commits.
revoke all on function public.claim_campaign_effect_commands_v1(integer,timestamptz),
  public.complete_campaign_effect_command_v1(text,timestamptz),
  public.fail_campaign_effect_command_v1(text,text),
  public.configure_campaign_runtime_scheduler_v1(text),
  public.publish_campaign_market_event_v1(uuid,text,text,text,text,text,text,text,integer,integer,timestamptz),
  public.publish_campaign_notification_v1(uuid,text,text,text,text,text,text,timestamptz),
  public.apply_campaign_store_scarcity_v1(uuid,text,text,text[],text,numeric,timestamptz,timestamptz)
  from public, anon, authenticated, service_role;

-- Preserve the Admin/Storyline route ABI and the Admin event ABI. Move the
-- original body so the two wrappers and the generation-bound worker can share it.
alter function public.apply_world_route_state_v1(uuid,bigint,text,jsonb,text,text,integer,integer,timestamptz)
  set schema staging_campaign;
alter function public.execute_campaign_event_atomic_v2(uuid,text,bigint,text,text,text,text,boolean,jsonb,jsonb,timestamptz,uuid,text,timestamptz)
  set schema staging_campaign;
revoke all on all functions in schema staging_campaign from public, anon, authenticated, service_role;
do $$
begin
  if exists(
    select 1 from staging_campaign.original_rpcs
    where has_function_privilege('service_role',original_oid,'EXECUTE')
       or has_function_privilege('anon',original_oid,'EXECUTE')
       or has_function_privilege('authenticated',original_oid,'EXECUTE')
  ) then raise exception 'CAMPAIGN_FENCE_LEGACY_GRANT_REMAINS'; end if;
end;
$$;

create function public.apply_world_route_state_v1(
  p_game_session_id uuid, p_expected_revision bigint, p_command_key text, p_public_route_ids jsonb,
  p_status text, p_reason text, p_cost_multiplier_basis_points integer, p_duration_multiplier_basis_points integer,
  p_applied_at timestamptz
) returns table(command_outcome text, revision bigint, affected_routes integer)
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform staging_campaign.require_open(null);
  if p_command_key is null or (p_command_key not like 'admin:%' and p_command_key not like 'story\_route:%' escape '\')
     or exists(select 1 from staging_campaign.route_keys where game_id = p_game_session_id and command_key = p_command_key)
  then raise exception 'CAMPAIGN_FENCE_GENERATION_REQUIRED'; end if;
  return query select * from staging_campaign.apply_world_route_state_v1(
    p_game_session_id, p_expected_revision, p_command_key, p_public_route_ids, p_status, p_reason,
    p_cost_multiplier_basis_points, p_duration_multiplier_basis_points, p_applied_at
  );
end;
$$;
revoke all on function public.apply_world_route_state_v1(uuid,bigint,text,jsonb,text,text,integer,integer,timestamptz) from public, anon, authenticated;
grant execute on function public.apply_world_route_state_v1(uuid,bigint,text,jsonb,text,text,integer,integer,timestamptz) to service_role;

create function public.execute_campaign_event_atomic_v2(
  p_game_session_id uuid, p_campaign_public_id text, p_expected_revision bigint, p_event_key text,
  p_trigger_key text, p_expected_phase text, p_next_phase text, p_complete_campaign boolean,
  p_prerequisite_event_keys jsonb, p_effect_commands jsonb, p_next_scheduled_at timestamptz,
  p_actor_staff_user_id uuid, p_reason text, p_occurred_at timestamptz
) returns table(execution_outcome text, campaign_id text, event_id text, status text, current_phase text,
  revision bigint, event_sequence bigint, outcome text)
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform staging_campaign.require_open(null);
  if p_actor_staff_user_id is null then raise exception 'CAMPAIGN_FENCE_GENERATION_REQUIRED'; end if;
  return query select * from staging_campaign.execute_campaign_event_atomic_v2(
    p_game_session_id, p_campaign_public_id, p_expected_revision, p_event_key, p_trigger_key,
    p_expected_phase, p_next_phase, p_complete_campaign, p_prerequisite_event_keys, p_effect_commands,
    p_next_scheduled_at, p_actor_staff_user_id, p_reason, p_occurred_at
  );
end;
$$;
revoke all on function public.execute_campaign_event_atomic_v2(uuid,text,bigint,text,text,text,text,boolean,jsonb,jsonb,timestamptz,uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.execute_campaign_event_atomic_v2(uuid,text,bigint,text,text,text,text,boolean,jsonb,jsonb,timestamptz,uuid,text,timestamptz) to service_role;

-- Fixed-name SQL only. Caller supplies the epoch from admission and the
-- attempt from the canonical claim. The command row is locked until delivery
-- commits, so reclaim and the actual effect cannot cross that check.
create function staging_campaign.dispatch(
  p_epoch uuid, p_operation text, p_args jsonb, p_command_id text default null, p_attempt integer default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  command public.campaign_effect_commands%rowtype;
  result jsonb;
begin
  if p_epoch is null or jsonb_typeof(p_args) is distinct from 'object'
  then raise exception 'CAMPAIGN_FENCE_GENERATION_REQUIRED'; end if;
  perform staging_campaign.require_open(p_epoch);
  case p_operation
    when 'claim_campaign_effect_commands_v1' then
      with claimed as materialized (
        select * from public.claim_campaign_effect_commands_v1(
          (p_args->>'p_limit')::integer, (p_args->>'p_claimed_at')::timestamptz
        ) with ordinality
      ), recorded as (
        insert into staging_campaign.leases(command_id, epoch, attempt)
        select command_id, p_epoch, attempt_count from claimed
        on conflict (command_id) do update set epoch = excluded.epoch, attempt = excluded.attempt
      )
      select coalesce(jsonb_agg(to_jsonb(claimed) - 'ordinality' order by ordinality), '[]'::jsonb)
      into result from claimed;
      return result;
    when 'execute_campaign_event_atomic_v2' then
      select coalesce(jsonb_agg(row), '[]'::jsonb) into result
      from staging_campaign.execute_campaign_event_atomic_v2(
        (p_args->>'p_game_session_id')::uuid, p_args->>'p_campaign_public_id',
        (p_args->>'p_expected_revision')::bigint, p_args->>'p_event_key', p_args->>'p_trigger_key',
        p_args->>'p_expected_phase', p_args->>'p_next_phase', (p_args->>'p_complete_campaign')::boolean,
        p_args->'p_prerequisite_event_keys', p_args->'p_effect_commands', (p_args->>'p_next_scheduled_at')::timestamptz,
        null, p_args->>'p_reason', (p_args->>'p_occurred_at')::timestamptz
      ) row;
      return result;
    when 'complete_campaign_effect_command_v2' then
      if not exists(select 1 from staging_campaign.leases where command_id = p_command_id and epoch = p_epoch and attempt = p_attempt)
      then return 'false'::jsonb; end if;
      return to_jsonb(public.complete_campaign_effect_command_v2(p_command_id, (p_args->>'p_completed_at')::timestamptz, p_attempt));
    when 'fail_campaign_effect_command_v2' then
      if not exists(select 1 from staging_campaign.leases where command_id = p_command_id and epoch = p_epoch and attempt = p_attempt)
      then return 'false'::jsonb; end if;
      return to_jsonb(public.fail_campaign_effect_command_v2(p_command_id, p_args->>'p_error_code', p_attempt));
    else
      select * into command from public.campaign_effect_commands
      where public_id = p_command_id and attempt_count = p_attempt and status = 'processing' for update;
      if not found or not exists(
        select 1 from staging_campaign.leases where command_id = p_command_id and epoch = p_epoch and attempt = p_attempt
      ) or (p_args->>'p_game_session_id')::uuid is distinct from command.game_session_id
         or coalesce(p_args->>'p_idempotency_key',p_args->>'p_command_key') is distinct from command.idempotency_key
      then raise exception 'CAMPAIGN_FENCE_CLAIM_LOST'; end if;
  end case;
  case
    when p_operation = 'publish_campaign_market_event_v1' and command.effect_kind in ('publish_news','apply_market_shock') then
      return public.publish_campaign_market_event_v1(
        command.game_session_id, command.idempotency_key, p_args->>'p_headline', p_args->>'p_explanation',
        p_args->>'p_category', p_args->>'p_scope', p_args->>'p_target_key', p_args->>'p_sentiment',
        (p_args->>'p_magnitude_basis_points')::integer, (p_args->>'p_duration_ticks')::integer, (p_args->>'p_published_at')::timestamptz
      );
    when p_operation = 'publish_campaign_notification_v1' and command.effect_kind = 'notify_players' then
      return public.publish_campaign_notification_v1(
        command.game_session_id, command.idempotency_key, p_args->>'p_title', p_args->>'p_summary',
        p_args->>'p_priority', p_args->>'p_display_mode', p_args->>'p_notification_type', (p_args->>'p_published_at')::timestamptz
      );
    when p_operation = 'apply_campaign_store_scarcity_v1' and command.effect_kind = 'set_store_scarcity' then
      return public.apply_campaign_store_scarcity_v1(
        command.game_session_id, command.idempotency_key, p_args->>'p_definition_id',
        array(select jsonb_array_elements_text(p_args->'p_item_keys')), p_args->>'p_scarcity_band',
        (p_args->>'p_event_multiplier')::numeric, (p_args->>'p_expires_at')::timestamptz, (p_args->>'p_applied_at')::timestamptz
      );
    when p_operation = 'apply_world_route_state_v1' and command.effect_kind = 'set_route_state' then
      select coalesce(jsonb_agg(row), '[]'::jsonb) into result
      from staging_campaign.apply_world_route_state_v1(
        command.game_session_id, (p_args->>'p_expected_revision')::bigint, command.idempotency_key, p_args->'p_public_route_ids',
        p_args->>'p_status', p_args->>'p_reason', (p_args->>'p_cost_multiplier_basis_points')::integer,
        (p_args->>'p_duration_multiplier_basis_points')::integer, (p_args->>'p_applied_at')::timestamptz
      ) row;
      return result;
    else raise exception 'CAMPAIGN_FENCE_EFFECT_UNSUPPORTED';
  end case;
end;
$$;
-- The held smoke owns one previously enrolled synthetic command. The normal
-- scheduler token stays denied and the global claim is never called here.
create function staging_campaign.start_smoke(p_epoch uuid,p_game uuid,p_command text,p_token_sha256 text)
returns uuid language plpgsql set search_path = pg_catalog, pg_temp as $$
declare scope uuid := gen_random_uuid();
begin
  if not exists(
    select 1 from staging_campaign.fence where held and epoch=p_epoch and sealed and drained_at is not null
      and not smoke_passed for update
  ) or p_token_sha256 is null or p_token_sha256 !~ '^[0-9a-f]{64}$'
    or exists(select 1 from private.runtime_scheduler_tokens where token_sha256=p_token_sha256)
    or not exists(
      select 1 from public.game_sessions g join public.campaign_effect_commands c on c.game_session_id=g.id
      join public.campaign_instances i on i.id=c.campaign_instance_id and i.game_session_id=g.id
      where g.id=p_game and g.name='Campaign fence synthetic smoke' and g.provisioning_status='pending'
        and i.pack_id like 'campaign-fence-smoke-%' and c.public_id=p_command
        and c.effect_kind='notify_players' and c.status='pending' and c.attempt_count=0
    )
  then raise exception 'CAMPAIGN_FENCE_SMOKE_NOT_READY'; end if;
  insert into staging_campaign.smoke_window values(true,scope,p_game,p_command,p_token_sha256,clock_timestamp()+interval '3 minutes');
  return scope;
end;
$$;

create function staging_campaign.finish_smoke(p_epoch uuid) returns boolean
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare scope staging_campaign.smoke_window%rowtype;
declare passed boolean;
begin
  if not exists(select 1 from staging_campaign.fence where held and epoch=p_epoch and sealed for update)
  then raise exception 'CAMPAIGN_FENCE_EPOCH_CHANGED'; end if;
  select * into strict scope from staging_campaign.smoke_window;
  select exists(
    select 1 from public.campaign_effect_commands c join staging_campaign.leases l on l.command_id=c.public_id
    join public.notifications n on n.game_session_id=c.game_session_id and n.source_type='campaign' and n.source_id=c.idempotency_key
    where c.public_id=scope.command_id and c.game_session_id=scope.game_id
      and c.status='completed' and c.completed_at is not null and l.epoch=scope.epoch and l.attempt=c.attempt_count
      and scope.expires_at>clock_timestamp()
  ) into passed;
  delete from staging_campaign.smoke_window;
  update staging_campaign.fence set smoke_passed=passed;
  return passed;
end;
$$;

create function public.write_staging_campaign_v1(
  p_epoch uuid, p_operation text, p_args jsonb, p_command_id text default null, p_attempt integer default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  active staging_campaign.fence%rowtype;
  scope staging_campaign.smoke_window%rowtype;
  transaction_id xid8;
  result jsonb;
begin
  select * into strict active from staging_campaign.fence for share;
  if not active.held then
    return staging_campaign.dispatch(p_epoch,p_operation,p_args,p_command_id,p_attempt);
  end if;
  select * into scope from staging_campaign.smoke_window where epoch=p_epoch and expires_at>clock_timestamp();
  if not found then raise exception 'CAMPAIGN_STAGING_HELD'; end if;
  if jsonb_typeof(p_args) is distinct from 'object' or p_operation is null
    or (p_operation <> 'claim_campaign_effect_commands_v1' and (
      p_operation not in ('publish_campaign_notification_v1','complete_campaign_effect_command_v2','fail_campaign_effect_command_v2')
      or p_command_id is distinct from scope.command_id
    ))
  then raise exception 'CAMPAIGN_FENCE_SMOKE_SCOPE'; end if;
  transaction_id := pg_current_xact_id();
  insert into staging_campaign.smoke_transactions values(transaction_id,scope.epoch,scope.game_id,scope.command_id);
  if p_operation = 'claim_campaign_effect_commands_v1' then
    with claimed as (
      update public.campaign_effect_commands c
      set status='processing',attempt_count=c.attempt_count+1,claimed_at=clock_timestamp(),last_error_code=null
      where c.game_session_id=scope.game_id and c.public_id=scope.command_id and c.status='pending' and c.attempt_count=0
      returning c.*
    ), lease as (
      insert into staging_campaign.leases
      select public_id,p_epoch,attempt_count from claimed returning command_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'command_id',c.public_id,'game_session_id',c.game_session_id,'campaign_id',i.public_id,
      'idempotency_key',c.idempotency_key,'effect_kind',c.effect_kind,'payload',c.payload,'attempt_count',c.attempt_count
    )),'[]'::jsonb) into result
    from claimed c join lease l on l.command_id=c.public_id join public.campaign_instances i on i.id=c.campaign_instance_id;
  else
    result := staging_campaign.dispatch(p_epoch,p_operation,p_args,p_command_id,p_attempt);
  end if;
  delete from staging_campaign.smoke_transactions where xid=transaction_id;
  return result;
end;
$$;
revoke all on function public.write_staging_campaign_v1(uuid,text,jsonb,text,integer) from public, anon, authenticated;
grant execute on function public.write_staging_campaign_v1(uuid,text,jsonb,text,integer) to service_role;

-- Requires external approval and rollout evidence in the operator path. This
-- DB primitive additionally refuses before an independently observed drain and
-- before the unchanged v2 acknowledgement SQL exists.
create function staging_campaign.seal_v2(p_epoch uuid) returns void
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if (
    select count(*) from pg_proc p join (values
      ('public.complete_campaign_effect_command_v2(text,timestamptz,integer)','e1e35d7a9b74fca84c68728aa800c671cc037e054ffe566db4fc52f422901e6a'),
      ('public.fail_campaign_effect_command_v2(text,text,integer)','ca5eaccb8f395d5cbbecd6938e8f9005fdcab74f91690a045ec28c949ac60895')
    ) expected(signature,body_sha256) on p.oid = to_regprocedure(expected.signature)
    where p.prosecdef and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') = expected.body_sha256
  ) <> 2 then raise exception 'CAMPAIGN_FENCE_V2_ACKNOWLEDGEMENTS_MISSING'; end if;
  update staging_campaign.fence set sealed=true, drained_at=null, changed_xid=pg_current_xact_id()
  where held and epoch=p_epoch and drained_at is not null and not sealed;
  if not found then raise exception 'CAMPAIGN_FENCE_DRAIN_REQUIRED'; end if;
  -- The immutable migration grants v2 directly. Route staged acknowledgements
  -- through the epoch check before making the fence open to the new worker.
  revoke all on function public.complete_campaign_effect_command_v2(text,timestamptz,integer),
    public.fail_campaign_effect_command_v2(text,text,integer) from public, anon, authenticated, service_role;
end;
$$;
create function staging_campaign.open_after_cutover(p_epoch uuid) returns void
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  update staging_campaign.fence set held=false, changed_xid=pg_current_xact_id(), opened_once=true
  where held and epoch=p_epoch and drained_at is not null and sealed and smoke_passed
    and not exists(select 1 from staging_campaign.smoke_window);
  if not found then raise exception 'CAMPAIGN_FENCE_SMOKE_OR_DRAIN_REQUIRED'; end if;
end;
$$;
revoke all on all functions in schema staging_campaign from public, anon, authenticated, service_role;
revoke all on all tables in schema staging_campaign from public, anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;
