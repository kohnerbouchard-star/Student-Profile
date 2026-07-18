begin;

alter table public.notifications
  add column if not exists public_notification_id text;

update public.notifications
set public_notification_id = 'ntf_' || replace(gen_random_uuid()::text, '-', '')
where public_notification_id is null;

alter table public.notifications
  alter column public_notification_id
  set default ('ntf_' || replace(gen_random_uuid()::text, '-', ''));

alter table public.notifications
  alter column public_notification_id set not null;

alter table public.notifications
  drop constraint if exists notifications_public_notification_id_format;

alter table public.notifications
  add constraint notifications_public_notification_id_format
  check (public_notification_id ~ '^ntf_[0-9a-f]{32}$');

create unique index if not exists notifications_public_notification_id_unique_idx
  on public.notifications (public_notification_id);

alter table public.notification_deliveries
  add column if not exists public_delivery_id text;

update public.notification_deliveries
set public_delivery_id = 'ndl_' || replace(gen_random_uuid()::text, '-', '')
where public_delivery_id is null;

alter table public.notification_deliveries
  alter column public_delivery_id
  set default ('ndl_' || replace(gen_random_uuid()::text, '-', ''));

alter table public.notification_deliveries
  alter column public_delivery_id set not null;

alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_public_delivery_id_format;

alter table public.notification_deliveries
  add constraint notification_deliveries_public_delivery_id_format
  check (public_delivery_id ~ '^ndl_[0-9a-f]{32}$');

create unique index if not exists notification_deliveries_public_delivery_id_unique_idx
  on public.notification_deliveries (public_delivery_id);

create index if not exists notification_deliveries_player_public_id_idx
  on public.notification_deliveries (
    game_session_id,
    player_id,
    public_delivery_id
  );

alter table public.notifications force row level security;
alter table public.notification_deliveries force row level security;

comment on column public.notifications.public_notification_id is
  'Random browser-safe notification identifier independent from the internal notification UUID.';
comment on column public.notification_deliveries.public_delivery_id is
  'Random browser-safe delivery identifier used by authenticated player notification routes.';

commit;
