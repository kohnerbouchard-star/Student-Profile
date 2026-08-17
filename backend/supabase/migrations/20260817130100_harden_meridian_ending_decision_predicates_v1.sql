begin;

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
        'type', 'player_story_decision_in',
        'decisionKey', 'long_term_status_intent',
        'optionKeys', jsonb_build_array(
          'seek_permanent_residency',
          'seek_citizenship_if_eligible'
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

update public.storyline_events as event_row
set player_rules = public.rewrite_meridian_long_term_status_condition_v1(
  coalesce(event_row.player_rules, '[]'::jsonb)
)
from public.storylines as storyline_row
where storyline_row.id = event_row.storyline_id
  and lower(storyline_row.key) = lower('econovaria_demo_act_1')
  and event_row.event_key = 'meridian_reckoning';

comment on function public.rewrite_meridian_long_term_status_condition_v1(jsonb) is
  'Rewrites the Stage 10 long-term-status completion predicate to require a deterministic local long-term commitment decision. Relocate, defer, and temporary-only choices therefore cannot qualify Builder/Citizen identity branches merely by completing the Contract.';

commit;
