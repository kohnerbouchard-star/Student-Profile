-- Phase 15: close newly surfaced database advisor findings before production.
--
-- The trigger functions below are internal table invariants, not RPC endpoints.
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default, which exposed
-- these SECURITY DEFINER routines to anon/authenticated through PostgREST.
-- Keep trigger execution intact while removing direct browser-role invocation.
--
-- store_items_scope_id_unique duplicates the canonical
-- store_items_game_session_id_id_unique constraint index. All referencing
-- foreign keys bind to the canonical constraint index, so the later duplicate
-- is safe to retire.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

revoke all privileges
  on function public.attach_business_money_identity_v2()
  from public, anon, authenticated;
revoke all privileges
  on function public.guard_business_activity_event_v2()
  from public, anon, authenticated;
revoke all privileges
  on function public.guard_business_ownership_transaction_v2()
  from public, anon, authenticated;

grant execute
  on function public.attach_business_money_identity_v2()
  to service_role;
grant execute
  on function public.guard_business_activity_event_v2()
  to service_role;
grant execute
  on function public.guard_business_ownership_transaction_v2()
  to service_role;

drop index if exists public.store_items_scope_id_unique;

commit;
