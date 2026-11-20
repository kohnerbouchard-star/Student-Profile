begin;

do $patch$
declare
  v_definition text;
  v_marker text := 'GAME_PROVISIONING_INTERNAL_FAILURE state=% message=%';
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_provisioned_game_v1'
    and pg_get_function_identity_arguments(p.oid) =
      'p_staff_user_id uuid, p_game_name text, p_game_settings jsonb, p_idempotency_key text, p_pack_id text';

  if v_definition is null then
    raise exception 'GAME_PROVISIONING_FUNCTION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if position(v_marker in v_definition) > 0 then
    return;
  end if;

  if position('exception when others then' in lower(v_definition)) = 0 then
    raise exception 'GAME_PROVISIONING_EXCEPTION_HANDLER_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_definition := replace(
    v_definition,
    'exception when others then',
    E'exception when others then\n    raise log ''GAME_PROVISIONING_INTERNAL_FAILURE state=% message=%'', sqlstate, sqlerrm;'
  );

  execute v_definition;
end;
$patch$;

comment on function public.create_provisioned_game_v1(uuid,text,jsonb,text,text) is
  'Atomic canonical game provisioning. External failure results remain sanitized while the caught SQLSTATE and SQLERRM are emitted only to internal Postgres logs for operations diagnosis.';

commit;
