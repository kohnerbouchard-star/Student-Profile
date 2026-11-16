#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let parsedDatabaseUrl;
try {
  parsedDatabaseUrl = new URL(databaseUrl);
} catch {
  throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
}

const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
if (
  !["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol) ||
  !loopbackHosts.has(parsedDatabaseUrl.hostname) ||
  parsedDatabaseUrl.port !== "54322" ||
  parsedDatabaseUrl.search !== "" ||
  parsedDatabaseUrl.hash !== "" ||
  parsedDatabaseUrl.pathname !== "/postgres"
) {
  throw new Error(
    "Canonical FX database acceptance is restricted to the loopback Supabase PostgreSQL port.",
  );
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function redact(value) {
  let redacted = String(value).replaceAll(
    databaseUrl,
    "postgresql://***@127.0.0.1:<local>/postgres",
  );
  if (parsedDatabaseUrl.password) {
    redacted = redacted.replaceAll(parsedDatabaseUrl.password, "***");
  }
  return redacted;
}

const fixture = Object.freeze({
  staffId: randomUUID(),
  staffAuthId: randomUUID(),
  purchaseCodeId: randomUUID(),
  gameOneId: randomUUID(),
  gameTwoId: randomUUID(),
  gameIncompleteId: randomUUID(),
  gamePausedPreId: randomUUID(),
  gamePausedPostId: randomUUID(),
  gameDelayedActiveId: randomUUID(),
  gameNewPostEightId: randomUUID(),
  gameBlockedId: randomUUID(),
});

const legacyVectorSql = String.raw`
  values
    ('NRC'::text,   0.500000000000000000::numeric),
    ('YRC'::text,   2.000000000000000000::numeric),
    ('THD'::text,   4.000000000000000000::numeric),
    ('SLV'::text,   8.000000000000000000::numeric),
    ('ELD'::text,  16.000000000000000000::numeric),
    ('VAL'::text,   1.000000000000000000::numeric),
    ('LUM'::text,  32.000000000000000000::numeric),
    ('SYN'::text,  64.000000000000000000::numeric),
    ('XAL'::text, 128.000000000000000000::numeric),
    ('DRV'::text, 256.000000000000000000::numeric)
`;

const sql = String.raw`
\set ON_ERROR_STOP on
\pset pager off
\pset format unaligned
\pset tuples_only on

begin;
set local statement_timeout = '90s';
set local lock_timeout = '5s';
set local idle_in_transaction_session_timeout = '120s';

do $server_guard$
declare
  v_server inet := inet_server_addr();
begin
  if v_server is not null
     and not (
       v_server <<= inet '127.0.0.0/8'
       or v_server <<= inet '10.0.0.0/8'
       or v_server <<= inet '172.16.0.0/12'
       or v_server <<= inet '192.168.0.0/16'
       or v_server <<= inet '::1/128'
       or v_server <<= inet 'fc00::/7'
     )
  then
    raise exception 'FX_ACCEPTANCE_NON_LOOPBACK_SERVER:%', v_server;
  end if;
end;
$server_guard$;

create function pg_temp.fx_assert_v1(p_condition boolean, p_message text)
returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $function$
begin
  if p_condition is distinct from true then
    raise exception 'FX_ACCEPTANCE_FAILED:%', p_message using errcode = 'P0001';
  end if;
end;
$function$;

create temporary table fx_acceptance_clock (
  anchor_date date primary key,
  bootstrap_at timestamptz not null,
  new_game_effective_at timestamptz not null,
  pre_eight_timezone text not null,
  post_eight_timezone text not null
) on commit drop;

insert into fx_acceptance_clock(
  anchor_date,
  bootstrap_at,
  new_game_effective_at,
  pre_eight_timezone,
  post_eight_timezone
)
select
  (clock_timestamp() at time zone 'UTC')::date,
  private.fx_boundary_for_local_date_v1(
    (clock_timestamp() at time zone 'UTC')::date - 3,
    'UTC'
  ),
  clock_timestamp(),
  (
    select zone.name
    from pg_catalog.pg_timezone_names as zone
    where extract(hour from clock_timestamp() at time zone zone.name) = 6
      and zone.name !~ '^posix/'
    order by zone.name
    limit 1
  ),
  (
    select zone.name
    from pg_catalog.pg_timezone_names as zone
    where extract(hour from clock_timestamp() at time zone zone.name) = 10
      and zone.name !~ '^posix/'
    order by zone.name
    limit 1
  );

insert into public.staff_users (
  id,
  supabase_auth_user_id,
  email,
  display_name,
  status,
  role
)
values (
  ${sqlLiteral(fixture.staffId)}::uuid,
  ${sqlLiteral(fixture.staffAuthId)}::uuid,
  ${sqlLiteral(`canonical-fx-${fixture.staffId}@example.invalid`)},
  'Canonical FX database fixture',
  'active',
  'game_admin'
);

insert into public.purchase_codes (
  id,
  code_hash,
  status,
  max_redemptions,
  redeemed_count,
  expires_at
)
values (
  ${sqlLiteral(fixture.purchaseCodeId)}::uuid,
  encode(
    extensions.digest(
      convert_to(${sqlLiteral(`canonical-fx-${fixture.purchaseCodeId}`)}, 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  'active',
  10,
  3,
  null
);

insert into public.game_sessions (
  id,
  owner_staff_user_id,
  name,
  lifecycle_state,
  provisioning_status,
  created_at,
  started_at
)
values
  (
    ${sqlLiteral(fixture.gameOneId)}::uuid,
    ${sqlLiteral(fixture.staffId)}::uuid,
    'Canonical FX legacy game',
    'active',
    'pending',
    (select bootstrap_at from fx_acceptance_clock),
    (select bootstrap_at from fx_acceptance_clock)
  ),
  (
    ${sqlLiteral(fixture.gameTwoId)}::uuid,
    ${sqlLiteral(fixture.staffId)}::uuid,
    'Canonical FX baseline game',
    'active',
    'pending',
    (select bootstrap_at from fx_acceptance_clock),
    (select bootstrap_at from fx_acceptance_clock)
  ),
  (
    ${sqlLiteral(fixture.gameIncompleteId)}::uuid,
    ${sqlLiteral(fixture.staffId)}::uuid,
    'Canonical FX incomplete input game',
    'active',
    'pending',
    (select bootstrap_at from fx_acceptance_clock),
    (select bootstrap_at from fx_acceptance_clock)
  ),
  (
    ${sqlLiteral(fixture.gamePausedPreId)}::uuid,
    ${sqlLiteral(fixture.staffId)}::uuid,
    'Canonical FX pre-08 resume game',
    'active',
    'pending',
    (select bootstrap_at from fx_acceptance_clock),
    (select bootstrap_at from fx_acceptance_clock)
  ),
  (
    ${sqlLiteral(fixture.gamePausedPostId)}::uuid,
    ${sqlLiteral(fixture.staffId)}::uuid,
    'Canonical FX post-08 resume game',
    'active',
    'pending',
    (select bootstrap_at from fx_acceptance_clock),
    (select bootstrap_at from fx_acceptance_clock)
  ),
  (
    ${sqlLiteral(fixture.gameDelayedActiveId)}::uuid,
    ${sqlLiteral(fixture.staffId)}::uuid,
    'Canonical FX delayed active game',
    'active',
    'pending',
    (select bootstrap_at from fx_acceptance_clock),
    (select bootstrap_at from fx_acceptance_clock)
  ),
  (
    ${sqlLiteral(fixture.gameNewPostEightId)}::uuid,
    ${sqlLiteral(fixture.staffId)}::uuid,
    'Canonical FX new post-08 game',
    'active',
    'pending',
    (select new_game_effective_at from fx_acceptance_clock),
    (select new_game_effective_at from fx_acceptance_clock)
  ),
  (
    ${sqlLiteral(fixture.gameBlockedId)}::uuid,
    ${sqlLiteral(fixture.staffId)}::uuid,
    'Canonical FX blocked legacy cutover game',
    'active',
    'pending',
    (select bootstrap_at from fx_acceptance_clock),
    (select bootstrap_at from fx_acceptance_clock)
  );

insert into public.entitlements (
  purchase_code_id,
  staff_user_id,
  game_session_id,
  status,
  license_expires_at
)
values
  (
    ${sqlLiteral(fixture.purchaseCodeId)}::uuid,
    ${sqlLiteral(fixture.staffId)}::uuid,
    ${sqlLiteral(fixture.gameOneId)}::uuid,
    'active',
    null
  ),
  (
    ${sqlLiteral(fixture.purchaseCodeId)}::uuid,
    ${sqlLiteral(fixture.staffId)}::uuid,
    ${sqlLiteral(fixture.gameTwoId)}::uuid,
    'active',
    null
  ),
  (
    ${sqlLiteral(fixture.purchaseCodeId)}::uuid,
    ${sqlLiteral(fixture.staffId)}::uuid,
    ${sqlLiteral(fixture.gameIncompleteId)}::uuid,
    'active',
    null
  ),
  (
    ${sqlLiteral(fixture.purchaseCodeId)}::uuid,
    ${sqlLiteral(fixture.staffId)}::uuid,
    ${sqlLiteral(fixture.gamePausedPreId)}::uuid,
    'active',
    null
  ),
  (
    ${sqlLiteral(fixture.purchaseCodeId)}::uuid,
    ${sqlLiteral(fixture.staffId)}::uuid,
    ${sqlLiteral(fixture.gamePausedPostId)}::uuid,
    'active',
    null
  ),
  (
    ${sqlLiteral(fixture.purchaseCodeId)}::uuid,
    ${sqlLiteral(fixture.staffId)}::uuid,
    ${sqlLiteral(fixture.gameDelayedActiveId)}::uuid,
    'active',
    null
  ),
  (
    ${sqlLiteral(fixture.purchaseCodeId)}::uuid,
    ${sqlLiteral(fixture.staffId)}::uuid,
    ${sqlLiteral(fixture.gameNewPostEightId)}::uuid,
    'active',
    null
  ),
  (
    ${sqlLiteral(fixture.purchaseCodeId)}::uuid,
    ${sqlLiteral(fixture.staffId)}::uuid,
    ${sqlLiteral(fixture.gameBlockedId)}::uuid,
    'active',
    null
  );

insert into public.game_settings (game_session_id, stock_market_window)
values
  (
    ${sqlLiteral(fixture.gameOneId)}::uuid,
    jsonb_build_object('timezone', 'America/New_York')
  ),
  (
    ${sqlLiteral(fixture.gameTwoId)}::uuid,
    jsonb_build_object('timezone', 'UTC')
  ),
  (
    ${sqlLiteral(fixture.gameIncompleteId)}::uuid,
    jsonb_build_object('timezone', 'UTC')
  ),
  (
    ${sqlLiteral(fixture.gamePausedPreId)}::uuid,
    jsonb_build_object(
      'timezone',
      (select pre_eight_timezone from fx_acceptance_clock)
    )
  ),
  (
    ${sqlLiteral(fixture.gamePausedPostId)}::uuid,
    jsonb_build_object(
      'timezone',
      (select post_eight_timezone from fx_acceptance_clock)
    )
  ),
  (
    ${sqlLiteral(fixture.gameDelayedActiveId)}::uuid,
    jsonb_build_object('timezone', 'UTC')
  ),
  (
    ${sqlLiteral(fixture.gameNewPostEightId)}::uuid,
    jsonb_build_object(
      'timezone',
      (select post_eight_timezone from fx_acceptance_clock)
    )
  ),
  (
    ${sqlLiteral(fixture.gameBlockedId)}::uuid,
    jsonb_build_object('timezone', 'UTC')
  );

select pg_temp.fx_assert_v1(
  (select count(*) = 10 from public.country_profiles where status = 'active'),
  'fixture requires exactly ten active country profiles'
);

select pg_temp.fx_assert_v1(
  exists (
    select 1
    from public.currencies
    where code = 'ECO'
      and country_code is null
      and currency_kind = 'global_settlement'
      and decimal_places = 2
      and status = 'active'
  ),
  'ECO is the countryless global settlement numeraire'
);

select pg_temp.fx_assert_v1(
  not exists (
    select 1
    from public.currencies
    where currency_kind = 'national'
      and country_code is null
  ),
  'national currencies retain country identity'
);

select pg_temp.fx_assert_v1(
  (
    select count(*) = 1
      and bool_and(normal_movement_cap_basis_points = 200)
      and bool_and(crisis_movement_cap_basis_points = 1500)
      and bool_and(
        (parameters ->> 'exchangeRateIndexWeightBasisPoints')::integer = 0
      )
      and bool_and(
        (parameters ->> 'bilateralTradeExposureWeightBasisPoints')::integer = 0
      )
    from public.fx_policy_versions
    where status = 'published'
  ),
  'one active policy has the approved caps and zero circular-signal weights'
);

-- Two rollback-only policy rows prove that daily input selects the latest
-- policy eligible at the claimed fixing boundary, rather than insertion order
-- or one mutable "current" flag.
insert into public.fx_policy_versions (
  policy_version,
  status,
  fixing_local_time,
  normal_movement_cap_basis_points,
  crisis_movement_cap_basis_points,
  parameters,
  activated_at
)
select
  fixture_policy.policy_version,
  source_policy.status,
  source_policy.fixing_local_time,
  source_policy.normal_movement_cap_basis_points,
  source_policy.crisis_movement_cap_basis_points,
  source_policy.parameters,
  fixture_policy.activated_at
from public.fx_policy_versions as source_policy
cross join lateral (
  values
    (
      'fx-policy-v900'::text,
      (select bootstrap_at - interval '2 days' from fx_acceptance_clock)
    ),
    (
      'fx-policy-v901'::text,
      (select bootstrap_at + interval '1 day' from fx_acceptance_clock)
    )
) as fixture_policy(policy_version, activated_at)
where source_policy.policy_version = 'fx-policy-v1';

select pg_temp.fx_assert_v1(
  (
    select bool_and(table_state.relrowsecurity and table_state.relforcerowsecurity)
    from pg_catalog.pg_class as table_state
    join pg_catalog.pg_namespace as schema_state
      on schema_state.oid = table_state.relnamespace
    where schema_state.nspname in ('public', 'private')
      and table_state.relname in (
        'fx_policy_versions',
        'fx_fixings',
        'fx_fixing_currency_values',
        'fx_fixing_macro_snapshots',
        'fx_story_shock_authorizations',
        'fx_fixing_story_shocks',
        'fx_runtime_state'
      )
  ),
  'every canonical FX table has enabled and forced RLS'
);

select pg_temp.fx_assert_v1(
  not has_table_privilege('anon', 'public.fx_fixings', 'SELECT')
    and not has_table_privilege('authenticated', 'public.fx_fixings', 'SELECT')
    and has_table_privilege('service_role', 'public.fx_fixings', 'SELECT')
    and not has_table_privilege('service_role', 'public.fx_fixings', 'INSERT')
    and not has_table_privilege('service_role', 'private.fx_runtime_state', 'SELECT')
    and not has_table_privilege(
      'anon',
      'public.currency_exchange_rates',
      'DELETE'
    )
    and not has_table_privilege(
      'authenticated',
      'public.currency_exchange_rates',
      'DELETE'
    )
    and not has_table_privilege(
      'service_role',
      'public.currency_exchange_rates',
      'DELETE'
    ),
  'FX evidence, legacy deletion, and private runtime grants are least privilege'
);

select pg_temp.fx_assert_v1(
  public.game_timezone_for_game_v1(${sqlLiteral(fixture.gameOneId)}::uuid) =
    'America/New_York',
  'generic game timezone accessor'
);

select pg_temp.fx_assert_v1(
  public.stock_market_timezone_for_game(${sqlLiteral(fixture.gameOneId)}::uuid) =
    public.game_timezone_for_game_v1(${sqlLiteral(fixture.gameOneId)}::uuid),
  'Stock timezone delegates to generic game timezone accessor'
);

select pg_temp.fx_assert_v1(
  private.fx_boundary_for_local_date_v1(
    date '2026-10-31',
    'America/New_York'
  ) = timestamptz '2026-10-31 12:00:00+00',
  'Saturday 08:00 fixing boundary'
);

select pg_temp.fx_assert_v1(
  private.fx_boundary_for_local_date_v1(
    date '2026-11-01',
    'America/New_York'
  ) = timestamptz '2026-11-01 13:00:00+00',
  'Sunday DST fallback 08:00 fixing boundary'
);

select pg_temp.fx_assert_v1(
  private.fx_next_boundary_v1(
    timestamptz '2026-11-01 12:59:59+00',
    'America/New_York'
  ) = timestamptz '2026-11-01 13:00:00+00',
  '07:59:59 selects same-day 08:00 boundary'
);

select pg_temp.fx_assert_v1(
  private.fx_next_boundary_v1(
    timestamptz '2026-11-01 13:00:00+00',
    'America/New_York'
  ) = timestamptz '2026-11-02 13:00:00+00',
  '08:00 selects the next local-date boundary'
);

insert into public.country_economic_snapshots (
  game_session_id,
  country_profile_id,
  snapshot_sequence,
  effective_at,
  snapshot_label,
  difficulty_policy_profile_id,
  difficulty_preset,
  metadata,
  created_at
)
select
  game_row.game_session_id,
  country_row.id,
  0,
  game_row.effective_at,
  'Canonical FX database fixture',
  difficulty_row.id,
  difficulty_row.preset_key,
  jsonb_build_object('source', 'canonical-fx-database-acceptance'),
  game_row.effective_at - interval '1 second'
from (
  values
    (
      ${sqlLiteral(fixture.gameOneId)}::uuid,
      (select bootstrap_at from fx_acceptance_clock)
    ),
    (
      ${sqlLiteral(fixture.gameTwoId)}::uuid,
      (select bootstrap_at from fx_acceptance_clock)
    ),
    (
      ${sqlLiteral(fixture.gamePausedPreId)}::uuid,
      (select bootstrap_at from fx_acceptance_clock)
    ),
    (
      ${sqlLiteral(fixture.gamePausedPostId)}::uuid,
      (select bootstrap_at from fx_acceptance_clock)
    ),
    (
      ${sqlLiteral(fixture.gameDelayedActiveId)}::uuid,
      (select bootstrap_at from fx_acceptance_clock)
    ),
    (
      ${sqlLiteral(fixture.gameNewPostEightId)}::uuid,
      (select new_game_effective_at from fx_acceptance_clock)
    ),
    (
      ${sqlLiteral(fixture.gameBlockedId)}::uuid,
      (select bootstrap_at from fx_acceptance_clock)
    )
) as game_row(game_session_id, effective_at)
cross join public.country_profiles as country_row
join public.difficulty_policy_profiles as difficulty_row
  on difficulty_row.preset_key = 'standard'
where country_row.status = 'active';

-- This cohort is valid at bootstrap time, but its deliberately future audit
-- timestamp makes it unavailable to the later daily-input boundary. The
-- entire fixture is transaction-local and rolls back.
insert into public.country_economic_snapshots (
  game_session_id,
  country_profile_id,
  snapshot_sequence,
  effective_at,
  snapshot_label,
  difficulty_policy_profile_id,
  difficulty_preset,
  metadata,
  created_at
)
select
  ${sqlLiteral(fixture.gameIncompleteId)}::uuid,
  country_row.id,
  0,
  (select bootstrap_at from fx_acceptance_clock),
  'Canonical FX unavailable-input fixture',
  difficulty_row.id,
  difficulty_row.preset_key,
  jsonb_build_object('source', 'canonical-fx-database-unavailable-input'),
  (
    (select anchor_date + 30 from fx_acceptance_clock)::timestamp
      at time zone 'UTC'
  )
from public.country_profiles as country_row
join public.difficulty_policy_profiles as difficulty_row
  on difficulty_row.preset_key = 'standard'
where country_row.status = 'active';

-- A clean post-migration database cannot naturally contain pre-cutover
-- legacy rows because the table is frozen.  The local transaction owner
-- disables only the freeze trigger long enough to reconstruct historical
-- evidence, then immediately restores it before exercising runtime paths.
alter table public.currency_exchange_rates
  disable trigger currency_exchange_rates_immutable;

with currency_vector(currency_code, units_per_eco) as (
  ${legacyVectorSql}
), complete_pairs as (
  select
    source.currency_code as from_currency_code,
    target.currency_code as to_currency_code,
    round(target.units_per_eco / source.units_per_eco, 8) as rate
  from currency_vector as source
  cross join currency_vector as target
  where source.currency_code <> target.currency_code
)
insert into public.currency_exchange_rates (
  game_session_id,
  from_currency_code,
  to_currency_code,
  rate,
  source,
  effective_at,
  expires_at
)
select
  ${sqlLiteral(fixture.gameOneId)}::uuid,
  pair_row.from_currency_code,
  pair_row.to_currency_code,
  pair_row.rate,
  'canonical-fx-database-legacy-fixture',
  (select bootstrap_at from fx_acceptance_clock),
  null
from complete_pairs as pair_row;

alter table public.currency_exchange_rates
  enable trigger currency_exchange_rates_immutable;

select pg_temp.fx_assert_v1(
  (
    select count(*) = 90
    from public.currency_exchange_rates
    where game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid
  ),
  'coherent legacy fixture contains all ninety directed pairs'
);

do $legacy_table_is_frozen$
declare
  v_rejections integer := 0;
begin
  begin
    insert into public.currency_exchange_rates (
      game_session_id,
      from_currency_code,
      to_currency_code,
      rate,
      source,
      effective_at,
      expires_at
    ) values (
      ${sqlLiteral(fixture.gameTwoId)}::uuid,
      'NRC',
      'YRC',
      4,
      'forbidden-runtime-writer',
      clock_timestamp(),
      null
    );
  exception
    when sqlstate '42501' then
      if sqlerrm = 'FX_EVIDENCE_IMMUTABLE' then
        v_rejections := v_rejections + 1;
      end if;
  end;

  begin
    update public.currency_exchange_rates
    set rate = rate + 1
    where game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid;
  exception
    when sqlstate '42501' then
      if sqlerrm = 'FX_EVIDENCE_IMMUTABLE' then
        v_rejections := v_rejections + 1;
      end if;
  end;

  perform pg_temp.fx_assert_v1(
    v_rejections = 2,
    'legacy pair evidence rejects direct inserts and updates after setup'
  );
end;
$legacy_table_is_frozen$;

create temporary table fx_blocked_cutover_result on commit drop as
select public.initialize_fx_authority_for_game_v1(
  ${sqlLiteral(fixture.gameBlockedId)}::uuid,
  (select bootstrap_at from fx_acceptance_clock),
  false
) as result;

select pg_temp.fx_assert_v1(
  (
    select result ->> 'outcome' = 'blocked'
      and result ->> 'cutoverStatus' = 'blocked'
      and result ->> 'reason' = 'FX_LEGACY_MATRIX_MISSING'
    from fx_blocked_cutover_result
  ),
  'existing game without legacy evidence is cutover-blocked'
);

do $blocked_ready_transition$
declare
  v_rejected boolean := false;
begin
  begin
    update public.game_sessions
    set provisioning_status = 'ready',
        provisioning_pack_id = 'econovaria.beta-seed-pack.v1',
        provisioning_pack_version = '1.0.0-beta',
        provisioning_pack_sha256 = repeat('b', 64),
        provisioning_source_game_session_id = id,
        provisioned_at = clock_timestamp(),
        provisioning_failure_code = null
    where id = ${sqlLiteral(fixture.gameBlockedId)}::uuid;
  exception
    when others then
      v_rejected := sqlerrm like 'FX_PROVISIONING_BOOTSTRAP_FAILED:%';
  end;

  perform pg_temp.fx_assert_v1(
    v_rejected,
    'ready transition cannot escape an existing-game cutover block'
  );
end;
$blocked_ready_transition$;

select pg_temp.fx_assert_v1(
  exists (
    select 1
    from private.fx_runtime_state
    where game_session_id = ${sqlLiteral(fixture.gameBlockedId)}::uuid
      and cutover_status = 'blocked'
      and blocked_reason = 'FX_LEGACY_MATRIX_MISSING'
      and current_fixing_id is null
      and next_due_at is null
  )
    and not exists (
      select 1
      from public.fx_fixings
      where game_session_id = ${sqlLiteral(fixture.gameBlockedId)}::uuid
    ),
  'blocked cutover remains non-ready and creates no baseline fixing'
);

create temporary table fx_blocked_runtime_status on commit drop as
select public.get_fx_runtime_status_v1(
  ${sqlLiteral(fixture.gameBlockedId)}::uuid,
  clock_timestamp()
) as status;

select pg_temp.fx_assert_v1(
  (
    select status ->> 'cutoverStatus' = 'blocked'
      and status ->> 'blockedReason' = 'FX_LEGACY_MATRIX_MISSING'
      and status -> 'currentFixingPublicId' = 'null'::jsonb
      and status -> 'nextDueAt' = 'null'::jsonb
      and status -> 'retryAfterAt' = 'null'::jsonb
      and status -> 'overdue' = 'false'::jsonb
      and status::text not like '%' || ${sqlLiteral(fixture.gameBlockedId)} || '%'
      and not (status ? 'gameSessionId')
      and not (status ? 'currentFixingId')
      and not (status ? 'leaseToken')
    from fx_blocked_runtime_status
  ),
  'runtime status exposes a browser-safe blocked state without internal UUIDs'
);

select pg_temp.fx_assert_v1(
  has_function_privilege(
    'service_role',
    'public.get_fx_runtime_status_v1(uuid,timestamptz)',
    'EXECUTE'
  )
    and not has_function_privilege(
      'authenticated',
      'public.get_fx_runtime_status_v1(uuid,timestamptz)',
      'EXECUTE'
    ),
  'runtime status is service-only'
);

create temporary table fx_bootstrap_results (
  game_session_id uuid primary key,
  result jsonb not null
) on commit drop;

insert into fx_bootstrap_results(game_session_id, result)
select
  bootstrap_input.game_session_id,
  public.initialize_fx_authority_for_game_v1(
    bootstrap_input.game_session_id,
    bootstrap_input.effective_at,
    bootstrap_input.allow_policy_baseline
  )
from (
  values
    (
      ${sqlLiteral(fixture.gameOneId)}::uuid,
      (select bootstrap_at from fx_acceptance_clock),
      false
    ),
    (
      ${sqlLiteral(fixture.gameTwoId)}::uuid,
      (select bootstrap_at from fx_acceptance_clock),
      true
    ),
    (
      ${sqlLiteral(fixture.gameIncompleteId)}::uuid,
      (select bootstrap_at from fx_acceptance_clock),
      true
    ),
    (
      ${sqlLiteral(fixture.gamePausedPreId)}::uuid,
      (select bootstrap_at from fx_acceptance_clock),
      true
    ),
    (
      ${sqlLiteral(fixture.gamePausedPostId)}::uuid,
      (select bootstrap_at from fx_acceptance_clock),
      true
    ),
    (
      ${sqlLiteral(fixture.gameDelayedActiveId)}::uuid,
      (select bootstrap_at from fx_acceptance_clock),
      true
    ),
    (
      ${sqlLiteral(fixture.gameNewPostEightId)}::uuid,
      (select new_game_effective_at from fx_acceptance_clock),
      true
    )
) as bootstrap_input(
  game_session_id,
  effective_at,
  allow_policy_baseline
);

select pg_temp.fx_assert_v1(
  (
    select count(*) = 7
      and bool_and(result ->> 'outcome' = 'initialized')
      and bool_and(result ->> 'cutoverStatus' = 'ready')
      and bool_and((result ->> 'currencyValuesInserted')::integer = 11)
      and bool_and((result ->> 'macroSnapshotsLinked')::integer = 10)
    from fx_bootstrap_results
  ),
  'all fixture games receive complete immutable bootstrap fixings'
);

select pg_temp.fx_assert_v1(
  (
    select result ->> 'sourceKind' = 'legacy_matrix'
    from fx_bootstrap_results
    where game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid
  ),
  'existing game backfill uses the coherent legacy matrix'
);

select pg_temp.fx_assert_v1(
  (
    select result ->> 'sourceKind' = 'policy_baseline'
    from fx_bootstrap_results
    where game_session_id = ${sqlLiteral(fixture.gameTwoId)}::uuid
  ),
  'new game bootstrap uses the explicit policy baseline'
);

select pg_temp.fx_assert_v1(
  not exists (
    select 1
    from public.fx_fixings as fixing_row
    where fixing_row.game_session_id in (
      ${sqlLiteral(fixture.gameOneId)}::uuid,
      ${sqlLiteral(fixture.gameTwoId)}::uuid,
      ${sqlLiteral(fixture.gameIncompleteId)}::uuid,
      ${sqlLiteral(fixture.gamePausedPreId)}::uuid,
      ${sqlLiteral(fixture.gamePausedPostId)}::uuid,
      ${sqlLiteral(fixture.gameDelayedActiveId)}::uuid,
      ${sqlLiteral(fixture.gameNewPostEightId)}::uuid
    )
      and (
        (
          select count(*)
          from public.fx_fixing_currency_values as value_row
          where value_row.fixing_id = fixing_row.id
        ) <> 11
        or not exists (
          select 1
          from public.fx_fixing_currency_values as eco_value
          where eco_value.fixing_id = fixing_row.id
            and eco_value.currency_code = 'ECO'
            and eco_value.country_code is null
            and eco_value.units_per_eco = 1
        )
        or (
          select count(*)
          from public.fx_fixing_macro_snapshots as snapshot_link
          where snapshot_link.fixing_id = fixing_row.id
        ) <> 10
      )
  ),
  'every bootstrap contains ECO=1, eleven values, and ten snapshot links'
);

select pg_temp.fx_assert_v1(
  (
    select value_row.units_per_eco = 1
    from public.fx_fixing_currency_values as value_row
    join public.fx_fixings as fixing_row on fixing_row.id = value_row.fixing_id
    where fixing_row.game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid
      and value_row.currency_code = 'VAL'
  ),
  'legacy backfill pins VAL and ECO to one'
);

select pg_temp.fx_assert_v1(
  (
    public.initialize_fx_authority_for_game_v1(
      ${sqlLiteral(fixture.gameOneId)}::uuid,
      (select bootstrap_at from fx_acceptance_clock),
      false
    ) ->> 'outcome'
  ) = 'replayed',
  'bootstrap initialization replays without duplicate history'
);

select pg_temp.fx_assert_v1(
  (
    select count(*) = 1
    from public.fx_fixings
    where game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid
  ),
  'bootstrap replay creates no duplicate fixing'
);

update public.game_sessions
set provisioning_status = 'ready',
    provisioning_pack_id = 'econovaria.beta-seed-pack.v1',
    provisioning_pack_version = '1.0.0-beta',
    provisioning_pack_sha256 = repeat('a', 64),
    provisioning_source_game_session_id = id,
    provisioned_at = clock_timestamp(),
    provisioning_failure_code = null
where id in (
  ${sqlLiteral(fixture.gameOneId)}::uuid,
  ${sqlLiteral(fixture.gameTwoId)}::uuid,
  ${sqlLiteral(fixture.gameIncompleteId)}::uuid,
  ${sqlLiteral(fixture.gamePausedPreId)}::uuid,
  ${sqlLiteral(fixture.gamePausedPostId)}::uuid,
  ${sqlLiteral(fixture.gameDelayedActiveId)}::uuid,
  ${sqlLiteral(fixture.gameNewPostEightId)}::uuid
);

select pg_temp.fx_assert_v1(
  (
    select count(*) = 7
      and bool_and(cutover_status = 'ready')
      and bool_and(current_fixing_id is not null)
    from private.fx_runtime_state
    where game_session_id in (
      ${sqlLiteral(fixture.gameOneId)}::uuid,
      ${sqlLiteral(fixture.gameTwoId)}::uuid,
      ${sqlLiteral(fixture.gameIncompleteId)}::uuid,
      ${sqlLiteral(fixture.gamePausedPreId)}::uuid,
      ${sqlLiteral(fixture.gamePausedPostId)}::uuid,
      ${sqlLiteral(fixture.gameDelayedActiveId)}::uuid,
      ${sqlLiteral(fixture.gameNewPostEightId)}::uuid
    )
  ),
  'readiness requires a verified canonical FX runtime cursor'
);

create temporary table fx_timezone_before on commit drop as
select stock_market_window ->> 'timezone' as game_timezone
from public.game_settings
where game_session_id = ${sqlLiteral(fixture.gameTwoId)}::uuid;

do $timezone_is_immutable_after_bootstrap$
declare
  v_rejected boolean := false;
begin
  begin
    update public.game_settings
    set stock_market_window = jsonb_set(
      stock_market_window,
      '{timezone}',
      to_jsonb(
        case stock_market_window ->> 'timezone'
          when 'UTC' then 'America/New_York'
          else 'UTC'
        end
      ),
      true
    )
    where game_session_id = ${sqlLiteral(fixture.gameTwoId)}::uuid;
  exception
    when others then
      v_rejected := sqlerrm = 'FX_TIMEZONE_IMMUTABLE_AFTER_BOOTSTRAP';
  end;

  perform pg_temp.fx_assert_v1(
    v_rejected,
    'shared game timezone is immutable after FX bootstrap'
  );
end;
$timezone_is_immutable_after_bootstrap$;

select pg_temp.fx_assert_v1(
  (
    select settings.stock_market_window ->> 'timezone' = before_row.game_timezone
    from public.game_settings as settings
    cross join fx_timezone_before as before_row
    where settings.game_session_id = ${sqlLiteral(fixture.gameTwoId)}::uuid
  ),
  'rejected timezone mutation preserves the canonical schedule source'
);

select pg_temp.fx_assert_v1(
  (
    select rate = 4.000000000000000000
    from public.resolve_fx_rate_v1(
      ${sqlLiteral(fixture.gameOneId)}::uuid,
      'NRC',
      'YRC',
      clock_timestamp()
    )
  ),
  'legacy vector resolves the derived NRC-to-YRC cross-rate'
);

select pg_temp.fx_assert_v1(
  abs(
    (
      select rate
      from public.resolve_fx_rate_v1(
        ${sqlLiteral(fixture.gameOneId)}::uuid,
        'NRC',
        'YRC',
        clock_timestamp()
      )
    ) * (
      select rate
      from public.resolve_fx_rate_v1(
        ${sqlLiteral(fixture.gameOneId)}::uuid,
        'YRC',
        'NRC',
        clock_timestamp()
      )
    ) - 1
  ) < 0.000000000000000001,
  'canonical inverse rates multiply to one'
);

select pg_temp.fx_assert_v1(
  abs(
    (
      select rate
      from public.resolve_fx_rate_v1(
        ${sqlLiteral(fixture.gameOneId)}::uuid,
        'NRC',
        'YRC',
        clock_timestamp()
      )
    ) * (
      select rate
      from public.resolve_fx_rate_v1(
        ${sqlLiteral(fixture.gameOneId)}::uuid,
        'YRC',
        'THD',
        clock_timestamp()
      )
    ) - (
      select rate
      from public.resolve_fx_rate_v1(
        ${sqlLiteral(fixture.gameOneId)}::uuid,
        'NRC',
        'THD',
        clock_timestamp()
      )
    )
  ) < 0.000000000000000001,
  'canonical cross-rates satisfy triangle consistency'
);

select pg_temp.fx_assert_v1(
  (
    select first_game.rate <> second_game.rate
    from public.resolve_fx_rate_v1(
      ${sqlLiteral(fixture.gameOneId)}::uuid,
      'NRC',
      'YRC',
      clock_timestamp()
    ) as first_game
    cross join public.resolve_fx_rate_v1(
      ${sqlLiteral(fixture.gameTwoId)}::uuid,
      'NRC',
      'YRC',
      clock_timestamp()
    ) as second_game
  ),
  'rate resolution is isolated by game'
);

select pg_temp.fx_assert_v1(
  public.convert_currency_amount(
    ${sqlLiteral(fixture.gameOneId)}::uuid,
    10,
    'NRC',
    'YRC'
  ) = 40.00,
  'deprecated conversion reads the canonical fixing and rounds once'
);

select pg_temp.fx_assert_v1(
  has_function_privilege(
    'service_role',
    'public.claim_due_fx_games_v1(timestamptz,integer,text,integer)',
    'EXECUTE'
  )
    and has_function_privilege(
      'service_role',
      'public.load_fx_fixing_input_v1(uuid,date,uuid)',
      'EXECUTE'
    )
    and has_function_privilege(
      'service_role',
      'public.apply_fx_fixing_v1(uuid,date,timestamptz,uuid,text,timestamptz,jsonb)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'public.claim_due_fx_games_v1(timestamptz,integer,text,integer)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'service_role',
      'public.initialize_currency_exchange_rates_for_game_v1(uuid,timestamptz)',
      'EXECUTE'
    ),
  'scheduler RPC grants are service-only and the legacy writer is retired'
);

do $legacy_writer_retired$
declare
  v_rejected boolean := false;
begin
  begin
    perform public.initialize_currency_exchange_rates_for_game_v1(
      ${sqlLiteral(fixture.gameOneId)}::uuid,
      clock_timestamp()
    );
  exception
    when sqlstate '42501' then
      v_rejected := sqlerrm = 'FX_LEGACY_WRITER_RETIRED';
  end;

  perform pg_temp.fx_assert_v1(v_rejected, 'legacy matrix writer rejects calls');
end;
$legacy_writer_retired$;

update private.fx_runtime_state
set next_due_at = clock_timestamp() + interval '30 days',
    claimed_local_date = null,
    claimed_effective_at = null,
    lease_token = null,
    lease_owner = null,
    lease_expires_at = null,
    claimed_input_hash = null,
    claimed_engine_input = null
where game_session_id in (
  ${sqlLiteral(fixture.gameOneId)}::uuid,
  ${sqlLiteral(fixture.gameTwoId)}::uuid,
  ${sqlLiteral(fixture.gameIncompleteId)}::uuid,
  ${sqlLiteral(fixture.gamePausedPreId)}::uuid,
  ${sqlLiteral(fixture.gamePausedPostId)}::uuid,
  ${sqlLiteral(fixture.gameDelayedActiveId)}::uuid,
  ${sqlLiteral(fixture.gameNewPostEightId)}::uuid
);

create temporary table fx_new_post_eight_bootstrap on commit drop as
select
  fixing_row.effective_at as bootstrap_effective_at,
  fixing_row.fixing_local_date as bootstrap_local_date,
  fixing_row.game_timezone
from private.fx_runtime_state as runtime
join public.fx_fixings as fixing_row
  on fixing_row.id = runtime.current_fixing_id
 and fixing_row.game_session_id = runtime.game_session_id
where runtime.game_session_id = ${sqlLiteral(fixture.gameNewPostEightId)}::uuid;

update public.game_sessions
set lifecycle_state = 'paused',
    status = 'disabled',
    paused_at = clock_timestamp(),
    lifecycle_version = lifecycle_version + 1
where id = ${sqlLiteral(fixture.gameNewPostEightId)}::uuid;

update public.game_sessions
set lifecycle_state = 'active',
    status = 'active',
    resumed_at = clock_timestamp(),
    lifecycle_version = lifecycle_version + 1
where id = ${sqlLiteral(fixture.gameNewPostEightId)}::uuid;

select pg_temp.fx_assert_v1(
  exists (
    select 1
    from private.fx_runtime_state as runtime
    cross join fx_new_post_eight_bootstrap as bootstrap
    where runtime.game_session_id = ${sqlLiteral(fixture.gameNewPostEightId)}::uuid
      and runtime.next_due_at > bootstrap.bootstrap_effective_at
      and (runtime.next_due_at at time zone bootstrap.game_timezone)::time =
        time '08:00'
      and (runtime.next_due_at at time zone bootstrap.game_timezone)::date =
        (clock_timestamp() at time zone bootstrap.game_timezone)::date + 1
  ),
  'post-08 baseline bootstrap resumes at next-day 08:00'
);

create temporary table fx_new_post_eight_claim on commit drop as
select *
from public.claim_due_fx_games_v1(
  clock_timestamp(),
  100,
  'fx-db-new-post-eight',
  120
);

select pg_temp.fx_assert_v1(
  not exists (
    select 1
    from fx_new_post_eight_claim
    where game_session_id = ${sqlLiteral(fixture.gameNewPostEightId)}::uuid
  )
    and not exists (
      select 1
      from public.fx_fixings
      where game_session_id = ${sqlLiteral(fixture.gameNewPostEightId)}::uuid
        and fixing_kind = 'daily'
    ),
  'new post-08 game cannot claim a pre-bootstrap or same-boundary daily fixing'
);

create temporary table fx_invalid_chronology_claim on commit drop as
select
  extensions.gen_random_uuid() as lease_token,
  (clock_timestamp() at time zone bootstrap.game_timezone)::date
    as fixing_local_date,
  private.fx_boundary_for_local_date_v1(
    (clock_timestamp() at time zone bootstrap.game_timezone)::date,
    bootstrap.game_timezone
  ) as fixing_effective_at,
  private.fx_digest_jsonb_v1('{}'::jsonb) as input_hash
from fx_new_post_eight_bootstrap as bootstrap;

update private.fx_runtime_state as runtime
set claimed_local_date = invalid.fixing_local_date,
    claimed_effective_at = invalid.fixing_effective_at,
    lease_token = invalid.lease_token,
    lease_owner = 'fx-db-invalid-chronology',
    lease_expires_at = clock_timestamp() + interval '2 minutes',
    claimed_input_hash = invalid.input_hash,
    claimed_engine_input = '{}'::jsonb
from fx_invalid_chronology_claim as invalid
where runtime.game_session_id = ${sqlLiteral(fixture.gameNewPostEightId)}::uuid;

do $reject_invalid_chronology$
declare
  v_rejected boolean := false;
begin
  begin
    perform *
    from public.apply_fx_fixing_v1(
      ${sqlLiteral(fixture.gameNewPostEightId)}::uuid,
      (select fixing_local_date from fx_invalid_chronology_claim),
      (select fixing_effective_at from fx_invalid_chronology_claim),
      (select lease_token from fx_invalid_chronology_claim),
      (select input_hash from fx_invalid_chronology_claim),
      clock_timestamp(),
      '{}'::jsonb
    );
  exception
    when others then
      v_rejected := sqlerrm = 'FX_APPLY_FIXING_CHRONOLOGY_INVALID';
  end;

  perform pg_temp.fx_assert_v1(
    v_rejected,
    'apply rejects a boundary at or before the current fixing'
  );
end;
$reject_invalid_chronology$;

update private.fx_runtime_state
set next_due_at = clock_timestamp() + interval '30 days',
    claimed_local_date = null,
    claimed_effective_at = null,
    lease_token = null,
    lease_owner = null,
    lease_expires_at = null,
    claimed_input_hash = null,
    claimed_engine_input = null
where game_session_id = ${sqlLiteral(fixture.gameNewPostEightId)}::uuid;

update public.game_sessions
set lifecycle_state = 'paused',
    status = 'disabled',
    paused_at = clock_timestamp(),
    lifecycle_version = lifecycle_version + 1
where id in (
  ${sqlLiteral(fixture.gamePausedPreId)}::uuid,
  ${sqlLiteral(fixture.gamePausedPostId)}::uuid
);

select pg_temp.fx_assert_v1(
  not exists (
    select 1
    from private.fx_runtime_state
    where game_session_id in (
      ${sqlLiteral(fixture.gamePausedPreId)}::uuid,
      ${sqlLiteral(fixture.gamePausedPostId)}::uuid
    )
      and (
        next_due_at is not null
        or lease_token is not null
        or claimed_local_date is not null
      )
  ),
  'pause clears due work and every in-flight fixing lease'
);

create temporary table fx_paused_claims on commit drop as
select *
from public.claim_due_fx_games_v1(
  clock_timestamp(),
  100,
  'fx-db-paused',
  120
);

select pg_temp.fx_assert_v1(
  not exists (
    select 1
    from fx_paused_claims
    where game_session_id in (
      ${sqlLiteral(fixture.gamePausedPreId)}::uuid,
      ${sqlLiteral(fixture.gamePausedPostId)}::uuid
    )
  ),
  'paused games never claim a fixing'
);

update public.game_sessions
set lifecycle_state = 'active',
    status = 'active',
    resumed_at = clock_timestamp(),
    lifecycle_version = lifecycle_version + 1
where id in (
  ${sqlLiteral(fixture.gamePausedPreId)}::uuid,
  ${sqlLiteral(fixture.gamePausedPostId)}::uuid
);

create temporary table fx_resume_boundaries on commit drop as
select
  runtime.game_session_id,
  runtime.next_due_at,
  public.game_timezone_for_game_v1(runtime.game_session_id) as game_timezone
from private.fx_runtime_state as runtime
where runtime.game_session_id in (
  ${sqlLiteral(fixture.gamePausedPreId)}::uuid,
  ${sqlLiteral(fixture.gamePausedPostId)}::uuid
);

select pg_temp.fx_assert_v1(
  (
    select next_due_at > clock_timestamp()
      and (next_due_at at time zone game_timezone)::time = time '08:00'
      and (next_due_at at time zone game_timezone)::date =
        (clock_timestamp() at time zone game_timezone)::date
    from fx_resume_boundaries
    where game_session_id = ${sqlLiteral(fixture.gamePausedPreId)}::uuid
  ),
  'pre-08 resume schedules today and never replays yesterday'
);

select pg_temp.fx_assert_v1(
  (
    select next_due_at <= clock_timestamp()
      and (next_due_at at time zone game_timezone)::time = time '08:00'
      and (next_due_at at time zone game_timezone)::date =
        (clock_timestamp() at time zone game_timezone)::date
    from fx_resume_boundaries
    where game_session_id = ${sqlLiteral(fixture.gamePausedPostId)}::uuid
  ),
  'post-08 resume schedules only the current local date'
);

create temporary table fx_resume_claims on commit drop as
select *
from public.claim_due_fx_games_v1(
  clock_timestamp(),
  100,
  'fx-db-resume',
  120
);

select pg_temp.fx_assert_v1(
  not exists (
    select 1
    from fx_resume_claims
    where game_session_id = ${sqlLiteral(fixture.gamePausedPreId)}::uuid
  )
    and exists (
      select 1
      from fx_resume_claims
      where game_session_id = ${sqlLiteral(fixture.gamePausedPostId)}::uuid
        and fixing_local_date =
          (clock_timestamp() at time zone game_timezone)::date
    ),
  'resume claims post-08 current date while pre-08 remains not due'
);

select pg_temp.fx_assert_v1(
  public.fail_fx_fixing_claim_v1(
    ${sqlLiteral(fixture.gamePausedPostId)}::uuid,
    (
      select fixing_local_date
      from fx_resume_claims
      where game_session_id = ${sqlLiteral(fixture.gamePausedPostId)}::uuid
    ),
    (
      select lease_token
      from fx_resume_claims
      where game_session_id = ${sqlLiteral(fixture.gamePausedPostId)}::uuid
    ),
    'fixture_resume_release',
    clock_timestamp()
  ),
  'post-08 resume claim releases exactly once'
);

update private.fx_runtime_state
set next_due_at = clock_timestamp() + interval '30 days'
where game_session_id = ${sqlLiteral(fixture.gamePausedPostId)}::uuid;

create temporary table fx_pre_eight_claim on commit drop as
select *
from public.claim_due_fx_games_v1(
  (
    select next_due_at
    from fx_resume_boundaries
    where game_session_id = ${sqlLiteral(fixture.gamePausedPreId)}::uuid
  ),
  100,
  'fx-db-pre-eight',
  120
);

select pg_temp.fx_assert_v1(
  exists (
    select 1
    from fx_pre_eight_claim as claim_row
    join fx_resume_boundaries as boundary_row
      on boundary_row.game_session_id = claim_row.game_session_id
    where claim_row.game_session_id = ${sqlLiteral(fixture.gamePausedPreId)}::uuid
      and claim_row.fixing_effective_at = boundary_row.next_due_at
      and claim_row.fixing_local_date =
        (boundary_row.next_due_at at time zone boundary_row.game_timezone)::date
  ),
  'pre-08 resume becomes due at today 08:00 without a missed-day replay'
);

select pg_temp.fx_assert_v1(
  public.fail_fx_fixing_claim_v1(
    ${sqlLiteral(fixture.gamePausedPreId)}::uuid,
    (
      select fixing_local_date
      from fx_pre_eight_claim
      where game_session_id = ${sqlLiteral(fixture.gamePausedPreId)}::uuid
    ),
    (
      select lease_token
      from fx_pre_eight_claim
      where game_session_id = ${sqlLiteral(fixture.gamePausedPreId)}::uuid
    ),
    'fixture_pre_eight_release',
    clock_timestamp()
  ),
  'pre-08 resume claim releases exactly once'
);

update private.fx_runtime_state
set next_due_at = clock_timestamp() + interval '30 days'
where game_session_id = ${sqlLiteral(fixture.gamePausedPreId)}::uuid;

update private.fx_runtime_state
set next_due_at = clock_timestamp() - interval '3 days'
where game_session_id = ${sqlLiteral(fixture.gameDelayedActiveId)}::uuid;

create temporary table fx_delayed_active_claim on commit drop as
select *
from public.claim_due_fx_games_v1(
  clock_timestamp(),
  100,
  'fx-db-delayed-active',
  120
);

select pg_temp.fx_assert_v1(
  exists (
    select 1
    from fx_delayed_active_claim
    where game_session_id = ${sqlLiteral(fixture.gameDelayedActiveId)}::uuid
      and fixing_local_date = case
        when (clock_timestamp() at time zone 'UTC')::time >= time '08:00'
          then (clock_timestamp() at time zone 'UTC')::date
        else (clock_timestamp() at time zone 'UTC')::date - 1
      end
      and fixing_effective_at = private.fx_boundary_for_local_date_v1(
        fixing_local_date,
        'UTC'
      )
  ),
  'continuously active delayed worker claims the latest legitimate boundary'
);

select pg_temp.fx_assert_v1(
  public.fail_fx_fixing_claim_v1(
    ${sqlLiteral(fixture.gameDelayedActiveId)}::uuid,
    (
      select fixing_local_date
      from fx_delayed_active_claim
      where game_session_id = ${sqlLiteral(fixture.gameDelayedActiveId)}::uuid
    ),
    (
      select lease_token
      from fx_delayed_active_claim
      where game_session_id = ${sqlLiteral(fixture.gameDelayedActiveId)}::uuid
    ),
    'fixture_delayed_release',
    clock_timestamp()
  ),
  'delayed-active claim releases exactly once'
);

update private.fx_runtime_state
set next_due_at = private.fx_boundary_for_local_date_v1(
      (select anchor_date + 7 from fx_acceptance_clock),
      'UTC'
    )
where game_session_id = ${sqlLiteral(fixture.gameTwoId)}::uuid;

create temporary table fx_before_boundary_claim on commit drop as
select *
from public.claim_due_fx_games_v1(
  private.fx_boundary_for_local_date_v1(
    (select anchor_date + 7 from fx_acceptance_clock),
    'UTC'
  ) - interval '1 second',
  100,
  'fx-db-before-boundary',
  120
);

select pg_temp.fx_assert_v1(
  not exists (
    select 1
    from fx_before_boundary_claim
    where game_session_id = ${sqlLiteral(fixture.gameTwoId)}::uuid
  ),
  '07:59:59 does not publish or claim the 08:00 fixing'
);

create temporary table fx_boundary_claim on commit drop as
select *
from public.claim_due_fx_games_v1(
  private.fx_boundary_for_local_date_v1(
    (select anchor_date + 7 from fx_acceptance_clock),
    'UTC'
  ),
  100,
  'fx-db-boundary',
  120
);

select pg_temp.fx_assert_v1(
  exists (
    select 1
    from fx_boundary_claim
    where game_session_id = ${sqlLiteral(fixture.gameTwoId)}::uuid
      and fixing_local_date = (select anchor_date + 7 from fx_acceptance_clock)
      and fixing_effective_at = private.fx_boundary_for_local_date_v1(
        (select anchor_date + 7 from fx_acceptance_clock),
        'UTC'
      )
  ),
  '08:00 claims exactly the current local-date fixing'
);

create temporary table fx_lease_collision_claim on commit drop as
select *
from public.claim_due_fx_games_v1(
  private.fx_boundary_for_local_date_v1(
    (select anchor_date + 7 from fx_acceptance_clock),
    'UTC'
  ) + interval '1 second',
  100,
  'fx-db-lease-collision',
  120
);

select pg_temp.fx_assert_v1(
  not exists (
    select 1
    from fx_lease_collision_claim
    where game_session_id = ${sqlLiteral(fixture.gameTwoId)}::uuid
  ),
  'unexpired lease prevents a competing worker claim'
);

create temporary table fx_lease_reclaim on commit drop as
select *
from public.claim_due_fx_games_v1(
  (
    select lease_expires_at
    from fx_boundary_claim
    where game_session_id = ${sqlLiteral(fixture.gameTwoId)}::uuid
  ),
  100,
  'fx-db-lease-recovery',
  120
);

select pg_temp.fx_assert_v1(
  exists (
    select 1
    from fx_lease_reclaim as recovered
    join fx_boundary_claim as original
      on original.game_session_id = recovered.game_session_id
    where recovered.game_session_id = ${sqlLiteral(fixture.gameTwoId)}::uuid
      and recovered.lease_token <> original.lease_token
      and recovered.fixing_local_date = original.fixing_local_date
      and recovered.fixing_effective_at = original.fixing_effective_at
  ),
  'expired lease is recovered once with a distinct token'
);

select pg_temp.fx_assert_v1(
  public.fail_fx_fixing_claim_v1(
    ${sqlLiteral(fixture.gameTwoId)}::uuid,
    (
      select fixing_local_date
      from fx_lease_reclaim
      where game_session_id = ${sqlLiteral(fixture.gameTwoId)}::uuid
    ),
    (
      select lease_token
      from fx_lease_reclaim
      where game_session_id = ${sqlLiteral(fixture.gameTwoId)}::uuid
    ),
    'fixture_lease_release',
    clock_timestamp()
  ),
  'recovered lease releases exactly once'
);

update private.fx_runtime_state
set next_due_at = clock_timestamp() + interval '30 days'
where game_session_id in (
  ${sqlLiteral(fixture.gameTwoId)}::uuid,
  ${sqlLiteral(fixture.gameDelayedActiveId)}::uuid
);

create temporary table fx_incomplete_before on commit drop as
select
  runtime.current_fixing_id,
  count(fixing_row.id) filter (where fixing_row.fixing_kind = 'daily')
    as daily_count
from private.fx_runtime_state as runtime
left join public.fx_fixings as fixing_row
  on fixing_row.game_session_id = runtime.game_session_id
where runtime.game_session_id = ${sqlLiteral(fixture.gameIncompleteId)}::uuid
group by runtime.current_fixing_id;

update private.fx_runtime_state
set next_due_at = clock_timestamp() - interval '1 minute',
    retry_after_at = null
where game_session_id = ${sqlLiteral(fixture.gameIncompleteId)}::uuid;

create temporary table fx_incomplete_claim on commit drop as
select *
from public.claim_due_fx_games_v1(
  clock_timestamp(),
  100,
  'fx-db-incomplete-input',
  120
);

select pg_temp.fx_assert_v1(
  exists (
    select 1
    from fx_incomplete_claim
    where game_session_id = ${sqlLiteral(fixture.gameIncompleteId)}::uuid
  ),
  'incomplete-input fixture receives one due lease before input validation'
);

do $incomplete_macro_input$
declare
  v_rejected boolean := false;
begin
  begin
    perform *
    from public.load_fx_fixing_input_v1(
      ${sqlLiteral(fixture.gameIncompleteId)}::uuid,
      (
        select fixing_local_date
        from fx_incomplete_claim
        where game_session_id = ${sqlLiteral(fixture.gameIncompleteId)}::uuid
      ),
      (
        select lease_token
        from fx_incomplete_claim
        where game_session_id = ${sqlLiteral(fixture.gameIncompleteId)}::uuid
      )
    );
  exception
    when others then
      v_rejected := sqlerrm = 'FX_INPUT_MACRO_COHORT_INCOMPLETE';
  end;

  perform pg_temp.fx_assert_v1(
    v_rejected,
    'incomplete macro cohort rejects daily input construction'
  );
end;
$incomplete_macro_input$;

select pg_temp.fx_assert_v1(
  public.fail_fx_fixing_claim_v1(
    ${sqlLiteral(fixture.gameIncompleteId)}::uuid,
    (
      select fixing_local_date
      from fx_incomplete_claim
      where game_session_id = ${sqlLiteral(fixture.gameIncompleteId)}::uuid
    ),
    (
      select lease_token
      from fx_incomplete_claim
      where game_session_id = ${sqlLiteral(fixture.gameIncompleteId)}::uuid
    ),
    'fx_input_macro_cohort_incomplete',
    clock_timestamp()
  ),
  'incomplete input failure releases its lease'
);

select pg_temp.fx_assert_v1(
  exists (
    select 1
    from private.fx_runtime_state as runtime
    cross join fx_incomplete_before as before_state
    where runtime.game_session_id = ${sqlLiteral(fixture.gameIncompleteId)}::uuid
      and runtime.current_fixing_id = before_state.current_fixing_id
      and runtime.next_due_at < clock_timestamp()
      and runtime.retry_after_at > clock_timestamp()
      and runtime.last_error_code = 'fx_input_macro_cohort_incomplete'
      and runtime.lease_token is null
  )
    and (
      select count(*)
      from public.fx_fixings
      where game_session_id = ${sqlLiteral(fixture.gameIncompleteId)}::uuid
        and fixing_kind = 'daily'
    ) = (
      select daily_count from fx_incomplete_before
    ),
  'failed input remains overdue and never advances the current fixing'
);

create temporary table fx_incomplete_runtime_status on commit drop as
select public.get_fx_runtime_status_v1(
  ${sqlLiteral(fixture.gameIncompleteId)}::uuid,
  clock_timestamp()
) as status;

select pg_temp.fx_assert_v1(
  (
    select status ->> 'cutoverStatus' = 'ready'
      and status ->> 'currentFixingPublicId' ~ '^fxf_[0-9a-f]{32}$'
      and status -> 'overdue' = 'true'::jsonb
      and status -> 'overdueSince' <> 'null'::jsonb
      and status -> 'nextDueAt' <> 'null'::jsonb
      and status -> 'retryAfterAt' <> 'null'::jsonb
      and status ->> 'lastErrorCode' = 'fx_input_macro_cohort_incomplete'
      and status::text not like '%' || ${sqlLiteral(fixture.gameIncompleteId)} || '%'
      and not (status ? 'leaseToken')
    from fx_incomplete_runtime_status
  ),
  'runtime status exposes overdue/retry evidence without internal identity'
);

create temporary table fx_story_request on commit drop as
select
  'fx-db-story-replay-v1'::text as command_key,
  jsonb_build_object('NRC', 75) as adjustments_basis_points,
  clock_timestamp() as eligible_at;

create temporary table fx_story_first on commit drop as
select story_result.*
from fx_story_request as request
cross join lateral public.apply_story_currency_volatility_v1(
  ${sqlLiteral(fixture.gameOneId)}::uuid,
  request.command_key,
  request.adjustments_basis_points,
  request.eligible_at
) as story_result;

create temporary table fx_story_replay on commit drop as
select story_result.*
from fx_story_request as request
cross join lateral public.apply_story_currency_volatility_v1(
  ${sqlLiteral(fixture.gameOneId)}::uuid,
  request.command_key,
  request.adjustments_basis_points,
  request.eligible_at
) as story_result;

select pg_temp.fx_assert_v1(
  (select command_outcome = 'queued' and inserted_rates = 0 from fx_story_first)
    and (
      select command_outcome = 'replayed' and inserted_rates = 0
      from fx_story_replay
    )
    and (
      select count(*) = 1
      from public.fx_story_shock_authorizations
      where game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid
        and command_key = 'fx-db-story-replay-v1'
    )
    and (
      select count(*) = 90
      from public.currency_exchange_rates
      where game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid
    ),
  'Story authorization queues once, replays once, and writes no pair matrix'
);

do $story_hash_conflict$
declare
  v_rejected boolean := false;
begin
  begin
    perform *
    from public.apply_story_currency_volatility_v1(
      ${sqlLiteral(fixture.gameOneId)}::uuid,
      (select command_key from fx_story_request),
      jsonb_build_object('NRC', 76),
      (select eligible_at from fx_story_request)
    );
  exception
    when others then
      v_rejected := sqlerrm =
        'STORY_CURRENCY_VOLATILITY_IDEMPOTENCY_CONFLICT';
  end;

  perform pg_temp.fx_assert_v1(
    v_rejected,
    'Story command key rejects a different authorization hash'
  );
end;
$story_hash_conflict$;

update private.fx_runtime_state
set next_due_at = clock_timestamp() - interval '1 minute',
    retry_after_at = null,
    claimed_local_date = null,
    claimed_effective_at = null,
    lease_token = null,
    lease_owner = null,
    lease_expires_at = null,
    claimed_input_hash = null,
    claimed_engine_input = null
where game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid;

create temporary table fx_story_claim on commit drop as
select *
from public.claim_due_fx_games_v1(
  clock_timestamp(),
  100,
  'fx-db-story-apply',
  120
);

select pg_temp.fx_assert_v1(
  (
    select count(*) = 1
      and bool_and(
        fixing_effective_at > (select bootstrap_at from fx_acceptance_clock)
      )
    from fx_story_claim
    where game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid
  ),
  'Story fixing claim is strictly later than its bootstrap'
);

insert into public.fx_story_shock_authorizations (
  game_session_id,
  command_key,
  adjustments_basis_points,
  eligible_at,
  authorization_hash,
  authorized_at
)
select
  ${sqlLiteral(fixture.gameOneId)}::uuid,
  'fx-db-consumable-shock-v1',
  jsonb_build_object('NRC', 100),
  claim_row.fixing_effective_at - interval '1 second',
  private.fx_digest_jsonb_v1(
    jsonb_build_object(
      'gameSessionId', ${sqlLiteral(fixture.gameOneId)}::uuid,
      'commandKey', 'fx-db-consumable-shock-v1',
      'adjustmentsBasisPoints', jsonb_build_object('NRC', 100),
      'eligibleAt', claim_row.fixing_effective_at - interval '1 second'
    )
  ),
  claim_row.fixing_effective_at - interval '1 second'
from fx_story_claim as claim_row
where claim_row.game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid;

create temporary table fx_loaded_input on commit drop as
select loaded.*
from fx_story_claim as claim_row
cross join lateral public.load_fx_fixing_input_v1(
  claim_row.game_session_id,
  claim_row.fixing_local_date,
  claim_row.lease_token
) as loaded
where claim_row.game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid;

select pg_temp.fx_assert_v1(
  (
    select input_hash ~ '^[0-9a-f]{64}$'
      and input_hash = private.fx_digest_jsonb_v1(engine_input)
      and engine_input ->> 'gameSessionId' = ${sqlLiteral(fixture.gameOneId)}
      and engine_input ->> 'fixingLocalDate' =
        (select fixing_local_date::text from fx_story_claim
         where game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid)
      and engine_input ->> 'policyVersion' = (
        select policy_row.policy_version
        from public.fx_policy_versions as policy_row
        where policy_row.status = 'published'
          and policy_row.activated_at <= (
            select fixing_effective_at
            from fx_story_claim
            where game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid
          )
        order by policy_row.activated_at desc, policy_row.policy_version desc
        limit 1
      )
      and engine_input #>> '{policy,fixingLocalTime}' = '08:00:00'
      and (engine_input #>> '{policy,normalMovementCapBasisPoints}')::integer = 200
      and (engine_input #>> '{policy,crisisMovementCapBasisPoints}')::integer = 1500
      and engine_input #>> '{policy,parameters,numeraireCurrencyCode}' = 'ECO'
      and (engine_input #>>
        '{policy,parameters,exchangeRateIndexWeightBasisPoints}')::integer = 0
      and (engine_input #>>
        '{policy,parameters,bilateralTradeExposureWeightBasisPoints}')::integer = 0
      and jsonb_array_length(engine_input -> 'currencies') = 10
      and jsonb_array_length(engine_input -> 'storyShocks') = 1
      and engine_input #>> '{storyShocks,0,currencyCode}' = 'NRC'
      and (engine_input #>> '{storyShocks,0,basisPoints}')::integer = 100
    from fx_loaded_input
  ),
  'input binds exact digest, boundary policy, full caps, ten snapshots, and one shock'
);

select pg_temp.fx_assert_v1(
  (
    select replay.input_hash = original.input_hash
      and replay.engine_input = original.engine_input
    from fx_loaded_input as original
    cross join lateral public.load_fx_fixing_input_v1(
      ${sqlLiteral(fixture.gameOneId)}::uuid,
      (
        select fixing_local_date
        from fx_story_claim
        where game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid
      ),
      (
        select lease_token
        from fx_story_claim
        where game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid
      )
    ) as replay
  ),
  'same lease replays the byte-equivalent bound engine input'
);

create temporary table fx_apply_request on commit drop as
select
  claim_row.game_session_id,
  claim_row.fixing_local_date,
  claim_row.fixing_effective_at,
  claim_row.lease_token,
  loaded.input_hash,
  clock_timestamp() as calculated_at,
  jsonb_build_object(
    'gameSessionId', claim_row.game_session_id,
    'fixingLocalDate', claim_row.fixing_local_date::text,
    'policyVersion', loaded.engine_input ->> 'policyVersion',
    'canonicalInputJson', loaded.engine_input::text,
    'values', (
      select jsonb_agg(rendered.value order by rendered.sort_order, rendered.code)
      from (
        select
          0 as sort_order,
          'ECO'::text as code,
          jsonb_build_object(
            'currencyCode', 'ECO',
            'countryCode', null,
            'snapshotId', null,
            'snapshotSequence', null,
            'previousUnitsPerEco', '1.000000000000000000',
            'unitsPerEco', '1.000000000000000000',
            'components', jsonb_build_object(
              'gdpBasisPoints', 0,
              'inflationBasisPoints', 0,
              'realInterestBasisPoints', 0,
              'tradeBasisPoints', 0,
              'confidenceStabilityBasisPoints', 0,
              'fundamentalBasisPoints', 0,
              'storyBasisPoints', 0,
              'finalBasisPoints', 0
            ),
            'appliedStoryShockIds', '[]'::jsonb
          ) as value
        union all
        select
          1,
          currency.item ->> 'currencyCode',
          jsonb_build_object(
            'currencyCode', currency.item ->> 'currencyCode',
            'countryCode', currency.item ->> 'countryCode',
            'snapshotId', currency.item ->> 'snapshotId',
            'snapshotSequence',
              (currency.item ->> 'snapshotSequence')::integer,
            'previousUnitsPerEco', currency.item ->> 'previousUnitsPerEco',
            'unitsPerEco', to_char(
              round(
                (currency.item ->> 'previousUnitsPerEco')::numeric
                  * (10000 + story.story_basis_points)::numeric / 10000,
                18
              ),
              'FM99999999999999999990.000000000000000000'
            ),
            'components', jsonb_build_object(
              'gdpBasisPoints', 0,
              'inflationBasisPoints', 0,
              'realInterestBasisPoints', 0,
              'tradeBasisPoints', 0,
              'confidenceStabilityBasisPoints', 0,
              'fundamentalBasisPoints', 0,
              'storyBasisPoints', story.story_basis_points,
              'finalBasisPoints', story.story_basis_points
            ),
            'appliedStoryShockIds', story.story_ids
          )
        from jsonb_array_elements(loaded.engine_input -> 'currencies')
          as currency(item)
        cross join lateral (
          select
            greatest(
              -1500,
              least(
                1500,
                coalesce(
                  sum((shock.item ->> 'basisPoints')::integer),
                  0
                )::integer
              )
            ) as story_basis_points,
            coalesce(
              jsonb_agg(
                to_jsonb(shock.item ->> 'shockId')
                order by shock.item ->> 'shockId'
              ) filter (where shock.item is not null),
              '[]'::jsonb
            ) as story_ids
          from jsonb_array_elements(loaded.engine_input -> 'storyShocks')
            as shock(item)
          where shock.item ->> 'currencyCode' = currency.item ->> 'currencyCode'
        ) as story
      ) as rendered
    )
  ) as fixing_result
from fx_story_claim as claim_row
join fx_loaded_input as loaded on true
where claim_row.game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid;

create temporary table fx_apply_before on commit drop as
select
  runtime.current_fixing_id,
  (select count(*) from public.fx_fixings where game_session_id = runtime.game_session_id)
    as fixing_count,
  runtime.lease_token
from private.fx_runtime_state as runtime
where runtime.game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid;

create temporary table fx_game_two_before on commit drop as
select jsonb_build_object(
  'fixings', (
    select count(*)
    from public.fx_fixings
    where game_session_id = ${sqlLiteral(fixture.gameTwoId)}::uuid
  ),
  'values', (
    select count(*)
    from public.fx_fixing_currency_values
    where game_session_id = ${sqlLiteral(fixture.gameTwoId)}::uuid
  ),
  'snapshotLinks', (
    select count(*)
    from public.fx_fixing_macro_snapshots
    where game_session_id = ${sqlLiteral(fixture.gameTwoId)}::uuid
  ),
  'storyLinks', (
    select count(*)
    from public.fx_fixing_story_shocks
    where game_session_id = ${sqlLiteral(fixture.gameTwoId)}::uuid
  )
) as state;

do $invalid_result_rolls_back$
declare
  v_rejected boolean := false;
begin
  begin
    perform *
    from fx_apply_request as request
    cross join lateral public.apply_fx_fixing_v1(
      request.game_session_id,
      request.fixing_local_date,
      request.fixing_effective_at,
      request.lease_token,
      request.input_hash,
      request.calculated_at,
      jsonb_set(
        request.fixing_result,
        '{policyVersion}',
        to_jsonb('fx-policy-v999999'::text)
      )
    );
  exception
    when others then
      v_rejected := sqlerrm = 'FX_FIXING_RESULT_SCOPE_INVALID';
  end;

  perform pg_temp.fx_assert_v1(
    v_rejected,
    'tampered engine result is rejected atomically'
  );
end;
$invalid_result_rolls_back$;

select pg_temp.fx_assert_v1(
  exists (
    select 1
    from private.fx_runtime_state as runtime
    cross join fx_apply_before as before_state
    where runtime.game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid
      and runtime.current_fixing_id = before_state.current_fixing_id
      and runtime.lease_token = before_state.lease_token
      and (
        select count(*)
        from public.fx_fixings
        where game_session_id = runtime.game_session_id
      ) = before_state.fixing_count
  ),
  'tampered apply preserves fixing pointer, lease, and immutable history'
);

create temporary table fx_apply_once on commit drop as
select applied.*
from fx_apply_request as request
cross join lateral public.apply_fx_fixing_v1(
  request.game_session_id,
  request.fixing_local_date,
  request.fixing_effective_at,
  request.lease_token,
  request.input_hash,
  request.calculated_at,
  request.fixing_result
) as applied;

select pg_temp.fx_assert_v1(
  (
    select outcome = 'applied'
      and fixing_public_id ~ '^fxf_[0-9a-f]{32}$'
      and currency_values_inserted = 11
      and shocks_consumed = 1
    from fx_apply_once
  ),
  'one daily fixing atomically persists eleven values and one Story shock'
);

create temporary table fx_apply_replay on commit drop as
select replayed.*
from fx_apply_request as request
cross join lateral public.apply_fx_fixing_v1(
  request.game_session_id,
  request.fixing_local_date,
  request.fixing_effective_at,
  request.lease_token,
  request.input_hash,
  request.calculated_at,
  request.fixing_result
) as replayed;

select pg_temp.fx_assert_v1(
  (
    select replay.outcome = 'replayed'
      and replay.fixing_public_id = applied.fixing_public_id
      and replay.currency_values_inserted = 0
      and replay.shocks_consumed = 0
    from fx_apply_replay as replay
    cross join fx_apply_once as applied
  ),
  'same input hash replays the original fixing receipt without writes'
);

do $different_input_hash_conflict$
declare
  v_rejected boolean := false;
begin
  begin
    perform *
    from fx_apply_request as request
    cross join lateral public.apply_fx_fixing_v1(
      request.game_session_id,
      request.fixing_local_date,
      request.fixing_effective_at,
      request.lease_token,
      case
        when left(request.input_hash, 1) = '0'
          then '1' || substr(request.input_hash, 2)
        else '0' || substr(request.input_hash, 2)
      end,
      request.calculated_at,
      request.fixing_result
    );
  exception
    when others then
      v_rejected := sqlerrm = 'FX_INPUT_HASH_CONFLICT';
  end;

  perform pg_temp.fx_assert_v1(
    v_rejected,
    'same local date rejects a different input digest'
  );
end;
$different_input_hash_conflict$;

select pg_temp.fx_assert_v1(
  (
    select count(*) = 1
    from public.fx_fixings
    where game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid
      and fixing_kind = 'daily'
  )
    and (
      select count(*) = 11
      from public.fx_fixing_currency_values as value_row
      join public.fx_fixings as fixing_row on fixing_row.id = value_row.fixing_id
      where fixing_row.game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid
        and fixing_row.fixing_kind = 'daily'
    ),
  'replay and hash conflict leave one complete daily fixing'
);

create temporary table fx_daily_pointer_before_resume on commit drop as
select
  runtime.current_fixing_id,
  fixing_row.public_key as fixing_public_id,
  fixing_row.effective_at
from private.fx_runtime_state as runtime
join public.fx_fixings as fixing_row
  on fixing_row.id = runtime.current_fixing_id
 and fixing_row.game_session_id = runtime.game_session_id
where runtime.game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid;

update public.game_sessions
set lifecycle_state = 'paused',
    status = 'disabled',
    paused_at = clock_timestamp(),
    lifecycle_version = lifecycle_version + 1
where id = ${sqlLiteral(fixture.gameOneId)}::uuid;

update public.game_sessions
set lifecycle_state = 'active',
    status = 'active',
    resumed_at = clock_timestamp(),
    lifecycle_version = lifecycle_version + 1
where id = ${sqlLiteral(fixture.gameOneId)}::uuid;

select pg_temp.fx_assert_v1(
  exists (
    select 1
    from private.fx_runtime_state as runtime
    cross join fx_daily_pointer_before_resume as before_resume
    cross join fx_apply_once as applied
    where runtime.game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid
      and runtime.current_fixing_id = before_resume.current_fixing_id
      and before_resume.fixing_public_id = applied.fixing_public_id
      and runtime.next_due_at > before_resume.effective_at
  ),
  'pause and resume preserve the latest published daily fixing pointer'
);

create temporary table fx_after_daily_resume_claim on commit drop as
select claim_row.*
from private.fx_runtime_state as runtime
cross join lateral public.claim_due_fx_games_v1(
  runtime.next_due_at,
  100,
  'fx-db-after-daily-resume',
  120
) as claim_row
where runtime.game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid
  and claim_row.game_session_id = runtime.game_session_id;

create temporary table fx_after_daily_resume_input on commit drop as
select loaded.*
from fx_after_daily_resume_claim as claim_row
cross join lateral public.load_fx_fixing_input_v1(
  claim_row.game_session_id,
  claim_row.fixing_local_date,
  claim_row.lease_token
) as loaded;

select pg_temp.fx_assert_v1(
  (
    select currency.item ->> 'previousUnitsPerEco' =
      '0.505000000000000000'
    from fx_after_daily_resume_input as loaded
    cross join lateral jsonb_array_elements(loaded.engine_input -> 'currencies')
      as currency(item)
    where currency.item ->> 'currencyCode' = 'NRC'
  ),
  'the first post-resume input uses the daily fixing, not bootstrap, as predecessor'
);

select pg_temp.fx_assert_v1(
  public.fail_fx_fixing_claim_v1(
    ${sqlLiteral(fixture.gameOneId)}::uuid,
    (select fixing_local_date from fx_after_daily_resume_claim),
    (select lease_token from fx_after_daily_resume_claim),
    'fixture_after_daily_resume_release',
    clock_timestamp()
  ),
  'post-resume predecessor proof releases its fixing lease exactly once'
);

select pg_temp.fx_assert_v1(
  exists (
    select 1
    from public.fx_fixing_currency_values as value_row
    join public.fx_fixings as fixing_row on fixing_row.id = value_row.fixing_id
    where fixing_row.game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid
      and fixing_row.fixing_kind = 'daily'
      and value_row.currency_code = 'NRC'
      and value_row.previous_units_per_eco = 0.500000000000000000
      and value_row.units_per_eco = 0.505000000000000000
      and value_row.fundamental_basis_points = 0
      and value_row.story_basis_points = 100
      and value_row.final_basis_points = 100
      and jsonb_array_length(value_row.applied_story_shock_ids) = 1
  ),
  'positive Story basis points depreciate NRC to more local units per ECO'
);

select pg_temp.fx_assert_v1(
  (
    select count(*) = 1
    from public.fx_fixing_story_shocks as consumed
    join public.fx_story_shock_authorizations as shock_auth
      on shock_auth.id = consumed.shock_authorization_id
    where consumed.game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid
      and shock_auth.command_key = 'fx-db-consumable-shock-v1'
  )
    and not exists (
      select 1
      from public.fx_fixing_story_shocks as consumed
      join public.fx_story_shock_authorizations as shock_auth
        on shock_auth.id = consumed.shock_authorization_id
      where shock_auth.game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid
        and shock_auth.command_key = 'fx-db-story-replay-v1'
    ),
  'eligible Story shock is consumed once while the later authorization stays queued'
);

select pg_temp.fx_assert_v1(
  (
    select before_state.state = jsonb_build_object(
      'fixings', (
        select count(*) from public.fx_fixings
        where game_session_id = ${sqlLiteral(fixture.gameTwoId)}::uuid
      ),
      'values', (
        select count(*) from public.fx_fixing_currency_values
        where game_session_id = ${sqlLiteral(fixture.gameTwoId)}::uuid
      ),
      'snapshotLinks', (
        select count(*) from public.fx_fixing_macro_snapshots
        where game_session_id = ${sqlLiteral(fixture.gameTwoId)}::uuid
      ),
      'storyLinks', (
        select count(*) from public.fx_fixing_story_shocks
        where game_session_id = ${sqlLiteral(fixture.gameTwoId)}::uuid
      )
    )
    from fx_game_two_before as before_state
  ),
  'daily apply mutates no evidence in another game'
);

create temporary table fx_current_read on commit drop as
select public.get_current_fx_fixing_v1(
  ${sqlLiteral(fixture.gameOneId)}::uuid
) as fixing;

select pg_temp.fx_assert_v1(
  (
    select fixing ->> 'fixingPublicId' =
        (select fixing_public_id from fx_apply_once)
      and fixing ->> 'fixingKind' = 'daily'
      and fixing ->> 'policyVersion' =
        (select engine_input ->> 'policyVersion' from fx_loaded_input)
      and jsonb_array_length(fixing -> 'values') = 11
      and fixing::text not like '%' || ${sqlLiteral(fixture.gameOneId)} || '%'
      and not (fixing ? 'fixingId')
      and not (fixing ? 'gameSessionId')
    from fx_current_read
  ),
  'current fixing read is complete and browser-safe'
);

create temporary table fx_history_page_one on commit drop as
select *
from public.list_fx_fixing_history_v1(
  ${sqlLiteral(fixture.gameOneId)}::uuid,
  null,
  null,
  1
);

create temporary table fx_history_page_two on commit drop as
select history.*
from fx_history_page_one as cursor_row
cross join lateral public.list_fx_fixing_history_v1(
  ${sqlLiteral(fixture.gameOneId)}::uuid,
  cursor_row.effective_at,
  cursor_row.fixing_public_id,
  1
) as history;

select pg_temp.fx_assert_v1(
  (select fixing_kind = 'daily' from fx_history_page_one)
    and (select fixing_kind = 'bootstrap' from fx_history_page_two)
    and (
      select fixing_public_id ~ '^fxf_[0-9a-f]{32}$'
        and jsonb_array_length(currency_values) = 11
      from fx_history_page_two
    ),
  'history cursor returns daily then bootstrap without offset ambiguity'
);

do $immutable_fx_evidence$
declare
  v_rejections integer := 0;
begin
  begin
    update public.fx_fixings
    set calculated_at = calculated_at + interval '1 second'
    where public_key = (select fixing_public_id from fx_apply_once);
  exception
    when sqlstate '42501' then
      if sqlerrm = 'FX_EVIDENCE_IMMUTABLE' then
        v_rejections := v_rejections + 1;
      end if;
  end;

  begin
    update public.fx_fixing_currency_values
    set units_per_eco = units_per_eco + 1
    where game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid
      and currency_code = 'NRC';
  exception
    when sqlstate '42501' then
      if sqlerrm = 'FX_EVIDENCE_IMMUTABLE' then
        v_rejections := v_rejections + 1;
      end if;
  end;

  begin
    delete from public.fx_story_shock_authorizations
    where game_session_id = ${sqlLiteral(fixture.gameOneId)}::uuid
      and command_key = 'fx-db-consumable-shock-v1';
  exception
    when sqlstate '42501' then
      if sqlerrm = 'FX_EVIDENCE_IMMUTABLE' then
        v_rejections := v_rejections + 1;
      end if;
  end;

  begin
    update public.fx_policy_versions
    set parameters = parameters || jsonb_build_object('tampered', true)
    where policy_version = 'fx-policy-v1';
  exception
    when sqlstate '42501' then
      if sqlerrm = 'FX_EVIDENCE_IMMUTABLE' then
        v_rejections := v_rejections + 1;
      end if;
  end;

  perform pg_temp.fx_assert_v1(
    v_rejections = 4,
    'posted FX policy, fixing, value, and Story evidence are immutable'
  );
end;
$immutable_fx_evidence$;

rollback;
`;

const result = spawnSync(
  "psql",
  [
    "-X",
    "--no-psqlrc",
    "--echo-errors",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    databaseUrl,
  ],
  {
    input: sql,
    encoding: "utf8",
    timeout: 150_000,
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      PGCONNECT_TIMEOUT: process.env.PGCONNECT_TIMEOUT ?? "5",
    },
  },
);

if (result.status !== 0 || result.error) {
  const detail = redact(result.stderr || result.error?.message || "unknown error");
  throw new Error(`Canonical FX database acceptance failed: ${detail}`);
}

console.log("ok - canonical FX database acceptance rolled back cleanly");
