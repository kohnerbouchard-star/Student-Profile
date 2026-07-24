begin;

alter table public.game_sessions
  add column if not exists provisioning_status text not null default 'pending',
  add column if not exists provisioning_pack_id text null,
  add column if not exists provisioning_pack_version text null,
  add column if not exists provisioning_pack_sha256 text null,
  add column if not exists provisioning_source_game_session_id uuid null references public.game_sessions(id) on delete set null,
  add column if not exists provisioned_at timestamptz null,
  add column if not exists provisioning_failure_code text null;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'game_sessions_provisioning_status_check'
      and conrelid = 'public.game_sessions'::regclass
  ) then
    alter table public.game_sessions
      add constraint game_sessions_provisioning_status_check
      check (provisioning_status in ('pending', 'provisioning', 'ready', 'failed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'game_sessions_provisioning_pack_valid'
      and conrelid = 'public.game_sessions'::regclass
  ) then
    alter table public.game_sessions
      add constraint game_sessions_provisioning_pack_valid
      check (
        (provisioning_pack_id is null and provisioning_pack_version is null and provisioning_pack_sha256 is null)
        or (
          length(btrim(provisioning_pack_id)) between 1 and 128
          and length(btrim(provisioning_pack_version)) between 1 and 64
          and provisioning_pack_sha256 ~ '^[0-9a-f]{64}$'
        )
      );
  end if;
end;
$constraints$;

update public.game_sessions as game_row
set provisioning_status = 'ready',
    provisioning_pack_id = release_row.pack_id,
    provisioning_pack_version = release_row.version,
    provisioning_pack_sha256 = release_row.pack_sha256,
    provisioning_source_game_session_id = game_row.id,
    provisioned_at = coalesce(release_row.applied_at, game_row.updated_at),
    provisioning_failure_code = null
from public.seed_content_releases as release_row
where release_row.game_session_id = game_row.id
  and release_row.status = 'applied_active'
  and exists (
    select 1 from public.world_runtime_instances as runtime_row
    where runtime_row.game_session_id = game_row.id
  );

create table if not exists public.game_creation_provisioning_requests (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references public.staff_users(id) on delete restrict,
  idempotency_key text not null,
  game_session_id uuid null references public.game_sessions(id) on delete set null,
  status text not null default 'processing',
  result jsonb not null default '{}'::jsonb,
  failure_code text null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint game_creation_provisioning_requests_scope_unique unique (staff_user_id, idempotency_key),
  constraint game_creation_provisioning_requests_key_valid check (
    length(idempotency_key) between 8 and 128
    and idempotency_key = btrim(idempotency_key)
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  constraint game_creation_provisioning_requests_status_check check (
    status in ('processing', 'completed', 'failed')
  ),
  constraint game_creation_provisioning_requests_result_object check (
    jsonb_typeof(result) = 'object'
  ),
  constraint game_creation_provisioning_requests_completion_check check (
    (status = 'processing' and completed_at is null)
    or (status in ('completed', 'failed') and completed_at is not null)
  )
);

alter table public.game_creation_provisioning_requests enable row level security;
alter table public.game_creation_provisioning_requests force row level security;
revoke all on table public.game_creation_provisioning_requests from public, anon, authenticated;
grant select, insert, update on table public.game_creation_provisioning_requests to service_role;

create index if not exists game_creation_provisioning_requests_game_idx
  on public.game_creation_provisioning_requests (game_session_id, created_at desc);

comment on column public.game_sessions.provisioning_status is
  'Shared multiplayer content readiness. Newly created games remain non-joinable until canonical content, World runtime, and policies verify successfully.';
comment on table public.game_creation_provisioning_requests is
  'Idempotency and sanitized result evidence for atomic Admin game creation and canonical content provisioning.';

create or replace function public.create_provisioned_game_v1(
  p_staff_user_id uuid,
  p_game_name text,
  p_game_settings jsonb,
  p_idempotency_key text,
  p_pack_id text default 'econovaria.beta-seed-pack.v1'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_request public.game_creation_provisioning_requests%rowtype;
  v_inserted_request integer := 0;
  v_source_release public.seed_content_releases%rowtype;
  v_source_runtime public.world_runtime_instances%rowtype;
  v_game public.game_sessions%rowtype;
  v_target_release_id uuid;
  v_join_code text;
  v_join_hash text;
  v_join_issued boolean := false;
  v_attempt integer;
  v_count integer;
  v_result jsonb;
  v_settings jsonb := coalesce(p_game_settings, '{}'::jsonb);
  v_now timestamptz := now();
begin
  if not public.seed_content_request_is_privileged_v1() then
    raise exception 'GAME_PROVISIONING_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_staff_user_id is null or not exists (
    select 1 from public.staff_users where id = p_staff_user_id
  ) then
    raise exception 'GAME_PROVISIONING_STAFF_INVALID' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_game_name, ''))) not between 1 and 120 then
    raise exception 'GAME_PROVISIONING_NAME_INVALID' using errcode = 'P0001';
  end if;
  if jsonb_typeof(v_settings) <> 'object' then
    raise exception 'GAME_PROVISIONING_SETTINGS_INVALID' using errcode = 'P0001';
  end if;
  if p_idempotency_key is null
     or length(p_idempotency_key) not between 8 and 128
     or p_idempotency_key <> btrim(p_idempotency_key)
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'GAME_PROVISIONING_IDEMPOTENCY_INVALID' using errcode = 'P0001';
  end if;
  if p_pack_id is null or length(btrim(p_pack_id)) not between 1 and 128 then
    raise exception 'GAME_PROVISIONING_PACK_INVALID' using errcode = 'P0001';
  end if;

  insert into public.game_creation_provisioning_requests (
    staff_user_id, idempotency_key, status
  ) values (
    p_staff_user_id, p_idempotency_key, 'processing'
  )
  on conflict (staff_user_id, idempotency_key) do nothing;
  get diagnostics v_inserted_request = row_count;

  select * into v_request
  from public.game_creation_provisioning_requests
  where staff_user_id = p_staff_user_id
    and idempotency_key = p_idempotency_key
  for update;

  if v_inserted_request = 0 then
    if v_request.status = 'completed' then
      return v_request.result || jsonb_build_object(
        'outcome', 'replayed',
        'joinCode', null,
        'joinCodeReissueRequired', true
      );
    end if;
    if v_request.status = 'failed' then
      return v_request.result || jsonb_build_object('outcome', 'failed_replay');
    end if;
    raise exception 'GAME_PROVISIONING_REQUEST_IN_PROGRESS' using errcode = '40001';
  end if;

  begin
    select release_row.* into v_source_release
    from public.seed_content_releases as release_row
    where release_row.pack_id = btrim(p_pack_id)
      and release_row.status = 'applied_active'
      and release_row.target_environment in ('local', 'test', 'staging')
      and (
        select count(*) from public.seed_content_release_members as member_row
        where member_row.release_id = release_row.id and member_row.object_type = 'stock_template'
      ) = 240
      and (
        select count(*) from public.seed_content_release_members as member_row
        where member_row.release_id = release_row.id and member_row.object_type = 'game_stock_asset'
      ) = 240
      and (
        select count(*) from public.seed_content_release_members as member_row
        where member_row.release_id = release_row.id and member_row.object_type = 'contract_template'
      ) = 30
      and (
        select count(*) from public.seed_content_release_members as member_row
        where member_row.release_id = release_row.id and member_row.object_type = 'game_contract'
      ) = 30
      and (
        select count(*) from public.seed_content_release_members as member_row
        where member_row.release_id = release_row.id and member_row.object_type = 'store_item'
      ) = 50
      and exists (
        select 1 from public.world_runtime_instances as runtime_row
        where runtime_row.game_session_id = release_row.game_session_id
          and runtime_row.revision = 0
      )
      and (select count(*) from public.world_location_states where game_session_id = release_row.game_session_id) = 50
      and (select count(*) from public.world_route_states where game_session_id = release_row.game_session_id) = 13
      and (select count(*) from public.world_country_runtime where game_session_id = release_row.game_session_id) = 10
      and (select count(*) from public.arrival_class_grant_runtime where game_session_id = release_row.game_session_id) = 8
    order by release_row.applied_at desc nulls last, release_row.created_at desc
    limit 1;

    if not found then
      raise exception 'GAME_PROVISIONING_CANONICAL_SOURCE_NOT_FOUND' using errcode = 'P0001';
    end if;

    select * into v_source_runtime
    from public.world_runtime_instances
    where game_session_id = v_source_release.game_session_id;

    insert into public.game_sessions (
      owner_staff_user_id,
      name,
      status,
      lifecycle_state,
      game_join_code_hash,
      game_join_code_status,
      provisioning_status,
      provisioning_pack_id,
      provisioning_pack_version,
      provisioning_pack_sha256,
      provisioning_source_game_session_id
    ) values (
      p_staff_user_id,
      btrim(p_game_name),
      'disabled',
      'draft',
      null,
      'pending',
      'provisioning',
      v_source_release.pack_id,
      v_source_release.version,
      v_source_release.pack_sha256,
      v_source_release.game_session_id
    ) returning * into v_game;

    update public.game_creation_provisioning_requests
    set game_session_id = v_game.id
    where id = v_request.id;

    insert into public.game_settings (
      game_session_id,
      difficulty_preset,
      attendance_window,
      business_market_window,
      stock_market_window,
      news_schedule
    ) values (
      v_game.id,
      coalesce(nullif(btrim(v_settings->>'difficulty_preset'), ''), 'moderate'),
      case when jsonb_typeof(v_settings->'attendance_window') = 'object' then v_settings->'attendance_window' else '{}'::jsonb end,
      case when jsonb_typeof(v_settings->'business_market_window') = 'object' then v_settings->'business_market_window' else '{}'::jsonb end,
      case when jsonb_typeof(v_settings->'stock_market_window') = 'object' then v_settings->'stock_market_window' else '{}'::jsonb end,
      case when jsonb_typeof(v_settings->'news_schedule') = 'object' then v_settings->'news_schedule' else '{}'::jsonb end
    );

    v_target_release_id := public.seed_content_stable_uuid_v1(
      'econovaria-seed-release|' || v_game.id::text || '|' || v_source_release.pack_id
    );

    insert into public.seed_content_releases (
      id, game_session_id, pack_id, version, pack_sha256, target_environment,
      authorization_id, approved_by, activation_requested, status,
      operation_count, result, applied_at
    ) values (
      v_target_release_id, v_game.id, v_source_release.pack_id, v_source_release.version,
      v_source_release.pack_sha256, v_source_release.target_environment,
      'automatic-game-provisioning-v1', 'Admin game creation orchestrator', true,
      'importing', 0, '{}'::jsonb, v_now
    );

    insert into public.seed_content_release_members (
      release_id, object_type, stable_key, record_id, created_by_release
    )
    select v_target_release_id, member_row.object_type, member_row.stable_key,
           member_row.record_id, false
    from public.seed_content_release_members as member_row
    where member_row.release_id = v_source_release.id
      and member_row.object_type in ('stock_template', 'contract_template');

    insert into public.game_session_stock_assets (
      id, game_session_id, template_id, ticker, company_name, sector_key, country_code,
      description, current_price, previous_close, open_price, day_high, day_low,
      market_cap, shares_outstanding, beta, liquidity, current_volatility,
      long_run_volatility, fair_value_anchor, recent_returns, chart_history,
      fundamentals, country_exposure, sector_exposure, commodity_exposure, is_active
    )
    select
      public.seed_content_stable_uuid_v1(
        'econovaria-seed|game-stock-asset|' || v_game.id::text || '|' || member_row.stable_key
      ),
      v_game.id,
      template_row.id,
      template_row.ticker,
      template_row.company_name,
      template_row.sector_key,
      template_row.country_code,
      template_row.description,
      template_row.base_price,
      template_row.base_price,
      template_row.base_price,
      template_row.base_price,
      template_row.base_price,
      template_row.base_price * template_row.shares_outstanding,
      template_row.shares_outstanding,
      template_row.beta,
      template_row.liquidity,
      template_row.long_run_volatility,
      template_row.long_run_volatility,
      template_row.base_price,
      '[]'::jsonb,
      jsonb_build_array(jsonb_build_object('tick', 0, 'price', template_row.base_price)),
      template_row.fundamentals,
      template_row.country_exposure,
      template_row.sector_exposure,
      template_row.commodity_exposure,
      true
    from public.seed_content_release_members as member_row
    join public.stock_templates as template_row on template_row.id = member_row.record_id
    where member_row.release_id = v_source_release.id
      and member_row.object_type = 'stock_template';

    insert into public.seed_content_release_members (
      release_id, object_type, stable_key, record_id, created_by_release
    )
    select
      v_target_release_id,
      'game_stock_asset',
      member_row.stable_key,
      public.seed_content_stable_uuid_v1(
        'econovaria-seed|game-stock-asset|' || v_game.id::text || '|' || member_row.stable_key
      ),
      true
    from public.seed_content_release_members as member_row
    where member_row.release_id = v_source_release.id
      and member_row.object_type = 'stock_template';

    insert into public.game_session_contracts (
      id, game_session_id, contract_template_id, contract_key, source_type,
      title, description, instructions, category, status, visibility,
      targeting_payload, requirements_payload, reward_payload, completion_mode,
      published_at, metadata
    )
    select
      public.seed_content_stable_uuid_v1(
        'econovaria-seed|game-contract|' || v_game.id::text || '|' || lower(member_row.stable_key)
      ),
      v_game.id,
      source_contract.contract_template_id,
      source_contract.contract_key,
      'system',
      source_contract.title,
      source_contract.description,
      source_contract.instructions,
      source_contract.category,
      'active',
      'public',
      source_contract.targeting_payload,
      source_contract.requirements_payload,
      source_contract.reward_payload,
      source_contract.completion_mode,
      v_now,
      source_contract.metadata
    from public.seed_content_release_members as member_row
    join public.game_session_contracts as source_contract
      on source_contract.id = member_row.record_id
     and source_contract.game_session_id = v_source_release.game_session_id
    where member_row.release_id = v_source_release.id
      and member_row.object_type = 'game_contract';

    insert into public.seed_content_release_members (
      release_id, object_type, stable_key, record_id, created_by_release
    )
    select
      v_target_release_id,
      'game_contract',
      member_row.stable_key,
      public.seed_content_stable_uuid_v1(
        'econovaria-seed|game-contract|' || v_game.id::text || '|' || lower(member_row.stable_key)
      ),
      true
    from public.seed_content_release_members as member_row
    where member_row.release_id = v_source_release.id
      and member_row.object_type = 'game_contract';

    insert into public.store_items (
      id, game_session_id, item_key, name, description, category, price,
      currency_code, stock_quantity, status, visibility, sort_order
    )
    select
      public.seed_content_stable_uuid_v1(
        'econovaria-seed|store-item|' || v_game.id::text || '|' || lower(member_row.stable_key)
      ),
      v_game.id,
      source_item.item_key,
      source_item.name,
      source_item.description,
      source_item.category,
      source_item.price,
      source_item.currency_code,
      source_item.stock_quantity,
      'active',
      'visible',
      source_item.sort_order
    from public.seed_content_release_members as member_row
    join public.store_items as source_item
      on source_item.id = member_row.record_id
     and source_item.game_session_id = v_source_release.game_session_id
    where member_row.release_id = v_source_release.id
      and member_row.object_type = 'store_item';

    insert into public.seed_content_release_members (
      release_id, object_type, stable_key, record_id, created_by_release
    )
    select
      v_target_release_id,
      'store_item',
      member_row.stable_key,
      public.seed_content_stable_uuid_v1(
        'econovaria-seed|store-item|' || v_game.id::text || '|' || lower(member_row.stable_key)
      ),
      true
    from public.seed_content_release_members as member_row
    where member_row.release_id = v_source_release.id
      and member_row.object_type = 'store_item';

    insert into public.world_runtime_instances (
      game_session_id, pack_id, pack_version, definition_digest, revision,
      initialized_at
    ) values (
      v_game.id, v_source_runtime.pack_id, v_source_runtime.pack_version,
      v_source_runtime.definition_digest, 0, v_now
    );

    insert into public.world_location_states (
      game_session_id, public_location_id, country_id, display_name,
      location_kind, availability, revision, updated_at
    )
    select
      v_game.id, public_location_id, country_id, display_name, location_kind,
      availability, 0, v_now
    from public.world_location_states
    where game_session_id = v_source_release.game_session_id;

    insert into public.world_route_states (
      game_session_id, public_route_id, from_location_id, to_location_id,
      mode, bidirectional, base_cost_minor, base_duration_minutes, status,
      reason, cost_multiplier_basis_points, duration_multiplier_basis_points,
      revision, updated_at
    )
    select
      v_game.id, public_route_id, from_location_id, to_location_id,
      mode, bidirectional, base_cost_minor, base_duration_minutes,
      'open', 'normal', 10000, 10000, 0, v_now
    from public.world_route_states
    where game_session_id = v_source_release.game_session_id;

    insert into public.world_runtime_commands (
      game_session_id, command_key, command_kind, applied_revision, applied_at
    ) values (
      v_game.id,
      'world-runtime:initialize:' || v_source_runtime.definition_digest,
      'initialize', 0, v_now
    );

    insert into public.world_country_runtime (
      game_session_id, country_uuid, country_id, currency_code,
      arrival_location_id, arrival_package_definition_id
    )
    select
      v_game.id, country_uuid, country_id, currency_code,
      arrival_location_id, arrival_package_definition_id
    from public.world_country_runtime
    where game_session_id = v_source_release.game_session_id;

    insert into public.arrival_class_grant_runtime (
      game_session_id, class_id, grant_definition_id
    )
    select v_game.id, class_id, grant_definition_id
    from public.arrival_class_grant_runtime
    where game_session_id = v_source_release.game_session_id;

    insert into public.message_game_policies (
      game_session_id, player_threads_enabled, max_player_thread_participants,
      default_retention_days, attachments_enabled, updated_by_staff_user_id
    )
    select
      v_game.id, player_threads_enabled, max_player_thread_participants,
      default_retention_days, false, p_staff_user_id
    from public.message_game_policies
    where game_session_id = v_source_release.game_session_id;
    get diagnostics v_count = row_count;
    if v_count = 0 then
      insert into public.message_game_policies (
        game_session_id, player_threads_enabled, max_player_thread_participants,
        default_retention_days, attachments_enabled, updated_by_staff_user_id
      ) values (v_game.id, true, 2, 365, false, p_staff_user_id);
    end if;

    insert into public.marketplace_policies (
      game_session_id, marketplace_enabled, cross_country_trading_enabled,
      moderation_required, fee_rate, tax_rate, listing_duration_hours,
      purchase_reservation_minutes, dispute_window_days, disputes_enabled,
      country_fee_overrides, blocked_country_codes, updated_by_staff_user_id
    )
    select
      v_game.id, marketplace_enabled, cross_country_trading_enabled,
      moderation_required, fee_rate, tax_rate, listing_duration_hours,
      purchase_reservation_minutes, dispute_window_days, disputes_enabled,
      country_fee_overrides, blocked_country_codes, p_staff_user_id
    from public.marketplace_policies
    where game_session_id = v_source_release.game_session_id;
    get diagnostics v_count = row_count;
    if v_count = 0 then
      insert into public.marketplace_policies (
        game_session_id, marketplace_enabled, cross_country_trading_enabled,
        moderation_required, fee_rate, tax_rate, listing_duration_hours,
        purchase_reservation_minutes, dispute_window_days, disputes_enabled,
        country_fee_overrides, blocked_country_codes, updated_by_staff_user_id
      ) values (
        v_game.id, true, true, false, 0.025, 0, 168, 5, 7, true,
        '{}'::jsonb, '{}'::text[], p_staff_user_id
      );
    end if;

    if (select count(*) from public.game_session_stock_assets where game_session_id = v_game.id and is_active) <> 240
      or (select count(*) from public.game_session_contracts where game_session_id = v_game.id and status = 'active' and visibility = 'public') <> 30
      or (select count(*) from public.store_items where game_session_id = v_game.id and status = 'active' and visibility = 'visible') <> 50
      or (select count(*) from public.world_location_states where game_session_id = v_game.id) <> 50
      or (select count(*) from public.world_route_states where game_session_id = v_game.id) <> 13
      or (select count(*) from public.world_country_runtime where game_session_id = v_game.id) <> 10
      or (select count(*) from public.arrival_class_grant_runtime where game_session_id = v_game.id) <> 8
      or (select count(*) from public.message_game_policies where game_session_id = v_game.id) <> 1
      or (select count(*) from public.marketplace_policies where game_session_id = v_game.id) <> 1
    then
      raise exception 'GAME_PROVISIONING_VERIFICATION_FAILED' using errcode = 'P0001';
    end if;

    v_result := jsonb_build_object(
      'outcome', 'created',
      'gameSessionId', v_game.id,
      'gameName', v_game.name,
      'provisioningStatus', 'ready',
      'packId', v_source_release.pack_id,
      'packVersion', v_source_release.version,
      'packSha256', v_source_release.pack_sha256,
      'counts', jsonb_build_object(
        'marketAssets', 240,
        'contracts', 30,
        'storeItems', 50,
        'worldLocations', 50,
        'worldRoutes', 13,
        'worldCountries', 10,
        'arrivalClassGrants', 8,
        'messagingPolicies', 1,
        'marketplacePolicies', 1
      ),
      'contentGates', jsonb_build_object(
        'crafting', 'blocked_by_catalog_authority',
        'story', 'not_published',
        'arrivalGrantProcessor', 'not_implemented'
      )
    );

    update public.seed_content_releases
    set status = 'applied_active',
        operation_count = 590,
        result = jsonb_build_object(
          'outcome', 'applied',
          'gameSessionId', v_game.id,
          'packId', v_source_release.pack_id,
          'version', v_source_release.version,
          'packSha256', v_source_release.pack_sha256,
          'activated', true,
          'operationCount', 590,
          'counts', jsonb_build_object(
            'stockTemplates', 240,
            'gameStockAssets', 240,
            'contractTemplates', 30,
            'gameContracts', 30,
            'storeItems', 50
          )
        ),
        applied_at = v_now,
        updated_at = v_now
    where id = v_target_release_id;

    for v_attempt in 1..10 loop
      v_join_code := 'ECO-' || upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 8));
      v_join_hash := encode(extensions.digest(v_join_code, 'sha256'), 'hex');
      begin
        update public.game_sessions
        set game_join_code_hash = v_join_hash,
            game_join_code_status = 'active'
        where id = v_game.id;
        v_join_issued := true;
        exit;
      exception when unique_violation then
        v_join_issued := false;
      end;
    end loop;

    if not v_join_issued then
      raise exception 'GAME_PROVISIONING_JOIN_CODE_CONFLICT' using errcode = '23505';
    end if;

    update public.game_sessions
    set status = 'active',
        lifecycle_state = 'active',
        lifecycle_version = lifecycle_version + 1,
        started_at = coalesce(started_at, v_now),
        provisioning_status = 'ready',
        provisioned_at = v_now,
        provisioning_failure_code = null
    where id = v_game.id
    returning * into v_game;

    insert into public.audit_log (
      game_session_id, actor_type, actor_id, action, target_type, target_id, metadata
    ) values (
      v_game.id, 'staff_user', p_staff_user_id,
      'game.provisioned', 'game_session', v_game.id,
      jsonb_build_object(
        'packId', v_source_release.pack_id,
        'packVersion', v_source_release.version,
        'packSha256', v_source_release.pack_sha256,
        'sourceGameSessionId', v_source_release.game_session_id,
        'counts', v_result->'counts',
        'contentGates', v_result->'contentGates'
      )
    );

    update public.game_creation_provisioning_requests
    set status = 'completed',
        game_session_id = v_game.id,
        result = v_result,
        failure_code = null,
        completed_at = now()
    where id = v_request.id;

    return v_result || jsonb_build_object(
      'joinCode', v_join_code,
      'joinCodeStatus', 'active',
      'joinCodeReissueRequired', false
    );
  exception when others then
    update public.game_creation_provisioning_requests
    set status = 'failed',
        result = jsonb_build_object(
          'outcome', 'failed',
          'provisioningStatus', 'failed',
          'failureCode', sqlstate,
          'transactionRolledBack', true
        ),
        failure_code = sqlstate,
        completed_at = now()
    where id = v_request.id;

    return jsonb_build_object(
      'outcome', 'failed',
      'provisioningStatus', 'failed',
      'failureCode', sqlstate,
      'transactionRolledBack', true,
      'joinCode', null
    );
  end;
end;
$function$;

revoke all on function public.create_provisioned_game_v1(uuid, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.create_provisioned_game_v1(uuid, text, jsonb, text, text)
  to service_role;

comment on function public.create_provisioned_game_v1(uuid, text, jsonb, text, text) is
  'Atomically creates one Admin-owned multiplayer game in draft, clones the approved canonical seed release, World runtime, and game policies, verifies bounded counts, issues a one-time plaintext Game Code, and activates the game only after readiness succeeds. Crafting, Story, and Arrival grant execution remain explicit content gates.';

commit;
