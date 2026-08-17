begin;

create or replace function public.rewrite_meridian_story_decision_callback_rules_v1(
  p_event_key text,
  p_rules jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $function$
declare
  v_rule jsonb;
  v_rule_key text;
  v_result jsonb := '[]'::jsonb;
  v_effect jsonb;
  v_payload jsonb;
  v_country_condition jsonb;
  v_option jsonb;
  v_variant jsonb;
  v_prefix text;
  v_character_name text;
  v_all_model_options jsonb := jsonb_build_array(
    'finance_first','multilateral','trade_logistics','industrial_security','hybrid'
  );
  v_model_copy jsonb := jsonb_build_array(
    jsonb_build_object(
      'optionKey','finance_first','suffix','finance_first','title','You put finance first',
      'body','You put finance and investment first. When the system is under pressure, I am going to hold that recommendation against its hardest question: whether fast capital can remain useful without turning speed into concentrated control.'
    ),
    jsonb_build_object(
      'optionKey','multilateral','suffix','multilateral','title','You chose shared governance',
      'body','You chose multilateral governance. When coordination becomes costly, the test will be whether the review rights and shared rules you valued still justify slower action when firms and households are already paying for delay.'
    ),
    jsonb_build_object(
      'optionKey','trade_logistics','suffix','trade_logistics','title','You put movement first',
      'body','You put trade and logistics first. When routes tighten, I will remember that you prioritized movement and throughput; the real test is whether your model still protects redundancy when the efficient route becomes the vulnerable one.'
    ),
    jsonb_build_object(
      'optionKey','industrial_security','suffix','industrial_security','title','You chose resilience',
      'body','You chose industrial security and resilience. When emergency demand arrives, I will remember that you accepted the cost of redundancy; the test is whether strategic capacity stays a safeguard instead of becoming permanent protection for weak decisions.'
    ),
    jsonb_build_object(
      'optionKey','hybrid','suffix','hybrid','title','You chose a hybrid',
      'body','You chose a hybrid. That avoids pretending one institution can solve every problem, but it creates a harder test: when financing, governance, logistics, and resilience conflict, which principle do you actually allow to win?'
    )
  );
  v_status_variants jsonb := jsonb_build_array(
    jsonb_build_object(
      'suffix','commitment',
      'optionKeys',jsonb_build_array('seek_permanent_residency','seek_citizenship_if_eligible'),
      'append',' You told your sponsor that you intend to pursue a durable future here if the legal system allows it. That makes these tradeoffs part of a future you are choosing, not only paperwork you are surviving.'
    ),
    jsonb_build_object(
      'suffix','temporary_or_deferred',
      'optionKeys',jsonb_build_array('remain_temporary','defer'),
      'append',' You are keeping the long-term future open rather than making a permanent commitment. Be careful that institutions and people do not plan around a promise you have not actually made.'
    ),
    jsonb_build_object(
      'suffix','relocate',
      'optionKeys',jsonb_build_array('relocate'),
      'append',' You told your sponsor that you are preparing to relocate. That does not erase what this place has meant; it changes which obligations you should carry forward and which commitments you should stop implying.'
    )
  );
  v_all_status_options jsonb := jsonb_build_array(
    'remain_temporary','seek_permanent_residency','seek_citizenship_if_eligible','relocate','defer'
  );
begin
  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then
    return coalesce(p_rules, '[]'::jsonb);
  end if;

  if p_event_key = 'meridian_competing_models_recommendation_followup' then
    for v_rule in select value from jsonb_array_elements(p_rules)
    loop
      v_rule_key := coalesce(v_rule ->> 'ruleKey', '');

      if v_rule_key like '%_competing_models_recommendation_recorded' then
        v_effect := coalesce(v_rule -> 'effects' -> 0, '{}'::jsonb);
        v_payload := coalesce(v_effect -> 'payload', '{}'::jsonb);
        v_country_condition := coalesce(v_rule #> '{condition,all,0}', '{}'::jsonb);
        v_character_name := coalesce(v_effect ->> 'characterName', 'Your sponsor');
        v_prefix := replace(v_rule_key, '_competing_models_recommendation_recorded', '');

        for v_option in select value from jsonb_array_elements(v_model_copy)
        loop
          v_result := v_result || jsonb_build_array(
            jsonb_build_object(
              'ruleKey', v_prefix || '_competing_models_recommendation_' || (v_option ->> 'suffix'),
              'condition', jsonb_build_object(
                'all', jsonb_build_array(
                  v_country_condition,
                  jsonb_build_object(
                    'type','player_story_decision_in',
                    'decisionKey','meridian_model_recommendation',
                    'optionKeys',jsonb_build_array(v_option ->> 'optionKey')
                  )
                )
              ),
              'effects', jsonb_build_array(
                v_effect || jsonb_build_object(
                  'title', v_character_name || ' — ' || (v_option ->> 'title'),
                  'body', v_option ->> 'body',
                  'payload', v_payload || jsonb_build_object(
                    'branch','recommendation_' || (v_option ->> 'suffix'),
                    'decisionKey','meridian_model_recommendation',
                    'optionKey',v_option ->> 'optionKey',
                    'semanticMemoryCallback',true,
                    'completionReviewIndependent',true
                  )
                )
              )
            )
          );
        end loop;

      elsif v_rule_key like '%_competing_models_recommendation_open' then
        v_effect := coalesce(v_rule -> 'effects' -> 0, '{}'::jsonb);
        v_payload := coalesce(v_effect -> 'payload', '{}'::jsonb);
        v_country_condition := coalesce(v_rule #> '{condition,all,0}', '{}'::jsonb);
        v_prefix := replace(v_rule_key, '_competing_models_recommendation_open', '');

        v_result := v_result || jsonb_build_array(
          jsonb_build_object(
            'ruleKey', v_prefix || '_competing_models_recommendation_pending',
            'condition', jsonb_build_object(
              'all', jsonb_build_array(
                v_country_condition,
                jsonb_build_object(
                  'not', jsonb_build_object(
                    'type','player_story_decision_in',
                    'decisionKey','meridian_model_recommendation',
                    'optionKeys',v_all_model_options
                  )
                )
              )
            ),
            'effects', jsonb_build_array(
              v_effect || jsonb_build_object(
                'payload', v_payload || jsonb_build_object(
                  'branch','recommendation_pending',
                  'decisionKey','meridian_model_recommendation',
                  'semanticMemoryCallback',true,
                  'decisionPending',true
                )
              )
            )
          )
        );
      else
        v_result := v_result || jsonb_build_array(v_rule);
      end if;
    end loop;

    return v_result;
  end if;

  if p_event_key = 'meridian_local_friend_belonging_reactions' then
    for v_rule in select value from jsonb_array_elements(p_rules)
    loop
      v_rule_key := coalesce(v_rule ->> 'ruleKey', '');

      if v_rule_key like '%_local_friend_belonging_engaged'
        or v_rule_key like '%_local_friend_belonging_waiting'
      then
        v_effect := coalesce(v_rule -> 'effects' -> 0, '{}'::jsonb);
        v_payload := coalesce(v_effect -> 'payload', '{}'::jsonb);

        for v_variant in select value from jsonb_array_elements(v_status_variants)
        loop
          v_result := v_result || jsonb_build_array(
            jsonb_build_object(
              'ruleKey', v_rule_key || '_' || (v_variant ->> 'suffix'),
              'condition', jsonb_build_object(
                'all', jsonb_build_array(
                  v_rule -> 'condition',
                  jsonb_build_object(
                    'type','player_story_decision_in',
                    'decisionKey','long_term_status_intent',
                    'optionKeys',v_variant -> 'optionKeys'
                  )
                )
              ),
              'effects', jsonb_build_array(
                v_effect || jsonb_build_object(
                  'body', coalesce(v_effect ->> 'body', '') || (v_variant ->> 'append'),
                  'payload', v_payload || jsonb_build_object(
                    'decisionKey','long_term_status_intent',
                    'statusIntentBranch',v_variant ->> 'suffix',
                    'semanticMemoryCallback',true
                  )
                )
              )
            )
          );
        end loop;

        v_result := v_result || jsonb_build_array(
          jsonb_build_object(
            'ruleKey', v_rule_key || '_undecided',
            'condition', jsonb_build_object(
              'all', jsonb_build_array(
                v_rule -> 'condition',
                jsonb_build_object(
                  'not', jsonb_build_object(
                    'type','player_story_decision_in',
                    'decisionKey','long_term_status_intent',
                    'optionKeys',v_all_status_options
                  )
                )
              )
            ),
            'effects', jsonb_build_array(
              v_effect || jsonb_build_object(
                'payload', v_payload || jsonb_build_object(
                  'decisionKey','long_term_status_intent',
                  'statusIntentBranch','undecided',
                  'semanticMemoryCallback',true
                )
              )
            )
          )
        );
      else
        v_result := v_result || jsonb_build_array(v_rule);
      end if;
    end loop;

    return v_result;
  end if;

  return p_rules;
end;
$function$;

create or replace function public.harden_meridian_story_decision_callbacks_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.event_key in (
    'meridian_competing_models_recommendation_followup',
    'meridian_local_friend_belonging_reactions'
  ) then
    new.player_rules := public.rewrite_meridian_story_decision_callback_rules_v1(
      new.event_key,
      coalesce(new.player_rules, '[]'::jsonb)
    );
  end if;
  return new;
end;
$function$;

revoke all on function public.rewrite_meridian_story_decision_callback_rules_v1(text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.harden_meridian_story_decision_callbacks_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists harden_meridian_story_decision_callbacks_v1 on public.storyline_events;
create trigger harden_meridian_story_decision_callbacks_v1
before insert or update of player_rules on public.storyline_events
for each row
when (
  new.event_key = 'meridian_competing_models_recommendation_followup'
  or new.event_key = 'meridian_local_friend_belonging_reactions'
)
execute function public.harden_meridian_story_decision_callbacks_v1();

-- Reassigning the current rule JSON invokes the BEFORE trigger once. The
-- generated rule keys deliberately no longer match the legacy suffixes, so
-- repeating this statement is idempotent and does not duplicate callbacks.
update public.storyline_events as event_row
set player_rules = event_row.player_rules
from public.storylines as storyline_row
where storyline_row.id = event_row.storyline_id
  and lower(storyline_row.key) = lower('econovaria_demo_act_1')
  and event_row.event_key in (
    'meridian_competing_models_recommendation_followup',
    'meridian_local_friend_belonging_reactions'
  );

comment on function public.rewrite_meridian_story_decision_callback_rules_v1(text, jsonb) is
  'Upgrades Meridian callbacks from completion/reply-only memory to deterministic semantic Story decisions. Stage 2 remembers the exact governance model; Stage 9 local friends react to the player long-term status intent while preserving an undecided fallback.';

commit;
