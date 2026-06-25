-- Demo storyline seed/copy RPC V1.
-- Creates one reusable demo storyline and activates it for one game session.
-- This is non-destructive and does not add schedulers, frontend behavior,
-- realtime channels, direct cash writes, or stock runner changes.

create or replace function public.initialize_demo_storyline_for_game(
  p_game_session_id uuid,
  p_mode text default 'missing_only'
)
returns table (
  game_session_id uuid,
  storyline_key text,
  storyline_events_available integer,
  game_session_storylines_before integer,
  game_session_storylines_inserted integer,
  game_session_storylines_after integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode text := coalesce(nullif(btrim(p_mode), ''), 'missing_only');
  v_storyline_id uuid;
begin
  if p_game_session_id is null then
    raise exception 'DEMO_STORYLINE_GAME_SESSION_REQUIRED';
  end if;

  if v_mode not in ('missing_only', 'reset_empty_only') then
    raise exception 'DEMO_STORYLINE_UNKNOWN_SEED_COPY_MODE';
  end if;

  if not exists (
    select 1
    from public.game_sessions session
    where session.id = p_game_session_id
  ) then
    raise exception 'GAME_SESSION_NOT_FOUND';
  end if;

  select count(*)::integer
  into game_session_storylines_before
  from public.game_session_storylines activation
  join public.storylines storyline
    on storyline.id = activation.storyline_id
  where activation.game_session_id = p_game_session_id
    and lower(storyline.key) = lower('econovaria_demo_act_1');

  if v_mode = 'reset_empty_only' and game_session_storylines_before > 0 then
    raise exception 'DEMO_STORYLINE_RESET_EMPTY_ONLY_CONFLICT';
  end if;

  insert into public.storylines (
    key,
    title,
    description,
    is_active
  )
  values (
    'econovaria_demo_act_1',
    'Econovaria Demo Act I',
    'A small deterministic backend demo storyline for validating market-tick story execution, cutscene delivery, contracts, flags, and cash effects.',
    true
  )
  on conflict (key)
  do update
  set
    title = excluded.title,
    description = excluded.description,
    is_active = true
  returning id into v_storyline_id;

  insert into public.storyline_events (
    storyline_id,
    event_key,
    title,
    description,
    act,
    sequence,
    trigger_type,
    scheduled_market_tick,
    trigger_condition,
    reveal_payload,
    public_news_payload,
    player_rules,
    policy_payloads,
    flag_payloads,
    contract_unlock_payloads,
    priority,
    is_active
  )
  values
    (
      v_storyline_id,
      'act_1_market_briefing',
      'Market Briefing: Shipping Pressure Builds',
      'The first market tick introduces a grounded supply-chain pressure event and rewards active players with a small briefing stipend.',
      1,
      1,
      'market_tick',
      1,
      '{}'::jsonb,
      jsonb_build_object(
        'notificationType', 'story_cutscene',
        'displayMode', 'modal_on_next_login',
        'videoAssetKey', 'econovaria_cutscene_market_briefing_v1',
        'posterAssetKey', 'econovaria_poster_market_briefing_v1',
        'headline', 'Shipping Pressure Builds',
        'summary', 'Insurance costs and port congestion are beginning to affect regional trade flows.',
        'requiresAcknowledgement', false,
        'payload', jsonb_build_object(
          'tone', 'grounded_market_intel',
          'act', 1,
          'sequence', 1
        )
      ),
      jsonb_build_object(
        'headline', 'Regional shipping costs rise',
        'summary', 'Ports report longer clearance times as insurers reprice route risk.',
        'severity', 'medium'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'ruleKey', 'active_player_briefing_stipend',
          'condition', jsonb_build_object(
            'type', 'player_cash_above',
            'amount', 0
          ),
          'effects', jsonb_build_array(
            jsonb_build_object(
              'type', 'cash_credit',
              'amount', 75,
              'label', 'Market briefing stipend',
              'reason', 'You received a small operating stipend after the first market briefing.',
              'payload', jsonb_build_object(
                'source', 'econovaria_demo_act_1',
                'eventKey', 'act_1_market_briefing'
              )
            ),
            jsonb_build_object(
              'type', 'story_flag_set',
              'flagKey', 'demo_act_1_briefing_complete',
              'value', true
            )
          )
        )
      ),
      '[]'::jsonb,
      jsonb_build_array(
        jsonb_build_object(
          'flagKey', 'demo_act_1_briefing_complete',
          'value', true
        )
      ),
      '[]'::jsonb,
      'major',
      true
    ),
    (
      v_storyline_id,
      'act_1_contract_unlock',
      'Contract Unlocked: Supplier Due Diligence',
      'After the briefing flag is set, the storyline unlocks a public contract for market research.',
      1,
      2,
      'condition',
      null,
      jsonb_build_object(
        'type', 'story_flag_equals',
        'flagKey', 'demo_act_1_briefing_complete',
        'value', true
      ),
      jsonb_build_object(
        'notificationType', 'story_cutscene',
        'displayMode', 'modal_on_next_login',
        'videoAssetKey', 'econovaria_cutscene_supplier_due_diligence_v1',
        'posterAssetKey', 'econovaria_poster_supplier_due_diligence_v1',
        'headline', 'Supplier Due Diligence Opened',
        'summary', 'Players can now investigate how port disruption affects market access and supplier reliability.',
        'requiresAcknowledgement', false,
        'payload', jsonb_build_object(
          'tone', 'research_prompt',
          'act', 1,
          'sequence', 2
        )
      ),
      jsonb_build_object(
        'headline', 'Research mandate issued',
        'summary', 'Teams are asked to identify exposure to supply-chain disruption.',
        'severity', 'low'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'ruleKey', 'unlock_supplier_due_diligence_contract',
          'condition', jsonb_build_object(
            'type', 'player_cash_above',
            'amount', 0
          ),
          'effects', jsonb_build_array(
            jsonb_build_object(
              'type', 'contract_unlock',
              'contractKey', 'story_supplier_due_diligence_v1',
              'label', 'Supplier Due Diligence',
              'reason', 'A market disruption created a new research contract.',
              'payload', jsonb_build_object(
                'title', 'Supplier Due Diligence',
                'description', 'Analyze one country or sector exposed to shipping delays and explain the risk to business operations.',
                'instructions', 'Submit a short market note with one risk, one opportunity, and one recommended action.',
                'category', 'market_research',
                'targetingPayload', jsonb_build_object(
                  'scope', 'all_players'
                ),
                'requirementsPayload', jsonb_build_object(
                  'submissionType', 'short_response',
                  'minimumSentences', 4
                ),
                'rewardPayload', jsonb_build_object(
                  'cash', jsonb_build_object(
                    'amount', 150,
                    'currencyCode', 'ECO'
                  )
                ),
                'metadata', jsonb_build_object(
                  'storylineKey', 'econovaria_demo_act_1',
                  'eventKey', 'act_1_contract_unlock'
                )
              )
            )
          )
        )
      ),
      '[]'::jsonb,
      '[]'::jsonb,
      jsonb_build_array(
        jsonb_build_object(
          'contractKey', 'story_supplier_due_diligence_v1'
        )
      ),
      'major',
      true
    ),
    (
      v_storyline_id,
      'act_1_policy_pressure',
      'Policy Shock: Temporary Import Review',
      'A later market tick applies a temporary global immigration-lock style policy as a visible policy-effect smoke test.',
      1,
      3,
      'market_tick',
      2,
      '{}'::jsonb,
      '{}'::jsonb,
      jsonb_build_object(
        'headline', 'Temporary import review begins',
        'summary', 'Regulators are reviewing high-risk shipments after early signs of congestion.',
        'severity', 'medium'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'ruleKey', 'temporary_import_review_policy',
          'condition', jsonb_build_object(
            'type', 'player_cash_above',
            'amount', 0
          ),
          'effects', jsonb_build_array(
            jsonb_build_object(
              'type', 'immigration_lock',
              'policyKey', 'demo_temporary_import_review_v1',
              'durationSeconds', 3600,
              'label', 'Temporary import review',
              'reason', 'Regulators placed a temporary review on cross-border movement.',
              'payload', jsonb_build_object(
                'scopeType', 'global',
                'scopeKey', null,
                'severity', 'moderate',
                'source', 'econovaria_demo_act_1'
              )
            )
          )
        )
      ),
      jsonb_build_array(
        jsonb_build_object(
          'policyKey', 'demo_temporary_import_review_v1',
          'policyType', 'immigration_lock',
          'scopeType', 'global',
          'scopeKey', null,
          'durationSeconds', 3600,
          'payload', jsonb_build_object(
            'severity', 'moderate'
          )
        )
      ),
      '[]'::jsonb,
      '[]'::jsonb,
      'normal',
      true
    )
  on conflict (storyline_id, event_key)
  do update
  set
    title = excluded.title,
    description = excluded.description,
    act = excluded.act,
    sequence = excluded.sequence,
    trigger_type = excluded.trigger_type,
    scheduled_market_tick = excluded.scheduled_market_tick,
    trigger_condition = excluded.trigger_condition,
    reveal_payload = excluded.reveal_payload,
    public_news_payload = excluded.public_news_payload,
    player_rules = excluded.player_rules,
    policy_payloads = excluded.policy_payloads,
    flag_payloads = excluded.flag_payloads,
    contract_unlock_payloads = excluded.contract_unlock_payloads,
    priority = excluded.priority,
    is_active = true;

  select count(*)::integer
  into storyline_events_available
  from public.storyline_events event
  where event.storyline_id = v_storyline_id
    and event.is_active = true;

  with inserted_activation as (
    insert into public.game_session_storylines (
      game_session_id,
      storyline_id,
      status,
      story_started_at,
      accumulated_pause_seconds,
      time_scale
    )
    values (
      p_game_session_id,
      v_storyline_id,
      'active',
      now(),
      0,
      1
    )
    on conflict (game_session_id, storyline_id)
    do nothing
    returning id
  )
  select count(*)::integer
  into game_session_storylines_inserted
  from inserted_activation;

  select count(*)::integer
  into game_session_storylines_after
  from public.game_session_storylines activation
  where activation.game_session_id = p_game_session_id
    and activation.storyline_id = v_storyline_id
    and activation.status = 'active';

  game_session_id := p_game_session_id;
  storyline_key := 'econovaria_demo_act_1';

  return next;
end;
$$;

comment on function public.initialize_demo_storyline_for_game(uuid, text) is
  'Creates the deterministic Econovaria demo storyline content if missing and activates it for one game session. Intended for trusted service-role backend use only.';

revoke all on function public.initialize_demo_storyline_for_game(uuid, text) from public;
grant execute on function public.initialize_demo_storyline_for_game(uuid, text) to service_role;
