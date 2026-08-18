begin;

do $patch$
declare
  v_definition text;
  v_old text := E'and p.definition_digest=c.definition_digest and p.status=''active''';
  v_new text := E'and p.definition_digest=c.definition_digest';
begin
  select pg_get_functiondef(proc.oid)
  into v_definition
  from pg_proc proc
  join pg_namespace n on n.oid = proc.pronamespace
  where n.nspname = 'public'
    and proc.proname = 'verify_provisioned_game_v1'
    and pg_get_function_identity_arguments(proc.oid) =
      'p_game_session_id uuid, p_staff_user_id uuid';

  if v_definition is null then
    raise exception 'GAME_PROVISIONING_VERIFIER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if position(v_old in v_definition) = 0 then
    if position('p.definition_digest=c.definition_digest' in v_definition) > 0
       and position('p.status=''active''' in v_definition) = 0
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
