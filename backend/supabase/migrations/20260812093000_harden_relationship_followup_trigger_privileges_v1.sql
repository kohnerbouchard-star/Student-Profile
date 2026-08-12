begin;

revoke all on function public.activate_relationship_followups_from_full_game_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.enable_relationship_followups_after_arrival_contact_v1()
  from public, anon, authenticated, service_role;

comment on function public.activate_relationship_followups_from_full_game_v1() is
  'Trigger-only relationship follow-up activation helper. Direct RPC execution is intentionally revoked.';
comment on function public.enable_relationship_followups_after_arrival_contact_v1() is
  'Trigger-only arrival-contact follow-up enablement helper. Direct RPC execution is intentionally revoked.';

commit;
