-- Created with Supabase CLI as 20260831000240, then moved to the reserved C4 timestamp.

-- Business treasury FX commands V1.
--
-- Business commands are service-only wrappers over the certified Player B2
-- command bodies. A transaction-local, server-derived Business owner context
-- makes the shared bodies owner-aware while retaining every Player signature,
-- pricing rule, hold, fixing, liquidity, settlement, and worker contract.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

-- Rewrite only the exact Player-owner predicates in the retained B2 bodies.
-- Every replacement has an exact count so upstream body drift fails closed.
do $migration$
declare
  v_target record;
  v_oid oid;
  v_definition text;
  v_actual integer;
begin
  for v_target in
    select * from (values
      (
        'create_player_fx_quote_v1'::text,
        E'and party_row.party_kind = ''player''\n    and party_row.player_id = p_player_id'::text,
        E'and private.bank_party_matches_request_owner_v1(\n      p_game_session_id, p_player_id, party_row.party_kind,\n      party_row.player_id, party_row.business_id\n    )'::text,
        1::integer
      ),
      (
        'create_player_fx_quote_v1',
        'private.ensure_player_fx_checking_account_v1(',
        'private.ensure_request_owner_fx_checking_account_v1(',
        1
      ),
      (
        'create_player_fx_quote_v1',
        'and quote_row.player_id = p_player_id',
        E'and private.evidence_matches_request_owner_v1(\n      p_game_session_id, p_player_id, quote_row.player_id, quote_row.business_id\n    )',
        1
      ),
      (
        'create_player_fx_quote_v1',
        '  v_request_hash := private.fx_digest_jsonb_v1(v_request);',
        E'  if private.current_business_owner_context_v1() is not null then\n    v_request := v_request || jsonb_build_object(\n      ''businessId'', private.current_business_owner_context_v1()\n    );\n  end if;\n  v_request_hash := private.fx_digest_jsonb_v1(v_request);',
        1
      ),
      (
        'submit_player_standard_fx_order_v1',
        'and order_row.player_id = p_player_id',
        E'and private.evidence_matches_request_owner_v1(\n      p_game_session_id, p_player_id, order_row.player_id, order_row.business_id\n    )',
        1
      ),
      (
        'submit_player_standard_fx_order_v1',
        'and quote_row.player_id = p_player_id',
        E'and private.evidence_matches_request_owner_v1(\n      p_game_session_id, p_player_id, quote_row.player_id, quote_row.business_id\n    )',
        1
      ),
      (
        'submit_player_standard_fx_order_v1',
        E'and party_row.party_kind = ''player''\n    and party_row.player_id = p_player_id',
        E'and private.bank_party_matches_request_owner_v1(\n      p_game_session_id, p_player_id, party_row.party_kind,\n      party_row.player_id, party_row.business_id\n    )',
        2
      ),
      (
        'submit_player_standard_fx_order_v1',
        '  v_request_hash := private.fx_digest_jsonb_v1(v_request);',
        E'  if private.current_business_owner_context_v1() is not null then\n    v_request := v_request || jsonb_build_object(\n      ''businessId'', private.current_business_owner_context_v1()\n    );\n  end if;\n  v_request_hash := private.fx_digest_jsonb_v1(v_request);',
        1
      ),
      (
        'submit_player_standard_fx_order_v1',
        E'    ''player-standard-fx-order-v1'',\n    p_game_session_id::text,\n    p_player_id::text,',
        E'    case\n      when private.current_business_owner_context_v1() is null\n        then ''player-standard-fx-order-v1''\n      else ''business-standard-fx-order-v1''\n    end,\n    p_game_session_id::text,\n    coalesce(\n      private.current_business_owner_context_v1()::text,\n      p_player_id::text\n    ),',
        1
      ),
      (
        'cancel_player_standard_fx_order_v1',
        'and order_row.player_id = p_player_id',
        E'and private.evidence_matches_request_owner_v1(\n      p_game_session_id, p_player_id, order_row.player_id, order_row.business_id\n    )',
        1
      ),
      (
        'cancel_player_standard_fx_order_v1',
        '  v_request_hash := private.fx_digest_jsonb_v1(v_request);',
        E'  if private.current_business_owner_context_v1() is not null then\n    v_request := v_request || jsonb_build_object(\n      ''businessId'', private.current_business_owner_context_v1()\n    );\n  end if;\n  v_request_hash := private.fx_digest_jsonb_v1(v_request);',
        1
      ),
      (
        'execute_player_instant_fx_v1',
        'and order_row.player_id = p_player_id',
        E'and private.evidence_matches_request_owner_v1(\n      p_game_session_id, p_player_id, order_row.player_id, order_row.business_id\n    )',
        1
      ),
      (
        'execute_player_instant_fx_v1',
        'and quote_row.player_id = p_player_id',
        E'and private.evidence_matches_request_owner_v1(\n      p_game_session_id, p_player_id, quote_row.player_id, quote_row.business_id\n    )',
        1
      ),
      (
        'execute_player_instant_fx_v1',
        '  v_request_hash := private.fx_digest_jsonb_v1(v_request);',
        E'  if private.current_business_owner_context_v1() is not null then\n    v_request := v_request || jsonb_build_object(\n      ''businessId'', private.current_business_owner_context_v1()\n    );\n  end if;\n  v_request_hash := private.fx_digest_jsonb_v1(v_request);',
        1
      ),
      (
        'execute_player_instant_fx_v1',
        E'    ''player-instant-fx-order-v1'',\n    p_game_session_id::text,\n    p_player_id::text,',
        E'    case\n      when private.current_business_owner_context_v1() is null\n        then ''player-instant-fx-order-v1''\n      else ''business-instant-fx-order-v1''\n    end,\n    p_game_session_id::text,\n    coalesce(\n      private.current_business_owner_context_v1()::text,\n      p_player_id::text\n    ),',
        1
      ),
      (
        'settle_player_fx_order_v1',
        E'and party_row.party_kind = ''player''\n    and party_row.player_id = v_order.player_id',
        E'and (\n      (v_order.player_id is not null\n        and v_order.business_id is null\n        and party_row.party_kind = ''player''\n        and party_row.player_id = v_order.player_id\n        and party_row.business_id is null)\n      or\n      (v_order.player_id is null\n        and v_order.business_id is not null\n        and party_row.party_kind = ''business''\n        and party_row.player_id is null\n        and party_row.business_id = v_order.business_id)\n    )',
        2
      ),
      (
        'settle_player_fx_order_v1',
        E'    v_order.player_id,\n    jsonb_build_object(',
        E'    v_order.created_by_player_id,\n    jsonb_build_object(',
        1
      )
    ) as replacements(function_name, old_text, new_text, expected_count)
  loop
    select proc_row.oid
    into v_oid
    from pg_catalog.pg_proc as proc_row
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = proc_row.pronamespace
    where namespace_row.nspname = case
      when v_target.function_name = 'settle_player_fx_order_v1'
        then 'private'
      else 'public'
    end
      and proc_row.proname = v_target.function_name
      and proc_row.prokind = 'f'
    order by proc_row.oid desc
    limit 1;

    if v_oid is null then
      raise exception 'C4_FX_FUNCTION_MISSING:%', v_target.function_name
        using errcode = 'P0001';
    end if;

    v_definition := pg_catalog.pg_get_functiondef(v_oid);
    v_actual := (
      length(v_definition) - length(replace(
        v_definition, v_target.old_text, ''
      ))
    ) / length(v_target.old_text);
    if v_actual <> v_target.expected_count then
      raise exception 'C4_FX_REWRITE_COUNT:%:%:%',
        v_target.function_name, v_actual, v_target.expected_count
        using errcode = 'P0001';
    end if;

    execute replace(v_definition, v_target.old_text, v_target.new_text);
  end loop;
end;
$migration$;

create or replace function private.fx_quote_public_json_v1(
  p_quote_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
  select jsonb_build_object(
    'quote_key', quote_row.public_key,
    'product', quote_row.product,
    'source_account_key', source_account.public_key,
    'target_account_key', target_account.public_key,
    'source_currency_code', quote_row.source_currency_code,
    'target_currency_code', quote_row.target_currency_code,
    'source_minor_unit', quote_row.source_minor_unit,
    'target_minor_unit', quote_row.target_minor_unit,
    'source_amount_mode', quote_row.source_amount_mode,
    'source_amount', private.currency_amount_text_v1(
      quote_row.source_amount, quote_row.source_minor_unit
    ),
    'reference_rate', quote_row.reference_rate::text,
    'customer_rate', quote_row.customer_rate::text,
    'spread_rate', quote_row.spread_rate::text,
    'fee_rate', quote_row.fee_rate::text,
    'fee_amount', private.currency_amount_text_v1(
      quote_row.fee_amount, quote_row.source_minor_unit
    ),
    'target_amount', private.currency_amount_text_v1(
      quote_row.target_amount, quote_row.target_minor_unit
    ),
    'fixing_key', fixing_row.public_key,
    'policy_version', policy_row.policy_version,
    'expires_at', quote_row.expires_at,
    'settles_at', quote_row.settles_at,
    'requires_fx', quote_row.requires_fx,
    'rounding_disclosure', quote_row.rounding_disclosure,
    'generated_at', quote_row.created_at
  )
  from public.fx_quotes as quote_row
  join public.bank_accounts as source_account
    on source_account.id = quote_row.source_account_id
  join public.bank_accounts as target_account
    on target_account.id = quote_row.target_account_id
  join public.fx_fixings as fixing_row on fixing_row.id = quote_row.fixing_id
  join public.fx_policy_versions as policy_row
    on policy_row.id = quote_row.policy_version_id
  where quote_row.id = p_quote_id;
$function$;

create or replace function private.fx_order_public_json_v1(
  p_order_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'order_key', order_row.public_key,
    'quote_key', quote_row.public_key,
    'product', order_row.product,
    'status', runtime.status,
    'source_account_key', source_account.public_key,
    'target_account_key', target_account.public_key,
    'source_currency_code', quote_row.source_currency_code,
    'target_currency_code', quote_row.target_currency_code,
    'source_minor_unit', quote_row.source_minor_unit,
    'target_minor_unit', quote_row.target_minor_unit,
    'source_amount', private.currency_amount_text_v1(
      order_row.source_amount, quote_row.source_minor_unit
    ),
    'fee_amount', private.currency_amount_text_v1(
      order_row.fee_amount, quote_row.source_minor_unit
    ),
    'target_amount', private.currency_amount_text_v1(
      order_row.target_amount, quote_row.target_minor_unit
    ),
    'reference_rate', quote_row.reference_rate::text,
    'customer_rate', quote_row.customer_rate::text,
    'spread_rate', quote_row.spread_rate::text,
    'fee_rate', quote_row.fee_rate::text,
    'fixing_key', fixing_row.public_key,
    'submitted_at', order_row.submitted_at,
    'settles_at', order_row.settles_at,
    'completed_at', runtime.terminal_at,
    'receipt_key', receipt_row.public_key,
    'generated_at', order_row.submitted_at
  )
  from public.fx_orders as order_row
  join public.fx_quotes as quote_row on quote_row.id = order_row.quote_id
  join public.bank_accounts as source_account
    on source_account.id = quote_row.source_account_id
  join public.bank_accounts as target_account
    on target_account.id = quote_row.target_account_id
  join public.fx_fixings as fixing_row on fixing_row.id = quote_row.fixing_id
  join private.fx_order_runtime_state as runtime
    on runtime.order_id = order_row.id
  left join public.fx_settlement_receipts as receipt_row
    on receipt_row.order_id = order_row.id
  where order_row.id = p_order_id;
$function$;

create or replace function private.fx_settlement_receipt_public_json_v1(
  p_receipt_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
  select jsonb_build_object(
    'receipt_key', receipt_row.public_key,
    'order_key', order_row.public_key,
    'quote_key', quote_row.public_key,
    'bank_transaction_key', transaction_row.public_key,
    'product', order_row.product,
    'source_account_key', source_account.public_key,
    'target_account_key', target_account.public_key,
    'source_currency_code', receipt_row.source_currency_code,
    'target_currency_code', receipt_row.target_currency_code,
    'source_minor_unit', quote_row.source_minor_unit,
    'target_minor_unit', quote_row.target_minor_unit,
    'source_amount', private.currency_amount_text_v1(
      receipt_row.source_amount, quote_row.source_minor_unit
    ),
    'fee_amount', private.currency_amount_text_v1(
      receipt_row.fee_amount, quote_row.source_minor_unit
    ),
    'target_amount', private.currency_amount_text_v1(
      receipt_row.target_amount, quote_row.target_minor_unit
    ),
    'reference_rate', quote_row.reference_rate::text,
    'customer_rate', quote_row.customer_rate::text,
    'spread_rate', quote_row.spread_rate::text,
    'fee_rate', quote_row.fee_rate::text,
    'reserve_draw_amount', private.currency_amount_text_v1(
      receipt_row.reserve_draw_amount, quote_row.target_minor_unit
    ),
    'reserve_repayment_amount', private.currency_amount_text_v1(
      receipt_row.reserve_repayment_amount, quote_row.source_minor_unit
    ),
    'fixing_key', fixing_row.public_key,
    'settled_at', receipt_row.settled_at,
    'completed_at', receipt_row.settled_at,
    'generated_at', receipt_row.created_at
  )
  from public.fx_settlement_receipts as receipt_row
  join public.fx_orders as order_row on order_row.id = receipt_row.order_id
  join public.fx_quotes as quote_row on quote_row.id = order_row.quote_id
  join public.bank_transactions as transaction_row
    on transaction_row.id = receipt_row.bank_transaction_id
  join public.bank_accounts as source_account
    on source_account.id = quote_row.source_account_id
  join public.bank_accounts as target_account
    on target_account.id = quote_row.target_account_id
  join public.fx_fixings as fixing_row on fixing_row.id = receipt_row.fixing_id
  where receipt_row.id = p_receipt_id;
$function$;

revoke all on function private.fx_settlement_receipt_public_json_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.create_business_fx_quote_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_source_account_key text,
  p_target_currency_code text,
  p_source_amount numeric,
  p_product text,
  p_idempotency_key text,
  p_target_account_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_business record;
  v_existing public.fx_quotes%rowtype;
  v_source_account_key text := lower(btrim(coalesce(p_source_account_key, '')));
  v_target_account_key text := nullif(
    lower(btrim(coalesce(p_target_account_key, ''))), ''
  );
  v_target_currency text := upper(btrim(coalesce(p_target_currency_code, '')));
  v_product text := lower(btrim(coalesce(p_product, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_source_currency text;
  v_prior_context text := coalesce(
    current_setting('app.business_owner_id', true), ''
  );
  v_result jsonb;
begin
  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  if v_target_account_key is not null
     and v_target_account_key !~ '^bac_[0-9a-f]{32}$'
  then
    raise exception 'BANK_ACCOUNT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select quote_row.*
  into v_existing
  from public.fx_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.business_id = v_business.business_id
    and quote_row.idempotency_key = v_idempotency_key;
  if found then
    if v_existing.product <> v_product
       or v_existing.source_currency_code is null
       or v_existing.target_currency_code <> v_target_currency
       or v_existing.source_amount is distinct from p_source_amount
       or not exists (
         select 1 from public.bank_accounts as account_row
         where account_row.id = v_existing.source_account_id
           and account_row.public_key = v_source_account_key
       )
       or (
         v_target_account_key is not null
         and not exists (
           select 1 from public.bank_accounts as account_row
           where account_row.id = v_existing.target_account_id
             and account_row.public_key = v_target_account_key
         )
       )
    then
      raise exception 'FX_QUOTE_CONFLICT' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'outcome', 'replayed',
      'quote', private.fx_quote_public_json_v1(v_existing.id)
    );
  end if;

  select account_row.currency_code
  into v_source_currency
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where account_row.game_session_id = p_game_session_id
    and account_row.public_key = v_source_account_key
    and account_row.account_kind = 'checking'
    and account_row.legacy_account_type is null
    and account_row.status = 'active'
    and party_row.party_kind = 'business'
    and party_row.business_id = v_business.business_id
    and party_row.status = 'active';
  if not found then
    raise exception 'BANK_ACCOUNT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_source_currency = v_target_currency then
    raise exception 'FX_SAME_CURRENCY_NOT_REQUIRED' using errcode = 'P0001';
  end if;

  if v_target_account_key is not null and not exists (
    select 1
    from public.bank_accounts as account_row
    join public.economic_parties as party_row
      on party_row.id = account_row.party_id
     and party_row.game_session_id = account_row.game_session_id
    where account_row.game_session_id = p_game_session_id
      and account_row.public_key = v_target_account_key
      and account_row.account_kind = 'checking'
      and account_row.currency_code = v_target_currency
      and account_row.status = 'active'
      and party_row.party_kind = 'business'
      and party_row.business_id = v_business.business_id
      and party_row.status = 'active'
  ) then
    raise exception 'BANK_ACCOUNT_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform set_config(
    'app.business_owner_id', v_business.business_id::text, true
  );
  v_result := public.create_player_fx_quote_v1(
    p_game_session_id,
    p_player_id,
    v_source_account_key,
    v_target_currency,
    p_source_amount,
    v_product,
    v_idempotency_key
  );
  perform set_config('app.business_owner_id', v_prior_context, true);

  if v_target_account_key is not null
     and v_result #>> '{quote,target_account_key}' <> v_target_account_key
  then
    raise exception 'FX_QUOTE_ACCOUNT_CONFLICT' using errcode = 'P0001';
  end if;
  return v_result;
end;
$function$;

revoke all on function public.create_business_fx_quote_v1(
  uuid, uuid, text, text, numeric, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_business_fx_quote_v1(
  uuid, uuid, text, text, numeric, text, text, text
) to service_role;

create or replace function public.submit_business_standard_fx_order_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_quote_key text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_business record;
  v_existing public.fx_orders%rowtype;
  v_prior_context text := coalesce(
    current_setting('app.business_owner_id', true), ''
  );
  v_result jsonb;
begin
  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  select order_row.* into v_existing
  from public.fx_orders as order_row
  join public.fx_quotes as quote_row on quote_row.id = order_row.quote_id
  where order_row.game_session_id = p_game_session_id
    and order_row.business_id = v_business.business_id
    and order_row.idempotency_key = btrim(coalesce(p_idempotency_key, ''));
  if found then
    if v_existing.product <> 'standard'
       or not exists (
         select 1 from public.fx_quotes as quote_row
         where quote_row.id = v_existing.quote_id
           and quote_row.public_key = lower(btrim(coalesce(p_quote_key, '')))
       )
    then
      raise exception 'FX_QUOTE_CONFLICT' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'outcome', 'replayed',
      'order', private.fx_order_public_json_v1(v_existing.id)
    );
  end if;

  perform set_config(
    'app.business_owner_id', v_business.business_id::text, true
  );
  v_result := public.submit_player_standard_fx_order_v1(
    p_game_session_id, p_player_id, p_quote_key, p_idempotency_key
  );
  perform set_config('app.business_owner_id', v_prior_context, true);
  return v_result;
end;
$function$;

revoke all on function public.submit_business_standard_fx_order_v1(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.submit_business_standard_fx_order_v1(
  uuid, uuid, text, text
) to service_role;

create or replace function public.execute_business_instant_fx_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_quote_key text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_business record;
  v_existing public.fx_orders%rowtype;
  v_prior_context text := coalesce(
    current_setting('app.business_owner_id', true), ''
  );
  v_result jsonb;
begin
  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  select order_row.* into v_existing
  from public.fx_orders as order_row
  where order_row.game_session_id = p_game_session_id
    and order_row.business_id = v_business.business_id
    and order_row.idempotency_key = btrim(coalesce(p_idempotency_key, ''));
  if found then
    if v_existing.product <> 'instant'
       or not exists (
         select 1 from public.fx_quotes as quote_row
         where quote_row.id = v_existing.quote_id
           and quote_row.public_key = lower(btrim(coalesce(p_quote_key, '')))
       )
    then
      raise exception 'FX_QUOTE_CONFLICT' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'outcome', 'replayed',
      'order', private.fx_order_public_json_v1(v_existing.id)
    );
  end if;

  perform set_config(
    'app.business_owner_id', v_business.business_id::text, true
  );
  v_result := public.execute_player_instant_fx_v1(
    p_game_session_id, p_player_id, p_quote_key, p_idempotency_key
  );
  perform set_config('app.business_owner_id', v_prior_context, true);
  return v_result;
end;
$function$;

revoke all on function public.execute_business_instant_fx_v1(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.execute_business_instant_fx_v1(
  uuid, uuid, text, text
) to service_role;

create or replace function public.cancel_business_standard_fx_order_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_order_key text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_business record;
  v_prior_context text := coalesce(
    current_setting('app.business_owner_id', true), ''
  );
  v_result jsonb;
begin
  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  if not exists (
    select 1 from public.fx_orders as order_row
    where order_row.game_session_id = p_game_session_id
      and order_row.business_id = v_business.business_id
      and order_row.public_key = lower(btrim(coalesce(p_order_key, '')))
  ) then
    raise exception 'FX_ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform set_config(
    'app.business_owner_id', v_business.business_id::text, true
  );
  v_result := public.cancel_player_standard_fx_order_v1(
    p_game_session_id, p_player_id, p_order_key, p_idempotency_key
  );
  perform set_config('app.business_owner_id', v_prior_context, true);
  return v_result;
end;
$function$;

revoke all on function public.cancel_business_standard_fx_order_v1(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.cancel_business_standard_fx_order_v1(
  uuid, uuid, text, text
) to service_role;

create or replace function public.list_business_fx_orders_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_limit integer default 50
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_business record;
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'FX_ORDER_LIST_LIMIT_INVALID' using errcode = '22023';
  end if;
  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  return query
  select private.fx_order_public_json_v1(order_row.id)
  from public.fx_orders as order_row
  where order_row.game_session_id = p_game_session_id
    and order_row.business_id = v_business.business_id
  order by order_row.submitted_at desc, order_row.public_key desc
  limit p_limit;
end;
$function$;

revoke all on function public.list_business_fx_orders_v1(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.list_business_fx_orders_v1(uuid, uuid, integer)
  to service_role;

create or replace function public.get_business_treasury_overview_v1(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_business record;
  v_generated_at timestamptz := clock_timestamp();
  v_result jsonb;
begin
  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  select jsonb_build_object(
    'business_key', v_business.business_key,
    'reporting_currency_code', upper(btrim(v_business.currency_code)),
    'generated_at', v_generated_at,
    'accounts', coalesce((
      select jsonb_agg(
        private.business_bank_account_public_json_v1(account_row.id)
        order by account_row.currency_code, account_row.public_key
      )
      from public.bank_accounts as account_row
      join public.economic_parties as party_row
        on party_row.id = account_row.party_id
       and party_row.game_session_id = account_row.game_session_id
      where account_row.game_session_id = p_game_session_id
        and account_row.account_kind = 'checking'
        and party_row.party_kind = 'business'
        and party_row.business_id = v_business.business_id
    ), '[]'::jsonb),
    'rates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source_account_key', source_account.public_key,
        'source_currency_code', source_value.currency_code,
        'target_currency_code', target_value.currency_code,
        'source_minor_unit', source_currency.decimal_places,
        'target_minor_unit', target_currency.decimal_places,
        'reference_rate', (
          target_value.units_per_eco / source_value.units_per_eco
        )::numeric(38, 18)::text,
        'fixing_key', fixing_row.public_key,
        'policy_version', policy_row.policy_version,
        'calculated_at', fixing_row.calculated_at,
        'effective_at', fixing_row.effective_at,
        'generated_at', fixing_row.created_at
      ) order by source_value.currency_code, target_value.currency_code)
      from private.fx_runtime_state as runtime
      join public.fx_fixings as fixing_row
        on fixing_row.id = runtime.current_fixing_id
       and fixing_row.game_session_id = runtime.game_session_id
      join public.fx_fixing_currency_values as source_value
        on source_value.fixing_id = fixing_row.id
       and source_value.game_session_id = fixing_row.game_session_id
      join public.fx_fixing_currency_values as target_value
        on target_value.fixing_id = fixing_row.id
       and target_value.game_session_id = fixing_row.game_session_id
      join public.currencies as source_currency
        on source_currency.code = source_value.currency_code
      join public.currencies as target_currency
        on target_currency.code = target_value.currency_code
      join public.fx_policy_versions as policy_row
        on policy_row.id = fixing_row.policy_version_id
      join public.bank_accounts as source_account
        on source_account.game_session_id = p_game_session_id
       and source_account.currency_code = source_value.currency_code
       and source_account.account_kind = 'checking'
       and source_account.status = 'active'
      join public.economic_parties as source_party
        on source_party.id = source_account.party_id
       and source_party.game_session_id = source_account.game_session_id
       and source_party.party_kind = 'business'
       and source_party.business_id = v_business.business_id
      where runtime.game_session_id = p_game_session_id
        and runtime.cutover_status = 'ready'
        and source_currency.status = 'active'
        and target_currency.status = 'active'
        and target_value.currency_code <> source_value.currency_code
    ), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(
        private.fx_order_public_json_v1(recent_order.id)
        order by recent_order.submitted_at desc, recent_order.public_key desc
      )
      from (
        select order_row.id, order_row.submitted_at, order_row.public_key
        from public.fx_orders as order_row
        where order_row.game_session_id = p_game_session_id
          and order_row.business_id = v_business.business_id
        order by order_row.submitted_at desc, order_row.public_key desc
        limit 50
      ) as recent_order
    ), '[]'::jsonb),
    'receipts', coalesce((
      select jsonb_agg(
        private.fx_settlement_receipt_public_json_v1(recent_receipt.id)
        order by recent_receipt.settled_at desc, recent_receipt.public_key desc
      )
      from (
        select receipt_row.id, receipt_row.settled_at, receipt_row.public_key
        from public.fx_settlement_receipts as receipt_row
        join public.fx_orders as order_row on order_row.id = receipt_row.order_id
        where receipt_row.game_session_id = p_game_session_id
          and order_row.business_id = v_business.business_id
        order by receipt_row.settled_at desc, receipt_row.public_key desc
        limit 50
      ) as recent_receipt
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_business_treasury_overview_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_business_treasury_overview_v1(uuid, uuid)
  to service_role;

commit;
