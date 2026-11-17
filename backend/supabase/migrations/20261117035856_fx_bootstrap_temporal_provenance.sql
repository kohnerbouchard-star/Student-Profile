begin;

-- Definition-only correction: no bootstrap invocation or historical rewrite.
-- Existing immutable fixings retain NULL provenance (unknown, not invented).
alter table public.fx_fixings
  add column legacy_rate_source_effective_at timestamptz;
alter table public.fx_fixings
  add constraint fx_fixings_legacy_source_time_check check (
    legacy_rate_source_effective_at is null or (
      fixing_kind = 'bootstrap' and source_kind = 'legacy_matrix'
      and legacy_rate_source_effective_at <= effective_at
    )
  );
comment on column public.fx_fixings.legacy_rate_source_effective_at is
  'Original coherent legacy matrix timestamp; distinct from canonical carry-forward effective_at. NULL for historical rows without recorded provenance.';

create or replace function public.initialize_fx_authority_for_game_v1(
  p_game_session_id uuid,
  p_effective_at timestamptz default clock_timestamp(),
  p_allow_policy_baseline boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_policy public.fx_policy_versions%rowtype;
  v_existing public.fx_fixings%rowtype;
  v_timezone text;
  v_lifecycle_state text;
  v_effective_at timestamptz := p_effective_at;
  v_calculated_at timestamptz := clock_timestamp();
  v_snapshot_effective_at timestamptz;
  v_legacy_source_effective_at timestamptz;
  v_legacy_rows integer := 0;
  v_pair_count integer := 0;
  v_incoherent_count integer := 0;
  v_snapshot_count integer := 0;
  v_currency_count integer := 0;
  v_source_kind text;
  v_values jsonb;
  v_snapshots jsonb;
  v_input_manifest jsonb;
  v_input_hash text;
  v_fixing_id uuid;
  v_fixing_public_key text;
begin
  if p_game_session_id is null
     or p_effective_at is null
     or p_allow_policy_baseline is null
  then
    raise exception 'FX_BOOTSTRAP_REQUEST_INVALID' using errcode = '22023';
  end if;

  -- Match lifecycle-trigger lock order: game row, bootstrap lock, runtime row.
  -- Read lifecycle under lock so a concurrent pause cannot be rescheduled.
  -- NO KEY UPDATE permits the fixing worker FK KEY SHARE while it holds runtime;
  -- FOR UPDATE would deadlock that worker against this runtime acquisition.
  select game_row.lifecycle_state into v_lifecycle_state
  from public.game_sessions as game_row
  where game_row.id = p_game_session_id
  for no key update;
  if not found then
    raise exception 'FX_BOOTSTRAP_GAME_NOT_FOUND' using errcode = 'P0001';
  end if;

  select policy_row.*
  into v_policy
  from public.fx_policy_versions as policy_row
  where policy_row.status = 'published'
    and policy_row.activated_at <= v_calculated_at
  order by policy_row.activated_at desc, policy_row.policy_version desc
  limit 1;

  if not found then
    raise exception 'FX_ACTIVE_POLICY_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_timezone := public.game_timezone_for_game_v1(p_game_session_id);

  -- Serialize bootstrap attempts using the existing Story per-game lock.
  -- Fixing workers remain serialized by the runtime row lock below.
  perform pg_advisory_xact_lock(
    hashtextextended(p_game_session_id::text, 2608252238)
  );

  select fixing_row.*
  into v_existing
  from public.fx_fixings as fixing_row
  where fixing_row.game_session_id = p_game_session_id
    and fixing_row.fixing_kind = 'bootstrap';

  if found then
    -- Serialize against the fixing worker before selecting the canonical
    -- current pointer.  Re-running bootstrap authority must never rewind a
    -- game from a published daily fixing back to its bootstrap fixing.
    perform 1
    from private.fx_runtime_state as runtime
    where runtime.game_session_id = p_game_session_id
    for update;

    select fixing_row.*
    into strict v_existing
    from public.fx_fixings as fixing_row
    where fixing_row.game_session_id = p_game_session_id
    order by
      fixing_row.effective_at desc,
      fixing_row.calculated_at desc,
      fixing_row.id desc
    limit 1;

    insert into private.fx_runtime_state (
      game_session_id,
      cutover_status,
      blocked_reason,
      current_fixing_id,
      policy_version_id,
      next_due_at,
      last_success_at,
      updated_at
    )
    values (
      p_game_session_id,
      'ready',
      null,
      v_existing.id,
      v_existing.policy_version_id,
      case when v_lifecycle_state = 'paused' then null
        else private.fx_next_boundary_v1(clock_timestamp(), v_existing.game_timezone) end,
      v_existing.calculated_at,
      clock_timestamp()
    )
    on conflict (game_session_id) do update
    set cutover_status = 'ready',
        blocked_reason = null,
        current_fixing_id = excluded.current_fixing_id,
        policy_version_id = excluded.policy_version_id,
        next_due_at = case when v_lifecycle_state = 'paused' then null
          else coalesce(private.fx_runtime_state.next_due_at, excluded.next_due_at) end,
        retry_after_at = null,
        last_success_at = coalesce(
          private.fx_runtime_state.last_success_at,
          excluded.last_success_at
        ),
        updated_at = clock_timestamp();

    return jsonb_build_object(
      'outcome', 'replayed',
      'cutoverStatus', 'ready',
      'fixingPublicId', v_existing.public_key
    );
  end if;

  insert into private.fx_runtime_state (
    game_session_id,
    cutover_status,
    blocked_reason,
    policy_version_id,
    updated_at
  )
  values (
    p_game_session_id,
    'pending',
    null,
    v_policy.id,
    clock_timestamp()
  )
  on conflict (game_session_id) do update
  set cutover_status = 'pending',
      blocked_reason = null,
      policy_version_id = excluded.policy_version_id,
      retry_after_at = null,
      updated_at = clock_timestamp();

  select count(*)::integer
  into v_legacy_rows
  from public.currency_exchange_rates as rate_row
  where rate_row.game_session_id = p_game_session_id
    and rate_row.from_currency_code in (
      'NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV'
    )
    and rate_row.to_currency_code in (
      'NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV'
    )
    and rate_row.from_currency_code <> rate_row.to_currency_code
    and rate_row.effective_at <= p_effective_at;

  if v_legacy_rows > 0 then
    select max(matrix.effective_at)
    into v_effective_at
    from (
      select rate_row.effective_at
      from public.currency_exchange_rates as rate_row
      where rate_row.game_session_id = p_game_session_id
        and rate_row.from_currency_code in (
          'NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV'
        )
        and rate_row.to_currency_code in (
          'NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV'
        )
        and rate_row.from_currency_code <> rate_row.to_currency_code
        and rate_row.effective_at <= p_effective_at
      group by rate_row.effective_at
      having count(distinct (
        rate_row.from_currency_code,
        rate_row.to_currency_code
      )) = 90
    ) as matrix;

    if v_effective_at is not null then
      select count(*)::integer
      into v_pair_count
      from (
        select distinct on (
          rate_row.from_currency_code,
          rate_row.to_currency_code
        )
          rate_row.from_currency_code,
          rate_row.to_currency_code
        from public.currency_exchange_rates as rate_row
        where rate_row.game_session_id = p_game_session_id
          and rate_row.from_currency_code in (
            'NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV'
          )
          and rate_row.to_currency_code in (
            'NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV'
          )
          and rate_row.from_currency_code <> rate_row.to_currency_code
          and rate_row.effective_at = v_effective_at
        order by
          rate_row.from_currency_code,
          rate_row.to_currency_code,
          rate_row.created_at desc,
          rate_row.id desc
      ) as matrix_pairs;
    end if;

    if v_pair_count <> 90 then
      update private.fx_runtime_state
      set cutover_status = 'blocked',
          blocked_reason = 'FX_LEGACY_MATRIX_INCOMPLETE',
          next_due_at = null,
          retry_after_at = null,
          updated_at = clock_timestamp()
      where game_session_id = p_game_session_id;

      return jsonb_build_object(
        'outcome', 'blocked',
        'cutoverStatus', 'blocked',
        'reason', 'FX_LEGACY_MATRIX_INCOMPLETE',
        'pairCount', v_pair_count
      );
    end if;

    with latest_rates as (
      select distinct on (
        rate_row.from_currency_code,
        rate_row.to_currency_code
      )
        rate_row.from_currency_code,
        rate_row.to_currency_code,
        rate_row.rate
      from public.currency_exchange_rates as rate_row
      where rate_row.game_session_id = p_game_session_id
        and rate_row.from_currency_code in (
          'NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV'
        )
        and rate_row.to_currency_code in (
          'NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV'
        )
        and rate_row.from_currency_code <> rate_row.to_currency_code
        and rate_row.effective_at = v_effective_at
      order by
        rate_row.from_currency_code,
        rate_row.to_currency_code,
        rate_row.created_at desc,
        rate_row.id desc
    ), national_values as (
      select
        profile.currency_code,
        profile.country_code,
        case
          when profile.currency_code = 'VAL' then 1::numeric
          else val_rate.rate
        end::numeric(38, 18) as units_per_eco
      from public.country_profiles as profile
      left join latest_rates as val_rate
        on val_rate.from_currency_code = 'VAL'
       and val_rate.to_currency_code = profile.currency_code
      where profile.status = 'active'
    ), all_values as (
      select
        national.currency_code,
        national.country_code,
        national.units_per_eco
      from national_values as national
      union all
      select 'ECO'::text, null::text, 1::numeric(38, 18)
    )
    select jsonb_agg(
      jsonb_build_object(
        'currencyCode', value_row.currency_code,
        'countryCode', value_row.country_code,
        'unitsPerEco', value_row.units_per_eco::text
      )
      order by case when value_row.currency_code = 'ECO' then 0 else 1 end,
               value_row.currency_code
    )
    into v_values
    from all_values as value_row
    where value_row.units_per_eco is not null;

    select jsonb_array_length(coalesce(v_values, '[]'::jsonb))
    into v_currency_count;

    if v_currency_count <> 11 then
      update private.fx_runtime_state
      set cutover_status = 'blocked',
          blocked_reason = 'FX_LEGACY_VECTOR_INCOMPLETE',
          next_due_at = null,
          retry_after_at = null,
          updated_at = clock_timestamp()
      where game_session_id = p_game_session_id;

      return jsonb_build_object(
        'outcome', 'blocked',
        'cutoverStatus', 'blocked',
        'reason', 'FX_LEGACY_VECTOR_INCOMPLETE'
      );
    end if;

    with latest_rates as (
      select distinct on (
        rate_row.from_currency_code,
        rate_row.to_currency_code
      )
        rate_row.from_currency_code,
        rate_row.to_currency_code,
        rate_row.rate
      from public.currency_exchange_rates as rate_row
      where rate_row.game_session_id = p_game_session_id
        and rate_row.from_currency_code in (
          'NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV'
        )
        and rate_row.to_currency_code in (
          'NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV'
        )
        and rate_row.from_currency_code <> rate_row.to_currency_code
        and rate_row.effective_at = v_effective_at
      order by
        rate_row.from_currency_code,
        rate_row.to_currency_code,
        rate_row.created_at desc,
        rate_row.id desc
    ), value_rows as (
      select
        item ->> 'currencyCode' as currency_code,
        (item ->> 'unitsPerEco')::numeric as units_per_eco
      from jsonb_array_elements(v_values) as value_item(item)
      where item ->> 'currencyCode' <> 'ECO'
    )
    select count(*)::integer
    into v_incoherent_count
    from latest_rates as rate_row
    join value_rows as source_value
      on source_value.currency_code = rate_row.from_currency_code
    join value_rows as target_value
      on target_value.currency_code = rate_row.to_currency_code
    where abs(
      rate_row.rate - (target_value.units_per_eco / source_value.units_per_eco)
    ) > 0.00000001::numeric;

    if v_incoherent_count <> 0 then
      update private.fx_runtime_state
      set cutover_status = 'blocked',
          blocked_reason = 'FX_LEGACY_MATRIX_INCOHERENT',
          next_due_at = null,
          retry_after_at = null,
          updated_at = clock_timestamp()
      where game_session_id = p_game_session_id;

      return jsonb_build_object(
        'outcome', 'blocked',
        'cutoverStatus', 'blocked',
        'reason', 'FX_LEGACY_MATRIX_INCOHERENT',
        'incoherentPairs', v_incoherent_count
      );
    end if;

    v_source_kind := 'legacy_matrix';
    v_legacy_source_effective_at := v_effective_at;
  elsif p_allow_policy_baseline then
    with baseline(currency_code, units_per_eco) as (
      values
        ('NRC'::text, 0.940000000000000000::numeric),
        ('YRC'::text, 1.030000000000000000::numeric),
        ('THD'::text, 1.480000000000000000::numeric),
        ('SLV'::text, 0.780000000000000000::numeric),
        ('ELD'::text, 1.010000000000000000::numeric),
        ('VAL'::text, 1.000000000000000000::numeric),
        ('LUM'::text, 1.360000000000000000::numeric),
        ('SYN'::text, 1.120000000000000000::numeric),
        ('XAL'::text, 1.240000000000000000::numeric),
        ('DRV'::text, 1.610000000000000000::numeric)
    ), all_values as (
      select
        baseline.currency_code,
        profile.country_code,
        baseline.units_per_eco::numeric(38, 18) as units_per_eco
      from baseline
      join public.country_profiles as profile
        on profile.currency_code = baseline.currency_code
       and profile.status = 'active'
      union all
      select 'ECO'::text, null::text, 1::numeric(38, 18)
    )
    select jsonb_agg(
      jsonb_build_object(
        'currencyCode', value_row.currency_code,
        'countryCode', value_row.country_code,
        'unitsPerEco', value_row.units_per_eco::text
      )
      order by case when value_row.currency_code = 'ECO' then 0 else 1 end,
               value_row.currency_code
    )
    into v_values
    from all_values as value_row;

    select jsonb_array_length(coalesce(v_values, '[]'::jsonb))
    into v_currency_count;

    if v_currency_count <> 11 then
      update private.fx_runtime_state
      set cutover_status = 'blocked',
          blocked_reason = 'FX_CURRENCY_REGISTRY_INCOMPLETE',
          next_due_at = null,
          retry_after_at = null,
          updated_at = clock_timestamp()
      where game_session_id = p_game_session_id;

      return jsonb_build_object(
        'outcome', 'blocked',
        'cutoverStatus', 'blocked',
        'reason', 'FX_CURRENCY_REGISTRY_INCOMPLETE'
      );
    end if;

    v_source_kind := 'policy_baseline';
  else
    update private.fx_runtime_state
    set cutover_status = 'blocked',
        blocked_reason = 'FX_LEGACY_MATRIX_MISSING',
        next_due_at = null,
        retry_after_at = null,
        updated_at = clock_timestamp()
    where game_session_id = p_game_session_id;

    return jsonb_build_object(
      'outcome', 'blocked',
      'cutoverStatus', 'blocked',
      'reason', 'FX_LEGACY_MATRIX_MISSING'
    );
  end if;

  select max(cohort.effective_at)
  into v_snapshot_effective_at
  from (
    select snapshot_row.effective_at
    from public.country_economic_snapshots as snapshot_row
    join public.country_profiles as profile
      on profile.id = snapshot_row.country_profile_id
     and profile.status = 'active'
    where snapshot_row.game_session_id = p_game_session_id
      and snapshot_row.effective_at <= v_effective_at
    group by snapshot_row.effective_at
    having count(distinct snapshot_row.country_profile_id) = 10
  ) as cohort;

  -- A legacy matrix can predate the first complete real macro cohort.
  -- Carry its unchanged vector forward only to the earliest real cohort
  -- within the caller's cutover horizon. Never backdate or synthesize macro
  -- history, and never skip past an already admissible historical cohort.
  if v_snapshot_effective_at is null and v_source_kind = 'legacy_matrix' then
    select min(cohort.effective_at)
    into v_snapshot_effective_at
    from (
      select snapshot_row.effective_at
      from public.country_economic_snapshots as snapshot_row
      join public.country_profiles as profile
        on profile.id = snapshot_row.country_profile_id
       and profile.status = 'active'
      where snapshot_row.game_session_id = p_game_session_id
        and snapshot_row.effective_at > v_legacy_source_effective_at
        and snapshot_row.effective_at <= least(p_effective_at, v_calculated_at)
      group by snapshot_row.effective_at
      having count(distinct snapshot_row.country_profile_id) = 10
    ) as cohort;

    if v_snapshot_effective_at is not null then
      v_effective_at := v_snapshot_effective_at;
    end if;
  end if;

  if v_snapshot_effective_at is not null then
    select count(*)::integer
    into v_snapshot_count
    from (
      select distinct on (profile.id) snapshot_row.id
      from public.country_profiles as profile
      join public.country_economic_snapshots as snapshot_row
        on snapshot_row.country_profile_id = profile.id
       and snapshot_row.game_session_id = p_game_session_id
       and snapshot_row.effective_at = v_snapshot_effective_at
      where profile.status = 'active'
      order by
        profile.id,
        snapshot_row.snapshot_sequence desc,
        snapshot_row.created_at desc,
        snapshot_row.id desc
    ) as cohort_snapshots;
  end if;

  if v_snapshot_count = 0 and p_allow_policy_baseline then
    perform *
    from public.initialize_country_economic_snapshots_for_game(
      p_game_session_id,
      v_effective_at,
      'Canonical FX bootstrap baseline',
      jsonb_build_object('source', 'canonical-fx-authority-v1')
    );

    v_snapshot_effective_at := v_effective_at;

    select count(*)::integer
    into v_snapshot_count
    from (
      select distinct on (profile.id) snapshot_row.id
      from public.country_profiles as profile
      join public.country_economic_snapshots as snapshot_row
        on snapshot_row.country_profile_id = profile.id
       and snapshot_row.game_session_id = p_game_session_id
       and snapshot_row.effective_at = v_snapshot_effective_at
      where profile.status = 'active'
      order by
        profile.id,
        snapshot_row.snapshot_sequence desc,
        snapshot_row.created_at desc,
        snapshot_row.id desc
    ) as latest_snapshots;
  end if;

  if v_snapshot_count <> 10 then
    update private.fx_runtime_state
    set cutover_status = 'blocked',
        blocked_reason = 'FX_MACRO_SNAPSHOT_SET_INCOMPLETE',
        next_due_at = null,
        retry_after_at = null,
        updated_at = clock_timestamp()
    where game_session_id = p_game_session_id;

    return jsonb_build_object(
      'outcome', 'blocked',
      'cutoverStatus', 'blocked',
      'reason', 'FX_MACRO_SNAPSHOT_SET_INCOMPLETE',
      'snapshotCount', v_snapshot_count
    );
  end if;

  with latest_snapshots as (
    select distinct on (profile.id)
      profile.id as country_profile_id,
      profile.country_code,
      profile.currency_code,
      snapshot_row.id as snapshot_id,
      snapshot_row.snapshot_sequence,
      snapshot_row.effective_at
    from public.country_profiles as profile
    join public.country_economic_snapshots as snapshot_row
      on snapshot_row.country_profile_id = profile.id
     and snapshot_row.game_session_id = p_game_session_id
     and snapshot_row.effective_at = v_snapshot_effective_at
    where profile.status = 'active'
    order by
      profile.id,
      snapshot_row.snapshot_sequence desc,
      snapshot_row.created_at desc,
      snapshot_row.id desc
  )
  select jsonb_agg(
    jsonb_build_object(
      'countryProfileId', snapshot.country_profile_id,
      'countryCode', snapshot.country_code,
      'currencyCode', snapshot.currency_code,
      'snapshotId', snapshot.snapshot_id,
      'snapshotSequence', snapshot.snapshot_sequence,
      'effectiveAt', snapshot.effective_at
    )
    order by snapshot.currency_code
  )
  into v_snapshots
  from latest_snapshots as snapshot;

  v_input_manifest := jsonb_build_object(
    'kind', 'bootstrap',
    'gameSessionId', p_game_session_id,
    'effectiveAt', v_effective_at,
    'policyVersion', v_policy.policy_version,
    'sourceKind', v_source_kind,
    'legacyRateSourceEffectiveAt', v_legacy_source_effective_at,
    'currencyValues', v_values,
    'macroSnapshots', v_snapshots
  );
  v_input_hash := private.fx_digest_jsonb_v1(v_input_manifest);

  insert into public.fx_fixings (
    game_session_id,
    fixing_kind,
    fixing_local_date,
    game_timezone,
    effective_at,
    calculated_at,
    previous_fixing_id,
    policy_version_id,
    calculation_version,
    input_hash,
    source_kind,
    legacy_rate_source_effective_at
  )
  values (
    p_game_session_id,
    'bootstrap',
    (v_effective_at at time zone v_timezone)::date,
    v_timezone,
    v_effective_at,
    v_calculated_at,
    null,
    v_policy.id,
    'fx-bootstrap-temporal-provenance-v2',
    v_input_hash,
    v_source_kind,
    v_legacy_source_effective_at
  )
  returning id, public_key into v_fixing_id, v_fixing_public_key;

  insert into public.fx_fixing_currency_values (
    fixing_id,
    game_session_id,
    currency_code,
    country_code,
    previous_units_per_eco,
    units_per_eco,
    gdp_basis_points,
    inflation_basis_points,
    real_interest_basis_points,
    trade_basis_points,
    confidence_stability_basis_points,
    fundamental_basis_points,
    story_basis_points,
    final_basis_points,
    applied_story_shock_ids,
    explanation
  )
  select
    v_fixing_id,
    p_game_session_id,
    value_item.item ->> 'currencyCode',
    nullif(value_item.item ->> 'countryCode', ''),
    (value_item.item ->> 'unitsPerEco')::numeric(38, 18),
    (value_item.item ->> 'unitsPerEco')::numeric(38, 18),
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    '[]'::jsonb,
    case
      when v_source_kind = 'legacy_matrix'
        then 'Bootstrap from the latest coherent legacy VAL vector; no new movement applied.'
      else 'Bootstrap from the canonical FX policy baseline; no movement applied.'
    end
  from jsonb_array_elements(v_values) as value_item(item);

  insert into public.fx_fixing_macro_snapshots (
    fixing_id,
    game_session_id,
    country_profile_id,
    currency_code,
    snapshot_id,
    snapshot_sequence,
    snapshot_effective_at
  )
  select
    v_fixing_id,
    p_game_session_id,
    (snapshot_item.item ->> 'countryProfileId')::uuid,
    snapshot_item.item ->> 'currencyCode',
    (snapshot_item.item ->> 'snapshotId')::uuid,
    (snapshot_item.item ->> 'snapshotSequence')::integer,
    (snapshot_item.item ->> 'effectiveAt')::timestamptz
  from jsonb_array_elements(v_snapshots) as snapshot_item(item);

  update private.fx_runtime_state
  set cutover_status = 'ready',
      blocked_reason = null,
      current_fixing_id = v_fixing_id,
      policy_version_id = v_policy.id,
      next_due_at = case when v_lifecycle_state = 'paused' then null
        else private.fx_next_boundary_v1(v_calculated_at, v_timezone) end,
      retry_after_at = null,
      last_success_at = v_calculated_at,
      last_error_code = null,
      last_error_at = null,
      updated_at = clock_timestamp()
  where game_session_id = p_game_session_id;

  return jsonb_build_object(
    'outcome', 'initialized',
    'cutoverStatus', 'ready',
    'fixingPublicId', v_fixing_public_key,
    'sourceKind', v_source_kind,
    'effectiveAt', v_effective_at,
    'legacyRateSourceEffectiveAt', v_legacy_source_effective_at,
    'currencyValuesInserted', 11,
    'macroSnapshotsLinked', 10
  );
end;
$function$;

revoke all on function public.initialize_fx_authority_for_game_v1(
  uuid, timestamptz, boolean
) from public, anon, authenticated, service_role;

commit;
