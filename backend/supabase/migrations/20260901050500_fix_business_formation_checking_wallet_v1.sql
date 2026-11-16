-- Business V2 Phase 11 forward repair: keep retained single-owner formation on
-- the canonical Player Checking wallet after the cash-alias cutover.
--
-- 20260831232707 intentionally re-authored formation during sales retirement,
-- but copied the pre-cutover persisted `cash` balance lookup. Persisted Player
-- cash rows are forbidden by 20260806070000, so every positive capitalization
-- incorrectly failed with INSUFFICIENT_FUNDS. This migration changes only that
-- compatibility bridge: the balance check and debit post use Checking.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.create_or_acquire_player_business_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_legal_name text,
  p_entity_type text,
  p_industry_code text,
  p_country_code text,
  p_currency_code text,
  p_capitalization numeric,
  p_acquire_business_key text,
  p_idempotency_key text
)
returns table (
  business_key text,
  status text,
  owner_player_id uuid,
  capitalization numeric,
  valuation numeric,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_legal_name text := btrim(coalesce(p_legal_name, ''));
  v_entity_type text := lower(btrim(coalesce(p_entity_type, '')));
  v_industry_code text := btrim(coalesce(p_industry_code, ''));
  v_country_code text := upper(btrim(coalesce(p_country_code, '')));
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_request_fingerprint text;
  v_replay public.audit_log%rowtype;
  v_business public.business_entities%rowtype;
  v_buyer_checking numeric := 0;
begin
  if nullif(btrim(coalesce(p_acquire_business_key, '')), '') is not null then
    raise exception 'BUSINESS_DIRECT_ACQUISITION_RETIRED'
      using errcode = 'P0001',
        detail = 'Ownership changes require the registered transfer authority.';
  end if;
  if length(v_idempotency_key) < 8 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  if p_capitalization is null
     or p_capitalization < 0
     or p_capitalization > 10000000
  then
    raise exception 'CAPITALIZATION_INVALID' using errcode = 'P0001';
  end if;
  if length(v_currency) < 3 or length(v_currency) > 16 then
    raise exception 'BUSINESS_CURRENCY_INVALID' using errcode = 'P0001';
  end if;
  v_request_fingerprint := encode(
    extensions.digest(
      jsonb_build_object(
        'legalName', v_legal_name,
        'entityType', v_entity_type,
        'industryCode', v_industry_code,
        'countryCode', v_country_code,
        'currencyCode', v_currency,
        'capitalization', round(p_capitalization, 2),
        'acquisition', false
      )::text,
      'sha256'
    ),
    'hex'
  );

  perform 1
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active'
  for update;
  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- The Player lock serializes both replay resolution and the retained
  -- one-open-Business formation rule. Recheck both only after that lock.
  select audit_row.*
  into v_replay
  from public.audit_log as audit_row
  where audit_row.game_session_id = p_game_session_id
    and audit_row.actor_id = p_player_id
    and audit_row.action = 'business.create_or_acquire'
    and audit_row.metadata ->> 'idempotency_key' = v_idempotency_key
  order by audit_row.created_at, audit_row.id
  limit 1;
  if found then
    if v_replay.actor_type is distinct from 'player'
       or v_replay.target_type is distinct from 'business'
       or v_replay.target_id is null
       or jsonb_typeof(v_replay.metadata -> 'idempotency_key')
            is distinct from 'string'
       or v_replay.metadata -> 'idempotency_key'
            is distinct from to_jsonb(v_idempotency_key)
       or jsonb_typeof(v_replay.metadata -> 'request_fingerprint')
            is distinct from 'string'
       or v_replay.metadata -> 'request_fingerprint'
            is distinct from to_jsonb(v_request_fingerprint)
       or jsonb_typeof(v_replay.metadata -> 'business_key')
            is distinct from 'string'
       or jsonb_typeof(v_replay.metadata -> 'acquisition')
            is distinct from 'boolean'
       or v_replay.metadata -> 'acquisition'
            is distinct from 'false'::jsonb
       or jsonb_typeof(v_replay.metadata -> 'capital_contribution')
            is distinct from 'number'
       or v_replay.metadata -> 'capital_contribution'
            is distinct from to_jsonb(round(p_capitalization, 2))
       or jsonb_typeof(v_replay.metadata -> 'result_business_key')
            is distinct from 'string'
       or v_replay.metadata -> 'result_business_key'
            is distinct from v_replay.metadata -> 'business_key'
       or jsonb_typeof(v_replay.metadata -> 'result_status')
            is distinct from 'string'
       or v_replay.metadata -> 'result_status'
            is distinct from to_jsonb('active'::text)
       or jsonb_typeof(v_replay.metadata -> 'result_owner_player_id')
            is distinct from 'string'
       or v_replay.metadata -> 'result_owner_player_id'
            is distinct from to_jsonb(p_player_id::text)
       or jsonb_typeof(v_replay.metadata -> 'result_capitalization')
            is distinct from 'number'
       or v_replay.metadata -> 'result_capitalization'
            is distinct from v_replay.metadata -> 'capital_contribution'
       or jsonb_typeof(v_replay.metadata -> 'result_valuation')
            is distinct from 'number'
       or v_replay.metadata -> 'result_valuation'
            is distinct from to_jsonb(0::numeric)
       or not exists (
         select 1
         from public.business_entities as result_business
         where result_business.game_session_id = p_game_session_id
           and result_business.id = v_replay.target_id
           and result_business.public_key =
               v_replay.metadata ->> 'result_business_key'
       )
    then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    return query select
      v_replay.metadata ->> 'result_business_key',
      v_replay.metadata ->> 'result_status',
      (v_replay.metadata ->> 'result_owner_player_id')::uuid,
      (v_replay.metadata ->> 'result_capitalization')::numeric,
      (v_replay.metadata ->> 'result_valuation')::numeric,
      true;
    return;
  end if;

  if exists (
    select 1
    from public.business_entities as business_row
    where business_row.game_session_id = p_game_session_id
      and business_row.owner_player_id = p_player_id
      and business_row.status <> 'closed'
  ) then
    raise exception 'BUSINESS_ALREADY_OWNED' using errcode = 'P0001';
  end if;

  select balance_row.balance
  into v_buyer_checking
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.player_id = p_player_id
    and balance_row.account_type = 'checking'
    and balance_row.currency_code = v_currency
  for update;
  if coalesce(v_buyer_checking, 0) < p_capitalization then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  insert into public.business_entities (
    game_session_id,
    owner_player_id,
    legal_name,
    entity_type,
    industry_code,
    country_code,
    currency_code,
    status,
    capitalization
  ) values (
    p_game_session_id,
    p_player_id,
    v_legal_name,
    v_entity_type,
    v_industry_code,
    v_country_code,
    v_currency,
    'active',
    round(p_capitalization, 2)
  )
  returning * into v_business;

  if p_capitalization > 0 then
    perform public.record_player_ledger_entry(
      p_game_session_id,
      p_player_id,
      'checking',
      -round(p_capitalization, 2),
      v_currency,
      'debit',
      'business',
      'capitalization_out',
      v_business.id,
      'player',
      p_player_id,
      jsonb_build_object('business_key', v_business.public_key)
    );
    perform public.record_player_ledger_entry(
      p_game_session_id,
      p_player_id,
      public.business_account_type_v1(v_business.public_key),
      round(p_capitalization, 2),
      v_currency,
      'credit',
      'business',
      'capitalization_in',
      v_business.id,
      'player',
      p_player_id,
      jsonb_build_object('business_key', v_business.public_key)
    );
  end if;

  insert into public.audit_log (
    game_session_id,
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    p_game_session_id,
    'player',
    p_player_id,
    'business.create_or_acquire',
    'business',
    v_business.id,
    jsonb_build_object(
      'idempotency_key', v_idempotency_key,
      'request_fingerprint', v_request_fingerprint,
      'business_key', v_business.public_key,
      'acquisition', false,
      'capital_contribution', round(p_capitalization, 2),
      'result_business_key', v_business.public_key,
      'result_status', v_business.status,
      'result_owner_player_id', v_business.owner_player_id,
      'result_capitalization', v_business.capitalization,
      'result_valuation', 0
    )
  );

  return query select
    v_business.public_key,
    v_business.status,
    v_business.owner_player_id,
    v_business.capitalization,
    0::numeric,
    false;
end;
$function$;

revoke all on function public.create_or_acquire_player_business_v1(
  uuid, uuid, text, text, text, text, text, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.create_or_acquire_player_business_v1(
  uuid, uuid, text, text, text, text, text, numeric, text, text
) to service_role;

comment on function public.create_or_acquire_player_business_v1(
  uuid, uuid, text, text, text, text, text, numeric, text, text
) is
  'Retained Phase 11 single-owner Business formation. Positive capitalization is checked and debited from the canonical Player Checking wallet; direct acquisition remains retired.';

-- Fail the migration if a future edit accidentally restores the retired
-- persisted cash lookup or debit literal in this compatibility function.
do $assert$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.create_or_acquire_player_business_v1(uuid,uuid,text,text,text,text,text,numeric,text,text)'::regprocedure
  ) into v_definition;

  if v_definition not like '%balance_row.account_type = ''checking''%'
     or v_definition like '%balance_row.account_type = ''cash''%'
     or v_definition not like '%''checking''%capitalization_out%'
  then
    raise exception 'BUSINESS_FORMATION_CHECKING_WALLET_REPAIR_INVALID'
      using errcode = 'P0001';
  end if;
end;
$assert$;

commit;
