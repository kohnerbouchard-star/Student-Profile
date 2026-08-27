-- Register the B2 Banking/FX tables created after the original purge-registry sweep.
--
-- The earlier generic registry migration ran before the Banking account, journal,
-- liquidity, and Player FX tables existed. This forward repair is intentionally
-- explicit: it registers only the eleven B2-owned post-cutover tables and then
-- fails closed if any game-scoped base table remains outside the canonical purge
-- registry at the B2 boundary.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

insert into private.game_data_purge_table_registry (
  table_schema,
  table_name
)
values
  ('public', 'bank_accounts'),
  ('public', 'bank_transactions'),
  ('public', 'bank_account_holds'),
  ('public', 'bank_account_hold_events'),
  ('public', 'fx_liquidity_cap_snapshots'),
  ('public', 'fx_liquidity_events'),
  ('public', 'fx_quotes'),
  ('public', 'fx_orders'),
  ('public', 'fx_order_events'),
  ('public', 'fx_settlement_receipts'),
  ('private', 'fx_order_runtime_state')
on conflict (table_schema, table_name) do nothing;

do $assertions$
declare
  v_table record;
begin
  for v_table in
    select *
    from (values
      ('public'::text, 'bank_accounts'::text),
      ('public', 'bank_transactions'),
      ('public', 'bank_account_holds'),
      ('public', 'bank_account_hold_events'),
      ('public', 'fx_liquidity_cap_snapshots'),
      ('public', 'fx_liquidity_events'),
      ('public', 'fx_quotes'),
      ('public', 'fx_orders'),
      ('public', 'fx_order_events'),
      ('public', 'fx_settlement_receipts'),
      ('private', 'fx_order_runtime_state')
    ) as owned(table_schema, table_name)
  loop
    if not exists (
      select 1
      from information_schema.columns as column_row
      join information_schema.tables as table_row
        on table_row.table_schema = column_row.table_schema
       and table_row.table_name = column_row.table_name
      where column_row.table_schema = v_table.table_schema
        and column_row.table_name = v_table.table_name
        and column_row.column_name = 'game_session_id'
        and table_row.table_type = 'BASE TABLE'
    ) then
      raise exception 'BANKING_FX_POSTCUTOVER_PURGE_TABLE_MISSING:%.%',
        v_table.table_schema,
        v_table.table_name
        using errcode = 'P0001';
    end if;

    if not exists (
      select 1
      from private.game_data_purge_table_registry as registry_row
      where registry_row.table_schema = v_table.table_schema
        and registry_row.table_name = v_table.table_name
    ) then
      raise exception 'BANKING_FX_POSTCUTOVER_PURGE_REGISTRATION_MISSING:%.%',
        v_table.table_schema,
        v_table.table_name
        using errcode = 'P0001';
    end if;
  end loop;

  -- The pre-B2 sweep registered every game-scoped table that already existed;
  -- the explicit list above registers every B2 table created afterward. At this
  -- exact B2 boundary there must therefore be no unregistered game-owned table.
  if exists (
    select 1
    from information_schema.columns as column_row
    join information_schema.tables as table_row
      on table_row.table_schema = column_row.table_schema
     and table_row.table_name = column_row.table_name
    left join private.game_data_purge_table_registry as registry_row
      on registry_row.table_schema = column_row.table_schema
     and registry_row.table_name = column_row.table_name
    where column_row.column_name = 'game_session_id'
      and column_row.table_schema in ('public', 'private')
      and table_row.table_type = 'BASE TABLE'
      and column_row.table_name <> 'game_sessions'
      and column_row.table_name not in (
        'game_data_purge_requests',
        'game_data_purge_table_registry'
      )
      and registry_row.table_name is null
  ) then
    raise exception 'BANKING_FX_POSTCUTOVER_PURGE_REGISTRY_INCOMPLETE'
      using errcode = 'P0001';
  end if;
end;
$assertions$;

commit;
