begin;

-- Atomically transitions one authenticated player's contract progress into
-- in_progress without allowing a concurrent accept to overwrite submitted or
-- completed work. Targeting remains enforced by the trusted HTTP service.

create or replace function public.accept_player_contract(
  p_game_session_id uuid,
  p_contract_id uuid,
  p_player_id uuid
)
returns table (
  accept_outcome text,
  id uuid,
  game_session_id uuid,
  contract_id uuid,
  player_id uuid,
  status text,
  evidence_payload jsonb,
  result_payload jsonb,
  submitted_at timestamptz,
  completed_at timestamptz,
  reward_issued_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_progress public.player_contract_progress%rowtype;
begin
  if p_game_session_id is null or p_contract_id is null or p_player_id is null then
    raise exception 'PLAYER_CONTRACT_ACCEPT_SCOPE_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.game_sessions game
    join public.players player
      on player.game_session_id = game.id
     and player.id = p_player_id
     and player.status = 'active'
    join public.game_session_contracts contract
      on contract.game_session_id = game.id
     and contract.id = p_contract_id
     and contract.status in ('active', 'scheduled')
     and contract.visibility in ('public', 'targeted')
     and contract.published_at is not null
     and contract.published_at <= now()
     and (contract.expires_at is null or contract.expires_at > now())
    where game.id = p_game_session_id
      and game.status = 'active'
  ) then
    accept_outcome := 'not_available';
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
    p_contract_id,
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
      and progress.contract_id = p_contract_id
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
      accept_outcome := 'accepted';
    elsif v_progress.status = 'in_progress' then
      accept_outcome := 'already_accepted';
    else
      accept_outcome := 'locked';
    end if;
  end if;

  id := v_progress.id;
  game_session_id := v_progress.game_session_id;
  contract_id := v_progress.contract_id;
  player_id := v_progress.player_id;
  status := v_progress.status;
  evidence_payload := v_progress.evidence_payload;
  result_payload := v_progress.result_payload;
  submitted_at := v_progress.submitted_at;
  completed_at := v_progress.completed_at;
  reward_issued_at := v_progress.reward_issued_at;
  created_at := v_progress.created_at;
  updated_at := v_progress.updated_at;
  return next;
end;
$$;

revoke all on function public.accept_player_contract(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.accept_player_contract(uuid, uuid, uuid)
  to service_role;

comment on function public.accept_player_contract(uuid, uuid, uuid) is
  'Atomically accepts a currently available contract without regressing concurrent submitted or completed progress.';

commit;
