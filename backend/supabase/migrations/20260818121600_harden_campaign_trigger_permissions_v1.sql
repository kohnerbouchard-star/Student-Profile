begin;

revoke all on function public.ensure_ready_game_campaign_v1()
  from public, anon, authenticated;

comment on function public.ensure_ready_game_campaign_v1() is
  'Internal game-session trigger helper that initializes the canonical campaign when a game becomes active and ready. It is not an RPC surface.';

commit;
