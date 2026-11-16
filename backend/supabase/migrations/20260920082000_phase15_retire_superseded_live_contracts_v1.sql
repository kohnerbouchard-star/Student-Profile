-- Retire superseded live-only aliases and converge the remaining access surface.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Stage 4-6 activation is now arrival-clock controlled. Production retained an
-- older trigger alias that the current repository retirement could not name.
drop trigger if exists zzz_activate_meridian_customs_security_intrusion_from_full_game
  on public.game_feature_activation_evidence;
drop trigger if exists zzz_activate_meridian_customs_security_intrusion_from_full_game_v1
  on public.game_feature_activation_evidence;
drop trigger if exists zzzz_activate_meridian_security_center_attack_from_full_game_v1
  on public.game_feature_activation_evidence;
drop trigger if exists zzzzz_activate_meridian_emergency_response_from_full_game_v1
  on public.game_feature_activation_evidence;

drop function if exists public.activate_meridian_customs_security_intrusion_from_full_game_v1();
drop function if exists public.activate_meridian_security_center_attack_from_full_game_v1();
drop function if exists public.activate_meridian_emergency_response_from_full_game_v1();

-- V2 confirmation and the environment-neutral archive scheduler supersede
-- these historical entry points. Their removal is forward-only and leaves the
-- current service-role surfaces installed by the preceding migrations.
drop function if exists private.assert_active_game_admin_v1(uuid);
drop function if exists public.issue_game_data_purge_confirmation_v1(uuid, uuid);
drop function if exists public.confirm_game_data_purge_v1(uuid, uuid, text);
drop function if exists public.configure_stock_tick_archive_retention_v2(text);

-- Public schema access is granted to the named Supabase API roles, not every
-- database role. Preserve the stricter hosted posture on clean replay too.
revoke usage on schema public from public;

-- Reassert the current repository's service-role table privileges that older
-- hosted histories missed. The service role is the only non-owner beneficiary.
grant delete, references, trigger, truncate
  on table public.player_contract_progress to service_role;
grant insert, delete
  on table public.player_stock_watchlist to service_role;
grant select, insert, update, delete, truncate, references, trigger
  on table public.request_rate_limit_buckets to service_role;

commit;
