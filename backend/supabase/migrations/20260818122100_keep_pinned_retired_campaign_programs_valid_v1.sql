begin;

do $patch$
declare
  v_definition text;
  v_old text := E'and program_row.definition_digest=campaign_row.definition_digest and program_row.status=''active''';
  v_new text := E'and program_row.definition_digest=campaign_row.definition_digest';
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'verify_provisioned_game_v1'
    and pg_get_function_identity_arguments(p.oid) =
      'p_game_session_id uuid, p_staff_user_id uuid';

  if v_definition is null then
    raise exception 'GAME_PROVISIONING_VERIFIER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if position(v_old in v_definition) = 0 then
    if position('program_row.definition_digest=campaign_row.definition_digest' in v_definition) > 0
       and position('program_row.status=''active''' in v_definition) = 0
    then
      return;
    end if;
    raise exception 'CAMPAIGN_VERIFIER_PROGRAM_STATUS_PATTERN_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end;
$patch$;

comment on function public.verify_provisioned_game_v1(uuid,uuid) is
  'Verifies full-game readiness including one digest-pinned Campaign. A pinned immutable program remains valid if later retired from new-game selection.';

commit;
