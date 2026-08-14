create table if not exists private.stock_market_simulation_configs (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  config_schema_version integer not null default 1 check (config_schema_version > 0),
  engine_version text not null,
  effective_from_tick integer not null check (effective_from_tick >= 0),
  config_manifest jsonb not null,
  config_hash text not null check (config_hash ~ '^[0-9a-f]{64}$'),
  stock_count integer not null check (stock_count >= 0),
  created_at timestamptz not null default now(),
  unique (game_session_id, config_hash)
);

create index if not exists stock_market_simulation_configs_game_tick_idx
  on private.stock_market_simulation_configs (game_session_id, effective_from_tick desc, created_at desc);

alter table private.stock_market_simulation_checkpoints
  add column if not exists simulation_config_id uuid references private.stock_market_simulation_configs(id) on delete restrict,
  add column if not exists simulation_config_hash text;

alter table private.stock_market_simulation_checkpoints
  drop constraint if exists stock_market_simulation_checkpo_checkpoint_schema_version_check;
alter table private.stock_market_simulation_checkpoints
  add constraint stock_market_simulation_checkpoints_schema_version_check check (checkpoint_schema_version > 0);

alter table private.stock_market_simulation_checkpoints
  drop constraint if exists stock_market_simulation_checkpoi_game_session_id_tick_index_key;
alter table private.stock_market_simulation_checkpoints
  add constraint stock_market_simulation_checkpoints_game_tick_schema_key unique (game_session_id, tick_index, checkpoint_schema_version);

alter table private.stock_market_simulation_checkpoints
  drop constraint if exists stock_market_simulation_checkpoints_simulation_config_hash_check;
alter table private.stock_market_simulation_checkpoints
  add constraint stock_market_simulation_checkpoints_simulation_config_hash_check
  check (simulation_config_hash is null or simulation_config_hash ~ '^[0-9a-f]{64}$');

create or replace function public.capture_stock_market_checkpoint_v2(
  p_game_session_id uuid,
  p_checkpoint_kind text default 'manual'::text
)
returns table(
  checkpoint_id uuid, game_session_id uuid, tick_index integer, engine_version text,
  simulation_seed text, checkpoint_kind text, input_hash text, state_hash text,
  checkpoint_hash text, stock_count integer, economic_snapshot_count integer,
  event_count integer, regime_count integer, missing_tick_state_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime private.stock_market_runtime_state%rowtype;
  v_input jsonb; v_state jsonb;
  v_input_hash text; v_state_hash text; v_checkpoint_hash text;
  v_stock_count integer; v_economic_count integer; v_event_count integer;
  v_regime_count integer; v_missing_tick_count integer;
  v_existing private.stock_market_simulation_checkpoints%rowtype;
begin
  if p_checkpoint_kind not in ('bootstrap','interval','event','wake','sleep','manual') then
    raise exception 'invalid checkpoint kind: %', p_checkpoint_kind using errcode = '22023';
  end if;

  select * into v_runtime from private.stock_market_runtime_state r where r.game_session_id = p_game_session_id;
  if not found then raise exception 'stock runtime state not found for game %', p_game_session_id using errcode = 'P0002'; end if;

  select c.* into v_existing
  from private.stock_market_simulation_checkpoints c
  where c.game_session_id = p_game_session_id
    and c.tick_index = v_runtime.current_tick_index
    and c.checkpoint_schema_version = 1;

  if found then
    return query select v_existing.id, v_existing.game_session_id, v_existing.tick_index,
      v_existing.engine_version, v_existing.simulation_seed, v_existing.checkpoint_kind,
      v_existing.input_hash, v_existing.state_hash, v_existing.checkpoint_hash,
      v_existing.stock_count, v_existing.economic_snapshot_count, v_existing.event_count,
      v_existing.regime_count, v_existing.missing_tick_state_count, v_existing.created_at;
    return;
  end if;

  with latest_economic as (
    select distinct on (x.country_profile_id) x.*
    from public.country_economic_snapshots x
    where x.game_session_id = p_game_session_id
      and x.effective_at <= coalesce(v_runtime.last_tick_at, now())
    order by x.country_profile_id, x.effective_at desc, x.snapshot_sequence desc, x.id
  ), active_events as (
    select e.* from public.stock_market_events e
    where e.game_session_id = p_game_session_id and e.is_active
      and e.created_tick <= v_runtime.current_tick_index
      and (e.expires_tick is null or e.expires_tick >= v_runtime.current_tick_index)
    order by e.created_tick, e.id
  ), active_regimes as (
    select r.* from public.stock_market_regimes r
    where r.game_session_id = p_game_session_id and r.is_active
      and r.starts_tick <= v_runtime.current_tick_index
      and (r.ends_tick is null or r.ends_tick >= v_runtime.current_tick_index)
    order by r.starts_tick, r.id
  )
  select jsonb_build_object(
    'schema_version',1,'game_session_id',p_game_session_id,'tick_index',v_runtime.current_tick_index,
    'engine_version',v_runtime.engine_version,'simulation_seed',v_runtime.simulation_seed,
    'simulation_time',v_runtime.last_tick_at,
    'economic_snapshots',coalesce((select jsonb_agg(to_jsonb(le) order by le.country_profile_id,le.snapshot_sequence) from latest_economic le),'[]'::jsonb),
    'market_events',coalesce((select jsonb_agg(to_jsonb(ae) order by ae.created_tick,ae.id) from active_events ae),'[]'::jsonb),
    'market_regimes',coalesce((select jsonb_agg(to_jsonb(ar) order by ar.starts_tick,ar.id) from active_regimes ar),'[]'::jsonb)
  ) into v_input;

  select jsonb_build_object('schema_version',1,'game_session_id',p_game_session_id,'tick_index',v_runtime.current_tick_index,
    'stocks',coalesce(jsonb_agg(jsonb_build_object(
      'game_stock_id',s.id,'stock_asset_id',s.template_id,'ticker',s.ticker,'current_price',s.current_price,
      'previous_close',s.previous_close,'open_price',s.open_price,'day_high',s.day_high,'day_low',s.day_low,
      'beta',s.beta,'liquidity',s.liquidity,'current_volatility',s.current_volatility,
      'long_run_volatility',s.long_run_volatility,'fair_value_anchor',s.fair_value_anchor,
      'recent_returns',s.recent_returns,'fundamentals',s.fundamentals,'country_exposure',s.country_exposure,
      'sector_exposure',s.sector_exposure,'commodity_exposure',s.commodity_exposure,
      'last_tick',case when t.id is null then null else jsonb_build_object(
        'tick_id',t.id,'tick_index',t.tick_index,'stock_asset_id',t.stock_asset_id,'ticker',t.ticker,
        'price',t.price,'previous_price',t.previous_price,'log_return',t.log_return,'change_pct',t.change_pct,
        'volume',t.volume,'current_volatility',t.current_volatility,'long_run_volatility',t.long_run_volatility,
        'explanation',t.explanation,'created_at',t.created_at) end
    ) order by s.id),'[]'::jsonb)), count(*)::integer,count(*) filter (where t.id is null)::integer
  into v_state,v_stock_count,v_missing_tick_count
  from public.game_session_stock_assets s
  left join public.stock_price_ticks t on t.game_session_id=s.game_session_id and t.stock_asset_id=s.id and t.tick_index=v_runtime.current_tick_index
  where s.game_session_id=p_game_session_id and s.is_active;

  v_economic_count:=jsonb_array_length(v_input->'economic_snapshots');
  v_event_count:=jsonb_array_length(v_input->'market_events');
  v_regime_count:=jsonb_array_length(v_input->'market_regimes');
  v_input_hash:=encode(extensions.digest(v_input::text,'sha256'),'hex');
  v_state_hash:=encode(extensions.digest(v_state::text,'sha256'),'hex');
  v_checkpoint_hash:=encode(extensions.digest(concat_ws('|','stock-checkpoint-v2',p_game_session_id::text,v_runtime.current_tick_index::text,v_runtime.engine_version,v_runtime.simulation_seed,v_input_hash,v_state_hash),'sha256'),'hex');

  insert into private.stock_market_simulation_checkpoints(
    game_session_id,tick_index,engine_version,simulation_seed,checkpoint_kind,checkpoint_schema_version,
    simulation_time,input_manifest,input_hash,state_manifest,state_hash,checkpoint_hash,stock_count,
    economic_snapshot_count,event_count,regime_count,missing_tick_state_count)
  values(p_game_session_id,v_runtime.current_tick_index,v_runtime.engine_version,v_runtime.simulation_seed,
    p_checkpoint_kind,1,v_runtime.last_tick_at,v_input,v_input_hash,v_state,v_state_hash,v_checkpoint_hash,
    v_stock_count,v_economic_count,v_event_count,v_regime_count,v_missing_tick_count)
  returning id, private.stock_market_simulation_checkpoints.created_at into checkpoint_id,created_at;

  game_session_id:=p_game_session_id; tick_index:=v_runtime.current_tick_index; engine_version:=v_runtime.engine_version;
  simulation_seed:=v_runtime.simulation_seed; checkpoint_kind:=p_checkpoint_kind; input_hash:=v_input_hash;
  state_hash:=v_state_hash; checkpoint_hash:=v_checkpoint_hash; stock_count:=v_stock_count;
  economic_snapshot_count:=v_economic_count; event_count:=v_event_count; regime_count:=v_regime_count;
  missing_tick_state_count:=v_missing_tick_count; return next;
end; $$;

create or replace function public.capture_stock_market_checkpoint_v3(
  p_game_session_id uuid,
  p_checkpoint_kind text default 'manual'::text
)
returns table(
  checkpoint_id uuid, simulation_config_id uuid, game_session_id uuid, tick_index integer,
  engine_version text, simulation_seed text, checkpoint_kind text, simulation_config_hash text,
  input_hash text, state_hash text, checkpoint_hash text, stock_count integer,
  economic_snapshot_count integer, event_count integer, regime_count integer,
  missing_tick_state_count integer, created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime private.stock_market_runtime_state%rowtype;
  v_config_manifest jsonb; v_config_hash text; v_config_id uuid; v_config_stock_count integer;
  v_input jsonb; v_state jsonb; v_input_hash text; v_state_hash text; v_checkpoint_hash text;
  v_stock_count integer; v_economic_count integer; v_event_count integer; v_regime_count integer;
  v_missing_tick_count integer; v_existing private.stock_market_simulation_checkpoints%rowtype;
begin
  if p_checkpoint_kind not in ('bootstrap','interval','event','wake','sleep','manual') then
    raise exception 'invalid checkpoint kind: %', p_checkpoint_kind using errcode='22023';
  end if;
  select * into v_runtime from private.stock_market_runtime_state r where r.game_session_id=p_game_session_id;
  if not found then raise exception 'stock runtime state not found for game %',p_game_session_id using errcode='P0002'; end if;

  select jsonb_build_object('schema_version',1,'game_session_id',p_game_session_id,'engine_version',v_runtime.engine_version,
    'stocks',coalesce(jsonb_agg(jsonb_build_object(
      'game_stock_id',s.id,'stock_asset_id',s.template_id,'ticker',s.ticker,'beta',s.beta,'liquidity',s.liquidity,
      'long_run_volatility',s.long_run_volatility,'fundamentals',s.fundamentals,
      'country_exposure',s.country_exposure,'sector_exposure',s.sector_exposure,
      'commodity_exposure',s.commodity_exposure) order by s.id),'[]'::jsonb)), count(*)::integer
  into v_config_manifest,v_config_stock_count
  from public.game_session_stock_assets s where s.game_session_id=p_game_session_id and s.is_active;
  v_config_hash:=encode(extensions.digest(v_config_manifest::text,'sha256'),'hex');

  insert into private.stock_market_simulation_configs(game_session_id,config_schema_version,engine_version,effective_from_tick,config_manifest,config_hash,stock_count)
  values(p_game_session_id,1,v_runtime.engine_version,v_runtime.current_tick_index,v_config_manifest,v_config_hash,v_config_stock_count)
  on conflict (game_session_id,config_hash) do nothing;
  select c.id into v_config_id from private.stock_market_simulation_configs c
   where c.game_session_id=p_game_session_id and c.config_hash=v_config_hash;

  select c.* into v_existing from private.stock_market_simulation_checkpoints c
   where c.game_session_id=p_game_session_id and c.tick_index=v_runtime.current_tick_index and c.checkpoint_schema_version=3;
  if found then
    return query select v_existing.id,v_existing.simulation_config_id,v_existing.game_session_id,v_existing.tick_index,
      v_existing.engine_version,v_existing.simulation_seed,v_existing.checkpoint_kind,v_existing.simulation_config_hash,
      v_existing.input_hash,v_existing.state_hash,v_existing.checkpoint_hash,v_existing.stock_count,
      v_existing.economic_snapshot_count,v_existing.event_count,v_existing.regime_count,
      v_existing.missing_tick_state_count,v_existing.created_at;
    return;
  end if;

  with latest_economic as (
    select distinct on (x.country_profile_id) x.* from public.country_economic_snapshots x
    where x.game_session_id=p_game_session_id and x.effective_at<=coalesce(v_runtime.last_tick_at,now())
    order by x.country_profile_id,x.effective_at desc,x.snapshot_sequence desc,x.id
  ), active_events as (
    select e.* from public.stock_market_events e where e.game_session_id=p_game_session_id and e.is_active
      and e.created_tick<=v_runtime.current_tick_index and (e.expires_tick is null or e.expires_tick>=v_runtime.current_tick_index)
    order by e.created_tick,e.id
  ), active_regimes as (
    select r.* from public.stock_market_regimes r where r.game_session_id=p_game_session_id and r.is_active
      and r.starts_tick<=v_runtime.current_tick_index and (r.ends_tick is null or r.ends_tick>=v_runtime.current_tick_index)
    order by r.starts_tick,r.id
  )
  select jsonb_build_object('schema_version',3,'game_session_id',p_game_session_id,'tick_index',v_runtime.current_tick_index,
    'engine_version',v_runtime.engine_version,'simulation_seed',v_runtime.simulation_seed,
    'simulation_time',v_runtime.last_tick_at,'simulation_config_hash',v_config_hash,
    'economic_snapshots',coalesce((select jsonb_agg(to_jsonb(le) order by le.country_profile_id,le.snapshot_sequence) from latest_economic le),'[]'::jsonb),
    'market_events',coalesce((select jsonb_agg(to_jsonb(ae) order by ae.created_tick,ae.id) from active_events ae),'[]'::jsonb),
    'market_regimes',coalesce((select jsonb_agg(to_jsonb(ar) order by ar.starts_tick,ar.id) from active_regimes ar),'[]'::jsonb)) into v_input;

  select jsonb_build_object('schema_version',3,'game_session_id',p_game_session_id,'tick_index',v_runtime.current_tick_index,
    'stocks',coalesce(jsonb_agg(jsonb_build_object(
      'game_stock_id',s.id,'stock_asset_id',s.template_id,'ticker',s.ticker,'current_price',s.current_price,
      'previous_close',s.previous_close,'open_price',s.open_price,'day_high',s.day_high,'day_low',s.day_low,
      'current_volatility',s.current_volatility,'fair_value_anchor',s.fair_value_anchor,'recent_returns',s.recent_returns,
      'last_tick',case when t.id is null then null else jsonb_build_object(
        'tick_index',t.tick_index,'price',t.price,'previous_price',t.previous_price,'log_return',t.log_return,
        'change_pct',t.change_pct,'volume',t.volume,'current_volatility',t.current_volatility,
        'long_run_volatility',t.long_run_volatility,'created_at',t.created_at) end
    ) order by s.id),'[]'::jsonb)), count(*)::integer, count(*) filter(where t.id is null)::integer
  into v_state,v_stock_count,v_missing_tick_count
  from public.game_session_stock_assets s
  left join public.stock_price_ticks t on t.game_session_id=s.game_session_id and t.stock_asset_id=s.id and t.tick_index=v_runtime.current_tick_index
  where s.game_session_id=p_game_session_id and s.is_active;

  v_economic_count:=jsonb_array_length(v_input->'economic_snapshots'); v_event_count:=jsonb_array_length(v_input->'market_events');
  v_regime_count:=jsonb_array_length(v_input->'market_regimes');
  v_input_hash:=encode(extensions.digest(v_input::text,'sha256'),'hex');
  v_state_hash:=encode(extensions.digest(v_state::text,'sha256'),'hex');
  v_checkpoint_hash:=encode(extensions.digest(concat_ws('|','stock-checkpoint-v3',p_game_session_id::text,
    v_runtime.current_tick_index::text,v_runtime.engine_version,v_runtime.simulation_seed,v_config_hash,v_input_hash,v_state_hash),'sha256'),'hex');

  insert into private.stock_market_simulation_checkpoints(game_session_id,tick_index,engine_version,simulation_seed,
    checkpoint_kind,checkpoint_schema_version,simulation_time,input_manifest,input_hash,state_manifest,state_hash,
    checkpoint_hash,stock_count,economic_snapshot_count,event_count,regime_count,missing_tick_state_count,
    simulation_config_id,simulation_config_hash)
  values(p_game_session_id,v_runtime.current_tick_index,v_runtime.engine_version,v_runtime.simulation_seed,p_checkpoint_kind,3,
    v_runtime.last_tick_at,v_input,v_input_hash,v_state,v_state_hash,v_checkpoint_hash,v_stock_count,v_economic_count,
    v_event_count,v_regime_count,v_missing_tick_count,v_config_id,v_config_hash)
  returning id,private.stock_market_simulation_checkpoints.created_at into checkpoint_id,created_at;

  simulation_config_id:=v_config_id; game_session_id:=p_game_session_id; tick_index:=v_runtime.current_tick_index;
  engine_version:=v_runtime.engine_version; simulation_seed:=v_runtime.simulation_seed; checkpoint_kind:=p_checkpoint_kind;
  simulation_config_hash:=v_config_hash; input_hash:=v_input_hash; state_hash:=v_state_hash; checkpoint_hash:=v_checkpoint_hash;
  stock_count:=v_stock_count; economic_snapshot_count:=v_economic_count; event_count:=v_event_count;
  regime_count:=v_regime_count; missing_tick_state_count:=v_missing_tick_count; return next;
end; $$;

create or replace function public.verify_stock_market_checkpoint_v3(p_checkpoint_id uuid)
returns table(checkpoint_id uuid,game_session_id uuid,tick_index integer,config_hash_valid boolean,input_hash_valid boolean,
  state_hash_valid boolean,checkpoint_hash_valid boolean,complete_tick_state boolean,is_valid boolean)
language sql security definer set search_path='' as $$
  select c.id,c.game_session_id,c.tick_index,
    c.simulation_config_id is not null and cfg.id is not null
      and c.simulation_config_hash=cfg.config_hash
      and cfg.config_hash=encode(extensions.digest(cfg.config_manifest::text,'sha256'),'hex'),
    c.input_hash=encode(extensions.digest(c.input_manifest::text,'sha256'),'hex'),
    c.state_hash=encode(extensions.digest(c.state_manifest::text,'sha256'),'hex'),
    c.checkpoint_hash=encode(extensions.digest(concat_ws('|','stock-checkpoint-v3',c.game_session_id::text,c.tick_index::text,
      c.engine_version,c.simulation_seed,c.simulation_config_hash,c.input_hash,c.state_hash),'sha256'),'hex'),
    c.missing_tick_state_count=0,
    (c.simulation_config_id is not null and cfg.id is not null
      and c.simulation_config_hash=cfg.config_hash
      and cfg.config_hash=encode(extensions.digest(cfg.config_manifest::text,'sha256'),'hex')
      and c.input_hash=encode(extensions.digest(c.input_manifest::text,'sha256'),'hex')
      and c.state_hash=encode(extensions.digest(c.state_manifest::text,'sha256'),'hex')
      and c.checkpoint_hash=encode(extensions.digest(concat_ws('|','stock-checkpoint-v3',c.game_session_id::text,c.tick_index::text,
        c.engine_version,c.simulation_seed,c.simulation_config_hash,c.input_hash,c.state_hash),'sha256'),'hex')
      and c.missing_tick_state_count=0)
  from private.stock_market_simulation_checkpoints c
  left join private.stock_market_simulation_configs cfg on cfg.id=c.simulation_config_id
  where c.id=p_checkpoint_id and c.checkpoint_schema_version=3
$$;

create or replace function public.get_latest_valid_stock_market_checkpoint_v3(
  p_game_session_id uuid,
  p_at_or_before_tick integer default null
)
returns table(checkpoint_id uuid,simulation_config_id uuid,game_session_id uuid,tick_index integer,engine_version text,
  simulation_seed text,checkpoint_kind text,simulation_time timestamptz,simulation_config_hash text,input_hash text,
  state_hash text,checkpoint_hash text,stock_count integer,economic_snapshot_count integer,event_count integer,
  regime_count integer,missing_tick_state_count integer,created_at timestamptz)
language sql security definer set search_path='' as $$
  select c.id,c.simulation_config_id,c.game_session_id,c.tick_index,c.engine_version,c.simulation_seed,c.checkpoint_kind,
    c.simulation_time,c.simulation_config_hash,c.input_hash,c.state_hash,c.checkpoint_hash,c.stock_count,
    c.economic_snapshot_count,c.event_count,c.regime_count,c.missing_tick_state_count,c.created_at
  from private.stock_market_simulation_checkpoints c
  join private.stock_market_simulation_configs cfg on cfg.id=c.simulation_config_id
  where c.game_session_id=p_game_session_id and c.checkpoint_schema_version=3
    and (p_at_or_before_tick is null or c.tick_index<=p_at_or_before_tick)
    and c.missing_tick_state_count=0
    and c.simulation_config_hash=cfg.config_hash
    and cfg.config_hash=encode(extensions.digest(cfg.config_manifest::text,'sha256'),'hex')
    and c.input_hash=encode(extensions.digest(c.input_manifest::text,'sha256'),'hex')
    and c.state_hash=encode(extensions.digest(c.state_manifest::text,'sha256'),'hex')
    and c.checkpoint_hash=encode(extensions.digest(concat_ws('|','stock-checkpoint-v3',c.game_session_id::text,c.tick_index::text,
      c.engine_version,c.simulation_seed,c.simulation_config_hash,c.input_hash,c.state_hash),'sha256'),'hex')
  order by c.tick_index desc,c.created_at desc
  limit 1
$$;

revoke all on private.stock_market_simulation_configs from public, anon, authenticated;
revoke all on private.stock_market_simulation_checkpoints from public, anon, authenticated;
revoke all on function public.capture_stock_market_checkpoint_v3(uuid,text) from public, anon, authenticated;
revoke all on function public.verify_stock_market_checkpoint_v3(uuid) from public, anon, authenticated;
revoke all on function public.get_latest_valid_stock_market_checkpoint_v3(uuid,integer) from public, anon, authenticated;
grant execute on function public.capture_stock_market_checkpoint_v3(uuid,text) to service_role;
grant execute on function public.verify_stock_market_checkpoint_v3(uuid) to service_role;
grant execute on function public.get_latest_valid_stock_market_checkpoint_v3(uuid,integer) to service_role;
