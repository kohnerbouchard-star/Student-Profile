-- Phase 14D Market-owned listing consumer, position projection and metadata.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
alter table public.game_session_stock_assets
  add column business_public_key text,
  add column business_ipo_key text,
  add column business_financials jsonb,
  add column business_market_policy text,
  add constraint stock_business_listing_link_check check (
    (business_public_key is null and business_ipo_key is null and business_financials is null and business_market_policy is null)
    or (business_public_key is not null and business_ipo_key is not null and business_financials is not null and business_market_policy is not null
      and business_public_key ~ '^biz_[0-9a-f]{32}$' and business_ipo_key ~ '^bgp_[0-9a-f]{32}$'
      and jsonb_typeof(business_financials)='object' and business_market_policy='business_listing_v1'));
create unique index stock_business_listing_unique on public.game_session_stock_assets(game_session_id,business_public_key)
  where business_public_key is not null;

create table public.stock_business_event_consumptions (
  game_session_id uuid not null references public.game_sessions(id),
  event_key text not null check(event_key ~ '^bae_[0-9a-f]{32}$'),
  event_type text not null,
  event_version integer not null check(event_version=1),
  business_key text not null check(business_key ~ '^biz_[0-9a-f]{32}$'),
  stock_asset_id uuid,
  consumed_at timestamptz not null default clock_timestamp(),
  primary key(game_session_id,event_key),
  foreign key(game_session_id,stock_asset_id) references public.game_session_stock_assets(game_session_id,id)
);
create index stock_business_event_asset_idx on public.stock_business_event_consumptions(game_session_id,stock_asset_id);
alter table public.stock_business_event_consumptions enable row level security;
alter table public.stock_business_event_consumptions force row level security;
revoke all on public.stock_business_event_consumptions from public,anon,authenticated,service_role;
grant select on public.stock_business_event_consumptions to service_role;
create function private.guard_stock_business_event_evidence_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp
as $function$
begin
  if tg_op='DELETE' and private.is_game_data_purge_delete_authorized_v1(old.game_session_id,tg_table_schema,tg_table_name)
    then return old; end if;
  raise exception 'STOCK_BUSINESS_EVENT_EVIDENCE_IMMUTABLE';
end;
$function$;
revoke all on function private.guard_stock_business_event_evidence_v1() from public,anon,authenticated,service_role;
create trigger stock_business_event_consumption_immutable before update or delete on public.stock_business_event_consumptions
  for each row execute function private.guard_stock_business_event_evidence_v1();

create function private.guard_stock_business_link_v1()
returns trigger language plpgsql security invoker set search_path=pg_catalog,pg_temp
as $function$
begin
  if tg_op='DELETE' then
    if old.business_public_key is not null and not private.is_game_data_purge_delete_authorized_v1(old.game_session_id,tg_table_schema,tg_table_name)
      then raise exception 'STOCK_BUSINESS_LISTING_DELETE_DENIED'; end if;
    return old;
  end if;
  if new.business_public_key is not null or (tg_op='UPDATE' and old.business_public_key is not null) then
    if current_user in ('service_role','anon','authenticated') then raise exception 'STOCK_BUSINESS_LINK_COMMAND_REQUIRED'; end if;
    if tg_op='UPDATE' and (old.game_session_id,old.id,old.business_public_key,old.business_ipo_key,old.ticker,old.listing_currency_code)
      is distinct from (new.game_session_id,new.id,new.business_public_key,new.business_ipo_key,new.ticker,new.listing_currency_code)
      then raise exception 'STOCK_BUSINESS_LINK_IMMUTABLE'; end if;
  end if;
  return new;
end;
$function$;
revoke all on function private.guard_stock_business_link_v1() from public,anon,authenticated,service_role;
create trigger guard_stock_business_link before insert or update or delete on public.game_session_stock_assets
  for each row execute function private.guard_stock_business_link_v1();

create function private.guard_stock_business_holding_v1()
returns trigger language plpgsql security invoker set search_path=pg_catalog,pg_temp
as $function$
declare v_linked boolean;
begin
  if tg_op='DELETE' then
    if exists(select 1 from public.game_session_stock_assets where game_session_id=old.game_session_id
      and id=old.stock_asset_id and business_public_key is not null)
      and not private.is_game_data_purge_delete_authorized_v1(old.game_session_id,tg_table_schema,tg_table_name)
      then raise exception 'STOCK_BUSINESS_HOLDING_DELETE_DENIED'; end if;
    return old;
  end if;
  select exists(select 1 from public.game_session_stock_assets where game_session_id=new.game_session_id
    and id=new.stock_asset_id and business_public_key is not null) into v_linked;
  if tg_op='UPDATE' then
    v_linked:=v_linked or exists(select 1 from public.game_session_stock_assets where game_session_id=old.game_session_id
      and id=old.stock_asset_id and business_public_key is not null);
  end if;
  if v_linked then
    if new.quantity<>0 or new.reserved_quantity<>0 then raise exception 'STOCK_BUSINESS_QUANTITY_AUTHORITY_REQUIRED'; end if;
    if current_user in ('service_role','anon','authenticated') then raise exception 'STOCK_BUSINESS_HOLDING_COMMAND_REQUIRED'; end if;
    if tg_op='UPDATE' and (old.game_session_id,old.stock_asset_id,old.player_id) is distinct from
      (new.game_session_id,new.stock_asset_id,new.player_id) then raise exception 'STOCK_BUSINESS_HOLDING_SCOPE_IMMUTABLE'; end if;
  end if;
  return new;
end;
$function$;
revoke all on function private.guard_stock_business_holding_v1() from public,anon,authenticated,service_role;
create trigger guard_stock_business_holding before insert or update or delete on public.stock_holdings
  for each row execute function private.guard_stock_business_holding_v1();

create function private.guard_stock_business_order_v1()
returns trigger language plpgsql security invoker set search_path=pg_catalog,pg_temp
as $function$
begin
  if exists(select 1 from public.game_session_stock_assets where game_session_id=new.game_session_id
    and id=new.stock_asset_id and business_public_key is not null) then
    if current_user in ('service_role','anon','authenticated') or new.settlement_evidence_family is distinct from 'c3'
      then raise exception 'STOCK_BUSINESS_ORDER_COMMAND_REQUIRED'; end if;
  end if;
  return new;
end;
$function$;
revoke all on function private.guard_stock_business_order_v1() from public,anon,authenticated,service_role;
create trigger guard_stock_business_order before insert or update on public.stock_orders
  for each row execute function private.guard_stock_business_order_v1();

create function public.consume_business_market_events_v1(p_game_session_id uuid,p_limit integer default 1000)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp
as $function$
declare e record;profile jsonb;a public.game_session_stock_assets%rowtype;
  v_ticker text;v_price numeric;v_equity numeric;v_shares bigint;v_tick integer;v_count integer:=0;v_created integer:=0;
begin
  if p_limit is null or p_limit not between 1 and 1000 then raise exception 'STOCK_BUSINESS_CONSUMER_LIMIT_INVALID'; end if;
  perform 1 from public.game_sessions where id=p_game_session_id and status='active' and lifecycle_state='active' for share;
  if not found then return jsonb_build_object('schemaVersion',1,'consumed',0,'listed',0); end if;
  perform pg_advisory_xact_lock(hashtextextended('stock-business-consumer:'||p_game_session_id::text,0));
  for e in select source.* from public.read_business_market_events_v1(p_game_session_id) source
    left join public.stock_business_event_consumptions consumed
      on consumed.game_session_id=p_game_session_id and consumed.event_key=source.event_key
    where consumed.event_key is null order by source.occurred_at,source.event_key limit p_limit
  loop
    if e.event_version<>1 then raise exception 'STOCK_BUSINESS_EVENT_VERSION_UNSUPPORTED'; end if;
    profile:=public.read_business_market_listing_v1(p_game_session_id,e.business_key);
    select * into a from public.game_session_stock_assets
      where game_session_id=p_game_session_id and business_public_key=e.business_key for update;
    if coalesce((profile->>'listingReady')::boolean,false) then
      v_price:=(profile->>'initialPrice')::numeric;v_shares:=(profile->>'outstandingShares')::bigint;
      v_equity:=(profile#>>'{financials,equity}')::numeric;
      if a.id is null then
        v_ticker:='B'||upper(substr(e.business_key,5,15));
        select coalesce(max(tick_index),0) into v_tick from public.stock_price_ticks where game_session_id=p_game_session_id;
        insert into public.game_session_stock_assets(game_session_id,ticker,company_name,sector_key,country_code,listing_currency_code,
          description,current_price,previous_close,open_price,day_high,day_low,market_cap,shares_outstanding,
          beta,liquidity,current_volatility,long_run_volatility,fair_value_anchor,fundamentals,
          business_public_key,business_ipo_key,business_financials,business_market_policy)
        values(p_game_session_id,v_ticker,profile->>'companyName',profile->>'sector',profile->>'countryCode',profile->>'currencyCode',
          'Common shares in a Player-operated Business. Whole shares only; secondary trades transfer existing ownership.',
          v_price,v_price,v_price,v_price,v_price,v_price*v_shares,v_shares,
          1,0.5,0.02,0.02,case when v_equity>0 then nullif(round(v_equity/v_shares,4),0) end,'{}'::jsonb,
          e.business_key,profile->>'ipoKey',profile->'financials','business_listing_v1') returning * into a;
        insert into public.stock_price_ticks(game_session_id,stock_asset_id,tick_index,ticker,price,previous_price,log_return,
          change_pct,volume,current_volatility,long_run_volatility,explanation)
        values(p_game_session_id,a.id,v_tick,a.ticker,v_price,v_price,0,0,0,0.02,0.02,
          jsonb_build_object('schemaVersion',1,'source','completed_primary_ipo','ipoKey',profile->>'ipoKey',
            'eventKey',e.event_key,'marketPolicy','business_listing_v1'));
        v_created:=v_created+1;
      else
        if a.business_ipo_key<>profile->>'ipoKey' or a.listing_currency_code<>profile->>'currencyCode'
          then raise exception 'STOCK_BUSINESS_LISTING_SCOPE_CONFLICT'; end if;
        -- Financial observations never overwrite the current Market price.
        update public.game_session_stock_assets set is_active=true,business_financials=profile->'financials',
          shares_outstanding=v_shares,market_cap=current_price*v_shares,
          fair_value_anchor=case when v_equity>0 then nullif(round(v_equity/v_shares,4),0) end
          where game_session_id=p_game_session_id and id=a.id;
      end if;
    elsif a.id is not null then
      update public.game_session_stock_assets set is_active=false,business_financials=profile->'financials',fair_value_anchor=null
        where game_session_id=p_game_session_id and id=a.id;
    end if;
    insert into public.stock_business_event_consumptions(game_session_id,event_key,event_type,event_version,business_key,stock_asset_id)
      values(p_game_session_id,e.event_key,e.event_type,e.event_version,e.business_key,a.id);
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('schemaVersion',1,'consumed',v_count,'listed',v_created);
end;
$function$;
revoke all on function public.consume_business_market_events_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.consume_business_market_events_v1(uuid,integer) to service_role;

create function public.read_player_stock_positions_v1(p_game_session_id uuid,p_player_id uuid)
returns table(game_session_id uuid,player_id uuid,player_session_id uuid,stock_asset_id uuid,ticker text,
  quantity numeric,average_cost numeric,realized_pnl numeric)
language plpgsql stable security definer set search_path=pg_catalog,pg_temp
as $function$
begin
  perform 1 from public.players where id=p_player_id and players.game_session_id=p_game_session_id and status='active';
  if not found then raise exception 'STOCK_POSITION_PLAYER_UNAVAILABLE'; end if;
  return query
  select h.game_session_id,h.player_id,h.player_session_id,h.stock_asset_id,h.ticker,h.quantity,h.average_cost,h.realized_pnl
  from public.stock_holdings h join public.game_session_stock_assets a on a.game_session_id=h.game_session_id and a.id=h.stock_asset_id
    where h.game_session_id=p_game_session_id and h.player_id=p_player_id and a.business_public_key is null
  union all
  select a.game_session_id,p_player_id,h.player_session_id,a.id,a.ticker,(position->>'quantity')::numeric,
    coalesce(h.average_cost,(position->>'initialAverageCost')::numeric),coalesce(h.realized_pnl,0)
  from public.game_session_stock_assets a
    cross join lateral public.read_business_market_position_v1(p_game_session_id,a.business_public_key,p_player_id) as bp(position)
    left join public.stock_holdings h on h.game_session_id=a.game_session_id and h.stock_asset_id=a.id and h.player_id=p_player_id
  where a.game_session_id=p_game_session_id and a.business_public_key is not null
    and ((position->>'quantity')::numeric>0 or h.id is not null);
end;
$function$;
revoke all on function public.read_player_stock_positions_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_player_stock_positions_v1(uuid,uuid) to service_role;
-- Trusted Dashboard projection uses the same authoritative positions as Portfolio.
create function public.read_game_stock_positions_v1(p_game_session_id uuid)
returns table(game_session_id uuid,player_id uuid,player_session_id uuid,stock_asset_id uuid,ticker text,
  quantity numeric,average_cost numeric,realized_pnl numeric,listing_currency_code text)
language sql stable security definer set search_path=pg_catalog,pg_temp
as $function$
  select h.*,a.listing_currency_code::text
  from public.players p
    cross join lateral public.read_player_stock_positions_v1(p_game_session_id,p.id) h
    join public.game_session_stock_assets a on a.game_session_id=h.game_session_id and a.id=h.stock_asset_id
  where p.game_session_id=p_game_session_id and p.status='active';
$function$;
revoke all on function public.read_game_stock_positions_v1(uuid) from public,anon,authenticated;
grant execute on function public.read_game_stock_positions_v1(uuid) to service_role;
commit;
