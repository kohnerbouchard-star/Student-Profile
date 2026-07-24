begin;

create table if not exists public.seed_content_release_revisions (
  id uuid primary key,
  release_id uuid not null references public.seed_content_releases(id) on delete restrict,
  game_session_id uuid not null references public.game_sessions(id) on delete restrict,
  pack_id text not null,
  version text not null,
  pack_sha256 text not null,
  target_environment text not null,
  source_sha text,
  authorization_id text,
  approved_by text,
  activation_requested boolean not null,
  status text not null,
  operation_count integer not null default 0,
  result jsonb,
  failure_code text,
  release_snapshot jsonb not null,
  member_snapshot jsonb not null,
  member_count integer not null,
  member_snapshot_sha256 text not null,
  recorded_at timestamptz not null default now(),
  constraint seed_content_release_revisions_identity_key
    unique (release_id, version, pack_sha256),
  constraint seed_content_release_revisions_pack_digest_check
    check (pack_sha256 ~ '^[0-9a-f]{64}$'),
  constraint seed_content_release_revisions_source_sha_check
    check (source_sha is null or source_sha ~ '^[0-9a-f]{40}$'),
  constraint seed_content_release_revisions_member_digest_check
    check (member_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  constraint seed_content_release_revisions_environment_check
    check (target_environment in ('local', 'test', 'staging')),
  constraint seed_content_release_revisions_member_count_check
    check (member_count >= 0)
);

create index if not exists seed_content_release_revisions_release_recorded_idx
  on public.seed_content_release_revisions(release_id, recorded_at desc);

create index if not exists seed_content_release_revisions_game_pack_idx
  on public.seed_content_release_revisions(game_session_id, pack_id, recorded_at desc);

alter table public.seed_content_release_revisions enable row level security;
revoke all on table public.seed_content_release_revisions from public, anon, authenticated;
grant select, insert on table public.seed_content_release_revisions to service_role;

create or replace function public.reject_seed_content_release_revision_mutation_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception using errcode = '55000', message = 'SEED_RELEASE_REVISION_IMMUTABLE';
end;
$function$;

revoke all on function public.reject_seed_content_release_revision_mutation_v1() from public, anon, authenticated;

create trigger seed_content_release_revisions_immutable
before update or delete on public.seed_content_release_revisions
for each row execute function public.reject_seed_content_release_revision_mutation_v1();

create or replace function public.record_seed_content_release_revision_v1(
  p_release_id uuid,
  p_source_sha text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_release public.seed_content_releases%rowtype;
  v_members jsonb;
  v_member_count integer;
  v_member_digest text;
  v_revision_id uuid;
begin
  select * into v_release
  from public.seed_content_releases
  where id = p_release_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'SEED_RELEASE_NOT_FOUND';
  end if;
  if p_source_sha is not null and p_source_sha !~ '^[0-9a-f]{40}$' then
    raise exception using errcode = '22023', message = 'SEED_RELEASE_INVALID_SOURCE_SHA';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'objectType', object_type,
        'stableKey', stable_key,
        'recordId', record_id,
        'createdByRelease', created_by_release,
        'previousRow', previous_row,
        'createdAt', created_at,
        'updatedAt', updated_at
      ) order by object_type, stable_key
    ),
    '[]'::jsonb
  ), count(*)::integer
  into v_members, v_member_count
  from public.seed_content_release_members
  where release_id = p_release_id;

  v_member_digest := encode(
    extensions.digest(pg_catalog.convert_to(v_members::text, 'UTF8'), 'sha256'),
    'hex'
  );
  v_revision_id := public.seed_content_stable_uuid_v1(
    'econovaria-seed-release-revision|' || p_release_id::text || '|' ||
    v_release.version || '|' || v_release.pack_sha256
  );

  insert into public.seed_content_release_revisions (
    id, release_id, game_session_id, pack_id, version, pack_sha256,
    target_environment, source_sha, authorization_id, approved_by,
    activation_requested, status, operation_count, result, failure_code,
    release_snapshot, member_snapshot, member_count, member_snapshot_sha256,
    recorded_at
  ) values (
    v_revision_id, v_release.id, v_release.game_session_id, v_release.pack_id,
    v_release.version, v_release.pack_sha256, v_release.target_environment,
    lower(p_source_sha), v_release.authorization_id, v_release.approved_by,
    v_release.activation_requested, v_release.status, v_release.operation_count,
    v_release.result, v_release.failure_code, to_jsonb(v_release), v_members,
    v_member_count, v_member_digest, now()
  )
  on conflict (release_id, version, pack_sha256) do nothing;

  return v_revision_id;
end;
$function$;

revoke all on function public.record_seed_content_release_revision_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.record_seed_content_release_revision_v1(uuid, text) to service_role;

create or replace function public.apply_seed_content_release_revision_v2(
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
  p_fail_after_operations integer default null,
  p_source_sha text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_release public.seed_content_releases%rowtype;
  v_previous public.seed_content_releases%rowtype;
  v_result jsonb;
  v_revision_count integer;
  v_is_revision boolean := false;
begin
  if not public.seed_content_request_is_privileged_v1() then
    raise exception using errcode = '42501', message = 'SEED_RELEASE_SERVICE_ROLE_REQUIRED';
  end if;
  if p_source_sha is null or p_source_sha !~ '^[0-9a-f]{40}$' then
    raise exception using errcode = '22023', message = 'SEED_RELEASE_EXACT_SOURCE_SHA_REQUIRED';
  end if;

  select * into v_release
  from public.seed_content_releases
  where game_session_id = p_game_session_id
    and pack_id = btrim(p_pack_id)
  for update;

  if not found then
    v_result := public.apply_seed_content_release_v1(
      p_game_session_id, p_pack_id, p_version, p_pack_sha256,
      p_target_environment, p_activate, p_authorization_id, p_approved_by,
      p_market_templates, p_contract_templates, p_store_items,
      p_fail_after_operations
    );
    if coalesce(v_result->>'outcome', '') <> 'failed' then
      perform public.record_seed_content_release_revision_v1(
        (v_result->>'releaseId')::uuid,
        lower(p_source_sha)
      );
    end if;
    return v_result || jsonb_build_object(
      'revisionApplied', false,
      'revisionLedger', true,
      'sourceSha', lower(p_source_sha)
    );
  end if;

  if v_release.target_environment <> p_target_environment then
    raise exception using errcode = '23505', message = 'SEED_RELEASE_CONFLICTING_ENVIRONMENT';
  end if;

  if v_release.version = btrim(p_version)
     and v_release.pack_sha256 = p_pack_sha256 then
    v_result := public.apply_seed_content_release_v1(
      p_game_session_id, p_pack_id, p_version, p_pack_sha256,
      p_target_environment, p_activate, p_authorization_id, p_approved_by,
      p_market_templates, p_contract_templates, p_store_items,
      p_fail_after_operations
    );
    if coalesce(v_result->>'outcome', '') <> 'failed' then
      perform public.record_seed_content_release_revision_v1(v_release.id, lower(p_source_sha));
    end if;
    select count(*)::integer into v_revision_count
    from public.seed_content_release_revisions
    where release_id = v_release.id;
    return v_result || jsonb_build_object(
      'revisionApplied', false,
      'revisionLedger', true,
      'revisionCount', v_revision_count,
      'sourceSha', lower(p_source_sha)
    );
  end if;

  v_is_revision := true;
  v_previous := v_release;
  perform public.record_seed_content_release_revision_v1(v_release.id, null);

  update public.seed_content_releases
  set version = btrim(p_version),
      pack_sha256 = p_pack_sha256,
      authorization_id = p_authorization_id,
      approved_by = p_approved_by,
      activation_requested = p_activate,
      failure_code = null,
      updated_at = now()
  where id = v_release.id;

  begin
    v_result := public.apply_seed_content_release_v1(
      p_game_session_id, p_pack_id, p_version, p_pack_sha256,
      p_target_environment, p_activate, p_authorization_id, p_approved_by,
      p_market_templates, p_contract_templates, p_store_items,
      p_fail_after_operations
    );

    if coalesce(v_result->>'outcome', '') = 'failed' then
      update public.seed_content_releases
      set version = v_previous.version,
          pack_sha256 = v_previous.pack_sha256,
          target_environment = v_previous.target_environment,
          authorization_id = v_previous.authorization_id,
          approved_by = v_previous.approved_by,
          activation_requested = v_previous.activation_requested,
          status = v_previous.status,
          operation_count = v_previous.operation_count,
          result = v_previous.result,
          failure_code = v_previous.failure_code,
          applied_at = v_previous.applied_at,
          deactivated_at = v_previous.deactivated_at,
          rolled_back_at = v_previous.rolled_back_at,
          updated_at = now()
      where id = v_previous.id;
      return v_result || jsonb_build_object(
        'revisionApplied', false,
        'revisionRestored', true,
        'previousVersion', v_previous.version,
        'previousPackSha256', v_previous.pack_sha256,
        'sourceSha', lower(p_source_sha)
      );
    end if;
  exception when others then
    update public.seed_content_releases
    set version = v_previous.version,
        pack_sha256 = v_previous.pack_sha256,
        target_environment = v_previous.target_environment,
        authorization_id = v_previous.authorization_id,
        approved_by = v_previous.approved_by,
        activation_requested = v_previous.activation_requested,
        status = v_previous.status,
        operation_count = v_previous.operation_count,
        result = v_previous.result,
        failure_code = v_previous.failure_code,
        applied_at = v_previous.applied_at,
        deactivated_at = v_previous.deactivated_at,
        rolled_back_at = v_previous.rolled_back_at,
        updated_at = now()
    where id = v_previous.id;
    raise;
  end;

  perform public.record_seed_content_release_revision_v1(v_release.id, lower(p_source_sha));
  select count(*)::integer into v_revision_count
  from public.seed_content_release_revisions
  where release_id = v_release.id;

  return v_result || jsonb_build_object(
    'revisionApplied', v_is_revision,
    'revisionLedger', true,
    'revisionCount', v_revision_count,
    'previousVersion', v_previous.version,
    'previousPackSha256', v_previous.pack_sha256,
    'sourceSha', lower(p_source_sha)
  );
end;
$function$;

revoke all on function public.apply_seed_content_release_revision_v2(
  uuid, text, text, text, text, boolean, text, text, jsonb, jsonb, jsonb, integer, text
) from public, anon, authenticated;
grant execute on function public.apply_seed_content_release_revision_v2(
  uuid, text, text, text, text, boolean, text, text, jsonb, jsonb, jsonb, integer, text
) to service_role;

alter function public.rollback_seed_content_release_v1(uuid, text, text, text, boolean)
  rename to rollback_seed_content_release_legacy_v1;

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
as $function$
declare
  v_release_id uuid;
  v_revision_count integer;
begin
  if not public.seed_content_request_is_privileged_v1() then
    raise exception using errcode = '42501', message = 'SEED_RELEASE_SERVICE_ROLE_REQUIRED';
  end if;

  select id into v_release_id
  from public.seed_content_releases
  where game_session_id = p_game_session_id
    and pack_id = btrim(p_pack_id)
    and version = btrim(p_version)
    and pack_sha256 = p_pack_sha256;

  if v_release_id is null then
    raise exception using errcode = 'P0002', message = 'SEED_RELEASE_NOT_FOUND';
  end if;

  select count(*)::integer into v_revision_count
  from public.seed_content_release_revisions
  where release_id = v_release_id;

  if v_revision_count > 1 then
    raise exception using errcode = '55000',
      message = 'SEED_RELEASE_REVISION_ROLLBACK_REQUIRES_EXACT_REAPPLY';
  end if;

  return public.rollback_seed_content_release_legacy_v1(
    p_game_session_id,
    p_pack_id,
    p_version,
    p_pack_sha256,
    p_allow_soft_rollback
  );
end;
$function$;

revoke all on function public.rollback_seed_content_release_legacy_v1(uuid, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.rollback_seed_content_release_legacy_v1(uuid, text, text, text, boolean)
  to service_role;
revoke all on function public.rollback_seed_content_release_v1(uuid, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.rollback_seed_content_release_v1(uuid, text, text, text, boolean)
  to service_role;

select public.record_seed_content_release_revision_v1(id, null)
from public.seed_content_releases
where status not in ('failed');

comment on table public.seed_content_release_revisions is
  'Append-only immutable identities for every applied Seed release revision. seed_content_releases remains the current projection per game and pack.';
comment on function public.apply_seed_content_release_revision_v2 is
  'Applies or reapplies an exact Seed pack revision while preserving immutable predecessor identities and restoring the current projection on failure.';

commit;
