-- Phase 14D Business public ports. Business remains the sole common-share
-- quantity authority; custody transfers never issue shares or post cash.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
alter table public.business_corporate_share_structures
  add column market_custody_shares bigint not null default 0
  check(market_custody_shares>=0 and market_custody_shares<=outstanding_shares);
alter table public.business_ownership_transactions alter column consideration_amount type numeric(38,18);
create or replace function economy_private.assert_business_common_equity_v1(p_game uuid,p_business uuid)
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
  if v_structure.outstanding_shares<=0
    or v_units+v_structure.market_custody_shares<>v_structure.outstanding_shares or v_votes<>v_units then
    raise exception 'BUSINESS_COMMON_OUTSTANDING_MISMATCH' using errcode='23514';
  end if;
  if exists(select 1 from public.business_ownership_transactions
    where game_session_id=p_game and business_id=p_business
      and (ownership_kind<>'share' or voting_units<>units or from_player_id=to_player_id)) then
    raise exception 'BUSINESS_COMMON_TRANSACTION_INVALID' using errcode='23514';
  end if;
  if v_structure.market_custody_shares <> (
    select coalesce(sum(case when from_player_id is not null then units else -units end),0)
    from public.business_ownership_transactions where game_session_id=p_game and business_id=p_business
      and transaction_kind='transfer' and metadata->>'counterpartyKind'='stock_market_custody'
  ) then raise exception 'BUSINESS_COMMON_CUSTODY_RECEIPT_MISMATCH' using errcode='23514'; end if;
  if exists(select 1 from public.business_ownership_transactions
    where game_session_id=p_game and business_id=p_business and metadata->>'counterpartyKind'='stock_market_custody'
      and (transaction_kind<>'transfer' or (from_player_id is null)=(to_player_id is null))) then
    raise exception 'BUSINESS_COMMON_CUSTODY_RECEIPT_INVALID' using errcode='23514';
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
    if v_owner_count < 1 and not exists(select 1 from public.business_corporate_share_structures
      where game_session_id=p_game_session_id and business_id=p_business_id
        and market_custody_shares=outstanding_shares and market_custody_shares>0) then
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

    select share_row.*
    into v_share_structure
    from public.business_corporate_share_structures as share_row
    where share_row.game_session_id = p_game_session_id
      and share_row.business_id = p_business_id;
    if not found or v_share_structure.outstanding_shares <> v_units+v_share_structure.market_custody_shares
      or (v_owner_count=0 and v_share_structure.market_custody_shares<=0) then
      raise exception 'CORPORATION_SHARE_LEDGER_INVALID' using errcode = 'P0001';
    end if;
  else
    raise exception 'BUSINESS_ENTITY_TYPE_INVALID' using errcode = 'P0001';
  end if;
end
$function$;
create or replace function public.read_owned_business_governance_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_business record;
  v_business_row public.business_entities%rowtype;
  v_position public.business_ownership_positions%rowtype;
  v_total_units numeric := 0;
  v_total_voting_units numeric := 0;
  v_owner_count integer := 0;
  v_ownership_bps integer := 0;
  v_voting_bps integer := 0;
  v_share_structure jsonb := null;
  v_proposals jsonb := '[]'::jsonb;
begin
  select *
  into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  select business_row.*
  into v_business_row
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_business.business_id;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select position_row.*
  into v_position
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = v_business.business_id
    and position_row.player_id = p_player_id
    and position_row.status = 'active'
  order by position_row.effective_at, position_row.public_key
  limit 1;
  -- An explicit operating mandate survives sale of the last investment share.

  select
    coalesce(sum(position_row.units), 0)::numeric,
    coalesce(sum(position_row.voting_units), 0)::numeric,
    count(*)::integer
  into v_total_units, v_total_voting_units, v_owner_count
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = v_business.business_id
    and position_row.status = 'active';

  -- Custody shares remain outstanding, but no player casts their votes.
  select coalesce((select outstanding_shares from public.business_corporate_share_structures
    where game_session_id=p_game_session_id and business_id=v_business.business_id),v_total_units)
    into v_total_units;
  if v_total_units <= 0 then
    raise exception 'BUSINESS_OWNERSHIP_STATE_INVALID' using errcode = 'P0001';
  end if;

  v_ownership_bps := least(
    10000,
    greatest(0, floor(coalesce(v_position.units,0) * 10000.0 / v_total_units)::integer)
  );
  if v_total_voting_units > 0 then
    v_voting_bps := least(
      10000,
      greatest(
        0,
        floor(coalesce(v_position.voting_units,0) * 10000.0 / v_total_voting_units)::integer
      )
    );
  end if;

  select jsonb_build_object(
    'authorizedShares', structure.authorized_shares::text,
    'issuedShares', structure.issued_shares::text,
    'treasuryShares', structure.treasury_shares::text,
    'marketCustodyShares', structure.market_custody_shares::text,
    'outstandingShares', structure.outstanding_shares::text
  )
  into v_share_structure
  from public.business_corporate_share_structures as structure
  where structure.game_session_id = p_game_session_id
    and structure.business_id = v_business.business_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'proposalKey', proposal.public_key,
    'proposalType', proposal.proposal_type,
    'status', proposal.status,
    'approvalThresholdBasisPoints', proposal.approval_threshold_basis_points,
    'snapshotTotalVotingUnits', proposal.snapshot_total_voting_units::text,
    'expiresAt', proposal.expires_at,
    'resolvedAt', proposal.resolved_at,
    'executedAt', proposal.executed_at
  ) order by proposal.created_at desc, proposal.public_key), '[]'::jsonb)
  into v_proposals
  from public.business_governance_proposals as proposal
  where proposal.game_session_id = p_game_session_id
    and proposal.business_id = v_business.business_id
    and proposal.status in ('open','approved');

  return jsonb_build_object(
    'businessKey', v_business.business_key,
    'entityType', v_business_row.entity_type,
    'taxClassification', v_business_row.tax_classification,
    'formationState', v_business_row.formation_state,
    'ownershipModelVersion', v_business_row.ownership_model_version,
    'ownerCount', v_owner_count,
    'totalUnits', v_total_units::text,
    'totalVotingUnits', v_total_voting_units::text,
    'managementAuthority', true,
    'currentPosition', case when v_position.id is null then null else jsonb_build_object(
      'positionKey', v_position.public_key,
      'ownershipKind', v_position.ownership_kind,
      'units', v_position.units::text,
      'votingUnits', v_position.voting_units::text,
      'ownershipBasisPoints', v_ownership_bps,
      'votingBasisPoints', v_voting_bps,
      'effectiveAt', v_position.effective_at
    ) end,
    'corporateShareStructure', v_share_structure,
    'openProposals', v_proposals,
    'readOnly', true
  );
end
$function$;

create function economy_private.publish_business_market_observation_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp
as $function$
begin
  if tg_table_name='business_financial_statements' then
    insert into public.business_activity_events(game_session_id,business_id,actor_type,event_type,source_id,reason_code,metadata)
    values(new.game_session_id,new.business_id,'system','business.financials.closed.v1',new.close_receipt_id,
      'closed_financial_statement',jsonb_build_object('schemaVersion',1,'periodNumber',new.period_number::text,'status',new.status));
  elsif old.status is distinct from new.status then
    insert into public.business_activity_events(game_session_id,business_id,actor_type,event_type,source_id,reason_code,metadata)
    values(new.game_session_id,new.id,'system','business.market.status.changed.v1',new.id,
      'operating_status_changed',jsonb_build_object('schemaVersion',1,'status',new.status));
  end if;
  return new;
end;
$function$;
revoke all on function economy_private.publish_business_market_observation_v1() from public,anon,authenticated,service_role;
create trigger publish_business_financial_market_observation after insert on public.business_financial_statements
  for each row execute function economy_private.publish_business_market_observation_v1();
create trigger publish_business_status_market_observation after update of status on public.business_entities
  for each row execute function economy_private.publish_business_market_observation_v1();
create index business_market_event_read_idx on public.business_activity_events(game_session_id,occurred_at,public_key)
  where event_type in ('business.ipo.subscribed.v1','business.financials.closed.v1','business.market.status.changed.v1');

-- The trusted consumer selects a bounded anti-join against its own receipts.
-- There is no timestamp watermark that could omit a late-committing event.
create function public.read_business_market_events_v1(p_game_session_id uuid)
returns table(event_key text,business_key text,event_type text,event_version integer,occurred_at timestamptz)
language sql stable security definer set search_path=pg_catalog,pg_temp
as $function$
  select e.public_key,b.public_key,e.event_type,1,e.occurred_at
  from public.business_activity_events e join public.business_entities b
    on b.game_session_id=e.game_session_id and b.id=e.business_id
  where e.game_session_id=p_game_session_id and (
    (e.event_type='business.ipo.subscribed.v1' and e.metadata->>'offeringCompleted'='true')
    or e.event_type in ('business.financials.closed.v1','business.market.status.changed.v1'));
$function$;
revoke all on function public.read_business_market_events_v1(uuid) from public,anon,authenticated,service_role;

create function public.read_business_market_listing_v1(p_game_session_id uuid,p_business_key text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,pg_temp
as $function$
declare b public.business_entities%rowtype; p public.business_governance_proposals%rowtype;
  s public.business_financial_statements%rowtype;cap public.business_corporate_share_structures%rowtype;c jsonb; v_complete boolean;
begin
  select * into b from public.business_entities where game_session_id=p_game_session_id and public_key=p_business_key;
  if not found then raise exception 'BUSINESS_MARKET_ISSUER_NOT_FOUND'; end if;
  select * into p from public.business_governance_proposals where game_session_id=p_game_session_id and business_id=b.id
    and terms->>'schema'='business.primary_ipo.v1' and status='executed' order by created_at,public_key limit 1;
  if not found then return jsonb_build_object('schemaVersion',1,'businessKey',b.public_key,'listingReady',false); end if;
  select * into cap from public.business_corporate_share_structures where game_session_id=p_game_session_id and business_id=b.id;
  select * into s from public.business_financial_statements where game_session_id=p_game_session_id and business_id=b.id
    order by period_number desc limit 1;
  select value into c from jsonb_array_elements(coalesce(s.statement->'currencies','[]'::jsonb)) x(value)
    where value->>'currencyCode'=b.currency_code;
  v_complete:=s.status='complete' and c is not null;
  return jsonb_build_object('schemaVersion',1,'businessKey',b.public_key,'ipoKey',p.public_key,
    'listingReady',coalesce(v_complete,false) and b.status='active' and b.formation_state='operational'
      and b.currency_code=p.terms->>'currencyCode' and exists(select 1 from public.currencies cur
        join public.country_profiles cp on cp.currency_code=cur.code and cp.country_code=b.country_code
        where cur.code=b.currency_code and cur.status='active' and cur.currency_kind='national'
          and cur.country_code=b.country_code and cp.status='active'),
    'companyName',b.legal_name,'sector',b.industry_code,'countryCode',b.country_code,'currencyCode',b.currency_code,
    'initialPrice',p.terms->>'unitPrice','outstandingShares',cap.outstanding_shares::text,
    'marketCustodyShares',cap.market_custody_shares::text,'status',b.status,
    'financials',case when v_complete then jsonb_build_object('schemaVersion',1,'status','complete',
      'statementKey',s.statement->>'closeReceiptKey','periodNumber',s.period_number::text,'capturedAt',s.captured_at,
      'currencyCode',b.currency_code,'equity',c#>>'{balanceSheet,totalEquity}',
      'revenue',c#>>'{incomeStatement,revenue}','netIncome',c#>>'{incomeStatement,netIncome}')
      else jsonb_build_object('schemaVersion',1,'status',coalesce(s.status,'unavailable')) end);
end;
$function$;
revoke all on function public.read_business_market_listing_v1(uuid,text) from public,anon,authenticated,service_role;

create function public.read_business_market_position_v1(p_game_session_id uuid,p_business_key text,p_player_id uuid)
returns jsonb language plpgsql stable strict security definer set search_path=pg_catalog,pg_temp
as $function$
declare b uuid;v_units bigint;v_basis numeric;
begin
  select id into b from public.business_entities where game_session_id=p_game_session_id and public_key=p_business_key;
  if not found then raise exception 'BUSINESS_MARKET_ISSUER_NOT_FOUND'; end if;
  select coalesce(sum(units),0) into v_units from public.business_ownership_positions
    where game_session_id=p_game_session_id and business_id=b and player_id=p_player_id and status='active';
  select coalesce(sum(consideration_amount)/nullif(sum(units),0),0) into v_basis from public.business_ownership_transactions
    where game_session_id=p_game_session_id and business_id=b and to_player_id=p_player_id;
  return jsonb_build_object('schemaVersion',1,'businessKey',p_business_key,'quantity',v_units::text,'initialAverageCost',v_basis::text);
end;
$function$;
revoke all on function public.read_business_market_position_v1(uuid,text,uuid) from public,anon,authenticated,service_role;

create function public.transfer_business_market_shares_v1(
  p_game_session_id uuid,p_business_key text,p_player_id uuid,p_side text,p_quantity bigint,p_amount numeric,p_order_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp
as $function$
declare b public.business_entities%rowtype; cap public.business_corporate_share_structures%rowtype;
  pos public.business_ownership_positions%rowtype;r public.business_ownership_transactions%rowtype;
  profile jsonb;v_before bigint;v_after bigint;v_key text:='market:'||p_order_id::text;
begin
  if p_order_id is null or p_player_id is null or p_side not in ('buy','sell') or p_quantity is null
    or p_quantity not between 1 and 1000000000 or p_amount is null or p_amount<=0
    then raise exception 'BUSINESS_MARKET_TRANSFER_INVALID'; end if;
  select * into b from public.business_entities where game_session_id=p_game_session_id and public_key=p_business_key for update;
  if not found then raise exception 'BUSINESS_MARKET_ISSUER_NOT_FOUND'; end if;
  select * into r from public.business_ownership_transactions where game_session_id=p_game_session_id and business_id=b.id and idempotency_key=v_key;
  if found then
    if r.units<>p_quantity or r.consideration_amount<>p_amount or r.metadata->>'side'<>p_side
      or coalesce(r.from_player_id,r.to_player_id)<>p_player_id then raise exception 'BUSINESS_MARKET_TRANSFER_CONFLICT'; end if;
    return jsonb_build_object('quantityAfter',r.metadata->>'quantityAfter','receiptKey',r.public_key);
  end if;
  perform economy_private.assert_business_ipo_actor_v1(p_game_session_id,p_player_id);
  profile:=public.read_business_market_listing_v1(p_game_session_id,p_business_key);
  if not coalesce((profile->>'listingReady')::boolean,false) then raise exception 'BUSINESS_MARKET_ISSUER_UNAVAILABLE'; end if;
  select * into cap from public.business_corporate_share_structures where game_session_id=p_game_session_id and business_id=b.id for update;
  select * into pos from public.business_ownership_positions where game_session_id=p_game_session_id and business_id=b.id
    and player_id=p_player_id and status='active' for update;
  v_before:=coalesce(pos.units,0);
  if p_side='buy' and p_quantity>cap.market_custody_shares then raise exception 'BUSINESS_MARKET_SHARES_UNAVAILABLE'; end if;
  if p_side='sell' and p_quantity>v_before then raise exception 'BUSINESS_MARKET_SHARES_INSUFFICIENT'; end if;
  v_after:=v_before+case when p_side='buy' then p_quantity else -p_quantity end;
  if pos.id is null then
    insert into public.business_ownership_positions(game_session_id,business_id,player_id,ownership_kind,units,voting_units)
      values(p_game_session_id,b.id,p_player_id,'share',v_after,v_after);
  elsif v_after=0 then
    update public.business_ownership_positions set status='exited',ended_at=clock_timestamp() where id=pos.id;
  else
    update public.business_ownership_positions set units=v_after,voting_units=v_after where id=pos.id;
  end if;
  update public.business_corporate_share_structures
    set market_custody_shares=market_custody_shares+case when p_side='sell' then p_quantity else -p_quantity end
    where game_session_id=p_game_session_id and business_id=b.id;
  insert into public.business_ownership_transactions(game_session_id,business_id,transaction_kind,ownership_kind,
    from_player_id,to_player_id,units,voting_units,consideration_amount,currency_code,idempotency_key,metadata)
    values(p_game_session_id,b.id,'transfer','share',case when p_side='sell' then p_player_id end,
      case when p_side='buy' then p_player_id end,p_quantity,p_quantity,p_amount,b.currency_code,v_key,
      jsonb_build_object('schemaVersion',1,'counterpartyKind','stock_market_custody','side',p_side,
        'quantityAfter',v_after::text,'orderId',p_order_id)) returning * into r;
  perform public.assert_business_ownership_invariants_v2(p_game_session_id,b.id);
  return jsonb_build_object('quantityAfter',v_after::text,'receiptKey',r.public_key);
end;
$function$;
-- The port is callable only inside trusted Market SQL commands, not by the
-- HTTP service role as a standalone share mutation.
revoke all on function public.transfer_business_market_shares_v1(uuid,text,uuid,text,bigint,numeric,uuid)
  from public,anon,authenticated,service_role;
create function public.lock_business_market_position_v1(p_game_session_id uuid,p_business_key text,p_player_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp
as $function$
declare b uuid;
begin
  perform economy_private.assert_business_ipo_actor_v1(p_game_session_id,p_player_id);
  select id into b from public.business_entities where game_session_id=p_game_session_id and public_key=p_business_key for update;
  if not found then raise exception 'BUSINESS_MARKET_ISSUER_NOT_FOUND'; end if;
  perform 1 from public.business_corporate_share_structures where game_session_id=p_game_session_id and business_id=b for update;
  return public.read_business_market_position_v1(p_game_session_id,p_business_key,p_player_id)
    ||jsonb_build_object('listing',public.read_business_market_listing_v1(p_game_session_id,p_business_key));
end;
$function$;
revoke all on function public.lock_business_market_position_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
commit;
