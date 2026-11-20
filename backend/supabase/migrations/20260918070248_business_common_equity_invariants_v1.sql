-- Phase 14B: one canonical common-share position/receipt ledger.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create function economy_private.assert_business_common_equity_v1(p_game uuid,p_business uuid)
returns void language plpgsql stable security invoker
set search_path=pg_catalog,pg_temp
as $function$
declare
  v_entity text;
  v_structure public.business_corporate_share_structures%rowtype;
  v_units numeric;
  v_votes numeric;
begin
  select entity_type into v_entity from public.business_entities
    where game_session_id=p_game and id=p_business;
  -- A parent removed by canonical game deletion has no remaining cap table.
  if not found or v_entity not in ('corporation','c_corporation') then return; end if;
  select * into v_structure from public.business_corporate_share_structures
    where game_session_id=p_game and business_id=p_business;
  if not found then raise exception 'BUSINESS_COMMON_SHARE_STRUCTURE_REQUIRED' using errcode='23514'; end if;
  if exists(select 1 from public.business_ownership_positions
    where game_session_id=p_game and business_id=p_business and status='active'
      and (ownership_kind<>'share' or voting_units<>units)) then
    raise exception 'BUSINESS_COMMON_ONE_SHARE_ONE_VOTE_REQUIRED' using errcode='23514';
  end if;
  select coalesce(sum(units),0),coalesce(sum(voting_units),0) into v_units,v_votes
    from public.business_ownership_positions
    where game_session_id=p_game and business_id=p_business and status='active';
  if v_units<=0 or v_units<>v_structure.outstanding_shares or v_votes<>v_units then
    raise exception 'BUSINESS_COMMON_OUTSTANDING_MISMATCH' using errcode='23514';
  end if;
  if exists(select 1 from public.business_ownership_transactions
    where game_session_id=p_game and business_id=p_business
      and (ownership_kind<>'share' or voting_units<>units or from_player_id=to_player_id)) then
    raise exception 'BUSINESS_COMMON_TRANSACTION_INVALID' using errcode='23514';
  end if;
  if exists(
    with movements as (
      select to_player_id player_id,units::numeric delta from public.business_ownership_transactions
        where game_session_id=p_game and business_id=p_business and to_player_id is not null
      union all
      select from_player_id,-units::numeric from public.business_ownership_transactions
        where game_session_id=p_game and business_id=p_business and from_player_id is not null
    ), history as (select player_id,sum(delta) units from movements group by player_id),
    positions as (select player_id,sum(units)::numeric units from public.business_ownership_positions
      where game_session_id=p_game and business_id=p_business and status='active' group by player_id)
    select 1 from history h full join positions p using(player_id)
      where coalesce(h.units,0)<>coalesce(p.units,0) or coalesce(h.units,0)<0
  ) then raise exception 'BUSINESS_COMMON_RECEIPT_POSITION_MISMATCH' using errcode='23514'; end if;
end;
$function$;
revoke all on function economy_private.assert_business_common_equity_v1(uuid,uuid)
  from public,anon,authenticated,service_role;

create function economy_private.lock_business_common_equity_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp
as $function$
declare v_game uuid; v_business uuid;
begin
  if tg_op='UPDATE' and (old.game_session_id,old.business_id) is distinct from
    (new.game_session_id,new.business_id) then
    raise exception 'BUSINESS_EQUITY_SCOPE_IMMUTABLE' using errcode='23514';
  end if;
  if tg_op='DELETE' then v_game:=old.game_session_id; v_business:=old.business_id;
  else v_game:=new.game_session_id; v_business:=new.business_id; end if;
  perform 1 from public.business_entities where game_session_id=v_game and id=v_business
    and entity_type in ('corporation','c_corporation') for no key update;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$function$;
revoke all on function economy_private.lock_business_common_equity_v1()
  from public,anon,authenticated,service_role;

create function economy_private.check_business_common_equity_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp
as $function$
declare v_game uuid; v_business uuid;
begin
  if tg_table_name='business_entities' then
    v_game:=new.game_session_id; v_business:=new.id;
  elsif tg_op='DELETE' then v_game:=old.game_session_id; v_business:=old.business_id;
  else v_game:=new.game_session_id; v_business:=new.business_id; end if;
  perform economy_private.assert_business_common_equity_v1(v_game,v_business);
  return null;
end;
$function$;
revoke all on function economy_private.check_business_common_equity_v1()
  from public,anon,authenticated,service_role;

create function economy_private.guard_business_common_entity_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp
as $function$
begin
  if old.entity_type in ('corporation','c_corporation') and
    (old.game_session_id,old.id,old.entity_type,old.ownership_model_version) is distinct from
    (new.game_session_id,new.id,new.entity_type,new.ownership_model_version) then
    raise exception 'BUSINESS_COMMON_ENTITY_CONVERSION_REQUIRES_AUTHORITY' using errcode='23514';
  end if;
  return new;
end;
$function$;
revoke all on function economy_private.guard_business_common_entity_v1()
  from public,anon,authenticated,service_role;
create trigger business_common_entity_guard before update on public.business_entities
  for each row execute function economy_private.guard_business_common_entity_v1();
create constraint trigger business_common_entity_check after insert or update on public.business_entities
  deferrable initially deferred for each row
  execute function economy_private.check_business_common_equity_v1();

-- Deferral permits the existing activation/transfer transactions to update all
-- canonical rows atomically. WHEN is evaluated while the purge table token is
-- still valid, before the deferred trigger would otherwise be queued.
create trigger business_common_position_lock before insert or update or delete
  on public.business_ownership_positions for each row
  execute function economy_private.lock_business_common_equity_v1();
create constraint trigger business_common_position_check after insert or update
  on public.business_ownership_positions deferrable initially deferred for each row
  execute function economy_private.check_business_common_equity_v1();
create constraint trigger business_common_position_delete_check after delete
  on public.business_ownership_positions deferrable initially deferred for each row
  when (not private.is_game_data_purge_delete_authorized_v1(old.game_session_id,'public','business_ownership_positions'))
  execute function economy_private.check_business_common_equity_v1();

create trigger business_common_structure_lock before insert or update or delete
  on public.business_corporate_share_structures for each row
  execute function economy_private.lock_business_common_equity_v1();
create constraint trigger business_common_structure_check after insert or update
  on public.business_corporate_share_structures deferrable initially deferred for each row
  execute function economy_private.check_business_common_equity_v1();
create constraint trigger business_common_structure_delete_check after delete
  on public.business_corporate_share_structures deferrable initially deferred for each row
  when (not private.is_game_data_purge_delete_authorized_v1(old.game_session_id,'public','business_corporate_share_structures'))
  execute function economy_private.check_business_common_equity_v1();

create trigger business_common_receipt_lock before insert
  on public.business_ownership_transactions for each row
  execute function economy_private.lock_business_common_equity_v1();
create constraint trigger business_common_receipt_check after insert
  on public.business_ownership_transactions deferrable initially deferred for each row
  execute function economy_private.check_business_common_equity_v1();

-- All existing writers are SECURITY DEFINER commands. Service clients retain
-- reads and command execution, with no raw cap-table mutation authority.
revoke insert,update,delete,truncate on public.business_ownership_positions,
  public.business_corporate_share_structures,public.business_ownership_transactions from service_role;

-- Existing corporate data must already reconcile; never fabricate a receipt
-- or silently rewrite historical ownership to make a release pass.
do $audit$
declare b record;
begin
  for b in select game_session_id,id from public.business_entities
    where entity_type in ('corporation','c_corporation') order by game_session_id,id
  loop perform economy_private.assert_business_common_equity_v1(b.game_session_id,b.id); end loop;
end;
$audit$;

create or replace function public.assert_business_ownership_invariants_v2(
  p_game_session_id uuid,
  p_business_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_owner_count integer;
  v_units bigint;
  v_voting_units bigint;
  v_share_structure public.business_corporate_share_structures%rowtype;
begin
  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = p_business_id;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select count(*)::integer, coalesce(sum(units), 0), coalesce(sum(voting_units), 0)
  into v_owner_count, v_units, v_voting_units
  from public.business_ownership_positions
  where game_session_id = p_game_session_id
    and business_id = p_business_id
    and status = 'active';

  perform economy_private.assert_business_common_equity_v1(p_game_session_id,p_business_id);

  if v_business.ownership_model_version = 1 then
    if v_owner_count < 1 then
      raise exception 'BUSINESS_OWNERSHIP_EMPTY' using errcode = 'P0001';
    end if;
    return;
  end if;

  if v_business.entity_type = 'sole_proprietorship' then
    if v_owner_count <> 1 or v_units <> 10000 or v_voting_units <> 10000 then
      raise exception 'SOLE_PROPRIETORSHIP_OWNERSHIP_INVALID' using errcode = 'P0001';
    end if;
  elsif v_business.entity_type = 'partnership' then
    if v_owner_count < 2 then
      raise exception 'PARTNERSHIP_OWNERSHIP_INVALID' using errcode = 'P0001';
    end if;
  elsif v_business.entity_type = 'llc' then
    if v_owner_count < 1 then
      raise exception 'LLC_OWNERSHIP_INVALID' using errcode = 'P0001';
    end if;
  elsif v_business.entity_type = 'c_corporation' then
    if v_owner_count < 1 then
      raise exception 'CORPORATION_OWNERSHIP_INVALID' using errcode = 'P0001';
    end if;
    select share_row.*
    into v_share_structure
    from public.business_corporate_share_structures as share_row
    where share_row.game_session_id = p_game_session_id
      and share_row.business_id = p_business_id;
    if not found or v_share_structure.outstanding_shares <> v_units then
      raise exception 'CORPORATION_SHARE_LEDGER_INVALID' using errcode = 'P0001';
    end if;
  else
    raise exception 'BUSINESS_ENTITY_TYPE_INVALID' using errcode = 'P0001';
  end if;
end
$function$;

revoke all on function public.assert_business_ownership_invariants_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.assert_business_ownership_invariants_v2(uuid, uuid) to service_role;
commit;
