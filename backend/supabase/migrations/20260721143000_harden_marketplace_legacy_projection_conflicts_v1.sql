begin;

-- The private legacy projection functions predate RETURNS TABLE output names
-- that overlap table columns. Recompile only those six private functions with
-- an explicit PL/pgSQL conflict policy; public authoritative wrappers remain
-- unchanged and continue to own reservation reconciliation.
do $migration$
declare
  v_name text;
  v_oid oid;
  v_definition text;
  v_patched text;
  v_count integer := 0;
begin
  foreach v_name in array array[
    'create_marketplace_listing_projection_legacy_v2',
    'activate_marketplace_listing_projection_legacy_v1',
    'reserve_marketplace_purchase_projection_legacy_v1',
    'settle_marketplace_purchase_projection_legacy_v1',
    'cancel_marketplace_listing_projection_legacy_v2',
    'review_marketplace_admin_projection_legacy_v2'
  ] loop
    select p.oid
    into strict v_oid
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = v_name;

    v_definition := pg_get_functiondef(v_oid);
    if position('#variable_conflict use_column' in v_definition) = 0 then
      v_patched := replace(
        v_definition,
        E'AS $function$\n',
        E'AS $function$\n#variable_conflict use_column\n'
      );
      if v_patched = v_definition then
        raise exception 'MARKETPLACE_LEGACY_FUNCTION_BODY_UNRECOGNIZED:%', v_name;
      end if;
      execute v_patched;
    end if;
    v_count := v_count + 1;
  end loop;

  if v_count <> 6 then
    raise exception 'MARKETPLACE_LEGACY_FUNCTION_INVENTORY_INVALID:%', v_count;
  end if;
end
$migration$;

revoke all on function public.create_marketplace_listing_projection_legacy_v2(uuid, uuid, text, integer, numeric, text, text, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.activate_marketplace_listing_projection_legacy_v1(uuid, uuid, text, bigint, text) from public, anon, authenticated, service_role;
revoke all on function public.reserve_marketplace_purchase_projection_legacy_v1(uuid, uuid, text, integer, bigint, text) from public, anon, authenticated, service_role;
revoke all on function public.settle_marketplace_purchase_projection_legacy_v1(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.cancel_marketplace_listing_projection_legacy_v2(uuid, uuid, text, bigint, text) from public, anon, authenticated, service_role;
revoke all on function public.review_marketplace_admin_projection_legacy_v2(uuid, uuid, text, text, text, bigint, text) from public, anon, authenticated, service_role;

commit;
