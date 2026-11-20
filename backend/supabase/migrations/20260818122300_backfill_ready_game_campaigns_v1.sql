begin;

do $backfill$
declare
  v_game record;
  v_result jsonb;
  v_backfilled integer := 0;
begin
  for v_game in
    select game_row.id
    from public.game_sessions as game_row
    where game_row.status = 'active'
      and game_row.provisioning_status = 'ready'
      and game_row.provisioning_pack_id = 'econovaria.beta-seed-pack.v1'
      and game_row.provisioning_pack_version = '1.0.0-beta'
      and not exists (
        select 1
        from public.campaign_instances as campaign_row
        where campaign_row.game_session_id = game_row.id
      )
    order by game_row.created_at, game_row.id
    for update of game_row
  loop
    v_result := public.initialize_default_campaign_for_game_v1(
      v_game.id,
      clock_timestamp()
    );

    if coalesce(v_result->>'definitionDigest', '') <> 'sha256:ded8e2bb638c609553cbbd70b26ba6577109e570856edd503043e8d054877567'
       or coalesce(v_result->>'status', '') <> 'active'
       or coalesce(v_result->>'phase', '') <> 'arrival'
    then
      raise exception 'CAMPAIGN_EXISTING_GAME_BACKFILL_INVALID'
        using errcode = 'P0001';
    end if;

    v_backfilled := v_backfilled + 1;
  end loop;

  if exists (
    select 1
    from public.game_sessions as game_row
    where game_row.status = 'active'
      and game_row.provisioning_status = 'ready'
      and game_row.provisioning_pack_id = 'econovaria.beta-seed-pack.v1'
      and game_row.provisioning_pack_version = '1.0.0-beta'
      and (
        select count(*)
        from public.campaign_instances as campaign_row
        where campaign_row.game_session_id = game_row.id
      ) <> 1
  ) then
    raise exception 'CAMPAIGN_EXISTING_GAME_BACKFILL_INVARIANT_FAILED'
      using errcode = 'P0001';
  end if;

  raise notice 'Campaign existing-game backfill initialized % game(s).', v_backfilled;
end;
$backfill$;

comment on function public.initialize_default_campaign_for_game_v1(uuid,timestamptz) is
  'Canonical Campaign initializer used by new-game provisioning and the one-time existing-ready-game backfill. Active ready beta-pack games must have exactly one Campaign instance.';

commit;
