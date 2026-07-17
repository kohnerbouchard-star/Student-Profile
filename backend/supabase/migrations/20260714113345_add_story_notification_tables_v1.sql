create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  source_type text not null,
  source_id text null,
  notification_type text not null,
  title text not null,
  summary text not null,
  priority text not null,
  display_mode text not null,
  payload jsonb not null default '{}'::jsonb,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notifications_source_type_not_blank check (length(btrim(source_type)) > 0),
  constraint notifications_notification_type_not_blank check (length(btrim(notification_type)) > 0),
  constraint notifications_title_not_blank check (length(btrim(title)) > 0),
  constraint notifications_summary_not_blank check (length(btrim(summary)) > 0),
  constraint notifications_priority_not_blank check (length(btrim(priority)) > 0),
  constraint notifications_display_mode_not_blank check (length(btrim(display_mode)) > 0),
  constraint notifications_payload_object check (jsonb_typeof(payload) = 'object')
);

create unique index notifications_source_unique_idx
  on public.notifications (game_session_id, source_type, source_id, notification_type)
  where source_id is not null;

create index notifications_game_published_idx
  on public.notifications (game_session_id, published_at desc);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null,
  delivered_at timestamptz not null default now(),
  seen_at timestamptz null,
  dismissed_at timestamptz null,
  acknowledged_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id)
    on delete cascade,
  constraint notification_deliveries_notification_player_unique
    unique (notification_id, player_id)
);

create index notification_deliveries_game_player_idx
  on public.notification_deliveries (game_session_id, player_id, delivered_at desc);

create index notification_deliveries_unseen_idx
  on public.notification_deliveries (game_session_id, player_id, delivered_at desc)
  where seen_at is null and dismissed_at is null;

alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;

revoke all privileges on table public.notifications from public, anon, authenticated;
revoke all privileges on table public.notification_deliveries from public, anon, authenticated;

grant select, insert, update, delete on table public.notifications to service_role;
grant select, insert, update, delete on table public.notification_deliveries to service_role;

comment on table public.notifications is
  'Server-managed game notifications and story cutscenes. Browser access is mediated through authenticated Edge Function routes.';
comment on table public.notification_deliveries is
  'Server-managed per-player notification delivery state. Browser access is mediated through authenticated Edge Function routes.';
