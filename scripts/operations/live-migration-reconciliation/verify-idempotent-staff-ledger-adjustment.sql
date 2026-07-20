\set ON_ERROR_STOP on

-- ISOLATED STAGING ONLY. Uses existing non-production fixture IDs and rolls back.
-- Required psql variables: game_session_id, player_id, staff_user_id.

begin;

create temporary table _ledger_probe_context on commit drop as
select
  :'game_session_id'::uuid as game_session_id,
  :'player_id'::uuid as player_id,
  :'staff_user_id'::uuid as staff_user_id,
  gen_random_uuid() as source_id,
  'ops-stage-bank-004-' || replace(gen_random_uuid()::text, '-', '') as idempotency_key,
  'ops-stage-bank-004-retry-probe'::text as route_key,
  'cash'::text as account_type,
  7::numeric as amount,
  'ECO'::text as currency_code;

do $preflight$
declare
  v_context _ledger_probe_context%rowtype;
begin
  select * into v_context from _ledger_probe_context;

  if to_regprocedure(
    'public.record_idempotent_staff_ledger_adjustment_v1(uuid,uuid,uuid,text,text,text,numeric,text,text,text,text,uuid,jsonb)'
  ) is null then
    raise exception 'BETA_BANK_004_TARGET_RPC_MISSING';
  end if;

  if not exists (select 1 from public.game_sessions where id = v_context.game_session_id) then
    raise exception 'BETA_BANK_004_FIXTURE_GAME_MISSING';
  end if;

  if not exists (
    select 1 from public.players
    where id = v_context.player_id and game_session_id = v_context.game_session_id
  ) then
    raise exception 'BETA_BANK_004_FIXTURE_PLAYER_SCOPE_INVALID';
  end if;

  if not exists (select 1 from public.staff_users where id = v_context.staff_user_id) then
    raise exception 'BETA_BANK_004_FIXTURE_STAFF_MISSING';
  end if;
end;
$preflight$;

create temporary table _ledger_probe_baseline on commit drop as
select
  coalesce((
    select balance
    from public.account_balances balance_row
    join _ledger_probe_context context
      on context.game_session_id = balance_row.game_session_id
     and context.player_id = balance_row.player_id
     and context.account_type = balance_row.account_type
     and context.currency_code = balance_row.currency_code
  ), 0::numeric) as balance,
  (
    select count(*)
    from public.ledger_entries entry_row
    join _ledger_probe_context context
      on context.game_session_id = entry_row.game_session_id
     and context.player_id = entry_row.player_id
     and context.source_id = entry_row.source_id
  ) as ledger_count;

create temporary table _ledger_probe_first on commit drop as
select result.*
from _ledger_probe_context context
cross join lateral public.record_idempotent_staff_ledger_adjustment_v1(
  context.game_session_id,
  context.player_id,
  context.staff_user_id,
  context.route_key,
  context.idempotency_key,
  context.account_type,
  context.amount,
  context.currency_code,
  'credit',
  'operations_reconciliation',
  'staff_ledger_retry_probe',
  context.source_id,
  jsonb_build_object('probe', 'BETA-BANK-004', 'environment', 'isolated-staging')
) result;

create temporary table _ledger_probe_replay on commit drop as
select result.*
from _ledger_probe_context context
cross join lateral public.record_idempotent_staff_ledger_adjustment_v1(
  context.game_session_id,
  context.player_id,
  context.staff_user_id,
  context.route_key,
  context.idempotency_key,
  context.account_type,
  context.amount,
  context.currency_code,
  'credit',
  'operations_reconciliation',
  'staff_ledger_retry_probe',
  context.source_id,
  jsonb_build_object('probe', 'BETA-BANK-004', 'environment', 'isolated-staging')
) result;

do $assertions$
declare
  v_context _ledger_probe_context%rowtype;
  v_first _ledger_probe_first%rowtype;
  v_replay _ledger_probe_replay%rowtype;
  v_baseline _ledger_probe_baseline%rowtype;
  v_final_balance numeric;
  v_ledger_count bigint;
  v_idempotency_count bigint;
begin
  select * into v_context from _ledger_probe_context;
  select * into v_first from _ledger_probe_first;
  select * into v_replay from _ledger_probe_replay;
  select * into v_baseline from _ledger_probe_baseline;

  if v_first.outcome <> 'applied' then
    raise exception 'BETA_BANK_004_FIRST_OUTCOME_NOT_APPLIED: %', v_first.outcome;
  end if;

  if v_replay.outcome <> 'replayed' then
    raise exception 'BETA_BANK_004_SECOND_OUTCOME_NOT_REPLAYED: %', v_replay.outcome;
  end if;

  if v_first.ledger_entry_id is distinct from v_replay.ledger_entry_id
     or v_first.account_balance_id is distinct from v_replay.account_balance_id
     or v_first.balance is distinct from v_replay.balance then
    raise exception 'BETA_BANK_004_REPLAY_RESULT_DIVERGED';
  end if;

  select count(*) into v_ledger_count
  from public.ledger_entries entry_row
  where entry_row.game_session_id = v_context.game_session_id
    and entry_row.player_id = v_context.player_id
    and entry_row.source_id = v_context.source_id
    and entry_row.source_domain = 'operations_reconciliation'
    and entry_row.source_action = 'staff_ledger_retry_probe';

  if v_ledger_count - v_baseline.ledger_count <> 1 then
    raise exception 'BETA_BANK_004_LEDGER_COUNT_INVALID: expected delta 1, got %',
      v_ledger_count - v_baseline.ledger_count;
  end if;

  select balance into v_final_balance
  from public.account_balances
  where game_session_id = v_context.game_session_id
    and player_id = v_context.player_id
    and account_type = v_context.account_type
    and currency_code = v_context.currency_code;

  if v_final_balance is distinct from v_baseline.balance + v_context.amount then
    raise exception 'BETA_BANK_004_BALANCE_DELTA_INVALID: expected %, got %',
      v_baseline.balance + v_context.amount, v_final_balance;
  end if;

  select count(*) into v_idempotency_count
  from public.mutation_idempotency_keys key_row
  where key_row.game_session_id = v_context.game_session_id
    and key_row.player_id = v_context.player_id
    and key_row.route_key = v_context.route_key
    and key_row.idempotency_key = v_context.idempotency_key
    and key_row.status = 'COMPLETED'
    and key_row.result_type = 'ledger_entry'
    and key_row.result_id = v_first.ledger_entry_id;

  if v_idempotency_count <> 1 then
    raise exception 'BETA_BANK_004_IDEMPOTENCY_ROW_INVALID: expected 1, got %', v_idempotency_count;
  end if;
end;
$assertions$;

do $conflict$
declare
  v_context _ledger_probe_context%rowtype;
begin
  select * into v_context from _ledger_probe_context;
  begin
    perform *
    from public.record_idempotent_staff_ledger_adjustment_v1(
      v_context.game_session_id,
      v_context.player_id,
      v_context.staff_user_id,
      v_context.route_key,
      v_context.idempotency_key,
      v_context.account_type,
      v_context.amount + 1,
      v_context.currency_code,
      'credit',
      'operations_reconciliation',
      'staff_ledger_retry_probe',
      v_context.source_id,
      jsonb_build_object('probe', 'BETA-BANK-004', 'environment', 'isolated-staging')
    );
    raise exception 'BETA_BANK_004_CONFLICT_WAS_ACCEPTED';
  exception
    when others then
      if sqlerrm <> 'LEDGER_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
end;
$conflict$;

select jsonb_pretty(jsonb_build_object(
  'probe', 'BETA-BANK-004',
  'firstOutcome', first_result.outcome,
  'replayOutcome', replay_result.outcome,
  'ledgerEntryId', first_result.ledger_entry_id,
  'accountBalanceId', first_result.account_balance_id,
  'finalBalance', first_result.balance,
  'result', 'passed',
  'persistence', 'rolled-back'
))
from _ledger_probe_first first_result
cross join _ledger_probe_replay replay_result;

rollback;
