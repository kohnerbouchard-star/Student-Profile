-- Isolate session-local quote staging across repeated calls in one transaction.
--
-- The initial C0 quote command stages validated allocation lines in pg_temp so
-- no durable quote header is inserted until every account/liquidity check has
-- passed. A caller may legitimately create more than one distinct quote in the
-- same database transaction, so each command must start with an empty staging
-- relation rather than inheriting rows from the previous call.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter function public.create_purchase_funding_quote_v1(
  uuid, uuid, text, numeric, text, text, text, jsonb, text
) rename to create_purchase_funding_quote_core_v1;

alter function public.create_purchase_funding_quote_core_v1(
  uuid, uuid, text, numeric, text, text, text, jsonb, text
) set schema private;

revoke all on function private.create_purchase_funding_quote_core_v1(
  uuid, uuid, text, numeric, text, text, text, jsonb, text
) from public, anon, authenticated, service_role;

create or replace function public.create_purchase_funding_quote_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_target_currency_code text,
  p_target_amount numeric,
  p_funding_context_kind text,
  p_funding_context_key text,
  p_funding_context_hash text,
  p_allocations jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
begin
  -- A prior quote call in the same session/transaction may have created this
  -- ON COMMIT DROP staging relation. The staged rows are command-local and are
  -- never valid input to a later quote, so reset the relation before entering
  -- the private quote core.
  drop table if exists pg_temp.purchase_funding_line_stage_v1;

  return private.create_purchase_funding_quote_core_v1(
    p_game_session_id,
    p_player_id,
    p_target_currency_code,
    p_target_amount,
    p_funding_context_kind,
    p_funding_context_key,
    p_funding_context_hash,
    p_allocations,
    p_idempotency_key
  );
end;
$function$;

revoke all on function public.create_purchase_funding_quote_v1(
  uuid, uuid, text, numeric, text, text, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.create_purchase_funding_quote_v1(
  uuid, uuid, text, numeric, text, text, text, jsonb, text
) to service_role;

do $quote_stage_isolation_contract$
begin
  if has_function_privilege(
    'service_role',
    'private.create_purchase_funding_quote_core_v1(uuid,uuid,text,numeric,text,text,text,jsonb,text)',
    'EXECUTE'
  ) then
    raise exception 'PURCHASE_FUNDING_PRIVATE_QUOTE_CORE_EXPOSED'
      using errcode = '42501';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.create_purchase_funding_quote_v1(uuid,uuid,text,numeric,text,text,text,jsonb,text)',
    'EXECUTE'
  ) then
    raise exception 'PURCHASE_FUNDING_PUBLIC_QUOTE_COMMAND_MISSING'
      using errcode = '42501';
  end if;
end;
$quote_stage_isolation_contract$;

commit;
