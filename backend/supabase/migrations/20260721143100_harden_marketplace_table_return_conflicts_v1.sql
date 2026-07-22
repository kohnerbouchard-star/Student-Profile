begin;

-- RETURNS TABLE output names are PL/pgSQL variables. Recompile the exact
-- Marketplace table-returning function inventory with a function-local
-- column preference so ordinary table updates cannot collide with outputs.
do $migration$
declare
  v_function record;
  v_definition text;
  v_patched text;
  v_count integer := 0;
begin
  for v_function in
    select p.oid, p.proname
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    join pg_language as l on l.oid = p.prolang
    where n.nspname = 'public'
      and l.lanname = 'plpgsql'
      and p.proname like '%marketplace%'
      and pg_get_function_result(p.oid) like 'TABLE%'
    order by p.proname, pg_get_function_identity_arguments(p.oid)
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    if position('#variable_conflict use_column' in v_definition) = 0 then
      v_patched := replace(
        v_definition,
        E'AS $function$\n',
        E'AS $function$\n#variable_conflict use_column\n'
      );
      if v_patched = v_definition then
        raise exception 'MARKETPLACE_TABLE_FUNCTION_BODY_UNRECOGNIZED:%', v_function.proname;
      end if;
      execute v_patched;
    end if;
    v_count := v_count + 1;
  end loop;

  if v_count <> 16 then
    raise exception 'MARKETPLACE_TABLE_FUNCTION_INVENTORY_INVALID:%', v_count;
  end if;
end
$migration$;

commit;
