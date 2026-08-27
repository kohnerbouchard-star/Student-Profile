-- Econovaria Business V2 Phase 10A.4C2: register the new Marketplace
-- funding-refund evidence table with the canonical resumable game purge.
--
-- The pre-C2 Marketplace tables existed when the purge registry was initially
-- populated. C2 creates one new game-scoped base table after that point, so it
-- must be registered explicitly rather than weakening the global B2 invariant.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $precondition$
begin
  if to_regclass('private.game_data_purge_table_registry') is null then
    raise exception 'MARKETPLACE_FUNDING_PURGE_REGISTRY_MISSING';
  end if;

  if to_regclass('public.marketplace_funding_refunds') is null then
    raise exception 'MARKETPLACE_FUNDING_REFUND_TABLE_MISSING';
  end if;
end
$precondition$;

insert into private.game_data_purge_table_registry (
  table_schema,
  table_name
)
values (
  'public',
  'marketplace_funding_refunds'
)
on conflict (table_schema, table_name) do nothing;

do $assertion$
begin
  if not exists (
    select 1
    from private.game_data_purge_table_registry as registry_row
    where registry_row.table_schema = 'public'
      and registry_row.table_name = 'marketplace_funding_refunds'
  ) then
    raise exception 'MARKETPLACE_FUNDING_PURGE_REGISTRY_INCOMPLETE';
  end if;
end
$assertion$;

commit;
