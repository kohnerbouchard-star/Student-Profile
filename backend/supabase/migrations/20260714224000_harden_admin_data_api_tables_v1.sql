begin;

alter table if exists public.store_items
  enable row level security;

alter table if exists public.currency_exchange_rates
  enable row level security;

alter table if exists public.player_attendance_records
  enable row level security;

revoke all privileges on table public.store_items
  from anon, authenticated;

revoke all privileges on table public.currency_exchange_rates
  from anon, authenticated;

revoke all privileges on table public.player_attendance_records
  from anon, authenticated;

revoke all privileges on table public.audit_log_flags
  from anon, authenticated;

revoke all privileges on table public.contract_reward_issuances
  from anon, authenticated;

comment on table public.store_items is
  'Game-scoped store catalog. Browser access is mediated through authenticated Edge Function routes.';

comment on table public.currency_exchange_rates is
  'Server-managed exchange-rate data. Direct anon and authenticated Data API access is disabled.';

comment on table public.player_attendance_records is
  'Game-scoped attendance records. Browser access is mediated through authenticated Edge Function routes.';

commit;
