-- Phase 12 exact-head repair: provide the bounded JSON object cardinality
-- helper used by the Seed Store identity-promotion wrapper.
--
-- PostgreSQL exposes jsonb_object_keys(jsonb), but no built-in
-- jsonb_object_length(jsonb). The Phase 12 wrapper intentionally resolves
-- helpers through economy_private, so this compatibility function repairs the
-- runtime call without widening browser, service-role, Store, or Seed authority.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function economy_private.jsonb_object_length(
  p_value jsonb
)
returns integer
language sql
immutable
strict
parallel safe
security invoker
set search_path = pg_catalog
as $function$
  select count(*)::integer
  from pg_catalog.jsonb_object_keys(p_value);
$function$;

comment on function economy_private.jsonb_object_length(jsonb) is
  'Private Phase 12 compatibility helper returning the number of keys in one JSON object.';

revoke all on function economy_private.jsonb_object_length(jsonb)
  from public, anon, authenticated, service_role;

commit;
