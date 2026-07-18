begin;

create or replace function public.accept_player_contract_by_key(
  p_game_session_id uuid,
  p_player_id uuid,
  p_contract_key text
)
returns table (
  accept_outcome text,
  contract_key text,
  progress_status text,
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contract_id uuid;
  v_contract_key text;
  v_progress public.player_contract_progress%rowtype;
begin
  if p_game_session_id is null or p_player_id is null or length(btrim(coalesce(p_contract_key, ''))) = 0 then
    raise exception 'PLAYER_CONTRACT_ACCEPT_SCOPE_REQUIRED';
  end if;

  select contract.id, contract.contract_key
  into v_contract_id, v_contract_key
  from public.game_session_contracts contract
  join public.game_sessions game
    on game.id = contract.game_session_id
   and game.status = 'active'
  join public.players player
    on player.game_session_id = game.id
   and player.id = p_player_id
   and player.status = 'active'
  where contract.game_session_id = p_game_session_id
    and contract.contract_key = btrim(p_contract_key)
    and contract.status in ('active', 'scheduled')
    and contract.visibility in ('public', 'targeted')
    and contract.published_at is not null
    and contract.published_at <= now()
    and (contract.expires_at is null or contract.expires_at > now())
    and (
      contract.visibility = 'public'
      or exists (
        select 1
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(contract.targeting_payload -> 'playerIds') = 'array'
              then contract.targeting_payload -> 'playerIds'
            else '[]'::jsonb
          end
        ) target(value)
        where upper(btrim(target.value)) = upper(p_player_id::text)
      )
      or exists (
        select 1
        from public.player_country_assignments assignment
        join public.country_profiles country
          on country.id = assignment.country_profile_id
        cross join lateral jsonb_array_elements_text(
          case
            when jsonb_typeof(contract.targeting_payload -> 'countryCodes') = 'array'
              then contract.targeting_payload -> 'countryCodes'
            else '[]'::jsonb
          end
        ) target(value)
        where assignment.game_session_id = p_game_session_id
          and assignment.player_id = p_player_id
          and assignment.status = 'active'
          and upper(btrim(target.value)) = upper(btrim(country.country_code))
      )
      or (
        player.roster_label is not null
        and exists (
          select 1
          from jsonb_array_elements_text(
            case
              when jsonb_typeof(contract.targeting_payload -> 'rosterLabels') = 'array'
                then contract.targeting_payload -> 'rosterLabels'
              else '[]'::jsonb
            end
          ) target(value)
          where upper(btrim(target.value)) = upper(btrim(player.roster_label))
        )
      )
    )
  for share;

  if not found then
    accept_outcome := 'not_available';
    contract_key := btrim(p_contract_key);
    progress_status := null;
    accepted_at := null;
    return next;
    return;
  end if;

  insert into public.player_contract_progress (
    game_session_id,
    contract_id,
    player_id,
    status
  )
  values (
    p_game_session_id,
    v_contract_id,
    p_player_id,
    'in_progress'
  )
  on conflict (game_session_id, contract_id, player_id) do nothing
  returning * into v_progress;

  if found then
    accept_outcome := 'accepted';
  else
    select progress.*
    into v_progress
    from public.player_contract_progress progress
    where progress.game_session_id = p_game_session_id
      and progress.contract_id = v_contract_id
      and progress.player_id = p_player_id
    for update;

    if not found then
      raise exception 'PLAYER_CONTRACT_ACCEPT_PROGRESS_MISSING';
    end if;

    if v_progress.status = 'available' then
      update public.player_contract_progress progress
      set status = 'in_progress'
      where progress.id = v_progress.id
        and progress.status = 'available'
      returning progress.* into v_progress;

      if found then
        accept_outcome := 'accepted';
      else
        select progress.*
        into v_progress
        from public.player_contract_progress progress
        where progress.id = v_progress.id
        for update;

        accept_outcome := case
          when v_progress.status = 'in_progress' then 'already_accepted'
          else 'locked'
        end;
      end if;
    elsif v_progress.status = 'in_progress' then
      accept_outcome := 'already_accepted';
    else
      accept_outcome := 'locked';
    end if;
  end if;

  contract_key := v_contract_key;
  progress_status := v_progress.status;
  accepted_at := v_progress.updated_at;
  return next;
end;
$$;

revoke all on function public.accept_player_contract_by_key(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.accept_player_contract_by_key(uuid, uuid, text)
  to service_role;

comment on function public.accept_player_contract_by_key(uuid, uuid, text) is
  'Atomically accepts one currently available public or targeted player Contract by stable contract key. Player and game scope are supplied only by the trusted service.';

commit;
