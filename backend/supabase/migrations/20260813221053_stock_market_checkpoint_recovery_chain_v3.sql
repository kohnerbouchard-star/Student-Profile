create or replace function public.get_stock_market_checkpoint_recovery_chain_v3(
  p_game_session_id uuid,
  p_at_or_before_tick integer default null,
  p_limit integer default 20
)
returns table(
  checkpoint_id uuid,
  tick_index integer,
  checkpoint_schema_version integer,
  checkpoint_kind text,
  created_at timestamptz,
  config_hash_valid boolean,
  input_hash_valid boolean,
  state_hash_valid boolean,
  checkpoint_hash_valid boolean,
  complete_tick_state boolean,
  is_valid boolean,
  recovery_rank bigint
)
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select
      c.*,
      cfg.id as cfg_id,
      cfg.config_hash as cfg_hash,
      cfg.config_manifest as cfg_manifest
    from private.stock_market_simulation_checkpoints c
    left join private.stock_market_simulation_configs cfg on cfg.id = c.simulation_config_id
    where c.game_session_id = p_game_session_id
      and (p_at_or_before_tick is null or c.tick_index <= p_at_or_before_tick)
      and c.checkpoint_schema_version in (1,3)
  ), verified as (
    select
      c.id as checkpoint_id,
      c.tick_index,
      c.checkpoint_schema_version,
      c.checkpoint_kind,
      c.created_at,
      case
        when c.checkpoint_schema_version = 1 then true
        when c.checkpoint_schema_version = 3 then
          c.simulation_config_id is not null
          and c.cfg_id is not null
          and c.simulation_config_hash = c.cfg_hash
          and c.cfg_hash = encode(extensions.digest(c.cfg_manifest::text,'sha256'),'hex')
        else false
      end as config_hash_valid,
      c.input_hash = encode(extensions.digest(c.input_manifest::text,'sha256'),'hex') as input_hash_valid,
      c.state_hash = encode(extensions.digest(c.state_manifest::text,'sha256'),'hex') as state_hash_valid,
      case
        when c.checkpoint_schema_version = 1 then
          c.checkpoint_hash = encode(extensions.digest(concat_ws('|','stock-checkpoint-v2',c.game_session_id::text,
            c.tick_index::text,c.engine_version,c.simulation_seed,c.input_hash,c.state_hash),'sha256'),'hex')
        when c.checkpoint_schema_version = 3 then
          c.checkpoint_hash = encode(extensions.digest(concat_ws('|','stock-checkpoint-v3',c.game_session_id::text,
            c.tick_index::text,c.engine_version,c.simulation_seed,c.simulation_config_hash,c.input_hash,c.state_hash),'sha256'),'hex')
        else false
      end as checkpoint_hash_valid,
      c.missing_tick_state_count = 0 as complete_tick_state
    from candidates c
  ), ranked as (
    select
      v.*,
      (v.config_hash_valid and v.input_hash_valid and v.state_hash_valid and v.checkpoint_hash_valid and v.complete_tick_state) as is_valid,
      row_number() over (
        order by v.tick_index desc,
          case v.checkpoint_schema_version when 3 then 0 when 1 then 1 else 9 end,
          v.created_at desc,
          v.checkpoint_id desc
      ) as recovery_rank
    from verified v
  )
  select * from ranked
  order by recovery_rank
  limit greatest(1,least(coalesce(p_limit,20),100))
$$;

create or replace function public.get_latest_valid_stock_market_checkpoint_recovery_v3(
  p_game_session_id uuid,
  p_at_or_before_tick integer default null
)
returns table(
  checkpoint_id uuid,
  tick_index integer,
  checkpoint_schema_version integer,
  checkpoint_kind text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select r.checkpoint_id,r.tick_index,r.checkpoint_schema_version,r.checkpoint_kind,r.created_at
  from public.get_stock_market_checkpoint_recovery_chain_v3(p_game_session_id,p_at_or_before_tick,100) r
  where r.is_valid
  order by r.recovery_rank
  limit 1
$$;

revoke all on function public.get_stock_market_checkpoint_recovery_chain_v3(uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.get_latest_valid_stock_market_checkpoint_recovery_v3(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_stock_market_checkpoint_recovery_chain_v3(uuid,integer,integer) to service_role;
grant execute on function public.get_latest_valid_stock_market_checkpoint_recovery_v3(uuid,integer) to service_role;
