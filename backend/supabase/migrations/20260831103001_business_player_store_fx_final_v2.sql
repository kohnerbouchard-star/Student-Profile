-- Econovaria Business V2 Phase 10A.4D: final Player Store / FX convergence.
--
-- This forward repair admits ordered Store funding intent whose final
-- contribution is derived after the authoritative Store bill and minor unit
-- are known. It also binds the existing seeded/NPC Store purchase evidence to
-- the seller-offer identity selected by the Player. Historical unbound rows,
-- all-positive callers, and hashes remain unchanged.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '240s';

create or replace function private.store_funding_normalize_allocation_intent_v2(
  p_allocations jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $function$
declare
  v_count integer;
  v_result jsonb;
begin
  if jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'STORE_FUNDING_ALLOCATIONS_INVALID' using errcode = '22023';
  end if;
  if jsonb_array_length(p_allocations) not between 1 and 3 then
    raise exception 'STORE_FUNDING_ALLOCATIONS_INVALID' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_allocations);
  if exists (
    select 1
    from jsonb_array_elements(p_allocations) with ordinality
      as allocation(value, ordinal)
    where jsonb_typeof(allocation.value) <> 'object'
       or not (allocation.value ? 'sourceAccountKey')
       or not (allocation.value ? 'targetAmount')
       or (select count(*) from jsonb_object_keys(allocation.value)) <> 2
       or coalesce(allocation.value ->> 'sourceAccountKey', '')
         !~ '^bac_[0-9a-f]{32}$'
       or (
         allocation.ordinal < v_count
         and case
           when jsonb_typeof(allocation.value -> 'targetAmount') = 'string'
             and coalesce(allocation.value ->> 'targetAmount', '')
               ~ '^(0|[1-9][0-9]{0,19})([.][0-9]{1,18})?$'
           then (allocation.value ->> 'targetAmount')::numeric <= 0
           else true
         end
       )
       or (
         allocation.ordinal = v_count
         and jsonb_typeof(allocation.value -> 'targetAmount')
           is distinct from 'null'
       )
  ) then
    raise exception 'STORE_FUNDING_ALLOCATIONS_INVALID' using errcode = '22023';
  end if;

  if (
    select count(distinct allocation.value ->> 'sourceAccountKey')
    from jsonb_array_elements(p_allocations) as allocation(value)
  ) <> v_count then
    raise exception 'STORE_FUNDING_DUPLICATE_ACCOUNT' using errcode = '22023';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'sourceAccountKey', allocation.value ->> 'sourceAccountKey',
      'targetAmount', case
        when allocation.ordinal = v_count then null::text
        else ((allocation.value ->> 'targetAmount')::numeric)::text
      end
    )
    order by allocation.ordinal
  )
  into v_result
  from jsonb_array_elements(p_allocations) with ordinality
    as allocation(value, ordinal);

  return v_result;
end;
$function$;

revoke all on function private.store_funding_normalize_allocation_intent_v2(
  jsonb
) from public, anon, authenticated, service_role;

create or replace function private.store_funding_materialize_allocation_intent_v2(
  p_allocation_intent jsonb,
  p_target_amount numeric,
  p_target_minor_unit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $function$
declare
  v_intent jsonb;
  v_count integer;
  v_fixed_sum numeric(38, 18) := 0;
  v_remainder numeric(38, 18);
  v_result jsonb;
begin
  if p_target_amount is null
     or p_target_amount <= 0
     or p_target_amount >= 1000000000000000::numeric
     or p_target_minor_unit is null
     or p_target_minor_unit not between 0 and 18
     or p_target_amount <> round(p_target_amount, p_target_minor_unit)
  then
    raise exception 'STORE_FUNDING_TARGET_PRECISION_INVALID'
      using errcode = '22023';
  end if;

  v_intent := private.store_funding_normalize_allocation_intent_v2(
    p_allocation_intent
  );
  v_count := jsonb_array_length(v_intent);

  if exists (
    select 1
    from jsonb_array_elements(v_intent) with ordinality
      as allocation(value, ordinal)
    where allocation.ordinal < v_count
      and (
        (allocation.value ->> 'targetAmount')::numeric <= 0
        or (allocation.value ->> 'targetAmount')::numeric
          >= 1000000000000000::numeric
        or (allocation.value ->> 'targetAmount')::numeric
          <> round(
            (allocation.value ->> 'targetAmount')::numeric,
            p_target_minor_unit
          )
      )
  ) then
    raise exception 'STORE_FUNDING_TARGET_PRECISION_INVALID'
      using errcode = '22023';
  end if;

  select coalesce(sum(
    (allocation.value ->> 'targetAmount')::numeric
  ), 0)
  into v_fixed_sum
  from jsonb_array_elements(v_intent) with ordinality
    as allocation(value, ordinal)
  where allocation.ordinal < v_count;

  v_remainder := round(p_target_amount - v_fixed_sum, p_target_minor_unit);
  if v_fixed_sum >= p_target_amount
     or v_remainder <= 0
     or v_fixed_sum + v_remainder <> p_target_amount
  then
    raise exception 'STORE_FUNDING_REMAINDER_INVALID' using errcode = 'P0001';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'sourceAccountKey', allocation.value ->> 'sourceAccountKey',
      'targetAmount', private.currency_amount_text_v1(
        case
          when allocation.ordinal = v_count then v_remainder
          else (allocation.value ->> 'targetAmount')::numeric
        end,
        p_target_minor_unit
      )
    )
    order by allocation.ordinal
  )
  into v_result
  from jsonb_array_elements(v_intent) with ordinality
    as allocation(value, ordinal);

  return v_result;
end;
$function$;

revoke all on function private.store_funding_materialize_allocation_intent_v2(
  jsonb, numeric, integer
) from public, anon, authenticated, service_role;

-- The canonical Inventory poster originally admitted store_stock only for the
-- seeded Store party, while the retained seller-offer guard explicitly admits
-- country/system NPC sellers with their own store_stock custody. Narrowly
-- reconcile those two predecessor invariants for this exact Store action. An
-- alternate stock account is accepted only when an active NPC offer binds the
-- same game, Store item, game item, seller party, and custody account.
do $migration$
declare
  v_oid oid := pg_catalog.to_regprocedure(
    'economy_private.post_inventory_transaction_v2(uuid,text,text,text,uuid,text,jsonb,jsonb)'
  );
  v_definition text;
  v_old text;
  v_new text;
  v_actual integer;
begin
  if v_oid is null then
    raise exception 'D_STORE_SYSTEM_OFFER_INVENTORY_POSTER_MISSING'
      using errcode = 'P0001';
  end if;
  v_definition := pg_catalog.pg_get_functiondef(v_oid);

  v_old := E'      or (v_account.account_kind = ''store_stock'' and v_party.party_kind not in (''store'',''business''))';
  v_new := E'      or (\n        v_account.account_kind = ''store_stock''\n        and not (\n          v_party.party_kind in (''store'', ''business'')\n          or (\n            btrim(p_source_domain) = ''store''\n            and btrim(p_source_action) = ''system_offer_funded_purchase''\n            and v_party.party_kind in (''country'', ''system'')\n          )\n        )\n      )';
  v_actual := (
    length(v_definition) - length(replace(v_definition, v_old, ''))
  ) / length(v_old);
  if v_actual <> 1 then
    raise exception 'D_STORE_SYSTEM_OFFER_INVENTORY_PARTY_REWRITE_COUNT:%',
      v_actual using errcode = 'P0001';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := E'    elsif v_store_item_id is not null then';
  v_new := E'    elsif v_account.account_kind = ''store_stock''\n      and v_party.party_kind in (''country'', ''system'')\n    then\n      if btrim(p_source_domain) <> ''store''\n        or btrim(p_source_action) <> ''system_offer_funded_purchase''\n        or v_store_item_id is null\n      then\n        raise exception ''INVENTORY_TRANSACTION_NPC_STORE_PROVENANCE_INVALID:%'', v_line_number using errcode = ''P0001'';\n      end if;\n\n      select offer_row.*\n      into v_store_offer\n      from public.store_seller_offers as offer_row\n      where offer_row.game_session_id = p_game_session_id\n        and offer_row.store_item_id = v_store_item_id\n        and offer_row.game_item_id = v_game_item_id\n        and offer_row.seller_party_id = v_party.id\n        and offer_row.inventory_account_id = v_account_id\n        and offer_row.seller_kind = ''npc''\n        and offer_row.status = ''active''\n      for share;\n      if not found then\n        raise exception ''INVENTORY_TRANSACTION_NPC_STORE_SCOPE_MISMATCH:%'', v_line_number using errcode = ''P0001'';\n      end if;\n    elsif v_store_item_id is not null then';
  v_actual := (
    length(v_definition) - length(replace(v_definition, v_old, ''))
  ) / length(v_old);
  if v_actual <> 1 then
    raise exception 'D_STORE_SYSTEM_OFFER_INVENTORY_SCOPE_REWRITE_COUNT:%',
      v_actual using errcode = 'P0001';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;

-- The retained seeded/NPC quote and receipt tables remain the sole commercial
-- evidence authority. These nullable bindings preserve every historical row
-- while making new Player-facing system-seller quotes offer-aware.
alter table public.store_purchase_quotes
  add column seller_offer_id uuid null,
  add column seller_offer_version bigint null,
  add column available_quantity_at_quote bigint null;

alter table public.store_purchase_quotes
  add constraint store_purchase_quotes_seller_offer_scope_fk
    foreign key (game_session_id, seller_offer_id)
    references public.store_seller_offers(game_session_id, id)
    on delete restrict,
  add constraint store_purchase_quotes_seller_offer_binding_check
    check (
      (
        seller_offer_id is null
        and seller_offer_version is null
        and available_quantity_at_quote is null
      )
      or (
        seller_offer_id is not null
        and seller_offer_version is not null
        and available_quantity_at_quote is not null
        and seller_offer_version > 0
        and available_quantity_at_quote >= quantity
      )
    );

create index store_purchase_quotes_seller_offer_created_idx
  on public.store_purchase_quotes(
    game_session_id, seller_offer_id, created_at desc
  )
  where seller_offer_id is not null;

alter table public.store_purchases
  add column seller_offer_version_after bigint null,
  add column remaining_seller_quantity bigint null;

alter table public.store_purchases
  add constraint store_purchases_seller_offer_result_check
    check (
      (seller_offer_version_after is null and remaining_seller_quantity is null)
      or (
        seller_offer_version_after is not null
        and remaining_seller_quantity is not null
        and seller_offer_version_after > 0
        and remaining_seller_quantity >= 0
      )
    );

create or replace function private.guard_store_purchase_offer_binding_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_offer public.store_seller_offers%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.seller_offer_id is distinct from old.seller_offer_id
       or new.seller_offer_version is distinct from old.seller_offer_version
       or new.available_quantity_at_quote is distinct from old.available_quantity_at_quote
    then
      raise exception 'STORE_PURCHASE_QUOTE_OFFER_BINDING_IMMUTABLE'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.seller_offer_id is null then
    return new;
  end if;

  select offer_row.*
  into v_offer
  from public.store_seller_offers as offer_row
  where offer_row.game_session_id = new.game_session_id
    and offer_row.id = new.seller_offer_id;
  if not found
     or new.seller_offer_version is null
     or new.available_quantity_at_quote is null
     or v_offer.seller_kind not in ('seeded', 'npc')
     or v_offer.store_item_id <> new.store_item_id
     or v_offer.version <> new.seller_offer_version
     or new.available_quantity_at_quote < new.quantity
  then
    raise exception 'STORE_PURCHASE_QUOTE_OFFER_BINDING_INVALID'
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_store_purchase_offer_binding_v2()
  from public, anon, authenticated, service_role;

create trigger guard_store_purchase_offer_binding_v2
before insert or update on public.store_purchase_quotes
for each row execute function private.guard_store_purchase_offer_binding_v2();

create or replace function private.guard_store_purchase_offer_result_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_quote public.store_purchase_quotes%rowtype;
  v_offer public.store_seller_offers%rowtype;
begin
  if tg_op = 'UPDATE'
     and old.status = 'COMPLETED'
     and (
       new.seller_offer_version_after is distinct from old.seller_offer_version_after
       or new.remaining_seller_quantity is distinct from old.remaining_seller_quantity
     )
  then
    raise exception 'STORE_PURCHASE_OFFER_RESULT_IMMUTABLE'
      using errcode = '42501';
  end if;

  if new.status <> 'COMPLETED' then
    return new;
  end if;

  select quote_row.*
  into v_quote
  from public.store_purchase_quotes as quote_row
  where quote_row.game_session_id = new.game_session_id
    and quote_row.id = new.quote_id;
  if not found then
    raise exception 'STORE_PURCHASE_OFFER_QUOTE_MISSING'
      using errcode = 'P0001';
  end if;

  if v_quote.seller_offer_id is null then
    if new.seller_offer_version_after is not null
       or new.remaining_seller_quantity is not null
    then
      raise exception 'STORE_PURCHASE_LEGACY_OFFER_RESULT_INVALID'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  select offer_row.*
  into v_offer
  from public.store_seller_offers as offer_row
  where offer_row.game_session_id = new.game_session_id
    and offer_row.id = v_quote.seller_offer_id;
  if not found
     or new.remaining_seller_quantity is null
     or new.seller_offer_version_after is null
     or (
       v_offer.seller_kind = 'seeded'
       and new.seller_offer_version_after <> v_quote.seller_offer_version
     )
     or (
       v_offer.seller_kind = 'npc'
       and new.seller_offer_version_after <> v_quote.seller_offer_version + 1
     )
  then
    raise exception 'STORE_PURCHASE_OFFER_RESULT_INVALID'
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_store_purchase_offer_result_v2()
  from public, anon, authenticated, service_role;

create trigger guard_store_purchase_offer_result_v2
before insert or update on public.store_purchases
for each row execute function private.guard_store_purchase_offer_result_v2();

-- Keep the inherited v1 signatures. Only the final-null request family takes
-- the new branch; the all-positive normalizer and request hash remain exact.
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
        'public.create_seeded_store_funding_quote_v1(uuid,uuid,text,integer,jsonb,text,timestamp with time zone)'::text,
        E'  v_allocations jsonb;\n  v_request_hash text;',
        E'  v_allocations jsonb;\n  v_allocation_intent jsonb;\n  v_uses_server_remainder boolean := false;\n  v_request_hash text;',
        1::integer
      ),
      (
        'public.create_business_store_offer_funding_quote_v1(uuid,uuid,text,integer,bigint,jsonb,text)',
        E'  v_allocations jsonb;\n  v_request_hash text;',
        E'  v_allocations jsonb;\n  v_allocation_intent jsonb;\n  v_uses_server_remainder boolean := false;\n  v_request_hash text;',
        1
      ),
      (
        'public.create_seeded_store_funding_quote_v1(uuid,uuid,text,integer,jsonb,text,timestamp with time zone)',
        E'  v_allocations := private.store_funding_normalize_allocations_v1(p_allocations);\n  v_request_hash := private.fx_digest_jsonb_v1(jsonb_build_object(\n    ''version'', ''seeded-store-funding-quote-v1'',\n    ''gameSessionId'', p_game_session_id,\n    ''playerId'', p_player_id,\n    ''itemKey'', v_item_key,\n    ''quantity'', p_quantity,\n    ''allocations'', v_allocations\n  ));',
        E'  if jsonb_typeof(p_allocations) = ''array''\n     and jsonb_array_length(p_allocations) between 1 and 3\n     and jsonb_typeof(\n       p_allocations -> (jsonb_array_length(p_allocations) - 1) -> ''targetAmount''\n     ) = ''null''\n  then\n    v_uses_server_remainder := true;\n    v_allocation_intent :=\n      private.store_funding_normalize_allocation_intent_v2(p_allocations);\n    v_request_hash := private.fx_digest_jsonb_v1(jsonb_build_object(\n      ''version'', ''seeded-store-funding-quote-v2'',\n      ''gameSessionId'', p_game_session_id,\n      ''playerId'', p_player_id,\n      ''itemKey'', v_item_key,\n      ''quantity'', p_quantity,\n      ''allocationIntent'', v_allocation_intent\n    ));\n  else\n    v_allocations := private.store_funding_normalize_allocations_v1(p_allocations);\n    v_request_hash := private.fx_digest_jsonb_v1(jsonb_build_object(\n      ''version'', ''seeded-store-funding-quote-v1'',\n      ''gameSessionId'', p_game_session_id,\n      ''playerId'', p_player_id,\n      ''itemKey'', v_item_key,\n      ''quantity'', p_quantity,\n      ''allocations'', v_allocations\n    ));\n  end if;',
        1
      ),
      (
        'public.create_seeded_store_funding_quote_v1(uuid,uuid,text,integer,jsonb,text,timestamp with time zone)',
        E'  if v_bill_unit_price <= 0 or v_bill_total_price <= 0 then\n    raise exception ''STORE_FUNDED_QUOTE_MINOR_UNIT_NORMALIZATION_INVALID''\n      using errcode = ''P0001'';\n  end if;\n\n  v_store_pricing_version := concat(',
        E'  if v_bill_unit_price <= 0 or v_bill_total_price <= 0 then\n    raise exception ''STORE_FUNDED_QUOTE_MINOR_UNIT_NORMALIZATION_INVALID''\n      using errcode = ''P0001'';\n  end if;\n\n  if v_uses_server_remainder then\n    v_allocations := private.store_funding_materialize_allocation_intent_v2(\n      v_allocation_intent, v_bill_total_price, v_target_decimals\n    );\n  end if;\n\n  v_store_pricing_version := concat(',
        1
      ),
      (
        'public.create_business_store_offer_funding_quote_v1(uuid,uuid,text,integer,bigint,jsonb,text)',
        E'  v_allocations := private.store_funding_normalize_allocations_v1(p_allocations);\n  v_request_hash := private.fx_digest_jsonb_v1(jsonb_build_object(\n    ''version'', ''business-store-offer-funding-quote-v1'',\n    ''gameSessionId'', p_game_session_id,\n    ''buyerPlayerId'', p_buyer_player_id,\n    ''offerKey'', v_offer_key,\n    ''quantity'', p_quantity,\n    ''expectedOfferVersion'', p_expected_offer_version,\n    ''allocations'', v_allocations\n  ));',
        E'  if jsonb_typeof(p_allocations) = ''array''\n     and jsonb_array_length(p_allocations) between 1 and 3\n     and jsonb_typeof(\n       p_allocations -> (jsonb_array_length(p_allocations) - 1) -> ''targetAmount''\n     ) = ''null''\n  then\n    v_uses_server_remainder := true;\n    v_allocation_intent :=\n      private.store_funding_normalize_allocation_intent_v2(p_allocations);\n    v_request_hash := private.fx_digest_jsonb_v1(jsonb_build_object(\n      ''version'', ''business-store-offer-funding-quote-v2'',\n      ''gameSessionId'', p_game_session_id,\n      ''buyerPlayerId'', p_buyer_player_id,\n      ''offerKey'', v_offer_key,\n      ''quantity'', p_quantity,\n      ''expectedOfferVersion'', p_expected_offer_version,\n      ''allocationIntent'', v_allocation_intent\n    ));\n  else\n    v_allocations := private.store_funding_normalize_allocations_v1(p_allocations);\n    v_request_hash := private.fx_digest_jsonb_v1(jsonb_build_object(\n      ''version'', ''business-store-offer-funding-quote-v1'',\n      ''gameSessionId'', p_game_session_id,\n      ''buyerPlayerId'', p_buyer_player_id,\n      ''offerKey'', v_offer_key,\n      ''quantity'', p_quantity,\n      ''expectedOfferVersion'', p_expected_offer_version,\n      ''allocations'', v_allocations\n    ));\n  end if;',
        1
      ),
      (
        'public.create_business_store_offer_funding_quote_v1(uuid,uuid,text,integer,bigint,jsonb,text)',
        E'  if v_total_price <= 0\n     or v_total_price <> round(v_total_price, 2)\n  then\n    raise exception ''STORE_OFFER_FUNDED_QUOTE_MONEY_INVALID'' using errcode = ''P0001'';\n  end if;\n\n  v_target_account_id := private.ensure_business_bank_account_identity_v1(',
        E'  if v_total_price <= 0\n     or v_total_price <> round(v_total_price, 2)\n  then\n    raise exception ''STORE_OFFER_FUNDED_QUOTE_MONEY_INVALID'' using errcode = ''P0001'';\n  end if;\n\n  if v_uses_server_remainder then\n    v_allocations := private.store_funding_materialize_allocation_intent_v2(\n      v_allocation_intent, v_total_price, v_target_decimals\n    );\n  end if;\n\n  v_target_account_id := private.ensure_business_bank_account_identity_v1(',
        1
      ),
      (
        'public.create_business_store_offer_funding_quote_v1(uuid,uuid,text,integer,bigint,jsonb,text)',
        E'  v_funding_idempotency_key := ''business-store-funding:'' || substr(v_request_hash, 1, 64);',
        E'  v_funding_idempotency_key := ''business-store-funding:'' || substr(\n    private.bank_digest_text_v1(concat_ws(\n      ''|'',\n      ''business-store-funding-v2'',\n      p_game_session_id::text,\n      p_buyer_player_id::text,\n      v_store_quote_key,\n      v_request_hash\n    )),\n    1,\n    64\n  );',
        1
      )
    ) as replacements(function_signature, old_text, new_text, expected_count)
  loop
    v_oid := pg_catalog.to_regprocedure(v_target.function_signature);
    if v_oid is null then
      raise exception 'D_STORE_FUNDING_FUNCTION_MISSING:%',
        v_target.function_signature using errcode = 'P0001';
    end if;
    v_definition := pg_catalog.pg_get_functiondef(v_oid);
    v_actual := (
      length(v_definition) - length(replace(
        v_definition, v_target.old_text, ''
      ))
    ) / length(v_target.old_text);
    if v_actual <> v_target.expected_count then
      raise exception 'D_STORE_FUNDING_REWRITE_COUNT:%:%:%',
        v_target.function_signature, v_actual, v_target.expected_count
        using errcode = 'P0001';
    end if;
    execute replace(v_definition, v_target.old_text, v_target.new_text);
  end loop;
end;
$migration$;

-- Offer-aware seeded/NPC quote adapter. Store still owns the bill, pricing,
-- stock, quote, and receipt; C0 still owns all source-account funding and FX.
create or replace function public.create_system_store_offer_funding_quote_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_offer_key text,
  p_quantity integer,
  p_expected_offer_version bigint,
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
  v_offer_key text := lower(btrim(coalesce(p_offer_key, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_effective_at timestamptz := coalesce(p_effective_at, statement_timestamp());
  v_allocation_intent jsonb;
  v_allocations jsonb;
  v_request_hash text;
  v_existing public.store_purchase_quotes%rowtype;
  v_game_status text;
  v_player public.players%rowtype;
  v_assignment public.player_country_assignments%rowtype;
  v_country public.country_profiles%rowtype;
  v_offer public.store_seller_offers%rowtype;
  v_seller_party public.economic_parties%rowtype;
  v_item public.store_items%rowtype;
  v_game_item public.game_items%rowtype;
  v_stock_account public.inventory_accounts%rowtype;
  v_stock_holding public.inventory_holdings%rowtype;
  v_pricing record;
  v_available bigint;
  v_target_decimals integer;
  v_policy_unit_price numeric(18, 4);
  v_bill_unit_price numeric(14, 2);
  v_bill_total_price numeric(14, 2);
  v_store_pricing_version text;
  v_store_quote_id uuid := extensions.gen_random_uuid();
  v_store_quote_key text;
  v_target_account_id uuid;
  v_target_account_key text;
  v_context_hash text;
  v_funding_idempotency_key text;
  v_funding_result jsonb;
  v_funding_quote_key text;
  v_funding_quote public.purchase_funding_quotes%rowtype;
  v_expires_at timestamptz;
begin
  if p_game_session_id is null
     or p_player_id is null
     or v_offer_key !~ '^sof_[0-9a-f]{32}$'
     or p_quantity is null
     or p_quantity not between 1 and 100000
     or p_expected_offer_version is null
     or p_expected_offer_version < 1
     or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
     or p_effective_at is null
  then
    raise exception 'STORE_SYSTEM_OFFER_FUNDED_QUOTE_REQUEST_INVALID'
      using errcode = '22023';
  end if;

  v_allocation_intent :=
    private.store_funding_normalize_allocation_intent_v2(p_allocations);
  v_request_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'system-store-offer-funding-quote-v2',
    'gameSessionId', p_game_session_id,
    'playerId', p_player_id,
    'offerKey', v_offer_key,
    'quantity', p_quantity,
    'expectedOfferVersion', p_expected_offer_version,
    'allocationIntent', v_allocation_intent
  ));

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    ':',
    'system_store_offer_funding_quote_v2',
    p_game_session_id::text,
    p_player_id::text,
    v_idempotency_key
  ), 0));

  -- A matching replay returns the immutable Store/C0 pair before current
  -- offer, stock, pricing, rate, balance, or facility state is reinterpreted.
  select quote_row.*
  into v_existing
  from public.store_purchase_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.player_id = p_player_id
    and quote_row.request_idempotency_key = v_idempotency_key;
  if found then
    if v_existing.request_hash is distinct from v_request_hash then
      raise exception 'STORE_SYSTEM_OFFER_FUNDED_QUOTE_IDEMPOTENCY_CONFLICT'
        using errcode = 'P0001';
    end if;
    if v_existing.seller_offer_id is null then
      raise exception 'STORE_SYSTEM_OFFER_FUNDED_QUOTE_LEGACY_CONFLICT'
        using errcode = 'P0001';
    end if;
    return private.read_seeded_store_funding_quote_result_v1(
      v_existing.id,
      true
    );
  end if;

  select game_row.status
  into v_game_status
  from public.game_sessions as game_row
  where game_row.id = p_game_session_id
  for share;
  if not found or v_game_status <> 'active' then
    raise exception 'STORE_SYSTEM_OFFER_FUNDED_QUOTE_GAME_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select player_row.*
  into v_player
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_SYSTEM_OFFER_FUNDED_QUOTE_PLAYER_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select assignment_row.*
  into v_assignment
  from public.player_country_assignments as assignment_row
  where assignment_row.game_session_id = p_game_session_id
    and assignment_row.player_id = p_player_id
    and assignment_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_SYSTEM_OFFER_FUNDED_QUOTE_COUNTRY_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select country_row.*
  into v_country
  from public.country_profiles as country_row
  where country_row.id = v_assignment.country_profile_id
    and country_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_SYSTEM_OFFER_FUNDED_QUOTE_COUNTRY_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select offer_row.*
  into v_offer
  from public.store_seller_offers as offer_row
  where offer_row.game_session_id = p_game_session_id
    and offer_row.public_key = v_offer_key
    and offer_row.seller_kind in ('seeded', 'npc')
  for share;
  if not found then
    raise exception 'STORE_SYSTEM_OFFER_FUNDED_QUOTE_OFFER_NOT_FOUND'
      using errcode = 'P0001';
  end if;
  if v_offer.status <> 'active'
     or v_offer.version <> p_expected_offer_version
     or v_offer.inventory_account_id is null
     or v_offer.unit_price <= 0
  then
    raise exception 'STORE_SYSTEM_OFFER_FUNDED_QUOTE_OFFER_CONFLICT'
      using errcode = 'P0001';
  end if;

  select party_row.*
  into v_seller_party
  from public.economic_parties as party_row
  where party_row.game_session_id = p_game_session_id
    and party_row.id = v_offer.seller_party_id
    and party_row.status = 'active'
  for share;
  if not found
     or (
       v_offer.seller_kind = 'seeded'
       and not (
         v_seller_party.party_kind = 'store'
         and v_seller_party.system_key = 'store'
       )
     )
     or (
       v_offer.seller_kind = 'npc'
       and v_seller_party.party_kind not in ('country', 'system')
     )
  then
    raise exception 'STORE_SYSTEM_OFFER_FUNDED_QUOTE_SELLER_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select item_row.*
  into v_item
  from public.store_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.id = v_offer.store_item_id
    and item_row.status = 'active'
    and item_row.visibility = 'visible'
  for share;
  if not found
     or v_item.game_item_id is distinct from v_offer.game_item_id
     or v_item.currency_code is distinct from v_offer.currency_code
     or (
       v_offer.seller_kind = 'seeded'
       and (
         v_item.inventory_account_id is distinct from v_offer.inventory_account_id
         or v_item.price is distinct from v_offer.unit_price
       )
     )
  then
    raise exception 'STORE_SYSTEM_OFFER_FUNDED_QUOTE_CATALOG_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select item_row.*
  into v_game_item
  from public.game_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.id = v_offer.game_item_id
    and item_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_SYSTEM_OFFER_FUNDED_QUOTE_ITEM_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select account_row.*
  into v_stock_account
  from public.inventory_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.id = v_offer.inventory_account_id
    and account_row.party_id = v_offer.seller_party_id
    and account_row.account_kind = 'store_stock'
    and account_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_SYSTEM_OFFER_FUNDED_QUOTE_CUSTODY_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select holding_row.*
  into v_stock_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_stock_account.id
    and holding_row.game_item_id = v_game_item.id
  for share;
  if not found
     or v_stock_holding.quantity_owned <> trunc(v_stock_holding.quantity_owned)
     or v_stock_holding.quantity_reserved <> trunc(v_stock_holding.quantity_reserved)
  then
    raise exception 'STORE_SYSTEM_OFFER_FUNDED_QUOTE_STOCK_INVALID'
      using errcode = 'P0001';
  end if;
  v_available := (
    v_stock_holding.quantity_owned - v_stock_holding.quantity_reserved
  )::bigint;
  if v_available < p_quantity
     or (
       v_offer.seller_kind = 'seeded'
       and v_item.stock_quantity < p_quantity
     )
  then
    raise exception 'STORE_SYSTEM_OFFER_FUNDED_QUOTE_INSUFFICIENT_STOCK'
      using errcode = 'P0001';
  end if;

  select currency_row.decimal_places
  into v_target_decimals
  from public.currencies as currency_row
  where currency_row.code = v_offer.currency_code
    and currency_row.status = 'active';
  if not found or v_target_decimals not between 0 and 2 then
    raise exception 'STORE_SYSTEM_OFFER_FUNDED_QUOTE_CURRENCY_PRECISION_UNSUPPORTED'
      using errcode = 'P0001';
  end if;

  select *
  into strict v_pricing
  from public.resolve_store_quote_pricing_v2(
    p_game_session_id,
    v_item.id,
    v_country.id,
    v_offer.currency_code,
    p_quantity,
    v_effective_at
  );
  if v_pricing.settlement_currency_code is distinct from v_offer.currency_code
     or v_pricing.item_currency_code is distinct from v_offer.currency_code
     or v_pricing.exchange_rate is distinct from 1
  then
    raise exception 'STORE_SYSTEM_OFFER_FUNDED_QUOTE_PRICING_INVALID'
      using errcode = 'P0001';
  end if;

  -- Seeded compatibility keeps the certified item-price result byte-for-byte.
  -- NPC offers reuse the same server-owned multipliers with their Store-owned
  -- offer price as the base; no browser price or Store-owned FX is admitted.
  v_policy_unit_price := case
    when v_offer.seller_kind = 'seeded'
      then v_pricing.item_local_final_unit_price
    else round(
      v_offer.unit_price
        * v_pricing.inflation_multiplier
        * v_pricing.location_multiplier
        * v_pricing.scarcity_multiplier,
      2
    )
  end;
  v_bill_unit_price := round(v_policy_unit_price, v_target_decimals);
  v_bill_total_price := round(
    v_bill_unit_price * p_quantity,
    v_target_decimals
  );
  if v_bill_unit_price <= 0 or v_bill_total_price <= 0 then
    raise exception 'STORE_SYSTEM_OFFER_FUNDED_QUOTE_MONEY_INVALID'
      using errcode = 'P0001';
  end if;

  v_allocations := private.store_funding_materialize_allocation_intent_v2(
    v_allocation_intent,
    v_bill_total_price,
    v_target_decimals
  );
  v_store_pricing_version := concat(
    'store-system-offer-funded-v2:',
    v_offer.seller_kind,
    ':country:', lower(v_country.country_code),
    ':snapshot:', v_pricing.snapshot_sequence,
    ':offer-version:', v_offer.version,
    ':minor-unit:', v_target_decimals
  );

  v_target_account_id := private.ensure_system_bank_account_v1(
    p_game_session_id,
    'store.seeded-revenue',
    'checking',
    v_offer.currency_code
  );
  perform private.ensure_bank_account_projection_v1(
    p_game_session_id,
    v_target_account_id
  );
  select account_row.public_key
  into strict v_target_account_key
  from public.bank_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.id = v_target_account_id
    and account_row.account_kind = 'checking'
    and account_row.currency_code = v_offer.currency_code
    and account_row.status = 'active';

  v_store_quote_key := 'quote_' || substr(private.bank_digest_text_v1(concat_ws(
    '|',
    'system-store-offer-funding-quote-v2',
    p_game_session_id::text,
    p_player_id::text,
    v_idempotency_key
  )), 1, 32);
  v_context_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'system-store-offer-funding-context-v2',
    'storeQuoteKey', v_store_quote_key,
    'offerKey', v_offer.public_key,
    'offerVersion', v_offer.version,
    'sellerKind', v_offer.seller_kind,
    'sellerPartyKey', v_seller_party.public_key,
    'custodyAccountKey', v_stock_account.public_key,
    'storeItemKey', v_item.item_key,
    'canonicalItemKey', v_game_item.canonical_key,
    'quantity', p_quantity,
    'currencyCode', v_offer.currency_code,
    'totalPrice', v_bill_total_price::text,
    'pricingVersion', v_store_pricing_version,
    'commercialExpiresAt', v_pricing.expires_at,
    'targetAccountKey', v_target_account_key
  ));
  -- C0 idempotency is scoped to this immutable Store quote. Two otherwise
  -- identical commercial intents with distinct Store idempotency keys must
  -- produce independent funding quotes instead of reusing one C0 key against
  -- a different context key/digest.
  v_funding_idempotency_key := 'system-store-funding:' || substr(
    private.bank_digest_text_v1(concat_ws(
      '|',
      'system-store-funding-v2',
      p_game_session_id::text,
      p_player_id::text,
      v_store_quote_key,
      v_request_hash
    )),
    1,
    64
  );

  v_funding_result := public.create_purchase_funding_quote_v1(
    p_game_session_id,
    p_player_id,
    v_offer.currency_code,
    v_bill_total_price,
    'store.system-offer',
    v_store_quote_key,
    v_context_hash,
    v_allocations,
    v_funding_idempotency_key
  );
  v_funding_quote_key := v_funding_result -> 'quote' ->> 'quote_key';

  select quote_row.*
  into v_funding_quote
  from public.purchase_funding_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.player_id = p_player_id
    and quote_row.public_key = v_funding_quote_key;
  if not found
     or v_funding_quote.funding_context_kind <> 'store.system-offer'
     or v_funding_quote.funding_context_key <> v_store_quote_key
     or v_funding_quote.funding_context_hash <> v_context_hash
     or v_funding_quote.target_currency_code <> v_offer.currency_code
     or v_funding_quote.target_amount <> v_bill_total_price
  then
    raise exception 'STORE_SYSTEM_OFFER_FUNDED_QUOTE_BINDING_FAILED'
      using errcode = 'P0001';
  end if;

  v_expires_at := least(v_pricing.expires_at, v_funding_quote.expires_at);
  if v_expires_at <= clock_timestamp() then
    raise exception 'STORE_SYSTEM_OFFER_FUNDED_QUOTE_EXPIRED'
      using errcode = 'P0001';
  end if;

  insert into public.store_purchase_quotes(
    id,
    public_quote_key,
    game_session_id,
    player_id,
    store_item_id,
    quantity,
    currency_code,
    item_currency_code,
    player_currency_code,
    exchange_rate,
    item_local_final_unit_price,
    item_local_final_total_price,
    base_unit_price,
    inflation_multiplier,
    location_multiplier,
    scarcity_multiplier,
    discount_amount,
    final_unit_price,
    final_total_price,
    pricing_version,
    status,
    expires_at,
    request_idempotency_key,
    request_hash,
    funding_quote_id,
    funding_context_hash,
    target_bank_account_id,
    funding_idempotency_key,
    seller_offer_id,
    seller_offer_version,
    available_quantity_at_quote
  ) values (
    v_store_quote_id,
    v_store_quote_key,
    p_game_session_id,
    p_player_id,
    v_item.id,
    p_quantity,
    v_offer.currency_code,
    v_offer.currency_code,
    v_offer.currency_code,
    1,
    v_bill_unit_price,
    v_bill_total_price,
    round(v_offer.unit_price, 2),
    v_pricing.inflation_multiplier,
    v_pricing.location_multiplier,
    v_pricing.scarcity_multiplier,
    0,
    v_bill_unit_price,
    v_bill_total_price,
    v_store_pricing_version,
    'CREATED',
    v_expires_at,
    v_idempotency_key,
    v_request_hash,
    v_funding_quote.id,
    v_context_hash,
    v_target_account_id,
    v_funding_idempotency_key,
    v_offer.id,
    v_offer.version,
    v_available
  );

  return private.read_seeded_store_funding_quote_result_v1(
    v_store_quote_id,
    false
  );
end;
$function$;

revoke all on function public.create_system_store_offer_funding_quote_v2(
  uuid, uuid, text, integer, bigint, jsonb, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_system_store_offer_funding_quote_v2(
  uuid, uuid, text, integer, bigint, jsonb, text, timestamptz
) to service_role;

-- Preserve the immutable Store/C0 binding digest and public Inventory evidence
-- in every quote/receipt projection. The digest is safe correlation evidence;
-- it is not an idempotency key and contains no internal identifier.
create or replace function private.read_seeded_store_funding_quote_result_v1(
  p_store_quote_id uuid,
  p_replayed boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'quoteKey', quote_row.public_quote_key,
    'quoteStatus', case
      when quote_row.status = 'CREATED'
        and quote_row.expires_at <= statement_timestamp()
      then 'EXPIRED'
      else quote_row.status
    end,
    'itemKey', item_row.item_key,
    'itemName', item_row.name,
    'offerKey', offer_row.public_key,
    'offerVersion', quote_row.seller_offer_version,
    'sellerKind', offer_row.seller_kind,
    'sellerPartyKey', seller_party.public_key,
    'sellerName', case
      when offer_row.seller_kind = 'seeded' then 'Econovaria Store'
      when offer_row.seller_kind = 'npc'
        then coalesce(nullif(seller_party.system_key, ''), 'NPC seller')
      else null
    end,
    'availableQuantityAtQuote', quote_row.available_quantity_at_quote,
    'quantity', quote_row.quantity,
    'baseUnitPrice', quote_row.base_unit_price,
    'inflationMultiplier', quote_row.inflation_multiplier,
    'locationMultiplier', quote_row.location_multiplier,
    'scarcityMultiplier', quote_row.scarcity_multiplier,
    'discountAmount', quote_row.discount_amount,
    'finalUnitPrice', quote_row.final_unit_price,
    'finalTotalPrice', quote_row.final_total_price,
    'currencyCode', quote_row.currency_code,
    'itemCurrencyCode', quote_row.item_currency_code,
    'playerCurrencyCode', quote_row.player_currency_code,
    'exchangeRate', quote_row.exchange_rate,
    'itemLocalFinalUnitPrice', quote_row.item_local_final_unit_price,
    'itemLocalFinalTotalPrice', quote_row.item_local_final_total_price,
    'pricingVersion', quote_row.pricing_version,
    'expiresAt', quote_row.expires_at,
    'replayed', p_replayed,
    'contextDigest', quote_row.funding_context_hash,
    'fundingQuote', private.purchase_funding_quote_public_json_v1(
      quote_row.funding_quote_id
    )
  )
  from public.store_purchase_quotes as quote_row
  join public.store_items as item_row
    on item_row.id = quote_row.store_item_id
   and item_row.game_session_id = quote_row.game_session_id
  left join public.store_seller_offers as offer_row
    on offer_row.id = quote_row.seller_offer_id
   and offer_row.game_session_id = quote_row.game_session_id
  left join public.economic_parties as seller_party
    on seller_party.id = offer_row.seller_party_id
   and seller_party.game_session_id = offer_row.game_session_id
  where quote_row.id = p_store_quote_id
    and quote_row.funding_quote_id is not null
    and quote_row.funding_context_hash ~ '^[0-9a-f]{64}$';
$function$;

revoke all on function private.read_seeded_store_funding_quote_result_v1(
  uuid, boolean
) from public, anon, authenticated, service_role;

create or replace function private.read_seeded_store_funding_receipt_result_v1(
  p_purchase_id uuid,
  p_replayed boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'receiptKey', purchase_row.public_receipt_key,
    'quoteKey', quote_row.public_quote_key,
    'itemKey', item_row.item_key,
    'itemName', item_row.name,
    'offerKey', offer_row.public_key,
    'offerVersion', quote_row.seller_offer_version,
    'sellerKind', offer_row.seller_kind,
    'sellerPartyKey', seller_party.public_key,
    'sellerName', case
      when offer_row.seller_kind = 'seeded' then 'Econovaria Store'
      when offer_row.seller_kind = 'npc'
        then coalesce(nullif(seller_party.system_key, ''), 'NPC seller')
      else null
    end,
    'offerVersionBefore', quote_row.seller_offer_version,
    'offerVersionAfter', purchase_row.seller_offer_version_after,
    'remainingSellerQuantity', purchase_row.remaining_seller_quantity,
    'sellerProceeds', purchase_row.final_total_price,
    'quantity', purchase_row.quantity,
    'finalUnitPrice', purchase_row.final_unit_price,
    'finalTotalPrice', purchase_row.final_total_price,
    'currencyCode', purchase_row.currency_code,
    'inventoryQuantityOwned', coalesce(
      (buyer_line.metadata ->> 'quantityOwnedAfter')::numeric,
      holding_row.quantity_owned,
      0
    ),
    'inventoryTransactionKey', inventory_transaction.public_key,
    'completedAt', purchase_row.created_at,
    'alreadyCompleted', p_replayed,
    'contextDigest', quote_row.funding_context_hash,
    'fundingReceipt', private.purchase_funding_receipt_public_json_v1(
      purchase_row.funding_receipt_id
    )
  )
  from public.store_purchases as purchase_row
  join public.store_purchase_quotes as quote_row
    on quote_row.id = purchase_row.quote_id
   and quote_row.game_session_id = purchase_row.game_session_id
  join public.store_items as item_row
    on item_row.id = purchase_row.store_item_id
   and item_row.game_session_id = purchase_row.game_session_id
  left join public.store_seller_offers as offer_row
    on offer_row.id = quote_row.seller_offer_id
   and offer_row.game_session_id = quote_row.game_session_id
  left join public.economic_parties as seller_party
    on seller_party.id = offer_row.seller_party_id
   and seller_party.game_session_id = offer_row.game_session_id
  join public.inventory_transactions as inventory_transaction
    on inventory_transaction.id = purchase_row.inventory_transaction_id
   and inventory_transaction.game_session_id = purchase_row.game_session_id
  left join public.inventory_transaction_lines as buyer_line
    on buyer_line.game_session_id = purchase_row.game_session_id
   and buyer_line.transaction_id = inventory_transaction.id
   and buyer_line.game_item_id = item_row.game_item_id
   and buyer_line.quantity_delta = purchase_row.quantity
   and buyer_line.metadata ->> 'side' = 'buyer_inventory'
  left join public.inventory_accounts as buyer_account
    on buyer_account.game_session_id = purchase_row.game_session_id
   and buyer_account.party_id = (
     select party_row.id
     from public.economic_parties as party_row
     where party_row.game_session_id = purchase_row.game_session_id
       and party_row.party_kind = 'player'
       and party_row.player_id = purchase_row.player_id
     limit 1
   )
   and buyer_account.account_kind = 'personal'
   and buyer_account.location_key is null
  left join public.inventory_holdings as holding_row
    on holding_row.game_session_id = purchase_row.game_session_id
   and holding_row.inventory_account_id = buyer_account.id
   and holding_row.game_item_id = item_row.game_item_id
  where purchase_row.id = p_purchase_id
    and purchase_row.status = 'COMPLETED'
    and purchase_row.funding_receipt_id is not null
    and quote_row.funding_context_hash ~ '^[0-9a-f]{64}$';
$function$;

revoke all on function private.read_seeded_store_funding_receipt_result_v1(
  uuid, boolean
) from public, anon, authenticated, service_role;

create or replace function economy_private.read_store_offer_funding_quote_result_v1(
  p_store_quote_id uuid,
  p_replayed boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, economy_private, pg_temp
as $function$
  select economy_private.read_store_offer_purchase_quote_result_v2(
    quote_row.id,
    p_replayed
  ) || jsonb_build_object(
    'contextDigest', quote_row.funding_context_hash,
    'fundingQuote', private.purchase_funding_quote_public_json_v1(
      quote_row.funding_quote_id
    )
  )
  from public.store_offer_purchase_quotes as quote_row
  where quote_row.id = p_store_quote_id
    and quote_row.funding_quote_id is not null
    and quote_row.funding_context_hash ~ '^[0-9a-f]{64}$';
$function$;

revoke all on function economy_private.read_store_offer_funding_quote_result_v1(
  uuid, boolean
) from public, anon, authenticated, service_role;

create or replace function economy_private.read_store_offer_funding_receipt_result_v1(
  p_receipt_id uuid,
  p_replayed boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, economy_private, pg_temp
as $function$
  select economy_private.read_store_offer_purchase_receipt_result_v2(
    receipt_row.id,
    p_replayed
  ) || jsonb_build_object(
    'contextDigest', quote_row.funding_context_hash,
    'fundingReceipt', private.purchase_funding_receipt_public_json_v1(
      receipt_row.funding_receipt_id
    )
  )
  from public.store_offer_purchase_receipts as receipt_row
  join public.store_offer_purchase_quotes as quote_row
    on quote_row.game_session_id = receipt_row.game_session_id
   and quote_row.id = receipt_row.quote_id
  where receipt_row.id = p_receipt_id
    and receipt_row.funding_receipt_id is not null
    and quote_row.funding_context_hash ~ '^[0-9a-f]{64}$';
$function$;

revoke all on function economy_private.read_store_offer_funding_receipt_result_v1(
  uuid, boolean
) from public, anon, authenticated, service_role;

-- Service-only, public-key receipt read for the authenticated Buyer. The owner
-- check and immutable projection stay in one database boundary; callers cannot
-- submit or observe an internal receipt identifier.
create or replace function public.read_business_store_offer_funding_receipt_v1(
  p_game_session_id uuid,
  p_buyer_player_id uuid,
  p_receipt_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, economy_private, pg_temp
as $function$
declare
  v_receipt_key text := lower(btrim(coalesce(p_receipt_key, '')));
  v_receipt_id uuid;
  v_result jsonb;
begin
  if p_game_session_id is null
     or p_buyer_player_id is null
     or v_receipt_key !~ '^spr_[0-9a-f]{32}$'
  then
    raise exception 'STORE_OFFER_FUNDED_RECEIPT_REQUEST_INVALID'
      using errcode = '22023';
  end if;

  select receipt_row.id
  into v_receipt_id
  from public.store_offer_purchase_receipts as receipt_row
  where receipt_row.game_session_id = p_game_session_id
    and receipt_row.buyer_player_id = p_buyer_player_id
    and receipt_row.public_key = v_receipt_key
    and receipt_row.funding_receipt_id is not null;
  if not found then
    raise exception 'STORE_OFFER_FUNDED_RECEIPT_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  v_result := economy_private.read_store_offer_funding_receipt_result_v1(
    v_receipt_id,
    true
  );
  if v_result is null then
    raise exception 'STORE_OFFER_FUNDED_RECEIPT_NOT_FOUND'
      using errcode = 'P0001';
  end if;
  return v_result;
end;
$function$;

revoke all on function public.read_business_store_offer_funding_receipt_v1(
  uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.read_business_store_offer_funding_receipt_v1(
  uuid, uuid, text
) to service_role;

-- A raw amount in one currency is never a comparable "best" amount in
-- another. Preserve per-offer currency/price and suppress the aggregate best
-- claim whenever an item has available offers in more than one currency.
create or replace function public.read_store_catalog_offer_groups_v2(
  p_game_session_id uuid
)
returns table(
  catalog_item_key text,
  canonical_item_key text,
  store_item_key text,
  name text,
  description text,
  category text,
  currency_code text,
  best_unit_price numeric,
  total_available_quantity integer,
  seller_count integer,
  offer_count integer,
  offers jsonb,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
  with offer_rows as (
    select
      offer.id as offer_id,
      offer.public_key as offer_key,
      offer.game_item_id,
      offer.seller_party_id,
      offer.seller_kind,
      offer.unit_price,
      offer.currency_code,
      offer.status,
      offer.version,
      offer.updated_at as offer_updated_at,
      item.item_key as store_item_key,
      item.name,
      item.description,
      item.category,
      item.sort_order,
      item.updated_at as store_item_updated_at,
      game_item.public_key as catalog_item_key,
      game_item.canonical_key as canonical_item_key,
      game_item.updated_at as game_item_updated_at,
      party.public_key as seller_key,
      case
        when offer.seller_kind = 'business' then business.legal_name
        when offer.seller_kind = 'seeded' then 'Econovaria Store'
        else coalesce(nullif(party.system_key, ''), 'NPC seller')
      end as seller_name,
      greatest(
        floor(
          coalesce(holding.quantity_owned, 0)
          - coalesce(holding.quantity_reserved, 0)
        ),
        0
      )::integer as available_quantity
    from public.store_seller_offers as offer
    join public.store_items as item
      on item.game_session_id = offer.game_session_id
     and item.id = offer.store_item_id
     and item.status = 'active'
     and item.visibility = 'visible'
    join public.game_items as game_item
      on game_item.game_session_id = offer.game_session_id
     and game_item.id = offer.game_item_id
     and game_item.status = 'active'
    join public.economic_parties as party
      on party.game_session_id = offer.game_session_id
     and party.id = offer.seller_party_id
     and party.status = 'active'
    join public.inventory_accounts as account
      on account.game_session_id = offer.game_session_id
     and account.id = offer.inventory_account_id
     and account.party_id = offer.seller_party_id
     and account.account_kind = 'store_stock'
     and account.status = 'active'
    left join public.inventory_holdings as holding
      on holding.game_session_id = offer.game_session_id
     and holding.inventory_account_id = account.id
     and holding.game_item_id = offer.game_item_id
    left join public.business_entities as business
      on business.game_session_id = party.game_session_id
     and business.id = party.business_id
    where offer.game_session_id = p_game_session_id
      and offer.status = 'active'
  ),
  ranked as (
    select
      row_value.*,
      row_number() over (
        partition by row_value.game_item_id
        order by
          row_value.sort_order,
          row_value.store_item_key,
          row_value.offer_key
      ) as presentation_rank
    from offer_rows as row_value
  )
  select
    max(ranked.catalog_item_key) filter (where ranked.presentation_rank = 1),
    max(ranked.canonical_item_key) filter (where ranked.presentation_rank = 1),
    max(ranked.store_item_key) filter (where ranked.presentation_rank = 1),
    max(ranked.name) filter (where ranked.presentation_rank = 1),
    max(ranked.description) filter (where ranked.presentation_rank = 1),
    max(ranked.category) filter (where ranked.presentation_rank = 1),
    max(ranked.currency_code) filter (where ranked.presentation_rank = 1),
    case
      when count(distinct ranked.currency_code)
        filter (where ranked.available_quantity > 0) <= 1
      then min(ranked.unit_price)
        filter (where ranked.available_quantity > 0)
      else null
    end,
    coalesce(sum(ranked.available_quantity), 0)::integer,
    (count(distinct ranked.seller_party_id)
      filter (where ranked.available_quantity > 0))::integer,
    count(*)::integer,
    jsonb_agg(
      jsonb_build_object(
        'offerKey', ranked.offer_key,
        'sellerKey', ranked.seller_key,
        'sellerKind', ranked.seller_kind,
        'sellerName', ranked.seller_name,
        'unitPrice', ranked.unit_price,
        'currencyCode', ranked.currency_code,
        'availableQuantity', ranked.available_quantity,
        'status', ranked.status,
        'version', ranked.version
      )
      order by
        case when ranked.available_quantity > 0 then 0 else 1 end,
        ranked.currency_code,
        ranked.unit_price,
        ranked.seller_kind,
        ranked.offer_key
    ),
    max(greatest(
      ranked.offer_updated_at,
      ranked.store_item_updated_at,
      ranked.game_item_updated_at
    ))
  from ranked
  group by ranked.game_item_id
  order by
    min(ranked.sort_order),
    max(ranked.name) filter (where ranked.presentation_rank = 1),
    max(ranked.canonical_item_key) filter (where ranked.presentation_rank = 1);
$function$;

revoke all on function public.read_store_catalog_offer_groups_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.read_store_catalog_offer_groups_v2(uuid)
  to service_role;

-- Keep one seeded/NPC settlement authority. Historical unbound quotes retain
-- the certified item-rooted branch; new bound quotes derive the Store root
-- from immutable seller-offer evidence. The C0/B2 and Inventory composers are
-- unchanged and are invoked only after the applicable Store roots are locked.
create or replace function public.settle_seeded_store_funding_v1(
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
  v_quote_key text := lower(btrim(coalesce(p_quote_key, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_request_hash text;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_purchase public.store_purchases%rowtype;
  v_quote_preview public.store_purchase_quotes%rowtype;
  v_quote public.store_purchase_quotes%rowtype;
  v_offer public.store_seller_offers%rowtype;
  v_seller_party public.economic_parties%rowtype;
  v_offer_bound boolean := false;
  v_item public.store_items%rowtype;
  v_game_item public.game_items%rowtype;
  v_stock_account public.inventory_accounts%rowtype;
  v_stock_holding public.inventory_holdings%rowtype;
  v_stock_quantity_before numeric := 0;
  v_offer_version_after bigint;
  v_remaining_seller_quantity bigint;
  v_funding_context_kind text;
  v_funding_source_action text;
  v_inventory_source_action text;
  v_funding_quote public.purchase_funding_quotes%rowtype;
  v_target_account public.bank_accounts%rowtype;
  v_target_party public.economic_parties%rowtype;
  v_purchase_id uuid := extensions.gen_random_uuid();
  v_purchase_public_key text;
  v_funding_settlement_key text;
  v_funding_result jsonb;
  v_funding_receipt_key text;
  v_funding_receipt public.purchase_funding_receipts%rowtype;
  v_buyer_inventory_account_id uuid;
  v_buyer_holding public.inventory_holdings%rowtype;
  v_buyer_quantity_before numeric := 0;
  v_buyer_average_cost_before numeric(18, 4) := 0;
  v_buyer_average_cost_after numeric(18, 4);
  v_inventory_post jsonb;
  v_inventory_transaction_id uuid;
  v_now timestamptz := clock_timestamp();
  v_game_status text;
  v_fail_stage text := lower(coalesce(
    current_setting('app.seeded_store_funding_fail_stage', true),
    ''
  ));
begin
  if p_game_session_id is null
     or p_player_id is null
     or v_quote_key !~ '^quote_[0-9a-f]{32}$'
     or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
     or jsonb_typeof(coalesce(p_request_metadata, '{}'::jsonb)) <> 'object'
  then
    raise exception 'STORE_FUNDED_SETTLEMENT_REQUEST_INVALID'
      using errcode = '22023';
  end if;

  v_request_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'seeded-store-funding-settlement-v1',
    'gameSessionId', p_game_session_id,
    'playerId', p_player_id,
    'quoteKey', v_quote_key,
    'clientSubmittedAt', p_client_submitted_at
  ));

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    ':',
    'seeded_store_funding_settlement_v1',
    p_game_session_id::text,
    p_player_id::text,
    v_idempotency_key
  ), 0));

  -- Completed replay is resolved before any mutable Store or Banking state.
  select key_row.*
  into v_idempotency
  from public.mutation_idempotency_keys as key_row
  where key_row.game_session_id = p_game_session_id
    and key_row.player_id = p_player_id
    and key_row.route_key = 'players.me.store.funded-purchases'
    and key_row.idempotency_key = v_idempotency_key
  for update;

  if found then
    if v_idempotency.request_hash <> v_request_hash then
      raise exception 'STORE_FUNDED_SETTLEMENT_IDEMPOTENCY_CONFLICT'
        using errcode = 'P0001';
    end if;
    if v_idempotency.status = 'COMPLETED' then
      select purchase_row.*
      into v_purchase
      from public.store_purchases as purchase_row
      where purchase_row.game_session_id = p_game_session_id
        and purchase_row.player_id = p_player_id
        and purchase_row.id = v_idempotency.result_id
        and purchase_row.status = 'COMPLETED';
      if not found or v_purchase.funding_receipt_id is null then
        raise exception 'STORE_FUNDED_SETTLEMENT_REPLAY_MISSING'
          using errcode = 'P0001';
      end if;
      return private.read_seeded_store_funding_receipt_result_v1(
        v_purchase.id,
        true
      );
    end if;
    if v_idempotency.status <> 'STARTED' then
      raise exception 'STORE_FUNDED_SETTLEMENT_IN_PROGRESS'
        using errcode = 'P0001';
    end if;
  else
    insert into public.mutation_idempotency_keys(
      game_session_id,
      player_id,
      route_key,
      idempotency_key,
      request_hash,
      status,
      expires_at
    ) values (
      p_game_session_id,
      p_player_id,
      'players.me.store.funded-purchases',
      v_idempotency_key,
      v_request_hash,
      'STARTED',
      v_now + interval '7 days'
    )
    returning * into v_idempotency;
  end if;

  select game_row.status
  into v_game_status
  from public.game_sessions as game_row
  where game_row.id = p_game_session_id
  for share;
  if not found or v_game_status <> 'active' then
    raise exception 'STORE_FUNDED_SETTLEMENT_GAME_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  perform 1
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_FUNDED_SETTLEMENT_PLAYER_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select quote_row.*
  into v_quote_preview
  from public.store_purchase_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.player_id = p_player_id
    and quote_row.public_quote_key = v_quote_key;
  if not found or v_quote_preview.funding_quote_id is null then
    raise exception 'STORE_FUNDED_SETTLEMENT_QUOTE_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  v_offer_bound := v_quote_preview.seller_offer_id is not null;
  if v_offer_bound then
    select offer_row.*
    into v_offer
    from public.store_seller_offers as offer_row
    where offer_row.game_session_id = p_game_session_id
      and offer_row.id = v_quote_preview.seller_offer_id;
    if not found or v_offer.seller_kind not in ('seeded', 'npc') then
      raise exception 'STORE_FUNDED_SETTLEMENT_OFFER_NOT_FOUND'
        using errcode = 'P0001';
    end if;

    -- NPC purchase/withdrawal-style mutations serialize on the offer first.
    if v_offer.seller_kind = 'npc' then
      select offer_row.*
      into v_offer
      from public.store_seller_offers as offer_row
      where offer_row.game_session_id = p_game_session_id
        and offer_row.id = v_quote_preview.seller_offer_id
      for update;
    end if;
  end if;

  if v_offer_bound and v_offer.seller_kind = 'npc' then
    select item_row.*
    into v_item
    from public.store_items as item_row
    where item_row.game_session_id = p_game_session_id
      and item_row.id = v_quote_preview.store_item_id
    for share;
  else
    -- Historical and seeded compatibility settlement retain item-first order.
    select item_row.*
    into v_item
    from public.store_items as item_row
    where item_row.game_session_id = p_game_session_id
      and item_row.id = v_quote_preview.store_item_id
    for update;
  end if;
  if not found
     or v_item.status <> 'active'
     or v_item.visibility <> 'visible'
     or v_item.game_item_id is null
     or v_item.inventory_account_id is null
  then
    raise exception 'STORE_FUNDED_SETTLEMENT_ITEM_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if v_offer_bound and v_offer.seller_kind = 'seeded' then
    select offer_row.*
    into v_offer
    from public.store_seller_offers as offer_row
    where offer_row.game_session_id = p_game_session_id
      and offer_row.id = v_quote_preview.seller_offer_id
    for share;
  end if;

  if v_offer_bound then
    if not found
       or v_offer.status <> 'active'
       or v_offer.version <> v_quote_preview.seller_offer_version
       or v_offer.store_item_id <> v_item.id
       or v_offer.game_item_id <> v_item.game_item_id
       or v_offer.inventory_account_id is null
       or v_offer.currency_code <> v_item.currency_code
       or (
         v_offer.seller_kind = 'seeded'
         and (
           v_offer.inventory_account_id <> v_item.inventory_account_id
           or v_offer.unit_price <> v_item.price
         )
       )
    then
      raise exception 'STORE_FUNDED_SETTLEMENT_OFFER_CONFLICT'
        using errcode = 'P0001';
    end if;

    select party_row.*
    into v_seller_party
    from public.economic_parties as party_row
    where party_row.game_session_id = p_game_session_id
      and party_row.id = v_offer.seller_party_id
      and party_row.status = 'active'
    for share;
    if not found
       or (
         v_offer.seller_kind = 'seeded'
         and not (
           v_seller_party.party_kind = 'store'
           and v_seller_party.system_key = 'store'
         )
       )
       or (
         v_offer.seller_kind = 'npc'
         and v_seller_party.party_kind not in ('country', 'system')
       )
    then
      raise exception 'STORE_FUNDED_SETTLEMENT_SELLER_UNAVAILABLE'
        using errcode = 'P0001';
    end if;
  end if;

  select quote_row.*
  into v_quote
  from public.store_purchase_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.player_id = p_player_id
    and quote_row.public_quote_key = v_quote_key
  for update;
  if not found
     or v_quote.id <> v_quote_preview.id
     or v_quote.store_item_id <> v_item.id
     or v_quote.status <> 'CREATED'
     or v_quote.funding_quote_id is null
     or v_quote.funding_context_hash is null
     or v_quote.target_bank_account_id is null
     or v_quote.seller_offer_id is distinct from v_quote_preview.seller_offer_id
     or v_quote.seller_offer_version is distinct from v_quote_preview.seller_offer_version
     or v_quote.available_quantity_at_quote is distinct from
       v_quote_preview.available_quantity_at_quote
     or (
       v_offer_bound
       and (
         v_quote.seller_offer_id <> v_offer.id
         or v_quote.seller_offer_version <> v_offer.version
       )
     )
  then
    raise exception 'STORE_FUNDED_SETTLEMENT_QUOTE_UNUSABLE'
      using errcode = 'P0001';
  end if;
  if v_quote.expires_at <= v_now then
    raise exception 'STORE_FUNDED_SETTLEMENT_QUOTE_EXPIRED'
      using errcode = 'P0001';
  end if;
  if (not v_offer_bound or v_offer.seller_kind = 'seeded')
     and v_item.stock_quantity < v_quote.quantity
  then
    raise exception 'STORE_FUNDED_SETTLEMENT_INSUFFICIENT_STOCK'
      using errcode = 'P0001';
  end if;

  select item_row.*
  into v_game_item
  from public.game_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.id = v_item.game_item_id
    and item_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_FUNDED_SETTLEMENT_ITEM_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select account_row.*
  into v_stock_account
  from public.inventory_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.id = case
      when v_offer_bound then v_offer.inventory_account_id
      else v_item.inventory_account_id
    end
    and account_row.status = 'active'
  for share;
  if not found
     or (
       v_offer_bound
       and (
         v_stock_account.party_id <> v_offer.seller_party_id
         or v_stock_account.account_kind <> 'store_stock'
       )
     )
  then
    raise exception 'STORE_FUNDED_SETTLEMENT_STOCK_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select holding_row.*
  into v_stock_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_stock_account.id
    and holding_row.game_item_id = v_game_item.id
  for update;
  if not found
     or v_stock_holding.quantity_owned <> trunc(v_stock_holding.quantity_owned)
     or v_stock_holding.quantity_reserved <> trunc(v_stock_holding.quantity_reserved)
     or v_stock_holding.quantity_owned - v_stock_holding.quantity_reserved
       < v_quote.quantity
     or (
       (not v_offer_bound or v_offer.seller_kind = 'seeded')
       and v_stock_holding.quantity_reserved <> 0
     )
     or (
       v_offer_bound
       and v_stock_holding.cost_currency_code is distinct from v_quote.currency_code
     )
  then
    raise exception 'STORE_FUNDED_SETTLEMENT_INSUFFICIENT_STOCK'
      using errcode = 'P0001';
  end if;
  v_stock_quantity_before := v_stock_holding.quantity_owned;
  v_remaining_seller_quantity := (
    v_stock_holding.quantity_owned
      - v_stock_holding.quantity_reserved
      - v_quote.quantity
  )::bigint;

  v_funding_context_kind := case
    when v_offer_bound then 'store.system-offer'
    else 'store.seeded'
  end;
  v_funding_source_action := case
    when v_offer_bound then 'system_offer_purchase_funding'
    else 'seeded_store_purchase_funding'
  end;
  v_inventory_source_action := case
    when v_offer_bound then 'system_offer_funded_purchase'
    else 'seeded_store_funded_purchase'
  end;

  select funding_row.*
  into v_funding_quote
  from public.purchase_funding_quotes as funding_row
  where funding_row.game_session_id = p_game_session_id
    and funding_row.id = v_quote.funding_quote_id
    and funding_row.player_id = p_player_id;
  if not found
     or v_funding_quote.funding_context_kind <> v_funding_context_kind
     or v_funding_quote.funding_context_key <> v_quote.public_quote_key
     or v_funding_quote.funding_context_hash <> v_quote.funding_context_hash
     or v_funding_quote.target_currency_code <> v_quote.currency_code
     or v_funding_quote.target_amount <> v_quote.final_total_price
  then
    raise exception 'STORE_FUNDED_SETTLEMENT_FUNDING_MISMATCH'
      using errcode = 'P0001';
  end if;

  select account_row.*
  into v_target_account
  from public.bank_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.id = v_quote.target_bank_account_id
    and account_row.account_kind = 'checking'
    and account_row.currency_code = v_quote.currency_code
    and account_row.status = 'active';
  if not found then
    raise exception 'STORE_FUNDED_SETTLEMENT_TARGET_INVALID'
      using errcode = 'P0001';
  end if;

  select party_row.*
  into v_target_party
  from public.economic_parties as party_row
  where party_row.game_session_id = p_game_session_id
    and party_row.id = v_target_account.party_id
    and party_row.party_kind = 'system'
    and party_row.system_key = 'store.seeded-revenue'
    and party_row.status = 'active';
  if not found then
    raise exception 'STORE_FUNDED_SETTLEMENT_TARGET_INVALID'
      using errcode = 'P0001';
  end if;

  v_purchase_public_key := 'receipt_' || substr(private.bank_digest_text_v1(concat_ws(
    '|',
    'seeded-store-funding-receipt-v1',
    p_game_session_id::text,
    p_player_id::text,
    v_idempotency_key
  )), 1, 32);

  insert into public.store_purchases(
    id,
    public_receipt_key,
    game_session_id,
    player_id,
    store_item_id,
    quote_id,
    quantity,
    currency_code,
    item_currency_code,
    player_currency_code,
    exchange_rate,
    item_local_final_unit_price,
    item_local_final_total_price,
    final_unit_price,
    final_total_price,
    ledger_entry_id,
    idempotency_key,
    status,
    client_submitted_at
  ) values (
    v_purchase_id,
    v_purchase_public_key,
    p_game_session_id,
    p_player_id,
    v_item.id,
    v_quote.id,
    v_quote.quantity,
    v_quote.currency_code,
    v_quote.item_currency_code,
    v_quote.player_currency_code,
    v_quote.exchange_rate,
    v_quote.item_local_final_unit_price,
    v_quote.item_local_final_total_price,
    v_quote.final_unit_price,
    v_quote.final_total_price,
    null,
    v_idempotency_key,
    'FAILED',
    p_client_submitted_at
  ) returning * into v_purchase;

  v_funding_settlement_key := case
    when v_offer_bound then 'system-store-purchase:'
    else 'seeded-store-purchase:'
  end || substr(v_request_hash, 1, 64);
  v_funding_result := private.compose_purchase_funding_v1(
    p_game_session_id,
    p_player_id,
    v_funding_quote.public_key,
    v_funding_context_kind,
    v_quote.public_quote_key,
    v_quote.funding_context_hash,
    v_target_account.id,
    'store',
    v_funding_source_action,
    v_purchase.id,
    v_funding_settlement_key,
    'player',
    p_player_id,
    v_now
  );
  v_funding_receipt_key := v_funding_result -> 'receipt' ->> 'receipt_key';

  select receipt_row.*
  into v_funding_receipt
  from public.purchase_funding_receipts as receipt_row
  where receipt_row.game_session_id = p_game_session_id
    and receipt_row.public_key = v_funding_receipt_key
    and receipt_row.player_id = p_player_id
    and receipt_row.quote_id = v_funding_quote.id
    and receipt_row.target_account_id = v_target_account.id
    and receipt_row.target_amount = v_quote.final_total_price
    and receipt_row.source_domain = 'store'
    and receipt_row.source_action = v_funding_source_action
    and receipt_row.source_id = v_purchase.id;
  if not found then
    raise exception 'STORE_FUNDED_SETTLEMENT_RECEIPT_INVALID'
      using errcode = 'P0001';
  end if;
  if v_fail_stage = 'after_funding' then
    raise exception 'STORE_FUNDED_SETTLEMENT_INJECTED_FAILURE:after_funding'
      using errcode = 'P0001';
  end if;

  v_buyer_inventory_account_id := economy_private.ensure_player_inventory_account_v2(
    p_game_session_id,
    p_player_id
  );
  select holding_row.*
  into v_buyer_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_buyer_inventory_account_id
    and holding_row.game_item_id = v_game_item.id
  for update;
  if found then
    if v_buyer_holding.quantity_owned > 0
       and v_buyer_holding.cost_currency_code is distinct from v_quote.currency_code
    then
      raise exception 'STORE_FUNDED_SETTLEMENT_BUYER_INVENTORY_CURRENCY_INVALID'
        using errcode = 'P0001';
    end if;
    v_buyer_quantity_before := v_buyer_holding.quantity_owned;
    v_buyer_average_cost_before := v_buyer_holding.average_unit_cost;
  end if;
  v_buyer_average_cost_after := round((
    (v_buyer_quantity_before * v_buyer_average_cost_before)
      + (v_quote.quantity * v_quote.final_unit_price)
  ) / (v_buyer_quantity_before + v_quote.quantity), 4);

  v_inventory_post := economy_private.post_inventory_transaction_v2(
    p_game_session_id,
    'purchase',
    'store',
    v_inventory_source_action,
    v_purchase.id,
    case
      when v_offer_bound then 'system-offer-funded:'
      else 'seeded-store-funded:'
    end || substr(v_request_hash, 1, 64),
    jsonb_build_object(
      'authority', 'multicurrency_store_funding_v1',
      'storeQuoteKey', v_quote.public_quote_key,
      'storeReceiptKey', v_purchase.public_receipt_key,
      'offerKey', case when v_offer_bound then v_offer.public_key else null end,
      'offerVersion', case
        when v_offer_bound then v_quote.seller_offer_version
        else null
      end,
      'fundingQuoteKey', v_funding_quote.public_key,
      'fundingReceiptKey', v_funding_receipt.public_key
    ) || coalesce(p_request_metadata, '{}'::jsonb),
    jsonb_build_array(
      jsonb_build_object(
        'inventoryAccountId', v_stock_account.id,
        'gameItemId', v_game_item.id,
        'storeItemId', v_item.id,
        'quantityDelta', -v_quote.quantity,
        'reservationDelta', 0,
        'unitCost', case
          when v_offer_bound and v_offer.seller_kind = 'npc'
            then v_stock_holding.average_unit_cost
          else v_item.price
        end,
        'currencyCode', v_quote.currency_code,
        'metadata', jsonb_build_object(
          'side', case
            when v_offer_bound then 'system_seller_stock'
            else 'seeded_store_stock'
          end,
          'offerKey', case when v_offer_bound then v_offer.public_key else null end,
          'receiptKey', v_purchase.public_receipt_key
        )
      ),
      jsonb_build_object(
        'inventoryAccountId', v_buyer_inventory_account_id,
        'gameItemId', v_game_item.id,
        'playerId', p_player_id,
        'storeItemId', v_item.id,
        'quantityDelta', v_quote.quantity,
        'reservationDelta', 0,
        'unitCost', v_quote.final_unit_price,
        'currencyCode', v_quote.currency_code,
        'eventType', 'PURCHASED',
        'legacyEventQuantityDelta', v_quote.quantity,
        'metadata', jsonb_build_object(
          'side', 'buyer_inventory',
          'offerKey', case when v_offer_bound then v_offer.public_key else null end,
          'receiptKey', v_purchase.public_receipt_key,
          'quantityOwnedAfter', v_buyer_quantity_before + v_quote.quantity
        ),
        'eventMetadata', jsonb_build_object(
          'storeQuoteKey', v_quote.public_quote_key,
          'storeReceiptKey', v_purchase.public_receipt_key,
          'offerKey', case when v_offer_bound then v_offer.public_key else null end,
          'fundingQuoteKey', v_funding_quote.public_key,
          'fundingReceiptKey', v_funding_receipt.public_key,
          'currencyCode', v_quote.currency_code,
          'finalTotalPrice', v_quote.final_total_price
        )
      )
    )
  );
  v_inventory_transaction_id := (v_inventory_post ->> 'transactionId')::uuid;

  select holding_row.*
  into strict v_stock_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_stock_account.id
    and holding_row.game_item_id = v_game_item.id;
  select holding_row.*
  into strict v_buyer_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_buyer_inventory_account_id
    and holding_row.game_item_id = v_game_item.id;

  if v_stock_holding.quantity_owned is distinct from
       v_stock_quantity_before - v_quote.quantity
     or v_buyer_holding.quantity_owned is distinct from
       v_buyer_quantity_before + v_quote.quantity
     or v_buyer_holding.average_unit_cost is distinct from
       v_buyer_average_cost_after
     or v_buyer_holding.cost_currency_code is distinct from
       v_quote.currency_code
  then
    raise exception 'STORE_FUNDED_SETTLEMENT_INVENTORY_POSTCONDITION_FAILED'
      using errcode = 'P0001';
  end if;
  if v_fail_stage = 'after_inventory' then
    raise exception 'STORE_FUNDED_SETTLEMENT_INJECTED_FAILURE:after_inventory'
      using errcode = 'P0001';
  end if;

  if not v_offer_bound or v_offer.seller_kind = 'seeded' then
    update public.store_items
    set stock_quantity = stock_quantity - v_quote.quantity
    where game_session_id = p_game_session_id
      and id = v_item.id
      and stock_quantity >= v_quote.quantity;
    if not found then
      raise exception 'STORE_FUNDED_SETTLEMENT_STOCK_UPDATE_FAILED'
        using errcode = 'P0001';
    end if;
  end if;

  if v_offer_bound and v_offer.seller_kind = 'npc' then
    update public.store_seller_offers
    set version = version + 1
    where game_session_id = p_game_session_id
      and id = v_offer.id
      and status = 'active'
      and version = v_offer.version
    returning version into v_offer_version_after;
    if not found or v_offer_version_after <> v_offer.version + 1 then
      raise exception 'STORE_FUNDED_SETTLEMENT_OFFER_COMPLETION_FAILED'
        using errcode = 'P0001';
    end if;
  elsif v_offer_bound then
    v_offer_version_after := v_offer.version;
  end if;

  update public.store_purchase_quotes
  set status = 'USED', used_at = v_now
  where game_session_id = p_game_session_id
    and id = v_quote.id
    and status = 'CREATED';
  if not found then
    raise exception 'STORE_FUNDED_SETTLEMENT_QUOTE_COMPLETION_FAILED'
      using errcode = 'P0001';
  end if;

  update public.store_purchases
  set
    funding_receipt_id = v_funding_receipt.id,
    bank_transaction_id = v_funding_receipt.bank_transaction_id,
    target_bank_account_id = v_target_account.id,
    inventory_transaction_id = v_inventory_transaction_id,
    seller_offer_version_after = case
      when v_offer_bound then v_offer_version_after
      else null
    end,
    remaining_seller_quantity = case
      when v_offer_bound then v_remaining_seller_quantity
      else null
    end,
    status = 'COMPLETED'
  where game_session_id = p_game_session_id
    and id = v_purchase.id
    and status = 'FAILED'
  returning * into v_purchase;
  if not found then
    raise exception 'STORE_FUNDED_SETTLEMENT_PURCHASE_COMPLETION_FAILED'
      using errcode = 'P0001';
  end if;

  update public.mutation_idempotency_keys
  set
    status = 'COMPLETED',
    result_type = 'store_purchase',
    result_id = v_purchase.id,
    response_body = jsonb_build_object(
      'receiptKey', v_purchase.public_receipt_key,
      'quoteKey', v_quote.public_quote_key,
      'fundingReceiptKey', v_funding_receipt.public_key,
      'refreshRequired', true
    ),
    completed_at = v_now
  where id = v_idempotency.id
    and status = 'STARTED';
  if not found then
    raise exception 'STORE_FUNDED_SETTLEMENT_IDEMPOTENCY_COMPLETION_FAILED'
      using errcode = 'P0001';
  end if;

  if v_fail_stage = 'after_completion' then
    raise exception 'STORE_FUNDED_SETTLEMENT_INJECTED_FAILURE:after_completion'
      using errcode = 'P0001';
  end if;

  return private.read_seeded_store_funding_receipt_result_v1(
    v_purchase.id,
    false
  );
end;
$function$;

revoke all on function public.settle_seeded_store_funding_v1(
  uuid, uuid, text, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.settle_seeded_store_funding_v1(
  uuid, uuid, text, text, timestamptz, jsonb
) to service_role;

-- The live Player route accepts only D offer-bound seeded/NPC quotes. Keep the
-- v1 command as historical compatibility authority, but never compose its
-- unbound item-rooted branch from the browser-facing repository.
create or replace function public.settle_system_store_offer_funding_v2(
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
  v_quote_key text := lower(btrim(coalesce(p_quote_key, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_quote public.store_purchase_quotes%rowtype;
begin
  if p_game_session_id is null
     or p_player_id is null
     or v_quote_key !~ '^quote_[0-9a-f]{32}$'
     or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then
    raise exception 'STORE_SYSTEM_OFFER_FUNDED_SETTLEMENT_REQUEST_INVALID'
      using errcode = '22023';
  end if;

  -- Deliberately do not acquire a row lock here. The retained v1 authority
  -- owns canonical Store/Inventory/Banking lock order and revalidates every
  -- binding transactionally before settlement.
  select quote_row.*
  into v_quote
  from public.store_purchase_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.player_id = p_player_id
    and quote_row.public_quote_key = v_quote_key;
  if not found then
    raise exception 'STORE_SYSTEM_OFFER_FUNDED_SETTLEMENT_QUOTE_NOT_FOUND'
      using errcode = 'P0001';
  end if;
  if v_quote.seller_offer_id is null
     or v_quote.funding_context_hash is null
  then
    raise exception 'STORE_SYSTEM_OFFER_FUNDED_SETTLEMENT_LEGACY_CONFLICT'
      using errcode = 'P0001';
  end if;

  return public.settle_seeded_store_funding_v1(
    p_game_session_id,
    p_player_id,
    v_quote_key,
    v_idempotency_key,
    null,
    '{}'::jsonb
  );
end;
$function$;

revoke all on function public.settle_system_store_offer_funding_v2(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.settle_system_store_offer_funding_v2(
  uuid, uuid, text, text
) to service_role;

-- The browser submits only immutable quote identity. This service-only adapter
-- performs no row lock before delegating to the retained atomic v1 command.
create or replace function public.settle_business_store_offer_funding_v2(
  p_game_session_id uuid,
  p_buyer_player_id uuid,
  p_quote_key text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, economy_private, pg_temp
as $function$
declare
  v_quote_key text := lower(btrim(coalesce(p_quote_key, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_receipt public.store_offer_purchase_receipts%rowtype;
  v_quote public.store_offer_purchase_quotes%rowtype;
  v_offer_key text;
  v_quantity integer;
  v_offer_version bigint;
begin
  if p_game_session_id is null
     or p_buyer_player_id is null
     or v_quote_key !~ '^quote_[0-9a-f]{32}$'
     or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then
    raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_REQUEST_INVALID'
      using errcode = '22023';
  end if;

  select receipt_row.*
  into v_receipt
  from public.store_offer_purchase_receipts as receipt_row
  where receipt_row.game_session_id = p_game_session_id
    and receipt_row.buyer_player_id = p_buyer_player_id
    and receipt_row.request_idempotency_key = v_idempotency_key;
  if found then
    if v_receipt.quote_key <> v_quote_key then
      raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_IDEMPOTENCY_CONFLICT'
        using errcode = 'P0001';
    end if;
    v_offer_key := v_receipt.offer_key;
    v_quantity := v_receipt.quantity;
    v_offer_version := v_receipt.offer_version_before;
  else
    select quote_row.*
    into v_quote
    from public.store_offer_purchase_quotes as quote_row
    where quote_row.game_session_id = p_game_session_id
      and quote_row.buyer_player_id = p_buyer_player_id
      and quote_row.public_key = v_quote_key;
    if not found then
      raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_QUOTE_NOT_FOUND'
        using errcode = 'P0001';
    end if;

    select offer_row.public_key
    into v_offer_key
    from public.store_seller_offers as offer_row
    where offer_row.game_session_id = p_game_session_id
      and offer_row.id = v_quote.offer_id;
    if not found then
      raise exception 'STORE_OFFER_FUNDED_SETTLEMENT_OFFER_NOT_FOUND'
        using errcode = 'P0001';
    end if;
    v_quantity := v_quote.quantity;
    v_offer_version := v_quote.offer_version;
  end if;

  return public.settle_business_store_offer_funding_v1(
    p_game_session_id,
    p_buyer_player_id,
    v_offer_key,
    v_quote_key,
    v_quantity,
    v_offer_version,
    v_idempotency_key
  );
end;
$function$;

revoke all on function public.settle_business_store_offer_funding_v2(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.settle_business_store_offer_funding_v2(
  uuid, uuid, text, text
) to service_role;

comment on function private.store_funding_normalize_allocation_intent_v2(jsonb)
is 'Validates and canonicalizes one-to-three ordered Store Checking allocation intents whose final target amount is server-derived.';
comment on function private.store_funding_materialize_allocation_intent_v2(
  jsonb, numeric, integer
) is 'Materializes the exact positive final Store contribution only after the authoritative bill and target minor unit are known.';
comment on column public.store_purchase_quotes.seller_offer_id is
  'Optional immutable seeded/NPC seller-offer binding. NULL identifies historical item-rooted compatibility quotes.';
comment on column public.store_purchase_quotes.seller_offer_version is
  'Optimistic seller-offer version captured by an offer-aware seeded/NPC quote.';
comment on column public.store_purchase_quotes.available_quantity_at_quote is
  'Canonical unreserved seller-custody quantity observed when an offer-aware quote was created.';
comment on column public.store_purchases.seller_offer_version_after is
  'Committed seller-offer version after an offer-aware seeded/NPC purchase; seeded compatibility offers do not advance for stock-only movement.';
comment on column public.store_purchases.remaining_seller_quantity is
  'Canonical unreserved seller-custody quantity remaining after an offer-aware seeded/NPC purchase.';
comment on function public.create_system_store_offer_funding_quote_v2(
  uuid, uuid, text, integer, bigint, jsonb, text, timestamptz
) is 'Creates or replays one offer-bound seeded/NPC Store quote, derives country policy and final allocation remainder server-side, and binds the unchanged C0 funding authority.';
comment on function public.settle_seeded_store_funding_v1(
  uuid, uuid, text, text, timestamptz, jsonb
) is 'Sole seeded/NPC funded Store settlement authority. Retains historical item-rooted behavior and settles new offer-bound seeded/NPC custody atomically through unchanged C0/B2 and Inventory composers.';
comment on function public.settle_system_store_offer_funding_v2(
  uuid, uuid, text, text
) is 'Live Player adapter for offer-bound seeded/NPC funded checkout. Rejects historical unbound quotes and delegates without pre-locking to the retained atomic v1 authority.';
comment on function public.settle_business_store_offer_funding_v2(
  uuid, uuid, text, text
) is 'Derives immutable Business Store offer settlement evidence from one owned funded quote and delegates to the retained atomic v1 authority.';
comment on function public.read_business_store_offer_funding_receipt_v1(
  uuid, uuid, text
) is 'Reads one immutable funded Business Store receipt by game, authenticated Buyer, and public receipt key without exposing internal identifiers.';

do $assertions$
declare
  v_quote_source text;
  v_offer_quote_source text;
  v_system_offer_quote_source text;
  v_system_offer_settlement_source text;
  v_system_offer_adapter_source text;
  v_settlement_source text;
  v_inventory_poster_source text;
  v_receipt_read_source text;
begin
  if pg_catalog.to_regprocedure(
    'private.store_funding_normalize_allocation_intent_v2(jsonb)'
  ) is null or pg_catalog.to_regprocedure(
    'private.store_funding_materialize_allocation_intent_v2(jsonb,numeric,integer)'
  ) is null or pg_catalog.to_regprocedure(
    'public.create_system_store_offer_funding_quote_v2(uuid,uuid,text,integer,bigint,jsonb,text,timestamp with time zone)'
  ) is null or pg_catalog.to_regprocedure(
    'public.settle_system_store_offer_funding_v2(uuid,uuid,text,text)'
  ) is null or pg_catalog.to_regprocedure(
    'public.settle_business_store_offer_funding_v2(uuid,uuid,text,text)'
  ) is null or pg_catalog.to_regprocedure(
    'public.read_business_store_offer_funding_receipt_v1(uuid,uuid,text)'
  ) is null then
    raise exception 'D_STORE_FUNDING_FUNCTION_MISSING' using errcode = 'P0001';
  end if;

  select proc_row.prosrc
  into v_quote_source
  from pg_catalog.pg_proc as proc_row
  where proc_row.oid =
    'public.create_seeded_store_funding_quote_v1(uuid,uuid,text,integer,jsonb,text,timestamp with time zone)'::regprocedure;
  select proc_row.prosrc
  into v_offer_quote_source
  from pg_catalog.pg_proc as proc_row
  where proc_row.oid =
    'public.create_business_store_offer_funding_quote_v1(uuid,uuid,text,integer,bigint,jsonb,text)'::regprocedure;
  select proc_row.prosrc
  into v_system_offer_quote_source
  from pg_catalog.pg_proc as proc_row
  where proc_row.oid =
    'public.create_system_store_offer_funding_quote_v2(uuid,uuid,text,integer,bigint,jsonb,text,timestamp with time zone)'::regprocedure;
  select proc_row.prosrc
  into v_system_offer_settlement_source
  from pg_catalog.pg_proc as proc_row
  where proc_row.oid =
    'public.settle_seeded_store_funding_v1(uuid,uuid,text,text,timestamp with time zone,jsonb)'::regprocedure;
  select proc_row.prosrc
  into v_system_offer_adapter_source
  from pg_catalog.pg_proc as proc_row
  where proc_row.oid =
    'public.settle_system_store_offer_funding_v2(uuid,uuid,text,text)'::regprocedure;
  select proc_row.prosrc
  into v_settlement_source
  from pg_catalog.pg_proc as proc_row
  where proc_row.oid =
    'public.settle_business_store_offer_funding_v2(uuid,uuid,text,text)'::regprocedure;
  select proc_row.prosrc
  into v_inventory_poster_source
  from pg_catalog.pg_proc as proc_row
  where proc_row.oid =
    'economy_private.post_inventory_transaction_v2(uuid,text,text,text,uuid,text,jsonb,jsonb)'::regprocedure;
  select proc_row.prosrc
  into v_receipt_read_source
  from pg_catalog.pg_proc as proc_row
  where proc_row.oid =
    'public.read_business_store_offer_funding_receipt_v1(uuid,uuid,text)'::regprocedure;

  if v_quote_source not like '%store_funding_normalize_allocations_v1%'
     or v_quote_source not like '%store_funding_normalize_allocation_intent_v2%'
     or v_quote_source not like '%store_funding_materialize_allocation_intent_v2%'
     or v_offer_quote_source not like '%store_funding_normalize_allocations_v1%'
     or v_offer_quote_source not like '%store_funding_normalize_allocation_intent_v2%'
     or v_offer_quote_source not like '%store_funding_materialize_allocation_intent_v2%'
     or v_offer_quote_source not like '%business-store-funding-v2%'
     or v_offer_quote_source not like '%v_store_quote_key%'
     or v_system_offer_quote_source not like '%store_seller_offers%'
     or v_system_offer_quote_source not like '%store.system-offer%'
     or v_system_offer_quote_source not like '%create_purchase_funding_quote_v1%'
     or v_system_offer_quote_source not like '%seller_offer_id%'
     or v_system_offer_settlement_source not like '%seller_offer_id%'
     or v_system_offer_settlement_source not like '%store.system-offer%'
     or v_system_offer_settlement_source not like '%compose_purchase_funding_v1%'
     or v_system_offer_settlement_source not like '%post_inventory_transaction_v2%'
     or v_system_offer_settlement_source not like '%seller_offer_version_after%'
     or v_system_offer_settlement_source like '%record_player_ledger_entry%'
     or v_system_offer_adapter_source not like '%seller_offer_id is null%'
     or v_system_offer_adapter_source not like '%LEGACY_CONFLICT%'
     or v_system_offer_adapter_source not like '%settle_seeded_store_funding_v1%'
     or v_system_offer_adapter_source like '%for update%'
     or v_settlement_source not like '%settle_business_store_offer_funding_v1%'
     or v_settlement_source like '%for update%'
     or v_inventory_poster_source not like '%system_offer_funded_purchase%'
     or v_inventory_poster_source not like '%seller_kind = ''npc''%'
     or v_inventory_poster_source not like '%store_seller_offers%'
     or v_receipt_read_source not like '%buyer_player_id = p_buyer_player_id%'
     or v_receipt_read_source not like '%public_key = v_receipt_key%'
     or v_receipt_read_source not like '%read_store_offer_funding_receipt_result_v1%'
     or v_receipt_read_source like '%request_idempotency_key%'
  then
    raise exception 'D_STORE_FUNDING_SOURCE_ASSERTION_FAILED'
      using errcode = 'P0001';
  end if;

  if has_function_privilege(
       'public',
       'public.create_system_store_offer_funding_quote_v2(uuid,uuid,text,integer,bigint,jsonb,text,timestamp with time zone)',
       'EXECUTE'
     ) or has_function_privilege(
       'anon',
       'public.create_system_store_offer_funding_quote_v2(uuid,uuid,text,integer,bigint,jsonb,text,timestamp with time zone)',
       'EXECUTE'
     ) or has_function_privilege(
       'authenticated',
       'public.create_system_store_offer_funding_quote_v2(uuid,uuid,text,integer,bigint,jsonb,text,timestamp with time zone)',
       'EXECUTE'
     ) or not has_function_privilege(
       'service_role',
       'public.create_system_store_offer_funding_quote_v2(uuid,uuid,text,integer,bigint,jsonb,text,timestamp with time zone)',
       'EXECUTE'
     ) or has_function_privilege(
       'public',
       'public.settle_system_store_offer_funding_v2(uuid,uuid,text,text)',
       'EXECUTE'
     ) or has_function_privilege(
       'anon',
       'public.settle_system_store_offer_funding_v2(uuid,uuid,text,text)',
       'EXECUTE'
     ) or has_function_privilege(
       'authenticated',
       'public.settle_system_store_offer_funding_v2(uuid,uuid,text,text)',
       'EXECUTE'
     ) or not has_function_privilege(
       'service_role',
       'public.settle_system_store_offer_funding_v2(uuid,uuid,text,text)',
       'EXECUTE'
     ) or has_function_privilege(
       'public',
       'public.settle_business_store_offer_funding_v2(uuid,uuid,text,text)',
       'EXECUTE'
     ) or has_function_privilege(
       'anon',
       'public.settle_business_store_offer_funding_v2(uuid,uuid,text,text)',
       'EXECUTE'
     ) or has_function_privilege(
       'authenticated',
       'public.settle_business_store_offer_funding_v2(uuid,uuid,text,text)',
       'EXECUTE'
     ) or not has_function_privilege(
       'service_role',
       'public.settle_business_store_offer_funding_v2(uuid,uuid,text,text)',
       'EXECUTE'
     ) or has_function_privilege(
       'public',
       'public.read_business_store_offer_funding_receipt_v1(uuid,uuid,text)',
       'EXECUTE'
     ) or has_function_privilege(
       'anon',
       'public.read_business_store_offer_funding_receipt_v1(uuid,uuid,text)',
       'EXECUTE'
     ) or has_function_privilege(
       'authenticated',
       'public.read_business_store_offer_funding_receipt_v1(uuid,uuid,text)',
       'EXECUTE'
     ) or not has_function_privilege(
       'service_role',
       'public.read_business_store_offer_funding_receipt_v1(uuid,uuid,text)',
       'EXECUTE'
     )
  then
    raise exception 'D_STORE_FUNDING_EXECUTE_ASSERTION_FAILED'
      using errcode = 'P0001';
  end if;

  if not exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'store_purchase_quotes'
         and column_name = 'seller_offer_id'
     ) or not exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'store_purchase_quotes'
         and column_name = 'seller_offer_version'
     ) or not exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'store_purchases'
         and column_name = 'seller_offer_version_after'
     ) or not exists (
       select 1
       from pg_catalog.pg_trigger as trigger_row
       where trigger_row.tgrelid = 'public.store_purchase_quotes'::regclass
         and trigger_row.tgname = 'guard_store_purchase_offer_binding_v2'
         and not trigger_row.tgisinternal
     ) or not exists (
       select 1
       from pg_catalog.pg_trigger as trigger_row
       where trigger_row.tgrelid = 'public.store_purchases'::regclass
         and trigger_row.tgname = 'guard_store_purchase_offer_result_v2'
         and not trigger_row.tgisinternal
     )
  then
    raise exception 'D_STORE_SYSTEM_OFFER_EVIDENCE_ASSERTION_FAILED'
      using errcode = 'P0001';
  end if;
end;
$assertions$;

commit;
