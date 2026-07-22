begin;

create table if not exists public.seed_content_releases (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete restrict,
  pack_id text not null check (length(btrim(pack_id)) between 1 and 128),
  version text not null check (length(btrim(version)) between 1 and 64),
  pack_sha256 text not null check (pack_sha256 ~ '^[0-9a-f]{64}$'),
  target_environment text not null check (target_environment in ('local', 'test', 'staging')),
  authorization_id text null check (authorization_id is null or length(btrim(authorization_id)) between 1 and 128),
  approved_by text null check (approved_by is null or length(btrim(approved_by)) between 1 and 256),
  activation_requested boolean not null default false,
  status text not null default 'importing' check (
    status in ('importing', 'applied_inactive', 'applied_active', 'deactivated', 'rolled_back', 'failed')
  ),
  operation_count integer not null default 0 check (operation_count >= 0),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  failure_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz null,
  deactivated_at timestamptz null,
  rolled_back_at timestamptz null,
  unique (game_session_id, pack_id)
);

comment on table public.seed_content_releases is
  'Service-role-only journal for deterministic, game-scoped seed releases. Production activation is outside this schema and remains independently authorized.';

create table if not exists public.seed_content_release_members (
  release_id uuid not null references public.seed_content_releases(id) on delete cascade,
  object_type text not null check (
    object_type in ('stock_template', 'game_stock_asset', 'contract_template', 'game_contract', 'store_item')
  ),
  stable_key text not null check (length(btrim(stable_key)) between 1 and 256),
  record_id uuid not null,
  created_by_release boolean not null,
  previous_row jsonb null check (previous_row is null or jsonb_typeof(previous_row) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (release_id, object_type, stable_key),
  unique (release_id, object_type, record_id)
);

comment on table public.seed_content_release_members is
  'Stable release membership used to deactivate or roll back only records owned by one seed release without deleting player-owned history.';

create index if not exists seed_content_releases_game_status_idx
  on public.seed_content_releases (game_session_id, status, updated_at desc);

create index if not exists seed_content_release_members_record_idx
  on public.seed_content_release_members (object_type, record_id);

alter table public.seed_content_releases enable row level security;
alter table public.seed_content_release_members enable row level security;

revoke all on table public.seed_content_releases from public, anon, authenticated;
revoke all on table public.seed_content_release_members from public, anon, authenticated;

create or replace function public.seed_content_stable_uuid_v1(p_value text)
returns uuid
language sql
immutable
strict
set search_path = ''
as $$
  select (
    substr(md5(p_value), 1, 8) || '-' ||
    substr(md5(p_value), 9, 4) || '-' ||
    '5' || substr(md5(p_value), 14, 3) || '-' ||
    '8' || substr(md5(p_value), 18, 3) || '-' ||
    substr(md5(p_value), 21, 12)
  )::uuid;
$$;

create or replace function public.seed_content_request_is_privileged_v1()
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or session_user in ('postgres', 'supabase_admin');
$$;

create or replace function public.apply_seed_content_release_v1(
  p_game_session_id uuid,
  p_pack_id text,
  p_version text,
  p_pack_sha256 text,
  p_target_environment text,
  p_activate boolean,
  p_authorization_id text,
  p_approved_by text,
  p_market_templates jsonb,
  p_contract_templates jsonb,
  p_store_items jsonb,
  p_fail_after_operations integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_release public.seed_content_releases%rowtype;
  v_release_id uuid;
  v_entry jsonb;
  v_record_id uuid;
  v_template_id uuid;
  v_stable_key text;
  v_natural_key text;
  v_operation_count integer := 0;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_existing_status text;
  v_existing_owner text;
  v_existing_member public.seed_content_release_members%rowtype;
  v_existing_stock public.stock_templates%rowtype;
  v_existing_asset public.game_session_stock_assets%rowtype;
  v_existing_template public.contract_templates%rowtype;
  v_existing_contract public.game_session_contracts%rowtype;
  v_existing_store public.store_items%rowtype;
  v_seed_marker jsonb;
  v_replayed boolean := false;
  v_result jsonb;
begin
  if not public.seed_content_request_is_privileged_v1() then
    raise exception using errcode = '42501', message = 'SEED_RELEASE_SERVICE_ROLE_REQUIRED';
  end if;

  if p_target_environment not in ('local', 'test', 'staging') then
    raise exception using errcode = '22023', message = 'SEED_RELEASE_PRODUCTION_PROHIBITED';
  end if;
  if p_pack_id is null or length(btrim(p_pack_id)) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'SEED_RELEASE_INVALID_PACK_ID';
  end if;
  if p_version is null or length(btrim(p_version)) not between 1 and 64 then
    raise exception using errcode = '22023', message = 'SEED_RELEASE_INVALID_VERSION';
  end if;
  if p_pack_sha256 is null or p_pack_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'SEED_RELEASE_INVALID_DIGEST';
  end if;
  if p_activate and (p_authorization_id is null or btrim(p_authorization_id) = '' or p_approved_by is null or btrim(p_approved_by) = '') then
    raise exception using errcode = '22023', message = 'SEED_RELEASE_ACTIVATION_AUTHORIZATION_REQUIRED';
  end if;
  if jsonb_typeof(p_market_templates) <> 'array'
     or jsonb_typeof(p_contract_templates) <> 'array'
     or jsonb_typeof(p_store_items) <> 'array' then
    raise exception using errcode = '22023', message = 'SEED_RELEASE_PAYLOAD_ARRAYS_REQUIRED';
  end if;
  if jsonb_array_length(p_market_templates) <> 240
     or jsonb_array_length(p_contract_templates) <> 30
     or jsonb_array_length(p_store_items) <> 50 then
    raise exception using errcode = '22023', message = 'SEED_RELEASE_BOUNDED_COUNTS_REQUIRED';
  end if;
  if p_fail_after_operations is not null and p_fail_after_operations < 1 then
    raise exception using errcode = '22023', message = 'SEED_RELEASE_INVALID_FAILURE_INJECTION';
  end if;
  if not exists (select 1 from public.game_sessions where id = p_game_session_id) then
    raise exception using errcode = '23503', message = 'SEED_RELEASE_GAME_NOT_FOUND';
  end if;

  if (select count(distinct lower(value->>'ticker')) from jsonb_array_elements(p_market_templates)) <> 240
     or (select count(distinct value->>'stableId') from jsonb_array_elements(p_market_templates)) <> 240 then
    raise exception using errcode = '22023', message = 'SEED_RELEASE_DUPLICATE_MARKET_KEY';
  end if;
  if (select count(distinct lower(value->>'templateKey')) from jsonb_array_elements(p_contract_templates)) <> 30 then
    raise exception using errcode = '22023', message = 'SEED_RELEASE_DUPLICATE_CONTRACT_KEY';
  end if;
  if (select count(distinct lower(value->>'itemKey')) from jsonb_array_elements(p_store_items)) <> 50 then
    raise exception using errcode = '22023', message = 'SEED_RELEASE_DUPLICATE_STORE_KEY';
  end if;

  v_release_id := public.seed_content_stable_uuid_v1(
    'econovaria-seed-release|' || p_game_session_id::text || '|' || btrim(p_pack_id)
  );

  select * into v_release
  from public.seed_content_releases
  where game_session_id = p_game_session_id and pack_id = btrim(p_pack_id)
  for update;

  if found then
    if v_release.version <> btrim(p_version)
       or v_release.pack_sha256 <> p_pack_sha256
       or v_release.target_environment <> p_target_environment then
      raise exception using errcode = '23505', message = 'SEED_RELEASE_CONFLICTING_VERSION_OR_DIGEST';
    end if;
    v_release_id := v_release.id;
    v_existing_status := v_release.status;
    v_replayed := v_release.status in ('applied_inactive', 'applied_active', 'deactivated');
    update public.seed_content_releases
    set status = 'importing',
        activation_requested = p_activate,
        authorization_id = p_authorization_id,
        approved_by = p_approved_by,
        failure_code = null,
        updated_at = now()
    where id = v_release_id;
  else
    insert into public.seed_content_releases (
      id, game_session_id, pack_id, version, pack_sha256, target_environment,
      authorization_id, approved_by, activation_requested, status
    ) values (
      v_release_id, p_game_session_id, btrim(p_pack_id), btrim(p_version), p_pack_sha256,
      p_target_environment, p_authorization_id, p_approved_by, p_activate, 'importing'
    ) returning * into v_release;
  end if;

  v_seed_marker := jsonb_build_object(
    'packId', btrim(p_pack_id),
    'version', btrim(p_version),
    'packSha256', p_pack_sha256
  );

  begin
    for v_entry in select value from jsonb_array_elements(p_market_templates)
    loop
      v_stable_key := nullif(btrim(v_entry->>'stableId'), '');
      v_natural_key := upper(nullif(btrim(v_entry->>'ticker'), ''));
      if v_stable_key is null or v_natural_key is null then
        raise exception using errcode = '22023', message = 'SEED_RELEASE_MALFORMED_MARKET_ENTRY';
      end if;
      v_record_id := public.seed_content_stable_uuid_v1('econovaria-seed|stock-template|' || v_stable_key);

      select * into v_existing_stock
      from public.stock_templates
      where lower(ticker) = lower(v_natural_key)
      for update;

      if found then
        v_existing_owner := v_existing_stock.fundamentals #>> '{_seed,packId}';
        if v_existing_owner is distinct from btrim(p_pack_id) then
          raise exception using errcode = '23505', message = 'SEED_RELEASE_UNOWNED_STOCK_TEMPLATE_CONFLICT:' || v_natural_key;
        end if;
        v_record_id := v_existing_stock.id;
        update public.stock_templates
        set company_name = v_entry->>'companyName',
            sector_key = v_entry->>'sectorKey',
            country_code = upper(v_entry->>'countryCode'),
            description = (v_entry->>'instrumentType') || ' on ' || (v_entry->>'exchangeCode') || '; stable seed ' || v_stable_key || '.',
            base_price = (v_entry->>'basePrice')::numeric,
            beta = (v_entry->>'beta')::numeric,
            liquidity = (v_entry->>'liquidity')::numeric,
            long_run_volatility = (v_entry->>'longRunVolatility')::numeric,
            shares_outstanding = nullif(v_entry->>'sharesOutstanding', '')::numeric,
            fundamentals = coalesce(v_entry->'fundamentals', '{}'::jsonb) || jsonb_build_object('_seed', v_seed_marker),
            country_exposure = coalesce(v_entry->'countryExposure', '{}'::jsonb),
            sector_exposure = coalesce(v_entry->'sectorExposure', '{}'::jsonb),
            commodity_exposure = coalesce(v_entry->'commodityExposure', '{}'::jsonb),
            is_active = p_activate,
            updated_at = now()
        where id = v_record_id;
        v_updated := v_updated + 1;
        insert into public.seed_content_release_members (release_id, object_type, stable_key, record_id, created_by_release)
        values (v_release_id, 'stock_template', v_stable_key, v_record_id, false)
        on conflict (release_id, object_type, stable_key)
        do update set record_id = excluded.record_id, updated_at = now();
      else
        insert into public.stock_templates (
          id, ticker, company_name, sector_key, country_code, description,
          base_price, beta, liquidity, long_run_volatility, shares_outstanding,
          fundamentals, country_exposure, sector_exposure, commodity_exposure, is_active
        ) values (
          v_record_id, v_natural_key, v_entry->>'companyName', v_entry->>'sectorKey', upper(v_entry->>'countryCode'),
          (v_entry->>'instrumentType') || ' on ' || (v_entry->>'exchangeCode') || '; stable seed ' || v_stable_key || '.',
          (v_entry->>'basePrice')::numeric, (v_entry->>'beta')::numeric, (v_entry->>'liquidity')::numeric,
          (v_entry->>'longRunVolatility')::numeric, nullif(v_entry->>'sharesOutstanding', '')::numeric,
          coalesce(v_entry->'fundamentals', '{}'::jsonb) || jsonb_build_object('_seed', v_seed_marker),
          coalesce(v_entry->'countryExposure', '{}'::jsonb), coalesce(v_entry->'sectorExposure', '{}'::jsonb),
          coalesce(v_entry->'commodityExposure', '{}'::jsonb), p_activate
        );
        v_inserted := v_inserted + 1;
        insert into public.seed_content_release_members (release_id, object_type, stable_key, record_id, created_by_release)
        values (v_release_id, 'stock_template', v_stable_key, v_record_id, true)
        on conflict (release_id, object_type, stable_key)
        do update set record_id = excluded.record_id, updated_at = now();
      end if;
      v_operation_count := v_operation_count + 1;
      if p_fail_after_operations is not null and v_operation_count >= p_fail_after_operations then
        raise exception using errcode = 'P0001', message = 'SEED_TEST_PARTIAL_FAILURE';
      end if;

      v_record_id := public.seed_content_stable_uuid_v1(
        'econovaria-seed|game-stock-asset|' || p_game_session_id::text || '|' || v_stable_key
      );
      select * into v_existing_asset
      from public.game_session_stock_assets
      where game_session_id = p_game_session_id and lower(ticker) = lower(v_natural_key)
      for update;
      if found then
        select * into v_existing_member
        from public.seed_content_release_members
        where release_id = v_release_id and object_type = 'game_stock_asset' and stable_key = v_stable_key;
        if not found then
          raise exception using errcode = '23505', message = 'SEED_RELEASE_UNOWNED_GAME_ASSET_CONFLICT:' || v_natural_key;
        end if;
        v_record_id := v_existing_asset.id;
        update public.game_session_stock_assets
        set template_id = (select id from public.stock_templates where lower(ticker) = lower(v_natural_key)),
            company_name = v_entry->>'companyName',
            sector_key = v_entry->>'sectorKey',
            country_code = upper(v_entry->>'countryCode'),
            description = (v_entry->>'instrumentType') || ' on ' || (v_entry->>'exchangeCode') || '; stable seed ' || v_stable_key || '.',
            current_price = (v_entry->>'basePrice')::numeric,
            previous_close = (v_entry->>'basePrice')::numeric,
            open_price = (v_entry->>'basePrice')::numeric,
            day_high = (v_entry->>'basePrice')::numeric,
            day_low = (v_entry->>'basePrice')::numeric,
            market_cap = (v_entry->>'basePrice')::numeric * nullif(v_entry->>'sharesOutstanding', '')::numeric,
            shares_outstanding = nullif(v_entry->>'sharesOutstanding', '')::numeric,
            beta = (v_entry->>'beta')::numeric,
            liquidity = (v_entry->>'liquidity')::numeric,
            current_volatility = (v_entry->>'longRunVolatility')::numeric,
            long_run_volatility = (v_entry->>'longRunVolatility')::numeric,
            fair_value_anchor = (v_entry->>'basePrice')::numeric,
            recent_returns = '[]'::jsonb,
            chart_history = jsonb_build_array(jsonb_build_object('tick', 0, 'price', (v_entry->>'basePrice')::numeric)),
            fundamentals = coalesce(v_entry->'fundamentals', '{}'::jsonb) || jsonb_build_object('_seed', v_seed_marker),
            country_exposure = coalesce(v_entry->'countryExposure', '{}'::jsonb),
            sector_exposure = coalesce(v_entry->'sectorExposure', '{}'::jsonb),
            commodity_exposure = coalesce(v_entry->'commodityExposure', '{}'::jsonb),
            is_active = p_activate,
            updated_at = now()
        where id = v_record_id;
        v_updated := v_updated + 1;
      else
        insert into public.game_session_stock_assets (
          id, game_session_id, template_id, ticker, company_name, sector_key, country_code, description,
          current_price, previous_close, open_price, day_high, day_low, market_cap, shares_outstanding,
          beta, liquidity, current_volatility, long_run_volatility, fair_value_anchor,
          recent_returns, chart_history, fundamentals, country_exposure, sector_exposure, commodity_exposure, is_active
        ) values (
          v_record_id, p_game_session_id, (select id from public.stock_templates where lower(ticker) = lower(v_natural_key)),
          v_natural_key, v_entry->>'companyName', v_entry->>'sectorKey', upper(v_entry->>'countryCode'),
          (v_entry->>'instrumentType') || ' on ' || (v_entry->>'exchangeCode') || '; stable seed ' || v_stable_key || '.',
          (v_entry->>'basePrice')::numeric, (v_entry->>'basePrice')::numeric, (v_entry->>'basePrice')::numeric,
          (v_entry->>'basePrice')::numeric, (v_entry->>'basePrice')::numeric,
          (v_entry->>'basePrice')::numeric * nullif(v_entry->>'sharesOutstanding', '')::numeric,
          nullif(v_entry->>'sharesOutstanding', '')::numeric,
          (v_entry->>'beta')::numeric, (v_entry->>'liquidity')::numeric,
          (v_entry->>'longRunVolatility')::numeric, (v_entry->>'longRunVolatility')::numeric,
          (v_entry->>'basePrice')::numeric, '[]'::jsonb,
          jsonb_build_array(jsonb_build_object('tick', 0, 'price', (v_entry->>'basePrice')::numeric)),
          coalesce(v_entry->'fundamentals', '{}'::jsonb) || jsonb_build_object('_seed', v_seed_marker),
          coalesce(v_entry->'countryExposure', '{}'::jsonb), coalesce(v_entry->'sectorExposure', '{}'::jsonb),
          coalesce(v_entry->'commodityExposure', '{}'::jsonb), p_activate
        );
        v_inserted := v_inserted + 1;
        insert into public.seed_content_release_members (release_id, object_type, stable_key, record_id, created_by_release)
        values (v_release_id, 'game_stock_asset', v_stable_key, v_record_id, true)
        on conflict (release_id, object_type, stable_key)
        do update set record_id = excluded.record_id, updated_at = now();
      end if;
      v_operation_count := v_operation_count + 1;
      if p_fail_after_operations is not null and v_operation_count >= p_fail_after_operations then
        raise exception using errcode = 'P0001', message = 'SEED_TEST_PARTIAL_FAILURE';
      end if;
    end loop;

    for v_entry in select value from jsonb_array_elements(p_contract_templates)
    loop
      v_stable_key := nullif(btrim(v_entry->>'templateKey'), '');
      if v_stable_key is null then
        raise exception using errcode = '22023', message = 'SEED_RELEASE_MALFORMED_CONTRACT_ENTRY';
      end if;
      v_record_id := public.seed_content_stable_uuid_v1('econovaria-seed|contract-template|' || lower(v_stable_key));
      select * into v_existing_template
      from public.contract_templates
      where lower(template_key) = lower(v_stable_key)
      for update;
      if found then
        v_existing_owner := v_existing_template.metadata #>> '{_seed,packId}';
        if v_existing_owner is distinct from btrim(p_pack_id) then
          raise exception using errcode = '23505', message = 'SEED_RELEASE_UNOWNED_CONTRACT_TEMPLATE_CONFLICT:' || v_stable_key;
        end if;
        v_record_id := v_existing_template.id;
        update public.contract_templates
        set title = v_entry->>'title',
            description = v_entry->>'description',
            instructions = v_entry->>'instructions',
            category = v_entry->>'category',
            difficulty = v_entry->>'difficulty',
            estimated_duration_minutes = nullif(v_entry->>'estimatedDurationMinutes', '')::integer,
            requirements_payload = coalesce(v_entry->'requirementsPayload', '{}'::jsonb),
            reward_payload = coalesce(v_entry->'rewardPayload', '{}'::jsonb),
            metadata = coalesce(v_entry->'metadata', '{}'::jsonb) || jsonb_build_object('_seed', v_seed_marker),
            is_active = p_activate,
            updated_at = now()
        where id = v_record_id;
        v_updated := v_updated + 1;
        insert into public.seed_content_release_members (release_id, object_type, stable_key, record_id, created_by_release)
        values (v_release_id, 'contract_template', v_stable_key, v_record_id, false)
        on conflict (release_id, object_type, stable_key)
        do update set record_id = excluded.record_id, updated_at = now();
      else
        insert into public.contract_templates (
          id, template_key, title, description, instructions, category, difficulty,
          estimated_duration_minutes, requirements_payload, reward_payload, metadata, is_active
        ) values (
          v_record_id, v_stable_key, v_entry->>'title', v_entry->>'description', v_entry->>'instructions',
          v_entry->>'category', v_entry->>'difficulty', nullif(v_entry->>'estimatedDurationMinutes', '')::integer,
          coalesce(v_entry->'requirementsPayload', '{}'::jsonb), coalesce(v_entry->'rewardPayload', '{}'::jsonb),
          coalesce(v_entry->'metadata', '{}'::jsonb) || jsonb_build_object('_seed', v_seed_marker), p_activate
        );
        v_inserted := v_inserted + 1;
        insert into public.seed_content_release_members (release_id, object_type, stable_key, record_id, created_by_release)
        values (v_release_id, 'contract_template', v_stable_key, v_record_id, true)
        on conflict (release_id, object_type, stable_key)
        do update set record_id = excluded.record_id, updated_at = now();
      end if;
      v_template_id := v_record_id;
      v_operation_count := v_operation_count + 1;
      if p_fail_after_operations is not null and v_operation_count >= p_fail_after_operations then
        raise exception using errcode = 'P0001', message = 'SEED_TEST_PARTIAL_FAILURE';
      end if;

      v_record_id := public.seed_content_stable_uuid_v1(
        'econovaria-seed|game-contract|' || p_game_session_id::text || '|' || lower(v_stable_key)
      );
      select * into v_existing_contract
      from public.game_session_contracts
      where game_session_id = p_game_session_id and lower(contract_key) = lower(v_stable_key)
      for update;
      if found then
        select * into v_existing_member
        from public.seed_content_release_members
        where release_id = v_release_id and object_type = 'game_contract' and stable_key = v_stable_key;
        if not found then
          raise exception using errcode = '23505', message = 'SEED_RELEASE_UNOWNED_GAME_CONTRACT_CONFLICT:' || v_stable_key;
        end if;
        v_record_id := v_existing_contract.id;
        update public.game_session_contracts
        set contract_template_id = v_template_id,
            source_type = 'system',
            title = v_entry->>'title',
            description = v_entry->>'description',
            instructions = v_entry->>'instructions',
            category = v_entry->>'category',
            status = case when p_activate then 'active' else 'draft' end,
            visibility = case when p_activate then 'public' else 'hidden' end,
            targeting_payload = jsonb_build_object('country', v_entry->>'country', 'tutorialChain', true),
            requirements_payload = coalesce(v_entry->'requirementsPayload', '{}'::jsonb),
            reward_payload = coalesce(v_entry->'rewardPayload', '{}'::jsonb),
            completion_mode = 'manual_review',
            published_at = case when p_activate then coalesce(v_existing_contract.published_at, now()) else null end,
            metadata = coalesce(v_entry->'metadata', '{}'::jsonb) || jsonb_build_object('_seed', v_seed_marker),
            updated_at = now()
        where id = v_record_id;
        v_updated := v_updated + 1;
      else
        insert into public.game_session_contracts (
          id, game_session_id, contract_template_id, contract_key, source_type,
          title, description, instructions, category, status, visibility, targeting_payload,
          requirements_payload, reward_payload, completion_mode, published_at, metadata
        ) values (
          v_record_id, p_game_session_id, v_template_id, v_stable_key, 'system',
          v_entry->>'title', v_entry->>'description', v_entry->>'instructions', v_entry->>'category',
          case when p_activate then 'active' else 'draft' end,
          case when p_activate then 'public' else 'hidden' end,
          jsonb_build_object('country', v_entry->>'country', 'tutorialChain', true),
          coalesce(v_entry->'requirementsPayload', '{}'::jsonb), coalesce(v_entry->'rewardPayload', '{}'::jsonb),
          'manual_review', case when p_activate then now() else null end,
          coalesce(v_entry->'metadata', '{}'::jsonb) || jsonb_build_object('_seed', v_seed_marker)
        );
        v_inserted := v_inserted + 1;
        insert into public.seed_content_release_members (release_id, object_type, stable_key, record_id, created_by_release)
        values (v_release_id, 'game_contract', v_stable_key, v_record_id, true)
        on conflict (release_id, object_type, stable_key)
        do update set record_id = excluded.record_id, updated_at = now();
      end if;
      v_operation_count := v_operation_count + 1;
      if p_fail_after_operations is not null and v_operation_count >= p_fail_after_operations then
        raise exception using errcode = 'P0001', message = 'SEED_TEST_PARTIAL_FAILURE';
      end if;
    end loop;

    for v_entry in select value from jsonb_array_elements(p_store_items)
    loop
      v_stable_key := nullif(btrim(v_entry->>'itemKey'), '');
      if v_stable_key is null then
        raise exception using errcode = '22023', message = 'SEED_RELEASE_MALFORMED_STORE_ENTRY';
      end if;
      v_record_id := public.seed_content_stable_uuid_v1(
        'econovaria-seed|store-item|' || p_game_session_id::text || '|' || lower(v_stable_key)
      );
      select * into v_existing_store
      from public.store_items
      where game_session_id = p_game_session_id and lower(item_key) = lower(v_stable_key)
      for update;
      if found then
        select * into v_existing_member
        from public.seed_content_release_members
        where release_id = v_release_id and object_type = 'store_item' and stable_key = v_stable_key;
        if not found then
          raise exception using errcode = '23505', message = 'SEED_RELEASE_UNOWNED_STORE_ITEM_CONFLICT:' || v_stable_key;
        end if;
        v_record_id := v_existing_store.id;
        update public.store_items
        set name = v_entry->>'name',
            description = nullif(v_entry->>'description', ''),
            category = v_entry->>'category',
            price = (v_entry->>'price')::numeric,
            currency_code = upper(v_entry->>'currencyCode'),
            stock_quantity = (v_entry->>'stockQuantity')::integer,
            status = case when p_activate then 'active' else 'disabled' end,
            visibility = case when p_activate then 'visible' else 'hidden' end,
            sort_order = (v_entry->>'sortOrder')::integer,
            updated_at = now()
        where id = v_record_id;
        v_updated := v_updated + 1;
      else
        insert into public.store_items (
          id, game_session_id, item_key, name, description, category, price,
          currency_code, stock_quantity, status, visibility, sort_order
        ) values (
          v_record_id, p_game_session_id, v_stable_key, v_entry->>'name', nullif(v_entry->>'description', ''),
          v_entry->>'category', (v_entry->>'price')::numeric, upper(v_entry->>'currencyCode'),
          (v_entry->>'stockQuantity')::integer,
          case when p_activate then 'active' else 'disabled' end,
          case when p_activate then 'visible' else 'hidden' end,
          (v_entry->>'sortOrder')::integer
        );
        v_inserted := v_inserted + 1;
        insert into public.seed_content_release_members (release_id, object_type, stable_key, record_id, created_by_release)
        values (v_release_id, 'store_item', v_stable_key, v_record_id, true)
        on conflict (release_id, object_type, stable_key)
        do update set record_id = excluded.record_id, updated_at = now();
      end if;
      v_operation_count := v_operation_count + 1;
      if p_fail_after_operations is not null and v_operation_count >= p_fail_after_operations then
        raise exception using errcode = 'P0001', message = 'SEED_TEST_PARTIAL_FAILURE';
      end if;
    end loop;

    v_result := jsonb_build_object(
      'outcome', case when v_replayed then 'replayed' else 'applied' end,
      'releaseId', v_release_id,
      'packId', btrim(p_pack_id),
      'version', btrim(p_version),
      'packSha256', p_pack_sha256,
      'gameSessionId', p_game_session_id,
      'activated', p_activate,
      'inserted', v_inserted,
      'updated', v_updated,
      'operationCount', v_operation_count,
      'counts', jsonb_build_object(
        'stockTemplates', 240,
        'gameStockAssets', 240,
        'contractTemplates', 30,
        'gameContracts', 30,
        'storeItems', 50
      )
    );

    update public.seed_content_releases
    set status = case when p_activate then 'applied_active' else 'applied_inactive' end,
        operation_count = v_operation_count,
        result = v_result,
        failure_code = null,
        applied_at = now(),
        deactivated_at = null,
        rolled_back_at = null,
        updated_at = now()
    where id = v_release_id;

    return v_result;
  exception when others then
    update public.seed_content_releases
    set status = 'failed',
        operation_count = 0,
        result = jsonb_build_object(
          'outcome', 'failed',
          'releaseId', v_release_id,
          'failureCode', sqlstate,
          'failureMessage', sqlerrm,
          'transactionRolledBack', true
        ),
        failure_code = sqlstate || ':' || sqlerrm,
        updated_at = now()
    where id = v_release_id;
    return (select result from public.seed_content_releases where id = v_release_id);
  end;
end;
$$;

create or replace function public.deactivate_seed_content_release_v1(
  p_game_session_id uuid,
  p_pack_id text,
  p_version text,
  p_pack_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_release public.seed_content_releases%rowtype;
  v_member public.seed_content_release_members%rowtype;
  v_count integer := 0;
begin
  if not public.seed_content_request_is_privileged_v1() then
    raise exception using errcode = '42501', message = 'SEED_RELEASE_SERVICE_ROLE_REQUIRED';
  end if;
  select * into v_release
  from public.seed_content_releases
  where game_session_id = p_game_session_id and pack_id = btrim(p_pack_id)
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SEED_RELEASE_NOT_FOUND';
  end if;
  if v_release.version <> btrim(p_version) or v_release.pack_sha256 <> p_pack_sha256 then
    raise exception using errcode = '23505', message = 'SEED_RELEASE_CONFLICTING_VERSION_OR_DIGEST';
  end if;

  for v_member in select * from public.seed_content_release_members where release_id = v_release.id
  loop
    case v_member.object_type
      when 'game_stock_asset' then
        update public.game_session_stock_assets set is_active = false, updated_at = now() where id = v_member.record_id and game_session_id = p_game_session_id;
      when 'game_contract' then
        update public.game_session_contracts set status = 'paused', visibility = 'hidden', published_at = null, updated_at = now() where id = v_member.record_id and game_session_id = p_game_session_id;
      when 'store_item' then
        update public.store_items set status = 'disabled', visibility = 'hidden', updated_at = now() where id = v_member.record_id and game_session_id = p_game_session_id;
      when 'stock_template' then
        if not exists (
          select 1
          from public.seed_content_release_members m
          join public.seed_content_releases r on r.id = m.release_id
          where m.object_type = 'stock_template' and m.record_id = v_member.record_id
            and r.id <> v_release.id and r.status = 'applied_active'
        ) then
          update public.stock_templates set is_active = false, updated_at = now() where id = v_member.record_id;
        end if;
      when 'contract_template' then
        if not exists (
          select 1
          from public.seed_content_release_members m
          join public.seed_content_releases r on r.id = m.release_id
          where m.object_type = 'contract_template' and m.record_id = v_member.record_id
            and r.id <> v_release.id and r.status = 'applied_active'
        ) then
          update public.contract_templates set is_active = false, updated_at = now() where id = v_member.record_id;
        end if;
    end case;
    v_count := v_count + 1;
  end loop;

  update public.seed_content_releases
  set status = 'deactivated', deactivated_at = now(), updated_at = now(),
      result = result || jsonb_build_object('deactivatedAt', now(), 'deactivatedMembers', v_count)
  where id = v_release.id;

  return jsonb_build_object(
    'outcome', 'deactivated', 'releaseId', v_release.id,
    'gameSessionId', p_game_session_id, 'memberCount', v_count
  );
end;
$$;

create or replace function public.rollback_seed_content_release_v1(
  p_game_session_id uuid,
  p_pack_id text,
  p_version text,
  p_pack_sha256 text,
  p_allow_soft_rollback boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_release public.seed_content_releases%rowtype;
  v_member public.seed_content_release_members%rowtype;
  v_deleted integer := 0;
  v_soft integer := 0;
  v_other_reference boolean;
begin
  if not public.seed_content_request_is_privileged_v1() then
    raise exception using errcode = '42501', message = 'SEED_RELEASE_SERVICE_ROLE_REQUIRED';
  end if;
  select * into v_release
  from public.seed_content_releases
  where game_session_id = p_game_session_id and pack_id = btrim(p_pack_id)
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SEED_RELEASE_NOT_FOUND';
  end if;
  if v_release.version <> btrim(p_version) or v_release.pack_sha256 <> p_pack_sha256 then
    raise exception using errcode = '23505', message = 'SEED_RELEASE_CONFLICTING_VERSION_OR_DIGEST';
  end if;

  for v_member in
    select * from public.seed_content_release_members
    where release_id = v_release.id
    order by case object_type
      when 'game_contract' then 1
      when 'store_item' then 2
      when 'game_stock_asset' then 3
      when 'contract_template' then 4
      when 'stock_template' then 5
      else 9 end
  loop
    v_other_reference := exists (
      select 1
      from public.seed_content_release_members m
      join public.seed_content_releases r on r.id = m.release_id
      where m.object_type = v_member.object_type and m.record_id = v_member.record_id
        and r.id <> v_release.id and r.status not in ('rolled_back', 'failed')
    );

    if v_member.object_type in ('stock_template', 'contract_template') and v_other_reference then
      continue;
    end if;

    begin
      case v_member.object_type
        when 'game_contract' then
          delete from public.game_session_contracts where id = v_member.record_id and game_session_id = p_game_session_id;
        when 'store_item' then
          delete from public.store_items where id = v_member.record_id and game_session_id = p_game_session_id;
        when 'game_stock_asset' then
          delete from public.game_session_stock_assets where id = v_member.record_id and game_session_id = p_game_session_id;
        when 'contract_template' then
          if v_member.created_by_release then delete from public.contract_templates where id = v_member.record_id; end if;
        when 'stock_template' then
          if v_member.created_by_release then delete from public.stock_templates where id = v_member.record_id; end if;
      end case;
      if found then v_deleted := v_deleted + 1; end if;
    exception when foreign_key_violation then
      if not p_allow_soft_rollback then raise; end if;
      case v_member.object_type
        when 'game_contract' then
          update public.game_session_contracts set status = 'archived', visibility = 'hidden', published_at = null, updated_at = now() where id = v_member.record_id;
        when 'store_item' then
          update public.store_items set status = 'archived', visibility = 'hidden', updated_at = now() where id = v_member.record_id;
        when 'game_stock_asset' then
          update public.game_session_stock_assets set is_active = false, updated_at = now() where id = v_member.record_id;
        when 'contract_template' then
          update public.contract_templates set is_active = false, updated_at = now() where id = v_member.record_id;
        when 'stock_template' then
          update public.stock_templates set is_active = false, updated_at = now() where id = v_member.record_id;
      end case;
      v_soft := v_soft + 1;
    end;
  end loop;

  update public.seed_content_releases
  set status = 'rolled_back', rolled_back_at = now(), updated_at = now(),
      result = result || jsonb_build_object('rolledBackAt', now(), 'deletedRecords', v_deleted, 'softDeactivatedRecords', v_soft)
  where id = v_release.id;

  return jsonb_build_object(
    'outcome', 'rolled_back', 'releaseId', v_release.id,
    'gameSessionId', p_game_session_id, 'deleted', v_deleted, 'softDeactivated', v_soft,
    'playerHistoryPreserved', true
  );
end;
$$;

create or replace function public.inspect_seed_content_release_v1(
  p_game_session_id uuid,
  p_pack_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_release public.seed_content_releases%rowtype;
begin
  if not public.seed_content_request_is_privileged_v1() then
    raise exception using errcode = '42501', message = 'SEED_RELEASE_SERVICE_ROLE_REQUIRED';
  end if;
  select * into v_release
  from public.seed_content_releases
  where game_session_id = p_game_session_id and pack_id = btrim(p_pack_id);
  if not found then return null; end if;
  return jsonb_build_object(
    'releaseId', v_release.id,
    'gameSessionId', v_release.game_session_id,
    'packId', v_release.pack_id,
    'version', v_release.version,
    'packSha256', v_release.pack_sha256,
    'targetEnvironment', v_release.target_environment,
    'status', v_release.status,
    'activationRequested', v_release.activation_requested,
    'operationCount', v_release.operation_count,
    'memberCount', (select count(*) from public.seed_content_release_members where release_id = v_release.id),
    'result', v_release.result,
    'updatedAt', v_release.updated_at
  );
end;
$$;

revoke all on function public.seed_content_stable_uuid_v1(text) from public, anon, authenticated;
revoke all on function public.seed_content_request_is_privileged_v1() from public, anon, authenticated;
revoke all on function public.apply_seed_content_release_v1(uuid, text, text, text, text, boolean, text, text, jsonb, jsonb, jsonb, integer) from public, anon, authenticated;
revoke all on function public.deactivate_seed_content_release_v1(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.rollback_seed_content_release_v1(uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.inspect_seed_content_release_v1(uuid, text) from public, anon, authenticated;

grant execute on function public.apply_seed_content_release_v1(uuid, text, text, text, text, boolean, text, text, jsonb, jsonb, jsonb, integer) to service_role;
grant execute on function public.deactivate_seed_content_release_v1(uuid, text, text, text) to service_role;
grant execute on function public.rollback_seed_content_release_v1(uuid, text, text, text, boolean) to service_role;
grant execute on function public.inspect_seed_content_release_v1(uuid, text) to service_role;

commit;
