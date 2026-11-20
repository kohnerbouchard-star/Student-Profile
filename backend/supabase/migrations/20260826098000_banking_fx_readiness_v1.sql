-- Banking/FX provisioning-readiness convergence V1.
--
-- The existing full-game readiness contract remains authoritative. This
-- forward definition adds the B1 fixing and B2 Banking invariants required
-- before a provisioned game can be certified ready.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function private.ensure_banking_fx_readiness_v1(
  p_game_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_runtime private.fx_runtime_state%rowtype;
  v_player public.players%rowtype;
  v_business public.business_entities%rowtype;
  v_account record;
  v_account_kind text;
  v_home_currency text;
  v_home_account_id uuid;
  v_projection_count_before integer;
  v_projection_count_after integer;
  v_cap_count integer;
  v_system_result jsonb;
begin
  if p_game_session_id is null or not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
  ) then
    raise exception 'BANKING_FX_READINESS_GAME_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'banking-monetary-v1:' || p_game_session_id::text,
    0
  ));

  select runtime.*
  into v_runtime
  from private.fx_runtime_state as runtime
  where runtime.game_session_id = p_game_session_id
    and runtime.cutover_status = 'ready'
    and runtime.current_fixing_id is not null
  for update;
  if not found or (
    select count(*)
    from public.fx_fixing_currency_values as value_row
    where value_row.game_session_id = p_game_session_id
      and value_row.fixing_id = v_runtime.current_fixing_id
  ) <> 11 then
    raise exception 'BANKING_FX_READINESS_FIXING_INCOMPLETE'
      using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_projection_count_before
  from public.account_balances as balance_row
  join public.bank_accounts as account_row
    on account_row.id = balance_row.bank_account_id
   and account_row.game_session_id = balance_row.game_session_id
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where balance_row.game_session_id = p_game_session_id
    and party_row.party_kind in ('player', 'business');

  -- Every active Player receives one canonical home-currency Checking identity
  -- and one Savings identity, even when no historical balance row exists.
  -- Current residency is authoritative when present; the active country
  -- assignment is the fallback before the residency flow has begun.
  for v_player in
    select player_row.*
    from public.players as player_row
    where player_row.game_session_id = p_game_session_id
      and player_row.status = 'active'
    order by player_row.id
  loop
    select coalesce(
      (
        select upper(residency_row.currency_code)
        from public.player_residency_states as residency_row
        where residency_row.game_session_id = p_game_session_id
          and residency_row.player_id = v_player.id
          and residency_row.currency_code is not null
      ),
      (
        select upper(profile_row.currency_code)
        from public.player_country_assignments as assignment_row
        join public.country_profiles as profile_row
          on profile_row.id = assignment_row.country_profile_id
        where assignment_row.game_session_id = p_game_session_id
          and assignment_row.player_id = v_player.id
          and assignment_row.status = 'active'
      )
    )
    into v_home_currency;

    if v_home_currency is null or not exists (
      select 1
      from public.currencies as currency_row
      where currency_row.code = v_home_currency
        and currency_row.status = 'active'
    ) then
      raise exception 'BANKING_READINESS_PLAYER_HOME_CURRENCY_UNRESOLVED'
        using errcode = 'P0001';
    end if;

    foreach v_account_kind in array array['checking'::text, 'savings'::text]
    loop
      v_home_account_id := private.ensure_player_bank_account_v1(
        p_game_session_id,
        v_player.id,
        v_account_kind,
        v_home_currency
      );
      perform private.ensure_bank_account_projection_v1(
        p_game_session_id,
        v_home_account_id
      );
    end loop;
  end loop;

  -- A missing home-currency Business projection is safe to create at zero
  -- only when no other nonzero row could be the historical money authority.
  -- Ambiguous nonzero evidence is rejected rather than silently forked.
  for v_business in
    select business_row.*
    from public.business_entities as business_row
    where business_row.game_session_id = p_game_session_id
    order by business_row.id
  loop
    select account_row.id
    into v_home_account_id
    from public.bank_accounts as account_row
    join public.economic_parties as party_row
      on party_row.id = account_row.party_id
     and party_row.game_session_id = account_row.game_session_id
    where account_row.game_session_id = p_game_session_id
      and party_row.party_kind = 'business'
      and party_row.business_id = v_business.id
      and account_row.account_kind = 'checking'
      and account_row.currency_code = v_business.currency_code;

    if v_home_account_id is null or not exists (
      select 1
      from public.account_balances as balance_row
      where balance_row.game_session_id = p_game_session_id
        and balance_row.bank_account_id = v_home_account_id
    ) then
      if exists (
        select 1
        from public.account_balances as balance_row
        where balance_row.game_session_id = p_game_session_id
          and balance_row.business_id = v_business.id
          and balance_row.currency_code = v_business.currency_code
          and balance_row.balance <> 0
          and (
            v_home_account_id is null
            or balance_row.bank_account_id <> v_home_account_id
          )
      ) then
        raise exception 'BANKING_READINESS_BUSINESS_BALANCE_AMBIGUOUS'
          using errcode = 'P0001';
      end if;

      v_home_account_id := private.ensure_business_bank_account_identity_v1(
        p_game_session_id,
        v_business.id,
        v_business.currency_code
      );
      perform private.ensure_bank_account_projection_v1(
        p_game_session_id,
        v_home_account_id
      );
    end if;
  end loop;

  -- Repair only missing zero projections behind already-canonical Player or
  -- Business identities. Existing monetary amounts are never inferred,
  -- copied, or rewritten by readiness provisioning.
  for v_account in
    select
      account_row.id,
      account_row.currency_code,
      party_row.party_kind,
      party_row.business_id
    from public.bank_accounts as account_row
    join public.economic_parties as party_row
      on party_row.id = account_row.party_id
     and party_row.game_session_id = account_row.game_session_id
    where account_row.game_session_id = p_game_session_id
      and party_row.party_kind in ('player', 'business')
      and not exists (
        select 1
        from public.account_balances as balance_row
        where balance_row.bank_account_id = account_row.id
          and balance_row.game_session_id = account_row.game_session_id
      )
    order by account_row.id
  loop
    if v_account.party_kind = 'business' and exists (
      select 1
      from public.account_balances as balance_row
      where balance_row.game_session_id = p_game_session_id
        and balance_row.business_id = v_account.business_id
        and balance_row.currency_code = v_account.currency_code
        and balance_row.bank_account_id <> v_account.id
        and balance_row.balance <> 0
    ) then
      raise exception 'BANKING_READINESS_BUSINESS_BALANCE_AMBIGUOUS'
        using errcode = 'P0001';
    end if;

    perform private.ensure_bank_account_projection_v1(
      p_game_session_id,
      v_account.id
    );
  end loop;

  v_system_result := private.ensure_fx_clearing_accounts_v1(
    p_game_session_id
  );
  perform private.snapshot_fx_liquidity_caps_v1(
    p_game_session_id,
    v_runtime.current_fixing_id,
    'fixing'
  );

  select count(*)::integer
  into v_projection_count_after
  from public.account_balances as balance_row
  join public.bank_accounts as account_row
    on account_row.id = balance_row.bank_account_id
   and account_row.game_session_id = balance_row.game_session_id
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where balance_row.game_session_id = p_game_session_id
    and party_row.party_kind in ('player', 'business');
  select count(*)::integer
  into v_cap_count
  from public.fx_liquidity_cap_snapshots as cap_row
  where cap_row.game_session_id = p_game_session_id
    and cap_row.fixing_id = v_runtime.current_fixing_id;

  return jsonb_build_object(
    'outcome', case
      when v_projection_count_after = v_projection_count_before
        then 'replayed'
      else 'repaired'
    end,
    'playerBusinessProjectionsAdded',
      v_projection_count_after - v_projection_count_before,
    'systemAccounts', (v_system_result ->> 'accountCount')::integer,
    'currentFixingCapSnapshots', v_cap_count
  );
end;
$function$;

revoke all on function private.ensure_banking_fx_readiness_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.ensure_ready_game_banking_fx_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if new.provisioning_status = 'ready' then
    if tg_op = 'INSERT' then
      perform private.ensure_banking_fx_readiness_v1(new.id);
    elsif old.provisioning_status is distinct from new.provisioning_status then
      perform private.ensure_banking_fx_readiness_v1(new.id);
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function private.ensure_ready_game_banking_fx_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists zz_ensure_ready_game_banking_fx_v1
  on public.game_sessions;
create trigger zz_ensure_ready_game_banking_fx_v1
after insert or update of provisioning_status on public.game_sessions
for each row execute function private.ensure_ready_game_banking_fx_v1();

create or replace function private.verify_banking_fx_readiness_v1(
  p_game_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_current_fixing_id uuid;
  v_current_fixing_key text;
  v_active_currency_count integer;
  v_fixing_value_count integer;
  v_cap_snapshot_count integer;
  v_system_account_count integer;
  v_system_projection_count integer;
  v_player_home_account_failures integer;
  v_party_account_link_failures integer;
  v_projection_link_failures integer;
  v_ledger_link_failures integer;
begin
  if p_game_session_id is null or not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
  ) then
    raise exception 'GAME_PROVISIONING_VERIFICATION_FAILED'
      using errcode = 'P0001';
  end if;

  select runtime.current_fixing_id, fixing_row.public_key
  into v_current_fixing_id, v_current_fixing_key
  from private.fx_runtime_state as runtime
  join public.fx_fixings as fixing_row
    on fixing_row.id = runtime.current_fixing_id
   and fixing_row.game_session_id = runtime.game_session_id
   and fixing_row.policy_version_id = runtime.policy_version_id
  where runtime.game_session_id = p_game_session_id
    and runtime.cutover_status = 'ready'
    and runtime.blocked_reason is null
    and runtime.current_fixing_id is not null;

  if not found then
    raise exception 'GAME_PROVISIONING_VERIFICATION_FAILED'
      using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_active_currency_count
  from public.currencies as currency_row
  where currency_row.status = 'active';

  -- Start from active Players rather than accounts so a Player with no
  -- identities is visible to the gate instead of disappearing from the check.
  select count(*)::integer
  into v_player_home_account_failures
  from public.players as player_row
  left join lateral (
    select coalesce(
      (
        select upper(residency_row.currency_code)
        from public.player_residency_states as residency_row
        where residency_row.game_session_id = player_row.game_session_id
          and residency_row.player_id = player_row.id
          and residency_row.currency_code is not null
      ),
      (
        select upper(profile_row.currency_code)
        from public.player_country_assignments as assignment_row
        join public.country_profiles as profile_row
          on profile_row.id = assignment_row.country_profile_id
        where assignment_row.game_session_id = player_row.game_session_id
          and assignment_row.player_id = player_row.id
          and assignment_row.status = 'active'
      )
    ) as currency_code
  ) as home_currency on true
  where player_row.game_session_id = p_game_session_id
    and player_row.status = 'active'
    and (
      home_currency.currency_code is null
      or not exists (
        select 1
        from public.currencies as currency_row
        where currency_row.code = home_currency.currency_code
          and currency_row.status = 'active'
      )
      or (
        select count(*)
        from public.bank_accounts as account_row
        join public.economic_parties as party_row
          on party_row.id = account_row.party_id
         and party_row.game_session_id = account_row.game_session_id
        join public.account_balances as balance_row
          on balance_row.bank_account_id = account_row.id
         and balance_row.game_session_id = account_row.game_session_id
         and balance_row.player_id = player_row.id
         and balance_row.business_id is null
         and balance_row.currency_code = account_row.currency_code
         and balance_row.account_type = account_row.account_kind
        where account_row.game_session_id = player_row.game_session_id
          and party_row.party_kind = 'player'
          and party_row.player_id = player_row.id
          and party_row.status = 'active'
          and account_row.account_kind in ('checking', 'savings')
          and account_row.currency_code = home_currency.currency_code
          and account_row.status = 'active'
      ) <> 2
    );

  select count(*)::integer
  into v_fixing_value_count
  from public.fx_fixing_currency_values as value_row
  join public.currencies as currency_row
    on currency_row.code = value_row.currency_code
   and currency_row.status = 'active'
  where value_row.game_session_id = p_game_session_id
    and value_row.fixing_id = v_current_fixing_id;

  select count(*)::integer
  into v_cap_snapshot_count
  from public.fx_liquidity_cap_snapshots as cap_row
  join public.currencies as currency_row
    on currency_row.code = cap_row.currency_code
   and currency_row.status = 'active'
  where cap_row.game_session_id = p_game_session_id
    and cap_row.fixing_id = v_current_fixing_id;

  with expected_accounts(system_key, account_kind) as (
    values
      ('fx.clearing-house'::text, 'fx_clearing'::text),
      ('fx.central-reserve'::text, 'fx_reserve'::text),
      ('fx.fee-revenue'::text, 'fx_fee_revenue'::text),
      ('banking.compatibility-offset'::text, 'compatibility_offset'::text)
  ), matched_accounts as (
    select account_row.id
    from expected_accounts as expected
    cross join public.currencies as currency_row
    join public.economic_parties as party_row
      on party_row.game_session_id = p_game_session_id
     and party_row.party_kind = 'system'
     and party_row.system_key = expected.system_key
     and party_row.status = 'active'
    join public.bank_accounts as account_row
      on account_row.game_session_id = party_row.game_session_id
     and account_row.party_id = party_row.id
     and account_row.account_kind = expected.account_kind
     and account_row.currency_code = currency_row.code
     and account_row.status = 'active'
    where currency_row.status = 'active'
  )
  select count(*)::integer
  into v_system_account_count
  from matched_accounts;

  with expected_accounts(system_key, account_kind) as (
    values
      ('fx.clearing-house'::text, 'fx_clearing'::text),
      ('fx.central-reserve'::text, 'fx_reserve'::text),
      ('fx.fee-revenue'::text, 'fx_fee_revenue'::text),
      ('banking.compatibility-offset'::text, 'compatibility_offset'::text)
  )
  select count(*)::integer
  into v_system_projection_count
  from expected_accounts as expected
  cross join public.currencies as currency_row
  join public.economic_parties as party_row
    on party_row.game_session_id = p_game_session_id
   and party_row.party_kind = 'system'
   and party_row.system_key = expected.system_key
   and party_row.status = 'active'
  join public.bank_accounts as account_row
    on account_row.game_session_id = party_row.game_session_id
   and account_row.party_id = party_row.id
   and account_row.account_kind = expected.account_kind
   and account_row.currency_code = currency_row.code
   and account_row.status = 'active'
  join public.account_balances as balance_row
    on balance_row.game_session_id = account_row.game_session_id
   and balance_row.bank_account_id = account_row.id
   and balance_row.player_id is null
   and balance_row.business_id is null
   and balance_row.currency_code = account_row.currency_code
   and balance_row.account_type = 'bank:' || account_row.account_kind
  where currency_row.status = 'active';

  -- Every Player/Business account identity must own exactly one correctly
  -- shaped projection. This verifies the legacy backfill and all later
  -- server-authoritative account creation through the same invariant.
  select count(*)::integer
  into v_party_account_link_failures
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  left join public.business_entities as business_row
    on business_row.id = party_row.business_id
   and business_row.game_session_id = party_row.game_session_id
  left join public.account_balances as balance_row
    on balance_row.bank_account_id = account_row.id
   and balance_row.game_session_id = account_row.game_session_id
  where account_row.game_session_id = p_game_session_id
    and party_row.party_kind in ('player', 'business')
    and (
      balance_row.id is null
      or balance_row.currency_code is distinct from account_row.currency_code
      or balance_row.account_type is distinct from case
        when party_row.party_kind = 'business'
          then public.business_account_type_v1(business_row.public_key)
        when account_row.account_kind in ('checking', 'savings')
          then account_row.account_kind
        when account_row.account_kind = 'legacy'
          then account_row.legacy_account_type
        else null
      end
      or (
        party_row.party_kind = 'player'
        and (
          balance_row.player_id is distinct from party_row.player_id
          or balance_row.business_id is not null
        )
      )
      or (
        party_row.party_kind = 'business'
        and (
          business_row.id is null
          or balance_row.business_id is distinct from party_row.business_id
          or (
            balance_row.player_id is not null
            and not exists (
              select 1
              from public.players as attribution_player
              where attribution_player.id = balance_row.player_id
                and attribution_player.game_session_id = p_game_session_id
            )
          )
        )
      )
    );

  -- No compatibility projection may claim Player/Business metadata that
  -- disagrees with the canonical account's economic party.
  select count(*)::integer
  into v_projection_link_failures
  from public.account_balances as balance_row
  join public.bank_accounts as account_row
    on account_row.id = balance_row.bank_account_id
   and account_row.game_session_id = balance_row.game_session_id
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  left join public.business_entities as business_row
    on business_row.id = party_row.business_id
   and business_row.game_session_id = party_row.game_session_id
  where balance_row.game_session_id = p_game_session_id
    and (
      balance_row.currency_code is distinct from account_row.currency_code
      or (
        balance_row.player_id is not null
        and party_row.party_kind not in ('player', 'business')
      )
      or (
        balance_row.business_id is not null
        and (
          party_row.party_kind <> 'business'
          or balance_row.business_id is distinct from party_row.business_id
        )
      )
      or (
        party_row.party_kind = 'player'
        and (
          balance_row.player_id is distinct from party_row.player_id
          or balance_row.business_id is not null
        )
      )
      or (
        party_row.party_kind = 'business'
        and (
          business_row.id is null
          or balance_row.business_id is distinct from business_row.id
          or (
            balance_row.player_id is not null
            and not exists (
              select 1
              from public.players as attribution_player
              where attribution_player.id = balance_row.player_id
                and attribution_player.game_session_id = p_game_session_id
            )
          )
        )
      )
    );

  -- Historical journal metadata is retained, but every row must now resolve
  -- to the same canonical Player/Business party and account currency.
  select count(*)::integer
  into v_ledger_link_failures
  from public.ledger_entries as ledger_row
  join public.bank_transactions as transaction_row
    on transaction_row.id = ledger_row.bank_transaction_id
   and transaction_row.game_session_id = ledger_row.game_session_id
  join public.bank_accounts as account_row
    on account_row.id = ledger_row.bank_account_id
   and account_row.game_session_id = ledger_row.game_session_id
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  left join public.business_entities as business_row
    on business_row.id = party_row.business_id
   and business_row.game_session_id = party_row.game_session_id
  where ledger_row.game_session_id = p_game_session_id
    and (
      ledger_row.currency_code is distinct from account_row.currency_code
      or (
        ledger_row.player_id is not null
        and party_row.party_kind not in ('player', 'business')
      )
      or (
        ledger_row.business_id is not null
        and (
          party_row.party_kind <> 'business'
          or ledger_row.business_id is distinct from party_row.business_id
        )
      )
      or (
        party_row.party_kind = 'player'
        and (
          ledger_row.player_id is distinct from party_row.player_id
          or ledger_row.business_id is not null
        )
      )
      or (
        party_row.party_kind = 'business'
        and (
          business_row.id is null
          or ledger_row.business_id is distinct from business_row.id
          or (
            transaction_row.posting_version = 'balanced_v2'
            and ledger_row.player_id is distinct from business_row.owner_player_id
          )
          or (
            transaction_row.posting_version = 'legacy_v1'
            and ledger_row.player_id is not null
            and not exists (
              select 1
              from public.players as attribution_player
              where attribution_player.id = ledger_row.player_id
                and attribution_player.game_session_id = p_game_session_id
            )
          )
        )
      )
    );

  if v_active_currency_count <> 11
    or v_fixing_value_count <> 11
    or v_cap_snapshot_count <> 11
    or v_system_account_count <> 44
    or v_system_projection_count <> 44
    or v_player_home_account_failures <> 0
    or v_party_account_link_failures <> 0
    or v_projection_link_failures <> 0
    or v_ledger_link_failures <> 0
    or exists (
      select 1
      from public.currencies as currency_row
      where currency_row.status = 'active'
        and not exists (
          select 1
          from public.fx_fixing_currency_values as value_row
          where value_row.game_session_id = p_game_session_id
            and value_row.fixing_id = v_current_fixing_id
            and value_row.currency_code = currency_row.code
        )
    )
    or exists (
      select 1
      from public.currencies as currency_row
      where currency_row.status = 'active'
        and not exists (
          select 1
          from public.fx_liquidity_cap_snapshots as cap_row
          where cap_row.game_session_id = p_game_session_id
            and cap_row.fixing_id = v_current_fixing_id
            and cap_row.currency_code = currency_row.code
        )
    )
    or not exists (
      select 1
      from public.fx_fixing_currency_values as eco_value
      where eco_value.game_session_id = p_game_session_id
        and eco_value.fixing_id = v_current_fixing_id
        and eco_value.currency_code = 'ECO'
        and eco_value.units_per_eco = 1
    )
  then
    raise exception 'GAME_PROVISIONING_VERIFICATION_FAILED'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'runtimeStatus', 'ready',
    'currentFixingKey', v_current_fixing_key,
    'activeCurrencies', v_active_currency_count,
    'fixingValues', v_fixing_value_count,
    'liquidityCapSnapshots', v_cap_snapshot_count,
    'systemAccounts', v_system_account_count,
    'systemAccountProjections', v_system_projection_count,
    'playerHomeAccountFailures', v_player_home_account_failures,
    'playerBusinessAccountLinkFailures', v_party_account_link_failures,
    'playerBusinessProjectionLinkFailures', v_projection_link_failures,
    'playerBusinessLedgerLinkFailures', v_ledger_link_failures
  );
end;
$function$;

revoke all on function private.verify_banking_fx_readiness_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.verify_provisioned_game_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_game public.game_sessions%rowtype;
  v_market_assets integer;
  v_contracts integer;
  v_store_items integer;
  v_world_locations integer;
  v_world_routes integer;
  v_world_countries integer;
  v_arrival_class_grants integer;
  v_messaging_policies integer;
  v_marketplace_policies integer;
  v_campaigns integer;
  v_banking_fx jsonb;
begin
  if p_game_session_id is null or p_staff_user_id is null then
    raise exception 'GAME_PROVISIONING_VERIFICATION_REQUEST_INVALID'
      using errcode = 'P0001';
  end if;

  select game_row.*
  into v_game
  from public.game_sessions as game_row
  where game_row.id = p_game_session_id
    and game_row.owner_staff_user_id = p_staff_user_id;

  if not found
     or v_game.status <> 'active'
     or v_game.provisioning_status <> 'ready'
     or v_game.provisioning_pack_id <> 'econovaria.beta-seed-pack.v1'
     or v_game.provisioned_at is null
  then
    raise exception 'GAME_PROVISIONING_VERIFICATION_FAILED'
      using errcode = 'P0001';
  end if;

  select count(*)::integer into v_market_assets
  from public.game_session_stock_assets
  where game_session_id = p_game_session_id and is_active;

  select count(*)::integer into v_contracts
  from public.game_session_contracts
  where game_session_id = p_game_session_id
    and status = 'active'
    and visibility = 'public';

  select count(*)::integer into v_store_items
  from public.store_items
  where game_session_id = p_game_session_id
    and status = 'active'
    and visibility = 'visible';

  select count(*)::integer into v_world_locations
  from public.world_location_states
  where game_session_id = p_game_session_id;

  select count(*)::integer into v_world_routes
  from public.world_route_states
  where game_session_id = p_game_session_id;

  select count(*)::integer into v_world_countries
  from public.world_country_runtime
  where game_session_id = p_game_session_id;

  select count(*)::integer into v_arrival_class_grants
  from public.arrival_class_grant_runtime
  where game_session_id = p_game_session_id;

  select count(*)::integer into v_messaging_policies
  from public.message_game_policies
  where game_session_id = p_game_session_id;

  select count(*)::integer into v_marketplace_policies
  from public.marketplace_policies
  where game_session_id = p_game_session_id;

  select count(*)::integer into v_campaigns
  from public.campaign_instances as campaign_row
  where campaign_row.game_session_id = p_game_session_id
    and campaign_row.pack_id = v_game.provisioning_pack_id
    and campaign_row.pack_version = v_game.provisioning_pack_version
    and campaign_row.status in (
      'active', 'paused', 'emergency_disabled', 'completed'
    )
    and exists (
      select 1
      from public.campaign_program_definitions as program_row
      where program_row.pack_id = campaign_row.pack_id
        and program_row.pack_version = campaign_row.pack_version
        and program_row.definition_id = campaign_row.definition_id
        and program_row.definition_digest = campaign_row.definition_digest
    );

  if v_market_assets <> 240
     or v_contracts < 30
     or v_store_items < 50
     or v_world_locations <> 50
     or v_world_routes <> 13
     or v_world_countries <> 10
     or v_arrival_class_grants <> 8
     or v_messaging_policies <> 1
     or v_marketplace_policies <> 1
     or v_campaigns <> 1
     or not exists (
       select 1 from public.seed_content_releases
       where game_session_id = p_game_session_id
         and pack_id = 'econovaria.beta-seed-pack.v1'
         and status = 'applied_active'
     )
     or not exists (
       select 1 from public.world_runtime_instances
       where game_session_id = p_game_session_id
     )
     or not exists (
       select 1 from public.game_feature_activation_evidence
       where game_session_id = p_game_session_id
         and story_status = 'active'
         and arrival_grant_status = 'active'
         and progression_status = 'active'
     )
  then
    raise exception 'GAME_PROVISIONING_VERIFICATION_FAILED'
      using errcode = 'P0001';
  end if;

  perform private.ensure_banking_fx_readiness_v1(p_game_session_id);
  v_banking_fx := private.verify_banking_fx_readiness_v1(
    p_game_session_id
  );

  return jsonb_build_object(
    'ready', true,
    'gameSessionId', v_game.id,
    'provisioningStatus', v_game.provisioning_status,
    'packId', v_game.provisioning_pack_id,
    'packVersion', v_game.provisioning_pack_version,
    'counts', jsonb_build_object(
      'marketAssets', v_market_assets,
      'contracts', v_contracts,
      'storeItems', v_store_items,
      'worldLocations', v_world_locations,
      'worldRoutes', v_world_routes,
      'worldCountries', v_world_countries,
      'arrivalClassGrants', v_arrival_class_grants,
      'messagingPolicies', v_messaging_policies,
      'marketplacePolicies', v_marketplace_policies,
      'campaignInstances', v_campaigns
    ),
    'bankingFx', v_banking_fx
  );
end;
$function$;

revoke all on function public.verify_provisioned_game_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.verify_provisioned_game_v1(uuid, uuid)
  to service_role;

comment on function private.ensure_banking_fx_readiness_v1(uuid) is
  'Idempotent readiness provisioning: creates canonical zero home accounts for active Players from residency/country authority, repairs only safe missing zero Player/Business projections, ensures 44 FX system accounts, and fills current-fixing cap snapshots; unresolved Player currency and ambiguous nonzero Business evidence fail closed.';

comment on function private.verify_banking_fx_readiness_v1(uuid) is
  'Private B1/B2 readiness gate: requires a complete current fixing, current liquidity caps, 44 active FX system accounts with projections, active Player home Checking/Savings accounts, and canonical Player/Business account links.';

comment on function public.verify_provisioned_game_v1(uuid, uuid) is
  'Verifies the unchanged full-game and digest-pinned Campaign requirements plus canonical B1 fixing and B2 Banking/FX readiness.';

commit;
