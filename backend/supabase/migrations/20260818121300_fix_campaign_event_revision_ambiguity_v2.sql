begin;

do $repair$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'execute_campaign_event_atomic_v2'
    and pg_get_function_identity_arguments(p.oid) =
      'p_game_session_id uuid, p_campaign_public_id text, p_expected_revision bigint, p_event_key text, p_trigger_key text, p_expected_phase text, p_next_phase text, p_complete_campaign boolean, p_prerequisite_event_keys jsonb, p_effect_commands jsonb, p_next_scheduled_at timestamp with time zone, p_actor_staff_user_id uuid, p_reason text, p_occurred_at timestamp with time zone';

  if v_definition is null
     or position('update public.campaign_instances' in v_definition) = 0
     or position('revision = revision + 1' in v_definition) = 0
  then
    raise exception 'CAMPAIGN_EVENT_FUNCTION_REPAIR_PATTERN_MISSING'
      using errcode = 'P0001';
  end if;

  v_definition := replace(
    v_definition,
    'update public.campaign_instances',
    'update public.campaign_instances as campaign_target'
  );
  v_definition := replace(
    v_definition,
    'revision = revision + 1',
    'revision = campaign_target.revision + 1'
  );

  execute v_definition;

  if position('campaign_target.revision + 1' in v_definition) = 0 then
    raise exception 'CAMPAIGN_EVENT_FUNCTION_REPAIR_FAILED'
      using errcode = 'P0001';
  end if;
end;
$repair$;

comment on function public.execute_campaign_event_atomic_v2(
  uuid,text,bigint,text,text,text,text,boolean,jsonb,jsonb,timestamptz,uuid,text,timestamptz
) is 'Atomically records one campaign event transition and durable effect commands. The revision increment is target-qualified to avoid PL/pgSQL output-column ambiguity.';

commit;
