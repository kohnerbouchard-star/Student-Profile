begin;

alter function public.read_player_progression_v1(uuid, uuid) volatile;
alter function public.read_public_player_progression_profile_v1(uuid, text) volatile;
alter function public.read_admin_progression_players_v1(uuid, uuid, integer, integer) volatile;

comment on function public.read_player_progression_v1(uuid, uuid) is
  'Player-scoped Progression read. VOLATILE because it lazily initializes a missing private profile before returning public identifiers only.';
comment on function public.read_public_player_progression_profile_v1(uuid, text) is
  'Privacy-safe public Progression profile read. VOLATILE because it lazily initializes a missing profile.';
comment on function public.read_admin_progression_players_v1(uuid, uuid, integer, integer) is
  'Owner-scoped Admin Progression review. VOLATILE because it initializes missing profiles for active Players.';

commit;
