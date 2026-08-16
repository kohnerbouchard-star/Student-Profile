begin;

insert into public.staff_users (
  id, supabase_auth_user_id, email, display_name
) values (
  '71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000002',
  'contract-story-flag-acceptance@example.test',
  'Contract Story Flag Acceptance'
);

insert into public.game_sessions (
  id, owner_staff_user_id, name, status
) values (
  '71000000-0000-4000-8000-000000000010',
  '71000000-0000-4000-8000-000000000001',
  'Contract Story Flag Acceptance',
  'active'
);

insert into public.players (
  id, game_session_id, display_name, status
) values (
  '71000000-0000-4000-8000-000000000020',
  '71000000-0000-4000-8000-000000000010',
  'Acceptance Player',
  'active'
);

insert into public.storylines (
  id, key, title, description, is_active
) values (
  '71000000-0000-4000-8000-000000000030',
  'contract_story_flag_acceptance_v1',
  'Contract Story Flag Acceptance',
  'Rollback-only acceptance fixture.',
  true
);

insert into public.storyline_events (
  id, storyline_id, event_key, title, description, act, sequence,
  trigger_type, scheduled_offset_seconds, priority, is_active
) values (
  '71000000-0000-4000-8000-000000000031',
  '71000000-0000-4000-8000-000000000030',
  'contract_story_flag_acceptance_event',
  'Contract Story Flag Acceptance Event',
  'Rollback-only acceptance fixture.',
  1,
  1,
  'elapsed_time',
  0,
  'normal',
  true
);

insert into public.game_session_contracts (
  id, game_session_id, contract_key, source_type, source_id,
  title, description, instructions, category, status, visibility,
  targeting_payload, requirements_payload, reward_payload,
  completion_mode, published_at, metadata
) values (
  '71000000-0000-4000-8000-000000000040',
  '71000000-0000-4000-8000-000000000010',
  'contract.story-flag-acceptance.v1',
  'story_event',
  '71000000-0000-4000-8000-000000000031',
  'Contract Story Flag Acceptance',
  'Tests money and Story flags in one reward plan.',
  'Complete the rollback-only acceptance.',
  'story',
  'active',
  'public',
  '{"allPlayers":true}'::jsonb,
  '{}'::jsonb,
  '{"checking":{"amount":275,"currencyMode":"global_eco","currencyCode":"ECO"},"storyFlagsToSet":[{"flagKey":"meridian_contract_complete_v1","value":true},{"flagKey":"meridian_contract_review_state_v1","value":"reviewed"}]}'::jsonb,
  'manual_review',
  clock_timestamp(),
  '{}'::jsonb
);

insert into public.player_contract_progress (
  id, game_session_id, contract_id, player_id, status, completed_at
) values (
  '71000000-0000-4000-8000-000000000050',
  '71000000-0000-4000-8000-000000000010',
  '71000000-0000-4000-8000-000000000040',
  '71000000-0000-4000-8000-000000000020',
  'completed',
  clock_timestamp()
);

do $acceptance$
declare
  first_result record;
  replay_result record;
  ledger_count integer;
  flag_count integer;
  issuance_count integer;
  conflict_seen boolean := false;
begin
  select * into first_result
  from public.issue_contract_rewards_atomic_v1(
    '71000000-0000-4000-8000-000000000010',
    '71000000-0000-4000-8000-000000000040',
    '71000000-0000-4000-8000-000000000050',
    '71000000-0000-4000-8000-000000000001',
    'contract-story-flag-acceptance-first'
  );

  if not first_result.reward_issued or first_result.already_issued then
    raise exception 'CONTRACT_STORY_FLAG_FIRST_ISSUE_FAILED:%', row_to_json(first_result);
  end if;

  if first_result.reward_result ->> 'status' <> 'applied'
    or jsonb_array_length(first_result.reward_result -> 'appliedRewards') <> 3
  then
    raise exception 'CONTRACT_STORY_FLAG_RESULT_INVALID:%', first_result.reward_result;
  end if;

  select count(*) into ledger_count
  from public.ledger_entries
  where game_session_id = '71000000-0000-4000-8000-000000000010'
    and player_id = '71000000-0000-4000-8000-000000000020'
    and source_domain = 'contracts'
    and source_action = 'contract_reward_cash'
    and source_id = '71000000-0000-4000-8000-000000000050';

  select count(*) into flag_count
  from public.game_session_story_flags
  where game_session_id = '71000000-0000-4000-8000-000000000010'
    and flag_key in (
      'meridian_contract_complete_v1',
      'meridian_contract_review_state_v1'
    );

  select count(*) into issuance_count
  from public.contract_reward_issuances
  where game_session_id = '71000000-0000-4000-8000-000000000010'
    and progress_id = '71000000-0000-4000-8000-000000000050';

  if ledger_count <> 1 or flag_count <> 2 or issuance_count <> 1 then
    raise exception 'CONTRACT_STORY_FLAG_WRITES_INVALID:ledger=% flags=% issuance=%',
      ledger_count, flag_count, issuance_count;
  end if;

  select * into replay_result
  from public.issue_contract_rewards_atomic_v1(
    '71000000-0000-4000-8000-000000000010',
    '71000000-0000-4000-8000-000000000040',
    '71000000-0000-4000-8000-000000000050',
    '71000000-0000-4000-8000-000000000001',
    'contract-story-flag-acceptance-replay'
  );

  if replay_result.reward_issued or not replay_result.already_issued then
    raise exception 'CONTRACT_STORY_FLAG_REPLAY_FAILED:%', row_to_json(replay_result);
  end if;

  if (select count(*) from public.ledger_entries
      where game_session_id = '71000000-0000-4000-8000-000000000010'
        and source_id = '71000000-0000-4000-8000-000000000050') <> 1
    or (select count(*) from public.contract_reward_issuances
        where game_session_id = '71000000-0000-4000-8000-000000000010'
          and progress_id = '71000000-0000-4000-8000-000000000050') <> 1
  then
    raise exception 'CONTRACT_STORY_FLAG_REPLAY_DUPLICATED_WRITES';
  end if;

  update public.game_session_contracts
  set reward_payload = jsonb_set(
    reward_payload,
    '{storyFlagsToSet,0,value}',
    'false'::jsonb
  )
  where id = '71000000-0000-4000-8000-000000000040';

  begin
    perform *
    from public.issue_contract_rewards_atomic_v1(
      '71000000-0000-4000-8000-000000000010',
      '71000000-0000-4000-8000-000000000040',
      '71000000-0000-4000-8000-000000000050',
      '71000000-0000-4000-8000-000000000001',
      'contract-story-flag-acceptance-conflict'
    );
  exception when others then
    conflict_seen := position('CONTRACT_REWARD_IDEMPOTENCY_CONFLICT' in sqlerrm) > 0;
  end;

  if not conflict_seen then
    raise exception 'CONTRACT_STORY_FLAG_DIVERGENT_REPLAY_NOT_REJECTED';
  end if;
end;
$acceptance$;

insert into public.game_session_contracts (
  id, game_session_id, contract_key, source_type,
  title, description, instructions, category, status, visibility,
  targeting_payload, requirements_payload, reward_payload,
  completion_mode, published_at, metadata
) values (
  '71000000-0000-4000-8000-000000000041',
  '71000000-0000-4000-8000-000000000010',
  'contract.story-flag-duplicate.v1',
  'system',
  'Duplicate Story Flag',
  'Must fail before any reward write.',
  'Rollback-only acceptance fixture.',
  'story',
  'active',
  'public',
  '{"allPlayers":true}'::jsonb,
  '{}'::jsonb,
  '{"checking":{"amount":125,"currencyMode":"global_eco","currencyCode":"ECO"},"storyFlagsToSet":[{"flagKey":"duplicate_flag_v1","value":true},{"flagKey":"duplicate_flag_v1","value":false}]}'::jsonb,
  'manual_review',
  clock_timestamp(),
  '{}'::jsonb
);

insert into public.player_contract_progress (
  id, game_session_id, contract_id, player_id, status, completed_at
) values (
  '71000000-0000-4000-8000-000000000051',
  '71000000-0000-4000-8000-000000000010',
  '71000000-0000-4000-8000-000000000041',
  '71000000-0000-4000-8000-000000000020',
  'completed',
  clock_timestamp()
);

do $negative$
declare
  duplicate_seen boolean := false;
begin
  begin
    perform *
    from public.issue_contract_rewards_atomic_v1(
      '71000000-0000-4000-8000-000000000010',
      '71000000-0000-4000-8000-000000000041',
      '71000000-0000-4000-8000-000000000051',
      '71000000-0000-4000-8000-000000000001',
      'contract-story-flag-duplicate'
    );
  exception when others then
    duplicate_seen := position('CONTRACT_REWARD_STORY_FLAG_DUPLICATE' in sqlerrm) > 0;
  end;

  if not duplicate_seen then
    raise exception 'CONTRACT_STORY_FLAG_DUPLICATE_NOT_REJECTED';
  end if;

  if exists (
    select 1 from public.ledger_entries
    where game_session_id = '71000000-0000-4000-8000-000000000010'
      and source_id = '71000000-0000-4000-8000-000000000051'
  ) or exists (
    select 1 from public.contract_reward_issuances
    where game_session_id = '71000000-0000-4000-8000-000000000010'
      and progress_id = '71000000-0000-4000-8000-000000000051'
  ) then
    raise exception 'CONTRACT_STORY_FLAG_INVALID_PLAN_PARTIALLY_APPLIED';
  end if;
end;
$negative$;

rollback;
