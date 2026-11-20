begin;

create table if not exists private.game_provisioning_failure_log (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.game_creation_provisioning_requests(id) on delete cascade,
  sqlstate text not null,
  error_message text not null,
  occurred_at timestamptz not null default clock_timestamp(),
  constraint game_provisioning_failure_log_sqlstate_valid
    check (sqlstate ~ '^[0-9A-Z]{5}$'),
  constraint game_provisioning_failure_log_message_bounded
    check (length(error_message) between 1 and 2000)
);

create index if not exists game_provisioning_failure_log_request_idx
  on private.game_provisioning_failure_log(request_id, occurred_at desc);

revoke all on table private.game_provisioning_failure_log
  from public, anon, authenticated;
grant select on table private.game_provisioning_failure_log
  to service_role;

do $patch$
declare
  v_definition text;
  v_existing text := E'raise log ''GAME_PROVISIONING_INTERNAL_FAILURE state=% message=%'', sqlstate, sqlerrm;';
  v_replacement text := E'raise log ''GAME_PROVISIONING_INTERNAL_FAILURE state=% message=%'', sqlstate, sqlerrm;\n    insert into private.game_provisioning_failure_log (request_id, sqlstate, error_message)\n    values (v_request.id, sqlstate, left(sqlerrm, 2000));';
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

  if position('private.game_provisioning_failure_log' in v_definition) > 0 then
    return;
  end if;

  if position(v_existing in v_definition) = 0 then
    raise exception 'GAME_PROVISIONING_OBSERVABILITY_MARKER_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_definition := replace(v_definition, v_existing, v_replacement);
  execute v_definition;
end;
$patch$;

comment on table private.game_provisioning_failure_log is
  'Internal-only diagnostics for caught atomic game-provisioning failures. Client responses remain sanitized; service-role operations may inspect SQLSTATE and bounded SQLERRM by idempotency request.';

commit;
