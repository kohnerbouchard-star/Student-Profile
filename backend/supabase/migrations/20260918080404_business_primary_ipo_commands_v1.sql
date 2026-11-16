begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
-- Keep approved IPO terms and their evidence immutable across command paths.
create unique index business_primary_ipo_proposer_replay_idx
  on public.business_governance_proposals(game_session_id,proposer_player_id,idempotency_key)
  where terms->>'schema'='business.primary_ipo.v1';

create function economy_private.guard_business_ipo_proposal_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp
as $function$
declare v_approve numeric;v_reject numeric;v_issued numeric;
begin
  if tg_op='DELETE' then
    if private.is_game_data_purge_delete_authorized_v1(old.game_session_id,tg_table_schema,tg_table_name)
      then return old; end if;
    raise exception 'BUSINESS_GOVERNANCE_EVIDENCE_IMMUTABLE' using errcode='42501';
  end if;
  if (to_jsonb(new)-array['status','resolved_at','executed_at','updated_at']) is distinct from
    (to_jsonb(old)-array['status','resolved_at','executed_at','updated_at']) then
    raise exception 'BUSINESS_GOVERNANCE_TERMS_IMMUTABLE' using errcode='42501';
  end if;
  if old.terms->>'schema' is distinct from 'business.primary_ipo.v1' then return new; end if;
  if new.status=old.status then
    if new.resolved_at is distinct from old.resolved_at or new.executed_at is distinct from old.executed_at then
      raise exception 'BUSINESS_IPO_STATE_INVALID';
    end if;
    return new;
  end if;
  if old.status='open' and new.status in ('approved','rejected') and old.expires_at>now() then
    select coalesce(sum(voting_units) filter(where decision='approve'),0),
      coalesce(sum(voting_units) filter(where decision='reject'),0) into v_approve,v_reject
      from public.business_governance_votes where game_session_id=old.game_session_id and proposal_id=old.id;
    if (new.status='approved' and floor(v_approve*10000/old.snapshot_total_voting_units)>=old.approval_threshold_basis_points)
      or (new.status='rejected' and 10000-floor(v_reject*10000/old.snapshot_total_voting_units)<old.approval_threshold_basis_points)
      then return new; end if;
  elsif old.status='open' and new.status='expired' and old.expires_at<=now() then return new;
  elsif old.status='approved' and new.status='executed' then
    select coalesce(sum(units),0) into v_issued from public.business_ownership_transactions
      where game_session_id=old.game_session_id and business_id=old.business_id
        and transaction_kind='issuance' and metadata->>'ipoKey'=old.public_key;
    if v_issued=(old.terms->>'offeredShares')::bigint and new.resolved_at=old.resolved_at then return new; end if;
  end if;
  raise exception 'BUSINESS_IPO_STATE_INVALID' using errcode='42501';
end;
$function$;
revoke all on function economy_private.guard_business_ipo_proposal_v1() from public,anon,authenticated,service_role;
create trigger business_governance_proposal_immutable before update or delete on public.business_governance_proposals
  for each row execute function economy_private.guard_business_ipo_proposal_v1();

-- Prepared read/eligibility functions; appended to the Phase14C command migration.
create function economy_private.business_ipo_eligibility_v1(p_game uuid,p_business uuid)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,pg_temp
as $function$
declare b public.business_entities%rowtype;s public.business_financial_statements%rowtype;
  cap public.business_corporate_share_structures%rowtype;c record;v_currency jsonb;v_reason text;
begin
  select * into b from public.business_entities where game_session_id=p_game and id=p_business;
  if not found then raise exception 'BUSINESS_NOT_FOUND'; end if;
  select * into cap from public.business_corporate_share_structures where game_session_id=p_game and business_id=p_business;
  select * into s from public.business_financial_statements where game_session_id=p_game and business_id=p_business
    order by period_number desc limit 1;
  select cur.code,cur.decimal_places into c from public.currencies cur
    join public.country_profiles country on country.currency_code=cur.code and country.country_code=b.country_code
    where cur.code=b.currency_code and cur.status='active' and cur.currency_kind='national'
      and cur.country_code=b.country_code and country.status='active';
  select value into v_currency from jsonb_array_elements(coalesce(s.statement->'currencies','[]'::jsonb)) x(value)
    where value->>'currencyCode'=b.currency_code;
  v_reason:=case
    when b.entity_type not in ('corporation','c_corporation') then 'requires_corporation'
    when b.status<>'active' or b.formation_state<>'operational' then 'business_inactive'
    when cap.business_id is null or cap.authorized_shares<=cap.issued_shares
      or cap.issued_shares>1000000000 then 'authorized_capacity_required'
    when c.code is null then 'national_currency_required'
    when s.business_id is null or s.status<>'complete' or v_currency is null then 'financial_history_unavailable'
    when (v_currency#>>'{balanceSheet,totalEquity}')::numeric<=0
      or exists(select 1 from jsonb_array_elements(s.statement->'currencies') x(value)
        where (value#>>'{balanceSheet,totalEquity}')::numeric<0) then 'positive_equity_required'
    when not exists(select 1 from public.business_operating_period_close_receipts r
      where r.game_session_id=p_game and r.business_id=p_business and r.store_receipt_count>0)
      then 'operating_sales_required'
    else null end;
  return jsonb_build_object('eligible',v_reason is null,'reason',v_reason,
    'businessKey',b.public_key,'businessName',b.legal_name,'countryCode',b.country_code,
    'currencyCode',b.currency_code,'priceDecimalPlaces',least(coalesce(c.decimal_places,2),2),
    'authorizedShares',cap.authorized_shares::text,'issuedShares',cap.issued_shares::text,
    'outstandingShares',cap.outstanding_shares::text,
    'availableShares',(cap.authorized_shares-cap.issued_shares)::text,
    'statementKey',s.statement->>'closeReceiptKey','periodNumber',s.period_number::text,
    'equity',v_currency#>>'{balanceSheet,totalEquity}',
    'revenue',v_currency#>>'{incomeStatement,revenue}',
    'netIncome',v_currency#>>'{incomeStatement,netIncome}');
end;
$function$;
revoke all on function economy_private.business_ipo_eligibility_v1(uuid,uuid)
  from public,anon,authenticated,service_role;

create function economy_private.business_ipo_offer_json_v1(p_proposal uuid,p_player uuid)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,pg_temp
as $function$
declare p public.business_governance_proposals%rowtype;b public.business_entities%rowtype;
  v_issued numeric;v_owned numeric;v_approval numeric;v_rejection numeric;v_vote text;
  v_eligibility jsonb;v_has_voting_right boolean;v_status text;
begin
  select * into p from public.business_governance_proposals where id=p_proposal;
  if not found or p.terms->>'schema' is distinct from 'business.primary_ipo.v1' then raise exception 'BUSINESS_IPO_NOT_FOUND'; end if;
  select * into b from public.business_entities where game_session_id=p.game_session_id and id=p.business_id;
  select coalesce(sum(t.units),0),coalesce(sum(t.units) filter(where t.to_player_id=p_player),0)
    into v_issued,v_owned from public.business_ownership_transactions t
    where t.game_session_id=p.game_session_id and t.business_id=p.business_id
      and t.transaction_kind='issuance' and t.metadata->>'ipoKey'=p.public_key;
  select coalesce(sum(v.voting_units) filter(where v.decision='approve'),0),
    coalesce(sum(v.voting_units) filter(where v.decision='reject'),0),
    max(v.decision) filter(where v.player_id=p_player)
    into v_approval,v_rejection,v_vote from public.business_governance_votes v
    where v.game_session_id=p.game_session_id and v.proposal_id=p.id;
  v_has_voting_right:=exists(select 1 from public.business_governance_voter_snapshots v
    where v.game_session_id=p.game_session_id and v.proposal_id=p.id and v.player_id=p_player);
  v_eligibility:=economy_private.business_ipo_eligibility_v1(p.game_session_id,p.business_id);
  v_status:=case when p.status='open' and p.expires_at<=now() then 'expired' else p.status end;
  return jsonb_build_object('ipoKey',p.public_key,'businessKey',b.public_key,'businessName',b.legal_name,
    'status',v_status,'currencyCode',p.terms->>'currencyCode','unitPrice',p.terms->>'unitPrice',
    'offeredShares',p.terms->>'offeredShares','issuedShares',v_issued::text,
    'remainingShares',((p.terms->>'offeredShares')::numeric-v_issued)::text,
    'originalOutstandingShares',p.terms->>'originalOutstandingShares',
    'postOfferingOutstandingShares',p.terms->>'postOfferingOutstandingShares',
    'newShareBasisPoints',p.terms->>'newShareBasisPoints',
    'statementKey',p.terms->>'statementKey','periodNumber',p.terms->>'periodNumber',
    'equity',p.terms->>'equity','revenue',p.terms->>'revenue','netIncome',p.terms->>'netIncome',
    'managementPolicy','operating_owners_at_first_subscription_v1',
    'settlementPolicy','immediate_issuance_listing_after_full_allocation',
    'approvalThresholdBasisPoints',p.approval_threshold_basis_points,
    'approvalBasisPoints',floor(v_approval*10000/p.snapshot_total_voting_units)::integer,
    'rejectionBasisPoints',floor(v_rejection*10000/p.snapshot_total_voting_units)::integer,
    'canVote',v_has_voting_right and v_vote is null and v_status='open',
    'vote',v_vote,'subscribedShares',v_owned::text,
    'canSubscribe',p.status='approved' and (v_eligibility->>'eligible')::boolean
      and v_issued<(p.terms->>'offeredShares')::numeric,
    'subscriptionUnavailableReason',case when p.status='approved' then v_eligibility->>'reason' else null end,
    'votingExpiresAt',p.expires_at,'createdAt',p.created_at);
end;
$function$;
revoke all on function economy_private.business_ipo_offer_json_v1(uuid,uuid) from public,anon,authenticated,service_role;

create function public.read_player_business_ipos_v1(p_game_session_id uuid,p_player_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,pg_temp
as $function$
declare v_offers jsonb;v_own jsonb;v_count integer;v_truncated boolean;
begin
  if not exists(select 1 from public.game_sessions where id=p_game_session_id and status='active' and lifecycle_state='active')
    then raise exception 'BUSINESS_IPO_GAME_UNAVAILABLE' using errcode='42501'; end if;
  if not exists(select 1 from public.players where game_session_id=p_game_session_id and id=p_player_id and status='active')
    then raise exception 'BUSINESS_IPO_PLAYER_UNAVAILABLE' using errcode='42501'; end if;
  select count(*) into v_count from public.business_entities b where b.game_session_id=p_game_session_id
    and private.business_controller_matches_request_v1(p_game_session_id,b.id,p_player_id);
  if v_count=1 then
    select economy_private.business_ipo_eligibility_v1(p_game_session_id,b.id) || jsonb_build_object(
      'canPropose',exists(select 1 from public.business_ownership_positions o
        where o.game_session_id=p_game_session_id and o.business_id=b.id and o.player_id=p_player_id
          and o.status='active' and o.voting_units>0)
        and not exists(select 1 from public.business_governance_proposals p
          where p.game_session_id=p_game_session_id and p.business_id=b.id
            and ((p.proposal_type='capital_raise' and (p.status='approved' or (p.status='open' and p.expires_at>now())))
              or (p.terms->>'schema'='business.primary_ipo.v1' and p.status='executed')))) into v_own
      from public.business_entities b where b.game_session_id=p_game_session_id
        and private.business_controller_matches_request_v1(p_game_session_id,b.id,p_player_id);
  end if;
  with candidates as materialized (
    select p.id,p.created_at from public.business_governance_proposals p
      where p.game_session_id=p_game_session_id and p.terms->>'schema'='business.primary_ipo.v1'
        and (p.status in ('approved','executed') or private.business_controller_matches_request_v1(
          p_game_session_id,p.business_id,p_player_id) or exists(select 1 from public.business_governance_voter_snapshots v
            where v.game_session_id=p_game_session_id and v.proposal_id=p.id and v.player_id=p_player_id))
      order by p.created_at desc,p.id limit 101
  ) select coalesce((select jsonb_agg(economy_private.business_ipo_offer_json_v1(id,p_player_id)
      order by created_at desc,id) from (select * from candidates order by created_at desc,id limit 100) limited),'[]'::jsonb),
      (select count(*)>100 from candidates) into v_offers,v_truncated;
  return jsonb_build_object('schemaVersion',1,'offerLimit',100,'truncated',v_truncated,
    'ownBusiness',v_own,'offers',v_offers);
end;
$function$;
revoke all on function public.read_player_business_ipos_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_player_business_ipos_v1(uuid,uuid) to service_role;

-- Prepared primary issuance commands. No Market, Inventory or balance DML.
create function public.propose_business_primary_ipo_v1(
  p_game_session_id uuid,p_player_id uuid,p_unit_price numeric,p_offered_shares bigint,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp
as $function$
declare b record;p public.business_governance_proposals%rowtype;e jsonb;t jsonb;v_total bigint;
begin
  if p_unit_price is null or p_offered_shares is null or p_unit_price<=0 or p_unit_price>1000000
    or p_offered_shares not between 1 and 1000000
    or p_unit_price*p_offered_shares>10000000000
    or coalesce(p_idempotency_key,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then raise exception 'BUSINESS_IPO_REQUEST_INVALID' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','business-ipo-proposal',p_game_session_id,p_player_id,p_idempotency_key),0));
  select * into p from public.business_governance_proposals x
    where x.game_session_id=p_game_session_id and x.proposer_player_id=p_player_id and x.idempotency_key=p_idempotency_key
      and x.terms->>'schema'='business.primary_ipo.v1';
  if found then
    if (p.terms->>'unitPrice')::numeric<>p_unit_price or (p.terms->>'offeredShares')::bigint<>p_offered_shares
      then raise exception 'BUSINESS_IPO_IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
    return jsonb_build_object('schemaVersion',1,'operation','propose','replayed',true,
      'offer',economy_private.business_ipo_offer_json_v1(p.id,p_player_id));
  end if;
  perform economy_private.assert_business_ipo_actor_v1(p_game_session_id,p_player_id);
  select * into b from public.resolve_player_business_v2(p_game_session_id,p_player_id);
  perform 1 from public.business_entities where game_session_id=p_game_session_id and id=b.business_id for update;
  if not exists(select 1 from public.business_ownership_positions x where x.game_session_id=p_game_session_id
    and x.business_id=b.business_id and x.player_id=p_player_id and x.status='active' and x.voting_units>0)
  then raise exception 'BUSINESS_IPO_GOVERNANCE_AUTHORITY_REQUIRED' using errcode='42501'; end if;
  update public.business_governance_proposals set status='expired',resolved_at=now()
    where game_session_id=p_game_session_id and business_id=b.business_id and status='open'
      and terms->>'schema'='business.primary_ipo.v1' and expires_at<=now();
  if exists(select 1 from public.business_governance_proposals x where x.game_session_id=p_game_session_id
    and x.business_id=b.business_id and ((x.proposal_type='capital_raise' and x.status in ('open','approved'))
      or (x.terms->>'schema'='business.primary_ipo.v1' and x.status='executed')))
  then raise exception 'BUSINESS_IPO_ALREADY_OFFERED'; end if;
  e:=economy_private.business_ipo_eligibility_v1(p_game_session_id,b.business_id);
  if not (e->>'eligible')::boolean then raise exception 'BUSINESS_IPO_INELIGIBLE'; end if;
  if p_unit_price<>round(p_unit_price,(e->>'priceDecimalPlaces')::integer)
    or p_offered_shares>(e->>'availableShares')::bigint
    or (e->>'outstandingShares')::bigint+p_offered_shares>1000000000
  then raise exception 'BUSINESS_IPO_TERMS_INVALID' using errcode='22023'; end if;
  t:=jsonb_build_object('schema','business.primary_ipo.v1','unitPrice',trim_scale(p_unit_price)::text,
    'offeredShares',p_offered_shares::text,'currencyCode',e->>'currencyCode',
    'originalOutstandingShares',e->>'outstandingShares',
    'postOfferingOutstandingShares',((e->>'outstandingShares')::bigint+p_offered_shares)::text,
    'newShareBasisPoints',floor(p_offered_shares::numeric*10000/((e->>'outstandingShares')::bigint+p_offered_shares))::text,
    'statementKey',e->>'statementKey','periodNumber',e->>'periodNumber',
    'equity',e->>'equity','revenue',e->>'revenue','netIncome',e->>'netIncome',
    'managementPolicy','operating_owners_at_first_subscription_v1',
    'settlementPolicy','immediate_issuance_listing_after_full_allocation');
  select sum(voting_units) into v_total from public.business_ownership_positions x
    where x.game_session_id=p_game_session_id and x.business_id=b.business_id and x.status='active';
  insert into public.business_governance_proposals(game_session_id,business_id,proposer_player_id,
    proposal_type,approval_threshold_basis_points,snapshot_total_voting_units,terms,idempotency_key,expires_at)
  values(p_game_session_id,b.business_id,p_player_id,'capital_raise',public.business_governance_threshold_v2('capital_raise'),
    v_total,t,p_idempotency_key,now()+interval '7 days') returning * into p;
  insert into public.business_governance_voter_snapshots(game_session_id,proposal_id,player_id,voting_units)
    select p_game_session_id,p.id,x.player_id,x.voting_units from public.business_ownership_positions x
    where x.game_session_id=p_game_session_id and x.business_id=b.business_id and x.status='active' and x.voting_units>0;
  insert into public.business_activity_events(game_session_id,business_id,actor_type,actor_player_id,event_type,source_id,reason_code,metadata)
    values(p_game_session_id,b.business_id,'player',p_player_id,'business.ipo.proposed.v1',p.id,'primary_ipo_proposed',
      jsonb_build_object('schemaVersion',1,'ipoKey',p.public_key,'terms',t));
  return jsonb_build_object('schemaVersion',1,'operation','propose','replayed',false,
    'offer',economy_private.business_ipo_offer_json_v1(p.id,p_player_id));
end;
$function$;
revoke all on function public.propose_business_primary_ipo_v1(uuid,uuid,numeric,bigint,text) from public,anon,authenticated;
grant execute on function public.propose_business_primary_ipo_v1(uuid,uuid,numeric,bigint,text) to service_role;

create function public.vote_business_primary_ipo_v1(
  p_game_session_id uuid,p_player_id uuid,p_ipo_key text,p_decision text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp
as $function$
declare p public.business_governance_proposals%rowtype;v public.business_governance_votes%rowtype;
  v_units bigint;v_approve numeric;v_reject numeric;
begin
  if coalesce(p_ipo_key,'') !~ '^bgp_[0-9a-f]{32}$' or coalesce(p_decision,'') not in ('approve','reject')
    or coalesce(p_idempotency_key,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then raise exception 'BUSINESS_IPO_REQUEST_INVALID' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','business-ipo-vote',p_game_session_id,p_player_id,p_idempotency_key),0));
  select * into p from public.business_governance_proposals x where x.game_session_id=p_game_session_id
    and x.public_key=p_ipo_key and x.terms->>'schema'='business.primary_ipo.v1';
  if not found then raise exception 'BUSINESS_IPO_NOT_FOUND'; end if;
  select * into v from public.business_governance_votes x where x.game_session_id=p_game_session_id
    and x.player_id=p_player_id and x.idempotency_key=p_idempotency_key;
  if found then
    if v.proposal_id<>p.id or v.decision<>p_decision then raise exception 'BUSINESS_IPO_IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
    return jsonb_build_object('schemaVersion',1,'operation','vote','replayed',true,
      'offer',economy_private.business_ipo_offer_json_v1(p.id,p_player_id));
  end if;
  perform economy_private.assert_business_ipo_actor_v1(p_game_session_id,p_player_id);
  perform 1 from public.business_entities where game_session_id=p_game_session_id and id=p.business_id for update;
  select * into p from public.business_governance_proposals x where x.id=p.id for update;
  if p.status<>'open' or p.expires_at<=now() then raise exception 'BUSINESS_IPO_VOTING_CLOSED'; end if;
  select voting_units into v_units from public.business_governance_voter_snapshots x
    where x.game_session_id=p_game_session_id and x.proposal_id=p.id and x.player_id=p_player_id;
  if not found then raise exception 'BUSINESS_IPO_VOTER_NOT_ELIGIBLE' using errcode='42501'; end if;
  if exists(select 1 from public.business_governance_votes x where x.game_session_id=p_game_session_id
    and x.proposal_id=p.id and x.player_id=p_player_id) then raise exception 'BUSINESS_IPO_VOTE_ALREADY_CAST'; end if;
  insert into public.business_governance_votes(game_session_id,proposal_id,player_id,decision,voting_units,idempotency_key)
    values(p_game_session_id,p.id,p_player_id,p_decision,v_units,p_idempotency_key);
  select coalesce(sum(voting_units) filter(where decision='approve'),0),coalesce(sum(voting_units) filter(where decision='reject'),0)
    into v_approve,v_reject from public.business_governance_votes x where x.game_session_id=p_game_session_id and x.proposal_id=p.id;
  if floor(v_approve*10000/p.snapshot_total_voting_units)>=p.approval_threshold_basis_points then
    update public.business_governance_proposals set status='approved',resolved_at=now() where id=p.id;
  elsif 10000-floor(v_reject*10000/p.snapshot_total_voting_units)<p.approval_threshold_basis_points then
    update public.business_governance_proposals set status='rejected',resolved_at=now() where id=p.id;
  end if;
  insert into public.business_activity_events(game_session_id,business_id,actor_type,actor_player_id,event_type,source_id,reason_code,metadata)
    values(p_game_session_id,p.business_id,'player',p_player_id,'business.ipo.vote.v1',p.id,'primary_ipo_vote',
      jsonb_build_object('schemaVersion',1,'ipoKey',p.public_key,'decision',p_decision));
  return jsonb_build_object('schemaVersion',1,'operation','vote','replayed',false,
    'offer',economy_private.business_ipo_offer_json_v1(p.id,p_player_id));
end;
$function$;
revoke all on function public.vote_business_primary_ipo_v1(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.vote_business_primary_ipo_v1(uuid,uuid,text,text,text) to service_role;

create function economy_private.business_ipo_receipt_json_v1(p_receipt public.business_ownership_transactions,p_replayed boolean)
returns jsonb language sql stable security invoker set search_path=pg_catalog,pg_temp
as $function$
  select jsonb_build_object('schemaVersion',1,'operation','subscribe','replayed',p_replayed,
    'receipt',jsonb_build_object('receiptKey',(p_receipt).public_key,'ipoKey',(p_receipt).metadata->>'ipoKey',
      'businessKey',(p_receipt).metadata->>'businessKey','shares',(p_receipt).units::text,
      'unitPrice',(p_receipt).metadata->>'unitPrice','total',(p_receipt).consideration_amount::text,
      'currencyCode',(p_receipt).currency_code,'createdAt',(p_receipt).created_at,
      'offeringCompleted',(p_receipt).metadata->'offeringCompleted'));
$function$;
revoke all on function economy_private.business_ipo_receipt_json_v1(public.business_ownership_transactions,boolean)
  from public,anon,authenticated,service_role;

create function public.subscribe_business_primary_ipo_v1(
  p_game_session_id uuid,p_player_id uuid,p_ipo_key text,p_shares bigint,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp
as $function$
declare p public.business_governance_proposals%rowtype;b public.business_entities%rowtype;
  r public.business_ownership_transactions%rowtype;cap public.business_corporate_share_structures%rowtype;
  pos public.business_ownership_positions%rowtype;e jsonb;v_issued bigint;v_price numeric;v_total numeric;
  v_key text;v_complete boolean;
begin
  if coalesce(p_ipo_key,'') !~ '^bgp_[0-9a-f]{32}$' or p_shares is null or p_shares not between 1 and 1000000
    or coalesce(p_idempotency_key,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then raise exception 'BUSINESS_IPO_REQUEST_INVALID' using errcode='22023'; end if;
  v_key:='ipo:'||encode(extensions.digest(concat_ws(':',p_player_id,p_idempotency_key),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','business-ipo-subscribe',p_game_session_id,p_player_id,p_idempotency_key),0));
  select * into r from public.business_ownership_transactions x where x.game_session_id=p_game_session_id
    and x.to_player_id=p_player_id and x.idempotency_key=v_key;
  if found then
    if r.transaction_kind<>'issuance' or r.metadata->>'ipoKey' is distinct from p_ipo_key or r.units<>p_shares
      then raise exception 'BUSINESS_IPO_IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
    return economy_private.business_ipo_receipt_json_v1(r,true);
  end if;
  perform economy_private.assert_business_ipo_actor_v1(p_game_session_id,p_player_id);
  select * into p from public.business_governance_proposals x where x.game_session_id=p_game_session_id
    and x.public_key=p_ipo_key and x.terms->>'schema'='business.primary_ipo.v1';
  if not found then raise exception 'BUSINESS_IPO_NOT_FOUND'; end if;
  select * into b from public.business_entities x where x.game_session_id=p_game_session_id and x.id=p.business_id for update;
  select * into p from public.business_governance_proposals x where x.id=p.id for update;
  if p.status<>'approved' then raise exception 'BUSINESS_IPO_NOT_OPEN'; end if;
  e:=economy_private.business_ipo_eligibility_v1(p_game_session_id,b.id);
  if not (e->>'eligible')::boolean then raise exception 'BUSINESS_IPO_INELIGIBLE'; end if;
  if p.terms->>'currencyCode' is distinct from b.currency_code then raise exception 'BUSINESS_IPO_CURRENCY_CHANGED'; end if;
  select * into cap from public.business_corporate_share_structures x
    where x.game_session_id=p_game_session_id and x.business_id=b.id for update;
  select coalesce(sum(units),0) into v_issued from public.business_ownership_transactions x
    where x.game_session_id=p_game_session_id and x.business_id=b.id and x.transaction_kind='issuance' and x.metadata->>'ipoKey'=p.public_key;
  if p_shares>(p.terms->>'offeredShares')::bigint-v_issued
    or p_shares>cap.authorized_shares-cap.issued_shares
    or cap.outstanding_shares<>(p.terms->>'originalOutstandingShares')::bigint+v_issued
  then raise exception 'BUSINESS_IPO_ALLOCATION_UNAVAILABLE'; end if;
  v_price:=(p.terms->>'unitPrice')::numeric;v_total:=v_price*p_shares;
  v_complete:=v_issued+p_shares=(p.terms->>'offeredShares')::bigint;
  -- Freeze operating owners before adding the first investment position.
  if not exists(select 1 from public.business_management_mandates x
    where x.game_session_id=p_game_session_id and x.business_id=b.id) then
    insert into public.business_management_mandates(game_session_id,business_id,player_id,source_proposal_id)
      select p_game_session_id,b.id,x.player_id,p.id from public.business_ownership_positions x
      where x.game_session_id=p_game_session_id and x.business_id=b.id and x.status='active';
  end if;
  -- Existing Banking bridge commands enforce account holds, currency precision,
  -- available funds and immutable ledger posting. Both legs share this transaction.
  perform * from public.record_player_ledger_entry(p_game_session_id,p_player_id,'checking',-v_total,
    b.currency_code,'debit','business','ipo_primary_subscription_out',p.id,'player',p_player_id,
    jsonb_build_object('bankTransactionIdempotencyKey',v_key||':debit','ipoKey',p.public_key));
  perform * from public.record_business_ledger_entry_v2(p_game_session_id,b.id,v_total,
    b.currency_code,'credit','business','ipo_primary_subscription',p.id,'player',p_player_id,
    jsonb_build_object('bankTransactionIdempotencyKey',v_key||':credit','ipoKey',p.public_key));
  select * into pos from public.business_ownership_positions x where x.game_session_id=p_game_session_id
    and x.business_id=b.id and x.player_id=p_player_id and x.status='active' for update;
  if found then
    update public.business_ownership_positions set units=units+p_shares,voting_units=voting_units+p_shares where id=pos.id;
  else
    insert into public.business_ownership_positions(game_session_id,business_id,player_id,ownership_kind,units,voting_units)
      values(p_game_session_id,b.id,p_player_id,'share',p_shares,p_shares);
  end if;
  update public.business_corporate_share_structures set issued_shares=issued_shares+p_shares,
    outstanding_shares=outstanding_shares+p_shares where game_session_id=p_game_session_id and business_id=b.id;
  insert into public.business_ownership_transactions(game_session_id,business_id,transaction_kind,ownership_kind,
    to_player_id,units,voting_units,consideration_amount,currency_code,idempotency_key,metadata)
  values(p_game_session_id,b.id,'issuance','share',p_player_id,p_shares,p_shares,v_total,b.currency_code,v_key,
    jsonb_build_object('schemaVersion',1,'ipoKey',p.public_key,'businessKey',b.public_key,
      'unitPrice',p.terms->>'unitPrice','offeringCompleted',v_complete)) returning * into r;
  if v_complete then
    update public.business_governance_proposals set status='executed',executed_at=now() where id=p.id;
  end if;
  insert into public.business_activity_events(game_session_id,business_id,actor_type,actor_player_id,event_type,source_id,reason_code,metadata)
    values(p_game_session_id,b.id,'player',p_player_id,'business.ipo.subscribed.v1',r.id,'primary_ipo_subscribed',
      jsonb_build_object('schemaVersion',1,'ipoKey',p.public_key,'receiptKey',r.public_key,'shares',p_shares::text,
        'total',v_total::text,'currencyCode',b.currency_code,'offeringCompleted',v_complete));
  perform public.assert_business_ownership_invariants_v2(p_game_session_id,b.id);
  return economy_private.business_ipo_receipt_json_v1(r,false);
end;
$function$;
revoke all on function public.subscribe_business_primary_ipo_v1(uuid,uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.subscribe_business_primary_ipo_v1(uuid,uuid,text,bigint,text) to service_role;


commit;
