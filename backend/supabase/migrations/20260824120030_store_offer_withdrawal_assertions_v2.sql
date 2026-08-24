-- Business V2 Phase 9A: fail-closed schema, function, and privilege assertions.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $assertions$
declare
  v_request_function oid := to_regprocedure(
    'public.request_business_store_offer_withdrawal_v2(uuid,text,text,text,integer,bigint,text)'
  );
  v_processor_function oid := to_regprocedure(
    'public.process_due_store_offer_withdrawals_v2(integer)'
  );
  v_offer_guard oid := to_regprocedure(
    'economy_private.guard_store_seller_offer_v2()'
  );
  v_request_guard oid := to_regprocedure(
    'economy_private.guard_store_offer_withdrawal_request_v2()'
  );
  v_aggregation oid := to_regprocedure(
    'public.read_store_catalog_offer_groups_v2(uuid)'
  );
  v_definition text;
  v_column text;
begin
  if to_regclass('public.store_offer_withdrawal_requests') is null then
    raise exception 'STORE_WITHDRAWAL_SCHEMA_MISSING';
  end if;

  foreach v_column in array array[
    'public_key','game_session_id','offer_id','business_id','seller_party_id',
    'game_item_id','inventory_account_id','mode','requested_quantity',
    'resume_status','status','offer_version_at_request',
    'completion_offer_status','completion_offer_version',
    'request_idempotency_key','request_hash',
    'requested_at','effective_at','next_attempt_at','last_attempt_at',
    'last_block_reason','attempt_count','completed_at','returned_quantity',
    'inventory_transaction_id','version','metadata','created_at','updated_at'
  ]
  loop
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'store_offer_withdrawal_requests'
        and column_name = v_column
    ) then
      raise exception 'STORE_WITHDRAWAL_COLUMN_MISSING:%', v_column;
    end if;
  end loop;

  foreach v_column in array array[
    'withdrawal_request_id','withdrawal_requested_at',
    'withdrawal_effective_at','withdrawal_resume_status',
    'withdrawal_mode','withdrawal_requested_quantity'
  ]
  loop
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'store_seller_offers'
        and column_name = v_column
    ) then
      raise exception 'STORE_WITHDRAWAL_OFFER_COLUMN_MISSING:%', v_column;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.store_seller_offers'::regclass
      and conname = 'store_seller_offers_current_withdrawal_check'
  ) or not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.store_offer_withdrawal_requests'::regclass
      and conname = 'store_offer_withdrawals_effective_time_check'
  ) or not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.store_offer_withdrawal_requests'::regclass
      and conname = 'store_offer_withdrawals_completion_check'
  ) or not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.store_offer_withdrawal_requests'::regclass
      and conname = 'store_offer_withdrawals_receipt_check'
  ) then
    raise exception 'STORE_WITHDRAWAL_CONSTRAINT_MISSING';
  end if;

  if position(
    'withdrawal_pending'
    in pg_get_constraintdef((
      select oid
      from pg_constraint
      where conrelid = 'public.store_seller_offers'::regclass
        and conname = 'store_seller_offers_status_check'
    ))
  ) = 0 then
    raise exception 'STORE_WITHDRAWAL_OFFER_STATUS_NOT_EXTENDED';
  end if;

  if to_regclass('public.store_offer_withdrawals_pending_offer_unique') is null
    or to_regclass('public.store_offer_withdrawals_due_idx') is null
    or to_regclass('public.store_seller_offers_current_withdrawal_unique') is null
  then
    raise exception 'STORE_WITHDRAWAL_INDEX_MISSING';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.store_offer_withdrawal_requests'::regclass
      and tgname = 'guard_store_offer_withdrawal_request_v2'
      and not tgisinternal
  ) then
    raise exception 'STORE_WITHDRAWAL_REQUEST_GUARD_MISSING';
  end if;

  if v_request_function is null
    or v_processor_function is null
    or v_offer_guard is null
    or v_request_guard is null
    or v_aggregation is null
  then
    raise exception 'STORE_WITHDRAWAL_FUNCTION_MISSING';
  end if;

  if not exists (
    select 1 from pg_proc where oid = v_request_function and prosecdef
  ) or not exists (
    select 1 from pg_proc where oid = v_processor_function and prosecdef
  ) or not exists (
    select 1 from pg_proc where oid = v_offer_guard and prosecdef
  ) or not exists (
    select 1 from pg_proc where oid = v_request_guard and prosecdef
  ) then
    raise exception 'STORE_WITHDRAWAL_SECURITY_DEFINER_REQUIRED';
  end if;

  if has_function_privilege(
      'anon',
      'public.request_business_store_offer_withdrawal_v2(uuid,text,text,text,integer,bigint,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.request_business_store_offer_withdrawal_v2(uuid,text,text,text,integer,bigint,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.request_business_store_offer_withdrawal_v2(uuid,text,text,text,integer,bigint,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.process_due_store_offer_withdrawals_v2(integer)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.process_due_store_offer_withdrawals_v2(integer)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.process_due_store_offer_withdrawals_v2(integer)',
      'EXECUTE'
    )
  then
    raise exception 'STORE_WITHDRAWAL_FUNCTION_PRIVILEGE_BOUNDARY_INVALID';
  end if;

  if has_table_privilege(
      'anon', 'public.store_offer_withdrawal_requests', 'SELECT'
    )
    or has_table_privilege(
      'authenticated', 'public.store_offer_withdrawal_requests', 'SELECT'
    )
    or has_table_privilege(
      'anon', 'public.store_offer_withdrawal_requests', 'INSERT'
    )
    or has_table_privilege(
      'authenticated', 'public.store_offer_withdrawal_requests', 'UPDATE'
    )
  then
    raise exception 'STORE_WITHDRAWAL_TABLE_PRIVILEGE_BOUNDARY_INVALID';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.store_offer_withdrawal_requests'::regclass
      and relrowsecurity
      and relforcerowsecurity
  ) then
    raise exception 'STORE_WITHDRAWAL_RLS_NOT_FORCED';
  end if;

  v_definition := pg_get_functiondef(v_request_function);
  if position('STORE_WITHDRAWAL_IDEMPOTENCY_CONFLICT' in v_definition) = 0
    or position('STORE_WITHDRAWAL_OFFER_VERSION_CONFLICT' in v_definition) = 0
    or position('STORE_WITHDRAWAL_REDUCTION_EXCEEDS_AVAILABLE' in v_definition) = 0
    or position('status = ''withdrawal_pending''' in v_definition) = 0
    or position('withdrawal_effective_at = v_request.effective_at' in v_definition) = 0
    or position('version = offer_row.version + 1' in v_definition) = 0
    or position('v_request.offer_version_at_request' in v_definition) = 0
    or position('v_request.completion_offer_status' in v_definition) = 0
  then
    raise exception 'STORE_WITHDRAWAL_REQUEST_FUNCTION_INCOMPLETE';
  end if;

  v_definition := pg_get_functiondef(v_processor_function);
  if position('for update skip locked' in lower(v_definition)) = 0
    or position('quantity_reserved > 0' in v_definition) = 0
    or position('inventory_reserved' in v_definition) = 0
    or position('v_now + interval ''1 minute''' in v_definition) = 0
    or position('economy_private.post_inventory_transaction_v2' in v_definition) = 0
    or position('''withdraw_offer''' in v_definition) = 0
    or position('''store_listing_source''' in v_definition) = 0
    or position('''finished_goods_destination''' in v_definition) = 0
    or position('quantity = v_finished_holding_after.quantity_owned' in v_definition) = 0
    or position('status = ''completed''' in v_definition) = 0
    or position('withdrawal_request_id = null' in v_definition) = 0
    or position('completion_offer_status = v_next_status' in v_definition) = 0
    or position('completion_offer_version = v_offer.version + 1' in v_definition) = 0
    or position('STORE_WITHDRAWAL_PROCESS_FINISHED_COST_CURRENCY_MISMATCH' in v_definition) = 0
  then
    raise exception 'STORE_WITHDRAWAL_PROCESSOR_INCOMPLETE';
  end if;

  v_definition := pg_get_functiondef(v_offer_guard);
  if position('STORE_SELLER_OFFER_WITHDRAWAL_PENDING_MUTATION_FORBIDDEN' in v_definition) = 0
    or position('withdrawal_pending->active' in v_definition) = 0
    or position('withdrawal_pending->paused' in v_definition) = 0
    or position('STORE_SELLER_OFFER_WITHDRAWAL_NOT_COMPLETED' in v_definition) = 0
  then
    raise exception 'STORE_WITHDRAWAL_OFFER_GUARD_INCOMPLETE';
  end if;

  v_definition := pg_get_functiondef(v_request_guard);
  if position('new.effective_at := new.requested_at + interval ''5 minutes''' in v_definition) = 0
    or position('STORE_WITHDRAWAL_REQUEST_COMPLETED_TERMINAL' in v_definition) = 0
    or position('pending->completed' in v_definition) = 0
    or position('STORE_WITHDRAWAL_REQUEST_OFFER_VERSION_DRIFT' in v_definition) = 0
    or position('STORE_WITHDRAWAL_REQUEST_RETRY_STATE_INVALID' in v_definition) = 0
    or position('STORE_WITHDRAWAL_REQUEST_COMPLETION_STATE_INVALID' in v_definition) = 0
  then
    raise exception 'STORE_WITHDRAWAL_REQUEST_GUARD_INCOMPLETE';
  end if;

  v_definition := pg_get_functiondef(v_aggregation);
  if position('offer.status = ''active''' in v_definition) = 0 then
    raise exception 'STORE_WITHDRAWAL_AGGREGATION_ELIGIBILITY_INVALID';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('store_seller_offers','store_offer_withdrawal_requests')
      and column_name in (
        'listed_quantity','available_quantity','stock_quantity',
        'quantity_owned','quantity_available'
      )
  ) then
    raise exception 'STORE_WITHDRAWAL_PARALLEL_QUANTITY_FORBIDDEN';
  end if;

  if exists (
    select 1
    from public.store_seller_offers as offer_row
    where (
      offer_row.status = 'withdrawal_pending'
      and not exists (
        select 1
        from public.store_offer_withdrawal_requests as request_row
        where request_row.game_session_id = offer_row.game_session_id
          and request_row.id = offer_row.withdrawal_request_id
          and request_row.offer_id = offer_row.id
          and request_row.status = 'pending'
      )
    ) or (
      offer_row.status <> 'withdrawal_pending'
      and offer_row.withdrawal_request_id is not null
    )
  ) then
    raise exception 'STORE_WITHDRAWAL_CURRENT_STATE_INVALID';
  end if;

  if exists (
    select 1
    from public.store_offer_withdrawal_requests as request_row
    join public.store_seller_offers as offer_row
      on offer_row.id = request_row.offer_id
    where request_row.game_session_id <> offer_row.game_session_id
      or request_row.seller_party_id <> offer_row.seller_party_id
      or request_row.game_item_id <> offer_row.game_item_id
      or request_row.inventory_account_id <> offer_row.inventory_account_id
  ) then
    raise exception 'STORE_WITHDRAWAL_GAME_SCOPE_INVALID';
  end if;
end
$assertions$;

commit;
