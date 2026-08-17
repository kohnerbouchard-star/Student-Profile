begin;

-- Preserve the historical completion-only ending semantics only for games in
-- which a player had already completed the old free-response status Contract
-- before structured Story decisions existed. New campaigns receive no legacy
-- flag and therefore must satisfy the semantic decision predicate below.
insert into public.game_session_story_flags (
  game_session_id,
  flag_key,
  value,
  source_story_event_id,
  created_at
)
select distinct
  contract_row.game_session_id,
  'meridian_story_decision_mode_v1',
  to_jsonb('legacy_completion'::text),
  null,
  now()
from public.game_session_contracts as contract_row
join public.player_contract_progress as progress_row
  on progress_row.game_session_id = contract_row.game_session_id
 and progress_row.contract_id = contract_row.id
where contract_row.contract_key = 'contract.meridian.belonging-long-term-status-decision.v1'
  and progress_row.status in ('completed','approved')
on conflict (game_session_id, flag_key) do nothing;

create or replace function public.rewrite_meridian_long_term_status_condition_v1(
  p_value jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $function$
declare
  v_key text;
  v_child jsonb;
  v_result jsonb;
begin
  if p_value is null then
    return null;
  end if;

  if jsonb_typeof(p_value) = 'object' then
    if p_value ->> 'type' = 'player_completed_contract'
      and p_value ->> 'contractKey' = 'contract.meridian.belonging-long-term-status-decision.v1'
    then
      return jsonb_build_object(
        'any', jsonb_build_array(
          jsonb_build_object(
            'type', 'player_story_decision_in',
            'decisionKey', 'long_term_status_intent',
            'optionKeys', jsonb_build_array(
              'seek_permanent_residency',
              'seek_citizenship_if_eligible'
            )
          ),
          jsonb_build_object(
            'all', jsonb_build_array(
              jsonb_build_object(
                'type', 'story_flag_equals',
                'flagKey', 'meridian_story_decision_mode_v1',
                'value', 'legacy_completion'
              ),
              p_value
            )
          )
        )
      );
    end if;

    v_result := '{}'::jsonb;
    for v_key, v_child in select key, value from jsonb_each(p_value)
    loop
      v_result := v_result || jsonb_build_object(
        v_key,
        public.rewrite_meridian_long_term_status_condition_v1(v_child)
      );
    end loop;
    return v_result;
  end if;

  if jsonb_typeof(p_value) = 'array' then
    select coalesce(
      jsonb_agg(public.rewrite_meridian_long_term_status_condition_v1(value) order by ordinality),
      '[]'::jsonb
    )
    into v_result
    from jsonb_array_elements(p_value) with ordinality as item(value, ordinality);
    return v_result;
  end if;

  return p_value;
end;
$function$;

create or replace function public.harden_meridian_reckoning_decisions_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.event_key = 'meridian_reckoning' then
    new.player_rules := public.rewrite_meridian_long_term_status_condition_v1(
      coalesce(new.player_rules, '[]'::jsonb)
    );
  end if;
  return new;
end;
$function$;

revoke all on function public.rewrite_meridian_long_term_status_condition_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.harden_meridian_reckoning_decisions_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists harden_meridian_reckoning_decisions_v1 on public.storyline_events;
create trigger harden_meridian_reckoning_decisions_v1
before insert or update of player_rules on public.storyline_events
for each row
when (new.event_key = 'meridian_reckoning')
execute function public.harden_meridian_reckoning_decisions_v1();

-- The trigger makes this idempotent even if a Story initializer later rewrites
-- the shared Stage 10 definition from its source migration.
update public.storyline_events as event_row
set player_rules = event_row.player_rules
from public.storylines as storyline_row
where storyline_row.id = event_row.storyline_id
  and lower(storyline_row.key) = lower('econovaria_demo_act_1')
  and event_row.event_key = 'meridian_reckoning';

comment on function public.rewrite_meridian_long_term_status_condition_v1(jsonb) is
  'Requires a deterministic permanent-residency/citizenship intent for Stage 10 Builder/Citizen commitment predicates. Only games with a pre-cutover completed legacy Contract may retain the historical completion fallback; relocate, defer, and temporary choices do not qualify in structured campaigns.';

commit;
