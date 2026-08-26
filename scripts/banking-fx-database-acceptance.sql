\set ON_ERROR_STOP on
\pset pager off
\pset format unaligned
\pset tuples_only on

begin;
set local statement_timeout = '120s';
set local lock_timeout = '5s';
set local idle_in_transaction_session_timeout = '180s';

do $server_guard$
declare
  v_server inet := inet_server_addr();
begin
  if v_server is not null
     and not (
       v_server <<= inet '127.0.0.0/8'
       or v_server <<= inet '10.0.0.0/8'
       or v_server <<= inet '172.16.0.0/12'
       or v_server <<= inet '192.168.0.0/16'
       or v_server <<= inet '::1/128'
       or v_server <<= inet 'fc00::/7'
     )
  then
    raise exception 'BANKING_FX_ACCEPTANCE_NONLOCAL_SERVER:%', v_server;
  end if;
end;
$server_guard$;

create function pg_temp.b2_assert_v1(p_condition boolean, p_message text)
returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $function$
begin
  if p_condition is distinct from true then
    raise exception 'BANKING_FX_ACCEPTANCE_FAILED:%', p_message
      using errcode = 'P0001';
  end if;
end;
$function$;

create temporary table b2_fixture (
  staff_id uuid not null,
  staff_auth_id uuid not null,
  game_one_id uuid not null,
  game_two_id uuid not null,
  player_one_id uuid not null,
  player_two_id uuid not null,
  business_id uuid not null,
  bootstrap_at timestamptz not null
) on commit drop;

insert into b2_fixture values (
  :'staff_id'::uuid,
  :'staff_auth_id'::uuid,
  :'game_one_id'::uuid,
  :'game_two_id'::uuid,
  :'player_one_id'::uuid,
  :'player_two_id'::uuid,
  extensions.gen_random_uuid(),
  clock_timestamp() - interval '1 minute'
);

insert into public.staff_users (
  id,
  supabase_auth_user_id,
  email,
  display_name,
  status,
  role
)
select
  fixture.staff_id,
  fixture.staff_auth_id,
  'banking-fx-' || fixture.staff_id::text || '@example.invalid',
  'Banking FX acceptance fixture',
  'active',
  'game_admin'
from b2_fixture as fixture;

insert into public.game_sessions (
  id,
  owner_staff_user_id,
  name,
  lifecycle_state,
  provisioning_status,
  created_at,
  started_at
)
select
  game_row.game_session_id,
  fixture.staff_id,
  game_row.game_name,
  'active',
  'pending',
  fixture.bootstrap_at,
  fixture.bootstrap_at
from b2_fixture as fixture
cross join lateral (
  values
    (fixture.game_one_id, 'Banking FX acceptance game one'::text),
    (fixture.game_two_id, 'Banking FX acceptance game two'::text)
) as game_row(game_session_id, game_name);

insert into public.game_settings(game_session_id, stock_market_window)
select game_row.game_session_id, jsonb_build_object('timezone', 'UTC')
from b2_fixture as fixture
cross join lateral (
  values (fixture.game_one_id), (fixture.game_two_id)
) as game_row(game_session_id);

select pg_temp.b2_assert_v1(
  (select count(*) = 10 from public.country_profiles where status = 'active'),
  'fixture requires exactly ten active country profiles'
);

insert into public.country_economic_snapshots (
  game_session_id,
  country_profile_id,
  snapshot_sequence,
  effective_at,
  snapshot_label,
  difficulty_policy_profile_id,
  difficulty_preset,
  metadata,
  created_at
)
select
  game_row.game_session_id,
  country_row.id,
  0,
  fixture.bootstrap_at,
  'Banking FX acceptance bootstrap',
  difficulty_row.id,
  difficulty_row.preset_key,
  jsonb_build_object('source', 'banking-fx-database-acceptance'),
  fixture.bootstrap_at - interval '1 second'
from b2_fixture as fixture
cross join lateral (
  values (fixture.game_one_id), (fixture.game_two_id)
) as game_row(game_session_id)
cross join public.country_profiles as country_row
join public.difficulty_policy_profiles as difficulty_row
  on difficulty_row.preset_key = 'standard'
where country_row.status = 'active';

create temporary table b2_bootstrap_results on commit drop as
select
  game_row.game_session_id,
  public.initialize_fx_authority_for_game_v1(
    game_row.game_session_id,
    fixture.bootstrap_at,
    true
  ) as result
from b2_fixture as fixture
cross join lateral (
  values (fixture.game_one_id), (fixture.game_two_id)
) as game_row(game_session_id);

select pg_temp.b2_assert_v1(
  (
    select count(*) = 2
      and bool_and(result ->> 'outcome' = 'initialized')
      and bool_and(result ->> 'cutoverStatus' = 'ready')
      and bool_and((result ->> 'currencyValuesInserted')::integer = 11)
    from b2_bootstrap_results
  ),
  'both games receive complete ready bootstrap fixings'
);

select pg_temp.b2_assert_v1(
  not exists (
    select 1
    from b2_fixture as fixture
    cross join lateral (
      values (fixture.game_one_id), (fixture.game_two_id)
    ) as game_row(game_session_id)
    left join private.fx_runtime_state as runtime
      on runtime.game_session_id = game_row.game_session_id
    left join public.fx_fixings as fixing_row
      on fixing_row.id = runtime.current_fixing_id
     and fixing_row.game_session_id = runtime.game_session_id
    where runtime.cutover_status is distinct from 'ready'
      or fixing_row.id is null
      or (
        select count(*)
        from public.fx_fixing_currency_values as value_row
        where value_row.game_session_id = game_row.game_session_id
          and value_row.fixing_id = fixing_row.id
      ) <> 11
      or (
        select count(*)
        from public.fx_liquidity_cap_snapshots as cap_row
        where cap_row.game_session_id = game_row.game_session_id
          and cap_row.fixing_id = fixing_row.id
      ) <> 11
  ),
  'each game has one ready current fixing with eleven values and caps'
);

select pg_temp.b2_assert_v1(
  not exists (
    select 1
    from b2_fixture as fixture
    cross join lateral (
      values (fixture.game_one_id), (fixture.game_two_id)
    ) as game_row(game_session_id)
    where (
      select count(*)
      from public.bank_accounts as account_row
      join public.economic_parties as party_row
        on party_row.id = account_row.party_id
       and party_row.game_session_id = account_row.game_session_id
      join public.account_balances as balance_row
        on balance_row.bank_account_id = account_row.id
       and balance_row.game_session_id = account_row.game_session_id
      where account_row.game_session_id = game_row.game_session_id
        and account_row.status = 'active'
        and party_row.status = 'active'
        and (
          (party_row.system_key = 'fx.clearing-house'
            and account_row.account_kind = 'fx_clearing')
          or (party_row.system_key = 'fx.central-reserve'
            and account_row.account_kind = 'fx_reserve')
          or (party_row.system_key = 'fx.fee-revenue'
            and account_row.account_kind = 'fx_fee_revenue')
          or (party_row.system_key = 'banking.compatibility-offset'
            and account_row.account_kind = 'compatibility_offset')
        )
    ) <> 44
  ),
  'each game has 44 active FX system accounts and projections'
);

insert into public.players(id, game_session_id, display_name)
select fixture.player_one_id, fixture.game_one_id, 'Banking FX Player One'
from b2_fixture as fixture
union all
select fixture.player_two_id, fixture.game_two_id, 'Banking FX Player Two'
from b2_fixture as fixture;

-- Give each Player an authoritative home-country assignment, then add ECO
-- Checking/Savings identities for the cross-currency fixture. Readiness must
-- retain both the home accounts and these explicitly requested foreign ones.
insert into public.player_country_assignments(
  game_session_id,
  player_id,
  country_profile_id,
  status,
  assignment_reason
)
select
  player_row.game_session_id,
  player_row.player_id,
  profile_row.id,
  'active',
  'banking_fx_acceptance_fixture'
from b2_fixture as fixture
cross join lateral (
  values
    (fixture.game_one_id, fixture.player_one_id),
    (fixture.game_two_id, fixture.player_two_id)
) as player_row(game_session_id, player_id)
cross join lateral (
  select profile.id
  from public.country_profiles as profile
  where profile.status = 'active'
  order by profile.country_code
  limit 1
) as profile_row;

select public.ensure_player_banking_accounts_v1(
  player_row.game_session_id,
  player_row.player_id,
  'ECO'
)
from b2_fixture as fixture
cross join lateral (
  values
    (fixture.game_one_id, fixture.player_one_id),
    (fixture.game_two_id, fixture.player_two_id)
) as player_row(game_session_id, player_id);

-- Seed rollback-only balances directly through the canonical balanced poster
-- as database owner. The compatibility offset is used only under the existing
-- allowlisted setup gateway; the production allowlist is not widened.
do $seed_player_balances$
declare
  v_fixture b2_fixture%rowtype;
  v_target_account_id uuid;
  v_offset_account_id uuid;
  v_lines jsonb;
  v_request_hash text;
begin
  select * into strict v_fixture from b2_fixture;

  select account_row.id
  into strict v_target_account_id
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where account_row.game_session_id = v_fixture.game_one_id
    and account_row.account_kind = 'checking'
    and account_row.currency_code = 'ECO'
    and party_row.player_id = v_fixture.player_one_id;
  v_offset_account_id := private.ensure_system_bank_account_v1(
    v_fixture.game_one_id,
    'banking.compatibility-offset',
    'compatibility_offset',
    'ECO'
  );
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'bankAccountId', v_target_account_id,
      'amount', 10000000000000000000::numeric,
      'entryType', 'credit'
    ),
    jsonb_build_object(
      'bankAccountId', v_offset_account_id,
      'amount', -10000000000000000000::numeric,
      'entryType', 'debit'
    )
  );
  v_request_hash := private.bank_digest_text_v1(v_lines::text);
  perform private.post_bank_transaction_v1(
    v_fixture.game_one_id,
    'compatibility_bridge',
    'setup',
    'initial_balance_seed',
    null,
    'b2-acceptance-player-one-seed',
    v_request_hash,
    v_lines,
    'system',
    null,
    jsonb_build_object(
      'compatibilityAuthority', 'allowlisted_legacy_gateway_v1',
      'compatibilityGateway', 'record_player_ledger_entry',
      'acceptanceRollbackOnly', true
    ),
    '{}'::uuid[]
  );

  select account_row.id
  into strict v_target_account_id
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where account_row.game_session_id = v_fixture.game_two_id
    and account_row.account_kind = 'checking'
    and account_row.currency_code = 'ECO'
    and party_row.player_id = v_fixture.player_two_id;
  v_offset_account_id := private.ensure_system_bank_account_v1(
    v_fixture.game_two_id,
    'banking.compatibility-offset',
    'compatibility_offset',
    'ECO'
  );
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'bankAccountId', v_target_account_id,
      'amount', 1000,
      'entryType', 'credit'
    ),
    jsonb_build_object(
      'bankAccountId', v_offset_account_id,
      'amount', -1000,
      'entryType', 'debit'
    )
  );
  v_request_hash := private.bank_digest_text_v1(v_lines::text);
  perform private.post_bank_transaction_v1(
    v_fixture.game_two_id,
    'compatibility_bridge',
    'setup',
    'initial_balance_seed',
    null,
    'b2-acceptance-player-two-seed',
    v_request_hash,
    v_lines,
    'system',
    null,
    jsonb_build_object(
      'compatibilityAuthority', 'allowlisted_legacy_gateway_v1',
      'compatibilityGateway', 'record_player_ledger_entry',
      'acceptanceRollbackOnly', true
    ),
    '{}'::uuid[]
  );

  v_target_account_id := private.resolve_legacy_bank_account_v1(
    v_fixture.game_one_id,
    v_fixture.player_one_id,
    null,
    'legacy-wallet',
    'VAL',
    false
  );
  perform private.ensure_bank_account_projection_v1(
    v_fixture.game_one_id,
    v_target_account_id
  );
  v_offset_account_id := private.ensure_system_bank_account_v1(
    v_fixture.game_one_id,
    'banking.compatibility-offset',
    'compatibility_offset',
    'VAL'
  );
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'bankAccountId', v_target_account_id,
      'amount', 25,
      'entryType', 'credit'
    ),
    jsonb_build_object(
      'bankAccountId', v_offset_account_id,
      'amount', -25,
      'entryType', 'debit'
    )
  );
  v_request_hash := private.bank_digest_text_v1(v_lines::text);
  perform private.post_bank_transaction_v1(
    v_fixture.game_one_id,
    'compatibility_bridge',
    'setup',
    'initial_balance_seed',
    null,
    'b2-acceptance-legacy-link-seed',
    v_request_hash,
    v_lines,
    'system',
    null,
    jsonb_build_object(
      'compatibilityAuthority', 'allowlisted_legacy_gateway_v1',
      'compatibilityGateway', 'record_player_ledger_entry',
      'acceptanceRollbackOnly', true
    ),
    '{}'::uuid[]
  );
end;
$seed_player_balances$;

-- Create one Business through the pre-existing compatibility surface, then
-- require its canonical party/account/projection and balanced journal link.
insert into public.business_entities(
  id,
  game_session_id,
  owner_player_id,
  legal_name,
  entity_type,
  industry_code,
  country_code,
  currency_code,
  status,
  tax_classification,
  formation_state,
  ownership_model_version
)
select
  fixture.business_id,
  fixture.game_one_id,
  fixture.player_one_id,
  'Banking FX Acceptance Business',
  'sole_proprietorship',
  'general',
  country_row.country_code,
  country_row.currency_code,
  'active',
  'disregarded',
  'operational',
  1
from b2_fixture as fixture
cross join lateral (
  select profile.country_code, profile.currency_code
  from public.country_profiles as profile
  where profile.status = 'active'
  order by profile.country_code
  limit 1
) as country_row;

select public.ensure_business_bank_account_v2(
  fixture.game_one_id,
  fixture.business_id
)
from b2_fixture as fixture;

do $seed_business_balance$
declare
  v_fixture b2_fixture%rowtype;
  v_business public.business_entities%rowtype;
  v_target_account_id uuid;
  v_offset_account_id uuid;
  v_lines jsonb;
begin
  select * into strict v_fixture from b2_fixture;
  select business_row.*
  into strict v_business
  from public.business_entities as business_row
  where business_row.id = v_fixture.business_id
    and business_row.game_session_id = v_fixture.game_one_id;

  select account_row.id
  into strict v_target_account_id
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where account_row.game_session_id = v_fixture.game_one_id
    and account_row.account_kind = 'checking'
    and account_row.currency_code = v_business.currency_code
    and party_row.business_id = v_business.id;
  v_offset_account_id := private.ensure_system_bank_account_v1(
    v_fixture.game_one_id,
    'banking.compatibility-offset',
    'compatibility_offset',
    v_business.currency_code
  );
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'bankAccountId', v_target_account_id,
      'amount', 10,
      'entryType', 'credit'
    ),
    jsonb_build_object(
      'bankAccountId', v_offset_account_id,
      'amount', -10,
      'entryType', 'debit'
    )
  );
  perform private.post_bank_transaction_v1(
    v_fixture.game_one_id,
    'compatibility_bridge',
    'business',
    'capital_contribution_in',
    v_business.id,
    'b2-acceptance-business-link-seed',
    private.bank_digest_text_v1(v_lines::text),
    v_lines,
    'system',
    null,
    jsonb_build_object(
      'compatibilityAuthority', 'allowlisted_legacy_gateway_v1',
      'compatibilityGateway', 'record_business_ledger_entry_v2',
      'acceptanceRollbackOnly', true
    ),
    '{}'::uuid[]
  );
end;
$seed_business_balance$;

select pg_temp.b2_assert_v1(
  not exists (
    select 1
    from public.account_balances as balance_row
    left join public.bank_accounts as account_row
      on account_row.id = balance_row.bank_account_id
     and account_row.game_session_id = balance_row.game_session_id
    where account_row.id is null
  )
  and not exists (
    select 1
    from public.ledger_entries as ledger_row
    left join public.bank_accounts as account_row
      on account_row.id = ledger_row.bank_account_id
     and account_row.game_session_id = ledger_row.game_session_id
    left join public.bank_transactions as transaction_row
      on transaction_row.id = ledger_row.bank_transaction_id
     and transaction_row.game_session_id = ledger_row.game_session_id
    where account_row.id is null or transaction_row.id is null
  )
  and exists (
    select 1
    from public.bank_accounts as account_row
    join public.economic_parties as party_row
      on party_row.id = account_row.party_id
     and party_row.game_session_id = account_row.game_session_id
    join public.account_balances as balance_row
      on balance_row.bank_account_id = account_row.id
    join b2_fixture as fixture
      on fixture.game_one_id = account_row.game_session_id
     and fixture.player_one_id = party_row.player_id
    where account_row.account_kind = 'legacy'
      and account_row.legacy_account_type = 'legacy-wallet'
      and balance_row.account_type = 'legacy-wallet'
  ),
  'legacy, Player, and Business money rows resolve to canonical identities'
);

do $foundation_contract$
declare
  v_game_id uuid;
  v_player_id uuid;
  v_checking_id uuid;
  v_savings_id uuid;
  v_hold record;
  v_result record;
  v_post record;
  v_lines jsonb;
  v_balance numeric;
  v_count integer;
begin
  select fixture.game_two_id, fixture.player_two_id
  into v_game_id, v_player_id
  from b2_fixture as fixture;

  select account_row.id
  into strict v_checking_id
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where account_row.game_session_id = v_game_id
    and account_row.account_kind = 'checking'
    and account_row.currency_code = 'ECO'
    and party_row.player_id = v_player_id;

  perform public.ensure_player_banking_accounts_v1(
    v_game_id, v_player_id, 'ECO'
  );
  select account_row.id
  into strict v_savings_id
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where account_row.game_session_id = v_game_id
    and account_row.account_kind = 'savings'
    and account_row.currency_code = 'ECO'
    and party_row.player_id = v_player_id;

  select *
  into strict v_hold
  from private.create_bank_account_hold_v1(
    v_game_id,
    v_checking_id,
    600,
    'banking_fx_acceptance',
    'foundation_reservation',
    null,
    'b2-foundation-hold-create',
    repeat('a', 64),
    statement_timestamp() + interval '10 minutes',
    '{}'::jsonb
  );
  perform pg_temp.b2_assert_v1(
    v_hold.status = 'active' and not v_hold.replayed,
    'hold creation returns one active reservation'
  );

  select *
  into strict v_result
  from private.create_bank_account_hold_v1(
    v_game_id,
    v_checking_id,
    600,
    'banking_fx_acceptance',
    'foundation_reservation',
    null,
    'b2-foundation-hold-create',
    repeat('a', 64),
    statement_timestamp() + interval '10 minutes',
    '{}'::jsonb
  );
  perform pg_temp.b2_assert_v1(
    v_result.replayed and v_result.hold_id = v_hold.hold_id,
    'hold creation replays by same key and hash'
  );

  begin
    perform *
    from private.create_bank_account_hold_v1(
      v_game_id,
      v_checking_id,
      600,
      'banking_fx_acceptance',
      'foundation_reservation',
      null,
      'b2-foundation-hold-create',
      repeat('b', 64),
      statement_timestamp() + interval '10 minutes',
      '{}'::jsonb
    );
    raise exception 'EXPECTED_BANK_HOLD_IDEMPOTENCY_CONFLICT';
  exception when raise_exception then
    if sqlerrm <> 'BANK_HOLD_IDEMPOTENCY_CONFLICT' then
      raise;
    end if;
  end;

  select available_amount
  into strict v_balance
  from public.list_player_bank_accounts_v1(v_game_id, v_player_id)
  where account_kind = 'checking' and currency_code = 'ECO';
  perform pg_temp.b2_assert_v1(
    v_balance = 400,
    'available balance is posted balance less active holds'
  );

  v_lines := jsonb_build_array(
    jsonb_build_object('bankAccountId', v_checking_id, 'amount', -500),
    jsonb_build_object('bankAccountId', v_savings_id, 'amount', 500)
  );
  begin
    perform *
    from private.post_bank_transaction_v1(
      v_game_id,
      'internal_transfer',
      'banking_fx_acceptance',
      'blocked_by_hold',
      null,
      'b2-foundation-blocked-post',
      repeat('c', 64),
      v_lines,
      'system',
      null,
      '{}'::jsonb,
      '{}'::uuid[]
    );
    raise exception 'EXPECTED_BANK_ACCOUNT_AVAILABLE_BALANCE_INSUFFICIENT';
  exception when raise_exception then
    if sqlerrm <> 'BANK_ACCOUNT_AVAILABLE_BALANCE_INSUFFICIENT' then
      raise;
    end if;
  end;

  v_lines := jsonb_build_array(
    jsonb_build_object('bankAccountId', v_checking_id, 'amount', -600),
    jsonb_build_object('bankAccountId', v_savings_id, 'amount', 600)
  );
  select *
  into strict v_post
  from private.post_bank_transaction_v1(
    v_game_id,
    'internal_transfer',
    'banking_fx_acceptance',
    'consume_hold',
    null,
    'b2-foundation-consume-post',
    repeat('d', 64),
    v_lines,
    'system',
    null,
    '{}'::jsonb,
    array[v_hold.hold_id]
  );
  perform pg_temp.b2_assert_v1(
    not v_post.replayed and v_post.line_count = 2,
    'balanced post atomically consumes its hold'
  );

  select *
  into strict v_result
  from private.post_bank_transaction_v1(
    v_game_id,
    'internal_transfer',
    'banking_fx_acceptance',
    'consume_hold',
    null,
    'b2-foundation-consume-post',
    repeat('d', 64),
    v_lines,
    'system',
    null,
    '{}'::jsonb,
    array[v_hold.hold_id]
  );
  perform pg_temp.b2_assert_v1(
    v_result.replayed
      and v_result.bank_transaction_id = v_post.bank_transaction_id,
    'balanced post replay returns the original transaction'
  );

  begin
    perform *
    from private.post_bank_transaction_v1(
      v_game_id,
      'internal_transfer',
      'banking_fx_acceptance',
      'consume_hold',
      null,
      'b2-foundation-consume-post',
      repeat('e', 64),
      v_lines,
      'system',
      null,
      '{}'::jsonb,
      array[v_hold.hold_id]
    );
    raise exception 'EXPECTED_BANK_TRANSACTION_IDEMPOTENCY_CONFLICT';
  exception when raise_exception then
    if sqlerrm <> 'BANK_TRANSACTION_IDEMPOTENCY_CONFLICT' then
      raise;
    end if;
  end;

  -- Multiple logical lines for one account retain ordinals while its
  -- projection changes once by the aggregate delta.
  v_lines := jsonb_build_array(
    jsonb_build_object('bankAccountId', v_checking_id, 'amount', 30),
    jsonb_build_object('bankAccountId', v_checking_id, 'amount', -10),
    jsonb_build_object('bankAccountId', v_savings_id, 'amount', -20)
  );
  select *
  into strict v_post
  from private.post_bank_transaction_v1(
    v_game_id,
    'internal_transfer',
    'banking_fx_acceptance',
    'repeated_account_lines',
    null,
    'b2-foundation-repeated-lines',
    repeat('f', 64),
    v_lines,
    'system',
    null,
    '{}'::jsonb,
    '{}'::uuid[]
  );
  select count(*)::integer
  into v_count
  from public.ledger_entries as ledger_row
  where ledger_row.bank_transaction_id = v_post.bank_transaction_id;
  perform pg_temp.b2_assert_v1(
    v_count = 3
      and (select balance from public.account_balances
           where bank_account_id = v_checking_id) = 420
      and (select balance from public.account_balances
           where bank_account_id = v_savings_id) = 580,
    'repeated account lines preserve evidence and apply one net projection'
  );

  -- Claim/release state is append-only and replay-safe.
  select *
  into strict v_hold
  from private.create_bank_account_hold_v1(
    v_game_id,
    v_savings_id,
    10,
    'banking_fx_acceptance',
    'foundation_release',
    null,
    'b2-foundation-release-create',
    repeat('1', 64),
    statement_timestamp() + interval '10 minutes',
    '{}'::jsonb
  );
  select *
  into strict v_result
  from private.claim_bank_account_hold_v1(
    v_game_id,
    v_hold.hold_id,
    'b2-foundation-hold-claim',
    repeat('2', 64),
    '{}'::jsonb
  );
  perform pg_temp.b2_assert_v1(
    v_result.status = 'claimed' and not v_result.replayed,
    'hold claim transitions active to claimed'
  );
  select *
  into strict v_result
  from private.release_bank_account_hold_v1(
    v_game_id,
    v_hold.hold_id,
    'b2-foundation-hold-release',
    repeat('3', 64),
    'cancelled',
    '{}'::jsonb
  );
  perform pg_temp.b2_assert_v1(
    v_result.status = 'released' and not v_result.replayed,
    'claimed hold releases exactly once'
  );
  select *
  into strict v_result
  from private.release_bank_account_hold_v1(
    v_game_id,
    v_hold.hold_id,
    'b2-foundation-hold-release',
    repeat('3', 64),
    'cancelled',
    '{}'::jsonb
  );
  perform pg_temp.b2_assert_v1(
    v_result.replayed,
    'hold release replays without a second transition'
  );

  begin
    update public.account_balances
    set balance = balance
    where bank_account_id = v_checking_id;
    raise exception 'EXPECTED_ACCOUNT_BALANCE_DIRECT_WRITE_FORBIDDEN';
  exception when raise_exception then
    if sqlerrm <> 'ACCOUNT_BALANCE_DIRECT_WRITE_FORBIDDEN' then raise; end if;
  end;
  begin
    update public.ledger_entries
    set amount = amount
    where bank_transaction_id = v_post.bank_transaction_id;
    raise exception 'EXPECTED_LEDGER_ENTRY_IMMUTABLE';
  exception when raise_exception then
    if sqlerrm <> 'LEDGER_ENTRY_IMMUTABLE' then raise; end if;
  end;
  begin
    update public.bank_transactions
    set status = status
    where id = v_post.bank_transaction_id;
    raise exception 'EXPECTED_BANK_TRANSACTION_IMMUTABLE';
  exception when raise_exception then
    if sqlerrm <> 'BANK_TRANSACTION_IMMUTABLE' then raise; end if;
  end;
  begin
    update public.bank_account_holds
    set status = status
    where id = v_hold.hold_id;
    raise exception 'EXPECTED_BANK_ACCOUNT_HOLD_DIRECT_WRITE_FORBIDDEN';
  exception when raise_exception then
    if sqlerrm <> 'BANK_ACCOUNT_HOLD_DIRECT_WRITE_FORBIDDEN' then raise; end if;
  end;
  begin
    delete from public.bank_account_hold_events where hold_id = v_hold.hold_id;
    raise exception 'EXPECTED_BANK_ACCOUNT_HOLD_EVENT_IMMUTABLE';
  exception when raise_exception then
    if sqlerrm <> 'BANK_ACCOUNT_HOLD_EVENT_IMMUTABLE' then raise; end if;
  end;
end;
$foundation_contract$;

select pg_temp.b2_assert_v1(
  not exists (
    select 1
    from public.bank_transactions as transaction_row
    join public.ledger_entries as ledger_row
      on ledger_row.bank_transaction_id = transaction_row.id
    where transaction_row.posting_version = 'balanced_v2'
    group by transaction_row.id, ledger_row.currency_code
    having sum(ledger_row.amount) <> 0
  ),
  'every post-cutover transaction balances independently per currency'
);

select pg_temp.b2_assert_v1(
  not has_table_privilege('service_role', 'public.bank_transactions', 'INSERT')
    and not has_table_privilege('service_role', 'public.ledger_entries', 'INSERT')
    and not has_table_privilege('service_role', 'public.account_balances', 'UPDATE')
    and not has_table_privilege('service_role', 'public.bank_account_holds', 'INSERT')
    and has_table_privilege('service_role', 'public.bank_transactions', 'SELECT')
    and not has_function_privilege(
      'service_role',
      'private.post_bank_transaction_v1(uuid,text,text,text,uuid,text,text,jsonb,text,uuid,jsonb,uuid[])',
      'EXECUTE'
    ),
  'service role can read evidence but cannot mutate tables or call internals'
);

do $readiness_provisioning_contract$
declare
  v_game_id uuid;
  v_player_id uuid;
  v_unresolved_player_id uuid := extensions.gen_random_uuid();
  v_staff_business_id uuid := extensions.gen_random_uuid();
  v_account_id uuid;
  v_party_id uuid;
  v_offset_id uuid;
  v_result jsonb;
  v_count integer;
  v_currency text;
  v_country text;
begin
  select fixture.game_one_id, fixture.player_one_id
  into v_game_id, v_player_id
  from b2_fixture as fixture;

  -- A canonical identity with no money is safely repaired with one zero
  -- projection; replay does not create a second projection.
  select currency_row.code
  into strict v_currency
  from public.currencies as currency_row
  where currency_row.status = 'active'
    and currency_row.code <> 'ECO'
    and currency_row.code <> (
      select profile_row.currency_code
      from public.player_country_assignments as assignment_row
      join public.country_profiles as profile_row
        on profile_row.id = assignment_row.country_profile_id
      where assignment_row.game_session_id = v_game_id
        and assignment_row.player_id = v_player_id
        and assignment_row.status = 'active'
    )
  order by currency_row.code
  limit 1;
  v_account_id := private.ensure_player_bank_account_v1(
    v_game_id,
    v_player_id,
    'savings',
    v_currency
  );
  perform pg_temp.b2_assert_v1(
    not exists (
      select 1 from public.account_balances
      where bank_account_id = v_account_id
    ),
    'fixture begins with a zero identity lacking a projection'
  );
  v_result := private.ensure_banking_fx_readiness_v1(v_game_id);
  perform pg_temp.b2_assert_v1(
    v_result ->> 'outcome' = 'repaired'
      and (v_result ->> 'playerBusinessProjectionsAdded')::integer = 1
      and (
        select balance = 0 and last_ledger_entry_id is null
        from public.account_balances
        where bank_account_id = v_account_id
      ),
    'readiness provisioning repairs only the missing zero projection'
  );
  v_result := private.ensure_banking_fx_readiness_v1(v_game_id);
  perform pg_temp.b2_assert_v1(
    v_result ->> 'outcome' = 'replayed'
      and (v_result ->> 'playerBusinessProjectionsAdded')::integer = 0,
    'readiness provisioning is idempotent'
  );

  -- The compatibility gateway must use the caller's stable intent key.
  -- Same key/hash replays; a changed payload under that key conflicts.
  perform public.record_player_ledger_entry(
    v_game_id,
    v_player_id,
    'checking',
    5,
    'ECO',
    'credit',
    'setup',
    'initial_balance_seed',
    null,
    'system',
    null,
    jsonb_build_object(
      'bankTransactionIdempotencyKey', 'b2-compatibility-stable-intent'
    )
  );
  select count(*)::integer
  into v_count
  from public.bank_transactions as transaction_row
  where transaction_row.game_session_id = v_game_id
    and transaction_row.source_domain = 'setup'
    and transaction_row.source_action = 'initial_balance_seed';
  perform public.record_player_ledger_entry(
    v_game_id,
    v_player_id,
    'checking',
    5,
    'ECO',
    'credit',
    'setup',
    'initial_balance_seed',
    null,
    'system',
    null,
    jsonb_build_object(
      'bankTransactionIdempotencyKey', 'b2-compatibility-stable-intent'
    )
  );
  perform pg_temp.b2_assert_v1(
    (
      select count(*)
      from public.bank_transactions as transaction_row
      where transaction_row.game_session_id = v_game_id
        and transaction_row.source_domain = 'setup'
        and transaction_row.source_action = 'initial_balance_seed'
    ) = v_count,
    'compatibility gateway same intent replays one balanced transaction'
  );
  begin
    perform public.record_player_ledger_entry(
      v_game_id,
      v_player_id,
      'checking',
      6,
      'ECO',
      'credit',
      'setup',
      'initial_balance_seed',
      null,
      'system',
      null,
      jsonb_build_object(
        'bankTransactionIdempotencyKey', 'b2-compatibility-stable-intent'
      )
    );
    raise exception 'EXPECTED_BANK_TRANSACTION_IDEMPOTENCY_CONFLICT';
  exception when raise_exception then
    if sqlerrm <> 'BANK_TRANSACTION_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;

  -- Readiness starts from Players, so an identity-less Player with neither
  -- residency nor active country assignment must fail closed. The exception
  -- subtransaction rolls this deliberately invalid fixture back.
  begin
    insert into public.players(id, game_session_id, display_name)
    values (
      v_unresolved_player_id,
      v_game_id,
      'Unresolved Banking Acceptance Player'
    );
    perform private.ensure_banking_fx_readiness_v1(v_game_id);
    raise exception 'EXPECTED_BANKING_READINESS_PLAYER_HOME_CURRENCY_UNRESOLVED';
  exception when raise_exception then
    if sqlerrm <> 'BANKING_READINESS_PLAYER_HOME_CURRENCY_UNRESOLVED' then
      raise;
    end if;
  end;

  -- A missing Business home account cannot be zero-created when another
  -- nonzero same-currency projection could be the historical authority.
  begin
    select profile.country_code, profile.currency_code
    into v_country, v_currency
    from public.country_profiles as profile
    where profile.status = 'active'
    order by profile.country_code
    limit 1;

    insert into public.business_entities(
      id,
      game_session_id,
      owner_player_id,
      legal_name,
      entity_type,
      industry_code,
      country_code,
      currency_code,
      status,
      tax_classification,
      formation_state,
      ownership_model_version
    ) values (
      v_staff_business_id,
      v_game_id,
      v_player_id,
      'Ambiguous Banking Acceptance Business',
      'sole_proprietorship',
      'general',
      v_country,
      v_currency,
      'active',
      'disregarded',
      'operational',
      1
    );

    select party_row.id
    into strict v_party_id
    from public.economic_parties as party_row
    where party_row.game_session_id = v_game_id
      and party_row.party_kind = 'business'
      and party_row.business_id = v_staff_business_id;
    v_account_id := private.ensure_bank_account_identity_v1(
      v_game_id,
      v_party_id,
      'legacy',
      v_currency,
      'ambiguous-business-money'
    );
    perform private.ensure_bank_account_projection_v1(v_game_id, v_account_id);
    v_offset_id := private.ensure_system_bank_account_v1(
      v_game_id,
      'banking.compatibility-offset',
      'compatibility_offset',
      v_currency
    );
    perform private.ensure_bank_account_projection_v1(v_game_id, v_offset_id);
    perform private.post_bank_transaction_v1(
      v_game_id,
      'compatibility_bridge',
      'business',
      'capital_contribution_in',
      v_staff_business_id,
      'b2-ambiguous-business-post',
      repeat('9', 64),
      jsonb_build_array(
        jsonb_build_object('bankAccountId', v_account_id, 'amount', 10),
        jsonb_build_object('bankAccountId', v_offset_id, 'amount', -10)
      ),
      'system',
      null,
      jsonb_build_object(
        'compatibilityAuthority', 'allowlisted_legacy_gateway_v1',
        'compatibilityGateway', 'record_business_ledger_entry_v2',
        'acceptanceRollbackOnly', true
      ),
      '{}'::uuid[]
    );

    perform private.ensure_banking_fx_readiness_v1(v_game_id);
    raise exception 'EXPECTED_BANKING_READINESS_BUSINESS_BALANCE_AMBIGUOUS';
  exception when raise_exception then
    if sqlerrm <> 'BANKING_READINESS_BUSINESS_BALANCE_AMBIGUOUS' then
      raise;
    end if;
  end;
end;
$readiness_provisioning_contract$;

do $customer_fx_contract$
declare
  v_game_one_id uuid;
  v_game_two_id uuid;
  v_player_one_id uuid;
  v_player_two_id uuid;
  v_source_account_id uuid;
  v_source_account_key text;
  v_game_two_account_key text;
  v_target_account_id uuid;
  v_fee_account_id uuid;
  v_quote_id uuid;
  v_quote_key text;
  v_standard_quote_key text;
  v_instant_quote_key text;
  v_alt_quote_key text;
  v_order_id uuid;
  v_order_key text;
  v_standard_order_key text;
  v_cancel_order_id uuid;
  v_cancel_order_key text;
  v_json jsonb;
  v_replay jsonb;
  v_claim record;
  v_settles_at timestamptz;
  v_before_source numeric;
  v_before_target numeric;
  v_before_fee numeric;
  v_before_source_reserve numeric;
  v_after_source numeric;
  v_after_target numeric;
  v_after_fee numeric;
  v_after_source_reserve numeric;
  v_small_source numeric;
  v_expected_target numeric;
  v_expected_fee numeric;
  v_source_reserve_account_id uuid;
  v_cap public.fx_liquidity_cap_snapshots%rowtype;
  v_reserve_account_id uuid;
  v_clearing_account_id uuid;
  v_deliverable numeric;
  v_customer_rate numeric;
  v_exhaust_source numeric;
  v_order_count bigint;
  v_receipt_count bigint;
  v_ledger_count bigint;
  v_hold_count bigint;
  v_hold_event_count bigint;
  v_order_event_count bigint;
  v_liquidity_event_count bigint;
  v_transaction_count bigint;
  v_balance_digest text;
  v_game_two_digest text;
  v_count bigint;
begin
  select
    fixture.game_one_id,
    fixture.game_two_id,
    fixture.player_one_id,
    fixture.player_two_id
  into
    v_game_one_id,
    v_game_two_id,
    v_player_one_id,
    v_player_two_id
  from b2_fixture as fixture;

  select account_row.id, account_row.public_key
  into strict v_source_account_id, v_source_account_key
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where account_row.game_session_id = v_game_one_id
    and account_row.account_kind = 'checking'
    and account_row.currency_code = 'ECO'
    and account_row.status = 'active'
    and party_row.player_id = v_player_one_id;

  select least(
    100::numeric,
    floor((cap_row.operating_buffer_target / 4) * 100) / 100
  )
  into strict v_small_source
  from public.fx_liquidity_cap_snapshots as cap_row
  join private.fx_runtime_state as runtime
    on runtime.game_session_id = cap_row.game_session_id
   and runtime.current_fixing_id = cap_row.fixing_id
  where cap_row.game_session_id = v_game_one_id
    and cap_row.currency_code = 'ECO';
  v_expected_target := round(v_small_source * 0.9353, 2);
  v_expected_fee := round(v_small_source * 0.02, 2);
  perform pg_temp.b2_assert_v1(
    v_small_source >= 1 and v_expected_fee > 0,
    'source operating buffer supports an observable partial-repayment fixture'
  );

  select account_row.id
  into strict v_source_reserve_account_id
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where account_row.game_session_id = v_game_one_id
    and account_row.account_kind = 'fx_reserve'
    and account_row.currency_code = 'ECO'
    and party_row.system_key = 'fx.central-reserve';

  select account_row.public_key
  into strict v_game_two_account_key
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where account_row.game_session_id = v_game_two_id
    and account_row.account_kind = 'checking'
    and account_row.currency_code = 'ECO'
    and account_row.status = 'active'
    and party_row.player_id = v_player_two_id;

  select count(*)
  into v_hold_count
  from public.bank_account_holds as hold_row
  where hold_row.game_session_id = v_game_one_id;

  -- Standard customer pricing is the accepted fixing less exactly 0.50%,
  -- with no separate fee and a strictly later 08:00 settlement boundary.
  v_json := public.create_player_fx_quote_v1(
    v_game_one_id,
    v_player_one_id,
    v_source_account_key,
    'NRC',
    v_small_source,
    'standard',
    'b2-standard-quote-v1'
  );
  v_quote_key := v_json #>> '{quote,quote_key}';
  v_standard_quote_key := v_quote_key;
  perform pg_temp.b2_assert_v1(
    v_json ->> 'outcome' = 'applied'
      and v_quote_key ~ '^fxq_[0-9a-f]{32}$'
      and (v_json #>> '{quote,reference_rate}')::numeric = 0.94
      and (v_json #>> '{quote,customer_rate}')::numeric = 0.9353
      and (v_json #>> '{quote,spread_rate}')::numeric = 0.005
      and (v_json #>> '{quote,fee_amount}')::numeric = 0
      and (v_json #>> '{quote,target_amount}')::numeric = v_expected_target
      and (v_json #>> '{quote,settles_at}')::timestamptz
        > clock_timestamp()
      and (
        select count(*)
        from public.bank_account_holds as hold_row
        where hold_row.game_session_id = v_game_one_id
      ) = v_hold_count,
    'standard quote locks 0.50% pricing and a later fixing boundary'
  );

  v_replay := public.create_player_fx_quote_v1(
    v_game_one_id,
    v_player_one_id,
    v_source_account_key,
    'NRC',
    v_small_source,
    'standard',
    'b2-standard-quote-v1'
  );
  perform pg_temp.b2_assert_v1(
    v_replay ->> 'outcome' = 'replayed'
      and v_replay #>> '{quote,quote_key}' = v_quote_key,
    'standard quote replays without duplicate evidence'
  );

  begin
    perform public.create_player_fx_quote_v1(
      v_game_one_id,
      v_player_one_id,
      v_source_account_key,
      'NRC',
      v_small_source + 1,
      'standard',
      'b2-standard-quote-v1'
    );
    raise exception 'EXPECTED_FX_QUOTE_CONFLICT';
  exception when raise_exception then
    if sqlerrm <> 'FX_QUOTE_CONFLICT' then raise; end if;
  end;

  select balance into strict v_before_source
  from public.account_balances where bank_account_id = v_source_account_id;
  select quote_row.id, quote_row.target_account_id
  into strict v_quote_id, v_target_account_id
  from public.fx_quotes as quote_row
  where quote_row.public_key = v_quote_key;
  perform pg_temp.b2_assert_v1(
    (
      select quote_row.expires_at <= quote_row.created_at + interval '120 seconds'
        and quote_row.expires_at <= quote_row.settles_at
      from public.fx_quotes as quote_row
      where quote_row.id = v_quote_id
    ),
    'standard quote expires within 120 seconds and no later than its fixing boundary'
  );
  select balance into strict v_before_target
  from public.account_balances where bank_account_id = v_target_account_id;
  select balance into strict v_before_source_reserve
  from public.account_balances
  where bank_account_id = v_source_reserve_account_id;
  select md5(string_agg(
    balance_row.bank_account_id::text || ':' || balance_row.balance::text,
    '|' order by balance_row.bank_account_id
  ))
  into v_balance_digest
  from public.account_balances as balance_row
  where balance_row.game_session_id = v_game_one_id;

  v_json := public.submit_player_standard_fx_order_v1(
    v_game_one_id,
    v_player_one_id,
    v_quote_key,
    'b2-standard-order-v1'
  );
  v_order_key := v_json #>> '{order,order_key}';
  v_standard_order_key := v_order_key;
  select order_row.id, order_row.settles_at
  into strict v_order_id, v_settles_at
  from public.fx_orders as order_row
  where order_row.public_key = v_order_key;

  perform pg_temp.b2_assert_v1(
    v_json ->> 'outcome' = 'applied'
      and v_json #>> '{order,status}' = 'pending'
      and (
        select hold_row.status = 'active'
          and hold_row.amount = order_row.source_amount
        from public.fx_orders as order_row
        join public.bank_account_holds as hold_row
          on hold_row.id = order_row.payer_hold_id
        where order_row.id = v_order_id
      )
      and (
        select order_row.clearing_reserved_amount
             + order_row.reserve_reserved_amount = order_row.target_amount
          and (
            (order_row.clearing_reserved_amount = 0
              and order_row.clearing_hold_id is null)
            or exists (
              select 1
              from public.bank_account_holds as clearing_hold
              where clearing_hold.id = order_row.clearing_hold_id
                and clearing_hold.status = 'active'
                and clearing_hold.amount = order_row.clearing_reserved_amount
            )
          )
          and (
            (order_row.reserve_reserved_amount = 0
              and order_row.reserve_hold_id is null)
            or exists (
              select 1
              from public.bank_account_holds as reserve_hold
              where reserve_hold.id = order_row.reserve_hold_id
                and reserve_hold.status = 'active'
                and reserve_hold.amount = order_row.reserve_reserved_amount
            )
          )
        from public.fx_orders as order_row
        where order_row.id = v_order_id
      )
      and (
        select md5(string_agg(
          balance_row.bank_account_id::text || ':' || balance_row.balance::text,
          '|' order by balance_row.bank_account_id
        ))
        from public.account_balances as balance_row
        where balance_row.game_session_id = v_game_one_id
      ) = v_balance_digest,
    'standard submission reserves payer principal and target capacity'
  );

  v_replay := public.submit_player_standard_fx_order_v1(
    v_game_one_id,
    v_player_one_id,
    v_quote_key,
    'b2-standard-order-v1'
  );
  perform pg_temp.b2_assert_v1(
    v_replay ->> 'outcome' = 'replayed'
      and v_replay #>> '{order,order_key}' = v_order_key,
    'standard order submission replays'
  );

  v_json := public.create_player_fx_quote_v1(
    v_game_one_id,
    v_player_one_id,
    v_source_account_key,
    'NRC',
    10,
    'standard',
    'b2-standard-alt-quote-v1'
  );
  v_alt_quote_key := v_json #>> '{quote,quote_key}';
  begin
    perform public.submit_player_standard_fx_order_v1(
      v_game_one_id,
      v_player_one_id,
      v_alt_quote_key,
      'b2-standard-order-v1'
    );
    raise exception 'EXPECTED_FX_QUOTE_CONFLICT';
  exception when raise_exception then
    if sqlerrm <> 'FX_QUOTE_CONFLICT' then raise; end if;
  end;

  select *
  into strict v_claim
  from public.claim_due_standard_fx_orders_v1(
    'b2-acceptance-worker',
    10,
    60,
    v_settles_at
  ) as claim_row
  where claim_row.order_key = v_order_key;
  perform pg_temp.b2_assert_v1(
    v_claim.game_session_id = v_game_one_id
      and v_claim.lease_token is not null
      and (
        select bool_and(hold_row.status = 'claimed')
        from public.fx_orders as order_row
        join public.bank_account_holds as hold_row
          on hold_row.id = any(array_remove(array[
            order_row.payer_hold_id,
            order_row.clearing_hold_id,
            order_row.reserve_hold_id
          ], null))
        where order_row.id = v_order_id
      ),
    'due worker claims order and every reservation under one lease'
  );

  v_json := public.settle_standard_fx_order_v1(
    v_game_one_id,
    v_order_key,
    v_claim.lease_token,
    v_settles_at
  );
  perform pg_temp.b2_assert_v1(
    v_json ->> 'outcome' = 'applied'
      and v_json #>> '{order,status}' = 'settled'
      and v_json #>> '{order,receipt_key}' ~ '^fxr_[0-9a-f]{32}$'
      and (
        select bool_and(hold_row.status = 'consumed')
        from public.fx_orders as order_row
        join public.bank_account_holds as hold_row
          on hold_row.id = any(array_remove(array[
            order_row.payer_hold_id,
            order_row.clearing_hold_id,
            order_row.reserve_hold_id
          ], null))
        where order_row.id = v_order_id
      ),
    'claimed standard order settles atomically and consumes reservations'
  );

  v_replay := public.settle_standard_fx_order_v1(
    v_game_one_id,
    v_order_key,
    v_claim.lease_token,
    v_settles_at
  );
  perform pg_temp.b2_assert_v1(
    v_replay ->> 'outcome' = 'replayed'
      and v_replay #>> '{order,receipt_key}'
        = v_json #>> '{order,receipt_key}',
    'standard settlement replays one receipt'
  );

  select balance into strict v_after_source
  from public.account_balances where bank_account_id = v_source_account_id;
  select balance into strict v_after_target
  from public.account_balances where bank_account_id = v_target_account_id;
  select balance into strict v_after_source_reserve
  from public.account_balances
  where bank_account_id = v_source_reserve_account_id;
  perform pg_temp.b2_assert_v1(
    v_before_source - v_after_source = v_small_source
      and v_after_target - v_before_target = v_expected_target
      and v_after_source_reserve - v_before_source_reserve = v_small_source
      and v_after_source_reserve < 0,
    'standard settlement debits/credits locked amounts and partially repays the still-negative source reserve'
  );

  -- Cancellation is allowed only while pending and releases every reservation
  -- exactly once.
  v_json := public.create_player_fx_quote_v1(
    v_game_one_id,
    v_player_one_id,
    v_source_account_key,
    'NRC',
    50,
    'standard',
    'b2-cancel-quote-v1'
  );
  v_json := public.submit_player_standard_fx_order_v1(
    v_game_one_id,
    v_player_one_id,
    v_json #>> '{quote,quote_key}',
    'b2-cancel-order-v1'
  );
  v_cancel_order_key := v_json #>> '{order,order_key}';
  select id into strict v_cancel_order_id
  from public.fx_orders where public_key = v_cancel_order_key;
  select md5(string_agg(
    balance_row.bank_account_id::text || ':' || balance_row.balance::text,
    '|' order by balance_row.bank_account_id
  ))
  into v_balance_digest
  from public.account_balances as balance_row
  where balance_row.game_session_id = v_game_one_id;

  v_json := public.cancel_player_standard_fx_order_v1(
    v_game_one_id,
    v_player_one_id,
    v_cancel_order_key,
    'b2-cancel-command-v1'
  );
  perform pg_temp.b2_assert_v1(
    v_json ->> 'outcome' = 'applied'
      and v_json #>> '{order,status}' = 'cancelled'
      and (
        select bool_and(hold_row.status = 'released')
        from public.fx_orders as order_row
        join public.bank_account_holds as hold_row
          on hold_row.id = any(array_remove(array[
            order_row.payer_hold_id,
            order_row.clearing_hold_id,
            order_row.reserve_hold_id
          ], null))
        where order_row.id = v_cancel_order_id
      )
      and not exists (
        select 1
        from public.fx_settlement_receipts as receipt_row
        where receipt_row.order_id = v_cancel_order_id
      )
      and (
        select md5(string_agg(
          balance_row.bank_account_id::text || ':' || balance_row.balance::text,
          '|' order by balance_row.bank_account_id
        ))
        from public.account_balances as balance_row
        where balance_row.game_session_id = v_game_one_id
      ) = v_balance_digest,
    'pending standard cancellation releases all reservations'
  );
  v_replay := public.cancel_player_standard_fx_order_v1(
    v_game_one_id,
    v_player_one_id,
    v_cancel_order_key,
    'b2-cancel-command-v1'
  );
  perform pg_temp.b2_assert_v1(
    v_replay ->> 'outcome' = 'replayed',
    'standard cancellation replays without a second release'
  );

  -- Instant pricing keeps the same 0.50% spread and posts a distinct 2.00%
  -- source-currency fee line in the same atomic PvP settlement.
  v_json := public.create_player_fx_quote_v1(
    v_game_one_id,
    v_player_one_id,
    v_source_account_key,
    'NRC',
    v_small_source,
    'instant',
    'b2-instant-quote-v1'
  );
  v_quote_key := v_json #>> '{quote,quote_key}';
  v_instant_quote_key := v_quote_key;
  perform pg_temp.b2_assert_v1(
    (v_json #>> '{quote,customer_rate}')::numeric = 0.9353
      and (v_json #>> '{quote,spread_rate}')::numeric = 0.005
      and (v_json #>> '{quote,fee_amount}')::numeric = v_expected_fee
      and (v_json #>> '{quote,target_amount}')::numeric = v_expected_target,
    'instant quote exposes 0.50% spread and separate exact 2.00% fee'
  );
  v_replay := public.create_player_fx_quote_v1(
    v_game_one_id,
    v_player_one_id,
    v_source_account_key,
    'NRC',
    v_small_source,
    'instant',
    'b2-instant-quote-v1'
  );
  perform pg_temp.b2_assert_v1(
    v_replay ->> 'outcome' = 'replayed',
    'instant quote replays'
  );

  select quote_row.target_account_id
  into strict v_target_account_id
  from public.fx_quotes as quote_row
  where quote_row.public_key = v_quote_key;
  select account_row.id
  into strict v_fee_account_id
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where account_row.game_session_id = v_game_one_id
    and account_row.account_kind = 'fx_fee_revenue'
    and account_row.currency_code = 'ECO'
    and party_row.system_key = 'fx.fee-revenue';
  select balance into strict v_before_source
  from public.account_balances where bank_account_id = v_source_account_id;
  select balance into strict v_before_target
  from public.account_balances where bank_account_id = v_target_account_id;
  select balance into strict v_before_fee
  from public.account_balances where bank_account_id = v_fee_account_id;
  select balance into strict v_before_source_reserve
  from public.account_balances
  where bank_account_id = v_source_reserve_account_id;

  v_json := public.execute_player_instant_fx_v1(
    v_game_one_id,
    v_player_one_id,
    v_quote_key,
    'b2-instant-order-v1'
  );
  v_order_key := v_json #>> '{order,order_key}';
  select id into strict v_order_id
  from public.fx_orders where public_key = v_order_key;
  select balance into strict v_after_source
  from public.account_balances where bank_account_id = v_source_account_id;
  select balance into strict v_after_target
  from public.account_balances where bank_account_id = v_target_account_id;
  select balance into strict v_after_fee
  from public.account_balances where bank_account_id = v_fee_account_id;
  select balance into strict v_after_source_reserve
  from public.account_balances
  where bank_account_id = v_source_reserve_account_id;
  perform pg_temp.b2_assert_v1(
    v_json ->> 'outcome' = 'applied'
      and v_json #>> '{order,status}' = 'settled'
      and v_before_source - v_after_source = v_small_source + v_expected_fee
      and v_after_target - v_before_target = v_expected_target
      and v_after_fee - v_before_fee = v_expected_fee
      and v_after_source_reserve - v_before_source_reserve = v_small_source
      and v_after_source_reserve < 0
      and (
        select count(*) = 2
          and count(*) filter (
            where ledger_row.line_metadata ->> 'lineRole' = 'instant_fee'
              and ledger_row.amount = -v_expected_fee
          ) = 1
          and count(*) filter (
            where ledger_row.line_metadata ->> 'lineRole' = 'fee_revenue'
              and ledger_row.amount = v_expected_fee
          ) = 1
        from public.fx_settlement_receipts as receipt_row
        join public.ledger_entries as ledger_row
          on ledger_row.bank_transaction_id = receipt_row.bank_transaction_id
        where receipt_row.order_id = v_order_id
          and ledger_row.line_metadata ->> 'lineRole'
            in ('instant_fee', 'fee_revenue')
      ),
    'instant settlement posts principal, target credit, exact signed fee lines, and a partial source-reserve repayment atomically'
  );

  v_replay := public.execute_player_instant_fx_v1(
    v_game_one_id,
    v_player_one_id,
    v_quote_key,
    'b2-instant-order-v1'
  );
  perform pg_temp.b2_assert_v1(
    v_replay ->> 'outcome' = 'replayed'
      and v_replay #>> '{order,receipt_key}'
        = v_json #>> '{order,receipt_key}',
    'instant execution replays one order and receipt'
  );

  v_json := public.create_player_fx_quote_v1(
    v_game_one_id,
    v_player_one_id,
    v_source_account_key,
    'NRC',
    10,
    'instant',
    'b2-instant-alt-quote-v1'
  );
  begin
    perform public.execute_player_instant_fx_v1(
      v_game_one_id,
      v_player_one_id,
      v_json #>> '{quote,quote_key}',
      'b2-instant-order-v1'
    );
    raise exception 'EXPECTED_FX_QUOTE_CONFLICT';
  exception when raise_exception then
    if sqlerrm <> 'FX_QUOTE_CONFLICT' then raise; end if;
  end;

  -- Quote creation reserves nothing. An instant conversion beyond target
  -- clearing plus persisted reserve headroom must fail with zero side effects.
  select cap_row.*
  into strict v_cap
  from public.fx_liquidity_cap_snapshots as cap_row
  join private.fx_runtime_state as runtime
    on runtime.game_session_id = cap_row.game_session_id
   and runtime.current_fixing_id = cap_row.fixing_id
  where cap_row.game_session_id = v_game_one_id
    and cap_row.currency_code = 'NRC';
  select account_row.id
  into strict v_reserve_account_id
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where account_row.game_session_id = v_game_one_id
    and account_row.account_kind = 'fx_reserve'
    and account_row.currency_code = 'NRC'
    and party_row.system_key = 'fx.central-reserve';
  select account_row.id
  into strict v_clearing_account_id
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where account_row.game_session_id = v_game_one_id
    and account_row.account_kind = 'fx_clearing'
    and account_row.currency_code = 'NRC'
    and party_row.system_key = 'fx.clearing-house';
  select value_row.units_per_eco * 0.995
  into strict v_customer_rate
  from public.fx_fixing_currency_values as value_row
  join private.fx_runtime_state as runtime
    on runtime.current_fixing_id = value_row.fixing_id
   and runtime.game_session_id = value_row.game_session_id
  where value_row.game_session_id = v_game_one_id
    and value_row.currency_code = 'NRC';
  select greatest(balance_row.balance - private.active_bank_account_hold_amount_v1(
      v_game_one_id, v_clearing_account_id, '{}'::uuid[]
    ), 0)
    + private.fx_liquidity_headroom_v1(
      v_game_one_id, v_cap.id, v_reserve_account_id, '{}'::uuid[]
    )
  into strict v_deliverable
  from public.account_balances as balance_row
  where balance_row.bank_account_id = v_clearing_account_id;
  v_exhaust_source := ceil(
    ((v_deliverable + 100) / v_customer_rate) * 100
  ) / 100;
  perform pg_temp.b2_assert_v1(
    v_exhaust_source > 0 and v_exhaust_source <= 1000000000000000000::numeric,
    'fixture can express a bounded over-cap instant request'
  );

  v_json := public.create_player_fx_quote_v1(
    v_game_one_id,
    v_player_one_id,
    v_source_account_key,
    'NRC',
    v_exhaust_source,
    'instant',
    'b2-liquidity-exhaust-quote-v1'
  );
  perform pg_temp.b2_assert_v1(
    (v_json #>> '{quote,target_amount}')::numeric > v_deliverable,
    'exhaustion quote exceeds clearing inventory plus facility headroom'
  );

  select count(*) into v_order_count
  from public.fx_orders where game_session_id = v_game_one_id;
  select count(*) into v_receipt_count
  from public.fx_settlement_receipts where game_session_id = v_game_one_id;
  select count(*) into v_ledger_count
  from public.ledger_entries where game_session_id = v_game_one_id;
  select md5(string_agg(
    balance_row.bank_account_id::text || ':' || balance_row.balance::text,
    '|' order by balance_row.bank_account_id
  ))
  into v_balance_digest
  from public.account_balances as balance_row
  where balance_row.game_session_id = v_game_one_id;

  begin
    perform public.execute_player_instant_fx_v1(
      v_game_one_id,
      v_player_one_id,
      v_json #>> '{quote,quote_key}',
      'b2-liquidity-exhaust-order-v1'
    );
    raise exception 'EXPECTED_FX_LIQUIDITY_UNAVAILABLE';
  exception when raise_exception then
    if sqlerrm <> 'FX_LIQUIDITY_UNAVAILABLE' then raise; end if;
  end;
  perform pg_temp.b2_assert_v1(
    (select count(*) from public.fx_orders
      where game_session_id = v_game_one_id) = v_order_count
      and (select count(*) from public.fx_settlement_receipts
        where game_session_id = v_game_one_id) = v_receipt_count
      and (select count(*) from public.ledger_entries
        where game_session_id = v_game_one_id) = v_ledger_count
      and (
        select md5(string_agg(
          balance_row.bank_account_id::text || ':' || balance_row.balance::text,
          '|' order by balance_row.bank_account_id
        ))
        from public.account_balances as balance_row
        where balance_row.game_session_id = v_game_one_id
      ) = v_balance_digest,
    'liquidity exhaustion rolls back order, receipt, journal, and projections'
  );

  -- Public keys and ownership are game-scoped; mismatched identities fail
  -- before any evidence or monetary mutation in either game.
  select md5(string_agg(
    balance_row.bank_account_id::text || ':' || balance_row.balance::text,
    '|' order by balance_row.bank_account_id
  ))
  into v_balance_digest
  from public.account_balances as balance_row
  where balance_row.game_session_id = v_game_one_id;
  select md5(string_agg(
    balance_row.bank_account_id::text || ':' || balance_row.balance::text,
    '|' order by balance_row.bank_account_id
  ))
  into v_game_two_digest
  from public.account_balances as balance_row
  where balance_row.game_session_id = v_game_two_id;

  begin
    perform public.create_player_fx_quote_v1(
      v_game_one_id,
      v_player_two_id,
      v_game_two_account_key,
      'NRC',
      10,
      'instant',
      'b2-cross-game-quote-v1'
    );
    raise exception 'EXPECTED_BANK_ACCOUNT_NOT_FOUND';
  exception when raise_exception then
    if sqlerrm <> 'BANK_ACCOUNT_NOT_FOUND' then raise; end if;
  end;
  begin
    perform public.submit_player_standard_fx_order_v1(
      v_game_two_id,
      v_player_two_id,
      v_standard_quote_key,
      'b2-cross-game-submit-v1'
    );
    raise exception 'EXPECTED_FX_QUOTE_NOT_FOUND';
  exception when raise_exception then
    if sqlerrm <> 'FX_QUOTE_NOT_FOUND' then raise; end if;
  end;
  begin
    perform public.execute_player_instant_fx_v1(
      v_game_two_id,
      v_player_two_id,
      v_instant_quote_key,
      'b2-cross-game-instant-v1'
    );
    raise exception 'EXPECTED_FX_QUOTE_NOT_FOUND';
  exception when raise_exception then
    if sqlerrm <> 'FX_QUOTE_NOT_FOUND' then raise; end if;
  end;
  begin
    perform public.cancel_player_standard_fx_order_v1(
      v_game_two_id,
      v_player_two_id,
      v_cancel_order_key,
      'b2-cross-game-cancel-v1'
    );
    raise exception 'EXPECTED_FX_ORDER_NOT_FOUND';
  exception when raise_exception then
    if sqlerrm <> 'FX_ORDER_NOT_FOUND' then raise; end if;
  end;
  begin
    perform public.settle_standard_fx_order_v1(
      v_game_two_id,
      v_standard_order_key,
      extensions.gen_random_uuid(),
      clock_timestamp()
    );
    raise exception 'EXPECTED_FX_ORDER_NOT_FOUND';
  exception when raise_exception then
    if sqlerrm <> 'FX_ORDER_NOT_FOUND' then raise; end if;
  end;
  perform pg_temp.b2_assert_v1(
    (
      select md5(string_agg(
        balance_row.bank_account_id::text || ':' || balance_row.balance::text,
        '|' order by balance_row.bank_account_id
      ))
      from public.account_balances as balance_row
      where balance_row.game_session_id = v_game_one_id
    ) = v_balance_digest
      and (
      select md5(string_agg(
        balance_row.bank_account_id::text || ':' || balance_row.balance::text,
        '|' order by balance_row.bank_account_id
      ))
      from public.account_balances as balance_row
      where balance_row.game_session_id = v_game_two_id
    ) = v_game_two_digest
      and not exists (
        select 1
        from public.fx_quotes as quote_row
        join public.players as player_row
          on player_row.id = quote_row.player_id
        where quote_row.game_session_id <> player_row.game_session_id
      )
      and not exists (
        select 1
        from public.fx_orders as order_row
        join public.players as player_row
          on player_row.id = order_row.player_id
        where order_row.game_session_id <> player_row.game_session_id
      ),
    'cross-game commands leave both games isolated'
  );

  select count(*) into v_count
  from public.fx_settlement_receipts as receipt_row
  where receipt_row.game_session_id = v_game_one_id;
  perform pg_temp.b2_assert_v1(
    v_count = 2,
    'one standard and one instant settlement create exactly two receipts'
  );
end;
$customer_fx_contract$;

select pg_temp.b2_assert_v1(
  not exists (
    select 1
    from public.bank_transactions as transaction_row
    join public.ledger_entries as ledger_row
      on ledger_row.bank_transaction_id = transaction_row.id
    where transaction_row.posting_version = 'balanced_v2'
    group by transaction_row.id, ledger_row.currency_code
    having sum(ledger_row.amount) <> 0
  ),
  'customer FX preserves per-currency balanced posting'
);

select pg_temp.b2_assert_v1(
  not exists (
    select 1
    from public.bank_accounts as account_row
    join public.account_balances as balance_row
      on balance_row.bank_account_id = account_row.id
     and balance_row.game_session_id = account_row.game_session_id
    where account_row.account_kind = 'fx_clearing'
      and balance_row.balance < 0
  )
    and not exists (
      select 1
      from private.fx_runtime_state as runtime
      join public.fx_liquidity_cap_snapshots as cap_row
        on cap_row.game_session_id = runtime.game_session_id
       and cap_row.fixing_id = runtime.current_fixing_id
      join public.bank_accounts as reserve_account
        on reserve_account.game_session_id = cap_row.game_session_id
       and reserve_account.account_kind = 'fx_reserve'
       and reserve_account.currency_code = cap_row.currency_code
      join public.economic_parties as reserve_party
        on reserve_party.id = reserve_account.party_id
       and reserve_party.game_session_id = reserve_account.game_session_id
       and reserve_party.system_key = 'fx.central-reserve'
      join public.account_balances as reserve_balance
        on reserve_balance.bank_account_id = reserve_account.id
       and reserve_balance.game_session_id = reserve_account.game_session_id
      where greatest(-reserve_balance.balance, 0)
        + private.active_bank_account_hold_amount_v1(
            cap_row.game_session_id,
            reserve_account.id,
            '{}'::uuid[]
          ) > cap_row.facility_cap
    ),
  'clearing accounts stay nonnegative and current reserve utilization stays within every persisted cap'
);

select pg_temp.b2_assert_v1(
  (
    select bool_and(
      (private.verify_banking_fx_readiness_v1(game_row.game_session_id)
        ->> 'runtimeStatus') = 'ready'
    )
    from b2_fixture as fixture
    cross join lateral (
      values (fixture.game_one_id), (fixture.game_two_id)
    ) as game_row(game_session_id)
  ),
  'readiness accepts complete B1/B2 authority in both games'
);

select pg_temp.b2_assert_v1(
  position(
    'private.verify_banking_fx_readiness_v1'
    in pg_get_functiondef(
      'public.verify_provisioned_game_v1(uuid,uuid)'::regprocedure
    )
  ) > 0
    and position(
      'campaign_program_definitions'
      in pg_get_functiondef(
        'public.verify_provisioned_game_v1(uuid,uuid)'::regprocedure
      )
    ) > 0
    and has_function_privilege(
      'service_role',
      'public.verify_provisioned_game_v1(uuid,uuid)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'public.verify_provisioned_game_v1(uuid,uuid)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'service_role',
      'private.verify_banking_fx_readiness_v1(uuid)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'service_role',
      'private.ensure_banking_fx_readiness_v1(uuid)',
      'EXECUTE'
    ),
  'public readiness retains Campaign checks, adds B1/B2 gate, and stays service-only'
);

do $public_readiness_keeps_full_game_gate$
declare
  v_game_id uuid;
  v_staff_id uuid;
begin
  select fixture.game_one_id, fixture.staff_id
  into v_game_id, v_staff_id
  from b2_fixture as fixture;
  begin
    perform public.verify_provisioned_game_v1(v_game_id, v_staff_id);
    raise exception 'EXPECTED_GAME_PROVISIONING_VERIFICATION_FAILED';
  exception when raise_exception then
    if sqlerrm <> 'GAME_PROVISIONING_VERIFICATION_FAILED' then raise; end if;
  end;
end;
$public_readiness_keeps_full_game_gate$;

do $whole_game_purge_contract$
declare
  v_game_id uuid;
begin
  select fixture.game_two_id
  into v_game_id
  from b2_fixture as fixture;

  delete from public.game_sessions as game_row
  where game_row.id = v_game_id;

  perform pg_temp.b2_assert_v1(
    not exists (
      select 1 from public.game_sessions where id = v_game_id
    )
      and not exists (
        select 1 from public.players where game_session_id = v_game_id
      )
      and not exists (
        select 1 from public.economic_parties where game_session_id = v_game_id
      )
      and not exists (
        select 1 from public.bank_accounts where game_session_id = v_game_id
      )
      and not exists (
        select 1 from public.account_balances where game_session_id = v_game_id
      )
      and not exists (
        select 1 from public.bank_transactions where game_session_id = v_game_id
      )
      and not exists (
        select 1 from public.ledger_entries where game_session_id = v_game_id
      )
      and not exists (
        select 1 from public.bank_account_holds where game_session_id = v_game_id
      )
      and not exists (
        select 1 from public.bank_account_hold_events where game_session_id = v_game_id
      )
      and not exists (
        select 1 from public.fx_liquidity_cap_snapshots where game_session_id = v_game_id
      )
      and not exists (
        select 1 from public.fx_liquidity_events where game_session_id = v_game_id
      )
      and not exists (
        select 1 from public.fx_quotes where game_session_id = v_game_id
      )
      and not exists (
        select 1 from public.fx_orders where game_session_id = v_game_id
      )
      and not exists (
        select 1 from public.fx_order_events where game_session_id = v_game_id
      )
      and not exists (
        select 1 from public.fx_settlement_receipts where game_session_id = v_game_id
      )
      and not exists (
        select 1 from private.fx_order_runtime_state where game_session_id = v_game_id
      )
      and not exists (
        select 1 from private.fx_runtime_state where game_session_id = v_game_id
      )
      and not exists (
        select 1 from public.fx_fixings where game_session_id = v_game_id
      )
      and not exists (
        select 1 from public.fx_fixing_currency_values where game_session_id = v_game_id
      ),
    'whole-game deletion cascades through B1/B2 identity, journal, hold, liquidity, order, receipt, and runtime evidence'
  );
end;
$whole_game_purge_contract$;

select 'B2_BANKING_FX_DATABASE_ACCEPTANCE_PASS';

rollback;
