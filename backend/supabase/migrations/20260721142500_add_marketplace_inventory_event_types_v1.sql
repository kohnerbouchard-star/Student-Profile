begin;

alter table public.inventory_events
  drop constraint if exists inventory_events_event_type_check;

alter table public.inventory_events
  add constraint inventory_events_event_type_check
  check (
    event_type in (
      'PURCHASED',
      'USED',
      'RESERVED',
      'RELEASED',
      'ADJUSTED',
      'REVERSED',
      'MARKETPLACE_SOLD',
      'MARKETPLACE_PURCHASED',
      'MARKETPLACE_REFUNDED',
      'MARKETPLACE_RETURNED'
    )
  );

commit;
