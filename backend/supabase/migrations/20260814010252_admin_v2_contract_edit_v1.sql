-- Source SQL for a new Supabase migration generated with:
--   supabase migration new admin_v2_contract_edit_v1
-- Do not edit the already-applied 20260805023228 migration. This CREATE OR REPLACE
-- extends the existing idempotent Admin contract RPC with a bounded `update` operation.

create or replace function public.admin_mutate_contract_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_operation text,
  p_contract_id uuid,
  p_contract_payload jsonb,
  p_request_payload jsonb,
  p_idempotency_key text,
  p_request_id text
)
returns table(response_status integer, response_body jsonb, was_replayed boolean)
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_operation text := lower(btrim(coalesce(p_operation, '')));
  v_payload jsonb := coalesce(p_contract_payload, '{}'::jsonb);
  v_claim record;
  v_contract_id uuid;
  v_contract jsonb;
  v_existing_contract public.game_session_contracts%rowtype;
  v_status integer;
  v_action text;
  v_body jsonb;
  v_already_archived boolean := false;
begin
  if v_operation not in ('create', 'update', 'publish', 'archive', 'duplicate')
    or jsonb_typeof(v_payload) <> 'object'
  then
    raise exception 'ADMIN_CONTRACT_OPERATION_INVALID' using errcode = 'P0001';
  end if;

  select * into v_claim
  from private.begin_admin_mutation_v1(
    p_game_session_id,
    p_staff_user_id,
    'contracts.' || v_operation,
    p_idempotency_key,
    p_request_payload
  );
  if v_claim.was_replayed then
    return query select v_claim.response_status, v_claim.response_body, true;
    return;
  end if;

  if v_operation = 'create' then
    begin
      insert into public.game_session_contracts(
        game_session_id, contract_template_id, contract_key, source_type, source_id,
        created_by_staff_id, title, description, instructions, category, status,
        visibility, targeting_payload, requirements_payload, reward_payload,
        completion_mode, published_at, deadline_at, expires_at, metadata
      ) values (
        p_game_session_id,
        nullif(v_payload ->> 'contractTemplateId', '')::uuid,
        v_payload ->> 'contractKey',
        'teacher',
        null,
        p_staff_user_id,
        v_payload ->> 'title',
        v_payload ->> 'description',
        v_payload ->> 'instructions',
        v_payload ->> 'category',
        v_payload ->> 'status',
        v_payload ->> 'visibility',
        coalesce(v_payload -> 'targetingPayload', '{}'::jsonb),
        coalesce(v_payload -> 'requirementsPayload', '{}'::jsonb),
        coalesce(v_payload -> 'rewardPayload', '{}'::jsonb),
        v_payload ->> 'completionMode',
        case
          when v_payload ->> 'status' = 'active'
            then coalesce(nullif(v_payload ->> 'publishedAt', '')::timestamptz, now())
          else nullif(v_payload ->> 'publishedAt', '')::timestamptz
        end,
        nullif(v_payload ->> 'deadlineAt', '')::timestamptz,
        nullif(v_payload ->> 'expiresAt', '')::timestamptz,
        coalesce(v_payload -> 'metadata', '{}'::jsonb)
      ) returning id into v_contract_id;
    exception when unique_violation then
      raise exception 'ADMIN_CONTRACT_CONFLICT' using errcode = 'P0001';
    end;
    v_status := 201;
    v_action := 'contracts.created';

  elsif v_operation = 'update' then
    select contract_row.* into v_existing_contract
    from public.game_session_contracts as contract_row
    where contract_row.game_session_id = p_game_session_id
      and contract_row.id = p_contract_id
    for update;
    if not found then
      raise exception 'ADMIN_CONTRACT_NOT_FOUND' using errcode = 'P0001';
    end if;
    if v_existing_contract.source_type <> 'teacher' then
      raise exception 'ADMIN_CONTRACT_NOT_EDITABLE' using errcode = 'P0001';
    end if;
    if v_existing_contract.status not in ('draft', 'scheduled') then
      raise exception 'ADMIN_CONTRACT_NOT_EDITABLE' using errcode = 'P0001';
    end if;
    if coalesce(v_payload ->> 'status', '') not in ('draft', 'scheduled') then
      raise exception 'ADMIN_CONTRACT_STATUS_NOT_EDITABLE' using errcode = 'P0001';
    end if;
    if v_payload ->> 'status' = 'scheduled'
      and nullif(v_payload ->> 'publishedAt', '') is null
    then
      raise exception 'ADMIN_CONTRACT_SCHEDULE_REQUIRED' using errcode = 'P0001';
    end if;

    update public.game_session_contracts as contract_row
    set
      title = v_payload ->> 'title',
      description = v_payload ->> 'description',
      instructions = v_payload ->> 'instructions',
      category = v_payload ->> 'category',
      status = v_payload ->> 'status',
      visibility = v_payload ->> 'visibility',
      targeting_payload = case
        when jsonb_object_length(coalesce(v_payload -> 'targetingPayload', '{}'::jsonb)) = 0
          then coalesce(v_existing_contract.targeting_payload, '{}'::jsonb)
        else v_payload -> 'targetingPayload'
      end,
      requirements_payload = jsonb_strip_nulls(
        coalesce(v_existing_contract.requirements_payload, '{}'::jsonb)
        || coalesce(v_payload -> 'requirementsPayload', '{}'::jsonb)
      ),
      reward_payload = jsonb_strip_nulls(
        coalesce(v_existing_contract.reward_payload, '{}'::jsonb)
        || coalesce(v_payload -> 'rewardPayload', '{}'::jsonb)
      ),
      completion_mode = v_payload ->> 'completionMode',
      published_at = case
        when v_payload ->> 'status' = 'scheduled'
          then nullif(v_payload ->> 'publishedAt', '')::timestamptz
        else null
      end,
      deadline_at = nullif(v_payload ->> 'deadlineAt', '')::timestamptz,
      expires_at = nullif(v_payload ->> 'expiresAt', '')::timestamptz,
      metadata = jsonb_strip_nulls(
        coalesce(v_existing_contract.metadata, '{}'::jsonb)
        || coalesce(v_payload -> 'metadata', '{}'::jsonb)
      ),
      updated_at = now()
    where contract_row.game_session_id = p_game_session_id
      and contract_row.id = p_contract_id
    returning contract_row.id into v_contract_id;
    v_status := 200;
    v_action := 'contracts.updated';

  elsif v_operation = 'publish' then
    select contract_row.* into v_existing_contract
    from public.game_session_contracts as contract_row
    where contract_row.game_session_id = p_game_session_id
      and contract_row.id = p_contract_id
    for update;
    if not found then
      raise exception 'ADMIN_CONTRACT_NOT_FOUND' using errcode = 'P0001';
    end if;
    if v_existing_contract.status not in ('draft', 'scheduled') then
      raise exception 'ADMIN_CONTRACT_NOT_PUBLISHABLE' using errcode = 'P0001';
    end if;
    update public.game_session_contracts as contract_row
    set status = 'active',
        published_at = coalesce(nullif(v_payload ->> 'publishedAt', '')::timestamptz, now()),
        updated_at = now()
    where contract_row.game_session_id = p_game_session_id
      and contract_row.id = p_contract_id
    returning contract_row.id into v_contract_id;
    v_status := 200;
    v_action := 'contracts.published';

  elsif v_operation = 'archive' then
    select contract_row.* into v_existing_contract
    from public.game_session_contracts as contract_row
    where contract_row.game_session_id = p_game_session_id
      and contract_row.id = p_contract_id
    for update;
    if not found then
      raise exception 'ADMIN_CONTRACT_NOT_FOUND' using errcode = 'P0001';
    end if;
    v_contract_id := v_existing_contract.id;
    v_already_archived := v_existing_contract.status = 'archived';
    if not v_already_archived then
      update public.game_session_contracts as contract_row
      set status = 'archived', updated_at = now()
      where contract_row.game_session_id = p_game_session_id
        and contract_row.id = p_contract_id;
    end if;
    v_status := 200;
    v_action := 'contracts.contract_archived';

  else
    select contract_row.* into v_existing_contract
    from public.game_session_contracts as contract_row
    where contract_row.game_session_id = p_game_session_id
      and contract_row.id = p_contract_id
    for share;
    if not found then
      raise exception 'ADMIN_CONTRACT_NOT_FOUND' using errcode = 'P0001';
    end if;
    begin
      insert into public.game_session_contracts(
        game_session_id, contract_template_id, contract_key, source_type, source_id,
        created_by_staff_id, title, description, instructions, category, status,
        visibility, targeting_payload, requirements_payload, reward_payload,
        completion_mode, published_at, deadline_at, expires_at, metadata
      ) values (
        p_game_session_id,
        v_existing_contract.contract_template_id,
        left(coalesce(nullif(v_existing_contract.contract_key, ''), 'contract'), 42)
          || '-copy-' || left(encode(extensions.digest(convert_to(p_idempotency_key, 'UTF8'), 'sha256'), 'hex'), 16),
        'teacher', null, p_staff_user_id,
        v_existing_contract.title || ' (Copy)',
        v_existing_contract.description,
        v_existing_contract.instructions,
        v_existing_contract.category,
        'draft',
        v_existing_contract.visibility,
        coalesce(v_existing_contract.targeting_payload, '{}'::jsonb),
        coalesce(v_existing_contract.requirements_payload, '{}'::jsonb),
        coalesce(v_existing_contract.reward_payload, '{}'::jsonb),
        v_existing_contract.completion_mode,
        null,
        v_existing_contract.deadline_at,
        v_existing_contract.expires_at,
        coalesce(v_existing_contract.metadata, '{}'::jsonb)
          || jsonb_build_object('duplicatedFromContractId', p_contract_id, 'duplicatedAt', now())
      ) returning id into v_contract_id;
    exception when unique_violation then
      raise exception 'ADMIN_CONTRACT_CONFLICT' using errcode = 'P0001';
    end;
    v_status := 201;
    v_action := 'contracts.contract_duplicated';
  end if;

  select to_jsonb(contract_row) into v_contract
  from public.game_session_contracts as contract_row
  where contract_row.game_session_id = p_game_session_id
    and contract_row.id = v_contract_id;

  v_body := jsonb_build_object('contract', v_contract);
  if v_operation = 'archive' then
    v_body := v_body || jsonb_build_object('archived', true, 'alreadyArchived', v_already_archived);
  elsif v_operation = 'duplicate' then
    v_body := v_body || jsonb_build_object('duplicated', true, 'sourceContractId', p_contract_id);
  end if;

  return query
  select * from private.complete_admin_mutation_v1(
    p_staff_user_id,
    p_idempotency_key,
    v_status,
    v_body,
    v_action,
    'game_session_contract',
    v_contract_id,
    jsonb_build_object(
      'requestId', nullif(btrim(coalesce(p_request_id, '')), ''),
      'status', v_contract ->> 'status',
      'sourceContractId', case when v_operation = 'duplicate' then p_contract_id else null end,
      'previousStatus', case when v_operation in ('archive', 'update') then v_existing_contract.status else null end
    )
  );
end;
$function$;
