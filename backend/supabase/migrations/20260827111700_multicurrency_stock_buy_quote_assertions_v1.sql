-- Fail-closed assertions for the C3B Stock buy-quote authority.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $assertions$
declare
  v_public_signature text := 'public.create_stock_buy_quote_v1(uuid,uuid,text,numeric,numeric,bigint,jsonb,text)';
  v_private_signature text := 'private.create_stock_buy_quote_at_v1(uuid,uuid,text,numeric,numeric,bigint,jsonb,text,timestamp with time zone)';
begin
  if to_regclass('public.stock_buy_quotes') is null then
    raise exception 'C3B_ASSERTION_FAILED:stock_buy_quotes_missing';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'stock_buy_quotes'
      and c.relrowsecurity
      and c.relforcerowsecurity
  ) then
    raise exception 'C3B_ASSERTION_FAILED:stock_buy_quotes_rls_not_forced';
  end if;

  if to_regprocedure(v_public_signature) is null then
    raise exception 'C3B_ASSERTION_FAILED:public_quote_function_missing';
  end if;

  if to_regprocedure(v_private_signature) is null then
    raise exception 'C3B_ASSERTION_FAILED:private_clock_function_missing';
  end if;

  if has_table_privilege('anon', 'public.stock_buy_quotes', 'SELECT')
     or has_table_privilege('authenticated', 'public.stock_buy_quotes', 'SELECT')
     or has_table_privilege('anon', 'public.stock_buy_quotes', 'INSERT')
     or has_table_privilege('authenticated', 'public.stock_buy_quotes', 'INSERT')
  then
    raise exception 'C3B_ASSERTION_FAILED:browser_quote_table_privilege';
  end if;

  if has_function_privilege('anon', v_public_signature, 'EXECUTE')
     or has_function_privilege('authenticated', v_public_signature, 'EXECUTE')
  then
    raise exception 'C3B_ASSERTION_FAILED:browser_public_quote_execute';
  end if;

  if not has_function_privilege('service_role', v_public_signature, 'EXECUTE') then
    raise exception 'C3B_ASSERTION_FAILED:service_role_quote_execute_missing';
  end if;

  if has_function_privilege('service_role', v_private_signature, 'EXECUTE')
     or has_function_privilege('anon', v_private_signature, 'EXECUTE')
     or has_function_privilege('authenticated', v_private_signature, 'EXECUTE')
  then
    raise exception 'C3B_ASSERTION_FAILED:private_clock_execute_exposed';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.stock_buy_quotes'::regclass
      and tgname = 'guard_stock_buy_quotes_immutable'
      and not tgisinternal
  ) then
    raise exception 'C3B_ASSERTION_FAILED:immutability_trigger_missing';
  end if;

  if exists (
    select 1
    from public.stock_buy_quotes q
    join public.purchase_funding_quotes f on f.id = q.funding_quote_id
    where f.game_session_id <> q.game_session_id
       or f.player_id <> q.player_id
       or f.target_currency_code <> q.listing_currency_code
       or f.target_amount <> q.gross_value
       or f.funding_context_kind <> 'stocks.immediate-buy'
       or f.funding_context_key <> q.public_key
       or f.funding_context_hash <> q.request_hash
       or f.expires_at <> q.expires_at
  ) then
    raise exception 'C3B_ASSERTION_FAILED:funding_binding_mismatch';
  end if;
end;
$assertions$;

commit;
