begin;

-- A delivery must reference a notification from the same game session. The
-- original single-column foreign key allowed internally inconsistent tenant
-- scope even though both tables carried game_session_id. Drop both known
-- historical FK variants first so this forward repair works whether the live
-- tables originated from the June or July notification definition.
alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_notification_scope_fk,
  drop constraint if exists notification_deliveries_notification_id_fkey;

alter table public.notifications
  drop constraint if exists notifications_game_session_id_id_unique;

alter table public.notifications
  add constraint notifications_game_session_id_id_unique
  unique (game_session_id, id);

alter table public.notification_deliveries
  add constraint notification_deliveries_notification_scope_fk
  foreign key (game_session_id, notification_id)
  references public.notifications (game_session_id, id)
  on delete cascade;

alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_seen_after_delivery,
  drop constraint if exists notification_deliveries_dismissed_after_delivery,
  drop constraint if exists notification_deliveries_acknowledged_after_delivery;

alter table public.notification_deliveries
  add constraint notification_deliveries_seen_after_delivery
    check (seen_at is null or seen_at >= delivered_at),
  add constraint notification_deliveries_dismissed_after_delivery
    check (dismissed_at is null or dismissed_at >= delivered_at),
  add constraint notification_deliveries_acknowledged_after_delivery
    check (acknowledged_at is null or acknowledged_at >= delivered_at);

create index if not exists notification_deliveries_notification_idx
  on public.notification_deliveries (notification_id);

commit;
