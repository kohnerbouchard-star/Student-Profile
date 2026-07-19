-- Add one atomic, replay-safe staff ledger adjustment boundary.
-- BETA-BANK-004 requires every accepted economic mutation to produce exactly one
-- ledger entry while duplicate delivery replays the original result.

create or replace function public.record_idempotent_staff_ledger_adjustment_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_staff_user_id uuid,
  p_route_key text,
  p_idempotency_key text,
  p_account_type text,
  p_amount numeric,
  p_currency_code text,
  p_entry_type text,
  p_source_domain text,
  p_source_action text,
  p_source_id uuid default null,
  p_audit_metadata jsonb default '{}'::jsonb
)
returns table (
  outcome text,
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
as $$
declare
  v_now timestamptz := now();
  v_route_key text := btrim(coalesce(p_route_key, ''));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_request_hash text;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_ledger record;
  v_cached jsonb;
begin
  if p_game_session_id is null then
    raise exception 'GAME_SESSION_REQUIRED';
  end if;
  if p_player_id is null then
    raise exception 'PLAYER_REQUIRED';
  end if;
  if p_staff_user_id is null then
    raise exception 'STAFF_USER_REQUIRED';
  end if;
  if length(v_route_key) = 0 then
    raise exception 'LEDGER_IDEMPOTENCY_ROUTE_REQUIRED';
  end if;
  if length(v_idempotency_key) = 0 then
    raise exception 'LEDGER_IDEMPOTENCY_KEY_REQUIRED';
  end if;
  if jsonb_typeof(coalesce(p_audit_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'INVALID_AUDIT_METADATA';
  end if;

  v_request_hash := encode(
    extensions.digest(
      jsonb_build_object(
        'gameSessionId', p_game_session_id,
        'playerId', p_player_id,
        'staffUserId', p_staff_user_id,
        'routeKey', v_route_key,
        'accountType', btrim(coalesce(p_account_type, '')),
        'amount', p_amount,
        'currencyCode', upper(btrim(coalesce(p_currency_code, ''))),
        'entryType', lower(btrim(coalesce(p_entry_type, ''))),
        'sourceDomain', btrim(coalesce(p_source_domain, '')),
        'sourceAction', btrim(coalesce(p_source_action, '')),
        'sourceId', p_source_id,
        'auditMetadata', coalesce(p_audit_metadata, '{}'::jsonb)
      )::text,
      'sha256'
    ),
    'hex'
  );

  insert into public.mutation_idempotency_keys (
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
    v_route_key,
    v_idempotency_key,
    v_request_hash,
    'STARTED',
    v_now + interval '30 days'
  )
  on conflict on constraint mutation_idempotency_keys_scope_unique
  do nothing;

  select key_row.*
  into v_idempotency
  from public.mutation_idempotency_keys key_row
  where key_row.game_session_id = p_game_session_id
    and key_row.player_id = p_player_id
    and key_row.route_key = v_route_key
    and key_row.idempotency_key = v_idempotency_key
  for update;

  if not found then
    raise exception 'LEDGER_IDEMPOTENCY_LOOKUP_FAILED';
  end if;

  if v_idempotency.request_hash <> v_request_hash then
    raise exception 'LEDGER_IDEMPOTENCY_CONFLICT';
  end if;

  if v_idempotency.status = 'COMPLETED' then
    v_cached := v_idempotency.response_body;
    if v_idempotency.result_id is null or jsonb_typeof(v_cached) <> 'object' then
      raise exception 'LEDGER_IDEMPOTENCY_RESULT_MISSING';
    end if;

    return query select
      'replayed'::text,
      (v_cached ->> 'ledgerEntryId')::uuid,
      (v_cached ->> 'accountBalanceId')::uuid,
      v_cached ->> 'accountType',
      (v_cached ->> 'balance')::numeric,
      v_cached ->> 'currencyCode',
      (v_cached ->> 'createdAt')::timestamptz;
    return;
  end if;

  if v_idempotency.status <> 'STARTED' then
    raise exception 'LEDGER_IDEMPOTENCY_IN_PROGRESS';
  end if;

  select *
  into v_ledger
  from public.record_player_ledger_entry(
    p_game_session_id,
    p_player_id,
    p_account_type,
    p_amount,
    p_currency_code,
    p_entry_type,
    p_source_domain,
    p_source_action,
    p_source_id,
    'staff_user',
    p_staff_user_id,
    coalesce(p_audit_metadata, '{}'::jsonb) || jsonb_build_object(
      'idempotencyKey', v_idempotency_key,
      'routeKey', v_route_key
    )
  );

  v_cached := jsonb_build_object(
    'ledgerEntryId', v_ledger.ledger_entry_id,
    'accountBalanceId', v_ledger.account_balance_id,
    'accountType', v_ledger.account_type,
    'balance', v_ledger.balance,
    'currencyCode', v_ledger.currency_code,
    'createdAt', v_ledger.created_at
  );

  update public.mutation_idempotency_keys
  set status = 'COMPLETED',
      result_type = 'ledger_entry',
      result_id = v_ledger.ledger_entry_id,
      response_body = v_cached,
      completed_at = v_now
  where id = v_idempotency.id;

  return query select
    'applied'::text,
    v_ledger.ledger_entry_id,
    v_ledger.account_balance_id,
    v_ledger.account_type,
    v_ledger.balance,
    v_ledger.currency_code,
    v_ledger.created_at;
end;
$$;

comment on function public.record_idempotent_staff_ledger_adjustment_v1(
  uuid, uuid, uuid, text, text, text, numeric, text, text, text, text, uuid, jsonb
) is
  'Atomically records one staff-owned ledger adjustment and replays the original result for an identical game/player/route/idempotency key.';

revoke all on function public.record_idempotent_staff_ledger_adjustment_v1(
  uuid, uuid, uuid, text, text, text, numeric, text, text, text, text, uuid, jsonb
) from public, anon, authenticated;

grant execute on function public.record_idempotent_staff_ledger_adjustment_v1(
  uuid, uuid, uuid, text, text, text, numeric, text, text, text, text, uuid, jsonb
) to service_role;
