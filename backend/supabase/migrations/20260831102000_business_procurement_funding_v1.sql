-- Created with Supabase CLI as 20260831000250, then moved to the reserved C4 timestamp.

-- Business procurement funding and atomic Store cutover V1.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '240s';

-- C4 settles Store procurement at the target currency's registered precision.
-- Widen only the settlement-authority columns so 3- and 18-decimal currencies
-- are not coerced back to the predecessor's two-decimal Store typmod.
alter table public.business_store_purchase_quotes
  alter column final_unit_price type numeric(38, 18)
    using final_unit_price::numeric(38, 18),
  alter column final_total_price type numeric(38, 18)
    using final_total_price::numeric(38, 18);

alter table public.business_store_purchases
  alter column final_unit_price type numeric(38, 18)
    using final_unit_price::numeric(38, 18),
  alter column final_total_price type numeric(38, 18)
    using final_total_price::numeric(38, 18);

create or replace function private.ensure_active_system_checking_account_v1(
  p_game_session_id uuid,
  p_system_key text,
  p_currency_code text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_system_key text := lower(btrim(coalesce(p_system_key, '')));
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_party_id uuid;
  v_party_status text;
  v_account_id uuid;
  v_account_status text;
begin
  if p_game_session_id is null
     or v_system_key !~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
     or v_currency !~ '^[A-Z0-9_]{3,16}$'
  then
    raise exception 'BANK_SYSTEM_PARTY_KEY_INVALID' using errcode = '22023';
  end if;

  perform 1
  from public.currencies as currency_row
  where currency_row.code = v_currency
    and currency_row.status = 'active';
  if not found then
    raise exception 'BANK_ACCOUNT_CURRENCY_INVALID' using errcode = 'P0001';
  end if;

  insert into public.economic_parties(
    game_session_id, party_kind, system_key, status
  ) values (
    p_game_session_id, 'system', v_system_key, 'active'
  )
  on conflict (game_session_id, party_kind, system_key)
    where system_key is not null
  do nothing;

  select party_row.id, party_row.status
  into v_party_id, v_party_status
  from public.economic_parties as party_row
  where party_row.game_session_id = p_game_session_id
    and party_row.party_kind = 'system'
    and party_row.system_key = v_system_key
  for update;
  if not found or v_party_status <> 'active' then
    raise exception 'BANK_ACCOUNT_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  select account_row.id, account_row.status
  into v_account_id, v_account_status
  from public.bank_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.party_id = v_party_id
    and account_row.account_kind = 'checking'
    and account_row.currency_code = v_currency
    and account_row.legacy_account_type is null
  for update;
  if found then
    if v_account_status <> 'active' then
      raise exception 'BANK_ACCOUNT_NOT_ACTIVE' using errcode = 'P0001';
    end if;
    perform private.ensure_bank_account_projection_v1(
      p_game_session_id, v_account_id
    );
    return v_account_id;
  end if;

  v_account_id := private.ensure_bank_account_identity_v1(
    p_game_session_id, v_party_id, 'checking', v_currency, null
  );
  perform private.ensure_bank_account_projection_v1(
    p_game_session_id, v_account_id
  );
  return v_account_id;
end;
$function$;

revoke all on function private.ensure_active_system_checking_account_v1(
  uuid, text, text
) from public, anon, authenticated, service_role;

-- Generalize the shared C0 quote/composer bodies. Player signatures, hashes,
-- public keys, spreads, and behavior remain byte-identical when no Business
-- context is present. Business intent is included before request hashing and
-- every replay lookup runs under the retained inner advisory lock.
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
        'private'::text,
        'create_purchase_funding_quote_core_v1'::text,
        'and quote_row.player_id = p_player_id'::text,
        E'and private.evidence_matches_request_owner_v1(\n      p_game_session_id, p_player_id, quote_row.player_id, quote_row.business_id\n    )'::text,
        1::integer
      ),
      (
        'private',
        'create_purchase_funding_quote_core_v1',
        E'and party_row.party_kind = ''player''\n      and party_row.player_id = p_player_id',
        E'and private.bank_party_matches_request_owner_v1(\n        p_game_session_id, p_player_id, party_row.party_kind,\n        party_row.player_id, party_row.business_id\n      )',
        1
      ),
      (
        'private',
        'create_purchase_funding_quote_core_v1',
        E'and account_row.account_kind = ''checking''\n      and account_row.status = ''active''',
        E'and account_row.account_kind = ''checking''\n      and (\n        private.current_business_owner_context_v1() is null\n        or account_row.legacy_account_type is null\n      )\n      and account_row.status = ''active''',
        1
      ),
      (
        'private',
        'create_purchase_funding_quote_core_v1',
        '  v_request_hash := private.fx_digest_jsonb_v1(v_request);',
        E'  if private.current_business_owner_context_v1() is not null then\n    v_request := v_request || jsonb_build_object(\n      ''businessId'', private.current_business_owner_context_v1()\n    );\n  end if;\n  v_request_hash := private.fx_digest_jsonb_v1(v_request);',
        1
      ),
      (
        'private',
        'create_purchase_funding_quote_core_v1',
        E'    ''purchase-funding-quote-v1:'' || p_game_session_id::text || '':'' ||\n      p_player_id::text || '':'' || v_idempotency_key,',
        E'    ''purchase-funding-quote-v1:'' || p_game_session_id::text || '':'' ||\n      case\n        when private.current_business_owner_context_v1() is null\n          then p_player_id::text\n        else ''business:'' || private.current_business_owner_context_v1()::text\n      end || '':'' || v_idempotency_key,',
        1
      ),
      (
        'private',
        'create_purchase_funding_quote_core_v1',
        E'  v_quote_public_key := ''pfq_'' || substr(private.bank_digest_text_v1(concat_ws(\n    ''|'',\n    ''purchase-funding-quote-v1'',\n    p_game_session_id::text,\n    p_player_id::text,\n    v_idempotency_key\n  )), 1, 32);',
        E'  v_quote_public_key := case\n    when private.current_business_owner_context_v1() is null then\n      ''pfq_'' || substr(private.bank_digest_text_v1(concat_ws(\n        ''|'', ''purchase-funding-quote-v1'', p_game_session_id::text,\n        p_player_id::text, v_idempotency_key\n      )), 1, 32)\n    else\n      ''pfq_'' || substr(private.bank_digest_text_v1(concat_ws(\n        ''|'', ''business-purchase-funding-quote-v1'', p_game_session_id::text,\n        private.current_business_owner_context_v1()::text, v_idempotency_key\n      )), 1, 32)\n  end;',
        1
      ),
      (
        'private',
        'compose_purchase_funding_v1',
        '  v_request_hash := private.fx_digest_jsonb_v1(v_request);',
        E'  if private.current_business_owner_context_v1() is not null then\n    v_request := v_request || jsonb_build_object(\n      ''businessId'', private.current_business_owner_context_v1()\n    );\n  end if;\n  v_request_hash := private.fx_digest_jsonb_v1(v_request);',
        1
      ),
      (
        'private',
        'compose_purchase_funding_v1',
        E'and account_row.account_kind = ''checking''\n      and account_row.status = ''active''',
        E'and account_row.account_kind = ''checking''\n      and (\n        private.current_business_owner_context_v1() is null\n        or account_row.legacy_account_type is null\n      )\n      and account_row.status = ''active''',
        1
      ),
      (
        'private',
        'compose_purchase_funding_v1',
        '  -- Resolve owning-domain idempotency before current balances, account status,',
        E'  perform pg_advisory_xact_lock(hashtextextended(\n    concat_ws('':'',\n      ''purchase-funding-compose-v1'',\n      p_game_session_id::text,\n      case\n        when private.current_business_owner_context_v1() is null\n          then ''player-global''\n        else ''business:'' || private.current_business_owner_context_v1()::text\n      end,\n      v_source_domain,\n      v_source_action,\n      v_idempotency_key\n    ),\n    0\n  ));\n\n  -- Resolve owning-domain idempotency before current balances, account status,',
        1
      ),
      (
        'private',
        'compose_purchase_funding_v1',
        '    and receipt_row.idempotency_key = v_idempotency_key;',
        E'    and receipt_row.idempotency_key = v_idempotency_key\n    and (\n      (\n        private.current_business_owner_context_v1() is null\n        and receipt_row.player_id is not null\n        and receipt_row.business_id is null\n      )\n      or (\n        private.current_business_owner_context_v1() is not null\n        and private.evidence_matches_request_owner_v1(\n          p_game_session_id, p_player_id,\n          receipt_row.player_id, receipt_row.business_id\n        )\n      )\n    );',
        1
      ),
      (
        'private',
        'compose_purchase_funding_v1',
        'and quote_row.player_id = p_player_id',
        E'and private.evidence_matches_request_owner_v1(\n      p_game_session_id, p_player_id, quote_row.player_id, quote_row.business_id\n    )',
        1
      ),
      (
        'private',
        'compose_purchase_funding_v1',
        E'if v_target_party.party_kind = ''player''\n     and v_target_party.player_id = p_player_id\n  then',
        E'if private.bank_party_matches_request_owner_v1(\n    p_game_session_id, p_player_id, v_target_party.party_kind,\n    v_target_party.player_id, v_target_party.business_id\n  ) then',
        1
      ),
      (
        'private',
        'compose_purchase_funding_v1',
        E'and party_row.party_kind = ''player''\n      and party_row.player_id = p_player_id',
        E'and private.bank_party_matches_request_owner_v1(\n        p_game_session_id, p_player_id, party_row.party_kind,\n        party_row.player_id, party_row.business_id\n      )',
        1
      ),
      (
        'private',
        'compose_purchase_funding_v1',
        E'  v_receipt_public_key := ''pfr_'' || substr(private.bank_digest_text_v1(concat_ws(\n    ''|'',\n    ''purchase-funding-receipt-v1'',\n    p_game_session_id::text,\n    v_source_domain,\n    v_source_action,\n    v_idempotency_key\n  )), 1, 32);',
        E'  v_receipt_public_key := case\n    when private.current_business_owner_context_v1() is null then\n      ''pfr_'' || substr(private.bank_digest_text_v1(concat_ws(\n        ''|'', ''purchase-funding-receipt-v1'', p_game_session_id::text,\n        v_source_domain, v_source_action, v_idempotency_key\n      )), 1, 32)\n    else\n      ''pfr_'' || substr(private.bank_digest_text_v1(concat_ws(\n        ''|'', ''business-purchase-funding-receipt-v1'',\n        p_game_session_id::text,\n        private.current_business_owner_context_v1()::text,\n        v_source_domain, v_source_action, v_idempotency_key\n      )), 1, 32)\n  end;',
        1
      )
    ) as replacements(
      schema_name, function_name, old_text, new_text, expected_count
    )
  loop
    select proc_row.oid
    into v_oid
    from pg_catalog.pg_proc as proc_row
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = proc_row.pronamespace
    where namespace_row.nspname = v_target.schema_name
      and proc_row.proname = v_target.function_name
      and proc_row.prokind = 'f'
    order by proc_row.oid desc
    limit 1;

    if v_oid is null then
      raise exception 'C4_FUNDING_FUNCTION_MISSING:%', v_target.function_name
        using errcode = 'P0001';
    end if;
    v_definition := pg_catalog.pg_get_functiondef(v_oid);
    v_actual := (
      length(v_definition) - length(replace(
        v_definition, v_target.old_text, ''
      ))
    ) / length(v_target.old_text);
    if v_actual <> v_target.expected_count then
      raise exception 'C4_FUNDING_REWRITE_COUNT:%:%:%',
        v_target.function_name, v_actual, v_target.expected_count
        using errcode = 'P0001';
    end if;
    execute replace(v_definition, v_target.old_text, v_target.new_text);
  end loop;
end;
$migration$;

create or replace function private.purchase_funding_quote_public_json_v1(
  p_quote_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'quote_key', quote_row.public_key,
    'funding_context_kind', quote_row.funding_context_kind,
    'funding_context_key', quote_row.funding_context_key,
    'target_currency_code', quote_row.target_currency_code,
    'target_minor_unit', quote_row.target_minor_unit,
    'target_amount', private.currency_amount_text_v1(
      quote_row.target_amount, quote_row.target_minor_unit
    ),
    'fixing_key', fixing_row.public_key,
    'policy_version', policy_row.policy_version,
    'requires_fx', quote_row.requires_fx,
    'expires_at', quote_row.expires_at,
    'generated_at', quote_row.created_at,
    'lines', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'line_number', line_row.line_number,
          'source_account_key', account_row.public_key,
          'source_currency_code', line_row.source_currency_code,
          'source_minor_unit', line_row.source_minor_unit,
          'target_currency_code', line_row.target_currency_code,
          'target_minor_unit', line_row.target_minor_unit,
          'posted_amount', private.currency_amount_text_v1(
            line_row.source_posted_snapshot, line_row.source_minor_unit
          ),
          'held_amount', private.currency_amount_text_v1(
            line_row.source_held_snapshot, line_row.source_minor_unit
          ),
          'available_amount', private.currency_amount_text_v1(
            line_row.source_available_snapshot, line_row.source_minor_unit
          ),
          'target_contribution', private.currency_amount_text_v1(
            line_row.target_contribution, line_row.target_minor_unit
          ),
          'source_debit', private.currency_amount_text_v1(
            line_row.source_debit, line_row.source_minor_unit
          ),
          'reference_rate', line_row.reference_rate::text,
          'customer_rate', line_row.customer_rate::text,
          'effective_rate', line_row.effective_rate::text,
          'spread_rate', line_row.spread_rate::text,
          'requires_fx', line_row.requires_fx,
          'rounding_disclosure', line_row.rounding_disclosure
        )
        order by line_row.line_number
      )
      from public.purchase_funding_quote_lines as line_row
      join public.bank_accounts as account_row
        on account_row.id = line_row.source_account_id
       and account_row.game_session_id = line_row.game_session_id
      where line_row.quote_id = quote_row.id
        and line_row.game_session_id = quote_row.game_session_id
    ), '[]'::jsonb)
  )
  from public.purchase_funding_quotes as quote_row
  join public.fx_fixings as fixing_row
    on fixing_row.id = quote_row.fixing_id
   and fixing_row.game_session_id = quote_row.game_session_id
  join public.fx_policy_versions as policy_row
    on policy_row.id = quote_row.policy_version_id
  where quote_row.id = p_quote_id;
$function$;

revoke all on function private.purchase_funding_quote_public_json_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.purchase_funding_receipt_public_json_v1(
  p_receipt_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'receipt_key', receipt_row.public_key,
    'quote_key', quote_row.public_key,
    'bank_transaction_key', transaction_row.public_key,
    'target_account_key', target_account.public_key,
    'funding_context_kind', receipt_row.funding_context_kind,
    'funding_context_key', receipt_row.funding_context_key,
    'target_currency_code', receipt_row.target_currency_code,
    'target_minor_unit', quote_row.target_minor_unit,
    'target_amount', private.currency_amount_text_v1(
      receipt_row.target_amount, quote_row.target_minor_unit
    ),
    'target_reserve_draw_amount',
      private.currency_amount_text_v1(
        receipt_row.target_reserve_draw_amount, quote_row.target_minor_unit
      ),
    'source_domain', receipt_row.source_domain,
    'source_action', receipt_row.source_action,
    'created_at', receipt_row.created_at,
    'generated_at', receipt_row.created_at,
    'lines', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'line_number', line_row.line_number,
          'source_account_key', source_account.public_key,
          'source_currency_code', line_row.source_currency_code,
          'source_minor_unit', line_row.source_minor_unit,
          'target_currency_code', line_row.target_currency_code,
          'target_minor_unit', line_row.target_minor_unit,
          'target_contribution', private.currency_amount_text_v1(
            line_row.target_contribution, line_row.target_minor_unit
          ),
          'source_debit', private.currency_amount_text_v1(
            line_row.source_debit, line_row.source_minor_unit
          ),
          'reference_rate', line_row.reference_rate::text,
          'customer_rate', line_row.customer_rate::text,
          'effective_rate', line_row.effective_rate::text,
          'spread_rate', line_row.spread_rate::text,
          'requires_fx', line_row.requires_fx
        )
        order by line_row.line_number
      )
      from public.purchase_funding_quote_lines as line_row
      join public.bank_accounts as source_account
        on source_account.id = line_row.source_account_id
       and source_account.game_session_id = line_row.game_session_id
      where line_row.quote_id = quote_row.id
        and line_row.game_session_id = quote_row.game_session_id
    ), '[]'::jsonb)
  )
  from public.purchase_funding_receipts as receipt_row
  join public.purchase_funding_quotes as quote_row
    on quote_row.id = receipt_row.quote_id
   and quote_row.game_session_id = receipt_row.game_session_id
  join public.bank_transactions as transaction_row
    on transaction_row.id = receipt_row.bank_transaction_id
   and transaction_row.game_session_id = receipt_row.game_session_id
  join public.bank_accounts as target_account
    on target_account.id = receipt_row.target_account_id
   and target_account.game_session_id = receipt_row.game_session_id
  where receipt_row.id = p_receipt_id;
$function$;

create or replace function public.create_business_purchase_funding_quote_v1(
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
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_business record;
  v_prior_context text := coalesce(
    current_setting('app.business_owner_id', true), ''
  );
  v_result jsonb;
begin
  if jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) not between 1 and 3
  then
    raise exception 'PURCHASE_FUNDING_ALLOCATION_INVALID' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_allocations) as allocation(value)
    where jsonb_typeof(allocation.value) <> 'object'
  ) then
    raise exception 'PURCHASE_FUNDING_ALLOCATION_INVALID' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_allocations) as allocation(value)
    where not (allocation.value ? 'sourceAccountKey')
       or not (allocation.value ? 'targetAmount')
       or (select count(*) from jsonb_object_keys(allocation.value)) <> 2
       or coalesce(allocation.value ->> 'sourceAccountKey', '')
         !~ '^bac_[0-9a-f]{32}$'
       or jsonb_typeof(allocation.value -> 'targetAmount') <> 'string'
       or coalesce(allocation.value ->> 'targetAmount', '')
         !~ '^[0-9]{1,20}([.][0-9]{1,18})?$'
       or (allocation.value ->> 'targetAmount')::numeric <= 0
  ) then
    raise exception 'PURCHASE_FUNDING_ALLOCATION_INVALID' using errcode = '22023';
  end if;

  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);
  perform set_config(
    'app.business_owner_id', v_business.business_id::text, true
  );
  v_result := public.create_purchase_funding_quote_v1(
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
  perform set_config('app.business_owner_id', v_prior_context, true);
  return v_result;
end;
$function$;

revoke all on function public.create_business_purchase_funding_quote_v1(
  uuid, uuid, text, numeric, text, text, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.create_business_purchase_funding_quote_v1(
  uuid, uuid, text, numeric, text, text, text, jsonb, text
) to service_role;

create or replace function private.compose_business_purchase_funding_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_id uuid,
  p_quote_key text,
  p_funding_context_kind text,
  p_funding_context_key text,
  p_funding_context_hash text,
  p_target_account_id uuid,
  p_source_domain text,
  p_source_action text,
  p_source_id uuid,
  p_idempotency_key text,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_prior_context text := coalesce(
    current_setting('app.business_owner_id', true), ''
  );
  v_result jsonb;
begin
  if not private.business_controller_matches_request_v1(
    p_game_session_id, p_business_id, p_player_id
  ) then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform set_config('app.business_owner_id', p_business_id::text, true);
  v_result := private.compose_purchase_funding_v1(
    p_game_session_id,
    p_player_id,
    p_quote_key,
    p_funding_context_kind,
    p_funding_context_key,
    p_funding_context_hash,
    p_target_account_id,
    p_source_domain,
    p_source_action,
    p_source_id,
    p_idempotency_key,
    'player',
    p_player_id,
    p_now
  );
  perform set_config('app.business_owner_id', v_prior_context, true);
  return v_result;
end;
$function$;

revoke all on function private.compose_business_purchase_funding_v1(
  uuid, uuid, uuid, text, text, text, text, uuid,
  text, text, uuid, text, timestamptz
) from public, anon, authenticated, service_role;

alter table public.business_store_purchase_quotes
  add column funding_quote_id uuid null,
  add column funding_context_hash text null,
  add column target_bank_account_id uuid null,
  add column funding_idempotency_key text null,
  add column funding_allocations jsonb null,
  add constraint business_store_quotes_funding_quote_scope_fk
    foreign key (funding_quote_id, game_session_id)
    references public.purchase_funding_quotes(id, game_session_id),
  add constraint business_store_quotes_target_account_scope_fk
    foreign key (target_bank_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id),
  add constraint business_store_quotes_funding_quote_unique
    unique (funding_quote_id),
  add constraint business_store_quotes_funding_family_check
    check (
      (
        funding_quote_id is null
        and funding_context_hash is null
        and target_bank_account_id is null
        and funding_idempotency_key is null
        and funding_allocations is null
      )
      or (
        funding_quote_id is not null
        and funding_context_hash ~ '^[0-9a-f]{64}$'
        and target_bank_account_id is not null
        and length(btrim(funding_idempotency_key)) between 8 and 160
        and jsonb_typeof(funding_allocations) = 'array'
        and jsonb_array_length(funding_allocations) between 1 and 3
      )
    ) not valid;

alter table public.business_store_purchase_quotes
  validate constraint business_store_quotes_funding_family_check;

create index business_store_quotes_funding_lookup_idx
  on public.business_store_purchase_quotes(
    game_session_id, business_id, funding_quote_id
  ) where funding_quote_id is not null;

alter table public.business_store_purchases
  add column funding_receipt_id uuid null,
  add column bank_transaction_id uuid null,
  add column target_bank_account_id uuid null,
  add constraint business_store_purchases_funding_receipt_scope_fk
    foreign key (funding_receipt_id, game_session_id)
    references public.purchase_funding_receipts(id, game_session_id),
  add constraint business_store_purchases_bank_transaction_scope_fk
    foreign key (bank_transaction_id, game_session_id)
    references public.bank_transactions(id, game_session_id),
  add constraint business_store_purchases_target_account_scope_fk
    foreign key (target_bank_account_id, game_session_id)
    references public.bank_accounts(id, game_session_id),
  add constraint business_store_purchases_funding_receipt_unique
    unique (funding_receipt_id),
  drop constraint business_store_purchases_completed_state_valid,
  add constraint business_store_purchases_completed_state_valid
    check (
      (
        status = 'STARTED'
        and completed_at is null
        and ledger_entry_id is null
        and funding_receipt_id is null
        and bank_transaction_id is null
        and target_bank_account_id is null
        and inventory_transaction_id is null
        and warehouse_quantity_owned is null
        and warehouse_average_unit_cost is null
      )
      or (
        status = 'COMPLETED'
        and completed_at is not null
        and inventory_transaction_id is not null
        and warehouse_quantity_owned is not null
        and warehouse_average_unit_cost is not null
        and (
          (
            ledger_entry_id is not null
            and funding_receipt_id is null
            and bank_transaction_id is null
            and target_bank_account_id is null
          )
          or (
            ledger_entry_id is null
            and funding_receipt_id is not null
            and bank_transaction_id is not null
            and target_bank_account_id is not null
          )
        )
      )
    ) not valid;

alter table public.business_store_purchases
  validate constraint business_store_purchases_completed_state_valid;

alter table public.business_store_purchase_quotes force row level security;
alter table public.business_store_purchases force row level security;

comment on column public.business_store_purchase_quotes.funding_quote_id is
  'Immutable C0 funding quote bound to the exact Store commercial quote.';
comment on column public.business_store_purchase_quotes.funding_allocations is
  'Ordered immutable target-currency contributions after server-derived remainder materialization.';
comment on column public.business_store_purchases.funding_receipt_id is
  'Immutable C0 funding receipt. Mutually exclusive with legacy direct-debit ledger evidence.';

create or replace function public.guard_business_store_quote_evidence_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'BUSINESS_STORE_QUOTE_IMMUTABLE' using errcode = '42501';
  end if;

  if old.status <> 'CREATED'
    or new.status not in ('USED', 'EXPIRED', 'CANCELLED')
  then
    raise exception 'BUSINESS_STORE_QUOTE_TRANSITION_INVALID' using errcode = '42501';
  end if;

  if (
    to_jsonb(new) - array['status', 'used_at', 'cancelled_at']
  ) is distinct from (
    to_jsonb(old) - array['status', 'used_at', 'cancelled_at']
  ) then
    raise exception 'BUSINESS_STORE_QUOTE_IMMUTABLE' using errcode = '42501';
  end if;

  if new.status = 'USED' then
    if new.used_at is null or new.cancelled_at is not null then
      raise exception 'BUSINESS_STORE_QUOTE_TRANSITION_INVALID' using errcode = '42501';
    end if;
  elsif new.status = 'CANCELLED' then
    if new.cancelled_at is null or new.used_at is not null then
      raise exception 'BUSINESS_STORE_QUOTE_TRANSITION_INVALID' using errcode = '42501';
    end if;
  elsif new.used_at is not null or new.cancelled_at is not null then
    raise exception 'BUSINESS_STORE_QUOTE_TRANSITION_INVALID' using errcode = '42501';
  end if;
  return new;
end;
$function$;

create or replace function public.guard_business_store_purchase_evidence_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'BUSINESS_STORE_PURCHASE_IMMUTABLE' using errcode = '42501';
  end if;
  if old.status <> 'STARTED' or new.status <> 'COMPLETED' then
    raise exception 'BUSINESS_STORE_PURCHASE_TRANSITION_INVALID' using errcode = '42501';
  end if;
  if (
    to_jsonb(new) - array[
      'ledger_entry_id', 'funding_receipt_id', 'bank_transaction_id',
      'target_bank_account_id', 'inventory_transaction_id',
      'warehouse_quantity_owned', 'warehouse_average_unit_cost',
      'status', 'completed_at'
    ]
  ) is distinct from (
    to_jsonb(old) - array[
      'ledger_entry_id', 'funding_receipt_id', 'bank_transaction_id',
      'target_bank_account_id', 'inventory_transaction_id',
      'warehouse_quantity_owned', 'warehouse_average_unit_cost',
      'status', 'completed_at'
    ]
  ) then
    raise exception 'BUSINESS_STORE_PURCHASE_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$function$;

alter function public.create_business_store_quote_v2(
  uuid, uuid, text, integer, text, timestamptz
) set schema economy_private;
alter function economy_private.create_business_store_quote_v2(
  uuid, uuid, text, integer, text, timestamptz
) rename to create_business_store_commercial_quote_v2;

revoke all on function economy_private.create_business_store_commercial_quote_v2(
  uuid, uuid, text, integer, text, timestamptz
) from public, anon, authenticated, service_role;

drop function economy_private.create_business_store_commercial_quote_v2(
  uuid, uuid, text, integer, text, timestamptz
);

alter function public.purchase_business_store_quote_v2(
  uuid, uuid, text, text, timestamptz, jsonb
) set schema economy_private;
alter function economy_private.purchase_business_store_quote_v2(
  uuid, uuid, text, text, timestamptz, jsonb
) rename to purchase_business_store_quote_legacy_v2;

revoke all on function economy_private.purchase_business_store_quote_legacy_v2(
  uuid, uuid, text, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;

drop function economy_private.purchase_business_store_quote_legacy_v2(
  uuid, uuid, text, text, timestamptz, jsonb
);

create or replace function private.business_store_funding_context_hash_values_v1(
  p_game_session_id uuid,
  p_business_id uuid,
  p_quote_public_key text,
  p_store_item_id uuid,
  p_quantity integer,
  p_country_snapshot_id uuid,
  p_snapshot_sequence integer,
  p_pricing_version text,
  p_item_currency_code text,
  p_settlement_currency_code text,
  p_final_unit_price numeric,
  p_final_total_price numeric,
  p_target_account_id uuid,
  p_materialized_allocations jsonb
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'business-store-procurement-context-v1',
    'gameSessionId', p_game_session_id,
    'businessId', p_business_id,
    'quotePublicKey', p_quote_public_key,
    'storeItemKey', item_row.item_key,
    'quantity', p_quantity,
    'countrySnapshotId', p_country_snapshot_id,
    'snapshotSequence', p_snapshot_sequence,
    'pricingVersion', p_pricing_version,
    'itemCurrencyCode', p_item_currency_code,
    'settlementCurrencyCode', p_settlement_currency_code,
    'finalUnitAmount', p_final_unit_price::text,
    'finalTotalAmount', p_final_total_price::text,
    'targetAccountKey', target_account.public_key,
    'materializedAllocations', p_materialized_allocations
  ))
  from public.store_items as item_row
  join public.bank_accounts as target_account
    on target_account.id = p_target_account_id
   and target_account.game_session_id = p_game_session_id
  where item_row.id = p_store_item_id
    and item_row.game_session_id = p_game_session_id;
$function$;

revoke all on function private.business_store_funding_context_hash_values_v1(
  uuid, uuid, text, uuid, integer, uuid, integer, text, text, text,
  numeric, numeric, uuid, jsonb
) from public, anon, authenticated, service_role;

create or replace function private.business_store_funding_context_hash_v1(
  p_quote_id uuid,
  p_target_account_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select private.business_store_funding_context_hash_values_v1(
    quote_row.game_session_id,
    quote_row.business_id,
    quote_row.public_key,
    quote_row.store_item_id,
    quote_row.quantity,
    quote_row.country_snapshot_id,
    quote_row.snapshot_sequence,
    quote_row.pricing_version,
    quote_row.item_currency_code,
    quote_row.settlement_currency_code,
    quote_row.final_unit_price,
    quote_row.final_total_price,
    p_target_account_id,
    quote_row.funding_allocations
  )
  from public.business_store_purchase_quotes as quote_row
  where quote_row.id = p_quote_id;
$function$;

revoke all on function private.business_store_funding_context_hash_v1(
  uuid, uuid
) from public, anon, authenticated, service_role;

create or replace function private.business_store_funded_quote_public_json_v1(
  p_quote_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'business_key', business_row.public_key,
    'quote_key', quote_row.public_key,
    'item_key', item_row.item_key,
    'item_name', item_row.name,
    'quantity', quote_row.quantity,
    'country_code', business_row.country_code,
    'item_currency_code', quote_row.item_currency_code,
    'item_minor_unit', item_currency.decimal_places,
    'settlement_currency_code', quote_row.settlement_currency_code,
    'settlement_minor_unit', settlement_currency.decimal_places,
    'base_unit_price', quote_row.base_unit_price,
    'base_unit_amount', private.currency_amount_text_v1(
      quote_row.base_unit_price, item_currency.decimal_places
    ),
    'inflation_multiplier', quote_row.inflation_multiplier::text,
    'location_multiplier', quote_row.location_multiplier::text,
    'scarcity_multiplier', quote_row.scarcity_multiplier::text,
    'item_local_final_unit_price', quote_row.item_local_final_unit_price,
    'item_local_final_unit_amount', private.currency_amount_text_v1(
      quote_row.item_local_final_unit_price, item_currency.decimal_places
    ),
    'item_local_final_total_price', quote_row.item_local_final_total_price,
    'item_local_final_total_amount', private.currency_amount_text_v1(
      quote_row.item_local_final_total_price, item_currency.decimal_places
    ),
    'exchange_rate', quote_row.exchange_rate::text,
    'final_unit_price', quote_row.final_unit_price,
    'final_unit_amount', private.currency_amount_text_v1(
      quote_row.final_unit_price, settlement_currency.decimal_places
    ),
    'final_total_price', quote_row.final_total_price,
    'final_total_amount', private.currency_amount_text_v1(
      quote_row.final_total_price, settlement_currency.decimal_places
    ),
    'pricing_version', quote_row.pricing_version,
    'expires_at', quote_row.expires_at,
    'generated_at', quote_row.created_at,
    'funding_quote_key', funding_row.public_key,
    'funding_target_account_key', target_account.public_key,
    'funding_quote', private.purchase_funding_quote_public_json_v1(
      funding_row.id
    )
  )
  from public.business_store_purchase_quotes as quote_row
  join public.business_entities as business_row
    on business_row.id = quote_row.business_id
   and business_row.game_session_id = quote_row.game_session_id
  join public.store_items as item_row
    on item_row.id = quote_row.store_item_id
   and item_row.game_session_id = quote_row.game_session_id
  join public.currencies as item_currency
    on item_currency.code = quote_row.item_currency_code
  join public.currencies as settlement_currency
    on settlement_currency.code = quote_row.settlement_currency_code
  join public.purchase_funding_quotes as funding_row
    on funding_row.id = quote_row.funding_quote_id
   and funding_row.game_session_id = quote_row.game_session_id
  join public.bank_accounts as target_account
    on target_account.id = quote_row.target_bank_account_id
   and target_account.game_session_id = quote_row.game_session_id
  where quote_row.id = p_quote_id;
$function$;

revoke all on function private.business_store_funded_quote_public_json_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.create_business_store_quote_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_item_key text,
  p_quantity integer,
  p_allocations jsonb,
  p_idempotency_key text,
  p_effective_at timestamptz default statement_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, economy_private, extensions, pg_temp
as $function$
declare
  v_now timestamptz := coalesce(p_effective_at, statement_timestamp());
  v_item_key text := lower(btrim(coalesce(p_item_key, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_business record;
  v_item public.store_items%rowtype;
  v_country public.country_profiles%rowtype;
  v_pricing record;
  v_quote public.business_store_purchase_quotes%rowtype;
  v_funding_quote public.purchase_funding_quotes%rowtype;
  v_target_account_id uuid;
  v_context_hash text;
  v_funding jsonb;
  v_game_status text;
  v_request_hash text;
  v_allocation_intent jsonb;
  v_materialized_allocations jsonb;
  v_line_count integer;
  v_target_minor_unit integer;
  v_fixed_sum numeric(38, 18) := 0;
  v_remainder numeric(38, 18);
  v_settlement_unit numeric(38, 18);
  v_settlement_total numeric(38, 18);
  v_quote_id uuid := extensions.gen_random_uuid();
  v_quote_public_key text := 'bsq_' || replace(
    extensions.gen_random_uuid()::text, '-', ''
  );
begin
  if p_game_session_id is null or p_player_id is null then
    raise exception 'PLAYER_SCOPE_REQUIRED' using errcode = 'P0001';
  end if;
  if v_item_key !~ '^[a-z0-9_-]{1,64}$' then
    raise exception 'STORE_ITEM_KEY_INVALID' using errcode = 'P0001';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100000 then
    raise exception 'STORE_QUOTE_QUANTITY_INVALID' using errcode = 'P0001';
  end if;
  if length(v_idempotency_key) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) not between 1 and 3
  then
    raise exception 'PURCHASE_FUNDING_ALLOCATION_INVALID' using errcode = '22023';
  end if;

  v_line_count := jsonb_array_length(p_allocations);
  if exists (
    select 1
    from jsonb_array_elements(p_allocations) as allocation(value)
    where jsonb_typeof(allocation.value) <> 'object'
  ) then
    raise exception 'PURCHASE_FUNDING_ALLOCATION_INVALID' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_allocations) with ordinality
      as allocation(value, ordinal)
    where not (allocation.value ? 'sourceAccountKey')
       or not (allocation.value ? 'targetAmount')
       or (select count(*) from jsonb_object_keys(allocation.value)) <> 2
       or coalesce(allocation.value ->> 'sourceAccountKey', '')
         !~ '^bac_[0-9a-f]{32}$'
       or (
         allocation.ordinal < v_line_count
         and (
           jsonb_typeof(allocation.value -> 'targetAmount') <> 'string'
           or coalesce(allocation.value ->> 'targetAmount', '')
             !~ '^[0-9]{1,20}([.][0-9]{1,18})?$'
         )
       )
       or (
         allocation.ordinal = v_line_count
         and jsonb_typeof(allocation.value -> 'targetAmount') <> 'null'
       )
  ) then
    raise exception 'PURCHASE_FUNDING_ALLOCATION_INVALID' using errcode = '22023';
  end if;

  if (
    select count(distinct allocation.value ->> 'sourceAccountKey')
    from jsonb_array_elements(p_allocations) as allocation(value)
  ) <> v_line_count then
    raise exception 'PURCHASE_FUNDING_DUPLICATE_ACCOUNT' using errcode = '22023';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'sourceAccountKey', allocation.value ->> 'sourceAccountKey',
      'targetAmount', case
        when allocation.ordinal = v_line_count then null::text
        else ((allocation.value ->> 'targetAmount')::numeric)::text
      end
    ) order by allocation.ordinal
  )
  into v_allocation_intent
  from jsonb_array_elements(p_allocations) with ordinality
    as allocation(value, ordinal);

  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  select item_row.*
  into v_item
  from public.store_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.item_key = v_item_key;
  if not found then
    raise exception 'STORE_ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_request_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'business-store-funded-quote-v1',
    'gameSessionId', p_game_session_id,
    'businessId', v_business.business_id,
    'playerId', p_player_id,
    'storeItemId', v_item.id,
    'quantity', p_quantity,
    'allocationIntent', v_allocation_intent,
    'routeKey', 'players.me.business.store.quotes.v2'
  ));

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':',
      'business-store-quote-v2', p_game_session_id::text,
      v_business.business_id::text, v_idempotency_key
    ),
    0
  ));

  select quote_row.*
  into v_quote
  from public.business_store_purchase_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.business_id = v_business.business_id
    and quote_row.idempotency_key = v_idempotency_key
  for update;
  if found then
    if v_quote.request_hash <> v_request_hash then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    if v_quote.funding_quote_id is null then
      raise exception 'BUSINESS_STORE_PROCUREMENT_PAYMENT_RETIRED'
        using errcode = 'P0001';
    end if;
    return private.business_store_funded_quote_public_json_v1(v_quote.id)
      || jsonb_build_object('replayed', true);
  end if;

  select session_row.status
  into v_game_status
  from public.game_sessions as session_row
  where session_row.id = p_game_session_id
  for share;
  if not found then
    raise exception 'GAME_SESSION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_game_status = 'disabled' then
    raise exception 'GAME_SESSION_DISABLED' using errcode = 'P0001';
  end if;
  if v_game_status = 'archived' then
    raise exception 'GAME_SESSION_ARCHIVED' using errcode = 'P0001';
  end if;
  if v_game_status <> 'active' then
    raise exception 'GAME_SESSION_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  if v_item.status <> 'active' or v_item.visibility <> 'visible' then
    raise exception 'STORE_ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  select country_row.*
  into v_country
  from public.country_profiles as country_row
  where country_row.country_code = upper(btrim(v_business.country_code))
    and country_row.status = 'active';
  if not found then
    raise exception 'BUSINESS_COUNTRY_PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if upper(btrim(v_business.currency_code)) !~ '^[A-Z0-9_]{3,16}$' then
    raise exception 'BUSINESS_CURRENCY_MISMATCH' using errcode = 'P0001';
  end if;

  select * into v_pricing
  from public.resolve_store_quote_pricing_v2(
    p_game_session_id,
    v_item.id,
    v_country.id,
    upper(btrim(v_business.currency_code)),
    p_quantity,
    v_now
  );
  if v_pricing.stock_quantity < p_quantity then
    raise exception 'INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;

  select currency_row.decimal_places
  into v_target_minor_unit
  from public.currencies as currency_row
  where currency_row.code = v_pricing.settlement_currency_code
    and currency_row.status = 'active';
  if v_target_minor_unit is null then
    raise exception 'PURCHASE_FUNDING_CURRENCY_INVALID' using errcode = '22023';
  end if;

  v_settlement_unit := round(
    v_pricing.final_unit_price, v_target_minor_unit
  );
  if v_settlement_unit <= 0 then
    raise exception 'PURCHASE_FUNDING_TARGET_ROUNDS_TO_ZERO'
      using errcode = 'P0001';
  end if;
  v_settlement_total := v_settlement_unit * p_quantity;

  if exists (
    select 1
    from jsonb_array_elements(p_allocations) with ordinality
      as allocation(value, ordinal)
    where allocation.ordinal < v_line_count
      and (
        (allocation.value ->> 'targetAmount')::numeric <= 0
        or (allocation.value ->> 'targetAmount')::numeric
          >= 1000000000000000::numeric
        or (allocation.value ->> 'targetAmount')::numeric
          <> round(
            (allocation.value ->> 'targetAmount')::numeric,
            v_target_minor_unit
          )
      )
  ) then
    raise exception 'PURCHASE_FUNDING_TARGET_PRECISION_INVALID'
      using errcode = '22023';
  end if;

  select coalesce(sum(
    (allocation.value ->> 'targetAmount')::numeric
  ), 0)
  into v_fixed_sum
  from jsonb_array_elements(p_allocations) with ordinality
    as allocation(value, ordinal)
  where allocation.ordinal < v_line_count;

  v_remainder := round(
    v_settlement_total - v_fixed_sum,
    v_target_minor_unit
  );
  if v_fixed_sum >= v_settlement_total or v_remainder <= 0 then
    raise exception 'PURCHASE_FUNDING_REMAINDER_INVALID' using errcode = 'P0001';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'sourceAccountKey', allocation.value ->> 'sourceAccountKey',
      'targetAmount', case
        when allocation.ordinal = v_line_count then v_remainder::text
        else ((allocation.value ->> 'targetAmount')::numeric)::text
      end
    ) order by allocation.ordinal
  )
  into v_materialized_allocations
  from jsonb_array_elements(p_allocations) with ordinality
    as allocation(value, ordinal);

  v_target_account_id := private.ensure_active_system_checking_account_v1(
    p_game_session_id,
    'store.seeded-revenue',
    v_pricing.settlement_currency_code
  );
  perform private.ensure_bank_account_projection_v1(
    p_game_session_id, v_target_account_id
  );

  v_context_hash := private.business_store_funding_context_hash_values_v1(
    p_game_session_id,
    v_business.business_id,
    v_quote_public_key,
    v_item.id,
    p_quantity,
    v_pricing.country_snapshot_id,
    v_pricing.snapshot_sequence,
    v_pricing.pricing_version,
    v_pricing.item_currency_code,
    v_pricing.settlement_currency_code,
    v_settlement_unit,
    v_settlement_total,
    v_target_account_id,
    v_materialized_allocations
  );
  if v_context_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'BUSINESS_STORE_FUNDING_BINDING_CONFLICT'
      using errcode = 'P0001';
  end if;

  v_funding := public.create_business_purchase_funding_quote_v1(
    p_game_session_id,
    p_player_id,
    v_pricing.settlement_currency_code,
    v_settlement_total,
    'business.store-procurement',
    v_quote_public_key,
    v_context_hash,
    v_materialized_allocations,
    v_idempotency_key
  );

  select funding_row.*
  into strict v_funding_quote
  from public.purchase_funding_quotes as funding_row
  where funding_row.game_session_id = p_game_session_id
    and funding_row.business_id = v_business.business_id
    and funding_row.public_key = v_funding #>> '{quote,quote_key}';

  if v_funding_quote.funding_context_kind <> 'business.store-procurement'
     or v_funding_quote.funding_context_key <> v_quote_public_key
     or v_funding_quote.funding_context_hash <> v_context_hash
     or v_funding_quote.target_currency_code
       <> v_pricing.settlement_currency_code
     or v_funding_quote.target_amount is distinct from v_settlement_total
     or (
       select jsonb_agg(jsonb_build_object(
         'sourceAccountKey', source_account.public_key,
         'targetAmount', line_row.target_contribution
       ) order by source_account.public_key)
       from public.purchase_funding_quote_lines as line_row
       join public.bank_accounts as source_account
         on source_account.id = line_row.source_account_id
        and source_account.game_session_id = line_row.game_session_id
       where line_row.quote_id = v_funding_quote.id
         and line_row.game_session_id = p_game_session_id
     ) is distinct from (
       select jsonb_agg(jsonb_build_object(
         'sourceAccountKey', allocation.value ->> 'sourceAccountKey',
         'targetAmount', (allocation.value ->> 'targetAmount')::numeric
       ) order by allocation.value ->> 'sourceAccountKey')
       from jsonb_array_elements(v_materialized_allocations)
         as allocation(value)
     )
  then
    raise exception 'BUSINESS_STORE_FUNDING_BINDING_CONFLICT'
      using errcode = 'P0001';
  end if;

  insert into public.business_store_purchase_quotes(
    id,
    public_key,
    game_session_id,
    business_id,
    created_by_player_id,
    store_item_id,
    country_profile_id,
    country_snapshot_id,
    snapshot_sequence,
    quantity,
    item_currency_code,
    settlement_currency_code,
    base_unit_price,
    inflation_multiplier,
    location_multiplier,
    scarcity_multiplier,
    item_local_final_unit_price,
    item_local_final_total_price,
    exchange_rate,
    final_unit_price,
    final_total_price,
    pricing_version,
    idempotency_key,
    request_hash,
    status,
    created_at,
    expires_at,
    funding_quote_id,
    funding_context_hash,
    target_bank_account_id,
    funding_idempotency_key,
    funding_allocations
  ) values (
    v_quote_id,
    v_quote_public_key,
    p_game_session_id,
    v_business.business_id,
    p_player_id,
    v_pricing.store_item_id,
    v_pricing.country_profile_id,
    v_pricing.country_snapshot_id,
    v_pricing.snapshot_sequence,
    p_quantity,
    v_pricing.item_currency_code,
    v_pricing.settlement_currency_code,
    v_pricing.base_unit_price,
    v_pricing.inflation_multiplier,
    v_pricing.location_multiplier,
    v_pricing.scarcity_multiplier,
    v_pricing.item_local_final_unit_price,
    v_pricing.item_local_final_total_price,
    v_pricing.exchange_rate,
    v_settlement_unit,
    v_settlement_total,
    v_pricing.pricing_version,
    v_idempotency_key,
    v_request_hash,
    'CREATED',
    v_now,
    v_pricing.expires_at,
    v_funding_quote.id,
    v_context_hash,
    v_target_account_id,
    v_idempotency_key,
    v_materialized_allocations
  ) returning * into v_quote;

  return private.business_store_funded_quote_public_json_v1(v_quote.id)
    || jsonb_build_object('replayed', false);
end;
$function$;

revoke all on function public.create_business_store_quote_v2(
  uuid, uuid, text, integer, jsonb, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_business_store_quote_v2(
  uuid, uuid, text, integer, jsonb, text, timestamptz
) to service_role;

-- Stable retirement for callers that still attempt the pre-C4 unbound quote.
create or replace function public.create_business_store_quote_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_item_key text,
  p_quantity integer,
  p_idempotency_key text,
  p_effective_at timestamptz default statement_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
begin
  raise exception 'BUSINESS_STORE_PROCUREMENT_PAYMENT_RETIRED'
    using errcode = 'P0001';
end;
$function$;

revoke all on function public.create_business_store_quote_v2(
  uuid, uuid, text, integer, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_business_store_quote_v2(
  uuid, uuid, text, integer, text, timestamptz
) to service_role;

create or replace function private.business_store_procurement_public_json_v1(
  p_purchase_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'business_key', business_row.public_key,
    'receipt_key', purchase_row.public_key,
    'quote_key', quote_row.public_key,
    'item_key', item_row.item_key,
    'item_name', item_row.name,
    'quantity', purchase_row.quantity,
    'final_unit_price', purchase_row.final_unit_price,
    'final_unit_amount', private.currency_amount_text_v1(
      purchase_row.final_unit_price, currency_row.decimal_places
    ),
    'final_total_price', purchase_row.final_total_price,
    'final_total_amount', private.currency_amount_text_v1(
      purchase_row.final_total_price, currency_row.decimal_places
    ),
    'currency_code', purchase_row.currency_code,
    'settlement_minor_unit', currency_row.decimal_places,
    'warehouse_quantity_owned', purchase_row.warehouse_quantity_owned,
    'warehouse_average_unit_cost', purchase_row.warehouse_average_unit_cost,
    'warehouse_average_unit_cost_minor_unit', 4,
    'warehouse_average_unit_cost_amount', private.currency_amount_text_v1(
      purchase_row.warehouse_average_unit_cost, 4
    ),
    'completed_at', purchase_row.completed_at,
    'generated_at', purchase_row.created_at,
    'inventory_transaction_key', inventory_transaction.public_key,
    'funding_quote_key', funding_quote.public_key,
    'funding_receipt_key', funding_receipt.public_key,
    'funding_target_account_key', target_account.public_key,
    'funding_receipt',
      private.purchase_funding_receipt_public_json_v1(funding_receipt.id)
  )
  from public.business_store_purchases as purchase_row
  join public.business_entities as business_row
    on business_row.id = purchase_row.business_id
   and business_row.game_session_id = purchase_row.game_session_id
  join public.business_store_purchase_quotes as quote_row
    on quote_row.id = purchase_row.quote_id
   and quote_row.game_session_id = purchase_row.game_session_id
  join public.store_items as item_row on item_row.id = purchase_row.store_item_id
  join public.currencies as currency_row
    on currency_row.code = purchase_row.currency_code
  join public.inventory_transactions as inventory_transaction
    on inventory_transaction.id = purchase_row.inventory_transaction_id
  join public.purchase_funding_quotes as funding_quote
    on funding_quote.id = quote_row.funding_quote_id
   and funding_quote.game_session_id = purchase_row.game_session_id
  join public.purchase_funding_receipts as funding_receipt
    on funding_receipt.id = purchase_row.funding_receipt_id
   and funding_receipt.game_session_id = purchase_row.game_session_id
  join public.bank_accounts as target_account
    on target_account.id = purchase_row.target_bank_account_id
   and target_account.game_session_id = purchase_row.game_session_id
  where purchase_row.id = p_purchase_id;
$function$;

revoke all on function private.business_store_procurement_public_json_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.purchase_business_store_quote_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_quote_key text,
  p_idempotency_key text,
  p_client_submitted_at timestamptz default null,
  p_request_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, economy_private, extensions, pg_temp
as $function$
declare
  v_now timestamptz := statement_timestamp();
  v_quote_key text := lower(btrim(coalesce(p_quote_key, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_business record;
  v_quote public.business_store_purchase_quotes%rowtype;
  v_purchase public.business_store_purchases%rowtype;
  v_item public.store_items%rowtype;
  v_funding_quote public.purchase_funding_quotes%rowtype;
  v_funding_receipt public.purchase_funding_receipts%rowtype;
  v_target_account public.bank_accounts%rowtype;
  v_inventory_transaction jsonb;
  v_funding jsonb;
  v_warehouse_account_id uuid;
  v_holding public.inventory_holdings%rowtype;
  v_settled_unit_cost numeric(18, 4);
  v_game_status text;
  v_request_hash text;
  v_expected_context_hash text;
begin
  if p_game_session_id is null or p_player_id is null then
    raise exception 'PLAYER_SCOPE_REQUIRED' using errcode = 'P0001';
  end if;
  if v_quote_key !~ '^bsq_[0-9a-f]{32}$' then
    raise exception 'QUOTE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if length(v_idempotency_key) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_request_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'INVALID_REQUEST_METADATA' using errcode = 'P0001';
  end if;

  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':',
      'business-store-purchase-v2', p_game_session_id::text,
      v_business.business_id::text, v_idempotency_key
    ),
    0
  ));

  -- Commercial quote is the first row lock. It permanently distinguishes
  -- legacy unbound quotes from the C4 atomically bound family.
  select quote_row.*
  into v_quote
  from public.business_store_purchase_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.business_id = v_business.business_id
    and quote_row.public_key = v_quote_key
  for update;
  if not found then
    raise exception 'QUOTE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_quote.funding_quote_id is null
     or v_quote.funding_context_hash is null
     or v_quote.target_bank_account_id is null
     or v_quote.funding_idempotency_key is null
     or v_quote.funding_allocations is null
  then
    raise exception 'BUSINESS_STORE_PROCUREMENT_PAYMENT_RETIRED'
      using errcode = 'P0001';
  end if;

  v_request_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'business-store-funded-purchase-v1',
    'gameSessionId', p_game_session_id,
    'businessId', v_business.business_id,
    'playerId', p_player_id,
    'quoteId', v_quote.id,
    'fundingQuoteId', v_quote.funding_quote_id,
    'fundingContextHash', v_quote.funding_context_hash,
    'targetAccountId', v_quote.target_bank_account_id,
    'routeKey', 'players.me.business.store.purchases.v2'
  ));

  select purchase_row.*
  into v_purchase
  from public.business_store_purchases as purchase_row
  where purchase_row.game_session_id = p_game_session_id
    and purchase_row.business_id = v_business.business_id
    and purchase_row.idempotency_key = v_idempotency_key
  for update;
  if found then
    if v_purchase.request_hash <> v_request_hash then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    if v_purchase.status <> 'COMPLETED' then
      raise exception 'IDEMPOTENCY_IN_PROGRESS' using errcode = 'P0001';
    end if;
    return private.business_store_procurement_public_json_v1(v_purchase.id)
      || jsonb_build_object('already_completed', true);
  end if;

  select session_row.status
  into v_game_status
  from public.game_sessions as session_row
  where session_row.id = p_game_session_id
  for share;
  if not found then
    raise exception 'GAME_SESSION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_game_status = 'disabled' then
    raise exception 'GAME_SESSION_DISABLED' using errcode = 'P0001';
  end if;
  if v_game_status = 'archived' then
    raise exception 'GAME_SESSION_ARCHIVED' using errcode = 'P0001';
  end if;
  if v_game_status <> 'active' then
    raise exception 'GAME_SESSION_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  if v_quote.status <> 'CREATED' then
    raise exception 'QUOTE_NOT_USABLE' using errcode = 'P0001';
  end if;
  if v_quote.expires_at <= v_now then
    raise exception 'QUOTE_EXPIRED' using errcode = 'P0001';
  end if;
  if v_quote.settlement_currency_code <> upper(btrim(v_business.currency_code)) then
    raise exception 'BUSINESS_CURRENCY_MISMATCH' using errcode = 'P0001';
  end if;

  v_expected_context_hash := private.business_store_funding_context_hash_v1(
    v_quote.id, v_quote.target_bank_account_id
  );
  if v_expected_context_hash is distinct from v_quote.funding_context_hash then
    raise exception 'BUSINESS_STORE_FUNDING_BINDING_CONFLICT'
      using errcode = 'P0001';
  end if;

  select funding_row.*
  into v_funding_quote
  from public.purchase_funding_quotes as funding_row
  where funding_row.id = v_quote.funding_quote_id
    and funding_row.game_session_id = p_game_session_id
    and funding_row.business_id = v_business.business_id
    and funding_row.player_id is null
  for share;
  if not found
     or v_funding_quote.funding_context_kind <> 'business.store-procurement'
     or v_funding_quote.funding_context_key <> v_quote.public_key
     or v_funding_quote.funding_context_hash <> v_quote.funding_context_hash
     or v_funding_quote.target_currency_code <> v_quote.settlement_currency_code
     or v_funding_quote.target_amount is distinct from v_quote.final_total_price
  then
    raise exception 'BUSINESS_STORE_FUNDING_BINDING_CONFLICT'
      using errcode = 'P0001';
  end if;

  if (
    select jsonb_agg(jsonb_build_object(
      'sourceAccountKey', source_account.public_key,
      'targetAmount', line_row.target_contribution
    ) order by source_account.public_key)
    from public.purchase_funding_quote_lines as line_row
    join public.bank_accounts as source_account
      on source_account.id = line_row.source_account_id
     and source_account.game_session_id = line_row.game_session_id
    where line_row.quote_id = v_funding_quote.id
      and line_row.game_session_id = p_game_session_id
  ) is distinct from (
    select jsonb_agg(jsonb_build_object(
      'sourceAccountKey', allocation.value ->> 'sourceAccountKey',
      'targetAmount', (allocation.value ->> 'targetAmount')::numeric
    ) order by allocation.value ->> 'sourceAccountKey')
    from jsonb_array_elements(v_quote.funding_allocations)
      as allocation(value)
  ) then
    raise exception 'BUSINESS_STORE_FUNDING_BINDING_CONFLICT'
      using errcode = 'P0001';
  end if;

  -- Store item is second in the canonical domain lock order.
  select item_row.*
  into v_item
  from public.store_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.id = v_quote.store_item_id
  for update;
  if not found
     or v_item.status <> 'active'
     or v_item.visibility <> 'visible'
  then
    raise exception 'STORE_ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_item.game_item_id is null or v_item.inventory_account_id is null then
    raise exception 'ITEM_CANONICAL_CONTEXT_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_item.stock_quantity < v_quote.quantity then
    raise exception 'INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;

  v_settled_unit_cost := round(
    v_quote.final_total_price / v_quote.quantity,
    4
  );

  -- Warehouse holding is third. C0 then takes the banking monetary advisory
  -- and locks every account projection in UUID order.
  v_warehouse_account_id := economy_private.ensure_business_inventory_account_v2(
    p_game_session_id,
    v_business.business_id,
    'warehouse'
  );
  insert into public.inventory_holdings(
    game_session_id,
    inventory_account_id,
    game_item_id,
    quantity_owned,
    quantity_reserved,
    average_unit_cost,
    cost_currency_code,
    version
  ) values (
    p_game_session_id,
    v_warehouse_account_id,
    v_item.game_item_id,
    0,
    0,
    0,
    v_quote.settlement_currency_code,
    1
  )
  on conflict on constraint inventory_holdings_account_item_unique do nothing;

  select holding_row.*
  into v_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_warehouse_account_id
    and holding_row.game_item_id = v_item.game_item_id
  for update;
  if not found then
    raise exception 'INVENTORY_POSTING_RESULT_MISSING' using errcode = 'P0001';
  end if;
  if v_holding.quantity_owned > 0
     and v_holding.cost_currency_code
       is distinct from v_quote.settlement_currency_code
  then
    raise exception 'BUSINESS_STOCKROOM_COST_CURRENCY_MISMATCH'
      using errcode = 'P0001';
  end if;
  if v_holding.quantity_owned = 0
     and (
       v_holding.cost_currency_code
         is distinct from v_quote.settlement_currency_code
       or v_holding.average_unit_cost <> 0
     )
  then
    update public.inventory_holdings
    set average_unit_cost = 0,
        cost_currency_code = v_quote.settlement_currency_code,
        version = version + 1,
        updated_at = v_now
    where id = v_holding.id
    returning * into v_holding;
  end if;

  -- Resolve the target only after Store and Warehouse locks. The shared C0
  -- composer then revalidates and locks this and every source account in its
  -- canonical UUID order.
  select account_row.*
  into v_target_account
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where account_row.id = v_quote.target_bank_account_id
    and account_row.game_session_id = p_game_session_id
    and account_row.account_kind = 'checking'
    and account_row.legacy_account_type is null
    and account_row.currency_code = v_quote.settlement_currency_code
    and account_row.status = 'active'
    and party_row.party_kind = 'system'
    and party_row.system_key = 'store.seeded-revenue'
    and party_row.status = 'active';
  if not found then
    raise exception 'PURCHASE_FUNDING_TARGET_ACCOUNT_INVALID'
      using errcode = 'P0001';
  end if;

  insert into public.business_store_purchases(
    game_session_id,
    business_id,
    purchased_by_player_id,
    quote_id,
    store_item_id,
    quantity,
    currency_code,
    final_unit_price,
    final_total_price,
    idempotency_key,
    request_hash,
    request_metadata,
    status,
    client_submitted_at
  ) values (
    p_game_session_id,
    v_business.business_id,
    p_player_id,
    v_quote.id,
    v_quote.store_item_id,
    v_quote.quantity,
    v_quote.settlement_currency_code,
    v_quote.final_unit_price,
    v_quote.final_total_price,
    v_idempotency_key,
    v_request_hash,
    coalesce(p_request_metadata, '{}'::jsonb),
    'STARTED',
    p_client_submitted_at
  ) returning * into v_purchase;

  v_funding := private.compose_business_purchase_funding_v1(
    p_game_session_id,
    p_player_id,
    v_business.business_id,
    v_funding_quote.public_key,
    'business.store-procurement',
    v_quote.public_key,
    v_quote.funding_context_hash,
    v_target_account.id,
    'business',
    'store-procurement',
    v_purchase.id,
    v_idempotency_key,
    v_now
  );

  select receipt_row.*
  into v_funding_receipt
  from public.purchase_funding_receipts as receipt_row
  where receipt_row.game_session_id = p_game_session_id
    and receipt_row.business_id = v_business.business_id
    and receipt_row.player_id is null
    and receipt_row.public_key = v_funding #>> '{receipt,receipt_key}';
  if not found
     or v_funding_receipt.quote_id <> v_funding_quote.id
     or v_funding_receipt.target_account_id <> v_target_account.id
     or v_funding_receipt.funding_context_kind <> 'business.store-procurement'
     or v_funding_receipt.funding_context_key <> v_quote.public_key
     or v_funding_receipt.funding_context_hash <> v_quote.funding_context_hash
     or v_funding_receipt.target_currency_code
       <> v_quote.settlement_currency_code
     or v_funding_receipt.target_amount is distinct from v_quote.final_total_price
     or v_funding_receipt.source_domain <> 'business'
     or v_funding_receipt.source_action <> 'store-procurement'
     or v_funding_receipt.source_id is distinct from v_purchase.id
  then
    raise exception 'BUSINESS_STORE_FUNDING_RECEIPT_CONFLICT'
      using errcode = 'P0001';
  end if;

  v_inventory_transaction := economy_private.post_inventory_transaction_v2(
    p_game_session_id,
    'purchase',
    'business',
    'store_procurement_purchase',
    v_purchase.id,
    concat('business-store-funded:', v_idempotency_key),
    jsonb_build_object(
      'businessKey', v_business.business_key,
      'quoteKey', v_quote.public_key,
      'receiptKey', v_purchase.public_key,
      'storeItemKey', v_item.item_key,
      'pricingVersion', v_quote.pricing_version,
      'fundingQuoteKey', v_funding_quote.public_key,
      'fundingReceiptKey', v_funding_receipt.public_key,
      'bankTransactionKey', v_funding #>> '{receipt,bank_transaction_key}'
    ),
    jsonb_build_array(
      jsonb_build_object(
        'inventoryAccountId', v_item.inventory_account_id,
        'gameItemId', v_item.game_item_id,
        'storeItemId', v_item.id,
        'quantityDelta', -v_quote.quantity,
        'reservationDelta', 0,
        'unitCost', v_item.price,
        'currencyCode', v_item.currency_code,
        'metadata', jsonb_build_object('side', 'store_stock')
      ),
      jsonb_build_object(
        'inventoryAccountId', v_warehouse_account_id,
        'gameItemId', v_item.game_item_id,
        'quantityDelta', v_quote.quantity,
        'reservationDelta', 0,
        'unitCost', v_settled_unit_cost,
        'currencyCode', v_quote.settlement_currency_code,
        'metadata', jsonb_build_object(
          'side', 'business_warehouse',
          'businessKey', v_business.business_key,
          'settledAcquisitionPrice', v_settled_unit_cost,
          'settledTotalPrice', v_quote.final_total_price,
          'fundingReceiptKey', v_funding_receipt.public_key
        )
      )
    )
  );

  update public.store_items
  set stock_quantity = stock_quantity - v_quote.quantity
  where id = v_item.id
    and game_session_id = p_game_session_id
    and stock_quantity >= v_quote.quantity;
  if not found then
    raise exception 'INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;

  select holding_row.*
  into v_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_warehouse_account_id
    and holding_row.game_item_id = v_item.game_item_id;
  if not found then
    raise exception 'INVENTORY_POSTING_RESULT_MISSING' using errcode = 'P0001';
  end if;

  update public.business_store_purchase_quotes
  set status = 'USED', used_at = v_now
  where id = v_quote.id;

  update public.business_store_purchases
  set funding_receipt_id = v_funding_receipt.id,
      bank_transaction_id = v_funding_receipt.bank_transaction_id,
      target_bank_account_id = v_target_account.id,
      inventory_transaction_id = (
        v_inventory_transaction ->> 'transactionId'
      )::uuid,
      warehouse_quantity_owned = v_holding.quantity_owned,
      warehouse_average_unit_cost = v_holding.average_unit_cost,
      status = 'COMPLETED',
      completed_at = v_now
  where id = v_purchase.id
  returning * into v_purchase;

  insert into public.business_activity_events(
    game_session_id,
    business_id,
    formation_id,
    actor_type,
    actor_player_id,
    event_type,
    source_id,
    reason_code,
    metadata,
    occurred_at
  ) values (
    p_game_session_id,
    v_business.business_id,
    null,
    'player',
    p_player_id,
    'business.store.procurement.completed',
    v_purchase.id,
    'store_procurement_purchase',
    jsonb_build_object(
      'businessKey', v_business.business_key,
      'receiptKey', v_purchase.public_key,
      'quoteKey', v_quote.public_key,
      'storeItemKey', v_item.item_key,
      'quantity', v_purchase.quantity,
      'settledUnitCost', v_settled_unit_cost,
      'finalTotalPrice', v_purchase.final_total_price,
      'currencyCode', v_purchase.currency_code,
      'inventoryTransactionKey',
        v_inventory_transaction ->> 'transactionKey',
      'fundingQuoteKey', v_funding_quote.public_key,
      'fundingReceiptKey', v_funding_receipt.public_key,
      'bankTransactionKey', v_funding #>> '{receipt,bank_transaction_key}'
    ),
    v_now
  );

  return private.business_store_procurement_public_json_v1(v_purchase.id)
    || jsonb_build_object('already_completed', false);
end;
$function$;

comment on function public.create_business_store_quote_v2(
  uuid, uuid, text, integer, jsonb, text, timestamptz
) is
  'Creates one Store commercial quote already bound to immutable Business C0 funding evidence. The final allocation line is the server-derived exact remainder.';
comment on function public.purchase_business_store_quote_v2(
  uuid, uuid, text, text, timestamptz, jsonb
) is
  'Atomically settles Business C0 funding to the Store account and posts canonical Store stock into Warehouse without a legacy Business balance write.';

revoke all on function public.purchase_business_store_quote_v2(
  uuid, uuid, text, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.purchase_business_store_quote_v2(
  uuid, uuid, text, text, timestamptz, jsonb
) to service_role;

commit;
