begin;

create or replace function public.initialize_northreach_character_opening_v1(
  p_game_session_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_storyline_id uuid;
begin
  if p_game_session_id is null or not exists (
    select 1 from public.game_sessions g where g.id = p_game_session_id
  ) then
    raise exception 'NORTHREACH_STORY_GAME_NOT_FOUND' using errcode = 'P0001';
  end if;

  select storyline_row.id into v_storyline_id
  from public.storylines as storyline_row
  where lower(storyline_row.key) = lower('econovaria_demo_act_1')
    and storyline_row.is_active
  limit 1;

  if v_storyline_id is null then
    perform 1
    from public.initialize_demo_storyline_for_game(
      p_game_session_id,
      'missing_only'
    );

    select storyline_row.id into v_storyline_id
    from public.storylines as storyline_row
    where lower(storyline_row.key) = lower('econovaria_demo_act_1')
      and storyline_row.is_active
    limit 1;
  end if;

  if v_storyline_id is null then
    raise exception 'NORTHREACH_CANONICAL_STORYLINE_MISSING' using errcode = 'P0001';
  end if;

  insert into public.storyline_events (
    storyline_id, event_key, title, description, act, sequence,
    trigger_type, scheduled_offset_seconds, trigger_condition,
    reveal_payload, public_news_payload, player_rules,
    policy_payloads, flag_payloads, contract_unlock_payloads,
    priority, is_active
  ) values
  (
    v_storyline_id,
    'arrival_edda_housing_window',
    'Edda Veyr: Housing Window',
    'The player sponsor establishes the immediate housing and reporting stake.',
    1, 10, 'elapsed_time', 0, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'ruleKey', 'northreach_current_resident_edda_arrival',
      'condition', jsonb_build_object('type', 'player_current_country_is', 'countryCode', 'NORTHREACH'),
      'effects', jsonb_build_array(
        jsonb_build_object(
          'type', 'character_message',
          'characterKey', 'character.northreach.edda-veyr.v1',
          'characterName', 'Edda Veyr',
          'conversationKey', 'relationship.northreach.edda-veyr.v1',
          'title', 'Edda Veyr — Housing window',
          'body', 'You made it to Frostgate. Your temporary housing hold expires soon, so verify the address before you pay anyone. Send me a reply once you have the lease terms. I can check whether the employer paperwork matches what the settlement office has on file.',
          'allowPlayerReplies', true,
          'payload', jsonb_build_object('phase', 'arrival', 'relationshipRole', 'sponsor', 'messageStableId', 'message.arrival.northreach.welcome.v1')
        )
      )
    )),
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'major', true
  ),
  (
    v_storyline_id,
    'arrival_jonis_first_shift',
    'Jonis Hale: First Shift Advice',
    'The local friend introduces worker conditions and a second view of the boom.',
    1, 11, 'elapsed_time', 900, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'ruleKey', 'northreach_current_resident_jonis_arrival',
      'condition', jsonb_build_object('type', 'player_current_country_is', 'countryCode', 'NORTHREACH'),
      'effects', jsonb_build_array(jsonb_build_object(
        'type', 'character_message',
        'characterKey', 'character.northreach.jonis-hale.v1',
        'characterName', 'Jonis Hale',
        'conversationKey', 'relationship.northreach.jonis-hale.v1',
        'title', 'Jonis Hale — Before you take a shift',
        'body', 'Edda said you are new. The wages look good because the corridor is pulling everyone north, but ask what the rotation actually costs you in transport and housing. If you get two offers, send me the terms. I will tell you which one is hiding overtime behind the headline rate.',
        'allowPlayerReplies', true,
        'payload', jsonb_build_object('phase', 'arrival', 'relationshipRole', 'local_friend')
      ))
    )),
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'normal', true
  ),
  (
    v_storyline_id,
    'arrival_mares_fast_money',
    'Mares Kovan: Fast Money',
    'The rival peer introduces a risk-seeking wealth strategy without prescribing it.',
    1, 12, 'elapsed_time', 1800, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'ruleKey', 'northreach_current_resident_mares_arrival',
      'condition', jsonb_build_object('type', 'player_current_country_is', 'countryCode', 'NORTHREACH'),
      'effects', jsonb_build_array(jsonb_build_object(
        'type', 'character_message',
        'characterKey', 'character.northreach.mares-kovan.v1',
        'characterName', 'Mares Kovan',
        'conversationKey', 'relationship.northreach.mares-kovan.v1',
        'title', 'Mares Kovan — The boom will not wait',
        'body', 'Everyone here is acting like the corridor will expand forever. That is exactly why there is money to make before the cautious people finish their forms. I am tracking mineral and freight exposure tonight. If you want in, tell me whether you care more about steady income or upside.',
        'allowPlayerReplies', true,
        'payload', jsonb_build_object('phase', 'arrival', 'relationshipRole', 'rival_peer')
      ))
    )),
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'normal', true
  ),
  (
    v_storyline_id,
    'arrival_rian_worker_channel',
    'Rian Kest: Worker Channel',
    'The labor gatekeeper establishes a fair-employment path and future solidarity stake.',
    1, 13, 'elapsed_time', 3600, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'ruleKey', 'northreach_current_resident_rian_arrival',
      'condition', jsonb_build_object('type', 'player_current_country_is', 'countryCode', 'NORTHREACH'),
      'effects', jsonb_build_array(jsonb_build_object(
        'type', 'character_message',
        'characterKey', 'character.northreach.rian-kest.v1',
        'characterName', 'Rian Kest',
        'conversationKey', 'relationship.northreach.rian-kest.v1',
        'title', 'Rian Kest — Verify the contract',
        'body', 'Before you sign strategic-industry work, compare the base rate, housing deduction, rotation schedule, and the clause that controls reassignment. New arrivals are being offered real opportunities, but some employers are using urgency to shift risk onto workers. If you want a second set of eyes, send the terms that matter.',
        'allowPlayerReplies', true,
        'payload', jsonb_build_object('phase', 'arrival', 'relationshipRole', 'gatekeeper')
      ))
    )),
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'normal', true
  )
  on conflict (storyline_id, event_key) do update
    set title = excluded.title,
        description = excluded.description,
        act = excluded.act,
        sequence = excluded.sequence,
        trigger_type = excluded.trigger_type,
        scheduled_offset_seconds = excluded.scheduled_offset_seconds,
        trigger_condition = excluded.trigger_condition,
        reveal_payload = excluded.reveal_payload,
        public_news_payload = excluded.public_news_payload,
        player_rules = excluded.player_rules,
        policy_payloads = excluded.policy_payloads,
        flag_payloads = excluded.flag_payloads,
        contract_unlock_payloads = excluded.contract_unlock_payloads,
        priority = excluded.priority,
        is_active = true;

  return v_storyline_id;
end;
$function$;

create or replace function public.activate_northreach_character_story_from_full_game_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.story_status = 'active' then
    perform public.initialize_northreach_character_opening_v1(new.game_session_id);
  end if;
  return new;
end;
$function$;

create trigger activate_northreach_character_story_from_full_game_v1
after insert or update of story_status on public.game_feature_activation_evidence
for each row
when (new.story_status = 'active')
execute function public.activate_northreach_character_story_from_full_game_v1();

revoke all on function public.initialize_northreach_character_opening_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.initialize_northreach_character_opening_v1(uuid)
  to service_role;

commit;
