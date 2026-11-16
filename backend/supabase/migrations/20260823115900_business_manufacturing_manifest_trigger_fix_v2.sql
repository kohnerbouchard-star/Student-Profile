-- Business V2 Phase 6: harden deferred manifest trigger dispatch.
--
-- A polymorphic trigger record must not dereference job_id when the trigger is
-- attached to business_manufacturing_jobs. Resolve the target identifier through
-- JSONB so each table shape remains valid at deferred-trigger execution time.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function economy_private.validate_business_manufacturing_manifest_trigger_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
declare
  v_record jsonb;
  v_game_session_id uuid;
  v_job_id uuid;
begin
  v_record := case
    when tg_op = 'DELETE' then to_jsonb(old)
    else to_jsonb(new)
  end;

  begin
    v_game_session_id := nullif(v_record ->> 'game_session_id', '')::uuid;
    v_job_id := nullif(
      case
        when tg_table_name = 'business_manufacturing_jobs'
          then v_record ->> 'id'
        else v_record ->> 'job_id'
      end,
      ''
    )::uuid;
  exception
    when invalid_text_representation then
      raise exception 'BUSINESS_MANUFACTURING_MANIFEST_TRIGGER_SCOPE_INVALID'
        using errcode = 'P0001';
  end;

  if v_game_session_id is null or v_job_id is null then
    raise exception 'BUSINESS_MANUFACTURING_MANIFEST_TRIGGER_SCOPE_INVALID'
      using errcode = 'P0001';
  end if;

  perform economy_private.validate_business_manufacturing_resource_manifest_v2(
    v_game_session_id,
    v_job_id
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

revoke all on function economy_private.validate_business_manufacturing_manifest_trigger_v2()
  from public, anon, authenticated;

commit;
