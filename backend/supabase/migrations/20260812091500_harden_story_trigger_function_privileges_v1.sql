begin;

revoke all on function public.deliver_story_character_message_from_impact_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.activate_northreach_character_story_from_full_game_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.capture_story_relationship_contact_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.capture_story_relationship_reply_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.activate_remaining_country_openings_from_full_game_v1()
  from public, anon, authenticated, service_role;

comment on function public.deliver_story_character_message_from_impact_v1() is
  'Trigger-only Story message delivery helper. Direct RPC execution is intentionally revoked.';
comment on function public.activate_northreach_character_story_from_full_game_v1() is
  'Trigger-only Northreach Story activation helper. Direct RPC execution is intentionally revoked.';
comment on function public.capture_story_relationship_contact_v1() is
  'Trigger-only Story relationship contact capture helper. Direct RPC execution is intentionally revoked.';
comment on function public.capture_story_relationship_reply_v1() is
  'Trigger-only Story relationship reply capture helper. Direct RPC execution is intentionally revoked.';
comment on function public.activate_remaining_country_openings_from_full_game_v1() is
  'Trigger-only remaining-country Story activation helper. Direct RPC execution is intentionally revoked.';

commit;
