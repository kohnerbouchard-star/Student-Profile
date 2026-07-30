begin;

create table if not exists public.production_content_promotions (
  authorization_id text primary key,
  project_ref text not null,
  denied_project_ref text not null,
  source_game_session_id uuid not null,
  target_owner_staff_user_id uuid not null,
  target_game_session_id uuid,
  pack_id text not null,
  pack_version text not null,
  pack_sha256 text not null,
  physical_economy_content_digest text not null,
  physical_economy_source_commit text not null,
  authorized_by text not null,
  authorized_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  status text not null default 'authorized',
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_content_promotions_project_ref_check
    check (project_ref ~ '^[a-z0-9]{20}$'),
  constraint production_content_promotions_denied_ref_check
    check (denied_project_ref ~ '^[a-z0-9]{20}$' and denied_project_ref <> project_ref),
  constraint production_content_promotions_pack_id_check
    check (length(btrim(pack_id)) between 1 and 128),
  constraint production_content_promotions_pack_version_check
    check (length(btrim(pack_version)) between 1 and 64),
  constraint production_content_promotions_pack_sha_check
    check (pack_sha256 ~ '^[0-9a-f]{64}$'),
  constraint production_content_promotions_physical_digest_check
    check (physical_economy_content_digest ~ '^[0-9a-f]{64}$'),
  constraint production_content_promotions_source_commit_check
    check (physical_economy_source_commit ~ '^[0-9a-f]{40}$'),
  constraint production_content_promotions_time_check
    check (expires_at > authorized_at),
  constraint production_content_promotions_status_check
    check (status in ('authorized', 'running', 'completed', 'failed')),
  constraint production_content_promotions_result_check
    check (jsonb_typeof(result) = 'object')
);

create index if not exists production_content_promotions_target_game_idx
  on public.production_content_promotions (target_game_session_id)
  where target_game_session_id is not null;

alter table public.production_content_promotions enable row level security;

revoke all privileges on table public.production_content_promotions
  from public, anon, authenticated;
grant select, insert, update on table public.production_content_promotions
  to service_role;

comment on table public.production_content_promotions is
  'Exact, replay-resistant authorization and sanitized result ledger for one-time production promotion of the canonical staging content pack.';

commit;
