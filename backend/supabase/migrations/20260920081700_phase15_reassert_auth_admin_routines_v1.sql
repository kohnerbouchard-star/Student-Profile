-- Phase 15 canonical routine convergence: current authentication and Admin contracts.
-- Definitions are copied from their latest immutable repository migrations.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Source: 20260731133100_resolve_player_contract_public_key_v3.sql
create or replace function public.accept_player_contract_by_key(
  p_game_session_id uuid,
  p_player_id uuid,
  p_contract_key text
)
returns table (
  accept_outcome text,
  contract_key text,
  progress_status text,
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contract_id uuid;
  v_template_id uuid;
  v_alias_count integer := 0;
  v_public_contract_key text := btrim(coalesce(p_contract_key, ''));
  v_progress public.player_contract_progress%rowtype;
begin
  if p_game_session_id is null or p_player_id is null or length(v_public_contract_key) = 0 then
    raise exception 'PLAYER_CONTRACT_ACCEPT_SCOPE_REQUIRED';
  end if;

  -- Exact live keys are authoritative and always take precedence over aliases.
  select contract.id
  into v_contract_id
  from public.game_session_contracts contract
  join public.game_sessions game
    on game.id = contract.game_session_id
   and game.status = 'active'
  join public.players player
    on player.game_session_id = game.id
   and player.id = p_player_id
   and player.status = 'active'
  where contract.game_session_id = p_game_session_id
    and contract.contract_key = v_public_contract_key
    and contract.status in ('active', 'scheduled')
    and contract.visibility in ('public', 'targeted')
    and contract.published_at is not null
    and contract.published_at <= now()
    and (contract.expires_at is null or contract.expires_at > now())
    and (
      contract.visibility = 'public'
      or exists (
        select 1
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(contract.targeting_payload -> 'playerIds') = 'array'
              then contract.targeting_payload -> 'playerIds'
            else '[]'::jsonb
          end
        ) target(value)
        where upper(btrim(target.value)) = upper(p_player_id::text)
      )
      or exists (
        select 1
        from public.player_country_assignments assignment
        join public.country_profiles country
          on country.id = assignment.country_profile_id
        cross join lateral jsonb_array_elements_text(
          case
            when jsonb_typeof(contract.targeting_payload -> 'countryCodes') = 'array'
              then contract.targeting_payload -> 'countryCodes'
            else '[]'::jsonb
          end
        ) target(value)
        where assignment.game_session_id = p_game_session_id
          and assignment.player_id = p_player_id
          and assignment.status = 'active'
          and upper(btrim(target.value)) = upper(btrim(country.country_code))
      )
      or (
        player.roster_label is not null
        and exists (
          select 1
          from jsonb_array_elements_text(
            case
              when jsonb_typeof(contract.targeting_payload -> 'rosterLabels') = 'array'
                then contract.targeting_payload -> 'rosterLabels'
              else '[]'::jsonb
            end
          ) target(value)
          where upper(btrim(target.value)) = upper(btrim(player.roster_label))
        )
      )
    )
  for share of contract;

  if not found then
    -- A stable template key is only an alias. Lock the template row, then lock
    -- at most two eligible live candidates so ambiguity is rejected rather
    -- than resolved by recency or an internal identifier.
    select template.id
    into v_template_id
    from public.contract_templates template
    where template.template_key = v_public_contract_key
      and template.is_active = true
    for update of template;

    if found then
      select count(*), min(candidate.id::text)::uuid
      into v_alias_count, v_contract_id
      from (
        select contract.id
        from public.game_session_contracts contract
        join public.game_sessions game
          on game.id = contract.game_session_id
         and game.status = 'active'
        join public.players player
          on player.game_session_id = game.id
         and player.id = p_player_id
         and player.status = 'active'
        where contract.game_session_id = p_game_session_id
          and contract.contract_template_id = v_template_id
          and contract.status in ('active', 'scheduled')
          and contract.visibility in ('public', 'targeted')
          and contract.published_at is not null
          and contract.published_at <= now()
          and (contract.expires_at is null or contract.expires_at > now())
          and (
            contract.visibility = 'public'
            or exists (
              select 1
              from jsonb_array_elements_text(
                case
                  when jsonb_typeof(contract.targeting_payload -> 'playerIds') = 'array'
                    then contract.targeting_payload -> 'playerIds'
                  else '[]'::jsonb
                end
              ) target(value)
              where upper(btrim(target.value)) = upper(p_player_id::text)
            )
            or exists (
              select 1
              from public.player_country_assignments assignment
              join public.country_profiles country
                on country.id = assignment.country_profile_id
              cross join lateral jsonb_array_elements_text(
                case
                  when jsonb_typeof(contract.targeting_payload -> 'countryCodes') = 'array'
                    then contract.targeting_payload -> 'countryCodes'
                  else '[]'::jsonb
                end
              ) target(value)
              where assignment.game_session_id = p_game_session_id
                and assignment.player_id = p_player_id
                and assignment.status = 'active'
                and upper(btrim(target.value)) = upper(btrim(country.country_code))
            )
            or (
              player.roster_label is not null
              and exists (
                select 1
                from jsonb_array_elements_text(
                  case
                    when jsonb_typeof(contract.targeting_payload -> 'rosterLabels') = 'array'
                      then contract.targeting_payload -> 'rosterLabels'
                    else '[]'::jsonb
                  end
                ) target(value)
                where upper(btrim(target.value)) = upper(btrim(player.roster_label))
              )
            )
          )
        order by contract.id
        limit 2
        for share of contract
      ) candidate;

      if v_alias_count > 1 then
        raise exception 'PLAYER_CONTRACT_PUBLIC_KEY_AMBIGUOUS';
      end if;
    end if;
  end if;

  if v_contract_id is null then
    accept_outcome := 'not_available';
    contract_key := v_public_contract_key;
    progress_status := null;
    accepted_at := null;
    return next;
    return;
  end if;

  insert into public.player_contract_progress (
    game_session_id,
    contract_id,
    player_id,
    status
  )
  values (
    p_game_session_id,
    v_contract_id,
    p_player_id,
    'in_progress'
  )
  on conflict (game_session_id, contract_id, player_id) do nothing
  returning * into v_progress;

  if found then
    accept_outcome := 'accepted';
  else
    select progress.*
    into v_progress
    from public.player_contract_progress progress
    where progress.game_session_id = p_game_session_id
      and progress.contract_id = v_contract_id
      and progress.player_id = p_player_id
    for update;

    if not found then
      raise exception 'PLAYER_CONTRACT_ACCEPT_PROGRESS_MISSING';
    end if;

    if v_progress.status = 'available' then
      update public.player_contract_progress progress
      set status = 'in_progress'
      where progress.id = v_progress.id
        and progress.status = 'available'
      returning progress.* into v_progress;

      if found then
        accept_outcome := 'accepted';
      else
        select progress.*
        into v_progress
        from public.player_contract_progress progress
        where progress.id = v_progress.id
        for update;

        accept_outcome := case
          when v_progress.status = 'in_progress' then 'already_accepted'
          else 'locked'
        end;
      end if;
    elsif v_progress.status = 'in_progress' then
      accept_outcome := 'already_accepted';
    else
      accept_outcome := 'locked';
    end if;
  end if;

  contract_key := v_public_contract_key;
  progress_status := v_progress.status;
  accepted_at := v_progress.updated_at;
  return next;
end;
$$;

-- Source: 20260731130000_add_verified_staff_onboarding_v1.sql
create or replace function public.activate_verified_staff_identity_v1(
  p_auth_user_id uuid
)
returns table (
  staff_user_id uuid,
  staff_email text,
  staff_display_name text,
  staff_status text,
  staff_role text,
  permission_version integer,
  security_version bigint,
  mfa_required boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_request private.staff_signup_requests%rowtype;
  v_auth_user auth.users%rowtype;
  v_staff public.staff_users%rowtype;
begin
  select auth_user.*
  into v_auth_user
  from auth.users as auth_user
  where auth_user.id = p_auth_user_id
  for update;

  if v_auth_user.id is null or v_auth_user.email_confirmed_at is null then
    return;
  end if;

  select request_row.*
  into v_request
  from private.staff_signup_requests as request_row
  where request_row.supabase_auth_user_id = p_auth_user_id
    and request_row.status in (
      'pending_email_verification',
      'email_verified',
      'staff_identity_activated'
    )
    and request_row.expires_at > v_now
  for update;

  if v_request.id is null
    or lower(btrim(v_auth_user.email)) <> v_request.normalized_email
  then
    return;
  end if;

  update private.staff_signup_requests
  set
    status = 'email_verified',
    email_verified_at = coalesce(email_verified_at, v_now),
    updated_at = v_now
  where id = v_request.id;

  select staff.*
  into v_staff
  from public.staff_users as staff
  where staff.supabase_auth_user_id = p_auth_user_id
  for update;

  if v_staff.id is null then
    insert into public.staff_users (
      supabase_auth_user_id,
      email,
      display_name,
      status,
      role,
      permission_version,
      security_version,
      mfa_required,
      email_verification_source
    ) values (
      p_auth_user_id,
      v_request.normalized_email,
      v_request.display_name,
      'onboarding',
      'game_admin',
      1,
      1,
      true,
      'signup_confirmation'
    )
    returning * into v_staff;
  end if;

  update private.staff_signup_requests
  set
    status = 'staff_identity_activated',
    staff_user_id = v_staff.id,
    updated_at = v_now
  where id = v_request.id;

  select staff.*
  into v_staff
  from public.staff_users as staff
  where staff.id = v_staff.id;

  return query select
    v_staff.id,
    v_staff.email,
    v_staff.display_name,
    v_staff.status,
    v_staff.role,
    v_staff.permission_version,
    v_staff.security_version,
    v_staff.mfa_required;
end;
$$;

-- Source: 20260805023228_admin_local_application_mutations_v1.sql
create or replace function public.admin_archive_player_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_player_id uuid,
  p_request_payload jsonb,
  p_idempotency_key text,
  p_request_id text
)
returns table (
  response_status integer,
  response_body jsonb,
  was_replayed boolean
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_claim record;
  v_player public.players%rowtype;
  v_previous_status text;
  v_archived_at timestamptz := now();
begin
  select * into v_claim
  from private.begin_admin_mutation_v1(
    p_game_session_id,
    p_staff_user_id,
    'players.archive',
    p_idempotency_key,
    p_request_payload
  );
  if v_claim.was_replayed then
    return query select v_claim.response_status, v_claim.response_body, true;
    return;
  end if;

  select player_row.*
  into v_player
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
  for update;

  if not found then
    raise exception 'ADMIN_PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;
  v_previous_status := v_player.status;

  update public.players as player_row
  set status = 'archived',
      updated_at = v_archived_at
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
  returning player_row.* into v_player;

  update public.player_access_credentials as credential_row
  set status = 'revoked',
      revoked_at = coalesce(credential_row.revoked_at, v_archived_at),
      updated_at = v_archived_at
  where credential_row.game_session_id = p_game_session_id
    and credential_row.player_id = p_player_id
    and credential_row.status = 'active';

  update public.player_sessions as session_row
  set status = 'revoked',
      revoked_at = coalesce(session_row.revoked_at, v_archived_at),
      updated_at = v_archived_at
  where session_row.game_session_id = p_game_session_id
    and session_row.player_id = p_player_id
    and session_row.status = 'active';

  return query
  select * from private.complete_admin_mutation_v1(
    p_staff_user_id,
    p_idempotency_key,
    200,
    jsonb_build_object(
      'archived', true,
      'destructiveDelete', false,
      'alreadyArchived', v_previous_status = 'archived',
      'player', to_jsonb(v_player)
    ),
    'players.player_archived',
    'player',
    p_player_id,
    jsonb_build_object(
      'requestId', nullif(btrim(coalesce(p_request_id, '')), ''),
      'previousStatus', v_previous_status
    )
  );
end;
$function$;

-- Source: 20260805023228_admin_local_application_mutations_v1.sql
create or replace function public.admin_create_player_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_display_name text,
  p_roster_label text,
  p_player_identifier text,
  p_player_identifier_normalized text,
  p_lookup_digest text,
  p_credential_version text,
  p_credential_salt text,
  p_credential_verifier text,
  p_credential_iterations integer,
  p_request_payload jsonb,
  p_idempotency_key text,
  p_request_id text
)
returns table (
  response_status integer,
  response_body jsonb,
  was_replayed boolean
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_claim record;
  v_created record;
  v_identity record;
  v_player public.players%rowtype;
  v_body jsonb;
begin
  select * into v_claim
  from private.begin_admin_mutation_v1(
    p_game_session_id,
    p_staff_user_id,
    'players.create',
    p_idempotency_key,
    p_request_payload
  );
  if v_claim.was_replayed then
    return query select v_claim.response_status, v_claim.response_body, true;
    return;
  end if;

  select *
  into v_created
  from public.create_player_with_balanced_country_assignment(
    p_game_session_id,
    p_display_name,
    p_roster_label,
    jsonb_build_object(
      'route', 'staff.players.create',
      'requestedByStaffUserId', p_staff_user_id,
      'identityMode', 'rfid_player_id_plus_access_code_v2'
    )
  );

  if v_created.player_id is null then
    raise exception 'ADMIN_PLAYER_CREATE_FAILED' using errcode = 'P0001';
  end if;

  select *
  into v_identity
  from public.set_player_identity_and_access_credential_v2(
    p_game_session_id,
    v_created.player_id,
    p_player_identifier,
    p_player_identifier_normalized,
    p_lookup_digest,
    p_credential_version,
    p_credential_salt,
    p_credential_verifier,
    p_credential_iterations
  );

  select player_row.*
  into v_player
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = v_created.player_id;

  if v_identity.player_id is null or v_player.id is null
     or v_identity.credential_created_at is null then
    raise exception 'ADMIN_PLAYER_CREATE_FAILED' using errcode = 'P0001';
  end if;

  v_body := jsonb_build_object('player', jsonb_build_object(
    'player_id', v_player.id,
    'display_name', v_player.display_name,
    'roster_label', v_player.roster_label,
    'player_identifier', v_player.player_identifier,
    'player_status', v_player.status,
    'player_created_at', v_player.created_at,
    'player_updated_at', v_player.updated_at,
    'credential_created_at', v_identity.credential_created_at
  ));
  return query
  select * from private.complete_admin_mutation_v1(
    p_staff_user_id,
    p_idempotency_key,
    201,
    v_body,
    'players.created',
    'player',
    v_player.id,
    jsonb_build_object(
      'requestId', nullif(btrim(coalesce(p_request_id, '')), ''),
      'rosterLabel', p_roster_label
    )
  );
end;
$function$;

-- Source: 20260811072424_admin_v2_teacher_safety_v1.sql
create or replace function public.admin_mutate_store_item_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_operation text,
  p_item_id uuid,
  p_item_payload jsonb,
  p_request_payload jsonb,
  p_idempotency_key text,
  p_request_id text
)
returns table (
  response_status integer,
  response_body jsonb,
  was_replayed boolean
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_operation text := lower(btrim(coalesce(p_operation, '')));
  v_payload jsonb := coalesce(p_item_payload, '{}'::jsonb);
  v_claim record;
  v_item jsonb;
  v_item_uuid uuid;
  v_status integer;
  v_action text;
begin
  if v_operation not in ('create', 'update', 'archive', 'restock', 'rebalance')
     or jsonb_typeof(v_payload) <> 'object' then
    raise exception 'ADMIN_STORE_OPERATION_INVALID' using errcode = 'P0001';
  end if;

  select *
  into v_claim
  from private.begin_admin_mutation_v1(
    p_game_session_id,
    p_staff_user_id,
    'store.' || v_operation,
    p_idempotency_key,
    p_request_payload
  );

  if v_claim.was_replayed then
    return query
    select v_claim.response_status, v_claim.response_body, true;
    return;
  end if;

  -- Seeded physical-pack/system content is part of the simulation baseline.
  -- Generic teacher Edit/Archive must not mutate that definition. Dedicated
  -- restock and rebalance operations remain intentionally separate so a game
  -- can still change availability or price without rewriting item identity.
  if v_operation in ('update', 'archive')
     and exists (
       select 1
       from public.store_items as item_row
       join public.game_items as game_item
         on game_item.game_session_id = item_row.game_session_id
        and game_item.id = item_row.game_item_id
       where item_row.game_session_id = p_game_session_id
         and item_row.id = p_item_id
         and game_item.source_kind in ('physical_pack', 'system')
     ) then
    raise exception 'ADMIN_STORE_SEEDED_ITEM_PROTECTED' using errcode = 'P0001';
  end if;

  if v_operation = 'create' then
    begin
      insert into public.store_items (
        game_session_id,
        item_key,
        name,
        description,
        category,
        price,
        currency_code,
        stock_quantity,
        status,
        visibility,
        sort_order
      ) values (
        p_game_session_id,
        v_payload ->> 'itemKey',
        v_payload ->> 'name',
        nullif(btrim(coalesce(v_payload ->> 'description', '')), ''),
        v_payload ->> 'category',
        (v_payload ->> 'price')::numeric,
        v_payload ->> 'currencyCode',
        (v_payload ->> 'stockQuantity')::integer,
        v_payload ->> 'status',
        v_payload ->> 'visibility',
        (v_payload ->> 'sortOrder')::integer
      )
      returning id into v_item_uuid;
    exception when unique_violation then
      raise exception 'ADMIN_STORE_ITEM_CONFLICT' using errcode = 'P0001';
    end;
    v_status := 201;
    v_action := 'store.item_created';
  elsif v_operation = 'archive' then
    update public.store_items as item_row
    set status = 'archived',
        visibility = 'hidden',
        updated_at = now()
    where item_row.game_session_id = p_game_session_id
      and item_row.id = p_item_id
    returning item_row.id into v_item_uuid;
    v_status := 200;
    v_action := 'store.item_archived';
  elsif v_operation = 'restock' then
    if not (v_payload ? 'quantity')
       or jsonb_typeof(v_payload -> 'quantity') <> 'number'
       or (v_payload ->> 'quantity')::numeric <= 0
       or trunc((v_payload ->> 'quantity')::numeric) <> (v_payload ->> 'quantity')::numeric then
      raise exception 'ADMIN_STORE_RESTOCK_QUANTITY_INVALID' using errcode = 'P0001';
    end if;
    update public.store_items as item_row
    set stock_quantity = item_row.stock_quantity + (v_payload ->> 'quantity')::integer,
        updated_at = now()
    where item_row.game_session_id = p_game_session_id
      and item_row.id = p_item_id
    returning item_row.id into v_item_uuid;
    v_status := 200;
    v_action := 'store.item_restocked';
  elsif v_operation = 'rebalance' then
    if not (v_payload ? 'price')
       or jsonb_typeof(v_payload -> 'price') <> 'number'
       or (v_payload ->> 'price')::numeric < 0 then
      raise exception 'ADMIN_STORE_REBALANCE_PRICE_INVALID' using errcode = 'P0001';
    end if;
    update public.store_items as item_row
    set price = (v_payload ->> 'price')::numeric,
        updated_at = now()
    where item_row.game_session_id = p_game_session_id
      and item_row.id = p_item_id
    returning item_row.id into v_item_uuid;
    v_status := 200;
    v_action := 'store.item_price_rebalanced';
  else
    update public.store_items as item_row
    set name = case when v_payload ? 'name' then v_payload ->> 'name' else item_row.name end,
        description = case when v_payload ? 'description'
          then nullif(btrim(coalesce(v_payload ->> 'description', '')), '')
          else item_row.description end,
        category = case when v_payload ? 'category' then v_payload ->> 'category' else item_row.category end,
        price = case when v_payload ? 'price' then (v_payload ->> 'price')::numeric else item_row.price end,
        currency_code = case when v_payload ? 'currencyCode' then v_payload ->> 'currencyCode' else item_row.currency_code end,
        stock_quantity = case when v_payload ? 'stockQuantity' then (v_payload ->> 'stockQuantity')::integer else item_row.stock_quantity end,
        status = case when v_payload ? 'status' then v_payload ->> 'status' else item_row.status end,
        visibility = case when v_payload ? 'visibility' then v_payload ->> 'visibility' else item_row.visibility end,
        sort_order = case when v_payload ? 'sortOrder' then (v_payload ->> 'sortOrder')::integer else item_row.sort_order end,
        updated_at = now()
    where item_row.game_session_id = p_game_session_id
      and item_row.id = p_item_id
    returning item_row.id into v_item_uuid;
    v_status := 200;
    v_action := 'store.item_updated';
  end if;

  if v_item_uuid is null then
    raise exception 'ADMIN_STORE_ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  select to_jsonb(item_row)
  into v_item
  from public.store_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.id = v_item_uuid;

  return query
  select *
  from private.complete_admin_mutation_v1(
    p_staff_user_id,
    p_idempotency_key,
    v_status,
    case when v_operation = 'restock'
      then jsonb_build_object(
        'item', v_item,
        'quantityAdded', (v_payload ->> 'quantity')::integer
      )
      else jsonb_build_object('item', v_item)
    end,
    v_action,
    'store_item',
    v_item_uuid,
    jsonb_build_object(
      'requestId', nullif(btrim(coalesce(p_request_id, '')), ''),
      'changedFields', coalesce(
        (
          select jsonb_agg(field_name order by field_name)
          from jsonb_object_keys(v_payload) as fields(field_name)
        ),
        '[]'::jsonb
      )
    )
  );
end;
$function$;

-- Source: 20260805023228_admin_local_application_mutations_v1.sql
create or replace function public.admin_read_mutation_replay_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_request_payload jsonb
)
returns table (
  has_replay boolean,
  response_status integer,
  response_body jsonb
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_operation text := btrim(coalesce(p_operation, ''));
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_payload jsonb := coalesce(p_request_payload, '{}'::jsonb);
  v_fingerprint text;
  v_existing private.admin_mutation_requests%rowtype;
begin
  perform private.assert_admin_game_owned_v1(
    p_game_session_id,
    p_staff_user_id
  );
  if v_operation !~ '^[a-z][a-z0-9_.-]{2,79}$'
     or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
     or jsonb_typeof(v_payload) <> 'object' then
    raise exception 'ADMIN_MUTATION_IDEMPOTENCY_INVALID' using errcode = 'P0001';
  end if;

  v_fingerprint := private.admin_mutation_fingerprint_v1(
    p_game_session_id,
    v_operation,
    v_payload
  );
  select *
  into v_existing
  from private.admin_mutation_requests as request_row
  where request_row.staff_user_id = p_staff_user_id
    and request_row.idempotency_key = v_key;

  if not found then
    return query select false, null::integer, null::jsonb;
    return;
  end if;
  if v_existing.game_session_id <> p_game_session_id
     or v_existing.operation <> v_operation
     or v_existing.request_fingerprint <> v_fingerprint then
    raise exception 'ADMIN_MUTATION_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;
  if v_existing.status <> 'completed'
     or v_existing.response_status is null
     or v_existing.response_body is null then
    raise exception 'ADMIN_MUTATION_IDEMPOTENCY_IN_PROGRESS' using errcode = 'P0001';
  end if;

  return query select true, v_existing.response_status, v_existing.response_body;
end;
$function$;

-- Source: 20260805023228_admin_local_application_mutations_v1.sql
create or replace function public.admin_record_attendance_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_operation text,
  p_player_id uuid,
  p_attendance_date date,
  p_status text,
  p_clocked_in_at timestamptz,
  p_note text,
  p_reward_amount numeric,
  p_currency_code text,
  p_response_context jsonb,
  p_request_payload jsonb,
  p_idempotency_key text,
  p_request_id text
)
returns table (
  response_status integer,
  response_body jsonb,
  was_replayed boolean
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_operation text := lower(btrim(coalesce(p_operation, '')));
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_context jsonb := coalesce(p_response_context, '{}'::jsonb);
  v_claim record;
  v_attendance jsonb;
  v_attendance_id uuid;
begin
  if v_operation not in ('manual', 'scan')
     or p_player_id is null
     or p_attendance_date is null
     or jsonb_typeof(v_context) <> 'object' then
    raise exception 'ADMIN_ATTENDANCE_OPERATION_INVALID' using errcode = 'P0001';
  end if;

  select * into v_claim
  from private.begin_admin_mutation_v1(
    p_game_session_id,
    p_staff_user_id,
    'attendance.' || v_operation,
    p_idempotency_key,
    p_request_payload
  );
  if v_claim.was_replayed then
    return query select v_claim.response_status, v_claim.response_body, true;
    return;
  end if;

  perform private.lock_attendance_day_mutation_v1(
    p_game_session_id,
    p_attendance_date
  );

  if not exists (
    select 1 from public.players as player_row
    where player_row.game_session_id = p_game_session_id
      and player_row.id = p_player_id
      and (v_operation = 'manual' or player_row.status = 'active')
  ) then
    raise exception 'ADMIN_ATTENDANCE_PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.attendance_day_locks as lock_row
    where lock_row.game_session_id = p_game_session_id
      and lock_row.attendance_date = p_attendance_date
      and lock_row.status = 'locked'
  ) then
    raise exception 'ADMIN_ATTENDANCE_PERIOD_LOCKED' using errcode = 'P0001';
  end if;

  if v_operation = 'manual' then
    if v_status not in ('present', 'late', 'absent', 'excused') then
      raise exception 'ADMIN_ATTENDANCE_STATUS_INVALID' using errcode = 'P0001';
    end if;

    insert into public.player_attendance_records (
      game_session_id,
      player_id,
      attendance_date,
      status,
      clocked_in_at,
      source,
      note,
      corrected_by_staff_user_id,
      corrected_at
    ) values (
      p_game_session_id,
      p_player_id,
      p_attendance_date,
      v_status,
      p_clocked_in_at,
      'staff_correction',
      nullif(btrim(coalesce(p_note, '')), ''),
      p_staff_user_id,
      now()
    )
    on conflict on constraint player_attendance_records_scope_unique
    do update set
      status = excluded.status,
      clocked_in_at = excluded.clocked_in_at,
      source = excluded.source,
      note = excluded.note,
      corrected_by_staff_user_id = excluded.corrected_by_staff_user_id,
      corrected_at = excluded.corrected_at
    returning id into v_attendance_id;

    select to_jsonb(attendance_row)
    into v_attendance
    from public.player_attendance_records as attendance_row
    where attendance_row.id = v_attendance_id;
  else
    if v_status not in ('present', 'late') then
      raise exception 'ADMIN_ATTENDANCE_STATUS_INVALID' using errcode = 'P0001';
    end if;

    select to_jsonb(attendance_result)
    into v_attendance
    from private.record_attendance_clock_in_core_v1(
      p_game_session_id,
      p_player_id,
      p_attendance_date,
      v_status,
      coalesce(p_reward_amount, 0),
      upper(btrim(coalesce(p_currency_code, 'ECO'))),
      nullif(btrim(coalesce(p_request_id, '')), ''),
      'staff_user',
      p_staff_user_id,
      'admin_api_local_staff_attendance_scan',
      false
    ) as attendance_result;
    v_attendance_id := (v_attendance->>'attendance_id')::uuid;
  end if;

  if v_attendance_id is null or v_attendance is null then
    raise exception 'ADMIN_ATTENDANCE_RECORD_FAILED' using errcode = 'P0001';
  end if;

  return query
  select * from private.complete_admin_mutation_v1(
    p_staff_user_id,
    p_idempotency_key,
    200,
    jsonb_build_object('attendance', v_attendance, 'context', v_context),
    case when v_operation = 'manual'
      then 'attendance.manual_correction'
      else 'attendance.staff_scan'
    end,
    'player_attendance_record',
    v_attendance_id,
    jsonb_build_object(
      'requestId', nullif(btrim(coalesce(p_request_id, '')), ''),
      'playerId', p_player_id,
      'attendanceDate', p_attendance_date,
      'status', v_status
    )
  );
end;
$function$;

-- Source: 20260805023228_admin_local_application_mutations_v1.sql
create or replace function public.admin_rotate_game_join_code_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_request_payload jsonb,
  p_idempotency_key text,
  p_request_id text
)
returns table (
  response_status integer,
  response_body jsonb,
  was_replayed boolean
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_claim record;
  v_join_code record;
begin
  select * into v_claim
  from private.begin_admin_mutation_v1(
    p_game_session_id,
    p_staff_user_id,
    'games.join-code.rotate',
    p_idempotency_key,
    p_request_payload
  );
  if v_claim.was_replayed then
    return query select v_claim.response_status, v_claim.response_body, true;
    return;
  end if;

  select *
  into v_join_code
  from public.issue_game_join_code_v1(
    p_game_session_id,
    p_staff_user_id
  );

  if v_join_code.game_join_code is null
     or v_join_code.game_join_code_status <> 'active'
     or v_join_code.updated_at is null then
    raise exception 'ADMIN_GAME_JOIN_CODE_ROTATION_FAILED' using errcode = 'P0001';
  end if;

  return query
  select * from private.complete_admin_mutation_v1(
    p_staff_user_id,
    p_idempotency_key,
    200,
    jsonb_build_object('joinCode', to_jsonb(v_join_code)),
    'game.join_code_rotated',
    'game_session',
    p_game_session_id,
    jsonb_build_object(
      'requestId', nullif(btrim(coalesce(p_request_id, '')), '')
    )
  );
end;
$function$;

-- Source: 20260805023228_admin_local_application_mutations_v1.sql
create or replace function public.admin_update_game_settings_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_game_settings_patch jsonb,
  p_difficulty_policy_patch jsonb,
  p_request_payload jsonb,
  p_idempotency_key text,
  p_request_id text
)
returns table (
  response_status integer,
  response_body jsonb,
  was_replayed boolean
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_settings_patch jsonb := coalesce(p_game_settings_patch, '{}'::jsonb);
  v_policy_patch jsonb := coalesce(p_difficulty_policy_patch, '{}'::jsonb);
  v_claim record;
  v_settings jsonb;
  v_policy jsonb := null;
  v_existing_policy public.game_difficulty_policy_settings%rowtype;
  v_policy_profile public.difficulty_policy_profiles%rowtype;
  v_baseline_preset text;
begin
  if jsonb_typeof(v_settings_patch) <> 'object'
     or jsonb_typeof(v_policy_patch) <> 'object'
     or (v_settings_patch = '{}'::jsonb and v_policy_patch = '{}'::jsonb) then
    raise exception 'ADMIN_GAME_SETTINGS_PATCH_INVALID' using errcode = 'P0001';
  end if;

  select * into v_claim
  from private.begin_admin_mutation_v1(
    p_game_session_id,
    p_staff_user_id,
    'settings.update',
    p_idempotency_key,
    p_request_payload
  );
  if v_claim.was_replayed then
    return query select v_claim.response_status, v_claim.response_body, true;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('admin-settings:' || p_game_session_id::text, 260805)
  );

  if v_settings_patch <> '{}'::jsonb then
    update public.game_settings as settings_row
    set difficulty_preset = case when v_settings_patch ? 'difficulty_preset'
          then v_settings_patch->>'difficulty_preset' else settings_row.difficulty_preset end,
        attendance_window = case when v_settings_patch ? 'attendance_window'
          then v_settings_patch->'attendance_window' else settings_row.attendance_window end,
        business_market_window = case when v_settings_patch ? 'business_market_window'
          then v_settings_patch->'business_market_window' else settings_row.business_market_window end,
        stock_market_window = case when v_settings_patch ? 'stock_market_window'
          then v_settings_patch->'stock_market_window' else settings_row.stock_market_window end,
        news_schedule = case when v_settings_patch ? 'news_schedule'
          then v_settings_patch->'news_schedule' else settings_row.news_schedule end
    where settings_row.game_session_id = p_game_session_id;
  end if;

  select to_jsonb(settings_row)
  into v_settings
  from public.game_settings as settings_row
  where settings_row.game_session_id = p_game_session_id;

  if v_settings is null then
    raise exception 'ADMIN_GAME_SETTINGS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_policy_patch <> '{}'::jsonb then
    select *
    into v_existing_policy
    from public.game_difficulty_policy_settings as existing_policy
    where existing_policy.game_session_id = p_game_session_id
    for update;

    if v_policy_patch->>'source' = 'preset' then
      select *
      into v_policy_profile
      from public.difficulty_policy_profiles as profile_row
      where profile_row.preset_key = lower(btrim(coalesce(v_policy_patch->>'difficulty_preset', '')))
        and profile_row.status = 'active';

      if v_policy_profile.id is null then
        raise exception 'ADMIN_DIFFICULTY_POLICY_PROFILE_NOT_FOUND' using errcode = 'P0001';
      end if;

      insert into public.game_difficulty_policy_settings (
        game_session_id,
        difficulty_policy_profile_id,
        difficulty_preset,
        custom_label,
        source,
        price_modifier,
        event_volatility_modifier,
        scarcity_modifier,
        income_modifier,
        trade_modifier,
        credit_modifier,
        status,
        metadata
      ) values (
        p_game_session_id,
        v_policy_profile.id,
        v_policy_profile.preset_key,
        null,
        'preset',
        v_policy_profile.price_modifier,
        v_policy_profile.event_volatility_modifier,
        v_policy_profile.scarcity_modifier,
        v_policy_profile.income_modifier,
        v_policy_profile.trade_modifier,
        v_policy_profile.credit_modifier,
        'active',
        coalesce(v_existing_policy.metadata, '{}'::jsonb)
      )
      on conflict (game_session_id) do update set
        difficulty_policy_profile_id = excluded.difficulty_policy_profile_id,
        difficulty_preset = excluded.difficulty_preset,
        custom_label = excluded.custom_label,
        source = excluded.source,
        price_modifier = excluded.price_modifier,
        event_volatility_modifier = excluded.event_volatility_modifier,
        scarcity_modifier = excluded.scarcity_modifier,
        income_modifier = excluded.income_modifier,
        trade_modifier = excluded.trade_modifier,
        credit_modifier = excluded.credit_modifier,
        status = excluded.status,
        metadata = excluded.metadata;
    elsif v_policy_patch->>'source' = 'custom' then
      if v_existing_policy.id is null then
        v_baseline_preset := lower(btrim(coalesce(v_settings->>'difficulty_preset', 'standard')));
        if v_baseline_preset = '' or v_baseline_preset = 'custom' then
          v_baseline_preset := 'standard';
        end if;

        select *
        into v_policy_profile
        from public.difficulty_policy_profiles as profile_row
        where profile_row.preset_key = v_baseline_preset
          and profile_row.status = 'active';

        if v_policy_profile.id is null then
          raise exception 'ADMIN_DIFFICULTY_POLICY_PROFILE_NOT_FOUND' using errcode = 'P0001';
        end if;
      end if;

      insert into public.game_difficulty_policy_settings (
        game_session_id,
        difficulty_policy_profile_id,
        difficulty_preset,
        custom_label,
        source,
        price_modifier,
        event_volatility_modifier,
        scarcity_modifier,
        income_modifier,
        trade_modifier,
        credit_modifier,
        status,
        metadata
      ) values (
        p_game_session_id,
        null,
        'custom',
        coalesce(nullif(btrim(v_policy_patch->>'custom_label'), ''), 'Custom'),
        'custom',
        coalesce((nullif(v_policy_patch->>'price_modifier', ''))::numeric, v_existing_policy.price_modifier, v_policy_profile.price_modifier),
        coalesce((nullif(v_policy_patch->>'event_volatility_modifier', ''))::numeric, v_existing_policy.event_volatility_modifier, v_policy_profile.event_volatility_modifier),
        coalesce((nullif(v_policy_patch->>'scarcity_modifier', ''))::numeric, v_existing_policy.scarcity_modifier, v_policy_profile.scarcity_modifier),
        coalesce((nullif(v_policy_patch->>'income_modifier', ''))::numeric, v_existing_policy.income_modifier, v_policy_profile.income_modifier),
        coalesce((nullif(v_policy_patch->>'trade_modifier', ''))::numeric, v_existing_policy.trade_modifier, v_policy_profile.trade_modifier),
        coalesce((nullif(v_policy_patch->>'credit_modifier', ''))::numeric, v_existing_policy.credit_modifier, v_policy_profile.credit_modifier),
        'active',
        coalesce(v_existing_policy.metadata, '{}'::jsonb)
      )
      on conflict (game_session_id) do update set
        difficulty_policy_profile_id = excluded.difficulty_policy_profile_id,
        difficulty_preset = excluded.difficulty_preset,
        custom_label = excluded.custom_label,
        source = excluded.source,
        price_modifier = excluded.price_modifier,
        event_volatility_modifier = excluded.event_volatility_modifier,
        scarcity_modifier = excluded.scarcity_modifier,
        income_modifier = excluded.income_modifier,
        trade_modifier = excluded.trade_modifier,
        credit_modifier = excluded.credit_modifier,
        status = excluded.status,
        metadata = excluded.metadata;
    else
      raise exception 'ADMIN_DIFFICULTY_POLICY_SOURCE_INVALID' using errcode = 'P0001';
    end if;
  end if;

  select to_jsonb(policy_row)
  into v_policy
  from public.game_difficulty_policy_settings as policy_row
  where policy_row.game_session_id = p_game_session_id;

  return query
  select * from private.complete_admin_mutation_v1(
    p_staff_user_id,
    p_idempotency_key,
    200,
    jsonb_build_object(
      'settings', v_settings,
      'difficultyPolicy', v_policy
    ),
    'settings.updated',
    'game_settings',
    (v_settings->>'id')::uuid,
    jsonb_build_object(
      'requestId', nullif(btrim(coalesce(p_request_id, '')), ''),
      'gameSettingsFields', coalesce(
        (select jsonb_agg(field_name order by field_name)
         from jsonb_object_keys(v_settings_patch) as fields(field_name)),
        '[]'::jsonb
      ),
      'difficultyPolicyChanged', v_policy_patch <> '{}'::jsonb
    )
  );
end;
$function$;

-- Source: 20260731130000_add_verified_staff_onboarding_v1.sql
create or replace function public.attach_staff_signup_auth_user_v1(
  p_signup_request_id uuid,
  p_auth_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_request private.staff_signup_requests%rowtype;
  v_auth_email text;
begin
  select request_row.*
  into v_request
  from private.staff_signup_requests as request_row
  where request_row.id = p_signup_request_id
  for update;

  if v_request.id is null
    or v_request.status <> 'initializing'
    or v_request.expires_at <= clock_timestamp()
  then
    return false;
  end if;

  select lower(btrim(auth_user.email))
  into v_auth_email
  from auth.users as auth_user
  where auth_user.id = p_auth_user_id;

  if v_auth_email is null or v_auth_email <> v_request.normalized_email then
    return false;
  end if;

  update private.staff_signup_requests
  set
    supabase_auth_user_id = p_auth_user_id,
    status = 'pending_email_verification',
    updated_at = clock_timestamp()
  where id = v_request.id;

  return true;
end;
$$;

-- Source: 20260731134000_align_supabase_verification_link_authority_v1.sql
create or replace function public.claim_staff_signup_identity_v1(
  p_email_key text,
  p_normalized_email text,
  p_display_name text,
  p_continuation_handle_hash text,
  p_expires_at timestamptz
)
returns table (
  decision text,
  signup_request_id uuid,
  verification_expires_at timestamptz,
  send_verification boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_existing private.staff_signup_requests%rowtype;
  v_auth_user auth.users%rowtype;
  v_staff_user_id uuid;
begin
  if p_email_key !~ '^[0-9a-f]{64}$'
    or p_continuation_handle_hash !~ '^[0-9a-f]{64}$'
    or length(p_normalized_email) not between 3 and 320
    or p_normalized_email <> lower(btrim(p_normalized_email))
    or length(btrim(p_display_name)) not between 1 and 120
    or p_expires_at <= v_now
    or p_expires_at > v_now + interval '48 hours'
  then
    raise exception using errcode = '22023', message = 'invalid staff signup claim';
  end if;

  perform public.cleanup_expired_staff_signup_identity_v1(p_email_key);
  perform pg_advisory_xact_lock(hashtextextended(p_email_key, 946313));

  select staff.id
  into v_staff_user_id
  from public.staff_users as staff
  where lower(btrim(staff.email)) = p_normalized_email
  limit 1;

  if v_staff_user_id is not null then
    return query select
      'existing_verified_identity'::text,
      null::uuid,
      p_expires_at,
      false;
    return;
  end if;

  select auth_user.*
  into v_auth_user
  from auth.users as auth_user
  where lower(btrim(auth_user.email)) = p_normalized_email
  order by auth_user.created_at asc
  limit 1;

  select request_row.*
  into v_existing
  from private.staff_signup_requests as request_row
  where request_row.email_key = p_email_key
    and request_row.status in (
      'initializing',
      'pending_email_verification',
      'email_verified',
      'staff_identity_activated'
    )
  for update;

  if v_auth_user.id is not null and v_auth_user.email_confirmed_at is not null then
    return query select
      'existing_verified_identity'::text,
      null::uuid,
      p_expires_at,
      false;
    return;
  end if;

  if v_existing.id is not null then
    return query select
      'resume_pending'::text,
      v_existing.id,
      v_existing.expires_at,
      false;
    return;
  end if;

  if v_auth_user.id is not null then
    return query select
      'security_hold'::text,
      null::uuid,
      p_expires_at,
      false;
    return;
  end if;

  insert into private.staff_signup_requests (
    email_key,
    normalized_email,
    display_name,
    continuation_handle_hash,
    status,
    expires_at,
    resend_not_before,
    resend_count
  ) values (
    p_email_key,
    p_normalized_email,
    btrim(p_display_name),
    p_continuation_handle_hash,
    'initializing',
    p_expires_at,
    v_now + interval '60 seconds',
    1
  )
  returning id, expires_at
  into signup_request_id, verification_expires_at;

  decision := 'create_new';
  send_verification := true;
  return next;
end;
$$;

-- Source: 20260731134000_align_supabase_verification_link_authority_v1.sql
create or replace function public.claim_staff_signup_resend_v1(
  p_continuation_handle_hash text
)
returns table (
  normalized_email text,
  display_name text,
  signup_request_id uuid,
  supabase_auth_user_id uuid,
  allowed boolean,
  retry_after_seconds integer,
  delivery_version integer,
  verification_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_request private.staff_signup_requests%rowtype;
  v_email_confirmed_at timestamptz;
  v_next_delivery_version integer;
begin
  if p_continuation_handle_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  select request_row.*
  into v_request
  from private.staff_signup_requests as request_row
  where request_row.continuation_handle_hash = p_continuation_handle_hash
    and request_row.status = 'pending_email_verification'
    and request_row.expires_at > v_now
  for update;

  if v_request.id is null or v_request.supabase_auth_user_id is null then
    return;
  end if;

  select auth_user.email_confirmed_at
  into v_email_confirmed_at
  from auth.users as auth_user
  where auth_user.id = v_request.supabase_auth_user_id
    and lower(btrim(auth_user.email)) = v_request.normalized_email
  for update;

  if not found then
    return;
  end if;

  if v_email_confirmed_at is not null then
    update private.staff_signup_requests
    set
      status = 'email_verified',
      email_verified_at = coalesce(email_verified_at, v_email_confirmed_at),
      updated_at = v_now
    where id = v_request.id;
    return;
  end if;

  normalized_email := v_request.normalized_email;
  display_name := v_request.display_name;
  signup_request_id := v_request.id;
  supabase_auth_user_id := v_request.supabase_auth_user_id;
  delivery_version := v_request.resend_count;
  verification_expires_at := v_request.expires_at;

  if v_now < v_request.resend_not_before or v_request.resend_count >= 20 then
    allowed := false;
    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from greatest(
        interval '1 second',
        v_request.resend_not_before - v_now
      )))::integer
    );
    return next;
    return;
  end if;

  update private.staff_signup_requests
  set
    resend_not_before = v_now + interval '60 seconds',
    resend_count = resend_count + 1,
    updated_at = v_now
  where id = v_request.id
  returning resend_count into v_next_delivery_version;

  allowed := true;
  retry_after_seconds := 60;
  delivery_version := v_next_delivery_version;
  return next;
end;
$$;

-- Source: 20260731130000_add_verified_staff_onboarding_v1.sql
create or replace function public.complete_staff_onboarding_v1(
  p_staff_user_id uuid,
  p_game_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not exists (
    select 1
    from public.game_sessions as game
    where game.id = p_game_session_id
      and game.owner_staff_user_id = p_staff_user_id
      and game.status = 'active'
  ) then
    return false;
  end if;

  update public.staff_users
  set status = 'active', updated_at = clock_timestamp()
  where id = p_staff_user_id
    and status in ('onboarding', 'active');

  update private.staff_signup_requests
  set
    status = 'completed',
    completed_at = coalesce(completed_at, clock_timestamp()),
    updated_at = clock_timestamp()
  where staff_user_id = p_staff_user_id
    and status = 'staff_identity_activated';

  return exists (
    select 1 from public.staff_users
    where id = p_staff_user_id and status = 'active'
  );
end;
$$;

commit;
