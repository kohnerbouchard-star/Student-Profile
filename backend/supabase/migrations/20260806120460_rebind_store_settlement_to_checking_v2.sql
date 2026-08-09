-- Rebind canonical Store settlement to the merged Checking/Savings personal banking authority.
-- PR #503 recreates purchase_quoted_store_item after the Checking convergence migration,
-- so the Store debit must not reintroduce the retired personal `cash` account key.
-- The migration is intentionally idempotent when the authoritative function is already
-- bound to Checking by an accumulated/rebased schema.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $migration$
declare
  v_function_oid oid;
  v_definition text;
  v_rewritten_definition text;
  v_cash_literal_count integer;
  v_checking_literal_count integer;
begin
  v_function_oid := to_regprocedure(
    'public.purchase_quoted_store_item(uuid,uuid,uuid,text,timestamp with time zone,jsonb)'
  );

  if v_function_oid is null then
    raise exception 'ECONOMIC_CORE_STORE_SETTLEMENT_FUNCTION_REQUIRED'
      using errcode = 'P0001';
  end if;

  v_definition := pg_get_functiondef(v_function_oid);
  v_cash_literal_count := (
    length(v_definition) - length(replace(v_definition, '''cash''', ''))
  ) / length('''cash''');
  v_checking_literal_count := (
    length(v_definition) - length(replace(v_definition, '''checking''', ''))
  ) / length('''checking''');

  -- Contract note: legacy source requires v_cash_literal_count <> 2 to be rejected
  -- unless the accumulated schema is already bound to Checking.
  if v_cash_literal_count = 2 then
    v_rewritten_definition := replace(
      v_definition,
      '''cash''',
      '''checking'''
    );

    if v_rewritten_definition = v_definition then
      raise exception 'ECONOMIC_CORE_STORE_SETTLEMENT_CHECKING_REBIND_REQUIRED'
        using errcode = 'P0001';
    end if;

    execute v_rewritten_definition;
  elsif v_cash_literal_count = 0 and v_checking_literal_count >= 2 then
    null;
  else
    raise exception 'ECONOMIC_CORE_STORE_SETTLEMENT_ACCOUNT_LITERAL_DRIFT:cash=%,checking=%',
      v_cash_literal_count,
      v_checking_literal_count
      using errcode = 'P0001';
  end if;

  v_definition := pg_get_functiondef(
    'public.purchase_quoted_store_item(uuid,uuid,uuid,text,timestamp with time zone,jsonb)'::regprocedure
  );

  if v_definition like '%''cash''%' then
    raise exception 'ECONOMIC_CORE_STORE_SETTLEMENT_CASH_LITERAL_RETAINED'
      using errcode = 'P0001';
  end if;

  if v_definition not like '%''checking''%' then
    raise exception 'ECONOMIC_CORE_STORE_SETTLEMENT_CHECKING_LITERAL_MISSING'
      using errcode = 'P0001';
  end if;
end;
$migration$;

-- Store-created canonical items predate physical-pack effect metadata. Preserve the
-- pre-cutover public behavior for active, visible Store items without changing the
-- explicit effectEnabled authority of physical-pack items.
update public.game_items gi
set
  metadata = coalesce(gi.metadata, '{}'::jsonb) || jsonb_build_object(
    'effectEnabled', true,
    'legacyStoreUseCompatibility', true
  ),
  version = gi.version + 1,
  updated_at = now()
where gi.source_kind = 'store_created'
  and gi.status = 'active'
  and coalesce(gi.metadata, '{}'::jsonb)->>'effectEnabled' is null
  and exists (
    select 1
    from public.store_items si
    where si.game_session_id = gi.game_session_id
      and si.game_item_id = gi.id
      and si.status = 'active'
      and si.visibility = 'visible'
  );

comment on function public.purchase_quoted_store_item(
  uuid, uuid, uuid, text, timestamptz, jsonb
) is
  'Atomically settles a Store offer using canonical Player Checking for payment and canonical inventory accounts for ownership.';

commit;
