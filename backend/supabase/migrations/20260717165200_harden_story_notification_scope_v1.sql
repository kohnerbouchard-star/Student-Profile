begin;

-- Harden notification delivery ownership after reconciling migration history.
-- The source_id column intentionally remains text because story, market, and
-- system sources do not all share one UUID-backed table.

do $$
begin
  if exists (
    select 1
    from public.notification_deliveries delivery
    join public.notifications notification
      on notification.id = delivery.notification_id
    where notification.game_session_id <> delivery.game_session_id
  ) then
    raise exception 'NOTIFICATION_DELIVERY_GAME_SCOPE_MISMATCH';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_game_session_id_id_unique'
  ) then
    alter table public.notifications
      add constraint notifications_game_session_id_id_unique
      unique (game_session_id, id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.notification_deliveries'::regclass
      and conname = 'notification_deliveries_notification_scope_fk'
  ) then
    alter table public.notification_deliveries
      add constraint notification_deliveries_notification_scope_fk
      foreign key (game_session_id, notification_id)
      references public.notifications (game_session_id, id)
      on delete cascade
      not valid;
  end if;
end
$$;

alter table public.notification_deliveries
  validate constraint notification_deliveries_notification_scope_fk;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.notification_deliveries'::regclass
      and conname = 'notification_deliveries_seen_after_delivery'
  ) then
    alter table public.notification_deliveries
      add constraint notification_deliveries_seen_after_delivery
      check (seen_at is null or seen_at >= delivered_at)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.notification_deliveries'::regclass
      and conname = 'notification_deliveries_dismissed_after_delivery'
  ) then
    alter table public.notification_deliveries
      add constraint notification_deliveries_dismissed_after_delivery
      check (dismissed_at is null or dismissed_at >= delivered_at)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.notification_deliveries'::regclass
      and conname = 'notification_deliveries_acknowledged_after_delivery'
  ) then
    alter table public.notification_deliveries
      add constraint notification_deliveries_acknowledged_after_delivery
      check (acknowledged_at is null or acknowledged_at >= delivered_at)
      not valid;
  end if;
end
$$;

alter table public.notification_deliveries
  validate constraint notification_deliveries_seen_after_delivery;
alter table public.notification_deliveries
  validate constraint notification_deliveries_dismissed_after_delivery;
alter table public.notification_deliveries
  validate constraint notification_deliveries_acknowledged_after_delivery;

create index if not exists notification_deliveries_notification_idx
  on public.notification_deliveries (notification_id);

drop trigger if exists set_notifications_updated_at
  on public.notifications;
create trigger set_notifications_updated_at
before update on public.notifications
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_notification_deliveries_updated_at
  on public.notification_deliveries;
create trigger set_notification_deliveries_updated_at
before update on public.notification_deliveries
for each row
execute function public.set_current_timestamp_updated_at();

revoke all privileges on table public.notifications
  from public, anon, authenticated;
revoke all privileges on table public.notification_deliveries
  from public, anon, authenticated;

grant select, insert, update, delete on table public.notifications
  to service_role;
grant select, insert, update, delete on table public.notification_deliveries
  to service_role;

comment on constraint notification_deliveries_notification_scope_fk
  on public.notification_deliveries is
  'Prevents a player delivery from pointing at a notification owned by another game session.';

commit;
