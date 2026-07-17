begin;

alter table public.player_attendance_records
  drop constraint if exists player_attendance_records_status_check;

alter table public.player_attendance_records
  alter column clocked_in_at drop not null,
  add column if not exists note text null,
  add column if not exists corrected_by_staff_user_id uuid null references public.staff_users(id) on delete set null,
  add column if not exists corrected_at timestamptz null;

alter table public.player_attendance_records
  add constraint player_attendance_records_status_check
  check (status in ('present', 'late', 'absent', 'excused'));

alter table public.player_attendance_records
  add constraint player_attendance_records_note_not_blank
  check (note is null or length(btrim(note)) > 0);

create table if not exists public.attendance_day_locks (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  attendance_date date not null,
  locked_by_staff_user_id uuid not null references public.staff_users(id) on delete restrict,
  status text not null default 'locked',
  reason text null,
  locked_at timestamptz not null default now(),
  unlocked_at timestamptz null,
  constraint attendance_day_locks_scope_unique unique (game_session_id, attendance_date),
  constraint attendance_day_locks_status_check check (status in ('locked', 'unlocked')),
  constraint attendance_day_locks_reason_not_blank check (reason is null or length(btrim(reason)) > 0)
);

create index if not exists attendance_day_locks_game_date_idx
  on public.attendance_day_locks (game_session_id, attendance_date desc);

alter table public.attendance_day_locks enable row level security;

create table if not exists public.player_admin_flags (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null,
  flagged_by_staff_user_id uuid not null references public.staff_users(id) on delete restrict,
  level text not null default 'warning',
  reason text not null,
  restriction text null,
  status text not null default 'open',
  review_date date null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  constraint player_admin_flags_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id) on delete cascade,
  constraint player_admin_flags_level_check
    check (level in ('info', 'warning', 'restriction', 'critical')),
  constraint player_admin_flags_status_check
    check (status in ('open', 'resolved', 'dismissed')),
  constraint player_admin_flags_reason_not_blank
    check (length(btrim(reason)) > 0),
  constraint player_admin_flags_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists player_admin_flags_game_player_status_idx
  on public.player_admin_flags (game_session_id, player_id, status, created_at desc);

alter table public.player_admin_flags enable row level security;

create table if not exists public.player_admin_settings (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null,
  settings jsonb not null default '{}'::jsonb,
  updated_by_staff_user_id uuid null references public.staff_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_admin_settings_scope_unique unique (game_session_id, player_id),
  constraint player_admin_settings_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id) on delete cascade,
  constraint player_admin_settings_object_check
    check (jsonb_typeof(settings) = 'object')
);

create index if not exists player_admin_settings_game_player_idx
  on public.player_admin_settings (game_session_id, player_id);

alter table public.player_admin_settings enable row level security;

create table if not exists public.staff_admin_preferences (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references public.staff_users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_admin_preferences_staff_unique unique (staff_user_id),
  constraint staff_admin_preferences_object_check check (jsonb_typeof(preferences) = 'object')
);

alter table public.staff_admin_preferences enable row level security;

revoke all privileges on table public.attendance_day_locks
  from anon, authenticated;
revoke all privileges on table public.player_admin_flags
  from anon, authenticated;
revoke all privileges on table public.player_admin_settings
  from anon, authenticated;
revoke all privileges on table public.staff_admin_preferences
  from anon, authenticated;

comment on table public.attendance_day_locks is
  'Server-enforced administrator lock state for a game attendance date.';
comment on table public.player_admin_flags is
  'Staff-only player review flags and restrictions.';
comment on table public.player_admin_settings is
  'Staff-managed player configuration not exposed directly to players.';
comment on table public.staff_admin_preferences is
  'Administrator console preferences stored server-side.';

commit;
