-- Repair the economic-core PostgREST claim lookup without changing its authority.
-- Modern claims, when present, are authoritative; never fall back on a conflict.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $migration$
declare
  signature text;
  target_oid oid;
  before_row jsonb;
  after_row jsonb;
  definition text;
  old_role constant text := $old$coalesce(current_setting('request.jwt.claim.role', true), '')$old$;
  new_role constant text := $new$(case
    when nullif(current_setting('request.jwt.claims', true), '') is not null
      then coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
    else coalesce(current_setting('request.jwt.claim.role', true), '')
  end)$new$;
begin
  foreach signature in array array[
    'public.sync_game_item_catalog_v2(uuid,jsonb)',
    'public.validate_economic_asset_core_v2(uuid)'
  ] loop
    target_oid := to_regprocedure(signature);
    if target_oid is null then
      raise exception 'ECONOMIC_CORE_CLAIMS_TARGET_MISSING: %', signature;
    end if;
    select to_jsonb(p), pg_get_functiondef(p.oid)
      into strict before_row, definition from pg_proc p where p.oid = target_oid;
    if (before_row ->> 'prosecdef')::boolean is distinct from true
       or before_row ->> 'prokind' <> 'f'
       or pg_get_userbyid((before_row ->> 'proowner')::oid) <> 'postgres'
       or not has_function_privilege('service_role', target_oid, 'EXECUTE')
       or has_function_privilege('anon', target_oid, 'EXECUTE')
       or has_function_privilege('authenticated', target_oid, 'EXECUTE') then
      raise exception 'ECONOMIC_CORE_CLAIMS_AUTHORITY_DRIFT: %', signature;
    end if;
    if (length(definition) - length(replace(definition, old_role, ''))) / length(old_role) <> 1
       or position('request.jwt.claims' in before_row ->> 'prosrc') <> 0 then
      raise exception 'ECONOMIC_CORE_CLAIMS_GUARD_DRIFT: %', signature;
    end if;
    -- Rebuild only the existing definition; do not create helpers or grant access.
    -- The session_user DBA exception remains unchanged. SECURITY DEFINER's
    -- current_user must never be treated as the originating request principal.
    execute replace(definition, old_role, new_role);
    select to_jsonb(p) into strict after_row from pg_proc p where p.oid = target_oid;
    if (after_row - 'prosrc') is distinct from (before_row - 'prosrc')
       or after_row ->> 'prosrc' is distinct from
          replace(before_row ->> 'prosrc', old_role, new_role) then
      raise exception 'ECONOMIC_CORE_CLAIMS_POSTCONDITION_FAILED: %', signature;
    end if;
  end loop;
end;
$migration$;
commit;
