begin;

-- Canonical source games are non-joinable infrastructure and may be active
-- while their seed and World publication are assembled. A player-facing game
-- becomes joinable only when both the game and its Game Code are active.
create or replace function public.enforce_active_game_is_provisioned_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.status = 'active'
    and new.game_join_code_status = 'active'
    and coalesce(new.provisioning_status, 'pending') <> 'ready'
  then
    raise exception 'JOINABLE_GAME_REQUIRES_READY_PROVISIONING'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

-- Quarantine historical games created through the legacy empty-game path.
-- Their Game Codes become unusable, while the rows remain visible for Admin
-- review and eventual archival. No provisioned ready game is modified.
update public.game_sessions
set status = 'disabled',
    lifecycle_state = 'draft',
    game_join_code_hash = null,
    game_join_code_status = 'pending',
    provisioning_failure_code = 'LEGACY_UNPROVISIONED_GAME_QUARANTINED',
    updated_at = now()
where status = 'active'
  and game_join_code_status = 'active'
  and coalesce(provisioning_status, 'pending') <> 'ready';

drop trigger if exists enforce_active_game_is_provisioned
  on public.game_sessions;
create trigger enforce_active_game_is_provisioned
before insert or update of status, game_join_code_status, provisioning_status
on public.game_sessions
for each row execute function public.enforce_active_game_is_provisioned_v1();

revoke all on function public.enforce_active_game_is_provisioned_v1()
  from public, anon, authenticated;

comment on function public.enforce_active_game_is_provisioned_v1() is
  'Rejects any player-joinable active game until canonical content provisioning is ready, while allowing non-joinable canonical seed-source infrastructure.';

commit;
