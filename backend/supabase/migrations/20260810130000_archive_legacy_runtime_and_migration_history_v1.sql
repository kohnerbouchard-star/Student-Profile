begin;

create schema if not exists private;

create table if not exists private.migration_ledger_history_archive (
  archive_batch_id text not null,
  environment text not null,
  source_commit text not null,
  workflow_run_id text not null,
  archived_at timestamptz not null default clock_timestamp(),
  version text not null,
  statements text[],
  name text,
  created_by text,
  idempotency_key text,
  rollback text[],
  primary key (archive_batch_id, version),
  constraint migration_ledger_history_archive_environment_check
    check (environment in ('staging', 'production')),
  constraint migration_ledger_history_archive_source_commit_check
    check (source_commit ~ '^[a-f0-9]{40}$')
);

alter table private.migration_ledger_history_archive enable row level security;
alter table private.migration_ledger_history_archive force row level security;
revoke all on table private.migration_ledger_history_archive from public, anon, authenticated;

comment on table private.migration_ledger_history_archive is
  'Forensic snapshots of Supabase migration metadata captured before explicitly authorized ledger identity reconciliation.';

create table if not exists private.legacy_shadow_kv_archive (
  key text primary key,
  value jsonb not null,
  source_relation text not null default 'public.kv_store_0dbf686f',
  archived_at timestamptz not null default clock_timestamp()
);

alter table private.legacy_shadow_kv_archive enable row level security;
alter table private.legacy_shadow_kv_archive force row level security;
revoke all on table private.legacy_shadow_kv_archive from public, anon, authenticated;

comment on table private.legacy_shadow_kv_archive is
  'Quarantined data from the retired Figma Make shadow runtime. No browser or hosted Edge runtime is authorized to use this table.';

do $archive_shadow_kv$
declare
  v_source_count bigint := 0;
  v_mismatch_count bigint := 0;
begin
  if to_regclass('public.kv_store_0dbf686f') is null then
    return;
  end if;

  execute 'select count(*) from public.kv_store_0dbf686f' into v_source_count;

  execute $sql$
    insert into private.legacy_shadow_kv_archive (key, value, source_relation, archived_at)
    select key, value, 'public.kv_store_0dbf686f', clock_timestamp()
    from public.kv_store_0dbf686f
    on conflict (key) do update
      set value = excluded.value,
          source_relation = excluded.source_relation,
          archived_at = excluded.archived_at
  $sql$;

  execute $sql$
    select count(*)
    from public.kv_store_0dbf686f source
    left join private.legacy_shadow_kv_archive archive
      on archive.key = source.key
     and archive.value = source.value
    where archive.key is null
  $sql$ into v_mismatch_count;

  if v_mismatch_count <> 0 then
    raise exception 'LEGACY_SHADOW_KV_ARCHIVE_MISMATCH:%', v_mismatch_count;
  end if;

  if (select count(*) from private.legacy_shadow_kv_archive where source_relation = 'public.kv_store_0dbf686f') < v_source_count then
    raise exception 'LEGACY_SHADOW_KV_ARCHIVE_COUNT_MISMATCH';
  end if;

  execute 'drop table public.kv_store_0dbf686f';
end
$archive_shadow_kv$;

commit;
