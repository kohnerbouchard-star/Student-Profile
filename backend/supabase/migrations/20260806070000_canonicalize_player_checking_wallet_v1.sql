-- Canonicalize the Player Checking wallet across Admin and Player runtimes.
-- Checking is the canonical persisted personal transaction account. Savings remains separate.
-- Historical monetary values are preserved while legacy account classifications converge.

begin;

lock table public.account_balances in share row exclusive mode;

-- Merge any legacy cash projection into the authoritative Checking row for the
-- same game, player, and currency. The projection becomes the sum of both aliases.
update public.account_balances as checking_row
set
  balance = round(checking_row.balance + cash_row.balance, 2),
  last_ledger_entry_id = (
    select candidate.id
    from public.ledger_entries as candidate
    where candidate.id in (
      checking_row.last_ledger_entry_id,
      cash_row.last_ledger_entry_id
    )
    order by candidate.created_at desc, candidate.id desc
    limit 1
  ),
  updated_at = greatest(checking_row.updated_at, cash_row.updated_at)
from public.account_balances as cash_row
where checking_row.game_session_id = cash_row.game_session_id
  and checking_row.player_id = cash_row.player_id
  and checking_row.currency_code = cash_row.currency_code
  and checking_row.account_type = 'checking'
  and cash_row.account_type = 'cash';

delete from public.account_balances as cash_row
using public.account_balances as checking_row
where cash_row.game_session_id = checking_row.game_session_id
  and cash_row.player_id = checking_row.player_id
  and cash_row.currency_code = checking_row.currency_code
  and cash_row.account_type = 'cash'
  and checking_row.account_type = 'checking';

-- A legacy cash row without an existing Checking projection retains its balance
-- while its account classification becomes canonical Checking.
update public.account_balances
set account_type = 'checking'
where account_type = 'cash';

update public.ledger_entries
set account_type = 'checking'
where account_type = 'cash';

update public.player_transfers
set from_account_type = case when from_account_type = 'cash' then 'checking' else from_account_type end,
    to_account_type = case when to_account_type = 'cash' then 'checking' else to_account_type end
where from_account_type = 'cash' or to_account_type = 'cash';

alter table public.account_balances alter column account_type set default 'checking';

alter table public.account_balances
  drop constraint if exists account_balances_cash_alias_forbidden;

alter table public.account_balances
  add constraint account_balances_cash_alias_forbidden
  check (lower(btrim(account_type)) <> 'cash') not valid;

alter table public.account_balances
  validate constraint account_balances_cash_alias_forbidden;

create or replace function public.record_player_ledger_entry(
  p_game_session_id uuid,
  p_player_id uuid,
  p_account_type text,
  p_amount numeric,
  p_currency_code text default 'ECO',
  p_entry_type text default 'adjustment',
  p_source_domain text default 'ledger',
  p_source_action text default 'staff_player_balance_adjustment',
  p_source_id uuid default null,
  p_created_by_type text default 'staff_user',
  p_created_by_id uuid default null,
  p_audit_metadata jsonb default '{}'::jsonb
)
returns table (
  ledger_entry_id uuid,
  account_balance_id uuid,
  account_type text,
  balance numeric,
  currency_code text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_player public.players%rowtype;
  v_ledger public.ledger_entries%rowtype;
  v_balance public.account_balances%rowtype;
  v_requested_account_type text := btrim(coalesce(p_account_type, 'checking'));
  v_account_type text := case lower(v_requested_account_type)
    when 'checking' then 'checking'
    when 'cash' then 'checking'
    when 'savings' then 'savings'
    else v_requested_account_type
  end;
  v_currency_code text := upper(btrim(coalesce(p_currency_code, 'ECO')));
  v_entry_type text := btrim(coalesce(p_entry_type, 'adjustment'));
  v_source_domain text := btrim(coalesce(p_source_domain, 'ledger'));
  v_source_action text := btrim(coalesce(p_source_action, 'staff_player_balance_adjustment'));
  v_created_by_type text := btrim(coalesce(p_created_by_type, 'staff_user'));
begin
  if p_game_session_id is null then
    raise exception 'GAME_SESSION_REQUIRED'
      using errcode = 'P0001';
  end if;

  if p_player_id is null then
    raise exception 'PLAYER_REQUIRED'
      using errcode = 'P0001';
  end if;

  if length(v_account_type) = 0 then
    raise exception 'ACCOUNT_TYPE_REQUIRED'
      using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount = 0 then
    raise exception 'LEDGER_AMOUNT_REQUIRED'
      using errcode = 'P0001';
  end if;

  if length(v_currency_code) < 3 or length(v_currency_code) > 16 then
    raise exception 'INVALID_CURRENCY_CODE'
      using errcode = 'P0001';
  end if;

  if v_entry_type not in ('credit', 'debit', 'adjustment') then
    raise exception 'INVALID_LEDGER_ENTRY_TYPE'
      using errcode = 'P0001';
  end if;

  if length(v_source_domain) = 0 then
    raise exception 'SOURCE_DOMAIN_REQUIRED'
      using errcode = 'P0001';
  end if;

  if length(v_source_action) = 0 then
    raise exception 'SOURCE_ACTION_REQUIRED'
      using errcode = 'P0001';
  end if;

  if v_created_by_type not in ('staff_user', 'player', 'system') then
    raise exception 'INVALID_CREATED_BY_TYPE'
      using errcode = 'P0001';
  end if;

  select *
  into v_player
  from public.players
  where game_session_id = p_game_session_id
    and id = p_player_id
    and status = 'active';

  if not found then
    raise exception 'PLAYER_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  insert into public.ledger_entries (
    game_session_id,
    player_id,
    account_type,
    amount,
    currency_code,
    entry_type,
    source_domain,
    source_action,
    source_id,
    created_by_type,
    created_by_id
  )
  values (
    p_game_session_id,
    p_player_id,
    v_account_type,
    p_amount,
    v_currency_code,
    v_entry_type,
    v_source_domain,
    v_source_action,
    p_source_id,
    v_created_by_type,
    p_created_by_id
  )
  returning *
  into v_ledger;

  insert into public.account_balances (
    game_session_id,
    player_id,
    account_type,
    balance,
    currency_code,
    last_ledger_entry_id
  )
  values (
    p_game_session_id,
    p_player_id,
    v_account_type,
    p_amount,
    v_currency_code,
    v_ledger.id
  )
  on conflict on constraint account_balances_scope_unique
  do update
  set
    balance = public.account_balances.balance + excluded.balance,
    last_ledger_entry_id = excluded.last_ledger_entry_id
  returning *
  into v_balance;

  insert into public.audit_log (
    game_session_id,
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    p_game_session_id,
    v_created_by_type,
    p_created_by_id,
    v_source_domain || '.' || v_source_action,
    'player',
    p_player_id,
    jsonb_build_object(
      'ledger_entry_id', v_ledger.id,
      'account_balance_id', v_balance.id,
      'account_type', v_balance.account_type,
      'amount', v_ledger.amount,
      'balance', v_balance.balance,
      'currency_code', v_balance.currency_code,
      'source_id', p_source_id
    ) || coalesce(p_audit_metadata, '{}'::jsonb)
  );

  return query
  select
    v_ledger.id,
    v_balance.id,
    v_balance.account_type,
    v_balance.balance,
    v_balance.currency_code,
    v_ledger.created_at;
end;
$function$;

comment on function public.record_player_ledger_entry(
  uuid,
  uuid,
  text,
  numeric,
  text,
  text,
  text,
  text,
  uuid,
  text,
  uuid,
  jsonb
) is
  'Atomically writes the Player ledger and balance projection. Product-facing Checking is persisted under the canonical cash account key; Savings remains separate.';

revoke all on function public.record_player_ledger_entry(
  uuid,
  uuid,
  text,
  numeric,
  text,
  text,
  text,
  text,
  uuid,
  text,
  uuid,
  jsonb
) from public, anon, authenticated;

grant execute on function public.record_player_ledger_entry(
  uuid,
  uuid,
  text,
  numeric,
  text,
  text,
  text,
  text,
  uuid,
  text,
  uuid,
  jsonb
) to service_role;

-- Recreate installed public functions that still reference the retired personal
-- account literal. This is limited to exact SQL string literals and preserves
-- function signatures, privileges, ownership, and all non-account semantics.
do $migration$
declare
  function_row record;
  rewritten_definition text;
begin
  for function_row in
    select p.oid, pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and pg_get_functiondef(p.oid) like '%''cash''%'
  loop
    rewritten_definition := replace(
      function_row.definition,
      '''cash''',
      '''checking'''
    );
    if rewritten_definition is distinct from function_row.definition then
      execute rewritten_definition;
    end if;
  end loop;
end;
$migration$;

commit;
